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
// production globals.css ships with zero `@tailwind` directives — it is
// hand-written CSS-vars under `:root`. Activating Tailwind would inject
// preflight reset CSS that drifts the visual lock (FE-05). The `tailwindcss`
// package is kept as a transitive dep solely to avoid pruning resolution
// churn; it is never instantiated.

import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// Phase F-i18n — next-intl plugin wraps the Next config so the framework
// auto-loads ./src/i18n/request.ts on every request, providing the
// resolved locale + messages to NextIntlClientProvider in app/layout.tsx
// and to useTranslations() in client components.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// BUG-006 fix (2026-05-05): the prior `beforeFiles` rewrite that forwarded
// `/api/v1/*` directly to the BFF on :8787 has been REMOVED. It bypassed
// the Next.js App Router file-based handlers entirely — even authed
// endpoints with explicit `apps/web/src/app/api/v1/.../route.ts` files
// never executed — so every browser-side fetch reached the BFF without
// `Authorization: Bearer <jwt>` and got 401 missing_bearer.
//
// Replacement: a catch-all `apps/web/src/app/api/v1/[...path]/route.ts`
// that runs `proxyToBff` (which bridges the encrypted Logto session cookie
// to a Bearer token via `@logto/next/server-actions.getAccessToken`).
// Explicit handlers for `/api/v1/generate`, `/api/v1/deployments`,
// `/api/v1/jobs/[jobId]/*` etc. retain their own business logic
// (idempotency-key validation, fixture mode, SSE streaming) and continue
// to win precedence over the catch-all per Next.js routing rules
// (explicit static > dynamic > catch-all).

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

// Plugin order: next-intl first (it injects the request-config alias used by
// the runtime), then Sentry (it patches the build to upload source maps).
// Both wrappers compose by accepting and returning a Next config object.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  // Source maps uploaded to private Sentry org; never bundled in deploy artifact (T-1-07).
});
