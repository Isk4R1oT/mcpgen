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
//
// Phase 9 (D-03): the inline `redactString`/STRIPE_*_RE/JWT_RE patterns were
// promoted to the shared `redactBeforeSend` in
// `@mcpgen/contracts/sentry-redaction` so apps/web, apps/api, apps/dispatch,
// generation-engine, and Stage E template all converge on a single denylist.
// Any future denylist expansion is one PR in @mcpgen/contracts.

import { redactBeforeSend } from '@mcpgen/contracts/sentry-redaction';
import { type CloudflareOptions, withSentry } from '@sentry/cloudflare';

export interface SentryEnv {
  readonly SENTRY_DSN?: string;
  readonly ENVIRONMENT?: string;
}

/**
 * Build the Sentry options callback (D-19 + Pitfall #12 redaction).
 * Empty DSN is treated as "disabled"; Phase 9 fills DSN per environment.
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

// Re-export withSentry so app entry points can wrap their default export with
// `export default withSentry((env) => sentryOptionsFor(env), handler)`.
export { withSentry };
