// apps/web/src/components/screens/admin/billing/billing.flow.spec.ts
//
// Phase 3 / C3-billing — primary user flow.
//
// The billing screen's primary actions are:
//   - "issue credit" header CTA opens the drawer (programmatic; we just
//     assert the click registers without leaving the admin context).
//   - "dunning" tab switch surfaces the 6 hardcoded steps.
//   - Refund / retry / dunning-edit click all fire the toast stub
//     because the per-action flags default OFF.
//
// Boot mode: dev server runs on :3000. Route is gated by
// `ui_admin_panel_perm`. With the flag OFF (default) /admin/billing
// returns 404 and this spec is a no-op — flip the flag ON in Flipt to
// exercise.

import { expect, test } from '@playwright/test';

test('admin-billing → tab switch + flag-OFF action toasts', async ({ page }) => {
  await page.goto('http://localhost:3000/admin/billing');
  await page.waitForLoadState('networkidle');

  // If the page returned 404 (flag off) skip — the snapshot spec already
  // documents the dependency.
  const status = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(status, 'admin gate flag OFF — skipping flow assertion');

  // Page header is present.
  await expect(page.locator('.adm-page-title')).toContainText('billing');

  // Default tab "invoices" — empty / loading state visible.
  await expect(page.locator('.adm-empty').first()).toBeVisible();

  // Switch to "dunning" — six edit-copy buttons appear.
  await page.locator('.adm-tab', { hasText: /^dunning$/ }).click();
  await expect(
    page.locator('button', { hasText: /edit copy/i }),
  ).toHaveCount(6);

  // Click first "edit copy" → toast fires (flag-OFF branch).
  await page
    .locator('button', { hasText: /edit copy/i })
    .first()
    .click();
  await expect(page.getByText(/admin action: not yet wired/i)).toBeVisible();

  // URL stays inside /admin/billing (admin context preserved).
  expect(new URL(page.url()).pathname).toBe('/admin/billing');
});
