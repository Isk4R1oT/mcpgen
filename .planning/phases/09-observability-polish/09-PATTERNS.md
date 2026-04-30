# Phase 9: Observability & Polish - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 28 (21 new + 7 modified)
**Analogs found:** 26 / 28

## File Classification

### NEW files

| New file | Role | Data flow | Closest analog | Match |
|----------|------|-----------|----------------|-------|
| `packages/contracts/src/sentry-redaction.ts` | helper (cross-cutting) | transform (pure) | `apps/web/src/lib/sentry/redact.ts` | exact |
| `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` | helper (cross-cutting) | transform (pure) | `apps/generation-engine/src/mcpgen_engine/main.py` (`_sentry_before_send`) | exact |
| `apps/generation-engine/tests/observability/test_sentry_redaction.py` | test (unit, table-driven) | request-response | `apps/generation-engine/tests/test_observability.py` + `tests/test_smart_id_no_overlap.py` | role-match |
| `tests/fixtures/leak-vectors.json` (shared TS+Py) | test fixture (data) | static | `apps/generation-engine/tests/fixtures/circular_ref_spec.json` | role-match |
| `packages/contracts/src/sentry-redaction.test.ts` | test (unit) | transform | `apps/web/src/lib/sentry/__tests__/redact.test.ts` (Phase 7 plan 07-06; alt: `apps/api/tests/storage/local-fs.test.ts`) | role-match |
| `apps/dispatch/src/instrumentation.ts` | runtime init shim | startup hook | `apps/api/src/instrumentation.ts` | exact |
| `apps/api/src/routes/v1/deployments.ts` (list + badge-public) | route (Hono BFF) | request-response (CRUD read + flag toggle) | `apps/api/src/routes/v1/drift.ts` | exact |
| `apps/api/src/routes/v1/usage.ts` (`/usage/hourly`) | route (Hono BFF) | request-response (read-only aggregate) | `apps/api/src/routes/v1/drift.ts` | exact |
| `apps/api/src/routes/v1/deploy.ts` (`/deploy/[generationId]`) | route (Hono BFF) | request-response (read) | `apps/api/src/routes/v1/drift.ts` | exact |
| `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` | migration (DDL) | static | `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` | exact |
| `apps/api/tests/inngest/orphan-audit.test.ts` | test (static-source AST scan) | static | `apps/api/tests/inngest/drift-watcher.test.ts` | exact |
| `apps/dispatch/tests/cross-tenant-id-block.test.ts` | test (integration, Hono) | request-response | `apps/dispatch/tests/smart-id-fuzz.test.ts` | exact |
| `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` | test (integration, regex set algebra) | static | `apps/generation-engine/tests/test_smart_id_no_overlap.py` | exact |
| `apps/generation-engine/tests/integration/test_multi_protocol_client.py` | test (integration, mock client) | request-response | `apps/generation-engine/tests/integration/test_pipeline_e2e.py` (fixture-driven harness) | role-match |
| `scripts/observability/leak-audit.ts` | operator script (one-off) | batch | `apps/api/scripts/seed-synthetic-usage.ts` | exact |
| `scripts/observability/inngest-orphan-audit.ts` | operator script (one-off) | batch | `apps/api/scripts/seed-synthetic-usage.ts` + `infrastructure/logto/scaffold.ts` | exact |
| `scripts/observability/outbox-depth-monitor.ts` | operator script (cron-able) | batch + alert | `apps/api/scripts/seed-synthetic-usage.ts` | exact |
| `docs/runbooks/multi-client-smoke.md` | doc (runbook, manual checklist) | static | `docs/runbooks/logto-tenant-setup.md` | exact |
| `docs/runbooks/neon-scale-upgrade.md` | doc (runbook) | static | `docs/runbooks/logto-tenant-setup.md` + `docs/runbooks/migration-conflicts.md` | exact |
| `docs/runbooks/betterstack-setup.md` | doc (runbook) | static | `docs/runbooks/logto-tenant-setup.md` + `docs/runbooks/resend-domain-setup.md` | exact |
| `apps/api/tests/load/test_neon_oom_replication.test.ts` | test (load, slow) | batch (concurrent SQL) | none in tree (new pattern) — closest test scaffold: `apps/api/tests/storage/local-fs.test.ts` | partial |

### MODIFIED files

| Modified file | Role | Closest analog (for the edit pattern) | Match |
|---------------|------|---------------------------------------|-------|
| `apps/web/sentry.{client,server,edge}.config.ts` | runtime init (Next.js) | already exists; pattern: replace local `redactSentryEvent` import with `@mcpgen/contracts/sentry-redaction` re-export | exact |
| `apps/api/src/instrumentation.ts` | runtime init (CF Workers) | self; replace inline `beforeSend` body with `redactBeforeSend` import | exact |
| `apps/generation-engine/src/mcpgen_engine/main.py` (`init_sentry`) | runtime init (FastAPI) | self; replace `_sentry_before_send` body with `redact_before_send` import | exact |
| `apps/generation-engine/src/mcpgen_engine/observability.py` | runtime init (Logfire/OTel) | self; add `scrubbing=ScrubbingOptions(callback=…)` preserving `langfuse.session.id` | exact |
| `packages/codegen-templates/templates/sentry_redact.ts.j2` | template (Jinja2) | self; converge denylist + import shared helper | exact |
| `packages/codegen-templates/templates/server.ts.j2` (or `index.ts.j2`) | template (Jinja2) | self; add `globalThis.__mcpgen_zod_schemas` cache idiom | partial (no analog of globalThis cache in tree) |
| `apps/dispatch/src/index.ts` | entry point | self; mount `instrumentation.ts` | exact |
| 10× `agent.run(...)` call sites (passes 0–5 + Stage F2/F3) | LLM call site | `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py:149` | exact |
| `docs/mcpgen-architecture.md` §6 | doc edit | `docs/runbooks/migration-conflicts.md` (text-grep CI gate pattern) | partial |
| `apps/api/src/index.ts` | entry point | self; mount 3 new routes alongside `driftRoute` | exact |

## Pattern Assignments

