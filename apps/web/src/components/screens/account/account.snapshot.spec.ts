// apps/web/src/components/screens/account/account.snapshot.spec.ts
//
// Phase Frontend Rebuild — AccountScreen visual snapshots.
// 4 viewports × 4 modes = 16 baselines.
//
// Boot mode: dev server runs on :3000 (Phase brief instruction).
// All 8 account-related flags must be ON in the test environment so the
// magic / forgot routes don't 404 and the SSO buttons render.
// `MCPGEN_FLAG_OVERRIDES_ON` (see apps/web/src/lib/flags/index.ts) flips the
// gate at the eval boundary without mutating Flipt YAML.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

const MODES = [
  { mode: 'signin' as const, path: '/sign-in' },
  { mode: 'signup' as const, path: '/sign-up' },
  { mode: 'magic' as const, path: '/sign-in/magic' },
  { mode: 'forgot' as const, path: '/sign-in/forgot' },
];

for (const { mode, path } of MODES) {
  for (const { w, name } of VIEWPORTS) {
    test(`account ${mode} @ ${name} (${w}w) matches canon baseline`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`http://localhost:3000${path}`);
      await page.waitForLoadState('networkidle');

      const screenshot = await page.screenshot({ fullPage: true });
      expect(screenshot).toMatchSnapshot({
        name: `account-${mode}-${w}.png`,
        maxDiffPixelRatio: 0.005,
      });
    });
  }
}
