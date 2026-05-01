---
phase: 10-launch
plan: 03
subsystem: engine
tags: [observability, langfuse, generation-engine, neon, postgres, drizzle, timescale, pydantic-ai, ctrl-08]

# Dependency graph
requires:
  - phase: 09-observability-polish
    provides: run_with_tracing wrapper (D-06/D-07), `langfuse.session.id` attribute path, Phase-9 carry-forward enumeration of 12 `session_id="unknown"` sites + matview-WITH-NO-DATA blocker
  - phase: 08-auth-billing
    provides: usage_hourly matview created `WITH NO DATA` at 20260428000002_phase8_billing_drift.sql:135; Inngest `stripeMetersEmit` cron (every 5min) refreshing CONCURRENTLY
provides:
  - generation_id threading from `pipeline.run_pipeline(job_id=...)` into every Pass 0-5 + Stage F2/F3 LLM call site (12 sites), making Langfuse traces correlate per-generation; closes Phase 9 carry-forward `code_followups[0]` (D-06 item 1)
  - usage_hourly matview initial REFRESH migration (`20260501000000_phase10_initial_matview_refresh.sql`) — non-concurrent first-time populating refresh; unblocks `drizzle-kit push` for post-launch hotfix migrations; closes Phase 9 carry-forward `code_followups[3]` (D-06 item 2)
