// apps/dispatch/src/tenant-cache.ts
//
// Phase 6 — 5-min TTL tenant routing cache. Local-compute uses unstorage's
// memory driver. Phase-10 swap is one line: replace memoryDriver() with
// cloudflareKVBindingDriver({ binding: env.TENANT_CACHE }) — same getItem/setItem.
//
// Per CONTEXT D-02 + RESEARCH §"Pattern 6".

import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';

export interface TenantRoute {
  readonly scriptName: string;        // {tenant_short_id}-{spec_slug}
  readonly localPort: number;          // 879N
  readonly authMode: 'passthrough' | 'stored' | 'oauth';
  readonly tenantPrefix: string;       // {tenant_short_id}-{spec_slug} — same as scriptName per Pass 1 contract
}

interface CacheEntry {
  readonly route: TenantRoute;
  readonly expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;            // 5 min — matches CF KV cache TTL contract (D-02)

const cache = createStorage<CacheEntry>({
  driver: memoryDriver(),
});

export async function getCachedTenant(scriptName: string): Promise<TenantRoute | null> {
  const entry = await cache.getItem(scriptName);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    await cache.removeItem(scriptName);
    return null;
  }
  return entry.route;
}

export async function setCachedTenant(route: TenantRoute): Promise<void> {
  await cache.setItem(route.scriptName, { route, expiresAt: Date.now() + TTL_MS });
}

export async function clearCache(): Promise<void> {
  await cache.clear();
}
