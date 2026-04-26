---
phase: 01-foundation
plan: 06
subsystem: engine
tags: [python, fastapi, uv, pydantic-ai, openrouter, qwen, sentry, langfuse, otel, fly]

# Dependency graph
requires:
  - "01-01 (monorepo skeleton — pnpm workspace + .gitignore)"
  - "01-02 (pre-commit hooks — gitleaks, ruff, mypy, conventional-commits)"
  - "01-03 (frozen contracts — packages/ir/ Python output is workspace path source)"
  - "01-04 (DB schema v1 — engine consumes drizzle types via packages/contracts)"
provides:
  - "apps/generation-engine = buildable FastAPI app + uv-managed venv + Dockerfile + fly.toml"
  - "MODEL singleton (apps/generation-engine/src/mcpgen_engine/llm/client.py) — sole LLM entrypoint for Phase 2+ passes (LiteLLM is DELETED)"
  - "Day-1 Qwen smoke test (apps/generation-engine/tests/test_smoke_qwen.py) — Pitfall #27 mitigation; gates every Phase-2 engine PR"
  - "Sentry SDK init with empty-DSN safety + before_send redaction stub (FND-10)"
  - "Langfuse v4 OTel exporter wired via logfire.configure(send_to_logfire=False) (FND-11)"
  - "Fly.io Machines deploy config with auto_stop_machines=suspend"
affects:
  - "Phase 2 (Pass 0–1) — every pass MUST import MODEL from llm/client.py; no other LLM construction allowed"
  - "Phase 5 (Stage F) — F1 static stage uses gitleaks binary baked into the engine image"
  - "Phase 9 (observability + deploy) — fills SENTRY_DSN and LANGFUSE_* secrets via flyctl"
  - "Phase 10 (launch) — verifies the smoke test runs green on real OPENROUTER_API_KEY"

tech-stack:
  added:
    - "Python 3.12 (.python-version pin; uv-managed)"
    - "uv ^0.9.27 (Astral project manager)"
    - "FastAPI ^0.128 + uvicorn[standard] ^0.30"
    - "PydanticAI ^0.2.20 (note: 0.2.x exports OpenAIModel, NOT OpenAIChatModel)"
    - "pydantic ^2.9 + pydantic-settings ^2.5"
    - "sentry-sdk[fastapi] ^2.16"
    - "logfire ^1.0 + opentelemetry-sdk ^1.27 + opentelemetry-exporter-otlp-proto-http ^1.27"
    - "structlog ^24.4 + tenacity ^9.0"
    - "prance[osv] ^23.6.21 + openapi-spec-validator ^0.7 (Stage A parser, Phase 2)"
    - "psycopg[binary,pool] ^3.2 + aioboto3 ^13.2"
    - "jinja2 ^3.1 (Stage E codegen, Phase 4)"
    - "Dev: ruff ^0.7, mypy ^1.13, pytest ^8.3 + pytest-asyncio + pytest-httpx, datamodel-code-generator ^0.26, ipython ^8.28"
    - "gitleaks v8.21.2 (baked into Dockerfile for Phase 5 F1)"
  patterns:
    - "Single MODEL singleton at apps/generation-engine/src/mcpgen_engine/llm/client.py — sole LLM entrypoint for the entire engine (LiteLLM is DELETED)"
    - "Fail-fast at import: get_model() raises KeyError when OPENROUTER_API_KEY is unset (Pitfall #27 mitigation; no None sentinel)"
    - "Conftest `_sandbox_env` autouse fixture sets OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER so module-load tests are safe; tests that exercise the unset-key path delenv after import"
    - "Sentry before_send redaction: Authorization, X-Upstream-Auth, Cookie -> [REDACTED] (architecture §11.3 + Pitfall #12)"
    - "Langfuse OTel exporter: logfire.configure(send_to_logfire=False) + manual TracerProvider with Basic auth header when both Langfuse keys are set"
    - "Workspace path source (uv): mcpgen-ir = { path = '../../packages/ir', editable = true } — build context must be repo root for Docker"
    - "pytest filterwarnings=error with a single message-pattern allowlist for upstream pydantic-ai 0.2.x deprecations from opentelemetry-sdk 1.39+"
    - "Two-stage Dockerfile (builder + runtime): copies workspace dep packages/ir into /pkgs/ir, sed-rewrites the path-source URI, then uv sync --frozen --no-dev"

