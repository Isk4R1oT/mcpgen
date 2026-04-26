// apps/api/src/instrumentation.ts
//
// Sentry SDK init for the Hono BFF on CF Workers (FND-10 / D-19).
// Phase 1: SENTRY_DSN may be empty — withSentry MUST NOT crash on empty DSN.
// Phase 9 fills DSN per environment.
//
// @sentry/cloudflare uses withSentry(envCallback, handler) — there is no
// top-level Sentry.init() on the Workers runtime. The handler returned by
// withSentry replaces the Worker's default export.
//
// beforeSend redaction (architecture.md §11 + Pitfall #12): never log spec
// content, upstream auth credentials, or sensitive headers.

import { withSentry } from '@sentry/cloudflare';

export interface SentryEnv {
  readonly SENTRY_DSN?: string;
  readonly ENVIRONMENT?: string;
}

/**
 * Build the Sentry options callback (D-19 + Pitfall #12 redaction).
 * Empty DSN is treated as "disabled"; Phase 9 fills DSN per environment.
 */
export function sentryOptionsFor(env: SentryEnv) {
  return {
    dsn: env.SENTRY_DSN ?? '',
    environment: env.ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event: { request?: { headers?: Record<string, string> } }) {
      const headers = event.request?.headers;
      if (headers) {
        for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
          if (k in headers) headers[k] = '[REDACTED]';
        }
      }
      return event;
    },
  };
}

// Re-export withSentry so app entry points can wrap their default export with
// `export default withSentry((env) => sentryOptionsFor(env), handler)`.
export { withSentry };
