---
phase: 05-generation-engine-validation-stage-f
plan: 01
subsystem: testing
tags: [zod, pydantic, anthropic, sonnet, openrouter, qwen3-coder, pytest, json-schema, ir, codegen]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Universal IR Zod source + Python codegen pipeline (D-13); MODEL singleton (Qwen3-Coder via OpenRouter); _PROVIDER_ROUTING pin (atlas-cloud / fp8); pytest sandbox env primitives (`requires_openrouter` marker, `_sandbox_env` autouse fixture)"
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "PASS_0_SETTINGS / PASS_1_SETTINGS / INLINE_GATE_SETTINGS sampling profile patterns"
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "PASS_2/3/4_SETTINGS profiles + inline quality gate Qwen judge pattern"
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "QualityReport `bundle_size_kb` + `pipeline_versions` strictly-additive precedent"
provides:
  - "QualityReport additive fields: retry_history / f3_test_agent_id / f2_low_confidence_run / golden_task_set_origin / sandbox_environment / warnings / generation_time_seconds / total_cost_usd (Phase 5 D-29)"
  - "GoldenTask + RetryRound top-level Zod exports (codegen → Pydantic mirror)"
  - "F2 5-shuffle × 3-temperature judge profiles (F2_JUDGE_SETTINGS_T00 / T02 / T05)"
  - "F3 LLM judge + F3 TEST AGENT sampling profiles (F3_JUDGE_SETTINGS / F3_TEST_AGENT_SETTINGS)"
  - "Sonnet 4.5 AsyncAnthropic client module (Override doc §7.3 documented exception)"
  - "Day-1 Sonnet smoke test (mirrors test_smoke_qwen.py role)"
  - "pytest markers: requires_anthropic + requires_wrangler with auto-skip routing"
  - "Codegen flag fixes: io: 'input' (additive contract) + --set-default-enum-member (clean Pydantic dump)"
affects:
  - "05-02 (F1 static checks — needs requires_wrangler marker)"
  - "05-03 (F2 smell scan — needs F2_JUDGE_SETTINGS_T00/T02/T05)"
  - "05-04 (F2 retry orchestration — needs RetryRound type)"
  - "05-05 / 05-06 (F3 agent eval — needs ANTHROPIC client + F3_JUDGE_SETTINGS + F3_TEST_AGENT_SETTINGS + GoldenTask)"
  - "05-07 (pipeline.run_pipeline extension — needs all QualityReport additive fields)"
  - "05-08 (HTTP API + SSE quality_report payload — needs QualityReport.model_dump round-trip)"

# Tech tracking
tech-stack:
  added:
    - "anthropic 0.97.0 (Python SDK for F3 test-agent path; Override doc §7.3 exception)"
    - "numpy 2.4.4 (F2 σ discrimination metric — np.std with ddof=0 per RESEARCH §6.5)"
  patterns:
    - "Two-client LLM split: Qwen3-Coder via OpenRouter (generation pipeline + F2/F3 judge) vs. Sonnet via raw AsyncAnthropic (F3 test agent only). Each lives in its own module so the Override doc §0 single-model invariant has exactly one documented exception site."
    - "TypedDict-style sampling profile constants — F2/F3 reuse the SAME _PROVIDER_ROUTING dict identity (Pitfall #2 invariant); F3_TEST_AGENT_SETTINGS is a plain dict (Anthropic API rejects extra_body) so it's a different TypeScript-style namespace from pydantic_ai.ModelSettings."
    - "Marker-gated integration tests with auto-skip via pytest_collection_modifyitems: explicit ANTHROPIC_API_KEY + wrangler-on-PATH gates; tests SKIP (not pass) when paired credential / binary is absent (T-5-03 mitigation)."
    - "Strictly-additive IR change protocol: Zod source → io: 'input' JSON Schema → datamodel-codegen with --set-default-enum-member → Pydantic mirror; pre-Phase-N fixtures continue to validate without code changes."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/llm/test_agent.py — Sonnet AsyncAnthropic singleton (the Override doc §7.3 exception)"
    - "apps/generation-engine/tests/test_ir_additive.py — IR additive types: 4 unit tests (GoldenTask defaults, RetryRound trace, QualityReport defaults + round-trip)"
    - "apps/generation-engine/tests/test_smoke_sonnet.py — Day-1 Sonnet smoke (3 tests, 2 marker-gated)"
  modified:
    - "packages/ir/src/types.ts — Zod source: GoldenTask + RetryRound + 8 QualityReport additive fields"
    - "packages/ir/python/types.py — regenerated Pydantic mirror"
    - "packages/ir/scripts/codegen.ts — io: 'input' flag + --set-default-enum-member flag"
    - "apps/generation-engine/src/mcpgen_engine/llm/sampling.py — 5 new F2/F3 sampling profiles"
    - "apps/generation-engine/pyproject.toml — anthropic + numpy deps + 2 new pytest markers"
    - "apps/generation-engine/tests/conftest.py — ANTHROPIC_API_KEY priming + pytest_collection_modifyitems auto-skip"
    - "apps/generation-engine/tests/test_sampling_profiles.py — 7 new tests for F2/F3 + Sonnet client + marker registration"
    - "apps/generation-engine/uv.lock — deps lockfile"

