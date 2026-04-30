import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Load tests live under tests/load/** and use a separate config
    // (vitest.load.config.ts) with a 10-minute timeout. Excluded here so
    // `pnpm test` stays fast and doesn't accidentally include slow
    // sustained workloads in CI runs. Use `pnpm test:load` to opt in.
    exclude: ['tests/load/**', 'node_modules/**', 'dist/**', '.wrangler/**'],
    environment: 'node',
  },
});
