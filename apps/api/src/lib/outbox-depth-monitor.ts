// apps/api/src/lib/outbox-depth-monitor.ts
//
// CTRL-08 / D-21 — outbox depth monitor (replaces CF Queue depth alert per
// Phase 8 D-22 once the local-compute pivot landed).
//
// Library implementation of the outbox depth monitor. The CLI/cron entry
// point lives at `scripts/observability/outbox-depth-monitor.ts` (thin
// wrapper) — this module holds the logic so apps/api tests can directly
// import + exercise it without spawning a child process.
//
// What this does:
//   1. Counts rows in `usage_events_outbox` that are still UNSENT
//      (`sent_at IS NULL`) AND older than 5 minutes
//      (`created_at < now() - interval '5 minutes'`).
//      The 5-minute floor is the Pitfall #10 mitigation: it prevents CI
//      seed fixtures (created seconds ago) from tripping the alert.
//   2. If count ≤ THRESHOLD (10 000 rows) AND
//      `BETTERSTACK_OUTBOX_HEARTBEAT_URL` is set, GETs the heartbeat URL.
//   3. If count > THRESHOLD, fires a Resend alert via the existing Phase 8
//      `sendOutboxDepthAlert` connector.
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-21 + D-01
//   - .planning/phases/09-observability-polish/09-RESEARCH.md
//     §"Code Example 3" + §"Pitfall 10"
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"outbox-depth-monitor specific pattern"
//   - apps/api/src/lib/email/resend-client.ts (Phase 8 D-18)

import { sql } from 'drizzle-orm';
import { db as defaultDb } from '../db.js';
import { sendOutboxDepthAlert, type ResendEnv } from './email/resend-client.js';

export const THRESHOLD = 10_000;

export interface OutboxDepthRunOptions {
  // Defaults to process.env.BETTERSTACK_OUTBOX_HEARTBEAT_URL (or '' if unset).
  readonly heartbeatUrl?: string;
  // Inject for tests; defaults to global fetch.
  readonly fetch?: typeof fetch;
  // Inject for tests; defaults to the apps/api Drizzle client.
  readonly dbClient?: typeof defaultDb;
  // When provided, scope the COUNT(*) to a specific deployment_id so test
  // fixtures don't get polluted by other rows in shared dev DB.
  readonly filterDeploymentId?: string;
  // Inject for tests; defaults to the Resend connector reading process.env.
  readonly sendAlert?: (pending: number, threshold: number) => Promise<void>;
  // Test-only override; defaults to THRESHOLD (10_000).
  readonly threshold?: number;
}

export interface OutboxDepthRunResult {
  readonly pending: number;
  readonly exitCode: 0 | 1 | 2;
}

interface PendingRow {
  readonly pending: string;
}

async function defaultSendAlert(pending: number, threshold: number): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY'] ?? '';
  const opsEmail = process.env['OPS_EMAIL'] ?? '';
  if (!apiKey || !opsEmail) {
    // Local-compute mode (D-01): RESEND_API_KEY missing → log only.
    console.error(
      `[outbox-depth-monitor] ALERT: pending=${String(pending)} threshold=${String(
        threshold,
      )} (RESEND_API_KEY/OPS_EMAIL unset — skipped real email)`,
    );
    return;
  }
  const env: ResendEnv = {
    RESEND_API_KEY: apiKey,
    OPS_EMAIL: opsEmail,
    LOGTO_BASE_URL: process.env['LOGTO_BASE_URL'] ?? '',
    DRIFT_FROM_EMAIL: process.env['DRIFT_FROM_EMAIL'],
    OPS_FROM_EMAIL: process.env['OPS_FROM_EMAIL'],
  };
  await sendOutboxDepthAlert(env, pending, threshold);
}

export async function runOutboxDepthMonitor(
  opts: OutboxDepthRunOptions = {},
): Promise<OutboxDepthRunResult> {
  const heartbeatUrl =
    opts.heartbeatUrl ?? process.env['BETTERSTACK_OUTBOX_HEARTBEAT_URL'] ?? '';
  const fetchImpl = opts.fetch ?? fetch;
  const database = opts.dbClient ?? defaultDb;
  const sendAlert = opts.sendAlert ?? defaultSendAlert;
  const threshold = opts.threshold ?? THRESHOLD;

  // Pitfall #10: only count rows older than 5 min — avoid CI seed
  // false-positives. The partial index `usage_events_outbox_pending_idx`
  // (Phase 8 migration) makes `WHERE sent_at IS NULL` O(log n).
  const result = opts.filterDeploymentId
    ? await database.execute(sql`
        SELECT COUNT(*)::text AS pending
        FROM usage_events_outbox
        WHERE sent_at IS NULL
          AND created_at < now() - interval '5 minutes'
          AND deployment_id = ${opts.filterDeploymentId}
      `)
    : await database.execute(sql`
        SELECT COUNT(*)::text AS pending
        FROM usage_events_outbox
        WHERE sent_at IS NULL
          AND created_at < now() - interval '5 minutes'
      `);

  const rows = result.rows as unknown as readonly PendingRow[];
  const pendingStr = rows[0]?.pending ?? '0';
  const pending = Number(pendingStr);

  if (pending > threshold) {
    await sendAlert(pending, threshold);
    return { pending, exitCode: 1 };
  }

  // Healthy path: ping BetterStack heartbeat (D-01: only if URL is set).
  if (heartbeatUrl) {
    try {
      await fetchImpl(heartbeatUrl, { method: 'GET' });
    } catch (err) {
      // Heartbeat failures are non-fatal — log and continue.
      console.error(
        `[outbox-depth-monitor] heartbeat fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { pending, exitCode: 0 };
}
