// apps/web/src/components/screens/admin/deploys/deploys.flow.spec.ts
//
// Phase 3 / C3-deploys — Playwright user-flow E2E.
//
// Verifies the primary admin actions stay inside the admin context (no
// cross-redirect on click) and the canon modals open/close cleanly. The
// route is gated by `ui_admin_panel_perm` (default OFF) + Logto admin
// role; this test runs only when the env has both turned on. Otherwise
// the route 404s and the test is skipped at runtime.

import { expect, test } from '@playwright/test';

test('admin-deploys primary CTAs render and modals open', async ({ page }) => {
  const response = await page.goto('http://localhost:3000/admin/deploys');
  // Skip cleanly when the flag is OFF or the test user is not an admin.
  // The route returns 404 in both cases.
  if (response && response.status() === 404) {
    test.skip(true, 'ui_admin_panel_perm=OFF or user lacks admin role');
    return;
  }
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('deploys & infra')).toBeVisible();
  await expect(
    page.getByText('edge regions, kill switches, recent rollouts.'),
  ).toBeVisible();

  // The 5 hardcoded kill switches are always rendered.
  await expect(page.getByText('accept new signups')).toBeVisible();
  await expect(page.getByText('allow stripe charges')).toBeVisible();

  // Master kill switch modal opens with canon copy.
  await page.getByRole('button', { name: /^kill switch$/i }).click();
  await expect(page.getByText('global kill switch')).toBeVisible();
  await expect(
    page.getByText(/~1\.4M qps will start receiving 503/i),
  ).toBeVisible();

  // Esc button closes the modal — user stays on /admin/deploys.
  await page.getByRole('button', { name: /^esc$/i }).click();
  await expect(page.getByText('global kill switch')).not.toBeVisible();
  expect(page.url()).toMatch(/\/admin\/deploys$/);
});
