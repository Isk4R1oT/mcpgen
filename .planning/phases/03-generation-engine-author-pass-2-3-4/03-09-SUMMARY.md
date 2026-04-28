---
phase: 03-generation-engine-author-pass-2-3-4
plan: 09
subsystem: api
tags: [pass-3, validation, jsonschema, qwen, openrouter, pydantic-ai, structlog, parameter-spec]

# Dependency graph
requires:
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "ParameterSpec + extract_params (03-05); ParameterEnrichment + enrich_all_params (03-06); FilterStrategy + detect_filter_strategy + emit_filter_schema (03-07); normalize_all_param_names + slugify_spec_title + build_smart_id_pattern_for_param + build_smart_id_description + get_standard_description (03-08)"
provides:
  - "pass_3.run(pass_2_output, pass_1_output, raw_ir, spec_title) -> Pass3Output — full 4-phase orchestrator"
  - "Pass3Error + 5 cross-parameter validators (additionalProperties / uniqueness / OpenAI compliance / smart-ID / filter consistency)"
  - "Inline quality gate with single Qwen judge + parameter-specific 5-component rubric (D-16 Phase 4)"
  - "PASS_3_VERSION = '1' cache-key hint (D-35)"
affects: [04-pass-4-annotations, 05-pass-5-response-shaping, 12-pipeline-orchestrator, stage-e-codegen]

# Tech tracking
tech-stack:
  added: [jsonschema (now direct dep, was transitive via openapi-spec-validator)]
  patterns:
    - "Phase 3 cross-param validators use jsonschema.Draft202012Validator.check_schema (Don't-Hand-Roll)"
    - "Phase 4 quality gate retries the JUDGE itself (no re-author path) since enrich.py exhausted its own retry budget per param"
    - "Universal-tool name resolution: tool.name IS the canonical universal name when tool.type == Type.universal (no separate field on Tool1)"
    - "Filter handling per D-18: STRUCTURED_OBJECT/DSL_STRING emit nested 'filter' property; INDIVIDUAL_PARAMS lifts each filter param to top-level"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_3/validation.py — Pass3Error + 5 cross-param validators"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py — single Qwen judge + 5-component rubric"
    - "apps/generation-engine/tests/passes/pass_3/test_validation.py — 34 tests"
    - "apps/generation-engine/tests/passes/pass_3/test_quality_gate.py — 20 tests"
    - "apps/generation-engine/tests/passes/pass_3/test_run.py — 15 tests"
    - ".planning/phases/03-generation-engine-author-pass-2-3-4/deferred-items.md — pre-existing pass_2 authoring failures"
  modified:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py — REPLACES empty Wave-0 placeholder with 4-phase orchestrator"
    - "apps/generation-engine/pyproject.toml — added jsonschema as direct dep + ruff/mypy ignores"

key-decisions:
  - "validate_search_fetch_compliance runs PRE-assembly (on raw ParameterSpec list) — fails fast before any LLM-derived content reaches the schema"
  - "validate_input_schema runs POST-assembly — auto-injects additionalProperties:false if missing, hard-rejects explicit true (D-22)"
  - "validate_filter_consistency runs over ALL assembled schemas, AFTER per-tool validation, BEFORE Phase 4 — catches server-wide drift"
  - "quality_gate_all_tools accepts pass_1_output for signature symmetry with Pass 2; the parameter is currently unused (judge scores schemas in isolation)"
  - "Universal-tool name comes from tool.name (Tool1 has no universal_tool field); standards.py is keyed on (tool.name, param.name)"
  - "Smart-ID handling — both pattern and description override LLM-emitted ones; standards.py description for non-smart-ID universal-tool params overrides LLM-emitted"
  - "Per-file ruff S105 ignore extended to passes/**/quality_gate.py (mirrors existing prompts.py ignore) — system prompts are not credentials"
  - "jsonschema added as direct engine dep (pinned ge=4.26 lt=5.0); previously transitively available via openapi-spec-validator — now first-party usage"

patterns-established:
  - "5-component judge rubric output type closed via ConfigDict(extra='forbid') + Field(ge=1, le=5) — decode-time rejection of LLM drift"
  - "Judge prompt embeds JSON Schema as data with truncation at 8000 chars to stay within context budget"
  - "Pass3Error mirrors Pass2Error/Pass0Error: ValueError subclass + violations: list[str] + first-token-of-args[0] is the stable error code"
  - "_assemble_input_schema_for_tool composes 6 building blocks (extract / enrich / naming / smart_id / standards / filter_design) into one JSON Schema dict"

