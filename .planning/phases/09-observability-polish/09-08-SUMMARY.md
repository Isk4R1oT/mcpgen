---
phase: 09-observability-polish
plan: 08
subsystem: security-cross-cutting
tags: [smart-id, cross-tenant, dispatch, fuzz, defense-in-depth, pitfall-1]

# Dependency graph
requires:
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "build_smart_id_format / build_smart_id_regex helpers in mcpgen_engine.passes.pass_1.routing (D-31 / D-56) — schema-level format used by both the new fuzz and the Phase 2 baseline"
  - phase: 04-stage-e
    provides: "packages/codegen-templates/templates/smart_id.ts.j2 — Stage E mints the per-tenant runtime/smart_id.ts regex; the F1 fuzz proves the regex template doesn't intersect across tenants"
  - phase: 06-runtime
    provides: "apps/dispatch/src/middleware/smartIdFuzz.ts — recursive collectSmartIdCandidates + parseSmartId guard at /t/* boundary; the new dispatch test exercises this middleware end-to-end"
  - phase: 09-01
    provides: "Wave 3 dependency edge — Phase 9 Plan 09-01 closed Pitfall #3 (apps/dispatch Sentry init); this plan builds atop the now-Sentry-wired dispatch worker without touching its instrumentation"
provides:
  - "F1 codegen-time cross-tenant smart-ID fuzz at scale (5 tenants x 5 specs = 25 bundles) via deterministic regex set algebra"
  - "Dispatch runtime guard integration test confirming smartIdFuzz middleware rejects foreign-tenant IDs at /t/* with 403 smart_id_tenant_mismatch (5 cases incl. nested array args)"
  - "Defense-in-depth proof: Pitfall #1 (P0) regression-locked at BOTH the codegen layer (Stage E template) AND the runtime layer (dispatch middleware)"
