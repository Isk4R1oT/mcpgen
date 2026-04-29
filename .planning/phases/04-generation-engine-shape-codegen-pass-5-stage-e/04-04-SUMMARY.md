---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 4
subsystem: engine

tags: [pass-5, truncation, response-shaping, pitfall-5, mappingproxytype, frozen-table]

# Dependency graph
requires:
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: Pass 5 module skeleton (04-01) + Pass1Output / Tool1 / Type IR (Phase 1)
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: Pass 5 pagination strategy detection (04-01) — its strategy value is threaded into build_truncation_config / build_all_truncation_configs
provides:
  - Frozen 8-row D-07 truncation template table (search 10K / list_objects 15K / list_collections 10K / fetch 20K / upsert 5K / delete 5K / action 5K / workflow 15K) with MappingProxyType immutability + import-time anti-loop + search-no-cursor invariants
  - Tool1 → tool_type resolver (universal-name lookup, action/workflow direct, specialized→fetch defensive fallback)
  - TruncationConfig1 internal Pass 5 type (extra='forbid')
  - apply_truncation_template runtime helper (str.format with N/Total/Total_minus_N + tool-type kwargs) — also referenced by Stage E truncation.ts.j2 in plan 04-08
  - build_all_truncation_configs orchestrator (one config per Pass1Output tool)
  - TOOL_TYPE_KEYS exhaustive frozenset for plan 04-05 cross-validation
affects:
  - 04-05 (Pass 5 final assembly — converts TruncationConfig1 → IR TruncationConfig)
  - 04-08 (Stage E truncation.ts.j2 mirrors D-07 strings into TS runtime)
  - 04-10 (per-tool-type Stage E handler templates reference D-07 strings)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen Final[Mapping[str, Mapping[str, object]]] table with MappingProxyType wrapping at both outer and inner level (T-04-04-table-mutation defense in depth)"
    - "Import-time invariant assertions on table contents (Pitfall #5 — anti-loop wording on every row, lexical exclusion on search) — fail loud rather than silently emit pagination-loop-prone guidance"
    - "str.format substitution with explicit named placeholders ({N}/{Total}/{Total_minus_N}/...) — no eval, no Jinja2 expression evaluation (T-04-04-template-injection mitigation)"
    - "tool.name doubles as universal-tool variant for Tool1 / ToolTaxonomyEntry (matches passes/pass_4/rules.py + passes/pass_5/pagination.py convention)"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/templates.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/truncation.py
    - apps/generation-engine/tests/passes/pass_5/test_templates.py
    - apps/generation-engine/tests/passes/pass_5/test_truncation.py
  modified: []

key-decisions:
  - "Input type widened from plan's `ToolTaxonomyEntry` to `Tool1` to match the actual data flow through Pass1Output. Both types are structurally identical ({name, type, source_endpoints}) and both Type / Type6 enums share the same string values; the choice aligns truncation.py with passes/pass_4/rules.py + passes/pass_5/pagination.py which all consume Tool1 from Pass1Output.tools directly."
  - "tool.name is treated as the universal-tool variant for Type.universal tools (no separate `universal_tool` field exists on Tool1 / ToolTaxonomyEntry in the IR). Same convention as Pass 4 rules.py."
  - "list_objects template uses lowercase 'only paginate if the user explicitly requested all' to satisfy the plan's exact-substring contract (must-have line 26 + acceptance grep on line 539). The CONTEXT D-07 example used capital 'Only' but the contract phrase + tests use lowercase."
  - "build_truncation_config accepts an unused pagination_strategy_value parameter (signature reserved) so the plan-04-05 orchestrator can pass it uniformly across Phase-4 helpers without future signature breaks if strategy-aware variants land later."

patterns-established:
  - "Pitfall #5 anti-loop wording — every truncation template MUST contain either 'usually sufficient' OR 'only paginate if the user explicitly requested all'; verified at module import time."
  - "Pitfall #5 search-no-pagination — search template MUST NOT contain next_cursor / offset / cursor / paginate (case-insensitive); verified at module import time. search is one-shot per Pass 5 design Appendix A."
  - "Defense-in-depth on read-only tables — wrap BOTH the outer mapping and each inner row in MappingProxyType so neither outer reassignment nor inner mutation is possible at runtime."

