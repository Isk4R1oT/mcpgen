---
phase: 03-generation-engine-author-pass-2-3-4
plan: 05
subsystem: engine
tags: [pass-3, parameter-extraction, deterministic, json-schema, smart-id, filter-design, pydantic]

# Dependency graph
requires:
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "Pass1Output (Tool1 with name/type/source_endpoints + Routing1) and RawIR (Endpoint with parameters: List[Dict[str, Any]] + request_body: Optional[Dict[str, Any]] + tags)"
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "Plan 03-01 pass_3 package skeleton (placeholder __init__.py)"
provides:
  - "ParameterSpec Pydantic class (extra=forbid) capturing per-parameter spec — name/type/format/enum/pattern/minimum/maximum/min_length/max_length/default/required/is_smart_id/is_filter/entity_hint/source_endpoint_id/source_field/description"
  - "extract_params(raw_ir, pass_1_output) -> dict[tool_name, list[ParameterSpec]] — pure-function deterministic extractor"
  - "Universal-tool minimal signatures hardcoded per D-21 (search/fetch/list_collections/list_objects/upsert/delete) — Plan 03-08 standards.py replaces with full Appendix A"
  - "Smart-ID detection regex `^(id|[a-z][a-z0-9_]*_id)$` (case-insensitive) for downstream Plan 03-08 smart_id.py"
  - "Filter-name detection (filter/where/q) for downstream Plan 03-07 filter_design.py"
  - "Defensive endpoint_not_found warning surface (T-03-extract-missing) — never raises; tool gets empty list and continues"
