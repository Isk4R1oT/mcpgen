// apps/web/src/components/screens/quality/quality.snapshot.spec.ts
//
// Phase 1 — Agent A4 — Playwright visual snapshot at four canon viewports.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

const FIXTURE_JOB_ID = 'job_fixture_quality';

for (const { w, name } of VIEWPORTS) {
  test(`quality @ ${name} matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB_ID}/quality`);
    await page.waitForLoadState('networkidle');
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `quality-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
