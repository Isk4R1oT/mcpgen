// apps/web/tests/e2e/hero-flow-fixture.spec.ts
//
// Plan 07-03 — 60-second hero flow timing test (FIXTURE MODE).
// PROJECT.md core value + ux-flow §10: paste OpenAPI URL → 60s → mock deploy URL.
//
// Fixture-mode SSE timeline emits ~9 stages × 1.5–3s = ~14–27s + page transitions
// well within the 60s budget. Live-mode timing is Phase 9 integration.

import { test, expect } from '@playwright/test';

test('FE-01..04 + PROJECT.md core value: hero flow completes in fixture mode within 60s', async ({
  page,
}) => {
  const startTime = Date.now();

  await page.goto('/');
  await page.fill('input.mc-input', 'https://api.stripe.com/openapi.yaml');
  await page.click('button:has-text("make it")');

  // Wait for the SSE stream to drive navigation to /preview (which is the
  // user-visible "done" of the fixture-mode hero flow — preview shows the
  // generated tools + Claude Desktop config block awaits 1 click on /deploy).
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: 60_000 });

  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(60_000);
});
