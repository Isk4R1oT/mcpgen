// apps/web/src/components/screens/admin/servers/servers.snapshot.spec.ts
//
// Phase 3 / C2-servers — Playwright visual snapshot for the admin servers
// screen.
//
// Per the Phase 3 brief (`PHASE-3.md`): admin tests snapshot at 1280 width
// only — the admin shell is desktop-first and not part of the Phase 5
// mobile responsiveness audit. The whole `/admin/*` namespace returns 404
// while `ui_admin_panel_perm=OFF` (production default), so this snapshot
// only runs once that flag is flipped ON in Flipt for the Playwright env
// (otherwise the route renders Next's 404).
//
// Snapshot baseline lives under
// `tests/e2e/__screenshots__/servers.snapshot.spec.ts/` after a successful
// first run with `--update-snapshots`.

import { expect, test } from '@playwright/test';

const VIEWPORT_WIDTH = 1280;

test('admin/servers @ desktop (1280) matches canon baseline', async ({
  page,
}) => {
  await page.setViewportSize({ width: VIEWPORT_WIDTH, height: 900 });
  const response = await page.goto('/admin/servers', {
    waitUntil: 'networkidle',
  });
  // When `ui_admin_panel_perm` is OFF (production default) the route 404s.
  // Treat that as a skip so the snapshot suite stays green pre-launch and
  // only enforces the visual lock once admin is opt-in.
  if (response !== null && response.status() === 404) {
    test.skip(true, 'admin panel flag is OFF; skipping visual lock');
  }
  expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
    name: `admin-servers-${VIEWPORT_WIDTH}.png`,
    maxDiffPixelRatio: 0.005,
  });
});
