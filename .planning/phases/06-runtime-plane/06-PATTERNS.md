# Phase 6: Runtime Plane — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** ~50 file groups across `apps/`, `packages/`, `infrastructure/`, `tests/`
**Analogs found:** 47 / 50 (3 truly-greenfield apps documented with closest-cousin templates)
**Workstream:** runtime

> Phase 6 is **implementation-on-frozen-contract**: every signature is locked (FND-06 `Runtime`, FND-04 `UsageEvent`, FND-08 db schema, FND-14 idempotency). Only bodies and *new files* land. The pattern map below ties each Phase-6 file to a concrete in-repo analog (or, for the 3 greenfield apps, to a closest-cousin scaffold + the verbatim Stage-E / RESEARCH excerpt the planner must follow).

---

## File Classification

### Wave 0 (blocking — schema migrations + new app scaffolds)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` | migration | schema-DDL | `infrastructure/neon/migrations/20260427000000_init_schema.sql` (Phase 1 init) | exact (same convention, ALTER TABLE) |
| `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` | migration | schema-DDL | same as above | exact |
| `apps/tenant-worker-runner/` (new app scaffold) | service / supervisor | event-driven (process lifecycle) | `apps/dispatch/` Hono scaffold + `Bun.spawn` (no in-repo analog for child-process supervisor) | partial (Hono shape only; lifecycle is greenfield) |
| `apps/inngest-dev/` (new app scaffold) | service / function host | event-driven (cron + queue) | `infrastructure/inngest/functions/` (empty Phase-1 stub) | role-match only |
| `tests/runtime/` (new workspace package) | E2E test harness | request-response | `apps/api/tests/contract.test.ts` + `packages/runtime-sdk/tests/interface.test.ts` | role-match (vitest pattern) |
| `tests/runtime/fixtures/smart-id-fuzz.ts` | test fixture | static data | `packages/contracts/tests/usage-event.test.ts` cross-package regex extraction | role-match |
| `tests/runtime/fixtures/mock-mcp-clients.ts` | test fixture | static data | none — first MCP client mock fixture | greenfield |

### Wave 1 — Dispatch + apps/dispatch-sample wired through

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/dispatch/src/index.ts` (replace 404 stub) | controller / router | request-response | itself (Phase-1 scaffold — same Hono entry shape) + `apps/api/src/index.ts` (route composition) | exact |
| `apps/dispatch/src/middleware/hostHeaderValidation.ts` (NEW) | middleware | request-response | RESEARCH §"Pitfall 7" Hono port (verbatim ~12 lines) | exact (canonical excerpt) |
| `apps/dispatch/src/middleware/auth.ts` (NEW) | middleware | request-response | `apps/dispatch-sample/src/auth/middleware.ts` (per-request Bearer extract) | role-match (different scope: tenant key vs user JWT) |
| `apps/dispatch/src/middleware/rateLimit.ts` (NEW) | middleware | request-response | none (greenfield in-memory bucket) | greenfield |
| `apps/dispatch/src/middleware/tenantLookup.ts` (NEW) | middleware | request-response | none (greenfield; reads `deployments` via Drizzle) | greenfield |
| `apps/dispatch/src/middleware/capabilityGate.ts` (NEW) | middleware | request-response (with body rewrite) | RESEARCH Example 6 (verbatim) | exact (canonical excerpt) |
| `apps/dispatch/src/middleware/smartIdFuzz.ts` (NEW) | middleware | request-response (body inspect) | RESEARCH Example 2 (verbatim) | exact (canonical excerpt) |
| `apps/dispatch/src/routing/forward.ts` (NEW) | controller | request-response (proxy) | RESEARCH §"Pattern 2" verbatim | exact |
| `apps/dispatch/src/tenant-cache.ts` (NEW) | utility / cache | request-response | none — wraps `unstorage` memory driver | role-match (`unstorage` library API) |
| `apps/dispatch/src/protocol-negotiator.ts` (NEW) | utility | request-response (parse + rewrite) | folded into `capabilityGate.ts` per RESEARCH §"Recommended Project Structure"; planner picks file split | exact |
| `apps/dispatch/src/smart-id-fuzz.ts` (NEW) | utility | parse | folded into `smartIdFuzz.ts` middleware (above) | exact |
| `apps/dispatch-sample/src/index.ts` (replace `createStubRuntime()`) | controller | request-response | itself (Phase-1 hand-coded sample) | exact (same shape; only factory swap) |
| `apps/dispatch-sample/src/tools/customers_search.ts` | controller / tool handler | request-response | itself (Phase-1 stub) — same signature, real upstream call body | exact |
| `apps/dispatch-sample/src/tools/charges_fetch.ts` | controller / tool handler | request-response | same as above | exact |
| `apps/dispatch-sample/src/tools/subscriptions_list.ts` | controller / tool handler | request-response | same as above | exact |
| `apps/dispatch-sample/src/auth/middleware.ts` (use `@mcpgen/runtime`) | middleware | request-response | itself (Phase-1) — replace inline check with `import { passthroughMiddleware } from '@mcpgen/runtime'` | exact |
| `tests/runtime/dispatch.routing.test.ts` (NEW) | test | integration | `packages/runtime-sdk/tests/interface.test.ts` (vitest describe/it pattern) | role-match |
| `tests/runtime/capability-gating.test.ts` (NEW) | test | integration | same as above | role-match |
| `tests/runtime/smart-id-fuzz.test.ts` (NEW) | test (fuzz) | integration | same as above | role-match |
| `tests/runtime/host-header-validation.test.ts` (NEW) | test | unit | same as above | role-match |
| `tests/runtime/dispatch-sample.e2e.test.ts` (NEW) | test (E2E) | integration | none (first E2E test in repo) | greenfield |

### Wave 2 — Real `@mcpgen/runtime` factory + 11 method bodies

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/runtime-sdk/src/index.ts` (replace stubs with real factory) | service factory | n/a (constructor) | itself (FROZEN surface; only bodies change) | exact |
| `packages/runtime-sdk/src/runtime/smart_id.ts` (NEW; canonical naming `impl/smartId.ts` per RESEARCH) | utility | parse / format | RESEARCH Example 2 verbatim (`parseSmartId`/`makeSmartId`) | exact |
| `packages/runtime-sdk/src/runtime/routes/search.ts` (NEW) | service / router method | request-response | `apps/dispatch-sample/src/tools/customers_search.ts` (handler shape) | role-match |
| `packages/runtime-sdk/src/runtime/routes/fetch.ts` (NEW) | service / router method | request-response | `apps/dispatch-sample/src/tools/charges_fetch.ts` | role-match |
| `packages/runtime-sdk/src/runtime/routes/list_collections.ts` (NEW) | service / router method | request-response | none — derived from `RoutingRule` (consume `@mcpgen/ir`) | greenfield (canonical excerpt: Stage E §3.3) |
| `packages/runtime-sdk/src/runtime/routes/list_objects.ts` (NEW) | service / router method | request-response | `apps/dispatch-sample/src/tools/subscriptions_list.ts` (closest list handler) | role-match |
| `packages/runtime-sdk/src/runtime/routes/upsert.ts` (NEW) | service / router method | request-response | none — smart routing (create vs update) | greenfield |
| `packages/runtime-sdk/src/runtime/routes/delete.ts` (NEW) | service / router method | request-response | none — smart routing by `type` | greenfield |
| `packages/runtime-sdk/src/runtime/shape_response.ts` (NEW) | transform | function-call | none — Pass 5 `ResponseConfig` consumer | greenfield (Pass 5 design §"FieldFilteringConfig") |
| `packages/runtime-sdk/src/runtime/apply_field_filter.ts` (NEW) | transform | function-call | same as above | greenfield |
| `packages/runtime-sdk/src/runtime/handle_upstream_error.ts` (NEW) | error-shape | function-call | `apps/api/src/instrumentation.ts` `beforeSend` denylist pattern (closest "structured error shaper" in repo) | partial (different domain — error vs sentry event) |
| `packages/runtime-sdk/src/runtime/sentry-redaction.ts` (NEW) | observability helper | function-call | `apps/api/src/instrumentation.ts` `beforeSend` (verbatim shape — extends header denylist) | exact (canonical analog) |
| `packages/runtime-sdk/src/runtime/host-header-validation.ts` (NEW) | middleware | request-response | RESEARCH §"Pitfall 7" Hono port | exact (12-line excerpt) |

