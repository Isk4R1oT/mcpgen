// apps/api/src/inngest/functions/usage-reconciler.ts
//
// CTRL-07 / D-15 / Pitfall #16: Daily TimescaleDB ↔ Stripe Meters reconciliation.
// Stable function ID: INNGEST_FUNCTION_IDS.USAGE_RECONCILER ('usage-reconciler-v1').
// Schedule: 02:00 UTC daily.
//
// Quota truth = TimescaleDB usage_hourly (real-time).
// Stripe Meters = billing eventual; this cron alerts when drift > 2.0%.
//
// Algorithm:
//   1. yesterday-window: derive [yesterday 00:00 UTC, today 00:00 UTC)
//   2. list-yesterday-tenant-event: aggregate usage_hourly over yesterday
//      grouped by (tenant, event_type)
//   3. per (tenant, event_type): read Stripe meter event summaries via
//      stripe.billing.meters.eventSummaries.list, compute drift_pct,
//      INSERT reconciliation_log with UNIQUE on (date, event_type, tenant_id)
//      — second-run idempotency. If drift_pct > 2.0 → sendReconciliationAlert.
//
// Threats addressed:
//   - T-8-12 (false-alert via reconciliation_log UNIQUE constraint + 2.0%
//             conservative threshold; usage_events outbox dedup upstream)
//   - T-8-13 (Stripe Meters API: server-side only; never expose meter IDs to
//             client; no PII logged)
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-15
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-15, §11
//   - .planning/research/PITFALLS.md §#16

import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { reconciliation_log } from '@mcpgen/contracts/db-schema';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import { getStripe } from '../../lib/stripe-client.js';
import {
  sendReconciliationAlert,
  type ResendEnv,
} from '../../lib/email/resend-client.js';

const RECONCILIATION_DRIFT_THRESHOLD_PCT = 2.0;

interface ReconcilerEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_METER_EVALS_ID: string;
  STRIPE_METER_TOOL_CALLS_ID: string;
  STRIPE_METER_GENERATIONS_ID: string;
  RESEND_API_KEY: string;
  OPS_EMAIL: string;
  LOGTO_BASE_URL: string;
  OPS_FROM_EMAIL?: string | undefined;
}

interface UsageRow {
  tenant_id: string;
  event_type: string;
  timescale_count: number;
}

interface OrgRow {
  stripe_customer_id: string | null;
}

export const usageReconciler = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.USAGE_RECONCILER,
    triggers: [{ cron: '0 2 * * *' }],
  },
  async ({ step }) => {
    // Inngest 4.2.4 Context does not expose `env`; use process.env (matches
    // Plan 02 stripe-meters-emit and Plan 03 cost-cap-enforcer pattern).
    const e = process.env as unknown as ReconcilerEnv;
    const stripe = getStripe(e);

    // Per-handler meter routing (NOT module-top — avoids boot-time env capture).
    const METER_ID_BY_EVENT: Record<string, string | undefined> = {
      f3_eval: e.STRIPE_METER_EVALS_ID,
      tool_call: e.STRIPE_METER_TOOL_CALLS_ID,
      generation: e.STRIPE_METER_GENERATIONS_ID,
    };

    const now = new Date();
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    // SQL aggregates yesterday's usage rows grouped by (tenant, event_type).
    // The schema in Plan 02 uses `usage_events` directly; the hourly view name
    // resolves at runtime. Here we read the materialised hourly rollup by JOIN
    // through the deployment FK chain (per RESEARCH §11 verbatim shape).
    const rows = await step.run('list-yesterday-tenant-event', async () => {
      const result = await db.execute(sql`
        SELECT
          p.org_id        AS tenant_id,
          ue.tool_name    AS event_type,
          COUNT(*)::int   AS timescale_count
        FROM usage_events ue
        JOIN deployments d ON d.id = ue.deployment_id
        JOIN generations g ON g.id = d.generation_id
        JOIN projects    p ON p.id = g.project_id
        WHERE ue.time >= ${yesterday}
          AND ue.time <  ${today}
        GROUP BY p.org_id, ue.tool_name
      `);
      return result.rows as unknown as UsageRow[];
    });

    let alertedCount = 0;
    const reconciledIds: string[] = [];

    for (const row of rows) {
      const meterId = METER_ID_BY_EVENT[row.event_type];
      if (!meterId) continue;

      const status = await step.run(
        `reconcile-${row.tenant_id}-${row.event_type}`,
        async () => {
          const orgRes = await db.execute(sql`
            SELECT stripe_customer_id FROM organizations WHERE id = ${row.tenant_id} LIMIT 1
          `);
          const orgRows = orgRes.rows as unknown as OrgRow[];
          const stripeCustomerId = orgRows[0]?.stripe_customer_id;
          if (!stripeCustomerId) {
            return { status: 'skipped' as const, reason: 'no_stripe_customer' };
          }

          // stripe@22.1.0 surface: `listEventSummaries(meterId, params)` (NOT
          // `eventSummaries.list`). See node_modules/.../stripe/.../Billing/Meters.d.ts.
          const stripeRes = await stripe.billing.meters.listEventSummaries(meterId, {
            customer: stripeCustomerId,
            start_time: Math.floor(yesterday.getTime() / 1000),
            end_time: Math.floor(today.getTime() / 1000),
          });
          const stripeData = (stripeRes as { data: ReadonlyArray<{ aggregated_value?: number }> }).data ?? [];
          const stripeCount = stripeData.reduce(
            (acc, evt) => acc + (evt.aggregated_value ?? 0),
            0,
          );
          const driftPct =
            (Math.abs(row.timescale_count - stripeCount) /
              Math.max(row.timescale_count, 1)) *
            100;
          const alerted = driftPct > RECONCILIATION_DRIFT_THRESHOLD_PCT;

          const logId = ulid();
          const reconDate = yesterday.toISOString().split('T')[0];
          if (!reconDate) {
            throw new Error('failed to derive reconciliation_date');
          }
          try {
            await db.insert(reconciliation_log).values({
              id: logId,
              reconciliation_date: reconDate,
              event_type: row.event_type,
              tenant_id: row.tenant_id,
              timescale_count: row.timescale_count,
              stripe_count: stripeCount,
              drift_pct: driftPct.toFixed(3),
              alerted,
            });
          } catch (err) {
            const code = (err as { code?: string }).code;
            const message = (err as { message?: string }).message ?? '';
            if (code === '23505' || message.includes('duplicate key value')) {
              return { status: 'already_reconciled' as const };
            }
            throw err;
          }

          if (alerted) {
            const env: ResendEnv = {
              RESEND_API_KEY: e.RESEND_API_KEY,
              OPS_EMAIL: e.OPS_EMAIL,
              LOGTO_BASE_URL: e.LOGTO_BASE_URL,
              OPS_FROM_EMAIL: e.OPS_FROM_EMAIL,
            };
            await sendReconciliationAlert(env, driftPct, row.event_type, row.tenant_id);
          }

          return {
            status: 'reconciled' as const,
            id: logId,
            alerted,
            drift_pct: driftPct,
          };
        },
      );

      if (status.status === 'reconciled') {
        reconciledIds.push(status.id);
        if (status.alerted) alertedCount += 1;
      }
    }

    return {
      reconciled: reconciledIds.length,
      alerted: alertedCount,
      candidates: rows.length,
    };
  },
);
