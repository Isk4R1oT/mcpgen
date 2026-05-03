// apps/web/src/components/screens/admin/llm/llm.flow.spec.ts
//
// Phase 3 / Agent C3-llm — primary user-flow coverage for `/admin/llm`.
//
// Two flows:
//   1. Tab switching: routing → evals → preview-only-empty.
//   2. Header CTA: clicking "run eval" surfaces a toast (real or stub).
//
// The route is gated by `ui_admin_panel_perm` (default OFF → 404) plus
// the Logto admin role. We skip unless `RUN_ADMIN_SNAPSHOTS=1` so the
// test only runs when the staff panel is intentionally exposed (same
// pre-conditions as the snapshot spec).

import { expect, test } from '@playwright/test';

const RUN = process.env['RUN_ADMIN_SNAPSHOTS'] === '1';

test.describe('admin-llm flows', () => {
  test.skip(!RUN, 'admin route is flag-gated; set RUN_ADMIN_SNAPSHOTS=1 to run');

  test('tab strip switches routing → evals → rate-limits empty state', async ({
    page,
  }) => {
    await page.goto('http://localhost:3000/admin/llm');
    await page.waitForLoadState('networkidle');

    // Routing tab is the default — provider mix card is unique to it.
    await expect(page.getByText('provider mix · 24h')).toBeVisible();

    await page.locator('.adm-tab', { hasText: 'evals' }).click();
    await expect(page.getByText('recent eval runs')).toBeVisible();

    await page.locator('.adm-tab', { hasText: 'rate-limits' }).click();
    await expect(page.locator('.adm-empty')).toContainText(
      'rate-limits — preview only',
    );
  });

  test('"run eval" CTA surfaces a toast (stub when flag OFF)', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/llm');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: /run eval/i }).click();

    // Either the live message or the OFF-branch stub is acceptable —
    // the contract is that *some* toast surfaces, never silent failure.
    await expect(
      page.locator(
        '[data-sonner-toast], [role="status"], .toast, [data-testid="toast"]',
      ),
    ).toBeVisible({ timeout: 4_000 });
  });
});
