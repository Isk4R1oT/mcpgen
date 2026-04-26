# Stack Research — MCPGen

**Domain:** MCP server generation toolkit (OpenAPI 3.x → TypeScript Cloudflare Worker via Python LLM-orchestrated codegen)
**Researched:** 2026-04-26
**Overall confidence:** HIGH for locked items (verified against `docs/`), MEDIUM for new/implicit dependencies (verified via Context7 + official sources but pinned to current major lines, not exact patch versions)

---

## 0. Reading Order

This document has three audiences:

1. **Roadmap author / Phase 1 Foundation** → read § 1 (Locked-from-docs) + § 6 (Drift) first. Do not re-derive locked decisions.
2. **Engine workstream (Phase 2–5)** → § 2.1 (Python engine), § 2.2 (Implicit Python deps), § 6 (MCP TypeScript SDK v1 vs v2 drift — important).
3. **Runtime / Frontend / Ops workstreams** → § 1 + § 2.3–2.5 + § 4 (What NOT to use).

---

## 1. Locked from `docs/` — No decision needed

These are frozen by `docs/mcpgen-architecture.md` §4 and `docs/mcpgen-model-and-provider-override.md`. Do **not** re-evaluate without an explicit Key Decision entry in `PROJECT.md`.

### 1.1 Locked technology stack

| Layer | Technology | Pinned line | Hosting | Status | Confidence |
|---|---|---|---|---|---|
| Frontend framework | Next.js | 15.x (App Router) | Vercel | LOCKED — `docs/mcpgen-architecture.md` §4.1 | HIGH |
| Frontend styling | Tailwind CSS + shadcn/ui | Tailwind 4.x, shadcn `3.x` CLI | bundled with Vercel | LOCKED — UI is locked in `claude-design-ui/MCP-Gen.zip`; only wire-up | HIGH |
| CLI | TypeScript + Commander.js + Bun (single binary) | Commander 14.x, Bun 1.2.x | npm + GitHub releases | LOCKED — `docs/mcpgen-architecture.md` §4.1 | HIGH |
| Control Plane API | Hono on Bun runtime | Hono 4.x | Cloudflare Workers | LOCKED | HIGH |
| Generation Engine | Python 3.12 + FastAPI + PydanticAI | FastAPI 0.128.x, PydanticAI latest | Fly.io Machines (auto-suspend) | LOCKED — note: LiteLLM REMOVED per Override doc § 0 | HIGH |
| Generated MCP server runtime | TypeScript + `@modelcontextprotocol/sdk` | **see § 6 — v1 vs v2 drift critical** | CF Workers for Platforms | LOCKED | HIGH (lock) / MEDIUM (version) |
| OLTP DB | PostgreSQL 16 + pgvector + TimescaleDB | PG 16, pgvector 0.7+, Timescale 2.x | Neon | LOCKED | HIGH |
| Object Storage | R2 (S3-compatible) | n/a | Cloudflare | LOCKED | HIGH |
| Auth | Logto Cloud free tier (≤5K MAU) → self-host @ t+3mo | latest | Logto Cloud | LOCKED (with t+3mo migration plan) | HIGH |
| Background jobs | Inngest | latest TypeScript SDK | Inngest Cloud | LOCKED | HIGH |
| Billing | Stripe Billing + Meters API | stripe-node 19.x | Stripe | LOCKED | HIGH |
| LLM tracing | Langfuse v4 (OTel via PydanticAI/Logfire) | v4 | Langfuse Cloud free → self-host later | LOCKED — `send_to_logfire=False`, OTLP → Langfuse | HIGH |
| Error tracking | Sentry (TS + Python) | latest | Sentry Cloud | LOCKED | HIGH |
| Logs/uptime | BetterStack | n/a | BetterStack Cloud | LOCKED | HIGH |
| Email | Resend | resend-python 2.x, resend-node latest | Resend | LOCKED | HIGH |
| DNS / CDN | Cloudflare | n/a | Cloudflare | LOCKED | HIGH |
| ORM | Drizzle Kit | drizzle-kit 0.31.x, drizzle-orm 0.4x | — | LOCKED | HIGH |
| Build | Turborepo + pnpm | Turborepo 2.x, pnpm 9.x | — | LOCKED | HIGH |

### 1.2 Locked LLM model & provider (Override doc — single source of truth)

