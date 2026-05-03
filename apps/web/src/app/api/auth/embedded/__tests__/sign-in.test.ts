// Vitest unit tests — POST /api/auth/embedded/sign-in
//
// Covers:
//   - Happy path: 200 + Set-Cookie forwarded
//   - Bad creds: 401 invalid_credentials
//   - Flag OFF (`ui_auth_password_perm`): 404
//   - Malformed body: 400 invalid_body / invalid_json

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @/lib/flags BEFORE any module under test imports.
const mockEvaluateBooleanFlag = vi.fn();
vi.mock('@/lib/flags', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => mockEvaluateBooleanFlag(...args),
}));

// Mock the experience client — we don't want real fetch in unit tests.
const mockSignIn = vi.fn();
vi.mock('@/lib/logto/experience', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logto/experience')>(
    '@/lib/logto/experience',
  );
  return {
    ...actual,
    signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
  };
});

const { POST } = await import('@/app/api/auth/embedded/sign-in/route');
const experience = await import('@/lib/logto/experience');

beforeEach(() => {
  mockEvaluateBooleanFlag.mockReset();
  mockSignIn.mockReset();
  mockEvaluateBooleanFlag.mockResolvedValue(true); // default: flag ON
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/embedded/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/embedded/sign-in', () => {
  it('returns 200 + ok:true on successful Logto sign-in', async () => {
    mockSignIn.mockResolvedValue({
      cookies: ['LOGTO_SESSION=abc; Path=/; HttpOnly; SameSite=Lax'],
      redirectTo: null,
    });
    const res = await POST(
      makePostRequest({ email: 'igor@example.com', password: 'CorrectHorse123' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // The Set-Cookie header should be forwarded.
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('LOGTO_SESSION=abc');
  });

  it('returns 401 invalid_credentials when Logto rejects the password', async () => {
    mockSignIn.mockRejectedValue(
      new experience.LogtoExperienceError(401, 'invalid_credentials', 'incorrect email or password', null),
    );
    const res = await POST(
      makePostRequest({ email: 'igor@example.com', password: 'WrongPwd123' }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; error_message: string };
    expect(body.error).toBe('invalid_credentials');
    expect(body.error_message).toMatch(/incorrect/);
  });

  it('returns 404 not_found when ui_auth_password_perm is OFF', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    const res = await POST(
      makePostRequest({ email: 'igor@example.com', password: 'CorrectHorse123' }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_body on malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/auth/embedded/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 invalid_body when fields are missing', async () => {
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('returns 400 invalid_body when email is not a valid email', async () => {
    const res = await POST(
      makePostRequest({ email: 'not-an-email', password: 'CorrectHorse123' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('returns 500 on unhandled Logto experience error', async () => {
    mockSignIn.mockRejectedValue(
      new experience.LogtoExperienceError(503, 'logto_down', 'Logto unreachable', null),
    );
    const res = await POST(
      makePostRequest({ email: 'igor@example.com', password: 'CorrectHorse123' }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('logto_down');
  });
});
