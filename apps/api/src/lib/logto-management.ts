// apps/api/src/lib/logto-management.ts
//
// Server-side Logto Management API client used by the /account routes.
// Mirrors the Node-side client in apps/web/src/lib/logto/experience.ts but
// runs in the BFF (Cloudflare Workers / Hono) and pulls the M2M creds from
// `c.env` (CF Workers binding) instead of process.env.
//
// Required CF Worker env bindings (declared in apps/api/src/index.ts):
//   LOGTO_ENDPOINT
//   LOGTO_M2M_APP_ID
//   LOGTO_M2M_APP_SECRET
//
// Reference: https://openapi.logto.io/group/endpoint-users

export interface LogtoEnv {
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
}

export class LogtoManagementError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'LogtoManagementError';
    this.status = status;
    this.code = code;
  }
}

// Process-local M2M token cache. CF Workers warm-instance reuse benefits
// from this; cold starts grab a fresh token.
interface CachedToken {
  token: string;
  expiresAt: number;
}
let cached: CachedToken | null = null;
const TTL_MS = 50 * 60 * 1000; // 50 min

export function _resetLogtoMgmtCacheForTesting(): void {
  cached = null;
}

async function getM2MToken(env: LogtoEnv): Promise<string> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.token;
  if (env.LOGTO_ENDPOINT.length === 0) {
    throw new LogtoManagementError(500, 'logto_endpoint_missing', 'LOGTO_ENDPOINT is not set');
  }
  if (env.LOGTO_M2M_APP_ID.length === 0 || env.LOGTO_M2M_APP_SECRET.length === 0) {
    throw new LogtoManagementError(500, 'logto_m2m_missing', 'LOGTO_M2M_APP_ID/SECRET is not set');
  }
  const tenantHost = env.LOGTO_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = `https://${tenantHost}/api`;
  const credentials = btoa(`${env.LOGTO_M2M_APP_ID}:${env.LOGTO_M2M_APP_SECRET}`);
  const res = await fetch(`${env.LOGTO_ENDPOINT.replace(/\/$/, '')}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: audience,
      scope: 'all',
    }),
  });
  if (!res.ok) {
    throw new LogtoManagementError(res.status, 'm2m_token_failed', `Logto M2M token grant failed: ${String(res.status)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (typeof json.access_token !== 'string') {
    throw new LogtoManagementError(500, 'm2m_token_no_token', 'Logto returned empty access_token');
  }
  cached = { token: json.access_token, expiresAt: Date.now() + TTL_MS };
  return json.access_token;
}

// ─── Public types — wire shape for /account routes ──────────────────────────

export interface AccountProfile {
  name: string;
  email: string;
  handle: string;
  timezone: string;
  language: string;
  bio: string;
  avatar_url: string;
}

export interface AccountSession {
  id: string;
  device: string;
  ip: string;
  location: string;
  last_active: string;
  current: boolean;
}

// ─── User read ───────────────────────────────────────────────────────────────

interface RawLogtoUser {
  id?: string;
  username?: string | null;
  primaryEmail?: string | null;
  name?: string | null;
  avatar?: string | null;
  customData?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
}

function readProfileField(user: RawLogtoUser, key: string): string {
  const v = user.profile?.[key];
  return typeof v === 'string' ? v : '';
}

function readCustomDataField(user: RawLogtoUser, key: string): string {
  const v = user.customData?.[key];
  return typeof v === 'string' ? v : '';
}

export async function getUserProfile(env: LogtoEnv, logtoUserId: string): Promise<AccountProfile> {
  const token = await getM2MToken(env);
  const base = env.LOGTO_ENDPOINT.replace(/\/$/, '');
  const res = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new LogtoManagementError(res.status, 'user_fetch_failed', `Logto user fetch failed: ${String(res.status)}`);
  }
  const user = (await res.json()) as RawLogtoUser;
  return {
    name: typeof user.name === 'string' ? user.name : '',
    email: typeof user.primaryEmail === 'string' ? user.primaryEmail : '',
    handle: typeof user.username === 'string' ? user.username : '',
    timezone: readCustomDataField(user, 'timezone'),
    language: readCustomDataField(user, 'language'),
    bio: readProfileField(user, 'bio'),
    avatar_url: typeof user.avatar === 'string' ? user.avatar : '',
  };
}

// ─── User update ─────────────────────────────────────────────────────────────

export interface ProfilePatch {
  // `| undefined` keeps the type assignable from a zod-parsed optional
  // payload under `exactOptionalPropertyTypes: true`. Each writer checks
  // `=== undefined` before forwarding, so the upstream Logto PATCH never
  // sees a literal undefined.
  name?: string | undefined;
  handle?: string | undefined;
  timezone?: string | undefined;
  language?: string | undefined;
  bio?: string | undefined;
  avatar_url?: string | undefined;
  // email change is intentionally out of scope here — Logto requires
  // verification flow for primaryEmail mutation; route 400s if requested.
}

export async function updateUserProfile(
  env: LogtoEnv,
  logtoUserId: string,
  patch: ProfilePatch,
): Promise<AccountProfile> {
  const token = await getM2MToken(env);
  const base = env.LOGTO_ENDPOINT.replace(/\/$/, '');

  // PATCH /api/users/:id — top-level fields (name, username, avatar);
  // PATCH /api/users/:id/custom-data — for customData (timezone/language);
  // profile.bio goes through PATCH /api/users/:id/profile.

  const topLevel: Record<string, string> = {};
  if (patch.name !== undefined) topLevel['name'] = patch.name;
  if (patch.handle !== undefined) topLevel['username'] = patch.handle;
  if (patch.avatar_url !== undefined) topLevel['avatar'] = patch.avatar_url;

  if (Object.keys(topLevel).length > 0) {
    const r = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(topLevel),
    });
    if (!r.ok) {
      throw new LogtoManagementError(r.status, 'user_patch_failed', `user PATCH failed: ${String(r.status)}`);
    }
  }

  if (patch.timezone !== undefined || patch.language !== undefined) {
    const customData: Record<string, string> = {};
    if (patch.timezone !== undefined) customData['timezone'] = patch.timezone;
    if (patch.language !== undefined) customData['language'] = patch.language;
    const r = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}/custom-data`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customData }),
    });
    if (!r.ok) {
      throw new LogtoManagementError(r.status, 'custom_data_patch_failed', `customData PATCH failed: ${String(r.status)}`);
    }
  }

  if (patch.bio !== undefined) {
    const r = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bio: patch.bio }),
    });
    if (!r.ok) {
      throw new LogtoManagementError(r.status, 'profile_patch_failed', `profile PATCH failed: ${String(r.status)}`);
    }
  }

  return getUserProfile(env, logtoUserId);
}

// ─── User delete ─────────────────────────────────────────────────────────────

export async function deleteUser(env: LogtoEnv, logtoUserId: string): Promise<void> {
  const token = await getM2MToken(env);
  const base = env.LOGTO_ENDPOINT.replace(/\/$/, '');
  const res = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new LogtoManagementError(res.status, 'user_delete_failed', `user DELETE failed: ${String(res.status)}`);
  }
}
