// apps/web/tests/unit/lib/api/dashboard-client.test.ts
//
// Plan 07-05 — vitest unit tests for the dashboard data path:
//   1. fetchDeployments parses BFF response shape and returns Deployment[]
//   2. fetchDeployments throws on Zod parse failure (no silent fallbacks)
//   3. fetchUsageHourly accepts deployment_id + from + to params and
//      constructs a proper URL
//   4. deploy on 202 returns ok:true
//   5. deploy on 409 returns ok:false with parsed collision response
//      (existing_name + suggested_name)
//   6. deploy on 5xx returns ok:false with message
//   7. setBadgePublic sends PATCH with { public_badge: true }
//
// Mocks `globalThis.fetch` via vi.spyOn — same shim approach as
// tests/unit/lib/api/client.test.ts (Plan 07-02).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GEN_ID_REGEX, IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

import {
  deploy,
  fetchDeployments,
  fetchUsageHourly,
  setBadgePublic,
} from '@/lib/api/dashboard-client';

// CR-01 fix: deploy() + setBadgePublic() now generate an Idempotency-Key via
// getOrCreateIdempotencyKey, which reads/writes localStorage. JSDOM 26 ships
// with a Storage that's missing `clear` in some builds; install a Map-backed
// shim so the helper always sees a writable Storage and tests are isolated
// across runs (mirrors tests/unit/lib/idempotency-key.test.ts).
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(i: number): string | null {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_DEPLOYMENT = {
  deployment_id: '11111111-1111-4111-8111-111111111111',
  generation_id: '22222222-2222-4222-8222-222222222222',
  server_name: 'fixture-stripe-mcp',
  server_url: 'https://fixture-stripe-mcp.mcpgen.dev',
  auth_mode: 'passthrough',
  deployed_at: '2026-04-15T12:00:00.000Z',
  quality_report: null,
  public_badge: false,
};

describe('lib/api/dashboard-client.fetchDeployments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses BFF response shape and returns Deployment[]', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { deployments: [VALID_DEPLOYMENT] }));

    const deployments = await fetchDeployments();

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/deployments');
    expect(deployments).toHaveLength(1);
    expect(deployments[0]?.server_name).toBe('fixture-stripe-mcp');
    expect(deployments[0]?.public_badge).toBe(false);
  });

  it('throws on Zod parse failure (no silent fallbacks per CLAUDE.md)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, { deployments: [{ server_name: 'incomplete' }] }),
    );

    await expect(fetchDeployments()).rejects.toThrow();
  });

  it('throws when BFF returns non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(502, { error: 'bff_unreachable' }),
    );

    await expect(fetchDeployments()).rejects.toThrow(/502/);
  });
});

describe('lib/api/dashboard-client.fetchUsageHourly', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts deployment_id + from + to params and constructs proper URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { rows: [] }));

    await fetchUsageHourly({
      deploymentId: '11111111-1111-4111-8111-111111111111',
      from: '2026-04-26T00:00:00.000Z',
      to: '2026-04-27T00:00:00.000Z',
    });

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toMatch(/\/api\/v1\/usage\/hourly\?/);
    const url = new URL(calledUrl, 'http://localhost');
    expect(url.searchParams.get('from')).toBe('2026-04-26T00:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-04-27T00:00:00.000Z');
    expect(url.searchParams.get('deployment_id')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('omits deployment_id when not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { rows: [] }));

    await fetchUsageHourly({
      from: '2026-04-26T00:00:00.000Z',
      to: '2026-04-27T00:00:00.000Z',
    });

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    const url = new URL(calledUrl, 'http://localhost');
    expect(url.searchParams.has('deployment_id')).toBe(false);
  });
});

