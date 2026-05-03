// apps/web/src/components/screens/deploy/deploy.snapshot.spec.ts
//
// Phase 1 / Agent A5 — Deploy visual snapshots at 4 viewports. See
// playground.snapshot.spec.ts header for boot/fixture-mode notes.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

const FIXTURE_JOB = 'job-fixture-deploy';

for (const { w, name } of VIEWPORTS) {
  test(`deploy @ ${name} (${w}w) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/deploy`);
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `deploy-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