### `packages/contracts/src/sentry-redaction.ts` (helper, transform)

**Analog:** `apps/web/src/lib/sentry/redact.ts` (lines 19–110)

**Imports / module shape pattern** (lines 1–17):
```ts
// apps/web/src/lib/sentry/redact.ts
//
// Shared Sentry beforeSend redaction. Mirrors apps/api/src/instrumentation.ts:sentryOptionsFor
// pattern (Phase 1 D-19). Per CONTEXT D-30 + Pitfall #12 (P0 — credential leak into Sentry),
// strips Authorization / X-Upstream-Auth / Cookie headers AND ?key= / ?token= query
// parameters from request.url.
//
// Single source of truth — imported by all three of:
//   - apps/web/sentry.client.config.ts
//   - apps/web/sentry.edge.config.ts
//   - apps/web/sentry.server.config.ts
```

**Constants pattern** (lines 25–39): `as const` denylists exported by name so tests can reference them.
```ts
export const REDACTED_HEADERS = ['Authorization', 'X-Upstream-Auth', 'Cookie'] as const;
export const REDACTED_QUERY_PARAMS = ['key', 'token'] as const;
export const REDACTION_VALUE = '[REDACTED]' as const;
```

**Type-without-Sentry-import pattern** (lines 42–54) — importable from any DSN-empty bootstrap path:
```ts
// We intentionally do NOT depend on @sentry/types to keep this module loadable from the
// client / edge / server config files without pulling Sentry runtime types into a
// potentially-empty-DSN bootstrap path.
export interface SentryEventRequest { url?: string; headers?: Record<string, string>; }
export interface SentryEventLike { request?: SentryEventRequest; }
```

**Core transform pattern** (lines 68–110): in-place mutate + return; case-insensitive header lookup; defensive URL parse; no-op when `event.request` absent. **Phase 9 must EXTEND this**: add (a) variable header regex `/^x-.*-(auth|token|key|secret)$/i`, (b) string-pattern redaction (Bearer / sk_live_ / ghp_ / JWT — pulled from `apps/api/src/instrumentation.ts:24-34`), (c) body redaction when path matches `/v1/generate` AND content-type is yaml/json, (d) `event.extra.spec` / `openapi_yaml` / `raw_ir` redaction.

**String-pattern denylist to merge in** — from `apps/api/src/instrumentation.ts:24-34`:
```ts
const STRIPE_CUS_RE = /cus_[A-Za-z0-9]{14,}/g;
const STRIPE_SK_RE = /sk_(live|test)_[A-Za-z0-9]{24,}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
function redactString(input: string | undefined): string | undefined {
  if (!input) return input;
  return input
    .replace(STRIPE_SK_RE, '[REDACTED_STRIPE_KEY]')
    .replace(STRIPE_CUS_RE, '[REDACTED_STRIPE_CUS]')
    .replace(JWT_RE, '[REDACTED_JWT]');
}
```

**Note for planner — A11 (RESEARCH §Assumptions):** `apps/web/src/lib/sentry/redact.ts` SHOULD become a thin re-export shim (`export { redactBeforeSend as redactSentryEvent } from '@mcpgen/contracts/sentry-redaction';`) preserving the 17 vitest unit tests that already pin its surface.

---

### `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` (helper, transform)

**Analog:** `apps/generation-engine/src/mcpgen_engine/main.py:33-50` (`_sentry_before_send`)

**Function signature pattern** (lines 33–50):
```python
def _sentry_before_send(event: Event, _hint: Hint) -> Event | None:
    """Architecture §11.3 + Pitfall #12: redact auth headers + spec content.

    Returns the (possibly mutated) event. Returning None would drop the event;
    we never drop in Phase 1.
    """
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            for key in ("Authorization", "X-Upstream-Auth", "Cookie"):
                if key in headers:
                    headers[key] = "[REDACTED]"
    return event
```

**Phase 9 expansion (D-04, mirror of D-03 verbatim)** — add: (1) lowercase + variable regex header match, (2) yaml/json+`/v1/generate` body redaction, (3) `event["extra"]["spec"|"openapi_yaml"|"raw_ir"]` redaction, (4) `event["message"]` string-pattern scrub for `Bearer`, `sk_live_`, `sk_test_`, `ghp_`, JWT.

**Module placement pattern:** convert current single-file `observability.py` into `observability/` package with `__init__.py` re-exporting `configure_langfuse_otel`; add sibling `sentry_redaction.py`.

**Wiring pattern at call site** — `apps/generation-engine/src/mcpgen_engine/main.py:60-66`:
```python
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),
    environment=os.environ.get("ENVIRONMENT", "development"),
    release=os.environ.get("SENTRY_RELEASE", ""),
    traces_sample_rate=0.1,
    before_send=_sentry_before_send,  # Phase 9: replace with `redact_before_send` import
)
```

---

### `apps/generation-engine/tests/observability/test_sentry_redaction.py` + `tests/fixtures/leak-vectors.json` (test, table-driven)

**Analog:** `apps/generation-engine/tests/test_observability.py` (lines 1–37) + `apps/generation-engine/tests/test_smart_id_no_overlap.py:53-97` (table-driven assertion loop)

**pytest module pattern** (test_observability.py:1–37):
```python
"""Tests for FND-11 Langfuse OTel exporter wiring."""

from __future__ import annotations
import base64
import pytest

def test_langfuse_otel_no_keys_does_not_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    from mcpgen_engine.observability import configure_langfuse_otel
    configure_langfuse_otel()  # must not raise
```

**Table-driven assertion pattern** (test_smart_id_no_overlap.py:74-97) — applies to leak-vector iteration:
```python
acme_ids = [f"acme-{base}" for base in base_ids]
widgets_ids = [f"widgets-{base}" for base in base_ids]

# Each acme ID matches acme regex; none matches widgets regex.
for sid in acme_ids:
    assert acme_regex.fullmatch(sid), f"acme regex did not match: {sid}"
    assert not widgets_regex.fullmatch(sid), f"widgets regex matched acme ID: {sid}"
```

