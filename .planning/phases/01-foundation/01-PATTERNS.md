# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 38 file groups across 4 directories (apps, packages, infrastructure, tooling)
**Analogs found:** 38 / 38 (all greenfield → external canonical analogs)

> ⚠ **Greenfield context.** No in-repo analogs exist. Every file in Phase 1 is the **first instance** of its kind in this repo. Each row below identifies (a) the upstream canonical reference the file MUST be modeled on, (b) the in-repo "first instance" obligation that downstream files of the same role MUST mirror, and (c) a concrete excerpt (≤30 lines) from the canonical doc.

---

## File Classification

### Apps (empty-but-deployable scaffolds)

| New File / Group | Role | Data Flow | Canonical Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/` | Frontend SSR app | request-response (no API yet) | `claude-design-ui/MCP-Gen.zip` (UI LOCKED) + Next.js 15 App Router conventions | exact (UI is shipped) |
| `apps/api/` | BFF / Gateway (CF Worker) | request-response + SSE streaming | `docs/mcpgen-architecture.md` §5.8 + RESEARCH Pattern 2 + Pattern 3 (Hono `streamSSE`) | exact (frozen contract source) |
| `apps/dispatch/` | Dispatch Worker (CF Workers for Platforms) | request-response (edge) | `docs/mcpgen-architecture.md` §6.1 + RESEARCH Pattern 4 (CF WfP namespace) | exact |
| `apps/dispatch-sample/` | **Reference shape** for tenant Workers (hand-coded Stripe sample) | request-response (MCP JSON-RPC) | `docs/mcpgen-stage-e-design.md` §2 (file tree) + §4.1 (`fetch` tool) + RESEARCH "Stripe-sample tenant Worker stub" | exact |
| `apps/generation-engine/` | LLM orchestration backend (FastAPI) | request-response + callback POST | `docs/mcpgen-architecture.md` §5.8 + `docs/mcpgen-model-and-provider-override.md` §2.3 (PydanticAI + OpenRouter) | exact |
| `apps/generation-engine/tests/smoke_test_qwen.py` | Day-1 LLM smoke test | request-response (single LLM call) | `docs/mcpgen-model-and-provider-override.md` §8 + RESEARCH Pattern 8 | exact |
| `apps/cli/` | CLI binary (Bun-compiled) | request-response (wraps `POST /api/v1/generate`) | Commander.js + Bun `--compile` matrix + RESEARCH Pattern 11 | exact |
| `apps/docs/` | Mintlify scaffold | static-site | Mintlify starter (industry standard) | role-match |

### Packages (5 frozen contracts + supporting libs)

| New File / Group | Role | Data Flow | Canonical Analog | Match Quality |
|---|---|---|---|---|
| `packages/ir/src/types.ts` | **Frozen contract #1**: Universal IR (Zod source) | type-only (no runtime) | `docs/mcpgen-generation-engine-v2.md` §5.2 + RESEARCH "Zod IR source skeleton" | exact |
| `packages/ir/python/types.py` | Generated Pydantic 2 mirror (committed) | type-only (no runtime) | `datamodel-code-generator` v2 default output template | exact (codegen) |
| `packages/ir/scripts/codegen.ts` | Zod → JSON Schema → Pydantic codegen | batch transform | RESEARCH §"Cross-Language IR Codegen Pipeline" 4-step table | exact |
| `packages/contracts/src/generation-api.ts` | **Frozen contract #2**: Generation API + SSE envelope | type-only | `docs/mcpgen-architecture.md` §5.8 + D-09/D-10 + RESEARCH Pattern 1 | exact |
| `packages/contracts/src/usage-event.ts` | **Frozen contract #3**: usage event shape | type-only | `docs/mcpgen-architecture.md` §7.2 + §10.2 (Stripe Meters dimensions) | exact |
| `packages/contracts/src/launch-criteria.ts` | **Frozen contract #4**: F2/F3/bundle thresholds (immutable runtime constants) | constant-export | RESEARCH "launch-criteria.ts — D-13 runtime constants" + `docs/mcpgen-implementation-plan.md` §11.7 | exact |
| `packages/contracts/src/db-types.ts` | DB type re-exports from Drizzle schema | type-only | Drizzle ORM `$inferSelect` / `$inferInsert` pattern (canonical) | exact |
| `packages/runtime-sdk/src/index.ts` | **Frozen contract #5**: tenant Worker SDK interface | interface-only stub | `docs/mcpgen-stage-e-design.md` §3.3 (runtime/infra templates) + §5 (auth modes) + §6 (smart_id runtime) | exact |
| `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` | Hand-crafted IR + FinalTool[] + QualityReport JSON (5 sets) | static JSON | `docs/mcpgen-pass-5-design.md` §"FinalTool" output shape + `docs/mcpgen-stage-f-design.md` §"Quality Report" | exact |
| `packages/codegen-templates/` | Jinja2 templates skeleton (populated Phase 4) | template-render | `docs/mcpgen-stage-e-design.md` §3 (template inventory) | exact |
| `packages/shared-config/` | ESLint, Prettier, tsconfig presets | config-export | Standard pnpm monorepo `shared-config` package pattern | exact |
| `packages/ui/` | Shared shadcn-style components (mostly empty Phase 1) | component | shadcn/ui `components/ui/` convention (UI lives in `apps/web/src/`) | role-match |

### Infrastructure (account scaffolding + IaC)

| New File / Group | Role | Data Flow | Canonical Analog | Match Quality |
|---|---|---|---|---|
| `infrastructure/neon/migrations/20260427000000_init_schema.sql` | First Drizzle migration (timestamp-prefix) | schema-DDL | `docs/mcpgen-architecture.md` §7.1 + §7.2 + RESEARCH Pattern 5 (Drizzle `prefix: 'timestamp'`) | exact |
| `infrastructure/neon/drizzle.config.ts` | Drizzle Kit config | config-export | RESEARCH Pattern 5 (drizzle-kit canonical config shape) | exact |
| `infrastructure/cloudflare/wrangler.shared.toml` | Shared wrangler base | config-export | Cloudflare wrangler v4 docs + RESEARCH Pattern 2 + Pattern 4 | exact |
| `apps/{api,dispatch,dispatch-sample}/wrangler.toml` | Per-app wrangler configs | config-export | `docs/mcpgen-architecture.md` §6.1 (Workers for Platforms) + RESEARCH Pattern 2 | exact |
| `infrastructure/fly/fly.toml` | Engine deploy config | config-export | Fly.io Machines official `fly.toml` schema | exact |
| `infrastructure/inngest/functions/` | Empty stubs | event-driven (cron + queue) | Inngest TS SDK function definition pattern (D-03 Drift Watcher will populate Phase 8) | exact |
| `infrastructure/logto/README.md` | Self-host migration runbook | doc-only | RESEARCH Pattern 13 (Logto Cloud free-tier scaffolding + self-host steps) | exact |

### Tooling / repo root

| New File / Group | Role | Data Flow | Canonical Analog | Match Quality |
|---|---|---|---|---|
| `package.json` (root) | pnpm workspace root | config-export | Turborepo official monorepo example (`turbo/examples/basic`) | exact |
| `pnpm-workspace.yaml` | Workspace globs | config-export | pnpm v10 workspace docs | exact |
| `turbo.json` | Turborepo task graph | config-export | Turborepo v2 official `turbo.json` reference | exact |
| `tsconfig.base.json` | Root TS config | config-export | TypeScript v6 strict-mode defaults | exact |
| `.pre-commit-config.yaml` | Hook orchestration | event-driven (git hook) | RESEARCH Pattern 6 (full config) | exact |
| `.pre-commit-hooks/no-fourth-namespace.sh` | D-08 enforcement (≤ 3 CF dispatch namespaces) | local-script | RESEARCH Pattern 6 `cf-namespace-guard` local hook entry | exact |
| `.pre-commit-hooks/launch-criteria-paired-decision.sh` | D-13 enforcement (paired decision-log entry) | local-script | RESEARCH Pattern 6 `launch-criteria-guard` local hook entry | exact |
| `.github/workflows/main-ci.yml` | Aggregator + commit-lint | CI pipeline | RESEARCH Pattern 7 (full workflow) | exact |
| `.github/workflows/{engine,runtime,frontend,ops}-ci.yml` | Per-workstream CI | CI pipeline | RESEARCH Pattern 7 (engine job template) | exact |
| `.github/workflows/contract-codegen-check.yml` | D-02 enforcement (IR Pydantic codegen freshness) | CI pipeline | RESEARCH Pattern 7 (`pnpm --filter @mcpgen/ir codegen --check` step) | exact |
| `.gitleaks.toml` | Secret scan rules | config-export | `gitleaks` v8 official `gitleaks.toml` defaults | exact |
| `.commitlintrc.json` | CI commit-message rules | config-export | `@commitlint/config-conventional` defaults (D-20 paired with `conventional-pre-commit`) | exact |

---

## Pattern Assignments

### `apps/api/` (BFF entrypoint, Hono on CF Workers)

**Canonical analog:** `docs/mcpgen-architecture.md` §5.8 (HTTP API contract) + RESEARCH Pattern 2 (wrangler.toml binding) + Pattern 3 (Hono `streamSSE` spike).

**Imports/initialization shape** (must follow):

```typescript
// apps/api/src/index.ts (first instance — Phase 8 fills handlers)
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Sentry } from '@sentry/cloudflare';
import { drizzle } from 'drizzle-orm/neon-http';
import { GenerationSseEvent } from '@mcpgen/contracts/generation-api';

