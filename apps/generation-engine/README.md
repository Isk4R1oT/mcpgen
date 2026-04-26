# `apps/generation-engine`

> MCPGen LLM orchestration backend (FastAPI + PydanticAI + OpenRouter).

## Scope

**Engine = LLM orchestration ONLY** (`docs/mcpgen-architecture.md` §3 + responsibility map). No UI logic, no DB CRUD beyond the engine's own state. The Drift Watcher lives in the Hono BFF (D-03), NOT here.

## Single LLM model

Per `docs/mcpgen-model-and-provider-override.md`:

- **Single model:** `qwen/qwen3-coder` via **OpenRouter** through PydanticAI.
- **LiteLLM is DELETED.** Any reference to it in this codebase is a bug.
- **Single entrypoint:** `src/mcpgen_engine/llm/client.py::MODEL` is the only place where the LLM model is constructed. All Phase 2+ passes import `MODEL` from here.
- **F3 test agent exception:** Phase 5's F3 agent eval uses Sonnet 4.7 (it simulates real Claude users; that is the documented exception in `model-and-provider-override.md` §0).

## Day-1 smoke test

`tests/test_smoke_qwen.py` is the **Pitfall #27 mitigation** — it verifies that `qwen/qwen3-coder` actually works with PydanticAI structured output via OpenRouter **before** any Pass-0 code is written. Every engine PR in Phase 2+ MUST run it green.

Run locally:

```bash
cd apps/generation-engine
OPENROUTER_API_KEY=sk-or-... uv run pytest tests/test_smoke_qwen.py -v
```

The test is automatically **skipped** if `OPENROUTER_API_KEY` is unset or set to the conftest placeholder (`sk-or-test-PLACEHOLDER`), so contributors without an API key can still run the rest of the suite.

## Local development

```bash
cd apps/generation-engine
uv sync                                    # install deps + create venv
uv run uvicorn mcpgen_engine.main:app --reload
uv run pytest -m "not requires_openrouter" # 9 tests pass without API key
uv run ruff check src tests
uv run mypy --strict src tests
```

The pre-commit hook chain (gitleaks, ruff, mypy, eslint) re-runs on every commit. **Never** use `--no-verify`.

## Required environment

| Variable | Required? | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | runtime | — | Engine startup raises `KeyError` if unset (fail-fast per Pitfall #27). |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | Override only when proxying. |
| `PRIMARY_MODEL` | no | `qwen/qwen3-coder` | Override only for `qwen/qwen3-30b-a3b-instruct` smoke fallback (model-override §8). |
| `SENTRY_DSN` | no | `""` | Phase 1 default empty; Phase 9 fills via flyctl secrets. |
| `SENTRY_RELEASE` | no | `""` | Set to `$GITHUB_SHA` in CI deploy step (D-19). |
| `LANGFUSE_PUBLIC_KEY` | no | `""` | Phase 1 default empty; Phase 9 fills. |
| `LANGFUSE_SECRET_KEY` | no | `""` | Same. |
| `LANGFUSE_OTEL_ENDPOINT` | no | `https://cloud.langfuse.com/api/public/otel/v1/traces` | Override for self-host or local Langfuse. |

## Setup

OpenRouter, Langfuse, and Fly accounts are required for full development. See the plan frontmatter `user_setup` block in `.planning/phases/01-foundation/01-06-PLAN.md` for step-by-step credential creation.

## Observability

- **Sentry**: SDK initialised in `src/mcpgen_engine/main.py::init_sentry`. Empty DSN is safe (Phase 1 default). `before_send` redacts `Authorization`, `X-Upstream-Auth`, and `Cookie` headers (Pitfall #12 + architecture §11.3).
- **Langfuse OTel**: wired in `src/mcpgen_engine/observability.py::configure_langfuse_otel` via `logfire.configure(send_to_logfire=False)` per FND-11. Empty-key safe; spans drop locally until Phase 9 fills credentials.

## Build & deploy

```bash
# Build the image from the REPO ROOT (Dockerfile reaches into packages/ir/):
docker build -f apps/generation-engine/Dockerfile -t mcpgen-engine .

# Deploy to Fly.io Machines:
flyctl deploy --config apps/generation-engine/fly.toml \
              --dockerfile apps/generation-engine/Dockerfile
```

The Dockerfile bakes in the `gitleaks` v8.21.2 binary for use by the Phase 5 F1 static-validation stage.

## Workspace dep

`mcpgen-ir` is a path-source workspace dep declared via `[tool.uv.sources]` in `pyproject.toml`. The Pydantic types in `packages/ir/python/` are GENERATED from the Zod source in `packages/ir/src/types.ts` (D-01/D-02). Do not edit `packages/ir/python/types.py` by hand.
