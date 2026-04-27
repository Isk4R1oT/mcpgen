// apps/api/tests/contract.test.ts
//
// CTRL-01 contract tests. Asserts the frozen-contract endpoints return the
// shapes downstream waves depend on:
//   - GET /health → 200
//   - GET /health/launch-criteria → matches @mcpgen/contracts LAUNCH_CRITERIA
//   - POST /api/v1/generate → 501 with Idempotency-Key echo + contract_version
//   - GET /api/v1/jobs/:id/stream → text/event-stream content-type
//
// Phase 8 update: /api/v1/* is now JWT-protected; tests carry a mocked-jose
// Bearer token + AppEnv bindings so the auth middleware admits the request and
// the original 501 contract still exercises.

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

  it('POST /api/v1/generate returns 501 with frozen contract shape', async () => {
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
    expect(res.status).toBe(501);
    const body = (await res.json()) as {
      error: string;
      requested_idempotency_key: string;
      contract_version: string;
    };
    expect(body.error).toBe('not_implemented_phase_8');
    expect(body.requested_idempotency_key).toBe(TEST_ULID);
    expect(body.contract_version).toBe('1.0.0');
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