key-files:
  created:
    - "apps/generation-engine/.python-version (1 line) — pins Python 3.12"
    - "apps/generation-engine/pyproject.toml (134 lines) — full dep tree, ruff/mypy/pytest config"
    - "apps/generation-engine/uv.lock (auto-generated, 3000+ lines) — committed for reproducible builds"
    - "apps/generation-engine/src/mcpgen_engine/__init__.py (empty package marker)"
    - "apps/generation-engine/src/mcpgen_engine/main.py (66 lines) — FastAPI factory, init_sentry, before_send redaction, /health"
    - "apps/generation-engine/src/mcpgen_engine/settings.py (39 lines) — pydantic-settings env loader"
    - "apps/generation-engine/src/mcpgen_engine/observability.py (50 lines) — Langfuse OTel wiring (FND-11)"
    - "apps/generation-engine/src/mcpgen_engine/llm/__init__.py (empty)"
    - "apps/generation-engine/src/mcpgen_engine/llm/client.py (47 lines) — MODEL singleton (LiteLLM DELETED)"
    - "apps/generation-engine/tests/__init__.py (empty)"
    - "apps/generation-engine/tests/conftest.py (35 lines) — _sandbox_env autouse fixture with placeholder OPENROUTER_API_KEY"
    - "apps/generation-engine/tests/test_main.py (52 lines) — 3 tests: /health 200, Sentry empty-DSN, before_send redaction"
    - "apps/generation-engine/tests/test_observability.py (35 lines) — 3 tests: no-keys no-crash, Basic auth encoding, idempotent"
    - "apps/generation-engine/tests/test_llm_client.py (40 lines) — 3 tests: KeyError on unset key, default qwen3-coder, PRIMARY_MODEL override"
    - "apps/generation-engine/tests/test_smoke_qwen.py (74 lines) — Day-1 Qwen smoke test (skipif when no real API key)"
    - "apps/generation-engine/Dockerfile (60 lines) — multi-stage Python 3.12 + uv + gitleaks v8.21.2"
    - "apps/generation-engine/fly.toml (47 lines) — Fly Machines, auto_stop_machines=suspend"
    - "infrastructure/fly/fly.toml (47 lines) — canonical IaC mirror per architecture §15"
    - "apps/generation-engine/README.md (74 lines) — scope, single-MODEL policy, smoke test, env table, deploy"
  modified:
    - ".gitignore — removed `.python-version` ignore so apps/generation-engine/.python-version is tracked"

key-decisions:
  - "pydantic-ai 0.2.20 exports OpenAIModel (not OpenAIChatModel — that's the 0.5+ API). Aligned with the actually pinned version everywhere; bump-friendly comment in client.py and test_smoke_qwen.py."
  - "Sentry _sentry_before_send signature uses TYPE_CHECKING-guarded imports of Event/Hint from sentry_sdk._types; returns Event | None per the SDK contract."
  - "pytest filterwarnings=error caught upstream pydantic-ai 0.2.x deprecations from opentelemetry-sdk 1.39+ (Logger / LoggerProvider / ProxyLoggerProvider). Scoped a single message-pattern ignore that disappears when pydantic-ai is bumped."
  - "Conftest _sandbox_env autouse fixture sets OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER (NOT None fallback) so module-load tests are safe; the fail-fast contract in client.py is verified by delenv'ing after importlib.reload() inside the relevant test."
  - "Dockerfile build context is the REPO ROOT (not apps/generation-engine/) because the workspace dep mcpgen-ir lives at packages/ir/ — outside the app dir. README and Dockerfile both document the build command explicitly."
  - "ruff PT022 autofix replaced `yield` with `return` in the autouse fixture; updated signature from Iterator[None] to None to match (monkeypatch handles teardown automatically)."
  - "Removed `.python-version` from `.gitignore` so the pinned 3.12 carries on fresh clones (uv reads it; pyenv-compatible tools too)."

