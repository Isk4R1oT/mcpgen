// apps/web/src/lib/sentry/redact.ts
//
// Phase 9 D-03: this file is now a THIN RE-EXPORT SHIM. The redaction logic
// lives in `@mcpgen/contracts/sentry-redaction` (cross-app single source of
// truth: apps/web 3 configs + apps/api + apps/dispatch + generation-engine
// via Python equivalent + Stage E template).
//
// Phase 7 (Plan 07-06) introduced this file to extract the inline beforeSend
// from apps/web/sentry.{client,server,edge}.config.ts. Phase 9 retains the
// SAME public API (`redactSentryEvent`, `REDACTED_HEADERS`, `REDACTED_QUERY_PARAMS`,
// `REDACTION_VALUE`, `SentryEventLike`, `SentryEventRequest`) so the 17 unit
// tests in `apps/web/tests/unit/lib/sentry/redact.test.ts` still pass — but
// the actual scrubbing is delegated to the shared helper.
//
// The web-specific surface (?key= / ?token= query-param scrubbing) is now
// part of the shared helper's denylist (`REDACTED_QUERY_PARAMS` includes
// `key`, `token`, `secret`, `auth`), so the original behaviour is preserved
// AND extended to additional credential-shaped params automatically.

import {
  redactBeforeSend,
  type SentryEventLike as SharedSentryEventLike,
  type SentryEventRequest as SharedSentryEventRequest,
} from '@mcpgen/contracts/sentry-redaction';

/**
 * Headers whose value MUST be replaced with '[REDACTED]' before any Sentry event leaves
 * the process. Frozen for backward-compat with the Phase 7 unit tests; the actual
 * scrubbing covers a SUPERSET of these (set-cookie, stripe-account, stripe-signature,
 * x-webhook-signature, plus the variable `/^x-.*-(auth|token|key|secret)$/i` regex)
 * via `@mcpgen/contracts/sentry-redaction`.
 */
export const REDACTED_HEADERS = ['Authorization', 'X-Upstream-Auth', 'Cookie'] as const;

/**
 * Query-parameter NAMES whose values are scrubbed from `event.request.url`. The shared
 * helper additionally scrubs `secret` and `auth` — this constant is preserved as the
 * public-facing list of what apps/web has ALWAYS scrubbed (Phase 7 contract).
 */
export const REDACTED_QUERY_PARAMS = ['key', 'token'] as const;

/**
 * The literal substituted into redacted fields. Same value as the shared helper's
 * `REDACTION_VALUE` — duplicated here so tests can assert against the exact literal.
 */
export const REDACTION_VALUE = '[REDACTED]' as const;

/** Re-export of the shared structural type, alias-preserved for backward compat. */
export type SentryEventRequest = SharedSentryEventRequest;
export type SentryEventLike = SharedSentryEventLike;

/**
 * Redact sensitive credentials from a Sentry event. Phase 9 — delegates to the shared
 * `redactBeforeSend` from `@mcpgen/contracts/sentry-redaction` so all 4 SDKs converge.
 *
 * Renamed from the shared helper's `redactBeforeSend` to `redactSentryEvent` for
 * backward compat with apps/web/sentry.{client,server,edge}.config.ts.
 */
export function redactSentryEvent<T extends SentryEventLike>(event: T): T {
  return redactBeforeSend(event);
}
