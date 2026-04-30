---
phase: 05-generation-engine-validation-stage-f
plan: 07
subsystem: testing
tags: [stage-f, f3-agent-eval, mock-clients, golden-tasks, mock-upstream, qwen3-coder, two-tier-evaluator, mcp-bench]

# Dependency graph
requires:
  - phase: 05-generation-engine-validation-stage-f
    provides: "Plan 05-01 GoldenTask + F3JudgeScore + F3_JUDGE_SETTINGS sampling profile + RetryRound IR types; Plan 05-02 _canonical/{search,fetch}_signature.json immutable fixtures + paired-decision pre-commit hook; Plan 05-06 spawn_server async context manager + run_golden_task Sonnet test agent harness"
  - phase: 01-foundation
    provides: "MODEL singleton (Qwen3-Coder via OpenRouter); make_agent factory; LAUNCH_CRITERIA Python mirror"
provides:
  - "3 mock MCP clients (Cursor / Claude Desktop older / ChatGPT Deep Research) verifying wire-format compliance for Pitfalls #4 / #31 / #32 in ~3s of socket calls before the F3 agent harness"
  - "GoldenTask loader: load_golden_tasks(spec_slug, allow_auto_generated) -> list[GoldenTask] reads packages/engine-fixtures/<slug>/golden_tasks.json"
  - "mock_upstream.synthesize(schema, seed) -> Any: hand-rolled 88-LoC recursive JSON Schema walker with deterministic per-key sub-seed"
  - "F3 orchestrator run_f3(): chains spawn_server -> 3 mock clients in parallel -> for-each golden task in Sem(3) parallelism -> rule_based_eval (Tier 1) + llm_judge_eval (Tier 2 = Qwen via make_agent) -> F3RunResult with pass_rate + warnings"
  - "Two-tier evaluator per CONTEXT D-20 + MCP-Bench arXiv 2508.20453: 5 deterministic checks + Qwen3-Coder LLM judge with 4-metric structured output; per-task pass criterion rule.all() AND task_completion>=7 AND grounding>=6"
  - "Server-level pass_rate threshold reads LAUNCH_CRITERIA[F3_AGENT_PASS_RATE_MIN] (no hardcoded 0.7); paired-decision hook + main-ci grep gate enforce drift control"
affects:
  - "05-08 (retry orchestrator + pipeline integration -- consumes F3RunResult.warnings + mock_client_results to map failures to upstream-pass retries per D-25)"
  - "05-09 (golden_tasks.json content for stripe/github/notion fixtures -- this plan ships the loader contract; 05-09 fills the JSON)"
  - "05-10 (retry orchestration end-to-end + integration tests with real wrangler -- consumes mock_clients verify() and run_f3())"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TYPE_CHECKING-gated cross-plan imports for parallel-wave merge safety: f3_agent_eval declares SpawnServerFactory + RunGoldenTaskCallable type aliases under TYPE_CHECKING and imports server_runner / test_agent_harness only inside run_f3 (after a None-check on injected callables). Lets two parallel-wave plans (05-06 + 05-07) merge in either order without import-time failures."
    - "Two-role LLM split runtime defense: f3_agent_eval module never imports llm.test_agent (Sonnet); test_judge_uses_make_agent strips docstrings + comments before scanning executable code so didactic mentions in module docstrings don't trip the gate."
    - "LAUNCH_CRITERIA threshold indirection (Pitfall #29 mitigation): aggregate gates always read from the dict mirror, never hardcoded; runtime test patches LAUNCH_CRITERIA dict to verify the indirection is honored."
    - "Mock-client structural verification BEFORE LLM-bearing harness: 3 cheap socket-only verifications run in parallel before the F3 agent burns Sonnet tokens; mock-client failure does not short-circuit the agent run (pass_rate is still computed) but flips F3RunResult.passed=False."
    - "Dependency-injection callable pattern for orchestrator tests: spawn_server + run_golden_task arrive as keyword args on run_f3 with default-None resolution to lazy-imported real impls; tests inject fakes without monkey-patching module globals."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_clients.py -- 3 mock clients + JSON-RPC helper + canonical fixture resolver (240 LoC)"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/golden_tasks.py -- load_golden_tasks loader with allow_auto_generated contract slot (~70 LoC)"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_upstream.py -- recursive JSON Schema synthesizer with deterministic seed (88 LoC, well under 120-cap)"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py -- orchestrator + Tier-1 rule_based_eval + Tier-2 llm_judge_eval + run_f3 with mock-client pre-flight (~390 LoC)"
    - "apps/generation-engine/tests/stages/stage_f/test_mock_clients.py -- 12 pytest-httpx unit tests"
    - "apps/generation-engine/tests/stages/stage_f/test_golden_tasks.py -- 4 unit tests for loader contract"
    - "apps/generation-engine/tests/stages/stage_f/test_mock_upstream.py -- 11 unit tests for synthesizer determinism + each type"
    - "apps/generation-engine/tests/stages/stage_f/test_two_tier_eval.py -- 15 unit tests covering rule_based / llm_judge / _passes_per_task / run_f3"
  modified: []

