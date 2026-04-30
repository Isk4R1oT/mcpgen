// packages/contracts/src/dashboard-api.ts
//
// Plan 09-03 (Phase 9 D-18) — single source of truth for the BFF ↔ frontend
// dashboard wire shape. Promoted from the local definitions previously living
// in apps/web/src/lib/api/dashboard-client.ts (Phase 7 plan 07-05). Web client
// re-exports verbatim; apps/api consumes for zValidator + response parity.
//
// Zod-validated, never narrowed at the wire: BFF schema additions stay
// strictly additive so the dashboard never breaks on new optional fields.
// `quality_report` is intentionally `unknown` because the F1/F2/F3 report is
// a free-form JSONB at the DB level whose shape evolves per Phase 5+.
//
// References:
//   - apps/web/src/lib/api/dashboard-client.ts (origin; lines 31-90 in
//     Phase-7 form)
//   - apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/
//     route.ts (PATCH body shape: `{ public_badge: boolean }`)
//   - .planning/phases/09-observability-polish/09-03-PLAN.md Task 1
//   - .planning/phases/09-observability-polish/09-RESEARCH.md A7 (single
//     source of truth)

import { z } from 'zod';

// ─── Deployment ────────────────────────────────────────────────────────────

export const DeploymentSchema = z.object({
  deployment_id: z.string().uuid(),
  generation_id: z.string().uuid(),
  server_name: z.string().min(1),
  server_url: z.string().url(),
  auth_mode: z.enum(['passthrough', 'stored', 'oauth']),
  deployed_at: z.string().datetime(),
  // Free-form JSONB: F1/F2/F3 report shape evolves per Phase 5; the wire
  // validator stays loose so additive engine fields do not break the
  // dashboard. The IR's QualityReport Pydantic/Zod type is the typed surface
  // for consumers who need it.
  quality_report: z.unknown().nullable(),
  public_badge: z.boolean(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeploymentsListResponseSchema = z.object({
  deployments: z.array(DeploymentSchema),
});
export type DeploymentsListResponse = z.infer<typeof DeploymentsListResponseSchema>;

// ─── UsageHourlyRow (for Plan 09-04 /usage/hourly endpoint) ────────────────
//
// Mirrors architecture §7.2 TimescaleDB continuous aggregate `usage_hourly`.

export const UsageHourlyRowSchema = z.object({
  deployment_id: z.string().uuid(),
  hour_bucket: z.string().datetime(),
  call_count: z.number().int().nonnegative(),
  total_latency_ms: z.number().int().nonnegative(),
  total_cost_usd: z.number().nonnegative().nullable(),
  error_count: z.number().int().nonnegative(),
});
export type UsageHourlyRow = z.infer<typeof UsageHourlyRowSchema>;

export const UsageHourlyResponseSchema = z.object({
  rows: z.array(UsageHourlyRowSchema),
});
export type UsageHourlyResponse = z.infer<typeof UsageHourlyResponseSchema>;

// ─── DeployResponse (for Plan 09-06 /deploy/[id] endpoint) ─────────────────

export const DeployResponseSchema = z.object({
  deployment_id: z.string().uuid(),
  server_name: z.string().min(1),
  server_url: z.string().url(),
  // Claude Desktop config block — server-side built per Phase 7 D-23.
  // Optional because fixture-mode synthesizes it client-side via
  // apps/web/src/lib/claude-desktop/config.
  claude_desktop_config: z
    .object({
      mcpServers: z.record(
        z.string(),
        z.object({
          url: z.string().url(),
          headers: z.record(z.string(), z.string()).optional(),
        }),
      ),
    })
    .optional(),
});
export type DeployResponse = z.infer<typeof DeployResponseSchema>;

// ─── BadgePublic toggle (PATCH /deployments/:id/badge-public) ──────────────
//
// HTTP method is PATCH (not POST) and body field is `public_badge` (not
// `public`) because the frontend Route Handler proxy at
// apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts
// already wires that exact contract; the BFF endpoint MUST match.

export const BadgePublicRequestSchema = z.object({
  public_badge: z.boolean(),
});
export type BadgePublicRequest = z.infer<typeof BadgePublicRequestSchema>;

export const BadgePublicResponseSchema = z.object({
  deployment_id: z.string().uuid(),
  public_badge: z.boolean(),
  // Optional: server may include the row's updated_at timestamp for
  // optimistic-concurrency UI. Not required by the dashboard.
  updated_at: z.string().datetime().optional(),
});
export type BadgePublicResponse = z.infer<typeof BadgePublicResponseSchema>;