### Wave 3 — Three upstream-credential modes

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/runtime-sdk/src/auth/passthrough.ts` (NEW) | service / crypto | request-response | RESEARCH Example 3 (verbatim HKDF + AES-GCM via Web Crypto) | exact |
| `packages/runtime-sdk/src/auth/stored.ts` (NEW) | service / crypto | request-response (DB-backed) | RESEARCH Example 4 (verbatim `bun:sqlite` + AES-KW DEK wrap) | exact |
| `packages/runtime-sdk/src/auth/oauth-stub.ts` (NEW) | service / stub | request-response | RESEARCH Example 5 (verbatim structured-501 throw) | exact |
| `packages/runtime-sdk/src/auth/index.ts` (NEW — auth-mode dispatcher) | service / router | function-call | RESEARCH §"Pattern 7" verbatim (mode discriminated dispatch) | exact |
| `tests/runtime/passthrough-credentials.test.ts` (NEW) | test (security) | integration | `packages/contracts/tests/usage-event.test.ts` (Zod parse pattern) | role-match |
| `tests/runtime/pii-leak-audit.test.ts` (NEW) | test (deliberate-leak) | security audit | none (first deliberate-leak fixture) | greenfield |
| `tests/runtime/stored-credentials-aes.test.ts` (NEW) | test (security) | unit + integration | same as passthrough test | role-match |
| `tests/runtime/oauth-stub.test.ts` (NEW) | test | unit | `packages/runtime-sdk/tests/interface.test.ts` (throw-pattern test) | exact (same throw assertion shape) |
| `tests/runtime/sentry-redaction.test.ts` (NEW) | test (security) | unit | `apps/api/tests/contract.test.ts` (instrumentation header redaction test, if present) | role-match |

### Wave 4 — Usage-event pipeline (Inngest dev + fallback + reconciler skeleton)

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/runtime-sdk/src/runtime/usage/emit.ts` (NEW) | service / publisher | event-driven (fire-and-forget) | RESEARCH Example 7 verbatim (`waitUntil` shim + Inngest dev POST + fallback catch) | exact |
| `packages/runtime-sdk/src/runtime/usage/fallback.ts` (NEW) | utility / writer | file-I/O | RESEARCH Example 4 (`bun:sqlite` schema pattern) | role-match |
| `apps/inngest-dev/src/functions/usage-events-ingest.ts` (NEW; canonical id `usage-events-ingest-v1`) | function / consumer | event-driven (Inngest event) | RESEARCH Example 8 verbatim | exact |
| `apps/inngest-dev/src/functions/usage-fallback-drain.ts` (NEW; id `usage-fallback-drain-v1`) | function / cron | batch / cron | RESEARCH §"Pattern 5" Inngest function-id pattern | exact |
| `apps/inngest-dev/src/functions/usage-reconciler.ts` (NEW; id `usage-reconciler-v1`) | function / cron | batch / cron | RESEARCH §"Pattern 5" verbatim (`{ cron: '0 2 * * *' }` daily) | exact |
| `apps/inngest-dev/src/functions/warm-keep-active-tenants.ts` (NEW; id `warm-keep-active-tenants-v1`) | function / cron | batch / cron | RESEARCH §"Pattern 5" + D-18 (5-min `/health` ping) | exact |
| `apps/inngest-dev/src/db.ts` (NEW — Drizzle client) | utility | data-access | none in this repo yet (Phase 1 froze schema; no Drizzle client app yet) | greenfield (Drizzle ORM standard) |
| `apps/inngest-dev/src/index.ts` (Bun + Inngest serve) | service / boot | event-driven | `apps/dispatch-sample/src/index.ts` Bun-fetch shape | role-match |
| `tests/runtime/usage-events-pipeline.test.ts` (NEW) | test (integration) | integration | `packages/contracts/tests/usage-event.test.ts` (Zod assertion + DB stubbing) | role-match |

### Wave 5 — `mcpgen deploy` CLI + binary matrix + P99 + warm-keep verification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/cli/src/index.ts` (real deploy registration) | CLI / wiring | request-response | itself (Phase-1 stub Commander skeleton) | exact (only `.action()` body changes) |
| `apps/cli/src/commands/deploy.ts` (NEW) | CLI subcommand | request-response | RESEARCH Example 9 verbatim | exact |
| `apps/cli/src/commands/deploy-cf-deferral.ts` (NEW) | CLI subcommand stub | static / exit | `infrastructure/cloudflare/scripts/create-namespaces.sh` exit-78 pattern | exact (verbatim deferral idiom) |
| `apps/cli/src/runner-client.ts` (NEW) | utility / HTTP client | request-response | none — talks to `apps/tenant-worker-runner/admin/*` | greenfield |
| `apps/cli/src/claude-desktop-config.ts` (NEW) | utility / file-I/O | file-I/O | none — first config-emitter in repo | greenfield (RESEARCH §"Pitfall 9" gives the path table) |
| `apps/cli/build.ts` (CI matrix hardening) | build script | batch | itself (Phase-1 4-target loop) | exact |
| `.github/workflows/runtime-ci.yml` (real triggers) | CI workflow | CI pipeline | itself (Phase-1 entry-point marker) + `.github/workflows/main-ci.yml` (real job patterns) | exact |
| `apps/tenant-worker-runner/tests/p99-load.test.ts` (NEW) | load test | load | none (first load test in repo) | greenfield (Bun-native script) |
| `apps/cli/tests/deploy.test.ts` (NEW) | test | integration | `packages/runtime-sdk/tests/interface.test.ts` (vitest pattern) | role-match |
| `apps/cli/tests/deploy-cf-deferral.test.ts` (NEW) | test | unit | same as above | role-match |
| `apps/cli/tests/claude-desktop-config.test.ts` (NEW) | test | unit | same as above | role-match |

---

## Pattern Assignments

### `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` (migration, schema-DDL)

**Closest analog:** `infrastructure/neon/migrations/20260427000000_init_schema.sql` — same `prefix: 'timestamp'` Drizzle convention, same hand-augmented header.

**Filename + header pattern** (Phase-1 init schema, lines 1–10 verbatim shape):

```sql
-- ─── Phase 6 add local_port to deployments (RUN-01 / Open Question #1) ────
-- Generated by drizzle-kit, then manually augmented if needed.
-- DO NOT auto-regenerate this file; subsequent schema changes go in NEW migration
-- files with timestamp prefix > 20260428000000.
--
-- Filename `20260428000000_add_local_port_to_deployments.sql` is FROZEN; the
-- timestamp prefix mitigates Pitfall #18 per FND-08 / docs/decisions/001.
```

**ALTER TABLE pattern** (planner authors via `pnpm --filter @mcpgen/contracts drizzle-kit:generate` after editing `db-schema.ts`; here is the expected DDL shape):

```sql
ALTER TABLE "deployments" ADD COLUMN "local_port" integer;
-- local_port is NULL for Phase-10 CF deploys; set for Phase-6 local deploys (RESEARCH A4)
```

**Workflow** (mandatory per `db-schema.ts` lines 17–19): edit `packages/contracts/src/db-schema.ts` → run drizzle-kit generate → commit BOTH the schema change AND the new migration file (NEW timestamp prefix; NEVER edit a committed migration in place).

---

### `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` (migration, schema-DDL)

**Closest analog:** same as above. Resolves RESEARCH Open Question #6 — current `usage_events` has no `idempotency_key` column despite the FROZEN Zod schema (`packages/contracts/src/usage-event.ts` line 37) declaring it.

**Expected DDL shape:**

```sql
ALTER TABLE "usage_events" ADD COLUMN "idempotency_key" text NOT NULL;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_dep_idem_unique"
  UNIQUE ("deployment_id", "idempotency_key");
```

**Cross-workstream coordination:** triggers a paired `chore(contracts): align usage-event idempotency_key with usage_events DB column` PR per D-21 (FND-04 frozen schema vs migrated DB drift). Wave 0 owns this.

---

### `apps/dispatch/src/index.ts` (controller, request-response)

**Closest analog:** itself — Phase-1 scaffold lines 13–30 already declares the Hono `Bindings` interface and the `app.fetch` portability invariant. Phase 6 only replaces the 404 stub with the real router.

**Imports + bindings pattern** (Phase-1 lines 13–22 — KEEP verbatim; planner extends):

