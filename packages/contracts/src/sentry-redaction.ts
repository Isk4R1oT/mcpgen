// packages/contracts/src/sentry-redaction.ts
//
// CTRL-08 / D-03: Single source of truth for Sentry beforeSend redaction.
// Imported by every TS Sentry init: apps/web (3 configs via thin re-export
// shim at apps/web/src/lib/sentry/redact.ts), apps/api, apps/dispatch, and
// Stage E template (sentry_redact.ts.j2).
//
// Cross-language counterpart: apps/generation-engine/src/mcpgen_engine/
// observability/sentry_redaction.py — equivalence enforced by
// `tests/fixtures/leak-vectors.json` consumed by both vitest and pytest.
//
// Type-without-Sentry-import pattern: we intentionally do NOT depend on
// @sentry/types so this module loads cleanly in empty-DSN bootstrap paths
// (per apps/web/src/lib/sentry/redact.ts and apps/api/src/instrumentation.ts).

/**
 * Header keys (lowercase) whose value MUST be replaced before any Sentry event
 * leaves the process. Compared case-insensitively against incoming headers.
 *
 * Phase 9 expansion (D-03): augments Phase 1 set with `set-cookie`,
 * `stripe-account`, `stripe-signature`, `x-webhook-signature` to cover signed
 * webhook surfaces and Stripe Connect account headers.
 */
export const REDACTED_HEADERS: ReadonlySet<string> = new Set<string>([
  'authorization',
  'x-upstream-auth',
  'cookie',
  'set-cookie',
  'stripe-account',
  'stripe-signature',
  'x-webhook-signature',
]);

/**
 * Variable auth header pattern — catches custom headers like `X-Custom-Token`,
 * `X-Service-Auth`, `X-Whatever-Secret` that we cannot enumerate ahead of time.
 */
export const VARIABLE_AUTH_HEADER_RE: RegExp = /^x-.*-(auth|token|key|secret)$/i;

/**
 * Free-form string patterns — applied to `event.message` to scrub credential
 * shapes that may end up in error messages or breadcrumb text.
 */
export const SENSITIVE_STRING_PATTERNS: readonly RegExp[] = [
  /Bearer\s+\S+/g,
  /sk_live_[A-Za-z0-9]{16,}/g,
  /sk_test_[A-Za-z0-9]{16,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

/**
 * Query-parameter NAMES whose values are scrubbed from `event.request.url`.
 * Value is replaced with `[REDACTED]` rather than stripped so URL shape stays
 * preserved for Sentry issue grouping/fingerprinting.
 */
export const REDACTED_QUERY_PARAMS: readonly string[] = ['key', 'token', 'secret', 'auth'];

/**
 * The literal substituted into redacted fields. Stored as a typed constant so
 * tests can pattern-match against the exact value.
 */
export const REDACTION_VALUE = '[REDACTED]' as const;

/**
 * Body keys redacted inside `event.extra` (typed as `unknown` because they may
 * be arbitrarily structured).
 */
const EXTRA_REDACT_KEYS: readonly string[] = ['spec', 'openapi_yaml', 'raw_ir'];

/**
 * Minimal structural type covering the Sentry Event surface this helper
 * touches. We intentionally do NOT depend on @sentry/types (or any Sentry
 * runtime package) so this module is loadable from empty-DSN bootstrap paths.
 */
export interface SentryEventRequest {
  url?: string;
  headers?: Record<string, string>;
  data?: unknown;
}

export interface SentryEventLike {
  request?: SentryEventRequest;
  message?: string;
  extra?: Record<string, unknown>;
}

/**
 * Redact sensitive credentials from a Sentry event in place AND return it (so
 * it can be used directly as the `beforeSend` return value).
 *
 * 5 steps in order (mirrored verbatim by the Python equivalent):
 *   1. Header denylist + variable auth header regex
 *   2. URL query params (`?key=`, `?token=`, `?secret=`, `?auth=`)
 *   3. Body redaction when `request.url` contains `/v1/generate` AND
 *      `request.data` is object/string (spec content)
 *   4. `event.extra.spec` / `openapi_yaml` / `raw_ir`
 *   5. Free-form `event.message` string-pattern scrub (Bearer / sk_live /
 *      sk_test / ghp_ / JWT)
 *
 * Defensive: malformed URL parse never throws; missing `request` no-ops.
 */
export function redactBeforeSend<T extends SentryEventLike>(event: T): T {
  // Step 1 — header denylist + variable regex.
  if (event.request?.headers) {
    const headers = event.request.headers;
    for (const key of Object.keys(headers)) {
      const lk = key.toLowerCase();
      if (REDACTED_HEADERS.has(lk) || VARIABLE_AUTH_HEADER_RE.test(lk)) {
        headers[key] = REDACTION_VALUE;
      }
    }
  }

  // Step 2 — URL query params.
  if (typeof event.request?.url === 'string' && event.request.url.length > 0) {
    try {
      const parsed = new URL(event.request.url);
      let mutated = false;
      for (const param of REDACTED_QUERY_PARAMS) {
        if (parsed.searchParams.has(param)) {
          parsed.searchParams.set(param, REDACTION_VALUE);
          mutated = true;
        }
      }
      if (mutated) {
        event.request.url = parsed.toString();
      }
    } catch {
      // Malformed URL — leave unchanged. No throw, no log noise.
    }
  }

  // Step 3 — body redaction when path is /v1/generate (spec content).
  if (
    typeof event.request?.url === 'string' &&
    event.request.url.includes('/v1/generate') &&
    event.request.data !== undefined &&
    event.request.data !== null &&
    (typeof event.request.data === 'object' || typeof event.request.data === 'string')
  ) {
    event.request.data = '[REDACTED:spec]';
  }

  // Step 4 — event.extra spec / openapi_yaml / raw_ir.
  if (event.extra) {
    for (const k of EXTRA_REDACT_KEYS) {
      if (k in event.extra) {
        event.extra[k] = '[REDACTED:spec]';
      }
    }
  }

  // Step 5 — free-form message string-pattern scrub.
  if (typeof event.message === 'string') {
    let m = event.message;
    for (const re of SENSITIVE_STRING_PATTERNS) {
      m = m.replace(re, REDACTION_VALUE);
    }
    event.message = m;
  }

  return event;
}
