// apps/tenant-worker-runner/tests/fixtures/fake-tenant.ts
//
// Test-only minimal "fake tenant" Bun script used by supervisor.test.ts +
// crash-restart.test.ts. Reads PORT from env and serves /health on it.
//
// Bun.serve runs at top level — spawning this file via `bun run` produces a
// process with a stable PID and an HTTP listener that the supervisor tests
// can poll.

const port = Number(process.env.PORT ?? 0);
if (!port) {
  console.error('fake-tenant: PORT env var required');
  process.exit(2);
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'fake-tenant', pid: process.pid }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not_found', { status: 404 });
  },
});

console.log(`[fake-tenant] listening on :${port} pid=${process.pid}`);
