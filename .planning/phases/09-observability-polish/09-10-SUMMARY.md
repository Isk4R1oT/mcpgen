---
phase: 09-observability-polish
plan: 10
subsystem: observability
tags: [sentry, leak-audit, adapter-pattern, mock-now-real-later, ctrl-08, d-13]

# Dependency graph
requires:
  - phase: 09-observability-polish
    plan: 01
    provides: "Phase 9 D-12 6-vector regression CI gate (vitest + pytest); leak-audit script's runtime infra-drift complement"
  - phase: 08-auth-billing
    provides: "StorageAdapter (packages/contracts/src/storage.ts) mock-now-real-later substitution model used as the canonical analog"
provides:
  - "SentryEventsAdapter interface (apps/api/src/lib/sentry-events-adapter.ts) — Phase 9 mock + Phase 10 real swap-point"
  - "MockSentryEventsAdapter (apps/api/src/lib/sentry-events-mock.ts) — seeded events + serialized-JSON substring match + window_seconds filter"
  - "scripts/observability/leak-audit.ts — operator script wired to `pnpm leak-audit` (4 sentinel vectors / 60s window / mock|real mode)"
  - "Test seeding via env-fixture path (`SENTRY_EVENTS_MOCK_FIXTURE_PATH`) — keeps gitleaks happy by allowlisted JSON only"
