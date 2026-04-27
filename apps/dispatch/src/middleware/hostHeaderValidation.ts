// apps/dispatch/src/middleware/hostHeaderValidation.ts
//
// Phase 6 (per D-15 / pitfall #15) — DNS-rebinding mitigation.
// Mounted on every public endpoint (dispatch + every tenant Worker).
// Source: github.com/modelcontextprotocol/typescript-sdk/packages/middleware
// (Hono port — RESEARCH §"Pitfall 7" verbatim).

import type { MiddlewareHandler } from 'hono';

export function hostHeaderValidation(allowed: ReadonlyArray<string>): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.split(':')[0] ?? '';
    if (!allowed.includes(host)) return c.json({ error: 'invalid_host' }, 403);
    return next();
  };
}
