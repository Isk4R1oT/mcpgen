---
phase: 05-generation-engine-validation-stage-f
plan: 08
subsystem: api
tags: [stage-f, retry-fsm, cache-invalidation, quality-report, sse, fastapi, zod, pipeline]

# Dependency graph
requires:
  - phase: 05-generation-engine-validation-stage-f/05-03
    provides: failure_patterns.py F1/F2/F3 retry decision matrix
  - phase: 05-generation-engine-validation-stage-f/05-04
    provides: F1 static orchestrator (run_f1)
  - phase: 05-generation-engine-validation-stage-f/05-05
    provides: F2 smell scan orchestrator (run_f2) + L2 cache marker
  - phase: 05-generation-engine-validation-stage-f/05-06
    provides: F3 server_runner + sandbox adapters
  - phase: 05-generation-engine-validation-stage-f/05-07
    provides: run_f3 orchestrator + two-tier evaluator
provides:
  - Retry orchestrator FSM (RetryState / RetryContext / can_retry / plan_f1/f2/f3_retry)
  - Cascade L2 invalidation (PASS_DOWNSTREAM table + async invalidate_cascade)
  - L2Cache.invalidate_by_prefix via sidecar JSON index (additive set_l2 original_key= param)
  - QualityReport composite score + Quality Badge formula (D-28 verbatim)
  - Pipeline F1 → F2 → F3 (conditional) → validation_complete chain
  - F1 fail-closed semantics (D-07) wired in pipeline glue
  - F2 σ < 0.4 / overall < threshold auto-trigger F3 (D-12 + D-17)
  - GenerationStage 'validation_complete' added to TS Zod enum (additive)
  - POST /generate gains f3_enabled / sandbox_credentials / user_golden_tasks (D-35)
  - GET /quality-report endpoint (D-36) returning sanitized QualityReport JSON
