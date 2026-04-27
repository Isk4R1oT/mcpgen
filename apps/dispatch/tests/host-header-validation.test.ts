// apps/dispatch/tests/host-header-validation.test.ts
//
// Phase 6 / RUN-01 / T-6-15 / pitfall #15.
// DNS-rebinding mitigation. Mounted on every public endpoint.
// Per CONTEXT D-15.

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { hostHeaderValidation } from '../src/middleware/hostHeaderValidation.js';

function buildApp(allowed: ReadonlyArray<string>): Hono {
  const app = new Hono();
  app.use('*', hostHeaderValidation(allowed));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

describe('hostHeaderValidation', () => {
  it('rejects requests with a Host header not in the allowlist with 403 invalid_host', async () => {
    const app = buildApp(['localhost', '127.0.0.1']);
    const res = await app.request('http://localhost/health', { headers: { host: 'evil.com' } });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_host');
  });

  it('accepts requests with a Host header in the allowlist', async () => {
    const app = buildApp(['localhost', '127.0.0.1']);
    const res = await app.request('http://localhost/health', { headers: { host: 'localhost' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('strips the port off the Host header before matching the allowlist', async () => {
    const app = buildApp(['localhost']);
    const res = await app.request('http://localhost/health', { headers: { host: 'localhost:8789' } });
    expect(res.status).toBe(200);
  });

  it('treats a missing Host header as not-allowed (defense-in-depth)', async () => {
    const app = buildApp(['localhost']);
    const res = await app.request('http://localhost/health');
    // hono.request() does not set a Host header by default; the middleware
    // must reject any non-allowlisted (including absent) host value.
    expect(res.status).toBe(403);
  });
});
