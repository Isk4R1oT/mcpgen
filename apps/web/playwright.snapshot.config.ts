import { defineConfig, devices } from '@playwright/test';

// apps/web/playwright.snapshot.config.ts — Phase 5 Agent E1 visual-lock gate.
//
// PURPOSE
// -------
// Dedicated Playwright config that runs ONLY the per-screen `*.snapshot.spec.ts`
// suites at the four canon viewports (375 / 768 / 1280 / 1920). Pixel diff
// threshold is hard-pinned at ≤0.5% (`maxDiffPixelRatio: 0.005`) — anything
// over that fails the gate and blocks merge.
//
// Each screen owns its own snapshot spec at
// `src/components/screens/<screen>/<screen>.snapshot.spec.ts` (and the admin
// sub-screens under `src/components/screens/admin/<sub>/<sub>.snapshot.spec.ts`).
// Baselines are stored alongside the spec under
// `<spec>.ts-snapshots/<name>-<viewport>-<browser>-<platform>.png`.
//
// CI invokes this config via `pnpm test:snapshots`. The CI workflow (see
// `.github/workflows/visual-lock.yml`) flips `_perm` flags ON via Flipt
// before running so the gated /admin, /marketplace, /billing routes are
// reachable.
//
// SUB-PIXEL ANTI-ALIAS NOTES
// --------------------------
//   - Fonts loaded via Next's font system can race with first-paint;
//     each spec calls `page.waitForLoadState('networkidle')` to let
//     fonts settle before screenshot.
//   - Animated content (toasts, drift dots, progress sparklines) should
//     be masked with `expect.toHaveScreenshot({ mask: [...] })` in the
//     individual spec. The default config does NOT mask globally because
//     screens vary in dynamic regions.
//   - Headless Chromium is pinned via the project's `@playwright/test`
//     version in package.json; the CI workflow re-pins via the lockfile.

const isCI = process.env['CI'] !== undefined;

export default defineConfig({
  // Per-screen snapshot specs only. Admin sub-screens live under nested
  // directories so the glob matches both `<screen>/<screen>.snapshot.spec.ts`
  // and `admin/<sub>/<sub>.snapshot.spec.ts`.
  testDir: 'src/components/screens',
  testMatch: ['**/*.snapshot.spec.ts'],

  // Visual-lock runs serially in CI — multiple workers cause font-load
  // races on cold dev server boot and produce flaky baselines. Locally,
  // we still parallelize because the screens are independent.
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? [['list'], ['github']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Hard threshold per Phase 5 brief — > 0.5% pixel diff blocks merge.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      // Match `expect(buffer).toMatchSnapshot(...)` users by default; per-spec
      // overrides win when set explicitly.
      animations: 'disabled',
      caret: 'hide',
    },
  },

  // The CI workflow boots the stack (web + BFF + engine + Flipt) outside
  // Playwright so that Flipt flag toggles can run between boot and the
  // snapshot suite. Locally, `reuseExistingServer: true` keeps a hand-run
  // dev server warm.
  webServer: {
    command: 'MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web start',
    port: 3000,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
