// apps/api/tests/e2e/_helpers/stripe-cli.ts
//
// Phase 8 Wave 5 — E2E helper: drives real webhook events through the
// `stripe listen --forward-to ...` forwarder running in Terminal 3.
//
// Two strategies, selected at runtime:
//   1. stripe-cli installed locally (HAS_CLI === true) — shell out to
//      `stripe trigger <event>` via Bun.spawn or Node child_process; the
//      forwarder picks up the real event from Stripe's test API and POSTs it
//      to /api/v1/stripe/webhook with a real Stripe-signed payload.
//   2. stripe-cli NOT available (HAS_CLI === false; e.g. CI without the
//      binary) — synthesize an event JSON, sign it via
//      stripe.webhooks.generateTestHeaderString, and POST directly to the
//      BFF webhook endpoint at http://localhost:8787/api/v1/stripe/webhook.
//
// Toggle the strategy via STRIPE_CLI_AVAILABLE=0 to force the fallback.
//
// References:
//   - .planning/phases/08-auth-billing/08-05-PLAN.md Task 1
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §16 Wave 5
//   - https://docs.stripe.com/webhooks/test (Stripe webhook signing utilities)

import Stripe from 'stripe';
import { spawn } from 'node:child_process';

const HAS_CLI = process.env.STRIPE_CLI_AVAILABLE !== '0';
const WEBHOOK_URL = process.env.E2E_WEBHOOK_URL ?? 'http://localhost:8787/api/v1/stripe/webhook';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `triggerStripeEvent: required env var ${name} is not set; see apps/api/README.md Wave 5 section`,
    );
  }
  return value;
}

interface SpawnHandle {
  readonly exited: Promise<number>;
}

// Prefer Bun.spawn when available (Wave 5 documents Bun as the canonical
// runtime in Terminal 1); fall back to node:child_process when running under
// plain Node (vitest in CI). Both are non-interactive and exit-code-checked.
function spawnStripeTrigger(args: ReadonlyArray<string>): SpawnHandle {
  const bunGlobal = (globalThis as unknown as { Bun?: { spawn: (cmd: ReadonlyArray<string>, opts: unknown) => SpawnHandle } }).Bun;
  if (bunGlobal?.spawn) {
    return bunGlobal.spawn(['stripe', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }
  const child = spawn('stripe', [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<number>((resolve, reject) => {
    child.once('exit', (code) => { resolve(code ?? -1); });
    child.once('error', reject);
  });
  return { exited };
}

export async function triggerStripeEvent(
  eventType: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  if (HAS_CLI) {
    // Path 1: stripe trigger <event> with metadata override; Stripe API
    // generates a real test event and the forwarder relays it (real Stripe
    // signature, real webhook secret).
    const args: string[] = ['trigger', eventType, '--add', `metadata.e2e=true`];
    for (const [k, v] of Object.entries(overrides)) {
      args.push('--add', `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
    const handle = spawnStripeTrigger(args);
    const exitCode = await handle.exited;
    if (exitCode !== 0) {
      throw new Error(`stripe trigger ${eventType} exited ${String(exitCode)}`);
    }
    return;
  }

  // Path 2: synthesize event + sign + POST. Used by CI environments without
  // stripe-cli installed; bypasses the forwarder entirely.
  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  const event: Stripe.Event = {
    id: `evt_e2e_${Date.now().toString(36)}`,
    type: eventType,
    data: { object: overrides as Stripe.Event.Data.Object },
    created: Math.floor(Date.now() / 1000),
    api_version: '2025-09-30.clover',
    livemode: false,
    object: 'event',
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as Stripe.Event;
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: requireEnv('STRIPE_WEBHOOK_SECRET'),
  });
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'stripe-signature': sig,
      'Content-Type': 'application/json',
    },
    body: payload,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`webhook POST failed: ${String(res.status)} ${body}`);
  }
}
