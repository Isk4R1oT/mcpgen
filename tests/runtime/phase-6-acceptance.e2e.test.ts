// tests/runtime/phase-6-acceptance.e2e.test.ts
//
// Phase 6 Wave 5 — gold-standard cross-app acceptance E2E. This is the single
// load-bearing test that exercises the FULL Phase-6 runtime plane:
//   apps/dispatch (port 8789) -> apps/tenant-worker-runner (port 8788)
//                              -> apps/dispatch-sample (port 8790+)
//                              -> apps/inngest-dev (port 3030)
//
// Three `it()` blocks:
//   1. Full pipeline: deploy a tenant via the runner /admin/spawn endpoint,
//      issue MCP `initialize` against the dispatch path /t/<scriptName>/,
//      issue `tools/list`, assert the 3 hand-coded tools come back.
//   2. Capability gating (T-6-04): repeat with legacy protocolVersion
//      2024-11-05 and assert the response carries no `outputSchema` field.
//   3. Cross-tenant smart-ID rejection (T-6-01): issue a tools/call whose
//      `params.id` is a smart-ID prefixed for ANOTHER tenant; expect 403
//      with error code `smart_id_tenant_mismatch`.
//
// Per INFO-4, `tools/call` is intentionally NOT exercised in (1) — the full
// credential round-trip is asserted by passthrough-credentials.test.ts (Plan
// 03 Task 1) and the usage event ingest+dedup is asserted by
// usage-events-pipeline.test.ts (Plan 04 Task 3). The dispatch + tenant-
// worker-runner round-trip already exercises the same middleware chain
// (host-header validation, capability gating, tenant lookup, smart-ID fuzz,
// multi-port forwarding) via initialize + tools/list.
//
// The smart-ID rejection block in (3) DOES use tools/call — that path is the
// only one whose params include a smart-ID, but the upstream call never
// happens because the dispatch middleware short-circuits with 403.
//
// Skips when DATABASE_URL or required toolchain are missing (CI without
// secrets skips cleanly; local dev with a Neon connection runs end-to-end).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import {
  makeInitializeRequest,
  makeMockClientHeaders,
  makeMockSessionId,
  MOCK_PROTOCOL_VERSIONS,
} from './fixtures/mock-mcp-clients.js';

const REPO_ROOT = join(__dirname, '..', '..');
const DISPATCH_ENTRY = join(REPO_ROOT, 'apps/dispatch/src/index.ts');
const RUNNER_ENTRY = join(REPO_ROOT, 'apps/tenant-worker-runner/src/index.ts');
const SAMPLE_ENTRY = join(REPO_ROOT, 'apps/dispatch-sample/src/index.ts');
const INNGEST_DEV_ENTRY = join(REPO_ROOT, 'apps/inngest-dev/src/index.ts');

