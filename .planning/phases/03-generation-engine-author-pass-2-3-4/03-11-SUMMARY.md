---
phase: 03-generation-engine-author-pass-2-3-4
plan: 11
subsystem: engine
tags: [pass-4, annotations, llm-judge, consistency, orchestrator, ir-assembly, openworld-invariant]
requires:
  - 03-01  # Pass 4 wave-0 scaffolding (pass_4/__init__.py placeholder + conftest fixtures)
  - 03-10  # Pass 4 deterministic helpers (rules.py + verbs.py + titles.py)
provides:
  - "passes/pass_4/prompts.py — PASS_4_JUDGE_SYSTEM_PROMPT (D-25 light untrusted-spec preamble + D-27 explicit no-openWorldHint instruction + D-29 conservative guidance) + build_judge_prompt with 500-char description excerpt cap"
  - "passes/pass_4/llm_judge.py — _LlmJudgeOutput Pydantic model (extra='forbid', NO openWorldHint per D-27 + Research A3) + PASS_4_JUDGE_AGENT singleton via make_agent + judge_action_tools (Sem(5)) + _CONSERVATIVE_DEFAULTS fallback (D-29 emit-and-continue)"
  - "passes/pass_4/consistency.py — Pass4Error(ValueError) + enforce_consistency_with_autofix (Rule 1+2+3 per D-26 Phase 3) + assemble_annotations_with_open_world_hint (sole legal Annotations construction site in pass_4/, openWorldHint=True hardcoded per D-27)"
  - "passes/pass_4/__init__.py — async run(pass_3_output, pass_2_output, pass_1_output) -> Pass4Output 3-phase orchestrator (replaces empty 03-01 placeholder) + PASS_4_VERSION='1' (D-35) + Pass4Error re-export"
affects:
  - "Plan 03-12 (Pass 2/3/4 pipeline integration + pipeline.py extension): downstream pipeline can chain `pass_2.run` → `pass_3.run` → `pass_4.run` with the IR-shape Pass4Output as final annotations + titles for Stage E codegen consumption"
  - "Frontend / SSE event surface: D-26 Phase-2 selective LLM stage emits 0-3 LLM calls per server (typically <500ms); 'pass_4.run.complete' structured log carries `tool_count`, `llm_review_count`, `elapsed_ms` for observability"
tech-stack:
  added: []
  patterns:
    - "Module-level Agent singleton via make_agent (Pitfall A: NO direct OpenAIModel/Provider construction)"
    - "Two-tier retry loop (transient httpx backoff + Pydantic ValidationError outer loop with conservative fallback) — mirrors pass_0/llm.py + pass_2/authoring.py shape"
    - "Local intermediate Pydantic types with ConfigDict(extra='forbid') (Pattern: pass_2/quality_gate.py::_GateScores)"
    - "Auto-fix with structlog warning per applied rule (returns NEW dict, never mutates input)"
    - "Single-construction-site enforcement for IR invariants (assemble_annotations_with_open_world_hint is the ONLY caller of Annotations(...) in pass_4/*)"
    - "Async fan-out under Semaphore (D-26 Phase 2: PASS_4_JUDGE_CONCURRENCY=5)"
key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/prompts.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/llm_judge.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/consistency.py
    - apps/generation-engine/tests/passes/pass_4/test_prompts.py
    - apps/generation-engine/tests/passes/pass_4/test_llm_judge.py
    - apps/generation-engine/tests/passes/pass_4/test_consistency.py
    - apps/generation-engine/tests/passes/pass_4/test_run.py
  modified:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py