key-decisions:
  - "Sonnet model id pinned to claude-sonnet-4-5-20250929 per RESEARCH §6.1 — CONTEXT D-02 had a typo (the snapshot date 20250929 belongs to Sonnet 4.5, not 4.6); pinning the bare alias claude-sonnet-4-6 would auto-float and risk F3 result drift (Pitfall #2)."
  - "Codegen mode switched to z.toJSONSchema(io: 'input') so Zod .default() fields are emitted with `default: …` but NOT in `required[]`. Without this, datamodel-codegen marks all D-29 additive fields as required and pre-Phase-5 QualityReport fixtures break."
  - "datamodel-codegen invoked with --set-default-enum-member so enum-typed defaults serialize cleanly via model_dump() — the SSE pipeline (D-30) emits QualityReport via model_dump and pyproject filterwarnings=error converts PydanticSerializationUnexpectedValue warnings into hard errors otherwise."
  - "F3_TEST_AGENT_SETTINGS is a plain dict (not pydantic_ai.ModelSettings) and lacks extra_body — the Anthropic API rejects extra_body, and conflating the two namespaces would break the Override doc §0 single-model invariant by leaking OpenRouter routing knobs into Anthropic calls."

patterns-established:
  - "Documented Override-exception module pattern: a single .py file (llm/test_agent.py) per documented exception, module docstring citing the Override doc section + RESEARCH evidence, no fallback to make_agent. New exceptions in future phases follow the same template."
  - "Two-stage codegen flag pattern: input-side schema flags (io: 'input') for the JSON-Schema emit; output-side codegen flags (--set-default-enum-member) for the Pydantic generator. Both belong in scripts/codegen.ts so future contributors don't have to rediscover the additive contract end-to-end."

requirements-completed: [GEN-09, GEN-10, GEN-11]

# Metrics
duration: 77min
completed: 2026-04-29
---

# Phase 5 Plan 01: Wave-1 Foundation Summary

**Strictly-additive IR types (GoldenTask + RetryRound + 8 QualityReport fields) plus 5 F2/F3 sampling profiles plus a Sonnet AsyncAnthropic client (the Override doc §7.3 exception) plus pytest markers — every Phase 5 wave depends on these primitives.**

## Performance

- **Duration:** 77 min
- **Started:** 2026-04-29T13:27:54Z
- **Completed:** 2026-04-29T14:45:06Z
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 edited)
- **Commits:** 3 atomic feat/test commits

## Accomplishments

