// apps/dispatch/src/middleware/rateLimit.ts
//
// Phase 6 Wave 1 — in-memory token bucket stub. Production Phase-10 swap is
// a Cloudflare Durable Object counter; the in-memory version validates the
// request shape end-to-end. Per RESEARCH §"Architectural Responsibility Map"
// line 113 ("rate-limit precheck stub acceptable" in Wave 1).

import type { MiddlewareHandler } from 'hono';

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;  // generous local-dev default

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('authorization') ?? c.req.header('host') ?? 'anonymous';
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  entry.count++;
  return next();
};

// Test-only: clear the in-memory bucket map between vitest runs.
export function _resetRateLimitForTest(): void {
  buckets.clear();
}
