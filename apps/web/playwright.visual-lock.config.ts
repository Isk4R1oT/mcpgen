import { defineConfig, devices } from '@playwright/test';

// apps/web/playwright.visual-lock.config.ts — separate config for visual-lock
// screenshot diff suite (FE-05 + CONTEXT D-04). Same maxDiffPixelRatio: 0.001
// as the base config but a different testDir + snapshot directory so
// `pnpm test:visual` only runs the visual-lock specs.
//
// Baseline screenshots are committed in tests/visual-lock/__screenshots__/
// (the directory is tracked via .gitkeep until Plan 07-02 / 07-03 fills the
// 9-screens.spec.ts body and captures the baseline).

export default defineConfig({
  testDir: 'tests/visual-lock',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:3000',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
    },
  },
  webServer: {
    command: 'MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web start',
    port: 3000,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
