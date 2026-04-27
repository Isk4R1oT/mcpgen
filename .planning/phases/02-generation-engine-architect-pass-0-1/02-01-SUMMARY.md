---
phase: 02-generation-engine-architect-pass-0-1
plan: 01
subsystem: engine
tags: [pydantic-ai, openrouter, qwen3-coder, fireworks, llm, ast, pytest-httpx]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "MODEL singleton in apps/generation-engine/src/mcpgen_engine/llm/client.py (Qwen3-Coder via OpenRouter through PydanticAI OpenAIProvider, fail-fast on missing OPENROUTER_API_KEY)"
provides:
  - "make_agent(output_type, system_prompt) factory — single legal entry point for Pass 0/1 PydanticAI Agent construction"
  - "PASS_0_SETTINGS / PASS_1_SETTINGS ModelSettings constants with D-04 provider routing pin (Fireworks fp16, no fallback)"
  - "test_extra_body_forwarded — pytest-httpx mocked CI gate that fails on silent extra_body propagation drop"
  - "test_no_duplicate_model_construction — AST-walk static check enforcing single MODEL construction site"
affects: [Phase 2 Plans 02-04..02-09 (Pass 0/1 implementation), Phase 3 Plans (Pass 2/3/4 will reuse the same factory pattern), Phase 5 (Stage F2 LLM judge calls)]

# Tech tracking
tech-stack:
  added: []  # No new deps; pytest-httpx already pinned in Phase 1
  patterns:
    - "PydanticAI Agent factory wrapping the MODEL singleton — all Pass 0/1 LLM call sites import make_agent + per-pass ModelSettings"
    - "Provider routing pinning at ModelSettings.extra_body level (D-04 verbatim, never duplicated per call site)"
    - "AST-walk static enforcement of architectural invariants (Pitfall A mitigation pattern)"
    - "pytest-httpx mock + request body inspection for SDK regression detection (Pitfall B mitigation pattern)"
    - "Module-level OPENROUTER_API_KEY priming in conftest.py — needed when test modules import mcpgen_engine.llm.* at top level (MODEL singleton constructs at import time)"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/llm/sampling.py"
    - "apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py"
    - "apps/generation-engine/tests/test_no_duplicate_model_construction.py"
  modified:
    - "apps/generation-engine/tests/test_smoke_qwen.py (extended with test_extra_body_forwarded; pytestmark refactored to per-test decorators)"
    - "apps/generation-engine/tests/conftest.py (module-level OPENROUTER_API_KEY priming)"

key-decisions:
  - "PEP 695 type-parameter form `def make_agent[T: BaseModel](...)` used in agent_factory.py instead of plan's verbatim `T = TypeVar('T', bound=BaseModel)` form — pre-commit ruff hook auto-fixes UP047 (Generic function should use type parameters); semantically identical, satisfies the same `T: BaseModel` bound that the plan required (no Any leak)."
  - "_PROVIDER_ROUTING typed as `dict[str, dict[str, object]]` instead of plan's bare `dict` — `disallow_any_generics` rejects untyped dict generics under mypy strict; `object` value type preserves the heterogeneous shape (list[str] / bool / list[str] / bool) without leaking Any."
  - "Module-level `os.environ.setdefault('OPENROUTER_API_KEY', 'sk-or-test-PLACEHOLDER')` added to conftest.py — when test modules now import `mcpgen_engine.llm.agent_factory` (which transitively constructs the MODEL singleton at import time), the per-test `_sandbox_env` autouse fixture runs too late (test SETUP, not module IMPORT). The per-test fixture continues to manage env teardown safety and is unchanged."
  - "Test refactor: replaced module-level `pytestmark = [requires_openrouter, skipif(not _HAS_REAL_KEY)]` with per-test decorators on `test_qwen3_coder_structured_output` so the new mocked `test_extra_body_forwarded` runs unconditionally on every CI run."
  - "Mock OpenRouter chat-completion response includes `created: 1735689600` (Unix epoch) — pydantic-ai 0.2.x parses this as datetime; without it `agent.run()` raises `ValidationError` before the request body assertion is reached."

patterns-established:
  - "Single-MODEL-construction invariant enforced via AST-walk test (apps/generation-engine/tests/test_no_duplicate_model_construction.py). Future Pass implementations + Stage F2 judges must import MODEL transitively via make_agent; offender file path is printed in assertion message for fast diagnosis."
  - "Per-pass ModelSettings constants live in llm/sampling.py; call sites pass `model_settings=PASS_N_SETTINGS` to `agent.run()`. Never construct ModelSettings inline."
  - "extra_body forwarding regression detector: pytest-httpx mocks the OpenRouter endpoint and asserts the JSON body's `provider` key matches the D-04 dict verbatim. Future pydantic-ai bumps that move/drop extra_body propagation fail this gate."

