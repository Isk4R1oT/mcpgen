// apps/api/src/routes/v1/playground.ts
//
// Phase 09.1 plan 02 — thin stub. Real playground (gated agent-eval against
// the generated MCP server) lands in plan 09.1-03 / 09.1-08. Stub registers
// the route so the per-route auth gate can place it on either public or
// protected app per BFF_ANONYMOUS_GATE.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-01, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const playgroundRoute = new Hono();

playgroundRoute.get('/:id', (c) =>
  c.json(
    {
      stub: true,
      route: 'playground',
      generation_id: c.req.param('id'),
      pending_plan: '09.1-03',
    },
    200,
  ),
);
