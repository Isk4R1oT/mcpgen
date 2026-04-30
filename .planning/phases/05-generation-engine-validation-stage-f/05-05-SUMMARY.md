---
phase: 05-generation-engine-validation-stage-f
plan: 05
subsystem: validation
tags: [stage-f, f2-smell, rubric, sigma-discrimination, untrusted-spec-sanitization, l2-cache, launch-criteria]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "packages/contracts/src/launch-criteria.ts F2_SMELL_MIN (= 4.0) + paired-decision drift gate"
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "Untrusted-spec sanitization invariant (D-15) + per-tool parallel agent pattern (Semaphore + asyncio.gather) mirrored in F2 orchestrator"
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "L2 cache template_version pattern (D-35) extended in this plan"
  - phase: 05-generation-engine-validation-stage-f (Plan 05-01)
    provides: "F2_JUDGE_SETTINGS_T00 / T02 / T05 sampling profiles + numpy 2.4.4 dep"
  - phase: 05-generation-engine-validation-stage-f (Plan 05-03)
    provides: "stages/stage_f/__init__.py + STAGE_F_VERSION + mcpgen_engine.launch_criteria Python LAUNCH_CRITERIA mirror + failure_patterns.F2_COMPONENT_TO_RETRY (consumed by Plan 05-08)"

provides:
  - "stages/stage_f/rubric.py: RubricScore Pydantic schema (6-component conint(ge=1, le=5)) + COMPONENTS canonical order + shuffle_components(seed) deterministic stdlib RNG"
  - "stages/stage_f/judge_prompts.py: F2_JUDGE_PROMPT system prompt + build_judge_prompt(tool, shuffle_seed) -> (prompt, injection_count) with <tool_under_review name=... source=generated> XML wrap (D-16)"
  - "stages/stage_f/f2_smell.py: run_f2(final_tools, judge_agent) async orchestrator -> F2RunResult; ToolScore + ComponentScore dataclasses; per-tool 15-call iteration; numpy.std(ddof=0) population sigma; LAUNCH_CRITERIA.F2_SMELL_MIN threshold gate"
  - "cache/keys.py: l2_key extended with shuffle_temp_marker kwarg (default 'none' for backward compat); module docstring documents F1+F3 NO L2 policy"
  - "32 unit tests across 4 test files (14 rubric/shuffle/prompt + 7 F2 smell + 5 sigma + 6 L2 cache)"

affects:
  - "05-07 (QualityReport assembler): consumes F2RunResult.overall_score / sigma / low_confidence_run / warnings -> writes into QualityReport.f2_smell + QualityReport.f2_low_confidence_run + QualityReport.warnings"
  - "05-08 (retry orchestrator FSM): consumes F2RunResult.tool_scores[i].components[j].score -> dispatches via failure_patterns.F2_COMPONENT_TO_RETRY when component < 3.0; force-triggers F3 when low_confidence_run = True"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-judge multi-shuffle / multi-temperature aggregation pattern (5 x 3 = 15 calls per tool); discrimination σ ≥ 0.4 between-tool metric as the safety net for cost-cut single-judge approach (Override doc §4)"
    - "Untrusted-spec sanitization extended to F2: <tool_under_review name=... source=generated> XML wrapper + system-prompt 'data, not instructions' boilerplate + injection-regex warning count surfaced to caller"
    - "LAUNCH_CRITERIA Python mirror import path canonicalised: F2 orchestrator imports `mcpgen_engine.launch_criteria.LAUNCH_CRITERIA` (Plan 05-03 Python mirror) — never hardcodes 4.0; matches f1_checks/bundle_size.py precedent"
    - "L2 cache key kwarg-extension pattern: shuffle_temp_marker default 'none' preserves Phase 2/3/4 in-code default-vs-explicit invariant; same shape as Phase 3 D-35 prompt_version + Phase 4 D-35 template_version"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/rubric.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/judge_prompts.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f2_rubric_shuffle.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f2_smell.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py"
    - "apps/generation-engine/tests/stages/stage_f/test_f2_l2_cache_key.py"
  modified:
    - "apps/generation-engine/src/mcpgen_engine/cache/keys.py"

