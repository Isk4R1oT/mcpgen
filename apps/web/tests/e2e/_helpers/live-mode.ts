// apps/web/tests/e2e/_helpers/live-mode.ts
//
// Plan 07-04 — shared helper for Wave-2 live-mode e2e tests.
//
// Tests in *-live.spec.ts files require MCPGEN_FRONTEND_MODE=live + a running
// apps/api Hono BFF + a real engine sandbox spec. They SKIP automatically
// when MCPGEN_FRONTEND_MODE != 'live' so CI can run the suite by default
// without engine availability (fixture-mode hero flow remains green).
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-15 (live-mode env var)
//   - .planning/phases/07-frontend-wire-up/07-04-PLAN.md task 4

import { test } from '@playwright/test';

export const isLiveMode = (): boolean =>
  process.env.MCPGEN_FRONTEND_MODE === 'live';

/**
 * Auto-skip a test (or describe block) when MCPGEN_FRONTEND_MODE != 'live'.
 * Place at the top of a `test(...)` body or inside `test.beforeEach(...)`.
 */
export const skipIfNotLive = (): void => {
  test.skip(!isLiveMode(), 'requires MCPGEN_FRONTEND_MODE=live + running apps/api BFF');
};

/**
 * Sandbox spec URL used by live-mode hero flow. Matches Phase 8 sandbox spec
 * (one of the 5 hand-crafted fixture APIs in packages/engine-fixtures); the
 * spec_url is what apps/api sends to the engine `/internal/v1/parse` endpoint.
 *
 * If the engine sandbox uses a different spec, update this constant; tests
 * will pick up the change automatically (no spec embedded inline).
 */
export const SANDBOX_SPEC_URL = 'https://api.stripe.com/openapi.yaml';
