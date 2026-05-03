// apps/web/src/components/screens/stream/stream.snapshot.spec.ts
//
// Phase 1 Agent A3 — Playwright visual snapshot. Confirms the live Stream
// route at /generate/[jobId] matches the canon baseline at four viewports.
//
// We capture during the early stage of the canon-deterministic animation so
// the screenshot is stable: domcontentloaded + 500ms settle gives the log
// skeleton + first ~step-1 progress increment.
//
// The fixture-mode SSE timeline is what runs under `MCPGEN_FRONTEND_MODE=
// fixtures` (the playwright.config.ts default). The visual lock acceptance
// is ≤0.5% pixel delta per SHARED-BRIEF.md.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

// gen_<ULID> per packages/contracts/src/idempotency.ts:GEN_ID_REGEX. The
// fixture-mode SSE replay hashes this jobId to a deterministic fixture from
// @mcpgen/engine-fixtures (default 'stripe').
const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';

for (const { w, name } of VIEWPORTS) {
  test(`stream @ ${name} matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`http://localhost:3000/generate/${TEST_JOB_ID}`);
    await page.waitForLoadState('domcontentloaded');
    // Settle the canon animation to the first step's mid-tick. The
    // baseline PNGs were captured at this point in the animation.
    await page.waitForTimeout(500);
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `stream-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
