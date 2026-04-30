// apps/web/src/lib/sentry/redact.ts
//
// Shared Sentry beforeSend redaction. Mirrors apps/api/src/instrumentation.ts:sentryOptionsFor
// pattern (Phase 1 D-19). Per CONTEXT D-30 + Pitfall #12 (P0 — credential leak into Sentry),
// strips Authorization / X-Upstream-Auth / Cookie headers AND ?key= / ?token= query
// parameters from request.url.
//
// Extends the apps/api equivalent: query-param scrubbing is web-only because
// spec URLs submitted via the landing form may carry the upstream credential as
// a `?key=` / `?token=` query parameter (e.g., `https://example.com/openapi.json?key=sk_live_...`).
// The Hono BFF in apps/api receives such URLs in JSON body, not in request.url, so its
// equivalent helper does not need URL scrubbing.
//
// Single source of truth — imported by all three of:
//   - apps/web/sentry.client.config.ts
//   - apps/web/sentry.edge.config.ts
//   - apps/web/sentry.server.config.ts

/**
 * Headers whose value MUST be replaced with '[REDACTED]' before any Sentry event leaves
 * the process. Matched case-insensitively against incoming event header keys (Sentry
 * transports are inconsistent — Node SDK preserves original case, browser SDK
 * lowercases, Edge runtime varies).
 */
export const REDACTED_HEADERS = ['Authorization', 'X-Upstream-Auth', 'Cookie'] as const;

/**
 * Query-parameter NAMES whose values are scrubbed from `event.request.url`. We replace
 * the value with '[REDACTED]' rather than stripping the param so the URL shape is
 * preserved for grouping (a Sentry event with `?key=secret_a` and another with
 * `?key=secret_b` should fingerprint to the same issue).
 */
export const REDACTED_QUERY_PARAMS = ['key', 'token'] as const;

/**
 * The literal we substitute. Stored as a typed constant so tests can assert against the
 * exact value and downstream code can pattern-match if needed.
 */
export const REDACTION_VALUE = '[REDACTED]' as const;

/**
 * Minimal structural type covering the Sentry Event surface this helper touches. We
 * intentionally do NOT depend on @sentry/types to keep this module loadable from the
 * client / edge / server config files without pulling Sentry runtime types into a
 * potentially-empty-DSN bootstrap path.
 */
export interface SentryEventRequest {
  url?: string;
  headers?: Record<string, string>;
}

export interface SentryEventLike {
  request?: SentryEventRequest;
}

/**
 * Redact sensitive credentials from a Sentry event in place AND return it (so it can be
 * used directly as the `beforeSend` return value).
 *
 * Mutates `event.request.headers` and `event.request.url` if present. No-op when
 * `event.request` is absent (Sentry envelopes for non-HTTP errors — e.g., a thrown error
 * from a setTimeout — have no request context).
 *
 * Defensive against malformed URLs: if `URL` parsing throws (data: URLs, opaque
 * protocols, malformed strings), the url is left unchanged and a structured warning is
 * logged so the failure is observable in CI but does not break event delivery.
 */
export function redactSentryEvent<T extends SentryEventLike>(event: T): T {
  const request = event.request;
  if (!request) {
    return event;
  }

  // Header redaction — case-insensitive lookup against the typed list above.
  if (request.headers) {
    const headers = request.headers;
    const lowercaseTargets = new Set(REDACTED_HEADERS.map((h) => h.toLowerCase()));
    for (const key of Object.keys(headers)) {
      if (lowercaseTargets.has(key.toLowerCase())) {
        headers[key] = REDACTION_VALUE;
      }
    }
  }

  // URL query-param redaction.
  if (typeof request.url === 'string' && request.url.length > 0) {
    try {
      const parsed = new URL(request.url);
      let mutated = false;
      for (const paramName of REDACTED_QUERY_PARAMS) {
        if (parsed.searchParams.has(paramName)) {
          parsed.searchParams.set(paramName, REDACTION_VALUE);
          mutated = true;
        }
      }
      if (mutated) {
        request.url = parsed.toString();
      }
    } catch (error) {
      // Malformed URL — leave unchanged. Structured warning per CLAUDE.md
      // (structured fields, not interpolated strings).
      // eslint-disable-next-line no-console
      console.warn('[sentry-redact] failed to parse request.url for redaction', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return event;
}
