// Vitest unit test — apps/web/src/lib/api/client.ts (Plan 07-02 Task 1).
//
// Covers:
//   1. submitGeneration sends POST with Idempotency-Key header matching GEN_ID_REGEX
//   2. submitGeneration sends Content-Type: application/json
//   3. submitGeneration on 202 calls rotateIdempotencyKey and returns ok:true
//   4. submitGeneration on 501 (Phase-1 stub) returns ok:false with mapped message
//   5. submitGeneration on network error throws (no retry per CLAUDE.md)
//
// Mocks `globalThis.fetch` via vi.spyOn to assert the outbound request shape.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GEN_ID_REGEX, IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

import { submitGeneration } from '@/lib/api/client';

const TEST_SPEC_URL = 'https://example.com/spec.json';
const TEST_SPEC_HASH = '';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Same shim as tests/unit/lib/idempotency-key.test.ts — jsdom 26 + Vitest 1.x
// Storage impl is missing `clear`; install a Map-backed Storage so tests have
// real localStorage semantics without depending on the broken jsdom path.
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

describe('lib/api/client.submitGeneration', () => {
  beforeEach(() => {
    installLocalStorageShim();
    vi.restoreAllMocks();
  });

  it('sends POST with Idempotency-Key header matching GEN_ID_REGEX', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(202, {
          job_id: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1',
          sse_url: 'https://example.com/sse',
        }),
      );

    await submitGeneration({
      specUrl: TEST_SPEC_URL,
      specHash: TEST_SPEC_HASH,
      request: { spec_url: TEST_SPEC_URL },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    if (callArgs === undefined) {
      throw new Error('fetch was not called');
    }
    const [path, init] = callArgs;
    expect(path).toBe('/api/v1/generate');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    const idempotencyValue = headers[IDEMPOTENCY_KEY_HEADER];
    expect(idempotencyValue).toBeDefined();
    expect(GEN_ID_REGEX.test(idempotencyValue ?? '')).toBe(true);
  });

  it('sends Content-Type: application/json', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(202, {
          job_id: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA2',
          sse_url: 'https://example.com/sse',
        }),
      );

    await submitGeneration({
      specUrl: TEST_SPEC_URL,
      specHash: TEST_SPEC_HASH,
      request: { spec_url: TEST_SPEC_URL },
    });

    const callArgs = fetchSpy.mock.calls[0];
    if (callArgs === undefined) {
      throw new Error('fetch was not called');
    }
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('on 202 calls rotateIdempotencyKey and returns ok:true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(202, {
        job_id: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA3',
        sse_url: 'https://example.com/sse',
      }),
    );

    // Pre-seed localStorage so we can assert rotateIdempotencyKey runs.
    const result = await submitGeneration({
      specUrl: TEST_SPEC_URL,
      specHash: TEST_SPEC_HASH,
      request: { spec_url: TEST_SPEC_URL },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.job_id).toBe('gen_01HXAAAAAAAAAAAAAAAAAAAAA3');
    }
    // After rotateIdempotencyKey, localStorage entry should be gone.
    expect(localStorage.getItem(`mcpgen.idem.${TEST_SPEC_URL}|`)).toBeNull();
  });

  it('on 501 (Phase-1 stub) returns ok:false with mapped message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(501, {
        error: 'not_implemented_phase_8',
        phase: 1,
        requested_idempotency_key: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA4',
        contract_version: '1.0.0',
      }),
    );

    const result = await submitGeneration({
      specUrl: TEST_SPEC_URL,
      specHash: TEST_SPEC_HASH,
      request: { spec_url: TEST_SPEC_URL },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(501);
      expect(result.code).toBe('not_implemented_phase_8');
      expect(result.message.toLowerCase()).toContain('engine');
    }
  });

  it('on network error throws (no retry per CLAUDE.md — caller decides)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(
      submitGeneration({
        specUrl: TEST_SPEC_URL,
        specHash: TEST_SPEC_HASH,
        request: { spec_url: TEST_SPEC_URL },
      }),
    ).rejects.toThrow('network down');
  });
});
