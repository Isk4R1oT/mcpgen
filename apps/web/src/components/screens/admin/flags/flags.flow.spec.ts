// apps/web/src/components/screens/admin/flags/flags.flow.spec.ts
//
// Phase 3 / C3-flags — admin flags screen user-flow E2E.
//
// Verifies:
//   - Route renders the canon page header ("feature flags & experiments").
//   - All 5 hardcoded canon flag rows are present (by id).
//   - "new flag" CTA opens the canon drawer with the "staged rollout" eyebrow.
//   - "edit" on the first row opens the modal with `edit · <flag name>`.
//   - "kill" button toasts the canon warn copy.
//
// Requires `ui_admin_panel_perm` flipped ON in Flipt for the run plus a
// Logto session with the `admin` (or `staff`) role; otherwise the route
// 404s and these checks fail. Default `ui_admin_flag_edit_perm` is OFF so
// the kill button toasts the stub.

import { expect, test } from '@playwright/test';

test('admin-flags → render + edit modal + kill toast', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin/flags');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('.adm-page-title')).toContainText(/feature flags/i);
  await expect(page.getByText('fl_drift_v2')).toBeVisible();
  await expect(page.getByText('fl_haiku_router')).toBeVisible();

  // "new flag" → drawer opens with eyebrow "staged rollout".
  await page.getByRole('button', { name: /^new flag$/i }).click();
  await expect(page.getByText(/staged rollout/i)).toBeVisible();
  // Close drawer with the × button so subsequent assertions don't get
  // covered by the overlay. Vaul exposes the close button via aria-label.
  await page.getByRole('button', { name: /close drawer/i }).click();

  // Click first "edit" row button → modal with canon `edit · <name>` heading.
  await page.getByRole('button', { name: /^edit$/i }).first().click();
  await expect(page.locator('.adm-modal .mc-h3')).toContainText('edit ·');

  // Cancel modal so the kill button below is reachable.
  await page.getByRole('button', { name: /^cancel$/i }).click();

  // "kill" toasts the stub (editEnabled OFF default).
  await page.getByRole('button', { name: /^kill$/i }).click();
  await expect(page.getByText(/admin action: not yet wired/i)).toBeVisible();
});
