// apps/web/src/components/screens/settings/settings.snapshot.spec.ts
//
// Phase 2 — Settings — visual snapshots at 4 viewports × 2 flag profiles.
//
// The /settings route is auth-gated via Logto + middleware /settings(/*),
// AND each section is gated by a `_perm` flag. The two profiles are:
//
//   default — the production default flag posture (profile / security /
//             usage / danger-delete ON, everything else OFF). Renders 4
//             sections + 4 sidebar entries.
//   all-on  — ops have flipped every `ui_settings_*_perm` to ON (e.g. for
//             internal demo). Renders 9 sections + 9 sidebar entries with
//             PreviewBanner on flag-OFF-by-default sections.
//
// Boot mode: web is already running on :3000 (matches billing.snapshot
// pattern). Sign-in (Logto) is required by the route; in CI the
// `MCPGEN_FLAG_OVERRIDES_ON` env var on the e2e environment + a test-mode
// session cookie expose the route. When run locally without that, this
// spec will redirect to the Logto sign-in URL — the same behaviour as
// /dashboard / /billing snapshots.
//
// 4 viewports × 2 profiles = 8 baselines. Threshold: 0.5%
// (`maxDiffPixelRatio: 0.005`) per the brief.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

const PROFILES = [
  // The route under default flags. PROFILE OF ENV: profile / security /
  // usage / danger-delete ON, everything else OFF.
  { id: 'default', flags: 'default' as const },
  // The route under all flags ON. Achieved in CI by setting
  // MCPGEN_FLAG_OVERRIDES_ON to the comma-joined list of
  // `ui_settings_*_perm` flag keys.
  { id: 'allon', flags: 'all-on' as const },
];

for (const profile of PROFILES) {
  for (const { w, name } of VIEWPORTS) {
    test(`settings @ ${name} (${w}w · ${profile.id}) matches canon baseline`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 1080 });
      await page.goto('http://localhost:3000/settings');
      await page.waitForLoadState('networkidle');

      const screenshot = await page.screenshot({ fullPage: true });
      expect(screenshot).toMatchSnapshot({
        name: `settings-${profile.id}-${w}.png`,
        maxDiffPixelRatio: 0.005,
      });
    });
  }
}
