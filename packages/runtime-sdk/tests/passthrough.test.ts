// packages/runtime-sdk/tests/passthrough.test.ts
//
// Phase 6 Wave 3 (RUN-03) — HKDF-derived AES-GCM round-trip + tenant isolation.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptPassthrough,
  encryptPassthrough,
} from '../src/auth/passthrough.js';

function randomB64(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf));
}

const SAVED = process.env.RUNTIME_PASSTHROUGH_KEYS;

beforeEach(() => {
  process.env.RUNTIME_PASSTHROUGH_KEYS = JSON.stringify({
    alice: randomB64(32),
    bob: randomB64(32),
  });
});

afterEach(() => {
  if (SAVED === undefined) delete process.env.RUNTIME_PASSTHROUGH_KEYS;
  else process.env.RUNTIME_PASSTHROUGH_KEYS = SAVED;
});

describe('decryptPassthrough', () => {
  it('round-trips a plaintext via HKDF-derived AES-GCM key for tenant', async () => {
    const blob = await encryptPassthrough('sk_test_abc', 'alice');
    const req = new Request('https://example.test/x', {
      headers: { 'X-Upstream-Auth': blob },
    });
    const out = await decryptPassthrough(req, 'alice');
    expect(out).toBe('sk_test_abc');
  });

  it('throws missing_x_upstream_auth when header is absent', async () => {
    const req = new Request('https://example.test/x');
    await expect(decryptPassthrough(req, 'alice')).rejects.toThrow(
      'missing_x_upstream_auth',
    );
  });

  it('cannot decrypt tenant alice blob using tenant bob context (HKDF info isolates)', async () => {
    const blob = await encryptPassthrough('sk_test_abc', 'alice');
    const req = new Request('https://example.test/x', {
      headers: { 'X-Upstream-Auth': blob },
    });
    await expect(decryptPassthrough(req, 'bob')).rejects.toThrow();
  });
});