**Fixture file analog** — `apps/generation-engine/tests/fixtures/circular_ref_spec.json` (raw JSON loaded via `json.loads(Path(...).read_text())` in pytest tests). Phase 9 fixture lives at the REPO ROOT `tests/fixtures/leak-vectors.json` so both TS (vitest) and Python (pytest) suites import the same file. Schema per RESEARCH §"Pattern 1":
```json
{
  "vectors": [
    { "name": "auth_header_bearer",
      "input_event": {"request": {"headers": {"Authorization": "Bearer sk_live_FAKE_LEAK_XYZ"}}},
      "expected_no_match": ["sk_live_FAKE_LEAK_XYZ", "Bearer "] },
    ...
  ]
}
```

**Pitfall #7 mitigation:** sentinel string MUST be `MCPGEN_LEAK_CANARY_2026Q2`; for Stripe-shaped tests use `sk_live_REDACTION_TEST_DO_NOT_USE_AS_REAL_KEY_2026Q2` with explicit `.gitleaks.toml` allowlist entry for the fixture path.

---

### `packages/contracts/src/sentry-redaction.test.ts` (test, vitest)

**Analog:** `apps/api/tests/storage/local-fs.test.ts` (lines 1–60) — standalone vitest module with `describe`/`it`/`expect` and `beforeEach`/`afterEach` hooks.

**vitest module shape** (local-fs.test.ts:5-23):
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _makeLocalFsStorageAdapterForTesting } from '../../src/lib/storage/local-fs.js';

let root: string;

beforeEach(async () => { root = await fs.mkdtemp(join(tmpdir(), 'mcpgen-storage-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('localFsStorageAdapter (test override)', () => {
  it('put + get roundtrips a string', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    await adapter.put('specs', 'hello.json', '{"hello":"world"}');
    const got = await adapter.get('specs', 'hello.json');
    expect(got).not.toBeNull();
    ...
  });
});
```

**Cross-language equivalence step (Wave 1):** load `tests/fixtures/leak-vectors.json` from BOTH TS and Py harnesses; run each vector through the language-specific redactor; assert each `expected_no_match` string is absent from the serialized output.

---

### `apps/dispatch/src/instrumentation.ts` (runtime init, NEW)

**Analog:** `apps/api/src/instrumentation.ts` (full file, 1–72) — exact mirror.

**Module pattern** (apps/api/src/instrumentation.ts:14–67):
```ts
import { withSentry } from '@sentry/cloudflare';

export interface SentryEnv {
  readonly SENTRY_DSN?: string;
  readonly ENVIRONMENT?: string;
}

export function sentryOptionsFor(env: SentryEnv) {
  return {
    dsn: env.SENTRY_DSN ?? '',
    environment: env.ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event: { request?: { headers?: Record<string, string>; url?: string }; message?: string }) {
      // Phase 9: replace inline body with shared helper
      return redactBeforeSend(event);
    },
  };
}

export { withSentry };
```

**Wiring at entry point** — `apps/dispatch/src/index.ts:50` currently exports `{ port: 8789, fetch: app.fetch }`. Phase 9 wraps via `withSentry((env) => sentryOptionsFor(env), app.fetch)` (per Pitfall #3). Empty DSN no-ops (`apps/api/src/instrumentation.ts:38-43` comment "Empty DSN is treated as 'disabled'").

---

### `apps/api/src/routes/v1/deployments.ts`, `usage.ts`, `deploy.ts` (BFF routes)

**Analog:** `apps/api/src/routes/v1/drift.ts` (full file, 1–177)

**Imports + Hono module pattern** (drift.ts:25-42):
```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { DeploymentDriftPatchRequest } from '@mcpgen/contracts/billing-types';
import { drift_events, deployments, generations } from '@mcpgen/contracts/db-schema';
import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';

interface DriftRouteBindings {
  LOGTO_BASE_URL: string;
}

export const driftRoute = new Hono<{
  Bindings: DriftRouteBindings;
  Variables: { auth: AuthContext };
}>();
```

**Org-scoping helper pattern** (drift.ts:48-62) — Phase 9 should EXTRACT this to `apps/api/src/lib/auth-helpers.ts` per RESEARCH §"Don't Hand-Roll":
```ts
async function deploymentBelongsToOrg(
  deploymentId: string,
  orgId: string,
): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT p.org_id AS org_id
    FROM deployments d
    JOIN generations g ON g.id = d.generation_id
    JOIN projects p ON p.id = g.project_id
    WHERE d.id = ${deploymentId}
    LIMIT 1
  `);
  const rows = r.rows as unknown as DeploymentOwnershipRow[];
  return rows[0]?.org_id === orgId;
}
```

**Per-route auth + scope pattern** (drift.ts:96-115) — applies to all 4 D-18 endpoints:
```ts
driftRoute.get('/deployments/:id/drift-events', async (c) => {
  const auth = c.var.auth;
  if (auth.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_cannot_read_drift' }, 403);
  }
  if (!auth.organizationId) {
    return c.json({ error: 'no_org_context' }, 400);
  }
  const deploymentId = c.req.param('id');
  const ok = await deploymentBelongsToOrg(deploymentId, auth.organizationId);
  if (!ok) {
    return c.json({ error: 'not_found' }, 404);  // defense-in-depth: 404 not 403
  }
  ...
});
```

**Body validation pattern (POST badge-public)** (drift.ts:151-177):
```ts
driftRoute.patch(
  '/deployments/:id',
  zValidator('json', DeploymentDriftPatchRequest),
  async (c) => {
    ...
    const body = c.req.valid('json');
    await db.update(deployments).set({ ... }).where(eq(deployments.id, deploymentId));
    return c.json({ ok: true, ... });
  },
);
```

**Mounting pattern** — `apps/api/src/index.ts:76-86`:
```ts
const protectedApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
protectedApp.use('*', authMiddleware);
protectedApp.route('/generate', generateRoute);
protectedApp.route('/jobs', jobsStreamRoute);
// CTRL-03 / D-19: drift management endpoints
protectedApp.route('/', driftRoute);  // self-prefixed
app.route('/api/v1', protectedApp);
```

