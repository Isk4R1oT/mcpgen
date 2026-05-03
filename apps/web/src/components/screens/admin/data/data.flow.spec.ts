// apps/web/src/components/screens/admin/data/data.flow.spec.ts
//
// Phase 3 / C2-data — primary user flow.
//
// The data screen's primary interactive surfaces are the catalog rows
// (15 collections sourced from canon `admin-data.jsx`) and the
// header-level admin actions ("refresh" / "export catalog"). Each
// admin action is gated behind a `_perm` flag (default OFF) and falls
// back to a `toast('admin action: not yet wired')` stub, so the flow
// asserts:
//
//   1. The catalog renders 15 collection rows (canon parity).
//   2. The "export catalog" header CTA is visible and clickable;
//      clicking it surfaces the canon stub toast (sonner sets
//      `role="status"` for non-interactive toast bodies).
//
// Boot mode: dev server runs on :3000. Route is gated by
// `ui_admin_panel_perm=OFF` by default → /admin/* returns 404. With the
// flag OFF this spec is a no-op (test.skip) — flip the flag ON in Flipt
// (Phase 5 visual lock procedure) to exercise.

import { expect, test } from '@playwright/test';

test('admin-data renders the canon collections catalog (15 rows)', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/data');
  await page.waitForLoadState('networkidle');

  // If the page returned 404 (flag off) skip — the snapshot spec already
  // documents the dependency.
  const isNotFound = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(isNotFound, 'admin gate flag OFF — skipping flow assertion');

  const rows = page.locator('[data-collection-id]');
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(15);
});

test('admin-data export-catalog CTA fires the not-yet-wired toast stub', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/data');
  await page.waitForLoadState('networkidle');

  const isNotFound = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(isNotFound, 'admin gate flag OFF — skipping flow assertion');

  await page.locator('button', { hasText: /export catalog/i }).click();
  // Sonner toasts are queued under role="status" / data-sonner-toast.
  const toast = page.locator('[data-sonner-toast]', {
    hasText: /admin action: not yet wired/i,
  });
  await expect(toast).toBeVisible({ timeout: 4_000 });
});