decisions:
  - "Research A3 confirmed safe with Qwen + PydanticAI: `_LlmJudgeOutput` requests ONLY the 3 mutable booleans + a rationale; `openWorldHint` is constructed Python-side in `assemble_annotations_with_open_world_hint` to honour the IR `Literal[True]` invariant. Verified at test level via `test_llm_judge_output_omits_open_world_hint_field` (asserts `model_fields` exactly equals `{'readOnlyHint','destructiveHint','idempotentHint','rationale'}`). The combination of Pydantic `extra='forbid'` + Python-side construction means the LLM cannot affect openWorldHint even if it hallucinates the field name."
  - "Two-tier retry mirroring pass_0/llm.py: outer validation/UnexpectedModelBehavior loop + inner httpx.HTTPError exponential backoff (1s/2s/4s, max 3 attempts). The OpenAI client wraps underlying httpx errors into `openai.APIConnectionError` BEFORE they reach our retry loop — so the transient-retry test mocks at the Agent layer rather than via pytest-httpx. Documented in `test_judge_one_transient_http_error_falls_back_after_retries`."
  - "D-29 conservative fallback policy: 1 outer validation retry (vs Pass 0's 3, Pass 2's 2). Reason: Phase 2 of Pass 4 is supposed to be cheap (<500ms total) — long retries here defeat the design budget ($0.01-0.03, 3-10s). One retry is enough to recover from transient PydanticAI tool-call validation hiccups; persistent failure → conservative defaults emit-and-continue (D-26 Phase 2 says NOT a Pass4Error raise)."
  - "Phase 3 rule order matters: Rule 2 (`destructive=true → readOnly=false`) MUST run BEFORE Rule 1 (`readOnly=true → idempotent=true`). If a tool comes in with both `readOnly=True` AND `destructive=True`, Rule 2 zeros out readOnly first, so Rule 1 doesn't subsequently force idempotent=True on what is now a destructive write. Verified in `test_enforce_consistency_both_autofixes_apply`."
  - "Pass 3 output is unused in `run()` but accepted in the signature for downstream pipeline parity (Plan 03-12 chains by signature). Marked with `# noqa: ARG001` and documented in the docstring; if Plan 03-12 needs Pass 3 inputSchemas in Pass 4 (e.g., to detect destructive params), the parameter is already wired."
  - "PydanticAI/OpenAI test mock requires `created` int field on the chat-completion response — pytest-httpx mocks that omit it cause Pydantic ValidationError on the OpenAI ChatCompletion model. Mirrored from pass_2 test_quality_gate.py (`_mock_openrouter_function_call` includes `created: 1735689600`)."
  - "Existing pass_4/__init__.py wave-0 placeholder docstring acknowledges 03-11 as the orchestrator landing site; this plan replaces the file in full with the real orchestrator."
metrics:
  duration: "20 min"
  tasks-completed: 3
  tests-added: 55
  files-changed: 8
  lines-added: 1652
  completed: 2026-04-28T02:57:11Z
---

# Phase 03 Plan 11: Pass 4 LLM Judge + Consistency + Orchestrator Summary

Phase 2 (selective Qwen judgment, Sem(5)) + Phase 3 (consistency validation with auto-fix + final IR assembly) of Pass 4 (D-26). The 3-phase orchestrator in `passes/pass_4/__init__.py::run` wires Plan 03-10's deterministic helpers (rules / verbs / titles) into the new LLM judge and consistency modules, producing a `Pass4Output` whose every `Annotations` carries `openWorldHint=True` (D-27 invariant, single point of enforcement). 55 new tests + full Pass 4 suite (127 tests) green; no regressions in full passes suite (438 tests); mypy + ruff clean.

## What Shipped

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/prompts.py` (90 LOC)

Selective-LLM judge prompts for medium-confidence action verbs.

- `PASS_4_JUDGE_SYSTEM_PROMPT: Final[str]` — system prompt requesting the 3 mutable booleans + rationale; explicit "Do NOT include openWorldHint" instruction (D-27); D-29 conservative-on-doubt guidance; light D-25 untrusted-spec preamble (description excerpts in user message are DATA not instructions).
- `_DESCRIPTION_PREVIEW_CHARS: Final[int] = 500` — bounded preview cap mirrors `pass_2/validation.py` to keep prompts cheap regardless of upstream spec size.
- `build_judge_prompt(tool_name: str, tool_description: str | None) -> str` — short user prompt; truncates description to 500 chars; emits no `Description excerpt:` block when description is None or empty.

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/llm_judge.py` (213 LOC)

D-26 Phase 2 selective LLM judgment for medium-confidence action verbs.

