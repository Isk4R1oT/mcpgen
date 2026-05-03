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
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/*.test.ts',
      'tests/*.test.tsx',
      // Phase Rebuild / F-Tokens — co-locate styling tests with their module.
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      // Phase 1+ screen rebuild — co-located unit smokes inside
      // `src/components/screens/<screen>/<screen>.test.tsx` per the
      // SHARED-BRIEF.md "Outputs you write" layout. Each Phase-1 agent
      // (A1–A5) drops one of these next to its screen module.
      'src/components/screens/**/*.test.ts',
      'src/components/screens/**/*.test.tsx',
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    // Skip PostCSS processing for CSS imports inside the unit-test pipeline.
    // Tailwind 4's `@tailwindcss/postcss` plugin loads fine via Next.js's
    // build but vite's PostCSS loader rejects the string-form plugin entry,
    // throwing `Invalid PostCSS Plugin found at: plugins[0]`. Tests don't
    // need Tailwind output (we assert on canon `mc-*` class names, not
    // computed styles), so disabling CSS transforms is the cheap fix.
    css: false,
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
  // Override the project's PostCSS pipeline for tests. The Tailwind 4
  // `@tailwindcss/postcss` string-plugin entry in `apps/web/postcss.config.mjs`
  // is interpreted fine by Next.js's PostCSS runner but Vite's loader rejects
  // it (`Invalid PostCSS Plugin found at: plugins[0]`). Tests don't depend on
  // Tailwind output — we assert on canon `mc-*` class names, never computed
  // styles — so we hand vitest an empty plugin list.
  css: {
    postcss: { plugins: [] },
  },
});
