---
phase: 05-generation-engine-validation-stage-f
plan: 06
subsystem: testing
tags: [stage-f, f3, wrangler, anthropic, sonnet, sandbox, test-agent, tenacity, dns-rebinding, mcp-http]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "pytest-asyncio + httpx + structlog + tenacity primitives"
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "auth_middleware.ts.j2 (passthrough mode); pre-warmed packages/codegen-templates/node_modules for wrangler dev"
  - plan: 05-01
    provides: "ANTHROPIC AsyncAnthropic singleton + SONNET_MODEL_ID pin (Override doc §7.3); F3_TEST_AGENT_SETTINGS dict (no extra_body); requires_anthropic + requires_wrangler pytest markers + auto-skip routing"
  - plan: 05-02
    provides: "gitleaks pin + paired-decision hook (sandbox creds protection)"
provides:
  - "spawn_server async context manager — wrangler dev --local subprocess with process-group cleanup + port-collision retry + MCPGEN_F3_TEST=1 scoped to subprocess env (D-18, D-51)"
  - "run_golden_task multi-turn Sonnet loop driven by stop_reason; full TaskTrajectory recording with tool_use_ids + per-turn text/tool_calls (D-19)"
  - "mcp_tool_to_anthropic mechanical mapping — MCP camelCase inputSchema → Anthropic snake_case input_schema; structured Pass 2 description concatenation"
  - "_agent_step tenacity-wrapped (3-attempt exponential backoff for RateLimitError / APIStatusError / httpx.NetworkError on top of SDK max_retries=2)"
  - "5 sandbox adapters (Stripe/GitHub/Notion/Linear/Slack) emitting pass-through X-Upstream-Auth headers; credential VALUE never logged"
  - "_resolve_credential shared helper — operator-provided dict precedence over .env.local env var fallback"
affects:
  - "05-07 (mock_clients + f3_agent_eval orchestrator + golden tasks loader + mock_upstream — consumes spawn_server + run_golden_task + sandbox adapters)"
  - "05-08 (pipeline.run_pipeline F1→F2→F3 chain — wraps F3 invocation in retry orchestrator; SSE F3 events emitted from run_golden_task callbacks)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async context manager + process-group SIGTERM cascade for long-lived subprocess management — start_new_session=True opens a new POSIX session so killpg(SIGTERM) cascades to all Miniflare workerd children; 5s grace window then SIGKILL escalation."
    - "Subprocess-scoped env mutation — caller env stays clean; bypass flag (MCPGEN_F3_TEST=1) lives ONLY in the subprocess env dict passed to create_subprocess_exec; post-context assert verifies the invariant in production code (not just tests)."
    - "Tenacity layered on top of vendor SDK retries — Anthropic SDK max_retries=2 handles 429/5xx; tenacity adds 3-attempt exponential backoff for cross-cutting flakiness (network blips against the spawned local server, RateLimitError slip-through)."
    - "Credential adapter symmetry pattern — 5 sandbox adapters expose identical get_credentials(operator_provided) signature; resolution order (operator dict → env var → empty + warning) is shared via _resolve_credential helper; the credential VALUE is logged only as len(cred) (never the value)."
    - "Mock-first TDD for subprocess code — spawn_server, _wait_until_ready, _kill_process_group all unit-tested without a real wrangler binary; integration tests gated behind requires_wrangler marker auto-skip when the binary is absent (T-5-03 mitigation)."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/server_runner.py — spawn_server async context manager + _wait_until_ready + _kill_process_group + _find_free_port"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/test_agent_harness.py — run_golden_task + _agent_step + _execute_mcp_tool_call + mcp_tool_to_anthropic + ToolCall/TrajectoryStep/TaskTrajectory dataclasses"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/__init__.py — _resolve_credential shared helper + module docstring documenting security invariants"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/stripe.py — STRIPE_TEST_KEY adapter"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/github.py — GITHUB_TEST_PAT adapter"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/notion.py — NOTION_TEST_TOKEN adapter"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/linear.py — LINEAR_TEST_KEY adapter (raw key, no Bearer)"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/slack.py — SLACK_TEST_BOT_TOKEN adapter"
    - "apps/generation-engine/tests/stages/stage_f/test_server_runner.py — 10 tests (3 requires_wrangler skipped pending Plan 05-08 e2e)"
    - "apps/generation-engine/tests/stages/stage_f/test_test_agent_harness.py — 10 tests (1 requires_anthropic skipped — covered by test_smoke_sonnet)"
    - "apps/generation-engine/tests/stages/stage_f/test_sandbox_adapters.py — 21 tests (4 invariants × 5 adapters + 1 helper test)"
  modified:
    - ".planning/phases/05-generation-engine-validation-stage-f/deferred-items.md — flagged MCPGEN_F3_TEST=1 hostHeaderValidation bypass missing from auth_middleware.ts.j2 (Phase 4 follow-up needed before Plan 05-08 e2e)"