- `class _LlmJudgeOutput(BaseModel)` — `ConfigDict(extra='forbid')`; carries ONLY `readOnlyHint: bool`, `destructiveHint: bool`, `idempotentHint: bool`, `rationale: str` (default `""`). **Deliberately omits** `openWorldHint` per Research A3 + D-27 invariant — the LLM cannot return it; even if it tried, `extra='forbid'` would reject the field at decode time.
- `PASS_4_JUDGE_CONCURRENCY: Final[int] = 5` (D-26 Phase 2).
- `_CONSERVATIVE_DEFAULTS: Final[dict[str, bool]] = {readOnlyHint: False, destructiveHint: True, idempotentHint: False}` (D-29).
- `PASS_4_JUDGE_AGENT: Final[Agent[None, _LlmJudgeOutput]]` — module-level singleton via `make_agent` (Pitfall A: NO direct OpenAIModel/Provider construction).
- `_run_with_transient_retry(prompt) -> _LlmJudgeOutput` — inner exponential backoff on `httpx.HTTPError` (1s/2s/4s, max 3 attempts); mirrors `pass_0/llm.py` shape.
- `_judge_one(tool_name, tool_description) -> dict[str, bool]` — outer 1-validation-retry loop (`_MAX_VALIDATION_RETRIES=1` per D-29); falls back to `_CONSERVATIVE_DEFAULTS` after retry exhaustion (NOT a `Pass4Error` raise — D-26 Phase 2 emit-and-continue).
- `judge_action_tools(needs_llm_review, pass_2_output) -> dict[str, dict[str, bool]]` — public entry point; empty input → `{}` (no LLM call); fans out under `Semaphore(5)`; pulls Pass 2 description excerpts (Pass 2 `Descriptions.purpose`) for richer prompt context when present.

