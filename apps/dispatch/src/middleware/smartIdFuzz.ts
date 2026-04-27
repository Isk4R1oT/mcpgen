// apps/dispatch/src/middleware/smartIdFuzz.ts
//
// Phase 6 (per D-03 / pitfall #1) — cross-tenant smart-ID prefix fuzz.
// Validates that any smart-ID-shaped string in the JSON-RPC params (id,
// ids[], cursor) has a server prefix matching the resolved tenant.
// Source: RESEARCH Example 2.
//
// Wave 2 swap: imports parseSmartId from '@mcpgen/runtime/smart-id' (single
// source of truth shared with tenant Workers — closes T-6-01).

import type { MiddlewareHandler } from 'hono';

import { parseSmartId } from '@mcpgen/runtime/smart-id';

function collectSmartIdCandidates(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string' && value.includes(':')) acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectSmartIdCandidates(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) collectSmartIdCandidates(v, acc);
  return acc;
}

export const smartIdFuzz: MiddlewareHandler = async (c, next) => {
  const tenantPrefix = c.get('tenantPrefix') as string | undefined;
  if (!tenantPrefix) return next(); // /health and other non-tenant paths
  const cloned = c.req.raw.clone();
  let body: unknown;
  try {
    body = await cloned.json();
  } catch {
    return next();
  }

  const candidates = collectSmartIdCandidates((body as { params?: unknown })?.params);
  for (const candidate of candidates) {
    let sid;
    try {
      sid = parseSmartId(candidate);
    } catch {
      continue;
    }
    if (sid.server !== tenantPrefix) {
      return c.json(
        {
          error: 'smart_id_tenant_mismatch',
          expected_prefix: tenantPrefix,
          received_prefix: sid.server,
        },
        403,
      );
    }
  }
  return next();
};