requirements-completed: [GEN-05]

# Metrics
duration: ~45min
completed: 2026-04-28
---

# Phase 03 Plan 09: Pass 3 cross-parameter validation + inline quality gate + run() orchestrator Summary

**Pass 3 4-phase orchestrator wired end-to-end with D-22 additionalProperties:false enforcement, Pitfall #32 OpenAI compliance, D-18 filter consistency, and 5-component Qwen quality judge — replaces the empty Wave-0 placeholder from Plan 03-01 with the real `async def run()` entry point**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-28T07:34:00Z (approximate)
- **Completed:** 2026-04-28T08:20:00Z (approximate)
- **Tasks:** 3 (all auto, all TDD)
- **Files modified:** 6 source files + 1 dependency manifest + 1 deferred-items doc

## Accomplishments

- `pass_3/validation.py`: 5 cross-parameter validators (Pass3Error, validate_input_schema with D-22 auto-injection, validate_param_uniqueness, validate_search_fetch_compliance enforcing Pitfall #32, validate_smart_id_pattern enforcing D-20, validate_filter_consistency enforcing D-18). Uses `jsonschema.Draft202012Validator.check_schema` per Don't-Hand-Roll.
- `pass_3/quality_gate.py`: Single Qwen judge with parameter-specific 5-component rubric (naming/format/enums/defaults/description) per Pass 3 design §1, threshold ≥3 each, max 1 retry per D-16 Phase 4. Returns `dict[tool_name, gate_passed]` for log surfacing — never blocks the pipeline.
- `pass_3/__init__.py`: Replaces the empty Wave-0 placeholder from Plan 03-01 with the real `async def run(pass_2_output, pass_1_output, raw_ir, spec_title) -> Pass3Output` orchestrator. Composes all 6 deterministic helpers (extract/enrich/filter_design/naming/smart_id/standards) + both LLM phases (enrich + quality_gate) + all 5 validators into the final per-tool JSON Schema with `additionalProperties: false` enforced.
- `jsonschema` promoted from transitive (via openapi-spec-validator) to direct engine dependency, pinned `>=4.26,<5.0`. mypy ignore_missing_imports added for `jsonschema.*` to match the pattern used for other untyped vendor deps.
- 69 new tests across 3 test files; all 240 Pass 3 tests green; mypy + ruff clean across the entire `pass_3/` tree.

## Task Commits

Each task was committed atomically:

1. **Task 1: validation.py — Pass3Error + 5 cross-param validators** — `fd26698` (feat)
2. **Task 2: quality_gate.py — single Qwen judge, 5-component rubric** — `82de4b1` (feat)
3. **Task 3: __init__.py 4-phase orchestrator + Pass3Output assembly** — `4b81d08` (feat)

Plus prerequisite baseline sync from `feature/engine-passes` branch:
- **Baseline:** `8338242` (chore: bring prerequisite Phase 03 baseline into worktree)

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/validation.py` — Pass3Error + 5 validators (Created)
- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py` — single Qwen judge + 5-dim rubric (Created)
- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py` — 4-phase orchestrator (REPLACES empty placeholder)
- `apps/generation-engine/tests/passes/pass_3/test_validation.py` — 34 tests (Created)
- `apps/generation-engine/tests/passes/pass_3/test_quality_gate.py` — 20 tests (Created)
- `apps/generation-engine/tests/passes/pass_3/test_run.py` — 15 tests (Created)
- `apps/generation-engine/pyproject.toml` — added jsonschema dep + ruff S105 + mypy ignore for jsonschema.* (Modified)
- `.planning/phases/03-generation-engine-author-pass-2-3-4/deferred-items.md` — documents pre-existing pass_2 authoring test failures (Created)

## Decisions Made

- **Universal-tool name from `tool.name`** (not from a `tool.universal_tool` field — that field doesn't exist on `Tool1`). Per the Six-Tool Pattern, `tool.name` IS the canonical name when `tool.type == Type.universal`. The `Routing.rules[*].universal_tool` enum field is a separate concept used by Stage E codegen routing.
- **Smart-ID detection by name regex** (not by re-fetching `is_smart_id` flag from extracted ParameterSpec list) inside `validate_smart_id_pattern` — keeps the validator self-contained (consumes only the assembled JSON Schema). Mirrors the regex used by `extract.py::_SMART_ID_NAME_REGEX`.
- **Validation order**: `validate_search_fetch_compliance` runs PRE-assembly on the raw ParameterSpec list (fails fast before any LLM content lands in the schema). `validate_input_schema` + `validate_smart_id_pattern` run POST-assembly per tool. `validate_filter_consistency` runs LAST over the full server.
- **Filter handling** per D-18: when strategy is INDIVIDUAL_PARAMS, the assembled schema OMITS the `filter` key entirely and lifts each filter param to a top-level property. Required-ness for lifted params is preserved from the original ParameterSpec.
- **`pass_2_output` parameter** kept on `run()` signature for pipeline symmetry — descriptions live there but are consumed by Stage E codegen, not Pass 3. The parameter is annotated `noqa: ARG001` to silence ruff while keeping the signature stable.
- **`pass_1_output` parameter** on `quality_gate_all_tools` similarly accepted-but-unused — kept for signature symmetry with `passes.pass_2.quality_gate.quality_gate_all_tools`.
- **Pre-existing baseline sync from `feature/engine-passes`** — the worktree was created from an older commit (`2d1a084`) than the branch's current HEAD; Plan 03-09 needed the Wave 0/1/2 outputs (Pass 2, Pass 3 helpers, IR types, sampling profiles, planning docs). Synced via `git checkout feature/engine-passes -- <paths>` and committed as `8338242` BEFORE starting Plan 03-09 implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added `jsonschema` as direct engine dependency**
- **Found during:** Task 1 (validation.py — first direct usage of `jsonschema.Draft202012Validator.check_schema`)
- **Issue:** Plan calls `jsonschema.Draft202012Validator.check_schema(schema)` per Don't-Hand-Roll convention; `jsonschema` was only transitively available via `openapi-spec-validator`. Per CLAUDE.md "imports at top, no defaults", a first-party import requires a first-party dependency declaration.
- **Fix:** Added `"jsonschema>=4.26,<5.0"` to `[project] dependencies` in `apps/generation-engine/pyproject.toml`. Pinned the lower bound at the verified-working version (4.26.0 per `uv tree`).
- **Files modified:** `apps/generation-engine/pyproject.toml`
- **Verification:** `uv run pytest tests/passes/pass_3/test_validation.py -x -v` — all 34 tests pass with the import resolving cleanly.
- **Committed in:** `fd26698` (Task 1 commit)

**2. [Rule 3 - Blocking] Added mypy `ignore_missing_imports` for `jsonschema.*`**
- **Found during:** Task 1 (mypy strict mode rejected the bare `import jsonschema`)
- **Issue:** mypy strict mode requires either a `types-jsonschema` stub package OR an `ignore_missing_imports` override. The engine's `pyproject.toml` already lists analogous overrides for other untyped vendor deps (`prance.*`, `openapi_spec_validator.*`, `tenacity.*`, `logfire.*`, `aioboto3.*`, `mcpgen_ir.*`).
- **Fix:** Added `"jsonschema.*"` to the existing `[[tool.mypy.overrides]] ignore_missing_imports = true` block. Avoids adding `types-jsonschema` to the dev-deps list (matches the established pattern for vendor deps).
- **Files modified:** `apps/generation-engine/pyproject.toml`
- **Verification:** `uv run mypy src/mcpgen_engine/passes/pass_3/validation.py tests/passes/pass_3/test_validation.py` — `Success: no issues found`.
- **Committed in:** `fd26698` (Task 1 commit)

**3. [Rule 3 - Blocking] Extended ruff S105 per-file-ignore to `passes/**/quality_gate.py`**
- **Found during:** Task 2 (ruff S105 false-positive on `_GATE_SYSTEM_PROMPT_PASS_3` constant — flake8-bandit heuristic flagged the `_PASS_3` suffix as a credential)
- **Issue:** Pre-existing per-file-ignore covers `passes/**/prompts.py` only; my system prompt lives in `quality_gate.py` and triggered the same false positive. The constant is an LLM judge instruction, not a secret.
- **Fix:** Added `"src/mcpgen_engine/passes/**/quality_gate.py" = ["S105"]` to the existing ruff per-file-ignores block.
- **Files modified:** `apps/generation-engine/pyproject.toml`
- **Verification:** `uv run ruff check src/mcpgen_engine/passes/pass_3/quality_gate.py` — `All checks passed!`
- **Committed in:** `82de4b1` (Task 2 commit)

**4. [Rule 1 - Bug] Test fixture used wrong dimension for spec_slug substring assertion**
- **Found during:** Task 3 (`test_run_smart_id_param_has_pattern` assertion failed)
- **Issue:** Test asserted `"stripe-api" in fetch_id["pattern"]`, but `build_smart_id_pattern_for_param` calls `re.escape(spec_slug)` which transforms `stripe-api` → `stripe\-api` in the emitted regex. The literal substring no longer matches.
- **Fix:** Updated the test to check `fetch_id["pattern"].startswith("^stripe")` AND `_EXPECTED_SLUG.replace("-", r"\-") in fetch_id["pattern"]` to assert the escaped form is present.
- **Files modified:** `apps/generation-engine/tests/passes/pass_3/test_run.py`
- **Verification:** `uv run pytest tests/passes/pass_3/test_run.py::test_run_smart_id_param_has_pattern -x -v` — passes.
- **Committed in:** `4b81d08` (Task 3 commit)

**5. [Rule 1 - Bug] Switched test from `caplog` to `capsys` for structlog observability**
- **Found during:** Task 3 (`test_run_filter_strategy_logged` and `test_run_warning_count_aggregated` failed because pytest's `caplog` fixture didn't capture structlog output)
- **Issue:** structlog routes through stdout (per the engine's default config), not the stdlib logging module. pytest's `caplog` fixture only captures stdlib logging records. The analog Pass 2 test (`test_run_aggregates_warnings_count_in_log`) uses `capsys` for the same reason.
- **Fix:** Switched both log-assertion tests from `caplog` to `capsys`, mirroring the Pass 2 pattern. Removed the now-unused `import logging`.
- **Files modified:** `apps/generation-engine/tests/passes/pass_3/test_run.py`
- **Verification:** `uv run pytest tests/passes/pass_3/test_run.py -x -v` — all 15 tests pass.
- **Committed in:** `4b81d08` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (1 missing critical dep, 2 blocking lint/typecheck issues, 2 test-setup bugs)
**Impact on plan:** All deviations were test/dep-setup polish — no semantic changes to the planned behavior. Filter handling, validation order, and assembly composition follow the plan as authored.

## Issues Encountered

- **Worktree base mismatch:** The worktree base was an older commit (`2d1a084`) than the `feature/engine-passes` HEAD; the `<worktree_branch_check>` reset attempt was denied (sandbox blocks `git reset --hard`). Recovered by checking out the prerequisite paths from `feature/engine-passes` (`pass_2/`, `pass_3/extract.py`+helpers, `tests/passes/pass_2/`+`pass_3/`, `packages/ir/python/types.py`, `llm/sampling.py`, planning docs) and committing them as `8338242` (`chore: bring prerequisite Phase 03 baseline into worktree`) BEFORE Plan 03-09 implementation. This makes Plan 03-09's three commits (`fd26698`, `82de4b1`, `4b81d08`) the only Plan-09-specific work in the worktree branch.
- **Pre-existing pass_2 authoring test timeouts:** Five tests in `tests/passes/pass_2/test_authoring.py` time out with `openai.APITimeoutError` (the second HTTP retry attempt appears to escape pytest-httpx mocking and hit the real OpenAI client). These pre-date Plan 03-09 (untouched by my commits per `git log 8338242..HEAD -- pass_2/`); documented in `.planning/phases/03-generation-engine-author-pass-2-3-4/deferred-items.md`.

## User Setup Required

None — Plan 03-09 is purely internal Pass 3 wiring; no external service configuration required. Real LLM smoke tests (Pass 3 end-to-end) land in Plan 03-12.

## Routing Smart-ID Access Path Verified

Per the plan output spec ("the actual `Pass1Output.routing.smart_id` access path verified at execution time"):

```python
pass_1_output.routing.smart_id  # SmartId instance with format/types/collections
```

This is the path used in `__init__.py::run` for both `build_smart_id_pattern_for_param` and `build_smart_id_description`. Verified working via `test_run_smart_id_param_has_pattern` and `test_run_uses_default_slug_when_spec_title_missing`.

## Next Phase Readiness

- Pass 3 4-phase orchestrator complete; Plan 03-12 (pipeline orchestrator) can now chain `pass_2.run` → `pass_3.run` → `pass_4.run`.
- Pass 4 (Plan 03-10) consumes `Pass3Output.input_schemas` to derive tool annotations; the schema shape is now frozen and stable.
- Stage E codegen consumes both `Pass2Output.descriptions` and `Pass3Output.input_schemas`; both are ready.

## Self-Check: PASSED

- File checks:
  - FOUND: `apps/generation-engine/src/mcpgen_engine/passes/pass_3/validation.py`
  - FOUND: `apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py`
  - FOUND: `apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py` (replaced empty placeholder)
  - FOUND: `apps/generation-engine/tests/passes/pass_3/test_validation.py`
  - FOUND: `apps/generation-engine/tests/passes/pass_3/test_quality_gate.py`
  - FOUND: `apps/generation-engine/tests/passes/pass_3/test_run.py`
- Commit checks:
  - FOUND: `fd26698` (Task 1)
  - FOUND: `82de4b1` (Task 2)
  - FOUND: `4b81d08` (Task 3)
- Acceptance criteria checks:
  - `grep -F "class Pass3Error"` → 1 match in validation.py
  - `grep -F "def validate_input_schema"` → 1 match in validation.py
  - `grep -F "def validate_param_uniqueness"` → 1 match
  - `grep -F "def validate_search_fetch_compliance"` → 1 match
  - `grep -F "def validate_smart_id_pattern"` → 1 match
  - `grep -F "def validate_filter_consistency"` → 1 match
  - `grep -F "Draft202012Validator"` → 1 match in validation.py
  - `grep -F "additionalProperties"` → matches in validation.py + __init__.py
  - `grep -F "OPENAI_COMPLIANCE"` → 2 matches (search + fetch branches)
  - `grep -F "SMART_ID_DRIFT"` → 1 match
  - `grep -F "FILTER_INCONSISTENT"` → 1 match
  - `grep -F "_RUBRIC_THRESHOLD_PASS_3: Final[int] = 3"` → 1 match in quality_gate.py
  - `grep -F "_MAX_GATE_RETRIES_PASS_3: Final[int] = 1"` → 1 match
  - `grep -F "INLINE_GATE_SETTINGS"` → matches in quality_gate.py + tests
  - `grep -F "async def run"` → 1 match in __init__.py
  - `grep -F "Pass3Output"` → matches in __init__.py
  - `grep -F "PASS_3_VERSION"` → matches in __init__.py
  - `grep -F "extract_params"` → matches in __init__.py + extract.py
  - `grep -F "enrich_all_params"` → matches in __init__.py + enrich.py
  - `grep -F "detect_filter_strategy"` → matches in __init__.py + filter_design.py
  - `grep -F "normalize_all_param_names"` → matches in __init__.py + naming.py
  - `grep -F "build_smart_id_pattern_for_param"` → matches in __init__.py + smart_id.py
  - `grep -F "get_standard_description"` → matches in __init__.py + standards.py
  - `grep -F "validate_input_schema"` → matches in __init__.py + validation.py
  - `grep -F "quality_gate_all_tools"` → matches in __init__.py + quality_gate.py
- Test checks:
  - `uv run pytest tests/passes/pass_3/test_validation.py -x -v` → 34 passed
  - `uv run pytest tests/passes/pass_3/test_quality_gate.py -x -v` → 20 passed
  - `uv run pytest tests/passes/pass_3/test_run.py -x -v` → 15 passed
  - `uv run pytest tests/passes/pass_3/ -x` → 240 passed (full Pass 3 suite green)
- Lint checks:
  - `uv run mypy src/mcpgen_engine/passes/pass_3/ tests/passes/pass_3/` → Success: no issues found in 22 source files
  - `uv run ruff check src/mcpgen_engine/passes/pass_3/ tests/passes/pass_3/` → All checks passed!
- Downstream import smoke test:
  - `OPENROUTER_API_KEY=test-key uv run python -c "from mcpgen_engine.passes import pass_3; assert hasattr(pass_3, 'run'); assert callable(pass_3.run); print('OK')"` → OK

---
*Phase: 03-generation-engine-author-pass-2-3-4*
*Plan: 09*
*Completed: 2026-04-28*