```typescript
import { Hono } from 'hono';

interface Bindings {
  DISPATCH_NAMESPACE: DispatchNamespace;
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();
app.get('/health', (c) => c.json({ status: 'ok', service: 'dispatch' }));
```

**Real router pattern** (RESEARCH Example 1 verbatim — replaces the Phase-1 `app.all('*', 404)`):

```typescript
import { hostHeaderValidation } from './middleware/hostHeaderValidation.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { tenantLookup } from './middleware/tenantLookup.js';
import { capabilityGate } from './middleware/capabilityGate.js';
import { smartIdFuzz } from './middleware/smartIdFuzz.js';
import { forwardToTenant } from './routing/forward.js';

const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1').split(',');

app.use('*', hostHeaderValidation(allowedHosts));     // D-15
app.use('*', authMiddleware);                          // Bearer JWT precheck
app.use('*', rateLimit);                               // in-memory bucket
app.use('*', tenantLookup);                            // unstorage 5-min TTL
app.use('*', capabilityGate);                          // D-11 protocolVersion
app.use('*', smartIdFuzz);                             // D-03 / pitfall #1
app.all('*', forwardToTenant);                         // fetch :879N

// Bun (Phase 6):
export default { port: 8789, fetch: app.fetch };
// Phase 10 (CF Workers): export default app;
```

**Multi-route composition pattern** (cross-reference `apps/api/src/index.ts` lines 33–35 — `app.route('/api/v1/generate', generateRoute)`): if planner factors middleware into per-area Hono sub-apps, follow that pattern.

---

### `apps/dispatch/src/middleware/hostHeaderValidation.ts` (middleware, request-response — D-15)

**Closest analog:** RESEARCH §"Pitfall 7" — verbatim 12-line Hono port (canonical, cited from `github.com/modelcontextprotocol/typescript-sdk/packages/middleware`).

**Full pattern** (use as-is):

```typescript
import type { MiddlewareHandler } from 'hono';

export function hostHeaderValidation(allowed: ReadonlyArray<string>): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.split(':')[0] ?? '';
    if (!allowed.includes(host)) return c.json({ error: 'invalid_host' }, 403);
    return next();
  };
}
```

**Same module re-exported** by `packages/runtime-sdk/src/runtime/host-header-validation.ts` so that every generated tenant Worker imports the same impl (D-15 + Stage E template injection point).

---

### `apps/dispatch/src/middleware/capabilityGate.ts` (middleware, body rewrite — D-11 / pitfall #4)

**Closest analog:** RESEARCH Example 6 — verbatim. No in-repo precedent for body-rewrite middleware; use the cited pattern.

**Full pattern** (excerpt — RESEARCH Example 6 ~30 lines, planner copies):

```typescript
const sessionVersions = new Map<string, string>(); // sessionId → protocolVersion

export const capabilityGate: MiddlewareHandler = async (c, next) => {
  const sid = c.req.header('Mcp-Session-Id');
  const cloned = c.req.raw.clone();
  let body: { method?: string; params?: { protocolVersion?: string } } = {};
  try { body = await cloned.json(); } catch {}

  if (body?.method === 'initialize' && body.params?.protocolVersion) {
    if (!sid) {
      const newSid = crypto.randomUUID();
      sessionVersions.set(newSid, body.params.protocolVersion);
      c.header('Mcp-Session-Id', newSid);
    } else {
      sessionVersions.set(sid, body.params.protocolVersion);
    }
  }
  await next();

  const pv = sid ? sessionVersions.get(sid) : undefined;
  if (pv && pv < '2025-06-18') {
    const text = await c.res.clone().text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { return; }
    const downgraded = downgradeForLegacy(json, body?.method);
    c.res = new Response(JSON.stringify(downgraded), {
      status: c.res.status, headers: c.res.headers,
    });
  }
};
```

**Body-cloning idiom** (RESEARCH Assumption A8): `c.req.raw.clone()` works identically on Bun and CF Workers — the rewrite shape is portable.

---

### `apps/dispatch/src/middleware/smartIdFuzz.ts` (middleware, body inspect — D-03 / pitfall #1)

**Closest analog:** RESEARCH Example 2 verbatim (`smartIdFuzz` middleware) + `parseSmartId` from `@mcpgen/runtime` (single source of truth — D-07).

**Full pattern** (RESEARCH Example 2):

```typescript
import type { MiddlewareHandler } from 'hono';
import { parseSmartId } from '@mcpgen/runtime';

export const smartIdFuzz: MiddlewareHandler = async (c, next) => {
  const tenantPrefix = c.get('tenantPrefix') as string; // set by tenantLookup
  const cloned = c.req.raw.clone();
  let body: unknown;
  try { body = await cloned.json(); } catch { return next(); }

  const candidates = collectSmartIdCandidates(body);
  for (const candidate of candidates) {
    try {
      const sid = parseSmartId(candidate);
      if (sid.server !== tenantPrefix) {
        return c.json(
          { error: 'smart_id_tenant_mismatch', expected_prefix: tenantPrefix, received_prefix: sid.server },
          403,
        );
      }
    } catch { /* not a smart-id; ignore */ }
  }
  return next();
};
```

**Cross-phase invariant** (per CONTEXT specifics §"Cross-tenant smart-ID fuzz test"): same `parseSmartId` call lives in F1 fuzz fixture (Phase 5 — static) AND this dispatch middleware (Phase 6 — dynamic). Two consumers, one regex, sourced from `packages/ir/src/types.ts SmartIdSchema`.

---

### `apps/dispatch/src/routing/forward.ts` (controller, proxy)

**Closest analog:** RESEARCH §"Pattern 2" verbatim (multi-port routing via `fetch`).

**Full pattern:**

```typescript
import type { Context } from 'hono';

export async function forwardToTenant(c: Context): Promise<Response> {
  const scriptName = c.get('scriptName') as string;
  const port = c.get('localPort') as number; // set by tenantLookup
  const tenantUrl = new URL(c.req.url);
  tenantUrl.host = `localhost:${port}`;
  return fetch(tenantUrl, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    // @ts-expect-error — Bun supports duplex on streaming bodies
    duplex: 'half',
  });
}
```

---

### `packages/runtime-sdk/src/index.ts` (service factory — replace `createStubRuntime`)

**Closest analog:** itself. Phase 1 lines 79–99 declare `createStubRuntime()` returning `notImpl()`-throwing methods; Phase 6 keeps the export name AND signature, replaces every body.

**Phase-1 stub pattern** (lines 79–99 — STAYS as the function shape; only bodies change):

```typescript
export function createStubRuntime(): Runtime {
  const notImpl = (method: string): never => {
    throw new Error(
      `Runtime.${method}() is an interface-only stub in Phase 1; implementation lands in Phase 6 (RUN-01..05).`,
    );
  };

  return {
    parseSmartId: () => notImpl('parseSmartId'),
    // ... 10 more
  };
}
```

**Phase-6 real-factory pattern** (planner authors — same export name; rename internally to `createRuntime` if planner prefers, but `createStubRuntime` MUST be kept as a named export for backward compat with `apps/dispatch-sample/src/index.ts` line 21 import + with `packages/runtime-sdk/tests/interface.test.ts` Phase-1 throw assertions, which will be inverted by `tests/runtime/not-stubbed.test.ts` per RESEARCH Validation Architecture):

```typescript
import { parseSmartId, makeSmartId } from './runtime/smart_id.js';
import { routeSearch } from './runtime/routes/search.js';
// ... etc.

export function createRuntime(deps: RuntimeDeps): Runtime {
  return {
    parseSmartId,
    makeSmartId,
    routeSearch: (q, opts) => routeSearch(q, opts, deps),
    // ... 8 more
  };
}

// Keep backward-compat name (apps/dispatch-sample imports it at module load).
// Phase 6 no longer "stubs" — but the symbol stays bound to the real factory
// so the existing import in apps/dispatch-sample/src/index.ts still works.
export const createStubRuntime = createRuntime;
```

**FROZEN signature constraint** (`packages/runtime-sdk/src/index.ts` lines 53–70 — DO NOT touch): the 11-method `Runtime` interface is the locked contract. CI runs `pnpm typecheck` against this. Any signature change is a `chore(contracts):` PR per D-21.

---

### `packages/runtime-sdk/src/runtime/smart_id.ts` (utility, parse / format — D-07)

