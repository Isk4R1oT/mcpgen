// apps/web/src/lib/api/billing.ts
//
// Foundation Agent F-BFFClients — typed clients + TanStack Query hooks for
// billing endpoints. Two surfaces today (Phase 8 D-06):
//   POST /api/v1/billing/checkout  — Stripe-hosted Checkout Session URL
//   POST /api/v1/billing/portal    — Stripe Customer Portal URL
//   GET  /api/v1/usage/hourly      — usage aggregates (org-scoped)
//
// The advanced billing surface (plan details, invoices, upgrade quotas) is
// not implemented in the BFF yet. We expose typed stubs that surface
// `flag_off_or_not_implemented` so the screens can render disabled states.
//
// References:
//   - apps/api/src/routes/v1/billing/checkout.ts
//   - apps/api/src/routes/v1/billing/portal.ts
//   - apps/api/src/routes/v1/usage.ts
//   - packages/contracts/src/billing-types.ts
//   - packages/contracts/src/dashboard-api.ts (UsageHourlyResponseSchema)
//   - packages/contracts/src/plan-tier.ts

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  CheckoutSessionResponse as CheckoutSessionResponseSchema,
  BillingPortalSessionResponse as BillingPortalSessionResponseSchema,
  type CheckoutSessionResponse,
  type BillingPortalSessionResponse,
} from '@mcpgen/contracts/billing-types';
import {
  UsageHourlyResponseSchema,
  type UsageHourlyResponse,
  type UsageHourlyRow,
} from '@mcpgen/contracts/dashboard-api';
import { z } from 'zod';

import {
  notImplementedResult,
  request,
  type Result,
} from './client-base.js';

// ─── Endpoint paths ────────────────────────────────────────────────────────

const CHECKOUT_PATH = '/api/v1/billing/checkout';
const PORTAL_PATH = '/api/v1/billing/portal';
const USAGE_HOURLY_PATH = '/api/v1/usage/hourly';

// ─── Implemented: Stripe checkout / portal ─────────────────────────────────

export async function createCheckoutSession(): Promise<
  Result<CheckoutSessionResponse>
> {
  return request<CheckoutSessionResponse>({
    method: 'POST',
    path: CHECKOUT_PATH,
    body: {},
    schema: CheckoutSessionResponseSchema,
  });
}

export async function createPortalSession(): Promise<
  Result<BillingPortalSessionResponse>
> {
  return request<BillingPortalSessionResponse>({
    method: 'POST',
    path: PORTAL_PATH,
    body: {},
    schema: BillingPortalSessionResponseSchema,
  });
}

// ─── Implemented: hourly usage ─────────────────────────────────────────────

export interface FetchUsageHourlyArgs {
  // ISO datetime
  from: string;
  to: string;
  deploymentId?: string;
}

export async function fetchUsageHourly(
  args: FetchUsageHourlyArgs,
): Promise<Result<UsageHourlyResponse>> {
  const params = new URLSearchParams();
  params.set('from', args.from);
  params.set('to', args.to);
  if (args.deploymentId !== undefined) {
    params.set('deployment_id', args.deploymentId);
  }
  return request<UsageHourlyResponse>({
    method: 'GET',
    path: `${USAGE_HOURLY_PATH}?${params.toString()}`,
    schema: UsageHourlyResponseSchema,
  });
}

// ─── Stubs: plan + invoices (BFF not implemented) ──────────────────────────

const ADVANCED_BILLING_ENABLED = false;

export const PlanSchema = z.object({
  tier: z.enum(['free', 'pro', 'enterprise']),
  active_subscription_id: z.string().nullable().optional(),
  renews_at: z.string().datetime().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
  monthly_quota: z
    .object({
      generations: z.number().int().nonnegative(),
      f3_evals: z.number().int().nonnegative(),
    })
    .optional(),
  monthly_used: z
    .object({
      generations: z.number().int().nonnegative(),
      f3_evals: z.number().int().nonnegative(),
    })
    .optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  number: z.string().nullable().optional(),
  amount_due_cents: z.number().int(),
  amount_paid_cents: z.number().int(),
  currency: z.string(),
  status: z.string(),
  hosted_invoice_url: z.string().url().nullable().optional(),
  created: z.string().datetime(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoicesResponseSchema = z.object({
  invoices: z.array(InvoiceSchema),
});
export type InvoicesResponse = z.infer<typeof InvoicesResponseSchema>;

export async function fetchPlan(): Promise<Result<Plan>> {
  if (!ADVANCED_BILLING_ENABLED) return notImplementedResult<Plan>();
  return request<Plan>({
    method: 'GET',
    path: '/api/v1/billing/plan',
    schema: PlanSchema,
  });
}

export async function fetchInvoices(): Promise<Result<InvoicesResponse>> {
  if (!ADVANCED_BILLING_ENABLED) return notImplementedResult<InvoicesResponse>();
  return request<InvoicesResponse>({
    method: 'GET',
    path: '/api/v1/billing/invoices',
    schema: InvoicesResponseSchema,
  });
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useCheckoutMutation(): UseMutationResult<
  Result<CheckoutSessionResponse>,
  Error,
  void
> {
  return useMutation<Result<CheckoutSessionResponse>, Error, void>({
    mutationFn: createCheckoutSession,
  });
}

export function usePortalMutation(): UseMutationResult<
  Result<BillingPortalSessionResponse>,
  Error,
  void
> {
  return useMutation<Result<BillingPortalSessionResponse>, Error, void>({
    mutationFn: createPortalSession,
  });
}

export function useUsageHourly(
  args: FetchUsageHourlyArgs | null,
): UseQueryResult<Result<UsageHourlyResponse>, Error> {
  return useQuery<Result<UsageHourlyResponse>, Error>({
    queryKey: ['usage-hourly', args],
    queryFn: () => {
      if (!args) {
        return Promise.resolve({
          ok: false as const,
          status: 0,
          error: 'missing_args',
        });
      }
      return fetchUsageHourly(args);
    },
    enabled: args !== null,
    staleTime: 60_000,
  });
}

export function usePlan(): UseQueryResult<Result<Plan>, Error> {
  // Branch on the gate to satisfy `exactOptionalPropertyTypes: true` —
  // TanStack Query rejects an `undefined` value for `initialData`.
  if (!ADVANCED_BILLING_ENABLED) {
    return useQuery<Result<Plan>, Error>({
      queryKey: ['billing-plan'],
      queryFn: fetchPlan,
      enabled: false,
      staleTime: 60_000,
      initialData: notImplementedResult<Plan>(),
    });
  }
  return useQuery<Result<Plan>, Error>({
    queryKey: ['billing-plan'],
    queryFn: fetchPlan,
    staleTime: 60_000,
  });
}

export function useInvoices(): UseQueryResult<Result<InvoicesResponse>, Error> {
  if (!ADVANCED_BILLING_ENABLED) {
    return useQuery<Result<InvoicesResponse>, Error>({
      queryKey: ['billing-invoices'],
      queryFn: fetchInvoices,
      enabled: false,
      staleTime: 60_000,
      initialData: notImplementedResult<InvoicesResponse>(),
    });
  }
  return useQuery<Result<InvoicesResponse>, Error>({
    queryKey: ['billing-invoices'],
    queryFn: fetchInvoices,
    staleTime: 60_000,
  });
}

export type {
  CheckoutSessionResponse,
  BillingPortalSessionResponse,
  UsageHourlyResponse,
  UsageHourlyRow,
};
