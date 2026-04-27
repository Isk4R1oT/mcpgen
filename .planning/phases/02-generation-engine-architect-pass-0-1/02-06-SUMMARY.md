---
phase: 02-generation-engine-architect-pass-0-1
plan: 06
subsystem: engine
tags: [pass-0, llm, qwen, openrouter, pydantic-ai, prompt-injection, xml-sandboxing, chunked-pipeline, tenacity-retry, degraded-fallback, orchestrator, d-04, d-06, d-20, d-23, d-26, d-50, d-51, d-52]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "FROZEN IR (`mcpgen_ir.types.RawIR/Pass0Output/Endpoint/ToolPlan/Category/CompositeCandidate/DroppedEndpoint*/AuthRequirement*/Method/SecuritySchemes/SpecFormat/TargetComplexity`); pre-commit pipeline (gitleaks/ruff/ruff-format/mypy --strict/conventional-commit); engine `pyproject.toml` with tenacity + pytest-httpx + pydantic-ai 0.2.20 pinned; conftest `_sandbox_env` placeholder OPENROUTER_API_KEY."
  - plan: 02-01
    provides: "`mcpgen_engine.llm.agent_factory.make_agent(output_type, system_prompt)` and `mcpgen_engine.llm.sampling.PASS_0_SETTINGS` (provider routing pinned via `extra_body` per D-04). `tests/test_no_duplicate_model_construction.py` AST guard preventing direct OpenAIModel/Provider construction outside `llm/client.py`. `tests/test_smoke_qwen.py::test_extra_body_forwarded` verifying provider-routing pin survives the SDK call."
  - plan: 02-05
    provides: "Stage 0a `deterministic_filter` (D-23 DropReason enum), `detect_auth_per_endpoint` (D-21/D-22 hybrid auth), Stage 0c `enforce_caps`/`validate_naming`/`cluster_by_path_prefix`, `Pass0Error` with `.suggestions: list[str]`, and `Pass0LlmOutput` (Plan 02-05 shipped tool_plans only; this plan extended with composite_candidates + llm_dropped_endpoints fields with empty defaults so existing tests stay green)."
