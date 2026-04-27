---
phase: 02-generation-engine-architect-pass-0-1
plan: 04
subsystem: engine+cli
tags: [scaffold, wave-0, pytest, bun-test, nyquist-sampling, validation]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Workspace runner (`pnpm -r test`), pre-commit hooks (gitleaks/ruff/ruff-format/mypy/eslint/conventional-commit), `apps/cli/package.json` Phase-1 stub `scripts.test`"
  - plan: 02-01
    provides: "`apps/generation-engine/tests/test_smoke_qwen.py` + `test_no_duplicate_model_construction.py` already shipped — Wave-0 entry counts include those as `[x]` from Plan 02-01"
  - plan: 02-02
    provides: "`apps/generation-engine/tests/test_stage_a.py` + `tests/fixtures/{circular_ref_spec.json,malformed_spec.txt}` already shipped — Wave-0 entry counts that as `[x]` from Plan 02-02"
  - plan: 02-03
    provides: "10 hand-authored fixture JSONs across stripe/github/notion/linear/slack — Wave-0 fixture entries `[x]` from Plan 02-03"
provides:
  - "12 failing-stub Python test files covering all engine Wave-0 entries (T-2-B1..B6, T-2-C1..C6, T-2-D1..D3, SSE event sequence) — `pytest --collect-only` succeeds with 43 new tests, all `pytest.skip(...)` cleanly"
  - "5 failing-stub TypeScript test files covering CLI Wave-0 entries (T-2-F1..F4 + CLI-01 unit) — `bun test` reports 12 skip / 0 fail across 5 files"
  - "`apps/cli/package.json` `scripts.test` switches from Phase-1 echo stub to real `bun test`; `pnpm -r test` now exercises 12 CLI scaffolds via the workspace runner"
  - "`apps/cli/tsconfig.json` `include` widened to `tests/**/*` so `pnpm typecheck` covers the new files"
affects: [Plan 02-05 (Pass 0 LLM stage), Plan 02-06 (Pass 0 chunked + multi-server), Plan 02-07 (Pass 1 schema + routing + coverage + smart-id), Plan 02-08 (pipeline + L1/L2 cache + SSE), Plan 02-09 (CLI E2E + perf + inspector + auto-spawn)]

# Tech tracking
tech-stack:
  added: []   # No new deps; pure stub scaffolds. Bun 1.3.5 already on devbox; pytest 8.x already pinned in Phase 1.
  patterns:
    - "Wave-0 stub style (pytest): module docstring lists VALIDATION rows + downstream plan; per-test inline `# T-2-XX:` comment + `pytest.skip('Wave-0 scaffold — implementation lands in Plan NN')`"
    - "Wave-0 stub style (bun:test): file-level top-comment block names VALIDATION rows + Plan 09; per-test `// T-2-FX:` inline + `it.skip('Wave-0 scaffold — ...', () => { /* expected behavior bullets */ expect(true).toBe(true); })`"
    - "Pure `bun:test` framework choice for CLI (per VALIDATION.md 'Framework (CLI): bun test') — `import { describe, it, expect } from 'bun:test'` — no vitest.config.ts or bunfig.toml needed"
    - "tsconfig.json `include` adds `tests/**/*` alongside `src/**/*` so typecheck covers test files (mirrors engine `pyproject.toml` ruff `src = ['src', 'tests']` pattern)"

