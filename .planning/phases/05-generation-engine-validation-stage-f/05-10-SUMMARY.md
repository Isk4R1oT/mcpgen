---
phase: 05-generation-engine-validation-stage-f
plan: 10
subsystem: testing
tags: [stage-f, e2e, fixtures, calibration, pytest, parametrize, integration, l1-cache, gen-12, mocked-llm, real-llm-gated]

# Dependency graph
requires:
  - phase: 05-generation-engine-validation-stage-f/05-08
    provides: validation_complete:completed SSE event + GET /quality-report endpoint + strictly-additive POST /generate fields (f3_enabled / sandbox_credentials / user_golden_tasks) + retry FSM + cascade L2 invalidation + QualityReport composite formula
  - phase: 05-generation-engine-validation-stage-f/05-09
    provides: 30 hand-authored golden tasks (Stripe/GitHub/Notion × 10) + 5 fixture quality-report.json scaffolds + Linear/Slack mock_upstream adapters + CLI flag surface
  - phase: 05-generation-engine-validation-stage-f/05-01
    provides: Phase-5 strictly-additive QualityReport fields + GoldenTask Pydantic schema + LAUNCH_CRITERIA mirror + 2 new pytest markers
provides:
  - 5-fixture parametrized E2E acceptance test (`tests/integration/test_phase_5_5_fixtures.py`)
  - Mocked-LLM tier (every PR): pipeline structure + F1 deterministic match + F1 fail-closed + GEN-12 cache-hit contract
  - Real-LLM tier (gated behind `requires_openrouter` + `requires_anthropic`): D-41 ±0.5 / ±1.0 / ±0.2 acceptance bounds for verified-minimum + standard-minimum
  - Calibration evidence document with operator procedure
  - Phase 5 verification doc cross-referencing all 4 ROADMAP success criteria + 3 REQ-IDs + 4 owned pitfalls + 5 extended pitfalls + 54 D-XX decisions