affects: [10-launch (post-launch incident response gains per-generation Langfuse correlation; future schema migrations no longer blocked by unpopulated matview)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "generation_id threaded as keyword-only required arg (no default at orchestrator boundary, per CONTEXT D-06 'Backward compat NOT a concern (internal Python API)')"
    - "f2_smell.run_f2 / f3_agent_eval.run_f3 retain `generation_id: str = \"unknown\"` default for backward compat with direct test callers (those modules are imported by stage-f tests that don't go through pipeline.run_pipeline)"
    - "Initial-refresh migration pattern: data-only migration ships with snapshot identical to prior phase + new id/prevId chain + journal entry — `drizzle-kit check` validates the chain"

key-files:
  created:
    - infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql
    - infrastructure/neon/migrations/meta/20260501000000_snapshot.json
  modified:
    - apps/generation-engine/src/mcpgen_engine/observability/run_tracing.py
    - apps/generation-engine/src/mcpgen_engine/pipeline.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_0/chunked.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_1/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_1/schema_synth.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/enrich.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/llm_judge.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/__init__.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_5/field_ranking.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py
    - apps/generation-engine/tests/observability/test_generation_id_threading.py
    - apps/generation-engine/tests/integration/test_l1_warm_pass_2_3_4.py
    - apps/generation-engine/tests/integration/test_l1_warm_phase_4.py
    - apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py
    - apps/generation-engine/tests/integration/test_pipeline_e2e.py
    - apps/generation-engine/tests/passes/pass_2/test_authoring.py
    - apps/generation-engine/tests/passes/pass_2/test_quality_gate.py
    - apps/generation-engine/tests/passes/pass_2/test_run.py
    - apps/generation-engine/tests/passes/pass_3/test_enrich.py
    - apps/generation-engine/tests/passes/pass_3/test_quality_gate.py
    - apps/generation-engine/tests/passes/pass_3/test_run.py
    - apps/generation-engine/tests/passes/pass_4/test_llm_judge.py
    - apps/generation-engine/tests/passes/pass_4/test_run.py
    - apps/generation-engine/tests/passes/pass_5/test_run.py
    - apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py
    - apps/generation-engine/tests/stages/stage_f/test_pipeline_e2e.py
    - apps/generation-engine/tests/test_api_generate.py
    - apps/generation-engine/tests/test_pipeline.py
    - infrastructure/neon/migrations/meta/_journal.json

key-decisions:
  - "generation_id sourced from pipeline.run_pipeline `job_id` parameter (which is the generation_id, validated against GEN_ID_REGEX at /api/v1/generate per Phase-1 D-11) — single source of truth, no duplication"
  - "GenerationOrchestrator referenced in plan = `pipeline.run_pipeline` (not `main.py` — that is the FastAPI entrypoint); threading happens inside `run_pipeline` body where `generation_id = job_id` is captured at the start"
  - "stage_f.run_f2 + run_f3 retain `generation_id: str = \"unknown\"` default — these are imported by stage-f tests directly without going through pipeline.run_pipeline; pass_*.run public APIs are required-only (no default) per CONTEXT D-06 'no backward compat needed for internal Python API'"
  - "Test fixture stubs for fake `pass_N_run`, `_judge_one`, `fake_judge`, `quality_gate_all_tools` updated to accept the new keyword-only `generation_id` arg — preserves existing test suite green without changing test semantics"
  - "Matview refresh migration ships with full snapshot copy (identical to Phase 9 schema) + new id/prevId chain + journal entry — `drizzle-kit check` validates the chain integrity even though the SQL is data-only"
  - "Migration filename `20260501000000_phase10_initial_matview_refresh.sql` is FROZEN (timestamp prefix > Phase 9's 20260430000000)"

requirements-completed:
  - CTRL-08 (D-06 items 1 + 2)

# Metrics
duration: ~50min (continuation after timeout — original GREEN code already in working tree from prior session)
completed: 2026-05-01
---

# Phase 10 Plan 03: generation_id threading + matview refresh Summary

**Closes 2 of 4 Phase-9 deferred code follow-ups before public launch (per CONTEXT D-06): (1) Thread `generation_id` through pass orchestrator → replace 12 `session_id="unknown"` placeholders enumerated in `09-PHASE-VERIFICATION.md`. (2) Refresh `usage_hourly` matview (currently `WITH NO DATA` — blocks `drizzle-kit push`). The other 2 (outbox dedup table; `/usage/hourly` pagination) are explicitly deferred to v1.1 per D-06 (no user-visible benefit at launch).**

## Performance

- **Duration:** ~50 min (continuation from prior context-exhausted session — original GREEN code already in working tree at restart)
- **Started:** 2026-05-01 (resumed from c9c56a8 RED commit)
- **Completed:** 2026-05-01T12:50Z
- **Tasks:** 3 (1 TDD red→green + 1 TDD green-only + 1 deterministic migration)
- **Files created:** 2 (migration SQL + snapshot)
- **Files modified:** 38 (19 production + 17 test fixtures + 1 journal + 1 STATE)
- **Commits:** 3 (1 RED test + 1 GREEN feat + 1 migration feat); + this docs commit

## Accomplishments

- **D-06 item 1 wired:** `generation_id` flows from `pipeline.run_pipeline(job_id)` through every public `pass_N.run(..., *, generation_id)` and `stage_f.run_fN(..., generation_id=...)` orchestrator boundary, then down through `_run_with_transient_retry` / `_judge_one` / `_score_one_tool` / etc. helpers, ultimately reaching `run_with_tracing(..., session_id=generation_id, ...)` at every of the 12 LLM-bearing call sites enumerated in the plan `<interfaces>` block. Langfuse `langfuse.session.id` attribute now carries the real generation_id at every span.
- **D-06 item 2 wired:** `infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql` runs `REFRESH MATERIALIZED VIEW "usage_hourly"` (non-concurrent, mandatory for first-time population). After this migration applies, the Inngest cron `stripeMetersEmit` CONCURRENTLY refreshes work correctly. `drizzle-kit:check` exits clean with the new journal entry + snapshot chain.
- **Test fixture maintenance:** 17 test files across `tests/integration/`, `tests/passes/`, `tests/stages/`, `tests/test_pipeline.py`, `tests/test_api_generate.py` updated so existing fake stubs accept the new keyword-only `generation_id` argument — preserving 1224 existing tests green (excluding 3 documented pre-existing failures unrelated to this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1 — RED test asserting NO call site passes session_id="unknown"** — `c9c56a8` (test) — landed in prior session
2. **Task 2 — GREEN: thread generation_id through 12 sites + GenerationOrchestrator** — `db293e3` (feat) — production source threading + test fixture updates
3. **Task 3 — Initial matview refresh migration (D-06 item 2)** — `e62aed2` (feat)

## Files Created

### Created

- `infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql` — one-shot non-concurrent REFRESH; idempotent re-runs; full header comment block citing Phase 10 D-06 item 2 + first-time-non-concurrent rationale
- `infrastructure/neon/migrations/meta/20260501000000_snapshot.json` — schema-unchanged snapshot copied from Phase 9 with new id/prevId chain (`ab1c2d3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e` ← `9a2b4c6d-7e8f-4a1b-9c3d-2e4f5a6b7c8d`)

### Modified — Production source (19 files)

| File | Threading change |
|------|------------------|
| `observability/run_tracing.py` | docstring update only (signature unchanged — already accepted `session_id` kw-only) |
| `pipeline.py` | `run_pipeline.body`: capture `generation_id = job_id`; thread into `pass_0_run / pass_1_run / pass_2_run / pass_3_run / pass_4_run / pass_5_run / _run_stage_f` (warm + cold paths) |
| `passes/pass_0/__init__.py` | `run(..., *, generation_id)` added; forwarded to `chunked` + `run_llm_stage` |
| `passes/pass_0/chunked.py` | chunked orchestrator threads `generation_id` to per-cluster LLM calls |
| `passes/pass_0/llm.py:179` | placeholder removed; `_run_with_transient_retry(..., *, generation_id)` calls `run_with_tracing(..., session_id=generation_id, ...)` |
| `passes/pass_1/__init__.py` | `run(..., *, generation_id)` added |
| `passes/pass_1/schema_synth.py:260,297` | universal + extra LLM helpers thread `generation_id` |
| `passes/pass_2/__init__.py` | `run(..., *, generation_id)` added; forwarded to `author_all_tools` + `quality_gate_all_tools` |
| `passes/pass_2/authoring.py:154` | `_author_one(..., *, generation_id)` + `_run_with_transient_retry(..., generation_id)` |
| `passes/pass_2/quality_gate.py:143` | `_judge_one(..., *, generation_id)` + `quality_gate_all_tools(..., *, generation_id)` |
| `passes/pass_3/__init__.py` | `run(..., *, generation_id)` added; forwarded to `enrich_all_params` + `quality_gate_all_tools` (Pass 3) |
| `passes/pass_3/enrich.py:173` | `_enrich_one(..., *, generation_id)` + `_run_with_transient_retry(..., generation_id)` |
| `passes/pass_3/quality_gate.py:171` | `_judge_one_pass_3(..., *, generation_id)` + Pass-3 `quality_gate_all_tools(..., generation_id="unknown")` (default for direct test callers) |
| `passes/pass_4/__init__.py` | `run(..., *, generation_id)` added; forwarded to `judge_action_tools` |
| `passes/pass_4/llm_judge.py:122` | `_judge_one(..., *, generation_id)` + `judge_action_tools(..., generation_id="unknown")` (default for direct test callers) |
| `passes/pass_5/__init__.py` | `run(..., *, generation_id)` added; forwarded to `rank_all_fields` |
| `passes/pass_5/field_ranking.py:204` | `_rank_one(..., *, generation_id)` + `rank_all_fields(..., generation_id="unknown")` |
| `stages/stage_f/f2_smell.py:160` | `run_f2(..., generation_id="unknown")` + `_score_one_tool(..., *, generation_id)` + `_judge_run_with_retry(..., *, generation_id)` |
| `stages/stage_f/f3_agent_eval.py:292` | `run_f3(..., generation_id="unknown")` + `llm_judge_eval(..., *, generation_id)` |

### Modified — Test fixtures (17 files)

All fake stubs of `pass_N_run`, `_judge_one`, `fake_judge`, `_judge_one_pass_3`, `fake_enrich`, `fake_gate`, `fake_score`, `fake_author_all_tools`, `fake_quality_gate_all_tools`, `_fake_rank_all_fields` updated to accept the new keyword-only `generation_id` argument:

- `tests/observability/test_generation_id_threading.py` (calibration tweaks for `model_construct` Pydantic stubs)
- `tests/integration/test_l1_warm_pass_2_3_4.py`
- `tests/integration/test_l1_warm_phase_4.py`
- `tests/integration/test_phase_5_5_fixtures.py`
- `tests/integration/test_pipeline_e2e.py`
- `tests/passes/pass_2/test_authoring.py`
- `tests/passes/pass_2/test_quality_gate.py`
- `tests/passes/pass_2/test_run.py`
- `tests/passes/pass_3/test_enrich.py`
- `tests/passes/pass_3/test_quality_gate.py`
- `tests/passes/pass_3/test_run.py`
- `tests/passes/pass_4/test_llm_judge.py`
- `tests/passes/pass_4/test_run.py`
- `tests/passes/pass_5/test_run.py`
- `tests/stages/stage_f/test_f2_sigma.py`
- `tests/stages/stage_f/test_pipeline_e2e.py`
- `tests/test_api_generate.py`
- `tests/test_pipeline.py`

## 12 Placeholder Sites — Before/After Mapping

| Site (file:line) | Before | After |
|------------------|--------|-------|
| `passes/pass_0/llm.py:179` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_0.run` → `run_llm_stage` → `_run_with_transient_retry`) |
| `passes/pass_1/schema_synth.py:260` | `session_id="unknown"` | `session_id=generation_id` (universal LLM call; threaded from `pass_1.run`) |
| `passes/pass_1/schema_synth.py:297` | `session_id="unknown"` | `session_id=generation_id` (extra LLM call; same source) |
| `passes/pass_2/authoring.py:154` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_2.run` → `author_all_tools` → `_author_one`) |
| `passes/pass_2/quality_gate.py:143` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_2.run` → `quality_gate_all_tools` → `_judge_one`) |
| `passes/pass_3/enrich.py:173` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_3.run` → `enrich_all_params` → `_enrich_one`) |
| `passes/pass_3/quality_gate.py:171` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_3.run` → `quality_gate_all_tools` → `_judge_one_pass_3`) |
| `passes/pass_4/llm_judge.py:122` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_4.run` → `judge_action_tools` → `_judge_one`) |
| `passes/pass_5/field_ranking.py:204` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pass_5.run` → `rank_all_fields` → `_rank_one`) |
| `stages/stage_f/f2_smell.py:160` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pipeline._run_stage_f` → `run_f2` → `_score_one_tool` → `_judge_run_with_retry`) |
| `stages/stage_f/f3_agent_eval.py:292` | `session_id="unknown"` | `session_id=generation_id` (threaded from `pipeline._run_stage_f` → `run_f3` → `llm_judge_eval`) |

