---
phase: 03-generation-engine-author-pass-2-3-4
plan: 04
subsystem: engine
tags: [pass-2, authoring, quality-gate, llm, pydantic-ai, openrouter, qwen, description-hash, retry-loop]

# Dependency graph
requires:
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: Plan 03-01 (sampling profiles + Wave-0 placeholders + description_hash IR field), Plan 03-02 (4 system prompts + build_user_prompt + build_retry_user_prompt + classify), Plan 03-03 (length budgets + forbidden phrases + validation surface + Pass2Error + render_description_markdown)
provides:
  - "4 module-level Agent[None, Description] singletons (one per tool type) constructed via make_agent"
  - "PASS_2_AUTHORING_CONCURRENCY = 10 (D-08); _MAX_VALIDATION_RETRIES = 2 (D-13)"
  - "author_all_tools(pass_1_output, raw_ir) — per-tool fan-out under Semaphore(10) with 2-tier retry (transient HTTP + Pydantic validation), D-12 invariant (re-runs ALL validators after every retry per Pitfall #10)"
  - "AuthoredToolResult + Pass2WarningSet emit-and-continue dataclasses (D-13)"
  - "quality_gate_all_tools(descriptions, pass_1_output, raw_ir) — single Qwen judge per tool with INLINE_GATE_SETTINGS, abbreviated 4-component rubric (purpose / guidelines / limitations / parameter_overview, drops Examples + Length per D-09), threshold ≥3, max 1 retry (D-09)"
  - "_GateScores closed Pydantic schema (extra='forbid')"
  - "description_hash(d) = sha256 over rendered markdown (D-14 + Open Q #1)"
  - "diff_summary(old, new) — counts only ({changed/unchanged/added/removed}), no spec content (privacy-safe)"
  - "async def run(pass_1_output, raw_ir) -> Pass2Output — 4-phase orchestrator (classify → authoring → quality_gate → assembly with description_hash)"
  - "PASS_2_VERSION = '1' (D-35 cache-key hint)"
affects:
  - "Plan 03-12 (pipeline orchestrator) — consumes pass_2.run() + diff.diff_summary() for D-14 SSE event surface"
  - "Plan 03-05/06 (Pass 3 mirror) — same module layout / 2-tier retry pattern / inline quality gate pattern"
  - "Plan 03-09/10 (Pass 4 mirror) — same Agent factory pattern; smaller scope (mostly deterministic)"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — uses pydantic-ai, httpx, structlog, pytest-httpx already pinned in Phase 2
  patterns:
    - "Per-tool-type Agent singleton dict (_AGENTS_BY_TYPE) for prompt routing"
    - "2-tier retry loop (outer validation-retry + inner exponential-backoff transient-HTTP-retry) — same shape as Pass 0/1 but with D-13's lower validation cap (2 vs 3)"
    - "D-12 invariant: re-run ALL validators after EVERY attempt (initial AND retries) — Pitfall #10 mitigation"
    - "Emit-and-continue per-tool warning dataclass (Pass2WarningSet) instead of raising Pass2Error on retry exhaustion (D-13)"
    - "Closed Pydantic schema (extra='forbid') for judge-mode LLM output to reject drift at decode time"
    - "Description hash = sha256 over rendered markdown (the user-visible string), not over JSON shape — Pitfall #7 surface"
    - "structlog only emits structural counts (D-52) — never spec content"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/diff.py
    - apps/generation-engine/tests/passes/pass_2/test_authoring.py
    - apps/generation-engine/tests/passes/pass_2/test_quality_gate.py
    - apps/generation-engine/tests/passes/pass_2/test_diff.py
    - apps/generation-engine/tests/passes/pass_2/test_run.py
  modified:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py  # REPLACED Wave-0 empty placeholder with the real 4-phase orchestrator

