// apps/web/src/lib/api/deployments.ts
//
// Foundation Agent F-BFFClients — typed clients + TanStack Query hooks for
// the BFF deployment endpoints. Reuses the schemas in
// `@mcpgen/contracts/dashboard-api` (single source of truth, Phase 9 D-18) so
// the wire shape never drifts between this module and the existing
// `dashboard-client.ts` (which it deliberately does NOT replace — both modules
// resolve to the same contract types).
//
// Endpoints covered:
//   GET   /api/v1/deployments                          — list org deployments
//   POST  /api/v1/deploy/:generationId                 — promote generation
//                                                        to a tenant Worker
//   POST  /api/v1/deploy/permanent/:id                 — claimed/auth promote
//   POST  /api/v1/deploy/ephemeral                     — anon ephemeral
//   PATCH /api/v1/deployments/:id/badge-public         — toggle public badge
//   GET   /api/v1/deployments/:id/drift-events         — drift history
//   PATCH /api/v1/deployments/:id                      — drift settings
//
// References:
//   - apps/api/src/routes/v1/deployments.ts
//   - apps/api/src/routes/v1/deploy-legacy.ts
//   - apps/api/src/routes/v1/deploy-ephemeral.ts
//   - apps/api/src/routes/v1/permanent-deploy.ts
//   - apps/api/src/routes/v1/drift.ts
//   - packages/contracts/src/dashboard-api.ts
//   - packages/contracts/src/billing-types.ts (DeploymentDriftPatchRequest)

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  BadgePublicResponseSchema,
  DeploymentsListResponseSchema,
  DeployResponseSchema,
  type BadgePublicResponse,
  type Deployment,
  type DeployResponse,
} from '@mcpgen/contracts/dashboard-api';
import { z } from 'zod';

import { getOrCreateIdempotencyKey } from '../idempotency-key.js';
import { request, type Result } from './client-base.js';

// ─── Schemas (drift — not yet promoted to @mcpgen/contracts) ───────────────

export const DriftEventSchema = z.object({
  id: z.string(),
  deployment_id: z.string(),
  // Server-side enum is wider; keep loose to avoid drift breakage.
  status: z.string(),
  detected_at: z.string().optional(),
  resolved_by_generation_id: z.string().nullable().optional(),
  diff: z.unknown().optional(),
});
export type DriftEvent = z.infer<typeof DriftEventSchema>;

export const DriftEventsResponseSchema = z.object({
  drift_events: z.array(DriftEventSchema),
});
export type DriftEventsResponse = z.infer<typeof DriftEventsResponseSchema>;

export const DriftPatchResponseSchema = z.object({
  ok: z.boolean(),
  auto_regenerate_on_drift: z.boolean(),
});
export type DriftPatchResponse = z.infer<typeof DriftPatchResponseSchema>;

// ─── Endpoint paths ────────────────────────────────────────────────────────

const DEPLOYMENTS_PATH = '/api/v1/deployments';
const DEPLOY_LEGACY_PATH = (generationId: string): string =>
  `/api/v1/deploy/${encodeURIComponent(generationId)}`;
const DEPLOY_PERMANENT_PATH = (generationId: string): string =>
  `/api/v1/deploy/permanent/${encodeURIComponent(generationId)}`;
const DEPLOY_EPHEMERAL_PATH = '/api/v1/deploy/ephemeral';
const BADGE_PUBLIC_PATH = (deploymentId: string): string =>
  `/api/v1/deployments/${encodeURIComponent(deploymentId)}/badge-public`;
const DRIFT_EVENTS_PATH = (deploymentId: string): string =>
  `/api/v1/deployments/${encodeURIComponent(deploymentId)}/drift-events`;
const DEPLOYMENT_PATCH_PATH = (deploymentId: string): string =>
  `/api/v1/deployments/${encodeURIComponent(deploymentId)}`;

// ─── Functions ─────────────────────────────────────────────────────────────

export async function fetchDeployments(): Promise<
  Result<{ deployments: Deployment[] }>
> {
  return request<{ deployments: Deployment[] }>({
    method: 'GET',
    path: DEPLOYMENTS_PATH,
    schema: DeploymentsListResponseSchema,
  });
}

export interface DeployArgs {
  generationId: string;
  override_name?: string;
}

export async function deploy(args: DeployArgs): Promise<Result<DeployResponse>> {
  const idempotencyKey = getOrCreateIdempotencyKey(
    `deploy:${args.generationId}`,
    args.override_name ?? '',
  );
  const body =
    args.override_name !== undefined ? { override_name: args.override_name } : undefined;
  return request<DeployResponse>({
    method: 'POST',
    path: DEPLOY_LEGACY_PATH(args.generationId),
    body,
    schema: DeployResponseSchema,
    options: { idempotencyKey },
    successStatuses: [200, 202],
  });
}

export async function deployPermanent(
  args: DeployArgs,
): Promise<Result<DeployResponse>> {
  const idempotencyKey = getOrCreateIdempotencyKey(
    `deploy-permanent:${args.generationId}`,
    args.override_name ?? '',
  );
  const body =
    args.override_name !== undefined ? { override_name: args.override_name } : undefined;
  return request<DeployResponse>({
    method: 'POST',
    path: DEPLOY_PERMANENT_PATH(args.generationId),
    body,
    schema: DeployResponseSchema,
    options: { idempotencyKey },
    successStatuses: [200, 202],
  });
}

