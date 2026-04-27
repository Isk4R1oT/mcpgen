// apps/api/src/routes/v1/billing/portal.ts
//
// CTRL-06 / RESEARCH §20 Q3: Limited Stripe Customer Portal endpoint.
// Exposes a one-time portal URL for org admins to update card / cancel
// subscription. Full Customer Portal integration deferred to v1.x; see
// docs/runbooks/manual-customer-portal.md for the founder-mediated alternative.
//
// Security:
//   - Auth required (user JWT only); M2M tokens rejected with 403.
//   - org must have stripe_customer_id (i.e. has subscribed) — 400 otherwise.
//   - org_id derived from c.var.auth.organizationId.
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §20 Q3
//   - docs/runbooks/manual-customer-portal.md (Wave 2 fallback runbook)

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db.js';
import { organizations } from '@mcpgen/contracts/db-schema';
import { getStripe } from '../../../lib/stripe-client.js';
import type { AuthContext } from '../../../middleware/auth.js';

interface Bindings {
  STRIPE_SECRET_KEY: string;
  LOGTO_BASE_URL: string;
}

export const portalRoute = new Hono<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}>();

portalRoute.post('/', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_open_portal' }, 403);
  }
  const orgId = auth.organizationId;
  if (!orgId) {
    return c.json({ error: 'no_org_context' }, 400);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org?.stripe_customer_id) {
    return c.json({ error: 'no_stripe_customer', reason: 'org_not_subscribed' }, 400);
  }

  const stripe = getStripe(c.env);
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${c.env.LOGTO_BASE_URL}/dashboard/billing`,
  });

  return c.json({ url: session.url });
});
