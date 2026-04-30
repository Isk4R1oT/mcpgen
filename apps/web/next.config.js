// apps/web/next.config.js
//
// Wrap Next config with @sentry/nextjs withSentryConfig — uploads source maps
// to private Sentry org during Vercel build (D-19, T-1-07 mitigation).
// Source maps NEVER bundled into the public deploy artifact.
//
// Phase 1: SENTRY_ORG / SENTRY_PROJECT may be empty; upload step becomes a no-op.
// Phase 9 fills these env vars per environment.
//
// Phase 7 Pitfall 6 — DO NOT register the Tailwind 4 PostCSS plugin here. The
// locked apps/web/src/global.css ships with zero `@tailwind` directives — it is
// hand-written CSS-vars populated by `window.MCPTokens.makeCssVars(TWEAK_DEFAULTS)`.
// Activating Tailwind would inject preflight reset CSS that drifts the visual lock
// (FE-05). The `tailwindcss` package is kept as a transitive dep solely to avoid
// pruning resolution churn; it is never instantiated.

import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace deps consumed by apps/web at runtime (Pattern 1 + Pattern 5):
  //   @mcpgen/contracts → HTTP contract Zod schemas + idempotency constants
  //   @mcpgen/ir        → FinalTool / QualityReport schemas (Plan 07-04 preview)
  //   @mcpgen/engine-fixtures → 5-API fixture set for Wave 1 mock-mode SSE replay
  // transpilePackages forces Next's SWC compiler to run on .ts files inside these
  // workspace packages (they ship as raw .ts pointing at ./src/index.ts).
  transpilePackages: ['@mcpgen/contracts', '@mcpgen/ir', '@mcpgen/engine-fixtures'],
  // Plan 07-02 Rule-3 fix — workspace packages use TS NodeNext-style imports
  // (`./foo.js`) which TS resolves to `./foo.ts`. Webpack does not do that by
  // default; extensionAlias maps the runtime `.js` request to the source `.ts`
  // file inside the bundler. Required because @mcpgen/contracts/index.ts does
  // `export * from './generation-api.js';`.
  webpack(config) {
    // eslint-disable-next-line no-param-reassign
    config.resolve = {
      ...(config.resolve ?? {}),
      extensionAlias: {
        ...((config.resolve && config.resolve.extensionAlias) ?? {}),
        '.js': ['.ts', '.tsx', '.js'],
        '.mjs': ['.mts', '.mjs'],
      },
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  // Source maps uploaded to private Sentry org; never bundled in deploy artifact (T-1-07).
});
