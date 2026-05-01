// apps/api/src/routes/v1/deploy.ts
//
// Phase 09.1 plan 03 — barrel re-export.
//
// The Phase 9 D-18 deploy implementation moved to `deploy-legacy.ts`
// (kept verbatim for frontend backward compat — same `/deploy/:generationId`
// URL the dashboard already calls). The new D-08 surface
// `/deploy/permanent/:id` lives in `permanent-deploy.ts`. The anon-allowed
// ephemeral path lives in `deploy-ephemeral.ts`. All three are surfaced
// here so callers have a single import point.
//
// Mount layout (apps/api/src/index.ts after plan 03):
//   public (anon-allowed):  /api/v1/deploy/ephemeral      → ephemeralDeployRoute
//   protected (Logto JWT):  /api/v1/deploy/:generationId  → deployRoute (legacy)
//   protected (Logto JWT):  /api/v1/deploy/permanent/:id  → permanentDeployRoute
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md (Task 2 step 6)

export { deployRoute } from './deploy-legacy.js';
export { permanentDeployRoute } from './permanent-deploy.js';
export { ephemeralDeployRoute } from './deploy-ephemeral.js';
