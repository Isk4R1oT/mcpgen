// apps/web/src/components/screens/admin/deploys/deploys.snapshot.spec.ts
//
// Phase 3 / C3-deploys — Playwright visual snapshot.
//
// Per PHASE-3.md "Common rules for ALL admin agents": admin sub-screens use
// a single snapshot at 1280 width (no mobile responsiveness audit per the
// Phase 5 brief). The /admin/deploys route is double-gated by
// `ui_admin_panel_perm` (default OFF) + Logto admin role. To capture the
// baseline locally:
//
//   FLIPT_BOOT=ON ui_admin_panel_perm=on \
//   pnpm playwright test src/components/screens/admin/deploys -u
//
// In CI (where the flag stays OFF) the page renders 404 — the snapshot is
// captured against the baseline that was committed when the flag was
// flipped during Phase 5 visual lock.

import { expect, test } from '@playwright/test';

test('admin-deploys @ desktop (1280) matches canon baseline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin/deploys');
  await page.waitForLoadState('networkidle');

  expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
    name: 'admin-deploys-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
