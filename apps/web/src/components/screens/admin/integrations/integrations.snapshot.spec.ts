// apps/web/src/components/screens/admin/integrations/integrations.snapshot.spec.ts
//
// Phase 3 / C3-integrations — Playwright visual snapshot.
//
// Per the Phase-3 brief common rules: "snapshot at 1280 width is enough for
// admin (no mobile responsiveness audit per Phase 5 brief)."
//
// Pre-conditions:
//   - `ui_admin_panel_perm` flag must be ON in the test environment so the
//     /admin/* surface renders. Default is OFF (404). Phase-5 visual lock
//     flips this in Flipt before re-running snapshots.
//   - Logto session must carry the `admin` (or `staff`) role; the dev
//     fixture in apps/web/.env.test is expected to provide one.
//
// When the gate is closed (default in CI without the override) the test
// will fail-fast on a 404 — that's the intended production behaviour.

import { expect, test } from '@playwright/test';

test('admin-integrations @ desktop (1280w) matches canon baseline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin/integrations');
  await page.waitForLoadState('networkidle');

  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchSnapshot({
    name: 'admin-integrations-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
