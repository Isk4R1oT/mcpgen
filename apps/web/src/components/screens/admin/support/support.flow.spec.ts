// apps/web/src/components/screens/admin/support/support.flow.spec.ts
//
// Phase 3 / C4-support — Primary user-flow E2E.
//
// Verifies (when the admin flag is flipped ON for visual lock):
//   1. Selecting a non-default ticket row updates the detail header.
//   2. Clicking "assign…" with the per-action flag default OFF surfaces
//      the canon "admin action: not yet wired" toast (sonner).
//   3. Clicking the org link in the detail header navigates to /admin/users.
//
// The admin tree is hidden behind `ui_admin_panel_perm` (default OFF). When
// the flag is OFF /admin/* returns 404 and this spec skips itself. Flip the
// flag in Flipt before recording / running the flow snapshot.

import { expect, test } from '@playwright/test';

test('admin support primary flow — select / assign-stub-toast / org link', async ({
  page,
}) => {
  const response = await page.goto('http://localhost:3000/admin/support');
  if (response?.status() === 404) {
    test.skip(true, 'ui_admin_panel_perm flag is OFF — skipping admin flow');
    return;
  }
  await page.waitForLoadState('networkidle');
  await page.locator('.adm-split').waitFor({ state: 'visible' });

  // 1. Select a different ticket row (t_879) and assert the title updates.
  await page.locator('[data-ticket-id="t_879"]').click();
  await expect(page.locator('.adm-page-title')).toContainText(
    /rate-limit feels too aggressive/i,
  );

  // 2. Click the "assign…" header button → stub toast (flag OFF default).
  await page.locator('button', { hasText: /assign/i }).click();
  // Sonner renders into a portal at body level — match the canon copy.
  await expect(
    page.locator('text=admin action: not yet wired').first(),
  ).toBeVisible({ timeout: 5_000 });

  // 3. Click the org link in the detail header → /admin/users.
  await page.locator('.adm-detail-head .adm-link').nth(1).click();
  await page.waitForURL(/\/admin\/users(\?|$)/, { timeout: 5_000 });
  expect(new URL(page.url()).pathname).toBe('/admin/users');
});
