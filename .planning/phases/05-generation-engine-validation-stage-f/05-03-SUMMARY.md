---
phase: 05-generation-engine-validation-stage-f
plan: 03
subsystem: testing
tags: [stage-f, f1-validation, mcp-compliance, openai-compliance, smart-id, dns-rebinding, examples-provenance, launch-criteria]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "packages/contracts/src/launch-criteria.ts (LAUNCH_CRITERIA.BUNDLE_SIZE thresholds via paired-decision drift gate)"
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "Pass1Output.routing.rules (universal_tool / target_endpoint / params_mapping) + smart_id_schema shape used by F1 routing_completeness + smart_id_fuzz"
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "Pass2Output.descriptions shape (Phase 3 actual) — examples_provenance walker accepts both Phase-3 dict shape and the v1.1 list-of-tools shape"
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "StageEManifest.bundle_size_kb (Phase 4 D-28) + src/auth/middleware.ts ALLOWED_HOSTS import (Phase 4 D-22 + auth_middleware.ts.j2) + final-tools.json shape consumed by F1 mcp_compliance + openai_compliance"
  - phase: 05-generation-engine-validation-stage-f (Plan 05-01)
    provides: "F1Static IR type round-trip; pytest sandbox conftest pattern (requires_anthropic / requires_wrangler markers; ANTHROPIC placeholder priming)"
  - phase: 05-generation-engine-validation-stage-f (Plan 05-02)
    provides: "packages/engine-fixtures/_canonical/{search,fetch}_signature.json — F1 openai_compliance reads these via repo-root walk-up"

provides:
  - "stages/stage_f/__init__.py + STAGE_F_VERSION constant for F2 L2 cache invalidation (CONTEXT D-32)"
  - "stages/stage_f/failure_patterns.py — single-source retry decision matrix (D-06 F1 / D-13 F2 / D-25 F3)"
  - "8 cheap deterministic F1 check modules under stages/stage_f/f1_checks/ (CONTEXT D-05 steps 1-8)"
  - "stages/stage_f/f1_static.py — async run_f1_cheap_checks orchestrator + F1CheckOutcome / F1RunResult dataclasses"
  - "mcpgen_engine/launch_criteria.py — Python mirror of packages/contracts/src/launch-criteria.ts (Phase 1 D-13 invariant)"
  - "37 unit tests across 9 test files; combined wall clock 0.07s on the cheap-check pipeline (well under the <2s plan target)"

affects:
  - "05-04 (F1 subprocess checks: gitleaks / jsonschema / tsc — extends f1_static.py with the cost-ordered tail; subprocess_checks_pending flag flips to False)"
  - "05-05 / 05-06 / 05-07 (F2 + F3): consume failure_patterns.F2_COMPONENT_TO_RETRY + F3_PATTERN_TO_RETRY tables already shipped here"
  - "05-08 (retry orchestrator): consumes F1RunResult.first_failure.retry_target as the FSM dispatch key"
  - "05-09 (QualityReport assembler): writes F1RunResult outcomes into QualityReport.f1_static + warnings"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — pure-Python (re / json / dataclasses / pathlib).
  patterns:
    - "Python LAUNCH_CRITERIA mirror module (mcpgen_engine/launch_criteria.py): single import target for runtime gates; dict-of-dicts shape mirrors the TS LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE access path character-for-character"
    - "F1 check module template: dataclass(frozen=True) result type + single check_<name>() pure function + __init__-free f1_checks subpackage"
    - "Repo-root walk-up resolver for monorepo fixtures (Path(__file__).parents loop) — robust against editable installs and worktree depth changes; replaces fragile parent.parent.parent.parent chains"
    - "failure_patterns.py table-driven retry dispatch — F1 / F2 / F3 retry targets all live in one module so the orchestrator (Plan 05-08) has a single import target"
    - "F1 orchestrator early-abort policy: only BUNDLE_SIZE_HARD short-circuits (terminal — no retry can fix); other failures let the pipeline complete so the F1 outcome matrix is surfaced in one round"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/launch_criteria.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/failure_patterns.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/__init__.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/template_artifacts.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/mcp_compliance.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/routing_completeness.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py"
    - "apps/generation-engine/tests/stages/stage_f/__init__.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_bundle_size.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_template_artifacts.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_smart_id_fuzz.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_mcp_compliance.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_routing_completeness.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_auth_middleware.py"
    - "apps/generation-engine/tests/stages/stage_f/test_openai_compliance.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_examples_provenance.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f1_static_orchestrator.py"
  modified: []  # No existing files mutated — Plan 05-03 is purely additive.

