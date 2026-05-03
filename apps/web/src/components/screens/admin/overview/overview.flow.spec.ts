// apps/web/src/components/screens/admin/overview/overview.flow.spec.ts
//
// Phase 3 / C2-overview — primary user flow.
//
// The overview screen's primary action is navigation to /admin/audit via
// the "open audit log →" link. We assert the link is wired and click
// stays inside the admin context (no redirect to non-admin pages).
//
// Boot mode: dev server runs on :3000. Route is gated by
// `ui_admin_panel_perm`. With the flag OFF (default) /admin returns 404
// and this spec is a no-op — flip the flag ON in Flipt to exercise.

import { expect, test } from '@playwright/test';

test('admin-overview → /admin/audit (open audit log link)', async ({ page }) => {
  await page.goto('http://localhost:3000/admin');
  await page.waitForLoadState('networkidle');

  // If the page returned 404 (flag off) skip — the snapshot spec already
  // documents the dependency.
  const status = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(status, 'admin gate flag OFF — skipping flow assertion');

  await page.locator('a', { hasText: /open audit log/i }).click();
  await page.waitForURL(/\/admin\/audit/, { timeout: 5_000 });
  expect(new URL(page.url()).pathname).toBe('/admin/audit');
});