key-decisions:
  - "mcpgen_engine.observability is the wrong import target for LAUNCH_CRITERIA -- the actual module is mcpgen_engine.launch_criteria (Plan 05-03 Python mirror of packages/contracts/src/launch-criteria.ts). Plan body had a typo; corrected verbatim and verified via existing import in stage_f/f2_smell.py."
  - "TYPE_CHECKING-gated SpawnServerFactory + RunGoldenTaskCallable type aliases avoid hard import of Plan 05-06 modules in this plan's worktree branch. mypy wave-merge order can resolve in either direction without cycles."
  - "Sonnet client gate test uses regex-based docstring/comment stripping rather than naive substring search; the module's own educational docstring mentions ANTHROPIC + llm.test_agent for didactic clarity, but the executable code never imports them."
  - "spawn_server + run_golden_task are injected callables on run_f3 with default-None resolution to the real Plan 05-06 implementations. Tests pass fakes through the public API; no module-level monkey-patching needed."
  - "Mock-client failure does not short-circuit the agent harness even though it is a P0 surface. We still compute pass_rate so the retry orchestrator (Plan 05-08) gets a complete signal; F3RunResult.passed=False is the aggregate flip."

patterns-established:
  - "Pattern: TYPE_CHECKING-gated cross-plan callable injection. Use when a module needs to call into a sibling plan's not-yet-merged primitives. Declare the type alias under TYPE_CHECKING; accept the callable as a kwarg with default None; resolve lazily inside the function body. Tests pass fakes; production calls resolve to real impl."
  - "Pattern: Three-layer invariant defense for two-role LLM systems. (1) module docstring naming both roles + their distinct import paths; (2) static grep gate in plan acceptance criteria scanning for the forbidden import; (3) runtime regex-stripped scan over executable code only. The test in this plan demonstrates each layer."
  - "Pattern: hand-rolled spec-derived synthesizer with deterministic per-key sub-seed. random.Random(seed).choice / .randint with key_seed = hash((seed, k)) & 0xFFFFFFFF gives reproducible-yet-varied output across nested keys. Avoids hypothesis / WireMock / mountebank dependencies for ~80 LoC."
  - "Pattern: structurally-correct mock clients running BEFORE expensive LLM agents. ~3s of socket calls verifying wire-format compliance (annotations, capability negotiation, canonical signatures) catches P0 client-compat bugs without burning Sonnet tokens. Cursor / Claude Desktop / ChatGPT internal logic is opaque (closed-source IDEs) -- structural approximation is the best Phase 5 can ship; Phase 9 owns real-client smoke."

requirements-completed: [GEN-11]

# Metrics
duration: ~75min
completed: 2026-04-29
---

# Phase 5 Plan 07: F3 Mock Clients + Two-Tier Evaluator + Orchestrator Summary

**3 mock MCP clients fail-fast on Pitfalls #4/#31/#32 + 88-LoC mock_upstream synthesizer + GoldenTask loader contract + run_f3 orchestrator chaining spawn_server -> mock clients -> Sonnet test agent (Plan 05-06 callable) -> Tier-1 rule_based + Tier-2 Qwen LLM judge -> F3RunResult with LAUNCH_CRITERIA-gated pass_rate.**

## Performance

- **Duration:** ~75 min (planning re-read + Tasks 1-3 + ruff/mypy gates)
- **Started:** 2026-04-29 (Wave 4 launch)
- **Completed:** 2026-04-29
- **Tasks:** 3 (all `type=auto`, all TDD)
- **Files modified:** 8 created, 0 modified

## Accomplishments

