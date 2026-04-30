// apps/web/src/lib/api/dashboard-client.ts
//
// Plan 07-05 — Typed fetch client for the dashboard data path. Wraps the four
// `/api/v1/*` Route Handlers (deployments, usage/hourly, deploy/[id],
// badge-public) with Zod-validated parsers and a discriminated-union result
// type. Functions never retry — the caller decides per CLAUDE.md "no silent
// retries / fallbacks" rule.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md (BFF
//     endpoint shapes — declared locally until Phase-9 promotes them to
//     packages/contracts)
//   - apps/web/src/lib/claude-desktop/collision.ts (parseCollisionResponse)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-22 (badge-public
//     opt-in toggle), D-24 (server-name collision rename modal)

import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';
// Plan 09-03 / D-18 promotion: schemas now live in packages/contracts/src/
// dashboard-api.ts as the cross-package source of truth. The local re-export
// preserves every existing import path used by the dashboard data layer
// (and the 11 Phase-7 unit tests in tests/unit/lib/api/dashboard-client.test.ts)
// without touching call sites.
import {
  DeploymentSchema,
  DeploymentsListResponseSchema as DeploymentsResponseSchema,
  UsageHourlyRowSchema,
  UsageHourlyResponseSchema,
  DeployResponseSchema,
  type Deployment,
  type UsageHourlyRow,
  type DeployResponse,
} from '@mcpgen/contracts/dashboard-api';

import { parseCollisionResponse, type CollisionResponse } from '@/lib/claude-desktop/collision';
import { getOrCreateIdempotencyKey } from '@/lib/idempotency-key';

export {
  DeploymentSchema,
  DeploymentsResponseSchema,
  UsageHourlyRowSchema,
  UsageHourlyResponseSchema,
  DeployResponseSchema,
};
export type { Deployment, UsageHourlyRow, DeployResponse };

// ─── Result types ──────────────────────────────────────────────────────────

export type DeployResult =
  | { ok: true; data: DeployResponse }
  | { ok: false; status: 409; collision: CollisionResponse }
  | { ok: false; status: number; message: string };

// ─── Endpoint constants ────────────────────────────────────────────────────

const DEPLOYMENTS_PATH = '/api/v1/deployments';
const USAGE_HOURLY_PATH = '/api/v1/usage/hourly';
const DEPLOY_PATH = (generationId: string): string =>
  `/api/v1/deploy/${encodeURIComponent(generationId)}`;
const BADGE_PUBLIC_PATH = (deploymentId: string): string =>
  `/api/v1/deployments/${encodeURIComponent(deploymentId)}/badge-public`;

// ─── fetchDeployments ──────────────────────────────────────────────────────

export const fetchDeployments = async (): Promise<Deployment[]> => {
  const res = await fetch(DEPLOYMENTS_PATH);
  if (!res.ok) {
    throw new Error(`fetchDeployments: BFF returned ${res.status}`);
  }
  const json: unknown = await res.json();
  // Zod parse — throws on shape mismatch. CLAUDE.md "no silent fallbacks":
  // a shape mismatch is an upstream contract bug, not something to swallow.
  const parsed = DeploymentsResponseSchema.parse(json);
  return parsed.deployments;
};

// ─── fetchUsageHourly ──────────────────────────────────────────────────────

export interface FetchUsageHourlyParams {
  deploymentId?: string;
  from: string; // ISO datetime
  to: string; // ISO datetime
}

export const fetchUsageHourly = async ({
  deploymentId,
  from,
  to,
}: FetchUsageHourlyParams): Promise<UsageHourlyRow[]> => {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (deploymentId !== undefined) params.set('deployment_id', deploymentId);
  const res = await fetch(`${USAGE_HOURLY_PATH}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`fetchUsageHourly: BFF returned ${res.status}`);
  }
  const json: unknown = await res.json();
  const parsed = UsageHourlyResponseSchema.parse(json);
  return parsed.rows;
};

// ─── deploy ────────────────────────────────────────────────────────────────

export interface DeployOptions {
  override_name?: string;
}

export const deploy = async (
  generationId: string,
  opts?: DeployOptions,
): Promise<DeployResult> => {
  const hasBody = opts !== undefined && opts.override_name !== undefined;
  // CR-01 fix: D-14 contract requires `Idempotency-Key` on every write
  // operation (deploy creates a tenant Worker + a `deployments` row). The
  // key is namespaced per (generationId, override_name) so a retry of the
  // same logical action (e.g. double-click on the locked CTA, or rename
  // resubmit after 409) reuses the same key and the BFF dedupes; a deploy
  // under a *different* override_name is a different logical action and
  // gets a fresh key.
  const idempotencyKey = getOrCreateIdempotencyKey(
    `deploy:${generationId}`,
    opts?.override_name ?? '',
  );
  const headers: Record<string, string> = {
    [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
  };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const init: RequestInit = hasBody
    ? {
        method: 'POST',
        headers,
        body: JSON.stringify({ override_name: opts?.override_name }),
      }
    : { method: 'POST', headers };

  const res = await fetch(DEPLOY_PATH(generationId), init);

  if (res.status === 202 || res.status === 200) {
    const json: unknown = await res.json();
    const parsed = DeployResponseSchema.parse(json);
    return { ok: true, data: parsed };
  }

  if (res.status === 409) {
    const json: unknown = await res.json().catch(() => null);
    const collision = parseCollisionResponse(json);
    if (collision !== null) {
      return { ok: false, status: 409, collision };
    }
    return {
      ok: false,
      status: 409,
      message: 'Server name collision — BFF returned 409 without a parseable suggested_name.',
    };
  }

  // 4xx / 5xx — surface the upstream message verbatim so the dev console can
  // diagnose the carry-forward (BFF returns 502 bff_unreachable until the
  // /deploy/[id] route is implemented).
  let message: string;
  try {
    const json = (await res.json()) as { error?: string; message?: string };
    message = json.message ?? json.error ?? `BFF returned ${res.status}`;
  } catch {
    message = `BFF returned ${res.status}`;
  }
  return { ok: false, status: res.status, message };
};

// ─── setBadgePublic ────────────────────────────────────────────────────────

export const setBadgePublic = async (
  deploymentId: string,
  publicBadge: boolean,
): Promise<void> => {
  // CR-01 fix: PATCH /badge-public is a write operation (D-14). The key is
  // namespaced per (deploymentId, publicBadge) so a retry of the same toggle
  // is deduped by the BFF; flipping public→private→public uses a different
  // key for each logical step.
  const idempotencyKey = getOrCreateIdempotencyKey(
    `badge-public:${deploymentId}`,
    publicBadge ? 'on' : 'off',
  );
  const res = await fetch(BADGE_PUBLIC_PATH(deploymentId), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify({ public_badge: publicBadge }),
  });
  if (!res.ok) {
    throw new Error(`setBadgePublic: BFF returned ${res.status}`);
  }
};
