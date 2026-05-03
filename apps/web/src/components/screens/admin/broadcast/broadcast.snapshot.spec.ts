// apps/web/src/components/screens/admin/broadcast/broadcast.snapshot.spec.ts
//
// Phase 3 / C4-broadcast — Playwright visual snapshot for the
// BroadcastScreen.
//
// Per PHASE-3 brief ("Tests: snapshot at 1280 width is enough for admin
// (no mobile responsiveness audit per Phase 5 brief)") we capture only
// the 1280 desktop viewport. Admin module is gated by
// `ui_admin_panel_perm=OFF` by default — to refresh baselines, flip the
// flag ON in Flipt and rerun with `--update-snapshots`.

import { expect, test } from '@playwright/test';

test('admin broadcast @ desktop matches canon baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await page.goto('/admin/broadcast', {
    waitUntil: 'networkidle',
  });

  // When `ui_admin_panel_perm=OFF` (default) the route returns 404 and
  // we skip the visual diff — the baseline is captured by Phase 5 visual
  // lock with the flag flipped ON.
  if (response !== null && response.status() === 404) {
    test.skip(
      true,
      'ui_admin_panel_perm=OFF → /admin/broadcast 404; baseline captured during Phase 5 visual lock',
    );
    return;
  }

  expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
    name: 'admin-broadcast-1280.png',
    maxDiffPixelRatio: 0.005,
  });
});
