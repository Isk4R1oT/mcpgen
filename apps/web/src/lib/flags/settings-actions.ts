// apps/web/src/lib/flags/settings-actions.ts
//
// Phase 2 — Settings screen flag bundle. Server-side helper that batch-
// evaluates the 13 `ui_settings_*_perm` flags and returns a typed bool map
// the Settings Client Component consumes as a prop.
//
// Mirrors the admin-actions.ts pattern (CLAUDE.md §12.4 — Flipt is the
// single source of truth for runtime toggles). Each flag's default is
// recorded in the brief; profile / security / usage / danger-delete are
// ON by default, everything else (api keys, sso, notifications,
// integrations, audit, recovery codes, danger export/transfer/pause) is
// OFF until ops flips the gate in Flipt.

import { evaluateBooleanFlag } from '@/lib/flags';
import type { FlagContext } from '@mcpgen/runtime/flags';

export interface SettingsFlagInputs {
  readonly userId: string;
  readonly flagContext: FlagContext;
}

// Default values per the brief — the BFF / Flipt manifest mirror these. When
// Flipt is unreachable evaluateBooleanFlag returns this default value.
const SETTINGS_FLAG_DEFAULTS = {
  ui_settings_profile_perm: true,
  ui_settings_security_perm: true,
  ui_settings_recovery_codes_perm: false,
  ui_settings_api_keys_perm: false,
  ui_settings_sso_section_perm: false,
  ui_settings_notifications_perm: false,
  ui_settings_integrations_perm: false,
  ui_settings_usage_perm: true,
  ui_settings_audit_perm: false,
  ui_settings_danger_export_perm: false,
  ui_settings_danger_transfer_perm: false,
  ui_settings_danger_pause_perm: false,
  ui_settings_danger_delete_perm: true,
} as const;

export type SettingsFlagKey = keyof typeof SETTINGS_FLAG_DEFAULTS;

export type SettingsFlags = Readonly<Record<SettingsFlagKey, boolean>>;

const SETTINGS_FLAG_KEYS: ReadonlyArray<SettingsFlagKey> = Object.keys(
  SETTINGS_FLAG_DEFAULTS,
) as ReadonlyArray<SettingsFlagKey>;

export async function evalSettingsFlags(
  inputs: SettingsFlagInputs,
): Promise<SettingsFlags> {
  const entries = await Promise.all(
    SETTINGS_FLAG_KEYS.map(async (key) => {
      const value = await evaluateBooleanFlag(
        key,
        inputs.userId,
        inputs.flagContext,
        SETTINGS_FLAG_DEFAULTS[key],
      );
      return [key, value] as const;
    }),
  );
  return Object.fromEntries(entries) as SettingsFlags;
}
