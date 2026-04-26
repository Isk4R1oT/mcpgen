# Stage E: Codegen — Detailed Design

> **Документ:** detailed design Stage E в Generation Engine v2 — превращает финальный output всех LLM-passes в работающий TypeScript MCP server на Cloudflare Workers.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** все pass docs, `architecture.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Stage E — это **deterministic template-based codegen**. Берёт финальный output Pass 5 (полные tool definitions с inputSchema, outputSchema, annotations, response config) и генерирует **complete TypeScript Cloudflare Worker project** с:

- MCP protocol handling
- 6 universal tool handlers + N extras (action/workflow/specialized)
- Smart ID parsing/generation runtime
- Pagination/truncation runtime
- Auth handling (3 модели)
- Error response shaping
- TypeScript types из schemas
- wrangler.toml для deploy

**100% deterministic** — Jinja2 templates + AST manipulation. **No LLM calls**. Cost $0, latency 5-10s.

Output ready для one-click deploy на Cloudflare Workers for Platforms.

---

## 1. Architectural decision: native MCP tools (не Code Mode)

### 1.1 Two competing approaches

**Approach A: Native MCP Tools** (Stainless, GitHub Copilot, наш choice)
- Каждый tool — отдельный MCP function с own schema
- Client видит full tool list через `tools/list`
- Calling — direct `tools/call`

**Approach B: Code Mode** (Cloudflare's [Code Mode](https://blog.cloudflare.com/code-mode/))
- 2 universal tools: `search()` and `execute()`
- LLM пишет TypeScript код против SDK
- Code runs in sandboxed Worker isolate
- 2500 endpoints в 1000 tokens

### 1.2 Why we choose native tools

| Factor | Native | Code Mode |
|---|---|---|
| **Universal client compat** | Works in any MCP client | Requires sandbox infra |
| **Token efficiency** | Good (Six-Tool: 70%+ savings) | Best (~99%) |
| **Agent reliability** | High (RL-trained pattern) | Depends on LLM coding skill |
| **Implementation complexity** | Medium (templates) | High (sandbox security) |
| **Standard adherence** | Pure MCP | Cloudflare-specific |

**Decision:** Six-Tool Pattern (Pass 1) уже даёт нам Code-Mode-level token efficiency на структурном уровне без runtime code execution. We get 70-90% of the benefit без the complexity.

Code Mode остаётся открытым как future option (v2.x) для users с very large APIs (Salesforce-class), кто accept sandbox dependency.

---

## 2. Output structure — generated server file tree

```
{server-name}/
├── package.json
├── wrangler.toml                # Cloudflare Worker config
├── tsconfig.json
├── README.md                    # generated from spec_info + auth instructions
├── src/
│   ├── index.ts                 # Worker entry point
│   ├── server.ts                # MCP server initialization
│   ├── auth/
│   │   ├── middleware.ts        # auth validation (header check, OAuth)
│   │   └── credentials.ts       # credential extraction logic
│   ├── tools/
│   │   ├── search.ts            # universal search
│   │   ├── fetch.ts             # universal fetch
│   │   ├── list_collections.ts
│   │   ├── list_objects.ts
│   │   ├── upsert.ts
│   │   ├── delete.ts
│   │   ├── action_<name>.ts     # one per action tool
│   │   ├── workflow_<name>.ts   # one per workflow tool
│   │   └── index.ts             # registers all tools
│   ├── runtime/
│   │   ├── smart_id.ts          # parse/generate smart IDs
│   │   ├── pagination.ts        # cursor/offset/page handling
│   │   ├── truncation.ts        # response size management
│   │   ├── upstream.ts          # HTTP client to wrap actual API
│   │   ├── response_shaping.ts  # field filtering, format toggles
│   │   └── errors.ts            # error response generation
│   ├── schemas/
│   │   ├── inputs.ts            # all inputSchema as Zod schemas
│   │   ├── outputs.ts           # all outputSchema as Zod schemas
│   │   └── routing.ts           # routing rules from Pass 1
│   └── config.ts                # static config (server name, version, etc.)
└── tests/
    └── smoke.ts                 # basic invocation tests
