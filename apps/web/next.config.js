// apps/web/next.config.js
//
// Wrap Next config with @sentry/nextjs withSentryConfig — uploads source maps
// to private Sentry org during Vercel build (D-19, T-1-07 mitigation).
// Source maps NEVER bundled into the public deploy artifact.
//
// Phase 1: SENTRY_ORG / SENTRY_PROJECT may be empty; upload step becomes a no-op.
// Phase 9 fills these env vars per environment.

import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  // Source maps uploaded to private Sentry org; never bundled in deploy artifact (T-1-07).
});