affects: [10-launch (real-CF dispatch deployment inherits a verified runtime-guard test)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regex set algebra fuzz at scale — itertools.product over (tenants, specs) + itertools.combinations over bundle pairs gives a 25-bundle / 300-pair / 2400-fullmatch matrix in <1s with zero LLM/codegen cost (vs the literal alternative of 25 Stage E codegen runs)"
    - "Failure-mode regression test — collision-injection asserts the harness ITSELF detects regressions, not just the system under test (see test_collision_injection_is_caught)"
    - "Dispatch integration test analog reuse — buildApp(tenantPrefix) factory pattern from smart-id-fuzz.test.ts mirrored verbatim, ensuring future middleware changes break BOTH tests in one go"

key-files:
  created:
    - "apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py (242 lines — 4 pytest tests, all marked @pytest.mark.slow per existing marker registry)"
    - "apps/dispatch/tests/cross-tenant-id-block.test.ts (148 lines — 5 vitest tests using the buildApp(tenantPrefix) Hono harness from the Phase 6 analog)"
  modified: []

key-decisions:
  - "Plan 09-08: chose deterministic regex set algebra (PATTERNS.md option a) over the alternative of running Stage E codegen for every (tenant, spec) pair — same correctness guarantee (the regex literal is what F1 statically validates), 25x cheaper, LLM-free, network-free, sub-second"
  - "Plan 09-08: registered all 4 fuzz tests under the existing `slow` pytest marker (registered in pyproject.toml `[tool.pytest.ini_options].markers`) instead of introducing a new `integration` marker — strict-markers config rejects unregistered markers, and `slow` accurately describes the matrix-based test cost profile"
  - "Plan 09-08: replaced 12 unicode `×` (multiplication sign) characters with ASCII `x` to satisfy ruff RUF001/RUF002/RUF003 (ambiguous-unicode-character) pre-commit gate"
  - "Plan 09-08: dispatch Test 5 (mixed-tenant array of IDs) implemented as a regular `it(...)` instead of the plan's `.todo` fallback — verification of `apps/dispatch/src/middleware/smartIdFuzz.ts:17` showed the existing Phase 6 middleware already inspects array values via the recursive `collectSmartIdCandidates` walk; the existing `smart-id-fuzz.test.ts` (line 64-86) confirms this with the analogous `mallory-evil` array case. Test 5 therefore lands as a real regression test, not a TODO"
  - "Plan 09-08: middleware itself NOT modified — per CONTEXT D-09 'runtime guard already exists'; this plan only adds the integration test that proves both layers work end-to-end"

patterns-established:
  - "Pattern: matrix-style regex fuzz — `for (t1, s1), (t2, s2) in itertools.combinations(keys, 2)` partitions cross-tenant pairs and skips intra-tenant ones, leaving the spec-distinction proof to a sibling test (test_intra_tenant_per_spec_distinguishable). Future security fuzzes (e.g. cursor-prefix or session-token) should adopt the same shape"
  - "Pattern: collision-injection self-test — proves the fuzz harness catches regressions BEFORE the system under test gets the chance to misbehave; reusable for any invariant test asserting NON-overlap"

requirements-completed: [CTRL-08]

# Metrics
duration: 7min
completed: 2026-04-30
---

# Phase 09 Plan 08: Cross-Tenant Smart-ID Defense-in-Depth Summary

**5x5 codegen-time fuzz (25-bundle regex set algebra, F1 layer) + dispatch runtime guard integration test (5 cases, /t/* layer) regression-lock Pitfall #1 (P0 — cross-tenant smart-ID collision) at BOTH codegen and runtime defense layers without touching the existing Phase 4 Stage E template or the Phase 6 dispatch middleware.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-30T15:53:23Z
- **Completed:** 2026-04-30T16:00:55Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- F1 cross-tenant fuzz expanded from the Phase 2 baseline of 2 tenants x 1 spec (T-2-C5 in `tests/test_smart_id_no_overlap.py`) to a 25-bundle 5 tenants x 5 specs matrix at `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py`
- 4 pytest tests, all `@pytest.mark.slow`, run in ~0.22s: 25-bundle non-overlap (300 pairs x 4 IDs each x 2 directions = ~2400 fullmatch checks), intra-tenant per-spec distinguishability, collision-injection failure-mode regression, schema-level union regex sanity
- Dispatch runtime guard integration test at `apps/dispatch/tests/cross-tenant-id-block.test.ts` — 5 vitest tests using the existing Phase 6 `smartIdFuzz` middleware via the `buildApp(tenantPrefix)` Hono harness analog; covers id-mismatch, prefix-match, no-smart-id, malformed-smart-id, and mixed-tenant array cases
- Defense in depth proven: Pitfall #1 caught at codegen via regex-template invariant (F1 fuzz) AND at runtime via tenant-prefix middleware (dispatch test)

## Task Commits

Each task was committed atomically with passing pre-commit hooks (NO `--no-verify`):

1. **Task 1: F1 5x5 cross-tenant smart-ID fuzz (D-08)** — `8a2e894` (test)
2. **Task 2: Dispatch runtime guard integration test (D-09)** — `5397699` (test)

## Files Created/Modified

### Created (2)

- `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` — 4 pytest tests, 242 lines. Imports `_tenant_prefixed_regex` shape from the Phase 2 analog (`tests/test_smart_id_no_overlap.py`), expands the 2x1 baseline to 5x5 = 25 bundles via `itertools.product`. Uses `build_smart_id_format` + `build_smart_id_regex` from `mcpgen_engine.passes.pass_1.routing` for schema-level invariants.
- `apps/dispatch/tests/cross-tenant-id-block.test.ts` — 5 vitest tests, 148 lines. Mirrors the `buildApp(tenantPrefix)` factory pattern from the existing `tests/smart-id-fuzz.test.ts` Hono harness analog; exercises the `smartIdFuzz` middleware end-to-end via Hono `app.request(...)` POSTs without spinning up a real Bun server.

### Modified

None — this plan deliberately ships only test files; the Stage E template (Phase 4) and the dispatch middleware (Phase 6) are NOT modified per CONTEXT D-08 + D-09.

## Decisions Made

(See `key-decisions` frontmatter — 5 decisions captured.)

Most consequential:

1. **Deterministic regex set algebra over Stage E codegen** — gives identical correctness guarantee as exercising real codegen for every (tenant, spec) pair (the regex literal IS what Stage F1 statically validates), but is 25x cheaper, LLM-free, and runs in <1s. PATTERNS.md flagged this as the recommended option.
2. **Test 5 (mixed-tenant array) committed as a real test, not `.todo`** — verification of `apps/dispatch/src/middleware/smartIdFuzz.ts:17` showed Phase 6 already implements recursive array-arg inspection via `collectSmartIdCandidates`; the existing `smart-id-fuzz.test.ts:64-86` confirms it. The plan's `.todo` fallback was a hedge against an un-confirmed contract; reading the middleware confirmed the contract holds, so Test 5 lands as a real regression test.
3. **Existing `slow` marker reused over a new `integration` marker** — pyproject.toml `[tool.pytest.ini_options].markers` registry already has `slow`; introducing `integration` would have required a registry update with no analog precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Linter auto-fix] ruff RUF001/RUF002/RUF003 — ambiguous unicode `×` characters**
- **Found during:** Task 1 (first commit attempt, pre-commit ruff stage)
- **Issue:** 12 occurrences of unicode `×` (multiplication sign U+00D7) in docstrings/comments/strings tripped ruff's ambiguous-unicode-character rules
- **Fix:** Replaced all `×` with ASCII `x` via a one-shot Python script
- **Files modified:** `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py`
- **Verification:** Re-ran pre-commit; ruff + ruff-format both pass; 4 pytest tests still pass in 0.22s
- **Committed in:** `8a2e894` (Task 1 commit, second attempt)

**2. [Rule 1 - Linter auto-fix] ruff-format — string concatenation reflow**
- **Found during:** Task 1 (first commit attempt, pre-commit ruff-format stage)
- **Issue:** ruff-format auto-reformatted multi-line f-string concatenation idioms to single-line where possible
- **Fix:** Accepted the auto-fix in place; no behavior change
- **Files modified:** `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py`
- **Verification:** Tests still pass after reformatting
- **Committed in:** `8a2e894` (Task 1 commit, second attempt)

### Plan-vs-execution variance

- **Test 5 in Task 2 NOT marked `.todo`** — the plan offered an `it.todo(...)` fallback if the dispatch middleware didn't yet support array-arg inspection. Inspection of `apps/dispatch/src/middleware/smartIdFuzz.ts` confirmed Phase 6 already does (recursive `collectSmartIdCandidates`), and the existing `smart-id-fuzz.test.ts` already exercises the array case at line 64-86. Test 5 therefore lands as a real `it(...)` test (5/5 green), exceeding the plan's "4 of 5 + 1 todo" acceptance criterion.

---

**Total deviations:** 2 auto-fixed linter issues (both Rule 1) + 1 plan-vs-execution variance (Test 5 stronger than spec). No scope creep, no architectural changes.

## Issues Encountered

- Pre-commit hook stashed unstaged files during Task 1's first attempt (3 untracked files from other plans: `.claude/`, `apps/api/src/lib/sentry-events-adapter.ts`, `apps/api/tests/lib/`) — these were left untouched per scope-boundary rule. Standard pre-commit interaction; no action needed.

## User Setup Required

None — Phase 9 Plan 09-08 ships only test files. The codegen-layer invariant (Stage E template at `packages/codegen-templates/templates/smart_id.ts.j2`) and the runtime-layer middleware (`apps/dispatch/src/middleware/smartIdFuzz.ts`) are unchanged from Phase 4 and Phase 6 respectively.

## Next Phase Readiness

- **Phase 10 (Launch) inherits** a verified defense-in-depth proof for Pitfall #1: any future Stage E template change that accidentally collapses the tenant prefix MUST fail the F1 fuzz before it reaches a real CF dispatch deployment, AND any forged smart-ID in inbound `tools/call` requests is rejected at /t/* with 403 by the dispatch middleware
- **Phase 9 Plan 09-09 (multi-protocol mock client)** can proceed independently — already committed at 6e88156 prior to this plan landing
- **Phase 9 Plan 09-10/11** unaffected by this plan (orthogonal scope: leak-audit + outbox monitor)

## Threat Flags

None — no new security-relevant surface. Both new test files exercise existing Phase 4 codegen + Phase 6 runtime invariants. The plan's `<threat_model>` accurately enumerated 4 threats (T-9-cross-tenant-01..04), all with `mitigate` dispositions verified by the 9 new tests (4 pytest + 5 vitest).

T-9-cross-tenant-04 (array-of-IDs argument mixed-tenant case bypasses single-ID inspection) was originally `accept (Phase 9) / mitigate (future)`. Inspection during Task 2 showed Phase 6 already mitigates it (recursive `collectSmartIdCandidates`); the disposition is upgraded from `accept` to `mitigate` and Test 5 verifies the mitigation. No follow-up needed.

## Self-Check: PASSED

Verified by direct filesystem + commit checks (2026-04-30T16:00:55Z):

**Files created — confirmed present:**
- `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` — FOUND (10796 bytes)
- `apps/dispatch/tests/cross-tenant-id-block.test.ts` — FOUND (5859 bytes)

**Commits — confirmed in `git log`:**
- `8a2e894` (Task 1 — F1 fuzz) — FOUND
- `5397699` (Task 2 — dispatch runtime guard test) — FOUND

**Tests — last green status:**
- `cd apps/generation-engine && uv run pytest tests/integration/test_cross_tenant_smart_id_fuzz.py -x` → 4 passed in 0.22s
- `cd apps/dispatch && npx vitest --run tests/cross-tenant-id-block.test.ts` → 5 passed in 4ms
- `cd apps/dispatch && npx vitest --run` (full suite, no regressions) → 35 passed in 349ms across 7 files
- `cd apps/dispatch && npx tsc --noEmit` → clean

**Acceptance criteria — confirmed:**
- File contains 5 distinct tenant strings: `acme`, `widgets`, `globex`, `initech`, `umbrella` — present in TENANTS tuple
- File contains 5 spec slugs: `stripe-api`, `github-api`, `notion-api`, `linear-api`, `slack-api`
- File contains `_tenant_prefixed_regex` (6 occurrences)
- File contains cross-pair assertion loop (`itertools.combinations`, 5 occurrences)
- Dispatch test contains `smart_id_tenant_mismatch` (3 occurrences)
- Dispatch test contains `expect(res.status).toBe(403)` (3 occurrences)
- Dispatch test contains `tools/call` JSON-RPC body in all 5 tests

---
*Phase: 09-observability-polish*
*Completed: 2026-04-30*
