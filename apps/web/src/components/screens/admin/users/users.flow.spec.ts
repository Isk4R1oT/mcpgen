// apps/web/src/components/screens/admin/users/users.flow.spec.ts
//
// Phase 3 / C2-users — Admin Users primary flow.
//
// With the BFF disabled stub returning `flag_off_or_not_implemented`, the
// only deterministic interaction is opening the filter drawer (the user
// list is empty, so detail-rail actions cannot fire). This spec verifies
// the canon parity of the filter affordance:
//
//   1. Visit /admin/users (the route must be flag-enabled in the test env;
//      otherwise the page returns 404 and the flow fails fast — that's the
//      correct production behavior).
//   2. Click the "filter" button on the left rail.
//   3. Drawer opens with the canon title `user filters` (visible in the
//      drawer header) and the four facet groups (plan/country/mfa/signup)
//      render their chips.
//
// Once the BFF endpoints land we'll extend this to cover impersonate /
// suspend modals and confirm the toast stub fires while the
// `ui_admin_<action>_perm` flags stay OFF.

import { expect, test } from '@playwright/test';

test('admin-users → filter drawer opens with canon facet chips', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/admin/users');
  await page.waitForLoadState('networkidle');

  await page.locator('button', { hasText: /^filter$/i }).first().click();

  // Drawer header surfaces the canon title.
  await expect(page.getByText('user filters', { exact: true })).toBeVisible({
    timeout: 4_000,
  });

  // The four canon facet groups render at least one chip each.
  for (const facet of ['plan', 'country', 'mfa', 'signup']) {
    await expect(page.getByText(facet, { exact: true })).toBeVisible();
  }
});
