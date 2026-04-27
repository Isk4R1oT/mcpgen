// apps/dispatch/src/middleware/tenantLookup.ts
//
// Phase 6 Wave 1 — tenant routing resolution.
// Path convention: /t/{script_name}/* (local-multi-port routing).
// Phase-10 prod swap: read script_name from Host header `{name}.mcpgen.dev`
// (multi-tenant CF dispatch; same dispatch_namespace).
// Per CONTEXT D-02.

import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';

import { deployments } from '@mcpgen/contracts';

import { db } from '../db.js';
import { getCachedTenant, setCachedTenant, type TenantRoute } from '../tenant-cache.js';

export const tenantLookup: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const m = path.match(/^\/t\/([^/]+)(\/.*)?$/);
  if (!m) {
    // Not a tenant-routed path (e.g. /health) — pass through.
    return next();
  }
  const scriptName = m[1];
  if (!scriptName) return next();

  let route = await getCachedTenant(scriptName);
  if (!route) {
    const rows = await db
      .select({
        cf_worker_name: deployments.cf_worker_name,
        local_port: deployments.local_port,
        auth_mode: deployments.auth_mode,
      })
      .from(deployments)
      .where(eq(deployments.cf_worker_name, scriptName))
      .limit(1);
    const row = rows[0];
    if (!row || row.local_port == null) {
      return c.json({ error: 'tenant_not_found', script_name: scriptName }, 404);
    }
    const tenantPrefix = scriptName; // {tenant_short_id}-{spec_slug} per Pass 1 contract
    route = {
      scriptName,
      localPort: row.local_port,
      authMode: row.auth_mode as TenantRoute['authMode'],
      tenantPrefix,
    };
    await setCachedTenant(route);
  }
  c.set('scriptName', route.scriptName);
  c.set('localPort', route.localPort);
  c.set('tenantPrefix', route.tenantPrefix);
  c.set('authMode', route.authMode);
  // Strip the /t/{name} prefix on the way down so the tenant Worker sees /...
  const upstreamPath = m[2] ?? '/';
  c.set('upstreamPath', upstreamPath);
  return next();
};