type Bindings = { HYPERDRIVE: Hyperdrive; SENTRY_DSN: string };
const app = new Hono<{ Bindings: Bindings }>();

app.post('/api/v1/generate', async (c) => {
  // Phase 1: 501 Not Implemented; contract is frozen
  return c.json({ error: 'not_implemented_phase_8' }, 501);
});

app.get('/api/v1/jobs/:id/stream', (c) => streamSSE(c, async (stream) => {
  // Last-Event-ID resume per D-09
}));

export default Sentry.withSentry(() => ({ dsn: c.env.SENTRY_DSN }), app);
```

**SSE envelope pattern** (frozen — `packages/contracts/src/generation-api.ts`, RESEARCH Pattern 1 verbatim):

```typescript
import { z } from 'zod';

export const GenerationStage = z.enum([
  'A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed', 'failed',
]);

export const GenerationSseEvent = z.object({
  job_id: z.string().regex(/^gen_[0-9A-HJKMNP-TV-Z]{26}$/),  // ULID + operation prefix (D-11)
  event_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),    // monotonic ULID per generation
  stage: GenerationStage,
  status: z.enum(['started', 'completed', 'error']),
  partial_result: z.record(z.unknown()).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retry_after_seconds: z.number().int().nonnegative().optional(),
  }).optional(),
});
```

**wrangler.toml binding pattern** (Hyperdrive + source maps, RESEARCH Pattern 2):

```toml
# apps/api/wrangler.toml
name = "mcpgen-api"
main = "src/index.ts"
compatibility_date = "2026-04-24"
compatibility_flags = ["nodejs_compat"]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<set-via-`wrangler hyperdrive create`>"

