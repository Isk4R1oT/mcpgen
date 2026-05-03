// Vitest unit tests — POST /api/auth/embedded/magic-link
//
// Covers:
//   - Happy path: 200 ok:true
//   - Flag OFF (`ui_auth_magic_link_perm`): 404
//   - Connector unconfigured: 501 magic_link_not_configured
//   - Malformed body: 400

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEvaluateBooleanFlag = vi.fn();
vi.mock('@/lib/flags', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => mockEvaluateBooleanFlag(...args),
}));

const mockSendMagicLink = vi.fn();
const mockIsMagicLinkConfigured = vi.fn();
vi.mock('@/lib/logto/experience', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logto/experience')>(
    '@/lib/logto/experience',
  );
  return {
    ...actual,
    sendMagicLink: (...args: unknown[]) => mockSendMagicLink(...args),
    isMagicLinkConfigured: () => mockIsMagicLinkConfigured(),
  };
});

const { POST } = await import('@/app/api/auth/embedded/magic-link/route');

beforeEach(() => {
  mockEvaluateBooleanFlag.mockReset();
  mockSendMagicLink.mockReset();
  mockIsMagicLinkConfigured.mockReset();
  mockEvaluateBooleanFlag.mockResolvedValue(true);
  mockIsMagicLinkConfigured.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/embedded/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/embedded/magic-link', () => {
  it('returns 200 ok:true on happy path', async () => {
    mockSendMagicLink.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSendMagicLink).toHaveBeenCalledWith('igor@example.com');
  });

  it('returns 404 not_found when ui_auth_magic_link_perm is OFF', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
    expect(mockSendMagicLink).not.toHaveBeenCalled();
  });

  it('returns 501 when LOGTO_EMAIL_CONNECTOR_ID is not set', async () => {
    mockIsMagicLinkConfigured.mockReturnValue(false);
    const res = await POST(makePostRequest({ email: 'igor@example.com' }));
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('magic_link_not_configured');
    expect(mockSendMagicLink).not.toHaveBeenCalled();
  });

  it('returns 400 when body is malformed', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });
});
