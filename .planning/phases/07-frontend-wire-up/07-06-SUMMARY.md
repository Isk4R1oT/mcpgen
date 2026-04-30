---
phase: 07-frontend-wire-up
plan: 06
subsystem: observability
tags: [sentry, redaction, privacy, observability, beforeSend]

requires:
  - phase: 01-foundation
    provides: Sentry SDK skeletons (sentry.{client,edge,server}.config.ts) with empty-DSN-safe Sentry.init + inline header redaction (Phase 1 D-19 / FND-10)
  - phase: 07-frontend-wire-up
    provides: Plan 07-01 lib/jsx-bridge baseline + tsconfig path alias `@/*` → `./src/*`
provides:
  - Shared `redactSentryEvent` helper at `apps/web/src/lib/sentry/redact.ts` (single source of truth)
  - Header redaction (case-insensitive `Authorization` / `X-Upstream-Auth` / `Cookie` → `[REDACTED]`)
  - URL query-param redaction (`?key=` / `?token=` → `[REDACTED]`) — the Phase 7 delta over Phase 1
  - All 3 Sentry config files refactored to import the shared helper and call it from `beforeSend`
  - 17 vitest unit tests for the helper + 3 integration tests for the wired client config
affects: [07-04, 07-05, observability-phase-9, security-audits]

tech-stack:
  added: []
  patterns:
    - "Shared beforeSend factory imported by all 3 Sentry runtimes (mirrors apps/api/src/instrumentation.ts:sentryOptionsFor)"
    - "Single-source-of-truth redaction list: REDACTED_HEADERS + REDACTED_QUERY_PARAMS + REDACTION_VALUE constants exported from one module"
    - "Defensive URL parsing: malformed URLs are logged via structured `console.warn` (CLAUDE.md: structured fields, not interpolated strings) but never throw"

key-files:
  created:
    - apps/web/src/lib/sentry/redact.ts
    - apps/web/tests/unit/lib/sentry/redact.test.ts
    - apps/web/tests/unit/sentry.client.config.test.ts
  modified:
    - apps/web/sentry.client.config.ts
    - apps/web/sentry.edge.config.ts
    - apps/web/sentry.server.config.ts

key-decisions:
  - "Single shared helper across 3 runtimes — accepts shared-bug-amplification risk (T-7-19) in exchange for redaction consistency; 17 unit tests + 3 integration tests compensate for the risk."
  - "Replace ?key=/?token= values with '[REDACTED]' rather than stripping the param — preserves URL shape so Sentry fingerprints group correctly across leaks of different secret values."
  - "Case-insensitive header matching — Node SDK preserves original case, browser SDK lowercases, edge runtime varies; iterating event keys with .toLowerCase() against a typed target list catches all variants."
  - "Defensive URL parsing with structured console.warn fallback — never break event delivery on malformed URLs (data: URIs, opaque protocols, garbage strings)."
  - "Manual Vercel preview smoke deferred per VALIDATION.md task 7-06-02 — requires private Sentry org access + paired DSN; test will run after Plan 07-02's preview deploy lands."

patterns-established:
  - "Pattern Sentry-1: shared redaction module imported by every runtime config (replaces inline duplicated beforeSend bodies)"
  - "Pattern Sentry-2: minimal SentryEventLike interface — module is loadable from edge/server/client without pulling @sentry/types into a potentially-empty-DSN bootstrap path"

requirements-completed: []  # cross-cutting OPS hardening; supports OPS-01 / pitfall-#12 mitigation; no FE-XX REQ owned

duration: ~12min (inline execution after agent rate-limit)
completed: 2026-04-27
---

# Plan 07-06: Sentry beforeSend Redaction Summary

**Closed Pitfall #12 (P0): all 3 web Sentry runtimes now route events through a shared `redactSentryEvent` helper that strips `Authorization`/`X-Upstream-Auth`/`Cookie` headers AND `?key=`/`?token=` query-param values to `[REDACTED]` before any event leaves the process.**

## Performance

- **Duration:** ~12 min (inline execution by orchestrator after `gsd-executor` Task() hit Anthropic rate limit; shorter than the 17–75 min agent runs of 07-01/07-02 since the plan was small and well-scoped)
- **Tasks:** 2/2 complete
- **Files created:** 3 (`lib/sentry/redact.ts` + 2 vitest specs)
- **Files modified:** 3 (the 3 sentry.*.config.ts files)
- **Commits:** 6 atomic Conventional Commits

## Accomplishments

### Task 1 — Shared `redactSentryEvent` helper + unit tests

- Authored `apps/web/src/lib/sentry/redact.ts` (110 lines) exporting:
  - `REDACTED_HEADERS = ['Authorization', 'X-Upstream-Auth', 'Cookie'] as const`
  - `REDACTED_QUERY_PARAMS = ['key', 'token'] as const`
  - `REDACTION_VALUE = '[REDACTED]' as const`
  - `interface SentryEventLike { request?: { url?: string; headers?: Record<string, string> } }`
  - `function redactSentryEvent<T extends SentryEventLike>(event: T): T`
