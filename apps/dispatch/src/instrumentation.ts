// apps/dispatch/src/instrumentation.ts
//
// Sentry SDK init for the Dispatch Worker (CTRL-08 / D-03 / Pitfall #3).
// Mirrors apps/api/src/instrumentation.ts shape exactly — Phase 6 wired auth
// + capability gate + smart-ID middleware in apps/dispatch but never wired
// Sentry, leaving the SENTRY_DSN binding orphaned and tenant-routing errors
// invisible.
//
// `@sentry/cloudflare` uses `withSentry(envCallback, handler)` — there is no
// top-level Sentry.init() on the Workers runtime. The handler returned by
// `withSentry` replaces the Worker's default export.
//
// beforeSend redaction (architecture.md §11 + Pitfall #12): consumes the
// shared `redactBeforeSend` from `@mcpgen/contracts/sentry-redaction` so the
// Dispatch Worker stays in lock-step with apps/api / apps/web / generation
// engine / Stage E template denylists.

import { redactBeforeSend } from '@mcpgen/contracts/sentry-redaction';
import { type CloudflareOptions, withSentry } from '@sentry/cloudflare';

export interface SentryEnv {
  readonly SENTRY_DSN?: string;
  readonly ENVIRONMENT?: string;
}

/**
 * Build the Sentry options callback for the Dispatch Worker. Empty DSN is
 * treated as "disabled" (the SDK is a no-op when `dsn === ''`), so this stays
 * safe in local-mode where SENTRY_DSN_DISPATCH may be unset.
 *
 * `redactBeforeSend` is typed against `SentryEventLike` (a structural subset
 * of Sentry's `ErrorEvent`) so it composes cleanly with `CloudflareOptions`
 * via Sentry's structural typing.
 */
export function sentryOptionsFor(env: SentryEnv): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN ?? '',
    environment: env.ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend: (event) => redactBeforeSend(event),
  };
}

// Re-export withSentry so apps/dispatch/src/index.ts can wrap its default
// export with `withSentry((env) => sentryOptionsFor(env), handler)`.
export { withSentry };
