// packages/contracts/src/billing-types.ts
//
// Phase 8 billing-surface types.
//
// Wave-1 seed (Plan 01): SYNTHETIC_DEPLOYMENT_ID constant only.
// Wave-3 extension (Plan 03 Task 1, CTRL-06 / CTRL-07): Zod schemas for the
// Stripe webhook event-type enum + checkout/portal request-response shapes +
// quota-exceeded response + drift-toggle PATCH body. Consumed by apps/api
// routes and tests.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-06, D-08, D-12, D-19
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-06, §10
//   - apps/api/src/routes/v1/billing/checkout.ts (CheckoutSessionResponse consumer)
//   - apps/api/src/routes/v1/billing/portal.ts (BillingPortalSessionResponse consumer)
//   - apps/api/src/middleware/quota.ts (QuotaExceededResponse consumer)

import { z } from 'zod';

// SYNTHETIC_DEPLOYMENT_ID is the well-known UUID used by:
//   - apps/api/scripts/seed-synthetic-usage.ts (Plan 02 Task 3 — synthetic outbox seeder)
//   - apps/api/src/inngest/functions/cost-cap-enforcer.ts (Plan 03 Task 3 — cost-capped sentinel)
// Both consumers MUST import this constant (NOT inline a string literal) so the FK
// chain (organizations → projects → generations → deployments → usage_events_outbox)
// resolves to the same synthetic deployment row across the codebase.
export const SYNTHETIC_DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// Subscription state — Stripe canonical statuses (subset MCPGen tracks).
// ─────────────────────────────────────────────────────────────────────────────
export const SubscriptionStatus = z.enum([
  'active',
  'past_due',
  'canceled',
  'trialing',
  'unpaid',
  'incomplete',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// BillingEventType — the 5 Stripe webhook event types Phase 8 dispatches on
// (D-08). Unhandled types are persisted-and-acked for forward compatibility.
// ─────────────────────────────────────────────────────────────────────────────
export const BillingEventType = z.enum([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);
export type BillingEventType = z.infer<typeof BillingEventType>;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/checkout — body is empty; org_id derived from auth
// (defense against IDOR per T-8-06).
// ─────────────────────────────────────────────────────────────────────────────
export const CheckoutSessionRequest = z.object({}).strict();
export type CheckoutSessionRequest = z.infer<typeof CheckoutSessionRequest>;

export const CheckoutSessionResponse = z.object({
  url: z.string().url(),
});
export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/portal — body is empty; org_id derived from auth.
// ─────────────────────────────────────────────────────────────────────────────
export const BillingPortalSessionRequest = z.object({}).strict();
export type BillingPortalSessionRequest = z.infer<typeof BillingPortalSessionRequest>;

export const BillingPortalSessionResponse = z.object({
  url: z.string().url(),
});
export type BillingPortalSessionResponse = z.infer<typeof BillingPortalSessionResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/deployments/:id — drift auto-regenerate toggle (D-19, opt-in).
// ─────────────────────────────────────────────────────────────────────────────
export const DeploymentDriftPatchRequest = z.object({
  auto_regenerate_on_drift: z.boolean(),
});
export type DeploymentDriftPatchRequest = z.infer<typeof DeploymentDriftPatchRequest>;

// ─────────────────────────────────────────────────────────────────────────────
// 429 response shape returned by apps/api/src/middleware/quota.ts (D-12).
// `quota_limit` may be Infinity for PAYG (serialized as null on the wire);
// PAYG never reaches this branch in practice — the helper short-circuits.
// ─────────────────────────────────────────────────────────────────────────────
export const QuotaExceededResponse = z.object({
  error: z.literal('quota_exceeded'),
  quota_used: z.number().int().nonnegative(),
  quota_limit: z.number(),
  reset_at: z.string().datetime(),
});
export type QuotaExceededResponse = z.infer<typeof QuotaExceededResponse>;
