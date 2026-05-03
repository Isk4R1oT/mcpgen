// apps/web/src/components/screens/landing/landing.snapshot.spec.ts
//
// Phase 1 / Agent A1 — Landing visual snapshots at 4 viewports.
//
// Compares against the canon ground truth in
// `claude-design-reference/visual-baseline/landing-{375,768,1280,1920}.png`.
// The Playwright `toMatchSnapshot` baseline lives there; this spec just
// boots the new screen and asserts the diff stays under the SHARED-BRIEF
// threshold (≤0.5% pixel ratio).
//
// Boot mode: the dev server is already running on :3000 (Phase-1 brief
// instruction "Web is already running on :3000 — DO NOT restart"); these
// specs are ad-hoc and do not run via the project's `playwright.config.ts`
// webServer block.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

for (const { w, name } of VIEWPORTS) {
  test(`landing @ ${name} (${w}w) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `landing-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