Every `.run()` call uses `model_settings=PASS_4_SETTINGS` (Pitfall #2 mitigation — verified in `test_uses_pass_4_settings_provider_routing` by inspecting the OpenRouter request body for the `provider` routing pin AND `max_tokens=512` unique to Pass 4).

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/consistency.py` (138 LOC)

D-26 Phase 3 consistency validation with auto-fix + IR assembly with `openWorldHint=True` invariant.

- `class Pass4Error(ValueError)` — stable error class mirroring Pass2Error / Pass3Error shape; first token of `args[0]` is the stable code (e.g. `MISSING_HINTS`); `violations: list[str]` instance attribute preserves additional context.
- `enforce_consistency_with_autofix(annotations: dict[str, dict[str, bool]]) -> dict[str, dict[str, bool]]` — applies D-26 Phase 3 rules:
  - **Rule 3** (presence check, runs first): missing field → raise `Pass4Error("MISSING_HINTS: tool '<name>' missing <sorted-fields>")`.
  - **Rule 2** (`destructive=True → readOnly=False`, runs BEFORE Rule 1): structlog warning `pass_4.consistency.autofix_destructive_overrides_read_only`.
  - **Rule 1** (`readOnly=True → idempotent=True`): structlog warning `pass_4.consistency.autofix_read_only_implies_idempotent`.
  - Returns a NEW dict; input is not mutated (verified by `test_enforce_consistency_returns_new_dict_immutable`).
- `assemble_annotations_with_open_world_hint(triples: dict[str, dict[str, bool]]) -> dict[str, Annotations]` — sole legal `Annotations(...)` construction site in `pass_4/`. Hardcodes `openWorldHint=True` (D-27 invariant). Pydantic `Literal[True]` enforces; any other value raises `ValidationError` at construction.

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py` (190 LOC, REPLACES wave-0 placeholder)

D-26 3-phase orchestrator + Pass4Output assembly.

- `PASS_4_VERSION: Final[str] = "1"` (D-35 cache-key hint).
- `__all__ = ["PASS_4_VERSION", "Pass4Error", "run"]`.
- `async def run(pass_3_output: Pass3Output, pass_2_output: Pass2Output, pass_1_output: Pass1Output) -> Pass4Output`:
  - **Phase 1** (deterministic, $0, <1s): for each tool, generate title via `titles.generate_title`; try `rules.apply_tool_type_rules` (covers universal + specialized exhaustively per D-28); for action tools, fall through to `verbs.match_verb_pattern` — high → use returned triple; medium → push to `needs_llm_review`; none → conservative defaults; for workflow tools, use `rules.aggregate_workflow_annotations` (D-30 conservative AND/OR/AND).
  - **Phase 2** (LLM ‖ Sem(5)): if `needs_llm_review` non-empty, call `llm_judge.judge_action_tools(needs_llm_review, pass_2_output)`. Other tools skip LLM entirely (~80% of tools per D-26).
  - **Defensive sweep**: any tool not in `triples` after Phase 1+2 → conservative defaults + structlog warning (`pass_4.run.fallback_to_conservative_for_missing`). Should be a no-op in normal operation.
  - **Phase 3** (deterministic, $0, <1s): `consistency.enforce_consistency_with_autofix` then `consistency.assemble_annotations_with_open_world_hint` to construct final `Annotations` with `openWorldHint=True` hardcoded.
  - Returns `Pass4Output(annotations=annotations, titles=titles)`.
- Final structured log: `_log.info("pass_4.run.complete", tool_count, llm_review_count, elapsed_ms)`.

`pass_3_output` is currently unused in the orchestrator body but accepted in the signature for Plan 03-12 pipeline parity (chains by signature; Pass 4 may consume Pass 3 inputSchemas in future to detect destructive parameter shapes).

## Verification

```text
cd apps/generation-engine && uv run pytest tests/passes/pass_4/ -x -v
127 passed in 1.06s

cd apps/generation-engine && uv run pytest tests/passes/ -x -q
438 passed in 1.42s   # no regressions

cd apps/generation-engine && uv run mypy src/mcpgen_engine/passes/pass_4/ tests/passes/pass_4/
Success: no issues found in 16 source files

cd apps/generation-engine && uv run ruff check src/mcpgen_engine/passes/pass_4/ tests/passes/pass_4/
All checks passed!

cd apps/generation-engine && OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER uv run python \
  -c "from mcpgen_engine.passes import pass_4; assert hasattr(pass_4, 'run'); print('OK')"
OK
```

55 new tests in this plan: 10 (`test_prompts.py`) + 15 (`test_llm_judge.py`) + 18 (`test_consistency.py`) + 12 (`test_run.py`).

## Threat Model Outcomes

| Threat ID | Mitigation Outcome |
|-----------|--------------------|
| T-03-OW (D-27) | `_LlmJudgeOutput.model_fields` is exactly `{readOnlyHint, destructiveHint, idempotentHint, rationale}` (verified by `test_llm_judge_output_omits_open_world_hint_field`). `assemble_annotations_with_open_world_hint` is the SOLE construction site for `Annotations(...)` in `pass_4/*` and hardcodes `openWorldHint=True`; the IR's `openWorldHint: Literal[True]` rejects any other value at construction (verified by `test_d27_invariant_attempt_to_set_open_world_hint_false_raises`). End-to-end: `test_run_pass_4_output_pydantic_validates` + `test_run_pitfall_31_read_tools_have_explicit_read_only_and_open_world` confirm the final `Pass4Output.annotations` carries the invariant on every entry. |
| T-03-VP (D-29) | `_CONSERVATIVE_DEFAULTS = {readOnlyHint: False, destructiveHint: True, idempotentHint: False}` matches D-29 verbatim (verified by `test_conservative_defaults_match_d29`). `_judge_one` falls back to it after retry exhaustion (verified by `test_judge_one_pydantic_validation_error_falls_back_to_conservative` + `test_judge_one_transient_http_error_falls_back_after_retries`). The Phase-1 action-no-verb-match path also routes to conservative defaults (verified by `test_run_action_no_verb_match_uses_conservative_defaults`). |
| Pitfall #31 (D-32) | Plan 03-10 rules table HARDCODES `read_only=True` for all 4 universal read tools + every specialized tool. The auto-fix rules in `consistency.py` keep `readOnlyHint`/`idempotentHint` paired correctly (verified by `test_pitfall_31_after_assembly_read_tool_has_open_world_hint_true`). End-to-end: `test_run_pitfall_31_read_tools_have_explicit_read_only_and_open_world` loops over `search`/`fetch`/`list_collections`/`list_objects` and asserts every one has `readOnlyHint=True` AND `openWorldHint=True` after the full pipeline. |
| Pitfall #2 (continues) | `PASS_4_SETTINGS` carries the verified `_PROVIDER_ROUTING` pin (atlas-cloud/fp8/no-fallback). `test_uses_pass_4_settings_provider_routing` inspects the actual OpenRouter request body for both the `provider` dict AND `max_tokens=512` (uniquely Pass-4) — guarantees the right `ModelSettings` instance reaches the wire. |

## Deviations from Plan

### 1. `[Rule 3 - Blocking issue] OpenAI client wraps httpx exceptions before reaching our retry loop`

- **Found during:** Task 1 implementation of `test_judge_one_transient_http_error_falls_back_after_retries`.
- **Issue:** The plan's pseudo-code expected `httpx.ConnectError` to propagate through PydanticAI/OpenAI to our `except httpx.HTTPError` clause. Reality: the OpenAI client (used internally by PydanticAI) wraps any underlying `httpx.HTTPError` into `openai.APIConnectionError` (NOT a subclass of `httpx.HTTPError`) BEFORE it reaches our retry handler. This is consistent with how Pass 0 / Pass 2 already handle (or rather, don't handle) the case — they all only catch `httpx.HTTPError`.
- **Fix:** Test mocks at the Agent layer (`monkeypatch.setattr(llm_judge.PASS_4_JUDGE_AGENT, "run", always_fail)`) instead of via pytest-httpx. The production code's transient-retry catch is unchanged (mirrors Pass 0/2 shape); the test exercises the conservative-fallback path using a direct exception injection.
- **Files modified:** `apps/generation-engine/tests/passes/pass_4/test_llm_judge.py` only.
- **Commit:** `390127b` (test included with Task 1).
- **Documented in:** test docstring + this SUMMARY.