| Item | Decision | Source |
|---|---|---|
| Sole generation model | `qwen/qwen3-coder` (80B/3B-active sparse MoE, 256K ctx, non-thinking) | `docs/mcpgen-model-and-provider-override.md` § 0–1 |
| Sole generation provider | OpenRouter via `OpenAIProvider(base_url="https://openrouter.ai/api/v1")` | Override § 2 |
| PydanticAI integration pattern | `OpenAIModel("qwen/qwen3-coder", provider=OpenAIProvider(...))` | Override § 2.3 |
| F3 test agent EXCEPTION | Real Sonnet 4.7 (because F3 simulates production agent users — NOT generation pipeline) | Override § 7.1 + `docs/mcpgen-stage-f-design.md` |
| F2 multi-judge ENSEMBLE | Replaced by single Qwen3-Coder × 5-shuffle + temperature variance (T=0.0/0.2/0.5) = 15 evaluations/tool | Override § 4.2 |
| Cost per generation (target) | ~$0.10 without F3 / ~$0.13 with F3 (10–20× cheaper than original multi-model design) | Override § 5.1 |
| Env vars | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `PRIMARY_MODEL`, optional `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE` | Override § 2.2 |
| Sampling profiles | `creative` T=0.3 (Pass 2/3), `classification` T=0.0 (Pass 4 + F2), `codegen` T=0.2 (rare — Stage E is templates) | Override § 2.6 |
| Day-1 smoke test | MANDATORY before full implementation: verify Qwen3-Coder + PydanticAI structured outputs (function calling) work end-to-end | Override § 8 |
| Fallback model variant | `qwen/qwen3-30b-a3b-instruct` (if Qwen3-Coder function calling fails) | Override § 7.4 |

> **Reminder for the engine workstream:** any code, comment, or import referencing Sonnet 4.7 / Haiku 4.5 / Opus / GPT-5 / Gemini / LiteLLM in the engine pipeline is wrong by Override doc rule "при противоречии — побеждает этот файл." The only exception is the F3 test agent.

---

## 2. New / Implicit dependencies (libraries `docs/` doesn't name but implementation needs)

### 2.1 Python — Generation Engine (`apps/generation-engine`)

| Package | Pinned | Purpose | Why this one | Confidence |
|---|---|---|---|---|
| `pydantic` | 2.x (latest) | BaseModels for IR, ToolDescription, ResponseConfig, etc. | Already implicit — PydanticAI requires Pydantic 2; FastAPI 0.115+ requires Pydantic 2; the IR design in `docs/mcpgen-generation-engine-v2.md` § 5.2 uses Pydantic syntax. | HIGH (Context7 `/pydantic/pydantic`) |
| `pydantic-ai` | latest stable | Agent factory for all 6 LLM passes + F2 judge | Locked per Override doc; provides `OpenAIProvider`, structured outputs via function calling, tool registration. | HIGH (Override doc § 2) |
| `pydantic-settings` | 2.x | Typed env-var loading (`OPENROUTER_API_KEY`, etc.) | Idiomatic for Pydantic 2 projects; replaces ad-hoc `os.environ.get` per global rule "no generic types / no default parameter values." | HIGH |
| `fastapi` | 0.128.x | HTTP API for `POST /api/v1/generate` + SSE callbacks | Locked. Latest stable line per Context7. | HIGH |
| `uvicorn[standard]` | latest | ASGI server for FastAPI in Fly Machines | Standard FastAPI deployment; `[standard]` extra adds httptools + uvloop for perf. | HIGH |
| `httpx` | latest | Async HTTP client for OpenRouter calls (when needed outside PydanticAI) and webhooks | Override doc § 2.5 already references `httpx.AsyncClient` for custom OpenRouter analytics headers. | HIGH |
| `prance[osv]` | latest | OpenAPI 3.x parser + reference resolver for **Stage A (Parse & Normalize)** | `docs/mcpgen-architecture.md` §5.1 explicitly names "prance → RawIR + dependency_graph"; the `[osv]` extra wires in openapi-spec-validator. | HIGH |
| `openapi-spec-validator` | latest | Strict OpenAPI 3.0/3.1 schema validation pre-Stage-A | Used by prance under `[osv]` extra; also useable standalone for spec correctness check before paying for Stage A. | HIGH |
| `jsonref` | latest | `$ref` resolution if prance's resolver is insufficient (huge specs, mixed remote refs) | Backup for prance edge cases on giant specs (Stripe ~1000 endpoints); pure-Python so trivial install. | MEDIUM |
| `jinja2` | 3.1.x | **Stage E** template engine | `docs/mcpgen-stage-e-design.md` §0 explicitly: "Jinja2 templates + AST manipulation. No LLM calls." Use `SandboxedEnvironment` if any template inputs come from untrusted user spec content. | HIGH |
| `inngest` (Python) | latest | Drift Watcher cron functions (CTRL-03) | Inngest has Python SDK; same control-plane primitives as TS SDK. Use only if drift watcher runs in the engine. Otherwise drift watcher lives in the Hono control plane and this dep is not needed. | MEDIUM |
| `langfuse` + `opentelemetry-sdk` + `opentelemetry-exporter-otlp` | langfuse v4-compatible | Send LLM traces to Langfuse Cloud via OTLP | `docs/mcpgen-architecture.md` §11 mandates Langfuse v4 via OTel + `send_to_logfire=False`. | HIGH |
| `logfire` | latest, with `send_to_logfire=False` | OTel instrumentation wrapper for PydanticAI agents | PydanticAI's recommended observability path; works with `send_to_logfire=False` to forward to any OTLP backend (here: Langfuse). Confirmed in Override doc § 2 examples. | HIGH |
| `sentry-sdk` | 2.x (latest) | Python error tracking with source maps | Locked — `docs/mcpgen-architecture.md` §11. | HIGH |
| `tenacity` | latest | Retry decorator for OpenRouter calls | Aligns with global rule: "External API calls: retries with warnings, then raise the last error." | HIGH |
| `structlog` | latest | Structured logging with fields | Per global rule "Use structured logging fields, not interpolated strings." | HIGH |
| `gitleaks` (binary, NOT pip) | latest CLI | F1 secret scan of generated bundle before deploy | `docs/mcpgen-stage-f-design.md` §3.1 names gitleaks/TruffleHog explicitly. Install as binary in Fly machine image. | HIGH |
| `psycopg[binary,pool]` (psycopg3) | 3.x | Postgres driver for engine if engine writes generation metadata directly | If engine writes status/metrics to Neon, psycopg3 is the modern standard (psycopg2 is legacy). If only Hono control plane writes DB, this dep is not needed. | MEDIUM (depends on architecture decision: who writes generations table?) |
| `aioboto3` | latest | S3-compatible client for **R2** uploads (artifacts, transcripts) | R2 is S3-compatible; aioboto3 fits async FastAPI better. Alternative: `httpx` direct against R2 presigned URLs. | MEDIUM |
| `anthropic` (optional) | latest | F3 test agent (Sonnet 4.7) — the only Anthropic-direct dep | F3 evaluator uses real Sonnet 4.7 per Override doc § 7.1. PydanticAI can also drive Anthropic via its Anthropic provider — preferred. So this raw SDK is only a fallback. | LOW |