affects: [pass_3, pass-3-enrich, pass-3-filter-design, pass-3-naming, pass-3-smart-id, pass-3-standards, pass-3-validation, pass-3-quality-gate, plan-03-06, plan-03-07, plan-03-08, plan-03-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen-IR dict-walking pattern: Endpoint.parameters/request_body are List[Dict[str, Any]]/Optional[Dict[str, Any]] in the codegen'd IR — extract.py uses .get() defensive accessors instead of attribute access (avoids fragile getattr fallbacks)"
    - "Universal-tool name → enum mapping via _NAME_TO_UNIVERSAL: Tool1 in IR carries only name+type+source_endpoints (no separate universal_tool field), so we map tool.name to UniversalTool enum members"
    - "Final[tuple[dict, ...]] template tables for hardcoded universal signatures — immutable module-level constants matching pass_0/filter.py convention"
    - "structlog warnings + capsys assertion for defensive log testing (matches pass_2/test_run.py pattern; caplog does NOT capture structlog by default)"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py — ParameterSpec class + extract_params walker (376 lines)"
    - "apps/generation-engine/tests/passes/pass_3/test_extract.py — 29 deterministic tests (706 lines)"
  modified: []

key-decisions:
  - "Endpoint.parameters and Endpoint.request_body are dict-typed in the frozen IR (datamodel-code-generator emitted List[Dict[str, Any]] / Optional[Dict[str, Any]]) — NOT Pydantic Parameter / RequestBody classes as the plan's interface block suggested. extract.py uses .get() accessors directly; fallback getattr/schema_-vs-schema dance is unnecessary"
  - "Tool1 in Pass1Output IR has NO universal_tool field — only name/type/source_endpoints. We map tool.name to UniversalTool enum via _NAME_TO_UNIVERSAL constant (auto-built from UniversalTool enum members) for universal-tool dispatch"
  - "Universal tools NEVER walk source_endpoints — even though Pass 1 output lists endpoints under universal tools (for Pass 4 routing), extract.py emits the hardcoded D-21 minimal signature. test_extract_universal_uses_only_minimal_signature_ignoring_endpoints encodes this contract"
  - "_request_body_json_schema fallback scans all content types for an inline `properties`-bearing schema — Stripe IR uses `application/x-www-form-urlencoded` with $ref bodies, so application/json-only would yield zero params. $ref-only bodies (no inline properties anywhere) → return None gracefully (no hallucinated params)"
  - "Test suite uses `capsys: pytest.CaptureFixture[str]` to assert structlog warning output, not `caplog: pytest.LogCaptureFixture` — structlog default config writes to stdout/stderr (matches pass_2/test_run.py:test_run_aggregates_warnings_count_in_log)"
  - "ParameterSpec.default kept as `Any | None` (not narrower) — JSON Schema `default` field is heterogeneous (str/int/bool/None/object); Pydantic preserves the value verbatim and downstream Plan 03-09 validation re-runs JSON Schema validity"
  - "Smart-ID regex matches `^id$` AND `^[a-z][a-z0-9_]*_id$` case-insensitively — both `ID`, `id`, `user_id`, `Charge_Id` flagged as is_smart_id. Naming normalization (Plan 03-08) preserves the user-facing name; the flag drives pattern injection"

patterns-established:
  - "Pure-function pass-stage modules: extract.py exports a single `extract_params(raw_ir, pass_1_output)` function with structlog logger; no global state, no I/O, no LLM imports — verified by test_extract_module_does_not_import_llm"
  - "ParameterSpec as the canonical Pass 3 internal exchange type: every downstream Pass 3 phase (enrich/filter_design/naming/smart_id/standards/validation/quality_gate) consumes `dict[tool_name, list[ParameterSpec]]` as its primary input"
  - "Defensive missing-endpoint handling: log structured warning (`tool_name`, `endpoint_id` only — no spec content per T-03-extract-spec-content-leak) and emit empty list. Pass 1 coverage validator owns upstream gate; Pass 3 surfaces silent drift without blocking"
  - "Universal-tool source_endpoints listed for routing/coverage purposes, but NEVER walked at the parameter-extraction layer — the Six-Tool Pattern signature is fixed by name (Pitfall #32 invariant)"

requirements-completed: [GEN-05]

# Metrics
duration: ~12min
completed: 2026-04-28
---

# Phase 03 Plan 05: Pass 3 deterministic parameter extraction Summary

**`extract_params(raw_ir, pass_1_output) -> dict[str, list[ParameterSpec]]` — pure-function Phase 1 of Pass 3 that walks RawIR endpoints + emits hardcoded D-21 minimal signatures for the 6 universal tools and dict-walked specs (path/query/header + request_body.properties) for action/workflow/specialized tools, with smart-ID + filter detection flagged on the ParameterSpec exchange type.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-28T06:54:00Z (after worktree base reset to df6c347)
- **Completed:** 2026-04-28T07:01:00Z
- **Tasks:** 1 (TDD: RED → GREEN, no refactor needed — first GREEN was clean after one cap-fix)
- **Files modified:** 2 (1 src, 1 test)

## Accomplishments

- Shipped `ParameterSpec` Pydantic class (extra-forbid) carrying the deterministic 5-dimension JSON Schema spec data + Pass 3-specific flags (is_smart_id, is_filter, entity_hint, source_endpoint_id, source_field).
- Shipped `extract_params(raw_ir, pass_1_output)` pure-function walker — universal tools get hardcoded D-21 minimal signatures (full Appendix A standards land in Plan 03-08); action/workflow/specialized tools walk source endpoints in order.
- Smart-ID detection regex `^(id|[a-z][a-z0-9_]*_id)$` (case-insensitive) and filter-name detection (`filter`/`where`/`q`) flagged on ParameterSpec for Plans 03-07 (filter_design) + 03-08 (smart_id).
- Defensive endpoint-not-found resilience: warning logged with structural fields only (tool_name, endpoint_id), tool gets empty list, NO raise (T-03-extract-missing).
- Request-body schema extraction handles Stripe-style `application/x-www-form-urlencoded` bodies AND `application/json` bodies AND $ref-only bodies (graceful skip — no hallucinated params).
- 29 deterministic tests pass; mypy strict clean; ruff clean; 169 total tests in `tests/passes/` all green (no regressions).

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 RED: failing tests** — `361d403` (test) — 29 tests for ParameterSpec class + extract_params behavior; collection error confirms extract.py module not yet authored.
2. **Task 1 GREEN: implementation** — `22f2d74` (feat) — `extract.py` with ParameterSpec + 6 hardcoded universal sigs + dict-walking helpers + structlog warning. Test fix: switched `caplog` → `capsys` (structlog writes to stdout, not stdlib logging). Inline lint cleanup (drop unused noqa/type-ignore, shorten docstring).

_Note: TDD tasks have multiple commits (test → feat). Refactor not needed — implementation passed lint + mypy + 29 tests on first GREEN attempt after the caplog→capsys correction._

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py` (NEW, 376 lines) — `ParameterSpec` Pydantic class (extra=forbid) + `extract_params(raw_ir, pass_1_output) -> dict[str, list[ParameterSpec]]` walker + module-level `_UNIVERSAL_MIN_SIG: Final[dict[UniversalTool, tuple[dict, ...]]]` D-21 minimal signatures + `_SMART_ID_NAME_REGEX` (case-insensitive) + `_FILTER_NAMES: Final[frozenset[str]]` + `_NAME_TO_UNIVERSAL` enum-name index + `_extract_param_dict` / `_extract_request_body_property` / `_request_body_json_schema` helpers + `_endpoint_id` matching Phase 2 `"METHOD path"` shape + `_log = structlog.get_logger(__name__)` for `pass_3.extract.complete` + `pass_3.extract.endpoint_not_found` warnings.
- `apps/generation-engine/tests/passes/pass_3/test_extract.py` (NEW, 706 lines) — 29 deterministic tests via synthetic RawIR/Pass1Output construction (no httpx mocks, no LLM): universal-tool hardcoded sigs (search/fetch/list_objects×4/list_collections/upsert/delete), action endpoint walk (path+body+entity_hint+no-tags), workflow multi-step concatenation, specialized walk, smart-ID detection (user_id/charge_id/ID/amount), filter detection (filter/where/q/amount), missing-endpoint capsys assertion, request_body required-list correctness, format/enum/pattern/minimum propagation, $ref-only body graceful skip, ParameterSpec extras-forbidden invariant, no-LLM-imports regression, universal-ignores-source_endpoints contract.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential:

1. **IR contract correction:** the plan's `<interfaces>` block claimed `Endpoint.parameters: List[Parameter]` and `Endpoint.requestBody: Optional[RequestBody]` (Pydantic classes). The actual frozen IR (`packages/ir/python/types.py`) emits `parameters: List[Dict[str, Any]]` and `request_body: Optional[Dict[str, Any]]` (raw OpenAPI dicts, snake_case). extract.py walks dicts via `.get()` instead of the planned `getattr(schema_, ...) or getattr(schema, ...)` fallback dance — simpler, matches reality, no defensive codegen artifacts.
2. **Tool1.universal_tool field does NOT exist** in the frozen IR. Universal-tool dispatch uses `tool.name` → `UniversalTool` enum via auto-built `_NAME_TO_UNIVERSAL` map.
3. **Universal tools never walk source_endpoints** — even though Pass 1 lists endpoints under each universal tool (for Pass 4 routing), the universal contract is fixed by name. Encoded as `test_extract_universal_uses_only_minimal_signature_ignoring_endpoints`.
4. **`capsys` not `caplog` for structlog warnings** — matches the pass_2/test_run.py convention; caplog does not capture structlog output by default.
5. **Stripe-friendly request_body content-type fallback** — `_request_body_json_schema` tries `application/json` first, then scans all content types for any inline `properties`-bearing schema. Stripe uses `application/x-www-form-urlencoded` with $ref bodies; the fallback ensures we don't miss params on non-JSON-content APIs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IR field names corrected from plan's interface block**
- **Found during:** Task 1 reading `packages/ir/python/types.py` before authoring tests.
- **Issue:** Plan `<interfaces>` block stated `Endpoint.parameters: List[Parameter]` (Pydantic class) and `Endpoint.requestBody: Optional[RequestBody]`. Reality: `parameters: List[Dict[str, Any]]` and `request_body: Optional[Dict[str, Any]]` (snake_case dict). The plan's planned `getattr(schema_, ...) or getattr(schema, ...)` fallback chain would never match real IR data.
- **Fix:** Replaced attribute-walking with dict-walking via `.get()` accessors throughout `_extract_from_endpoint` / `_extract_param_dict` / `_extract_request_body_property` / `_request_body_json_schema`. Test fixtures construct dict-typed parameters/request_body matching the real IR shape.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py`, `apps/generation-engine/tests/passes/pass_3/test_extract.py`.
- **Verification:** 29 tests pass; integration with frozen IR types verified by mypy strict.
- **Committed in:** `22f2d74` (feat commit).

**2. [Rule 1 - Bug] Tool1.universal_tool field does not exist**
- **Found during:** Task 1 reading `packages/ir/python/types.py` lines 489–495 (Tool1 definition).
- **Issue:** Plan behavior block referenced `tool.universal_tool` (e.g. `if tool.universal_tool is None: return []`). Reality: Tool1 IR class has only `name`, `type`, `source_endpoints`. Pass1Output JSON fixture confirms — only those 3 fields per tool.
- **Fix:** Added `_NAME_TO_UNIVERSAL: Final[dict[str, UniversalTool]] = {member.value: member for member in UniversalTool}` constant and looked up universal tools by `tool.name`. Defensive warning `pass_3.extract.unknown_universal_name` for non-canonical names (Pass 1 should never emit such, but defensive logging surfaces drift).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py`.
- **Verification:** Universal-tool tests (search/fetch/list_collections/list_objects/upsert/delete) all pass; `test_extract_universal_search_returns_query_only` confirms dispatch by name works.
- **Committed in:** `22f2d74` (feat commit).

**3. [Rule 3 - Blocking] caplog does not capture structlog output**
- **Found during:** First GREEN test run — 28/29 passed; `test_extract_skips_missing_endpoint_with_warning` failed because `caplog.records` was empty even though structlog clearly printed the warning to stdout (visible in pytest's "Captured stdout call").
- **Issue:** Project uses `structlog` not stdlib `logging`. structlog's default config writes key=value pairs to stdout/stderr; pytest's `caplog` fixture only captures stdlib `logging` records.
- **Fix:** Switched the test from `caplog: pytest.LogCaptureFixture` to `capsys: pytest.CaptureFixture[str]` and asserted on `captured.out + captured.err`. Matches the convention already used in `tests/passes/pass_2/test_run.py:test_run_aggregates_warnings_count_in_log`.
- **Files modified:** `apps/generation-engine/tests/passes/pass_3/test_extract.py`.
- **Verification:** All 29 tests now pass.
- **Committed in:** `22f2d74` (feat commit).

**4. [Rule 1 - Bug] Lint warnings from initial implementation**
- **Found during:** Post-GREEN ruff + mypy run.
- **Issue:** (a) `# noqa: ANN401` on `default: Any | None` was unused (project's `[tool.ruff.lint] ignore = ["ANN401"]` already suppresses it project-wide). (b) `# type: ignore[arg-type]` on `ParameterSpec(**tpl)` was unused (mypy was happy because `dict[str, Any]` unpacks fine into Pydantic kwargs). (c) Test docstring line 153 was 114 chars (>100).
- **Fix:** Removed both unused suppressions; reformatted the docstring to 4-line form.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py`, `apps/generation-engine/tests/passes/pass_3/test_extract.py`.
- **Verification:** ruff + mypy strict both clean; 29 tests still pass.
- **Committed in:** `22f2d74` (feat commit).

---

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs in plan-vs-reality drift, 1 Rule 3 blocking integration gotcha)
**Impact on plan:** All 4 fixes were corrections of plan inaccuracies that would have produced broken or never-matching code. The behavior contract from D-16/D-19/D-20/D-21 is preserved exactly. No scope creep; no new features. The plan's `<interfaces>` block should be corrected by the planner for downstream Pass 3 plans (03-06 enrich, 03-07 filter_design, 03-08 smart_id/standards/naming, 03-09 validation) — they all consume the same `RawIR.endpoints[*].parameters` / `request_body` shape.

## Issues Encountered

- None during planned work after the deviations above were applied. The implementation passed lint + mypy + 29 tests on the second iteration.

## User Setup Required

None — purely deterministic Python module + tests; no external services, no env vars, no DB migrations.

## Next Phase Readiness

- **Plan 03-06 (Pass 3 enrich.py):** can now `from mcpgen_engine.passes.pass_3.extract import ParameterSpec, extract_params`. The dict-walking pattern + dict-typed test fixtures established here is the template for Plan 03-09's cross-parameter validation tests too.
- **Plan 03-07 (Pass 3 filter_design.py):** consume `is_filter` flag on ParameterSpec — every test fixture demonstrating filter detection (filter/where/q) is already in this plan's test suite.
- **Plan 03-08 (Pass 3 smart_id.py + standards.py + naming.py):** consume `is_smart_id` flag for pattern injection (smart_id.py); replace `_UNIVERSAL_MIN_SIG` minimal templates with full Appendix A descriptions (standards.py); use `entity_hint` for bare-name normalization rules (naming.py).
- **Plan 03-09 (Pass 3 validation.py + run orchestrator):** call `extract_params()` as the deterministic seed; cross-param validation needs the `name` uniqueness + `required` correctness + `oneOf` mutual-exclusivity checks operating on `dict[tool_name, list[ParameterSpec]]`.
- **Plan correction recommendation:** the planner should update the `<interfaces>` block in Plans 03-06 / 03-07 / 03-09 to reflect the dict-typed reality of `Endpoint.parameters` and `Endpoint.request_body` so downstream executors don't re-hit the same plan-vs-reality drift.

## Self-Check: PASSED

Verified:

- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/extract.py` — FOUND (created in `22f2d74`).
- `apps/generation-engine/tests/passes/pass_3/test_extract.py` — FOUND (created in `361d403`).
- Commit `361d403` (test RED) — FOUND in `git log --oneline`.
- Commit `22f2d74` (feat GREEN) — FOUND in `git log --oneline`.
- `grep -F "class ParameterSpec"` extract.py → matches.
- `grep -F "def extract_params"` extract.py → matches.
- `grep -F "ConfigDict(extra="` extract.py → matches.
- `grep -F "is_smart_id"` extract.py → matches.
- `grep -F "is_filter"` extract.py → matches.
- `grep -F "_UNIVERSAL_MIN_SIG"` extract.py → matches.
- `grep -F "entity_hint"` extract.py → matches.
- `grep -F "_SMART_ID_NAME_REGEX"` extract.py → matches.
- `grep -F "endpoint_not_found"` extract.py → matches.
- `grep -E "from mcpgen_engine\\.llm"` extract.py → NO matches (deterministic — verified by `test_extract_module_does_not_import_llm`).
- `cd apps/generation-engine && uv run pytest tests/passes/pass_3/test_extract.py -x -v` → 29 passed (target was ≥17).
- `cd apps/generation-engine && uv run mypy src/mcpgen_engine/passes/pass_3/extract.py tests/passes/pass_3/test_extract.py` → Success: no issues found.
- `cd apps/generation-engine && uv run ruff check src/mcpgen_engine/passes/pass_3/extract.py tests/passes/pass_3/test_extract.py` → All checks passed!
- `cd apps/generation-engine && uv run pytest tests/passes/` → 169 passed (no regressions).
- `cd apps/generation-engine && uv run python -c "from mcpgen_engine.passes.pass_3.extract import ParameterSpec, extract_params; print('OK')"` → OK.

---

*Phase: 03-generation-engine-author-pass-2-3-4*
*Plan: 05*
*Completed: 2026-04-28*
