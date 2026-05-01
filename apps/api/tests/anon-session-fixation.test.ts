// apps/api/tests/anon-session-fixation.test.ts
//
// Phase 09.1 plan 03 Task 1 — TDD RED.
//
// Threat T-9.1-claim regression test. Session-fixation attack vector: an
// attacker pre-sets `mcpgen_anon_session` on the victim's browser before the
// victim signs up. Without re-issuance, the attacker's pre-known session ID
// links to the victim's claimed generation post-signup.
//
// Mitigation per CONTEXT D-04 + RESEARCH §1: re-issue the cookie on every
// "cold-start landing visit" — defined as a top-level GET / request whose
// Referer header is missing or points off-origin. The implementation lives in
// `apps/api/src/lib/anon-session.ts::isColdStartLanding()`.
//
// Test matrix:
//   1. GET / with NO Referer        → cookie re-issued (cold-start landing)
//   2. GET / with same-origin       → cookie persists (not a cold start)
//   3. GET / with off-origin        → cookie re-issued
//   4. POST /api/v1/generate (any)  → cookie persists if valid (POST is not a
//                                     "cold-start landing"; covered by Task 1
//                                     cookie test 4 — this test asserts the
//                                     fixation logic does NOT trigger on POST)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04 (lines
//     107–135 — threat model T-9.1-claim explicitly named)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §1 (line 131
//     — cold-start landing detection)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-03-PLAN.md Task 1

import { describe, it, expect, vi } from 'vitest';

// ─── Mock jose so the protected sub-app construction path is harmless ───────
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({
    payload: { aud: 'http://localhost:3000', sub: 'user_test', organization_id: 'org_test' },
  })),
}));

const { buildApp } = await import('../src/index.js');

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ANON_COOKIE_NAME = 'mcpgen_anon_session';
// Threat ID from CONTEXT D-04. Referenced verbatim so a future grep
// (`grep -r T-9.1-claim`) finds the regression test.
const THREAT_ID = 'T-9.1-claim';

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

function findAnonSetCookieValue(res: Response): string | null {
  const headers = res.headers;
  const all =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([headers.get('Set-Cookie')].filter((v): v is string => v !== null));
  for (const h of all) {
    const first = h.split(';')[0];
    if (!first) continue;
    const eqIdx = first.indexOf('=');
    if (eqIdx < 0) continue;
    const name = first.slice(0, eqIdx).trim();
    if (name !== ANON_COOKIE_NAME) continue;
    return first.slice(eqIdx + 1);
  }
  return null;
}

async function getRoot(
  env: Record<string, unknown>,
  cookie: string | null,
  referer: string | null,
): Promise<Response> {
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  const headers = new Headers();
  if (cookie !== null) headers.set('Cookie', `${ANON_COOKIE_NAME}=${cookie}`);
  if (referer !== null) headers.set('Referer', referer);
  return app.fetch(new Request('http://api.mcpgen.test/', { method: 'GET', headers }), env);
}

async function postGenerateWithCookie(
  env: Record<string, unknown>,
  cookie: string,
  referer: string | null,
): Promise<Response> {
  const app = buildApp(env as unknown as Parameters<typeof buildApp>[0]);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Idempotency-Key': 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1',
    Cookie: `${ANON_COOKIE_NAME}=${cookie}`,
  });
  if (referer !== null) headers.set('Referer', referer);
  return app.fetch(
    new Request('http://api.mcpgen.test/api/v1/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
    }),
    env,
  );
}

describe(`session-fixation cookie re-issue (${THREAT_ID})`, () => {
  // The pre-existing ULID we plant — represents a value an attacker could
  // have set on the victim's browser before the victim ever visited us.
  const ATTACKER_PLANTED_ULID = '01HXAAAAAAAAAAAAAAAAAAAAA1';
  // Sanity-check the planted value is itself a valid ULID — otherwise we'd be
  // falling into the "malformed cookie → reissue" code path instead of the
  // fixation re-issue code path.
  it('sanity: planted attacker cookie has valid ULID format', () => {
    expect(ATTACKER_PLANTED_ULID).toMatch(ULID_REGEX);
  });

  // ─── Test 1: cold-start landing (no Referer) → re-issue ─────────────────
  it('GET / with no Referer rotates the cookie (cold-start landing — fixation defense)', async () => {
    const res = await getRoot(envFor('development'), ATTACKER_PLANTED_ULID, null);
    const reissued = findAnonSetCookieValue(res);
    expect(reissued).not.toBeNull();
    if (!reissued) return;
    expect(reissued).toMatch(ULID_REGEX);
    expect(reissued).not.toBe(ATTACKER_PLANTED_ULID);
  });

  // ─── Test 2: same-origin Referer → cookie persists ──────────────────────
  it('GET / with same-origin Referer keeps the existing cookie (not a cold start)', async () => {
    const res = await getRoot(
      envFor('development'),
      ATTACKER_PLANTED_ULID,
      'http://api.mcpgen.test/some/internal/page',
    );
    const reissued = findAnonSetCookieValue(res);
    if (reissued !== null) {
      expect(reissued).toBe(ATTACKER_PLANTED_ULID);
    }
  });

  // ─── Test 3: off-origin Referer → re-issue ──────────────────────────────
  it('GET / with off-origin Referer (https://evil.com) rotates the cookie', async () => {
    const res = await getRoot(
      envFor('development'),
      ATTACKER_PLANTED_ULID,
      'https://evil.com/landing',
    );
    const reissued = findAnonSetCookieValue(res);
    expect(reissued).not.toBeNull();
    if (!reissued) return;
    expect(reissued).toMatch(ULID_REGEX);
    expect(reissued).not.toBe(ATTACKER_PLANTED_ULID);
  });

  // ─── Test 4: POST /api/v1/generate keeps a valid cookie ─────────────────
  it('POST /api/v1/generate with valid cookie persists it (fixation logic does NOT fire on POST)', async () => {
    const res = await postGenerateWithCookie(
      envFor('development'),
      ATTACKER_PLANTED_ULID,
      'https://evil.com/landing',
    );
    const reissued = findAnonSetCookieValue(res);
    if (reissued !== null) {
      expect(reissued).toBe(ATTACKER_PLANTED_ULID);
    }
  });
});
