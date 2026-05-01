// apps/api/tests/contract.test.ts
//
// CTRL-01 contract tests. Asserts the frozen-contract endpoints return the
// shapes downstream waves depend on:
//   - GET /health → 200
//   - GET /health/launch-criteria → matches @mcpgen/contracts LAUNCH_CRITERIA
//   - POST /api/v1/generate → 202 with { job_id, sse_url } per the FROZEN
//     GenerationApiResponse shape (Phase 09.1 plan 03 turned the route on;
//     the previous 501 stub-only contract is superseded).
//   - GET /api/v1/jobs/:id/stream → text/event-stream content-type
//
// Phase 8 update: /api/v1/* is now JWT-protected; tests carry a mocked-jose
// Bearer token + AppEnv bindings so the auth middleware admits the request.
// Phase 09.1-03 update: POST /generate moved to the public app and returns
// 202 + GenerationApiResponse shape; the test now asserts the live shape
// instead of the historical 501 stub.

import { describe, it, expect, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async () => ({ payload: { aud: 'http://localhost:3000', sub: 'u' } })),
}));

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
const app = (await import('../src/index.js')).default;

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
};

describe('apps/api contract', () => {
  it('GET /health returns 200', async () => {
    const res = await app.fetch(new Request('http://localhost/health'), ENV);
    expect(res.status).toBe(200);
  });

  it('GET /health/launch-criteria returns the runtime constants', async () => {
    const res = await app.fetch(new Request('http://localhost/health/launch-criteria'), ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof LAUNCH_CRITERIA;
    expect(body.F2_SMELL_MIN).toBe(LAUNCH_CRITERIA.F2_SMELL_MIN);
    expect(body.F3_AGENT_PASS_RATE_MIN).toBe(LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN);
  });

  it('POST /api/v1/generate returns 202 with FROZEN GenerationApiResponse shape', async () => {
    // Test ULID — predictable repeating pattern, NOT a real generated ID (gitleaks-safe).
    const TEST_ULID = '01HXAAAAAAAAAAAAAAAAAAAAA2';
    const res = await app.fetch(
      new Request('http://localhost/api/v1/generate', {
        method: 'POST',
        headers: {
          'Idempotency-Key': TEST_ULID,
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-jwt',
        },
        body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
      }),
      ENV,
    );
    // Phase 09.1-03 — route is now live; expect 202 + { job_id, sse_url }.
    expect(res.status).toBe(202);
    const body = (await res.json()) as { job_id: string; sse_url: string };
    expect(body.job_id).toMatch(/^gen_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.sse_url).toMatch(/\/api\/v1\/jobs\/gen_[0-9A-HJKMNP-TV-Z]{26}\/stream$/);
  });

  it('GET /api/v1/jobs/:id/stream returns event-stream content-type', async () => {
    const res = await app.fetch(
      new Request(
        'http://localhost/api/v1/jobs/gen_01HXAAAAAAAAAAAAAAAAAAAAA3/stream',
        {
          headers: { 'Last-Event-ID': '01HXAAAAAAAAAAAAAAAAAAAAA0', Authorization: 'Bearer test-jwt' },
        },
      ),
      ENV,
    );
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  });
});
