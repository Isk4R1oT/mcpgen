// apps/api/src/routes/v1/download.ts
//
// Phase 09.1 plan 02 — thin stub for /download/:id (Logto-gated ZIP / Docker
// bundle download per D-03). Real implementation lands in a future plan;
// this stub exists so the auth-gate test can verify the route is mounted on
// protectedApp.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-03, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const downloadRoute = new Hono();

downloadRoute.get('/:id', (c) =>
  c.json(
    {
      stub: true,
      route: 'download',
      generation_id: c.req.param('id'),
      pending_plan: '09.1-future',
    },
    501,
  ),
);