affects: [06-runtime, 07-frontend, 09-observability, 10-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parametrized 5-fixture E2E with two tiers — mocked + real-LLM gated by `requires_openrouter` / `requires_anthropic` markers"
    - "Pipeline LLM-call mocking via `pipeline.run_pipeline` import-seam stubbing (mirror of Plan 05-08 stages/stage_f e2e pattern); test stays LLM-free when keys absent"
    - "GEN-12 zero-LLM second-run contract assertion via Pass 0..5 + Stage E mock `await_count` invariance across cold + warm runs"
    - "Auto-mode deferral pattern: real-LLM verification gate documented as operator carry-forward when `.env.local` is unavailable"

key-files:
  created:
    - "apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py — 5-fixture E2E acceptance test (745 LoC, 12 tests: 7 mocked + 5 gated)"
    - ".planning/phases/05-generation-engine-validation-stage-f/05-10-CALIBRATION-EVIDENCE.md — operator calibration procedure + auto-mode deferral rationale"
    - ".planning/phases/05-generation-engine-validation-stage-f/05-PHASE-VERIFICATION.md — Phase 5 verification doc"
  modified: []

key-decisions:
  - "Mocked-tier baseline locked in commit 651fc9a; real-LLM calibration deferred to operator pickup (auto-mode + sandboxed worktree cannot access .env.local secrets nor invoke ~$48 LLM spend)"
  - "Pipeline integration mocking uses `pipeline.run_pipeline` import-seam stubbing (Pass 0..5 + Stage E) rather than HTTP API mocking via httpx_mock — direct generator consumption keeps the test free of FastAPI + SSE parsing overhead while still validating the full pipeline orchestration"
  - "F1 fail-closed test uses synthetic F1RunResult with bundle_size_kb=1024 + `failed=True`; bypasses the actual F1 orchestrator's bundle-size threshold while still exercising the pipeline's D-07 fail-closed semantics (F2/F3 not invoked + badge=needs_review)"
  - "GEN-12 cache-hit test asserts Pass 0..5 + Stage E mocks have unchanged `await_count` across run 1 + run 2; this is stricter than counting LLM calls because the mock substrate makes LLM calls ~free, but it tests the actual L1 cache semantics (D-33)"

patterns-established:
  - "Parametrized 5-fixture E2E: any future engine acceptance test against the 5 hand-tuned fixtures should use `FIXTURES = (\"stripe\", \"github\", \"notion\", \"linear\", \"slack\")` and the helper `_load_reference()` / `_synthetic_openapi_spec(slug)` for symmetry"
  - "LAUNCH_CRITERIA imports come from `mcpgen_engine.launch_criteria` (NOT `mcpgen_engine.observability` — the plan template referenced the wrong module; the actual mirror is `launch_criteria.py`)"

requirements-completed: [GEN-09, GEN-10, GEN-11]

# Metrics
duration: ~45min
completed: 2026-04-29
---

# Phase 5 Plan 10: 5-Fixture E2E Acceptance Test + Real-LLM Verification Gate (deferred) + Phase Verification Doc

**Parametrized 5-fixture E2E with mocked + gated real-LLM tiers; Phase 5 verification doc cross-references 4 SC + 3 REQ + 4 owned pitfalls + 54 D-XX decisions; real-LLM 3× per-fixture calibration deferred to operator (auto-mode in sandboxed worktree)**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-29T01:14:00Z
- **Completed:** 2026-04-29T02:00:00Z
- **Tasks:** 3 (Task 1 + Task 2 deferred + Task 3)
- **Files created:** 3 (test file + calibration evidence + verification doc)
- **Files modified:** 0

## Accomplishments

- 5-fixture parametrized E2E acceptance test green: 7 mocked tests pass; 5 real-LLM-gated tests skip cleanly when credentials are placeholders.
- F1 fail-closed contract test verified inside the new test file (D-07 short-circuit semantics).
- GEN-12 cache-hit contract test verifies Pass 0..5 + Stage E NOT re-invoked on warm path (D-33).
- Phase 5 verification doc cross-references all 4 ROADMAP SC, 3 REQ-IDs (GEN-09 / GEN-10 / GEN-11), 4 owned pitfalls (#9 / #10 / #31 / #32), 5 extended pitfalls (#1 / #4 / #15 / #28 / #33), and all 54 D-XX decisions in `05-CONTEXT.md`.
- Calibration evidence doc captures the auto-mode deferral rationale and the full operator procedure for the 3× per-fixture calibration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Parametrized 5-fixture E2E test** — `651fc9a` (test)
2. **Task 2: Real-LLM verification gate (deferred to operator)** — `9a52d81` (docs)
3. **Task 3: Phase 5 verification doc** — `367ed75` (docs)

**Plan metadata:** (this commit — docs: complete plan + final SUMMARY)

## Files Created/Modified

- `apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py` — 5-fixture parametrized E2E with two tiers (mocked + real-LLM gated). 745 LoC. 12 tests: 7 mocked (1 parametrized × 5 fixtures + 2 standalone) + 5 gated (3 top-3 + 2 mocked-upstream).
- `.planning/phases/05-generation-engine-validation-stage-f/05-10-CALIBRATION-EVIDENCE.md` — operator calibration procedure + auto-mode deferral rationale + reference state table + deferred-items table.
- `.planning/phases/05-generation-engine-validation-stage-f/05-PHASE-VERIFICATION.md` — Phase 5 verification doc (236 lines) cross-referencing 4 SC + 3 REQ + 9 pitfalls (4 owned + 5 extended) + 54 D-XX decisions + 10-plan completion table + Phase-10 carry-forward.

## Decisions Made

- **Mocked-tier baseline locked, real-LLM calibration deferred to operator.** The auto-mode executor running in a sandboxed worktree cannot access `.env.local` secrets nor invoke real LLM calls (~$48 spend). The plan-level escape hatch ("if the run is unavailable in this sandbox … produce mocked-tier baselines + skip the real-LLM tier with a clear `pytest.mark.skip` reason and document it") explicitly authorized this deferral.
- **Pipeline integration mocking via import-seam stubbing.** Instead of mocking the OpenRouter HTTP API via `httpx_mock` (which requires the FastAPI ASGI client + SSE parsing), we stub `pipeline.pass_0_run` … `pipeline.stage_e_run` directly via `monkeypatch.setattr`. This is faster (~30s for the full mocked tier vs ~70s for the stages/stage_f e2e equivalent) and keeps the test focused on pipeline orchestration vs HTTP/SSE wire format.
- **`LAUNCH_CRITERIA` import path correction.** The plan template referenced `from mcpgen_engine.observability import LAUNCH_CRITERIA`, but the actual Phase 1 D-13 mirror lives in `mcpgen_engine.launch_criteria`. Corrected in the test imports + documented in the patterns-established section so future tests use the right path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Required Field] Pass0Output requires `prompt_injection_warnings`**

- **Found during:** Task 1 (test execution)
- **Issue:** Initial fake `_fake_pass_0` constructed `Pass0Output` without the required `prompt_injection_warnings` field; pydantic validation failed at runtime.
- **Fix:** Added `prompt_injection_warnings=[]` to the Pass0Output stub.
- **Files modified:** `apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py`
- **Verification:** Test progressed past Pass 0 invocation.
- **Committed in:** `651fc9a` (Task 1 commit)

**2. [Rule 1 - Bug] `pass_1_run` signature mismatch**

- **Found during:** Task 1 (test execution)
- **Issue:** `_fake_pass_1` had 2 positional params (`pass_0_output`, `raw_ir`), but the real signature is `(pass_0_output, raw_ir, spec_title, options)`. AsyncMock raised TypeError.
- **Fix:** Added `spec_title: str` and `options: Any` params to the fake function signature.
- **Files modified:** `apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py`
- **Verification:** Pipeline progressed past pass_1_run invocation.
- **Committed in:** `651fc9a` (Task 1 commit)

**3. [Rule 1 - Bug] Pass1Output uses `Tool1` + `Routing1` + list-of-`CoverageProofItem`, not `Tool` + `CoverageProof(coverage_pct=…)`**

- **Found during:** Task 1 (test execution — initial Pass1Output stub assumed wrong shape)
- **Issue:** Plan template suggested `Pass1Output(tools=[Tool(...)], coverage_proof=CoverageProof(coverage_pct=100.0, uncovered=[]), coverage_pct=100.0, smart_id_schema=None)` — wrong types + wrong fields. Real schema requires `Tool1`, `Routing1` with `SmartId`, `Workflow1` list, `coverage_pct` (float), `coverage_proof` (List[CoverageProofItem]).
- **Fix:** Imported `Tool1`, `Routing1`, `SmartId`, `Type` at top of `_stub_passes_and_stage_e`; constructed minimal valid Pass1Output with empty `rules` + empty `coverage_proof` list.
- **Files modified:** `apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py`
- **Verification:** Pipeline progressed past pass_1_run invocation; pass_2 + downstream pass.
- **Committed in:** `651fc9a` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs / 1 Rule 2 missing field). All caused by the plan template's stale type signatures. None caused scope creep — all needed for the test to actually exercise the pipeline correctly.