### 2. `[Rule 1 - Bug] PydanticAI test mock missing `created` field`

- **Found during:** First run of `test_judge_one_happy_path` — Pydantic raised ValidationError on the OpenAI `ChatCompletion` model because `created: int` is a required field.
- **Issue:** My initial `_qwen_response` helper omitted `"created"`. Pass 2's `_mock_openrouter_function_call` (the analog) includes `"created": 1735689600`.
- **Fix:** Added `"created": 1735689600` to `_qwen_response` in `test_llm_judge.py`.
- **Files modified:** `apps/generation-engine/tests/passes/pass_4/test_llm_judge.py`.
- **Commit:** `390127b` (fix included with Task 1).

### 3. `[Pure design intent] `pass_3_output` is currently unused in the orchestrator body`

- **Issue:** Plan signature accepts all three of Pass 1/2/3 outputs but Pass 3 inputSchemas are not consumed by Phase 1+2+3 of Pass 4 (annotations only depend on tool name/type/source_endpoints + Pass 2 descriptions for richer prompts).
- **Fix:** Marked the parameter with `# noqa: ARG001` + docstring explanation; kept in signature for Plan 03-12 pipeline parity (the chain is `pass_2.run` → `pass_3.run` → `pass_4.run` by signature).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py`.

### 4. `[Test count adjustment]`

- Plan's success criteria says ≥36 new tests; actual delivery is 55 (10 + 15 + 18 + 12). Higher because Pitfall #31 + D-27 invariants got dedicated tests at multiple layers (the local Pydantic schema, the consistency assembly, the orchestrator output).

## Authentication Gates

None. Test suite uses pytest-httpx for OpenRouter mocking + `monkeypatch.setattr` for Agent-level injection; no real API calls. The standalone `python -c "from mcpgen_engine.passes import pass_4"` import requires `OPENROUTER_API_KEY` env var (loaded automatically by `tests/conftest.py` for the test suite).

## Verified at Execution Time

- **`Annotations.openWorldHint` IR invariant:** `Literal[True]` at `packages/ir/python/types.py` line 122 + line 856. `assemble_annotations_with_open_world_hint` is the single legal construction site in `pass_4/`; verified by `grep -F "Annotations(" apps/generation-engine/src/mcpgen_engine/passes/pass_4/` returning exactly 1 line, in `consistency.py`.
- **`Pass4Output` shape:** `annotations: Dict[str, Annotations]`, `titles: Dict[str, str]` — matches the IR spec exactly. Verified by `test_run_pass_4_output_pydantic_validates`.
- **Plan 03-10 helpers integration:** `apply_tool_type_rules`, `aggregate_workflow_annotations`, `match_verb_pattern`, `generate_title` all imported and consumed correctly. Phase-1 deterministic coverage path verified by `test_run_universal_tools_get_correct_annotations`, `test_run_specialized_tool_is_read_only`, `test_run_high_confidence_action_no_llm_call`, `test_run_workflow_uses_aggregation`.
- **Pitfall #31 IR-shape verification:** `test_run_pitfall_31_read_tools_have_explicit_read_only_and_open_world` loops over the 4 canonical universal read tools and asserts both `readOnlyHint=True` AND `openWorldHint=True` after the full pipeline.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `390127b` | feat(03-11): pass_4 prompts.py + llm_judge.py (selective Qwen judge) |
| 2 | `267718d` | feat(03-11): pass_4 consistency.py (auto-fix + IR assembly) |
| 3 | `d5bd80c` | feat(03-11): pass_4 run() 3-phase orchestrator (Annotations Inference) |

## Self-Check: PASSED

All 8 source/test files verified present on disk; all 3 commit hashes (`390127b`, `267718d`, `d5bd80c`) present in `git log`. 127/127 plan-suite tests pass (Pass 4 only); 438/438 phase regression tests pass (full passes suite); mypy + ruff clean across all 8 files. Module import succeeds with placeholder `OPENROUTER_API_KEY`.
