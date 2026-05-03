// apps/web/src/components/screens/dashboard-list/dashboard-list.snapshot.spec.ts
//
// Phase 2 / Agent B2 — Playwright visual snapshot at 4 viewports for the
// multi-server DashboardList screen. Compares the rendered `/dashboard`
// route against the canon `dash-list-*` baseline at ≤0.5% pixel-diff
// threshold. Runs against fixture-mode dev server so deployments are
// deterministic.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

for (const { w, name } of VIEWPORTS) {
  test(`dashboard-list @ ${name} (${w}) matches canon baseline`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `dash-list-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
