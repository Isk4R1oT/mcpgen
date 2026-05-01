// apps/api/tests/inngest/anon-rate-limit-cleanup.test.ts
//
// Phase 09.1 plan 10 (D-06 / Pitfall #4): static-source assertions for the
// daily 04:00 UTC cron that runs `drop_chunks('anon_generation_log')` AND
// deletes unclaimed anonymous_generations rows older than 7 days.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §4
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-04-SUMMARY.md
//     (anon_generation_log = TimescaleDB hypertable with 1-day chunks)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonRateLimitCleanup } from '../../src/inngest/functions/anon-rate-limit-cleanup.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC_PATH = resolve(
  HERE,
  '../../src/inngest/functions/anon-rate-limit-cleanup.ts',
);
const FN_SRC = readFileSync(FN_SRC_PATH, 'utf-8');

describe('anon-rate-limit-cleanup-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (anonRateLimitCleanup as unknown as { opts?: { id: string } }).opts?.id ??
      (anonRateLimitCleanup as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.ANON_RATE_LIMIT_CLEANUP);
    expect(id).toBe('anon-rate-limit-cleanup-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.ANON_RATE_LIMIT_CLEANUP');
  });

  it('cron schedule fires daily at 04:00 UTC (0 4 * * *)', () => {
    expect(FN_SRC).toContain("cron: '0 4 * * *'");
  });

  it("calls drop_chunks on 'anon_generation_log' hypertable with 30 day INTERVAL (T-9.1-10-04 mitigation: hardcoded literal)", () => {
    expect(FN_SRC).toContain("drop_chunks('anon_generation_log'");
    expect(FN_SRC).toContain("INTERVAL '30 days'");
  });

  it('drop_chunks runs in its own step.run (drop-old-chunks)', () => {
    expect(FN_SRC).toContain("'drop-old-chunks'");
  });

  it('DELETE filters anonymous_generations by claimed_at IS NULL AND created_at < NOW() - INTERVAL 7 days', () => {
    expect(FN_SRC).toContain('DELETE FROM anonymous_generations');
    expect(FN_SRC).toContain('claimed_at IS NULL');
    expect(FN_SRC).toContain("INTERVAL '7 days'");
  });

  it('DELETE step is named delete-old-unclaimed', () => {
    expect(FN_SRC).toContain("'delete-old-unclaimed'");
  });

  it('return shape exposes both dropped_chunks and deleted_sessions counts', () => {
    expect(FN_SRC).toContain('dropped_chunks');
    expect(FN_SRC).toContain('deleted_sessions');
  });

  it('does NOT swallow SQL errors (Inngest default retry policy applies)', () => {
    // The cron must allow drop_chunks SQL errors to propagate so Inngest
    // retries automatically. Pin that no try/catch wraps the SQL calls.
    expect(FN_SRC).not.toMatch(/try\s*\{\s*await\s+db\.execute[\s\S]*?\}\s*catch/);
  });
});
