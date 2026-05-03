// apps/web/src/lib/api/admin.ts
//
// Foundation Agent F-BFFClients — admin client surface. The admin BFF
// endpoints do not exist as of Phase 0 (Phase 3 admin work will gate them
// behind a Flipt flag). This module ships the typed contract so the locked
// admin canvas (apps/web/src/admin/*.jsx) can consume the same hook shape it
// will eventually call against real endpoints.
//
// Every function returns `flag_off_or_not_implemented` until ENABLED flips.
//
// References:
//   - apps/web/src/admin/ (locked admin canvas)
//   - docs/mcpgen-feature-flags-contract.md (Flipt gating)

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { notImplementedResult, type Result } from './client-base.js';

const ENABLED = false;

// ─── Schemas ───────────────────────────────────────────────────────────────

export const AdminOrgSummarySchema = z.object({
  org_id: z.string().uuid(),
  name: z.string(),
  plan_tier: z.enum(['free', 'pro', 'enterprise']).optional(),
  user_count: z.number().int().nonnegative().optional(),
  deployment_count: z.number().int().nonnegative().optional(),
  created_at: z.string().datetime().optional(),
});
export type AdminOrgSummary = z.infer<typeof AdminOrgSummarySchema>;

export const AdminOrgsResponseSchema = z.object({
  orgs: z.array(AdminOrgSummarySchema),
  next_cursor: z.string().nullable().optional(),
});
export type AdminOrgsResponse = z.infer<typeof AdminOrgsResponseSchema>;

export const AdminMetricsSchema = z.object({
  generations_total: z.number().int().nonnegative(),
  generations_24h: z.number().int().nonnegative(),
  active_orgs_24h: z.number().int().nonnegative(),
  deployments_total: z.number().int().nonnegative(),
  errors_24h: z.number().int().nonnegative(),
});
export type AdminMetrics = z.infer<typeof AdminMetricsSchema>;

// ─── Admin user surface (Phase 3 / C2-users) ───────────────────────────────
//
// Mirrors the user list shown in canon `admin-users.jsx` (left split rail) +
// the per-user detail rail (right split). The BFF endpoints
// `GET /api/admin/v1/users` and `GET /api/admin/v1/users/:id` are not yet
// implemented (see SCREEN-BEHAVIORS-CATALOG.md § admin-users), so both hooks
// always return `flag_off_or_not_implemented`. The screen renders the canon
// loading/empty state when the result is unavailable.

export const AdminUserStatusSchema = z.enum([
  'active',
  'flagged',
  'suspended',
  'pending',
]);
export type AdminUserStatus = z.infer<typeof AdminUserStatusSchema>;

export const AdminUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  org: z.string(),
  role: z.string(),
  status: AdminUserStatusSchema,
  plan: z.string(),
  created: z.string(),
  last_seen: z.string(),
  mfa: z.boolean(),
  servers: z.number().int().nonnegative(),
  spend: z.string(),
  country: z.string(),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;

export const AdminUsersResponseSchema = z.object({
  users: z.array(AdminUserSummarySchema),
  next_cursor: z.string().nullable().optional(),
});
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;

// ─── Admin servers surface (Phase 3 / C2-servers) ──────────────────────────
//
// Mirrors the server list (`D.servers`) and per-server detail consumed by
// canon `admin-servers.jsx`. BFF endpoints
// `GET /api/admin/v1/servers` + `GET /api/admin/v1/servers/:id` are MISSING
// (see SCREEN-BEHAVIORS-CATALOG.md § admin-servers). Both hooks return
// `flag_off_or_not_implemented` until the BFF lands; the screen renders the
// canon loading state when no data is available.

export const AdminServerStatusSchema = z.enum([
  'live',
  'flagged',
  'incident',
  'suspended',
  'pending',
  'healthy',
  'degraded',
  'maint',
]);
export type AdminServerStatus = z.infer<typeof AdminServerStatusSchema>;

export const AdminServerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  org: z.string(),
  ownerId: z.string(),
  tools: z.number().int().nonnegative(),
  status: AdminServerStatusSchema,
  version: z.string(),
  region: z.string(),
  deploys: z.number().int().nonnegative(),
  p95: z.string(),
  errorRate: z.string(),
  invocations24: z.string(),
  drift: z.boolean(),
  listed: z.boolean(),
  featured: z.boolean(),
  flags: z.number().int().nonnegative(),
});
export type AdminServerSummary = z.infer<typeof AdminServerSummarySchema>;

export const AdminServersResponseSchema = z.object({
  servers: z.array(AdminServerSummarySchema),
  next_cursor: z.string().nullable().optional(),
});
export type AdminServersResponse = z.infer<typeof AdminServersResponseSchema>;