upload_source_maps = true   # FND-10 → Sentry source-map upload (D-19)
```

**First-instance note:** This is the first `wrangler.toml` in the repo. Every subsequent CF Worker (`apps/dispatch/wrangler.toml`, `apps/dispatch-sample/wrangler.toml`) MUST mirror: (a) `compatibility_date` ≥ 2026-04-24, (b) `nodejs_compat` flag, (c) `upload_source_maps = true`, (d) Hyperdrive binding when DB access is needed (`apps/api`, `apps/dispatch`), (e) `dispatch_namespaces = ["mcpgen-prod"]` etc. for `apps/dispatch` only.

---

### `apps/dispatch/` (Dispatch Worker, CF Workers for Platforms)

**Canonical analog:** `docs/mcpgen-architecture.md` §6.1 + RESEARCH Pattern 4 (namespace + script tags).

**Provisioning sequence** (one-time, RESEARCH Pattern 4 verbatim):

```bash
wrangler login
wrangler dispatch-namespace create mcpgen-prod
wrangler dispatch-namespace create mcpgen-staging
wrangler dispatch-namespace create mcpgen-sandbox
wrangler dispatch-namespace list
# Expected: exactly 3 entries — pre-commit hook fails any PR adding a 4th
```

**First-instance note:** `apps/dispatch/wrangler.toml` is the first CF Workers for Platforms config in the repo. Phase 6 will reuse the exact same namespace list. The `.pre-commit-hooks/no-fourth-namespace.sh` script greps `infrastructure/cloudflare/` and any `wrangler.toml` for `wrangler dispatch-namespace create` patterns and fails if count > 3.

---

### `apps/dispatch-sample/` (hand-coded Stripe tenant Worker — reference shape for Phase 4 codegen)

**Canonical analog:** `docs/mcpgen-stage-e-design.md` §2 (file tree) + §4.1 (`fetch` tool implementation) + RESEARCH "Stripe-sample tenant Worker stub".

**Reference file tree** (Stage E codegen will produce identical shape):

```
apps/dispatch-sample/
├── package.json                   # pinned to @modelcontextprotocol/sdk@^1.x (D-04)
├── wrangler.toml
├── tsconfig.json
└── src/
    ├── index.ts                   # Worker entry point
    ├── server.ts                  # MCP server initialization
    ├── auth/middleware.ts         # passthrough auth (default)
    ├── tools/
    │   ├── customers_search.ts    # 3 hand-coded tools per CONTEXT specifics
    │   ├── charges_fetch.ts
    │   └── subscriptions_list.ts
    └── runtime/                   # imports from @mcpgen/runtime stub (FND-06)
```

**Server initialization pattern** (RESEARCH "Stripe-sample tenant Worker stub" verbatim, MCP SDK v1 syntax per D-04):

```typescript
// apps/dispatch-sample/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface Env { USAGE_QUEUE: Queue<unknown>; }

const server = new McpServer({ name: 'sample-stripe', version: '0.0.1' });