requirements-completed: [GEN-13]

# Metrics
duration: ~25min
completed: 2026-04-26
---

# Phase 02 Plan 01: PydanticAI Agent Factory + Provider Routing Pinning Summary

**Wraps the MODEL singleton with `make_agent` factory and per-pass `PASS_0_SETTINGS` / `PASS_1_SETTINGS` constants that pin OpenRouter to Fireworks fp16 via `extra_body.provider`; pytest-httpx CI gate asserts the pin reaches the wire; AST-walk static test enforces the singleton invariant.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-26 (during Phase 02 execution)
- **Completed:** 2026-04-26
- **Tasks:** 4
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- `make_agent[T: BaseModel](*, output_type, system_prompt) -> Agent[None, T]` factory ships in `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py` — single legal entry point for Pass 0/1 PydanticAI Agent construction.
- `PASS_0_SETTINGS` (T=0.0, max_tokens=4096) and `PASS_1_SETTINGS` (T=0.2, max_tokens=8192) shipped in `llm/sampling.py` with verbatim D-04 `_PROVIDER_ROUTING` (`{"order": ["fireworks"], "allow_fallbacks": False, "quantizations": ["fp16"], "require_parameters": True}`).
- `test_extra_body_forwarded` runs on every CI without a real OPENROUTER_API_KEY (pytest-httpx mocked); asserts the D-04 provider dict round-trips into the OpenRouter chat-completions request body verbatim. Catches Pitfall #2/B silent extra_body drop.
- `test_no_duplicate_model_construction` ships green — walks `apps/generation-engine/src/mcpgen_engine/` recursively and rejects any `OpenAIModel(...)` / `OpenAIProvider(...)` / `OpenRouterModel(...)` / `OpenRouterProvider(...)` call OR `from pydantic_ai.models.*` / `from pydantic_ai.providers.*` import outside `llm/client.py`. Manual negative test confirmed: introducing the offending import fails the test with the offender file path printed in the assertion message.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create llm/sampling.py with provider routing pinning + per-pass ModelSettings** — `fc2bf1f` (feat)
2. **Task 2: Create llm/agent_factory.py with make_agent() wrapping MODEL singleton** — `e43359d` (feat)
3. **Task 3: Extend test_smoke_qwen.py — assert extra_body forwarded via pytest-httpx mock** — `4e247aa` (test) — also includes the conftest.py module-level env priming required by the new top-level `from mcpgen_engine.llm.*` imports
4. **Task 4: Add test_no_duplicate_model_construction.py — AST-walk static check** — `280b069` (test)

## Files Created/Modified

### Created
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — `_PROVIDER_ROUTING` D-04 dict + `PASS_0_SETTINGS` / `PASS_1_SETTINGS` D-06 ModelSettings constants
- `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py` — `make_agent[T: BaseModel](*, output_type, system_prompt)` factory wrapping `Agent(MODEL, ...)`
- `apps/generation-engine/tests/test_no_duplicate_model_construction.py` — AST-walk static check (FORBIDDEN_CLASSES + FORBIDDEN_MODULES; ALLOWED_FILE = `llm/client.py`)

### Modified
- `apps/generation-engine/tests/test_smoke_qwen.py` — added `test_extra_body_forwarded` (pytest-httpx mock + body inspection); refactored `test_qwen3_coder_structured_output` from module-level `pytestmark` to per-test `@pytest.mark.requires_openrouter` + `@pytest.mark.skipif`
- `apps/generation-engine/tests/conftest.py` — added module-level `os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")` before the existing `_sandbox_env` autouse fixture; downstream test modules importing `mcpgen_engine.llm.*` at top level now collect cleanly

## Decisions Made

See key-decisions in frontmatter. The salient ones:

- **PEP 695 over TypeVar** in `agent_factory.py` for `make_agent` — pre-commit ruff hook auto-fixes UP047. Semantically identical bounded generic; preserves the plan's "no Any leak" requirement.
- **Module-level conftest env priming** — required because `test_smoke_qwen.py` now imports `mcpgen_engine.llm.agent_factory` at top level, which transitively constructs the MODEL singleton (which fail-fasts on missing OPENROUTER_API_KEY). The per-test `_sandbox_env` fixture runs too late (test setup, not module import).
- **`created: 1735689600` in mocked OpenRouter response** — pydantic-ai's chat-completion validator requires a parseable `created` field; without it `.run()` raises ValidationError before the body assertion is reached. The mock response is opaque to the pin-assertion test (which inspects only the OUTBOUND request body shape).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PEP 695 type parameter form replaces verbatim TypeVar**
- **Found during:** Task 2 (agent_factory.py)
- **Issue:** Pre-commit `ruff` hook autofixes UP047 (`Generic function 'make_agent' should use type parameters`) and strips the `# noqa: UP047` comment as unused, then UP047 fires again — infinite hook conflict. Plan's verbatim `T = TypeVar("T", bound=BaseModel)` cannot pass pre-commit without disabling UP047 globally (out-of-scope policy change).
- **Fix:** Switched to PEP 695 form: `def make_agent[T: BaseModel](...)`. Semantically identical; preserves the bounded-generic invariant.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py`
- **Verification:** `mypy strict` clean; `ruff` clean; `make_agent(output_type=O, system_prompt='test')` returns `Agent`; the Plan-3 `test_extra_body_forwarded` (which uses `make_agent`) passes
- **Committed in:** `e43359d` (Task 2)

**2. [Rule 3 - Blocking] Module-level OPENROUTER_API_KEY priming in conftest.py**
- **Found during:** Task 3 (test_smoke_qwen.py)
- **Issue:** The new `test_extra_body_forwarded` imports `mcpgen_engine.llm.agent_factory` at top level. That import transitively triggers `mcpgen_engine.llm.client.MODEL = get_model()` at module IMPORT time, which fail-fasts on missing `OPENROUTER_API_KEY`. The existing `_sandbox_env` autouse fixture runs at test SETUP, too late — pytest collection raises `KeyError: 'OPENROUTER_API_KEY'`.
- **Fix:** Added `os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-test-PLACEHOLDER")` at conftest.py module scope (line 17). Runs at conftest IMPORT, before any test module is collected. The per-test fixture is unchanged and still manages teardown.
- **Files modified:** `apps/generation-engine/tests/conftest.py`
- **Verification:** `uv run pytest tests/test_smoke_qwen.py::test_extra_body_forwarded -x` passes (1 passed); full engine suite `uv run pytest` exits 0 (10 passed, 1 skipped); existing `test_llm_client.py` fail-fast tests (which `delenv` inside the test body) still pass
- **Committed in:** `4e247aa` (Task 3, alongside the smoke-test extension)

**3. [Rule 3 - Blocking] Mock response `created` field**
- **Found during:** Task 3 verification
- **Issue:** Initial mocked OpenRouter chat-completion response in `test_extra_body_forwarded` (taken verbatim from the plan body) lacked a `created` field. pydantic-ai 0.2.20's response parser raises `ValidationError: Input should be a valid datetime [input_value=None]` BEFORE the test reaches the request-body assertion — turning the regression detector into a flaky bug.
- **Fix:** Added `"created": 1735689600` (Unix epoch) to the mocked response. The mock body is opaque to the actual purpose of the test; only the outbound request body shape is asserted.
- **Files modified:** `apps/generation-engine/tests/test_smoke_qwen.py`
- **Verification:** Test passes consistently (`1 passed in 0.70s` on first run; verified across multiple runs)
- **Committed in:** `4e247aa` (Task 3)

