// apps/web/src/components/screens/admin/obs/obs.flow.spec.ts
//
// Phase 3 / C4-obs — primary user flow.
//
// The observability screen's primary actions are:
//   1. Tabs — switching between errors / latency / traces / sessions
//      reveals the canon empty state for the non-errors tabs.
//   2. The "silence" button per error row stays inside the admin context
//      (no redirect) — this is the canon "OFF flag" branch wired today.
//
// Boot mode: dev server runs on :3000. Route is gated by
// `ui_admin_panel_perm`. With the flag OFF (default) /admin/obs returns
// 404 and this spec is a no-op — flip the flag ON in Flipt to exercise.

import { expect, test } from '@playwright/test';

test('admin-obs → tabs switch reveals "<tab> — preview only" placeholder', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/obs');
  await page.waitForLoadState('networkidle');

  const status = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(status, 'admin gate flag OFF — skipping flow assertion');

  // Default tab is `errors` — the table is visible.
  await expect(page.locator('text=top error groups')).toBeVisible();

  // Click the "latency" tab.
  await page.locator('.adm-tab', { hasText: /^latency$/ }).click();
  await expect(
    page.locator('.adm-empty', { hasText: /latency — preview only/i }),
  ).toBeVisible();

  // Errors tab again restores the table.
  await page.locator('.adm-tab', { hasText: /^errors$/ }).click();
  await expect(page.locator('text=top error groups')).toBeVisible();
});

test('admin-obs → "silence" CTA stays on the same route (no redirect)', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/obs');
  await page.waitForLoadState('networkidle');

  const status = await page.evaluate(
    () => document.body.textContent?.includes('404') ?? false,
  );
  test.skip(status, 'admin gate flag OFF — skipping flow assertion');

  const beforeUrl = page.url();
  // First "silence" button on the page (canon row 1: UpstreamTimeoutError).
  await page.locator('button', { hasText: /^silence$/ }).first().click();
  // Toast appears, URL unchanged.
  expect(page.url()).toBe(beforeUrl);
});