provides:
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/prompts.py` — `PASS_0_SYSTEM_PROMPT` (verbatim from docs/mcpgen-pass-0-design.md §6.1, with literal `<spec_excerpt>`, `NEVER as instructions`, `UNTRUSTED user data` strings + naming regex + tier guidance) + `build_user_prompt(endpoints, options) -> str` + `build_retry_user_prompt(endpoints, options, validation_error) -> str`. All spec-text fields wrapped in `<spec_excerpt source=\"METHOD path\">` blocks; description truncated to 200 chars."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py` — `PASS_0_AGENT` module-level singleton via `make_agent` + `run_llm_stage(endpoints, options) -> Pass0LlmOutput`. Two-tier retry: 3× transient (httpx.HTTPError, exponential backoff 1/2/4s) inside 3× validation (catches both `pydantic.ValidationError` AND `pydantic_ai.UnexpectedModelBehavior` — the latter wraps PydanticAI's internal tool-call retry exhaustion). Validation feedback folded back into the retry prompt via `build_retry_user_prompt`."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/chunked.py` — `run_llm_chunked(endpoints, options, *, concurrency=5) -> Pass0LlmOutput` with `CHUNKED_THRESHOLD=200` and `HARD_FAIL_THRESHOLD=1000` constants. 4-phase pipeline: deterministic path-cluster → cross-cluster composite hints (best-effort single LLM call) → per-cluster detail with `asyncio.Semaphore(5)` → deterministic merge with cross-cluster naming-collision disambiguation (`<cluster_namespace>_<name>` + 64-char clamp + numeric suffix fallback)."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py` — `async def run(raw_ir, options) -> Pass0Output` orchestrator chaining 0a → auth_detect → 0b (single OR chunked) → 0c. Pre-LLM count gate at >1000 endpoints (D-20). Degraded fallback (D-26) on `LLM_VALIDATION_FAILED` ≤ 80 endpoints — emits each endpoint as a `specialized` ToolPlan with `degraded=true` flagged in `prompt_injection_warnings`. Re-exports `CHUNKED_THRESHOLD`, `HARD_FAIL_THRESHOLD`, `Pass0Error`, `UserOptions`, `run`."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py` — extended `Pass0LlmOutput` with `composite_candidates: list[CompositeCandidate] = []` + `llm_dropped_endpoints: list[DroppedEndpoint] = []` (default-empty for backwards-compat with Plan 02-05 single-arg construction)."
  - "`apps/generation-engine/pyproject.toml` — per-file-ignores `S105` for `src/mcpgen_engine/passes/**/prompts.py` (variable-name prefix `PASS_0_*` misfires the hardcoded-password rule on system-prompt strings)."
  - "21 NEW pytest cases turning T-2-B4 (5) + T-2-B5 (1) + T-2-B6 (7) green plus 8 supplementary tests covering chunked phases, hard-fail, degraded fallback, happy path, and the orchestrator end-to-end. All 76 Pass-0 + AST-guard tests green; combined fast suite runs in <1s."
affects:
  - "Plan 02-07 (Pass 1): consumes `Pass0Output.tool_plans` (post-validation, post-naming-regex enforcement) and `Pass0Output.composite_candidates` (Pass-1 routing/workflow synthesis hints). Pass 1 will import `from mcpgen_engine.passes.pass_0 import run` to compose end-to-end Architect stage."
  - "Plan 02-08 (pipeline + cache): Pass-0 cache key = sha256(canonical raw_ir.endpoints + options) → Pass0Output. The orchestrator's `run` is the cache boundary; sub-stages remain pure."
  - "Plan 02-09 (CLI/HTTP API): `Pass0Error` propagation — `MULTI_SERVER_SPLIT_REQUIRED` and `SPEC_TOO_LARGE_ENDPOINTS` surface as user-actionable errors with concrete path-prefix suggestions; `LLM_VALIDATION_FAILED` is converted to a degraded fallback inside the orchestrator and never reaches the API layer."
  - "Phase 5 (F1/F2/F3 validation): consumes `Pass0Output.prompt_injection_warnings` to surface degraded-fallback warnings in the QualityReport."

# Tech tracking
tech-stack:
  added: []  # All deps already pinned (pydantic-ai, tenacity, pytest-httpx, structlog).
  patterns:
    - "**XML-tag prompt sandboxing (D-51):** every spec-text field wrapped in `<spec_excerpt source=\"METHOD path\">…</spec_excerpt>` block. System prompt explicitly instructs the LLM to treat tag content as data. The `source=` attribute is also inside the tag for defense-in-depth — even if the LLM ignores the system prompt's data-not-instruction guidance, it still has the structural metadata to cite which endpoint it's reasoning about."
    - "**Two-tier retry composition:** `run_llm_stage` wraps a 3× transient retry inline (httpx.HTTPError, exponential 1/2/4s) inside a 3× validation retry (`pydantic.ValidationError` OR `pydantic_ai.UnexpectedModelBehavior`). The latter catch is critical — PydanticAI's internal tool-call retry machinery raises `UnexpectedModelBehavior` (not `ValidationError`) when its `max_result_retries` exhausts. Without that catch, our outer validation-feedback retry would be shadowed."
    - "**Module-level Agent singleton:** `PASS_0_AGENT = make_agent(output_type=Pass0LlmOutput, system_prompt=PASS_0_SYSTEM_PROMPT)` constructed once at import. PydanticAI is happy to reuse Agent instances across calls — sampling/extra_body propagation happens at `.run()` time via `model_settings=PASS_0_SETTINGS`. Avoids per-call construction overhead and keeps the AST-walk anti-duplicate test trivially green."
    - "**4-phase chunked pipeline with deterministic merge:** Phase 1 path-cluster (first 2 segments), Phase 2 best-effort cross-cluster composite hints (single LLM call; failure degrades to empty hints), Phase 3 per-cluster detail with `asyncio.Semaphore(5)` (RESEARCH A4 calibrated default), Phase 4 deterministic merge with cross-cluster naming-collision disambiguation (`<cluster_namespace>_<name>` + 64-char clamp). Phase 4 is intentionally non-LLM so the pipeline is testable end-to-end with deterministic mocks."
    - "**Degraded fallback ceiling (orchestrator):** when `run_llm_stage` raises `LLM_VALIDATION_FAILED`, the orchestrator emits a degraded `Pass0LlmOutput` ONLY if `kept_count ≤ 80`. Beyond that ceiling we re-raise — emitting 80+ specialized tools would itself trigger `MULTI_SERVER_SPLIT_REQUIRED` from `enforce_caps`, defeating the user-facing fallback intent. The `prompt_injection_warnings` list carries the `degraded=true` flag for downstream surfacing."
    - "**Async pytest-httpx callback for concurrency probe:** `_delayed_callback_factory` returns an `async def` callback so `await asyncio.sleep` yields the event loop; sync `time.sleep` would serialize all in-flight requests regardless of the Semaphore cap, defeating the test."
    - "**FROZEN-IR conversion via model_dump round-trip:** `_to_pass0_dropped` and `_to_pass0_auth` translate between the IR's `DroppedEndpoint`/`AuthRequirement` and `DroppedEndpoint1`/`AuthRequirement1` variants (codegen produced both for Pass 0 vs final Pass0Output). One `model_dump`/`model_validate` round-trip keeps the orchestrator decoupled from which sub-stage variant a helper returned."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/prompts.py — 217 lines. PASS_0_SYSTEM_PROMPT (verbatim from pass-0-design §6.1 + naming regex literal + tier-cap inline) + build_user_prompt + build_retry_user_prompt. All spec-text wrapped in <spec_excerpt> blocks; description truncated to 200 chars per pass-0-design §6.2."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py — 165 lines. PASS_0_AGENT singleton + run_llm_stage with two-tier retry. NO direct OpenAIModel/Provider construction (Pitfall A) — the AST anti-duplicate test verifies this on every CI run."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/chunked.py — 304 lines. 4-phase chunked pipeline + CHUNKED_THRESHOLD/HARD_FAIL_THRESHOLD constants + cross-cluster naming disambiguation."
    - "apps/generation-engine/tests/test_pass_0_chunked.py — 314 lines, 7 tests covering Phase-1 clustering correctness, T-2-B6 chunked threshold, hard-fail @ > 1000, naming-collision disambiguation, concurrency-cap probe under simulated 50 ms latency."
    - ".planning/phases/02-generation-engine-architect-pass-0-1/02-06-SUMMARY.md — this file."
  modified:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py — replaced docstring stub (12 lines) with full orchestrator (304 lines). `async def run(raw_ir, options) -> Pass0Output` chains all sub-stages + degraded fallback + structlog structural-only logging."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py — extended Pass0LlmOutput with `composite_candidates` and `llm_dropped_endpoints` (default `[]`); imports CompositeCandidate from mcpgen_ir.types and Field from pydantic for the default_factory."
    - "apps/generation-engine/tests/test_pass_0_e2e.py — replaced 4 Wave-0 stub skips with 9 active tests (5 LLM-stage tests for Task 1 + 4 orchestrator E2E tests for Task 3). Covers T-2-B4 (naming retry exhaustion), XML sandboxing structure, system-prompt regression guards, T-2-B5 (multi-server split with concrete suggestions), degraded fallback, chunked-path triggering, and a happy path."
    - "apps/generation-engine/pyproject.toml — added per-file-ignores `S105` for prompts.py."

