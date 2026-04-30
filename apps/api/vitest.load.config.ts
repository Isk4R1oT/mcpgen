// apps/api/vitest.load.config.ts
//
// CTRL-08 / D-16 / Pitfall #19: load-test vitest config with extended
// timeout for the Neon OOM repro test.
//
// Per RESEARCH §A15: vitest's default test timeout is 5 s; D-16 needs
// ≥10 min sustained concurrent SQL workload. Separate config so:
//   1. `pnpm --filter @mcpgen/api test` (default config) stays fast and
//      doesn't accidentally include the slow load test in CI runs.
//   2. `pnpm --filter @mcpgen/api test:load` uses this config and only
//      runs `tests/load/**/*.test.ts` with the 600 000 ms timeout.
//
// The load test itself is also gated behind `RUN_LOAD_TESTS=1` env so
// the "describe" suite is skipped entirely when the operator hasn't
// opted in (matches the leak-audit / drift-email-rate-limit gate
// patterns).
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-16, D-17
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"test_neon_oom_replication.test.ts"

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/load/**/*.test.ts'],
    environment: 'node',
    // 10 minutes — covers the full sustained concurrent SQL workload
    // while keeping a hard ceiling so a hung test cannot block CI.
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
});
