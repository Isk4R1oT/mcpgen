// apps/web/tests/e2e/hero-flow-live.spec.ts
//
// Plan 07-04 Wave 2 — full hero flow against the REAL engine + apps/api BFF.
//
// Skipped automatically when MCPGEN_FRONTEND_MODE != 'live' so CI can ship
// the suite green without engine availability. To run locally:
//
//   pnpm --filter=apps/api dev                 # terminal 1: BFF on :8787
//   pnpm --filter=apps/generation-engine dev   # terminal 2: engine on :8000
//   MCPGEN_FRONTEND_MODE=live MCPGEN_BFF_URL=http://localhost:8787/api/v1 \
//     pnpm --filter=@mcpgen/web exec playwright test hero-flow-live
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-04-PLAN.md task 4 step 2
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-15

import { test, expect } from '@playwright/test';

import { skipIfNotLive, SANDBOX_SPEC_URL } from './_helpers/live-mode';

test('FE-01..04: hero flow against real engine completes successfully', async ({ page }) => {
  skipIfNotLive();

  // Step 1 — landing.
  await page.goto('/');

  // Step 2 — paste sandbox spec URL (matches what the engine sandbox accepts).
  await page.fill('input.mc-input', SANDBOX_SPEC_URL);
  await page.click('button:has-text("make it")');

  // Step 3 — wait for navigation to /generate/<gen_id>. Real BFF returns 202
  // with a real gen_<ULID> from the engine kickoff (NOT the Phase-1 stub).
  await page.waitForURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}(\/|$)/, {
    timeout: 30_000,
  });

  // Step 4 — wait for SSE-driven navigation to /preview. The locked StreamLog
  // simulates ~12s of visual progress; the wrapper navigates externally as
  // soon as real SSE emits stage='completed'. Live engine takes 60–180s
  // depending on spec size + Stage F (F2 ALWAYS, F3 opt-in).
  // No 60s timing assertion (timing acceptance lives in Phase 9 integration).
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: 240_000 });
  await expect(page).toHaveURL(/\/preview/);
});
