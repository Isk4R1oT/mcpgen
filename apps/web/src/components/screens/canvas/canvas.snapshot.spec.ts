// apps/web/src/components/screens/canvas/canvas.snapshot.spec.ts
//
// Phase 1 / A2 — Playwright visual snapshot at 4 viewports for the Canvas screen.
// Compares the rendered /generate route against the canon visual baseline at
// ≤0.5% pixel-diff threshold (per SHARED-BRIEF). Runs against fixture-mode dev
// server (MCPGEN_FRONTEND_MODE=fixtures) so no LLM call fires.
//
// Snapshot baselines committed under
// `tests/e2e/__screenshots__/canvas.snapshot.spec.ts/` after the first
// successful run with `--update-snapshots`.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

for (const { w, name } of VIEWPORTS) {
  test(`canvas @ ${name} (${w}) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    // No `?spec_url` param — auto-submit MUST NOT fire so the canvas renders
    // its canon seed state for snapshot diffing.
    await page.goto('/generate');
    await page.waitForLoadState('networkidle');
    // Mute the autofocus textarea blink — snapshot stability.
    await page.locator('body').click({ position: { x: 0, y: 0 } });
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `canvas-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