- 3 mock MCP clients (Cursor / Claude Desktop older / ChatGPT Deep Research) operationally verifying wire-format compliance per CONTEXT D-21 in ~3s of socket calls.
- GoldenTask loader with strict-vs-allow auto-generation contract slot per D-23 / D-43; Plan 05-09 fills the JSON content for stripe/github/notion.
- mock_upstream synthesizer at 88 LoC (well under the 120-cap); deterministic per-task seed via per-key sub-seed hashing.
- F3 orchestrator: spawn_server -> mock_clients -> Sem(3) parallel agent runs -> Tier-1 rule_based (5 deterministic checks) + Tier-2 Qwen LLM judge (via make_agent, NOT Sonnet) -> per-task pass criterion (rule.all() AND completion>=7 AND grounding>=6) -> aggregate F3RunResult with LAUNCH_CRITERIA-gated pass_rate threshold.
- Two-role invariant enforced via three layers: module docstring + grep acceptance criteria + runtime regex-stripped scan.

## Task Commits

Each task was committed atomically:

1. **Task 1: 3 mock MCP clients (CONTEXT D-21)** - `c3aaad6` (feat)
2. **Task 2: GoldenTask loader + mock_upstream synthesizer (CONTEXT D-22 + D-23)** - `858af48` (feat)
3. **Task 3: F3 orchestrator + two-tier evaluator (CONTEXT D-19 + D-20)** - `8083b48` (feat)

**Lint/type-check fixup:** `0d0639a` (style) -- ruff (SIM102/SIM117/E501/ANN202) + mypy (no-any-return on httpx response.json) + S311 noqa for deterministic-test-data random.Random.

## Files Created

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_clients.py` -- CursorMockClient (Pitfall #31, structural read-only verification), ClaudeDesktopOlderMockClient (Pitfall #4, 2024-11-05 capability gate verification), ChatGPTDeepResearchMockClient (Pitfall #32, deep-equal vs canonical search/fetch fixtures), MockClientResult dataclass, _jsonrpc_request helper, _canonical_dir parent-walk resolver.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/golden_tasks.py` -- load_golden_tasks(spec_slug, *, allow_auto_generated) reads packages/engine-fixtures/<slug>/golden_tasks.json, validates each entry through GoldenTask Pydantic mirror; strict mode raises FileNotFoundError; allow mode returns [] (Plan 05-09 wires actual auto-gen).
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_upstream.py` -- synthesize(schema, seed) recursive walker. Examples short-circuit; date-time / uri / email format sentinels per RESEARCH §5.8; integer respects minimum/maximum; nested object/array uses per-key sub-seed.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py` -- F3JudgeScore Pydantic output (4 metrics + reasoning); JUDGE_AGENT (Qwen via make_agent + F3_JUDGE_PROMPT); RuleScore + GoldenTaskResult + F3RunResult dataclasses; rule_based_eval (5 deterministic checks); llm_judge_eval; _passes_per_task; run_f3 orchestrator with injectable spawn_server + run_golden_task callables.
- `apps/generation-engine/tests/stages/stage_f/test_mock_clients.py` -- 12 pytest-httpx tests (3 per client × Cursor / Claude / ChatGPT + canonical-dir resolver).
- `apps/generation-engine/tests/stages/stage_f/test_golden_tasks.py` -- 4 tests covering Pydantic round-trip, ValidationError propagation, strict-vs-allow file-missing semantics.
- `apps/generation-engine/tests/stages/stage_f/test_mock_upstream.py` -- 11 tests covering determinism, examples, format sentinels, enum, nested objects, integer bounds, unspecified-type fallback.
- `apps/generation-engine/tests/stages/stage_f/test_two_tier_eval.py` -- 15 tests covering rule_based_eval (5 branches), llm_judge_eval mocking + make_agent invariant, _passes_per_task (4 threshold cases), run_f3 (4: all-pass, mock-client failure, pass-rate fail, threshold patching).

## Decisions Made