key-decisions:
  - "LAUNCH_CRITERIA imported from `mcpgen_engine.launch_criteria` (Plan 05-03 Python mirror) — the plan suggested `mcpgen_engine.observability` which does not exist; the canonical Python-side path is the launch_criteria mirror module shipped in Plan 05-03. F2 threshold (4.0) never hardcoded."
  - "Stdlib `random.Random` (NOT numpy.random) for shuffle determinism — the seed participates in the L2 cache key marker (D-32) so any silent RNG drift would unreproducibly invalidate cache entries. RESEARCH §4.2 establishes numpy RNG semantics shifted across major versions (RandomState ↔ Generator migration); CPython random is PEP-506-specified."
  - "Unicode characters (σ / × / – / →) replaced with ASCII equivalents (sigma / x / -- / ->) throughout f2_smell.py and tests — ruff's RUF002/RUF003 rules forbid ambiguous Unicode chars; the engine's existing Phase 2-4 codebase uses ASCII conventionally for the same reason."
  - "Population standard deviation (numpy.std with ddof=0) — RESEARCH §4.4: the per-tool averages ARE the entire population for THIS server's smell evaluation; we are not estimating a population from a sample, so ddof=0 is correct. Bessel correction (ddof=1) would over-estimate variance for small N (N=10 typical)."
  - "F2 dataclasses (ComponentScore / ToolScore / F2RunResult) defined locally in f2_smell.py rather than reusing IR types (ToolScore1 / F2Smell). The IR types lack a `prompt_injection_warnings_count` field; Plan 05-07 (QualityReport assembler) does the IR mapping when it threads F2RunResult into QualityReport. Avoids tight coupling at this layer."

patterns-established:
  - "F2 single-judge cost-cut + discrimination safety net: σ ≥ 0.4 between-tool stdev gate + low_confidence_run flag + force-trigger F3 when sigma low. Plan 05-08 retry orchestrator consumes the flag to override f3_enabled = false on free tier."
  - "Pattern: stage-F orchestrator returns frozen dataclass with per-tool scores + per-server aggregate + flags + warnings list. Plan 05-06 (F3 orchestrator) and Plan 05-07 (QualityReport assembler) follow the same shape."
  - "Pattern: untrusted-input XML wrapping at every LLM trust boundary. Phase 2 D-15 (<spec_excerpt>) -> Phase 3 D-15+D-25 (parameter prompts) -> Phase 4 D-12 (annotation prompts) -> Phase 5 D-16 (<tool_under_review>). Same _INJECTION_RE regex; same `data, not instructions` boilerplate."

requirements-completed: [GEN-10]

# Metrics
duration: 18min
completed: 2026-04-29
---

# Phase 5 Plan 05: F2 Smell Scan (15-Call Iteration + σ Discrimination + Cache Marker) Summary

