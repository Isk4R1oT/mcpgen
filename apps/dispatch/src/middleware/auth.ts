// apps/dispatch/src/middleware/auth.ts
//
// Phase 6 Wave 1 — Bearer JWT precheck stub. Real Logto-issued JWT verify
// lands in Phase 8 (CTRL-02). This stub asserts header presence so the
// request shape is correct end-to-end (RUN-01).

import type { MiddlewareHandler } from 'hono';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'missing_bearer_token' }, 401);
  }
  // Wave 1: token presence only. Phase 8 adds JWKS verify + 5-min cache.
  return next();
};
