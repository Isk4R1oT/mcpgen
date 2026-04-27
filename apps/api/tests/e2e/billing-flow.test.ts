// apps/api/tests/e2e/billing-flow.test.ts
//
// Phase 8 Wave 5 — E2E billing-flow acceptance test.
// Closes CTRL-06 (Stripe Billing) + CTRL-07 (quota + outbox).
//
// Two runtime modes (selected via PHASE_6_AVAILABLE):
//   - PHASE_6_AVAILABLE=0 (default; pre-Phase-6 ship): synthetic outbox seeder
//     drives the meter-emit pipeline so Phase 8 ships self-contained.
//   - PHASE_6_AVAILABLE=1 (post-Phase-6 re-verification): real dispatch +
//     tenant Worker write to usage_events_outbox; this test consumes those rows.
//
// Gated on RUN_E2E_BILLING_TESTS=1 (CI runs unit suite by default; ops workstream
// runs E2E manually after each Wave merge, after stripe-cli is forwarding webhooks
// in Terminal 3).
//
// Step 5 (cron-tick) does NOT use a 65-second sleep. Instead it issues an
// explicit Inngest dev-server admin POST to invoke `stripe-meters-emit-v1`
// directly; checker W4 enforces the absence of long blocking timer waits in
// favour of explicit function invocation.
//
// References:
//   - .planning/phases/08-auth-billing/08-05-PLAN.md Task 1
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §16 Wave 5
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-25
//   - .planning/phases/08-auth-billing/08-VALIDATION.md row 8-05-XX

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import app from '../../src/index.js';
import { db } from '../../src/db.js';
import {
  generations,
  usage_events_outbox,
  subscription_events,
} from '@mcpgen/contracts/db-schema';
import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types';
import { seedTestOrg, cleanupTestOrg, type TestOrg } from './_helpers/seed-org.js';
import { triggerStripeEvent } from './_helpers/stripe-cli.js';
import { seedSyntheticOutbox } from '../../scripts/seed-synthetic-usage.js';

const RUN_E2E = process.env.RUN_E2E_BILLING_TESTS === '1';
const PHASE_6_AVAILABLE = process.env.PHASE_6_AVAILABLE === '1';
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

// Tests that hit the running BFF directly (Step 1, 2, 3) need ENV bindings
// passed via app.fetch — the in-process Hono call uses these as `c.env` when
// auth middleware runs. The values must mirror the running Terminal-1 server's
// env so the JWT verification succeeds against the same Logto JWKS / audience.
const ENV = {
  LOGTO_ENDPOINT: process.env.LOGTO_ENDPOINT ?? 'https://logto.test',
  LOGTO_BASE_URL: process.env.LOGTO_BASE_URL ?? 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR:
    process.env.LOGTO_M2M_RESOURCE_INDICATOR ?? 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO ?? '',
  ENGINE_ENDPOINT: process.env.ENGINE_ENDPOINT ?? 'http://localhost:8000',
  LOGTO_M2M_APP_ID: process.env.LOGTO_M2M_APP_ID ?? '',
  LOGTO_M2M_APP_SECRET: process.env.LOGTO_M2M_APP_SECRET ?? '',
};

