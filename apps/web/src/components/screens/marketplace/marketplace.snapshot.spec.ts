// apps/web/src/components/screens/marketplace/marketplace.snapshot.spec.ts
//
// Phase 2 / Agent B4 — Marketplace visual snapshots at 4 viewports.
//
// Compares against the canon ground truth in
// `claude-design-reference/visual-baseline/marketplace-{375,768,1280,1920}.png`.
//
// Boot mode: the dev server is already running on :3000. Marketplace is
// flag-gated (`ui_marketplace_perm`, default OFF). Per the brief, flip
// `ui_marketplace_perm=ON` in Flipt for this snapshot run, then back to
// OFF afterward.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

for (const { w, name } of VIEWPORTS) {
  test(`marketplace @ ${name} (${w}w) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('http://localhost:3000/marketplace');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `marketplace-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
