// Vitest unit test — apps/web/src/lib/api/error-mapper.ts (Plan 07-02 Task 1).
//
// Covers:
//   1. Each of the 7 GenerationErrorCode enum values yields a non-empty userMessage
//   2. Unknown code → fallback `internal_error` with user-readable text including HTTP status

import { describe, it, expect } from 'vitest';

import { GenerationErrorCode } from '@mcpgen/contracts';

import { mapGenerationError } from '@/lib/api/error-mapper';

describe('lib/api/error-mapper', () => {
  it('maps every GenerationErrorCode enum value to a non-empty userMessage', () => {
    const codes = GenerationErrorCode.options;
    expect(codes.length).toBeGreaterThanOrEqual(7);
    for (const code of codes) {
      const result = mapGenerationError({ status: 400, code });
      expect(result.code).toBe(code);
      expect(result.userMessage.length).toBeGreaterThan(0);
    }
  });

  it('unknown code falls back to internal_error with HTTP status surfaced', () => {
    const result = mapGenerationError({ status: 502, code: 'totally_unknown_code' });
    expect(result.code).toBe('internal_error');
    expect(result.userMessage).toContain('502');
  });

  it('Phase-1 BFF stub error code surfaces a calm placeholder message', () => {
    const result = mapGenerationError({ status: 501, code: 'not_implemented_phase_8' });
    expect(result.code).toBe('not_implemented_phase_8');
    expect(result.userMessage.toLowerCase()).toContain('engine');
  });
});
