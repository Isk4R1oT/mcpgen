---
phase: 03-generation-engine-author-pass-2-3-4
plan: 07
subsystem: generation-engine
tags: [pass-3, filter-design, json-schema, deterministic, no-llm]

# Dependency graph
requires:
  - phase: 02-generation-engine-architect-pass-0-1
    provides: RawIR (frozen) + Pass1Output + ParameterSpec.is_filter contract
  - phase: 03-generation-engine-author-pass-2-3-4 (Plan 03-01)
    provides: Pass 3 module skeleton + structlog convention
  - phase: 03-generation-engine-author-pass-2-3-4 (Plan 03-05)
    provides: pass_3.extract.ParameterSpec with is_filter flag
provides:
  - FilterStrategy enum (A/B/C — D-18 verbatim)
  - STRUCTURED_OBJECT_OPERATORS frozen 9-tuple (T-03-AP mitigation)
  - detect_filter_strategy(raw_ir, extracted) — deterministic D-18 decision tree
  - emit_filter_schema(strategy, params) — JSON Schema fragment per strategy
  - _has_native_query_language helper (description-regex match)
  - _is_simple_filter_param helper (scalar type + no pattern)
affects:
  - "Plan 03-09 (cross-parameter validation + final assembly): calls detect_filter_strategy ONCE per server, applies emit_filter_schema uniformly"
  - "Plan 03-12 (Pass 3 fixture freeze): fixtures must match the chosen filter strategy"
  - "Phase 5 F2 smell scan: filter shape consistency is rubric-checkable"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — uses stdlib (re, enum, typing) + structlog + Pydantic IR types
  patterns:
    - "Deterministic strategy selector with frozen-tuple constants (Final[tuple[str, ...]])"
    - "Defensive vendor-extension lookup via getattr(ep, 'extensions', None) — forward-compatible with Plan 02-02 frozen IR"
    - "Sentinel marker (_individual_params_marker) for downstream lifting decisions"
    - "Structural-only logging (T-03-spec-content-leak): log fields are strategy + reason + count, NEVER spec text"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/filter_design.py
    - apps/generation-engine/tests/passes/pass_3/test_filter_design.py
  modified: []

key-decisions:
  - "FilterStrategy uses StrEnum (Python 3.11+ canonical) instead of (str, Enum) because ruff UP042 enforces it; semantically identical to plan body's `class FilterStrategy(str, Enum)`."
  - "_has_native_query_language is implemented with defensive getattr for x-query-language extension lookup — Plan 02-02 froze IR Endpoint with extra='forbid' (no extensions field), so the extension signal currently always returns False; the description-regex signal covers it. Forward-compatible with a future Endpoint.extensions addition."
  - "INDIVIDUAL_PARAMS branch requires `len(filter_params) > 0` AND `≤4` AND all-simple — empty extracted falls through to STRUCTURED_OBJECT default, matching D-18 wording (the threshold check applies only when filters exist)."
  - "Strategy C emits `_individual_params_marker: True` sentinel so Plan 03-09 caller can detect and lift to top-level inputSchema properties (vs nesting under a `filter` key)."
  - "Strategy C truncates per-param descriptions to 300 chars to keep JSON Schema lean (matches MCP-Bundles 5-component param description ceiling)."

patterns-established:
  - "Pass 3 deterministic phase pattern: pure-function module with `detect_*` selector + `emit_*` shape function + private `_has_*` / `_is_*` predicates, mirroring pass_1/classify.py shape."
  - "Frozen-constant invariant pattern: Final[tuple[str, ...]] + module-level docstring marker `DO NOT extend without docs/decisions/ entry` (mitigates Tampering threats from LLM enrichment in adjacent phases)."

requirements-completed: [GEN-05]

# Metrics
duration: 6min
completed: 2026-04-28
---

# Phase 03 Plan 07: Pass 3 Filter Design Selector Summary

**Deterministic A/B/C filter-strategy selector for Pass 3 — one strategy per server (D-18 invariant), frozen 9-operator enum (T-03-AP mitigation), no LLM, 37 unit tests green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-28T02:08:04Z
- **Completed:** 2026-04-28T02:14:50Z (approx)
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments

