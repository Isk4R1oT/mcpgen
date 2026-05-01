// apps/api/tests/inngest/anon-salt-rotate.test.ts
//
// Phase 09.1 plan 10 (D-11 / T-9.1-10-02 / T-9.1-10-03): static-source
// assertions for the daily 00:00 UTC cron that rotates the IP-hash salt.
// Promotes daily_salt_current → daily_salt_previous (24h grace window per
// RESEARCH §5) and writes a fresh 32-byte hex daily_salt_current.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-04-SUMMARY.md
//     (app_secrets KV; rotates_at column; ON CONFLICT pattern)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-05-SUMMARY.md
//     (dual-salt lookup pattern in hashIpsForLookup)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonSaltRotate } from '../../src/inngest/functions/anon-salt-rotate.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(
  HERE,
  '../../src/inngest/functions/anon-salt-rotate.ts',
);
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('anon-salt-rotate-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (anonSaltRotate as unknown as { opts?: { id: string } }).opts?.id ??
      (anonSaltRotate as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.ANON_SALT_ROTATE);
    expect(id).toBe('anon-salt-rotate-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.ANON_SALT_ROTATE');
  });

  it('cron schedule fires daily at 00:00 UTC (0 0 * * *)', () => {
    expect(FN_SRC).toContain("cron: '0 0 * * *'");
  });

  it('generates a fresh 32-byte salt via crypto.getRandomValues (CF Workers compatible)', () => {
    expect(FN_SRC).toContain('crypto.getRandomValues');
    expect(FN_SRC).toContain('Uint8Array(32)');
  });

  it('encodes salt as hex (64-char lowercase) — matches IP-hash sha256 input shape', () => {
    expect(FN_SRC).toContain("toString(16)");
    expect(FN_SRC).toContain("padStart(2, '0')");
  });

  it('promotes daily_salt_current value into daily_salt_previous (24h grace window)', () => {
    // The promote step reads the CURRENT salt and writes it to PREVIOUS in
    // a single atomic UPSERT — RESEARCH §5 verbatim shape.
    expect(FN_SRC).toContain("'daily_salt_previous'");
    expect(FN_SRC).toContain("SELECT value FROM app_secrets WHERE key = 'daily_salt_current'");
  });

  it("writes the fresh salt to daily_salt_current (UPSERT pattern)", () => {
    expect(FN_SRC).toContain("'daily_salt_current'");
  });

  it('uses ON CONFLICT (key) DO UPDATE pattern for both writes (idempotent re-run within UTC day)', () => {
    expect(FN_SRC).toContain('ON CONFLICT (key) DO UPDATE');
    expect(FN_SRC).toContain('value = EXCLUDED.value');
    expect(FN_SRC).toContain('rotates_at = EXCLUDED.rotates_at');
  });

  it('sets rotates_at = NOW() + INTERVAL 24 hours on both rows (24h grace window invariant)', () => {
    expect(FN_SRC).toContain("INTERVAL '24 hours'");
  });

  it('rotation runs inside a single step.run (atomicity — rollback on failure)', () => {
    // T-9.1-10-02 mitigation: the two UPSERTs MUST be in the same step so
    // Inngest treats partial failure as the whole step failing (and retries
    // from scratch). Two separate steps would risk getting `previous` set
    // without `current` — breaking the dual-salt lookup invariant.
    expect(FN_SRC).toContain("'rotate-salts'");
    expect(FN_SRC).toMatch(/step\.run\(\s*['"]rotate-salts['"]/);
  });

  it('return shape exposes salt_prefix (8 chars) — observability without leaking full salt (T-9.1-10-03)', () => {
    expect(FN_SRC).toContain('salt_prefix');
    expect(FN_SRC).toContain('slice(0, 8)');
  });

  it('return shape does NOT include the full salt value (T-9.1-10-03 information disclosure mitigation)', () => {
    // No `salt: newSalt` in the return shape — only `salt_prefix`.
    expect(FN_SRC).not.toMatch(/return\s*\{[^}]*\bsalt\s*:\s*newSalt\b/);
  });

  it('generate-salt step name pinned (separate step from rotate-salts)', () => {
    // RESEARCH §5 verbatim: `step.run('generate-salt', ...)` then
    // `step.run('rotate-salts', ...)`. Two-step layout = the new salt is
    // memoized by Inngest if the rotate step retries.
    expect(FN_SRC).toContain("'generate-salt'");
  });
});
