// apps/web/tests/unit/lib/api/clients.test.ts
//
// Foundation Agent F-BFFClients — smoke tests for the typed BFF clients in
// apps/web/src/lib/api/. Mocks `globalThis.fetch` to assert each client:
//   1. parses a valid response correctly
//   2. surfaces a 4xx/5xx as a structured error result (no throws)
//   3. surfaces a Zod parse failure as `error: 'invalid_response'`
//   4. routes the disabled-feature stubs to `flag_off_or_not_implemented`
//
// References:
//   - apps/web/tests/unit/lib/api/dashboard-client.test.ts (analog pattern)
//   - apps/web/vitest.setup.ts (fetch stub policy)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GEN_ID_REGEX, IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

// JSDOM 26 ships a Storage that may lack `clear`; install a Map-backed shim
// so getOrCreateIdempotencyKey always sees a writable Storage.
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

beforeEach(() => {
  installLocalStorageShim();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── submitGeneration ──────────────────────────────────────────────────────

describe('lib/api/generate.submitGeneration', () => {
  it('returns ok:true with parsed body on 202', async () => {
    const { submitGeneration } = await import('@/lib/api/generate');
    const validBody = {
      job_id: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1',
      sse_url: 'https://api.local/api/v1/jobs/gen_01HXAAAAAAAAAAAAAAAAAAAAA1/stream',
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(202, validBody));

    const result = await submitGeneration({
      specUrl: 'https://example.com/openapi.json',
      specHash: 'h1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.job_id).toBe(validBody.job_id);
      expect(result.data.sse_url).toBe(validBody.sse_url);
    }
    // Idempotency-Key header was attached and matches the contract regex.
    const initArg = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = initArg?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(GEN_ID_REGEX.test(headers?.[IDEMPOTENCY_KEY_HEADER] ?? '')).toBe(true);
  });

  it('returns ok:false with structured error on 400', async () => {
    const { submitGeneration } = await import('@/lib/api/generate');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid_spec', message: 'spec_url not parseable' }),
    );
    const result = await submitGeneration({
      specUrl: 'https://example.com/openapi.json',
      specHash: 'h2',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe('invalid_spec');
    }
  });

  it('returns ok:false invalid_response when 202 body fails Zod', async () => {
    const { submitGeneration } = await import('@/lib/api/generate');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(202, { not_a_real_field: true }),
    );
    const result = await submitGeneration({
      specUrl: 'https://example.com/openapi.json',
      specHash: 'h3',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_response');
    }
  });
});

// ─── jobs.fetchJob ─────────────────────────────────────────────────────────

describe('lib/api/jobs.fetchJob', () => {
  it('parses a streaming-status snapshot', async () => {
    const { fetchJob } = await import('@/lib/api/jobs');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, {
        status: 'streaming',
        job_id: 'gen_01HX',
        owned_via_cookie: true,
        partial_result: null,
      }),
    );
    const result = await fetchJob('gen_01HX');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('streaming');
      expect(result.data.owned_via_cookie).toBe(true);
    }
  });

  it('returns 404 as structured error', async () => {
    const { fetchJob } = await import('@/lib/api/jobs');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(404, { error: 'not_found' }),
    );
    const result = await fetchJob('gen_missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe('not_found');
    }
  });
});

// ─── deployments.fetchDeployments ──────────────────────────────────────────

describe('lib/api/deployments.fetchDeployments', () => {
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

  it('parses the BFF list response', async () => {
    const { fetchDeployments } = await import('@/lib/api/deployments');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, { deployments: [VALID_DEPLOYMENT] }),
    );
    const result = await fetchDeployments();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.deployments).toHaveLength(1);
      expect(result.data.deployments[0]?.deployment_id).toBe(
        VALID_DEPLOYMENT.deployment_id,
      );
    }
  });

  it('handles 403 with structured error', async () => {
    const { fetchDeployments } = await import('@/lib/api/deployments');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(403, { error: 'forbidden', reason: 'm2m_cannot_list_deployments' }),
    );
    const result = await fetchDeployments();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe('forbidden');
    }
  });
});

// ─── billing.fetchUsageHourly ──────────────────────────────────────────────

describe('lib/api/billing.fetchUsageHourly', () => {
  it('parses rows', async () => {
    const { fetchUsageHourly } = await import('@/lib/api/billing');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, {
        rows: [
          {
            deployment_id: '11111111-1111-4111-8111-111111111111',
            hour_bucket: '2026-04-15T12:00:00.000Z',
            call_count: 5,
            total_latency_ms: 1234,
            total_cost_usd: 0.0005,
            error_count: 0,
          },
        ],
      }),
    );
    const result = await fetchUsageHourly({
      from: '2026-04-15T00:00:00.000Z',
      to: '2026-04-16T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toHaveLength(1);
    }
  });
});

describe('lib/api/billing.createCheckoutSession', () => {
  it('parses Stripe checkout URL', async () => {
    const { createCheckoutSession } = await import('@/lib/api/billing');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(200, { url: 'https://checkout.stripe.com/c/pay/abc' }),
    );
    const result = await createCheckoutSession();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
    }
  });

  it('surfaces 400 as structured error', async () => {
    const { createCheckoutSession } = await import('@/lib/api/billing');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(400, { error: 'no_org_context' }),
    );
    const result = await createCheckoutSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no_org_context');
    }
  });
});

// ─── marketplace (stubbed) ─────────────────────────────────────────────────

describe('lib/api/marketplace.fetchMarketplaceServers', () => {
  it('returns flag_off_or_not_implemented without firing fetch', async () => {
    const { fetchMarketplaceServers } = await import('@/lib/api/marketplace');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchMarketplaceServers();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('flag_off_or_not_implemented');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── admin (stubbed) ───────────────────────────────────────────────────────

describe('lib/api/admin.fetchAdminOrgs', () => {
  it('returns flag_off_or_not_implemented without firing fetch', async () => {
    const { fetchAdminOrgs } = await import('@/lib/api/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchAdminOrgs();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('flag_off_or_not_implemented');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── client-base.request: network errors ───────────────────────────────────

describe('lib/api/client-base.request', () => {
  it('returns network_error when fetch rejects', async () => {
    const { request } = await import('@/lib/api/client-base');
    const { z } = await import('zod');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));
    const result = await request({
      method: 'GET',
      path: '/api/v1/anything',
      schema: z.object({ ok: z.boolean() }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('network_error');
      expect(result.status).toBe(0);
    }
  });
});
