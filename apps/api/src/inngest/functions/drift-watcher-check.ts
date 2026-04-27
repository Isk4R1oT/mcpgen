// apps/api/src/inngest/functions/drift-watcher-check.ts
//
// CTRL-03 / D-16 / D-17 / D-18 / Q1: Per-deployment drift check (event-triggered).
// Stable function ID: INNGEST_FUNCTION_IDS.DRIFT_WATCHER_CHECK ('drift-watcher-check-v1').
// Trigger: 'drift/check.requested' Inngest event from driftWatcher.
// Retries: 3.
//
// Q1 graceful fallback (engine /internal/v1/parse Phase 2 acceptance gate):
//   - if engine returns 502/503 OR AbortSignal.timeout(10s) fires, function
//     returns {skipped:'engine_unavailable'} WITHOUT retrying — drift detection
//     is a daily cron with no SLA urgency. Until engine workstream Phase 2 ships
//     POST /internal/v1/parse against the contract pinned in Plan 01
//     packages/contracts/src/engine-internal-api.ts, drift detection silently
//     no-ops. Acceptable per Q1 daily-cron tolerance.
//
// Algorithm:
//   1. parse-stage-a: POST {ENGINE_ENDPOINT}/internal/v1/parse with M2M Bearer.
//      Validate response with ParseResponse Zod. Q1 fallback on 502/503/timeout.
//   2. load-baseline: SELECT specs.parsed_ir_jsonb via JOIN.
//   3. seed-baseline (one-time): if baseline NULL, UPDATE specs.parsed_ir_jsonb
//      with fresh IR; return {changed:false, baseline:'seeded'}.
//   4. compute-diff: cosmetic-strip + bucket; empty diff returns early.
//   5. persist-drift-event: INSERT drift_events row.
//   6. lookup-tenant: 4-table JOIN deployments → generations → projects →
//      organizations → users to recover tenant_id + recipient email.
//   7. maybe-email: try INSERT drift_email_log (tenant_id, week_start);
//      on Postgres 23505 UNIQUE violation (D-18 rate-limit) — silently skip.
//      Otherwise batch all this week's drift events and call sendDriftEmail.
//
// Threats addressed:
//   - T-8-09 (cosmetic-only spec changes do NOT raise false drift alerts)
//   - T-8-10 (independent retries per deployment cannot block siblings)
//   - T-8-11 (drift_email_log composite-PK enforces 1 email max per tenant per
//             ISO week — second INSERT raises 23505 silently swallowed)
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-16, D-17, D-18, Q1
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §13, §6 D-18, §20 Q1
//   - .planning/phases/08-auth-billing/08-PATTERNS.md §C drift-watcher

import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  INNGEST_FUNCTION_IDS,
  ParseResponse,
} from '@mcpgen/contracts';
import { drift_events, drift_email_log } from '@mcpgen/contracts/db-schema';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import { computeIrDiff } from '../../lib/drift/ir-diff.js';
import { isoWeekStart } from '../../lib/iso-week.js';
import {
  sendDriftEmail,
  type ResendEnv,
  type DriftEventForEmail,
} from '../../lib/email/resend-client.js';
import { getM2mTokenForEngine } from '../../lib/m2m-token.js';

interface DriftWatcherCheckEnv {
  ENGINE_ENDPOINT: string;
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
  LOGTO_M2M_RESOURCE_INDICATOR: string;
  RESEND_API_KEY: string;
  OPS_EMAIL: string;
  LOGTO_BASE_URL: string;
  DRIFT_FROM_EMAIL?: string | undefined;
  OPS_FROM_EMAIL?: string | undefined;
}

interface DeploymentBaselineRow {
  spec_id: string;
  parsed_ir_jsonb: unknown | null;
}

interface TenantLookupRow {
  tenant_id: string;
  user_email: string | null;
  deployment_url: string;
}

function isUniqueViolation(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code === '23505') return true;
  // Wrapped Postgres errors sometimes nest the original under .cause
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause && cause.code === '23505') return true;
  // Neon serverless wraps errors with a message containing the code text
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.includes('duplicate key value')) {
    return true;
  }
  return false;
}

interface ParseSuccess {
  ok: true;
  raw_ir: Record<string, unknown>;
}
interface ParseSkipped {
  ok: false;
  reason: 'engine_unavailable';
}
type ParseOutcome = ParseSuccess | ParseSkipped;

