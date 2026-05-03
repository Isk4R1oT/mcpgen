// apps/web/src/components/screens/server-detail/server-detail.flow.spec.ts
//
// Phase 2 / Agent B4 — ServerDetail user-flow E2E.
//
// Verifies:
//   - Route renders the canon hero + "coming soon" disabled-stub banner.
//   - Tabs are clickable; switching to "tools" surfaces the tool list.
//   - Install button (default flag OFF) toasts the "Coming soon" copy.
//
// Requires `ui_marketplace_perm` flipped ON in Flipt for the run.

import { expect, test } from '@playwright/test';

const FIXTURE_ID = 'stripe-official';

test('server-detail → render + tab switch + install toast', async ({ page }) => {
  await page.goto(`http://localhost:3000/marketplace/${FIXTURE_ID}`);
  await page.waitForLoadState('networkidle');

  // Canon hero name (canon stub fallback while BFF is dark).
  await expect(page.locator('.mc-display-l')).toContainText('stripe-mcp');

  // Disabled-stub banner present.
  await expect(page.getByTestId('marketplace-server-stub')).toBeVisible();

  // Click the "tools" tab — canon list rows surface.
  await page.getByRole('button', { name: /tools/i }).first().click();
  await expect(page.getByText('create_charge')).toBeVisible();

  // Click "install" (header). Default flag → toast "Coming soon".
  await page.getByRole('button', { name: /^install$/i }).first().click();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
});