key-files:
  created:
    - "apps/generation-engine/tests/test_pass_0_filter.py (T-2-B1, T-2-B2 → Plan 05)"
    - "apps/generation-engine/tests/test_pass_0_auth_detect.py (T-2-B3 → Plan 05)"
    - "apps/generation-engine/tests/test_pass_0_chunked.py (T-2-B6 → Plan 06)"
    - "apps/generation-engine/tests/test_pass_0_e2e.py (T-2-B4, T-2-B5 → Plan 06)"
    - "apps/generation-engine/tests/test_pass_1_classify.py (T-2-C1, T-2-C2 → Plan 07)"
    - "apps/generation-engine/tests/test_pass_1_routing.py (T-2-C4 → Plan 07)"
    - "apps/generation-engine/tests/test_pass_1_coverage.py (T-2-C3 → Plan 07)"
    - "apps/generation-engine/tests/test_pass_1_e2e.py (parametrized fixture suite → Plan 07)"
    - "apps/generation-engine/tests/test_pipeline.py (T-2-C6, T-2-D1 → Plan 08)"
    - "apps/generation-engine/tests/test_smart_id_no_overlap.py (T-2-C5 → Plan 07)"
    - "apps/generation-engine/tests/test_cache_l1_l2.py (T-2-D1, T-2-D2, T-2-D3 → Plan 08)"
    - "apps/generation-engine/tests/test_api_generate.py (SSE event sequence → Plan 08)"
    - "apps/cli/tests/init.test.ts (CLI-01 unit → Plan 09)"
    - "apps/cli/tests/init.e2e.test.ts (T-2-F1 → Plan 09)"
    - "apps/cli/tests/init.perf.test.ts (T-2-F2 → Plan 09)"
    - "apps/cli/tests/inspector.e2e.test.ts (T-2-F3 → Plan 09)"
    - "apps/cli/tests/auto_spawn.test.ts (T-2-F4 → Plan 09)"
  modified:
    - "apps/cli/package.json (scripts.test: 'echo CLI tests deferred...' → 'bun test')"
    - "apps/cli/tsconfig.json (include: added 'tests/**/*' so pnpm typecheck covers the new files)"
    - ".planning/phases/02-generation-engine-architect-pass-0-1/02-VALIDATION.md (Wave-0 entries flipped [ ] → [x] for engine + CLI + fixtures)"

key-decisions:
  - "**Pure `bun:test` over vitest.** Per VALIDATION.md `Framework (CLI): bun test` — pure-bun is canonical and removes vitest as a redundant runner. CLI tests `import { describe, it, expect } from 'bun:test'`. No `apps/cli/vitest.config.ts` or `apps/cli/bunfig.toml` needed (Bun 1.3.5 picks up `tests/**/*.test.ts` by default). The plan body's vitest.config.ts artifact was reserved as 'fallback if Bun coverage gaps surface' (per VALIDATION.md), and the plan's <behavior> block explicitly says 'CHOICE: prefer pure-bun (bun:test)'. Choice documented here."
  - "**Wave-0 stubs explicitly avoid importing code-under-test.** Skeleton imports only `pytest` (engine) / `bun:test` (CLI). The plan suggested `try/except ImportError` or `pytest.importorskip` patterns — but since every test always skips, the simplest stub omits all imports of code that doesn't exist yet. This keeps `mypy --strict` clean (no unresolved-module errors) and lets `pytest --collect-only` succeed on machines that haven't yet implemented Pass 0/1."
  - "**`apps/cli/tsconfig.json` widened.** Without `include: ['tests/**/*']` the typecheck would be a no-op on test files; the `bun:test` types come from `@types/bun` which is already a dev dep. This mirrors the engine's `[tool.ruff] src = ['src', 'tests']` so test files share the same strictness gate as production code."
  - "**Reused existing on-disk Wave-0 stubs.** The 12 Python test files were already on-disk as untracked (likely authored during Plan 02-03 execution but never staged). Each was inspected: format already matches the plan's prescribed skeleton (module docstring + VALIDATION rows + Wave-0 marker + `# T-2-XX:` inline + `pytest.skip(...)` body). Reusing them avoided redundant rewrite; commit captures them in git for the first time so downstream plans can reference the paths."
  - "**Plan 02-04 also flips Wave-0 entries already shipped by Plan 02-01 / 02-02 / 02-03 from `[ ]` to `[x]`.** Phase-2 housekeeping: Plan 02-04 is the first plan where the full Wave-0 surface is on disk + tracked, so it's the natural place to mark all 21 entries (15 engine + 6 CLI) `[x]` plus the 10 hand-tuned fixture entries. Each `[x]` is annotated with the originating plan number for audit."

patterns-established:
  - "**Stub style is the contract for downstream plans.** Plans 05/06/07/08/09 turn each `pytest.skip(...)` / `it.skip(...)` body green by replacing it with the real test. Removing or renaming the test functions is forbidden without a paired VALIDATION.md update."
  - "**`pnpm -r test` is the per-wave-merge gate.** Now that `apps/cli` participates in real test runs (no longer an `echo` stub), every workspace PR has CLI test status as a CI signal. Skip-cleanly remains green; flake or fail is a regression."

requirements-completed: []
requirements-touched: [GEN-02, GEN-03, GEN-12, CLI-01]

