// packages/runtime-sdk/tests/stored.test.ts
//
// Phase 6 Wave 3 (RUN-04) — AES-256-GCM stored credentials with per-tenant DEK
// wrapped under RUNTIME_KEK (AES-KW). Requires the Bun runtime because
// stored.ts imports `bun:sqlite`. Runs via `bun --bun vitest`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _clearStoredCredsForTest,
  decryptStored,
  encryptStored,
} from '../src/auth/stored.js';

function randomB64(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf));
}

const SAVED_KEK = process.env.RUNTIME_KEK;

beforeEach(() => {
  process.env.RUNTIME_KEK = randomB64(32);
  _clearStoredCredsForTest();
});

afterEach(() => {
  if (SAVED_KEK === undefined) delete process.env.RUNTIME_KEK;
  else process.env.RUNTIME_KEK = SAVED_KEK;
});

describe('stored credentials — AES-256-GCM + per-tenant DEK wrapped under RUNTIME_KEK', () => {
  it('round-trips encryptStored / decryptStored', async () => {
    await encryptStored('alice', 'github', 'ghp_xyz');
    const out = await decryptStored('alice', 'github');
    expect(out).toBe('ghp_xyz');
  });

  it('throws stored_creds_not_found for missing row', async () => {
    await expect(decryptStored('alice', 'github')).rejects.toThrow(
      'stored_creds_not_found',
    );
  });

  it("rotating RUNTIME_KEK breaks decryption (per-tenant DEK is wrapped under KEK)", async () => {
    await encryptStored('alice', 'github', 'ghp_xyz');
    // Rotate KEK to a different value — wrapped DEK can no longer be unwrapped.
    process.env.RUNTIME_KEK = randomB64(32);
    await expect(decryptStored('alice', 'github')).rejects.toThrow();
  });
});
