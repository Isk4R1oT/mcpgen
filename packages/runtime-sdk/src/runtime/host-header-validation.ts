// packages/runtime-sdk/src/runtime/host-header-validation.ts
//
// Phase 6 (per D-15 / pitfall #15) — re-export Hono middleware for
// DNS-rebinding mitigation. apps/dispatch already has its own copy
// (Phase 1 + Wave 1); this version is consumed by tenant Workers
// (Phase-4 codegen + apps/tenant-worker-runner) so generated code can
//   import { hostHeaderValidation } from '@mcpgen/runtime'

import type { MiddlewareHandler } from 'hono';

export function hostHeaderValidation(
  allowed: ReadonlyArray<string>,
): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.split(':')[0] ?? '';
    if (!allowed.includes(host)) return c.json({ error: 'invalid_host' }, 403);
    return next();
  };
}