# Metrics
duration: ~12min
completed: 2026-04-27
---

# Phase 02 Plan 04: Wave-0 Test Scaffolding Summary

**Ships 12 failing-stub Python test files + 5 failing-stub TypeScript CLI test files + replaces the Phase-1 `apps/cli/package.json` `scripts.test` stub with real `bun test` — closes the entire Phase-2 Wave-0 acceptance contract so downstream Plans 05–09 can reference test paths in their `<acceptance_criteria>` blocks.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-27T21:25:00Z
- **Completed:** 2026-04-27T21:35:00Z
- **Tasks:** 2 (atomic commits)
- **Files created:** 17 (12 Python + 5 TS test scaffolds)
- **Files modified:** 3 (apps/cli/package.json, apps/cli/tsconfig.json, 02-VALIDATION.md)

## Accomplishments

- 12 Python Wave-0 test scaffolds committed atomically; `cd apps/generation-engine && uv run pytest --collect-only` succeeds with **66 tests collected**, **43 new** Wave-0 tests skipping cleanly. Per-task fast suite: `pytest tests/ -m "not slow"` finishes in **5.59s** with **20 passed, 44 skipped, 2 deselected** (well under the 30s VALIDATION feedback budget).
- 5 CLI Wave-0 scaffolds committed atomically; `cd apps/cli && bun test` exits 0 with **0 pass / 12 skip / 0 fail** across 5 files in 102ms (single-process Bun runner).
- `apps/cli/package.json` `scripts.test` switched from `"echo \"CLI tests deferred to Phase 2 (CLI-01)\""` to `"bun test"` — `jq '.scripts.test'` returns `"bun test"`. Workspace `pnpm -r test` now exercises CLI scaffolds; previously was a no-op echo.
- `apps/cli/tsconfig.json` `include` widened to `["src/**/*", "build.ts", "tests/**/*"]` so `pnpm --filter @mcpgen/cli typecheck` strictly type-checks the new files (passes 0 errors).
- `pnpm -r test` exits **0** across all 11 active workspaces (CLI: 12 skip; engine-fixtures: 66 passed; ir: 34 passed + 2 skipped; contracts: 71 passed; runtime-sdk: 19 passed; api: 4 passed; dispatch + dispatch-sample: 0 tests; web + docs + shared-config: noop). Phase-2 fast suite stays well under the 30-second Nyquist budget.
- `02-VALIDATION.md` Wave-0 entries flipped `[ ]` → `[x]`: **15 engine + 6 CLI + 10 fixtures = 31** entries marked complete (10 fixtures previously shipped by Plan 02-03; 2 engine entries by Plans 02-01 + 02-02; the rest by this plan). Each `[x]` annotated with originating plan.

## Task Commits

Each task was committed atomically (Conventional Commits 1.0.0):

1. **Task 1: Add 12 Python Wave-0 test scaffolds** — `87e1ecc` (test)
   - `test_pass_0_filter.py` (6 tests, T-2-B1+B2 → Plan 05)
   - `test_pass_0_auth_detect.py` (3 tests, T-2-B3 → Plan 05)
   - `test_pass_0_chunked.py` (4 tests, T-2-B6 → Plan 06)
   - `test_pass_0_e2e.py` (4 tests, T-2-B4+B5 → Plan 06)
   - `test_pass_1_classify.py` (4 tests, T-2-C1+C2 → Plan 07)
   - `test_pass_1_routing.py` (3 tests, T-2-C4 → Plan 07)
   - `test_pass_1_coverage.py` (3 tests, T-2-C3 → Plan 07)
   - `test_pass_1_e2e.py` (5 tests parametrized over 5 fixtures → Plan 07)
   - `test_pipeline.py` (3 tests, T-2-C6 + cache → Plan 08)
   - `test_smart_id_no_overlap.py` (1 test, T-2-C5 → Plan 07)
   - `test_cache_l1_l2.py` (4 tests, T-2-D1+D2+D3 → Plan 08)
   - `test_api_generate.py` (3 tests, SSE → Plan 08)

