// apps/web/src/components/screens/admin/marketplace/marketplace.snapshot.spec.ts
//
// Phase 3 / C3-marketplace — visual snapshot at desktop width only.
//
// Per the Phase-3 brief common rules: "Tests: snapshot at 1280 width is
// enough for admin (no mobile responsiveness audit per Phase 5 brief)."
//
// The route `/admin/marketplace` is gated by `ui_admin_panel_perm`
// (default OFF → 404). To run this snapshot the flag must be ON in the
// local Flipt instance AND the test browser must carry an authenticated
// Logto session with an admin/staff role. The test is skipped when
// either pre-condition is missing so unrelated CI runs stay green; flip
// `RUN_ADMIN_SNAPSHOTS=1` to enforce the assertion.

import { expect, test } from '@playwright/test';

const RUN = process.env['RUN_ADMIN_SNAPSHOTS'] === '1';

test.describe('admin-marketplace snapshots', () => {
  test.skip(
    !RUN,
    'admin route is flag-gated; set RUN_ADMIN_SNAPSHOTS=1 to run',
  );

  test('admin-marketplace @ desktop (1280w) matches canon baseline', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://localhost:3000/admin/marketplace');
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: 'admin-marketplace-1280.png',
      maxDiffPixelRatio: 0.005,
    });
  });
});
