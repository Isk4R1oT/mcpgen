// apps/web/src/components/screens/admin/overview/overview.snapshot.spec.ts
//
// Phase 3 / C2-overview — visual snapshot at 1280 only.
//
// PHASE-3 brief: "Tests: snapshot at 1280 width is enough for admin (no
// mobile responsiveness audit per Phase 5 brief)."
//
// Boot mode: dev server runs on :3000. The /admin route is gated by
// `ui_admin_panel_perm=OFF` by default → returns 404. To run this spec
// flip the flag ON in Flipt (Phase 5 visual lock procedure) and re-run.
// Until then this spec is structurally complete but the route returns
// 404 → Playwright will fail with "navigation interrupted".

import { expect, test } from '@playwright/test';

test('admin-overview @ desktop (1280w) matches canon baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin');
  await page.waitForLoadState('networkidle');

  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchSnapshot({
    name: 'admin-overview-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