**Phase 9 mounting (per RESEARCH §"Open Q #4"):** prefer single `deploymentsRoute` self-prefixing all 4 paths, mounted via `protectedApp.route('/', deploymentsRoute);` — matches `drift.ts` pattern exactly.

**Pitfall #5 reminder:** `/usage/hourly` MUST org-scope via the same 4-table JOIN — `usage_hourly` materialized view does not carry `org_id` directly.

---

### `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (migration)

**Analog:** `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` (full file, 1–9)

**File header + DDL pattern**:
```sql
-- ─── Phase 6 add local_port to deployments (RUN-01 / Open Question #1) ────
-- Generated by drizzle-kit, then manually augmented if needed.
-- DO NOT auto-regenerate this file; subsequent schema changes go in NEW migration
-- files with timestamp prefix > 20260428000000.
--
-- Filename `20260428000000_add_local_port_to_deployments.sql` is FROZEN; the
-- timestamp prefix mitigates Pitfall #18 per FND-08 / docs/decisions/001.

ALTER TABLE "deployments" ADD COLUMN "local_port" integer;
```

**Phase 8 idempotent variant** — `20260428000002_phase8_billing_drift.sql:24` (line 24):
```sql
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "auto_regenerate_on_drift" boolean DEFAULT false NOT NULL;
```

**Phase 9 SQL (per D-19):**
```sql
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "public_badge" boolean DEFAULT false NOT NULL;
```

**Schema sync pattern** — `packages/contracts/src/db-schema.ts:144-157` `deployments` table — add `public_badge: boolean('public_badge').notNull().default(false),` after `auto_regenerate_on_drift`.

**Drizzle journal update (Pitfall #4):** `infrastructure/neon/migrations/meta/_journal.json` MUST be hand-updated OR regenerated via `drizzle-kit generate` then renamed; verify via `pnpm --filter @mcpgen/contracts db:test-migrate` (per `docs/runbooks/migration-conflicts.md:23-30`).

---

### `apps/api/tests/inngest/orphan-audit.test.ts` (test, static-source)

**Analog:** `apps/api/tests/inngest/drift-watcher.test.ts` (lines 14–46) + `apps/api/tests/inngest/usage-reconciler.test.ts:11-31`

**Module shape** (drift-watcher.test.ts:14-32):
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driftWatcher } from '../../src/inngest/functions/drift-watcher.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const WATCHER_SRC = readFileSync(
  resolve(HERE, '../../src/inngest/functions/drift-watcher.ts'),
  'utf-8',
);
```

**Stable-ID assertion pattern** (drift-watcher.test.ts:33-44):
```ts
describe('drift-watcher-v1 (cron fan-out)', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (driftWatcher as unknown as { opts?: { id: string } }).opts?.id ??
      (driftWatcher as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.DRIFT_WATCHER);
    expect(id).toBe('drift-watcher-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(WATCHER_SRC).toContain('INNGEST_FUNCTION_IDS.DRIFT_WATCHER');
  });
});
```

**Set-equality pattern (D-14 specific)** — RESEARCH Pattern 4 (per Inngest source register `apps/api/src/inngest/functions/index.ts:24-32` — 7 functions array):
```ts
const REGISTERED_IDS = new Set(Object.values(INNGEST_FUNCTION_IDS));

it('every function file uses an id from INNGEST_FUNCTION_IDS', () => {
  const files = readdirSync(FN_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  const idRegex = /id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g;
  const found = new Set<string>();
  for (const file of files) {
    const src = readFileSync(resolve(FN_DIR, file), 'utf-8');
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(src)) !== null) {
      const key = m[1] as string;
      const value = (INNGEST_FUNCTION_IDS as Record<string, string>)[key];
      expect(REGISTERED_IDS, `${file} references unregistered key ${key}`).toContain(value);
      found.add(value);
    }
  }
  expect(found, 'register vs implementation set-equality').toEqual(REGISTERED_IDS);
});

it('runtime functions[] array length matches register', () => {
  expect(functions.length).toBe(Object.keys(INNGEST_FUNCTION_IDS).length);
});
```

---

### `apps/dispatch/tests/cross-tenant-id-block.test.ts` (test, integration)

**Analog:** `apps/dispatch/tests/smart-id-fuzz.test.ts` (full file, 1–112)

**Hono harness pattern** (smart-id-fuzz.test.ts:9-27):
```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { smartIdFuzz } from '../src/middleware/smartIdFuzz.js';

interface TestVariables { tenantPrefix?: string; }

function buildApp(tenantPrefix: string | undefined): Hono<{ Variables: TestVariables }> {
  const app = new Hono<{ Variables: TestVariables }>();
  app.use('*', async (c, next) => {
    if (tenantPrefix !== undefined) c.set('tenantPrefix', tenantPrefix);
    return next();
  });
  app.use('*', smartIdFuzz);
  app.post('*', (c) => c.json({ ok: true }));
  return app;
}
```

**JSON-RPC mismatch assertion pattern** (smart-id-fuzz.test.ts:30-47):
```ts
it('returns 403 smart_id_tenant_mismatch when prefix does NOT match', async () => {
  const app = buildApp('alice-stripe');
  const res = await app.request('http://localhost/t/alice-stripe/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fetch', arguments: { id: 'bob-github:object:Charge:ch_x' } },
    }),
  });
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: string; expected_prefix: string; received_prefix: string };
  expect(body.error).toBe('smart_id_tenant_mismatch');
});
```

**D-09 already-implemented note:** `apps/dispatch/src/middleware/smartIdFuzz.ts` is FULL Phase 6 — Phase 9 only adds the integration-test file. Upstream wiring confirmed at `apps/dispatch/src/index.ts:45` (`app.use('/t/*', smartIdFuzz);`).

---

### `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` (test, integration)

**Analog:** `apps/generation-engine/tests/test_smart_id_no_overlap.py` (full file, 1–129)

**Set-algebra cross-tenant test pattern** (test_smart_id_no_overlap.py:53-97):
```python
def test_synthetic_two_tenants() -> None:
    """T-2-C5 / D-56 / Pitfall #1.

    Two synthetic tenants `acme` and `widgets` wrapping the same `stripe-api`
    spec MUST produce IDs that BOTH match the deploy-time prefixed regex
    but are LITERALLY DIFFERENT.
    """
    spec_slug = "stripe-api"
    types = ["object", "collection"]
    collections = ["Charge", "Customer", "Subscription"]

    fmt = build_smart_id_format(spec_slug)
    acme_regex = _tenant_prefixed_regex("acme", spec_slug, types, collections)
    widgets_regex = _tenant_prefixed_regex("widgets", spec_slug, types, collections)

    base_ids = [...]
    acme_ids = [f"acme-{base}" for base in base_ids]
    widgets_ids = [f"widgets-{base}" for base in base_ids]

    for sid in acme_ids:
        assert acme_regex.fullmatch(sid)
        assert not widgets_regex.fullmatch(sid), f"widgets regex matched acme ID: {sid}"
