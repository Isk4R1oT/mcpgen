---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 02
subsystem: generation-engine
tags: [pass-5, output-schema, json-schema, mcp-2025-06-18, deterministic, pydantic]

requires:
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: Pass1Output / Pass3Output / RawIR types — input shapes consumed by output_schema.py
provides:
  - Pass 5 Phase 2 deterministic outputSchema extractor (`output_schema.py`)
  - Canonical metadata wrapper `{id, object_type, data, metadata}` with `additionalProperties: false`
  - Per-universal-tool envelope branch table (search/fetch/list_objects/list_collections/upsert/delete) per Pass 5 design §1.6
  - `OutputSchemaSpec` Pydantic intermediate type with `extra='forbid'`
  - Reusable `sample_response_schemas.json` fixture for Pass 5 unit tests
affects: [pass-5-final-assembly, stage-e-codegen, plan-04-05, plan-04-07]

tech-stack:
  added: []
  patterns:
    - "Per-tool deterministic extractor walking RawIR endpoints (analog Pass 3 extract.py)"
    - "Per-universal-tool branch table via `_UNIVERSAL_ENVELOPE_BUILDERS` (analog Pass 3 standards.py)"
    - "Intermediate Pydantic spec type with extra='forbid' (no IR mutation)"
    - "Canonical metadata wrapper with deep-copied data slot (T-04-02-IR-mutation mitigation)"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/output_schema.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py
    - apps/generation-engine/tests/passes/pass_5/test_output_schema.py
    - packages/engine-fixtures/stripe/sample_response_schemas.json
  modified: []

key-decisions:
  - "Per-tool fn signature is (tool, pass_1_output, raw_ir) — collections required for wrapping_object_type / oneOf aggregation come from Pass1Output.routing.smart_id.collections (frozen IR's Tool1/ToolTaxonomyEntry has no per-tool routing field)"
  - "OutputSchemaSpec carries data_schema field (full envelope) IN ADDITION TO fields (flat per-property map) so to_json_schema can round-trip envelope-specific required lists / array items / oneOf without re-derivation"
  - "Endpoint.responses is Dict[str, Any] in the frozen IR (no Response model with schema_ attr); module walks raw dict via OpenAPI 3.x content[json-ct].schema with OpenAPI 2.x flat schema fallback"
  - "Multi-collection list_objects oneOf aggregation uses conservative {oneOf: [{type: object, additionalProperties: true}, ...]} placeholder — per-collection IR schema lookup deferred to plan 04-05 (frozen RawIR.schemas keyed by raw spec component names, not by Pass 1 collections enum)"
  - "Universal upsert prefers 201 Created → 200 OK → 202 Accepted; everything else prefers 200 → 201 → 202 → 204 (Pass 5 design fallback ladder for OpenAPI dialects)"
  - "Stripe-style {data: array<Item>} list responses unwrap automatically inside list_objects branch (envelope's items.* slot carries actual item shape)"
  - "openWorldHint architectural invariant lives in Pass 4 (annotations) — outside this plan's scope"

patterns-established:
  - "Deterministic per-universal-tool envelope branch table — feature gate by Tool1.type == Type.universal AND name lookup in _NAME_TO_UNIVERSAL"
  - "wrap_with_metadata() is the single source of truth for the canonical envelope shape — final_assembly.py (plan 04-05) and any future Pass 5 phase wrap their data slots through this helper"
  - "low-confidence detection uses 3-rule heuristic: empty schema OR additionalProperties: true OR no properties dict — same heuristic re-used by plan 04-05 validation"

requirements-completed: [GEN-07]

duration: 90min
completed: 2026-04-28
---

# Phase 04 Plan 02: Pass 5 outputSchema extraction Summary

