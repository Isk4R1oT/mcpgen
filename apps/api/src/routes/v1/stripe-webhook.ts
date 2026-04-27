// apps/api/src/routes/v1/stripe-webhook.ts
//
// CTRL-06 / D-08: Stripe webhook handler.
// - Verifies signature via `constructEventAsync` (Bun + CF Workers Web Crypto compat).
// - Persists event to subscription_events with stripe_event_id UNIQUE for idempotency.
// - Dispatches handler INSIDE same try-block; marks processed | error.
// - Mounted BEFORE authMiddleware (signature is the auth surface).
//
// Threats addressed:
//   T-8-04 — read raw body via `await c.req.text()` BEFORE any JSON parse;
//            pass raw string verbatim to constructEventAsync.
//   T-8-05 — db.insert(...).onConflictDoNothing(...).returning() returns empty array
//            on duplicate stripe_event_id → ack 200 with `duplicate: true`.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-08, D-09
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-08

import { Hono } from 'hono';
import type Stripe from 'stripe';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { subscription_events, organizations } from '@mcpgen/contracts/db-schema';
import { getStripe } from '../../lib/stripe-client.js';

interface Bindings {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export const stripeWebhookRoute = new Hono<{ Bindings: Bindings }>();

interface CheckoutSessionPayload {
  id?: string;
  customer?: string;
  metadata?: { org_id?: string };
  subscription?: { metadata?: { org_id?: string } };
  status?: string;
  current_period_start?: number;
}

function extractOrgId(event: Stripe.Event): string | null {
  // Convention: every Checkout Session / Subscription is created with metadata.org_id.
  // For invoice.payment_failed, look up via subscription.metadata.
  const obj = event.data.object as CheckoutSessionPayload;
  return obj.metadata?.org_id ?? obj.subscription?.metadata?.org_id ?? null;
}

async function dispatchSubscriptionEvent(event: Stripe.Event): Promise<void> {
  const obj = event.data.object as CheckoutSessionPayload;
  const orgId = extractOrgId(event);
  switch (event.type) {
    case 'checkout.session.completed':
      // Tag the org with the new Stripe customer ID + flip plan_tier='pro' on subscription mode.
      if (orgId && obj.customer) {
        await db
          .update(organizations)
          .set({ stripe_customer_id: obj.customer, subscription_status: 'active', plan_tier: 'pro' })
          .where(eq(organizations.id, orgId));
      }
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      // Sync subscription_status + quota_period_start to Stripe's current_period_start (D-14).
      if (orgId && obj.status) {
        const periodStart = obj.current_period_start
          ? new Date(obj.current_period_start * 1000)
          : new Date();
        await db
          .update(organizations)
          .set({ subscription_status: obj.status, quota_period_start: periodStart })
          .where(eq(organizations.id, orgId));
      }
      return;
    case 'customer.subscription.deleted':
      if (orgId) {
        await db
          .update(organizations)
          .set({ subscription_status: 'canceled', plan_tier: 'free' })
          .where(eq(organizations.id, orgId));
      }
      return;
    case 'invoice.payment_failed':
      if (orgId) {
        await db
          .update(organizations)
          .set({ subscription_status: 'past_due' })
          .where(eq(organizations.id, orgId));
      }
      return;
    default:
      // Unknown event — already persisted; ack 200 (forward-compat).
      return;
  }
}

stripeWebhookRoute.post('/', async (c) => {
  const sig = c.req.header('stripe-signature');
  if (!sig) {
    return c.json({ error: 'invalid_signature', reason: 'missing_signature_header' }, 400);
  }
  const rawBody = await c.req.text();
  const stripe = getStripe(c.env);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (_err) {
    return c.json({ error: 'invalid_signature' }, 400);
  }

  const inserted = await db
    .insert(subscription_events)
    .values({
      id: ulid(),
      organization_id: extractOrgId(event),
      event_type: event.type,
      stripe_event_id: event.id,
      payload: event as unknown as Record<string, unknown>,
      status: 'received',
    })
    .onConflictDoNothing({ target: subscription_events.stripe_event_id })
    .returning();

  if (inserted.length === 0) {
    // Replay — already processed (T-8-05 mitigation).
    return c.json({ received: true, duplicate: true });
  }

  try {
    await dispatchSubscriptionEvent(event);
    await db
      .update(subscription_events)
      .set({ status: 'processed', processed_at: new Date() })
      .where(eq(subscription_events.stripe_event_id, event.id));
  } catch (handlerErr) {
    await db
      .update(subscription_events)
      .set({ status: 'error', error_message: String(handlerErr) })
      .where(eq(subscription_events.stripe_event_id, event.id));
    throw handlerErr; // Stripe retries non-2xx
  }

  return c.json({ received: true });
});
