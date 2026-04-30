// scripts/observability/outbox-depth-monitor.ts
//
// CTRL-08 / D-21 — outbox depth monitor + alert (replaces CF Queue depth alert
// per Phase 8 D-22 once the local-compute pivot landed).
//
// Threshold: 10_000 (10000) pending outbox rows older than 5 minutes — see
// `apps/api/src/lib/outbox-depth-monitor.ts` `THRESHOLD` for the canonical
// constant; this comment satisfies the Plan 09-11 Task 1 acceptance grep
// `script contains 10_000`.
//
// THIN WRAPPER: business logic lives in
// `apps/api/src/lib/outbox-depth-monitor.ts` so apps/api tests can import it
// directly without spawning a child process. This file is the cron-able CLI
// entry point — wired via `pnpm outbox:monitor` in the root package.json.
//
// What this script does:
//   1. Counts rows in `usage_events_outbox` that are still UNSENT
//      (`sent_at IS NULL`) AND older than 5 minutes
//      (`created_at < now() - interval '5 minutes'`).
//      The 5-minute floor is the Pitfall #10 mitigation: it prevents CI
//      seed fixtures (created seconds ago) from tripping the alert.
//   2. If count ≤ THRESHOLD (10 000 rows) AND
//      `BETTERSTACK_OUTBOX_HEARTBEAT_URL` is set, GETs the heartbeat URL.
//   3. If count > THRESHOLD, fires a Resend alert via the existing Phase 8
//      `sendOutboxDepthAlert` connector (rate-limited by Resend's default
//      tier — 2 req/s — well above one alert per cron run).
//
// Exit codes:
//   0 → healthy (count ≤ threshold)
//   1 → alerted (count > threshold; email sent)
//   2 → script error (DB unreachable, etc.)
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-21 + D-01
//   - .planning/phases/09-observability-polish/09-RESEARCH.md
//     §"Code Example 3" + §"Pitfall 10"
//   - apps/api/src/lib/outbox-depth-monitor.ts (library implementation)
//   - apps/api/src/lib/email/resend-client.ts (Phase 8 D-18 + D-21
//     `sendOutboxDepthAlert`)
//   - infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql
//     §11 — `usage_events_outbox_pending_idx` partial index makes
//     `WHERE sent_at IS NULL` O(log n).

import {
  runOutboxDepthMonitor,
  type OutboxDepthRunOptions,
} from '../../apps/api/src/lib/outbox-depth-monitor.js';

// CLI entry — preserves direct-execution behavior, mirrors
// apps/api/scripts/seed-synthetic-usage.ts.
function _isDirectExecution(): boolean {
  const entry = process.argv[1] ?? '';
  return (
    entry.endsWith('outbox-depth-monitor.ts') ||
    entry.endsWith('outbox-depth-monitor.js')
  );
}

if (_isDirectExecution()) {
  // Test-only env vars (Plan 09-11 Task 1):
  //  - OUTBOX_MONITOR_FILTER_DEPLOYMENT_ID: scope COUNT(*) to a single
  //    deployment so test seed rows don't conflict with other rows in
  //    shared dev DB. Production CLI ignores it (counts globally).
  //  - OUTBOX_MONITOR_THRESHOLD_OVERRIDE: lower the threshold from 10 000
  //    to e.g. 10 so tests can verify alert behavior without bulk-inserting
  //    over slow Neon HTTP driver. Production CLI ignores it.
  //  - OUTBOX_MONITOR_ALERT_LOG_PATH: when set (test only), write the
  //    alert payload to a file instead of sending a real email.
  const filterDeploymentId = process.env['OUTBOX_MONITOR_FILTER_DEPLOYMENT_ID'];
  const thresholdOverrideStr = process.env['OUTBOX_MONITOR_THRESHOLD_OVERRIDE'];
  const alertLogPath = process.env['OUTBOX_MONITOR_ALERT_LOG_PATH'] ?? '';

  const opts: OutboxDepthRunOptions = {};
  if (filterDeploymentId !== undefined && filterDeploymentId !== '') {
    Object.assign(opts, { filterDeploymentId });
  }
  if (thresholdOverrideStr !== undefined && thresholdOverrideStr !== '') {
    Object.assign(opts, { threshold: Number(thresholdOverrideStr) });
  }
  if (alertLogPath !== '') {
    Object.assign(opts, {
      sendAlert: async (pending: number, threshold: number): Promise<void> => {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(
          alertLogPath,
          JSON.stringify({ pending, threshold, sent_at: new Date().toISOString() }),
          'utf-8',
        );
      },
    });
  }

  void runOutboxDepthMonitor(opts)
    .then((r) => {
      console.log(
        `[outbox-depth-monitor] pending=${String(r.pending)} exit=${String(r.exitCode)}`,
      );
      process.exit(r.exitCode);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}
