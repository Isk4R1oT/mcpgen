// apps/web/src/lib/api/dashboard.ts
//
// Foundation Agent F-BFFClients — top-level dashboard hooks. Composes the
// individual `deployments` + `billing` modules into the consolidated views
// the dashboard screens consume. This is the only "screen-shaped" client in
// the directory; per-resource clients live in their own modules.
//
// References:
//   - apps/web/src/lib/api/deployments.ts (list + drift)
//   - apps/web/src/lib/api/billing.ts (usage)
//   - apps/api/src/routes/v1/dashboard.ts (root /dashboard whoami stub)
//   - apps/api/src/routes/v1/deployments.ts (GET /deployments)

import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { z } from 'zod';

import { request, type Result } from './client-base.js';
import {
  fetchDeployments,
  fetchDriftEvents,
  type Deployment,
  type DriftEventsResponse,
} from './deployments.js';

// ─── Dashboard whoami (root /dashboard stub for now) ───────────────────────

export const DashboardWhoamiSchema = z.object({
  stub: z.boolean().optional(),
  route: z.string().optional(),
  pending_plan: z.string().optional(),
});
export type DashboardWhoami = z.infer<typeof DashboardWhoamiSchema>;

export async function fetchDashboardWhoami(): Promise<Result<DashboardWhoami>> {
  return request<DashboardWhoami>({
    method: 'GET',
    path: '/api/v1/dashboard',
    schema: DashboardWhoamiSchema,
  });
}

// ─── Composed: deployments + drift summary ────────────────────────────────

export interface DashboardSummary {
  deployments: Deployment[];
  drift_by_deployment: Record<string, DriftEventsResponse>;
}

export const DashboardSummarySchema = z.object({
  deployments: z.array(z.unknown()),
  drift_by_deployment: z.record(z.string(), z.unknown()),
});

export async function fetchDashboardSummary(): Promise<Result<DashboardSummary>> {
  const list = await fetchDeployments();
  if (!list.ok) {
    return list as Result<DashboardSummary>;
  }
  const driftByDeployment: Record<string, DriftEventsResponse> = {};
  // Sequential per-deployment drift fetches keep the request graph predictable
  // and let TanStack Query devtools show which deployment is in flight.
  // For dashboards with > 25 deployments the caller should switch to
  // useDriftEvents per deployment lazily (see useDriftEvents in deployments.ts).
  for (const d of list.data.deployments) {
    const events = await fetchDriftEvents(d.deployment_id);
    if (events.ok) {
      driftByDeployment[d.deployment_id] = events.data;
    }
  }
  return {
    ok: true,
    data: {
      deployments: list.data.deployments,
      drift_by_deployment: driftByDeployment,
    },
  };
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useDashboardWhoami(): UseQueryResult<
  Result<DashboardWhoami>,
  Error
> {
  return useQuery<Result<DashboardWhoami>, Error>({
    queryKey: ['dashboard-whoami'],
    queryFn: fetchDashboardWhoami,
    staleTime: 5 * 60_000,
  });
}

export function useDashboardSummary(): UseQueryResult<
  Result<DashboardSummary>,
  Error
> {
  return useQuery<Result<DashboardSummary>, Error>({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 30_000,
  });
}

// Re-export the per-resource helpers so callers have a single import point
// for the dashboard screens.
export {
  useDeployments,
  useDriftEvents,
  useDeployMutation,
  useSetBadgePublicMutation,
  usePatchDeploymentMutation,
} from './deployments.js';
export { useUsageHourly } from './billing.js';