**Impact on plan:** Plan executed as written; the deviations were template inaccuracies that the executor corrected against the actual IR schemas + pipeline signatures. No design changes.

## Deferred Items

| Item | Why deferred | When to drain |
|------|--------------|---------------|
| 3× per-fixture calibration runs (real LLM) — Task 2 | Auto-mode in sandboxed worktree; no `.env.local` access; cost ~$48 | Operator runs against real keys before Phase-6 (Runtime) merge — see `05-10-CALIBRATION-EVIDENCE.md` for the procedure |
| `_calibration` block in 5 quality-report.json files | Depends on the 3× runs above | Same gate |
| Verifier-agent run on Phase 5 close-out | Depends on calibration evidence | Same gate |

These are documented in `05-PHASE-VERIFICATION.md` Phase-10 Carry-Forward + `deferred-items.md`.

## Issues Encountered

- The plan template's reference to `from mcpgen_engine.observability import LAUNCH_CRITERIA` was stale — the actual mirror lives in `mcpgen_engine.launch_criteria`. Corrected in the test imports and documented in the patterns-established section.
- The pre-tool Read hook warned about read-before-edit on every Edit even though the file had already been read via the Write tool that created it. This is a known editor quirk; edits proceeded successfully on each attempt because the file content was still in the agent's working context.

## Next Phase Readiness

- **Phase 6 (Runtime)** can begin consuming the `QualityReport` contract published by Phase 5 (D-29 strictly-additive IR fields + D-30 SSE payload + D-36 GET endpoint).
- **Phase 7 (Frontend)** can begin rendering the Quality Badge (premium / verified / standard / needs_review) per the locked Claude-Design UI mock.
- **Phase 9 (Observability)** carry-forward: real Cursor / Claude Desktop / ChatGPT Deep Research smoke against deployed servers; quarterly judge calibration with human evaluators (target ICC > 0.85).
- **Phase 10 (Launch)** carry-forward: Sonnet 4.5 vs 4.6 quarterly review; examples-provenance v1.1 fingerprint match; F2 σ ≥ 0.4 threshold tuning based on production drift.

## Self-Check

- ✅ `tests/integration/test_phase_5_5_fixtures.py` exists (verified at commit 651fc9a)
- ✅ `05-10-CALIBRATION-EVIDENCE.md` exists (verified at commit 9a52d81)
- ✅ `05-PHASE-VERIFICATION.md` exists (verified at commit 367ed75)
- ✅ Test execution: `uv run pytest tests/integration/test_phase_5_5_fixtures.py -k "not requires"` → 7 passed
- ✅ Test execution (full): `uv run pytest tests/integration/test_phase_5_5_fixtures.py` → 7 passed, 5 skipped
- ✅ Stage F suite still green: `uv run pytest tests/stages/stage_f/` → 233 passed, 7 skipped
- ✅ All 3 commit hashes resolvable in `git log`

## Self-Check: PASSED

---
*Phase: 05-generation-engine-validation-stage-f*
*Plan: 10*
*Completed: 2026-04-29*
