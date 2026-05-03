// apps/web/src/app/settings/page.tsx
//
// Phase 2 — Settings route.
//
// Server Component shell that:
//   1. Resolves the Logto session (middleware also protects `/settings/*`,
//      this is belt-and-suspenders — same pattern as `/dashboard`).
//   2. Evaluates the 13 `ui_settings_*_perm` flags via the Flipt client.
//   3. Renders the production Settings client island with all the flag
//      booleans + Logto session claims + canonical defaults forwarded
//      as props.
//
// The Settings screen pulls its real data from BFF clients on the client
// side (useUsageHourly / useDashboardSummary). We do NOT pre-fetch them
// here because the Logto cookie cannot be forwarded from RSC fetches and
// the client islands already do the right thing on mount (matches
// dashboard-list pattern).

import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import {
  type SettingsFlags as SettingsFlagsProp,
  type SettingsProfileData,
  type SettingsProps,
} from '@/components/screens/settings/settings';
import { evalSettingsFlags } from '@/lib/flags/settings-actions';
import { logtoConfig } from '@/lib/logto/client';

import SettingsClient from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage(): Promise<ReactElement> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    redirect('/sign-in?redirect_to=/settings');
  }

  // ─── Flag eval ──────────────────────────────────────────────────────────
  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = {
    user_id: userId,
    email_domain: emailDomain,
  };

  const evaluatedFlags = await evalSettingsFlags({ userId, flagContext });

  const flags: SettingsFlagsProp = {
    profile: evaluatedFlags.ui_settings_profile_perm,
    security: evaluatedFlags.ui_settings_security_perm,
    recoveryCodes: evaluatedFlags.ui_settings_recovery_codes_perm,
    apiKeys: evaluatedFlags.ui_settings_api_keys_perm,
    sso: evaluatedFlags.ui_settings_sso_section_perm,
    notifications: evaluatedFlags.ui_settings_notifications_perm,
    integrations: evaluatedFlags.ui_settings_integrations_perm,
    usage: evaluatedFlags.ui_settings_usage_perm,
    audit: evaluatedFlags.ui_settings_audit_perm,
    dangerExport: evaluatedFlags.ui_settings_danger_export_perm,
    dangerTransfer: evaluatedFlags.ui_settings_danger_transfer_perm,
    dangerPause: evaluatedFlags.ui_settings_danger_pause_perm,
    dangerDelete: evaluatedFlags.ui_settings_danger_delete_perm,
  };

  // ─── Logto-claim-derived props ──────────────────────────────────────────
  const userName = typeof claims?.name === 'string' ? claims.name : '';
  const userEmail = typeof claims?.email === 'string' ? claims.email : '';

  // Profile metadata defaults — the client component refines these by hitting
  // GET /api/v1/account/profile after mount. We pass safe blanks here so the
  // initial render never contains a canon mock literal (no "Europe/Moscow",
  // no "shipping payments infra at dolla", etc.).
  const profile: SettingsProfileData = {
    handle: '',
    timezone: 'Europe/London',
    language: 'en',
    bio: '',
  };

  // Plan tier — until the BFF surfaces Stripe-resolved plan we default to
  // 'free'. The Settings screen uses this for the plan badge / SSO mode
  // gate / usage progress cap. Real wiring lands when the
  // `usePlan()` stub in apps/web/src/lib/api/billing.ts is unstubbed.
  const props: Omit<SettingsProps,
    'onBack' | 'onDashboard' | 'onMarketplace' | 'onBilling'
  > = {
    userName,
    userEmail,
    plan: 'free',
    profile,
    sessions: [],
    sessionsUnavailable: true,
    twoFactorMode: 'off',
    flags,
  };

  return <SettingsClient initialProps={props} />;
}