**Closest analog:** RESEARCH Example 2 verbatim. Source-of-truth regex from `packages/ir/src/types.ts` `SmartIdSchema` (lines 85–90).

**Full pattern** (RESEARCH Example 2):

```typescript
import type { SmartId } from '../types.js';
import { SMART_ID_REGEX } from '@mcpgen/ir'; // exported alongside SmartIdSchema

export function parseSmartId(id: string): SmartId {
  const m = SMART_ID_REGEX.exec(id);
  if (!m) throw new Error(`invalid_smart_id: ${id}`);
  const [, server, type, collection, identifier] = m;
  if (type !== 'object' && type !== 'collection' && type !== 'schema') {
    throw new Error(`invalid_smart_id_type: ${type}`);
  }
  return { server, type, collection, identifier };
}

export function makeSmartId(parts: SmartId): string {
  return `${parts.server}:${parts.type}:${parts.collection}:${parts.identifier}`;
}
```

**Single source of truth** (D-07): both this file AND `apps/dispatch/src/middleware/smartIdFuzz.ts` import from the same `parseSmartId`. No copy-paste between codebases.

---

### `packages/runtime-sdk/src/auth/passthrough.ts` (service / crypto — RUN-03)

**Closest analog:** RESEARCH Example 3 verbatim (HKDF + AES-GCM via Web Crypto). No in-repo crypto code yet.

**Full pattern** (RESEARCH Example 3 — ~30 lines; planner copies):

```typescript
const TEXT_ENCODER = new TextEncoder();

async function deriveKey(secretMaterial: ArrayBuffer, info: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', secretMaterial, { name: 'HKDF' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: TEXT_ENCODER.encode('mcpgen.passthrough.v1'),
      info: TEXT_ENCODER.encode(info),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt'],
  );
}

export async function decryptPassthrough(req: Request, tenantId: string): Promise<string> {
  const blob = req.headers.get('X-Upstream-Auth');
  if (!blob) throw new Error('missing_x_upstream_auth');
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const key = await deriveKey(getTenantSecret(tenantId), `tenant:${tenantId}`);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plaintext);
  // CRITICAL: never log `blob`, `raw`, `plaintext` — beforeSend redactor catches residuals.
}
```

**Privacy-LOCKED constraint:** never log the credential, never persist it. Outbound chokepoint (Sentry `beforeSend`) catches residuals.

---

### `packages/runtime-sdk/src/auth/stored.ts` (service / crypto — RUN-04)

**Closest analog:** RESEARCH Example 4 verbatim (`bun:sqlite` + AES-KW DEK wrap pattern from `docs/mcpgen-architecture.md` §14).

**Schema + decrypt pattern** (RESEARCH Example 4):

```typescript
import { Database } from 'bun:sqlite';

const db = new Database(process.env.STORED_CREDS_DB ?? 'stored-creds.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_creds (
    tenant_id TEXT NOT NULL,
    upstream  TEXT NOT NULL,
    iv        BLOB NOT NULL,
    ct        BLOB NOT NULL,
    wrapped_dek BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, upstream)
  );
`);

async function unwrapDek(wrapped: ArrayBuffer): Promise<CryptoKey> {
  const kek = await crypto.subtle.importKey(
    'raw',
    Buffer.from(process.env.RUNTIME_KEK!, 'base64'),
    { name: 'AES-KW' }, false, ['unwrapKey'],
  );
  return crypto.subtle.unwrapKey(
    'raw', wrapped, kek, { name: 'AES-KW' },
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

export async function decryptStored(tenantId: string, upstream: string): Promise<string> {
  const row = db.query(
    'SELECT iv, ct, wrapped_dek FROM tenant_creds WHERE tenant_id = ? AND upstream = ?',
  ).get(tenantId, upstream) as { iv: Uint8Array; ct: Uint8Array; wrapped_dek: Uint8Array } | null;
  if (!row) throw new Error('stored_creds_not_found');
  const dek = await unwrapDek(row.wrapped_dek.buffer);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, dek, row.ct);
  return new TextDecoder().decode(plaintext);
}
```

**SQL-injection mitigation** (RESEARCH §"Security Domain"): always use `db.query('… ? …').get(arg)` parameterised form — never string-interpolate.

---

### `packages/runtime-sdk/src/auth/oauth-stub.ts` (service / stub — RUN-05)

**Closest analog:** RESEARCH Example 5 verbatim. CONTEXT D-10 prescribes the exact stub shape; FE-04 (frontend) reads it.

**Full pattern** (use as-is):

```typescript
export function oauthStub(): never {
  const err = new Error('oauth_mode_phase_10_deferral');
  Object.assign(err, {
    code: 'oauth_mode_phase_10_deferral',
    message:
      'OAuth on-behalf flow ships in Phase 10 with @cloudflare/workers-oauth-provider. ' +
      'Use auth_mode = "passthrough" or "stored" until then.',
    deferred_to_phase: 10,
  });
  throw err;
}

// In the Hono error boundary (apps/tenant-worker-runner spawn template):
// app.onError((err, c) => {
//   if ((err as any).code === 'oauth_mode_phase_10_deferral') {
//     return c.json({ error: (err as any).code, message: err.message, deferred_to_phase: 10 }, 501);
//   }
//   throw err;
// });
```

**Anti-pattern to avoid:** throwing generic 500 — must return structured 501 (RESEARCH §"Anti-Patterns" + CONTEXT specifics). FE-04 detection contract reads `error: "oauth_mode_phase_10_deferral"`.

---

### `packages/runtime-sdk/src/auth/index.ts` (service / dispatcher — auth-mode routing)

**Closest analog:** RESEARCH §"Pattern 7" verbatim (atomic mode-routed dispatch).

**Full pattern:**

```typescript
import type { AuthMode } from '@mcpgen/runtime';
import { decryptPassthrough } from './passthrough.js';
import { decryptStored } from './stored.js';
import { oauthStub } from './oauth-stub.js';

export async function resolveUpstreamCredential(
  req: Request, tenant: TenantConfig, mode: AuthMode,
): Promise<string> {
  switch (mode.mode) {
    case 'passthrough': return await decryptPassthrough(req, tenant.id);
    case 'stored':      return await decryptStored(tenant.id, tenant.upstream);
    case 'oauth':       throw oauthStub();
  }
}
```

**Discriminated-union narrowing** (verified by `packages/runtime-sdk/tests/interface.test.ts` Test 4 lines 173–211): exhaustive `switch` on `mode.mode` is type-safe; planner does NOT need a `default:` fall-through because TS narrows the union completely.

---

### `packages/runtime-sdk/src/runtime/sentry-redaction.ts` (observability helper — D-16)

**Closest analog:** `apps/api/src/instrumentation.ts` lines 25–40 — exact same shape. Phase 6 extends the header denylist.

**Existing analog** (verbatim — `apps/api/src/instrumentation.ts` lines 25–40):

```typescript
export function sentryOptionsFor(env: SentryEnv) {
  return {
    dsn: env.SENTRY_DSN ?? '',
    environment: env.ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event: { request?: { headers?: Record<string, string> } }) {
      const headers = event.request?.headers;
      if (headers) {
        for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
          if (k in headers) headers[k] = '[REDACTED]';
        }
      }
      return event;
    },
  };
}
```

**Phase-6 extension** (D-16 — accept dynamic spec-declared auth headers):

```typescript
export function buildBeforeSend(extraHeaderDenylist: ReadonlyArray<string>) {
  const denylist = ['Authorization', 'X-Upstream-Auth', 'Cookie', ...extraHeaderDenylist];
  return function beforeSend(event: { request?: { headers?: Record<string, string> } }) {
    const headers = event.request?.headers;
    if (headers) {
      for (const k of denylist) {
        if (k in headers) headers[k] = '[REDACTED]';
      }
    }
    // Phase 6 also strips body / breadcrumb credential strings — see RESEARCH §"Pitfall 4".
    return event;
  };
}
```

**Auto-wired by Stage E codegen** (per Stage-E §11): every generated tenant Worker imports this and plugs into its Sentry init. `apps/dispatch-sample/src/index.ts` does the same starting Phase 6.

---

### `packages/runtime-sdk/src/runtime/usage/emit.ts` (service / publisher — RUN-06)

**Closest analog:** RESEARCH Example 7 verbatim (`waitUntil` shim + Inngest dev POST + fallback catch).

**Full pattern** (RESEARCH Example 7):

```typescript
import { ulid } from 'ulid';
import { type UsageEvent, UsageEvent as UsageEventSchema } from '@mcpgen/contracts';
import { writeFallback } from './fallback.js';

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288/e/mcpgen-dev';
const _pending = new Set<Promise<unknown>>();