(11 sites enumerated in `<interfaces>`; 12 incl. one additional pass_0/chunked LLM call site that the same generation_id flows through).

## Test Results

**Threading invariant tests** (`tests/observability/test_generation_id_threading.py`):
- 13 passed, 1 skipped (subprocess `rg` test gracefully skips when ripgrep not on PATH; pure-Python sentinel scan is the authoritative gate)

**Sentinel grep:**
```
$ rg 'session_id="unknown"' apps/generation-engine/src/mcpgen_engine/passes apps/generation-engine/src/mcpgen_engine/stages/stage_f
$ echo $?
1   # exit 1 = no matches found
```

**Wider engine test suite** (`tests/observability tests/stages tests/integration tests/test_pipeline.py tests/test_api_generate.py tests/passes`):
- **1224 passed, 13 skipped**, 5 deselected (3 pre-existing failures + 2 known stage-e long-running tests)

**drizzle-kit:check:**
- `pnpm --filter @mcpgen/contracts drizzle-kit:check` — `Everything's fine 🐶🔥` (chain validates correctly)

## Pre-existing Test Failures (Out of Scope)

Three test failures pre-date this plan and are unrelated to generation_id threading. Each was verified pre-existing by `git stash`-ing my changes and re-running the test against `c9c56a8` (the RED-only commit):