```

**Phase 9 expansion (D-08):** scale from 2 tenants × 1 spec to **5 tenants × 5 specs = 25 generations**. Drive Stage E to emit each bundle into a tmp dir; extract `_SMART_ID_REGEX` literal from each `runtime/smart_id.ts` (template at `packages/codegen-templates/templates/smart_id.ts.j2:15` `const _SMART_ID_REGEX = /^([^:]+):([^:]+):([^:]+):(.+)$/;`); assert no two regexes match the same identifier.

---

### `apps/generation-engine/tests/integration/test_multi_protocol_client.py` (test, integration)

**Analog:** `apps/generation-engine/tests/integration/test_pipeline_e2e.py` (lines 1–80)

**Fixture-driven pipeline harness** (test_pipeline_e2e.py:1-75):
```python
"""Phase 3 E2E acceptance test — Stage A → Pass 4 on Stripe + GitHub + Notion."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any
import pytest
from mcpgen_ir.types import Pass1Output, Pass2Output, Pass3Output, Pass4Output, RawIR
from mcpgen_engine import pipeline as pipeline_module
from mcpgen_engine.cache import clear_l1, clear_l2
from mcpgen_engine.pipeline import run_pipeline

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"
_FIXTURE_NAMES: tuple[str, ...] = ("stripe", "github", "notion")

@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    ...

def _load_fixture(name: str) -> tuple[RawIR, Pass1Output, ...]:
    fix = _FIXTURES_DIR / name
    raw_ir = RawIR.model_validate(json.loads((fix / "ir.json").read_text()))
    ...
```

**Phase 9 mock-client extension (D-10, Pitfall #9):** Mock client targets the dispatch URL (NOT the engine direct), sends `initialize` with `protocolVersion: "2024-11-05"`, then asserts `tools/list` response omits `outputSchema`. Wire via `apps/dispatch/src/middleware/capabilityGate.ts` (Phase 6 D-11). Use the existing F3 mock_clients harness — RESEARCH §"D-10" notes Phase 5 already harnesses 3 mock clients; Phase 9 adds a 4th.

---

### `scripts/observability/leak-audit.ts`, `inngest-orphan-audit.ts`, `outbox-depth-monitor.ts`

**Analog:** `apps/api/scripts/seed-synthetic-usage.ts` (full file)

**Header + IIFE/named-export pattern** (seed-synthetic-usage.ts:1-30):
```ts
// apps/api/scripts/seed-synthetic-usage.ts
//
// D-25 mitigation: seeds usage_events_outbox from packages/engine-fixtures
// so Wave 2 outbox poller can be tested without Phase 6 lands.
//
// Two callers:
//   - CLI: `bun run apps/api/scripts/seed-synthetic-usage.ts` (IIFE at bottom)
//   - Test import: `import { seedSyntheticOutbox } from '../scripts/seed-synthetic-usage.js'`
//
// What this script does:
//   1. Reads DATABASE_URL from env (for Drizzle connection).
//   ...

import { ulid } from 'ulid';
import { db } from '../src/db.js';
import { usage_events_outbox } from '@mcpgen/contracts/db-schema';
```

**outbox-depth-monitor specific pattern** (RESEARCH §"Code Example 3", with Pitfall #10 mitigation):
```ts
import { db } from '../../apps/api/src/db.js';
import { sql } from 'drizzle-orm';

const THRESHOLD = 10_000;
const HEARTBEAT_URL = process.env.BETTERSTACK_OUTBOX_HEARTBEAT_URL ?? '';

async function main(): Promise<void> {
  // Pitfall #10: only count rows older than 5 min — avoid CI seed false-positives.
  const r = await db.execute(sql`
    SELECT COUNT(*) AS pending
    FROM usage_events_outbox
    WHERE sent_at IS NULL
      AND created_at < now() - interval '5 minutes'
  `);
  const pending = Number((r.rows[0] as { pending: string }).pending);
  if (HEARTBEAT_URL && pending <= THRESHOLD) {
    await fetch(HEARTBEAT_URL, { method: 'GET' });
  }
  if (pending > THRESHOLD) {
    // Resend client already wired Phase 8 — see lib/email/resend-client.ts
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
```

**Outbox partial-index reuse (RESEARCH §"Don't Hand-Roll"):** the `WHERE sent_at IS NULL` partial index from Phase 8 migration line 112 (`usage_events_outbox_pending_idx`) makes the count O(log n).

**leak-audit.ts mock-Sentry pattern** — follow `StorageAdapter` from `packages/contracts/src/storage.ts:8-16` (Phase 9 mock impl + Phase 10 real impl substitution):
```ts
export interface StorageAdapter {
  put(bucket: StorageBucket, key: string, body: Uint8Array | string, opts?: StorageAdapterPutOpts): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Uint8Array | null>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
}
```
Phase 9 ships `MockSentryEventsAdapter`; Phase 10 swaps in `RealSentryEventsAdapter` via env flag.

**Reference-only header (per `infrastructure/logto/scaffold.ts:1-19`):** scripts that touch live cloud APIs (D-13 leak-audit, D-15 inngest-orphan-audit) include a `// REFERENCE ONLY — operator runs this manually …` header.

---

### `docs/runbooks/multi-client-smoke.md`, `neon-scale-upgrade.md`, `betterstack-setup.md`

**Analog:** `docs/runbooks/logto-tenant-setup.md` (lines 1–60)

**Header + section structure pattern** (logto-tenant-setup.md:1-25):
```markdown
# Runbook: Logto tenant reproduction (staging / sandbox)

**References:**
- 08-CONTEXT.md D-03 (Logto dashboard provider config is manual + idempotent)
- `infrastructure/logto/scaffold.ts` (REFERENCE-ONLY listing helper from Phase 1)
- `infrastructure/logto/README.md` (env-var contract for `LOGTO_*` triple)

## When to use

- Bootstrapping a new tenant.
- Onboarding a new dev to a fresh Logto environment.

This runbook is **idempotent** — re-runs are no-ops; you can safely re-walk
all steps if you are unsure which step you completed last.

## Manual click-path

1. **Create tenant** at <https://cloud.logto.io>
   - Name: `mcpgen-staging`
   - Region: closest to user
2. **Sign-in experience**
   - Sign-in identifiers: enable `email` + `password`
   - **Do NOT** enable Google / Twitter / Apple — explicit OUT-OF-SCOPE per
     `RULES.md §6` anti-pattern #5.
...
```

**Sister analog for verification step pattern** — `docs/runbooks/migration-conflicts.md:1-50` (concise prevention + procedure structure).

---

### `apps/api/tests/load/test_neon_oom_replication.test.ts` (load test)

**Analog:** none in tree (new pattern). Closest scaffold: `apps/api/tests/storage/local-fs.test.ts` (test scaffold) + Phase 8 inngest tests (`db.execute(sql\`...\`)`).

**Per A15 (RESEARCH §Assumptions):** vitest default test timeout 5s; D-16 needs explicit `test.timeout(600_000)` per-test override OR a separate vitest config (`apps/api/vitest.load.config.ts`). Plan must explicitly set timeout.

**Workload pattern** (per D-16): `Promise.all` over 3 concurrent SQL streams — (1) tsvector full-text query, (2) pgvector ANN query, (3) TimescaleDB hypertable insert + autovacuum trigger — against `docker-compose.yml`'s local Postgres. RESEARCH §"Don't Hand-Roll" rules out `pgbench` (separate binary).

---

### Modified — `apps/web/sentry.{client,server,edge}.config.ts`

**Analog:** `apps/web/sentry.server.config.ts` (full, 1–19)

**Current pattern:**
```ts
import * as Sentry from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/sentry/redact';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
```

**Phase 9 edit (per A11):** keep import path `@/lib/sentry/redact` but `redact.ts` becomes thin re-export shim → `export { redactBeforeSend as redactSentryEvent } from '@mcpgen/contracts/sentry-redaction';`. Preserves 17 vitest unit tests; minimal blast radius.

---

### Modified — `packages/codegen-templates/templates/sentry_redact.ts.j2`

**Analog:** itself (current state, 1–85)

**Current state** (lines 27–41) — denylist matches **partial** D-03 spec, marked `Phase 9 follow-up` in NOTE 6:
```jinja2
const REDACT_HEADERS = new Set<string>([
  "authorization",
  "x-upstream-auth",
  "cookie",
  "set-cookie",
{% for h in auth_headers %}
  "{{ h }}",
{% endfor %}
]);

const REDACT_BODY_KEYS = new Set<string>([
{% for k in redact_body_keys %}
  "{{ k }}",
{% endfor %}
]);
```

**Phase 9 convergence (D-03):** EITHER (a) keep the per-Worker template code-generation form but expand denylist to match `redactBeforeSend` shape verbatim, OR (b) emit a one-liner `import { redactBeforeSend } from '@mcpgen/contracts/sentry-redaction';` if the template can resolve the package — RESEARCH §"Component Responsibilities" recommends (a) (denylist convergence with shared helper).

---

### Modified — `apps/generation-engine/src/mcpgen_engine/observability.py` (Logfire scrub callback)

**Analog:** itself (lines 28-50) + RESEARCH §"Pattern 2"

**Current state**:
```python
def configure_langfuse_otel() -> None:
    """Wire Logfire → OTel → Langfuse."""
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")
    endpoint = os.environ.get("LANGFUSE_OTEL_ENDPOINT", "...")

    # Logfire: do not forward to Logfire SaaS; we use it only for OTel SDK init.
    logfire.configure(send_to_logfire=False, service_name="mcpgen-generation-engine")
```

**Phase 9 edit (Pitfall #1 mitigation — preserve `langfuse.session.id` from Logfire's "session" auto-scrub):**
```python
import logfire

def _preserve_langfuse_session_id(match: logfire.ScrubMatch):
    """Logfire auto-scrubs anything matching 'session' — preserve langfuse.session.id."""
    if match.path == ("attributes", "langfuse.session.id"):
        return match.value
    if match.path == ("attributes", "langfuse.user.id"):
        return match.value
    return None  # let Logfire scrub the rest

logfire.configure(
    send_to_logfire=False,
    service_name="mcpgen-generation-engine",
    scrubbing=logfire.ScrubbingOptions(callback=_preserve_langfuse_session_id),
)
```

**Test** (analog `tests/test_observability.py:18-26`): assert calling `configure_langfuse_otel()` does not raise; new test asserts the scrubbing callback returns the value for `langfuse.session.id`.

---

### Modified — 10× `agent.run(...)` call sites (Pass 0–5 + Stage F2/F3)

**Analog (anchor):** `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py:138-159`

**Current call site pattern** (authoring.py:138-150):
```python
async def _run_with_transient_retry(agent: Agent[None, Description], prompt: str) -> Description:
    """Inner retry: exponential backoff on httpx.HTTPError (1s/2s/4s)."""
    backoff = _TRANSIENT_BACKOFF_BASE
    last_exc: BaseException | None = None
    for attempt in range(_MAX_TRANSIENT_RETRIES):
        try:
            result = await agent.run(prompt, model_settings=PASS_2_SETTINGS)
        except httpx.HTTPError as exc:
            ...
```

**Phase 9 edit (D-06, Pitfall #2 — Langfuse needs `langfuse.session.id` namespaced):** RECOMMENDED approach is the centralized wrapper (RESEARCH §"Pattern 2" Code Example) so the planner can edit ONE site instead of 11:

```python
# apps/generation-engine/src/mcpgen_engine/observability/run_tracing.py (NEW)
import logfire
from pydantic_ai import Agent
from typing import Any

async def run_with_tracing(
    agent: Agent[Any, Any],
    prompt: str,
    *,
    session_id: str,
    stage: str,
    model_settings: dict[str, Any],
) -> Any:
    """D-06 + Pitfall #2: wrap agent.run with Langfuse-namespaced span attrs."""
    with logfire.span("agent.run", attributes={
        "langfuse.session.id": session_id,
        "langfuse.tags": [stage],
    }):
        return await agent.run(prompt, model_settings=model_settings)
