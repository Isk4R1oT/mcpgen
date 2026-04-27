// apps/api/src/inngest/functions/stripe-meters-emit.ts
//
// CTRL-07 / D-22: Outbox poller (CF Queue substitute for Phases 1–9).
// Stable function ID: INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT ('stripe-meters-emit-v1').
// Schedule: every minute.
// Algorithm: claim batch with FOR UPDATE SKIP LOCKED → emit to Stripe Meters
// with row.idempotency_key as Stripe identifier (D-11 dedup) → mark sent_at.
// Also REFRESHes the usage_hourly MATERIALIZED VIEW per Plan 01 deviation #1
// (Neon TimescaleDB Apache rejects continuous-aggregate refresh policies).
//
// Pitfall #13 mitigation (concurrent pollers cannot double-process rows).
// T-8-17 mitigation (FOR UPDATE SKIP LOCKED + UNIQUE on idempotency_key).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-22, D-27
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-22
//   - .planning/phases/08-auth-billing/08-01-SUMMARY.md (Wave 1 deviation #1)
//   - packages/contracts/src/inngest-functions.ts

import { sql, eq } from 'drizzle-orm';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { usage_events_outbox } from '@mcpgen/contracts/db-schema';
import { inngest } from '../client.js';
import { db } from '../../db.js';
import { getStripe } from '../../lib/stripe-client.js';

interface OutboxRow {
  id: string;
  deployment_id: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  idempotency_key: string;
  created_at: Date;
  sent_at: Date | null;
}

export const stripeMetersEmit = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.STRIPE_METERS_EMIT,
    triggers: [{ cron: '* * * * *' }],
  },
  async ({ step }) => {
    const env = process.env as { STRIPE_SECRET_KEY?: string };
    const stripe = getStripe({ STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? '' });

    const pending = await step.run('claim-batch', async () => {
      const result = await db.execute(sql`
        SELECT id, deployment_id, event_type, event_payload, idempotency_key, created_at, sent_at
        FROM usage_events_outbox
        WHERE sent_at IS NULL
        ORDER BY created_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `);
      return result.rows as unknown as OutboxRow[];
    });

    for (const row of pending) {
      await step.run(`send-${row.id}`, async () => {
        await stripe.billing.meterEvents.create({
          event_name: row.event_type,
          payload: row.event_payload as Record<string, string>,
          identifier: row.idempotency_key,
        });
        await db
          .update(usage_events_outbox)
          .set({ sent_at: new Date() })
          .where(eq(usage_events_outbox.id, row.id));
      });
    }

    // Refresh usage_hourly MATERIALIZED VIEW (Plan 01 deviation #1: Neon
    // TimescaleDB Apache cannot run continuous-aggregate policies).
    await step.run('refresh-usage-hourly', async () => {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY usage_hourly`);
    });

    return { claimed: pending.length };
  },
);