- **mcpgen_engine.observability vs mcpgen_engine.launch_criteria:** Plan body's `from mcpgen_engine.observability import LAUNCH_CRITERIA` is wrong -- the actual home is `mcpgen_engine.launch_criteria` (Plan 05-03 Python mirror of the canonical TS source). Used the correct path; verified via the existing `stages/stage_f/f2_smell.py` import.
- **TYPE_CHECKING-gated callable injection for run_f3:** spawn_server + run_golden_task ship in Plan 05-06 (parallel wave). Imports resolved lazily inside the function body, kwargs accept None and resolve to real impls. Lets the parallel-wave plans merge in either order. Type aliases (SpawnServerFactory, RunGoldenTaskCallable) declared under TYPE_CHECKING for mypy.
- **Mock-client failure does NOT short-circuit the agent harness:** Although a P0 surface, we still want pass_rate computed so Plan 05-08's retry orchestrator (D-25 decision matrix) has a complete signal. F3RunResult.passed = (pass_rate >= threshold) AND all(mock_results passed); warnings list captures the structural failures.
- **test_judge_uses_make_agent strips docstrings + comments:** The module docstring intentionally cites both ANTHROPIC and llm.test_agent for didactic clarity; the executable code never imports them. Naive substring search would trip on the docstring; regex-based stripping scans only code.
- **rule_based_eval is duck-typed on traj parameter:** Plan 05-06 owns the TaskTrajectory dataclass; this plan calls into it via `.tool_calls`, `.iteration_count`, `.terminated`, `.steps`, `.final_text`. Annotated as `Any` to avoid wave-merge import order surprises; tests use a _StubTrajectory dataclass with the same shape.
- **S311 (random.Random) noqa with comment:** mock_upstream.synthesize uses random.Random(seed) for deterministic test-data, never cryptographic. Explicit noqa with rationale satisfies the lint gate while preserving intent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong LAUNCH_CRITERIA import path in plan body**
- **Found during:** Task 3 (F3 orchestrator implementation)
- **Issue:** Plan body wrote `from mcpgen_engine.observability import LAUNCH_CRITERIA`. The observability module exists but does not export LAUNCH_CRITERIA. The actual mirror is `mcpgen_engine.launch_criteria` (Plan 05-03). Module would fail at import time.
- **Fix:** Used the correct import path. Verified by inspecting `stages/stage_f/f2_smell.py:58` which uses the same correct path.
- **Files modified:** apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py
- **Verification:** mypy + ruff + 15 tests in test_two_tier_eval.py all pass.
- **Committed in:** 8083b48 (Task 3 commit).

**2. [Rule 3 - Blocking] mypy import-untyped on lazy-imported parallel-wave modules**
- **Found during:** Task 3 (post-write mypy gate)
- **Issue:** server_runner.py + test_agent_harness.py don't exist in this worktree branch (Plan 05-06 ships them in the same parallel wave). mypy reports `import-untyped` because the editable install path resolves them as 3rd-party.
- **Fix:** Inline `# type: ignore[import-untyped,import-not-found,unused-ignore]` on the late-import lines inside run_f3 (the modules are imported only when caller does not inject fakes).
- **Files modified:** apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py
- **Verification:** mypy clean; tests inject fakes via callables, never hitting the lazy-import path.
- **Committed in:** 8083b48 (Task 3 commit) + refined in 0d0639a (style fixup).

**3. [Rule 1 - Bug] mypy no-any-return on httpx response.json()**
- **Found during:** Task 1 + 2 + 3 (post-batch mypy gate during style fixup)
- **Issue:** httpx returns `Any` from `.json()`; the helper signature was `dict[str, Any]` so mypy correctly flagged the implicit Any propagation.
- **Fix:** Explicit local-variable cast `parsed: dict[str, Any] = resp.json()` then return.
- **Files modified:** apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_clients.py
- **Committed in:** 0d0639a (style fixup).

**4. [Rule 1 - Style] ruff SIM102 / SIM117 / E501 / ANN202 / S311**
- **Found during:** Post-batch ruff gate
- **Issue:** Various style issues across the 8 new files (collapsed if-statements, multi-with combine, line wrapping, missing return type on async generator, S311 random.Random).
- **Fix:** Combined nested ifs/withs; added explicit AsyncIterator[str] return type; broke long signatures; added S311 noqa with comment.
- **Files modified:** mock_clients.py, mock_upstream.py, test_golden_tasks.py, test_mock_clients.py, test_two_tier_eval.py.
- **Committed in:** 0d0639a (style fixup).

---

**Total deviations:** 4 auto-fixed (1 wrong import path in plan body, 2 import / type-check blocking, 1 batch of style fixes).
**Impact on plan:** All auto-fixes essential for module-load + lint + type-check correctness. No scope creep -- every fix is mechanical and downstream of plan-text typos or wave-merge realities.

## Issues Encountered

- **Plan 05-06 not yet merged into this worktree:** Wave-4 parallel execution means server_runner.py + test_agent_harness.py won't exist until both worktrees are merged. Solved via TYPE_CHECKING-gated type aliases + lazy-imports inside run_f3. Tests inject fakes through the public API, fully exercising the orchestrator without 05-06's primitives.
- **Inconsistent ruff auto-fix output:** ruff fix re-formats single-line imports into multi-line `from ... import (...,)` blocks, which moves the `# type: ignore` comment off the offending line. Worked around by using explicit `# noqa: I001` to disable import-organization on those specific lines.