requirements-completed: []  # GEN-07 partial — full completion via plan 04-05 final assembly

# Metrics
duration: ~13min
completed: 2026-04-28
---

# Phase 4 Plan 4: Pass 5 Truncation Templates Summary

**FROZEN D-07 8-row truncation guidance table (`templates.py`) with MappingProxyType immutability + import-time anti-loop + search-no-pagination invariants, plus `truncation.py` tool-type resolver, config builder, and `str.format`-based runtime substitution.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-28T17:24:00Z (worktree reset to base)
- **Completed:** 2026-04-28T17:37:00Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 0

## Accomplishments

- D-07 frozen 8-row table verbatim with MappingProxyType wrapping (outer + inner) — read-only at runtime; mutation attempts raise TypeError.
- Pitfall #5 anti-loop wording invariant enforced at import time on every row (every template contains either `"usually sufficient"` or `"only paginate if the user explicitly requested all"`).
- Pitfall #5 search-no-pagination invariant enforced at import time (search template contains zero of `next_cursor` / `offset` / `cursor` / `paginate` — case-insensitive).
- Tool-type resolver maps `Tool1` → 8 canonical truncation-template keys (universal-name lookup for the 6 universal tools; action/workflow direct; specialized → fetch analog; defensive fallback to fetch for unrecognized cases).
- `TruncationConfig1` internal Pass 5 Pydantic model (`extra='forbid'`).
- `apply_truncation_template` substitutes `{N}` / `{Total}` / `{Total_minus_N}` + tool-type-specific kwargs via `str.format()` (raises `KeyError` on missing placeholder — `T-04-04-template-injection` mitigation).
- `build_all_truncation_configs` orchestrator emits one `TruncationConfig1` per `Pass1Output.tools` entry with structured logging (tool-type histogram only — no spec text leakage).
- 44 unit tests pass (20 in `test_templates.py` + 24 in `test_truncation.py`); 595 pass-level + 796 broader engine tests confirm no regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 RED tests** — `a5fc633` (test) — 44 failing tests covering D-07 table shape, threshold values, anti-loop wording on every row, search lexical-exclusion, MappingProxyType read-only, tool-type resolution for every Type variant, build/apply/orchestrator behavior, TruncationConfig1 extra='forbid'.
2. **Task 2: GREEN — `templates.py` + `truncation.py` + ruff fixes on tests** — `fa45bab` (feat) — D-07 frozen table with import-time invariants; Tool1 → tool_type resolver; config builder; runtime substitution; orchestrator. Tests green; mypy clean; ruff clean.

_Note: This plan does NOT modify STATE.md / ROADMAP.md per orchestrator wave protocol._

## Files Created

- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/templates.py` — D-07 frozen 8-row table with `_TRUNCATION_TEMPLATES` (MappingProxyType, outer+inner) + `TRUNCATION_TEMPLATES` public alias; `_assert_anti_loop_wording()` and `_assert_search_no_pagination_hints()` import-time invariants; lowercase `"only paginate if the user explicitly requested all"` substring in list_objects.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/truncation.py` — `TOOL_TYPE_KEYS` frozenset; `TruncationConfig1` (extra='forbid'); `resolve_tool_type` (universal name lookup + action/workflow + specialized→fetch); `build_truncation_config`; `apply_truncation_template`; `build_all_truncation_configs`. structlog histogram logging.
- `apps/generation-engine/tests/passes/pass_5/test_templates.py` — 20 tests: 8-row presence, public alias identity, every threshold per D-07, anti-loop on every row, full search lexical-exclusion (cursor/offset/next_cursor/paginate), MappingProxyType read-only outer + inner, row-shape sanity, list_objects has explicit-paginate phrase.
- `apps/generation-engine/tests/passes/pass_5/test_truncation.py` — 24 tests: resolve_tool_type for all 6 universal names + action + workflow + specialized→fetch + universal-non-canonical→fetch defensive fallback; build_truncation_config thresholds (search/action/workflow); apply_truncation_template substitution (search/list_objects/action/workflow) + KeyError on missing placeholder + KeyError on unknown tool_type + Total_minus_N clamps to 0; build_all_truncation_configs (one per tool + empty list); TruncationConfig1 extra='forbid'; TOOL_TYPE_KEYS exhaustive set.