key-decisions:
  - "Single Agent singleton per pass (PASS_0_AGENT) — constructed at module import, sampling/extra_body via `.run()` model_settings. Saves construction cost on hot path; AST guard catches any future regression that bypasses make_agent."
  - "Catch BOTH `pydantic.ValidationError` AND `pydantic_ai.UnexpectedModelBehavior` in the validation-retry loop. PydanticAI's internal tool-call validation surfaces as the latter once its own retries exhaust; missing it would shadow our validation-feedback retry."
  - "Degraded-fallback ceiling at 80 kept endpoints. Beyond that the fallback would itself trigger `MULTI_SERVER_SPLIT_REQUIRED` — re-raising is more honest UX."
  - "Phase 2 (cross-cluster composite hints) is best-effort: failures degrade to empty hints rather than fail the whole chunked pipeline. Phase 3 + 4 produce the authoritative tool inventory; Phase 2 is purely additive."
  - "Cross-cluster naming-collision disambiguation uses cluster-namespace prefix (`v1_customers_users_create`) — deterministic, easy to debug, preserves the `_<resource>_<action>` shape for downstream readability."
  - "Synthetic Phase-2 cluster summary endpoints carry no real spec text (only structural metadata) so D-52 (no spec content in observability) is preserved by construction even if Langfuse traces capture full request bodies in a future Phase 9 instrumentation."
  - "Concurrency limit 5 (RESEARCH A4) is the default — initial calibration. CI may drop to 3 if 429s appear. Encoded as a parameter on `run_llm_chunked` rather than a global so tests can override."