// ─── Admin integrations surface (Phase 3 / C3-integrations) ────────────────
//
// Mirrors canon `admin-integrations.jsx` — three table-driven tabs (oauth,
// webhooks, secrets) plus two preview-only tabs (smtp, dns). All BFF
// endpoints (`GET /api/admin/v1/integrations/{oauth,webhooks,secrets}`) are
// not yet implemented (see SCREEN-BEHAVIORS-CATALOG.md § admin-integrations),
// so the hooks always return `flag_off_or_not_implemented`. The screen
// renders the canon loading/empty state when the result is unavailable.

export const AdminOAuthProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  client_id: z.string(),
  scopes: z.string(),
  tokens: z.number().int().nonnegative(),
  last_rotated_label: z.string(),
  /** Canon highlights stale rotations (>90d) in --accent. */
  rotation_stale: z.boolean().optional(),
});
export type AdminOAuthProvider = z.infer<typeof AdminOAuthProviderSchema>;

export const AdminOAuthProvidersResponseSchema = z.object({
  providers: z.array(AdminOAuthProviderSchema),
});
export type AdminOAuthProvidersResponse = z.infer<
  typeof AdminOAuthProvidersResponseSchema
>;

export const AdminWebhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.string(),
  /** Success rate over the last 24h, expressed as a 0–100 integer. */
  success_24h: z.number().int().min(0).max(100),
  last_delivery_label: z.string(),
});
export type AdminWebhook = z.infer<typeof AdminWebhookSchema>;

export const AdminWebhooksResponseSchema = z.object({
  webhooks: z.array(AdminWebhookSchema),
});
export type AdminWebhooksResponse = z.infer<typeof AdminWebhooksResponseSchema>;

export const AdminSecretSchema = z.object({
  id: z.string(),
  key: z.string(),
  last_access_label: z.string(),
  rotated_label: z.string(),
  envs: z.string(),
  /** Canon highlights stale secrets (>90d) in --accent. */
  rotation_stale: z.boolean().optional(),
});
export type AdminSecret = z.infer<typeof AdminSecretSchema>;

export const AdminSecretsResponseSchema = z.object({
  secrets: z.array(AdminSecretSchema),
});
export type AdminSecretsResponse = z.infer<typeof AdminSecretsResponseSchema>;

// ─── Admin billing surface (Phase 3 / C3-billing) ──────────────────────────
//
// Mirrors the invoice list rendered by canon `admin/admin-billing.jsx`
// (`D.invoices.map(...)`) and the dunning sequence summary. The BFF
// endpoints
//   - GET  /api/admin/v1/billing/invoices
//   - POST /api/admin/v1/billing/invoices/:id/refund
//   - POST /api/admin/v1/billing/invoices/:id/retry
//   - POST /api/admin/v1/billing/credits
//   - GET  /api/admin/v1/billing/dunning
// are MISSING (see SCREEN-BEHAVIORS-CATALOG.md § admin-billing). The hooks
// always return `flag_off_or_not_implemented`. The screen renders the canon
// loading/empty state when the result is unavailable.

export const AdminInvoiceStatusSchema = z.enum([
  'paid',
  'failed',
  'disputed',
  'open',
  'pending',
  'refunded',
]);
export type AdminInvoiceStatus = z.infer<typeof AdminInvoiceStatusSchema>;

export const AdminInvoiceSchema = z.object({
  id: z.string(),
  org: z.string(),
  amount: z.number(),
  status: AdminInvoiceStatusSchema,
  attempts: z.number().int().nonnegative(),
  next_retry: z.string().nullable().optional(),
  stripe_charge_id: z.string().nullable().optional(),
});
export type AdminInvoice = z.infer<typeof AdminInvoiceSchema>;

export const AdminInvoicesResponseSchema = z.object({
  invoices: z.array(AdminInvoiceSchema),
  failed_count: z.number().int().nonnegative().optional(),
  disputed_count: z.number().int().nonnegative().optional(),
  next_cursor: z.string().nullable().optional(),
});
export type AdminInvoicesResponse = z.infer<
  typeof AdminInvoicesResponseSchema
>;

export const AdminBillingKpisSchema = z.object({
  mrr_usd: z.number().nonnegative(),
  failed_payments_24h: z.number().int().nonnegative(),
  failed_payments_at_risk_usd: z.number().nonnegative(),
  refunds_30d_usd: z.number().nonnegative(),
  refunds_30d_count: z.number().int().nonnegative(),
  credits_outstanding_usd: z.number().nonnegative(),
  credits_outstanding_accounts: z.number().int().nonnegative(),
});
export type AdminBillingKpis = z.infer<typeof AdminBillingKpisSchema>;