```

**~25-30 generated files** для typical server. Templates: ~15 (some files generated multiple times per tool).

---

## 3. Template inventory

Jinja2 templates на Python side. Each template parameterized по {tool, server_config, auth_config, etc.}.

### 3.1 Project-level templates (one each)

| Template | Output | Variables |
|---|---|---|
| `package.json.j2` | `package.json` | server_name, dependencies, version |
| `wrangler.toml.j2` | `wrangler.toml` | worker_name, kv_bindings, secrets |
| `tsconfig.json.j2` | `tsconfig.json` | (mostly static) |
| `README.md.j2` | `README.md` | spec_info, auth_instructions, tool_list |
| `index.ts.j2` | `src/index.ts` | server_name, oauth_config |
| `server.ts.j2` | `src/server.ts` | tool_registrations |
| `config.ts.j2` | `src/config.ts` | server_name, version, upstream_base_url |

### 3.2 Per-tool-type templates

| Template | Output per | Tool types |
|---|---|---|
| `tool_search.ts.j2` | search tool | universal_search |
| `tool_fetch.ts.j2` | fetch tool | universal_fetch |
| `tool_list_collections.ts.j2` | list_collections | universal_list_collections |
| `tool_list_objects.ts.j2` | list_objects | universal_list_objects |
| `tool_upsert.ts.j2` | upsert tool | universal_upsert |
| `tool_delete.ts.j2` | delete tool | universal_delete |
| `tool_action.ts.j2` | one per action tool | action |
| `tool_workflow.ts.j2` | one per workflow | workflow |
| `tool_specialized.ts.j2` | one per specialized | specialized |

### 3.3 Runtime/infra templates

| Template | Output | Purpose |
|---|---|---|
| `smart_id.ts.j2` | `runtime/smart_id.ts` | Parse/generate smart IDs based on schema |
| `pagination.ts.j2` | `runtime/pagination.ts` | Cursor/offset/page handling |
| `truncation.ts.j2` | `runtime/truncation.ts` | Response size enforcement |
| `upstream.ts.j2` | `runtime/upstream.ts` | HTTP client (auth headers, base URL) |
| `response_shaping.ts.j2` | `runtime/response_shaping.ts` | Field filter, format toggle |
| `errors.ts.j2` | `runtime/errors.ts` | Error templates |
| `auth_middleware.ts.j2` | `auth/middleware.ts` | Per auth model (pass-through/stored/OAuth) |
| `auth_credentials.ts.j2` | `auth/credentials.ts` | Credential extraction |
| `inputs.ts.j2` | `schemas/inputs.ts` | All Zod input schemas |
| `outputs.ts.j2` | `schemas/outputs.ts` | All Zod output schemas |
| `routing.ts.j2` | `schemas/routing.ts` | Routing tables for universal tools |

---

## 4. Per-tool-type handler implementation

### 4.1 Universal `fetch` tool template

```typescript
// tools/fetch.ts (generated)

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseSmartId, makeSmartId } from "../runtime/smart_id";
import { upstreamRequest } from "../runtime/upstream";
import { shapeResponse, applyFieldFilter } from "../runtime/response_shaping";
import { handleUpstreamError } from "../runtime/errors";

// Input schema (from Pass 3)
const FetchInputSchema = z.object({
  id: z.string().describe(/* description from Pass 2/3 */),
});

// Output schema (from Pass 5)
const FetchOutputSchema = z.object({
  id: z.string(),
  object_type: z.string(),
  data: z.record(z.unknown()),
  metadata: z.object({
    fetched_at: z.string(),
    source_endpoint: z.string(),
  }).optional(),
});

// Routing rules (from Pass 1)
const FETCH_ROUTING = {
  "Charge": { method: "GET", path: "/v1/charges/{id}" },
  "Customer": { method: "GET", path: "/v1/customers/{id}" },
  // ... all collections from smart_id_schema
};

// Default field filters (from Pass 5)
const FETCH_DEFAULT_FIELDS = {
  "Charge": ["id", "amount", "currency", "status", "customer", "created"],
  "Customer": ["id", "email", "name", "created", "metadata"],
  // ...
};