patterns-established:
  - "**XML-sandboxed prompts:** any future LLM call that ingests user-controllable text (Pass 1 schema synth, Pass 2 description authoring, etc.) MUST follow the same `<spec_excerpt source=...>` pattern. The `prompts.py` module is the canonical reference."
  - "**Two-tier retry composition:** transient errors (httpx.HTTPError) wrapped INSIDE validation errors so the validation prompt feedback only fires when the LLM produced a structurally bad response, not when the network was flaky."
  - "**Pre-LLM count gate in orchestrator:** every pass orchestrator should fail-fast on size-class boundaries before any LLM call fires. Saves cost + gives users the signal earlier."
  - "**Degraded fallback as IR-shape preservation:** when retries exhaust, emit something the downstream IR expects (specialized ToolPlans) rather than raising. Surface the degradation via a structured warnings field. Keeps the contract stable for callers."
  - "**Concurrency cap via asyncio.Semaphore at the orchestrator layer:** never inside `run_llm_stage`. Composability — the inner LLM function knows nothing about the surrounding parallelism."

requirements-completed:
  - GEN-02

# Metrics
duration: 36min
completed: 2026-04-27
tasks-count: 3
files-created: 5
files-modified: 4
commits-count: 3
---

# Phase 2 Plan 06: Pass 0 LLM Stage + Chunked Path + Orchestrator Summary

**Pass 0 (Tool Inventory & Naming) is now end-to-end usable: `from mcpgen_engine.passes.pass_0 import run` chains deterministic-filter → auth-detect → Qwen LLM (single or chunked) → cap+naming validation, with XML-sandboxed prompts (D-51), two-tier retry + degraded fallback (D-26), and a hard-fail at > 1000 endpoints (D-20).**

## Performance

- **Duration:** ~36 min (3 atomic tasks; tight TDD loop with mocked OpenRouter via pytest-httpx).
- **Started:** 2026-04-27T17:12:19Z
- **Completed:** 2026-04-27T17:47:48Z (approx; commit timestamps)
- **Tasks:** 3/3 (100% completion).
- **Files created:** 5 (4 source + 1 test) — see key-files.created.
- **Files modified:** 4 — see key-files.modified.

## Accomplishments

- **Pass 0 Stage 0b shipping**: `prompts.py` + `llm.py` deliver XML-sandboxed prompts (D-51) and a two-tier retry policy (D-26) — transient errors retry with exponential backoff, validation errors retry with feedback folded into the next prompt, exhaustion converts to an orchestrator-handled degraded fallback. The AST anti-duplicate test (Plan 02-01) is still green: every LLM call goes through `make_agent`, never a direct `OpenAIModel`/`OpenAIProvider`.
- **Chunked path shipping**: `chunked.py` implements the canonical 4-phase pipeline from `docs/mcpgen-pass-0-design.md` §"Chunked approach". Path-cluster → cross-cluster hints → bounded-parallel per-cluster detail → deterministic merge with cross-cluster naming-collision disambiguation. The Stripe spec (~480 endpoints after Stage 0a) will exercise this on every E2E run, not deferred (per Specifics line in 02-CONTEXT).
- **Orchestrator shipping**: `__init__.py::run` chains all sub-stages into a single `async def run(raw_ir, options) -> Pass0Output`. Pre-LLM gate at > 1000 endpoints. Degraded fallback (D-26) with an 80-endpoint ceiling so we never produce a fallback that itself trips MULTI_SERVER_SPLIT_REQUIRED.
- **VALIDATION rows green**: T-2-B4 (naming regex), T-2-B5 (multi-server split with concrete suggestions), T-2-B6 (chunked threshold) all flip from `⬜ pending` to `✅ green`. 76 Pass-0 + AST-guard tests pass; fast suite runs in 0.6 s.
- **Threats addressed**: T-2-15 (prompt injection — XML sandboxing + system-prompt guardrail), T-2-16 (no spec text in logs — structlog structural fields only), T-2-17 (validation feedback retry, not silent fallback), T-2-18 (calibrated DoS — Semaphore(5) + tenacity 429 handling inherited from `run_llm_stage`).

## Task Commits

Each task was committed atomically with the conventional `feat(engine):` scope:

1. **Task 1: prompts.py + llm.py + Task-1 tests** — `0751708` (feat)
2. **Task 2: chunked.py + chunked tests** — `2be5f2f` (feat)
3. **Task 3: orchestrator __init__.py + Task-3 E2E tests** — `2e82d7c` (feat)

