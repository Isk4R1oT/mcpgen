// apps/api/src/routes/v1/claim.ts
//
// Phase 09.1 plan 03 — claim_generation route scaffold.
//
// Mounted on protectedApp (Logto JWT required). When the authed caller has
// no `mcpgen_anon_session` cookie, returns 400 `no_anon_session` so the
// frontend can surface a helpful error. When both JWT + cookie are present,
// returns 501 `not_implemented` — the real atomic Postgres claim + cookie
// clear + anon-tenant re-tagging lands in plan 09.1-09 (D-04).
//
// This plan establishes the auth boundary + cookie-read scaffold so the
// downstream plan 09.1-09 can drop in the transactional UPDATE without
// re-touching index.ts mounting.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §9 (lines 1025–1100)

import { Hono } from 'hono';

import type { AuthContext } from '../../middleware/auth.js';
import { readAnonSession } from '../../lib/anon-session.js';

interface ClaimRouteVariables {
  auth: AuthContext;
}

export const claimRoute = new Hono<{ Variables: ClaimRouteVariables }>();

claimRoute.post('/', (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_claim' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const anonSessionId = readAnonSession(c);
  if (anonSessionId === null) {
    return c.json({ error: 'no_anon_session' }, 400);
  }
  // Cookie + JWT both present — full atomic claim flow lives in plan 09.1-09.
  return c.json(
    {
      stub: true,
      route: 'claim_generation',
      anon_session_id_present: true,
      pending_plan: '09.1-09',
    },
    501,
  );
});