**Deterministic per-tool outputSchema generator with canonical `{id, object_type, data, metadata}` wrapper and per-universal-tool envelope branch table (search/fetch/list_objects/list_collections/upsert/delete) per Pass 5 design §1.6.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-04-28T08:46:00Z
- **Completed:** 2026-04-28T10:15:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Phase 2 of Pass 5 pipeline ships: `output_schema.py` produces production-ready JSON Schema with the canonical Pass 5 wrapper (MCP 2025-06-18 outputSchema standard).
- Per-universal-tool envelope branches match Pass 5 design §1.6 verbatim — search returns `{results: array<{id, score?, preview}>}`, list_objects returns `{items: array<...>, next_cursor?}`, delete returns `{deleted_count, success}`, etc.
- Multi-collection `list_objects` tools get a conservative `oneOf` aggregated inner schema (refinement deferred to plan 04-05 once per-collection IR schema lookup lands).
- Low-confidence flag (`inference_low_confidence=True`) raised when spec is `additionalProperties: true` OR has empty `properties` — surfaced as a warning by plan 04-05.
- 23 unit tests cover all 6 universal-tool branches, action pass-through, oneOf aggregation, low-confidence detection, canonical wrapper shape, metadata required fields, `extra='forbid'` invariant, missing-source-endpoint resilience, and parametrized universal-tool builder coverage. All green; mypy + ruff clean.
- 731/731 non-slow non-openrouter engine tests pass (no regression in Pass 0–4 + plan 04-01 surfaces).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 RED tests + sample-response-schemas fixture**
   - `8410e69` (test): add failing tests for Pass 5 outputSchema extraction
   - `528e07c` (test): pass pass_1_output to extract_output_schema_for_tool — IR-shape correction (Tool1 has no per-tool routing field)
2. **Task 2: output_schema.py implementation + minimal pass_5/__init__.py**
   - `8116df2` (feat): Pass 5 deterministic outputSchema extraction + envelope wrapper

_Note: Task 1 split into two commits — the second corrects the per-tool fn signature once the actual frozen-IR shape was inspected (Tool1/ToolTaxonomyEntry have no `routing` field, so the per-tool extractor needs `pass_1_output` for collections lookup)._

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/output_schema.py` — Phase 2 outputSchema extractor (~520 LOC). Public API: `OutputSchemaSpec`, `extract_output_schema_for_tool`, `extract_all_output_schemas`, `wrap_with_metadata`, `to_json_schema`. Internal: 6 universal-tool builders + helpers.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py` — minimal package docstring (plan 04-01 owns substantive package init; additive merge expected).
- `apps/generation-engine/tests/passes/pass_5/test_output_schema.py` — 18 named `test_*` functions + 1 parametrized over 6 universal tools (= 23 collected tests), covering all envelope shapes, low-confidence detection, oneOf aggregation, canonical wrapper, `extra='forbid'`, missing-source-endpoint resilience, 201-over-200 upsert preference, and orchestrator key shape.
- `packages/engine-fixtures/stripe/sample_response_schemas.json` — synthetic response-schema fixture (Charge / ChargeList / Customer / EmptyAdditional / DeleteResponse). Real `packages/engine-fixtures/stripe/ir.json` only has `description` in `responses[200]` — no `schema` payload — so synthetic data supplies realistic JSON-Schema input for unit tests.

## Decisions Made

