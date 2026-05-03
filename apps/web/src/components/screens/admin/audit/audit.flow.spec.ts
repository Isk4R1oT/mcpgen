// apps/web/src/components/screens/admin/audit/audit.flow.spec.ts
//
// Phase 3 / C4-audit — Playwright user-flow E2E.
//
// Verifies the primary action chain on `/admin/audit`:
//   1. Page loads (or 404s when the admin flag is OFF — see below).
//   2. Clicking the first "view diff" opens the diff modal containing
//      the canon "state diff" header.
//   3. Clicking "close" inside the modal dismisses it.
//
// Gating: the route 404s when `ui_admin_panel_perm` is OFF (default).
// During Phase 5 visual lock the flag is flipped ON in Flipt. To keep
// the test deterministic across both states, we treat a 404 boundary
// as a soft pass — the assertion only fires when the screen renders.

import { expect, test } from '@playwright/test';

test('admin-audit → view diff opens modal and close dismisses it', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/audit');
  await page.waitForLoadState('networkidle');

  // Admin flag OFF (default) → page returns 404. Phase 5 flips the flag
  // in Flipt; only then do the buttons exist.
  const heading = page.getByRole('heading', { name: /audit log/i });
  if ((await heading.count()) === 0) {
    test.skip(true, 'ui_admin_panel_perm OFF — admin/audit returns 404');
    return;
  }

  await page.locator('button', { hasText: /view diff/i }).first().click();
  await expect(page.getByText(/state diff/i)).toBeVisible();
  await page.locator('button', { hasText: /^close$/i }).click();
  await expect(page.getByText(/state diff/i)).toHaveCount(0);
});
