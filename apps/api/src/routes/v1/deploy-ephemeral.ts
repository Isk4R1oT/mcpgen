// apps/api/src/routes/v1/deploy-ephemeral.ts
//
// Phase 09.1 plan 02 — thin stub for /deploy/ephemeral (anon-allowed
// 24h ephemeral CF Workers for Platforms tenant). Real implementation lands
// in plan 09.1-08 (D-03). Stub registers the route on the public app so
// the auth gate test can verify anon access without depending on
// CF Workers for Platforms.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-03, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const ephemeralDeployRoute = new Hono();

// Anon POST → returns stub URL (real impl in 09.1-08 deploys to CF for Platforms).
ephemeralDeployRoute.post('/', (c) =>
  c.json(
    {
      stub: true,
      route: 'deploy/ephemeral',
      pending_plan: '09.1-08',
    },
    501,
  ),
);

// Status check by id.
ephemeralDeployRoute.get('/:id', (c) =>
  c.json(
    {
      stub: true,
      route: 'deploy/ephemeral',
      tenant_id: c.req.param('id'),
      pending_plan: '09.1-08',
    },
    200,
  ),
);
