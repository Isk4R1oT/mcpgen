// apps/web/src/components/screens/admin/support/support.snapshot.spec.ts
//
// Phase 3 / C4-support — Visual snapshot at 1280 width.
//
// Phase 3 brief: "snapshot at 1280 width is enough for admin (no mobile
// responsiveness audit per Phase 5 brief)". The admin tree is gated by
// `ui_admin_panel_perm` (default OFF) → /admin/* returns 404 in production
// runs. To capture the visual baseline this spec needs the flag flipped ON
// in the running Flipt instance:
//
//   FLIPT_ENVIRONMENT=ui_lock pnpm flipt:set ui_admin_panel_perm=true
//
// When the flag is OFF this test skips itself rather than recording a 404
// page as the baseline — that prevents accidental "404 is canon" lock-in.
//
// The web server is already running on :3000 (per shared brief) and the
// Logto session has an admin user attached (set up by the C1 lead during
// admin shell bootstrapping).

import { expect, test } from '@playwright/test';

test('admin support @ desktop (1280w) matches canon baseline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await page.goto('http://localhost:3000/admin/support');

  // Skip when the admin flag is OFF — /admin/* 404s in that case and we
  // do NOT want to snapshot a 404 page.
  if (response?.status() === 404) {
    test.skip(
      true,
      'ui_admin_panel_perm flag is OFF — flip ON in Flipt before recording the baseline',
    );
    return;
  }

  // Skip when admin auth redirected the request to /admin/login (no admin
  // session in the test environment). The admin shell is not reachable
  // without an authenticated admin user — capturing the login page as
  // "support" baseline would be misleading. Phase 5 E1 captures only what
  // can render deterministically; admin canon needs a Logto auth fixture
  // (out of scope for the visual-lock CI gate).
  if (page.url().includes('/admin/login')) {
    test.skip(
      true,
      'admin session not present — /admin/support redirected to /admin/login',
    );
    return;
  }

  await page.waitForLoadState('networkidle');
  // Wait for the canon split shell to mount.
  await page.locator('.adm-split').waitFor({ state: 'visible' });

  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchSnapshot({
    name: 'admin-support-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
