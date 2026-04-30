// apps/api/src/lib/sentry-events-adapter.ts
//
// CTRL-08 / D-13 — SentryEventsAdapter interface for the leak-audit operator
// script (`scripts/observability/leak-audit.ts`). Phase 9 ships
// `MockSentryEventsAdapter` (Phase 9 default); Phase 10 swaps in
// `RealSentryEventsAdapter` (calls real Sentry events API) via env flag
// `SENTRY_EVENTS_ADAPTER=mock|real`.
//
// Adapter pattern follows Phase 8 D-23 `StorageAdapter` substitution model
// (mock-now-real-later) — see `packages/contracts/src/storage.ts` for the
// canonical reference. Same shape: small interface, mock impl shipped with
// the feature, real impl swapped in next phase via env flag.
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md §D-13
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"5. Mocked-now-real-later StorageAdapter substitution"
//   - packages/contracts/src/storage.ts (canonical analog)

/**
 * A normalized representation of a Sentry event for leak-audit purposes.
 *
 * Fields are intentionally a structural subset of the Sentry events-API
 * response so the same shape works for the mock impl AND the eventual real
 * impl (Phase 10). The mock seed() takes events of this shape directly.
 */
export interface SentryEvent {
  /** Event ID assigned by Sentry. Used by the operator to look up offending events. */
  readonly event_id: string;
  /** Top-level message (e.g., exception message or breadcrumb). May be empty. */
  readonly message: string;
  /** Optional request context — headers / url / body. */
  readonly request?: {
    readonly headers?: Record<string, string>;
    readonly url?: string;
    readonly data?: unknown;
  };
  /** Optional `extra` bag (Sentry SDK extras). */
  readonly extra?: Record<string, unknown>;
  /** ISO-8601 receipt timestamp; mock honors this for window_seconds filtering. */
  readonly received_at: string;
}

/**
 * Adapter for querying the Sentry events store.
 *
 * Phase 9: `MockSentryEventsAdapter` (apps/api/src/lib/sentry-events-mock.ts)
 * returns seeded events; the leak-audit script's tests inject sentinel events
 * via the mock to exercise both the clean and leak-detected code paths.
 *
 * Phase 10: `RealSentryEventsAdapter` (apps/api/src/lib/sentry-events-real.ts
 * — NEW Phase 10) calls the real Sentry events API
 * (`GET /api/0/projects/{org}/{project}/events/?query=...`) using a read-only
 * org-scoped token rotated quarterly per RUN-03.
 */
export interface SentryEventsAdapter {
  /**
   * Query Sentry events for entries matching `query` within the time window.
   *
   * @param params.query - Substring (Phase 9 mock) / Sentry search syntax
   *   (Phase 10 real). Matches against the full serialized event JSON in mock
   *   form — covers headers, body, message, extras uniformly.
   * @param params.window_seconds - Filter events received within the last
   *   `window_seconds` seconds. Older events are excluded.
   * @param params.project_slug - Sentry project slug (e.g., 'mcpgen'); the
   *   real impl scopes to this project.
   *
   * @returns Matching events, possibly empty. Never null/undefined.
   */
  query(params: {
    readonly query: string;
    readonly window_seconds: number;
    readonly project_slug: string;
  }): Promise<SentryEvent[]>;
}