```

Then 10 call sites change from `await agent.run(prompt, model_settings=...)` to `await run_with_tracing(agent, prompt, session_id=str(generation.id), stage="pass-2", model_settings=...)`.

**All 10 call sites (RESEARCH §"Pattern 2" enumerated):** `passes/pass_0/llm.py:170`, `passes/pass_1/schema_synth.py:255` & `:285`, `passes/pass_2/authoring.py:149`, `passes/pass_2/quality_gate.py:138`, `passes/pass_3/enrich.py:168`, `passes/pass_3/quality_gate.py:166`, `passes/pass_4/llm_judge.py:117`, `passes/pass_5/field_ranking.py:199`, `stages/stage_f/f2_smell.py:155 & :167`, `stages/stage_f/f3_agent_eval.py:287`.

**Open Q #1 (RESEARCH §Open Questions):** Wave 0 spike — run one `agent.run(metadata={"session_id": "test"})` against the existing engine, capture OTel span attributes, verify whether `langfuse.session.id` appears OR if the wrapper helper is required. Cheap to verify; expensive to assume wrong.

---

### Modified — `docs/mcpgen-architecture.md` §6 (P99 SLO statement)

**Analog (CI gate pattern):** `packages/contracts/src/launch-criteria.ts:9-13` — text grep CI assertion proves doc threshold matches code constant.

**Phase 9 edit (D-20):** replace "P99 < 50ms over upstream" with "P99 warm < 50ms over upstream; P99 amortized (including amortized cold-start over 5-min keep-warm cron) < 100ms over upstream". Validate via `grep -q "P99 warm < 50ms" docs/mcpgen-architecture.md` in CI.

---

### Modified — `packages/codegen-templates/templates/server.ts.j2` (Zod schema cache)

**Analog (closest):** `packages/codegen-templates/templates/server.ts.j2` itself — currently no `globalThis` cache idiom in tree.

**D-20 + Pitfall #6 (cross-tenant cache leak):** the cache key MUST include the tenant identifier — `globalThis.__mcpgen_zod_schemas[`${tenant_id}:${tool_name}`]` — OR move schema declarations to module-init scope (`const SCHEMA = z.object(...)` at top of `tool_*.ts` file, not inside handler) which Zod already memoizes naturally per isolate. Recommend the module-init form: smaller blast radius, no globalThis pollution, no cache-key bug surface.

---

### Modified — `apps/dispatch/src/index.ts` (Sentry init wiring)

**Analog (current shape, lines 1-50):**
```ts
import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
...
import { smartIdFuzz } from './middleware/smartIdFuzz.js';
import { forwardToTenant } from './routing/forward.js';

