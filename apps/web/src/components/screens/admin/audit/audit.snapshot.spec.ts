// apps/web/src/components/screens/admin/audit/audit.snapshot.spec.ts
//
// Phase 3 / C4-audit — Playwright visual snapshot at 1280 width.
//
// Per Phase 3 agent brief ("Common rules for ALL admin agents"):
//   "Tests: snapshot at 1280 width is enough for admin (no mobile
//    responsiveness audit per Phase 5 brief)."
//
// The route is gated by `ui_admin_panel_perm` (default OFF) at the
// page level. With the flag OFF the snapshot will capture the 404
// boundary; flipping the flag ON in Flipt during Phase 5 visual lock
// makes this test capture the real audit screen against the canon
// baseline. We keep the test enabled either way — Phase 5 owns the
// flag flip.

import { expect, test } from '@playwright/test';

test('admin-audit @ desktop matches canon baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin/audit');
  await page.waitForLoadState('networkidle');
  expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
    name: 'admin-audit-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
