---
phase: 09-observability-polish
plan: 06
subsystem: testing
tags: [vitest, inngest, static-analysis, ast-scan, ci-gate]

# Dependency graph
requires:
  - phase: 08-auth-billing
    provides: "INNGEST_FUNCTION_IDS register (7 stable function IDs); 7 inngest function implementations referencing the register"
provides:
  - "Bidirectional set-equality audit between INNGEST_FUNCTION_IDS register and apps/api/src/inngest/functions/*.ts implementations"
  - "Anti-hardcode regex guard rejecting bare `id: 'foo-v1'` literals"
  - "Static-source CI gate preventing future PRs from adding orphan Inngest functions"
affects: [phase-10-launch, future-inngest-function-additions, drift-watcher-versioning]

# Tech tracking
tech-stack:
  added: []
  patterns: [static-source-AST-scan-via-regex, bidirectional-set-equality, anti-hardcode-literal-guard]

key-files:
  created:
    - apps/api/tests/inngest/orphan-audit.test.ts
  modified: []

key-decisions:
  - "Plan 09-06: anti-hardcode regex `/id:\\s*['\"][a-z][a-z0-9-]*-v\\d+['\"]/` chosen over broader literal patterns — rejects only id-versioned literals (`drift-watcher-v1`) so legitimate string ids in other contexts (event names, log messages) pass; T-9-orphan-01 mitigation"
  - "Plan 09-06: TypeScript noUncheckedIndexedAccess required `Record<string, string | undefined>` cast + explicit toBeDefined() guard before set-add; clearer test failure message than relying on Set.add(undefined) coercion"

patterns-established:
  - "Static-source orphan audit: read function-directory siblings, regex-extract `id: ENUM.X` references, assert against canonical register"
  - "Bidirectional set-equality: collected-from-source set MUST equal full register set (catches both directions of orphan)"

requirements-completed: [CTRL-09]

# Metrics
duration: 3min
completed: 2026-04-30
---

# Phase 09 Plan 06: Inngest Orphan Audit Summary

**Static-source AST scan asserting bidirectional set-equality between `INNGEST_FUNCTION_IDS` register (7 stable IDs) and `apps/api/src/inngest/functions/*.ts` implementations, plus anti-hardcode literal guard — closes CTRL-09 / D-14**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-30T15:30:10Z
- **Completed:** 2026-04-30T15:33:00Z
- **Tasks:** 1 (TDD pattern with single test+verify cycle — no implementation code; the test IS the deliverable)
- **Files created:** 1
- **Function files scanned:** 7 (drift-watcher, drift-watcher-check, usage-reconciler, stripe-meters-emit, quota-period-rollover, logto-mau-watch, cost-cap-enforcer)
- **Inngest functions registered:** 7 (matches `functions.length` runtime invariant)
- **Test runtime:** 2–4ms (well under <5s acceptance bound)

## Accomplishments

- Bidirectional set-equality test catches both directions of orphan: implementation references unregistered key OR registered key has no implementation
- Anti-hardcode regex guard prevents future PRs from bypassing the register via bare string literals (T-9-orphan-01 mitigation)
- Runtime sanity assertion: `functions[]` array length === `INNGEST_FUNCTION_IDS` key count
- Pure file read + regex; no Inngest dev server, no network — zero CI flake risk

## Task Commits

1. **Task 1: Implement orphan audit static-source AST scan test** — `6b2c53d` (test)

_Plan metadata commit will follow this SUMMARY._

## Files Created/Modified

- `apps/api/tests/inngest/orphan-audit.test.ts` (created, 77 LoC) — 3 test cases under `describe('Inngest orphan audit (CTRL-09 / D-14)')`:
  1. `every function file uses an id from INNGEST_FUNCTION_IDS` — extracts `id: INNGEST_FUNCTION_IDS.X` references via regex; asserts each is a registered key AND collected set equals full register set
  2. `runtime functions[] array length matches register` — `functions.length === Object.keys(INNGEST_FUNCTION_IDS).length`
  3. `no function file uses a hardcoded id literal (anti-hardcode guard)` — rejects regex `/id:\s*['"][a-z][a-z0-9-]*-v\d+['"]/`

## Decisions Made