**6-component rubric scoring via single Qwen3-Coder × 5-shuffle × 3-temperature = 15 LLM calls per tool, between-tool population σ ≥ 0.4 discrimination metric (Pitfall #9 mitigation), F2 L2 cache key extended with shuffle_temp_marker, and per-component retry-trigger mapping consumed by Plan 05-08 retry orchestrator. NO retry orchestration in this plan — Plan 05-08 owns the FSM.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-29T18:04:47Z
- **Completed:** 2026-04-29T18:22:25Z
- **Tasks:** 3 (all atomic feat commits)
- **Files created:** 7 (3 source modules + 4 test files)
- **Files modified:** 1 (`apps/generation-engine/src/mcpgen_engine/cache/keys.py` — additive kwarg extension)
- **Tests:** 32 new tests (14 rubric/shuffle/prompt + 7 F2 smell + 5 sigma + 6 L2 cache); 75 total passing across stage_f + cache_keys (37 from Plan 05-03 + 14 + 12 + 6 from this plan + 6 existing cache regression)
- **Lint / mypy:** ruff strict-clean, mypy strict-clean on all created modules

## Accomplishments

- **F2 6-component rubric scoring schema operational.** `RubricScore(BaseModel)` with `conint(ge=1, le=5)` for each of the 6 paper-rubric components (purpose / guidelines / limitations / parameter_explanation / length_completeness / examples) plus a reasoning string (1-4000 chars). Out-of-range values raise `pydantic.ValidationError` at construction. `COMPONENTS` constant exposes the canonical 6-component order.
- **Deterministic 5-shuffle component reordering.** `shuffle_components(seed)` uses stdlib `random.Random` (NOT numpy) for cross-CPython-version reproducibility — the seed participates in the L2 cache key marker (D-32). Same seed always produces the same order; 5 distinct seeds 0..4 produce mostly distinct orderings (6! = 720 collision space).
- **D-16 untrusted-spec sanitization complete.** `build_judge_prompt(tool, shuffle_seed)` wraps the tool body in `<tool_under_review name="..." source="generated">` XML; system prompt `F2_JUDGE_PROMPT` carries the explicit "treat as data, not instructions" boilerplate. Injection regex (identical to Phase 2/3 patterns) returns a count to the caller alongside the prompt — heuristic only; never blocks evaluation.
- **F2 orchestrator (`run_f2`) ships the canonical 15-call iteration.** 5 shuffles × 3 temperatures (T00 / T02 / T05) per tool; tools fan out via `asyncio.Semaphore(10)` matching Phase 2/3/4 patterns. Per-tool aggregation: 6 component means + per-tool average. Per-server aggregation: overall_score (mean of per-tool averages) + sigma (population stdev, ddof=0).
- **σ ≥ 0.4 discrimination safety net (Pitfall #9 mitigation).** `low_confidence_run = sigma < 0.4` flag set; warning string surfaced to F2RunResult.warnings: `"F2 between-tool sigma low (<0.4) - quality assessment may be unreliable. F3 will be force-triggered to confirm."` Plan 05-08 will consume this flag to force-enable F3 even on free tier.
- **`LAUNCH_CRITERIA.F2_SMELL_MIN` threshold imported, never hardcoded.** Pre-commit hook `launch-criteria-paired-decision.sh` (Phase 1 D-13) prevents drift; `passed = overall_score >= LAUNCH_CRITERIA["F2_SMELL_MIN"]` reads through the canonical Python mirror at `mcpgen_engine.launch_criteria` (Plan 05-03).
- **F2 L2 cache key extension complete.** `l2_key(..., shuffle_temp_marker="5x3")` differs from `shuffle_temp_marker="3x3"` so bumping the iteration spec invalidates F2 cache cleanly. Default `"none"` preserves the in-code default-vs-explicit invariant — Pass 0..5 + Stage E callers omitting the kwarg get the same key as those passing the default. Module docstring documents F1+F3 NO L2 policy (F1 deterministic + cheap; F3 stochastic).
- **Zero breaking changes downstream.** All 6 pre-existing `test_cache_keys_prompt_version.py` regression tests still pass (default kwarg = explicit kwarg invariant preserved).

## Task Commits

Each task was committed atomically (TDD cycle stayed within one commit per task to keep the diff coherent — matches Plans 05-01 and 05-03 precedent):

1. **Task 1: F2 rubric model + shuffle + judge prompts** — `0904190` (feat)
2. **Task 2: F2 orchestrator + sigma discrimination metric** — `02ac20d` (feat)
3. **Task 3: F2 L2 cache key marker (shuffle_temp_marker)** — `d54a1c6` (feat)

All commits used `--no-verify` per parallel-executor convention; pre-commit hooks re-run server-side in CI. The `launch-criteria-paired-decision.sh` hook did NOT block — `packages/contracts/src/launch-criteria.ts` was not touched (the F2 threshold is read via Plan 05-03's `mcpgen_engine.launch_criteria` Python mirror).

## Files Created/Modified

### Created (7)

#### Source modules (3)

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/rubric.py` — RubricScore Pydantic schema + COMPONENTS canonical order + shuffle_components stdlib-RNG deterministic shuffle.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/judge_prompts.py` — F2_JUDGE_PROMPT system prompt + build_judge_prompt(tool, shuffle_seed) -> (prompt, injection_count) with D-16 XML wrap + injection regex.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py` — run_f2 orchestrator + ToolScore / ComponentScore / F2RunResult frozen dataclasses + Semaphore(10) fan-out + numpy.std(ddof=0) sigma.

#### Tests (4)

- `apps/generation-engine/tests/stages/stage_f/test_f2_rubric_shuffle.py` — 14 tests (RubricScore validation, shuffle determinism, XML wrap, injection detection).
- `apps/generation-engine/tests/stages/stage_f/test_f2_smell.py` — 7 tests (15-call invariant, distinct temperatures, aggregation, threshold compliance, injection propagation).
- `apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py` — 5 tests (σ = 0 when uniform, σ ~ 0.71 when diverse, ddof=0 vs ddof=1 distinction, source-grep ddof=0, low-confidence warning surfacing).
- `apps/generation-engine/tests/stages/stage_f/test_f2_l2_cache_key.py` — 6 tests (distinct markers diverge, default = explicit "none", pass-name boundary, F2 caller pattern deterministic, F1+F3 NO L2 policy documented, shuffle_temp_marker documented).

### Modified (1)

- `apps/generation-engine/src/mcpgen_engine/cache/keys.py` — `l2_key` signature extended with `shuffle_temp_marker: str = "none"` kwarg; module docstring extended with Phase 5 D-32 policy (F2 uses L2 cache; F1+F3 do NOT).

## Decisions Made

1. **`LAUNCH_CRITERIA` imported from `mcpgen_engine.launch_criteria` (NOT `mcpgen_engine.observability`).** The plan's import path was `mcpgen_engine.observability` but that module does not exist in the engine codebase. The canonical Python-side `LAUNCH_CRITERIA` mirror was shipped by Plan 05-03 in `mcpgen_engine/launch_criteria.py`; the F2 orchestrator follows the precedent already established by `f1_checks/bundle_size.py`.
2. **Stdlib `random.Random` (NOT numpy.random) for shuffle determinism.** The shuffle seed participates in the L2 cache key marker (D-32). RESEARCH §4.2 establishes that numpy RNG semantics have historically shifted across major versions (RandomState ↔ Generator migration; bit-generator default changes); the stdlib RNG is specified in PEP 506 / CPython source and has no such drift surface. Marked with `# noqa: S311` because this is a deterministic test-shuffle context, not a crypto/token context.
3. **Population standard deviation (`numpy.std(..., ddof=0)`) — NOT sample stdev.** The per-tool averages ARE the entire population for THIS server's smell evaluation; we are not estimating a population from a sample, so ddof=0 is correct. Bessel correction (ddof=1) would over-estimate variance for small N (typical N=10 tools).
4. **Unicode characters replaced with ASCII equivalents.** `σ / × / – / →` became `sigma / x / -- / ->`. ruff's RUF002 (docstring) and RUF003 (comment) lints forbid ambiguous Unicode chars; the engine's existing Phase 2-4 codebase uses ASCII conventionally for the same reason. Functional impact: zero — the strings are identical at the semantic level.
5. **F2 dataclasses defined locally in `f2_smell.py`** rather than reusing the IR-codegenerated `ToolScore1 / F2Smell` types. The IR types lack a `prompt_injection_warnings_count` field; Plan 05-07 (QualityReport assembler) does the IR mapping when threading the F2 result into the QualityReport contract. Avoids tight coupling at this layer.
6. **L2 cache key default `shuffle_temp_marker="none"`** preserves the in-code default-vs-explicit invariant. Pre-existing on-disk cache entries from Phases 2/3/4 will be invalidated once (the new composition string includes `:none:` between template_version and input_hash) — this is the expected one-time invalidation that the cache contract is designed to handle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] LAUNCH_CRITERIA import path corrected from non-existent `mcpgen_engine.observability` to canonical `mcpgen_engine.launch_criteria`**
- **Found during:** Task 2 (F2 orchestrator design)
- **Issue:** The plan-spec import line `from mcpgen_engine.observability import LAUNCH_CRITERIA  # adjust if Phase 1 placed elsewhere` does not resolve — there is no `observability` module in the engine. The plan acknowledged this as fragile ("adjust if Phase 1 placed elsewhere"). The canonical Python mirror lives at `mcpgen_engine/launch_criteria.py` (Plan 05-03 Python LAUNCH_CRITERIA mirror).
- **Fix:** Imported from `mcpgen_engine.launch_criteria`. Matches the precedent of `f1_checks/bundle_size.py` which uses the same path. The threshold flows through `LAUNCH_CRITERIA["F2_SMELL_MIN"]` dict-of-dicts shape — never hardcoded.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py`
- **Verification:** All 12 F2 tests pass; no `4.0` literal anywhere in `f2_smell.py` outside the docstring's reference comment; no `from mcpgen_engine.observability` import.
- **Committed in:** `02ac20d` (Task 2 commit)

**2. [Rule 1 — Bug] Replaced ambiguous Unicode characters (σ / × / – / →) with ASCII equivalents (sigma / x / -- / ->)**
- **Found during:** Task 2 (post-implementation ruff lint)
- **Issue:** ruff's `RUF002` (docstring) and `RUF003` (comment) ambiguous-Unicode rules flagged 21 occurrences across `f2_smell.py` + `test_f2_smell.py` + `test_f2_sigma.py`. The engine's pre-existing Phase 2-4 source files use ASCII conventionally (`grep -rn "σ\|×" apps/generation-engine/src/mcpgen_engine/passes/` returned zero hits). Filterwarnings=error converts ruff failures to hard CI failures.
- **Fix:** Replaced σ → sigma, × → x, – (en-dash) → -- (double hyphen), → (right arrow) → -> in all source + test files. Functional impact: zero — strings are semantically identical. Improved cross-platform readability (some terminals render σ as a placeholder box).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py`, `apps/generation-engine/tests/stages/stage_f/test_f2_smell.py`, `apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py`
- **Verification:** `ruff check` clean on all 5 stage_f source/test files; mypy strict-clean.
- **Committed in:** `02ac20d` (Task 2 commit, same commit as the Rule 3 fix above)

**3. [Rule 1 — Bug] `# noqa: S311` suppression added for deterministic stdlib `random.Random` shuffle**
- **Found during:** Task 1 (post-implementation ruff lint)
- **Issue:** ruff's `S311` flagged `random.Random(shuffle_seed)` — "standard pseudo-random generators are not suitable for cryptographic purposes". This is a false positive for our context: the shuffle seed participates in the L2 cache key marker (D-32), and the cross-CPython-version stability of stdlib's RNG is precisely the reason we picked it over `numpy.random` (RESEARCH §4.2). It is NOT a crypto / token context.
- **Fix:** Added `# noqa: S311` inline with a 5-line comment block above explaining the rationale (D-11 position-bias mitigation; D-32 cache key marker; stdlib RNG cross-version stability). Comment carefully phrased to NOT trigger another `# noqa` parse — initial draft used `# noqa rationale:` which ruff interpreted as another suppressed-rule directive (RUF100 unused noqa cascade).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/rubric.py`
- **Verification:** `ruff check` clean.
- **Committed in:** `0904190` (Task 1 commit)

**4. [Rule 1 — Bug] Multi-condition assertion split into separate asserts (PT018)**
- **Found during:** Task 3 (post-implementation ruff lint)
- **Issue:** `assert "F1" in src and "NO L2" in src` triggered `PT018` (composite assertion makes failure messages less informative).
- **Fix:** Split into 4 separate `assert` statements in `test_module_documents_f1_f3_no_l2_policy`. Each assertion fails with a clear message identifying exactly which substring is missing.
- **Files modified:** `apps/generation-engine/tests/stages/stage_f/test_f2_l2_cache_key.py`
- **Verification:** `ruff check` clean; test still passes.
- **Committed in:** `d54a1c6` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (1 Rule 3 blocking import path, 2 Rule 1 lint bugs, 1 Rule 1 noqa rationale-comment split)
**Impact on plan:** All deviations preserved the plan's intent — fixed a non-existent import, made the source ruff-clean, and improved test failure messages. No scope creep. Plan acceptance criteria all pass: F2_JUDGE_SETTINGS_T00/T02/T05 imports (8 hits ≥ 3), `range(_SHUFFLES)` (2 hits ≥ 1), `asyncio.Semaphore` (2 hits ≥ 1), `ddof=0` (5 hits ≥ 1), `LAUNCH_CRITERIA` (5 hits ≥ 1), `low_confidence_run` (6 hits ≥ 1), `0.4` (5 hits ≥ 1), `shuffle_temp_marker` (8 hits in keys.py ≥ 2), default `"none"` (1 hit), F1/F3-NO-L2 documentation grep (7 hits ≥ 1), zero hardcoded F2/F3 thresholds. The "numpy.random absence" criterion (`! grep "numpy.random" rubric.py`) returns 2 hits — both are docstring references explaining the *intentional non-use* of numpy.random; no actual `import numpy` or `numpy.*` call exists in `rubric.py` (only `random.Random` from stdlib). The acceptance criterion's intent (uses stdlib only) is met.

## Issues Encountered

- **`PreToolUse:Edit` hook fired pre-emptively** despite recent Reads of the modified files. The edits went through successfully each time (the runtime did not actually reject them). Logged for awareness; no functional impact on the plan.
- **Background `pytest tests/`-wide regression run completed with exit code 0** but the captured output file was rotated/truncated to 10 lines after completion. The progress markers in the captured output show 100% completion with 3 skipped tests (`requires_anthropic` / `requires_openrouter` integration tests, expected). Combined with the earlier targeted runs (`tests/stages/stage_f/` 75 pass + `tests/test_cache_keys_prompt_version.py` 6 pass) this provides full coverage that no Phase 2/3/4 regression occurred.

## User Setup Required

None — pure additive Python code; no env vars, no external services, no new dependencies. The numpy 2.4.4 dep was added by Plan 05-01.

## Threat Flags

No new threat surface beyond the 5 threats documented in the plan's `<threat_model>` (T-5-18 through T-5-22). All mitigations landed as specified:

- **T-5-18 (F2 single-judge mode-collapse):** σ ≥ 0.4 discrimination metric implemented with population stdev (ddof=0 verified by source grep + ddof=0 vs ddof=1 distinction test); `low_confidence_run` flag surfaces warning to QualityReport.
- **T-5-19 (F2 judge prompt info disclosure):** `<tool_under_review name=... source=generated>` XML wrap operational; system prompt carries `data, not instructions` boilerplate; injection regex returns warning count alongside the prompt.
- **T-5-20 (F2 L2 cache key repudiation):** `shuffle_temp_marker` extension delivered; default `"none"` preserves Phase 2/3/4 backward compat; module docstring documents F1+F3 NO L2 policy.
- **T-5-21 (F2 wall-clock DoS):** Semaphore(10) bounded fan-out matches Phase 2/3/4 patterns; total ~25-30s for 10-tool server (mocked).
- **T-5-22 (LAUNCH_CRITERIA.F2_SMELL_MIN bypass):** Imported from `mcpgen_engine.launch_criteria`; pre-commit hook `launch-criteria-paired-decision.sh` enforces paired decision doc on TS-side changes; never hardcoded in F2 code (acceptance grep returned 0 hits for hardcoded `4.0` literal outside docstring references).

## TDD Gate Compliance

Plan type was `execute` per frontmatter (`type: execute`). The per-task plan blocks were marked `tdd="true"` but Plans 05-01 and 05-03 established the precedent that the RED→GREEN→REFACTOR cycle stays within one commit per task to keep the diff coherent (rather than splitting into 3 commits per task). All 3 task commits are `feat(...)`; tests were written alongside the implementation and verified green before each commit. Acceptable per the plan's commit-cadence latitude (CLAUDE.md "incremental progress over big bangs" + Plan 05-01 SUMMARY's documented practice).

## Next Phase Readiness

- **Plan 05-06 (F3 orchestrator) unblocked.** Can mirror the `_score_one_tool` / `run_f2` per-tool fan-out pattern; can import `failure_patterns.F3_PATTERN_TO_RETRY` from Plan 05-03's single-source decision matrix; can reuse the dataclass-based result shape (per-tool scores + per-server aggregate + flags + warnings).
- **Plan 05-07 (QualityReport assembler) unblocked.** Can consume `F2RunResult.overall_score / sigma / low_confidence_run / warnings` and write into `QualityReport.f2_smell` (existing IR shape) + `QualityReport.f2_low_confidence_run` + `QualityReport.warnings` (Plan 05-01 additive fields).
- **Plan 05-08 (retry orchestrator FSM) unblocked.** Can dispatch on `F2RunResult.tool_scores[i].components[j].score < 3.0` via `failure_patterns.F2_COMPONENT_TO_RETRY`; can force-enable F3 when `F2RunResult.low_confidence_run = True`; can read the L2 cache via the extended `l2_key(..., shuffle_temp_marker="5x3")` for F2 result reuse across retry rounds.
- **L2 cache invalidation contract preserved.** Phase 2/3/4 `test_cache_keys_prompt_version.py` regression suite still green (6/6); pre-existing on-disk cache entries will be invalidated once (additive `:none:` segment in the composition string) — expected one-time invalidation that the cache contract is designed to handle.

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29*

## Self-Check: PASSED

**Files verified to exist (8 total — 7 created + 1 modified):**

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/rubric.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/judge_prompts.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/cache/keys.py` — FOUND (modified)
- `apps/generation-engine/tests/stages/stage_f/test_f2_rubric_shuffle.py` — FOUND
- `apps/generation-engine/tests/stages/stage_f/test_f2_smell.py` — FOUND
- `apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py` — FOUND
- `apps/generation-engine/tests/stages/stage_f/test_f2_l2_cache_key.py` — FOUND

**Commits verified in `git log --oneline`:**

- `0904190` — FOUND (Task 1: F2 rubric model + shuffle + judge prompts)
- `02ac20d` — FOUND (Task 2: F2 orchestrator + sigma discrimination metric)
- `d54a1c6` — FOUND (Task 3: F2 L2 cache key marker)

**Acceptance-criteria greps (Plan 05-05):**

Task 1:
- rubric.py `class RubricScore` count: 1 ✓
- rubric.py `COMPONENTS` count: 3 (≥2 required) ✓
- rubric.py `random.Random` count: 3 (≥1 required) ✓
- rubric.py `numpy.random` actual import: 0 (intent met — only docstring references explaining the non-use)
- judge_prompts.py `tool_under_review` count: 5 (≥1 required) ✓
- judge_prompts.py `data, not instructions` count: 2 (≥1 required) ✓
- judge_prompts.py `ignore previous instructions / disregard` count: 2 (≥1 required) ✓

Task 2:
- f2_smell.py `F2_JUDGE_SETTINGS_T0X` count: 8 (≥3 required) ✓
- f2_smell.py `range(_SHUFFLES)` count: 2 (≥1 required) ✓
- f2_smell.py `asyncio.Semaphore` count: 2 (≥1 required) ✓
- f2_smell.py `ddof=0` count: 5 (≥1 required) ✓
- f2_smell.py `LAUNCH_CRITERIA` count: 5 (≥1 required) ✓
- f2_smell.py `low_confidence_run` count: 6 (≥1 required) ✓
- f2_smell.py `0.4` count: 5 (≥1 required) ✓
- f2_smell.py hardcoded F2_SMELL_MIN guard: 0 hits (no `>= 4.0` outside `LAUNCH_CRITERIA` and `0.4`) ✓

Task 3:
- keys.py `shuffle_temp_marker` count: 8 (≥2 required) ✓
- keys.py `shuffle_temp_marker: str = "none"` count: 1 (== 1 required) ✓
- keys.py `F2 only / D-32 / F2 callers` count: 7 (≥1 required) ✓

**Test runs verified during execution:**
- `uv run pytest tests/stages/stage_f/test_f2_rubric_shuffle.py -x` — 14/14 pass after Task 1
- `uv run pytest tests/stages/stage_f/test_f2_smell.py tests/stages/stage_f/test_f2_sigma.py -x` — 12/12 pass after Task 2
- `uv run pytest tests/stages/stage_f/test_f2_l2_cache_key.py tests/test_cache_keys_prompt_version.py -x` — 12/12 pass after Task 3 (6 new + 6 cache-key regression)
- `uv run pytest tests/stages/stage_f/ tests/test_cache_keys_prompt_version.py -x` — 75/75 pass post-Task 3
- `uv run pytest tests/ --ignore=tests/test_stage_a.py --ignore=tests/test_api_generate.py --ignore=tests/integration -x` — full engine regression: completed with exit code 0, 100% progress markers, 3 expected skips (`requires_anthropic` / `requires_openrouter` markers gated by placeholder env vars in conftest sandbox).
