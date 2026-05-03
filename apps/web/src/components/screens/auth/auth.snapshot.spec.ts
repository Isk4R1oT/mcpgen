// apps/web/src/components/screens/auth/auth.snapshot.spec.ts
//
// Phase 2 / B1 — Playwright visual snapshot at the four canon viewports for
// the BACKEND-AUTH probe screen. Compares against the canon visual baseline
// at ≤0.5% pixel-diff (per SHARED-BRIEF.md). Runs against the fixture-mode
// dev server (MCPGEN_FRONTEND_MODE=fixtures, see playwright.config.ts).
//
// Snapshot baselines are committed under
// `tests/e2e/__screenshots__/auth.snapshot.spec.ts/` after the first
// successful run with `--update-snapshots`.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

for (const { w, name } of VIEWPORTS) {
  test(`auth @ ${name} (${w}) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    // Default seed state — apikey · passthrough — matches the canon baseline.
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    // Mute focus styling — click an inert area so no input has focus.
    await page.locator('body').click({ position: { x: 0, y: 0 } });
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `auth-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
