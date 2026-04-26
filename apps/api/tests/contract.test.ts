// apps/api/tests/contract.test.ts
//
// CTRL-01 contract tests. Asserts the frozen-contract endpoints return the
// shapes downstream waves depend on:
//   - GET /health → 200
//   - GET /health/launch-criteria → matches @mcpgen/contracts LAUNCH_CRITERIA
//   - POST /api/v1/generate → 501 with Idempotency-Key echo + contract_version
//   - GET /api/v1/jobs/:id/stream → text/event-stream content-type

import { describe, it, expect } from 'vitest';

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import app from '../src/index.js';

describe('apps/api contract', () => {
  it('GET /health returns 200', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
  });

  it('GET /health/launch-criteria returns the runtime constants', async () => {
    const res = await app.fetch(new Request('http://localhost/health/launch-criteria'));
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
        },
        body: JSON.stringify({ spec_url: 'https://example.com/spec.json' }),
      }),
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
          headers: { 'Last-Event-ID': '01HXAAAAAAAAAAAAAAAAAAAAA0' },
        },
      ),
    );
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  });
});