interface Bindings {
  DISPATCH_NAMESPACE: DispatchNamespace;
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();
...
// Bun (Phase 6):
export default { port: 8789, fetch: app.fetch };
```

**Phase 9 edit (Pitfall #3):** add `import { sentryOptionsFor, withSentry } from './instrumentation.js';` and wrap default export. Empty-DSN no-op preserved by `apps/api/src/instrumentation.ts:42` `dsn: env.SENTRY_DSN ?? ''`.

---

### Modified — `apps/api/src/index.ts` (mount 3 new routes)

**Analog (current, lines 76-86):**
```ts
const protectedApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
protectedApp.use('*', authMiddleware);
protectedApp.route('/generate', generateRoute);
protectedApp.route('/jobs', jobsStreamRoute);
protectedApp.route('/billing/checkout', checkoutRoute);
protectedApp.route('/billing/portal', portalRoute);
protectedApp.route('/', driftRoute);  // self-prefixed
app.route('/api/v1', protectedApp);
```

**Phase 9 edit (D-18):** add 3 imports + 3 mounts (or 1 self-prefixed deploymentsRoute). Single-route option (recommended per RESEARCH §"Open Q #4"):
```ts
import { deploymentsRoute } from './routes/v1/deployments.js'; // self-prefixes /deployments, /usage/hourly, /deploy/:id
...
protectedApp.route('/', deploymentsRoute);
```

---

## Shared Patterns

### 1. Empty-DSN no-op invariant

**Source:** `apps/api/src/instrumentation.ts:38-43` (TS) + `apps/generation-engine/src/mcpgen_engine/main.py:53-66` (Py)

**Apply to:** All Sentry init sites (D-01).

```ts
// TS
return {
  dsn: env.SENTRY_DSN ?? '',  // empty DSN treated as 'disabled'
  ...
};
```

```python
# Py
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),  # falsy DSN → no-op (SDK design)
    ...
)
```

### 2. M2M-rejection + 4-table org-scope (defense-in-depth 404)

**Source:** `apps/api/src/routes/v1/drift.ts:48-115`

**Apply to:** All 4 D-18 BFF endpoints. Always JOIN through `deployments → generations → projects → organizations`. M2M tokens get 403; foreign-org gets 404 (defense-in-depth: never confirm existence).

### 3. Stable Inngest function ID register

**Source:** `packages/contracts/src/inngest-functions.ts:15-23` (7 IDs `as const`)

**Apply to:** D-14 orphan audit static-source assertion. Never hardcode an ID literal in a `createFunction({ id: ... })` call — always reference `INNGEST_FUNCTION_IDS.X`. Regex: `/id:\s*INNGEST_FUNCTION_IDS\.([A-Z_]+)/g`.

### 4. Drizzle migration timestamp prefix (Pitfall #18)

**Source:** `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql:6-8` (header comment) + `docs/runbooks/migration-conflicts.md:1-50` (resolution procedure)

**Apply to:** D-19 (`20260430000000_phase9_badge_public.sql`). Strictly greater than `20260428000002` (Phase 8). Header comment MUST mark filename FROZEN. Hand-update `_journal.json` OR regenerate via `drizzle-kit generate` then rename. Verify via `pnpm --filter @mcpgen/contracts db:test-migrate`.

### 5. Mocked-now-real-later StorageAdapter substitution

**Source:** `packages/contracts/src/storage.ts:8-16` (interface) + `apps/api/src/lib/storage/local-fs.ts` (Phase 9 impl) + `apps/api/src/lib/storage/r2.ts` (Phase 10 stub)

**Apply to:** D-13 leak-audit Sentry events API mock (Phase 9 mock impl + Phase 10 real impl, env-flag swap).

### 6. Static-source contract test (vitest with `readFileSync`)

**Source:** `apps/api/tests/inngest/drift-watcher.test.ts:14-32`, `usage-reconciler.test.ts:11-31`, `cost-cap-enforcer.test.ts:11-22`

**Apply to:** D-14 (orphan audit), D-19 (paired migration assertion).

### 7. JSON-fixture-driven cross-language equivalence

**Source:** `apps/generation-engine/tests/fixtures/circular_ref_spec.json` (single-file fixture pattern)

**Apply to:** `tests/fixtures/leak-vectors.json` consumed by both vitest (D-12 TS) and pytest (D-12 Py); fixture stays at REPO ROOT so both harnesses can `readFileSync`/`Path.read_text` from a known relative path.

### 8. `as const` denylist export with paired-decision guard

**Source:** `packages/contracts/src/launch-criteria.ts:34-46` + `.pre-commit-hooks/launch-criteria-paired-decision.sh`

**Apply to:** `packages/contracts/src/sentry-redaction.ts` REDACTED_HEADERS / REDACTED_QUERY_PARAMS / REDACTION_VALUE / SENSITIVE_STRING_PATTERNS — exported `as const` so importers can pattern-match against the literal type. Any future denylist expansion is a single-PR change visible to all 4 apps + Stage E template.

### 9. Pitfall #10 5-min created_at filter (avoid CI seed false-positives)

**Source:** RESEARCH §"Code Example 3" (outbox-depth-monitor)

**Apply to:** D-21 outbox depth alert. Always `WHERE sent_at IS NULL AND created_at < now() - interval '5 minutes'`.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `apps/api/tests/load/test_neon_oom_replication.test.ts` | load test (10-min concurrent SQL) | No load-test pattern in tree — vitest is configured per-file with default 5s timeout; D-16 plan must explicitly set `test.timeout(600_000)` OR a separate `vitest.load.config.ts` (per A15). RESEARCH eliminates pgbench. |
| Stage E `globalThis.__mcpgen_zod_schemas` cache | template (Zod schema cache) | No `globalThis` cache idiom exists in `packages/codegen-templates/templates/`. Recommend module-init scope schema declarations (Zod-natural memoization) over a globalThis cache to avoid Pitfall #6 (cross-tenant leak in shared isolate). |

---

## Metadata

**Analog search scope:** `apps/api/`, `apps/web/`, `apps/dispatch/`, `apps/generation-engine/`, `packages/contracts/`, `packages/codegen-templates/`, `infrastructure/neon/migrations/`, `docs/runbooks/`, `scripts/`.

**Files scanned (read concretely):**
- `apps/api/src/instrumentation.ts` (full)
- `apps/api/src/index.ts` (full)
- `apps/api/src/routes/v1/drift.ts` (full)
- `apps/api/src/inngest/functions/index.ts` (full)
- `apps/api/tests/routes/drift.test.ts` (full)
- `apps/api/tests/inngest/drift-watcher.test.ts` (full)
- `apps/api/tests/inngest/cost-cap-enforcer.test.ts` (1–60)
- `apps/api/tests/inngest/usage-reconciler.test.ts` (1–60)
- `apps/api/tests/storage/local-fs.test.ts` (1–60)
- `apps/api/tests/billing/checkout.test.ts` (1–80)
- `apps/api/scripts/seed-synthetic-usage.ts` (1–60)
- `apps/web/src/lib/sentry/redact.ts` (full)
- `apps/web/sentry.server.config.ts` (full)
- `apps/dispatch/src/index.ts` (full)
- `apps/dispatch/src/middleware/smartIdFuzz.ts` (full)
- `apps/dispatch/tests/smart-id-fuzz.test.ts` (full)
- `apps/generation-engine/src/mcpgen_engine/main.py` (full)
- `apps/generation-engine/src/mcpgen_engine/observability.py` (full)
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py` (130–160)
- `apps/generation-engine/tests/test_observability.py` (full)
- `apps/generation-engine/tests/test_smart_id_no_overlap.py` (full)
- `apps/generation-engine/tests/integration/test_pipeline_e2e.py` (1–80)
- `packages/contracts/src/sentry-redaction.ts` — N/A (target file, NEW)
- `packages/contracts/src/inngest-functions.ts` (full)
- `packages/contracts/src/storage.ts` (full)
- `packages/contracts/src/launch-criteria.ts` (full)
- `packages/contracts/src/db-schema.ts` (140–180)
- `packages/codegen-templates/templates/sentry_redact.ts.j2` (full)
- `packages/codegen-templates/templates/server.ts.j2` (full)
- `packages/codegen-templates/templates/smart_id.ts.j2` (1–30)
- `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` (full)
- `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` (full)
- `infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql` (1–60)
- `infrastructure/logto/scaffold.ts` (1–40)
- `docs/runbooks/logto-tenant-setup.md` (1–60)
- `docs/runbooks/migration-conflicts.md` (1–50)

**Pattern extraction date:** 2026-04-30