key-decisions:
  - "Quality-gate retry path imports authoring._author_one as a private cross-module dep (documented in module docstring) instead of promoting to a public symbol — Plan 03-12 does NOT need to re-author tools individually, so a public symbol would imply an external contract that does not exist."
  - "Concurrency Semaphore(10) lives in author_all_tools and quality_gate_all_tools, NOT in pass_2.__init__.run(). Plan body said 'Semaphore at module level, NOT per-tool' — interpreted as 'per-sub-module fan-out, not per-tool-call wrapping' since the orchestrator delegates entirely to those two coroutines. The plan's success-criteria item asking for grep 'Semaphore(10)' inside __init__.py would create a redundant wrapper that defeats the cap (a Semaphore around code that already has its own Semaphore degenerates the inner semaphore into a no-op when the outer is more restrictive)."
  - "Test for warnings_count uses pytest's capsys (not caplog) — structlog default config writes to stdout, not via Python logging module; caplog returns empty in this configuration."
  - "Test test_author_one_pydantic_validation_error_raises_with_invalid_payload asserts Pass2Error is raised when the LLM persistently emits structurally-invalid payloads — this is the documented behavior per the docstring (pure transient/validation crashes raise Pass2Error so the orchestrator can decide); only validator-level violations (length/forbidden/examples) hit emit-and-continue."

patterns-established:
  - "Module-level Agent singletons indexed by Tool1.type — pattern reused for any future per-tool-type LLM call site (Pass 3 / Pass 4 will follow)"
  - "Closed Pydantic intermediate type (_GateScores with extra='forbid') for judge-mode LLM output — pattern reused for any inline-judge call site"
  - "Description-hash convention: sha256 over the rendered user-visible string (not JSON) — same pattern will apply to Tool description / Annotation / Response config drift detection in later passes"
  - "Two retry budgets per pass (validation cap from D-13 + gate cap from D-09) operate independently — total worst-case LLM calls per tool is bounded by (max validation retries + 1) + (max gate retries + 1) = 3 + 2 = 5 calls"

requirements-completed: [GEN-04]

# Metrics
duration: 18min
completed: 2026-04-28
---

# Phase 3 Plan 04: Pass 2 LLM-bearing core Summary

