// apps/api/src/lib/email/resend-client.ts
//
// CTRL-03 / D-15 / D-05: Single Resend connector for all Phase 8 email paths.
// - sendDriftEmail (D-18 batched per-week per-tenant)
// - sendReconciliationAlert (D-15 per-day per-tenant per-event-type)
// - sendMauAlert (D-05 per-day; Pitfall #17 mitigation)
//
// Resend rate-limit: 2 req/s free / 100 req/s production; Phase 8 emits ~1/wk
// per tenant + ~1/day reconciliation + ~1/wk MAU = far under any tier limit.
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §14 (verbatim)
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-15, D-18, D-05, Q4

import { Resend } from 'resend';

export interface ResendEnv {
  RESEND_API_KEY: string;
  OPS_EMAIL: string;
  // optional override; default 'drift@mcpgen.dev' (Q4 fallback: 'onboarding@resend.dev')
  DRIFT_FROM_EMAIL?: string | undefined;
  // optional override; default 'ops@mcpgen.dev'
  OPS_FROM_EMAIL?: string | undefined;
  LOGTO_BASE_URL: string;
}

export interface DriftEventForEmail {
  readonly id: string;
  readonly deployment_url: string;
  readonly detected_at: Date;
  readonly diff_json: { summary: string };
}

const DEFAULT_DRIFT_FROM = 'MCPGen Drift Watcher <drift@mcpgen.dev>';
const DEFAULT_OPS_FROM = 'MCPGen Ops Alert <ops@mcpgen.dev>';

export async function sendDriftEmail(
  env: ResendEnv,
  toEmail: string,
  drifts: ReadonlyArray<DriftEventForEmail>,
): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);
  const text = drifts
    .map(
      (d) =>
        `Deployment: ${d.deployment_url}\n` +
        `Detected: ${d.detected_at.toISOString()}\n` +
        `Summary: ${d.diff_json.summary}\n` +
        `Review: ${env.LOGTO_BASE_URL}/dashboard/drift/${d.id}\n`,
    )
    .join('\n---\n');
  await resend.emails.send({
    from: env.DRIFT_FROM_EMAIL ?? DEFAULT_DRIFT_FROM,
    to: [toEmail],
    subject: `Spec changes detected for ${String(drifts.length)} deployment(s)`,
    text,
  });
}

export async function sendReconciliationAlert(
  env: ResendEnv,
  driftPct: number,
  eventType: string,
  tenantId: string,
): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.OPS_FROM_EMAIL ?? DEFAULT_OPS_FROM,
    to: [env.OPS_EMAIL],
    subject: `Reconciliation drift ${driftPct.toFixed(2)}% on ${eventType}`,
    text:
      `Tenant: ${tenantId}\n` +
      `Event type: ${eventType}\n` +
      `Drift: ${driftPct.toFixed(2)}%\n` +
      `Threshold: 2%\n` +
      `Action: investigate Stripe Meters lag or BFF outbox health.`,
  });
}

export async function sendMauAlert(env: ResendEnv, mau: number): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.OPS_FROM_EMAIL ?? DEFAULT_OPS_FROM,
    to: [env.OPS_EMAIL],
    subject: `Logto MAU at ${String(mau)} (75% of free-tier 5K cap)`,
    text:
      `MAU has crossed 4K. Pro upgrade calendar action: W7.\n` +
      `Runbook: docs/runbooks/logto-pro-upgrade.md`,
  });
}

// CTRL-08 / D-21 — outbox depth alert (replaces CF Queue depth alert per Phase 8 D-22).
// Same shape as sendMauAlert: ops-email recipient, plaintext body, single Resend call.
export async function sendOutboxDepthAlert(
  env: ResendEnv,
  pending: number,
  threshold: number,
): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.OPS_FROM_EMAIL ?? DEFAULT_OPS_FROM,
    to: [env.OPS_EMAIL],
    subject: `Outbox depth ${String(pending)} (> ${String(threshold)})`,
    text:
      `usage_events_outbox has ${String(pending)} rows pending older than 5 minutes\n` +
      `(threshold: ${String(threshold)}). Stripe Meters emitter likely lagging.\n` +
      `\n` +
      `Investigate:\n` +
      `  - apps/api logs for stripe-meters-emit-v1 errors\n` +
      `  - Inngest dashboard for failed runs\n` +
      `  - Stripe API status\n`,
  });
}
