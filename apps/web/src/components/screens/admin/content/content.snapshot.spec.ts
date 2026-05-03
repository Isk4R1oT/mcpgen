// apps/web/src/components/screens/admin/content/content.snapshot.spec.ts
//
// Phase 3 / C4-content — Playwright visual snapshot.
//
// Per PHASE-3 brief:
//   "Tests: snapshot at 1280 width is enough for admin (no mobile
//    responsiveness audit per Phase 5 brief)."
//
// Admin routes are gated by `ui_admin_panel_perm` at the middleware level.
// When the flag is OFF (production default) `/admin/*` returns 404 — these
// snapshots are intended to run after Phase 5 visual lock with the flag
// flipped ON in Flipt (per PHASE-3 brief: "to enable admin during Phase 5
// visual lock, set `ui_admin_panel_perm=ON` in Flipt and rerun snapshots").

import { expect, test } from '@playwright/test';

test('admin-content @ desktop (1280) matches canon baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/content');
  await page.waitForLoadState('networkidle');
  // Mute focus styling — click an inert area so no input has focus.
  await page.locator('body').click({ position: { x: 0, y: 0 } });
  expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
    name: 'admin-content-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
