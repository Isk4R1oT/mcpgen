// Vitest unit tests — POST /api/auth/embedded/sign-up
//
// Covers:
//   - Happy path: 201 + Set-Cookie forwarded
//   - Email already exists: 409 email_taken
//   - Flag OFF (`ui_auth_signup_perm`): 403 signup_disabled
//   - Weak password: 400 invalid_password
//   - Malformed body: 400 invalid_body

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEvaluateBooleanFlag = vi.fn();
vi.mock('@/lib/flags', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => mockEvaluateBooleanFlag(...args),
}));

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
vi.mock('@/lib/logto/experience', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logto/experience')>(
    '@/lib/logto/experience',
  );
  return {
    ...actual,
    signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
  };
});

const { POST } = await import('@/app/api/auth/embedded/sign-up/route');
const experience = await import('@/lib/logto/experience');

beforeEach(() => {
  mockEvaluateBooleanFlag.mockReset();
  mockSignIn.mockReset();
  mockCreateUser.mockReset();
  mockEvaluateBooleanFlag.mockResolvedValue(true);
});

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/embedded/sign-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  name: 'Igor',
  email: 'igor@example.com',
  password: 'StrongPwd9!',
  company: 'Acme',
};

describe('POST /api/auth/embedded/sign-up', () => {
  it('returns 201 + ok:true and forwards LOGTO_SESSION cookie on happy path', async () => {
    mockCreateUser.mockResolvedValue({ id: 'user_abc', email: validBody.email });
    mockSignIn.mockResolvedValue({
      cookies: ['LOGTO_SESSION=xyz; Path=/; HttpOnly; SameSite=Lax'],
      redirectTo: null,
    });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toContain('LOGTO_SESSION=xyz');
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: validBody.email,
      password: validBody.password,
      name: validBody.name,
      company: validBody.company,
    });
  });

  it('returns 403 signup_disabled when ui_auth_signup_perm is OFF', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('signup_disabled');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns 409 email_taken when Logto says email is in use', async () => {
    mockCreateUser.mockRejectedValue(
      new experience.LogtoExperienceError(409, 'email_taken', 'email already in use', null),
    );
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('email_taken');
  });

  it('returns 400 invalid_password for password without enough character classes', async () => {
    const res = await POST(makePostRequest({ ...validBody, password: 'alllowercase' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_password');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body when name is missing', async () => {
    const { name: _omit, ...rest } = validBody;
    void _omit;
    const res = await POST(makePostRequest(rest));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('still returns 201 (with pending_login hint) when auto-sign-in fails after user creation', async () => {
    mockCreateUser.mockResolvedValue({ id: 'user_abc', email: validBody.email });
    mockSignIn.mockRejectedValue(new Error('logto sign-in unreachable'));
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; pending_login?: boolean };
    expect(body.ok).toBe(true);
    expect(body.pending_login).toBe(true);
  });
});
