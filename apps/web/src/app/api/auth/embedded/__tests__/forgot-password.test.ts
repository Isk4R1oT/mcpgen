// Vitest unit tests — POST /api/auth/embedded/forgot-password
//
// Covers:
//   - Happy path: 200 ok:true
//   - Flag OFF (`ui_auth_forgot_password_perm`): 404
//   - Connector misconfigured: still 200 (idempotent — don't disclose)
//   - Malformed body: 400

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEvaluateBooleanFlag = vi.fn();
vi.mock('@/lib/flags', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => mockEvaluateBooleanFlag(...args),
}));

const mockStartForgotPassword = vi.fn();
vi.mock('@/lib/logto/experience', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logto/experience')>(
    '@/lib/logto/experience',
  );
  return {
    ...actual,
    startForgotPassword: (...args: unknown[]) => mockStartForgotPassword(...args),
  };
});

const { POST } = await import('@/app/api/auth/embedded/forgot-password/route');
const experience = await import('@/lib/logto/experience');

beforeEach(() => {
  mockEvaluateBooleanFlag.mockReset();
  mockStartForgotPassword.mockReset();
  mockEvaluateBooleanFlag.mockResolvedValue(true);
});

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/embedded/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/embedded/forgot-password', () => {
  it('returns 200 ok:true on happy path', async () => {
    mockStartForgotPassword.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockStartForgotPassword).toHaveBeenCalledWith('igor@example.com');
  });

  it('returns 404 not_found when ui_auth_forgot_password_perm is OFF', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
    expect(mockStartForgotPassword).not.toHaveBeenCalled();
  });

  it('returns 200 (silent) even when email connector is misconfigured (idempotent)', async () => {
    mockStartForgotPassword.mockRejectedValue(
      new experience.LogtoExperienceError(501, 'magic_link_not_configured', 'no connector', null),
    );
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 400 when body is malformed', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });
});
