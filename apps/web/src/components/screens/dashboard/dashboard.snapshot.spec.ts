// apps/web/src/components/screens/dashboard/dashboard.snapshot.spec.ts
//
// Phase 2 / Agent B2 — Playwright visual snapshot at 4 viewports for the
// single-server Dashboard screen. Compares the rendered
// `/dashboard/[id]` route against the canon visual baseline at ≤0.5%
// pixel-diff threshold. Runs against fixture-mode dev server
// (MCPGEN_FRONTEND_MODE=fixtures) so deployments + drift events are
// deterministic — no LLM call fires.
//
// Snapshot baselines are committed under
// `tests/e2e/__screenshots__/dashboard.snapshot.spec.ts/` after the first
// successful run with `--update-snapshots`.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

const FIXTURE_DEPLOYMENT_ID = 'fixture-deployment';

for (const { w, name } of VIEWPORTS) {
  test(`dashboard @ ${name} (${w}) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`/dashboard/${FIXTURE_DEPLOYMENT_ID}`);
    await page.waitForLoadState('networkidle');
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `dashboard-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
