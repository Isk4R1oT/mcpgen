import { defineConfig, devices } from '@playwright/test';

// apps/web/playwright.config.ts — Phase 7 Wave 0 e2e infrastructure.
//
// CONTEXT D-04 — visual-lock screenshot diff threshold ≤0.1% pixel delta:
//   maxDiffPixelRatio: 0.001
//
// Webserver runs in fixture mode (MCPGEN_FRONTEND_MODE=fixtures) so SSE
// timelines and BFF responses are deterministic — no flake from real network.
// Plans 07-02 / 07-03 fill the test bodies; Plan 07-01 only ships the config
// and the test.skip(...) stubs.

const isCI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // exactOptionalPropertyTypes: true — only set `workers` when isCI is true.
  ...(isCI ? { workers: 1 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // ≤0.1% pixel delta acceptance per CONTEXT D-04
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