2. **Task 2: Add 5 CLI Wave-0 test scaffolds + wire `bun test`** — `49429f6` (test)
   - `apps/cli/tests/init.test.ts` (4 tests, CLI-01 unit → Plan 09)
   - `apps/cli/tests/init.e2e.test.ts` (2 tests, T-2-F1 → Plan 09)
   - `apps/cli/tests/init.perf.test.ts` (1 test, T-2-F2 → Plan 09)
   - `apps/cli/tests/inspector.e2e.test.ts` (2 tests, T-2-F3 → Plan 09)
   - `apps/cli/tests/auto_spawn.test.ts` (3 tests, T-2-F4 → Plan 09)
   - `apps/cli/package.json` `scripts.test` → `"bun test"`
   - `apps/cli/tsconfig.json` `include` += `"tests/**/*"`

## Files Created/Modified

See `key-files` frontmatter above for the canonical list.

## Decisions Made

See `key-decisions` in frontmatter for the canonical list. Salient highlights:

1. **Framework: pure `bun:test`** (not vitest, not bunfig.toml). Plan-body offered both as a "CHOICE"; picked the pure-bun path because (a) VALIDATION.md says `Framework (CLI): bun test` is primary, (b) Bun 1.3.5 picks up `tests/**/*.test.ts` by default with no config file, (c) reduces moving parts (no vitest.config.ts or bunfig.toml).
2. **Stubs import only the test framework.** No `try/except ImportError` ceremony, no `pytest.importorskip` — every test always skips, so omitting code-under-test imports keeps `mypy --strict` clean and `pytest --collect-only` succeeds on a fresh checkout with zero implementation files.
3. **Reused existing on-disk Wave-0 stubs** (12 Python files were already authored on disk but untracked — likely transient state from Plan 02-03). Each was content-inspected against the plan's skeleton; format matches verbatim (module docstring + VALIDATION rows + `Wave-0 scaffold` marker + per-test `# T-2-XX:` + `pytest.skip(...)` body). Plan 02-04 stages them in git for the first time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Widen `apps/cli/tsconfig.json` `include` to `tests/**/*`**

- **Found during:** Task 2 verification (post-`bun test` typecheck check)
- **Issue:** Plan body did not call out the tsconfig change, but `apps/cli/tsconfig.json` originally had `include: ["src/**/*", "build.ts"]`. Without widening, `pnpm typecheck` is a no-op on the new test files — strictness gate misses them, future drift goes undetected.
- **Fix:** Added `"tests/**/*"` to `include`. `pnpm --filter @mcpgen/cli typecheck` now strictly type-checks `tests/` (passes 0 errors). Mirrors engine's `[tool.ruff] src = ["src", "tests"]` pattern.
- **Files modified:** `apps/cli/tsconfig.json`
- **Verification:** `cd apps/cli && pnpm typecheck` exits 0; CI workspace `pnpm -r typecheck` (when invoked by downstream plans) will catch any future test-file type drift.
- **Committed in:** `49429f6` (Task 2)

---

**Total deviations:** 1 (Rule 2 — strictness gate completeness)
**Impact on plan:** Tightening adjustment, no scope change. The plan's intent (downstream plans can rely on stubs as the test contract) is preserved and reinforced.

## Issues Encountered

- **None blocking.** All 12 Python files were already on disk (untracked) from prior session work — content matched the plan skeleton verbatim, so Task 1 reduced to staging + committing rather than re-authoring.
- **Pre-commit hooks** (gitleaks / ruff / ruff-format / mypy / eslint / conventional-pre-commit) all passed on first attempt for both commits — no autofix iteration required.

## VALIDATION.md Status

Per `02-VALIDATION.md` "Wave 0 Requirements" block:

**Engine (Python):** 15/15 entries flipped `[x]`
- `test_stage_a.py` (Plan 02-02), `test_smoke_qwen.py` + `test_no_duplicate_model_construction.py` (Plan 02-01), the other 12 (Plan 02-04, this plan).

**CLI (Bun):** 6/6 entries flipped `[x]`
- 5 `*.test.ts` scaffolds + `apps/cli/package.json` `scripts.test` (all Plan 02-04).

**Hand-tuned fixtures:** 10/10 entries flipped `[x]` (Plan 02-03, retroactively annotated by this plan).