- `FilterStrategy` enum with exactly 3 members (A=STRUCTURED_OBJECT, B=DSL_STRING, C=INDIVIDUAL_PARAMS) — D-18 verbatim values.
- `STRUCTURED_OBJECT_OPERATORS` frozen 9-tuple matching Pass 3 design §11.1 verbatim — locks the operator surface against LLM extension (T-03-AP mitigation; downstream Plan 03-09 cross-param validation will reject any operator outside this enum).
- `detect_filter_strategy(raw_ir, extracted) -> FilterStrategy` — D-18 decision tree: native-query-language hint → DSL_STRING; ≤4 simple-equality filters → INDIVIDUAL_PARAMS; else → STRUCTURED_OBJECT (default).
- `emit_filter_schema(strategy, params)` — emits the JSON Schema fragment per strategy:
  - **A:** `{type:'object', properties:{property,operator,value}, additionalProperties:false}` with frozen operator enum embedded.
  - **B:** `{type:'string', description:'<DSL hint>'}`.
  - **C:** `{type:'object', properties:{<one per simple filter>}, additionalProperties:false, _individual_params_marker:true}` — sentinel signals downstream caller (Plan 03-09) to lift to top-level inputSchema.
- 37 unit tests covering: enum values, frozen-tuple verbatim, threshold constant, all 3 detection branches + boundary (`≤4 → INDIVIDUAL`, `=5 → STRUCTURED`), pattern-disqualifies-simple, object/array-disqualifies-simple, multi-tool aggregation (server-scope per D-18), determinism, all 3 emit shapes, marker presence, description truncation, and T-03-spec-content-leak logging assertion (matched description text never logged).
- Whole `tests/passes/` test suite: **206/206 passing** (no regressions).
- mypy clean, ruff clean.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor convention):

1. **Task 1 — RED:** `4906ba9` — `test(03-07): add failing tests for Pass 3 filter_design selector` (37 tests, importing not-yet-existent module → ImportError)
2. **Task 1 — GREEN:** `8cd931c` — `feat(03-07): implement Pass 3 deterministic filter_design selector` (filter_design.py + ruff-applied import sort)

REFACTOR phase skipped — code is already clean (mypy + ruff pass cleanly), no duplication or smells to address.

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/filter_design.py` (NEW, 246 lines) — FilterStrategy enum + frozen operators + detect_filter_strategy + emit_filter_schema + 3 private helpers (`_has_native_query_language`, `_is_simple_filter_param`, `_collect_filter_params`).
- `apps/generation-engine/tests/passes/pass_3/test_filter_design.py` (NEW, 526 lines) — 37 unit tests across 8 sections.

No other files touched (per parallel-executor scope: no STATE.md / ROADMAP.md / other pass_3 modules).

## Decisions Made

- **`StrEnum` instead of `(str, Enum)`** — ruff UP042 enforces `enum.StrEnum` for str-mixin enums on Python 3.11+; project targets 3.12. Semantically identical to plan body's `class FilterStrategy(str, Enum)` and produces the same `.value == "A"`/`"B"`/`"C"` string values that downstream consumers compare against.
- **`_has_native_query_language` defensive vendor-extension lookup** — Plan 02-02 froze the IR `Endpoint` with `extra='forbid'` and explicitly did NOT add an `extensions` field (per CONTEXT.md decision: "Endpoint.extensions field NOT added (FROZEN IR has extra='forbid')"). The `getattr(ep, 'extensions', None)` always yields `None` today; the description-regex signal carries the full detection load. Kept the extension-lookup branch for forward-compatibility with a possible future IR addition (zero runtime cost).
- **INDIVIDUAL_PARAMS guard `len(filter_params) > 0`** — D-18 says "elif filter_param_count <= 4 AND all simple operators". `len(empty) == 0 <= 4` would technically satisfy the threshold, but with no filters there is nothing to lift; falling through to STRUCTURED_OBJECT (the safe default) is the intended behavior. Test `test_detect_strategy_structured_when_no_filter_params` locks this in.
- **`_individual_params_marker: true` sentinel in Strategy C output** — Plan 03-09 (cross-parameter validation + final assembly) is responsible for distributing the individual params as TOP-LEVEL inputSchema properties (not nested under a `filter` key). The sentinel makes the contract explicit and is easily strippable downstream.
- **300-char truncation for per-param descriptions in Strategy C** — keeps the lifted top-level inputSchema lean. MCP-Bundles 5-component param description target is in this range; longer descriptions go to the per-tool description block authored by Pass 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Lint] Switched `(str, Enum)` to `StrEnum` per ruff UP042**
- **Found during:** Task 1 GREEN phase verification
- **Issue:** `class FilterStrategy(str, Enum)` (verbatim from plan body) trips `ruff UP042` ("Class FilterStrategy inherits from both str and enum.Enum — Inherit from enum.StrEnum").
- **Fix:** Changed import to `from enum import StrEnum` and class to `class FilterStrategy(StrEnum)`. Semantically identical; preserves `.value == "A"` etc.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_3/filter_design.py`
- **Verification:** ruff clean, all 37 tests still pass, `FilterStrategy.STRUCTURED_OBJECT.value == "A"` confirmed by test.
- **Committed in:** `8cd931c` (Task 1 GREEN commit).

