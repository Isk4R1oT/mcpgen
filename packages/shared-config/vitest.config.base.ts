import { defineConfig } from 'vitest/config';

// Shared Vitest base configuration for the MCPGen monorepo.
// Consumers extend via:
//   import { mergeConfig, defineConfig } from 'vitest/config';
//   import base from '@mcpgen/shared-config/vitest';
//   export default mergeConfig(base, defineConfig({ /* overrides */ }));
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.turbo/**'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/*.test.ts', 'dist/**'],
    },
  },
});