_All 3 commits passed pre-commit hooks (gitleaks / ruff / ruff-format / mypy --strict / conventional-commit) without any `--no-verify` bypass._

## Files Created/Modified

See frontmatter `key-files.created` / `key-files.modified` for the canonical list. Highlights:

- **`prompts.py`** — `PASS_0_SYSTEM_PROMPT` constant carries the literal strings the test suite regression-guards on (`<spec_excerpt>`, `NEVER as instructions`, `UNTRUSTED user data`, `^[a-z][a-z0-9_]{0,63}$`, `{service}_{resource}_{action}`). Description truncation cap is centralized in `_DESCRIPTION_PREVIEW_CHARS = 200`.
- **`llm.py`** — module-level `PASS_0_AGENT` singleton; the import-time construction satisfies the agent-factory invariant. The two-tier retry function `_run_with_transient_retry` is exposed for white-box tests if needed; `run_llm_stage` is the only public entry.
- **`chunked.py`** — `_ClusterResult` slim DTO; `_path_cluster` + `_cluster_namespace` + `_disambiguated_name` are private helpers exposed for tests via the underscore convention (Pass 0 tests import `_path_cluster` directly). `CHUNKED_THRESHOLD = 200` and `HARD_FAIL_THRESHOLD = 1000` are the canonical thresholds re-exported by the orchestrator.
- **`__init__.py`** — orchestrator. `_DEGRADED_FALLBACK_HARD_FAIL = 80` ceiling for the fallback path; conversion helpers `_to_pass0_dropped` / `_to_pass0_auth` bridge the IR's duplicate variants.
- **`tests/test_pass_0_e2e.py`** — replaced 4 Wave-0 skip stubs with 9 active tests. Async pytest-httpx callbacks for the chunked-path test. The mocked OpenRouter response shape (`final_result` tool-call with JSON arguments) is the canonical pattern any future LLM-stage test should follow.
- **`tests/test_pass_0_chunked.py`** — replaced 4 Wave-0 skip stubs with 7 active tests. The concurrency-cap probe uses `await asyncio.sleep` in an async pytest-httpx callback so the event loop stays cooperative — sync `time.sleep` would have serialized all in-flight calls regardless of the cap.

## Decisions Made

See frontmatter `key-decisions`. The non-obvious ones:

1. **Catching `UnexpectedModelBehavior` in addition to `ValidationError`.** Discovered during the first run of `test_naming_regex_violation_triggers_retry`: PydanticAI's tool-call validation exhausts an internal retry counter and raises `UnexpectedModelBehavior` (chained from `ToolRetryError`), not `ValidationError`. Adding the catch keeps the validation-feedback retry working when the LLM consistently emits regex-violating names.
2. **Degraded-fallback 80-endpoint ceiling.** Without it, a 100-endpoint Stripe-shape spec would hit LLM_VALIDATION_FAILED, emit 100 specialized ToolPlans, then immediately trip MULTI_SERVER_SPLIT_REQUIRED in `enforce_caps`. Re-raising is the more honest UX — users see the actual root cause.
3. **Phase 2 (cross-cluster hints) is best-effort.** A failed cross-cluster call shouldn't poison the chunked pipeline; Phase 3+4 produce the authoritative tool inventory. The hints are purely additive Pass-1 input.
4. **Per-file-ignores in pyproject for `S105` on prompts.py.** The hardcoded-password rule misfires on `PASS_0_SYSTEM_PROMPT` (variable-name prefix `PASS_*`). Per-file ignore is cleaner than scattering `# noqa: S105` directives in the source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] PydanticAI surfaces `UnexpectedModelBehavior`, not `ValidationError`, when tool-call retries exhaust**
- **Found during:** Task 1 (test_naming_regex_violation_triggers_retry first run)
- **Issue:** The test mocked OpenRouter to return a CamelCase tool name on every attempt; expected `Pass0Error("LLM_VALIDATION_FAILED")` after our 3-validation-retry loop. Instead, PydanticAI's internal `max_result_retries=1` exhausted first and raised `pydantic_ai.exceptions.UnexpectedModelBehavior` (cause: `ToolRetryError`). Our `except pydantic.ValidationError` clause never fired.
- **Fix:** Added a second `except UnexpectedModelBehavior` clause in `run_llm_stage` that folds the wrapped error into `last_validation_error` (with the `__cause__` class included for diagnostics) and continues the validation-retry loop. After 3 such attempts, the same `Pass0Error("LLM_VALIDATION_FAILED")` is raised.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py`
- **Verification:** test_naming_regex_violation_triggers_retry green; behavior verified on 3 consecutive httpx_mock responses with the same invalid payload.
- **Committed in:** `0751708` (Task 1 commit)

**2. [Rule 3 — Blocking issue] Ruff `S105` (hardcoded-password) misfires on `PASS_0_SYSTEM_PROMPT` variable name**
- **Found during:** Task 1 ruff check
- **Issue:** Ruff's S105 rule treats variable names matching `*PASS*` / `*PASSWORD*` as candidate hardcoded-password assignments when assigned to a string literal. Our `PASS_0_SYSTEM_PROMPT: Final[str] = """..."""` triggered the rule.
- **Fix:** Added per-file-ignores entry in `apps/generation-engine/pyproject.toml`: `"src/mcpgen_engine/passes/**/prompts.py" = ["S105"]`. Cleaner than per-line `# noqa: S105` on a multi-line string literal whose ruff highlight starts on the opening line.
- **Files modified:** `apps/generation-engine/pyproject.toml`
- **Verification:** `uv run ruff check src/mcpgen_engine/passes/pass_0/prompts.py` exits 0.
- **Committed in:** `0751708` (Task 1 commit)