## Decisions Made

- **Input type: `Tool1` not `ToolTaxonomyEntry`** — the plan's must-haves referenced `ToolTaxonomyEntry`, but `Pass1Output.tools` carries `Tool1` (structurally identical, both have `{name, type, source_endpoints}` + their `Type`/`Type6` enums share string values). Choosing `Tool1` aligns with the actual data flow and matches `passes/pass_4/rules.py` + `passes/pass_5/pagination.py` precedent. Documented in module docstring.
- **`tool.name` IS the universal-tool variant** — neither `Tool1` nor `ToolTaxonomyEntry` has a separate `universal_tool` field (the plan referenced one but the IR doesn't include it). For `Type.universal` tools the canonical names (`"search"` / `"fetch"` / `"list_objects"` / `"list_collections"` / `"upsert"` / `"delete"`) ARE the variants. Same convention as Pass 4 rules.py.
- **Lowercase `"only paginate ..."` substring in list_objects** — the plan must-have (line 26) and acceptance grep (line 539) require the lowercase phrase; CONTEXT D-07 example showed capital "Only paginate" but the contract phrase is lowercase. Adopted lowercase.
- **Reserved `pagination_strategy_value` param** — D-07 templates are not pagination-strategy-conditional in v1, but the parameter is accepted in the signature so plan 04-05 can thread it uniformly across Phase 4 helpers and so future strategy-aware variants don't break the signature.
- **Defensive `fetch` fallback for unrecognized cases** — `resolve_tool_type` returns `"fetch"` for `Type.universal` with non-canonical names (e.g. a stray name slipped through Pass 1 validation) and as the catch-all default. Fetch is the closest analog (single-object semantics) and is the safest threshold (20K).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Lowercased "Only paginate ..." → "only paginate ..." in `list_objects` template**
- **Found during:** Task 2 (GREEN — running test_templates.py)
- **Issue:** First attempt used "Only paginate ..." (capital O) per CONTEXT D-07 prose example, but the plan's must-have line 26 + acceptance grep on line 539 + the test `test_list_objects_template_includes_explicit_pagination_warning` all assert the exact lowercase substring `"only paginate if the user explicitly requested all"`. With capital O, the test failed even though the import-time anti-loop assertion still passed (because the row also has "usually sufficient").
- **Fix:** Lowercased the leading "Only" to match the contract phrase verbatim.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_5/templates.py`
- **Verification:** Test now passes; both anti-loop substrings present in list_objects.
- **Committed in:** `fa45bab` (Task 2 commit).

**2. [Rule 1 — Bug] mypy `no-any-return` on `resolve_tool_type` returning `tool.name`**
- **Found during:** Task 2 (GREEN — running mypy)
- **Issue:** `Tool1.name` is typed via Pydantic `constr(...)` which mypy treats as `Any`; returning it directly from `resolve_tool_type` (declared `-> str`) tripped `no-any-return`.
- **Fix:** Wrapped with `str(tool.name)` — explicit cast keeps the runtime behavior identical and satisfies mypy.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_5/truncation.py`
- **Verification:** `mypy src/mcpgen_engine/passes/pass_5/` returns "Success: no issues found".
- **Committed in:** `fa45bab` (Task 2 commit).

**3. [Rule 1 — Bug] ruff TRY004 + E501 on `templates.py` invariant assertions**
- **Found during:** Task 2 (GREEN — running ruff check)
- **Issue:** `ruff` flagged TRY004 (prefer `TypeError` over `AssertionError` for invalid type) on the import-time `not isinstance(template, str)` guards, and E501 (line 103 > 100) on the f-string with `type(template).__name__`.
- **Fix:** Kept `AssertionError` (these are import-time D-07 contract violations, not runtime input issues — fail loud is the explicit design intent) with `# noqa: TRY004` plus a 2-line code comment justifying. Split the long f-string into two parts assigned via `type_name = type(template).__name__` to fix E501.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_5/templates.py`
- **Verification:** `ruff check src/mcpgen_engine/passes/pass_5/` → "All checks passed!".
- **Committed in:** `fa45bab` (Task 2 commit).

**4. [Rule 1 — Bug] ruff `I001` import sort + `SIM300` Yoda condition on test files**
- **Found during:** Task 2 (post-GREEN — running ruff on the test files)
- **Issue:** `ruff` flagged `I001` (import block out of order — `_TRUNCATION_TEMPLATES` should come before `TRUNCATION_TEMPLATES` alphabetically) and `SIM300` (Yoda condition: `TOOL_TYPE_KEYS == frozenset(...)` should be `frozenset(...) == TOOL_TYPE_KEYS`).
- **Fix:** Applied `ruff check --fix` — auto-fixable.
- **Files modified:** `apps/generation-engine/tests/passes/pass_5/test_templates.py`, `apps/generation-engine/tests/passes/pass_5/test_truncation.py`
- **Verification:** `ruff check tests/passes/pass_5/test_*.py` → "All checks passed!"; all 44 tests still pass.
- **Committed in:** `fa45bab` (folded into the Task 2 GREEN commit since the fixes are incidental to bringing the suite green).

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bug)
**Impact on plan:** All 4 are surface-level conformance issues (capitalization vs contract phrase, mypy cast, ruff style); none affect the D-07 contract values, the Pitfall #5 invariants, or the public API surface. No scope creep.

## Issues Encountered

- Worktree was at base `f2f462…` (one commit beyond expected base `1d473d4…`); first action was a hard reset to the expected base per `<worktree_branch_check>` protocol. Reset succeeded; HEAD verified.
- Background `pytest -x -m "not requires_openrouter"` was launched but produced no output for ~30 seconds; switched to scoped `tests/passes/` run which completed in 5.5s (595 passed). Broader run (`-m "not requires_openrouter and not slow"`) completed in 15.6s (796 passed, 3 deselected) — no regression.

## Self-Check

- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_5/templates.py` — FOUND
- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_5/truncation.py` — FOUND
- [x] `apps/generation-engine/tests/passes/pass_5/test_templates.py` — FOUND
- [x] `apps/generation-engine/tests/passes/pass_5/test_truncation.py` — FOUND
- [x] Commit `a5fc633` (Task 1 RED tests) — FOUND in `git log`
- [x] Commit `fa45bab` (Task 2 GREEN implementation) — FOUND in `git log`
- [x] All 44 unit tests pass; 796 broader engine tests pass (no regression)
- [x] mypy clean on `src/mcpgen_engine/passes/pass_5/`
- [x] ruff clean on `src/mcpgen_engine/passes/pass_5/` + the two test files
- [x] Pitfall #5 lexical-exclusion check passes: `python -c "from mcpgen_engine.passes.pass_5.templates import TRUNCATION_TEMPLATES; tmpl = TRUNCATION_TEMPLATES['search']['template'].lower(); assert 'next_cursor' not in tmpl and 'offset' not in tmpl and 'cursor' not in tmpl and 'paginate' not in tmpl"` exits 0

## Self-Check: PASSED

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04-05 (final assembly) can now consume `TOOL_TYPE_KEYS` for cross-validation and `build_all_truncation_configs` to build the per-tool truncation map; conversion `TruncationConfig1` → IR `TruncationConfig` (`{threshold_tokens, guidance_template}` shape) happens in 04-05.
- Plan 04-08 (Stage E `truncation.ts.j2`) can mirror the D-07 strings into TS runtime — `templates.py::_TRUNCATION_TEMPLATES` is the source of truth for both Python orchestration AND TS runtime.
- Plan 04-10 (per-tool-type Stage E handler templates) can reference D-07 string keys and threshold values directly.
- No blockers. No surprises. Ready to feed plan 04-05 + 04-08 + 04-10.

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Completed: 2026-04-28*