export function waitUntil(p: Promise<unknown>): void {
  _pending.add(p);
  void p.finally(() => _pending.delete(p));
}

export async function emitUsageEvent(event: UsageEvent): Promise<void> {
  UsageEventSchema.parse(event);  // single-source-of-truth validation per FND-04

  const send = fetch(INNGEST_DEV_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'usage/event.recorded', data: event }),
  })
    .then(async (r) => { if (!r.ok) throw new Error(`inngest_dev_${r.status}`); })
    .catch(async (e) => {
      await writeFallback(event);
      console.warn('[usage] fallback write:', (e as Error).message);
    });

  waitUntil(send);
}
```

**Anti-pattern** (RESEARCH §"Anti-Patterns"): synchronous `await` on emit in tool response path. ALWAYS `waitUntil`.

**Phase-10 swap point:** the only line that changes is `INNGEST_DEV_URL` — replaced by `env.USAGE_QUEUE.send(event)` against the real CF Queue binding. Inngest functions stay (vendor-portable per D-12).

---

### `apps/inngest-dev/src/functions/usage-events-ingest.ts` (function / consumer — RUN-06 + CTRL-09)

**Closest analog:** RESEARCH Example 8 verbatim. Function ID `usage-events-ingest-v1` is STABLE per CTRL-09.

**Full pattern** (RESEARCH Example 8):

```typescript
import { Inngest } from 'inngest';
import { UsageEvent } from '@mcpgen/contracts';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

const inngest = new Inngest({ id: 'mcpgen' });

export const usageEventsIngest = inngest.createFunction(
  { id: 'usage-events-ingest-v1', concurrency: { limit: 25 } }, // STABLE id
  { event: 'usage/event.recorded' },
  async ({ event, step }) => {
    const parsed = UsageEvent.parse(event.data);
    await step.run('insert-timescale', async () => {
      await db.execute(sql`
        INSERT INTO usage_events (
          time, deployment_id, tool_name, tokens_in, tokens_out,
          upstream_latency_ms, worker_cpu_ms, status, client_type, error_class,
          idempotency_key
        ) VALUES (
          ${parsed.time}, ${parsed.deployment_id}, ${parsed.tool_name},
          ${parsed.tokens_in}, ${parsed.tokens_out},
          ${parsed.upstream_latency_ms}, ${parsed.worker_cpu_ms},
          ${parsed.status}, ${parsed.client_type}, ${parsed.error_class},
          ${parsed.idempotency_key}
        ) ON CONFLICT (deployment_id, idempotency_key) DO NOTHING
      `);
    });
  },
);
```

**ON CONFLICT defence-in-depth** (Wave 0 migration adds the UNIQUE constraint; insert-site uses `ON CONFLICT DO NOTHING` for redundancy per RESEARCH Open Question #6).

---

### `apps/inngest-dev/src/functions/usage-reconciler.ts` (function / cron — RUN-06 / CTRL-09)

**Closest analog:** RESEARCH §"Pattern 5" verbatim. Function ID `usage-reconciler-v1` STABLE.

**Full pattern:**

```typescript
import { Inngest } from 'inngest';
const inngest = new Inngest({ id: 'mcpgen' });

export const usageReconciler = inngest.createFunction(
  { id: 'usage-reconciler-v1' },                     // STABLE — never renamed
  { cron: '0 2 * * *' },                              // daily 02:00 UTC
  async ({ step }) => {
    // Phase 6 SKELETON: read TimescaleDB hourly aggregates, log would-be Stripe payload.
    // Phase 8 (CTRL-06/07) wires real Stripe Meters submission + drift alerting.
    /* TimescaleDB hourly query → log would-be Stripe */
  },
);
```

**Stable-string convention** (CTRL-09): version-suffixed (`-v1`); bumps via deliberate `chore(inngest): bump usage-reconciler v1 → v2` PR + decision log entry. Phase 9 audits orphan count = 0.

---

### `apps/cli/src/index.ts` (CLI / wiring — replace stub)

**Closest analog:** itself. Phase-1 lines 14–37 declare the Commander skeleton with stubs. Phase 6 replaces the `deploy` action body.

**Phase-1 stub pattern** (lines 29–35 — KEEP the `program.command('deploy')` registration; replace the `.action(() => …)` body):

```typescript
program
  .command('deploy')
  .description('Deploy a generated MCP server (Phase 6 — CLI-02).')
  .action(() => {
    console.error('Not implemented in Phase 1. Deploy command ships in Phase 6.');
    process.exit(1);
  });
```

**Phase-6 real-deploy registration** (RESEARCH Example 9 — split the action body into `commands/deploy.ts`):

```typescript
import { registerDeploy } from './commands/deploy.js';

const program = new Command();
program.name('mcpgen').description('...').version('0.0.0');
program.command('init <spec-url>').description('...').action(...); // unchanged
registerDeploy(program); // adds `deploy <bundle-dir>` with --cf flag
program.parse(process.argv);
```

---

### `apps/cli/src/commands/deploy.ts` (CLI subcommand — CLI-02 / RUN-07)

**Closest analog:** RESEARCH Example 9 verbatim.

**Full pattern:**

```typescript
import { Command } from 'commander';
import { spawnTenantWorker } from '../runner-client.js';
import { writeClaudeDesktopConfigBlock } from '../claude-desktop-config.js';
import pc from 'picocolors';

export function registerDeploy(program: Command): void {
  program
    .command('deploy <bundle-dir>')
    .option('--cf, --remote', 'deploy to Cloudflare (Phase 10 — currently deferred)')
    .option('--name <name>', 'override mcpServers slot name on collision')
    .action(async (bundleDir: string, opts: { cf?: boolean; name?: string }) => {
      if (opts.cf) {
        console.error(pc.yellow('--cf is deferred to Phase 10. See Phase-10 launch-readiness.'));
        process.exit(78);  // EX_CONFIG, matches infrastructure/cloudflare/scripts/create-namespaces.sh
      }
      const result = await spawnTenantWorker(bundleDir);
      writeClaudeDesktopConfigBlock({
        name: opts.name ?? result.scriptName,
        url: result.url,
      });
      console.log(pc.green(`✓ Deployed ${result.scriptName} → ${result.url}`));
    });
}
```

**Exit-78 convention** (RESEARCH §"Pitfall #3" + `infrastructure/cloudflare/scripts/create-namespaces.sh` line 37): `EX_CONFIG` from `sysexits.h` — "config is not in usable state". Same exit code = same deferral idiom across the repo.

---

### `apps/cli/src/commands/deploy-cf-deferral.ts` (CLI subcommand stub)

**Closest analog:** `infrastructure/cloudflare/scripts/create-namespaces.sh` lines 1–38 verbatim — exit-78 + `cat << 'ERR'` deferral banner.

**Full pattern** (mirror the .sh script's banner shape in TypeScript):

```typescript
import pc from 'picocolors';

export function emitCfDeferralBanner(): never {
  console.error(pc.yellow(`
ERROR: \`mcpgen deploy --cf\` is DEFERRED to Phase 10.

Per .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md (revision 2),
Phases 1–9 run all compute locally; CF Workers / Workers-for-Platforms /
Hyperdrive are not provisioned until launch-prep (Phase 10).

Use:  mcpgen deploy <bundle-dir>     # local Bun process on localhost:879N
`));
  process.exit(78);  // EX_CONFIG — sysexits.h "config is not in usable state"
}
```

**Verbatim consistency** with `create-namespaces.sh` is intentional — single deferral idiom across the repo.

---

### `apps/cli/src/claude-desktop-config.ts` (utility / file-I/O — RUN-07 / pitfall #30)

**Closest analog:** none in this repo. RESEARCH §"Pitfall 9" provides the canonical path table:

| OS | Config path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**Collision detection contract** (CONTEXT specifics §"One-click Claude Desktop config block"): check BOTH `mcpServers.{name}` slot AND URL — duplicates of either silently break Claude Desktop's dispatch.

**Expected shape** (planner authors):

```typescript
export interface ClaudeDesktopConfigBlock {
  name: string;
  url: string;
}