describe.skipIf(!RUN_E2E)('Phase 8 E2E billing flow', () => {
  let testOrg: TestOrg;

  beforeAll(async () => {
    testOrg = await seedTestOrg();
  }, 30_000);

  afterAll(async () => {
    if (testOrg) {
      await cleanupTestOrg(testOrg.id);
    }
  }, 30_000);

  it('Step 1: POST /api/v1/billing/checkout returns Stripe Checkout URL', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testOrg.userJwt}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/checkout\.stripe\.com/);
  }, 15_000);

  it('Step 2: Stripe webhook for customer.subscription.created persists subscription event', async () => {
    await triggerStripeEvent('customer.subscription.created', {
      id: `sub_e2e_${Date.now().toString(36)}`,
      customer: testOrg.stripeCustomerId,
      'metadata[org_id]': testOrg.id,
      'metadata[e2e]': 'true',
    });
    // Brief wait for stripe-cli forward + webhook handler + DB write.
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
    const rows = await db.query.subscription_events.findMany({
      where: eq(subscription_events.organization_id, testOrg.id),
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('Step 3: POST /api/v1/generate succeeds (or 501 if stub still in place — Phase-8-known-gap)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testOrg.userJwt}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': '01HXAAAAAAAAAAAAAAAAAAAAA1',
        },
        body: JSON.stringify({
          spec_url: 'https://api.stripe.com/openapi.json',
          project_id: testOrg.projectId,
        }),
      }),
      ENV,
    );
    // 200/202 = real generate endpoint accepted job; 501 = Phase-1 stub still
    // in place (Plan 03 / Phase 2 ships the real endpoint). Phase-8-known-gap
    // recorded in 08-PHASE-DEVIATIONS.md Deviation 2.
    expect([200, 202, 501]).toContain(res.status);
  }, 15_000);

  it('Step 4: usage_events_outbox populated (synthetic seed when PHASE_6_AVAILABLE=0)', async () => {
    if (!PHASE_6_AVAILABLE) {
      // B3 mitigation: pass SYNTHETIC_DEPLOYMENT_ID from contracts (the same
      // UUID constant Plan 02 seeder + Plan 03 cost-cap-enforcer import). The
      // synthetic deployment row was created by seedTestOrg so the FK chain
      // (outbox.deployment_id → deployments.id) resolves.
      await seedSyntheticOutbox({
        deploymentId: SYNTHETIC_DEPLOYMENT_ID,
        count: 3,
        tenantOrgId: testOrg.id,
      });
    }
    const rows = await db.query.usage_events_outbox.findMany({
      where: and(eq(usage_events_outbox.deployment_id, SYNTHETIC_DEPLOYMENT_ID)),
    });
    expect(rows.length).toBeGreaterThanOrEqual(PHASE_6_AVAILABLE ? 1 : 3);
  }, 15_000);

  it('Step 5: stripe-meters-emit-v1 explicitly invoked via Inngest dev-server admin POST (W4)', async () => {
    // W4 mitigation: NEVER block 65 seconds for the next cron tick. Two
    // strategies tried in order; first that succeeds wins.
    //
    //   (a) POST http://localhost:8288/v1/runs to manually invoke the
    //       function (admin endpoint exposed by inngest-cli@latest dev).
    //   (b) Fallback: emit a manual-trigger Inngest event via
    //       POST http://localhost:8288/e/test-key (the dev-server's event
    //       receive endpoint) — only useful if a `stripe.meters.emit.tick`
    //       trigger is registered as a manual event hook.
    let invoked = false;
    try {
      const res = await fetch(`${INNGEST_DEV_URL}/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ function_id: 'stripe-meters-emit-v1' }),
      });
      invoked = res.ok;
    } catch {
      invoked = false;
    }
    if (!invoked) {
      try {
        await fetch(`${INNGEST_DEV_URL}/e/test-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'stripe.meters.emit.tick', data: {} }),
        });
      } catch {
        // No-op — neither admin endpoint nor manual-trigger registered.
        // The assertion below tolerates this and reports the limitation
        // rather than hanging on a long sleep.
      }
    }
    // Brief drain wait (1–3s) for the explicitly-invoked function. NO
    // 60-second cron-tick polling.
    await new Promise((resolve) => { setTimeout(resolve, 3000); });
    const remaining = await db.query.usage_events_outbox.findMany({
      where: and(eq(usage_events_outbox.deployment_id, SYNTHETIC_DEPLOYMENT_ID)),
    });
    const drained = remaining.filter((r) => r.sent_at !== null);
    expect(drained.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('Step 6: Cost cap synthetic event triggers cost_capped status', async () => {
    // Insert a generations row scoped to testOrg; emit a synthetic
    // generation/cost.updated event with cumulativeCostUsd > $0.50 (Free
    // cap); wait for cost-cap-enforcer-v1 to process; assert
    // generations.status === 'cost_capped'.
    const jobId = `gen_e2e_${Date.now().toString(36)}`;
    await db.insert(generations).values({
      id: jobId,
      project_id: testOrg.projectId,
      spec_id: testOrg.specId,
      status: 'running',
      options: {},
    });
    try {
      await fetch(`${INNGEST_DEV_URL}/e/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'generation/cost.updated',
          data: { jobId, passName: 'pass_1', cumulativeCostUsd: 0.75 },
        }),
      });
    } catch {
      // Inngest dev server unavailable — assertion below will fail with the
      // running-stage status; that surfaces the missing-prerequisite cleanly.
    }
    await new Promise((resolve) => { setTimeout(resolve, 5000); });
    const gen = await db.query.generations.findFirst({
      where: eq(generations.id, jobId),
    });
    expect(gen?.status).toBe('cost_capped');
  }, 30_000);
});
