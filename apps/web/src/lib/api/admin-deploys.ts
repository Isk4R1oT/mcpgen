// apps/web/src/lib/api/admin-deploys.ts
//
// Phase 3 / C3-deploys — typed BFF stubs for the admin deploys & regions
// surface. Lives in its own module (rather than inside `admin.ts`) because
// multiple Phase 3 agents extend `admin.ts` in parallel; keeping deploy
// concerns isolated avoids merge collisions while preserving the shared
// `Result<T>` contract from `client-base.ts`.
//
// Mirrors canon `admin-deploys.jsx` (`DeploysScreen`). BFF endpoints are
// all MISSING per SCREEN-BEHAVIORS-CATALOG.md § admin-deploys:
//   - GET  /api/admin/v1/regions
//   - GET  /api/admin/v1/deploys
//   - GET/POST /api/admin/v1/killswitches  (4-eyes)
//   - POST /api/admin/v1/deploys/:id/rollback
//
// Schemas use the field names the canon screen consumes (`r.code`, `r.city`,
// `d.from`, `d.to`, `d.by`, `d.time`) so the wire shape maps 1:1 once the
// BFF lands. Hooks always return `flag_off_or_not_implemented` for now; the
// screen renders the canon loading state when the result is unavailable.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { notImplementedResult, type Result } from './client-base.js';

const ENABLED = false;

// ─── Region schemas ────────────────────────────────────────────────────────

export const AdminRegionStatusSchema = z.enum([
  'healthy',
  'degraded',
  'down',
  'maint',
]);
export type AdminRegionStatus = z.infer<typeof AdminRegionStatusSchema>;

export const AdminRegionSchema = z.object({
  code: z.string(),
  city: z.string(),
  status: AdminRegionStatusSchema,
  p95: z.string(),
  errors: z.string(),
  servers: z.number().int().nonnegative(),
  qps: z.string(),
});
export type AdminRegion = z.infer<typeof AdminRegionSchema>;

export const AdminRegionsResponseSchema = z.object({
  regions: z.array(AdminRegionSchema),
});
export type AdminRegionsResponse = z.infer<typeof AdminRegionsResponseSchema>;

// ─── Deploy schemas ────────────────────────────────────────────────────────

export const AdminDeployStatusSchema = z.enum([
  'success',
  'in-progress',
  'failed',
  'rolled-back',
]);
export type AdminDeployStatus = z.infer<typeof AdminDeployStatusSchema>;

export const AdminDeploySchema = z.object({
  id: z.string(),
  time: z.string(),
  server: z.string(),
  from: z.string(),
  to: z.string(),
  status: AdminDeployStatusSchema,
  by: z.string(),
});
export type AdminDeploy = z.infer<typeof AdminDeploySchema>;

export const AdminDeploysResponseSchema = z.object({
  deploys: z.array(AdminDeploySchema),
  next_cursor: z.string().nullable().optional(),
});
export type AdminDeploysResponse = z.infer<typeof AdminDeploysResponseSchema>;

// ─── Functions (all stubs) ─────────────────────────────────────────────────

export async function fetchAdminRegions(): Promise<
  Result<AdminRegionsResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminRegionsResponse>();
  return notImplementedResult<AdminRegionsResponse>();
}

export async function fetchAdminDeploys(): Promise<
  Result<AdminDeploysResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminDeploysResponse>();
  return notImplementedResult<AdminDeploysResponse>();
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useAdminRegions(): UseQueryResult<
  Result<AdminRegionsResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminRegionsResponse>, Error>({
      queryKey: ['admin-regions'],
      queryFn: fetchAdminRegions,
      enabled: false,
      initialData: notImplementedResult<AdminRegionsResponse>(),
    });
  }
  return useQuery<Result<AdminRegionsResponse>, Error>({
    queryKey: ['admin-regions'],
    queryFn: fetchAdminRegions,
  });
}

export function useAdminDeploys(): UseQueryResult<
  Result<AdminDeploysResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminDeploysResponse>, Error>({
      queryKey: ['admin-deploys'],
      queryFn: fetchAdminDeploys,
      enabled: false,
      initialData: notImplementedResult<AdminDeploysResponse>(),
    });
  }
  return useQuery<Result<AdminDeploysResponse>, Error>({
    queryKey: ['admin-deploys'],
    queryFn: fetchAdminDeploys,
  });
}
