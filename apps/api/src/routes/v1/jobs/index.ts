// apps/api/src/routes/v1/jobs/index.ts
//
// Phase 09.1 plan 03 — public /api/v1/jobs barrel.
//
// Composes the cookie/JWT-scoped status read + SSE replay into a single
// Hono sub-app the parent app mounts at /api/v1/jobs (PUBLIC side per
// D-07). Replaces the plan-02 stub `apps/api/src/routes/v1/jobs/anon.ts`.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2)

import { Hono } from 'hono';
import { jobsAnonStreamRoute } from './anon-stream.js';

export const jobsRoute = new Hono();

// Both /:id and /:id/stream live in jobsAnonStreamRoute — one mount.
jobsRoute.route('/', jobsAnonStreamRoute);
