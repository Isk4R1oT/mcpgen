import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest config for apps/web — Wave 0 unit-test infrastructure.
//
// Environment: jsdom (Phase 7 wires React 19 client components against the
// locked UMD-style harness; jsdom provides a usable window/globalThis without
// running a real browser per RESEARCH "Pattern 1" Note).
//
// Alias `@` → ./src mirrors apps/web/tsconfig.json `paths` so `import { ... }
// from '@/lib/jsx-bridge/loader'` resolves identically in tests and runtime.

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/*.test.ts', 'tests/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
  },
  // React 19 + automatic JSX runtime (apps/web does not import React in every
  // .tsx file because Next 15 + tsconfig.json `jsx: preserve` rely on the
  // automatic runtime). Vitest's esbuild transform needs to be told the same.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