describe('lib/api/dashboard-client.deploy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorageShim();
  });

  it('on 202 returns ok:true with parsed deploy response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(202, {
        deployment_id: '33333333-3333-4333-8333-333333333333',
        server_name: 'new-mcp',
        server_url: 'https://new-mcp.mcpgen.dev',
      }),
    );

    const result = await deploy('44444444-4444-4444-8444-444444444444');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/deploy/44444444-4444-4444-8444-444444444444',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.server_name).toBe('new-mcp');
    }
  });

  it('on 409 returns ok:false with parsed collision response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(409, {
        error: 'server_name_collision',
        existing_name: 'fixture-stripe-mcp',
        suggested_name: 'fixture-stripe-mcp-2',
      }),
    );

    const result = await deploy('55555555-5555-4555-8555-555555555555');

    expect(result.ok).toBe(false);
    if (result.ok || !('collision' in result)) {
      throw new Error('expected 409 collision result');
    }
    expect(result.collision.existing_name).toBe('fixture-stripe-mcp');
    expect(result.collision.suggested_name).toBe('fixture-stripe-mcp-2');
  });

  it('on 5xx returns ok:false with message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(502, {
        error: 'bff_unreachable',
        upstream_url: 'http://localhost:8787/api/v1/deploy/x',
        message: 'connection refused',
      }),
    );

    const result = await deploy('66666666-6666-4666-8666-666666666666');

    expect(result.ok).toBe(false);
    if (result.ok || 'collision' in result) {
      throw new Error('expected non-409 failure result');
    }
    expect(result.status).toBe(502);
    expect(result.message).toBe('connection refused');
  });

  it('forwards override_name when supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(202, {
        deployment_id: '77777777-7777-4777-8777-777777777777',
        server_name: 'fixture-stripe-mcp-2',
        server_url: 'https://fixture-stripe-mcp-2.mcpgen.dev',
      }),
    );

    await deploy('88888888-8888-4888-8888-888888888888', {
      override_name: 'fixture-stripe-mcp-2',
    });

    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ override_name: 'fixture-stripe-mcp-2' }));
  });

  it('forwards a `gen_${ULID}` Idempotency-Key on every call (CR-01)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(202, {
        deployment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        server_name: 'with-idem-key',
        server_url: 'https://with-idem-key.mcpgen.dev',
      }),
    );

    await deploy('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01');

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    const key = headers?.[IDEMPOTENCY_KEY_HEADER];
    expect(typeof key).toBe('string');
    expect(GEN_ID_REGEX.test(key as string)).toBe(true);
  });

  it('reuses the same Idempotency-Key on retry of the same logical action (CR-01)', async () => {
    // Each call needs its own Response — Body is single-use in undici/whatwg.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(202, {
        deployment_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        server_name: 'retry-test',
        server_url: 'https://retry-test.mcpgen.dev',
      }),
    );

    await deploy('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01');
    await deploy('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01');

    const headersA = fetchSpy.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const headersB = fetchSpy.mock.calls[1]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headersA?.[IDEMPOTENCY_KEY_HEADER]).toBe(headersB?.[IDEMPOTENCY_KEY_HEADER]);
  });

  it('mints distinct Idempotency-Keys for different override_name (CR-01)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(202, {
        deployment_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        server_name: 'distinct-test',
        server_url: 'https://distinct-test.mcpgen.dev',
      }),
    );

    await deploy('cccccccc-cccc-4ccc-8ccc-cccccccccc01');
    await deploy('cccccccc-cccc-4ccc-8ccc-cccccccccc01', {
      override_name: 'distinct-test-2',
    });

    const headersA = fetchSpy.mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    const headersB = fetchSpy.mock.calls[1]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headersA?.[IDEMPOTENCY_KEY_HEADER]).not.toBe(
      headersB?.[IDEMPOTENCY_KEY_HEADER],
    );
  });
});

describe('lib/api/dashboard-client.setBadgePublic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorageShim();
  });

  it('sends PATCH with { public_badge: true }', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          deployment_id: '99999999-9999-4999-8999-999999999999',
          public_badge: true,
        }),
      );

    await setBadgePublic('99999999-9999-4999-8999-999999999999', true);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/deployments/99999999-9999-4999-8999-999999999999/badge-public',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ public_badge: true }),
      }),
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    const key = headers?.[IDEMPOTENCY_KEY_HEADER];
    expect(typeof key).toBe('string');
    expect(GEN_ID_REGEX.test(key as string)).toBe(true);
  });

  it('throws on non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(502, { error: 'bff_unreachable' }),
    );

    await expect(
      setBadgePublic('99999999-9999-4999-8999-999999999999', true),
    ).rejects.toThrow(/502/);
  });
});
