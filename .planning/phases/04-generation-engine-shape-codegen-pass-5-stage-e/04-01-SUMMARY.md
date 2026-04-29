---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 01
subsystem: engine-pass-5-pagination
tags: [pass-5, pagination, deterministic, cursor, offset, page-number, structlog, frozenset]

# Dependency graph
requires:
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "Pass1Output / RawIR / Endpoint / Tool1 / Routing1 / Method / SpecFormat / SmartId / SampleInvocation / CoverageProofItem (frozen IR shapes); engine-fixtures stripe/ir.json + pass-1-output.json"
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "passes/pass_4 module layout pattern (PASS_4_VERSION + __all__ re-export skeleton); deterministic classifier pattern (passes/pass_3/filter_design.py — Final[frozenset] tables, structlog structural-only logging); Tool1 ↔ universal-tool-name convention (Plan 03-10 deviation: Tool1 has no `universal_tool` field, name IS the variant for Type.universal)"
provides:
  - "PASS_5_VERSION: Final[str] = '1' — D-35 cache-key hint, bumped via paired docs/decisions/ entry"
  - "PaginationStrategy(BaseModel, extra='forbid') — frozen Pydantic model with style + cursor/offset/page param-name fields + default_limit/max_limit"
  - "detect_pagination_for_endpoint(endpoint, response_schema, *, universal_tool_name) — D-08 first-match precedence cursor → offset → page-number → none"
  - "vote_majority_strategy(per_tool) — per-server majority + cursor → offset → page_number tie-break; ignores style='none' from count"
  - "detect_pagination_strategy(pass_1_output, raw_ir) — orchestrator; walks list-like universals, votes majority, emits override warnings"
  - "Default-limit defaults: search 10/50, list_objects 25/100, list_collections 25/100 (Pass 5 design §1.6)"
  - "tests/passes/pass_5/conftest.py — synthetic Endpoint + Pass1Output factories + spec_with_{cursor,offset,page_number,no}_pagination fixtures + stripe_pass_1_output / stripe_raw_ir golden loaders"