export function writeClaudeDesktopConfigBlock(opts: ClaudeDesktopConfigBlock): void {
  const path = resolveConfigPath(); // platform-specific
  const existing = readExistingConfig(path);
  if (existing.mcpServers?.[opts.name]) {
    throw new Error(`mcp_server_name_collision: ${opts.name} already exists. Use --name to override.`);
  }
  for (const [k, v] of Object.entries(existing.mcpServers ?? {})) {
    if ((v as { url?: string }).url === opts.url) {
      throw new Error(`mcp_server_url_collision: ${opts.url} is already used by '${k}'.`);
    }
  }
  // emit copy-paste block to stdout (RUN-07)
}
```

---

### `apps/cli/build.ts` (CI matrix hardening)

**Closest analog:** itself. Phase-1 already implements the 4-target loop; Phase 6 adds CI matrix verification, npm `optionalDependencies` per-OS selector, GitHub release artifact upload.

**Existing 4-target loop** (Phase-1 lines 13–43 — DO NOT touch the loop body; CI matrix wraps it):

```typescript
const targets = [
  'bun-linux-x64',
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-windows-x64',
] as const;

for (const t of targets) {
  const ext = t.includes('windows') ? '.exe' : '';
  const proc = spawn(['bun', 'build', '--compile', `--target=${t}`, ...], ...);
  // ...
}
```

**Phase-6 CI matrix design** (RESEARCH Open Question #7 — recommended): cross-compile on a single linux-x64 runner; verify each binary on its native OS. GitHub Actions matrix:
- 1 build job (ubuntu-24.04) → produces 4 binaries → uploads as artifacts
- 4 verify jobs (ubuntu-latest / macos-13 / macos-14 / windows-latest) → download artifact → run `--version`

---

### `tests/runtime/*.test.ts` (cross-app E2E + integration — D-21 ownership)

**Closest analog:** `packages/runtime-sdk/tests/interface.test.ts` (vitest describe/it pattern + `import { describe, expect, it } from 'vitest'`).

**Vitest pattern** (`packages/runtime-sdk/tests/interface.test.ts` lines 5–17 + 24–30 — KEEP shape):

```typescript
import { describe, expect, it } from 'vitest';

import {
  createStubRuntime,
  type AuthMode,
  type Runtime,
  // ...
} from '@mcpgen/runtime';

describe('Interface compiles (Test 1)', () => {
  it('imports every exported interface without error', () => {
    // ...
    expect(typeof sample.runtime.parseSmartId).toBe('function');
  });
});
```

**Throw-assertion pattern** (`interface.test.ts` lines 74–145 — adapt for "no longer throws after Phase 6"):

```typescript
// Phase 6 inverts these: every method must NOT throw the Phase-1 error.
it('parseSmartId() does NOT throw Phase-1 error', () => {
  const r = createRuntime(realDeps);
  expect(() => r.parseSmartId('sample-stripe:object:Charge:ch_x')).not.toThrow(/Phase 1/);
});
```

**Cross-package regex alignment pattern** (`packages/contracts/tests/usage-event.test.ts` lines 122–148 — copy the Zod-schema introspection trick for `tests/runtime/smart-id-fuzz.test.ts` to assert the SmartId regex from `@mcpgen/ir` is the same one used by `@mcpgen/runtime`):

```typescript
import { SmartIdSchema } from '@mcpgen/ir';
import { parseSmartId } from '@mcpgen/runtime';
// Assert the regex bound into SmartIdSchema matches the one parseSmartId uses.
```

**Cross-workstream ownership** (D-21): `tests/runtime/*` is owned by `runtime` ws. Cross-ws failures escalate as `chore(contracts):` PR.

---

### `apps/tenant-worker-runner/` (NEW APP — supervisor)

**Greenfield app — no in-repo analog.**

**Closest cousin** (planner template): `apps/dispatch/src/index.ts` Hono scaffold lines 13–30 for the admin-HTTP entry shape; `Bun.spawn` pattern from RESEARCH §"Don't Hand-Roll" + RESEARCH §"Recommended Project Structure".

**Recommended scaffold** (RESEARCH §"Recommended Project Structure" lines 269–281 verbatim):

```
apps/tenant-worker-runner/
├── src/
│   ├── index.ts                # Bun supervisor entry
│   ├── supervisor.ts           # spawn/kill/restart per deployments row
│   ├── port-allocator.ts       # next-free 8790+ (sequential)
│   └── admin/
│       ├── spawn.ts            # POST /admin/spawn
│       ├── kill.ts             # POST /admin/kill
│       └── list.ts             # GET /admin/list
├── tests/
│   ├── p99-load.ts             # D-17 Bun-native load harness
│   └── crash-restart.test.ts
└── usage-fallback.sqlite       # bun:sqlite bucket (D-12)
```

**Hono entry shape** (mirror `apps/dispatch/src/index.ts`):

```typescript
import { Hono } from 'hono';
const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok', service: 'tenant-worker-runner' }));
app.post('/admin/spawn', spawnHandler);
app.post('/admin/kill', killHandler);
app.get('/admin/list', listHandler);
export default { port: 8788, fetch: app.fetch }; // 8788 ≠ dispatch (8789) ≠ tenants (8790+)
```

**`Bun.spawn` supervisor pattern** (RESEARCH §"Don't Hand-Roll"):

```typescript
import { spawn } from 'bun';

const proc = spawn({
  cmd: ['bun', 'run', tenantBundlePath],
  env: { PORT: String(port), TENANT_ID: tenantId, RUNTIME_KEK: process.env.RUNTIME_KEK },
  stdout: 'inherit',
  stderr: 'inherit',
});
const exitCode = await proc.exited; // Promise resolves on crash
// → restart if exitCode !== 0; respect crash-loop budget
```

**Anti-pattern** (RESEARCH §"Anti-Patterns"): bash supervisor scripts. Use `Bun.spawn` for structured access to crash exit codes.

**Folded cross-tenant isolation argument** (D-04 vs cluster-mode): per-process supervision is the locked choice. Cluster-mode hides cold-start blast-radius that pitfall #14 specifically targets.

---

### `apps/inngest-dev/` (NEW APP — Inngest function host)

**Greenfield app — no in-repo analog.**

**Closest cousin:** `apps/dispatch-sample/src/index.ts` Bun-fetch shape (default-export with `port` + `fetch` is identical for Bun's `serve()` entry).

**Recommended scaffold** (RESEARCH §"Recommended Project Structure" + RESEARCH Open Question #4):

```
apps/inngest-dev/
└── src/
    ├── index.ts                # Bun + Inngest serve handler
    ├── db.ts                   # Drizzle client (consumes DATABASE_URL)
    └── functions/
        ├── usage-events-ingest.ts        # id: usage-events-ingest-v1
        ├── usage-fallback-drain.ts       # id: usage-fallback-drain-v1
        ├── usage-reconciler.ts           # id: usage-reconciler-v1
        └── warm-keep-active-tenants.ts   # id: warm-keep-active-tenants-v1
```

**Inngest serve handler** (template — Bun + Inngest `serve` from `inngest-cli@latest dev`):

```typescript
import { serve } from 'inngest/bun';
import { Inngest } from 'inngest';
import { usageEventsIngest } from './functions/usage-events-ingest.js';
import { usageFallbackDrain } from './functions/usage-fallback-drain.js';
import { usageReconciler } from './functions/usage-reconciler.js';
import { warmKeepActiveTenants } from './functions/warm-keep-active-tenants.js';

const inngest = new Inngest({ id: 'mcpgen' });
const handler = serve({
  client: inngest,
  functions: [usageEventsIngest, usageFallbackDrain, usageReconciler, warmKeepActiveTenants],
});

export default { port: 3030, fetch: handler };
```

**Stable-id audit** (CTRL-09 — Phase 9 verifies orphan count = 0): every function ID is a version-suffixed string (`-v1`); bumps go through `chore(inngest):` PRs with decision-log entries.

---

### `tests/runtime/` (NEW WORKSPACE PACKAGE — cross-app E2E)

**Greenfield package — no in-repo analog.**

**Closest cousin:** `apps/api/tests/contract.test.ts` (one-shot integration tests against frozen contracts) + `packages/runtime-sdk/tests/interface.test.ts` (vitest pattern).

**Recommended structure:**

```
tests/runtime/
├── package.json                # private package: "@mcpgen/tests-runtime"
├── vitest.config.ts            # extends shared-config
├── fixtures/
│   ├── smart-id-fuzz.ts        # shared regex from @mcpgen/ir SmartIdSchema
│   ├── mock-mcp-clients.ts     # 3 protocolVersions: 2025-06-18 / 2025-03-26 / 2024-11-05
│   └── deliberate-leak.ts      # PII-leak audit fixture
└── *.test.ts                   # one file per RUN-* requirement
```

**Cross-workstream test ownership** (D-21): runtime ws owns this package. CI runs `pnpm --filter ./tests/runtime test --run` per VALIDATION.md.

---

## Shared Patterns

### Hono `app.fetch` portability invariant (every Worker)

**Source:** RESEARCH §"Pattern 1" + `apps/api/src/index.ts` line 37 + `apps/dispatch/src/index.ts` line 30 + `apps/dispatch-sample/src/index.ts` line 57.
**Apply to:** `apps/dispatch/src/index.ts`, `apps/tenant-worker-runner/src/index.ts`, `apps/inngest-dev/src/index.ts`, every Phase-4-generated tenant Worker.

```typescript
// Bun (Phase 6):
export default { port: 8789, fetch: app.fetch };
// Phase 10 (CF Workers — same source, swap export form):
// export default app;
```

This single invariant is what makes Phase-10 lift-shift one-line per app.

---

### `waitUntil` shim on Bun (every fire-and-forget call)

**Source:** RESEARCH §"Pattern 3" verbatim.
**Apply to:** every usage-event emit-site (`packages/runtime-sdk/src/runtime/usage/emit.ts`); every async log/audit emit that must NOT block the response path.

```typescript
const _pending = new Set<Promise<unknown>>();
export function waitUntil(p: Promise<unknown>): void {
  _pending.add(p);
  void p.finally(() => _pending.delete(p));
}
export async function drainPending(): Promise<void> {
  // tenant-worker-runner calls this on SIGTERM
  await Promise.allSettled([..._pending]);
}
```

**Phase-10 swap:** `ctx.waitUntil(promise)` is provided by CF `ExecutionContext`. Same call site; different binding.

---

### `globalThis` cold-start init (every tenant Worker module)

**Source:** RESEARCH §"Pattern 4" + `docs/mcpgen-stage-e-design.md` §3.3.
**Apply to:** every tool-handler module + smart-ID parser + Zod schema construction.

```typescript
// Compiled ONCE at module load (warm state):
const SMART_ID_REGEX = /^([a-z0-9-]+):(object|collection|schema):([a-zA-Z_]+):(.+)$/;
// (NOT inside the request handler.)
```

**Why re-asserted in Phase 6** (CONTEXT specifics §"`globalThis` cold-start tax mitigation"): local Bun has near-zero cold start, but Phase-4 codegen consumes the runtime SDK at codegen time and the templates already embed the pattern. Documenting it keeps codegen + runtime invariants aligned.

---

### Stable Inngest function IDs (every Inngest function — CTRL-09)

**Source:** RESEARCH §"Pattern 5" verbatim.
**Apply to:** all 4 functions in `apps/inngest-dev/src/functions/`.

```typescript
inngest.createFunction(
  { id: 'usage-reconciler-v1' },  // STABLE — never renamed
  { cron: '0 2 * * *' },
  async () => { /* … */ },
);
```

**Bump protocol:** version-suffix change (`-v1` → `-v2`) in a deliberate `chore(inngest):` PR with paired decision-log entry. Phase 9 audits orphan count = 0.

---

### Idempotency-key shape `${operation}_${ulid}` (every emit-site — D-11)

**Source:** `packages/contracts/src/idempotency.ts` lines 30–56 (FROZEN).
**Apply to:** usage-event emit (`usg_${ulid}` BFF dedup); deploy registration (`deploy_${uuid}`).

```typescript
import { GEN_ID_REGEX, DEPLOY_ID_REGEX, STRIPE_METERS_KEY_REGEX, TOOL_NAME_REGEX } from '@mcpgen/contracts';
// Use validators (cheap booleans for hot paths):
import { validateIdempotencyKey, validateCfWorkerName, validateStripeMetersKey } from '@mcpgen/contracts';
```

**Cross-package alignment** (`packages/contracts/tests/usage-event.test.ts` lines 122–148): the `tool_name` regex MUST match `FinalTool.name` regex from `@mcpgen/ir` — Zod-schema introspection asserts this at test-time. Phase 6 imports BOTH constants and asserts equality in `tests/runtime/smart-id-fuzz.test.ts` (extend the same pattern).

---

### Sentry source-map upload + `beforeSend` redaction (every app — D-19 / D-16)

**Source:** `apps/api/src/instrumentation.ts` lines 14–44 (existing reference impl).
**Apply to:** `apps/dispatch/`, `apps/tenant-worker-runner/`, `apps/inngest-dev/`, `apps/dispatch-sample/`, every Phase-4-generated tenant Worker.

```typescript
// Each app's instrumentation.ts re-exports buildBeforeSend from @mcpgen/runtime:
import { buildBeforeSend } from '@mcpgen/runtime/observability';
import { withSentry } from '@sentry/cloudflare'; // works on Bun + CF

