// apps/web/src/components/screens/playground/playground.snapshot.spec.ts
//
// Phase 1 / Agent A5 — Playground visual snapshots at 4 viewports.
//
// Compares against the canon ground truth in
// `claude-design-reference/visual-baseline/playground-{375,768,1280,1920}.png`.
// The Playwright `toMatchSnapshot` baseline lives there; this spec just
// boots the new screen and asserts the diff stays under the SHARED-BRIEF
// threshold (≤0.5% pixel ratio).
//
// Boot mode: dev server already running on :3000 (Phase-1 brief instruction).
// The /generate/<jobId>/playground route is auth-protected — these specs
// rely on fixtures mode (`MCPGEN_FRONTEND_MODE=fixtures`) which short-circuits
// the auth guard. If running outside fixture mode, the page redirects to
// Logto sign-in and the snapshots will fail (expected behaviour).

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

const FIXTURE_JOB = 'job-fixture-playground';

for (const { w, name } of VIEWPORTS) {
  test(`playground @ ${name} (${w}w) matches canon baseline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/playground`);
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `playground-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
