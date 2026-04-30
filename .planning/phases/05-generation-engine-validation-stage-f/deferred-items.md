# Phase 5 Deferred Items

Surfaced during Phase 5 execution but **out of scope** for Plan 05-01 (Wave 1
foundation). Logged here per execute-plan.md scope-boundary rule.

## Pre-existing test hangs

- **`apps/generation-engine/tests/test_stage_a.py`**: at least one of the 11
  tests (most likely `test_3_1_spec_format` or `test_dependency_graph_basic`,
  TBD) hangs in this environment for 5+ minutes. Pre-existing; unrelated to
  Phase 5 IR / sampling / anthropic work. The same suite under
  `tests/stages/` (Phase 4 location) passes in 25 s; this is the legacy
  Phase-1 test file. Investigate during Wave 2 (F1 static checks need a
  reliable Stage A entrypoint).

## Notes on broader regression coverage

- Plan 05-01 scope = IR additive types + 5 sampling profiles + Sonnet client
  + 2 pytest markers. Verified green:
  - `tests/passes/` — 660 passed
  - `tests/test_pipeline.py` — 5 passed
  - `tests/stages/` — 187 passed
  - `tests/integration/` — 61 passed
  - `tests/test_ir_additive.py` — 4 passed (new)
  - `tests/test_sampling_profiles.py` — 13 passed
  - `tests/test_smoke_sonnet.py` — 1 passed + 2 skipped (intentional —
    no real ANTHROPIC_API_KEY in CI sandbox)
  - `tests/test_llm_client.py` — 3 passed
  - `tests/test_main.py` + `test_observability.py` + `test_cache_*.py` +
    `test_no_duplicate_model_construction.py` + `test_smart_id_no_overlap.py`
    — 30 passed combined
- `tests/test_api_generate.py` and `tests/test_stage_a.py` skipped during
  Plan 05-01 verification due to long-running / hang behavior unrelated to
  this plan's changes; Wave 2 will pick them up as part of F1 static-check
  scaffolding.

## Plan 05-06: F3 infrastructure deferrals

- **MCPGEN_F3_TEST=1 hostHeaderValidation bypass missing from
  `packages/codegen-templates/templates/auth_middleware.ts.j2`.** Plan 05-06
  Task 1 read-first item #5 instructed verification; the flag is NOT yet in
  the auth_middleware template. The Python-side server_runner correctly
  scopes ``MCPGEN_F3_TEST=1`` to the wrangler subprocess env (D-51), but
  the generated Worker's middleware does not yet read it to relax DNS-
  rebinding host validation for F3. Without this bypass, `wrangler dev
  --host 127.0.0.1` requests will be rejected by `hostHeaderValidation`
  middleware in F3 against generated fixtures.
  - **Phase 4 follow-up:** add `if (process.env.MCPGEN_F3_TEST === "1") {
    return { ctx: ... }; }` short-circuit at the top of `authMiddleware` in
    `auth_middleware.ts.j2` (or update `ALLOWED_HOSTS` to include
    `127.0.0.1:*` when the flag is set).
  - **Plan 05-08 dependency:** F3 e2e harness will fail to drive real
    fixtures until this template change lands. Mock-level unit tests in
    Plan 05-06 (which run without real wrangler) are unaffected.
  - **Detection:** `grep -n MCPGEN_F3_TEST
    packages/codegen-templates/templates/auth_middleware.ts.j2` returns
    zero hits as of Plan 05-06 commit.

- **Plan 05-06 Task 2 Test 6 (real-Sonnet harness round-trip)** marked
  ``pytest.skip`` instead of running because ``test_smoke_sonnet.py``
  already smoke-tests the SDK + tool-use loop. Plan 05-08 e2e harness
  will exercise the full ``run_golden_task`` path against a real spawned
  fixture server.

- **Plan 05-06 Task 1 Tests 1/2/3/6 (real-wrangler integration)** marked
  ``pytest.skip`` pending the Plan 05-08 e2e harness which will spawn
  fixture-generated servers. Mock-level coverage of subprocess primitives
  is sufficient for Plan 05-06's surface (``spawn_server`` context manager
  + ``_kill_process_group`` + port-collision retry FSM).