**4. [Rule 1 - Bug] `_PROVIDER_ROUTING` type annotation tightened**
- **Found during:** Task 1 (sampling.py mypy check)
- **Issue:** Plan's `_PROVIDER_ROUTING: dict = { ... }` annotation fails mypy strict (`disallow_any_generics`) because bare `dict` is a generic without type parameters → equivalent to `dict[Any, Any]` which the project bans (CLAUDE.md global rule "no generic types: Any, unknown, Dict[str, Any]").
- **Fix:** Annotated as `dict[str, dict[str, object]]`. `object` for the inner value type preserves the heterogeneous shape (list[str] / bool / list[str] / bool) without leaking `Any`. `ModelSettings.extra_body` accepts this type via TypedDict.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/llm/sampling.py`
- **Verification:** `mypy strict` clean on `sampling.py`; both constants importable; `extra_body` round-trips through pytest-httpx assertion
- **Committed in:** `fc2bf1f` (Task 1)

---

**Total deviations:** 4 auto-fixed (1 Rule 1 - typing strictness; 3 Rule 3 - blocking issues required to make the planned tests collect/run/pass)
**Impact on plan:** All four are minor implementation-detail adjustments — none change the architectural intent, the verbatim D-04 provider dict, or the test semantics. The plan's core deliverables (factory + sampling constants + extra_body forwarding gate + AST-walk invariant) all ship as designed.

## Issues Encountered

- **Pre-commit ruff hook strips `# noqa: UP047` comment as "unused"** even though the rule then fires immediately. Resolution: switch to PEP 695 form (Rule 3 deviation #1).
- **Test collection fails because MODEL singleton constructs at import time** when test modules import `mcpgen_engine.llm.*` at top level. Resolution: prime `OPENROUTER_API_KEY` at conftest module scope (Rule 3 deviation #2).
- **Initial mocked OpenAI chat-completion response missing `created` field** caused pydantic-ai's response validator to raise `ValidationError` before the request-body assertion. Resolution: add Unix epoch `created` value to the mock body (Rule 3 deviation #3).
- **Bare `dict` annotation conflicts with mypy `disallow_any_generics`.** Resolution: annotate `dict[str, dict[str, object]]` (Rule 1 deviation #4).

## VALIDATION.md Status

Per `.planning/phases/02-generation-engine-architect-pass-0-1/02-VALIDATION.md`:

| Row     | Test                                                                                                       | Status   |
| ------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| T-2-E1  | Day-1 smoke test imports `OpenAIModel` (NOT `OpenAIChatModel`)                                             | green (Phase 1 baseline retained) |
| T-2-E2  | Smoke test asserts `extra_body.provider.order == ["fireworks"]` is forwarded to OpenRouter request body    | **green (this plan)** |
| T-2-E3  | All Pass 0/1 LLM call sites import MODEL from llm.client (no duplicate OpenAIModel constructions)          | **green (this plan)** |

## User Setup Required

None — no external service configuration. The `test_extra_body_forwarded` gate runs on every CI without an OPENROUTER_API_KEY (pytest-httpx mocked); the existing `test_qwen3_coder_structured_output` continues to be skipped on forks/contributors without a real key, unchanged from Phase 1.

## Next Phase Readiness

- Phase-2 follow-up plans (02-04 Pass 0 LLM stage, 02-05/02-06 Pass 1, 02-07 pipeline orchestrator) can `from mcpgen_engine.llm.agent_factory import make_agent` and `from mcpgen_engine.llm.sampling import PASS_0_SETTINGS, PASS_1_SETTINGS` without further setup.
- Phase 3 plans (Pass 2/3/4 description authoring + parameter spec + annotations) reuse the same factory pattern; only need a new `PASS_2_SETTINGS` / `PASS_3_SETTINGS` / `PASS_4_SETTINGS` ModelSettings constant per pass.
- Phase 5 plans (Stage F2 multi-shuffle judge per `mcpgen-model-and-provider-override.md` §4) reuse the factory; the test_no_duplicate_model_construction AST-walk gate prevents accidental second-MODEL constructors there.
- AST-walk gate is now part of the engine test suite — runs unconditionally; future regressions caught at the per-task pytest sample (per VALIDATION.md "Sampling Rate").

## Self-Check: PASSED

- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py` — FOUND
- `apps/generation-engine/tests/test_no_duplicate_model_construction.py` — FOUND
- `apps/generation-engine/tests/test_smoke_qwen.py` — extended (verified `test_extra_body_forwarded` present)
- `apps/generation-engine/tests/conftest.py` — modified (verified module-level `os.environ.setdefault` present)
- Commit `fc2bf1f` (Task 1) — FOUND in git log
- Commit `e43359d` (Task 2) — FOUND in git log
- Commit `4e247aa` (Task 3) — FOUND in git log
- Commit `280b069` (Task 4) — FOUND in git log
- Final verification: `uv run pytest tests/test_smoke_qwen.py::test_extra_body_forwarded tests/test_no_duplicate_model_construction.py -x` exits 0 (2 passed)
- Full engine suite: `uv run pytest` exits 0 (11 passed, 1 skipped — the real-network smoke)
- mypy strict: clean on 6 source files (sampling.py, agent_factory.py, client.py, __init__.py, test_smoke_qwen.py, test_no_duplicate_model_construction.py)
- ruff: clean

---
*Phase: 02-generation-engine-architect-pass-0-1*
*Completed: 2026-04-26*
