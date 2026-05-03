// apps/web/src/components/screens/preview/preview.snapshot.spec.ts
//
// Phase 1 — Agent A4 — Playwright visual snapshot at four canon viewports.
//
// We use a fixture jobId — the dev server is started with
// MCPGEN_FRONTEND_MODE=fixtures (see playwright.config.ts) so the BFF
// returns deterministic stub data. The Preview screen renders its
// canon-locked frame regardless (artifact may be empty in fixtures);
// pixel parity is checked against the canon-blessed baselines.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

const FIXTURE_JOB_ID = 'job_fixture_preview';

for (const { w, name } of VIEWPORTS) {
  test(`preview @ ${name} matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB_ID}/preview`);
    await page.waitForLoadState('networkidle');
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `preview-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
