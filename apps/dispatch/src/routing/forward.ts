// apps/dispatch/src/routing/forward.ts
//
// Phase 6 — multi-port proxy. Forwards request to localhost:879N for the
// resolved tenant. Phase-10 swap is `env.DISPATCH_NAMESPACE.get(scriptName).fetch(req)`.

import type { Context } from 'hono';

export async function forwardToTenant(c: Context): Promise<Response> {
  const port = c.get('localPort') as number | undefined;
  if (!port) return c.json({ error: 'no_local_port' }, 500);
  const upstreamPath = (c.get('upstreamPath') as string | undefined) ?? '/';
  const url = new URL(c.req.url);
  url.host = `localhost:${port}`;
  url.pathname = upstreamPath;
  const init: RequestInit = {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  };
  // Bun supports duplex on streaming bodies; CF Workers ignore it (compatible).
  (init as RequestInit & { duplex: 'half' }).duplex = 'half';
  return fetch(url, init);
}