patterns-established:
  - "Single MODEL singleton policy: any pass that needs an LLM call MUST import MODEL from `mcpgen_engine.llm.client` (no per-pass model construction; no LiteLLM)"
  - "Fail-fast at module load: production-critical env vars are read with `os.environ[KEY]` (not `.get(...)` with None fallback) so missing config surfaces immediately at startup"
  - "Sentry before_send redaction: ALL Python services in the repo MUST register a before_send that strips Authorization / X-Upstream-Auth / Cookie request headers"
  - "Langfuse OTel pattern: every Python service that wants to ship LLM traces uses `logfire.configure(send_to_logfire=False)` + a manual TracerProvider when both LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set; empty-key default is no-op"
  - "uv-managed Python services follow the apps/generation-engine/ shape: pyproject.toml + uv.lock (committed) + .python-version (committed) + Dockerfile that rewrites workspace path-source URIs at build time"
  - "Tests run with filterwarnings=error in CI; per-message ignores are documented next to the failing pattern with the upstream tracker URL"

requirements-completed:
  - FND-01
  - FND-10
  - FND-11

# Metrics
duration: ~13min
completed: 2026-04-26
---

# Phase 1 Plan 06: Generation Engine Scaffold Summary

**Production-ready Python engine scaffold (FastAPI + PydanticAI + OpenRouter through MODEL singleton) with the Day-1 Qwen smoke test that gates every Phase-2 engine PR (Pitfall #27 mitigation).**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-04-26T14:07Z
- **Completed:** 2026-04-26T14:20Z
- **Tasks:** 3 / 3
- **Files created:** 19 (5 src modules, 4 + 1 test files, conftest.py, pyproject.toml, uv.lock, .python-version, Dockerfile, 2 fly.toml, README.md)
- **Files modified:** 1 (.gitignore — removed `.python-version` line)

## Accomplishments

- Engine scaffold is ready for Phase 2: a contributor with `OPENROUTER_API_KEY` set runs `cd apps/generation-engine && uv sync && uv run pytest tests/test_smoke_qwen.py -v` and verifies that `qwen/qwen3-coder` works through PydanticAI structured output via OpenRouter end-to-end. Without the key, all 9 non-LLM tests pass cleanly and the smoke test skips with a clear reason.
- The MODEL singleton is the **only** LLM entrypoint: `apps/generation-engine/src/mcpgen_engine/llm/client.py::MODEL`. LiteLLM is **DELETED** — `grep -r litellm apps/generation-engine/` returns nothing. Phase 2+ passes import MODEL from here; no other model construction is permitted.
- Sentry SDK initialises with empty DSN safely (FND-10), and `before_send` redacts `Authorization` / `X-Upstream-Auth` / `Cookie` request headers (architecture §11.3 + Pitfall #12). The redaction is verified by an explicit unit test.
- Langfuse v4 OTel exporter is wired via `logfire.configure(send_to_logfire=False)` + a manual TracerProvider when both Langfuse keys are set (FND-11). Empty-key default is no-op; spans drop locally until Phase 9 fills credentials.
- Fly.io Machines deploy config validates: `app=mcpgen-engine`, region `iad`, `auto_stop_machines=suspend`, `min_machines_running=0`, `/health` http_check, concurrency 25 soft / 50 hard. Two copies (apps/generation-engine/ and infrastructure/fly/) per architecture §15.
- Dockerfile is a parsed, layered, two-stage Python 3.12 image with `uv sync --frozen --no-dev` and the gitleaks v8.21.2 binary baked in for Phase 5 F1. Build context is the repo root (documented in README + Dockerfile header) because the workspace dep `mcpgen-ir` lives at `packages/ir/`.
- All deviations from the plan were forced by upstream library shapes (Rule 3 - Blocking) and are documented inline + in this summary's Decisions Made section. None of them affect the engine's behavioural contract.

## Task Commits

| Task | Name                                                                | Commit    | Files                                                                                                |
| ---- | ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| 1    | Initialize uv project + pyproject.toml + ruff/mypy/pytest config    | `684a61b` | .gitignore, .python-version, pyproject.toml, uv.lock, src/__init__.py, tests/__init__.py             |
| 2    | Author src modules + tests (main, settings, observability, llm)     | `3fe5651` | main.py, settings.py, observability.py, llm/{__init__,client}.py, conftest.py, test_{main,observability,llm_client}.py, pyproject.toml (filterwarnings) |
| 3    | Day-1 Qwen smoke test + Dockerfile + fly.toml + README              | `88fbf0a` | test_smoke_qwen.py, Dockerfile, fly.toml, infrastructure/fly/fly.toml, README.md                     |

**Plan metadata commit:** SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md updates committed at the end of this plan.

## Files Created

### Source modules (`apps/generation-engine/src/mcpgen_engine/`)

- `__init__.py` (0 lines) — package marker.
- `main.py` (66 lines) — FastAPI factory `create_app()`. Calls `init_sentry()` + `configure_langfuse_otel()` then registers a single `/health` endpoint that returns `{"status": "ok"}`. `_sentry_before_send` redacts `Authorization` / `X-Upstream-Auth` / `Cookie` request headers using `TYPE_CHECKING`-guarded imports of `Event`/`Hint` from `sentry_sdk._types`.
- `settings.py` (39 lines) — `EngineSettings(BaseSettings)` with class-attribute defaults for every field except `openrouter_api_key` (no default → fail-fast). Loads `.env` via pydantic-settings.
- `observability.py` (50 lines) — `configure_langfuse_otel()`: empty-key safe; calls `logfire.configure(send_to_logfire=False, service_name=...)`; if both Langfuse keys are set, builds a `TracerProvider` + `BatchSpanProcessor` + `OTLPSpanExporter` with Basic-auth header and registers it as the global tracer provider. Idempotent (safe to call twice).
- `llm/__init__.py` (0 lines) — package marker.
- `llm/client.py` (47 lines) — `get_model() -> OpenAIModel` constructs a `OpenAIProvider` against OpenRouter (default `https://openrouter.ai/api/v1`) and an `OpenAIModel` (default `qwen/qwen3-coder`). Module-level `MODEL: OpenAIModel = get_model()` singleton. `os.environ["OPENROUTER_API_KEY"]` (NOT `.get(...)`) so module load fails fast if unset.

### Test modules (`apps/generation-engine/tests/`)

- `__init__.py` (0 lines) — package marker.
- `conftest.py` (35 lines) — autouse `_sandbox_env` fixture that delenv's OPENROUTER_BASE_URL, PRIMARY_MODEL, SENTRY_*, ENVIRONMENT, LANGFUSE_* and sets `OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER` so module load is safe under test.
- `test_main.py` (52 lines) — 3 tests: `/health` returns 200 with `{"status": "ok"}`; `init_sentry()` does not crash with empty SENTRY_DSN; `_sentry_before_send` redacts Authorization/X-Upstream-Auth/Cookie and leaves other headers intact.
- `test_observability.py` (35 lines) — 3 tests: `configure_langfuse_otel()` does not crash without keys; with keys, the Basic-auth encoding matches `base64(public:secret)`; calling twice is idempotent.
- `test_llm_client.py` (40 lines) — 3 tests: `get_model()` raises `KeyError` after `monkeypatch.delenv("OPENROUTER_API_KEY")`; default `model_name == "qwen/qwen3-coder"`; `PRIMARY_MODEL` env var overrides to e.g. `qwen/qwen3-30b-a3b-instruct`.
- `test_smoke_qwen.py` (74 lines) — Day-1 smoke test. Skipped when `OPENROUTER_API_KEY` is unset OR equals the conftest placeholder. Builds an `Agent[None, ToolDescription]` against `qwen/qwen3-coder` via OpenRouter and asserts that `result.output` is a `ToolDescription` with non-trivial `purpose` and `when_to_use`.

### Build / deploy

- `apps/generation-engine/Dockerfile` (60 lines) — two-stage Python 3.12 image. Builder stage installs `uv` + `gitleaks v8.21.2`, copies `packages/ir/` into `/pkgs/ir/`, sed-rewrites the `[tool.uv.sources]` path from `../../packages/ir` (host) to `/pkgs/ir` (image), then `uv sync --frozen --no-dev`. Runtime stage copies `/opt/venv` and the gitleaks binary, sets `PATH`, and runs `uvicorn mcpgen_engine.main:app`. Build context MUST be the repo root.
- `apps/generation-engine/fly.toml` (47 lines) — Fly Machines deploy. `app=mcpgen-engine`, `primary_region=iad`, services on 80/443, `force_https=true`, concurrency 25 soft / 50 hard, `/health` http_check, `auto_stop_machines=suspend`, `min_machines_running=0`.
- `infrastructure/fly/fly.toml` (47 lines) — canonical IaC mirror with `dockerfile = "../../apps/generation-engine/Dockerfile"`. Updates to either file must stay in sync.

### Project metadata

- `apps/generation-engine/pyproject.toml` (134 lines) — full dep tree, ruff lint set (E, F, I, B, UP, RUF, ANN, SIM, PT, S, ASYNC, TRY, RET, ARG, RSE), mypy `--strict` with `ignore_missing_imports` for prance/openapi-spec-validator/tenacity/logfire/aioboto3, pytest `asyncio_mode=auto` + `requires_openrouter` marker + `--strict-markers` + scoped `filterwarnings`.
- `apps/generation-engine/uv.lock` — committed for reproducible builds.
- `apps/generation-engine/.python-version` — `3.12`.
- `apps/generation-engine/README.md` (74 lines) — scope, single-MODEL policy + LiteLLM DELETED, Day-1 smoke test rationale, env table, deploy commands, observability overview.

### Modified

- `.gitignore` — removed the `.python-version` ignore line so `apps/generation-engine/.python-version` is tracked. Annotated comment notes the rationale.

## Decisions Made

- **`OpenAIModel` vs `OpenAIChatModel`:** the plan's interface code (and PATTERNS.md) showed `OpenAIChatModel`, which is the newer pydantic-ai 0.5+ API. The version actually pinned by `pydantic-ai>=0.0.40` resolves to 0.2.20, which exports `OpenAIModel`. Aligned every reference with the resolved version and added a bump-friendly comment in both `llm/client.py` and `test_smoke_qwen.py`. When pydantic-ai is bumped, those two files are the only places to update.
- **Sentry `before_send` types:** `sentry_sdk._types.{Event, Hint}` are exported only under `TYPE_CHECKING`; importing them at runtime fails. Used a `TYPE_CHECKING`-guarded import + `from __future__ import annotations` so the typed signature passes mypy `--strict` while runtime imports stay clean.
- **`filterwarnings = ["error"]` + scoped allowlist:** mypy + ruff are strict, but pytest's `error` filter caught upstream deprecations from `opentelemetry-sdk` 1.39+ that fire when pydantic-ai 0.2.x imports `opentelemetry._events.{Event, EventLogger, ...}`. The deprecations are emitted through `typing_extensions.{__init_subclass__, __new__}`, so per-module filters miss them. Scoped a single message-pattern ignore that names the upstream issue and disappears when pydantic-ai is bumped.
- **Conftest placeholder vs None fallback:** the plan revision (iteration 1) explicitly removed the `try/except KeyError → None` fallback in `llm/client.py` so module load is fail-fast on missing config. To keep test ergonomics sane, the `_sandbox_env` autouse fixture sets `OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER`. Tests that exercise the unset-key fail-fast contract delenv after `importlib.reload(client_mod)`. The smoke test treats the placeholder as "no real key" and skips.
- **PT022 autofix `yield` → `return`:** ruff's PT022 rule auto-converted the autouse fixture from a generator to a plain function (no teardown needed; monkeypatch handles cleanup automatically). Updated the signature from `Iterator[None]` to `None` to match.
- **Dockerfile build context:** `mcpgen-ir` is a workspace path source at `packages/ir/`, which is outside `apps/generation-engine/`. The Dockerfile copies `packages/ir/` into `/pkgs/ir/` and sed-rewrites the `[tool.uv.sources]` URI before `uv sync`. Build context MUST be the repo root — README documents the explicit `flyctl deploy --dockerfile ... --build-context $PWD` command.
- **`.gitignore` change:** the previous `.python-version` blanket ignore prevented the pinned `3.12` from being tracked. Removed the line and replaced with an explanatory comment so fresh clones get the pin automatically (uv reads `.python-version`; pyenv-compatible tools too).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pydantic-ai 0.2.20 exports `OpenAIModel`, not `OpenAIChatModel`**

- **Found during:** Task 2 mypy run.
- **Issue:** plan's interface code referenced `OpenAIChatModel`, which is the 0.5+ API. The version pinned in pyproject.toml resolves to 0.2.20, which exports `OpenAIModel`.
- **Fix:** Aligned `llm/client.py`, `test_llm_client.py`, and `test_smoke_qwen.py` to use `OpenAIModel`. Added a bump-friendly comment in both `llm/client.py` and `test_smoke_qwen.py` headers documenting the version note.
- **Files modified:** `src/mcpgen_engine/llm/client.py`, `tests/test_smoke_qwen.py`.
- **Verification:** `uv run python -c "from pydantic_ai.models.openai import OpenAIModel; print(OpenAIModel)"` resolves; `uv run mypy --strict src tests` passes.
- **Committed in:** `3fe5651` (Task 2) + `88fbf0a` (Task 3).

**2. [Rule 3 - Blocking] Sentry `before_send` callable type `Event | None`**

- **Found during:** Task 2 mypy run.
- **Issue:** Plan's `_sentry_before_send` annotation was `dict[str, object] -> dict[str, object]`. Sentry's actual contract is `(Event, Hint) -> Event | None` (returning None drops the event), and `Event` / `Hint` are TypedDicts exported only under `TYPE_CHECKING` in `sentry_sdk._types`.
- **Fix:** Used `from __future__ import annotations` + `if TYPE_CHECKING: from sentry_sdk._types import Event, Hint`. Updated the return type to `Event | None` and added an explicit `assert cleaned is not None` in the corresponding unit test.
- **Files modified:** `src/mcpgen_engine/main.py`, `tests/test_main.py`.
- **Verification:** `uv run mypy --strict src tests` passes.
- **Committed in:** `3fe5651` (Task 2).

**3. [Rule 3 - Blocking] pytest `filterwarnings=error` triggers on upstream pydantic-ai deprecations**

- **Found during:** Task 2 first `pytest -m "not requires_openrouter"` run (6 of 9 tests failed with `DeprecationWarning: You should use Logger instead.`).
- **Issue:** pydantic-ai 0.2.20 imports `opentelemetry._events.{Event, EventLogger, NoOpEventLogger}`, which `opentelemetry-sdk` 1.39+ deprecated in favour of `Logger`/`LoggerProvider`/`ProxyLoggerProvider`. The deprecations bubble out through `typing_extensions.{__init_subclass__, __new__}`, so per-module filters (`ignore::DeprecationWarning:opentelemetry._events`) don't match.
- **Fix:** Added a single message-pattern allowlist to `[tool.pytest.ini_options].filterwarnings` matching all 1.39 deprecations: `"ignore:You should use \`.*\` instead\\. Deprecated since version 1\\.39\\.0.*:DeprecationWarning"`. Documented inline with the upstream tracker URL (pydantic-ai #1815).
- **Files modified:** `pyproject.toml`.
- **Verification:** `uv run pytest -m "not requires_openrouter"` exits 0 with all 9 tests passing.
- **Committed in:** `3fe5651` (Task 2).

**4. [Rule 3 - Blocking] PT022 auto-fix `yield` → `return` in autouse fixture**

- **Found during:** Task 2 ruff check.
- **Issue:** ruff's PT022 (`No teardown in fixture`) flagged the `_sandbox_env` autouse fixture which used `yield` without a teardown block. Auto-fix replaced `yield` with `return` but left the function signature as `Iterator[None]`.
- **Fix:** Updated the signature from `-> Iterator[None]` to `-> None` and removed the unused `Iterator` import. monkeypatch handles teardown automatically; no `yield`/cleanup needed.
- **Files modified:** `tests/conftest.py`.
- **Verification:** `uv run ruff check tests` exits 0; `uv run mypy --strict tests` exits 0.
- **Committed in:** `3fe5651` (Task 2).

**5. [Rule 3 - Blocking] `.python-version` was previously gitignored**

- **Found during:** Task 1 staging.
- **Issue:** the existing `.gitignore` had a blanket `.python-version` line that would have prevented committing the pin.
- **Fix:** Removed the line and replaced with a commented note explaining that `apps/generation-engine/.python-version` is intentionally tracked (uv reads it; pyenv-compatible tools too).
- **Files modified:** `.gitignore`.
- **Verification:** `git ls-files apps/generation-engine/.python-version` lists the file.
- **Committed in:** `684a61b` (Task 1).

## Verification Confirmation

```
$ cd apps/generation-engine && uv sync                 # exits 0
$ uv run ruff check src tests                          # All checks passed!
$ uv run ruff format --check src tests                 # 11 files already formatted
$ uv run mypy --strict src tests                       # Success: no issues found in 12 source files
$ uv run pytest -m "not requires_openrouter"           # 9 passed in 2.5s
$ uv run pytest tests/test_smoke_qwen.py               # 1 skipped (no OPENROUTER_API_KEY)

$ pnpm -r build                                        # all TS apps still build
$ pnpm -r typecheck                                    # all TS apps still typecheck

$ grep -r litellm apps/generation-engine/              # no output (LiteLLM is DELETED)
$ grep -q "qwen/qwen3-coder" apps/generation-engine/src/mcpgen_engine/llm/client.py
$ grep -q "qwen/qwen3-coder" apps/generation-engine/tests/test_smoke_qwen.py

$ python --version  # 3.12.12 (uv-managed)
$ uv --version      # uv 0.9.27
```

## Pointer for Downstream Plans

- **Phase 2 (Pass 0–1):** every pass implementation MUST `from mcpgen_engine.llm.client import MODEL` and use that singleton. Do NOT instantiate `OpenAIModel`/`OpenAIProvider` anywhere else. The Day-1 smoke test (`tests/test_smoke_qwen.py`) is the gating CI check.
- **Phase 5 (F1):** the Stage E codegen output runs gitleaks against generated bundles; the `gitleaks v8.21.2` binary is already baked into the engine image at `/usr/local/bin/gitleaks`.
- **Phase 9 (deploy):** fills `SENTRY_DSN`, `SENTRY_RELEASE`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` via flyctl secrets. The wiring in `main.py::init_sentry` and `observability.py::configure_langfuse_otel` is already in place — only env injection is needed.
- **pydantic-ai bump:** when bumped past 0.5, two files need updating: `src/mcpgen_engine/llm/client.py` (rename `OpenAIModel` → `OpenAIChatModel`) and `tests/test_smoke_qwen.py` (same). The `filterwarnings` allowlist in `pyproject.toml` can also be removed once the upstream deprecations are gone.

## Self-Check: PASSED

**Files claimed created — all exist:**

- ✓ `apps/generation-engine/.python-version`
- ✓ `apps/generation-engine/pyproject.toml`
- ✓ `apps/generation-engine/uv.lock`
- ✓ `apps/generation-engine/src/mcpgen_engine/__init__.py`
- ✓ `apps/generation-engine/src/mcpgen_engine/main.py`
- ✓ `apps/generation-engine/src/mcpgen_engine/settings.py`
- ✓ `apps/generation-engine/src/mcpgen_engine/observability.py`
- ✓ `apps/generation-engine/src/mcpgen_engine/llm/__init__.py`
- ✓ `apps/generation-engine/src/mcpgen_engine/llm/client.py`
- ✓ `apps/generation-engine/tests/__init__.py`
- ✓ `apps/generation-engine/tests/conftest.py`
- ✓ `apps/generation-engine/tests/test_main.py`
- ✓ `apps/generation-engine/tests/test_observability.py`
- ✓ `apps/generation-engine/tests/test_llm_client.py`
- ✓ `apps/generation-engine/tests/test_smoke_qwen.py`
- ✓ `apps/generation-engine/Dockerfile`
- ✓ `apps/generation-engine/fly.toml`
- ✓ `infrastructure/fly/fly.toml`
- ✓ `apps/generation-engine/README.md`

**Commits claimed — all present in git log:**

- ✓ `684a61b` chore(01-06): scaffold uv project for apps/generation-engine
- ✓ `3fe5651` feat(01-06): scaffold engine entrypoint, MODEL singleton, Sentry+Langfuse wiring
- ✓ `88fbf0a` feat(01-06): add Day-1 Qwen smoke test, Dockerfile, fly.toml, README
