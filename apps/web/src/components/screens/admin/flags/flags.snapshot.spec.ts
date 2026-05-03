// apps/web/src/components/screens/admin/flags/flags.snapshot.spec.ts
//
// Phase 3 / C3-flags — admin flags screen visual snapshot.
//
// Per PHASE-3.md: "Tests: snapshot at 1280 width is enough for admin (no
// mobile responsiveness audit per Phase 5 brief)." We capture a single
// 1280-wide screenshot of the rendered flags screen.
//
// Boot mode: dev server is on :3000 in fixtures mode. The route is double-
// gated:
//   1. `ui_admin_panel_perm` (default OFF) — must be flipped ON before run.
//   2. Logto admin role check — fixtures-mode auth simulates an admin user.
// When either gate is OFF the route returns 404 and the snapshot run will
// fail loudly (no silent fallback).

import { expect, test } from '@playwright/test';

test('admin-flags @ desktop (1280w) matches canon baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin/flags');
  await page.waitForLoadState('networkidle');

  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchSnapshot({
    name: 'admin-flags-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
