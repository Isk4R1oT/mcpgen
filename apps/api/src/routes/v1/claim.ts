// apps/api/src/routes/v1/claim.ts
//
// Phase 09.1 plan 02 — thin stub for /claim_generation. Real implementation
// (HttpOnly anon-cookie reading + Postgres atomic claim + anon-tenant
// re-tagging) lands in plan 09.1-09 (D-04). This stub mounts on protectedApp
// (Logto JWT required) so the auth gate test can verify the boundary
// position without bringing up a database.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-02-PLAN.md (Task 2)

import { Hono } from 'hono';

export const claimRoute = new Hono();

claimRoute.post('/', (c) =>
  c.json({ stub: true, route: 'claim_generation', pending_plan: '09.1-09' }, 501),
);
