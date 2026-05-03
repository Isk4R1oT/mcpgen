// apps/web/src/lib/flags/admin-actions.ts
//
// Phase 4 / D2-actions — server-side helper that batch-evaluates the per-screen
// admin action flags listed in PHASE-4-FLAG-MASTER.md. Each admin route page
// calls one of the screen-specific evaluators below; the resulting boolean map
// is passed as a prop to the corresponding Client Component, which gates each
// action: ON → real BFF call, OFF → existing toast stub.
//
// Per CLAUDE.md §12.4 — Flipt is the single source of truth for runtime
// toggles. Default for every `_perm` flag is OFF, so every admin write action
// is dark by default until ops flips the gate in Flipt.
//
// All functions are Server-Component-only; importing this module from a
// `'use client'` file is a build-time error because `evaluateBooleanFlag`
// reaches Flipt over the network.

import { evaluateBooleanFlag } from '@/lib/flags';
import type { FlagContext } from '@mcpgen/runtime/flags';

export interface AdminFlagInputs {
  readonly userId: string;
  readonly flagContext: FlagContext;
}

async function evalMany<K extends string>(
  keys: readonly K[],
  inputs: AdminFlagInputs,
): Promise<Readonly<Record<K, boolean>>> {
  const entries = await Promise.all(
    keys.map(async (key) => {
      const value = await evaluateBooleanFlag(
        key,
        inputs.userId,
        inputs.flagContext,
        false,
      );
      return [key, value] as const;
    }),
  );
  return Object.fromEntries(entries) as Readonly<Record<K, boolean>>;
}

// ─── Per-screen action flag bundles ────────────────────────────────────────

export type AdminBroadcastFlags = Readonly<{
  ui_admin_broadcast_save_draft_perm: boolean;
  ui_admin_broadcast_history_perm: boolean;
  ui_admin_broadcast_send_perm: boolean;
  ui_admin_broadcast_segment_perm: boolean;
  ui_admin_broadcast_spam_check_perm: boolean;
  ui_admin_broadcast_test_send_perm: boolean;
}>;

export async function evalAdminBroadcastFlags(
  inputs: AdminFlagInputs,
): Promise<AdminBroadcastFlags> {
  return evalMany(
    [
      'ui_admin_broadcast_save_draft_perm',
      'ui_admin_broadcast_history_perm',
      'ui_admin_broadcast_send_perm',
      'ui_admin_broadcast_segment_perm',
      'ui_admin_broadcast_spam_check_perm',
      'ui_admin_broadcast_test_send_perm',
    ] as const,
    inputs,
  );
}

export type AdminDataFlags = Readonly<{
  ui_admin_data_refresh_perm: boolean;
  ui_admin_data_export_perm: boolean;
  ui_admin_data_view_perm: boolean;
  ui_admin_data_schema_perm: boolean;
}>;

export async function evalAdminDataFlags(
  inputs: AdminFlagInputs,
): Promise<AdminDataFlags> {
  return evalMany(
    [
      'ui_admin_data_refresh_perm',
      'ui_admin_data_export_perm',
      'ui_admin_data_view_perm',
      'ui_admin_data_schema_perm',
    ] as const,
    inputs,
  );
}

export type AdminLlmFlags = Readonly<{
  ui_admin_llm_run_eval_perm: boolean;
  ui_admin_llm_propose_route_perm: boolean;
  ui_admin_llm_approve_route_perm: boolean;
}>;

export async function evalAdminLlmFlags(
  inputs: AdminFlagInputs,
): Promise<AdminLlmFlags> {
  return evalMany(
    [
      'ui_admin_llm_run_eval_perm',
      'ui_admin_llm_propose_route_perm',
      'ui_admin_llm_approve_route_perm',
    ] as const,
    inputs,
  );
}

export type AdminFlagsFlags = Readonly<{
  ui_admin_flag_edit_perm: boolean;
}>;

export async function evalAdminFlagsFlags(
  inputs: AdminFlagInputs,
): Promise<AdminFlagsFlags> {
  return evalMany(['ui_admin_flag_edit_perm'] as const, inputs);
}

export type AdminServersFlags = Readonly<{
  ui_admin_server_republish_perm: boolean;
  ui_admin_server_rollback_perm: boolean;
  ui_admin_server_takedown_perm: boolean;
  ui_admin_server_drift_regenerate_perm: boolean;
  ui_admin_server_drift_pin_perm: boolean;
  ui_admin_server_notify_owner_perm: boolean;
}>;

export async function evalAdminServersFlags(
  inputs: AdminFlagInputs,
): Promise<AdminServersFlags> {
  return evalMany(
    [
      'ui_admin_server_republish_perm',
      'ui_admin_server_rollback_perm',
      'ui_admin_server_takedown_perm',
      'ui_admin_server_drift_regenerate_perm',
      'ui_admin_server_drift_pin_perm',
      'ui_admin_server_notify_owner_perm',
    ] as const,
    inputs,
  );
}

export type AdminObsFlags = Readonly<{
  ui_admin_obs_silence_perm: boolean;
  ui_admin_obs_oncall_perm: boolean;
  ui_admin_obs_replay_traces_perm: boolean;
  ui_admin_obs_external_links_perm: boolean;
}>;

export async function evalAdminObsFlags(
  inputs: AdminFlagInputs,
): Promise<AdminObsFlags> {
  return evalMany(
    [
      'ui_admin_obs_silence_perm',
      'ui_admin_obs_oncall_perm',
      'ui_admin_obs_replay_traces_perm',
      'ui_admin_obs_external_links_perm',
    ] as const,
    inputs,
  );
}

