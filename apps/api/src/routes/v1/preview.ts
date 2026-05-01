// apps/api/src/routes/v1/preview.ts
//
// Phase 09.1 plan 02 — thin stub. The real BFF preview endpoint (returns
// generation preview metadata, code shape, deploy CTA) is implemented by
// plan 09.1-03 / 09.1-06. This stub exists so the per-route auth refactor
// (plan 02) can mount /api/v1/preview as a public route and the
// auth-gate-position vitest suite can prove the gate works without 401-ing
// on the route itself.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-01, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const previewRoute = new Hono();

previewRoute.get('/:id', (c) =>
  c.json(
    {
      stub: true,
      route: 'preview',
      generation_id: c.req.param('id'),
      pending_plan: '09.1-03',
    },
    200,
  ),
);