1. **Per-tool fn signature deviation: `extract_output_schema_for_tool(tool, pass_1_output, raw_ir)` vs plan's `(tool, raw_ir)`** — Plan's must_haves quote signature `(tool: ToolTaxonomyEntry, raw_ir: RawIR)` but the spec needs collections from somewhere to determine `wrapping_object_type` and trigger `oneOf` aggregation. Frozen IR's `ToolTaxonomyEntry`/`Tool1` has only `name`/`type`/`source_endpoints` (no `routing` or `universal_tool` field). Collections only exist at server-level via `Pass1Output.routing.smart_id.collections`. Adding `pass_1_output` to the per-tool signature is the minimum correctness deviation. Mirrors Pass 3 `extract_params(raw_ir, pass_1_output)` analog signature.
2. **`OutputSchemaSpec.data_schema` field (additive)** — Plan's must_haves only listed `fields: dict[str, dict[str, Any]]` (per-field properties map). But the canonical envelope shapes in Pass 5 design §1.6 carry `required` lists, `array items`, and `oneOf` — none of which fit in a flat `properties` map. Without `data_schema`, `to_json_schema()` could not round-trip the envelope's `required` (delete envelope test failed: `KeyError: 'required'`). Added `data_schema: dict[str, Any]` alongside `fields`. This is a pure superset — `fields` still ships for plan 04-03 LLM field-importance ranking input.
3. **Conservative `oneOf` aggregation placeholder** — Plan asks for `oneOf` aggregation across multiple collections (`list_objects` subsuming Charge + Customer + Subscription). The frozen `RawIR.schemas` dict is keyed by raw spec component names (e.g., `Charge`), but Pass 1 `collections` enum values may diverge in case/format. Without a deterministic mapping in scope, the implementation emits an open `{oneOf: [{type: object, additionalProperties: true} per collection], additionalProperties: true}` placeholder. Plan 04-05 final assembly is the natural place to refine this once per-collection schema lookup pattern is in scope.
4. **Stripe-style list response unwrapping** — Many list endpoints ship `{data: array<Object>, has_more, next_cursor}`. The implementation auto-detects this in `_extract_inner_data` and feeds the inner item shape to the `list_objects` envelope's `items.*` slot, so the agent sees per-item fields rather than envelope-wrapper fields like `has_more`.
5. **`pass_5/__init__.py` minimal docstring shipped here** — Plan 04-01 owns the substantive package init (per its `files_modified` list). Without an `__init__.py`, my Python module would not import in the worktree. Shipping a minimal docstring placeholder ensures imports work; merge with plan 04-01's worktree is naturally additive (both edits are independent).
6. **Universal upsert response code preference: 201 → 200 → 202** — Per plan must_haves "try 201 first, fallback to 200". Implementation extends to 202 for async-create dialects. Everything else uses standard 200 → 201 → 202 → 204 ladder.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Per-tool fn signature added `pass_1_output` arg**
- **Found during:** Task 1 (test scaffolding)
- **Issue:** Plan's `extract_output_schema_for_tool(tool, raw_ir)` has no path to read `pass_1_output.routing.smart_id.collections` — required for `wrapping_object_type` and `oneOf` aggregation; frozen IR's `Tool1`/`ToolTaxonomyEntry` has no per-tool `routing` field.
- **Fix:** Added `pass_1_output: Pass1Output` arg between `tool` and `raw_ir`. Updated 13 call sites in tests + `extract_all_output_schemas` orchestrator.
- **Files modified:** `output_schema.py`, `test_output_schema.py`
- **Verification:** All 23 unit tests pass; mypy clean.
- **Committed in:** `528e07c` (test fix-up) + `8116df2` (feat).

**2. [Rule 1 — Bug] OutputSchemaSpec was missing `data_schema` field**
- **Found during:** Task 2 (test execution — `test_delete_envelope_shape` failed with `KeyError: 'required'`)
- **Issue:** Plan's spec stored only `fields: dict[str, dict[str, Any]]` (flat properties map). Round-tripping through `to_json_schema(spec)` re-built the data slot from `fields` only, losing envelope-specific `required` / `items` / `oneOf` keys. Delete envelope's `{deleted_count, success, required: [deleted_count, success]}` lost the `required` list.
- **Fix:** Added `data_schema: dict[str, Any]` field on `OutputSchemaSpec`. `to_json_schema()` now wraps `data_schema` directly via `wrap_with_metadata` instead of rebuilding from `fields`. `fields` retained as a convenience flat map for plan 04-03 LLM field-importance ranking.
- **Files modified:** `output_schema.py`, `test_output_schema.py` (2 explicit OutputSchemaSpec(...) constructors).
- **Verification:** All 23 unit tests pass; mypy clean.
- **Committed in:** `8116df2`.

**3. [Rule 1 — Bug] mypy: `_extract_inner_data` had unreachable `isinstance(raw_schema, dict)` guard**
- **Found during:** Task 2 mypy run
- **Issue:** `_extract_inner_data(raw_schema: dict[str, Any])` had a defensive `if not isinstance(raw_schema, dict): return {}` guard that mypy flagged as unreachable (param already typed as dict).
- **Fix:** Removed the unreachable guard — caller contracts ensure dict input.
- **Files modified:** `output_schema.py`.
- **Verification:** mypy clean.
- **Committed in:** `8116df2`.