| Test | Failure | Pre-dates? |
|------|---------|------------|
| `tests/integration/test_pipeline_e2e.py::test_full_pipeline_stripe_author_complete[stripe]` | terminal SSE event is `validation_complete:completed`, test asserts `completed:completed` (Phase-4 D-33 assertion never updated for Phase 5 D-31 chain) | Yes (verified at c9c56a8) |
| `tests/test_pipeline.py::test_full_pipeline_emits_phase_3_sse_sequence` | `tool_plan_count` is string, test asserts int (SSE serialization changed in Phase 5) | Yes (verified at c9c56a8) |
| `tests/passes/pass_2/test_validation.py::test_validate_examples_from_spec_catches_fake_bearer` | `sk_live_` not in matches (regex catalog drift in `validate_examples_from_spec`) | Yes (verified at c9c56a8) |

These are out-of-scope per CLAUDE.md "Only auto-fix issues DIRECTLY caused by the current task's changes." Logged here for the verifier; do NOT block this plan's completion on them. Plan 10-04 / 10-05 owners should evaluate whether to fix them as Phase-10 cleanup or punt to v1.1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Cold-path Stage F call site missed in original GREEN attempt**
- **Found during:** Task 2 verification — `tests/integration/test_l1_warm_pass_2_3_4.py::test_warm_run_zero_qwen_calls` failed with `TypeError: _run_stage_f() missing 1 required keyword-only argument: 'generation_id'`
- **Issue:** The cold path through `_run_stage_f` (line 1111) was missing the `generation_id` kwarg; only the warm path (line 870 area) had been threaded
- **Fix:** Added `generation_id=generation_id` to the cold-path `_run_stage_f` call in `pipeline.py:1124`
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/pipeline.py` (one-line addition)
- **Commit:** `db293e3` (folded into the GREEN commit)

### Plan Drift

**Plan referenced `apps/generation-engine/src/mcpgen_engine/main.py`** as the location of `GenerationOrchestrator`. This is incorrect — `main.py` is the FastAPI entrypoint (`create_app()` factory). The actual orchestrator is `pipeline.run_pipeline()`. No deviation; clarified above in `key-decisions`. Threading happens inside `pipeline.run_pipeline` where `generation_id = job_id` is captured at the start.

### Out-of-Scope Per Plan

**D-06 items 3 + 4 (deferred to v1.1 per CONTEXT D-06):**
- Item 3: outbox dedup table — Plan 09-11 deferred this; no user-visible benefit at launch; documented in 09-11-SUMMARY.md key-decisions
- Item 4: `/usage/hourly` pagination — Plan 09-04 confirmed contract truth (no pagination at launch); documented in 09-04-SUMMARY.md key-decisions

These are explicitly deferred per the plan's `<output>` carry-forward note. No code change in this plan.

## Acceptance Criteria

- [x] All 12 `session_id="unknown"` placeholder sites enumerated in 09-PHASE-VERIFICATION.md `phase_10_carry_forward.code_followups[0]` replaced with actual `generation_id` threaded from `pipeline.run_pipeline`
- [x] `generation_id` parameter added to every pass orchestrator signature: `pass_0.run(spec_ir, ..., *, generation_id)`, `pass_1.run(taxonomy, ..., *, generation_id)`, ..., `pass_5.run(..., *, generation_id)`, `stage_f.f2_smell.run_f2(server, ..., generation_id="unknown")`, `f3_agent_eval.run_f3(server, ..., generation_id="unknown")`
- [x] Integration test `test_generation_id_threading.py` asserts NO call to `run_with_tracing` passes `session_id="unknown"` after Phase 10 (13 tests pass, 1 skipped)
- [x] Langfuse session-id-correlation: a single `pipeline.run_pipeline(job_id=...)` invocation produces traces all tagged with the same `generation_id` value (verified by Test 1 of `test_generation_id_threading.py` which mocks `run_with_tracing` and asserts every captured `session_id == _SENTINEL_GENERATION_ID`)
- [x] `usage_hourly` matview refresh migration exists and runs successfully — REFRESH (NON-CONCURRENT, first-time required because matview is `WITH NO DATA`); subsequent refreshes use CONCURRENTLY via Inngest cron `stripeMetersEmit`
- [x] `drizzle-kit:check` exits 0 against the production schema after this migration applies

## Self-Check: PASSED

- ✅ `apps/generation-engine/src/mcpgen_engine/pipeline.py` — exists, modified
- ✅ `infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql` — exists, created
- ✅ `infrastructure/neon/migrations/meta/20260501000000_snapshot.json` — exists, created
- ✅ Commit `c9c56a8` (RED test) — exists in `git log --oneline`
- ✅ Commit `db293e3` (GREEN feat) — exists in `git log --oneline`
- ✅ Commit `e62aed2` (matview refresh migration) — exists in `git log --oneline`
- ✅ Sentinel grep on `apps/generation-engine/src/mcpgen_engine/{passes,stages/stage_f}/` returns 0 matches
- ✅ Threading test suite: 13 passed + 1 skipped (no failures)
- ✅ `drizzle-kit:check` exits 0
