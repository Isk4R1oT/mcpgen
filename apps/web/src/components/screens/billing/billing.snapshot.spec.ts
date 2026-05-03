// apps/web/src/components/screens/billing/billing.snapshot.spec.ts
//
// Phase 2 — Agent B3 — Billing visual snapshots at 4 viewports.
//
// Compares against the canon ground-truth in
// `claude-design-reference/visual-baseline/billing-{375,768,1280,1920}.png`.
//
// Boot mode: web is already running on :3000 (Phase-2 brief instruction).
// The /billing route is gated by `ui_billing_active_perm`; for these specs
// to render the screen the flag must be ON in the test environment (Phase 0
// foundation provides the dev override). When OFF the route 404s and the
// snapshot test will fail-fast — that's the desired behaviour for prod.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

for (const { w, name } of VIEWPORTS) {
  test(`billing @ ${name} (${w}w) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('http://localhost:3000/billing');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `billing-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