export const driftWatcherCheck = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.DRIFT_WATCHER_CHECK,
    triggers: [{ event: 'drift/check.requested' }],
    retries: 3,
  },
  async ({ event, step }) => {
    // Inngest 4.2.4 Context exposes only event/step/runId/group/attempt
    // (verified in node_modules type defs). The plan's `({event, step, env})`
    // shape does NOT exist in this SDK version — `env` is undefined and the
    // typed-cast plan-text would silently produce a broken function.
    // Plan 02 deviation #1 + Plan 03 cost-cap-enforcer use process.env; same
    // pattern here.
    const e = process.env as unknown as DriftWatcherCheckEnv;

    const data = event.data as { deploymentId?: string; specUrl?: string | null };
    const deploymentId = data.deploymentId;
    const specUrl = data.specUrl;
    if (!deploymentId) {
      return { skipped: 'no_deployment_id' };
    }
    if (!specUrl) {
      return { skipped: 'no_source_url' };
    }

    // 1. Engine /internal/v1/parse with Q1 graceful fallback.
    const parseOutcome: ParseOutcome = await step.run('parse-stage-a', async () => {
      const m2m = await getM2mTokenForEngine(e);
      let resp: Response;
      try {
        resp = await fetch(`${e.ENGINE_ENDPOINT}/internal/v1/parse`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${m2m}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spec_url: specUrl }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === 'TimeoutError' || name === 'AbortError') {
          return { ok: false, reason: 'engine_unavailable' } as const;
        }
        throw err;
      }
      if (resp.status === 502 || resp.status === 503) {
        return { ok: false, reason: 'engine_unavailable' } as const;
      }
      if (!resp.ok) {
        throw new Error(`engine parse failed: ${String(resp.status)}`);
      }
      const parsed = ParseResponse.parse(await resp.json());
      return { ok: true, raw_ir: parsed.raw_ir } as const;
    });

    if (!parseOutcome.ok) {
      return { skipped: parseOutcome.reason };
    }
    const newIr = parseOutcome.raw_ir;

    // 2. Load baseline IR via JOIN.
    const baseline = await step.run('load-baseline', async () => {
      const r = await db.execute(sql`
        SELECT s.id AS spec_id, s.parsed_ir_jsonb AS parsed_ir_jsonb
        FROM deployments d
        JOIN generations g ON g.id = d.generation_id
        JOIN specs s ON s.id = g.spec_id
        WHERE d.id = ${deploymentId}
        LIMIT 1
      `);
      const rows = r.rows as unknown as DeploymentBaselineRow[];
      return rows[0] ?? null;
    });

    if (!baseline) {
      return { skipped: 'deployment_not_found' };
    }

    // 3. Seed baseline on first-ever check (one-time, no diff yet).
    if (baseline.parsed_ir_jsonb === null || baseline.parsed_ir_jsonb === undefined) {
      await step.run('seed-baseline', async () => {
        await db.execute(sql`
          UPDATE specs SET parsed_ir_jsonb = ${JSON.stringify(newIr)}::jsonb
          WHERE id = ${baseline.spec_id}
        `);
      });
      return { changed: false, baseline: 'seeded' };
    }

    // 4. Compute cosmetic-stripped diff.
    const diff = await step.run('compute-diff', async () =>
      computeIrDiff(
        baseline.parsed_ir_jsonb as Record<string, unknown>,
        newIr,
      ),
    );
    if (diff.empty) {
      return { changed: false };
    }

    // 5. Persist drift_event row.
    const driftEventId = await step.run('persist-drift-event', async () => {
      const id = ulid();
      await db.insert(drift_events).values({
        id,
        deployment_id: deploymentId,
        detected_at: new Date(),
        diff_json: diff,
        status: 'pending',
      });
      return id;
    });

    // 6. Recover tenant + recipient via 4-table JOIN.
    const tenant = await step.run('lookup-tenant', async () => {
      const r = await db.execute(sql`
        SELECT
          o.id AS tenant_id,
          u.email AS user_email,
          d.url AS deployment_url
        FROM deployments d
        JOIN generations g ON g.id = d.generation_id
        JOIN projects p ON p.id = g.project_id
        JOIN organizations o ON o.id = p.org_id
        LEFT JOIN users u ON u.org_id = o.id
        WHERE d.id = ${deploymentId}
        ORDER BY u.created_at ASC
        LIMIT 1
      `);
      const rows = r.rows as unknown as TenantLookupRow[];
      return rows[0] ?? null;
    });

    if (!tenant || !tenant.user_email) {
      return { changed: true, summary: diff.summary, emailed: false, drift_event_id: driftEventId };
    }

    // 7. Email rate-limit per D-18 (drift_email_log composite-PK 23505 swallow).
    const emailed = await step.run('maybe-email', async () => {
      const weekStart = isoWeekStart(new Date());
      const weekStartIso = weekStart.toISOString().split('T')[0];
      if (!weekStartIso) {
        throw new Error('isoWeekStart produced empty ISO date');
      }
      try {
        await db.insert(drift_email_log).values({
          tenant_id: tenant.tenant_id,
          week_start: weekStartIso,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return false; // already sent this week — silent skip per D-18
        }
        throw err;
      }
      // Batch all this week's drift events for this deployment.
      const allDriftsResult = await db.execute(sql`
        SELECT id, detected_at, diff_json
        FROM drift_events
        WHERE deployment_id = ${deploymentId}
          AND detected_at >= ${weekStart}
      `);
      const allDrifts = allDriftsResult.rows as unknown as Array<{
        id: string;
        detected_at: Date;
        diff_json: { summary: string };
      }>;
      const formatted: DriftEventForEmail[] = allDrifts.map((d) => ({
        id: d.id,
        deployment_url: tenant.deployment_url,
        detected_at: d.detected_at instanceof Date ? d.detected_at : new Date(d.detected_at),
        diff_json: { summary: d.diff_json.summary },
      }));
      const env: ResendEnv = {
        RESEND_API_KEY: e.RESEND_API_KEY,
        OPS_EMAIL: e.OPS_EMAIL,
        LOGTO_BASE_URL: e.LOGTO_BASE_URL,
        DRIFT_FROM_EMAIL: e.DRIFT_FROM_EMAIL,
        OPS_FROM_EMAIL: e.OPS_FROM_EMAIL,
      };
      // tenant.user_email is non-null in this branch (early-return above),
      // but TS narrowing doesn't follow into the closure — guard explicitly.
      const recipient = tenant.user_email;
      if (!recipient) return false;
      await sendDriftEmail(env, recipient, formatted);
      return true;
    });

    return {
      changed: true,
      summary: diff.summary,
      drift_event_id: driftEventId,
      emailed,
    };
  },
);