affects: [10-launch (real Sentry org provisioning + RealSentryEventsAdapter implementation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adapter mock-now-real-later substitution (replicated from Phase 8 D-23 StorageAdapter): small interface, mock impl shipped now, real impl swapped via env flag in next phase"
    - "Test seeding via env-fixture path: SENTRY_EVENTS_MOCK_FIXTURE_PATH points to tmp JSON `{events: SentryEvent[]}` so vitest tests can drive the script as a child process without baking sentinels into source"
    - "Substring search semantics on serialized event JSON: simpler than Sentry's real query syntax, sufficient for sentinel-string detection (D-13's only purpose)"
    - "Reference-only header pattern (per infrastructure/logto/scaffold.ts): leak-audit.ts marked `// REFERENCE ONLY — operator runs this manually pre-launch.`"

key-files:
  created:
    - "apps/api/src/lib/sentry-events-adapter.ts (74 lines — SentryEvent + SentryEventsAdapter interfaces, structural-subset of Sentry events-API response shape)"
    - "apps/api/src/lib/sentry-events-mock.ts (61 lines — MockSentryEventsAdapter class with seed() and query() implementations)"
    - "apps/api/tests/lib/sentry-events-mock.test.ts (114 lines — 4 vitest tests: empty default / seed roundtrip / substring match across headers+body+message / window_seconds exclusion)"
    - "scripts/observability/leak-audit.ts (167 lines — operator script: --mode mock|real arg parsing, 4 LEAK_VECTORS array, env-fixture seed loader, vector-results pretty-print, exit codes 0/1/2/3)"
    - "apps/api/tests/observability/leak-audit.test.ts (134 lines — 3 vitest tests via execFileSync(npx tsx leak-audit.ts): clean pass / seeded leak fail / real-mode error)"
    - ".planning/phases/09-observability-polish/deferred-items.md (out-of-scope discoveries log)"
  modified:
    - "package.json (add `\"leak-audit\": \"tsx scripts/observability/leak-audit.ts\"` script entry)"

key-decisions:
  - "Plan 09-10: SentryEvent shape = structural subset of Sentry events-API response (event_id / message / request{headers,url,data} / extra / received_at) — same shape works for mock AND eventual Phase 10 real impl, mock seed() takes the same wire shape directly"
  - "Plan 09-10: substring search semantics on JSON.stringify(event) — covers headers + body + message + extras uniformly with one match expression; simpler than Sentry's real query syntax but sufficient for D-13's sentinel-string detection purpose"
  - "Plan 09-10: env-fixture path SENTRY_EVENTS_MOCK_FIXTURE_PATH (vs --seed-file CLI arg) — tests write tmp fixtures, set env, exec script; keeps script flag surface narrow and gitleaks-compatible (sentinels live only in fixture JSON, allowlisted)"
  - "Plan 09-10: project_slug param accepted by mock but ignored — preserves Phase 10 real-adapter contract parity (real impl scopes Sentry API call to {org}/{project})"
  - "Plan 09-10: 4 distinct exit codes (0 PASS / 1 FAIL leak-found / 2 unexpected error / 3 mode-real-not-implemented) — operator can scriptize on specific exit code per intent"
  - "Plan 09-10: tests use `execFileSync('npx', ['--yes', 'tsx', SCRIPT, ...args])` — matches operator's `pnpm leak-audit` invocation path (operator never runs the script directly via tsx)"
  - "Plan 09-10: out-of-scope file `apps/api/tests/observability/outbox-depth.test.ts` (committed by parallel plan 09-11 / 09-12 agent during this execution) deferred to its owning plan; not auto-fixed per executor SCOPE BOUNDARY rule"

patterns-established:
  - "Pattern 1 (Adapter substitution for live cloud APIs): identical shape to Phase 8 D-23 StorageAdapter — interface + Phase-N mock + Phase-N+1 real impl, env flag selects. Fits any 'one cloud API the operator queries from a script' use case (Sentry events, Inngest function listings, BetterStack incidents, etc.)"
  - "Pattern 2 (Operator script + child-process integration test): script lives at repo-root scripts/<area>/<task>.ts with reference-only header; integration tests at apps/<owner>/tests/<area>/<task>.test.ts use execFileSync to spawn the script via npx tsx and assert exit code + stdout"
  - "Pattern 3 (Env-fixture seeding for child-process tests): tmp JSON fixture written by test, path passed via env var, script reads-and-applies. Lets tests drive script behavior without exposing test-only flags or polluting the script's CLI surface"

requirements-completed: [CTRL-08]

# Metrics
duration: 5min
completed: 2026-04-30
---

# Phase 09 Plan 10: Leak-Audit Operator Script Summary

**Closes CTRL-08 / D-13 mocked half — operator script + adapter interface + Phase 9 mock impl. The script (`pnpm leak-audit`) queries 4 sentinel vectors (`Bearer ` / `sk_live_` / `ghp_` / `MCPGEN_LEAK_CANARY_2026Q2`) against the SentryEventsAdapter with a 60-second window; Phase 10 swaps in `RealSentryEventsAdapter` via env flag `SENTRY_EVENTS_ADAPTER=mock|real` (single-file change). Forms the audit pair with Plan 09-01's CI regression suite: CI catches new-code regressions, this script catches infra/config drift in the live environment.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-30T15:53:36Z
- **Completed:** 2026-04-30T15:58:41Z
- **Tasks:** 2
- **Files created:** 6 (5 src/test + 1 deferred-items log)
- **Files modified:** 1 (root package.json)

## Accomplishments

- `SentryEventsAdapter` interface ships as the Phase 9 mock + Phase 10 real swap-point; same interface + mock-now-real-later substitution model as Phase 8 D-23 `StorageAdapter`
- `MockSentryEventsAdapter` class supports `seed()` + `query()` with serialized-JSON substring match and `window_seconds` filter — sufficient for D-13's sentinel-string detection without needing Sentry's real query syntax
- `scripts/observability/leak-audit.ts` wired to `pnpm leak-audit`; queries 4 sentinel vectors / 60-second window / configurable mock|real mode; exit codes 0 (PASS) / 1 (FAIL leak-found) / 2 (unexpected) / 3 (mode-real-not-implemented)
- 7 new tests: 4 vitest unit tests (mock adapter contracts) + 3 vitest integration tests (script as child process via `npx tsx`)
- Cross-language clean: gitleaks-allowlisted sentinels live only in tmp test fixtures, never in source; sentinel `MCPGEN_LEAK_CANARY_2026Q2` per Plan 09-01 standard

## Task Commits

Each task was committed atomically with passing pre-commit hooks (NO `--no-verify`):

1. **Task 1: Adapter interface + Phase 9 mock impl** — `409cb3b` (feat) — 4 vitest unit tests
2. **Task 2: leak-audit operator script + integration test** — `38e95c8` (feat) — 3 integration tests + `pnpm leak-audit` script entry

## Files Created/Modified

### Created (6)
- `apps/api/src/lib/sentry-events-adapter.ts` — Adapter + event-shape interfaces (74 lines)
- `apps/api/src/lib/sentry-events-mock.ts` — `MockSentryEventsAdapter` class (61 lines)
- `apps/api/tests/lib/sentry-events-mock.test.ts` — 4 vitest unit tests (114 lines)
- `scripts/observability/leak-audit.ts` — Operator script with reference-only header (167 lines)
- `apps/api/tests/observability/leak-audit.test.ts` — 3 integration tests (134 lines)
- `.planning/phases/09-observability-polish/deferred-items.md` — Out-of-scope discoveries log

### Modified (1)
- `package.json` — Added `"leak-audit": "tsx scripts/observability/leak-audit.ts"` script entry

## Decisions Made

(See `key-decisions` frontmatter — 7 decisions captured.)

Most consequential:
1. **`SentryEvent` shape = structural subset of Sentry events-API response** so the same wire shape works for mock and Phase 10 real impl; no translation layer between mock seed input and adapter query output.
2. **Substring search on `JSON.stringify(event)`** covers headers + body + message + extras uniformly. Trade-off accepted: simpler than Sentry's real query language, but sufficient for D-13's narrow sentinel-string detection purpose.
3. **Env-fixture seeding (`SENTRY_EVENTS_MOCK_FIXTURE_PATH`)** keeps the script's CLI surface narrow (only `--mode mock|real`) and lets tests drive script behavior without polluting the operator-facing flag surface.
4. **4 distinct exit codes** (0 / 1 / 2 / 3) so operators can scriptize on specific failure modes; `--mode real` returning 3 (not 1) cleanly distinguishes "not-yet-implemented" from "leak-found".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing untracked file from Wave 3 sibling agent broke full-package typecheck**
- **Found during:** Task 2 (after writing the script — `pnpm --filter @mcpgen/api typecheck` failed)
- **Issue:** `apps/api/tests/observability/outbox-depth.test.ts` (committed by parallel plan 09-11 agent at commit `31dfa1e` during my execution) has a Drizzle insert payload missing `dispatch_namespace` column → `tsc --noEmit` exit 2
- **Fix:** Confirmed via `cd apps/api && npx tsc --noEmit 2>&1 | grep -E "leak-audit|sentry-events"` that NONE of my files contribute typecheck errors; per executor SCOPE BOUNDARY rule (only auto-fix issues directly caused by current task's changes), logged the unrelated failure to `.planning/phases/09-observability-polish/deferred-items.md` and proceeded
- **Files modified:** none (logged only)
- **Verification:** plan-verification gate `pnpm --filter @mcpgen/api test -- --run tests/lib/sentry-events-mock.test.ts tests/observability/leak-audit.test.ts` exits 0 with all 7 tests passing
- **Committed in:** N/A (deferred-items.md is committed alongside SUMMARY in the docs commit)

**Total deviations:** 1 (Rule 3 logged out-of-scope).
**Impact on plan:** Zero — verification gates pass; out-of-scope failure is owned by plan 09-11 / 09-12.

## Issues Encountered

- Parallel-execution environment caused two sibling-plan commits to land between my Task 1 and Task 2 commits (`8a2e894` 09-08, `31dfa1e` 09-11). Resolution: only my files staged for each commit (single `git add <file1> <file2> ...` form, never `git add .`); `git status --short` reviewed before each commit; pre-existing untracked artifacts from sibling plans left alone.

## User Setup Required

None — Phase 9 ships SDK + script wiring only. Phase 10 carry-forward provisions:
1. **Real Sentry org + project IDs** — set via env (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`); rotate quarterly per RUN-03.
2. **`RealSentryEventsAdapter` impl** — single new file at `apps/api/src/lib/sentry-events-real.ts` calling `GET /api/0/projects/{org}/{project}/events/?query=...`; selected when `SENTRY_EVENTS_ADAPTER=real`.

## Next Phase Readiness

- Plan 10-launch can implement `RealSentryEventsAdapter` (one new file, ~50 lines using `fetch` against Sentry events API + Bearer org-token from `SENTRY_AUTH_TOKEN` env)
- Same adapter pattern is reusable for any other "operator script queries cloud API" use case in Phase 10 (e.g., BetterStack incidents, Inngest function-listings — Plan 09-06 already covers Inngest orphan-audit but uses the in-process registry, not a cloud API)

## Threat Flags

None — no new security-relevant surface introduced. The plan's `<threat_model>` enumerated 3 threats (T-9-leak-01 information disclosure / T-9-leak-02 sentinel-vs-gitleaks / T-9-leak-03 Phase 10 real-adapter token), all `mitigate` (or Phase 10 `accept`). Mitigations:
- T-9-leak-01: leak-audit + Plan 09-01 6-vector CI suite = defense-in-depth
- T-9-leak-02: `MCPGEN_LEAK_CANARY_2026Q2` chosen non-Stripe-shaped per Pitfall #7 — does not match commercial-key regex; fixture path NOT in source code (tmp paths only); `.gitleaks.toml` allowlist already covers fixture-pattern paths from Plan 09-01
- T-9-leak-03: deferred to Phase 10 token provisioning step (not Phase 9 surface)

## Self-Check: PASSED

Verified by direct filesystem + commit checks (2026-04-30T15:58:41Z):

**Files created — confirmed present:**
- `apps/api/src/lib/sentry-events-adapter.ts` — FOUND
- `apps/api/src/lib/sentry-events-mock.ts` — FOUND
- `apps/api/tests/lib/sentry-events-mock.test.ts` — FOUND
- `scripts/observability/leak-audit.ts` — FOUND
- `apps/api/tests/observability/leak-audit.test.ts` — FOUND
- `.planning/phases/09-observability-polish/deferred-items.md` — FOUND

**Commits — confirmed in `git log`:**
- `409cb3b` (Task 1) — FOUND
- `38e95c8` (Task 2) — FOUND

**Tests — last green status:**
- `pnpm --filter @mcpgen/api test -- --run tests/lib/sentry-events-mock.test.ts tests/observability/leak-audit.test.ts` → 7 passed (3 + 4 across 2 files)
- Direct invocation `npx tsx scripts/observability/leak-audit.ts --mode mock` → exit 0 with `[leak-audit] PASS`

**Plan acceptance criteria — verified:**
- `apps/api/src/lib/sentry-events-adapter.ts` contains `interface SentryEventsAdapter` ✓
- `apps/api/src/lib/sentry-events-mock.ts` contains `class MockSentryEventsAdapter` ✓
- `apps/api/src/lib/sentry-events-mock.ts` contains `query(` ✓
- `scripts/observability/leak-audit.ts` contains `MCPGEN_LEAK_CANARY_2026Q2` (2 occurrences), `Bearer `, `sk_live_`, `ghp_`, `--mode` ✓
- Root `package.json` contains `"leak-audit"` ✓

---
*Phase: 09-observability-polish*
*Completed: 2026-04-30*