affects: [05-09, 05-10, 06-bff, 07-frontend, 09-observability, 10-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FSM orchestrator with explicit RetryState enum + RetryContext dataclass — every transition logged for SSE + Langfuse traceability (D-24)"
    - "Sidecar JSON index for prefix-globbable filesystem cache invalidation (L2 stores hash filenames; sidecar maps raw_key → hash so invalidate_by_prefix is O(N) over the index)"
    - "Strict downstream-only cascade invalidation (D-26) — conservative over-invalidation rather than under-invalidation"
    - "LAUNCH_CRITERIA-sourced thresholds (Pitfall #29 mitigation) — 4.0/0.7 never hardcoded; module-level test asserts no regex hit on bare thresholds"
    - "Strictly-additive Zod contract changes — Phase 1-4 consumers unchanged"
    - "Async generator yield-from pattern (async for ev in _run_stage_f(...): yield ev) for clean Stage F integration into the pipeline orchestrator"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/quality_report.py
    - apps/generation-engine/src/mcpgen_engine/cache/cache_invalidation.py
    - apps/generation-engine/tests/stages/stage_f/test_retry_orchestrator.py
    - apps/generation-engine/tests/stages/stage_f/test_quality_report.py
    - apps/generation-engine/tests/stages/stage_f/test_cascade_invalidation.py
    - apps/generation-engine/tests/stages/stage_f/test_pipeline_e2e.py
    - apps/generation-engine/tests/api/test_quality_report_endpoint.py
    - apps/generation-engine/tests/api/__init__.py
  modified:
    - apps/generation-engine/src/mcpgen_engine/cache/l2.py
    - apps/generation-engine/src/mcpgen_engine/cache/__init__.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py
    - apps/generation-engine/src/mcpgen_engine/pipeline.py
    - apps/generation-engine/src/mcpgen_engine/api/generate.py
    - packages/contracts/src/generation-api.ts
    - apps/generation-engine/tests/test_pipeline.py
    - apps/generation-engine/tests/test_api_generate.py
    - apps/generation-engine/tests/integration/test_l1_warm_pass_2_3_4.py
    - apps/generation-engine/tests/integration/test_l1_warm_phase_4.py

key-decisions:
  - "Sidecar JSON index for L2 cache invalidation (set_l2 original_key= param) — backward-compat with non-indexed entries via TTL"
  - "F2-without-F3 path resolves to standard badge (not verified) per D-28 strict reading: verified requires F3 >= F3_AGENT_PASS_RATE_MIN — F3 absent fails that condition"
  - "GenerationStage Zod enum extended with validation_complete; Phase 1-4 'completed' member preserved (still emitted on cache=l1_hit warm path internal events)"
  - "L1-hit warm path emits the new F1/F2/F3 chain (F1 cheap; F2 hits L2 cache; F3 only on opt-in); cache=l1_hit marker only on Phase-4 cached events, not on Phase-5 events"
  - "POST request body fields validated server-side without Pydantic (matches existing handler style); strict TypeScript Zod schema lives only in packages/contracts"

patterns-established:
  - "Async generator-as-helper pattern: _run_stage_f yields events; pipeline.py uses 'async for ev in _run_stage_f(...): yield ev' for clean integration"
  - "Sidecar index pattern for prefix-globbable hashed-filename caches (reusable for Phase 6 R2 backend)"
  - "LAUNCH_CRITERIA invariant test pattern: regex-grep the source for forbidden literal thresholds, exclude lines containing 'LAUNCH_CRITERIA'"
  - "Strictly-additive Zod request body extension: every new field is .optional() with .default() to preserve old-client parse paths"

requirements-completed: [GEN-09, GEN-10, GEN-11]

# Metrics
duration: ~75min
completed: 2026-04-29
---

# Phase 5 Plan 08: Pipeline Integration + Retry FSM + QualityReport Summary

**Retry FSM with cascade L2 invalidation, D-28 verbatim QualityReport assembly, and pipeline F1 → F2 → F3 → validation_complete chain wired end-to-end with strictly-additive POST /generate fields + GET /quality-report endpoint.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-04-29T18:18:00Z
- **Completed:** 2026-04-29T19:34:12Z
- **Tasks:** 3
- **Files modified:** 17 (9 created + 8 modified)

## Accomplishments

- **Retry FSM** — `RetryState` enum + `RetryContext` dataclass + `can_retry` budget guards (max 2 rounds; free $0.50/600s; pro $2.00/1800s) + `plan_f1/f2/f3_retry` pure functions with target-pass deduplication. `select_earliest_target` picks the cascade root for D-26.
- **Cascade L2 invalidation** — `PASS_DOWNSTREAM` table + async `invalidate_cascade(retry_target, l2)` strict-downstream-only per D-26. L2Cache extended with `invalidate_by_prefix` via sidecar JSON index (`set_l2(original_key=)` is the additive opt-in). L1 spec-hash cache untouched.
- **QualityReport composite score + Quality Badge** — D-28 formula encoded verbatim in `compute_overall` + `compute_badge`. Verified-tier thresholds source from `LAUNCH_CRITERIA` (Pitfall #29 mitigation); premium / standard sub-tier constants are local D-28 numbers.
- **Pipeline integration** — `_run_stage_f` async generator runs F1 → F2 → F3 (conditional) emitting per-stage SSE events; F1 fail-closed (D-07) skips F2/F3; F3 force-triggers when F2.low_confidence_run OR F2 below LAUNCH_CRITERIA threshold (D-12 + D-17). Both cold path AND L1-hit path emit the new chain.
- **Strictly-additive contract** — POST /generate accepts `f3_enabled` / `sandbox_credentials` / `user_golden_tasks` (D-35). GenerationStage Zod enum gains `'validation_complete'`. New GET `/api/v1/generate/{job_id}/quality-report` (D-36) returns sanitized QualityReport JSON; pre-condition gate (validation_complete OR failed status) returns 409 Conflict otherwise.
- **45 new unit tests + 7 e2e tests + 11 endpoint tests = 63 new tests; 35 existing pipeline / API / L1-warm tests updated to assert the new validation_complete terminal.** All 279 tests in the wider test suite pass.

## Task Commits

1. **Task 1 — RED phase tests for retry FSM, cascade invalidation, quality report** — `e9f3fab` (test)
2. **Task 1 — GREEN phase: retry FSM, cascade L2 invalidation, QualityReport assembly** — `205dcea` (feat)
3. **Task 2 — Pipeline integration F1 → F2 → F3 → validation_complete** — `25488cf` (feat)
4. **Task 3 — GET /quality-report endpoint + strictly-additive Zod contract** — `beafce5` (feat)

## Files Created/Modified

### Created

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py` — RetryState FSM + RetryContext dataclass + can_retry budget guards + plan_f1/f2/f3_retry pure functions + select_earliest_target
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/quality_report.py` — compute_overall + compute_badge encoding D-28 verbatim; LAUNCH_CRITERIA-sourced verified-tier thresholds
- `apps/generation-engine/src/mcpgen_engine/cache/cache_invalidation.py` — PASS_DOWNSTREAM table + async invalidate_cascade(retry_target, l2)
- `apps/generation-engine/tests/stages/stage_f/test_retry_orchestrator.py` — 18 tests covering FSM transitions + budget guards + plan_f*_retry mappings
- `apps/generation-engine/tests/stages/stage_f/test_quality_report.py` — 14 tests covering D-28 formula + badge mapping + LAUNCH_CRITERIA invariant
- `apps/generation-engine/tests/stages/stage_f/test_cascade_invalidation.py` — 13 tests covering invalidate_by_prefix + invalidate_cascade dispatch
- `apps/generation-engine/tests/stages/stage_f/test_pipeline_e2e.py` — 7 tests covering full pipeline F1→F2→F3 chain + SSE event sequence
- `apps/generation-engine/tests/api/test_quality_report_endpoint.py` — 11 tests covering GET /quality-report + POST request body strictly-additive validation
- `apps/generation-engine/tests/api/__init__.py` — empty package marker

### Modified

- `apps/generation-engine/src/mcpgen_engine/cache/l2.py` — added `invalidate_by_prefix` (async) + sidecar JSON index; `set_l2` gains optional `original_key=` param
- `apps/generation-engine/src/mcpgen_engine/cache/__init__.py` — re-exports `invalidate_by_prefix`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py` — re-exports `run_f1` / `run_f2` / `run_f3` + retry orchestrator + quality report symbols for downstream callers
- `apps/generation-engine/src/mcpgen_engine/pipeline.py` — adds `_run_stage_f` async generator + `_serialize_f1/f2/f3` + `_build_quality_report`; both cold and L1-hit paths emit the new chain; GenerationStage Literal extended with `'validation_complete'`; `run_pipeline` gains `f3_enabled` / `sandbox_credentials` / `user_golden_tasks` / `record_quality_report` kwargs
- `apps/generation-engine/src/mcpgen_engine/api/generate.py` — adds GET /quality-report endpoint; POST /generate accepts new request fields; SSE generator passes new args through; `_record_quality_report` callback persists QR to `_JOB_TABLE` (job.status set to validation_complete or failed)
- `packages/contracts/src/generation-api.ts` — strictly-additive: `validation_complete` in GenerationStage enum; `f3_enabled` / `sandbox_credentials` / `user_golden_tasks` in GenerationApiRequest; new `QualityReportResponse` re-export of IR `QualityReport`; re-exports `GoldenTask` + `QualityReport` from @mcpgen/ir for one-stop consumer imports
- `apps/generation-engine/tests/test_pipeline.py` — terminal assertion updated to `validation_complete:completed`; added autouse `_stub_stage_f` fixture
- `apps/generation-engine/tests/test_api_generate.py` — terminal assertion + F1/F2 events checked; added autouse `_stub_stage_f` fixture
- `apps/generation-engine/tests/integration/test_l1_warm_pass_2_3_4.py` — terminal assertion updated; cache=l1_hit assertion scoped to Phase-4 cached stages only
- `apps/generation-engine/tests/integration/test_l1_warm_phase_4.py` — terminal assertion updated; expected event count adjusted from 17 → 21 (16 Phase-4 + 5 Phase-5 events)

## Decisions Made

- **Sidecar JSON index for L2 invalidation** — On-disk filenames are sha256 hashes (per `keys.py::l2_key`); prefix-globbing the filenames is impossible. We track `original_key → on_disk_filename` in a `_index.json` sidecar; `invalidate_by_prefix` reads the index, unlinks matching files, rewrites the index. Backward-compat preserved: callers that omit `original_key` work unchanged but are invisible to cascade invalidation (TTL is the only reaper).
- **F2-without-F3 path resolves to `standard`** — D-28 says "standard or verified" for the F2-passes-no-F3 case. Since verified requires F3 >= F3_AGENT_PASS_RATE_MIN per D-28, and F3 is absent, verified is unreachable; standard is the safest interpretation. Documented inline.
- **GenerationStage Zod enum gains `validation_complete`** — strictly-additive enum extension. Phase 1-4 consumers ignore unknown stages but Zod's enum validation rejects them, so the new value must be added to the enum to keep new consumers parsing the new terminal cleanly.
- **L1-hit path also emits the F1/F2/F3 chain** — F1 is deterministic+cheap; F2 hits L2 cache (D-32); F3 only triggers on opt-in OR D-12/D-17 auto-trigger. Phase 5 GEN-12 invariant preserved (F1+F2 bit-identical between cold + warm runs when F3 off).
- **Existing `completed:completed` terminal replaced (not appended)** — D-31 explicitly says the new terminal IS `validation_complete:completed`. Existing pipeline / API / L1-warm tests updated to match the new terminal; Phase-1-4 wire compatibility preserved via Zod enum addition (consumers parse new stage cleanly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests asserted old terminal `completed:completed`**
- **Found during:** Task 2 (Pipeline integration)
- **Issue:** `test_pipeline.py::test_full_pipeline_emits_phase_3_sse_sequence`, `test_pipeline.py::test_second_run_zero_llm_calls`, `test_api_generate.py::test_sse_stream_emits_phase_3_stage_sequence`, `test_l1_warm_pass_2_3_4.py::test_warm_run_zero_qwen_calls`, and `test_l1_warm_phase_4.py::test_warm_run_zero_qwen_calls` all asserted `events[-1] == ("completed", "completed")` and `partial_result.phase == "shape_codegen_complete"`. Plan 05-08's D-31 mandates the new terminal `validation_complete:completed`.
- **Fix:** Updated all 5 test assertions to expect `validation_complete:completed`. Added autouse `_stub_stage_f` fixtures to the 4 pipeline-level test modules so they don't hit real F1/F2 code paths. Adjusted L1-warm event count from 17 → 21 (16 Phase-4 + 5 Phase-5 events). Scoped `cache=l1_hit` assertions to Phase-4 cached stages only (Phase-5 events run fresh per D-32).
- **Files modified:** test_pipeline.py, test_api_generate.py, test_l1_warm_pass_2_3_4.py, test_l1_warm_phase_4.py
- **Verification:** All 35 existing pipeline / API / L1-warm tests pass after the update.
- **Committed in:** `25488cf` (Task 2 commit)

**2. [Rule 3 - Blocking] async invalidate_by_prefix needed sync wrapper integration**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Initial test design called `invalidate_by_prefix` synchronously, but the orchestrator's protocol expects async (matches future R2/network backend). Tests caused PytestUnraisableExceptionWarning from never-awaited coroutines.
- **Fix:** Updated `test_cascade_invalidation.py` tests to `@pytest.mark.asyncio` + `await invalidate_by_prefix(...)`. Confirms the async signature is the contract.
- **Files modified:** test_cascade_invalidation.py
- **Verification:** All 13 cascade invalidation tests pass.
- **Committed in:** `205dcea` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues).
**Impact on plan:** Both auto-fixes were necessary to land the new pipeline contract. No scope creep — all changes within Plan 05-08's stated surface (modify pipeline.py to chain F1/F2/F3; update tests that asserted the old terminal).

## Issues Encountered

- **Plan acceptance criteria for `! grep -E "(>= 4\.0|>= 0\.7)"` initially appeared to fail** because shell `grep` returns exit code 1 on zero matches. Fixed by chaining `|| echo "(none found — OK)"` and inspecting output. The literal text `4.0` and `0.7` does NOT appear in `quality_report.py` or `retry_orchestrator.py` outside of LAUNCH_CRITERIA-sourced lookups.

## User Setup Required

None — Phase 5 engine remains anonymous on localhost (D-37). Phase 6 will wire Logto auth; Phase 8 will wire Stripe billing.

## Next Phase Readiness

- **Plan 05-09 (CLI render)** can now consume the new `GET /quality-report` endpoint AND the new `validation_complete:completed` SSE event. Both are stable contract surfaces.
- **Plan 05-10 (E2E fixtures)** can run the full pipeline through the new F1/F2/F3 chain and validate `quality_report.json` artifacts against the per-fixture references.
- **Phase 6 (BFF)** will see the additive Zod schema changes; the BFF Hono `/api/v1/generate` proxy can pass through the new fields without modification.
- **Phase 7 (Frontend)** can key off the `validation_complete:completed` SSE event for the QualityReport reveal UI; the GET endpoint serves as the SSE-resume fallback per Pitfall #20.

## Self-Check: PASSED

- [x] All claimed files exist on disk (10 created + 7 modified, verified via `git diff --stat HEAD~4..HEAD`).
- [x] All 4 commits exist in git log (`e9f3fab`, `205dcea`, `25488cf`, `beafce5`).
- [x] All acceptance criteria grep checks pass (RetryState=1, PASS_DOWNSTREAM=3, invalidate_cascade=1, invalidate_by_prefix=1, compute_overall|compute_badge=2, LAUNCH_CRITERIA in QR=9, F1/F2/F3 stages=2 each, validation_complete in pipeline=11, validation_complete in routes=5, f3_enabled/sandbox_credentials/user_golden_tasks each =1 in TS).
- [x] No hardcoded `>= 4.0` / `>= 0.7` thresholds in `quality_report.py` or `retry_orchestrator.py` (verified via regex grep excluding LAUNCH_CRITERIA lines).
- [x] All 279 tests pass across `tests/stages/stage_f/`, `tests/api/`, `tests/test_pipeline.py`, `tests/test_api_generate.py`, `tests/integration/test_l1_warm_*.py`, `tests/test_cache_l1_l2.py`.
- [x] @mcpgen/contracts typecheck + 74 vitest tests pass.
- [x] @mcpgen/ir typecheck + 34 vitest tests pass.

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29*