// ─── Admin moderation surface (Phase 3 / C3-marketplace) ───────────────────
//
// Mirrors the moderation queue (`D.queue[i]`) and per-item review rail
// consumed by canon `admin-marketplace.jsx`. BFF endpoints are MISSING:
//   - GET  /api/admin/v1/moderation/queue
//   - POST /api/admin/v1/moderation/:id/approve
//   - POST /api/admin/v1/moderation/:id/reject       (4-eyes)
//   - POST /api/admin/v1/moderation/bulk-approve
// (see SCREEN-BEHAVIORS-CATALOG.md § admin-marketplace). Until the BFF
// lands the hook always returns `flag_off_or_not_implemented`; the screen
// renders the canon empty state.

export const AdminModerationRiskSchema = z.enum(['low', 'med', 'high']);
export type AdminModerationRisk = z.infer<typeof AdminModerationRiskSchema>;

export const AdminModerationItemSchema = z.object({
  id: z.string(),
  /** Server name being submitted for moderation. */
  name: z.string(),
  /** Submitter handle / org. */
  submitter: z.string(),
  /** Auto-scored risk band. */
  risk: AdminModerationRiskSchema,
  /** Time waiting in queue (e.g. "2 min", "1 hr"). */
  waiting: z.string(),
});
export type AdminModerationItem = z.infer<typeof AdminModerationItemSchema>;

export const AdminModerationQueueResponseSchema = z.object({
  queue: z.array(AdminModerationItemSchema),
  /** Total pending count (canon: "14 pending · sla 4h"). */
  pending: z.number().int().nonnegative(),
  /** Bulk-approve eligible count (canon: "bulk approve · 12"). */
  bulk_approvable: z.number().int().nonnegative(),
  next_cursor: z.string().nullable().optional(),
});
export type AdminModerationQueueResponse = z.infer<
  typeof AdminModerationQueueResponseSchema
>;

// ─── Functions (all stubs) ─────────────────────────────────────────────────

export async function fetchAdminOrgs(): Promise<Result<AdminOrgsResponse>> {
  if (!ENABLED) return notImplementedResult<AdminOrgsResponse>();
  // Placeholder — when Phase 3 lands, swap to a real `request<...>()` call.
  return notImplementedResult<AdminOrgsResponse>();
}

export async function fetchAdminMetrics(): Promise<Result<AdminMetrics>> {
  if (!ENABLED) return notImplementedResult<AdminMetrics>();
  return notImplementedResult<AdminMetrics>();
}

export async function fetchAdminUsers(): Promise<Result<AdminUsersResponse>> {
  if (!ENABLED) return notImplementedResult<AdminUsersResponse>();
  return notImplementedResult<AdminUsersResponse>();
}

export async function fetchAdminServers(): Promise<
  Result<AdminServersResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminServersResponse>();
  return notImplementedResult<AdminServersResponse>();
}

export async function fetchAdminOAuthProviders(): Promise<
  Result<AdminOAuthProvidersResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminOAuthProvidersResponse>();
  return notImplementedResult<AdminOAuthProvidersResponse>();
}

export async function fetchAdminWebhooks(): Promise<
  Result<AdminWebhooksResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminWebhooksResponse>();
  return notImplementedResult<AdminWebhooksResponse>();
}

export async function fetchAdminSecrets(): Promise<
  Result<AdminSecretsResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminSecretsResponse>();
  return notImplementedResult<AdminSecretsResponse>();
}

export async function fetchAdminInvoices(): Promise<
  Result<AdminInvoicesResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminInvoicesResponse>();
  return notImplementedResult<AdminInvoicesResponse>();
}

export async function fetchAdminBillingKpis(): Promise<
  Result<AdminBillingKpis>
> {
  if (!ENABLED) return notImplementedResult<AdminBillingKpis>();
  return notImplementedResult<AdminBillingKpis>();
}

export async function fetchAdminModerationQueue(): Promise<
  Result<AdminModerationQueueResponse>
> {
  if (!ENABLED) return notImplementedResult<AdminModerationQueueResponse>();
  return notImplementedResult<AdminModerationQueueResponse>();
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useAdminOrgs(): UseQueryResult<
  Result<AdminOrgsResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminOrgsResponse>, Error>({
      queryKey: ['admin-orgs'],
      queryFn: fetchAdminOrgs,
      enabled: false,
      initialData: notImplementedResult<AdminOrgsResponse>(),
    });
  }
  return useQuery<Result<AdminOrgsResponse>, Error>({
    queryKey: ['admin-orgs'],
    queryFn: fetchAdminOrgs,
  });
}