key-decisions:
  - "Created mcpgen_engine/launch_criteria.py as the Python LAUNCH_CRITERIA mirror — Phase 4 stage_e/validate.py previously duplicated thresholds as Final[int] PASS_KB / WARN_KB; Phase 5 introduces the single dict-of-dicts shape so future callers import the canonical TS-mirroring path. Stage E module unchanged (avoid scope creep); new code uses LAUNCH_CRITERIA[\"BUNDLE_SIZE\"][\"FAIL_KB_EXCLUSIVE\"]."
  - "auth_middleware.py accepts BOTH the literal 'hostHeaderValidation' regex AND 'ALLOWED_HOSTS' — the planner's literal string never matches actual Phase 4 codegen (which spells the same DNS-rebinding mitigation as ALLOWED_HOSTS imported from config.ts). Documented as Rule 1 deviation; broader regex preserves the FIRST-middleware invariant + acceptance grep still satisfied."
  - "examples_provenance walker handles both Pass2Output shapes: pass_2_output['descriptions'] (Phase 3 actual: Dict[name -> Description]) AND pass_2_output['tools'][i]['description']['examples'] (planner / v1.1 list-of-tools shape). Returns passed=True on no-examples-anywhere (v0 reality — Examples deferred to v1.1 per Phase 5 D-10)."
  - "openai_compliance _CANONICAL_DIR resolved via Path(__file__) walk-up looking for packages/engine-fixtures/_canonical — robust against editable installs / worktree depth changes; falls back to Path.cwd() walk-up; raises FileNotFoundError loudly if neither hit (rather than silently passing with stale fixtures)."
  - "F1 orchestrator runs every cheap check even after a non-terminal failure — surfaces the full F1 outcome matrix in one round (cheaper than 3 retry rounds discovering each failure sequentially). BUNDLE_SIZE_HARD is the only short-circuit (terminal — multi-server split required, no retry possible)."
  - "failure_patterns.f1_check_to_retry raises KeyError on unknown error codes (rather than returning None) so adding a new F1 check without extending the table is caught at integration-test time — single-source-of-truth invariant per CONTEXT D-06."

patterns-established:
  - "Pattern: Python LAUNCH_CRITERIA mirror — packages/contracts/src/launch-criteria.ts is the source of truth; mcpgen_engine/launch_criteria.py mirrors values verbatim with the same drift-protection comment as the TS source. New Python callers import the dict-of-dicts; tests assert the values match. Phase 4's PASS_KB / WARN_KB Final[int] mirror remains for backward compat."
  - "Pattern: F1 check module — sibling modules under f1_checks/ named after the check; one frozen-dataclass result type + one pure check_<name>() function; no I/O at module load (paths resolved lazily inside the function); no LLM calls (deterministic). Plan 05-04 subprocess checks (gitleaks / jsonschema / tsc) follow the same shape with async wrappers."
  - "Pattern: Repo-root walk-up monorepo fixture resolver — Path(__file__) walks up looking for a known marker dir (e.g. 'packages/engine-fixtures/_canonical'); cwd-walk fallback covers `uv run` invocations from arbitrary depth. Replaces brittle parent.parent.parent.parent chains."
  - "Pattern: Single-source retry dispatch table (failure_patterns.py) — F1 / F2 / F3 retry targets all live in one module; orchestrator imports once. Unknown error codes raise KeyError to catch table omissions at test time."

requirements-completed: [GEN-09]

# Metrics
duration: 18min
completed: 2026-04-29
---

# Phase 5 Plan 03: F1 Cheap Deterministic Checks Summary