**Build/test:**

| Package | Purpose | Notes |
|---|---|---|
| `uv` | Python package manager (replaces pip+poetry+pip-tools) | 10–100× faster, lockfile-based. Pin to `uv 0.5+`. |
| `ruff` | Linter + formatter (replaces flake8/black/isort) | One tool, fast. |
| `mypy --strict` | Static type checker | Required by global rule "Use strict typing everywhere." |
| `pytest` + `pytest-asyncio` + `pytest-httpx` | Test runner + async support + HTTP mocking | Standard. `pytest-httpx` is for mocking external upstreams in unit tests; integration tests must hit real Neon dev branch (per `PROJECT.md` Out-of-Scope). |

### 2.2 TypeScript — Tenant Workers (Stage E codegen output) and `@mcpgen/runtime` SDK

These are libraries that the **generated** Worker imports. The Stage E Jinja2 templates emit `package.json` files referencing these.

| Package | Pinned | Purpose | Why | Confidence |
|---|---|---|---|---|
| `@modelcontextprotocol/sdk` | **see § 6 — choose v1.x or v2.x explicitly** | MCP server protocol implementation | Locked. **Drift risk** — v1 vs v2 migration is breaking. | HIGH (lock) / MEDIUM (version choice) |
| `zod` | 4.x (or 3.24+ if pinning v1 SDK) | Input/output schema definitions in `schemas/inputs.ts` and `schemas/outputs.ts` | MCP TypeScript SDK v2 requires Standard Schema spec — Zod is the canonical implementation. Stage E template `inputs.ts.j2` emits Zod schemas. | HIGH |
| `@cloudflare/workers-oauth-provider` | latest | OAuth 2.1 mode for tenant Workers (RUN-05) | Locked — `PROJECT.md` RUN-05. The Cloudflare-supported OAuth 2.1 provider for Workers with PKCE. | HIGH |
| `@mcpgen/runtime` (internal package) | 0.1.x | Smart-ID parser, pagination, truncation, upstream HTTP client, response shaping | Stage E templates reference this; must exist as a workspace package in `packages/runtime-sdk/`. | HIGH |
| `hono` | 4.x | If a tenant Worker needs HTTP routing beyond pure MCP transport | Optional — most tenant Workers should use raw Workers `fetch` handler + MCP SDK. | MEDIUM |

**Generated server `devDependencies`** (added by Stage E template `package.json.j2`):