**3. [Rule 2 — Missing feature for correctness] `Pass0LlmOutput.composite_candidates` + `llm_dropped_endpoints` were absent in Plan 02-05's shape**
- **Found during:** Task 1 (writing the LLM output schema)
- **Issue:** Plan 02-05 shipped `Pass0LlmOutput` with only `tool_plans`. The Stage 0b LLM, per `docs/mcpgen-pass-0-design.md` §1.2.6, must emit composite_candidates AND its own LOW_VALUE/REDUNDANT drops (LLM-judgment drops, in addition to deterministic Stage-0a drops).
- **Fix:** Extended `Pass0LlmOutput` in `validation.py` with `composite_candidates: list[CompositeCandidate] = []` and `llm_dropped_endpoints: list[DroppedEndpoint] = []` using `Field(default_factory=list)`. Defaults preserve backwards-compat with all 60 existing tests in `test_pass_0_filter.py` that construct `Pass0LlmOutput(tool_plans=...)`.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py`
- **Verification:** All 60 existing Plan 02-05 tests still green; new Plan 02-06 tests exercise the new fields.
- **Committed in:** `0751708` (Task 1 commit)

## Authentication Gates

None encountered. All tests run with mocked OpenRouter via pytest-httpx; the conftest `_sandbox_env` placeholder `OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER` keeps the real-network smoke (`test_qwen3_coder_structured_output`) skipped on every run.

## Self-Check: PASSED

**Files exist:**
- `apps/generation-engine/src/mcpgen_engine/passes/pass_0/prompts.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/passes/pass_0/chunked.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py` — FOUND (orchestrator, replaced stub)
- `apps/generation-engine/tests/test_pass_0_e2e.py` — FOUND (Wave-0 stubs replaced)
- `apps/generation-engine/tests/test_pass_0_chunked.py` — FOUND (Wave-0 stubs replaced)

**Commits exist (all on `feature/engine-passes`):**
- `0751708` (Task 1) — FOUND
- `2be5f2f` (Task 2) — FOUND
- `2e82d7c` (Task 3) — FOUND

**VALIDATION rows status:**
- T-2-B4 (naming regex on Pass-0 LLM-mocked output) — ✅ GREEN (was ⬜ pending)
- T-2-B5 (multi-server split with concrete suggestions) — ✅ GREEN (was ⬜ pending)
- T-2-B6 (chunked threshold > 200 endpoints) — ✅ GREEN (was ⬜ pending)

**Test totals:** 76 Pass-0 + AST-guard tests green in 0.6 s (`uv run pytest tests/test_pass_0_filter.py tests/test_pass_0_auth_detect.py tests/test_pass_0_chunked.py tests/test_pass_0_e2e.py tests/test_no_duplicate_model_construction.py -q`).

**Lint clean:** `uv run mypy src/mcpgen_engine/passes/` + `uv run ruff check src/mcpgen_engine/passes/` both exit 0.

**Anti-duplicate AST guard:** `tests/test_no_duplicate_model_construction.py` still green — no module outside `llm/client.py` constructs OpenAIModel/Provider.
