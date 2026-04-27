// packages/runtime-sdk/src/runtime/sentry-redaction.ts
//
// Phase 6 (per D-16 / pitfall #12) — Sentry beforeSend redactor. Plugs into
// the existing FND-10 empty-DSN init in every app via apps/<app>/src/instrumentation.ts.
// Strips Authorization, X-Upstream-Auth, Cookie + spec-declared auth headers
// (passed at codegen time as extraHeaderDenylist) from event.request.headers,
// event breadcrumbs, and event extra fields.
//
// Source: extends apps/api/src/instrumentation.ts beforeSend pattern.

const ALWAYS_DENY = ['Authorization', 'X-Upstream-Auth', 'Cookie'] as const;

interface SentryEventLike {
  request?: { headers?: Record<string, string>; data?: unknown };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  extra?: Record<string, unknown>;
}

function caseInsensitiveHas(set: Set<string>, key: string): boolean {
  if (set.has(key)) return true;
  const lower = key.toLowerCase();
  for (const k of set) {
    if (k.toLowerCase() === lower) return true;
  }
  return false;
}

export function buildBeforeSend(
  extraHeaderDenylist: ReadonlyArray<string> = [],
) {
  const denylist = new Set<string>([...ALWAYS_DENY, ...extraHeaderDenylist]);
  return function beforeSend<E extends SentryEventLike>(event: E): E {
    // Redact request headers (case-insensitive).
    const headers = event.request?.headers;
    if (headers) {
      for (const k of Object.keys(headers)) {
        if (caseInsensitiveHas(denylist, k)) {
          headers[k] = '[REDACTED]';
        }
      }
    }
    // Redact request body (defence-in-depth: remove if present at all).
    if (event.request && 'data' in event.request) {
      event.request.data = '[REDACTED]';
    }
    // Redact breadcrumb data fields whose key is on the denylist.
    if (Array.isArray(event.breadcrumbs)) {
      for (const bc of event.breadcrumbs) {
        if (bc.data) {
          for (const k of Object.keys(bc.data)) {
            if (caseInsensitiveHas(denylist, k)) {
              bc.data[k] = '[REDACTED]';
            }
          }
        }
      }
    }
    // Redact extra fields whose key is on the denylist.
    if (event.extra) {
      for (const k of Object.keys(event.extra)) {
        if (caseInsensitiveHas(denylist, k)) {
          event.extra[k] = '[REDACTED]';
        }
      }
    }
    return event;
  };
}
