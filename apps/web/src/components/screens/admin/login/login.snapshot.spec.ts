// apps/web/src/components/screens/admin/login/login.snapshot.spec.ts
//
// Phase 3 / C4-login — Playwright visual snapshot for the admin login
// screen.
//
// Per PHASE-3.md "Tests: snapshot at 1280 width is enough for admin (no
// mobile responsiveness audit per Phase 5 brief)." We still exercise all
// four canon viewports (375 / 768 / 1280 / 1920) so the baseline matches
// the rest of the rebuilt screens — admin's two-column grid intentionally
// stays put on narrow viewports (no responsive collapse), and that
// behaviour should be visually pinned.
//
// The page is gated by `ui_admin_panel_perm` (default OFF). Playwright's
// fixture mode flips the flag ON via the env-driven Flipt namespace so
// `/admin/login` renders instead of 404.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' },
  { w: 768, name: 'tablet' },
  { w: 1280, name: 'desktop' },
  { w: 1920, name: 'wide' },
] as const;

for (const { w, name } of VIEWPORTS) {
  test(`admin-login @ ${name} (${w}) matches canon baseline`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');
    // Mute focus styling — click an inert area so no input has focus.
    await page.locator('body').click({ position: { x: 0, y: 0 } });
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot({
      name: `admin-login-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
