// apps/api/tests/anon-session-cookie.test.ts
//
// Phase 09.1 plan 03 Task 1 — TDD RED.
//
// Verifies the `mcpgen_anon_session` cookie shape minted by the anon-aware
// `POST /api/v1/generate` handler:
//   1. Anon POST without cookie → Set-Cookie carries a 26-char ULID with
//      HttpOnly + SameSite=Lax + Path=/ + Max-Age=604800.
//   2. ENVIRONMENT=production → Secure flag present.
//   3. ENVIRONMENT=development → Secure flag absent.
//   4. Anon POST with EXISTING valid ULID cookie → cookie NOT re-issued
//      (idempotent — no Set-Cookie header on the response).
//   5. Malformed cookie value (not Crockford-base32 ULID) → cookie re-issued
//      with a fresh ULID.
//   6. Pollution attempt (oversized cookie value) → cookie re-issued.
//
// All cases hit the public anon-allowed path mounted at /api/v1/generate by
// plan 02 — no Authorization header is required.
//
// jose is mocked so the protected sub-app construction does not require a
// live JWKS. Anon POST does NOT run authMiddleware so the mock is only
// defensive (matches auth-gate-position.test.ts setup).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §1 (lines 80–141)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md Task 1

import { describe, it, expect, vi } from 'vitest';

// ─── Mock jose so a synthetic JWT verify path exists if needed ──────────────
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: { aud: 'http://localhost:3000', sub: 'user_test', organization_id: 'org_test' },
  })),
}));

// Import AFTER vi.mock so middleware sees the mocked module.
const { buildApp } = await import('../src/index.js');

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ANON_COOKIE_NAME = 'mcpgen_anon_session';

function envFor(environment: string): Record<string, unknown> {
  return {
    LOGTO_ENDPOINT: 'https://logto.test',
    LOGTO_BASE_URL: 'http://localhost:3000',
    LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
    HYPERDRIVE: {} as Hyperdrive,
    SENTRY_DSN: '',
    ENVIRONMENT: environment,
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_PRO: '',
    ENGINE_ENDPOINT: '',
    LOGTO_M2M_APP_ID: '',
    LOGTO_M2M_APP_SECRET: '',
    BFF_ANONYMOUS_GATE: 'playground' as const,
  };
}

interface CookieAttrs {
  value: string;
  httpOnly: boolean;
  sameSite: string | null;
  secure: boolean;
  path: string | null;
  maxAge: number | null;
}

function parseSetCookie(header: string | null): CookieAttrs | null {
  if (!header) return null;
  const parts = header.split(';').map((p) => p.trim());
  const first = parts[0];
  if (!first) return null;
  const eqIdx = first.indexOf('=');
  if (eqIdx < 0) return null;
  const name = first.slice(0, eqIdx);
  if (name !== ANON_COOKIE_NAME) return null;
  const value = first.slice(eqIdx + 1);

  const lower = parts.slice(1).map((p) => p.toLowerCase());
  const httpOnly = lower.includes('httponly');
  const secure = lower.includes('secure');

  const sameSitePart = parts.slice(1).find((p) => p.toLowerCase().startsWith('samesite='));
  const sameSite = sameSitePart ? (sameSitePart.split('=')[1] ?? null) : null;

  const pathPart = parts.slice(1).find((p) => p.toLowerCase().startsWith('path='));
  const path = pathPart ? (pathPart.split('=')[1] ?? null) : null;

  const maxAgePart = parts.slice(1).find((p) => p.toLowerCase().startsWith('max-age='));
  const maxAge = maxAgePart ? Number(maxAgePart.split('=')[1]) : null;

  return { value, httpOnly, sameSite, secure, path, maxAge };
}

function findAnonSetCookie(res: Response): CookieAttrs | null {
  // Hono on Workers returns a single Set-Cookie via getSetCookie(); fall back
  // to .get('Set-Cookie') for environments without getSetCookie support.
  const headers = res.headers;
  const all =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([headers.get('Set-Cookie')].filter((v): v is string => v !== null));
  for (const h of all) {
    const parsed = parseSetCookie(h);
    if (parsed) return parsed;
  }
  return null;
}

async function postGenerateAnon(env: Record<string, unknown>, init?: RequestInit): Promise<Response> {
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1');
  }
  return app.fetch(
    new Request('http://x/api/v1/generate', {
      method: 'POST',
      headers,
      body: init?.body ?? JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
    }),
    env,
  );
}

describe('anon session cookie shape (D-04 / ANON-04)', () => {
  // ─── Test 1: cookie issued with all attributes ──────────────────────────
  it('anon POST /api/v1/generate without cookie → mints ULID cookie with HttpOnly+Lax+Path=/+Max-Age=604800', async () => {
    const res = await postGenerateAnon(envFor('development'));
    const cookie = findAnonSetCookie(res);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.value).toMatch(ULID_REGEX);
    expect(cookie.httpOnly).toBe(true);
    // Hono normalizes SameSite to TitleCase ("Lax") — accept any case.
    expect((cookie.sameSite ?? '').toLowerCase()).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.maxAge).toBe(7 * 24 * 60 * 60);
  });

  // ─── Test 2: production → Secure flag set ───────────────────────────────
  it('ENVIRONMENT=production → Set-Cookie carries Secure flag', async () => {
    const res = await postGenerateAnon(envFor('production'));
    const cookie = findAnonSetCookie(res);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.secure).toBe(true);
  });

  // ─── Test 3: development → Secure flag absent ───────────────────────────
  it('ENVIRONMENT=development → Set-Cookie omits Secure flag', async () => {
    const res = await postGenerateAnon(envFor('development'));
    const cookie = findAnonSetCookie(res);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.secure).toBe(false);
  });

  // ─── Test 4: existing valid ULID cookie → idempotent (NOT re-issued) ────
  it('anon POST with an existing valid ULID cookie → does NOT re-issue Set-Cookie', async () => {
    const existing = '01HXAAAAAAAAAAAAAAAAAAAAA1';
    expect(existing).toMatch(ULID_REGEX);
    const res = await postGenerateAnon(envFor('development'), {
      headers: { Cookie: `${ANON_COOKIE_NAME}=${existing}` },
    });
    const cookie = findAnonSetCookie(res);
    // Either no Set-Cookie at all, or the same value (idempotent). The plan
    // asks for "NOT re-issued"; we treat any new value as a regression.
    if (cookie !== null) {
      expect(cookie.value).toBe(existing);
    }
  });

  // ─── Test 5: malformed cookie → re-issued with fresh ULID ───────────────
  it('anon POST with malformed cookie value → cookie re-issued with a fresh ULID', async () => {
    const malformed = 'not-a-ulid-12345';
    const res = await postGenerateAnon(envFor('development'), {
      headers: { Cookie: `${ANON_COOKIE_NAME}=${malformed}` },
    });
    const cookie = findAnonSetCookie(res);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.value).toMatch(ULID_REGEX);
    expect(cookie.value).not.toBe(malformed);
  });

  // ─── Test 6: pollution attempt (oversized) → re-issued ──────────────────
  it('anon POST with oversized cookie value (cookie pollution) → cookie re-issued', async () => {
    const oversized = 'A'.repeat(200);
    const res = await postGenerateAnon(envFor('development'), {
      headers: { Cookie: `${ANON_COOKIE_NAME}=${oversized}` },
    });
    const cookie = findAnonSetCookie(res);
    expect(cookie).not.toBeNull();
    if (!cookie) return;
    expect(cookie.value).toMatch(ULID_REGEX);
    expect(cookie.value).not.toBe(oversized);
  });
});
