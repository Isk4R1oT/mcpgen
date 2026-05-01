// apps/api/src/routes/v1/billing/index.ts
//
// Phase 09.1 plan 02 — billing aggregator. Bundles checkoutRoute and
// portalRoute under a single /billing parent so the per-route auth refactor
// (plan 02) can mount one Hono sub-app on protectedApp instead of two.
//
// Behavior unchanged: both child routes already require authMiddleware and
// reject M2M tokens internally (Phase 8 D-06 / D-07).
//
// References:
//   - apps/api/src/routes/v1/billing/checkout.ts (existing)
//   - apps/api/src/routes/v1/billing/portal.ts (existing)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';
import { checkoutRoute } from './checkout.js';
import { portalRoute } from './portal.js';

export const billingRoutes = new Hono();

billingRoutes.route('/checkout', checkoutRoute);
billingRoutes.route('/portal', portalRoute);
