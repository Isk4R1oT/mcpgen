// apps/api/tests/_mocks/resend.ts
//
// Shared hoisted vi.mock for the resend SDK across Wave 4 tests.
// Mirrors apps/api/tests/_mocks/stripe.ts shape from Plan 02 (Wave 2).
//
// Usage in test files:
//   import { setupResendMock, mockResendSend } from './_mocks/resend.js';
//   setupResendMock();        // MUST appear BEFORE any app import
//
// Pattern: vitest hoists `vi.mock(...)` to the top of the module so the call
// inside `setupResendMock()` is rewritten to module-top placement at compile
// time. The exported `mockResendSend` closes over the inner mock so test
// assertions can `expect(mockResendSend).toHaveBeenCalled...`.

import { vi } from 'vitest';

export const mockResendSend = vi
  .fn()
  .mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });

export function setupResendMock(): void {
  vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockResendSend },
    })),
  }));
}