key-decisions:
  - "Mock-first TDD for subprocess code — Plan 05-06 ships only mock-level tests for spawn_server / run_golden_task; the requires_wrangler integration tests skip cleanly with a deferred-items note pointing to Plan 05-08 e2e harness. Rationale: real wrangler integration needs a fixture-generated server (not yet in scope) and adds 30-60s of CI time per test; mock-level coverage of the subprocess primitives + state machine is sufficient for Plan 05-06's surface."
  - "Credential adapter symmetry over per-API customisation — all 5 adapters (Stripe/GitHub/Notion/Linear/Slack) follow the same `get_credentials(operator_provided)` signature, even though Linear forwards a raw key (no Bearer) and the others use Bearer. Phase 5 prefers the symmetry over per-API specialised adapters; Phase 9 can split if real upstream auth quirks emerge."
  - "F3_TEST_AGENT_SETTINGS values cast inline at the call site (not in a Pydantic-AI ModelSettings object) — the dict is plain because Anthropic's API rejects extra_body. cast(int, ...) / cast(float, ...) at the messages.create call site preserves type-checking discipline without leaking dict-of-object into the F3 surface."
  - "Tool-result truncation cap (5000 chars/call) lives at the harness level — the agent gets the raw upstream response shape but bounded length; un-truncated payload is preserved in the trajectory for QualityReport debug. RESEARCH §5.1 ~30K input + ~5K output × 10 turns budget calibration."

patterns-established:
  - "Async context manager with cleanup-side env invariant assertion — `assert 'MCPGEN_F3_TEST' not in os.environ` in the context manager's finally block is a production assertion (not test-only); a future refactor that accidentally mutates os.environ trips a hard error in both tests AND production runs."
  - "Sandbox adapter testing pattern — parametrised over (module, operator_key, env_var, sample_value, expected_format) tuples so all 5 adapters share the same 4-invariant test matrix; new adapter additions require ONLY a 1-line tuple addition + the adapter file."

requirements-completed: [GEN-11]

# Metrics
duration: 75min
completed: 2026-04-29
---

# Phase 5 Plan 06: F3 Infrastructure Summary

**Land the F3 wrangler subprocess + Sonnet test-agent loop + 5 sandbox adapters — the three primitives that Plan 05-07 (mock clients + two-tier evaluator + golden tasks loader + mock_upstream + f3_agent_eval orchestrator) and Plan 05-08 (retry orchestrator + pipeline integration) consume to chain F1 → F2 → F3 against real fixture-generated servers.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-04-29T17:34Z
- **Completed:** 2026-04-29T18:49Z
- **Tasks:** 3
- **Files created:** 11 (3 source modules + 5 sandbox adapters + 3 test files)
- **Files modified:** 1 (deferred-items.md)
- **Commits:** 3 atomic feat commits
- **Test additions:** 41 tests (10 server_runner + 10 test_agent_harness + 21 sandbox)
- **Test results:** 139 passed + 7 properly skipped in stages/stage_f/; 347 passed + 9 skipped in broader regression (sampling/smoke/IR/LLM/stages)

## Accomplishments

