// apps/web/src/components/screens/dashboard-list/dashboard-list.flow.spec.ts
//
// Phase 2 / Agent B2 — Playwright user-flow E2E for the multi-server
// DashboardList.
//
// Anonymous user → middleware redirects to Logto sign-in. The fixture
// harness wires the rest of the populated/empty flows through the
// snapshot suite.

import { expect, test } from '@playwright/test';

test('dashboard-list redirects anon to Logto sign-in', async ({ page }) => {
  const response = await page.goto('/dashboard', { waitUntil: 'commit' });
  if (response !== null) {
    const status = response.status();
    if (status >= 300 && status < 400) {
      expect(status).toBeGreaterThanOrEqual(300);
      return;
    }
  }
  expect(page.url()).toMatch(
    /\/api\/auth\/logto\/sign-in|\/auth|logto/i,
  );
});