| Package | Pinned | Purpose |
|---|---|---|
| `wrangler` | 4.x | CF Workers deployment + tsc orchestration (Stage E §6 phase 6 calls `tsc --noEmit`) |
| `typescript` | 5.6+ | Required for `tsc --noEmit` validation in F1 |
| `@cloudflare/workers-types` | latest | Type defs for Workers runtime |
| `vitest` | 1.x | Stage E generates `tests/smoke.ts` — vitest is the de facto test runner in modern TS projects |

### 2.3 TypeScript — Control Plane (`apps/api`)

| Package | Pinned | Purpose | Confidence |
|---|---|---|---|
| `hono` | 4.x | BFF on CF Workers | HIGH |
| `@hono/zod-validator` | latest | Validate `POST /api/v1/generate` body | HIGH |
| `inngest` | latest TS SDK | Drift watcher cron + usage event consumer | HIGH |
| `drizzle-orm` + `drizzle-kit` | 0.4x / 0.31.x | Neon Postgres ORM | HIGH |
| `@neondatabase/serverless` | latest | Neon edge-compatible Postgres driver (CF Workers don't have raw TCP) | HIGH |
| `stripe` | 19.x | Billing + Meters API | HIGH |
| `@logto/node` or `@logto/next` | latest | Server-side Logto client for session validation | HIGH |
| `@sentry/cloudflare` | latest | Sentry on CF Workers (must use this, not `@sentry/node`) | HIGH |
| `ajv` | 8.17.x | JSON Schema validation in F1 (used inside engine, but also if control plane validates incoming spec metadata) | HIGH |
| `ajv-formats` | 3.x | Common formats (uri, email, date-time) for F1 ajv checks | HIGH |

### 2.4 TypeScript — Frontend (`apps/web`)

UI is **locked**. These are wire-up dependencies only — the design ships in `claude-design-ui/MCP-Gen.zip`.

| Package | Pinned | Purpose | Confidence |
|---|---|---|---|
| `next` | 15.x | Framework (locked to 15; see § 6 for 16 drift) | HIGH (lock) |
| `react` + `react-dom` | 19.x | UI runtime; matches Next 15 | HIGH |
| `tailwindcss` | 4.x | Styling; ships in zip | HIGH |
| `@tanstack/react-query` | 5.x | Server state for `/api/v1/generate` job polling | MEDIUM |
| `eventsource-parser` | 3.x | Parse SSE stream from control plane (per-stage callbacks) | MEDIUM (or use native `EventSource` API; `eventsource-parser` is needed when consuming SSE inside a `fetch()` body, e.g., from server actions) |
| `next-themes` | latest | If `claude-design-ui` includes dark mode toggles | LOW (depends on what's in the zip) |

### 2.5 TypeScript — CLI (`apps/cli`)

| Package | Pinned | Purpose | Confidence |
|---|---|---|---|
| `commander` | 14.x | CLI framework | HIGH |
| `@clack/prompts` | 0.x | Modern interactive prompts (replaces `inquirer`/`prompts` for solo-friendly DX) | MEDIUM |
| `picocolors` | 1.x | ANSI colors (1KB; replaces chalk) | HIGH |
| `ora` | 8.x | Spinners during generation | MEDIUM |
| `bun` build target | latest | `bun build --compile` produces single binary | HIGH |

### 2.6 Cross-cutting tooling

| Tool | Purpose | Notes | Confidence |
|---|---|---|---|
| `gitleaks` | F1 secret scan + pre-commit hook (Git Workflow Rules) | Run BOTH at commit time AND in F1 stage of pipeline. Don't conflate. | HIGH |
| `pre-commit` (Python framework) | Git hook orchestrator across TS + Python repos | `docs/mcpgen-git-workflow-rules.md` mandates pre-commit hooks NEVER bypassed. | HIGH |
| `conventional-pre-commit` | Validate Conventional Commits 1.0 commit messages | Mandated by git workflow rules | HIGH |
| `lefthook` (alt) | Faster pre-commit (Go-based) | Optional swap if `pre-commit` Python startup is too slow on the AI-agent worktree pattern | LOW |
| `esbuild` | Inside Bun-based CLI bundling; also explicit if any CF Worker needs custom bundle | Bun uses esbuild under the hood; rarely invoked directly. | MEDIUM |
| `tsx` | Run TS scripts in dev (e.g., one-off migration scripts) | Lightweight alternative to `ts-node`; works on Bun and Node | MEDIUM |
| `dotenvx` | Encrypted `.env` for shared dev secrets (optional) | Alternative to plain `.env` files; only if multi-machine dev needs to share keys without 1Password | LOW |

---

## 3. Installation snippets

### 3.1 Python engine (`apps/generation-engine/pyproject.toml`)

```bash
# Use uv (NOT pip / poetry / pipenv per global rule "managed services > self-host")
uv add fastapi 'uvicorn[standard]' pydantic 'pydantic-ai' 'pydantic-settings' httpx \
       prance 'openapi-spec-validator' jinja2 \
       langfuse logfire opentelemetry-sdk opentelemetry-exporter-otlp \
       sentry-sdk tenacity structlog \
       'psycopg[binary,pool]' aioboto3
uv add --dev ruff mypy pytest pytest-asyncio pytest-httpx
# gitleaks: install via brew/binary (not pip)
brew install gitleaks  # macOS dev
# in Fly Machine Dockerfile: COPY --from=zricethezav/gitleaks:latest /usr/bin/gitleaks /usr/local/bin/
```

### 3.2 TypeScript control plane (`apps/api/package.json`)

```bash
pnpm add hono @hono/zod-validator zod \
         drizzle-orm @neondatabase/serverless \
         stripe inngest \
         @logto/node \
         @sentry/cloudflare \
         ajv ajv-formats
pnpm add -D drizzle-kit wrangler typescript @cloudflare/workers-types vitest
```

### 3.3 Generated tenant Worker template (`packages/codegen-templates/package.json.j2`)

```bash
# These are emitted into the generated Worker's package.json:
pnpm add @modelcontextprotocol/sdk zod @mcpgen/runtime
# OAuth mode only:
pnpm add @cloudflare/workers-oauth-provider
# Dev:
pnpm add -D wrangler typescript @cloudflare/workers-types
```

### 3.4 CLI (`apps/cli/package.json`)

```bash
pnpm add commander @clack/prompts picocolors ora
pnpm add -D bun typescript
# Build single binary:
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile mcpgen
```

---

## 4. What NOT to use (and why)

| Avoid | Why | Use instead | Confidence |
|---|---|---|---|
| **LiteLLM** | Replaced per `docs/mcpgen-model-and-provider-override.md` § 0. Single Qwen via OpenRouter is the only path. Any code referencing LiteLLM is wrong by override-doc precedence. | `OpenAIProvider(base_url="https://openrouter.ai/api/v1")` directly via PydanticAI. | HIGH |
| **Anthropic SDK / OpenAI SDK / Google Gemini SDK** in generation passes | All non-Qwen providers explicitly removed from generation pipeline. | PydanticAI + OpenRouter (single provider). Exception: F3 test agent may use Anthropic via PydanticAI's Anthropic provider — that's a TEST agent, not generation. | HIGH |
| **multi-family judge ensemble** (Sonnet + GPT-5 + Gemini in F2) | Replaced by single Qwen × 5-shuffle + temperature variance per Override doc § 4. | Single Qwen judge with prompt shuffling and `[T=0.0, 0.2, 0.5]` temperature variance = 15 evals/tool. | HIGH |
| **Code Mode** (Cloudflare's `search()`/`execute()` sandbox-eval pattern) | Explicitly rejected in `docs/mcpgen-stage-e-design.md` §1.2: Six-Tool Pattern delivers Code-Mode-level token efficiency at the structural level without runtime code execution complexity. | Native MCP tools per stage E design. | HIGH |
| **Poetry / pip / pipenv** | Slow. Solo-founder ops principle: time > tool savings. | `uv` (10–100× faster, lockfile-based, drop-in for pip workflows). | HIGH |
| **flake8 / black / isort** (separate tools) | Three deps where one suffices. | `ruff` (replaces all three; format + lint single tool). | HIGH |
| **psycopg2** | Legacy; no async; deprecated for new projects. | `psycopg` (psycopg3) with `[binary,pool]` extras. | HIGH |
| **chai / mocha / jest** for new TS code | Slow startup, complex config; the AI-agent workflow needs fast feedback loops. | `vitest` (TS-native, fast, Jest-compatible API). | MEDIUM |
| **`@modelcontextprotocol/server` (the v2 package name)** if you intend to ship v1 syntax | The package was renamed in v2. v1 is `@modelcontextprotocol/sdk`. Picking the wrong one causes silent template breakage when Stage E's Jinja2 emits v1 imports against a v2-installed package. | Pin one major line explicitly in `packages/codegen-templates/package.json.j2` and in the generated Workers' `package.json`. See § 6. | HIGH |
| **`inquirer`** in CLI | Slow startup, large install. | `@clack/prompts` (modern, minimal, async-first). | MEDIUM |
| **chalk** | Heavy compared to alternatives. | `picocolors`. | HIGH |
| **Vercel Pages serverless functions** for the engine | Engine is Python + long-running (Stage F3 takes 1–3 min). Vercel serverless 60-second cap kills it. | Fly.io Machines auto-suspend (locked). | HIGH |
| **dependabot's auto-update for `@modelcontextprotocol/sdk`** in the codegen template | An auto-bumped major version silently breaks every previously-deployed tenant Worker on regenerate. Stage E's Jinja2 template ships the version pin. | Pin major line explicitly; bump in deliberate `chore: bump mcp-sdk to vN` PR with regression run on all golden APIs. | HIGH |
| **Logging spec contents** | Hard rule from `docs/mcpgen-architecture.md` §11 + privacy-LOCKED constraint in `PROJECT.md`. | Log: generation metadata, tool names, IR structure, performance metrics, error traces. NEVER: spec text, upstream API responses, upstream credentials. | HIGH |
| **`Any` / `unknown` / `Dict[str, Any]`** in Python engine | Global rule: "No generic types: `Any`, `unknown`, `Dict[str, Any]`." | Pydantic `BaseModel` subclasses for everything; `TypedDict` for inline structures. | HIGH |

---

## 5. Stack patterns by component

### 5.1 Engine pass (Python) pattern

```python
# Locked: PydanticAI agent factory per Override doc § 2.4
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings
import os

PROVIDER = OpenAIProvider(
    base_url=os.environ["OPENROUTER_BASE_URL"],
    api_key=os.environ["OPENROUTER_API_KEY"],
)
MODEL = OpenAIModel("qwen/qwen3-coder", provider=PROVIDER)

class ToolDescription(BaseModel):
    purpose: str
    when_to_use: list[str]
    when_not_to_use: list[str] | None
    how_to_use: str | None
    limitations: list[str]
    parameter_overview: str

PASS_2_AGENT = Agent(
    model=MODEL,
    output_type=ToolDescription,
    system_prompt="...",  # from docs/mcpgen-pass-2-design.md
)

CREATIVE = ModelSettings(temperature=0.3, top_p=0.9, max_tokens=2048)

async def author_description(tool_context: ToolContext) -> ToolDescription:
    result = await PASS_2_AGENT.run(
        format_tool_context(tool_context),
        model_settings=CREATIVE,
    )
    return result.output
```

### 5.2 Stage E template emit (Jinja2)

```python
# Locked: 100% deterministic, no LLM
from jinja2 import Environment, FileSystemLoader, select_autoescape

env = Environment(
    loader=FileSystemLoader("packages/codegen-templates"),
    autoescape=select_autoescape(),
    trim_blocks=True,
    lstrip_blocks=True,
)

template = env.get_template("tool_search.ts.j2")
rendered = template.render(tool=tool, server_config=server_config)
```

### 5.3 Generated tenant Worker boilerplate (TS)

```typescript
// Pinned to v2 syntax — see § 6 to confirm choice
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";  // path may differ in v2
import { z } from "zod";

const server = new McpServer({ name: "stripe-mcp", version: "1.0.0" }, {});

server.registerTool(
  "fetch",
  {
    title: "Fetch",
    description: /* from Pass 2 */,
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({ id: z.string(), object_type: z.string(), data: z.record(z.unknown()) }),
  },
  async ({ id }) => {
    // Stage E generated handler
  }
);
```

---

## 6. Drift / verify-needed before Phase 1 ends

These are items where `docs/` may be stale relative to 2026-04-26 ecosystem reality. **Read these before pinning versions in `package.json` / `pyproject.toml`.**

### 6.1 CRITICAL — `@modelcontextprotocol/sdk` v1 vs v2

**Evidence (Context7 `/modelcontextprotocol/typescript-sdk`):**

The TypeScript MCP SDK has shipped v2 with **breaking changes** that affect every Stage E template. Migration items the generator must pick a side on:

| v1 pattern (what `docs/mcpgen-stage-e-design.md` shows) | v2 pattern (current) | Impact on Stage E |
|---|---|---|
| `server.tool("name", description, schema, handler)` | `server.registerTool("name", { title, description, inputSchema, outputSchema }, handler)` | Templates `tool_*.ts.j2` rewrite required |
| Raw object shape `{ name: z.string() }` accepted | Standard Schema spec required — wrap with `z.object({ ... })` | Templates updating |
| `setRequestHandler(InitializeRequestSchema, ...)` | `setRequestHandler('initialize', ...)` | Handler templates updating |
| Manual `CfWorkerJsonSchemaValidator` config in CF Workers | Auto-selected by runtime; explicit config optional | One config block can be removed |
| Package import `@modelcontextprotocol/sdk` | New package alias `@modelcontextprotocol/server` (v2) | Imports must be aligned |

**Recommendation (HIGH confidence, MEDIUM on which version):**

- **Pin v1** (`@modelcontextprotocol/sdk@^1.x`) for MVP — `docs/mcpgen-stage-e-design.md` examples are written against v1, and v1 is still actively documented.
- **OR pin v2** if Phase 2 starts after the MCP TS SDK v2 ecosystem is healthy — matches MCP spec 2025-06-18 outputSchema better and has runtime auto-detection. Picking v2 means a one-time rewrite of all 9 Stage-E `tool_*.ts.j2` templates.
- Either way: **pin the major line** in both the codegen template's `package.json.j2` AND `packages/runtime-sdk/package.json` so they cannot drift apart. Bumps go through deliberate PRs with all golden-APIs regression.

**Decision needed:** add to `PROJECT.md` Key Decisions before Phase 2 (Engine workstream) starts.

### 6.2 Next.js 15 → 16

**Evidence:** Next.js current line is 16.x; the architecture doc pins Next.js 15.

**Recommendation:** Stay on **Next.js 15.x for MVP** because:
1. UI is LOCKED in `claude-design-ui/MCP-Gen.zip` — that zip was prepared against Next.js 15.
2. Frontend phase is wire-up only; no incentive to bump the framework mid-build.
3. Next 16 is a minor risk surface for solo-founder operating principle "no premature optimization."

Bump to 16 post-launch as a `chore: bump next` PR.

### 6.3 Drizzle Kit version line

**Recommendation:** Pin `drizzle-kit ^0.31.x` and `drizzle-orm ^0.4x.x`. These are the current stable lines. Confirm in Phase 1 Ops track before locking the schema migration contract (W1 contract freeze per implementation plan §11.4).

### 6.4 PydanticAI rate of change

**Recommendation:**
- Pin PydanticAI in `pyproject.toml` to a specific version (e.g., `pydantic-ai==0.x.y`) at Day-1 smoke test. Do not float the version.
- The Day-1 smoke test from Override § 8 must be expanded to also verify:
  1. `OpenAIProvider(base_url=...)` accepts custom OpenRouter endpoint.
  2. Structured outputs via function calling work for Qwen3-Coder.
  3. `model_settings=CREATIVE_SETTINGS` actually propagates to OpenRouter (some providers ignore some sampling params).

### 6.5 MCP spec 2025-06-18 vs 2025-03-26 — **NOT drift, but emphasize**

`docs/` consistently references both:
- **2025-03-26** for tool annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`)
- **2025-06-18** for outputSchema standard

**Both are required.** Stage E templates and F1 protocol-compliance check must both pass. This is not drift — it is the explicit MCP target stated in `PROJECT.md` Constraints.

### 6.6 Hono 4.x — confirm SSE streaming pattern

**Recommendation:** During Phase 1 Foundation, validate Hono's `streamSSE` helper handles long-lived connections on CF Workers without hitting the 30s sub-request limit. If not, fall back to:
- Writing SSE callbacks to Inngest events and having frontend subscribe to a separate /stream endpoint.
- Or: use CF Workers Durable Objects for state + WebSocket fanout.

Confidence: MEDIUM — likely fine, but worth a 30-minute spike before contract freeze.

### 6.7 Bun build target for CLI binary

**Recommendation:** Pin Bun to `^1.2`. Cross-compile targets needed: `bun-linux-x64`, `bun-darwin-arm64`, `bun-darwin-x64`, `bun-windows-x64`. Confirm during Phase 1 `apps/cli` scaffold that all four targets build on one machine.

### 6.8 LangFuse v4 OTLP endpoint URL format

**Recommendation:** Use `OPENTELEMETRY_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel` with basic-auth headers `Authorization: Basic base64(<public-key>:<secret-key>)`. Validate during Phase 1 ops scaffold by sending a test span and checking it appears in Langfuse Cloud UI.

### 6.9 Confirm `@modelcontextprotocol/python-sdk` is NOT on the engine

**Action:** The engine **emits** TypeScript MCP servers. The engine itself does **not** import `mcp` Python package. If a developer accidentally adds `mcp` (Python) to `apps/generation-engine/pyproject.toml`, that's a smell — flag in code review.

---

## 7. Version compatibility notes

| Pair | Constraint | Source |
|---|---|---|
| `next@15` × `react@19` | Next 15 ships React 19 canary built-in; React 19 is required for Server Components patterns the locked design uses | Context7 |
| `pydantic@2` × `pydantic-ai@*` × `fastapi@0.128` | All Pydantic-2-only; do not import or pin Pydantic 1 anywhere | Context7 |
| `@modelcontextprotocol/sdk@1.x` × `zod@3.x` | v1 SDK accepts raw object shapes (Zod 3 still works) | Context7 migration doc |
| `@modelcontextprotocol/sdk@2.x` × `zod@4.x` | v2 SDK requires Standard Schema; Zod 4 is the smoothest fit | Context7 migration doc |
| `wrangler@4` × `@cloudflare/workers-types@latest` | Always upgrade together | Cloudflare docs convention |
| `drizzle-orm@0.4x` × `@neondatabase/serverless@latest` | Drizzle has a `neon-http` adapter for edge runtimes — required, not optional, in CF Workers | Context7 |
| `bun@1.2` × `commander@14` | Bun's Node compat covers Commander cleanly; no shims needed | Context7 |
| `langfuse-python` × `opentelemetry-sdk@1.x` | Langfuse v4 expects OTel SDK 1.x for trace export | Context7 |
| `prance` × `openapi-spec-validator` | Use `prance[osv]` extra to bind compatible versions automatically; do not pin them independently | prance docs |
| `jinja2@3.1` × Python 3.12 | Fully compatible; 3.1 is the active maintenance line | Context7 |
| `httpx@0.27+` × `pydantic-ai@*` | PydanticAI uses httpx internally; if you instantiate your own `httpx.AsyncClient` for OpenRouter analytics headers, do not pin a different httpx major than PydanticAI | Override doc |

---

## 8. Sources

### Context7 (HIGH confidence — current as of 2026-04)

- `/vercel/next.js` — confirmed Next.js current is 16.x line; v15.x still active
- `/websites/hono_dev` + `/llmstxt/hono_dev_llms-full_txt` — Hono 4.x for CF Workers
- `/fastapi/fastapi` — versions through 0.128.0
- `/pydantic/pydantic` — Pydantic 2.x current
- `/pydantic/logfire` — Logfire OTel wrapper for PydanticAI
- `/modelcontextprotocol/typescript-sdk` — **v1.x and v2.x both exist; v2 is breaking** (critical drift, see § 6.1)
- `/modelcontextprotocol/python-sdk` — v1.12.4 (supports outputSchema; engine doesn't import this)
- `/colinhacks/zod` — Zod v3.24.2 / v4.0.1
- `/ajv-validator/ajv` — v8.17.1
- `/ajv-validator/ajv-formats` — v3.0.1
- `/cloudflare/workers-oauth-provider` — current; OAuth 2.1 + PKCE
- `/cloudflare/wrangler-action` — Wrangler 4.x line
- `/drizzle-team/drizzle-orm` — drizzle-kit 0.31.5
- `/oven-sh/bun` — Bun 1.2.x current
- `/tj/commander.js` — Commander 14.x
- `/inngest/inngest-js` — current TS SDK
- `/stripe/stripe-node` — v19.1.0
- `/langfuse/langfuse-python` — v4 OTel-native
- `/getsentry/sentry-python` + `/getsentry/sentry-javascript` — current
- `/pallets/jinja` — Jinja2 3.1.x; SandboxedEnvironment available
- `/encode/httpx` — current
- `/kludex/uvicorn` — current
- `/python-openapi/openapi-spec-validator` — current
- `/websites/prance_readthedocs_io_en` — prance for OpenAPI parsing
- `/pgvector/pgvector` + `/pgvector/pgvector-python` — current
- `/timescale/timescaledb` — current
- `/gitleaks/gitleaks` — current
- `/evanw/esbuild` — current
- `/vercel/turborepo` — Turborepo 2.x line
- `/oai/openapi-specification` — OAS 3.0.4 / 3.1.1 current
- `/shadcn-ui/ui` — shadcn 3.5.0 / 3.2.1 current

### Repository sources of truth (HIGH confidence — locked)

- `/Users/igor/Projects/mcpgen/docs/mcpgen-architecture.md` § 4 — locked stack table
- `/Users/igor/Projects/mcpgen/docs/mcpgen-model-and-provider-override.md` — single-LLM override (overrides every other doc on models)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-stage-e-design.md` — Stage E template inventory + auth modes
- `/Users/igor/Projects/mcpgen/docs/mcpgen-stage-f-design.md` — F1 tooling (tsc/ajv/gitleaks)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-pass-{0,1,2,3,4,5}-design.md` — pass-level engine implementation
- `/Users/igor/Projects/mcpgen/docs/mcpgen-gsd-sprint-plan.md` — workstream layout (engine / runtime / ops / frontend / main)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-git-workflow-rules.md` — pre-commit hook constraints
- `/Users/igor/Projects/mcpgen/.planning/PROJECT.md` — REQUIREMENTS + LOCKED CONSTRAINTS

---

*Stack research for: MCP server generation toolkit (MCPGen)*
*Researched: 2026-04-26*
*Next milestone touchpoint: Phase 1 Foundation contract freeze (end W1 of GSD sprint plan) — at that point pin all `package.json` / `pyproject.toml` versions cited above and resolve § 6.1 (MCP SDK v1 vs v2) via Key Decision in `PROJECT.md`.*
