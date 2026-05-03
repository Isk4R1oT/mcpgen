// vitest.uikit.config.ts — F-UIKit verification harness.
//
// Phase 0 / F-UIKit: a separate Vitest config used ONLY for verifying the
// `src/components/ui/__tests__/**` suite. The base `vitest.config.ts` is owned
// by Phase 0 F-Tokens and must remain untouched. Vite 5.4's PostCSS loader
// fails on the string-form plugin reference in `apps/web/postcss.config.mjs`
// (`Invalid PostCSS Plugin found at plugins[0]`) — that production-only
// PostCSS config is consumed by Next.js without issue, but Vitest's bundled
// Vite blows up before any test file is collected. Disabling CSS handling
// in this verification harness lets jsdom render React components and assert
// their `className` strings (which is all the F-UIKit tests need) without
// touching the locked Phase 0 surface.
//
// Usage: `pnpm vitest run --config vitest.uikit.config.ts`
// All other test files are excluded; primitives are the only target.

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: [
      'src/components/ui/__tests__/**/*.test.ts',
      'src/components/ui/__tests__/**/*.test.tsx',
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
  },
  esbuild: {
    jsx: 'automatic',
  },
  // Disable Vite's PostCSS pipeline for the test runner. We assert canon
  // classes as className strings — no real CSS is processed in jsdom.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
