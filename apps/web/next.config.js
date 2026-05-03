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

// POST-09.1 patch: dev-mode rewrites proxy /api/v1/* → BFF on :8787.
// Without this, browser fetch('/api/v1/...') from useGenerationSSE +
// submitGeneration hits Next.js dev server (3002) which 404s, breaking the
// live SSE stream. /api/auth/* stays on Next.js (Logto server actions).
// Production uses Vercel + Cloudflare path routing at the edge, so this
// rewrite is dev-affinity-only.
//
// MCPGEN_BFF_URL may be set with OR without the trailing `/api/v1` segment
// (different consumers in apps/web/src/lib/* expect different shapes). The
// rewrite re-appends `/api/v1/:path*`, so we must strip a trailing `/api/v1`
// from the env value to avoid producing `…/api/v1/api/v1/generate` — which
// the BFF treats as "unknown route" and routes into the auth-protected
// catch-all, returning 401. (Reported by E2E-FINDINGS-agent-b.)
const RAW_BFF_URL = process.env.MCPGEN_BFF_URL || 'http://localhost:8787';
const BFF_PROXY_TARGET = RAW_BFF_URL.replace(/\/api\/v1\/?$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // POST-09.1 patch: Next.js dev server gzip-compresses every response by
  // default, which buffers SSE chunks until the gzip window fills (~16 KB)
  // and breaks streaming for fetch-based EventSource consumers (the engine's
  // per-stage events are ~250 bytes each — they never accumulate enough to
  // trigger a flush mid-pipeline). The browser saw `sse: streaming` but no
  // events until the entire 2-3 minute pipeline finished. Disabling compress
  // restores immediate chunk delivery; production gzip belongs at the CDN
  // edge (Vercel handles it for non-SSE routes automatically).
  compress: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/v1/:path*',
          destination: `${BFF_PROXY_TARGET}/api/v1/:path*`,
        },
      ],
    };
  },
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