export type AdminSupportFlags = Readonly<{
  ui_admin_support_assign_perm: boolean;
  ui_admin_support_snooze_perm: boolean;
  ui_admin_support_resolve_perm: boolean;
  ui_admin_support_reply_perm: boolean;
  ui_admin_support_internal_perm: boolean;
  ui_admin_support_attach_perm: boolean;
}>;

export async function evalAdminSupportFlags(
  inputs: AdminFlagInputs,
): Promise<AdminSupportFlags> {
  return evalMany(
    [
      'ui_admin_support_assign_perm',
      'ui_admin_support_snooze_perm',
      'ui_admin_support_resolve_perm',
      'ui_admin_support_reply_perm',
      'ui_admin_support_internal_perm',
      'ui_admin_support_attach_perm',
    ] as const,
    inputs,
  );
}

export type AdminUsersFlags = Readonly<{
  ui_admin_impersonate_perm: boolean;
  ui_admin_suspend_perm: boolean;
  ui_admin_password_reset_perm: boolean;
  ui_admin_revoke_sessions_perm: boolean;
  ui_admin_rotate_keys_perm: boolean;
  ui_admin_gdpr_export_perm: boolean;
  ui_admin_account_delete_perm: boolean;
}>;

export async function evalAdminUsersFlags(
  inputs: AdminFlagInputs,
): Promise<AdminUsersFlags> {
  return evalMany(
    [
      'ui_admin_impersonate_perm',
      'ui_admin_suspend_perm',
      'ui_admin_password_reset_perm',
      'ui_admin_revoke_sessions_perm',
      'ui_admin_rotate_keys_perm',
      'ui_admin_gdpr_export_perm',
      'ui_admin_account_delete_perm',
    ] as const,
    inputs,
  );
}

export type AdminBillingFlags = Readonly<{
  ui_admin_billing_refund_perm: boolean;
  ui_admin_billing_retry_perm: boolean;
  ui_admin_billing_credit_perm: boolean;
  ui_admin_billing_dunning_perm: boolean;
}>;

export async function evalAdminBillingFlags(
  inputs: AdminFlagInputs,
): Promise<AdminBillingFlags> {
  return evalMany(
    [
      'ui_admin_billing_refund_perm',
      'ui_admin_billing_retry_perm',
      'ui_admin_billing_credit_perm',
      'ui_admin_billing_dunning_perm',
    ] as const,
    inputs,
  );
}

export type AdminMarketplaceFlags = Readonly<{
  ui_admin_marketplace_bulk_approve_perm: boolean;
  ui_admin_marketplace_approve_perm: boolean;
  ui_admin_marketplace_request_changes_perm: boolean;
  ui_admin_marketplace_takedown_perm: boolean;
}>;

export async function evalAdminMarketplaceFlags(
  inputs: AdminFlagInputs,
): Promise<AdminMarketplaceFlags> {
  return evalMany(
    [
      'ui_admin_marketplace_bulk_approve_perm',
      'ui_admin_marketplace_approve_perm',
      'ui_admin_marketplace_request_changes_perm',
      'ui_admin_marketplace_takedown_perm',
    ] as const,
    inputs,
  );
}

export type AdminAuditFlags = Readonly<{
  ui_admin_audit_export_perm: boolean;
}>;

export async function evalAdminAuditFlags(
  inputs: AdminFlagInputs,
): Promise<AdminAuditFlags> {
  return evalMany(['ui_admin_audit_export_perm'] as const, inputs);
}

export type AdminContentFlags = Readonly<{
  ui_admin_content_new_perm: boolean;
  ui_admin_content_edit_perm: boolean;
  ui_admin_content_publish_perm: boolean;
  ui_admin_content_history_perm: boolean;
  ui_admin_content_email_test_perm: boolean;
}>;

export async function evalAdminContentFlags(
  inputs: AdminFlagInputs,
): Promise<AdminContentFlags> {
  return evalMany(
    [
      'ui_admin_content_new_perm',
      'ui_admin_content_edit_perm',
      'ui_admin_content_publish_perm',
      'ui_admin_content_history_perm',
      'ui_admin_content_email_test_perm',
    ] as const,
    inputs,
  );
}

export type AdminOverviewFlags = Readonly<{
  ui_admin_broadcast_perm: boolean;
  ui_admin_overview_data_perm: boolean;
}>;

export async function evalAdminOverviewFlags(
  inputs: AdminFlagInputs,
): Promise<AdminOverviewFlags> {
  return evalMany(
    [
      'ui_admin_broadcast_perm',
      'ui_admin_overview_data_perm',
    ] as const,
    inputs,
  );
}

// ─── Marketplace (public) ──────────────────────────────────────────────────

export type MarketplaceActionFlags = Readonly<{
  ui_marketplace_install_perm: boolean;
  ui_marketplace_fork_perm: boolean;
  ui_marketplace_star_perm: boolean;
  ui_security_soc2_perm: boolean;
}>;

export async function evalMarketplaceActionFlags(
  inputs: AdminFlagInputs,
): Promise<MarketplaceActionFlags> {
  return evalMany(
    [
      'ui_marketplace_install_perm',
      'ui_marketplace_fork_perm',
      'ui_marketplace_star_perm',
      'ui_security_soc2_perm',
    ] as const,
    inputs,
  );
}
