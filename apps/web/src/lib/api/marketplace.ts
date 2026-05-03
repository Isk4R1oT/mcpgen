// apps/web/src/lib/api/marketplace.ts
//
// Foundation Agent F-BFFClients — typed surface for the public marketplace.
// As of Phase 0 the BFF does not implement marketplace endpoints yet (the
// marketplace feature is gated by a Flipt flag and slated for a later phase).
// Per the brief, we still ship the typed client + TanStack Query hooks so
// consuming screens render a graceful disabled state without changes when the
// real endpoints land.
//
// Strategy:
//   - Client functions hit the eventual paths (so the wiring is final).
//   - Hooks short-circuit and return the canonical `flag_off_or_not_implemented`
//     result without firing fetch — avoids polluting devtools / Sentry with
//     404s while the feature is dark.
//   - When the BFF lands the routes, flip ENABLED → true (or read a Flipt
//     flag) and the hooks start hitting the wire transparently.
//
// References:
//   - docs/mcpgen-feature-flags-contract.md (gating policy)
//   - apps/web/src/screen-marketplace.jsx (consumer)

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import {
  notImplementedResult,
  request,
  type Result,
} from './client-base.js';

// Phase 0: marketplace is disabled. Set to `true` once apps/api lands the
// endpoints and the Flipt flag flips on. The flag itself can later be wired
// here via the same pattern as the other feature toggles in apps/web.
const ENABLED = false;

// ─── Schemas ───────────────────────────────────────────────────────────────

export const MarketplaceServerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon_url: z.string().url().optional(),
  category: z.string().optional(),
  quality_score: z.number().min(0).max(5).optional(),
  // Public badge tier per Stage F: premium / verified / standard / needs_review
  quality_badge: z.string().optional(),
  // Free-form metadata; loose by design.
  tags: z.array(z.string()).optional(),
  install_count: z.number().int().nonnegative().optional(),
});
export type MarketplaceServer = z.infer<typeof MarketplaceServerSchema>;

export const MarketplaceListResponseSchema = z.object({
  servers: z.array(MarketplaceServerSchema),
  // Cursor pagination is the MCPGen standard (Pass 5 Response Shaping).
  next_cursor: z.string().nullable().optional(),
});
export type MarketplaceListResponse = z.infer<typeof MarketplaceListResponseSchema>;

// ─── Endpoint paths ────────────────────────────────────────────────────────

const MARKETPLACE_LIST_PATH = '/api/v1/marketplace/servers';
const MARKETPLACE_DETAIL_PATH = (id: string): string =>
  `/api/v1/marketplace/servers/${encodeURIComponent(id)}`;

// ─── Functions ─────────────────────────────────────────────────────────────

export interface FetchMarketplaceServersArgs {
  cursor?: string;
  category?: string;
  search?: string;
  limit?: number;
}

export async function fetchMarketplaceServers(
  args?: FetchMarketplaceServersArgs,
): Promise<Result<MarketplaceListResponse>> {
  if (!ENABLED) return notImplementedResult<MarketplaceListResponse>();
  const params = new URLSearchParams();
  if (args?.cursor !== undefined) params.set('cursor', args.cursor);
  if (args?.category !== undefined) params.set('category', args.category);
  if (args?.search !== undefined) params.set('search', args.search);
  if (args?.limit !== undefined) params.set('limit', String(args.limit));
  const qs = params.toString();
  const path =
    qs.length > 0 ? `${MARKETPLACE_LIST_PATH}?${qs}` : MARKETPLACE_LIST_PATH;
  return request<MarketplaceListResponse>({
    method: 'GET',
    path,
    schema: MarketplaceListResponseSchema,
  });
}

export async function fetchMarketplaceServer(
  id: string,
): Promise<Result<MarketplaceServer>> {
  if (!ENABLED) return notImplementedResult<MarketplaceServer>();
  return request<MarketplaceServer>({
    method: 'GET',
    path: MARKETPLACE_DETAIL_PATH(id),
    schema: MarketplaceServerSchema,
  });
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useMarketplaceServers(
  args?: FetchMarketplaceServersArgs,
): UseQueryResult<Result<MarketplaceListResponse>, Error> {
  // Branch the call site (rather than ternary on `initialData`) so that
  // `exactOptionalPropertyTypes: true` does not see `undefined` as a value
  // for `initialData` — TanStack Query types reject that.
  if (!ENABLED) {
    return useQuery<Result<MarketplaceListResponse>, Error>({
      queryKey: ['marketplace-servers', args],
      queryFn: () => fetchMarketplaceServers(args),
      enabled: false,
      staleTime: 5 * 60_000,
      initialData: notImplementedResult<MarketplaceListResponse>(),
    });
  }
  return useQuery<Result<MarketplaceListResponse>, Error>({
    queryKey: ['marketplace-servers', args],
    queryFn: () => fetchMarketplaceServers(args),
    staleTime: 5 * 60_000,
  });
}

export function useMarketplaceServer(
  id: string | null | undefined,
): UseQueryResult<Result<MarketplaceServer>, Error> {
  if (!ENABLED) {
    return useQuery<Result<MarketplaceServer>, Error>({
      queryKey: ['marketplace-server', id ?? ''],
      queryFn: () => {
        if (!id) {
          return Promise.resolve({
            ok: false as const,
            status: 0,
            error: 'missing_id',
          });
        }
        return fetchMarketplaceServer(id);
      },
      enabled: false,
      staleTime: 5 * 60_000,
      initialData: notImplementedResult<MarketplaceServer>(),
    });
  }
  return useQuery<Result<MarketplaceServer>, Error>({
    queryKey: ['marketplace-server', id ?? ''],
    queryFn: () => {
      if (!id) {
        return Promise.resolve({
          ok: false as const,
          status: 0,
          error: 'missing_id',
        });
      }
      return fetchMarketplaceServer(id);
    },
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}