export function useAdminMetrics(): UseQueryResult<
  Result<AdminMetrics>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminMetrics>, Error>({
      queryKey: ['admin-metrics'],
      queryFn: fetchAdminMetrics,
      enabled: false,
      initialData: notImplementedResult<AdminMetrics>(),
    });
  }
  return useQuery<Result<AdminMetrics>, Error>({
    queryKey: ['admin-metrics'],
    queryFn: fetchAdminMetrics,
  });
}

export function useAdminUsers(): UseQueryResult<
  Result<AdminUsersResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminUsersResponse>, Error>({
      queryKey: ['admin-users'],
      queryFn: fetchAdminUsers,
      enabled: false,
      initialData: notImplementedResult<AdminUsersResponse>(),
    });
  }
  return useQuery<Result<AdminUsersResponse>, Error>({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  });
}

export function useAdminServers(): UseQueryResult<
  Result<AdminServersResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminServersResponse>, Error>({
      queryKey: ['admin-servers'],
      queryFn: fetchAdminServers,
      enabled: false,
      initialData: notImplementedResult<AdminServersResponse>(),
    });
  }
  return useQuery<Result<AdminServersResponse>, Error>({
    queryKey: ['admin-servers'],
    queryFn: fetchAdminServers,
  });
}

export function useAdminOAuthProviders(): UseQueryResult<
  Result<AdminOAuthProvidersResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminOAuthProvidersResponse>, Error>({
      queryKey: ['admin-oauth-providers'],
      queryFn: fetchAdminOAuthProviders,
      enabled: false,
      initialData: notImplementedResult<AdminOAuthProvidersResponse>(),
    });
  }
  return useQuery<Result<AdminOAuthProvidersResponse>, Error>({
    queryKey: ['admin-oauth-providers'],
    queryFn: fetchAdminOAuthProviders,
  });
}

export function useAdminWebhooks(): UseQueryResult<
  Result<AdminWebhooksResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminWebhooksResponse>, Error>({
      queryKey: ['admin-webhooks'],
      queryFn: fetchAdminWebhooks,
      enabled: false,
      initialData: notImplementedResult<AdminWebhooksResponse>(),
    });
  }
  return useQuery<Result<AdminWebhooksResponse>, Error>({
    queryKey: ['admin-webhooks'],
    queryFn: fetchAdminWebhooks,
  });
}

export function useAdminSecrets(): UseQueryResult<
  Result<AdminSecretsResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminSecretsResponse>, Error>({
      queryKey: ['admin-secrets'],
      queryFn: fetchAdminSecrets,
      enabled: false,
      initialData: notImplementedResult<AdminSecretsResponse>(),
    });
  }
  return useQuery<Result<AdminSecretsResponse>, Error>({
    queryKey: ['admin-secrets'],
    queryFn: fetchAdminSecrets,
  });
}

export function useAdminInvoices(): UseQueryResult<
  Result<AdminInvoicesResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminInvoicesResponse>, Error>({
      queryKey: ['admin-invoices'],
      queryFn: fetchAdminInvoices,
      enabled: false,
      initialData: notImplementedResult<AdminInvoicesResponse>(),
    });
  }
  return useQuery<Result<AdminInvoicesResponse>, Error>({
    queryKey: ['admin-invoices'],
    queryFn: fetchAdminInvoices,
  });
}

export function useAdminBillingKpis(): UseQueryResult<
  Result<AdminBillingKpis>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminBillingKpis>, Error>({
      queryKey: ['admin-billing-kpis'],
      queryFn: fetchAdminBillingKpis,
      enabled: false,
      initialData: notImplementedResult<AdminBillingKpis>(),
    });
  }
  return useQuery<Result<AdminBillingKpis>, Error>({
    queryKey: ['admin-billing-kpis'],
    queryFn: fetchAdminBillingKpis,
  });
}

export function useAdminModerationQueue(): UseQueryResult<
  Result<AdminModerationQueueResponse>,
  Error
> {
  if (!ENABLED) {
    return useQuery<Result<AdminModerationQueueResponse>, Error>({
      queryKey: ['admin-moderation-queue'],
      queryFn: fetchAdminModerationQueue,
      enabled: false,
      initialData: notImplementedResult<AdminModerationQueueResponse>(),
    });
  }
  return useQuery<Result<AdminModerationQueueResponse>, Error>({
    queryKey: ['admin-moderation-queue'],
    queryFn: fetchAdminModerationQueue,
  });
}