**2. [Rule 1 — Lint] ruff `--fix` re-sorted test file imports**
- **Found during:** Task 1 GREEN phase verification
- **Issue:** Initial test file had imports in `STRUCTURED_OBJECT_OPERATORS, FilterStrategy, _has_native_query_language, _INDIVIDUAL_PARAMS_THRESHOLD, _is_simple_filter_param, ...` order — ruff I001 flagged it.
- **Fix:** Ran `uv run ruff check --fix` to auto-sort imports alphabetically (private `_INDIVIDUAL_*` and `_has_*` / `_is_*` first, then public).
- **Files modified:** `apps/generation-engine/tests/passes/pass_3/test_filter_design.py`
- **Verification:** ruff clean, all 37 tests still pass.
- **Committed in:** `8cd931c` (Task 1 GREEN commit, alongside the implementation).

### Acceptance-criteria notes (NOT deviations — semantic intent preserved)

- The plan's acceptance grep `grep -F '"Equal", "NotEqual", "GreaterThan", "LessThan"' …` looks for the operators on a single line. Ruff format places each tuple element on its own line (project convention), so this exact grep does not literally match. The semantic intent (frozen 9-operator enum, exact values, in exact order) is preserved verbatim and is **explicitly tested** by `test_structured_object_operators_frozen_enum` which compares against the literal 9-tuple. All other 14 acceptance greps match.

---

**Total deviations:** 2 auto-fixed (both lint-only, content unchanged).
**Impact on plan:** Zero. Both fixes are stylistic; semantic contract (D-18 verbatim + T-03-AP frozen enum) is preserved.

## Issues Encountered

None. Plan body was unusually well-specified (verbatim D-18 decision tree + concrete code blocks), so implementation was a direct transcription with two ruff stylistic adjustments.

## User Setup Required

None — pure-function module, no env vars, no external services, no LLM credentials.

## Next Phase Readiness

- **Plan 03-08 (smart-ID + standards + naming)** can proceed in parallel; no overlap with `filter_design.py`.
- **Plan 03-09 (cross-parameter validation + final Pass3Output assembly)** has the contract it needs:
  - Call `detect_filter_strategy(raw_ir, extracted)` ONCE per server.
  - For each `list_objects`-style tool, set `inputSchema.properties.filter = emit_filter_schema(strategy, filter_params_for_this_tool)`.
  - For Strategy C, detect `_individual_params_marker: True` in the returned schema and LIFT `properties.*` to top-level `inputSchema.properties`, dropping the `filter` key.
  - Validate consistency: all `list_objects`-style tools in one server emit the SAME strategy (D-18 invariant — fail loudly if otherwise, since Plan 03-09 is the call-site that enforces it).

## Self-Check: PASSED

Verified post-write:

- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/filter_design.py`: **FOUND**
- `apps/generation-engine/tests/passes/pass_3/test_filter_design.py`: **FOUND**
- Commit `4906ba9` (RED): **FOUND** in git log
- Commit `8cd931c` (GREEN): **FOUND** in git log
- All 14 acceptance greps from plan (excluding the single-line operator grep noted above) match.
- 37/37 plan-specific tests pass; 206/206 full pass_3 suite tests pass; mypy clean; ruff clean.
- No LLM imports (`grep -E "from mcpgen_engine\\.llm" filter_design.py` → 0 matches).

---
*Phase: 03-generation-engine-author-pass-2-3-4*
*Plan: 07*
*Completed: 2026-04-28*
