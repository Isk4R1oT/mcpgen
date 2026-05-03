// apps/web/src/components/screens/admin/marketplace/marketplace.flow.spec.ts
//
// Phase 3 / C3-marketplace — primary user-flow coverage for
// `/admin/marketplace`.
//
// Three flows:
//   1. Tab switching: queue → reports → categories empty state.
//   2. "filters" CTA opens the right-edge drawer (canon copy).
//   3. "reject" CTA mounts the takedown modal (4-eyes hint visible).
//
// The route is gated by `ui_admin_panel_perm` (default OFF → 404) plus
// the Logto admin role. We skip unless `RUN_ADMIN_SNAPSHOTS=1` so the
// test only runs when the staff panel is intentionally exposed (same
// pre-conditions as the snapshot spec).

import { expect, test } from '@playwright/test';

const RUN = process.env['RUN_ADMIN_SNAPSHOTS'] === '1';

test.describe('admin-marketplace flows', () => {
  test.skip(
    !RUN,
    'admin route is flag-gated; set RUN_ADMIN_SNAPSHOTS=1 to run',
  );

  test('tab strip switches queue → reports preview-only empty state', async ({
    page,
  }) => {
    await page.goto('http://localhost:3000/admin/marketplace');
    await page.waitForLoadState('networkidle');

    // Queue tab is the default — both "review queue · oldest first" and
    // "auto-checks" SectionLabels are unique to it.
    await expect(page.getByText('review queue · oldest first')).toBeVisible();
    await expect(page.getByText('auto-checks')).toBeVisible();

    await page.locator('.adm-tab', { hasText: 'user reports' }).click();
    await expect(page.locator('.adm-empty')).toContainText(
      'reports — preview only',
    );

    await page.locator('.adm-tab', { hasText: 'categories' }).click();
    await expect(page.locator('.adm-empty')).toContainText(
      'categories — preview only',
    );
  });

  test('"filters" CTA opens the moderation-filters drawer', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/marketplace');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: /^filters$/i }).click();

    // Drawer host renders the title verbatim.
    await expect(page.getByText('moderation filters')).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.getByText('narrow the queue')).toBeVisible();
  });

  test('"reject" CTA mounts the takedown modal with 4-eyes hint', async ({
    page,
  }) => {
    await page.goto('http://localhost:3000/admin/marketplace');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: /^reject$/i }).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('reject ·');
    await expect(dialog).toContainText('requires');
    await expect(dialog).toContainText('2 moderators');
    await expect(
      dialog.locator('button', { hasText: /send & request 4-eyes/i }),
    ).toBeVisible();
  });
});
