// apps/web/src/lib/flags/account-actions.ts
//
// Phase Frontend Rebuild — Server-side batch evaluator for the eight
// `ui_auth_*_perm` permission flags consumed by the AccountScreen
// (sign-in / sign-up / magic-link / forgot-password) plus
// `ui_marketplace_perm` (used to decide whether the TopBar's marketplace link
// is rendered).
//
// Mirrors `apps/web/src/lib/flags/admin-actions.ts` style — keep the eval
// surface narrow and Server-Component-only so the FLIPT_CLIENT_TOKEN never
// crosses into the client bundle.
//
// Per CLAUDE.md §12.4 — Flipt is the single source of truth for runtime
// toggles. Default for every `_perm` flag is OFF, so SSO providers, magic
// links, signup, and forgot-password all stay dark by default until ops
// flips the gate in Flipt.

import { evaluateBooleanFlag } from '@/lib/flags';
import type { FlagContext } from '@mcpgen/runtime/flags';

export interface AccountFlagInputs {
  readonly userId: string;
  readonly flagContext: FlagContext;
}

export type AccountFlags = Readonly<{
  ui_auth_signup_perm: boolean;
  ui_auth_magic_link_perm: boolean;
  ui_auth_forgot_password_perm: boolean;
  ui_auth_google_sso_perm: boolean;
  ui_auth_github_sso_perm: boolean;
  ui_auth_microsoft_sso_perm: boolean;
  ui_auth_saml_sso_perm: boolean;
  ui_marketplace_perm: boolean;
}>;

const ACCOUNT_FLAG_KEYS = [
  'ui_auth_signup_perm',
  'ui_auth_magic_link_perm',
  'ui_auth_forgot_password_perm',
  'ui_auth_google_sso_perm',
  'ui_auth_github_sso_perm',
  'ui_auth_microsoft_sso_perm',
  'ui_auth_saml_sso_perm',
  'ui_marketplace_perm',
] as const;

type AccountFlagKey = (typeof ACCOUNT_FLAG_KEYS)[number];

/**
 * Evaluate every flag the AccountScreen needs in one batched parallel call.
 * Default-OFF for all keys keeps every gated UI element dark until ops flips
 * the corresponding flag in Flipt.
 */
export async function evalAccountFlags(
  inputs: AccountFlagInputs,
): Promise<AccountFlags> {
  const entries = await Promise.all(
    ACCOUNT_FLAG_KEYS.map(async (key): Promise<readonly [AccountFlagKey, boolean]> => {
      const value = await evaluateBooleanFlag(
        key,
        inputs.userId,
        inputs.flagContext,
        false,
      );
      return [key, value] as const;
    }),
  );
  return Object.fromEntries(entries) as AccountFlags;
}

/**
 * Const map of all account flags forced to `false` — useful for tests, SSR
 * fallbacks, and the all-off baseline visual snapshot.
 */
export const ALL_OFF_ACCOUNT_FLAGS: AccountFlags = {
  ui_auth_signup_perm: false,
  ui_auth_magic_link_perm: false,
  ui_auth_forgot_password_perm: false,
  ui_auth_google_sso_perm: false,
  ui_auth_github_sso_perm: false,
  ui_auth_microsoft_sso_perm: false,
  ui_auth_saml_sso_perm: false,
  ui_marketplace_perm: false,
};

/**
 * Const map of all account flags forced to `true` — useful for tests and the
 * all-on baseline visual snapshot.
 */
export const ALL_ON_ACCOUNT_FLAGS: AccountFlags = {
  ui_auth_signup_perm: true,
  ui_auth_magic_link_perm: true,
  ui_auth_forgot_password_perm: true,
  ui_auth_google_sso_perm: true,
  ui_auth_github_sso_perm: true,
  ui_auth_microsoft_sso_perm: true,
  ui_auth_saml_sso_perm: true,
  ui_marketplace_perm: true,
};
