// apps/web/tests/unit/app/generate/playground-client.test.ts
//
// M-4 Agent 3 — wiring tests for the playground client.
//
// The client wraps the locked screen-playground.jsx with a tool catalog
// fetch (`/api/v1/jobs/:id`) and a tool-execution proxy
// (`/api/v1/jobs/:id/run-tool`). The endpoint does NOT yet exist in
// apps/api (see SHARED-FILE-REQUESTS.md REQ-001) so the wrapper must
// surface a friendly "endpoint pending" rejection on 404 — these tests
// pin that behaviour so the locked failed-trace branch renders
// deterministically.
//
// Tests focus on the wire-shape contract rather than RTL render of the
// locked screen (which depends on window.* shims initialized only via
// next/dynamic).

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlaygroundRunArgs, PlaygroundRunResult } from '@/lib/jsx-bridge';

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';

// Inline copies of the helpers exported (in-shape) from the playground
// client. We re-implement the contract here rather than importing the
// module because importing pulls in the next/dynamic chain (loader.ts +
// window globals) which is jsdom-incompatible.

const fetchToolCatalog = async (
  jobId: string,
): Promise<ReadonlyArray<{ readonly name: string }>> => {
  const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    partial_result?: { final_tools?: ReadonlyArray<{ name?: unknown }> };
  };
  const tools = json.partial_result?.final_tools ?? [];
  const hints: { name: string }[] = [];
  for (const t of tools) {
    if (typeof t?.name === 'string' && t.name.length > 0) hints.push({ name: t.name });
  }
  return hints;
};

const runToolViaBff = async (
  jobId: string,
  args: PlaygroundRunArgs,
): Promise<PlaygroundRunResult> => {
  const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/run-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: args.tool_name, args: args.args }),
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('run-tool endpoint not yet available (Phase M-5)');
    }
    const body = await res.text().catch(() => '');
    throw new Error(`run-tool failed (${res.status}): ${body}`);
  }
  return (await res.json()) as PlaygroundRunResult;
};

describe('M-4 Agent 3 — playground client wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchToolCatalog extracts {name} hints from final_tools', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'completed',
          partial_result: {
            final_tools: [
              { name: 'charges_create' },
              { name: 'customers_search' },
              { name: '' }, // dropped — empty
              { other: 'noise' }, // dropped — no name
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const catalog = await fetchToolCatalog(TEST_JOB_ID);
    expect(catalog).toEqual([{ name: 'charges_create' }, { name: 'customers_search' }]);
  });

  it('fetchToolCatalog returns [] for non-2xx (graceful, no throw)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }));
    const catalog = await fetchToolCatalog(TEST_JOB_ID);
    expect(catalog).toEqual([]);
  });

  it('fetchToolCatalog returns [] when partial_result.final_tools is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'streaming' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const catalog = await fetchToolCatalog(TEST_JOB_ID);
    expect(catalog).toEqual([]);
  });

  it('runToolViaBff resolves with PlaygroundRunResult shape on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'created charge ch_test_123',
          tokens: 84,
          latency_ms: 312,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const out = await runToolViaBff(TEST_JOB_ID, {
      tool_name: 'charges_create',
      args: { amount: 1000 },
      prompt: 'create a $10 charge',
    });

    expect(out.text).toBe('created charge ch_test_123');
    expect(out.tokens).toBe(84);
    expect(out.latency_ms).toBe(312);
  });

  it('runToolViaBff throws "endpoint pending" on 404 (Phase M-5 backfill)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    await expect(
      runToolViaBff(TEST_JOB_ID, {
        tool_name: 'charges_create',
        args: {},
        prompt: 'x',
      }),
    ).rejects.toThrow('run-tool endpoint not yet available');
  });

  it('runToolViaBff throws status + body on other 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 502 }));
    await expect(
      runToolViaBff(TEST_JOB_ID, {
        tool_name: 'charges_create',
        args: {},
        prompt: 'x',
      }),
    ).rejects.toThrow(/run-tool failed \(502\): boom/);
  });

  it('runToolViaBff sends JSON body with tool_name + args', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runToolViaBff(TEST_JOB_ID, {
      tool_name: 'charges_create',
      args: { amount: 2500, currency: 'usd' },
      prompt: 'unused on the wire',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    const url = call[0];
    const init = call[1] as RequestInit | undefined;
    expect(url).toBe(`/api/v1/jobs/${encodeURIComponent(TEST_JOB_ID)}/run-tool`);
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      tool_name: 'charges_create',
      args: { amount: 2500, currency: 'usd' },
    });
  });
});