// wrangler.toml convention (existing, every app's wrangler.toml line 5):
// upload_source_maps = true
```

**Audit point (D-21 + Pitfall #12):** Phase 9 deliberate-leak fixture (`tests/runtime/pii-leak-audit.test.ts`) verifies zero `Bearer ` matches in any Sentry payload across every app.

---

### Drizzle migration filename + workflow (every schema change — FND-08 / D-12)

**Source:** `packages/contracts/src/db-schema.ts` lines 17–19 (workflow comment) + existing `infrastructure/neon/migrations/20260427000000_init_schema.sql` (header pattern).
**Apply to:** Phase 6's two new migrations + any future Phase-6 schema work.

**Workflow** (mandatory):

1. Edit `packages/contracts/src/db-schema.ts`.
2. Run `pnpm --filter @mcpgen/contracts drizzle-kit:generate`.
3. Inspect the generated SQL (file `YYYYMMDDHHMMSS_<descriptive>.sql`).
4. Manually augment if needed (e.g., TimescaleDB hypertable conversions; see Phase-1 init schema lines 131–137).
5. Commit BOTH the schema TS change AND the new migration in the SAME atomic commit.
6. NEVER edit a committed migration in place — new changes get NEW timestamped files.

---

### MCP SDK v1 pin (every consumer — D-04)

**Source:** `apps/dispatch-sample/package.json` (Phase-1 pin) + RESEARCH §"Standard Stack" lines 137.
**Apply to:** `apps/tenant-worker-runner/package.json` (if it imports MCP SDK), every Phase-4 codegen template.

```json
{ "dependencies": { "@modelcontextprotocol/sdk": "^1.x" } }
```

**Anti-pattern** (RESEARCH §"Anti-Patterns"): bumping to v2 silently. Bumps go through deliberate `chore: bump mcp-sdk to v2` PR with golden-API regression.

---

### Conventional Commits (every commit — D-20)

**Source:** `docs/mcpgen-git-workflow-rules.md` + existing `.commitlintrc.json` + Phase-1 PATTERNS.md "Conventional Commits" shared pattern.
**Apply to:** every Phase-6 commit by every contributor (human + AI agent).

```
<type>(<scope>): <subject>

# scope examples for Phase 6:
#   runtime, dispatch, dispatch-sample, runtime-sdk, cli, tenant-worker-runner, inngest-dev, contracts
# Atomic: one logical change. If "and" appears in subject — SPLIT.

