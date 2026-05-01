// apps/api/src/routes/v1/jobs/anon.ts
//
// Phase 09.1 plan 02 — anon-allowed wrapper around the existing
// jobsStreamRoute (`/jobs/:id/stream`) plus a status endpoint
// `/jobs/:id`. Real cookie-scoping logic lands in plan 09.1-03 (D-04 anon
// cookie binds session to generation_id rows in `anonymous_generations`).
//
// This module re-exports `jobsStreamRoute`'s GET /:id/stream handler and
// adds a stub status endpoint, all on a single Hono sub-app the parent can
// mount under `/api/v1/jobs` on the PUBLIC side.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)
//   - apps/api/src/routes/v1/jobs/stream.ts (existing SSE handler — reused)

import { Hono } from 'hono';
import { jobsStreamRoute } from './stream.js';

export const jobsAnonRoute = new Hono();

// Compose: /:id/stream comes from existing jobsStreamRoute (SSE handler);
// /:id status is a fresh stub for plan 09.1-03 to fill in.
jobsAnonRoute.route('/', jobsStreamRoute);

// GET /jobs/:id — status check (anon-cookie-scoped or JWT). Stub for now.
jobsAnonRoute.get('/:id', (c) =>
  c.json(
    {
      stub: true,
      route: 'jobs/:id',
      job_id: c.req.param('id'),
      pending_plan: '09.1-03',
    },
    200,
  ),
);
