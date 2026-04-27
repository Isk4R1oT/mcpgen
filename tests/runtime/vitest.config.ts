import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@mcpgen/shared-config/vitest';

// Tests in this package live at the repo path tests/runtime/*.test.ts (the
// package itself IS the tests/ folder), so the include pattern is relative to
// the package root and adds top-level *.test.ts in addition to tests/**/.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['*.test.ts', 'tests/**/*.test.ts'],
      // Bun-only tests (require `bun:sqlite`) are excluded from vitest and
      // run via `pnpm test:bun` (bun test runtime).
      exclude: [
        'node_modules/**',
        'dist/**',
        '.turbo/**',
        '**/stored-credentials-aes.test.ts',
        '**/oauth-stub.test.ts',
      ],
    },
  }),
);