- **IR additive types committed via Zod source → CI codegen path.** New `GoldenTask` + `RetryRound` exports plus 8 strictly-additive `QualityReport` fields (retry_history, f3_test_agent_id, f2_low_confidence_run, golden_task_set_origin, sandbox_environment, warnings, generation_time_seconds, total_cost_usd) — all default-provided so pre-Phase-5 fixtures (Phase 1/2/3/4) keep validating unchanged.
- **5 sampling profiles ready for Wave 2/3/4.** F2_JUDGE_SETTINGS_T00 / T02 / T05 (3-temp × 5-shuffle judge matrix) + F3_JUDGE_SETTINGS (deterministic Qwen LLM judge) + F3_TEST_AGENT_SETTINGS (Anthropic-side dict, no extra_body). All four OpenRouter-side profiles share the same `_PROVIDER_ROUTING` dict identity (Pitfall #2 invariant).
- **Sonnet 4.5 AsyncAnthropic singleton lives in its own module** (`llm/test_agent.py`) — the Override doc §7.3 exception with module-level docstring citing the source-of-truth section and RESEARCH §6.1 typo correction. Tolerates module-load without `ANTHROPIC_API_KEY`; integration tests gated behind `requires_anthropic`.
- **Day-1 Sonnet smoke test mirrors `test_smoke_qwen.py`'s role.** One unmarked test (import path) runs every PR; two marker-gated tests verify reachability + tool-use loop when `ANTHROPIC_API_KEY` is real (cost <$0.01 per CI run).
- **Two new pytest markers registered.** `requires_anthropic` + `requires_wrangler` with auto-skip routing in `pytest_collection_modifyitems` — absent credentials / binaries → tests skip silently (not silently pass per T-5-03).
- **Two new Python deps installed.** `anthropic>=0.96.0,<1.0` (resolves to 0.97.0) + `numpy>=2.0,<3.0` (resolves to 2.4.4).
- **Zero breaking changes.** 660 pass + 187 stage + 5 pipeline + 61 integration tests all pass unchanged after this plan.

## Task Commits

Each task was committed atomically (no per-task RED/GREEN split — TDD cycle stayed within one commit per task to keep the diff coherent):

1. **Task 1: IR additive types (GoldenTask + RetryRound + 8 QualityReport fields)** — `678cd52` (feat)
2. **Task 2: Sampling profiles + Sonnet client + pytest markers + deps** — `271b972` (feat)
3. **Task 3: Day-1 Sonnet smoke test** — `808f346` (test)

## Files Created/Modified

### Created
- `apps/generation-engine/src/mcpgen_engine/llm/test_agent.py` — Sonnet AsyncAnthropic singleton + SONNET_MODEL_ID pin + Override doc §7.3 docstring citation.
- `apps/generation-engine/tests/test_ir_additive.py` — 4 unit tests verifying GoldenTask defaults, RetryRound trace, QualityReport additive defaults, and model_dump round-trip preservation.
- `apps/generation-engine/tests/test_smoke_sonnet.py` — Day-1 smoke: 1 unmarked module-import test + 2 `requires_anthropic`-gated tests (reachability + tool-use loop).
- `.planning/phases/05-generation-engine-validation-stage-f/deferred-items.md` — out-of-scope discoveries (`tests/test_stage_a.py` pre-existing hang).

### Modified
- `packages/ir/src/types.ts` — Phase 5 Zod source additions: GoldenTask + RetryRound exports + 8 strictly-additive QualityReport fields.
- `packages/ir/python/types.py` — regenerated Pydantic mirror (24,540 → 19,335 bytes — slight shrink because the `io: 'input'` flag eliminates redundant inline subtypes for optional defaulted fields).
- `packages/ir/scripts/codegen.ts` — `io: 'input'` flag for `z.toJSONSchema` + `--set-default-enum-member` for datamodel-codegen.
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — 5 new F2/F3 profile constants with section-header comment block.
- `apps/generation-engine/pyproject.toml` — `anthropic` + `numpy` deps + 2 new pytest markers.
- `apps/generation-engine/tests/conftest.py` — `ANTHROPIC_API_KEY` priming pattern + `pytest_collection_modifyitems` skip routing.
- `apps/generation-engine/tests/test_sampling_profiles.py` — 7 new tests covering F2/F3 profile values + Sonnet client pin + marker registration cleanliness.
- `apps/generation-engine/uv.lock` — lockfile updated for new deps.

## Decisions Made

1. **Sonnet model id correction propagated.** CONTEXT D-02 said `claude-sonnet-4-6-20250929`; that is not a real Anthropic snapshot (the date `20250929` belongs to Sonnet 4.5). The pin lives in `SONNET_MODEL_ID = "claude-sonnet-4-5-20250929"` and the module docstring documents the typo correction with explicit references to Override doc §7.3 + RESEARCH.md §6.1. A test asserts the bad string is never assigned to `SONNET_MODEL_ID`.
2. **Codegen flag tuning** — see Deviations below for the two flag changes (`io: 'input'` + `--set-default-enum-member`). Both were necessary for the additive contract to round-trip cleanly through Pydantic.
3. **F3_TEST_AGENT_SETTINGS as plain dict, not ModelSettings.** Anthropic's API rejects `extra_body`; the F3 test-agent path uses Anthropic-side params only (temperature / top_p / max_tokens). Encoding this in the type (`dict[str, object]` vs. `pydantic_ai.ModelSettings`) prevents future contributors from accidentally pasting OpenRouter routing into the F3 test-agent call site.
4. **Module-load tolerance for ANTHROPIC_API_KEY.** `test_agent.py` falls back to `sk-ant-test-PLACEHOLDER` so the module loads cleanly under the conftest sandbox; tests that actually call the API are gated behind `requires_anthropic` and skip when the placeholder is detected. Mirrors the existing `OPENROUTER_API_KEY` pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Switch codegen JSON-Schema mode to `io: 'input'`**
- **Found during:** Task 1 (IR additive types — initial codegen run)
- **Issue:** Zod 4 emits `.default(value)` fields with `default: value` AND keeps them in `required[]`. datamodel-codegen then marks all D-29 additive fields as Pydantic-required (no Python default), which breaks the strictly-additive contract — pre-Phase-5 `QualityReport` fixtures (Phase 1/2/3/4) raise `ValidationError`.
- **Fix:** Switched `z.toJSONSchema` invocation in `packages/ir/scripts/codegen.ts` from default `io: 'output'` to `io: 'input'` so defaulted fields are emitted with `default` BUT excluded from `required[]`. Verified the change affects only 3 schemas (GoldenTask + QualityReport + StageEManifest`.ts_compile_warning_count` which had this exact same issue from Phase 4) — no other Phase-1/2/3/4 schemas affected.
- **Files modified:** `packages/ir/scripts/codegen.ts`, `packages/ir/python/types.py` (regenerated)
- **Verification:** `pnpm --filter @mcpgen/ir codegen:check` clean; `tests/test_ir_additive.py` 4/4 green; 660 pass + 187 stage tests still green.
- **Committed in:** `678cd52` (Task 1 commit)

**2. [Rule 1 — Bug] Coerce JSON-Schema enum defaults to Enum members in generated Pydantic**
- **Found during:** Task 1 (IR additive types — round-trip test)
- **Issue:** datamodel-codegen emitted `golden_task_set_origin: Optional[GoldenTaskSetOrigin] = "hand_authored"` (raw string default for an enum-typed field). Pydantic's serializer raises `PydanticSerializationUnexpectedValue` warning at `model_dump()` time; pyproject `filterwarnings=error` converts this into a hard test failure. Worse, real production code (SSE event payload per D-30) emits `QualityReport.model_dump(mode="json")` and would crash in production.
- **Fix:** Added `--set-default-enum-member` to the `datamodel-codegen` invocation in `packages/ir/scripts/codegen.ts`. The generator now emits `... = GoldenTaskSetOrigin.hand_authored` (proper Enum reference). No serializer warnings; round-trip test passes.
- **Files modified:** `packages/ir/scripts/codegen.ts`, `packages/ir/python/types.py` (regenerated)
- **Verification:** `tests/test_ir_additive.py::test_quality_report_round_trip_preserves_shape` green; codegen:check clean.
- **Committed in:** `678cd52` (Task 1 commit, same commit as deviation #1)

**3. [Rule 1 — Bug] Drop `--no-cov` flag from acceptance-criteria pytest commands**
- **Found during:** Task 1 (running tests per acceptance criteria)
- **Issue:** Plan acceptance criteria use `uv run pytest ... --no-cov`; pytest-cov is NOT installed in the engine venv (intentional — Phase 5 doesn't gate on coverage). pytest rejects unknown CLI arg → exit code 4 → false negative.
- **Fix:** Used `uv run pytest <files>` (without `--no-cov`) for all verification runs. Tests still run unchanged; the `--no-cov` flag was a copy-paste from a different tooling baseline. No pyproject changes (don't add pytest-cov just to satisfy a flag).
- **Files modified:** none (test runner invocation only)
- **Verification:** all task suites green at the actual `uv run pytest` command.
- **Committed in:** N/A (test-runner invocation, not source change)

**4. [Rule 1 — Bug] Negative-guard test assertion narrowed from "string absent in module" to "string never assigned to SONNET_MODEL_ID"**
- **Found during:** Task 2 (test_sonnet_client_module_pins_correct_snapshot RED → GREEN)
- **Issue:** Initial test asserted `"claude-sonnet-4-6-20250929" not in inspect.getsource(test_agent)`. The module docstring legitimately mentions the typo to warn future-self against it; the assertion was over-eager and would force docstring word-smithing instead of catching real regressions.
- **Fix:** Narrowed the assertion to `test_agent.SONNET_MODEL_ID != "claude-sonnet-4-6-20250929"`. The actual Anthropic API call uses `SONNET_MODEL_ID`; nothing else in the module is sent to the API. Combined with the existing positive assertion (`SONNET_MODEL_ID == "claude-sonnet-4-5-20250929"`), the contract is unambiguous.
- **Files modified:** `apps/generation-engine/tests/test_sampling_profiles.py`, `apps/generation-engine/src/mcpgen_engine/llm/test_agent.py` (docstring reworded — typo string no longer appears verbatim)
- **Verification:** Task 2 acceptance criterion `! grep "claude-sonnet-4-6-20250929" llm/test_agent.py → 0 hits` passes; `test_sonnet_client_module_pins_correct_snapshot` green.
- **Committed in:** `271b972` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 blocking codegen flag, 1 codegen output bug, 1 acceptance-criteria flag mismatch, 1 test assertion over-broad)
**Impact on plan:** All four deviations were necessary to land the strictly-additive contract end-to-end. Deviations #1+#2 fix real production-code bugs (the SSE pipeline at D-30 would have crashed mid-stream without #2; pre-Phase-5 fixtures would have all broken without #1). #3 + #4 are test-infra polish. No scope creep — all changes stay within the 8 files the plan listed plus a small codegen-flag tweak.

## Issues Encountered

- **`tests/test_stage_a.py` hangs in this environment** (5+ minutes per test). Pre-existing, unrelated to Phase 5. Out of scope per execute-plan.md scope-boundary rule. Logged in `deferred-items.md` for Wave 2 to inspect when adding F1 static checks. The Phase-4 stages/ tests (which include the modern Stage A path) all pass in 25 s.
- **`tests/test_api_generate.py` skipped during regression** — long-running and not affected by IR / sampling changes. Wave 2 will pick it up when scaffolding F1 plumbing.

## User Setup Required

None — the new `ANTHROPIC_API_KEY` env var is needed only for `requires_anthropic`-marked integration tests. Day-1 smoke test gates skip cleanly without it; the wave-2/3/4 plans will document the operator-side setup when F2/F3 actually run.

## Next Phase Readiness

- **Wave 2 (F1 deterministic checks)** unblocked — can import `requires_wrangler` marker for subprocess tests; can serialise `QualityReport.f1_static.passed` through the additive shape.
- **Wave 3 (F2 smell scan)** unblocked — can import all 3 `F2_JUDGE_SETTINGS_T0X` constants + use `make_agent` with each profile; can capture `f2_low_confidence_run` + `retry_history` per round.
- **Wave 4 (F3 agent eval)** unblocked — can import `ANTHROPIC` + `SONNET_MODEL_ID` from `llm/test_agent.py` + `F3_JUDGE_SETTINGS` for the Qwen judge + `F3_TEST_AGENT_SETTINGS` for Anthropic side; can serialise `f3_test_agent_id` + `golden_task_set_origin` + `sandbox_environment` + `total_cost_usd` through the additive shape.
- **Pipeline orchestrator (Wave 5)** unblocked — can chain `RetryRound` entries into `QualityReport.retry_history` per Phase 5 D-31 SSE event sequence.

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29*

## Self-Check: PASSED

All claimed files exist on disk and all 3 task commits are present in git history:

- packages/ir/src/types.ts ✓
- packages/ir/python/types.py ✓
- packages/ir/scripts/codegen.ts ✓
- apps/generation-engine/src/mcpgen_engine/llm/test_agent.py ✓
- apps/generation-engine/src/mcpgen_engine/llm/sampling.py ✓
- apps/generation-engine/pyproject.toml ✓
- apps/generation-engine/tests/conftest.py ✓
- apps/generation-engine/tests/test_sampling_profiles.py ✓
- apps/generation-engine/tests/test_ir_additive.py ✓
- apps/generation-engine/tests/test_smoke_sonnet.py ✓
- apps/generation-engine/uv.lock ✓
- .planning/phases/05-generation-engine-validation-stage-f/deferred-items.md ✓
- .planning/phases/05-generation-engine-validation-stage-f/05-01-SUMMARY.md ✓

Commits: 678cd52 ✓ · 271b972 ✓ · 808f346 ✓