**4 per-tool-type Agent singletons + per-tool fan-out under Semaphore(10) + 2-tier retry with D-12 revalidation invariant + inline quality gate (single Qwen judge, abbreviated 4-component rubric, max 1 retry per D-09) + description_hash helper (D-14 / Pitfall #7) + 4-phase Pass2Output orchestrator.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-28T01:29:50Z
- **Completed:** 2026-04-28T01:48:05Z
- **Tasks:** 3 (all atomic commits)
- **Files modified:** 8 (4 new source + 4 new tests; 1 placeholder __init__.py replaced)

## Accomplishments

- **Authoring (`authoring.py`):** 4 module-level Agent singletons (one per tool type — universal/action/workflow/specialized) wired through `make_agent` (no direct OpenAIModel construction per Pitfall A). Per-tool fan-out via `asyncio.Semaphore(10)`. Two-tier retry: outer validation-retry (max 2 per D-13) re-runs ALL three validators (length + forbidden + examples-from-spec) after every attempt per the D-12 invariant (Pitfall #10 mitigation); inner exponential-backoff httpx-retry (1s/2s/4s, max 3 attempts).
- **Emit-and-continue (D-13):** retry exhaustion produces a `Pass2WarningSet` dataclass with `length_violation` / `forbidden_pattern_violation` / `examples_not_in_spec` flags — does NOT raise. Pure transient/validation crashes (no successful LLM call) raise `Pass2Error("AUTHORING_FAILED")` so the orchestrator can decide.
- **Quality gate (`quality_gate.py`):** single Qwen judge per tool with `INLINE_GATE_SETTINGS` (T=0.0). Abbreviated 4-component rubric (purpose / guidelines / limitations / parameter_overview, drops Examples + Length per D-09). Threshold ≥3 each. <3 → 1 retry of authoring for that tool only with rubric feedback baked in via re-author. Closed Pydantic intermediate type (`_GateScores`, `extra='forbid'`) catches LLM drift at decode time.
- **Diff helpers (`diff.py`):** `description_hash(d)` = sha256 over the rendered markdown (D-14 + research Open Q #1 — user-visible drift, not JSON shape). `diff_summary(old, new)` returns `{changed/unchanged/added/removed}` counts only — no spec content (privacy-safe per CLAUDE.md rules). Consumed by Plan 03-12 pipeline for D-14 SSE event.
- **Orchestrator (`__init__.py` REPLACED):** `async def run(pass_1_output, raw_ir) -> Pass2Output` chains the 3 LLM/det phases, sets `description_hash` on every emitted `Descriptions` (D-14 surface), and logs structural counts (warnings_count / quality_warning_count / prompt_injection_warnings_count) per D-13 + D-15 + D-52. `PASS_2_VERSION = "1"` is the D-35 cache-key hint.
- **Test coverage:** 52 new unit tests (18 authoring + 14 quality_gate + 11 diff + 9 run). Total Pass 2 suite: 140 tests, all green. mypy + ruff clean across the entire pass_2 source + test tree. No regressions in pass_0/pass_1 tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: authoring.py — 4 Agent singletons + Sem(10) + 2-tier retry** — `ce227b6` (feat)
2. **Task 2: quality_gate.py — single Qwen judge + abbreviated rubric** — `1c593df` (feat)
3. **Task 3: diff.py + run() orchestrator (4-phase chain)** — `2fc7e61` (feat)

_Plan metadata commit (this SUMMARY) lands separately._

## Files Created/Modified

- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py` (NEW, 269 lines) — 4 Agent singletons + author_all_tools fan-out + 2-tier retry + Pass2WarningSet + AuthoredToolResult.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py` (NEW, 178 lines) — single Qwen judge with abbreviated 4-component rubric, max 1 retry per D-09.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/diff.py` (NEW, 51 lines) — description_hash + diff_summary helpers (Pitfall #7 mitigation).
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py` (REPLACED, 125 lines) — 4-phase orchestrator (was the empty Wave-0 placeholder from Plan 03-01).
- `apps/generation-engine/tests/passes/pass_2/test_authoring.py` (NEW, 18 tests).
- `apps/generation-engine/tests/passes/pass_2/test_quality_gate.py` (NEW, 14 tests).
- `apps/generation-engine/tests/passes/pass_2/test_diff.py` (NEW, 11 tests).
- `apps/generation-engine/tests/passes/pass_2/test_run.py` (NEW, 9 tests).

## Decisions Made

1. **Concurrency Semaphore lives in sub-modules, not in `__init__.py::run`.** Plan must-haves explicitly require `asyncio.Semaphore(PASS_2_AUTHORING_CONCURRENCY)` inside `author_all_tools` (✓) and `Semaphore(QUALITY_GATE_CONCURRENCY)` inside `quality_gate_all_tools` (✓). The plan body says "concurrency 10 across the entire pass (D-08 — Semaphore at module level, NOT per-tool)" — interpreted as "per-sub-module fan-out, not per-tool-call wrapping" since the orchestrator delegates entirely to those two coroutines. Adding a wrapper Semaphore in `__init__.py::run` would either be a no-op (if outer is at least as restrictive) or make the inner caps unreachable (if outer is more restrictive) — neither outcome adds correctness. The success-criteria item asking for grep "Semaphore(10)" in `__init__.py` was inconsistent with the plan body and not implemented.

2. **Quality gate's retry path imports `authoring._author_one` as a private cross-module dep** (documented in `quality_gate.py` module docstring) rather than promoting to a public symbol. Plan 03-12 does NOT need to re-author tools individually — exposing a public re-author function would imply an external contract that does not exist. The private-import convention is consistent with how `_run_with_transient_retry` is used inside `pass_0/llm.py`.

3. **Test warnings_count via `capsys`, not `caplog`.** structlog's default configuration writes to stdout via its renderer chain, not through Python's `logging` module — so `caplog.records` is empty for these messages. `capsys.readouterr().out` captures the rendered `key=value` log lines reliably across local + CI runs.

4. **Pydantic-validation crash test asserts `Pass2Error("AUTHORING_FAILED")` raised.** When the LLM persistently emits structurally-invalid payloads (e.g., `purpose` shorter than the IR `min_length=20` constraint), PydanticAI's internal retry exhausts AND our outer validation-retry exhausts AND `last_description` remains None — the documented behavior per `_author_one` docstring is to raise so the orchestrator can decide whether to fail the pass or skip the tool. Only validator-level violations (length/forbidden/examples) hit the emit-and-continue D-13 path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed redundant `httpx_mock` parameter from concurrency test**
- **Found during:** Task 1 (test_authoring.py post-write ruff check)
- **Issue:** `test_author_all_tools_respects_concurrency_10` declared `httpx_mock: HTTPXMock` but used `monkeypatch` to stub the agents directly; ruff's `ARG001` flagged the unused parameter.
- **Fix:** Removed the parameter (the test never makes an actual HTTP request — agents are monkeypatched).
- **Files modified:** apps/generation-engine/tests/passes/pass_2/test_authoring.py
- **Committed in:** ce227b6 (Task 1 commit)

**2. [Rule 3 - Blocking] Added `noqa: ARG001` markers to fake-function signatures matching real signatures**
- **Found during:** Tasks 2 + 3 (post-write ruff checks)
- **Issue:** `fake_judge_one`, `fake_retry_author`, `fake_author_all_tools`, `fake_quality_gate_all_tools` all need to match the real function signatures (so monkeypatch substitution works), but unused parameters tripped ruff's `ARG001`.
- **Fix:** Added per-parameter `noqa: ARG001` with rationale comment "signature must match real fn".
- **Files modified:** apps/generation-engine/tests/passes/pass_2/test_quality_gate.py, apps/generation-engine/tests/passes/pass_2/test_run.py
- **Committed in:** 1c593df + 2fc7e61

**3. [Rule 3 - Blocking] Added `noqa: S105` to `PASS_2_VERSION = "1"`**
- **Found during:** Task 3 (post-write ruff check)
- **Issue:** ruff's `S105` ("hardcoded password") false-positives on any `*_VERSION` / `PASS_*` variable assigned a short string literal (the rule pattern-matches on variable name).
- **Fix:** Added `# noqa: S105 — version string, not a credential` on both the source assignment and the test assertion. The existing per-file-ignores in pyproject.toml only cover `passes/**/prompts.py` (where `PASS` is the system-prompt prefix); the orchestrator's `PASS_2_VERSION` lives in `__init__.py` so a per-line noqa is the smallest fix.
- **Files modified:** apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py, apps/generation-engine/tests/passes/pass_2/test_run.py
- **Committed in:** 2fc7e61 (Task 3 commit)

**4. [Rule 3 - Blocking] Removed unused `import logging` from test_run.py**
- **Found during:** Task 3 (post capsys-switch ruff check)
- **Issue:** Refactored `test_run_aggregates_warnings_count_in_log` from caplog → capsys (structlog writes to stdout); the `import logging` line became dead.
- **Fix:** Removed the import.
- **Files modified:** apps/generation-engine/tests/passes/pass_2/test_run.py
- **Committed in:** 2fc7e61

---

**Total deviations:** 4 auto-fixed (all Rule 3 — blocking lint issues uncovered by ruff post-write).
**Impact on plan:** All deviations are mechanical lint corrections; zero functional or semantic change to the implementation. No scope creep.

## Issues Encountered

- **caplog returned empty for structlog INFO messages.** structlog's default configuration writes formatted `key=value` lines to stdout via its renderer chain rather than going through Python's `logging` module. Resolution: switched the warnings-count assertion tests to use `capsys.readouterr().out` instead of `caplog.records`. This is consistent with how `tests/test_observability.py` and other engine tests assert on structured log output.

## Acceptance criteria verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `pass_2/__init__.py` REPLACED (no longer empty) | ✅ | `wc -l = 125`; exports `async def run` + `Pass2Error` |
| Pitfall #10 mitigation (retry re-runs ALL validators) | ✅ | `_author_one` re-runs `validate_description_length` + `validate_no_forbidden_phrases` + `validate_examples_from_spec` after EVERY attempt (initial AND retries); covered by `test_author_one_length_violation_then_recovers` + `test_author_one_forbidden_phrase_then_recovers` + `test_author_one_examples_hallucination_then_recovers` |
| D-14 description_hash on every Descriptions entry | ✅ | `test_run_emits_pass_2_output_with_description_hash_on_every_tool` asserts `d.description_hash is not None` and `len(d.description_hash) == 64` |
| D-12 retry-prompt invariant | ✅ | `test_author_one_retry_uses_build_retry_user_prompt` asserts the 2nd HTTP call body contains `<previous_attempt_validation_error>` AND "Examples MUST be drawn directly from the OpenAPI spec" |
| D-13 emit-and-continue | ✅ | `test_author_one_length_violation_after_3_attempts_emits_with_warning` returns AuthoredToolResult with `warnings.length_violation is not None` (no raise) |
| D-09 abbreviated rubric (4 components, threshold ≥3, max 1 retry) | ✅ | Constants `_RUBRIC_THRESHOLD = 3`, `_MAX_GATE_RETRIES = 1`; rubric covered by `test_judge_one_passes_when_all_scores_at_threshold` + `test_judge_one_fails_when_any_score_below_threshold`; max 1 retry covered by `test_quality_gate_all_tools_retries_then_fails` (judge_call_count == 2) |
| D-08 concurrency 10 in authoring | ✅ | `PASS_2_AUTHORING_CONCURRENCY = 10`; verified by `test_author_all_tools_respects_concurrency_10` |
| Tests pass: `cd apps/generation-engine && uv run pytest -x -q tests/passes/pass_2/` | ✅ | 140 tests passed (88 baseline + 52 new) |
| No regressions in `tests/passes/` | ✅ | Full passes/ test suite green |
| mypy + ruff clean across pass_2 source + tests | ✅ | mypy: "Success: no issues found in 20 source files"; ruff: "All checks passed!" |

## Next Phase Readiness

- **Plan 03-05 (Pass 3 LLM-bearing core):** can mirror the same patterns established here — per-parameter Agent singleton, per-tool fan-out under Semaphore, 2-tier retry, inline quality gate.
- **Plan 03-12 (pipeline orchestrator):** can `from mcpgen_engine.passes import pass_2` and `await pass_2.run(pass_1_output, raw_ir)`. The returned `Pass2Output.descriptions[name].description_hash` is set on every entry — Plan 03-12 owns the cache-warm comparison and SSE `description_diff_summary` event using `pass_2.diff.diff_summary(old_hashes, new_hashes)`.
- **Plan 03-13 / 03-14 (smoke + integration):** the `tests/integration/test_description_diff.py` placeholder is unblocked once Plan 03-12 wires the orchestrator end-to-end.

## Self-Check: PASSED

Files exist:
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py` ✓
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py` ✓
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/diff.py` ✓
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py` (replaced, 125 lines) ✓
- `apps/generation-engine/tests/passes/pass_2/test_authoring.py` ✓
- `apps/generation-engine/tests/passes/pass_2/test_quality_gate.py` ✓
- `apps/generation-engine/tests/passes/pass_2/test_diff.py` ✓
- `apps/generation-engine/tests/passes/pass_2/test_run.py` ✓

Commits exist (verified via `git log --oneline`):
- `ce227b6` (Task 1) ✓
- `1c593df` (Task 2) ✓
- `2fc7e61` (Task 3) ✓

---
*Phase: 03-generation-engine-author-pass-2-3-4*
*Plan: 04*
*Completed: 2026-04-28*
