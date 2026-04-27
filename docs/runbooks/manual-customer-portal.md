# Manual Stripe Customer Portal Workflow (W7–W10 MVP)

## When to use

User emails support requesting one of:

- Update payment method
- Cancel subscription
- Download invoice PDF
- Change billing email

Stripe Customer Portal integration is **deferred to v1.x** (per RESEARCH §20 Q3).
For MVP solo-founder ops, the founder manually generates a one-time portal link
using `stripe.billingPortal.sessions.create` and emails it to the user.

## Procedure

1. Look up the user's Stripe customer ID:
   ```bash
   set -a && source .env.local && set +a
   psql "$DATABASE_URL_UNPOOLED" -c "SELECT id, name, stripe_customer_id FROM organizations WHERE id = '<org_uuid>';"
   ```

2. Generate a portal session URL (Bun one-liner):
   ```bash
   bun run -e "
     const Stripe = require('stripe');
     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
     const customerId = '<cus_xxx>';
     const returnUrl = 'https://app.mcpgen.dev/dashboard/billing';
     stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })
       .then(s => console.log(s.url));
   "
   ```

3. Email the URL to the user via Resend (or manually):
   ```
   Subject: Your MCPGen billing portal link
   Body: Click here to manage your subscription: <portal_url>
         This link expires in 24 hours.
   ```

## Acceptance

- MVP solo-founder ops; expected volume < 1 request/week in W7–W10.
- **Trigger for upgrade to fully-integrated Customer Portal:** churn > 5% in W7–W10
  OR > 5 manual requests/week. Then file a v1.0.1 follow-up issue.

## References

- `.planning/phases/08-auth-billing/08-RESEARCH.md` §20 Q3
- https://docs.stripe.com/api/customer_portal/sessions/create
