// apps/web/src/components/screens/admin/content/content.flow.spec.ts
//
// Phase 3 / C4-content — Playwright user-flow E2E.
//
// Verifies:
//   1. Tab strip switches body content (docs → email → in-app).
//   2. Header CTAs ("history", "+ new") fire toast stubs without
//      navigation (they remain inside admin context per PHASE-3 brief
//      "Admin shell must NOT redirect to non-admin pages on action").
//
// Admin routes are gated by `ui_admin_panel_perm` at the middleware level.
// To run this suite locally flip the flag ON in Flipt (per PHASE-3 brief).

import { expect, test } from '@playwright/test';

test('admin-content: docs → email tab switch swaps body', async ({ page }) => {
  await page.goto('/admin/content');
  await page.waitForLoadState('networkidle');

  // Default tab = docs → see canon doc paths.
  await expect(page.getByText('/docs/quickstart')).toBeVisible();

  // Click email tab.
  await page.locator('.adm-tab', { hasText: /^email$/ }).click();
  // Email preview heading shows up.
  await expect(page.getByText(/preview · payment-failed/)).toBeVisible();
  // Canon variable placeholder is rendered.
  await expect(page.getByText('{{first_name}}', { exact: false })).toBeVisible();
});

test('admin-content: in-app tab shows preview-only empty state', async ({ page }) => {
  await page.goto('/admin/content');
  await page.waitForLoadState('networkidle');

  await page.locator('.adm-tab', { hasText: /^in-app$/ }).click();
  await expect(page.locator('.adm-empty')).toContainText('in-app — preview only');
});

test('admin-content: header CTAs stay inside admin context', async ({ page }) => {
  await page.goto('/admin/content');
  await page.waitForLoadState('networkidle');

  await page.locator('button', { hasText: /^history$/ }).click();
  // URL must remain on /admin/content — no navigation away.
  expect(page.url()).toMatch(/\/admin\/content$/);

  await page.locator('button', { hasText: /^\+ new$/ }).click();
  expect(page.url()).toMatch(/\/admin\/content$/);
});