**4. [Rule 1 — Bug] mypy: `preferred_codes` tuple type-mismatch across branches**
- **Found during:** Task 2 mypy run
- **Issue:** `preferred_codes` was assigned `tuple[str, str, str]` in upsert branch and `tuple[str, str, str, str]` in else branch — mypy disallows variable-length tuple narrowing.
- **Fix:** Added explicit `preferred_codes: tuple[str, ...]` declaration before the if/else.
- **Files modified:** `output_schema.py`.
- **Verification:** mypy clean.
- **Committed in:** `8116df2`.

**5. [Rule 1 — Bug] ruff SIM103: `_detect_low_confidence` had non-inline if-return**
- **Found during:** Task 2 ruff run
- **Issue:** `if not isinstance(...) or not properties: return True\nreturn False` — ruff suggests inline.
- **Fix:** Replaced with `return not isinstance(...) or not properties`.
- **Files modified:** `output_schema.py`.
- **Verification:** ruff clean.
- **Committed in:** `8116df2`.

**6. [Rule 3 — Blocking] Created `pass_5/__init__.py` minimal docstring placeholder**
- **Found during:** Task 2 (Python import resolution — `mcpgen_engine.passes.pass_5` must be a package).
- **Issue:** Plan 04-01 owns the substantive `pass_5/__init__.py`. In my worktree it doesn't exist yet. Without it, `from mcpgen_engine.passes.pass_5.output_schema import ...` fails.
- **Fix:** Shipped a minimal docstring placeholder. Merge with plan 04-01's worktree is naturally additive (both `__init__.py` versions are independent additions; one will overwrite the other in merge — git resolves cleanly to plan 04-01's version since 04-01 is the canonical owner; merge will keep my `output_schema.py` and 04-01's package init).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py`.
- **Verification:** `import` succeeds; tests run.
- **Committed in:** `8116df2`.

---

**Total deviations:** 6 auto-fixed (1 missing critical [Rule 2], 4 bugs [Rule 1], 1 blocking [Rule 3])
**Impact on plan:** All deviations strictly necessary. Two deviations (#1, #2) extend the public API surface (`pass_1_output` arg + `data_schema` field) — both consumed only by Pass 5 internals (plan 04-03 / 04-05 / 04-07). No scope creep beyond Phase 2 outputSchema extraction; conservative-format Zod fallback (Pitfall #33) remains in plan 04-07 as planned.

## Issues Encountered

- **Long-running engine pytest invocations** — initial `pytest -m "not requires_openrouter"` runs took 30+ min CPU because they include `slow`-marked Plan 02-09 cold-cache spike tests. Workaround: regression confirmed via 731/731 fast tests (`-m "not requires_openrouter and not slow"`) + 23/23 new Pass 5 tests; slow tests are I/O-heavy and orthogonal to Pass 5 internals.

## Threat Flags

None — Pass 5 Phase 2 is a deterministic pure-function module that consumes spec dicts and emits new dicts. No new endpoints, no auth surface, no schema changes at trust boundaries.

## Self-Check: PASSED

**Files created:**
- FOUND: apps/generation-engine/src/mcpgen_engine/passes/pass_5/output_schema.py
- FOUND: apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py
- FOUND: apps/generation-engine/tests/passes/pass_5/test_output_schema.py
- FOUND: packages/engine-fixtures/stripe/sample_response_schemas.json

**Commits:**
- FOUND: 8410e69 (test: failing tests for Pass 5 outputSchema extraction)
- FOUND: 528e07c (test: pass pass_1_output to extract_output_schema_for_tool)
- FOUND: 8116df2 (feat: Pass 5 deterministic outputSchema extraction + envelope wrapper)

## Next Phase Readiness

- `extract_all_output_schemas(pass_1_output, raw_ir) -> dict[str, OutputSchemaSpec]` ready for plan 04-03 (LLM field-importance ranking input).
- `to_json_schema(spec) -> dict[str, Any]` ready for plan 04-05 final-assembly orchestrator (produces `FinalTool.outputSchema` value).
- `OutputSchemaSpec.inference_low_confidence` ready for plan 04-05 to emit `output_schema_inference_low_confidence` warnings.
- Stage E `outputs.ts.j2` template (plan 04-07) consumes the wrapped JSON Schema directly — Zod conservative-format fallback (Pitfall #33, CONTEXT D-26) remains plan 04-07's responsibility.

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Plan: 02*
*Completed: 2026-04-28*
