---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 05
subsystem: generation-engine

tags: [pass_5, response_format, validation, final_assembly, ir, pydantic, qwen, openrouter]

# Dependency graph
requires:
  - phase: 04 (plan 04-01)
    provides: pagination.py — `detect_pagination_strategy` + `PaginationStrategy`
  - phase: 04 (plan 04-02)
    provides: output_schema.py — `extract_all_output_schemas` + `to_json_schema`
  - phase: 04 (plan 04-03)
    provides: field_ranking.py — `rank_all_fields` + `FieldRanking` + deterministic fallback
  - phase: 04 (plan 04-04)
    provides: truncation.py + templates.py — `build_all_truncation_configs` + `_TRUNCATION_TEMPLATES` D-07 frozen table
provides:
  - response_format.py — D-10 enum gate (`should_add_response_format` + `inject_response_format_param` + `RESPONSE_FORMAT_DESCRIPTION`)
  - validation.py — `Pass5Error` + 3 cross-tool consistency validators (pagination / truncation / cursor-offset uniformity)
  - final_assembly.py — `assemble_final_tools(...)` deterministic IR assembler producing `list[Tool2]`
  - __init__.py — full `async def run(...)` 5-phase orchestrator returning `Pass5Output`
affects:
  - plan 04-06 (Pass 5 fixture validation + IR additive `Pass5Output.flags`)
  - plan 04-07..04-12 (Stage E codegen — consumes `Pass5Output.tools[*].response_config` + outputSchema)
  - plan 04-12 (`pipeline._stable_error_code` — wires `STAGE_D_FAILED` for `Pass5Error`)

# Tech tracking
tech-stack:
  added: []  # No new libraries — uses existing pydantic / structlog / mcpgen-ir.
  patterns:
    - "5-phase Pass orchestrator (mirrors Pass 4 3-phase pattern with deterministic + selective-LLM + validation chain)"
    - "Cross-tool consistency validators with stable error codes + violations list (mirrors Pass3Error)"
    - "Deterministic IR assembly via per-tool fan-out (mirrors Pass3._assemble_input_schema_for_tool)"
    - "Pydantic round-trip via model_dump for structurally identical IR types (Descriptions ↔ Description)"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/response_format.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/validation.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/final_assembly.py
    - apps/generation-engine/tests/passes/pass_5/test_response_format.py
    - apps/generation-engine/tests/passes/pass_5/test_validation.py
    - apps/generation-engine/tests/passes/pass_5/test_final_assembly.py
    - apps/generation-engine/tests/passes/pass_5/test_run.py
  modified:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py
    - apps/generation-engine/tests/passes/pass_5/conftest.py

key-decisions:
  - "Pass5Output emitted as bare {tools=[...]} per current frozen IR; additive `flags` field deferred to plan 04-06 IR bump per Open Q1."
  - "validate_truncation_placeholders is tool-name-aware: list-style universal tools require {N} + ({Total} OR {Total_minus_N}); action / workflow templates exempt (D-07 templates are deliberately count-free for those types)."
  - "PaginationStrategy.style 'page_number' (underscore) normalized to IR Style 'page-number' (hyphen) at the IR boundary — internal Literal kept underscore for Python identifier ergonomics."
  - "Final assembly emits list[Tool2] (not list[FinalTool]) — Tool2 is what Pass5Output.tools requires; FinalTool is structurally identical but used elsewhere in the IR."
  - "validate_cursor_offset_param_names_uniform duck-types attribute access (uses getattr) — frozen IR Pagination2 doesn't carry these fields, but Stage E receives a richer runtime shape; the validator works for both."

patterns-established:
  - "Pass5Error: stable user-facing error with first-token error code + violations list (mirrors Pass3Error from passes/pass_3/validation.py)"
  - "5-phase orchestrator chain pattern: deterministic → deterministic → LLM ‖ Sem N → deterministic → deterministic-validate-then-assemble"
  - "IR shape conversion helpers (_to_ir_*) co-located with assembler — keeps single import surface"

requirements-completed: [GEN-07]

# Metrics
duration: ~75 min
completed: 2026-04-28
---

# Phase 04 Plan 05: Pass 5 Phase 5 Final Assembly Summary

**5-phase Pass 5 orchestrator (`run()`) chains pagination → outputSchema → field ranking → truncation → response_format gate + cross-tool consistency + deterministic Tool2[] IR assembly into a complete `Pass5Output`.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-04-28T14:15:23Z
- **Tasks:** 2 (test scaffold RED → implementation GREEN)
- **Files created:** 7 (3 src + 4 tests)
- **Files modified:** 2 (pass_5/__init__.py + tests/passes/pass_5/conftest.py)

## Accomplishments

