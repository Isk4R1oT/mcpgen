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

// Phase 8 redaction patterns (T-8-15) — applied to event.request.url + event.message.
// `cus_*` regex captures Stripe customer IDs; `sk_(live|test)_*` captures Stripe API keys;
// `eyJ...` captures JWT-shaped strings (header.payload.signature).
const STRIPE_CUS_RE = /cus_[A-Za-z0-9]{14,}/g;
const STRIPE_SK_RE = /sk_(live|test)_[A-Za-z0-9]{24,}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function redactString(input: string | undefined): string | undefined {
  if (!input) return input;
  return input
    .replace(STRIPE_SK_RE, '[REDACTED_STRIPE_KEY]')
    .replace(STRIPE_CUS_RE, '[REDACTED_STRIPE_CUS]')
    .replace(JWT_RE, '[REDACTED_JWT]');
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
    beforeSend(event: {
      request?: { headers?: Record<string, string>; url?: string };
      message?: string;
    }) {
      // Phase 1: header redaction (Authorization, X-Upstream-Auth, Cookie).
      const headers = event.request?.headers;
      if (headers) {
        for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
          if (k in headers) headers[k] = '[REDACTED]';
        }
      }
      // Phase 8 (T-8-15): regex-redact JWTs / Stripe customer IDs / Stripe API keys
      // from request URL + free-form message (query strings often carry tokens).
      if (event.request?.url) {
        event.request.url = redactString(event.request.url) ?? event.request.url;
      }
      if (event.message) {
        event.message = redactString(event.message) ?? event.message;
      }
      return event;
    },
  };
}

// Re-export withSentry so app entry points can wrap their default export with
// `export default withSentry((env) => sentryOptionsFor(env), handler)`.
export { withSentry };
