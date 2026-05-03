// apps/web/src/components/screens/deploy-success/deploy-success.snapshot.spec.ts
//
// Phase 1 / Agent A5 — DeploySuccess visual snapshots at 4 viewports.
//
// Triggers the success view via the `?deployed=1&url=<encoded>` URL state
// machine owned by `_deploy-route-shell.tsx`. See playground.snapshot.spec.ts
// header for fixture-mode boot notes.

import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 375, name: 'mobile' as const },
  { w: 768, name: 'tablet' as const },
  { w: 1280, name: 'desktop' as const },
  { w: 1920, name: 'wide' as const },
];

const FIXTURE_JOB = 'job-fixture-success';
const FIXTURE_URL = 'https://lumen-mcp-abc123.mcpgen.app/mcp';

for (const { w, name } of VIEWPORTS) {
  test(`deploy-success @ ${name} (${w}w) matches canon baseline`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(
      `http://localhost:3000/generate/${FIXTURE_JOB}/deploy?deployed=1&url=${encodeURIComponent(FIXTURE_URL)}`,
    );
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot({
      name: `success-${w}.png`,
      maxDiffPixelRatio: 0.005,
    });
  });
}