- **Pass 5 5-phase pipeline complete** via `pass_5.run(...)` (D-05 verbatim).
- **Cross-tool consistency enforced:** pagination uniform per server, cursor/offset param names uniform, truncation placeholders present.
- **D-10 response_format gate** correctly excludes `search` (Pitfall #5 one-shot) and `list_objects` / `list_collections` (already expose `properties`); applies to fetch / action / specialized when > 20 fields.
- **FinalTool[] (Tool2[]) assembler** produces complete IR: description + inputSchema (with optional response_format injection) + outputSchema (envelope-wrapped) + annotations (openWorldHint=True propagated unchanged) + response_config (pagination + field_filtering + truncation + has_response_format_param) + source_endpoints.
- **30 new Phase-5 tests + 656 total tests/passes/ tests green**, mypy clean, ruff clean, smoke gate intact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 test scaffolding (RED)** — `9b8524a` (test) — extends conftest.py with stripe_pass_2/3/4_output, mock_output_schemas / field_rankings / truncation_configs (deterministic), synthetic_inconsistent_pagination_pass1, make_synthetic_final_tool factory; creates test_response_format.py (11 tests), test_validation.py (9 tests), test_final_assembly.py (6 tests), test_run.py (4 tests).
2. **Task 2 (split atomic):**
   - `81cb934` (feat) — pass_5/response_format.py — D-10 enum gate (`should_add_response_format`, `RESPONSE_FORMAT_DESCRIPTION`, `inject_response_format_param`).
   - `b466657` (feat) — pass_5/validation.py — Pass5Error + 3 cross-tool validators.
   - `f60796b` (feat) — pass_5/final_assembly.py — Tool2[] IR assembler (`assemble_final_tools` + IR mapping helpers).
   - `db9ea6c` (feat) — pass_5/__init__.py — full `async def run(...)` 5-phase orchestrator.

_All commits use `--no-verify` per parallel-execution protocol (orchestrator runs hooks once after merge)._

## Files Created/Modified

**Source (3 created, 1 modified):**

- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/response_format.py` — D-10 gate logic + verbatim description + pure inject helper.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/validation.py` — `Pass5Error` + 3 cross-tool validators.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/final_assembly.py` — `assemble_final_tools(...)` deterministic IR assembler with `_to_ir_*` helpers.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py` — extended from 04-01 skeleton with full `async def run(...)` 5-phase orchestrator + structlog metrics + re-exports.

**Tests (4 created, 1 modified):**

- `apps/generation-engine/tests/passes/pass_5/test_response_format.py` — 11 tests covering D-10 gate inclusions / exclusions, verbatim description, pure inject.
- `apps/generation-engine/tests/passes/pass_5/test_validation.py` — 9 tests covering Pass5Error shape + each validator (mixed strategies / missing placeholders / drift).
- `apps/generation-engine/tests/passes/pass_5/test_final_assembly.py` — 6 tests covering one-FinalTool-per-pass-1, outputSchema parity, response_config populated, gate respected, openWorldHint propagation, source_endpoints preservation.
- `apps/generation-engine/tests/passes/pass_5/test_run.py` — 4 tests covering Pass5Output return type, tool-count parity, server-wide pagination uniformity, Pass5Error propagation on synthetic inconsistency.
- `apps/generation-engine/tests/passes/pass_5/conftest.py` — fixtures for stripe_pass_2/3/4_output, mock_output_schemas / field_rankings / truncation_configs (all deterministic from Stripe fixture), synthetic_inconsistent_pagination_pass1 Pass1Output, make_synthetic_final_tool Tool2 factory.

## Decisions Made

- **Tool2 vs FinalTool:** the frozen IR `Pass5Output.tools: List[Tool2]` is structurally what the Pass 5 design calls `FinalTool[]`. Used `Tool2` directly to satisfy the IR contract; semantic equivalence preserved (same fields, same shape).
- **Pagination style normalization at IR boundary:** internal `PaginationStrategy.style: Literal["cursor", "offset", "page_number", "none"]` (underscore) → IR `Style("page-number")` (hyphen value). Mapping isolated to one helper (`_strategy_to_ir_style`) so future drift is caught at one site.
- **`validate_truncation_placeholders` tool-name-aware:** plan must-have spec required strict `{N}` AND `{Total}` for every template. The frozen D-07 table (plan 04-04) ships templates where `search` uses `{Total_minus_N}` (not `{Total}`) and `action` / `workflow` use `{N}` only. Refined validator to require `{N}` always, plus `{Total}` OR `{Total_minus_N}` for list-style tools (search/fetch/list_*/upsert/delete); action/workflow exempt. This preserves the corruption-detection intent without rejecting frozen D-07 invariants.
- **Assemble before validate:** the orchestrator runs `assemble_final_tools` BEFORE invoking the cross-tool validators. Validators inspect the assembled IR shape (which is what downstream Stage E consumes), giving more accurate failure detection than validating internal pre-IR types.
- **`Pass5Output.flags` not emitted in v1 IR:** per Open Q1, the IR `Pass5Output` shape carries only `tools: List[Tool2]`. Plan 04-06 will land the additive `flags` field; this plan emits the metrics via structlog only and returns bare `Pass5Output(tools=...)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `validate_truncation_placeholders` strict {N}+{Total} check rejected frozen D-07 templates**
- **Found during:** Task 2 (run() orchestrator integration test on Stripe fixture)
- **Issue:** Plan must-have specified "every truncation template contains {N} and {Total}". The frozen D-07 templates from plan 04-04 use `{Total_minus_N}` for `search` and no Total placeholder for `action` / `workflow`. The strict validator from the plan's must-have block raised `Pass5Error` on every Stripe fixture run.
- **Fix:** Refined validator to be tool-name-aware: list-style universal tools (search/fetch/list_*/upsert/delete) require `{N}` + (`{Total}` OR `{Total_minus_N}`); action / workflow / specialized templates only require `{N}`. Both required failure modes from the plan's tests still raise (template missing `{N}`, list-style template missing both `{Total}` and `{Total_minus_N}`).
- **Files modified:** apps/generation-engine/src/mcpgen_engine/passes/pass_5/validation.py
- **Verification:** All 9 test_validation.py tests pass + run() orchestrator green on Stripe fixture.
- **Committed in:** `b466657` (validation.py task commit)

**2. [Rule 3 — Blocking] Internal `PaginationStrategy.style` underscore vs IR `Style` enum hyphen mismatch**
- **Found during:** Task 2 (final_assembly.py construction site for Pagination2)
- **Issue:** `PaginationStrategy.style: Literal["page_number", ...]` (Python identifier-friendly underscore) vs IR `Style.page_number = "page-number"` (hyphen value). Direct `Style(strategy.style)` raised on `"page_number"` input.
- **Fix:** Added `_strategy_to_ir_style` helper that normalizes `"page_number"` → `Style("page-number")`. Same normalization applied in `validation._server_style_value` for consistent cross-tool comparison.
- **Files modified:** apps/generation-engine/src/mcpgen_engine/passes/pass_5/final_assembly.py + validation.py
- **Verification:** test_final_assembly.py + test_run.py all pass.
- **Committed in:** `f60796b` (final_assembly.py) + `b466657` (validation.py)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes are correctness-preserving — they reconcile the plan must-have specs with the actual frozen IR / D-07 template invariants. No scope creep; spirit of every must-have preserved.

## Issues Encountered

- Multiple background `pytest -m "not requires_openrouter"` runs got auto-backgrounded but later all reported `completed (exit code 0)` — confirmed via per-file foreground runs (`tests/passes/pass_5/` 149 passed, `tests/passes/` 656 passed, `tests/test_smoke_qwen.py` 1 passed). No actual failures.
- Initial worktree base mismatch (HEAD was at `f2f4621` instead of `eb51a6d`) — resolved via the documented hard-reset protocol at session start.

## Threat Flags

None — no new security-relevant surface introduced. All changes operate within Pass 5's existing trust boundary (typed Pydantic IR inputs → typed IR outputs; no new spec ingestion paths; no LLM-bearing code added beyond what plan 04-03 already shipped).

## Self-Check: PASSED

- ✅ `apps/generation-engine/src/mcpgen_engine/passes/pass_5/response_format.py` exists.
- ✅ `apps/generation-engine/src/mcpgen_engine/passes/pass_5/validation.py` exists.
- ✅ `apps/generation-engine/src/mcpgen_engine/passes/pass_5/final_assembly.py` exists.
- ✅ `apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py` extended with full `run()`.
- ✅ All 4 test files created.
- ✅ Commits exist in `git log`:
  - `9b8524a` (Task 1 — RED tests)
  - `81cb934` (response_format.py)
  - `b466657` (validation.py)
  - `f60796b` (final_assembly.py)
  - `db9ea6c` (run() orchestrator)
- ✅ All required symbols exported from each module.
- ✅ 30 new Phase-5 tests pass (11 + 9 + 6 + 4); 149 total tests/passes/pass_5/ tests pass; 656 tests/passes/ tests pass.
- ✅ mypy + ruff clean; smoke gate intact.

## TDD Gate Compliance

- ✅ RED gate: `9b8524a` (test commit before any implementation).
- ✅ GREEN gate: `81cb934` / `b466657` / `f60796b` / `db9ea6c` (feat commits all after the test commit).
- ✅ No REFACTOR commit (none needed; first GREEN passed all tests after the validator-tooling deviations described above).

## Next Phase Readiness

- Pass 5 5-phase pipeline complete via `pass_5.run(...)`. Ready for plan 04-06 (Pass 5 fixture validation + IR `Pass5Output.flags` additive bump) and Wave 3 (Stage E codegen).
- `Pass5Error` will need to be wired into `pipeline.py::_stable_error_code` (mapping to `STAGE_D_FAILED`) by plan 04-12.
- Stage E (Wave 3) consumes `FinalTool[] / Tool2[]` directly from `Pass5Output.tools` — every required field is populated.

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Plan: 05*
*Completed: 2026-04-28*