- **TDD interpretation for static-audit tests:** the plan declared `tdd="true"`, but the test asserts an invariant on already-correct Phase 8 source files — so RED phase would pass immediately. Treated this as a single combined `test(...)` commit since the test IS the implementation; documented in TDD Gate Compliance below.
- **Anti-hardcode regex scope:** chose narrow `[a-z][a-z0-9-]*-v\d+` literal pattern (matches `'drift-watcher-v1'` / `'usage-reconciler-v1'` / etc.) over broader `[a-z-]+-v\d+` to avoid accidental matches inside comments or doc strings. Phase 8 convention freezes function IDs as `<kebab-case>-v<digit>`, so the pattern covers every present and future id format.
- **Undefined-safe Set.add:** TypeScript `noUncheckedIndexedAccess` flagged `(record)[key]` returning `string | undefined`. Added explicit `.toBeDefined()` guard with informative error message before narrowing to `string`. Clearer than relying on Set coercion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] TypeScript strict null check on `Record<string, string>` indexing**

- **Found during:** Task 1 verify step (`pnpm --filter @mcpgen/api typecheck`)
- **Issue:** `apps/api` tsconfig enables `noUncheckedIndexedAccess`; `(INNGEST_FUNCTION_IDS as Record<string, string>)[key]` returns `string | undefined`, but the original code passed it directly to `expect(...).toContain(value)` and `found.add(value)` typed as `string`.
- **Fix:** Cast to `Record<string, string | undefined>`; add explicit `expect(value).toBeDefined()` assertion with informative error message; narrow with `const id = value as string` before downstream use.
- **Files modified:** `apps/api/tests/inngest/orphan-audit.test.ts`
- **Verification:** `pnpm --filter @mcpgen/api typecheck` exits 0; test still passes (3 tests, 2ms).
- **Committed in:** `6b2c53d` (single Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Type safety fix preserved test semantics — assertion now fails with informative message if a function file references a key absent from the register. No scope creep.

## Issues Encountered

- Initial flaky run of full `pnpm --filter @mcpgen/api test` reported 4 failures in `tests/observability/sourcemaps-skip-when-no-token.test.ts` — investigation showed it was a timing/ordering flake unrelated to plan 09-06 (immediate re-run passed all 162 tests). Out-of-scope for this plan; not investigated further (Plan 09-05 may iterate on sourcemaps coverage). Logged here for visibility.

## TDD Gate Compliance

Plan was declared `tdd="true"` but is a static-source audit test of pre-existing correct sources. RED-then-GREEN sequence collapses to a single `test(...)` commit because:

- The test is the deliverable (no production code change required)
- Phase 8 already shipped INNGEST_FUNCTION_IDS-referencing source files
- Running the test against correct sources produces a passing run, which is the intended steady-state CI gate

`6b2c53d` is the canonical `test(...)` commit. No `feat(...)` follow-up needed because no behavior is being implemented. RED phase fail-fast rule does not apply — the gate is by design satisfied at write-time.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CTRL-09 phase requirement closed: future Phase 9 plan executions and Phase 10 launch checks have a static-source CI gate enforcing register integrity
- Pattern reusable: any future "ENUM register vs implementation files" audit (e.g., Stage E template registry, Pass tool-type enum) can copy this static-source AST shape
- D-14 (assertion test) implemented; orphan additions (forgotten register entry, hardcoded literal) caught at PR review time

## Self-Check: PASSED

- [x] `apps/api/tests/inngest/orphan-audit.test.ts` exists (77 LoC)
- [x] Commit `6b2c53d` exists in `git log --oneline`
- [x] Test runs in < 5s (measured: 2–4ms)
- [x] All 3 acceptance assertions present:
  - `expect(found).toEqual(REGISTERED_IDS)` — bidirectional set-equality
  - `expect(functions.length).toBe(Object.keys(INNGEST_FUNCTION_IDS).length)` — runtime sanity
  - Anti-hardcode regex `/id:\s*['"][a-z][a-z0-9-]*-v\d+['"]/`
- [x] Extraction regex `/id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g` present
- [x] `pnpm --filter @mcpgen/api typecheck` exits 0
- [x] `pnpm --filter @mcpgen/api test` (full suite) passes 162 / skipped 15 / failed 0

---
*Phase: 09-observability-polish*
*Completed: 2026-04-30*