server.tool(
  'customers_search',
  'Search Stripe customers by email or name (sample stub for Phase 1).',
  { query: z.string() },
  async ({ query }, ctx) => {
    return { content: [{ type: 'text', text: `(stub) searched for "${query}"` }] };
  },
);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return server.fetch(req, env, ctx);
  },
};
```

**Auth middleware pattern** (passthrough mode — `docs/mcpgen-stage-e-design.md` §5.1 verbatim):

```typescript
// apps/dispatch-sample/src/auth/middleware.ts
export async function authMiddleware(req: Request, env: Env, ctx: ExecutionContext) {
  const ourKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const validKey = await validateTenantKey(ourKey, env);
  if (!validKey) return new Response("Unauthorized", { status: 401 });

  const upstreamCredential = req.headers.get("X-Upstream-Auth");
  if (!upstreamCredential) {
    return new Response(
      JSON.stringify({ error: "Missing X-Upstream-Auth header. Configure your MCP client to forward upstream credentials." }),
      { status: 400 }
    );
  }
  ctx.upstreamCredential = upstreamCredential;
  return null;
}
```

**First-instance note:** This is the canonical reference shape for **every** tenant Worker in the system. Phase 4 (Stage E codegen Jinja2 templates) MUST emit Workers that match this file tree exactly (`src/index.ts`, `src/server.ts`, `src/tools/<name>.ts`, `src/auth/middleware.ts`, `src/runtime/*` from `@mcpgen/runtime`). Phase 6 (dispatch) targets this shape for routing tests. Any divergence between codegen output and `apps/dispatch-sample/` is a contract violation.

---

### `apps/generation-engine/` (FastAPI + PydanticAI + OpenRouter)

**Canonical analog:** `docs/mcpgen-architecture.md` §5.8 + `docs/mcpgen-model-and-provider-override.md` §2 (PydanticAI + OpenRouter).

**LLM client singleton pattern** (`docs/mcpgen-model-and-provider-override.md` §2.3 verbatim — use everywhere):

```python
# apps/generation-engine/src/mcpgen_engine/llm/client.py
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
import os

def get_model() -> OpenAIModel:
    """Returns Qwen3-Coder model configured for OpenRouter (single source of truth for LLM)."""
    provider = OpenAIProvider(
        base_url=os.environ["OPENROUTER_BASE_URL"],
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    return OpenAIModel(
        model_name=os.environ.get("PRIMARY_MODEL", "qwen/qwen3-coder"),
        provider=provider,
    )

# Singleton model instance — reuse across all passes
MODEL = get_model()
```

**Day-1 smoke test pattern** (`docs/mcpgen-model-and-provider-override.md` §8 + RESEARCH Pattern 8 — must exist before any Pass code):

```python
# apps/generation-engine/tests/smoke_test_qwen.py
import os
import pytest
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

pytestmark = pytest.mark.skipif(
    "OPENROUTER_API_KEY" not in os.environ,
    reason="OPENROUTER_API_KEY not set; Day-1 smoke test skipped",
)

class ToolDescription(BaseModel):
    purpose: str
    when_to_use: list[str]

PROVIDER = OpenAIProvider(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
MODEL = OpenAIChatModel("qwen/qwen3-coder", provider=PROVIDER)
AGENT = Agent(model=MODEL, output_type=ToolDescription, system_prompt="...")

@pytest.mark.asyncio
async def test_qwen3_coder_structured_output() -> None:
    result = await AGENT.run("Describe customers_search...", model_settings=...)
    assert isinstance(result.output, ToolDescription)
```

**FastAPI bootstrap pattern** (`apps/generation-engine/src/mcpgen_engine/main.py` — first instance):

```python
# apps/generation-engine/src/mcpgen_engine/main.py
from fastapi import FastAPI
import sentry_sdk
import os
from .observability import configure_langfuse_otel

sentry_sdk.init(dsn=os.environ.get("SENTRY_DSN", ""))  # empty DSN OK in Phase 1
configure_langfuse_otel()                              # FND-11

app = FastAPI(title="mcpgen-generation-engine")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

**Langfuse OTel wiring pattern** (RESEARCH Pattern 9 verbatim — `apps/generation-engine/src/mcpgen_engine/observability.py`):

```python
import base64
import os
import logfire
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

def configure_langfuse_otel() -> None:
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")
    endpoint = os.environ.get(
        "LANGFUSE_OTEL_ENDPOINT",
        "https://cloud.langfuse.com/api/public/otel/v1/traces",
    )

    headers: dict[str, str] = {}
    if public_key and secret_key:
        token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"

    logfire.configure(send_to_logfire=False, service_name="mcpgen-generation-engine")

    if headers:
        provider = TracerProvider()
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, headers=headers))
        )
        from opentelemetry import trace
        trace.set_tracer_provider(provider)
```

**First-instance note:** This is the only Python service in the repo. Every Python file MUST follow CLAUDE.md global rules: comments in English; no `Any` / `Dict[str, Any]`; no default parameter values; all imports at top; mypy `--strict`; ruff format. The `MODEL` singleton from `llm/client.py` is the **only** LLM entrypoint — passes 0–5 (Phases 2–5) MUST import from here, never instantiate their own. LiteLLM is **DELETED** — any reference is a bug.

---

### `packages/ir/src/types.ts` (Frozen contract #1 — Universal IR, Zod source)

**Canonical analog:** `docs/mcpgen-generation-engine-v2.md` §5.2 (full IR Pydantic spec) + RESEARCH "Zod IR source skeleton".

**Source-of-truth pattern** (RESEARCH "Zod IR source skeleton" verbatim — extend with all v2 IR types):

```typescript
// packages/ir/src/types.ts
// Source of truth for IR (D-01). Pydantic models in packages/ir/python/types.py are generated from this.
import { z } from 'zod';

export const ToolAnnotations = z.object({
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
  openWorldHint: z.literal(true),  // architectural invariant per Pass 4 design
});

export const ToolDescription = z.object({
  purpose: z.string().min(20),
  when_to_use: z.array(z.string()).min(1),
  when_not_to_use: z.array(z.string()).optional(),
  how_to_use: z.string().optional(),
  limitations: z.array(z.string()),
  parameter_overview: z.string().min(50).max(400),
});

export const FinalTool = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum(['universal', 'action', 'workflow', 'specialized']),
  description: ToolDescription,
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  annotations: ToolAnnotations,
  response_config: ResponseConfig,
  source_endpoints: z.array(z.string()),
});

export type FinalTool = z.infer<typeof FinalTool>;
```

**Codegen pattern** (RESEARCH §"Cross-Language IR Codegen Pipeline" — committed-to-git per CONTEXT specifics):

```bash
# packages/ir/scripts/codegen.ts (Bun script)
# Step 1: Zod → JSON Schema (Zod 4 native)
node -e "
  import { z } from 'zod';
  import { FinalTool } from '../src/types';
  const json = z.toJSONSchema(FinalTool, { target: 'draft-2020-12' });
  // write to build/jsonschema/FinalTool.json
"

# Step 2: JSON Schema → Pydantic 2 (datamodel-codegen)
datamodel-codegen \
  --input packages/ir/build/jsonschema \
  --input-file-type jsonschema \
  --output packages/ir/python/types.py \
  --output-model-type pydantic_v2.BaseModel \
  --use-double-quotes \
  --target-python-version 3.12

# Step 3: CI freshness check (--check mode diffs against committed)
pnpm --filter @mcpgen/ir codegen --check
```

**First-instance note:** This is the first frozen contract. Every pass's input/output shape (Pass 0 `Pass0Output`, Pass 1 `Pass1Output`, …, Pass 5 `FinalTool`) MUST be added to `packages/ir/src/types.ts` as Zod schemas; the Python mirror is auto-generated and committed. `datamodel-code-generator` produces `packages/ir/python/types.py` — that file MUST NOT be hand-edited. Engine startup re-validates Pydantic types against the latest IR schema (D-02 defensive check).

---

### `packages/contracts/src/usage-event.ts` (Frozen contract #3 — usage event)

**Canonical analog:** `docs/mcpgen-architecture.md` §7.2 (TimescaleDB hypertable) + §10.2 (Stripe Meters dimensions).

**TimescaleDB column pattern** (`docs/mcpgen-architecture.md` §7.2 verbatim — Zod schema MUST mirror columns):

```sql
CREATE TABLE usage_events (
  time TIMESTAMPTZ NOT NULL,
  deployment_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  tokens_in INT,
  tokens_out INT,
  upstream_latency_ms INT,
  worker_cpu_ms INT,
  status TEXT NOT NULL,  -- ok|error|rate_limited
  client_type TEXT,      -- claude_desktop|cursor|cline|custom
  error_class TEXT
);
SELECT create_hypertable('usage_events', 'time');
```

**Idempotency-key pattern** (D-11 verbatim — Stripe Meters event):

```typescript
// packages/contracts/src/usage-event.ts
import { z } from 'zod';

export const UsageEvent = z.object({
  // Stripe Meters dedup key (rolling 24h): ${deployment_id}_${minute_bucket_iso}_${tool_name}
  idempotency_key: z.string().regex(
    /^[0-9a-f-]{36}_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_[a-z][a-z0-9_]{0,63}$/
  ),
  time: z.string().datetime(),
  deployment_id: z.string().uuid(),
  tool_name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),  // matches FinalTool.name regex
  tokens_in: z.number().int().nonnegative().nullable(),
  tokens_out: z.number().int().nonnegative().nullable(),
  upstream_latency_ms: z.number().int().nonnegative().nullable(),
  worker_cpu_ms: z.number().int().nonnegative().nullable(),
  status: z.enum(['ok', 'error', 'rate_limited']),
  client_type: z.enum(['claude_desktop', 'cursor', 'cline', 'custom']).nullable(),
  error_class: z.string().nullable(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;
```

**First-instance note:** This single Zod schema is the **only** definition of a usage event. Every emit-site (tenant Worker), every Queue consumer (Inngest), every Timescale insert, and every Stripe Meters POST MUST validate against this schema. Drift here breaks billing. The `tool_name` regex MUST match `FinalTool.name` regex from `packages/ir/src/types.ts` — no divergence allowed.

---

### `packages/contracts/src/launch-criteria.ts` (Frozen contract #4 — IMMUTABLE thresholds)

**Canonical analog:** RESEARCH §"launch-criteria.ts — D-13 runtime constants" verbatim + `docs/mcpgen-implementation-plan.md` §11.7.

**Pattern** (verbatim — DO NOT change values without paired decision-log entry):

```typescript
// packages/contracts/src/launch-criteria.ts
// IMMUTABLE without a paired docs/decisions/<date>-<slug>.md entry (D-13 + Pitfall #29).
// Pre-commit hook `launch-criteria-guard` enforces.
// CI assertion: values must match docs/mcpgen-implementation-plan.md §11.7.

export const LAUNCH_CRITERIA = {
  F2_SMELL_MIN: 4.0,
  F3_AGENT_PASS_RATE_MIN: 0.7,
  BUNDLE_SIZE: {
    PASS_KB: 800,
    WARN_KB: 950,
    FAIL_KB_EXCLUSIVE: 950,
  },
  COVERAGE_PCT_MIN: 100,
} as const;

export type LaunchCriteria = typeof LAUNCH_CRITERIA;
```

**Pre-commit guard** (`.pre-commit-hooks/launch-criteria-paired-decision.sh`):

```bash
#!/usr/bin/env bash
# D-13: any commit touching launch-criteria.ts MUST include a paired docs/decisions/ entry.
set -euo pipefail
changed=$(git diff --cached --name-only)
if echo "$changed" | grep -q '^packages/contracts/src/launch-criteria\.ts$'; then
  if ! echo "$changed" | grep -qE '^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$'; then
    echo "ERROR: launch-criteria.ts changed without paired docs/decisions/<date>-<slug>.md entry"
    exit 1
  fi
fi
```

**First-instance note:** This is the **most-protected** file in the repo. It is imported by engine (Pass 5 / Stage F validation gates), BFF (publishability check), and CI (`main-ci.yml` asserts values match `docs/mcpgen-implementation-plan.md §11.7`). The pre-commit hook + CI assertion + paired decision-log requirement implement Pitfall #29's defense-in-depth (AI-fix-by-lowering-threshold). No file in any later phase may import these constants and override them.

---

### `packages/runtime-sdk/src/index.ts` (Frozen contract #5 — tenant Worker SDK interface)

**Canonical analog:** `docs/mcpgen-stage-e-design.md` §3.3 (runtime/infra templates) + §5 (auth modes) + §6 (smart_id runtime) + §7 (pagination/truncation).

**Interface stub pattern** (Phase 1 = empty bodies; Phase 6 implements; Phase 4 codegen targets):

```typescript
// packages/runtime-sdk/src/index.ts
// Frozen interface for tenant Workers (FND-06). Phase 1 = signatures only.
// Stage E codegen (Phase 4) emits Workers that import these. Phase 6 implements bodies.

export interface SmartId {
  server: string;
  type: 'object' | 'collection' | 'schema';
  collection: string;
  identifier: string;
}

export interface RuntimeContext {
  upstreamCredential: string;
  deploymentId: string;
  emitUsageEvent(event: UsageEvent): Promise<void>;
}

export interface Runtime {
  parseSmartId(id: string): SmartId;
  makeSmartId(parts: Omit<SmartId, never>): string;
  routeSearch(query: string, opts: RouteSearchOpts): Promise<unknown>;
  routeFetch(id: string, opts: RouteFetchOpts): Promise<unknown>;
  routeListCollections(opts: ListCollectionsOpts): Promise<unknown>;
  routeListObjects(opts: ListObjectsOpts): Promise<unknown>;
  routeUpsert(opts: UpsertOpts): Promise<unknown>;
  routeDelete(opts: DeleteOpts): Promise<unknown>;
  shapeResponse(raw: unknown, config: ResponseConfig): unknown;
  applyFieldFilter(raw: unknown, filter: FieldFilteringConfig): unknown;
  handleUpstreamError(err: unknown, ctx: ErrorTeachingContext): Response;
}

// Auth-mode adapters (3 modes per docs/mcpgen-stage-e-design.md §5)
export interface PassthroughAuth { mode: 'passthrough'; }
export interface StoredAuth { mode: 'stored'; }
export interface OAuthAuth { mode: 'oauth'; upstream: OAuthUpstreamConfig; }
export type AuthMode = PassthroughAuth | StoredAuth | OAuthAuth;
```

**First-instance note:** Every method here corresponds to a runtime template in `docs/mcpgen-stage-e-design.md` §3.3. The `apps/dispatch-sample/` Worker MUST `import { Runtime } from '@mcpgen/runtime'` (per Open Question #4 in RESEARCH). Phase 4 codegen MUST emit Workers that consume only this interface — no direct fetch / smart-ID-parse / pagination logic in generated tool handlers. Adding a method here triggers Phase-4-codegen-template + Phase-6-runtime-impl coordination.

---

### `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` (5 hand-crafted fixtures)

**Canonical analog:** `docs/mcpgen-pass-5-design.md` §"FinalTool" output shape + `docs/mcpgen-stage-f-design.md` §"Quality Report" + `docs/mcpgen-pass-1-design.md` §"Six-Tool Pattern" + §"Smart IDs".

**Fixture file structure** (one set per API):

```
packages/engine-fixtures/stripe/
├── ir.json              # complete IR after Stage A (RawIR)
├── final-tools.json     # FinalTool[] after Pass 5 (6–12 tools, Six-Tool Pattern)
├── quality-report.json  # Stage F output (smell scores + agent eval pass rate)
└── package.json         # exports a typed loader: `import { stripe } from '@mcpgen/engine-fixtures'`
```

**FinalTool fixture entry pattern** (must match Pass 5 output, hand-tuned to look like real output):

```json
{
  "name": "search",
  "type": "universal",
  "description": {
    "purpose": "Search Stripe customers, charges, subscriptions, and invoices by free-text query.",
    "when_to_use": ["When the user asks to find a Stripe object by name, email, or partial ID."],
    "limitations": ["Returns at most 25 results per call.", "No fuzzy matching on amounts."],
    "parameter_overview": "Single `query` string; ranked results return as smart IDs..."
  },
  "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] },
  "outputSchema": { "type": "object", "properties": { "results": { "type": "array", "items": { "type": "string" } } } },
  "annotations": { "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true },
  "response_config": { "pagination": { "style": "cursor", "default_limit": 25, "max_limit": 100 }, ... },
  "source_endpoints": ["GET /v1/charges", "GET /v1/customers", "GET /v1/subscriptions"]
}
```

**First-instance note:** These 5 fixture sets are the **only** non-trivial test data in the repo until Phase 5 ships. Per CONTEXT specifics: hand-tuned to look like real Pass 5 output (~4 hours each), NOT LLM-generated. They MUST validate against `packages/ir/src/types.ts` Zod schemas. Frontend (Phase 7), Runtime (Phase 6), and Ops (Phase 8) wire-up against these — engine slip cannot block parallel workstreams (Pitfall #24). The 5 APIs (Stripe, GitHub, Notion, Linear, Slack) double as Phase 5 F3 golden-task targets.

---

### `infrastructure/neon/migrations/20260427000000_init_schema.sql` (first Drizzle migration)

**Canonical analog:** `docs/mcpgen-architecture.md` §7.1 (PostgreSQL schemas) + §7.2 (TimescaleDB hypertables) + RESEARCH Pattern 5 (Drizzle config) + D-09 (`pending_callbacks` table).

**Schema excerpt** (`docs/mcpgen-architecture.md` §7.1 verbatim — first migration MUST cover all of §7.1 + §7.2 + `pending_callbacks`):

```sql
-- Identity
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  logto_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generations (v2 — добавлены quality_report + eval поля)
CREATE TABLE generations (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects NOT NULL,
  spec_id UUID REFERENCES specs NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT,
  options JSONB NOT NULL,
  ir JSONB,
  quality_report JSONB,
  quality_score NUMERIC(3,2),
  is_publishable BOOLEAN,
  llm_cost_usd NUMERIC(10,6),
  llm_cost_breakdown JSONB
);

-- D-09: SSE callback resume backing store
CREATE TABLE pending_callbacks (
  job_id TEXT NOT NULL,
  event_id TEXT NOT NULL,  -- ULID, monotonic per generation
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  attempted_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, event_id)
);
```

**Drizzle config pattern** (RESEARCH Pattern 5 verbatim):

```typescript
// infrastructure/neon/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/contracts/src/db-schema.ts',
  out: './infrastructure/neon/migrations',
  migrations: {
    prefix: 'timestamp',  // produces YYYYMMDDHHMMSS_*.sql per D-12 (Open Question #1: accept native format)
  },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

**First-instance note:** This is the first migration. **Filename format is `YYYYMMDDHHMMSS_<descriptive_name>.sql`** (Drizzle native; per RESEARCH Open Question #1, accept Drizzle's native format with no underscore between date and time). Every subsequent migration MUST use timestamp prefix — `drizzle-kit check` runs in CI on every PR per Pitfall #18. The `pending_callbacks` table satisfies D-09 (per Open Question #2, store metadata only — full payload re-derived from L2 cache on retry).

---

### `.pre-commit-config.yaml` (D-05 hook orchestration)

**Canonical analog:** RESEARCH Pattern 6 verbatim.

**Configuration pattern** (RESEARCH Pattern 6 — full file reproduced; ALL hooks mandatory per D-05):

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.7.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        files: ^apps/generation-engine/
        additional_dependencies: [pydantic, pydantic-ai, fastapi]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.16.0
    hooks:
      - id: eslint
        files: \.(ts|tsx)$
        additional_dependencies:
          - eslint@10
          - typescript@6
          - "@typescript-eslint/parser@8"
          - "@typescript-eslint/eslint-plugin@8"

  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: v3.6.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]

  - repo: local
    hooks:
      - id: cf-namespace-guard            # D-08: prevent 4th CF dispatch namespace
        entry: bash .pre-commit-hooks/no-fourth-namespace.sh
        language: system
        files: ^infrastructure/cloudflare/
        pass_filenames: false

      - id: launch-criteria-guard          # D-13: launch-criteria.ts changes need decision log
        entry: bash .pre-commit-hooks/launch-criteria-paired-decision.sh
        language: system
        files: ^packages/contracts/src/launch-criteria\.ts$
        pass_filenames: false

      - id: ir-codegen-check               # D-02: IR Pydantic codegen freshness
        entry: pnpm --filter @mcpgen/ir codegen --check
        language: system
        files: ^packages/ir/(src|python)/
        pass_filenames: false

      - id: ui-locked-guard                # CONTEXT specifics: prevent UI redesign
        entry: bash .pre-commit-hooks/check-ui-locked.sh
        language: system
        files: ^apps/web/src/(styles|components/ui)/
        pass_filenames: false
```

**First-instance note:** `pre-commit` is the **only** hook orchestrator (D-05; lefthook/husky deferred). Local hooks live in `.pre-commit-hooks/` as bash scripts; they MUST be idempotent + read-only (no git mutation). NEVER bypass with `--no-verify` (CLAUDE.md + git-workflow-rules + D-05 + D-20). New repo-scoped invariants (e.g., "frontend phase MUST NOT add API calls outside `apps/web/src/lib/api/`") are added as new local hooks here, not as separate scripts elsewhere.

---

### `.github/workflows/main-ci.yml` (CI aggregator + paths-filter)

**Canonical analog:** RESEARCH Pattern 7 verbatim + RESEARCH Open Question #6 (single workflow with `dorny/paths-filter` recommended over per-workstream files).

**Pattern** (RESEARCH Pattern 7 — paths-filter detect, conditional jobs, commit-lint):

```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  detect-changes:
    runs-on: ubuntu-24.04
    outputs:
      engine: ${{ steps.changes.outputs.engine }}
      runtime: ${{ steps.changes.outputs.runtime }}
      frontend: ${{ steps.changes.outputs.frontend }}
      ops: ${{ steps.changes.outputs.ops }}
      contracts: ${{ steps.changes.outputs.contracts }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            engine: 'apps/generation-engine/**'
            runtime: ['apps/dispatch/**', 'packages/runtime-sdk/**', 'apps/dispatch-sample/**']
            frontend: 'apps/web/**'
            ops: ['apps/api/**', 'infrastructure/**', '.github/workflows/**']
            contracts: 'packages/(ir|contracts)/**'

  contracts:
    needs: detect-changes
    if: needs.detect-changes.outputs.contracts == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mcpgen/ir codegen --check  # D-02
      - run: pnpm --filter @mcpgen/contracts test
      - run: pnpm --filter @mcpgen/contracts typecheck

  commit-lint:                                          # D-20 second enforcement layer
    runs-on: ubuntu-24.04
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: wagoid/commitlint-github-action@v6
        with: { configFile: .commitlintrc.json }
```

**First-instance note:** This is the first CI workflow. Per RESEARCH Open Question #6, prefer single `main-ci.yml` with `dorny/paths-filter` over per-workstream files (D-06 wording is satisfied by job names; flag this as a refinement in the plan). Every workstream job MUST: (a) check out at correct ref, (b) install via `--frozen-lockfile`, (c) run lint + typecheck + test, (d) for engine ws — run Day-1 Qwen smoke test gated on `secrets.OPENROUTER_API_KEY`.

---

### `apps/cli/` (Bun-compiled CLI binary)

**Canonical analog:** Commander.js v14 + Bun `--compile` matrix + RESEARCH Pattern 11.

**Build matrix pattern** (RESEARCH Pattern 11 verbatim):

```typescript
// apps/cli/build.ts (Bun script)
import { spawn } from 'bun';

const targets = [
  'bun-linux-x64',
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-windows-x64',
] as const;

for (const t of targets) {
  const ext = t.includes('windows') ? '.exe' : '';
  const proc = spawn([
    'bun', 'build', '--compile', `--target=${t}`,
    'src/index.ts', '--outfile', `dist/mcpgen-${t}${ext}`,
  ], { stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`Build failed for ${t}: exit ${code}`);
}
```

**First-instance note:** Phase 1 only validates that all 4 targets compile + `--help` runs. Full CLI commands (init / generate / deploy) are Phase 7+. Every CLI command MUST wrap a single `POST /api/v1/generate` call — no direct LLM access, no direct DB access. The CLI is a thin client over the BFF.

---

## Shared Patterns

### Idempotency-key shape (D-11)

**Source:** `docs/mcpgen-architecture.md` §5.8 + D-11.
**Apply to:** Every surface that issues operations — BFF (`POST /api/v1/generate`), Inngest job triggers, Stripe Meters events, CF dispatch deploys.

```typescript
// Universal shape: ${operation}_${ulid}
const generationId  = `gen_${ulid()}`;                                    // BFF + Inngest
const stripeMetric  = `${deploymentId}_${minuteBucketIso}_${toolName}`;   // Stripe Meters (rolling 24h)
const cfWorkerName  = `deploy_${deployment.id}`;                          // CF dispatch (upsert)

// Validation regex (use everywhere):
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const GEN_ID_REGEX = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/;
```

The operation prefix (`gen_`, `deploy_`, etc.) makes cross-surface collisions impossible. Stored as the canonical regex in `packages/contracts/src/generation-api.ts` and re-imported wherever ULIDs are minted.

---

### Conventional Commits (git-workflow-rules + D-20)

**Source:** `docs/mcpgen-git-workflow-rules.md` + D-20.
**Apply to:** Every commit by every contributor (human + AI agent).

```
<type>(<scope>): <subject>

# Types: feat | fix | refactor | docs | chore | test | perf | build | ci
# Subject: imperative, ≤72 chars, no trailing period
# Scope examples: foundation, contracts, engine, runtime, frontend, ops, ir
# Atomic: one logical change; if "and" appears in subject — SPLIT.

# Examples:
feat(contracts): freeze Generation API SSE envelope shape
chore(foundation): scaffold apps/api with Hono streamSSE smoke endpoint
fix(ir): regenerate Pydantic mirror after FinalTool annotation change
```

Enforced by **two layers** (D-20): `conventional-pre-commit` locally + `commitlint-github-action` in `main-ci.yml`. NEVER `--no-verify`. Squash-merge only (PR title becomes commit message).

---

### Sentry source-map upload (D-19)

**Source:** RESEARCH Pattern 10.
**Apply to:** Every app that runs in production.

| Runtime | Mechanism | Implementation |
|---|---|---|
| Vercel (`apps/web`) | `@sentry/nextjs` auto-injects via `withSentryConfig` | Set `SENTRY_AUTH_TOKEN` as Vercel env |
| CF Workers (`apps/api`, `apps/dispatch`) | `wrangler deploy --upload-source-maps` | Add `upload_source_maps = true` to `wrangler.toml` |
| Fly Machines (`apps/generation-engine`) | `sentry-sdk[fastapi]` auto-handles | Set `SENTRY_RELEASE=$GITHUB_SHA` in `flyctl deploy` |

Phase 1 wires SDK init in all 4 apps with empty DSN; Phase 9 fills DSN per environment.

---

### Logging redaction (architecture §11)

**Source:** `docs/mcpgen-architecture.md` §11.3 + Pitfall #12.
**Apply to:** Every emit-site for logs / Sentry / Langfuse.

**Never log:** spec content (only `content_hash + endpoint_count + structural_diff_summary`); upstream API responses (PII); upstream auth credentials.
**Always log:** generation metadata, tool names, IR structure, performance metrics, error traces.

Phase 1 specifies the contract via Sentry `beforeSend` redaction stub (Phase 4 implements per Pitfall #12).

---

### MCP TS SDK pin — D-04

**Source:** `docs/mcpgen-stage-e-design.md` §1 + D-04.
**Apply to:** `packages/codegen-templates/package.json.j2` AND `packages/runtime-sdk/package.json` AND `apps/dispatch-sample/package.json`.

```json
{ "dependencies": { "@modelcontextprotocol/sdk": "^1.x" } }
```

Stage E examples are written against v1 syntax (`server.tool(name, description, schema, handler)`). v2 bump is a deliberate `chore: bump mcp-sdk to v2` PR with golden-API regression — explicitly excluded from Dependabot per CONTEXT deferred ideas.

---

## No Analog Found

None. Every Phase 1 file maps to either an upstream framework canonical example or to a section in `docs/` that specifies the exact shape.

---

## Patterns this phase ESTABLISHES

These conventions become the baseline for every later phase:

| Convention | Established by | Enforced by |
|---|---|---|
| **File naming convention** | Lowercase + dashes for files; snake_case for tool names; PascalCase for Zod schemas / TS types; snake_case for Python | ESLint + ruff + `FinalTool.name` regex `/^[a-z][a-z0-9_]{0,63}$/` |
| **Contract location convention** | All cross-app types live in `packages/contracts/src/` (one file per domain); IR lives in `packages/ir/src/types.ts`; runtime SDK interface in `packages/runtime-sdk/src/index.ts` | CI (`pnpm --filter @mcpgen/contracts typecheck`); pre-commit (`ir-codegen-check`) |
| **Idempotency-key shape (D-11)** | `${operation}_${ulid}` everywhere; Stripe Meters uses `${deployment_id}_${minute_bucket_iso}_${tool_name}` | Zod regex in `packages/contracts/src/generation-api.ts` + `usage-event.ts`; CI typecheck |
| **Migration filename prefix (D-12)** | `YYYYMMDDHHMMSS_<descriptive_name>.sql` (Drizzle native; accept divergence from D-12's underscored form per RESEARCH Open Question #1); first migration `20260427000000_init_schema.sql` | `drizzle-kit check` in CI; Pitfall #18 detection |
| **Commit format (Conventional Commits)** | `<type>(<scope>): <subject>` ≤72 chars imperative; atomic (split on "and") | `conventional-pre-commit` (local) + `commitlint-github-action` (CI) — D-20 |
| **Pre-commit hook policy (D-05)** | All hooks defined in `.pre-commit-config.yaml`; local hooks in `.pre-commit-hooks/`; NEVER `--no-verify` | `pre-commit` framework; `git-workflow-rules` mandate |
| **Single LLM model (override doc)** | `qwen/qwen3-coder` via OpenRouter; `MODEL` singleton in `apps/generation-engine/src/mcpgen_engine/llm/client.py`; LiteLLM is DELETED | Day-1 smoke test in CI; mypy `--strict` blocks `Any` |
| **Tenant Worker file tree** | `apps/dispatch-sample/` shape per `docs/mcpgen-stage-e-design.md` §2; Stage E codegen MUST emit identical structure | Phase 4 codegen tests against `apps/dispatch-sample/` reference; F1 static validation (`tsc --noEmit`) |
| **CF dispatch namespace cap (D-08)** | Exactly 3 namespaces: `mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`; never per-tenant | `.pre-commit-hooks/no-fourth-namespace.sh` + CI assertion |
| **Launch-criteria immutability (D-13)** | F2 ≥ 4.0, F3 ≥ 0.7, bundle <800KB pass / 800–950KB warn / >950KB fail; constant-export | `.pre-commit-hooks/launch-criteria-paired-decision.sh` + CI assertion that values match `docs/mcpgen-implementation-plan.md` §11.7 |
| **UI lock (CONTEXT specifics)** | `apps/web/src/styles/` and `apps/web/src/components/ui/` frozen after MCP-Gen.zip unzip commit | `.pre-commit-hooks/check-ui-locked.sh` |
| **Cross-workstream test ownership (D-21)** | Failing tests owned by ws that owns the file; cross-ws failures escalate as `chore(contracts):` PR | `docs/decisions/000-test-ownership-policy.md` + plan files include policy reference |
| **Day-1 LLM smoke test (model override §8)** | `apps/generation-engine/tests/smoke_test_qwen.py` MUST exist before any Pass code | CI runs it gated on `OPENROUTER_API_KEY`; engine-ci.yml step |
| **Contract freeze gate** | All 5 contracts (IR, Generation API, Usage Event, Launch Criteria, Runtime SDK) frozen by end of Phase 1 | Daily sync ritual + per-workstream STATE.md MUST cite contract version |

---

## Metadata

**Analog search scope:** `docs/` (all 9 detail-design docs + architecture + model override + git workflow + sprint plan), `.planning/research/` (STACK + ARCHITECTURE + PITFALLS + SUMMARY), `.planning/phases/01-foundation/` (CONTEXT + RESEARCH).
**Files scanned:** 12 canonical docs.
**Pattern extraction date:** 2026-04-26.
**Greenfield posture confirmed:** No `apps/`, `packages/`, or `infrastructure/` exist yet in the repo (only `docs/`, `.planning/`, `claude-design-ui/`, `CLAUDE.md`, `RULES.md`). Every file is the first instance of its kind.