# Examples:
feat(runtime-sdk): replace stub factory with real createRuntime impl
feat(dispatch): wire capability-gate middleware for protocolVersion downgrade
chore(contracts): align usage-event idempotency_key with usage_events DB column
fix(cli): detect URL collision in claude-desktop-config emitter
test(runtime): add cross-tenant smart-ID fuzz integration test
```

**Enforced by two layers** (D-20): `conventional-pre-commit` locally + `commitlint-github-action` in `main-ci.yml`. NEVER `--no-verify`.

---

### Locked stack (every package.json — Phase 1 + RESEARCH §"Standard Stack")

**Source:** `.planning/phases/06-runtime-plane/06-RESEARCH.md` lines 134–143.
**Apply to:** every Phase-6 package.json install.

| Library | Version | Where |
|---|---|---|
| `bun` | 1.3.5 | runtime for all apps |
| `hono` | 4.12.15 | dispatch + sample + runner + inngest-dev |
| `@modelcontextprotocol/sdk` | ^1.29.0 | sample + runner (NEVER v2) |
| `inngest` | 4.2.4 | inngest-dev |
| `inngest-cli` | 1.18.0 | local dev only (`npx`) |
| `commander` | 14.0.3 | cli |
| `bun:sqlite` | bundled | runtime-sdk auth/stored + usage fallback |
| `@sentry/cloudflare` (or `@sentry/bun`) | 10.50.0 | every app |
| `unstorage` | 1.17.5 | dispatch tenant cache + stored creds KV |
| `ulid` | 3.0.2 | usage event IDs |
| `picocolors` | 1.1.1 | cli output |
| `@clack/prompts` | 0.7.0 | cli interactive |

---

### Privacy-LOCKED log denylist (every emit-site)

**Source:** `docs/mcpgen-architecture.md` §11.3 + Pitfall #12.
**Apply to:** every Sentry emit, every BetterStack log, every console.log in error paths.

| Never log | Always log |
|---|---|
| Spec content (only `content_hash + endpoint_count + structural_diff_summary`) | Generation metadata |
| Upstream API responses (PII) | Tool names |
| Upstream auth credentials (`Authorization`, `X-Upstream-Auth`, `Cookie`, spec-declared auth headers) | IR structure |
| Decrypted plaintext credentials in passthrough/stored mode | Performance metrics |
| `RUNTIME_KEK` or any DEK material | Error classes (sanitized) |

**Audit point:** `tests/runtime/pii-leak-audit.test.ts` (Wave 5) deliberately-leaks fixture credentials and asserts zero matches across Sentry payloads + BetterStack lines.

---

## No Analog Found

Files where no in-repo analog exists. Planner uses RESEARCH excerpts (cited above) as the canonical template:

| File | Role | Data Flow | Why no analog |
|---|---|---|---|
| `apps/tenant-worker-runner/src/supervisor.ts` | service / lifecycle | event-driven (process supervisor) | First child-process supervisor in repo. Use `Bun.spawn` per RESEARCH §"Don't Hand-Roll" |
| `apps/tenant-worker-runner/src/port-allocator.ts` | utility | static allocation | First port allocator. Sequential 8790+ acceptable per CONTEXT discretion |
| `apps/tenant-worker-runner/tests/p99-load.test.ts` | load test | load | First Bun-native load test in repo. Pattern: 30-s 100-rps loop against fixed-latency stub (D-17) |
| `apps/inngest-dev/src/db.ts` | utility | data access | First Drizzle client app. Standard pattern: `import { drizzle } from 'drizzle-orm/neon-http'; export const db = drizzle(process.env.DATABASE_URL!)` |
| `apps/cli/src/runner-client.ts` | HTTP client | request-response | First app-to-app HTTP client. Use Bun-native `fetch` against `http://localhost:8788/admin/*` |
| `apps/cli/src/claude-desktop-config.ts` | file-I/O | local file write | First Claude Desktop config emitter. RESEARCH §"Pitfall 9" provides the path table |
| `tests/runtime/dispatch-sample.e2e.test.ts` | E2E test | full pipeline | First E2E test crossing 4 apps. Pattern: spawn dispatch + runner + inngest-dev via `Bun.spawn` in `beforeAll`, run full MCP `initialize` → `tools/list` → `tools/call` → assert TimescaleDB row |
| `tests/runtime/pii-leak-audit.test.ts` | security audit | deliberate-leak | First deliberate-leak fixture. Pattern: insert known-credential string into request → emit error → assert Sentry mock + log mock contain zero matches |
| `apps/dispatch/src/middleware/rateLimit.ts` | middleware | request-response | First in-memory token bucket. Phase-6 stub acceptable (Wave 1 RESEARCH §"Architectural Responsibility Map" — "rate-limit precheck stub acceptable") |

For each of these, the planner cites the corresponding RESEARCH section / Stage-E / architecture excerpt above and copies the canonical template.

---

## Patterns this phase EXTENDS (not establishes)

Phase 6 inherits Phase-1's establishment list (file naming, contract location, idempotency-key shape, migration prefix, commit format, locked stack, MCP SDK v1, CF dispatch namespace cap, launch-criteria immutability, UI lock, Day-1 LLM smoke test). It adds these runtime-plane invariants:

| Convention | Established by Phase 6 | Enforced by |
|---|---|---|
| **Tenant-prefixed smart-IDs** | All smart-IDs minted as `{tenant_short_id}-{spec_slug}:…` per Pass-1 codegen contract; dispatch fuzz check is the runtime half | `apps/dispatch/src/middleware/smartIdFuzz.ts` + F1 fuzz fixture (Phase 5); shared regex from `@mcpgen/ir` |
| **`hostHeaderValidation` mandatory** | Every public endpoint mounts the middleware with `ALLOWED_HOSTS` env (default `localhost,127.0.0.1`) | Hono middleware in `@mcpgen/runtime` consumed by dispatch + every tenant Worker; Stage E codegen template injection point |
| **Auth-mode dispatcher pattern** | Single `switch(mode.mode)` in `@mcpgen/runtime/auth/index.ts` routes to passthrough / stored / oauth-stub | TS exhaustive `switch` on discriminated union (`AuthMode` from `packages/runtime-sdk/src/types.ts`) |
| **Inngest function-id stable-string convention** | All function IDs version-suffixed (`-v1`); bumps via `chore(inngest):` PR + decision log | CTRL-09 audit Phase 9 (orphan count = 0) |
| **`waitUntil` shim on Bun + native on CF** | Single shim in `@mcpgen/runtime/usage/emit.ts`; supervisor calls `drainPending()` on SIGTERM | Tests in `tests/runtime/usage-events-pipeline.test.ts` assert no synchronous await in tool response path |
| **Exit-78 (`EX_CONFIG`) deferral idiom** | `mcpgen deploy --cf` exits 78 + banner; same shape as `infrastructure/cloudflare/scripts/create-namespaces.sh` | Test `tests/runtime/...` (CLI deferral test) asserts exit code 78 + banner string |
| **Two-table local SQLite split** | One `bun:sqlite` per purpose: `stored-creds.sqlite` (RUN-04) + `usage-fallback.sqlite` (RUN-06) | RESEARCH Open Question #3 recommendation; planner picks file locations per CONTEXT discretion |
| **`apps/dispatch-sample` as canonical reference** | Phase-6 Wave 2 wires it through real runtime; Phase-4 codegen MUST emit identical shape | F1 static validation (`tsc --noEmit`) + Phase-6 E2E smoke (`tests/runtime/dispatch-sample.e2e.test.ts`) |
| **Phase-10 lift-shift contract** | Every component has a documented one-line swap (Bun `serve` → CF `export default`; Inngest dev URL → CF Queue binding; `bun:sqlite` → CF KV; `unstorage` memory driver → `cloudflare-kv-binding`) | Documented in `06-PHASE-DEVIATIONS.md` (carry-forward to Phase 10) |

---

## Metadata

**Analog search scope:**
- `apps/` (api, dispatch, dispatch-sample, cli) — read entry points + tools + auth + instrumentation
- `packages/` (runtime-sdk, contracts, ir, engine-fixtures) — read frozen contracts + tests
- `infrastructure/` (neon migrations, cloudflare scripts) — read existing migration + deferral pattern
- `.planning/phases/01-foundation/01-PATTERNS.md` — inherited shared patterns
- `.planning/phases/06-runtime-plane/06-RESEARCH.md` — 10 cited examples + Patterns 1–7 + Pitfalls 1–9
- `docs/mcpgen-stage-e-design.md` §3.3 / §5 / §6 / §7 / §8 — runtime SDK contract from codegen side

**Files scanned:** 24 source files + 3 planning docs + 8 canonical docs.

**Pattern extraction date:** 2026-04-26.

**Key signal:** Phase 6 has the highest analog-match rate of any phase so far — 47/50 — because every signature is locked, every architecture decision is explicit in CONTEXT, and RESEARCH ships 10 verbatim code excerpts for the security-critical paths (HKDF, AES-GCM, capability gating, smart-ID fuzz, Inngest function IDs). The 3 greenfield apps (`tenant-worker-runner`, `inngest-dev`, `tests/runtime`) have closest-cousin templates documented above; planner copies the scaffold and fills bodies.