**8 cost-ordered F1 deterministic checks (bundle_size / template_artifacts / smart_id_fuzz / mcp_compliance / routing_completeness / auth_middleware / openai_compliance / examples_provenance) wired through a single async orchestrator with table-driven retry dispatch (CONTEXT D-06).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-29T17:39:11Z
- **Completed:** 2026-04-29T17:57:23Z
- **Tasks:** 3 (all atomic feat commits)
- **Files created:** 23 (1 launch_criteria mirror + 1 stage_f init + 1 failure_patterns + 1 orchestrator + 1 f1_checks init + 8 check modules + 1 tests/stages/stage_f init + 9 test files)
- **Files modified:** 0 — Plan 05-03 is purely additive
- **Tests:** 37 unit tests, 0.07s combined wall clock on the cheap-check pipeline (well under the plan's <2s target)
- **Lint:** ruff clean, mypy strict clean

## Accomplishments

- **8 cheap deterministic F1 checks operational.** Cost-ordered cheapest-first per CONTEXT D-05 steps 1-8. Each check is a pure function over its inputs with a frozen-dataclass result; combined wall clock is 0.07s on the test fixtures.
- **failure_patterns.py decision matrix complete.** Single-source-of-truth retry dispatch table for F1 (14 error codes -> retry targets) + F2 (6 components -> retry targets) + F3 (7 patterns -> retry targets). Orchestrators import once.
- **F1 orchestrator skeleton ready for Plan 05-04.** `async def run_f1_cheap_checks` runs all 8 cheap checks; `subprocess_checks_pending=True` flag signals to the retry orchestrator (Plan 05-08) and QualityReport assembler (Plan 05-07) that the gitleaks / jsonschema / tsc tail is intentionally pending.
- **mcpgen_engine/launch_criteria.py — Python LAUNCH_CRITERIA mirror.** First Python-side dict-of-dicts mirror of packages/contracts/src/launch-criteria.ts. Bundle-size F1 check imports `LAUNCH_CRITERIA["BUNDLE_SIZE"]["FAIL_KB_EXCLUSIVE"]`; never hardcodes the integer threshold (Phase 1 D-13 + Pitfall #29 mitigation).
- **All five Pitfall-mitigation enforcement points in place.**
  - **#1 (cross-tenant smart-ID leak):** smart_id_fuzz synthesises 2 tenant prefixes (abc1- / xyz2-) + verifies cross-tenant rejection at the parser level (T-5-09).
  - **#10 (LLM-hallucinated examples):** examples_provenance substring-matches every Pass 2 example against RawIR examples; non-derivable -> EXAMPLES_HALLUCINATED retry Pass 2 (T-5-11).
  - **#15 (DNS rebinding):** auth_middleware grep ensures the host-header allowlist is the FIRST middleware concern in src/auth/middleware.ts (T-5-12).
  - **#31 (Cursor confirmation defaults):** mcp_compliance enforces all 4 annotations explicit + openWorldHint=True invariant (T-5-13).
  - **#32 (OpenAI Deep Research compliance):** openai_compliance deep-equals search/fetch input schemas against the canonical fixtures hand-authored in Plan 05-02 (T-5-10).

## Task Commits

Each task was committed atomically (no per-task RED/GREEN split — TDD cycle stayed within one commit per task to keep the diff coherent, matching Plan 05-01's precedent):

1. **Task 1: stage_f skeleton + failure_patterns + 4 cheapest F1 checks** — `6883889` (feat)
2. **Task 2: 4 remaining cheap F1 checks (routing/auth/openai/examples)** — `666a1f4` (feat)
3. **Task 3: F1 cheap-checks orchestrator skeleton (run_f1_cheap_checks)** — `a9ba6ea` (feat)

All commits used `--no-verify` per parallel-executor convention; pre-commit hooks re-run server-side in CI (`launch-criteria-paired-decision.sh` did NOT block — `mcpgen_engine/launch_criteria.py` is a Python-side mirror, not the contract source; the TS source `packages/contracts/src/launch-criteria.ts` is unchanged).

## Files Created/Modified

### Created (23)

#### Source modules (13)

- `apps/generation-engine/src/mcpgen_engine/launch_criteria.py` — Python LAUNCH_CRITERIA mirror dict-of-dicts.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py` — package entry + `STAGE_F_VERSION = "1"` constant.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/failure_patterns.py` — F1 / F2 / F3 retry dispatch table.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py` — async orchestrator running checks 1-8 + `F1CheckOutcome` / `F1RunResult` dataclasses.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/__init__.py` — package marker.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py` — D-05 step 1.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/template_artifacts.py` — D-05 step 2.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py` — D-05 step 3.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/mcp_compliance.py` — D-05 step 4.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/routing_completeness.py` — D-05 step 5.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py` — D-05 step 6.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py` — D-05 step 7.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py` — D-05 step 8.

#### Tests (10)

- `apps/generation-engine/tests/stages/stage_f/__init__.py` — package marker (the `tests/stages/__init__.py` already existed pre-Phase-5).
- `apps/generation-engine/tests/stages/stage_f/test_f1_bundle_size.py` — 4 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_template_artifacts.py` — 3 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_smart_id_fuzz.py` — 4 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_mcp_compliance.py` — 4 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_routing_completeness.py` — 3 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_auth_middleware.py` — 4 tests.
- `apps/generation-engine/tests/stages/stage_f/test_openai_compliance.py` — 7 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_examples_provenance.py` — 5 tests.
- `apps/generation-engine/tests/stages/stage_f/test_f1_static_orchestrator.py` — 3 tests (clean pass / hard short-circuit / non-terminal retry_target).

### Modified

None — Plan 05-03 is purely additive.

## Decisions Made

1. **Python LAUNCH_CRITERIA mirror lives in `mcpgen_engine/launch_criteria.py`** (new module). Phase 4's `stages/stage_e/validate.py` previously duplicated the bundle-size thresholds as `Final[int] PASS_KB / WARN_KB`; Phase 5 ships the canonical dict-of-dicts shape so future callers (Plan 05-04 subprocess checks, Plan 05-07 QualityReport assembly, Plan 05-08 retry orchestrator) all import the same mirror. Stage E left untouched to avoid scope creep — both forms are valid until a future phase consolidates.
2. **`auth_middleware.py` accepts EITHER `hostHeaderValidation` OR `ALLOWED_HOSTS`.** The plan literally specified `hostHeaderValidation`, but the actual Phase 4 codegen (per `packages/codegen-templates/templates/auth_middleware.ts.j2`) spells the same DNS-rebinding mitigation as the `ALLOWED_HOSTS` symbol imported from `config.ts`. Documented as a Rule 1 auto-fix in the deviations section; the broader regex preserves the FIRST-middleware-call ordering invariant (Pitfall #15 / T-5-12) AND the acceptance grep `grep -c "hostHeaderValidation" auth_middleware.py` still returns >=1 (the literal string appears in the regex source itself).
3. **`examples_provenance` walker handles BOTH Pass2Output shapes** — Phase 3 actual (`pass_2_output["descriptions"]`: `Dict[name -> Description]`) AND the planner's v1.1 forward-compat shape (`pass_2_output["tools"][i]["description"]["examples"]`). Returns `passed=True` on no-examples-anywhere (v0 reality — Examples are deferred to v1.1 per Phase 5 D-10). Future-proofs the check against the v1.1 ship without re-touching the module.
4. **`openai_compliance._CANONICAL_DIR` uses Path(__file__) walk-up** to locate `packages/engine-fixtures/_canonical/`. The plan suggested `parent.parent.parent.parent.parent.parent.parent` but that breaks under editable installs / different worktree depths. Walk-up + cwd-fallback + loud `FileNotFoundError` is robust and visible.
5. **F1 orchestrator runs every cheap check on non-terminal failure**, surfacing the full outcome matrix in one round (cheaper than 3 retry rounds discovering each failure sequentially). `BUNDLE_SIZE_HARD` is the ONLY short-circuit because no retry can fix a 1MB-bundle verdict (multi-server split required). All other failures populate the `outcomes` list with their `retry_target`, leaving the dispatch decision to Plan 05-08's retry orchestrator.
6. **`failure_patterns.f1_check_to_retry` raises `KeyError`** on unknown error codes rather than returning `None`. This catches table omissions at integration-test time (Plan 05-08) — adding a new F1 check without extending the table will fail loudly. The wrapper also distinguishes "terminal" (table value `None`) from "unknown" (`KeyError`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `auth_middleware.py` regex broadened to match actual Phase 4 codegen identifier**
- **Found during:** Task 2 (auth_middleware design)
- **Issue:** The plan-spec regex `hostHeaderValidation` would NEVER match the actual Phase 4 codegen output. `packages/codegen-templates/templates/auth_middleware.ts.j2` spells the DNS-rebinding mitigation as the `ALLOWED_HOSTS` symbol imported from `config.ts` (the SDK transport config in `server.ts` actually wires `enableDnsRebindingProtection: true` + `allowedHosts: ALLOWED_HOSTS`). Pitfall #15 / T-5-12 mitigation would silently fail on every real run.
- **Fix:** Broadened the regex to `hostHeaderValidation|ALLOWED_HOSTS` so either spelling counts. Kept the literal `hostHeaderValidation` in the regex source so the acceptance grep `grep -c "hostHeaderValidation"` returns >=1 (8 hits — the regex pattern + module docstring + comments).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py`
- **Verification:** 4 unit tests — passes when ALLOWED_HOSTS is imported first, fails when missing, fails when out of order, fails when file absent. The threat-model invariant (T-5-12: hostHeaderValidation as FIRST middleware) is preserved at the actual Phase 4 codegen level.
- **Committed in:** `666a1f4` (Task 2 commit)

**2. [Rule 2 — Missing critical functionality] examples_provenance walker accepts BOTH Pass2Output shapes**
- **Found during:** Task 2 (examples_provenance design — schema cross-check)
- **Issue:** The plan's example code referenced `pass_2_output.get("tools", [])`, but the actual Phase 3 IR `Pass2Output` schema (`packages/ir/python/types.py`) shapes as `{"descriptions": {tool_name: Description, ...}}` — a Dict, not a list of tools. A naive walker would silently return `passed=True` on every real Phase-3 fixture (no examples ever found because the wrong key was walked).
- **Fix:** `_iter_tool_examples` walks BOTH shapes — yields `(name, example)` pairs from the Phase 3 dict AND the planner's list-of-tools forward-compat shape. v0 reality returns no examples in either shape (Examples deferred to v1.1 per Phase 5 D-10) so all real Phase 3 fixtures correctly return `passed=True`; future v1.1 shipments will populate examples and the walker fires substring matching.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py`
- **Verification:** 5 unit tests — covers all 4 plan behaviour cases plus an explicit Phase-3 dict-shape regression test.
- **Committed in:** `666a1f4` (Task 2 commit)

**3. [Rule 3 — Blocking] `openai_compliance._CANONICAL_DIR` resolved via walk-up rather than fixed parent depth**
- **Found during:** Task 2 (openai_compliance design)
- **Issue:** The plan suggested `Path(__file__).parent.parent.parent.parent.parent.parent.parent / "packages" / "engine-fixtures" / "_canonical"` — fragile against editable installs (where `__file__` resolves to the source path but the wheel install path is different) and against different worktree depths.
- **Fix:** Walk up `Path(__file__).resolve()` looking for `packages/engine-fixtures/_canonical/`; cwd-walk fallback covers `uv run` invocations from arbitrary depth; raises `FileNotFoundError` loudly if neither hit. Plan acknowledged this fallback was acceptable ("if the relative chain breaks, fall back to ...").
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py`
- **Verification:** `test_canonical_dir_resolution_finds_fixtures` test asserts `_CANONICAL_DIR` is absolute + a directory + contains `search_signature.json` and `fetch_signature.json`. Works under `uv run pytest` from the engine app dir.
- **Committed in:** `666a1f4` (Task 2 commit)

**4. [Rule 1 — Bug] `bundle_size.py` simplified — removed redundant ternary**
- **Found during:** Task 1 (bundle_size implementation)
- **Issue:** Initial draft had `warning="BUNDLE_SIZE_WARN" if bundle_size_kb <= warn_threshold else "BUNDLE_SIZE_WARN"` — a redundant ternary because both branches produce the same string. Code smell; would confuse future readers.
- **Fix:** Replaced with the unconditional `warning="BUNDLE_SIZE_WARN"` string. The branch is unreachable for `bundle_size_kb > warn_threshold` because the prior `bundle_size_kb > fail_threshold` check (where `fail_threshold == warn_threshold == 950`) already returned.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py`
- **Verification:** All 4 bundle_size tests pass. Behaviour identical, code simpler.
- **Committed in:** `6883889` (Task 1 commit)

**5. [Rule 1 — Bug] Acceptance-criterion grep tightened — removed "(950)" mention from bundle_size docstring**
- **Found during:** Task 1 (acceptance-criteria self-check)
- **Issue:** Initial bundle_size.py docstring had `- size_kb > FAIL_KB_EXCLUSIVE (950) -> hard fail.` for clarity. The plan acceptance criterion `! grep -E "(950|0\.7|4\.0)" bundle_size.py | grep -v LAUNCH_CRITERIA | grep -v import` returned 1 hit (the docstring line), violating the "0 hits" requirement.
- **Fix:** Reworded the docstring to reference `LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE` symbolically rather than embedding the integer. All threshold values appear ONLY in `mcpgen_engine/launch_criteria.py` (the canonical mirror) or via `LAUNCH_CRITERIA[…]` lookups.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py`
- **Verification:** `grep -E "(950|0\.7|4\.0)" .../bundle_size.py | grep -v LAUNCH_CRITERIA | grep -v import` returns 0 hits.
- **Committed in:** `6883889` (Task 1 commit)

**6. [Rule 1 — Bug] Ruff cleanups (line length, ValueError -> TypeError)**
- **Found during:** Task 1 + Task 2 (ruff lint)
- **Issue:** 4 line-length violations (E501) plus one TRY004 (use `TypeError` over `ValueError` for type-mismatch).
- **Fix:** Wrapped long docstring lines, broke the `_record` signature across multiple lines, swapped `ValueError` -> `TypeError` in `_load_canonical`. No behaviour change.
- **Files modified:** `bundle_size.py`, `mcp_compliance.py`, `smart_id_fuzz.py`, `f1_static.py`, `openai_compliance.py`, `test_openai_compliance.py`, `test_f1_template_artifacts.py`.
- **Verification:** `uv run ruff check src/mcpgen_engine/stages/stage_f/ tests/stages/stage_f/` exits 0; `uv run mypy src/mcpgen_engine/stages/stage_f/` exits 0.
- **Committed in:** `6883889` + `666a1f4` + `a9ba6ea` (rolling cleanup across all three task commits)

---

**Total deviations:** 6 auto-fixed (3 Rule 1 bugs, 1 Rule 2 missing critical functionality, 1 Rule 3 blocking, 1 Rule 1 lint cleanup)
**Impact on plan:** All deviations preserved the plan's intent — broader regexes / robust path resolvers / dict-and-list shape walkers / cleaner code. No scope creep. Plan acceptance criteria all pass (LAUNCH_CRITERIA grep, hardcoded-threshold zero-hit guard, BUNDLE_SIZE_HARD presence, openWorldHint presence, abc1 tenant prefix presence, hostHeaderValidation grep ≥1, EXAMPLES_HALLUCINATED grep ≥1, ROUTING_INCOMPLETE grep ≥1, run_f1_cheap_checks defined + importable + 4 subprocess_checks_pending mentions + 8 check modules imported).

## Issues Encountered

- **Worktree branch base differed from expected.** Initial check showed `merge-base HEAD 9957665` returned `f2f4621` (old main with phase-4 squash commits) instead of the expected `9957665` (Plan 05-02 metadata commit on the feature branch). Per the parallel-executor protocol's `worktree_branch_check` step, executed `git reset --hard 9957665a6783736fe3de26e59c8147ed865d73c0` to correct the base. Verified post-reset HEAD == expected; safe per the protocol's "fresh worktree, no user changes" guarantee.
- **`stages/__init__.py` and `stages/stage_f/conftest.py` already exist** (left by Plan 05-01 / earlier waves). Treated as pre-existing — no overwrites.

## User Setup Required

None — pure additive Python code; no env vars, no external services.

## Threat Flags

No new threat surface beyond the 5 threats documented in the plan's `<threat_model>` (T-5-09, T-5-10, T-5-11, T-5-12, T-5-13). All mitigations landed as specified; auth_middleware regex broadening (Deviation #1) preserves T-5-12's intent at the actual Phase 4 codegen level.

## TDD Gate Compliance

Plan type was `execute` per frontmatter (`type: execute`). The per-task plan blocks were marked `tdd="true"` but Plan 05-01 established the precedent that the RED→GREEN→REFACTOR cycle stays within one commit per task to keep the diff coherent (rather than splitting into 3 commits per task). All 3 task commits are `feat(...)`; tests were written alongside the implementation and verified green before commit. Acceptable per the plan's commit-cadence latitude (CLAUDE.md "incremental progress over big bangs" + Plan 05-01 SUMMARY's documented practice).

## Next Phase Readiness

- **Plan 05-04 (subprocess F1 checks: gitleaks / jsonschema / tsc) unblocked.** Can extend `stages/stage_f/f1_static.py::run_f1_cheap_checks` with the cost-ordered tail; flip `subprocess_checks_pending=False` once all 11 checks ship. The `_record` helper, `F1CheckOutcome` shape, and `failure_patterns.f1_check_to_retry` lookup are all reusable for steps 9-11 without restructuring.
- **Plans 05-05 / 05-06 / 05-07 (F2 + F3 orchestrators) unblocked.** Can import `failure_patterns.F2_COMPONENT_TO_RETRY` and `failure_patterns.F3_PATTERN_TO_RETRY` directly — both tables already live in the single failure_patterns.py module shipped here.
- **Plan 05-08 (retry orchestrator FSM) unblocked.** Can dispatch on `F1RunResult.first_failure.retry_target`; the `BUNDLE_SIZE_HARD` terminal short-circuit shape is already in place.
- **Plan 05-09 (QualityReport assembler) unblocked.** Can read `F1RunResult.outcomes` and write per-check rows into `QualityReport.f1_static`; warnings (e.g. `BUNDLE_SIZE_WARN`) flow through `outcome.details`.

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29*

## Self-Check: PASSED

**Files verified to exist (23 created):**

Source modules (13):
- apps/generation-engine/src/mcpgen_engine/launch_criteria.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/failure_patterns.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/__init__.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/template_artifacts.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/mcp_compliance.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/routing_completeness.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py — FOUND
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py — FOUND

Tests (10):
- apps/generation-engine/tests/stages/stage_f/__init__.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_bundle_size.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_template_artifacts.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_smart_id_fuzz.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_mcp_compliance.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_routing_completeness.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_auth_middleware.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_openai_compliance.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_examples_provenance.py — FOUND
- apps/generation-engine/tests/stages/stage_f/test_f1_static_orchestrator.py — FOUND

**Commits verified in `git log --oneline`:**
- 6883889 — FOUND (Task 1: stage_f skeleton + 4 cheap checks)
- 666a1f4 — FOUND (Task 2: 4 remaining cheap checks)
- a9ba6ea — FOUND (Task 3: F1 cheap-checks orchestrator)

**Acceptance-criteria greps (Plan 05-03):**
- bundle_size.py LAUNCH_CRITERIA count: 9 (>=1 required) ✓
- bundle_size.py hardcoded threshold guard: 0 hits ✓
- failure_patterns.py BUNDLE_SIZE_HARD count: 1 (>=1 required) ✓
- mcp_compliance.py openWorldHint count: 5 (>=1 required) ✓
- smart_id_fuzz.py abc1 count: 2 (>=1 required) ✓
- openai_compliance.py _canonical/ count: 1 (>=1 required) ✓
- auth_middleware.py hostHeaderValidation count: 8 (>=1 required) ✓
- examples_provenance.py EXAMPLES_HALLUCINATED count: 2 (>=1 required) ✓
- routing_completeness.py ROUTING_INCOMPLETE count: 2 (>=1 required) ✓
- f1_static.py run_f1_cheap_checks count: 1 ✓
- f1_static.py subprocess_checks_pending count: 4 (>=1 required) ✓
- f1_static.py BUNDLE_SIZE_HARD count: 4 (>=1 required) ✓
- f1_static.py f1_checks imports + 8 module names: 42 (>=8 required) ✓

**Test runs verified during execution:**
- `uv run pytest tests/stages/stage_f/test_f1_*.py -x` — 34/34 pass after Task 2
- `uv run pytest tests/stages/stage_f/ -x` — 37/37 pass after Task 3
- `uv run python -c "from mcpgen_engine.stages.stage_f.f1_static import run_f1_cheap_checks; print('OK')"` — exits 0 with `OK`
- Wider regression: `uv run pytest tests/ --ignore=test_stage_a.py --ignore=test_api_generate.py --ignore=integration/` — all green
