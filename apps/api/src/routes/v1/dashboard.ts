// apps/api/src/routes/v1/dashboard.ts
//
// Phase 09.1 plan 02 — thin stub for /dashboard root. The real dashboard
// data is served via the existing /deployments, /usage, /deploy/:id routes
// (Phase 9 D-18). This stub registers a base /dashboard endpoint on
// protectedApp so the auth-gate-position test (Test 5) can verify the
// boundary stays in place across all 4 BFF_ANONYMOUS_GATE positions.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-01, D-07
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const dashboardRoutes = new Hono();

// Root — returns whoami for the org. Real dashboard widgets are wired via
// dedicated endpoints (deployments, usage, deploy).
dashboardRoutes.get('/', (c) =>
  c.json({ stub: true, route: 'dashboard', pending_plan: 'phase-9' }, 200),
);
