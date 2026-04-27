// apps/api/src/inngest/functions/cost-cap-enforcer.ts
//
// CTRL-06 / D-13: Cost-cap enforcement (event-triggered).
// Stable function ID: INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER ('cost-cap-enforcer-v1').
// Trigger: 'generation/cost.updated' Inngest event from sse-callback.ts.
//
// CRITICAL (T-8-19 mitigation): concurrency: { limit: 1, key: 'event.data.jobId' }
// serializes processing per-generation so two simultaneous cost events for the
// same job cannot both pass the threshold check before either updates
// generations.status='cost_capped'.
//
// Algorithm:
//   1. persist-cost: UPDATE generations SET cumulative_cost_usd = X
//   2. lookup-org:   SELECT plan_tier via JOIN through projects → organizations
//   3. threshold-check: cumulativeCostUsd > cap (free $0.50 / pro $2.00 from
//                       LAUNCH_CRITERIA constants)
//   4. cancel-engine: POST {ENGINE_ENDPOINT}/internal/v1/cancel-generation
//                     with M2M Bearer token
//   5. mark-cost-capped: UPDATE generations.status='cost_capped'
//   6. emit-billable-event: INSERT usage_events_outbox row keyed on
//      SYNTHETIC_DEPLOYMENT_ID (B2 — same constant Plan 02 seeder uses; FK
//      chain resolves to the synthetic deployment row across the codebase).
//
// PAYG plan never caps (every overage bills).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-13
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §12
//   - packages/contracts/src/launch-criteria.ts (cap thresholds)
//   - packages/contracts/src/billing-types.ts (SYNTHETIC_DEPLOYMENT_ID)
//   - apps/api/src/routes/internal/v1/sse-callback.ts (upstream event emitter)

import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  INNGEST_FUNCTION_IDS,
  LAUNCH_CRITERIA,
} from '@mcpgen/contracts';
import { generations, usage_events_outbox } from '@mcpgen/contracts/db-schema';
import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import { getM2mTokenForEngine } from '../../lib/m2m-token.js';

interface CostUpdateEventData {
  jobId: string;
  passName: string;
  cumulativeCostUsd: number;
}

interface CostCapEnv {
  ENGINE_ENDPOINT: string;
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
  LOGTO_M2M_RESOURCE_INDICATOR: string;
}

interface OrgLookupRow {
  plan_tier: string;
}

export const costCapEnforcer = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.COST_CAP_ENFORCER,
    // T-8-19 mitigation: serialize per-generation processing.
    concurrency: { limit: 1, key: 'event.data.jobId' },
    triggers: [{ event: 'generation/cost.updated' }],
  },
  async ({ event, step }) => {
    const data = event.data as CostUpdateEventData;
    const { jobId, cumulativeCostUsd } = data;
    // env is read from process.env in the Inngest dev-server / worker process.
    const e = process.env as unknown as CostCapEnv;

    // 1. Persist cumulative cost on the generation row.
    await step.run('persist-cost', async () => {
      await db
        .update(generations)
        .set({ cumulative_cost_usd: String(cumulativeCostUsd) })
        .where(eq(generations.id, jobId));
    });

    // 2. Look up plan_tier via JOIN (no Drizzle relations declared yet).
    const planTier = await step.run('lookup-org', async () => {
      const r = await db.execute(sql`
        SELECT o.plan_tier AS plan_tier
        FROM generations g
        JOIN projects p ON p.id = g.project_id
        JOIN organizations o ON o.id = p.org_id
        WHERE g.id = ${jobId}
        LIMIT 1
      `);
      const rows = r.rows as unknown as OrgLookupRow[];
      return rows[0]?.plan_tier ?? 'free';
    });

    // PAYG never caps — every overage bills.
    if (planTier === 'payg') {
      return { capped: false, reason: 'payg_no_cap', cumulative_cost_usd: cumulativeCostUsd };
    }

    const cap =
      planTier === 'pro'
        ? LAUNCH_CRITERIA.COST_CAP_PRO_USD
        : LAUNCH_CRITERIA.COST_CAP_FREE_USD;

    if (cumulativeCostUsd > cap) {
      // 3a. Tell the engine to abort mid-pass via M2M.
      await step.run('cancel-engine', async () => {
        const m2mToken = await getM2mTokenForEngine(e);
        const resp = await fetch(`${e.ENGINE_ENDPOINT}/internal/v1/cancel-generation`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${m2mToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            job_id: jobId,
            reason: 'cost_cap_exceeded',
            cap_usd: cap,
          }),
        });
        if (!resp.ok) {
          throw new Error(`engine cancel failed: ${String(resp.status)}`);
        }
      });

      // 3b. Mark the generation cost-capped (audit trail).
      await step.run('mark-cost-capped', async () => {
        await db
          .update(generations)
          .set({ status: 'cost_capped' })
          .where(eq(generations.id, jobId));
      });

      // 3c. Emit a billable usage event for the accumulated cost.
      // FK chain: usage_events_outbox.deployment_id NOT NULL → deployments(id).
      // SYNTHETIC_DEPLOYMENT_ID points at the seed deployment row created by
      // apps/api/scripts/seed-synthetic-usage.ts — single source of truth.
      await step.run('emit-billable-event', async () => {
        await db
          .insert(usage_events_outbox)
          .values({
            id: ulid(),
            deployment_id: SYNTHETIC_DEPLOYMENT_ID,
            event_type: 'generation_cost_capped',
            event_payload: {
              job_id: jobId,
              billed_cost_usd: cumulativeCostUsd,
              cap_usd: cap,
              plan_tier: planTier,
            },
            idempotency_key: `${jobId}_cost_capped`,
          })
          .onConflictDoNothing();
      });

      return { capped: true, billed_cost_usd: cumulativeCostUsd, cap_usd: cap };
    }

    return {
      capped: false,
      cumulative_cost_usd: cumulativeCostUsd,
      cap_usd: cap,
    };
  },
);