affects: [04-02, 04-03, 04-04, 04-05, 04-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pass 5 module layout mirrors passes/pass_4 — PASS_5_VERSION: Final[str] re-export + __all__ skeleton; full run() orchestrator deferred to plan 04-05"
    - "Tool1 universal-tool-name convention reused: for Type.universal tools, tool.name IS the universal-tool variant ('search' / 'list_objects' / 'list_collections') — same as passes/pass_4/rules.py"
    - "Endpoint.parameters and Endpoint.responses are raw List[Dict[str, Any]] / Dict[str, Any] in the frozen IR (NOT typed Pydantic Parameter / Response models); detection helpers tolerate missing/non-string keys defensively"
    - "Logging policy invariant continues: _log.info emits ONLY structural metrics (strategy, list_tool_count, override_count); param/field names NEVER logged (CLAUDE.md §9 + Phase 2 D-52 + T-04-01-spec-leak)"
    - "Wave-0 atomic pattern: Task 1 commits real (not skip) RED tests importing pass_5.pagination → Task 2 commits implementation → tests turn GREEN; same convention as Phase 2 D-50 + Phase 3 D-04"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py — package skeleton + PASS_5_VERSION + re-export of pagination symbols"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_5/pagination.py — PaginationStrategy + detect_pagination_for_endpoint + vote_majority_strategy + detect_pagination_strategy (D-08 verbatim)"
    - "apps/generation-engine/tests/passes/pass_5/__init__.py — package marker"
    - "apps/generation-engine/tests/passes/pass_5/conftest.py — pytest fixtures (synthetic Endpoint factory + 4 pagination-style fixtures + stripe golden loaders)"
    - "apps/generation-engine/tests/passes/pass_5/test_pagination.py — 21 unit tests covering D-08 precedence, case-insensitivity, majority vote + cursor tie-break, search/list_objects defaults, extra='forbid', orchestrator override warnings"
  modified: []

key-decisions:
  - "Tool1 has no `universal_tool` field — for Type.universal tools, tool.name IS the variant; matches Plan 03-10 deviation already established in passes/pass_4/rules.py"
  - "Endpoint.parameters / Endpoint.responses treated as raw dicts (frozen IR shape: List[Dict[str, Any]] / Dict[str, Any]); helper functions _extract_param_names + _extract_response_property_names + _response_schema_for_endpoint defensively handle missing/non-dict values"
  - "Page-number detection requires BOTH `page` AND a `per_page`/`pagesize`/`limit` companion (D-08 verbatim) — single `page` param falls through to `none`"
  - "cursor_param_name and cursor_response_field are independently nullable — both, either, or neither may be set depending on which signal triggered cursor classification"
  - "tests/passes/__init__.py was already shipped by Plan 03-01 — Task 1 only created tests/passes/pass_5/__init__.py (one less file than the plan's must_haves listed)"

patterns-established:
  - "D-08 first-match-wins precedence implemented as 4 sequential `if` blocks (cursor → offset → page-number → none); deliberate verbosity over compact match-statement to keep precedence visible at a glance"
  - "Per-server majority vote uses _TIE_BREAK_ORDER tuple for deterministic preference (cursor → offset → page_number); the first preferred style with max count is selected"
  - "_response_schema_for_endpoint with 200 → 2xx fallback handles both well-shaped specs (Stripe-style) and degenerate specs (response = {description: '...'} with no schema key)"

requirements-completed:
  - GEN-07

# Metrics
duration: 25min
completed: 2026-04-28
---

# Phase 04 Plan 01: Pass 5 Pagination Strategy Detection Summary

**Deterministic D-08 pagination detection (cursor → offset → page-number → none) with per-server majority vote and cursor tie-break, plus Pass 5 package skeleton enabling plans 04-02..04-05 to import without circular dependencies.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-28T08:30:00Z (worktree base reset)
- **Completed:** 2026-04-28T08:55:14Z
- **Tasks:** 2 (Task 1 RED — Wave-0 test scaffolding; Task 2 GREEN — implementation)
- **Files created:** 5 (3 src + 3 test, of which 1 test file is the package marker)

## Accomplishments

- Pass 5 package skeleton committed: `passes/pass_5/__init__.py` with `PASS_5_VERSION = "1"` and `__all__` re-export. Plans 04-02..04-05 can now `from mcpgen_engine.passes.pass_5 import ...` without triggering circular imports (no LLM modules pulled in yet).
- `pagination.py` ships D-08 verbatim:
  - `PaginationStrategy(BaseModel, extra="forbid")` model with style + 5 nullable param-name fields + default/max limits.
  - `detect_pagination_for_endpoint` — first-match precedence (cursor → offset → page-number → none); page-number requires BOTH `page` AND `per_page`-family companion; case-insensitive matching.
  - `vote_majority_strategy` — per-server majority with `cursor → offset → page_number` tie-break.
  - `detect_pagination_strategy` — orchestrator that walks list-like universals (`search` / `list_objects` / `list_collections`), pulls 200-OK schema (with 2xx fallback), votes majority, and emits override warnings.
- 21 unit tests cover every D-08 branch, all majority-vote outcomes, default-limit per-tool-type behaviour, `extra='forbid'` enforcement, and 5 fixture-driven orchestrator paths (cursor / offset / page-number / no-pagination / override-warning).
- mypy + ruff clean. 548 existing engine tests continue to pass — no regression.

## Task Commits

Each task committed atomically:

1. **Task 1: Wave-0 test scaffolding** — `1dc520b` (test)
2. **Task 2: Pass 5 skeleton + pagination detector** — `8035340` (feat)

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py` — Pass 5 package marker, `PASS_5_VERSION` constant, re-export of pagination symbols.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/pagination.py` — `PaginationStrategy` model + 3 detection functions (per-endpoint / majority-vote / orchestrator) + helpers; FROZEN frozenset constants for cursor/offset/page-number param names.
- `apps/generation-engine/tests/passes/pass_5/__init__.py` — package marker.
- `apps/generation-engine/tests/passes/pass_5/conftest.py` — synthetic `Endpoint` factory + `Pass1Output` factory + 4 pagination-style fixtures + Stripe golden loaders.
- `apps/generation-engine/tests/passes/pass_5/test_pagination.py` — 21 unit tests (per-endpoint detection, majority vote, orchestrator paths, `extra='forbid'`).

Note: `tests/passes/__init__.py` was already shipped by Plan 03-01 — not recreated.

## Decisions Made

- **Tool1 universal-tool-name convention reused.** The frozen IR `Tool1` has only `{name, type, source_endpoints}` — no `universal_tool` field. For `Type.universal` tools, `tool.name` IS the variant. This matches the existing convention from `passes/pass_4/rules.py` (Plan 03-10 deviation). The plan's `<interfaces>` block was incorrect on this point; the implementation follows Plan 03-10 / actual frozen IR.
- **`Endpoint.parameters` / `Endpoint.responses` are raw dicts.** Per `packages/ir/python/types.py` lines 714-727, both are `List[Dict[str, Any]]` / `Dict[str, Any]` (NOT typed Pydantic Parameter / Response models as the plan's interface block sketched). `_extract_param_names`, `_extract_response_property_names`, and `_response_schema_for_endpoint` treat both inputs as raw dicts, defensively handling missing keys / non-string types.
- **`cursor_param_name` and `cursor_response_field` independently nullable.** When the cursor strategy is selected via response-field signal alone (no cursor request param), `cursor_param_name` stays `None`. The plan's pseudocode used a hard-coded fallback `next(iter(...), "cursor")`; we replaced that with explicit `None` to keep the fields meaningful.
- **`tests/passes/__init__.py` already exists.** Plan 03-01 shipped it; only Task 1's `tests/passes/pass_5/__init__.py` needed creation.

## Deviations from Plan

None functional — every Task 1+2 acceptance criterion is met. Three documentation-level deltas worth recording:

1. **`Tool1.universal_tool` field does not exist.** The plan's `<interfaces>` Python block claimed `ToolTaxonomyEntry` with `universal_tool: str | None`, `routing: dict[str, Any]` and listed it as the input shape. The actual frozen `Tool1` (Pass1Output's tool entries) has only `{name, type, source_endpoints}`. Resolved by following the existing Plan 03-10 convention (`tool.name` IS the variant for `Type.universal`). No code path required changes; only the parameter passed to `detect_pagination_for_endpoint(universal_tool_name=...)` shifted from `tool.universal_tool` to `tool.name`.
2. **`Endpoint.responses` is `Dict[str, Any]`, not `dict[str, Response]`.** The plan's interface block used a typed `Response` shape with `.schema_`. The frozen IR keeps responses as raw dict-of-dicts. Implementation reads `endpoint.responses["200"]["schema"]` with `isinstance(..., dict)` guards.
3. **`tests/passes/__init__.py` already shipped.** Task 1's must-have list included recreating it; we left the existing file untouched (it has the `"Pass-specific test suites (mirror src/mcpgen_engine/passes/ layout)."` docstring already).

---

**Total deviations:** 0 functional, 3 doc-level (frozen-IR field shapes vs plan's interface sketch).
**Impact on plan:** Zero scope change. All success criteria + acceptance gates met. Plans 04-02..04-05 unaffected — the public API (`PaginationStrategy`, `detect_pagination_strategy`, etc.) matches the plan's must-haves exactly.

## Issues Encountered

None.

## User Setup Required

None — pure-Python, deterministic, no external services required.

## Next Phase Readiness

- Plan 04-02 (`output_schema.py`) can import `PaginationStrategy` and `detect_pagination_strategy` directly from `mcpgen_engine.passes.pass_5.pagination`.
- Plan 04-05 (final assembly + `run()`) will consume the `(server_strategy, override_warnings)` tuple to populate `Pass5Output.flags.pagination_override`.
- Plan 04-08 (Stage E `runtime/pagination.ts.j2`) will read the chosen `PaginationStrategy.style` to route between cursor/offset/page-number TypeScript helpers.

## Self-Check: PASSED

- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/pagination.py` — FOUND
- `apps/generation-engine/tests/passes/pass_5/__init__.py` — FOUND
- `apps/generation-engine/tests/passes/pass_5/conftest.py` — FOUND
- `apps/generation-engine/tests/passes/pass_5/test_pagination.py` — FOUND
- Commit `1dc520b` — FOUND (Task 1 — test scaffolding)
- Commit `8035340` — FOUND (Task 2 — implementation)
- 21/21 tests pass; mypy clean; ruff clean; 548 existing tests green.

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Completed: 2026-04-28*
