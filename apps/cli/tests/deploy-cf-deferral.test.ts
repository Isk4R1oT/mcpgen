// apps/cli/tests/deploy-cf-deferral.test.ts
//
// Phase 6 (CLI-02) — verifies `mcpgen deploy --cf` exits 78 with the
// Phase-10 deferral banner shape (mirrors create-namespaces.sh).

import { describe, it, expect, vi } from 'vitest';

import { emitCfDeferralBanner } from '../src/commands/deploy-cf-deferral.js';

describe('emitCfDeferralBanner', () => {
  it('writes DEFERRED to Phase 10 banner to stderr and exits 78', () => {
    const writes: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        return true;
      });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code}__`);
    }) as never);

    expect(() => emitCfDeferralBanner()).toThrow(/__exit_78__/);
    expect(writes.join('')).toContain('DEFERRED to Phase 10');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