export async function deployEphemeral(
  args: DeployArgs,
): Promise<Result<DeployResponse>> {
  const idempotencyKey = getOrCreateIdempotencyKey(
    `deploy-ephemeral:${args.generationId}`,
    args.override_name ?? '',
  );
  return request<DeployResponse>({
    method: 'POST',
    path: DEPLOY_EPHEMERAL_PATH,
    body: { generation_id: args.generationId, override_name: args.override_name },
    schema: DeployResponseSchema,
    options: { idempotencyKey },
    successStatuses: [200, 202],
  });
}

export interface SetBadgePublicArgs {
  deploymentId: string;
  publicBadge: boolean;
}

export async function setBadgePublic(
  args: SetBadgePublicArgs,
): Promise<Result<BadgePublicResponse>> {
  const idempotencyKey = getOrCreateIdempotencyKey(
    `badge-public:${args.deploymentId}`,
    args.publicBadge ? 'on' : 'off',
  );
  return request<BadgePublicResponse>({
    method: 'PATCH',
    path: BADGE_PUBLIC_PATH(args.deploymentId),
    body: { public_badge: args.publicBadge },
    schema: BadgePublicResponseSchema,
    options: { idempotencyKey },
  });
}

export async function fetchDriftEvents(
  deploymentId: string,
): Promise<Result<DriftEventsResponse>> {
  return request<DriftEventsResponse>({
    method: 'GET',
    path: DRIFT_EVENTS_PATH(deploymentId),
    schema: DriftEventsResponseSchema,
  });
}

export interface PatchDeploymentArgs {
  deploymentId: string;
  auto_regenerate_on_drift: boolean;
}

export async function patchDeployment(
  args: PatchDeploymentArgs,
): Promise<Result<DriftPatchResponse>> {
  const idempotencyKey = getOrCreateIdempotencyKey(
    `deployment-patch:${args.deploymentId}`,
    args.auto_regenerate_on_drift ? 'on' : 'off',
  );
  return request<DriftPatchResponse>({
    method: 'PATCH',
    path: DEPLOYMENT_PATCH_PATH(args.deploymentId),
    body: { auto_regenerate_on_drift: args.auto_regenerate_on_drift },
    schema: DriftPatchResponseSchema,
    options: { idempotencyKey },
  });
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useDeployments(): UseQueryResult<
  Result<{ deployments: Deployment[] }>,
  Error
> {
  return useQuery<Result<{ deployments: Deployment[] }>, Error>({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    staleTime: 30_000,
  });
}

export function useDriftEvents(
  deploymentId: string | null | undefined,
): UseQueryResult<Result<DriftEventsResponse>, Error> {
  return useQuery<Result<DriftEventsResponse>, Error>({
    queryKey: ['drift-events', deploymentId],
    queryFn: () => {
      if (!deploymentId) {
        return Promise.resolve({
          ok: false as const,
          status: 0,
          error: 'missing_deployment_id',
        });
      }
      return fetchDriftEvents(deploymentId);
    },
    enabled: Boolean(deploymentId),
    staleTime: 30_000,
  });
}

export function useDeployMutation(): UseMutationResult<
  Result<DeployResponse>,
  Error,
  DeployArgs
> {
  const queryClient = useQueryClient();
  return useMutation<Result<DeployResponse>, Error, DeployArgs>({
    mutationFn: deploy,
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }
    },
  });
}

// Phase 1 / Agent A5 — ephemeral + permanent deploy mutation hooks.
// The bare `deployEphemeral` / `deployPermanent` functions exist above; these
// wrappers add the standard `useMutation` ergonomics (loading flag, onSuccess
// cache invalidation) the Deploy screen needs.

export function useDeployEphemeral(): UseMutationResult<
  Result<DeployResponse>,
  Error,
  DeployArgs
> {
  const queryClient = useQueryClient();
  return useMutation<Result<DeployResponse>, Error, DeployArgs>({
    mutationFn: deployEphemeral,
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }
    },
  });
}

export function useDeployPermanent(): UseMutationResult<
  Result<DeployResponse>,
  Error,
  DeployArgs
> {
  const queryClient = useQueryClient();
  return useMutation<Result<DeployResponse>, Error, DeployArgs>({
    mutationFn: deployPermanent,
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }
    },
  });
}

export function useSetBadgePublicMutation(): UseMutationResult<
  Result<BadgePublicResponse>,
  Error,
  SetBadgePublicArgs
> {
  const queryClient = useQueryClient();
  return useMutation<Result<BadgePublicResponse>, Error, SetBadgePublicArgs>({
    mutationFn: setBadgePublic,
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }
    },
  });
}

export function usePatchDeploymentMutation(): UseMutationResult<
  Result<DriftPatchResponse>,
  Error,
  PatchDeploymentArgs
> {
  const queryClient = useQueryClient();
  return useMutation<Result<DriftPatchResponse>, Error, PatchDeploymentArgs>({
    mutationFn: patchDeployment,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['drift-events', variables.deploymentId],
      });
    },
  });
}

export type { Deployment, DeployResponse, BadgePublicResponse };