- Authored 17 vitest unit tests covering: 5 header-redaction cases (capitalized / lowercase / X-Upstream-Auth / Cookie / mixed-case), 5 URL query-param cases (?key= / ?token= / both / preserve other params / no-op), 1 malformed-URL case, 2 edge cases (no-request, request-but-no-headers/url), 1 round-trip credential-leak probe, 3 exported-constants assertions.
- Round-trip probe asserts that an event with `Authorization: Bearer sk_test_AAAAAA` + `Cookie: session=xyz_secret` + `url: https://example.com/spec?key=secret&token=abc&keep=this` produces a serialized event containing zero leaked credentials, the `keep=this` param preserved, and at least 3 `[REDACTED]` markers.

### Task 2 — Wire shared helper into all 3 sentry configs + integration test

- `apps/web/sentry.client.config.ts`: replaced Phase-1 inline `for (const k of [...]) { ... }` body with `return redactSentryEvent(event)`; imports `@/lib/sentry/redact`.
- `apps/web/sentry.edge.config.ts`: identical refactor.
- `apps/web/sentry.server.config.ts`: identical refactor.
- Authored `apps/web/tests/unit/sentry.client.config.test.ts` integration test (3 cases): empty-DSN load safety, Sentry.init invocation captures the beforeSend callback and the captured callback round-trips a real event with redactions applied, tracesSampleRate sanity check.

### Verification gates (all green)

- `pnpm --filter @mcpgen/web typecheck` → exit 0
- `pnpm --filter @mcpgen/web build` → exit 0 (174 kB shared First Load JS / 7 dynamic routes preserved from Plan 07-02)
- `pnpm --filter @mcpgen/web exec vitest --run` → 38/38 tests across 7 files (17 redact + 3 sentry-config + 5 idempotency-key + 5 api/client + 3 api/error-mapper + 3 logto/client + 2 jsx-bridge/loader)
- `bash .github/workflows/scripts/visual-lock-guard.sh` → exit 0 (locked UI files unchanged)
- `git diff origin/main HEAD -- 'apps/web/src/MCPGen.html' 'apps/web/src/screen-*.jsx' 'apps/web/src/ui.jsx' 'apps/web/src/tokens.jsx' 'apps/web/src/app.jsx' 'apps/web/src/tweaks-panel.jsx' 'apps/web/src/global.css' 'apps/web/src/uploads/'` → empty (UI lock invariant honored end-to-end)

### Threat model

| Threat ID | Category | Disposition | Outcome |
|-----------|----------|-------------|---------|
| T-7-06 | Information Disclosure (Pitfall #12 — P0 credential leak via Sentry) | mitigate | Closed. 17 unit tests + 3 integration tests + Vercel preview smoke (deferred to post-Plan-07-02 Vercel deploy per VALIDATION manual table) prove redaction works. |
| T-7-19 | Tampering (single shared helper amplifies any bug across all 3 runtimes) | accept | Single source of truth IS the goal. 17+3 tests compensate; quarterly Sentry-event sampling in Phase 9 will catch regressions. |

### Auto-fixes applied

- **[Rule 1]** `tests/unit/lib/sentry/redact.test.ts` edge-case test typecheck: cast event without `request` field to `{ message: string } & { request?: never }` so TypeScript narrows correctly through the `extends SentryEventLike` generic. Plus dropped unused `beforeEach` / `afterEach` imports. Committed in `5966b8e`.

## Commits (6)

- `9db2f14` feat(07-06): add lib/sentry/redact (shared beforeSend factory; D-30 + Pitfall #12)
- `40ff1ab` test(07-06): vitest unit tests for redactSentryEvent (17 cases)
- `bf248c8` refactor(07-06): route sentry.client.config beforeSend through shared redactSentryEvent
- `30d85d9` refactor(07-06): route sentry.edge.config beforeSend through shared redactSentryEvent
- `b60f0bc` refactor(07-06): route sentry.server.config beforeSend through shared redactSentryEvent
- `6b6e509` test(07-06): integration test verifying sentry.client.config invokes redactSentryEvent
- `5966b8e` fix(07-06): typecheck redact.test edge case + drop unused vitest hooks [Rule 1]

## Note on execution mode

Plan 07-06 was executed inline by the plan-phase orchestrator rather than via `gsd-executor` Task() agent because the Anthropic API rate-limited the executor spawn. Inline execution preserves the same atomic-commit / Conventional-Commit / verification-gate discipline; the 7 commits above mirror the 6 commits the plan called for plus 1 Rule-1 fix.

## Downstream readiness

- Wave 1 progress: 3/4 plans complete (07-01 ✓, 07-02 ✓, 07-06 ✓; 07-03 next).
- Plan 07-03 ready to start (fixture-mode SSE + canvas/stream/playground/preview/quality/deploy routes + page-reload-mid-generation Pitfall #20 mandatory test).
- The `redactSentryEvent` helper is now imported by all 3 Sentry runtimes; future Wave-2/3 routes that throw uncaught errors will have their request URLs scrubbed of any `?key=`/`?token=` automatically.