## Threat Flags

None -- this plan does not introduce new security-relevant surface beyond what's already in CONTEXT D-21 / D-22 / D-23 and the corresponding STRIDE register entries (T-5-29 / T-5-30 / T-5-31 / T-5-32 / T-5-33). All mitigations specified in the plan frontmatter are implemented:
- T-5-29 (Tampering, ChatGPT canonical fixture deep-equal): mock_clients.py reads `_canonical_dir() / "{search,fetch}_signature.json"` (Plan 05-02 immutable fixtures); deep-equal returns retry_target=pass_1 on drift.
- T-5-30 (Spoofing, older-client capability gate): ClaudeDesktopOlderMockClient sends `protocolVersion=2024-11-05`; asserts no outputSchema in tools/list and no structuredContent in tools/call.
- T-5-31 (Repudiation, F3 LLM-judge swap): make_agent (Qwen) only; module never imports llm.test_agent (Sonnet); 3-layer invariant defense (docstring + grep gate + regex-stripped runtime scan).
- T-5-32 (Information Disclosure, mock_upstream realism): hand-rolled 88-LoC walker; no third-party; deterministic seed; values are sandboxed (no PII / production credentials).
- T-5-33 (DoS, F3 task runaway): asyncio.Semaphore(_F3_TASK_CONCURRENCY=3) per CONTEXT D-19; per-task max_iterations from GoldenTask.

## User Setup Required

None -- this plan does not require external service configuration. The F3 LLM judge uses the same OpenRouter / Qwen3-Coder credentials as every other LLM call site (`OPENROUTER_API_KEY` already present in `.env.local` per Plan 01-06 + the Local-compute architecture memory).

## Next Phase Readiness

- **Plan 05-08** can chain F1 + F2 + F3 in pipeline.run_pipeline() and consume `F3RunResult.warnings` + `mock_client_results` to map failures via D-25 retry decision matrix into upstream-pass retries.
- **Plan 05-09** can fill `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json` with hand-authored tasks + flag Linear / Slack as auto_generated -- the loader contract is in place.
- **Plan 05-10** integration tests (real wrangler subprocess + real Sonnet test agent) can drop the injected callables and let `run_f3` resolve the real `spawn_server` + `run_golden_task` from the merged Plan 05-06 modules.
- **Plan 05-06 merge order is flexible:** TYPE_CHECKING-gated type aliases + lazy imports + dependency-injection callables mean either plan can land first without breaking the other.

## Self-Check: PASSED

- All 8 files created and committed.
- 4 commits in git log (3 feat + 1 style).
- 42 unit tests pass; full stage_f suite (144 + 3 skipped) clean.
- ruff + mypy gates green for all 8 new files.
- All acceptance-criteria grep gates honored:
  - `class CursorMockClient` count = 1
  - `class ClaudeDesktopOlderMockClient` count = 1
  - `class ChatGPTDeepResearchMockClient` count = 1
  - `2024-11-05` count >= 1 in mock_clients.py
  - `outputSchema` count >= 2 in mock_clients.py
  - `_canonical/search_signature.json` count >= 1 in mock_clients.py
  - `openWorldHint` count >= 1 in mock_clients.py
  - `load_golden_tasks` count >= 1 in golden_tasks.py
  - `from mcpgen_ir.types import GoldenTask` count = 1
  - `def synthesize` count >= 1 in mock_upstream.py
  - `examples` count >= 1 in mock_upstream.py
  - `random.Random` count >= 1 in mock_upstream.py
  - mock_upstream.py LoC = 88 (< 120 cap)
  - `rule_based_eval` count = 4 in f3_agent_eval.py
  - `llm_judge_eval` count = 3 in f3_agent_eval.py
  - `from mcpgen_engine.llm.agent_factory import make_agent` count = 1
  - `from mcpgen_engine.llm.test_agent` count = 0 (TWO-ROLE INVARIANT)
  - `F3_JUDGE_SETTINGS` count = 3
  - `task_completion >= 7` count = 3
  - `grounding >= 6` count = 3
  - `F3_AGENT_PASS_RATE_MIN` count = 3
  - `LAUNCH_CRITERIA` count = 5
  - Hardcoded 0.7 / 4.0 outside LAUNCH_CRITERIA = 0

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29*
