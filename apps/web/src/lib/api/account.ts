// apps/web/src/lib/api/account.ts
//
// Phase 2 — Settings screen — typed BFF client for the user-account
// surfaces consumed by the /settings page.
//
// Endpoints (apps/api/src/routes/v1/account.ts):
//   GET    /api/v1/account/profile   — user profile metadata
//   PATCH  /api/v1/account/profile   — update profile
//   GET    /api/v1/account/sessions  — Logto active sessions list
//   DELETE /api/v1/account           — danger-zone deletion
//
// All four are user-JWT protected. Logto cookies forward automatically via
// the Next.js /api/v1/* rewrite (same as the existing dashboard / billing
// clients).

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { z } from 'zod';

import { request, type Result } from './client-base.js';

const PROFILE_PATH = '/api/v1/account/profile';
const SESSIONS_PATH = '/api/v1/account/sessions';
const ACCOUNT_PATH = '/api/v1/account';

// ─── Profile ────────────────────────────────────────────────────────────────

export const AccountProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  handle: z.string(),
  timezone: z.string(),
  language: z.string(),
  bio: z.string(),
  avatar_url: z.string(),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

// PATCH body — every field optional, validated server-side.
export interface AccountProfilePatch {
  readonly name?: string;
  readonly handle?: string;
  readonly timezone?: string;
  readonly language?: string;
  readonly bio?: string;
  readonly avatar_url?: string;
}

export async function fetchAccountProfile(): Promise<Result<AccountProfile>> {
  return request<AccountProfile>({
    method: 'GET',
    path: PROFILE_PATH,
    schema: AccountProfileSchema,
  });
}

export async function patchAccountProfile(
  patch: AccountProfilePatch,
): Promise<Result<AccountProfile>> {
  return request<AccountProfile>({
    method: 'PATCH',
    path: PROFILE_PATH,
    body: patch,
    schema: AccountProfileSchema,
  });
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export const AccountSessionSchema = z.object({
  id: z.string(),
  device: z.string(),
  ip: z.string(),
  location: z.string(),
  last_active: z.string(),
  current: z.boolean(),
});
export type AccountSession = z.infer<typeof AccountSessionSchema>;

export const AccountSessionsResponseSchema = z.object({
  available: z.boolean(),
  sessions: z.array(AccountSessionSchema),
});
export type AccountSessionsResponse = z.infer<
  typeof AccountSessionsResponseSchema
>;

export async function fetchAccountSessions(): Promise<
  Result<AccountSessionsResponse>
> {
  return request<AccountSessionsResponse>({
    method: 'GET',
    path: SESSIONS_PATH,
    schema: AccountSessionsResponseSchema,
  });
}

// ─── Delete ────────────────────────────────────────────────────────────────

export const AccountDeleteResponseSchema = z.object({
  ok: z.boolean(),
});
export type AccountDeleteResponse = z.infer<typeof AccountDeleteResponseSchema>;

export interface AccountDeleteBody {
  readonly confirm_phrase: string;
}

export async function deleteAccount(
  body: AccountDeleteBody,
): Promise<Result<AccountDeleteResponse>> {
  return request<AccountDeleteResponse>({
    method: 'DELETE',
    path: ACCOUNT_PATH,
    body,
    schema: AccountDeleteResponseSchema,
  });
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useAccountProfile(): UseQueryResult<
  Result<AccountProfile>,
  Error
> {
  return useQuery<Result<AccountProfile>, Error>({
    queryKey: ['account-profile'],
    queryFn: fetchAccountProfile,
    staleTime: 60_000,
  });
}

export function useAccountSessions(): UseQueryResult<
  Result<AccountSessionsResponse>,
  Error
> {
  return useQuery<Result<AccountSessionsResponse>, Error>({
    queryKey: ['account-sessions'],
    queryFn: fetchAccountSessions,
    staleTime: 30_000,
  });
}

export function useAccountProfilePatch(): UseMutationResult<
  Result<AccountProfile>,
  Error,
  AccountProfilePatch
> {
  return useMutation<Result<AccountProfile>, Error, AccountProfilePatch>({
    mutationFn: patchAccountProfile,
  });
}

export function useAccountDelete(): UseMutationResult<
  Result<AccountDeleteResponse>,
  Error,
  AccountDeleteBody
> {
  return useMutation<Result<AccountDeleteResponse>, Error, AccountDeleteBody>({
    mutationFn: deleteAccount,
  });
}