**Per-task verification map:** Plan 02-04 does not turn green any of the T-2-* rows directly — those flip from ⬜ pending to ✅ green when downstream Plans 05/06/07/08/09 replace the `pytest.skip(...)` / `it.skip(...)` bodies with real assertions.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- **Plan 02-05 (Pass 0 LLM stage)** can immediately reference `apps/generation-engine/tests/test_pass_0_filter.py` and `test_pass_0_auth_detect.py` in its `<acceptance_criteria>` blocks. Implementation strategy: replace each `pytest.skip(...)` body with the real test; the inline `# T-2-XX:` comment is the row reference for VALIDATION map updates.
- **Plan 02-06 (Pass 0 chunked + multi-server)** likewise references `test_pass_0_chunked.py` + `test_pass_0_e2e.py`.
- **Plan 02-07 (Pass 1 schema + routing + coverage)** references the 4 `test_pass_1_*.py` files + `test_smart_id_no_overlap.py`.
- **Plan 02-08 (pipeline + L1/L2 cache + SSE)** references `test_pipeline.py` + `test_cache_l1_l2.py` + `test_api_generate.py`.
- **Plan 02-09 (CLI E2E + perf + inspector + auto-spawn)** references the 5 `apps/cli/tests/*.test.ts` files.

No blockers. Workspace test runner now picks up CLI; engine fast suite stays under 30s.

## Self-Check: PASSED

- [x] `apps/generation-engine/tests/test_pass_0_filter.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_0_auth_detect.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_0_chunked.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_0_e2e.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_1_classify.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_1_routing.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_1_coverage.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_1_e2e.py` — FOUND
- [x] `apps/generation-engine/tests/test_pipeline.py` — FOUND
- [x] `apps/generation-engine/tests/test_smart_id_no_overlap.py` — FOUND
- [x] `apps/generation-engine/tests/test_cache_l1_l2.py` — FOUND
- [x] `apps/generation-engine/tests/test_api_generate.py` — FOUND
- [x] `apps/cli/tests/init.test.ts` — FOUND
- [x] `apps/cli/tests/init.e2e.test.ts` — FOUND
- [x] `apps/cli/tests/init.perf.test.ts` — FOUND
- [x] `apps/cli/tests/inspector.e2e.test.ts` — FOUND
- [x] `apps/cli/tests/auto_spawn.test.ts` — FOUND
- [x] `apps/cli/package.json` — `jq '.scripts.test'` returns `"bun test"`
- [x] `apps/cli/tsconfig.json` — `include` contains `"tests/**/*"`
- [x] Commit `87e1ecc` (Task 1) — present in `git log`
- [x] Commit `49429f6` (Task 2) — present in `git log`
- [x] `cd apps/generation-engine && uv run pytest --collect-only` exits 0; 66 tests collected total (43 new Wave-0 stubs, all `pytest.skip`)
- [x] `cd apps/generation-engine && uv run pytest tests/ -m "not slow"` exits 0 — 20 passed, 44 skipped, 5.59s
- [x] `cd apps/cli && bun test` exits 0 — 0 pass / 12 skip / 0 fail / 5 files
- [x] `cd apps/cli && pnpm typecheck` exits 0
- [x] `pnpm -r test` exits 0 across all 11 workspace projects
- [x] `grep -rEh "# T-2-[A-F][1-9]" apps/generation-engine/tests/test_pass_*.py apps/generation-engine/tests/test_pipeline.py apps/generation-engine/tests/test_smart_id_no_overlap.py apps/generation-engine/tests/test_cache_l1_l2.py apps/generation-engine/tests/test_api_generate.py | wc -l` → 35 (≥ 20 required)
- [x] `grep -rEh "Wave-0 scaffold" apps/generation-engine/tests/test_pass_*.py apps/generation-engine/tests/test_pipeline.py apps/generation-engine/tests/test_smart_id_no_overlap.py apps/generation-engine/tests/test_cache_l1_l2.py apps/generation-engine/tests/test_api_generate.py | wc -l` → 51 (≥ 20 required)
- [x] `grep -rEh "// T-2-F[1-9]" apps/cli/tests/ | wc -l` → 10 (≥ 5 required)
- [x] mypy strict on the 12 Wave-0 engine files: 0 errors (12 source files)
- [x] ruff on `apps/generation-engine/tests/`: All checks passed
- [x] Pre-commit hooks (gitleaks + ruff + ruff-format + mypy + eslint + conventional-commit) green on both commits

---
*Phase: 02-generation-engine-architect-pass-0-1*
*Completed: 2026-04-27*
