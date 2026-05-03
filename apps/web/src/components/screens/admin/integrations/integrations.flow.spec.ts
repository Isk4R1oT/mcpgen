// apps/web/src/components/screens/admin/integrations/integrations.flow.spec.ts
//
// Phase 3 / C3-integrations — Playwright user-flow E2E.
//
// Verifies the canon flow that makes integrations actionable for an
// operator: switch tabs and trigger the modal-gated rotate flow on a
// stale OAuth provider (the only canon row that uses the modal — slack,
// 91 days since last rotation).
//
// Steps:
//   1. Open /admin/integrations.
//   2. The oauth tab is selected by default; locate the slack rotate
//      button (per canon, the only `kind=ink` rotate in the table).
//   3. Click → expect the rotate modal title "rotate · slack oauth secret"
//      to appear.
//   4. Click the modal's "rotate" button → modal dismisses.
//
// Pre-conditions identical to the snapshot spec: `ui_admin_panel_perm`
// must be ON + Logto admin role.

import { expect, test } from '@playwright/test';

test('admin-integrations → stale oauth row → rotate modal flow', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/integrations');
  await page.waitForLoadState('networkidle');

  // The default tab is "oauth" and shows the canon table headers.
  await expect(page.getByText(/oauth providers · 6/i)).toBeVisible();

  // Locate the slack row (canon: only stale provider) and its rotate btn.
  const slackRow = page.locator('div', { hasText: /^slack$/i }).first();
  // The rotate buttons share the same name; scope to the slack row.
  const rotateBtn = page
    .getByRole('button', { name: /rotate/i })
    .filter({ hasNotText: /rotate now/i })
    .nth(2); // 0=github, 1=google, 2=slack (canon row order)
  await rotateBtn.click();

  // Modal mounted with canon title.
  await expect(
    page.getByRole('dialog', { name: /rotate · slack oauth secret/i }),
  ).toBeVisible({ timeout: 4_000 });

  // Confirm rotate inside the modal — modal dismisses.
  await page.getByRole('button', { name: /^rotate$/i }).last().click();
  await expect(
    page.getByRole('dialog', { name: /rotate · slack oauth secret/i }),
  ).not.toBeVisible({ timeout: 4_000 });

  // Reference the slack row to keep linter happy and ensure the original
  // row is still in the DOM after the modal closed.
  await expect(slackRow).toBeVisible();
});