export function registerFetch(server: McpServer) {
  server.tool(
    "fetch",
    /* description from Pass 2 */,
    FetchInputSchema.shape,
    async (args, ctx) => {
      try {
        const { server: srv, type, collection, identifier } = parseSmartId(args.id);
        
        const route = FETCH_ROUTING[collection];
        if (!route) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Unknown collection: ${collection}. Use list_collections() to see available.`
            }]
          };
        }
        
        const url = route.path.replace("{id}", identifier);
        const upstreamData = await upstreamRequest({
          method: route.method,
          path: url,
          ctx,
        });
        
        const filtered = applyFieldFilter(
          upstreamData,
          FETCH_DEFAULT_FIELDS[collection],
          args.properties || []
        );
        
        const shaped = shapeResponse(filtered, {
          truncation_threshold: /* from Pass 5 */,
          guidance_template: /* from Pass 5 */,
        });
        
        const result = {
          id: makeSmartId({ server: SERVER_NAME, type: "object", collection, identifier }),
          object_type: collection,
          data: shaped.data,
          metadata: {
            fetched_at: new Date().toISOString(),
            source_endpoint: url,
          },
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,  // MCP 2025-06-18 standard
        };
      } catch (err) {
        return handleUpstreamError(err, "fetch");
      }
    }
  );
}
```

Each universal tool follows similar pattern: parse → route → upstream call → shape → return.

### 4.2 Universal `upsert` template — smart routing

```typescript
// tools/upsert.ts (generated)

const UPSERT_ROUTING = {
  // For create (no id):
  "Charge:create": { method: "POST", path: "/v1/charges" },
  "Customer:create": { method: "POST", path: "/v1/customers" },
  
  // For update (with id):
  "Charge:update": { method: "POST", path: "/v1/charges/{id}" },  // Stripe uses POST, not PATCH
  "Customer:update": { method: "POST", path: "/v1/customers/{id}" },
  
  // For batch (when supported by upstream):
  "Charge:batch_create": { method: "POST", path: "/v1/charges/batch" },
  // ...
};

export function registerUpsert(server: McpServer) {
  server.tool(
    "upsert",
    /* description */,
    UpsertInputSchema.shape,
    async (args, ctx) => {
      const { collection, data, id, ids } = args;
      
      // Smart routing
      let routeKey: string;
      if (Array.isArray(data)) {
        routeKey = ids ? `${collection}:batch_update` : `${collection}:batch_create`;
      } else {
        routeKey = id ? `${collection}:update` : `${collection}:create`;
      }
      
      const route = UPSERT_ROUTING[routeKey];
      // ... call upstream, shape response
    }
  );
}
```

### 4.3 Action tool template (per-tool generated)

```typescript
// tools/action_charges_capture.ts (generated, one per action)

const ChargesCaptureInputSchema = z.object({
  charge_id: z.string().regex(/^ch_[A-Za-z0-9]+$/),
  amount_cents: z.number().int().min(1).optional(),
  idempotency_key: z.string().optional(),
});

export function registerChargesCapture(server: McpServer) {
  server.tool(
    "charges_capture",
    /* description */,
    ChargesCaptureInputSchema.shape,
    async (args, ctx) => {
      try {
        const upstreamResponse = await upstreamRequest({
          method: "POST",
          path: `/v1/charges/${args.charge_id}/capture`,
          body: {
            amount: args.amount_cents,
          },
          headers: args.idempotency_key 
            ? { "Idempotency-Key": args.idempotency_key } 
            : {},
          ctx,
        });
        
        const result = {
          success: true,
          charge_id: args.charge_id,
          captured_amount: upstreamResponse.amount_captured,
          status: upstreamResponse.status,
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err) {
        return handleUpstreamError(err, "charges_capture");
      }
    }
  );
}
```

### 4.4 Workflow tool template

```typescript
// tools/workflow_schedule_event.ts (generated)

export function registerScheduleEvent(server: McpServer) {
  server.tool(
    "schedule_event",
    /* description */,
    ScheduleEventInputSchema.shape,
    async (args, ctx) => {
      try {
        // Step 1: Find user
        const user = await upstreamRequest({
          method: "GET",
          path: `/v1/users?email=${encodeURIComponent(args.person_email)}`,
          ctx,
        });
        
        if (!user || user.length === 0) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `User not found: ${args.person_email}. No calendar changes made.`
            }]
          };
        }
        
        // Step 2: Find available slot
        const slots = await upstreamRequest({
          method: "POST",
          path: "/v1/calendar/freebusy",
          body: {
            users: [user[0].id, ctx.user_id],
            time_min: args.preferred_window.start,
            time_max: args.preferred_window.end,
            duration_minutes: args.duration_minutes,
          },
          ctx,
        });
        
        if (!slots.available_slots?.length) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: `No available slots in window. Slot search returned 0 results.`
            }]
          };
        }
        
        // Step 3: Create event (terminal step)
        const event = await upstreamRequest({
          method: "POST",
          path: "/v1/calendar/events",
          body: {
            attendees: [user[0].email, ctx.user_email],
            start: slots.available_slots[0].start,
            duration_minutes: args.duration_minutes,
          },
          ctx,
        });
        
        const result = {
          success: true,
          event_id: makeSmartId({
            server: SERVER_NAME,
            type: "object",
            collection: "Event",
            identifier: event.id,
          }),
          scheduled_at: event.start,
          attendees: [user[0].email, ctx.user_email],
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err) {
        // Workflow-specific error: tell agent which step failed
        return handleWorkflowError(err, "schedule_event", currentStep);
      }
    }
  );
}
```

Workflow handlers explicit step-by-step с partial failure handling.

---

## 5. Auth handling generation (3 models)

### 5.1 Pass-through auth (default for API key/Basic)

```typescript
// auth/middleware.ts (generated when auth_mode == "passthrough")

export async function authMiddleware(req: Request, env: Env, ctx: ExecutionContext) {
  // Validate our tenant key
  const ourKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const validKey = await validateTenantKey(ourKey, env);
  if (!validKey) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  // Extract upstream credential (passed through)
  const upstreamCredential = req.headers.get("X-Upstream-Auth");
  if (!upstreamCredential) {
    return new Response(
      JSON.stringify({
        error: "Missing X-Upstream-Auth header. Configure your MCP client to forward upstream credentials. See setup docs."
      }),
      { status: 400 }
    );
  }
  
  // Add to context для downstream tool handlers
  ctx.upstreamCredential = upstreamCredential;
  
  return null; // continue to handler
}
```

```typescript
// runtime/upstream.ts (passthrough mode)

export async function upstreamRequest({ method, path, body, ctx }) {
  const headers = {
    "Authorization": ctx.upstreamCredential, // forwarded as-is
    "Content-Type": "application/json",
  };
  
  // ... fetch logic
}
```

### 5.2 Stored credentials (for OAuth tokens, AWS Sig)

```typescript
// auth/middleware.ts (generated when auth_mode == "stored")

export async function authMiddleware(req: Request, env: Env, ctx: ExecutionContext) {
  // Validate tenant key, identify deployment
  const tenantKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const deployment = await validateAndLoadDeployment(tenantKey, env);
  if (!deployment) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  // Load stored credential (encrypted at rest, AES-256-GCM)
  const encryptedCred = await env.CREDS_KV.get(`creds:${deployment.id}`);
  if (!encryptedCred) {
    return new Response("Credentials not configured. Set up via dashboard.", { status: 401 });
  }
  
  const credential = await decryptCredential(encryptedCred, env.MASTER_KEY);
  ctx.upstreamCredential = credential;
  
  return null;
}
```

### 5.3 OAuth flow (using `workers-oauth-provider`)

```typescript
// index.ts (generated when auth_mode == "oauth")

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: McpHandler,
  defaultHandler: WebHandler,  // OAuth consent screens
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  
  // Upstream OAuth config (e.g., Google)
  upstream: {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id: env.UPSTREAM_OAUTH_CLIENT_ID,
    client_secret: env.UPSTREAM_OAUTH_CLIENT_SECRET,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  },
});
```

Workers-oauth-provider handles all complexity: consent screens, token refresh, scope downscoping.

---

## 6. Smart ID runtime

```typescript
// runtime/smart_id.ts (generated)

const SERVER_PREFIX = /* from Pass 1 */;

const COLLECTION_PATTERNS: Record<string, RegExp> = {
  "Charge": /^ch_[A-Za-z0-9]+$/,
  "Customer": /^cus_[A-Za-z0-9]+$/,
  // ... from smart_id_schema
};

export interface SmartId {
  server: string;
  type: "object" | "collection" | "schema";
  collection: string;
  identifier: string;
}

export function parseSmartId(id: string): SmartId {
  const parts = id.split(":");
  
  // Full smart ID: server:type:collection:identifier
  if (parts.length === 4 && parts[0] === SERVER_PREFIX) {
    return {
      server: parts[0],
      type: parts[1] as any,
      collection: parts[2],
      identifier: parts[3],
    };
  }
  
  // Backward compat: plain identifier — infer collection from pattern
  for (const [collection, pattern] of Object.entries(COLLECTION_PATTERNS)) {
    if (pattern.test(id)) {
      return {
        server: SERVER_PREFIX,
        type: "object",
        collection,
        identifier: id,
      };
    }
  }
  
  throw new Error(
    `Invalid ID format: ${id}. Expected smart ID like '${SERVER_PREFIX}:object:Charge:ch_xxx' ` +
    `или plain identifier matching known patterns.`
  );
}

export function makeSmartId({ server, type, collection, identifier }: SmartId): string {
  return `${server}:${type}:${collection}:${identifier}`;
}
```

---

## 7. Pagination/truncation runtime

```typescript
// runtime/pagination.ts (generated)

const PAGINATION_CONFIG = {
  // From Pass 5 per-tool config
  "list_objects": {
    strategy: "cursor", // or "offset" or "page_number"
    cursor_param: "starting_after",
    cursor_response_field: "has_more",
    default_limit: 25,
    max_limit: 100,
  },
  // ...
};

export function buildPaginationParams(toolName: string, args: any) {
  const config = PAGINATION_CONFIG[toolName];
  if (!config) return {};
  
  const params: Record<string, any> = {};
  
  if (config.strategy === "cursor") {
    params[config.cursor_param] = args.cursor;
    params.limit = Math.min(args.limit ?? config.default_limit, config.max_limit);
  } else if (config.strategy === "offset") {
    params.offset = args.offset ?? 0;
    params.limit = Math.min(args.limit ?? config.default_limit, config.max_limit);
  } else if (config.strategy === "page_number") {
    params.page = args.page ?? 1;
    params.per_page = Math.min(args.limit ?? config.default_limit, config.max_limit);
  }
  
  return params;
}

export function extractNextCursor(toolName: string, response: any): string | null {
  const config = PAGINATION_CONFIG[toolName];
  if (!config || config.strategy !== "cursor") return null;
  return response[config.cursor_response_field] ?? null;
}
```

```typescript
// runtime/truncation.ts (generated)

import { encode } from "gpt-tokenizer"; // or simpler estimator

const TRUNCATION_CONFIG = {
  "search": { threshold: 10000, template: /* from Pass 5 */ },
  "fetch": { threshold: 20000, template: /* */ },
  // ...
};

export function applyTruncation(
  toolName: string,
  data: any,
  metadata: { total?: number; nextCursor?: string }
): { data: any; truncated: boolean; guidance?: string } {
  const config = TRUNCATION_CONFIG[toolName];
  if (!config) return { data, truncated: false };
  
  const tokenCount = estimateTokens(JSON.stringify(data));
  if (tokenCount <= config.threshold) {
    return { data, truncated: false };
  }
  
  // Truncate intelligently
  const truncated = truncateData(data, config.threshold);
  const guidance = renderGuidanceTemplate(config.template, {
    N: getItemCount(truncated),
    Total: metadata.total ?? "many",
    next_cursor: metadata.nextCursor,
  });
  
  return { data: truncated, truncated: true, guidance };
}
```

---

## 8. Error handling generation

```typescript
// runtime/errors.ts (generated)

export function handleUpstreamError(err: any, toolName: string) {
  // Categorize error
  const category = categorizeError(err);
  
  // Generate teaching error message per Anthropic guidance
  const message = ERROR_TEMPLATES[category]?.(err, toolName) ?? defaultErrorMessage(err);
  
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      error: category,
      message,
      retry_safe: ["network_timeout", "rate_limit"].includes(category),
    },
  };
}

const ERROR_TEMPLATES = {
  "401_unauthorized": (err, tool) => 
    `Authentication failed for ${tool}. Verify your credentials are valid and not expired. ` +
    `If using stored credentials, rotate via dashboard.`,
  
  "404_not_found": (err, tool) =>
    `Resource not found: ${err.path}. Verify the ID is correct (check format ${SMART_ID_FORMAT}) ` +
    `or use search() first to discover valid IDs.`,
  
  "429_rate_limit": (err, tool) =>
    `Rate limit hit. Retry-After: ${err.retry_after}s. ` +
    `Consider batching operations or applying filters to reduce calls.`,
  
  "validation_error": (err, tool) =>
    `Input validation failed: ${err.details}. ` +
    `Check parameter formats against tool schema. Common issue: ${err.suggestion}.`,
  
  // ...
};
```

---

## 9. Pipeline

```
┌─────────────────────────────────────────────────────┐
│  PHASE 1: Project scaffold generation               │
│                                                      │
│  Generate:                                           │
│  - package.json                                      │
│  - wrangler.toml                                     │
│  - tsconfig.json                                     │
│  - README.md                                         │
│                                                      │
│  Time: <1s                                           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  PHASE 2: Schema generation                         │
│                                                      │
│  Generate:                                           │
│  - schemas/inputs.ts (all Zod input schemas)        │
│  - schemas/outputs.ts (all Zod output schemas)      │
│  - schemas/routing.ts (routing tables)              │
│                                                      │
│  Time: <1s                                           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  PHASE 3: Runtime modules generation                │
│                                                      │
│  Generate:                                           │
│  - runtime/smart_id.ts                              │
│  - runtime/pagination.ts                            │
│  - runtime/truncation.ts                            │
│  - runtime/upstream.ts                              │
│  - runtime/response_shaping.ts                      │
│  - runtime/errors.ts                                │
│                                                      │
│  Time: <1s                                           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  PHASE 4: Auth code generation                      │
│                                                      │
│  Generate per auth_mode:                             │
│  - auth/middleware.ts                                │
│  - auth/credentials.ts                               │
│                                                      │
│  Time: <1s                                           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  PHASE 5: Tool handlers generation                   │
│                                                      │
│  For each tool, generate:                            │
│  - tools/<tool_name>.ts                             │
│                                                      │
│  Plus:                                               │
│  - tools/index.ts (registers all)                    │
│  - server.ts (server initialization)                 │
│  - index.ts (worker entry)                           │
│                                                      │
│  Time: 2-3s                                          │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  PHASE 6: TypeScript validation (deterministic)     │
│                                                      │
│  Run tsc --noEmit on generated code:                │
│  - Catches typos в template substitution            │
│  - Verifies all imports resolve                      │
│  - Catches schema/runtime mismatches                 │
│                                                      │
│  If errors → log + retry with debug info             │
│  Time: 3-5s                                          │
└─────────────────────────────────────────────────────┘
```

**Why TypeScript validation step:** templates с substitution могут produce invalid TS. Catching at codegen time лучше чем at deploy time.

---

## 10. Input

```python
class StageEInput(BaseModel):
    server_name: str
    spec_info: SpecInfo
    auth_config: AuthConfig                       # from Pass 0
    auth_mode: Literal["passthrough", "stored", "oauth"]
    final_tools: list[FinalTool]                  # from Pass 5 (full tool definitions)
    smart_id_schema: SmartIdSchema                # from Pass 1
    upstream_base_url: str
    target_runtime: Literal["cloudflare_workers"] # MVP only this
```

---

## 11. Output

```python
class StageEOutput(BaseModel):
    files: dict[str, str]                         # path → content
    file_count: int
    total_lines: int
    typescript_validation_passed: bool
    flags: StageEFlags
    
class StageEFlags(BaseModel):
    template_warnings: list[str]                  # template substitutions с issues
    typescript_errors: list[str]                  # if validation failed
    unsupported_features: list[str]               # spec features we couldn't fully support
```

`files` — это полное file tree, готовое к записи в R2 storage и deploy на Cloudflare Workers for Platforms.

---

## 12. Programmatic validation (Phase 6)

| Check | Action |
|---|---|
| All template substitutions complete (no `{{...}}` remaining) | Fail, regenerate |
| TypeScript compiles (`tsc --noEmit`) | Fail если errors, log details |
| All imports resolve | Fix missing template includes |
| All Zod schemas valid | Validate by parsing с test data |
| wrangler.toml has all required bindings | Add missing |
| README.md has setup instructions | Verify auth section present |

---

## 13. Edge cases

**E1. Spec uses non-JSON request bodies (multipart, urlencoded, XML).**
Templates handle JSON well; non-JSON requires special generation. **MVP scope:** support multipart for file uploads (image/PDF). Other types → fall back to passing raw body. Flag.

**E2. Upstream API requires custom request signing (AWS Sig V4).**
Need crypto primitives in Worker. Use `aws4fetch` library. Auth mode automatically detected как "stored с custom_signer".

**E3. Spec has circular `$ref` в schemas.**
Resolved already at Stage A, но TypeScript types might reference each other. Use forward declarations in generated TypeScript.

**E4. Tool handler needs more than ~5 sub-operations (workflow tool с many steps).**
Templates generate sequential. If > 5 steps, add comment "Consider parallelization" but keep sequential for MVP.

**E5. Generated code exceeds Cloudflare Workers size limit (10 MB).**
Unlikely для typical server (~50 KB), but possible для huge specs. **Mitigation:** split tools into separate Workers (one per namespace), use Service Bindings.

**E6. Spec uses unusual HTTP methods (PROPFIND, etc.).**
Not in MVP. Filter в Pass 0 already. Stage E only handles GET/POST/PUT/PATCH/DELETE.

**E7. Multi-environment spec (sandbox vs production base URLs).**
Generate config с environment variable for `UPSTREAM_BASE_URL`. User sets on deploy.

**E8. OAuth refresh token expiry handling.**
Generated by `workers-oauth-provider` library. We just configure scopes. Refresh logic is library's responsibility.

**E9. Webhooks from upstream (incoming).**
Out of MVP scope. We generate outbound API wrappers, not webhook receivers.

**E10. Generated server has same name as existing deployment.**
Versioning при deploy: `{server_name}-v{generation_number}`. User explicit override available.

---

## 14. Cost & latency

For typical server (10 tools, ~30 generated files):

| Phase | Cost | Latency |
|---|---|---|
| Phase 1 (scaffold) | $0 | <1s |
| Phase 2 (schemas) | $0 | <1s |
| Phase 3 (runtime) | $0 | <1s |
| Phase 4 (auth) | $0 | <1s |
| Phase 5 (handlers) | $0 | 2-3s |
| Phase 6 (TS validation) | $0 | 3-5s |
| **Total** | **$0** | **~5-12s** |

**Самый дешёвый stage** — pure deterministic.

---

## 15. Golden eval set

Минимум 4 cases.

### G1: Stripe MCP (passthrough auth)

Expected:
- Generates ~30 files
- All 6 universal tools + ~6 action handlers
- Pass-through auth middleware
- Smart ID parsing для Charge/Customer/Subscription/PaymentIntent
- TypeScript compiles cleanly
- wrangler.toml ready for deploy

### G2: Google Gmail MCP (OAuth)

Expected:
- OAuth flow с workers-oauth-provider
- Scope handling
- Token refresh logic (provided by library)
- Stored credentials encryption

### G3: Notion MCP (passthrough, simple)

Expected:
- Minimal generated code (~25 files)
- 6 universal tools, no extras
- Simplest possible handlers

### G4: Workflow tool с partial failure handling (Calendar API)

Expected:
- `schedule_event` workflow generates explicit step sequence
- Partial failure error messages descriptive
- Each step's error reported with which step failed

CI threshold: 4/4 must pass (small set, all critical for deployability).

---

## 16. Что Stage E НЕ делает

- НЕ запускает agent eval (Stage F)
- НЕ deploys к Cloudflare (separate deploy step in Control Plane)
- НЕ runs against real upstream API (validation only static)
- НЕ writes documentation beyond README skeleton (Quality Report — separate)

Stage E produces **production-ready code** ready for deploy. Validation it actually works — Stage F.

---

## 17. Открытые вопросы

❓ **Code Mode integration в v2.x.** Если user has 200+ endpoints API — native tools approach даже с Six-Tool consolidation становится heavy. Code Mode option: дополнительные 2 tools `search_code()` + `execute_code()` поверх existing 6. **Decision:** post-MVP feature, требует sandbox infrastructure work.

❓ **Multi-runtime support.** Currently only Cloudflare Workers. Adding Node.js runtime, Deno, Vercel Edge — это 4x templates. **Decision:** Cloudflare-only в MVP. Adding другие runtimes — based on user demand.

❓ **Streaming responses.** MCP supports streaming (server-sent events). Some upstream APIs return streaming. Generated code currently buffers. **Decision:** v1.x feature.

❓ **Output formatting / pretty-print preferences.** Some users want consistent code style (Prettier config). Currently generate с reasonable defaults. **Decision:** Pro feature — configurable Prettier rules.

❓ **Generated tests.** We generate `tests/smoke.ts` — basic invocation test. Should we generate full test suite (per-tool tests against mocked upstream)? **Decision:** smoke tests only в MVP. Full test generation — v1.1.

❓ **Versioning strategy для regenerations.** When user regenerates after spec drift, how to preserve customizations they might have made? **Decision:** в MVP, regeneration overwrites. Customizations должны быть в separate config files. Pro feature: 3-way merge (their changes + new generation + base).

---

## 18. Финальные decisions

1. ✅ **Native MCP tools** (не Code Mode), на Cloudflare Workers
2. ✅ **Jinja2 templates** для всех files — 100% deterministic
3. ✅ **TypeScript validation** через `tsc --noEmit` встроена в pipeline
4. ✅ **Three auth modes** — passthrough, stored, OAuth via workers-oauth-provider
5. ✅ **Per-tool-type templates** — different patterns per universal/action/workflow/specialized
6. ✅ **Smart ID parsing** — runtime module с regex patterns from Pass 1
7. ✅ **Pagination/truncation runtime** — config-driven from Pass 5
8. ✅ **Error templates** — teach agent next step (per Anthropic principle)
9. ✅ **MCP 2025-06-18 spec** — `outputSchema` + `structuredContent` + `content` returned
10. ✅ **Total time ~5-12s** — fast enough for "live" UX
11. ✅ **No LLM calls** — pure templates + validation

---

## Appendix A — Sources

1. **MCP Protocol Spec** (2025-06-18) — tool/server requirements
   https://modelcontextprotocol.io/specification/2025-06-18/server/tools

2. **Cloudflare workers-oauth-provider** — OAuth 2.1 implementation
   https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/

3. **Stainless** — "Generate MCP servers from OpenAPI specs"
   https://www.stainless.com/blog/generate-mcp-servers-from-openapi-specs
   Production-proven OpenAPI → MCP codegen reference.

4. **@modelcontextprotocol/sdk** — official MCP TypeScript SDK
   https://github.com/modelcontextprotocol/typescript-sdk

5. **Cloudflare Code Mode** — alternative approach
   https://blog.cloudflare.com/code-mode/
   Reference для post-MVP option.

6. **Hono framework** — minimal TypeScript HTTP framework
   https://hono.dev/

7. **Zod** — runtime schema validation (TypeScript-first)
   https://zod.dev/