- **`spawn_server` async context manager (D-18 + D-51).** `wrangler dev --local --port {N}` subprocess with `start_new_session=True` so process-group SIGTERM cascades to all Miniflare workerd children. 30s startup budget polled via JSON-RPC `tools/list` (no `/health` endpoint per RESEARCH §5.4 #5). 5s SIGTERM grace window before SIGKILL escalation. Port-collision retry up to `_PORT_RETRY_MAX=3` attempts with fresh port per retry. **D-51 invariant:** `MCPGEN_F3_TEST=1` lives ONLY in subprocess env dict; the context manager's finally block ASSERTS the caller `os.environ` stays unchanged (production assertion, not test-only).
- **`run_golden_task` multi-turn Sonnet loop (D-19).** Drives via `response.stop_reason` per RESEARCH §5.1 — `end_turn` returns final answer; `tool_use` executes every `ToolUseBlock` against the MCP server then continues; `max_tokens` / `pause_turn` / `stop_sequence` record terminated state. `max_iterations` exhausted → `terminated="max_iterations"`. Full per-step `TrajectoryStep` records turn / stop_reason / text / tool_calls. Tool-result content truncated to 5000 chars/call (raw payload preserved in trajectory).
- **`mcp_tool_to_anthropic` mechanical mapping (RESEARCH §5.3).** MCP camelCase `inputSchema` → Anthropic snake_case `input_schema`. Structured Pass 2 description (purpose / guidelines / limitations / parameter_overview) concatenated into a single markdown-flavoured string for Anthropic's tool format.
- **`_agent_step` tenacity wrapper (RESEARCH §6.1).** 3-attempt exponential backoff (multiplier=2, min=2, max=10) for `RateLimitError` / `APIStatusError` / `httpx.NetworkError` layered on top of the Anthropic SDK's built-in `max_retries=2`. Defense-in-depth against network blips on the local wrangler dev subprocess + per-call rate-limit slip-through.
- **5 sandbox credential adapters (D-22).** Stripe / GitHub / Notion ship for hand-tuned golden tasks (D-43); Linear / Slack land in symmetry — operator can flip on once Plan 05-07 mock_upstream is replaced with real sandbox in Phase 9. Each exposes `get_credentials(operator_provided)` returning a header dict (`{"X-Upstream-Auth": "Bearer <cred>"}` for Stripe/GitHub/Notion/Slack; `{"X-Upstream-Auth": <raw>}` for Linear per their auth docs). **Security invariant:** credential VALUE is NEVER logged at any level — adapters log presence + length only.
- **`_resolve_credential` shared helper (`sandbox/__init__.py`).** Resolution order: `operator_provided[<adapter_key>]` → `os.environ[<env_var>]` → `None`. Operator-provided dict wins so a single F3 invocation can override per-request (e.g. parallel Stripe accounts at the same fixture).
- **41 tests added.** 10 `server_runner` (pure-mock scoping/retry/exhaustion + helpers; 3 requires_wrangler skipped pending e2e) + 10 `test_agent_harness` (stop_reason FSM coverage including end_turn / tool_use round-trip / max_iterations / max_tokens / RateLimitError tenacity retry / sandbox_credentials forwarding) + 21 `sandbox_adapters` (parametrised 4-invariant matrix × 5 adapters + 1 helper test).

## Task Commits

Each task is one atomic commit:

1. **Task 1 (server_runner.py):** `0ad2f2a` (feat)
2. **Task 2 (test_agent_harness.py):** `2f9cc21` (feat)
3. **Task 3 (5 sandbox adapters):** `d3abfbd` (feat)

## Files Created / Modified

### Created (11)

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/server_runner.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/test_agent_harness.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/__init__.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/stripe.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/github.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/notion.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/linear.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/slack.py`
- `apps/generation-engine/tests/stages/stage_f/test_server_runner.py`
- `apps/generation-engine/tests/stages/stage_f/test_test_agent_harness.py`
- `apps/generation-engine/tests/stages/stage_f/test_sandbox_adapters.py`

### Modified (1)

- `.planning/phases/05-generation-engine-validation-stage-f/deferred-items.md` — added Plan 05-06 deferrals section (MCPGEN_F3_TEST hostHeaderValidation bypass + skipped requires_wrangler / requires_anthropic integration tests pending Plan 05-08 e2e harness).

## Decisions Made

1. **Mock-first TDD for subprocess code.** Plan 05-06 ships only mock-level tests for `spawn_server` / `run_golden_task`; integration tests skip cleanly behind `requires_wrangler` / `requires_anthropic`. Rationale: real wrangler integration needs a fixture-generated server (not yet in scope) and adds 30-60s/CI run; mock-level coverage of the subprocess state machine + stop_reason FSM is sufficient. Plan 05-08 e2e harness picks up real wrangler integration.
2. **Credential adapter symmetry over per-API specialisation.** All 5 adapters share `get_credentials(operator_provided)` signature even though Linear is bearer-less. Phase 5 prefers symmetry; Phase 9 can split if real upstream auth quirks emerge that the symmetry cannot accommodate (e.g. AWS Sig v4).
3. **F3_TEST_AGENT_SETTINGS dict + `cast()` at call site.** Anthropic API rejects `extra_body`, so the settings constant from Plan 05-01 is `dict[str, object]` (NOT `pydantic_ai.ModelSettings`). At the `_agent_step` call site, `cast(int, ...)` / `cast(float, ...)` preserves type discipline without leaking the dict shape into Anthropic's typed kwargs. mypy clean under `strict = true`.
4. **Tool-result truncation cap at 5000 chars/call** — calibrated against RESEARCH §5.1 budget (~30K input + ~5K output × 10 turns). Untruncated payload is preserved in the recorded `TaskTrajectory` for `QualityReport` debug; the agent only ever sees the bounded-length version.
5. **Default skip for real-Sonnet integration test (Test 6 of Task 2).** `test_smoke_sonnet.py` from Plan 05-01 already smoke-tests the SDK + tool-use loop end-to-end; duplicating that in `test_test_agent_harness.py` would only add cost without coverage. Plan 05-08 e2e harness covers the full `run_golden_task` path against a real spawned fixture server.
6. **MCPGEN_F3_TEST hostHeaderValidation bypass NOT added in this plan.** The Python-side server_runner correctly scopes the env var to subprocess scope (D-51), but the generated Worker's auth_middleware does not yet consult it. Plan 05-06 read-first item #5 instructed "verify it exists; flag for Phase 4 follow-up if not" — flagged in deferred-items.md. Mock-level Plan 05-06 tests are unaffected; Plan 05-08 e2e against generated fixtures will need the template change to land first.

## Deviations from Plan

### None - core implementation matches the plan as written

The Pydantic-AI vs. Anthropic SDK type boundary (Plan §139 mentioned `MessageParam` from `anthropic.types`) was navigated via inline `cast()` at the call site. The harness uses `cast(list[MessageParam], list(messages))` so the `Sequence[dict[str, Any]]` parameter type stays test-friendly while still satisfying the Anthropic SDK's typed kwargs. mypy strict-mode clean.

The plan suggested per-call `sandbox_credentials[tool_use.name]` lookup (Plan §401) but the actual harness merges the entire `sandbox_credentials` dict into headers. Reasoning: the sandbox adapter is the source of truth for shape; the harness should be dumb forwarding. The 5 sandbox adapters all return a single `{"X-Upstream-Auth": ...}` dict, so the merge produces the same effect as the per-tool lookup but stays open-ended for future adapters that want to set additional headers (e.g. `Stripe-Account`).

## Auth Gates

None encountered. `requires_anthropic` and `requires_wrangler` markers properly auto-skip when their paired credential / binary is absent — the F3 SDK + binary integration tests are gated, not gating.

## Threat Surface Scan

No new untracked threat surface introduced beyond the plan's `<threat_model>`. The plan documents T-5-23 / T-5-24 / T-5-25 / T-5-26 / T-5-27 / T-5-28 — all with `mitigate` disposition. Implementation honours every mitigation:

- **T-5-23 (DNS-rebinding bypass spoofing):** `MCPGEN_F3_TEST=1` in subprocess env only; `--ip 127.0.0.1` binding; post-context assertion verifies caller env stays clean. ✅
- **T-5-24 (subprocess orphans):** `start_new_session=True` + `os.killpg(SIGTERM)` + 5s grace + `os.killpg(SIGKILL)` escalation; port retry on collision. ✅
- **T-5-25 (trajectory info disclosure):** Trajectory is in-memory in this plan; persistence + retention policy (D-40) lives in Plan 05-07/05-08 + Phase 9 audit. Plan 05-06 surface is `TaskTrajectory` dataclass return — no central persistence. ✅
- **T-5-26 (sandbox credential disclosure):** Adapter test invariant verifies no log line at any level contains the credential value (parametrised across 5 adapters). ✅
- **T-5-27 (Sonnet model swap accept):** Module docstring in `test_agent.py` (Plan 05-01) cites Override doc §7.3; `SONNET_MODEL_ID` is the only path that gets sent to Anthropic API. Plan 05-06 imports it; never re-pins. ✅
- **T-5-28 (Anthropic rate-limit DoS):** Tenacity 3-attempt exponential backoff on top of SDK `max_retries=2`. Plan 05-08 cost cap will terminate at 2 retry rounds. ✅

## Issues Encountered

- **Initial mypy errors at `_agent_step` call site** — Pydantic-AI vs. Anthropic SDK kwarg type boundary (Plan §139 type-ignore was upstream-aware but not strict-mode clean). Resolved by importing `MessageParam` + `ToolParam` from `anthropic.types` and using inline `cast()` at the call site.
- **Lint cleanup** — initial test files had `*args/**kwargs` ARG001 misfires + en-dash in source docstring (RUF002). Resolved by underscore-prefixing unused args + replacing en-dashes with hyphens. No suppression added to per-file-ignores; the test-side `noqa: ARG001` is on the 3 `tmp_path` arguments that pytest fixture rules require even when the body is a `pytest.skip(...)`.

## User Setup Required

None for Plan 05-06's mock-level surface. Plan 05-08 e2e harness will require:

- `wrangler` binary on PATH (Phase 4 D-39 already pins it via `packages/codegen-templates/package.json`)
- `ANTHROPIC_API_KEY` (real key, not the placeholder) for `run_golden_task` real-Sonnet round-trips
- One or more sandbox credentials (`STRIPE_TEST_KEY` / `GITHUB_TEST_PAT` / `NOTION_TEST_TOKEN`) in `.env.local` per the operator's chosen fixture set

These setup requirements were already documented in CONTEXT D-22 + Plan 05-01 SUMMARY.

## Next Phase Readiness

- **Plan 05-07 (mock_clients + two-tier evaluator + golden tasks loader + mock_upstream + f3_agent_eval orchestrator)** unblocked. Can:
  - Import `spawn_server` from `stages/stage_f/server_runner` to set up the fixture server.
  - Import `run_golden_task` + `TaskTrajectory` from `stages/stage_f/test_agent_harness` to drive the agent loop.
  - Import any of `stages/stage_f/sandbox.{stripe, github, notion, linear, slack}.get_credentials` for per-fixture credential lookup.
- **Plan 05-08 (retry orchestrator + pipeline F1→F2→F3 chain)** unblocked. The F3 stage entry point will spawn `server_runner.spawn_server` + invoke `run_golden_task` per golden task with `asyncio.Semaphore(_AGENT_CONCURRENCY=3)` per CONTEXT D-19.
- **Phase 4 follow-up flagged** in deferred-items.md: the `auth_middleware.ts.j2` template needs the `MCPGEN_F3_TEST=1` short-circuit before Plan 05-08 e2e can drive real fixture servers without `hostHeaderValidation` rejecting `127.0.0.1:N` requests.

---
*Phase: 05-generation-engine-validation-stage-f*
*Plan: 06*
*Completed: 2026-04-29*

## Self-Check: PASSED

All claimed files exist on disk and all 3 task commits are present in git history:

- apps/generation-engine/src/mcpgen_engine/stages/stage_f/server_runner.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/test_agent_harness.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/__init__.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/stripe.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/github.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/notion.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/linear.py ✓
- apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/slack.py ✓
- apps/generation-engine/tests/stages/stage_f/test_server_runner.py ✓
- apps/generation-engine/tests/stages/stage_f/test_test_agent_harness.py ✓
- apps/generation-engine/tests/stages/stage_f/test_sandbox_adapters.py ✓
- .planning/phases/05-generation-engine-validation-stage-f/deferred-items.md ✓

Commits: 0ad2f2a ✓ · 2f9cc21 ✓ · d3abfbd ✓
