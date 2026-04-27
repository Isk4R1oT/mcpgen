// apps/api/src/routes/v1/billing/checkout.ts
//
// CTRL-06 / D-06: Stripe-hosted Checkout Session creation.
// Returns {url} for the frontend (Phase 7) to window.location-redirect to
// Stripe. Hosted (NOT embedded Elements) — PCI-compliant out of the box;
// Stripe handles 3DS / SCA / tax automatically.
//
// Security:
//   - Auth required (user JWT only); M2M tokens rejected with 403 (T-8-06
//     mitigation against IDOR via M2M-issued checkout for arbitrary org).
//   - org_id derived from c.var.auth.organizationId (verified JWT claim).
//   - Body is empty per CheckoutSessionRequest schema.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-06
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-06
//   - https://docs.stripe.com/billing/subscriptions

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db.js';
import { organizations, users } from '@mcpgen/contracts/db-schema';
import { getStripe } from '../../../lib/stripe-client.js';
import type { AuthContext } from '../../../middleware/auth.js';

interface Bindings {
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_PRO: string;
  LOGTO_BASE_URL: string;
}

export const checkoutRoute = new Hono<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}>();

checkoutRoute.post('/', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_checkout' }, 403);
  }
  const orgId = auth.organizationId;
  if (!orgId) {
    return c.json({ error: 'no_org_context' }, 400);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) {
    return c.json({ error: 'org_not_found' }, 404);
  }

  // Prefill email from user record for first-time customers (no stripe_customer_id yet).
  const user = await db.query.users.findFirst({
    where: eq(users.logto_user_id, auth.subject),
  });

  const stripe = getStripe(c.env);
  // Build params conditionally to satisfy `exactOptionalPropertyTypes: true` —
  // Stripe SDK params reject `undefined` values explicitly.
  const baseParams = {
    mode: 'subscription' as const,
    line_items: [{ price: c.env.STRIPE_PRICE_PRO, quantity: 1 }],
    success_url: `${c.env.LOGTO_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.env.LOGTO_BASE_URL}/billing/cancel`,
    metadata: { org_id: org.id },
    subscription_data: { metadata: { org_id: org.id } },
  };
  const customerParams = org.stripe_customer_id
    ? { customer: org.stripe_customer_id }
    : user?.email
      ? { customer_email: user.email }
      : {};
  const session = await stripe.checkout.sessions.create({ ...baseParams, ...customerParams });

  if (!session.url) {
    return c.json({ error: 'checkout_session_create_failed' }, 500);
  }
  return c.json({ url: session.url });
});