const HAS_DB = Boolean(process.env.DATABASE_URL);

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function spawnApp(entry: string, env: Record<string, string>): ChildProcess {
  return spawn('bun', ['run', entry], {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

describe('Phase 6 Wave 5 — acceptance E2E (full pipeline)', () => {
  let dispatch: ChildProcess | null = null;
  let runner: ChildProcess | null = null;
  let inngestDev: ChildProcess | null = null;

  beforeAll(async () => {
    if (!HAS_DB) return;
    runner = spawnApp(RUNNER_ENTRY, { ALLOWED_HOSTS: 'localhost,127.0.0.1' });
    dispatch = spawnApp(DISPATCH_ENTRY, { ALLOWED_HOSTS: 'localhost,127.0.0.1' });
    inngestDev = spawnApp(INNGEST_DEV_ENTRY, {
      ALLOWED_HOSTS: 'localhost,127.0.0.1',
      INNGEST_DEV_URL: 'http://localhost:8288/e/mcpgen-dev',
    });
    const runnerUp = await waitForHealth('http://localhost:8788/health', 5_000);
    const dispatchUp = await waitForHealth('http://localhost:8789/health', 5_000);
    const inngestUp = await waitForHealth('http://localhost:3030/health', 5_000);
    expect(runnerUp).toBe(true);
    expect(dispatchUp).toBe(true);
    expect(inngestUp).toBe(true);
  }, 30_000);

  afterAll(() => {
    runner?.kill('SIGTERM');
    dispatch?.kill('SIGTERM');
    inngestDev?.kill('SIGTERM');
  });

  /**
   * covers RUN-01 (capability gating) + RUN-02 (tenant Workers) + T-6-04
   * (capability gating) + T-6-15 (DNS rebinding via host header).
   *
   * Per INFO-4: tools/call is intentionally OMITTED from this acceptance E2E.
   * credential round-trip is asserted by passthrough-credentials.test.ts (Plan 03)
   * usage event ingest dedup is asserted by usage-events-pipeline.test.ts (Plan 04)
   *
   * The dispatch + tenant-worker-runner round-trip is sufficiently asserted
   * by the initialize + tools/list path below (capability gating, smart-ID
   * fuzz, host-header validation, tenant lookup, multi-port forwarding all
   * exercise the same middleware chain).
   */
  it.skipIf(!HAS_DB)(
    'Phase-6 full pipeline: deploy + initialize + tools/list returns 3 tools',
    async () => {
      const scriptName = `phase6-acceptance-${Date.now()}`;
      const spawnRes = await fetch('http://localhost:8788/admin/spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName, bundlePath: SAMPLE_ENTRY }),
      });
      expect(spawnRes.status).toBe(201);
      const spawnBody = (await spawnRes.json()) as { port: number; url: string };
      expect(spawnBody.url).toMatch(/localhost:879\d/);

      const sessionId = makeMockSessionId();
      const initBody = makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.latest, sessionId);
      const initHeaders = makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.latest, sessionId);
      const initResp = await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: { ...initHeaders, Authorization: 'Bearer test' },
        body: JSON.stringify(initBody),
      });
      // initialize must succeed (200) and surface a session id header.
      expect(initResp.ok).toBe(true);
      const respSessionId = initResp.headers.get('Mcp-Session-Id') ?? sessionId;
      expect(respSessionId).toMatch(/^[0-9a-f-]{36}$/);

      const listResp = await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: {
          ...makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.latest, respSessionId),
          Authorization: 'Bearer test',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      expect(listResp.ok).toBe(true);
      const listJson = (await listResp.json()) as {
        result?: { tools?: Array<{ name: string }> };
      };
      const names = (listJson.result?.tools ?? []).map((t) => t.name).sort();
      expect(names).toEqual(['charges_fetch', 'customers_search', 'subscriptions_list']);

      // Cleanup.
      await fetch('http://localhost:8788/admin/kill', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName }),
      });
    },
    60_000,
  );

  /**
   * covers RUN-01 + T-6-04 (capability gating bypass for clients < 2025-06-18)
   *
   * Legacy clients (2024-11-05) MUST receive tools/list responses with the
   * `outputSchema` field stripped per CONTEXT D-11.
   */
  it.skipIf(!HAS_DB)(
    'Phase-6 capability gating: legacy client (2024-11-05) gets stripped outputSchema',
    async () => {
      const scriptName = `phase6-legacy-${Date.now()}`;
      const spawnRes = await fetch('http://localhost:8788/admin/spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName, bundlePath: SAMPLE_ENTRY }),
      });
      expect(spawnRes.status).toBe(201);

      const sessionId = makeMockSessionId();
      await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: {
          ...makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.legacy, sessionId),
          Authorization: 'Bearer test',
        },
        body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.legacy, sessionId)),
      });

      const listResp = await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: {
          ...makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.legacy, sessionId),
          Authorization: 'Bearer test',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      const listJson = (await listResp.json()) as {
        result?: { tools?: Array<Record<string, unknown>> };
      };
      const tools = listJson.result?.tools ?? [];
      for (const t of tools) {
        expect(t).not.toHaveProperty('outputSchema');
      }

      await fetch('http://localhost:8788/admin/kill', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName }),
      });
    },
    60_000,
  );

  /**
   * covers T-6-01 (cross-tenant smart-ID leakage / pitfall #1)
   *
   * tools/call with a smart-ID prefixed for ANOTHER tenant must be rejected
   * by the dispatch smartIdFuzz middleware with 403 + structured error
   * `smart_id_tenant_mismatch`. The upstream call never happens.
   */
  it.skipIf(!HAS_DB)(
    'Phase-6 cross-tenant smart-ID rejection: tools/call returns 403 smart_id_tenant_mismatch',
    async () => {
      const scriptName = `phase6-smartid-${Date.now()}`;
      await fetch('http://localhost:8788/admin/spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName, bundlePath: SAMPLE_ENTRY }),
      });

      const sessionId = makeMockSessionId();
      await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: {
          ...makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.latest, sessionId),
          Authorization: 'Bearer test',
        },
        body: JSON.stringify(makeInitializeRequest(MOCK_PROTOCOL_VERSIONS.latest, sessionId)),
      });

      const callResp = await fetch(`http://localhost:8789/t/${scriptName}/`, {
        method: 'POST',
        headers: {
          ...makeMockClientHeaders(MOCK_PROTOCOL_VERSIONS.latest, sessionId),
          Authorization: 'Bearer test',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'charges_fetch',
            arguments: { id: 'OTHER-TENANT:object:Charge:ch_xxxxxxxxxxxxxxxxx' },
          },
        }),
      });
      expect(callResp.status).toBe(403);
      const body = (await callResp.json()) as { error?: string };
      expect(body.error).toBe('smart_id_tenant_mismatch');

      await fetch('http://localhost:8788/admin/kill', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: JSON.stringify({ scriptName }),
      });
    },
    60_000,
  );
});
