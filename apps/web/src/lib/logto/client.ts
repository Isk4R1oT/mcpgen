// apps/web/src/lib/logto/client.ts
//
// Plan 07-02 — Logto Cloud SDK config wrapper. Exports `logtoConfig` (a
// `LogtoNextConfig`) consumed by:
//   - apps/web/src/middleware.ts (auth guard on /dashboard/*)
//   - apps/web/src/providers/logto-session.tsx
//   - apps/web/src/app/api/auth/logto/{sign-in,sign-up,callback,sign-out}/route.ts
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples" Logto config
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-17 / D-18 / D-19
//
// Behavior per CONTEXT D-17 + Phase-1 D-19 pattern (empty-DSN-tolerant):
//   - The module ALWAYS evaluates cleanly with empty placeholders. Throwing
//     at module load would break `next build` in CI when LOGTO_* env vars
//     aren't supplied (matches Phase-1 D-19 Sentry empty-DSN-tolerant pattern).
//   - Dev / test (NODE_ENV !== 'production'): missing required env →
//     console.warn so engineers notice during local dev.
//   - Production (NODE_ENV === 'production') + non-build runtime: call
//     `assertLogtoConfigValid()` from inside the route handlers if you want
//     fail-fast at request time. Plan 07-02 doesn't call it (Vercel sets the
//     env vars before serving traffic); kept as an opt-in for Phase 9 wiring.

import type { LogtoNextConfig } from '@logto/next';

const REQUIRED_VARS = [
  'LOGTO_ENDPOINT',
  'LOGTO_APP_ID',
  'LOGTO_APP_SECRET',
  'LOGTO_BASE_URL',
  'LOGTO_COOKIE_SECRET',
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

function readEnv(name: RequiredVar): string {
  return process.env[name] ?? '';
}

function missingVars(): RequiredVar[] {
  return REQUIRED_VARS.filter((v) => readEnv(v).length === 0);
}

// Build-time-tolerant cookieSecret default. Logto's `CookieStorage` constructor
// rejects empty strings (`Either sessionWrapper or encryptionKey must be
// provided`). To keep `next build` green when env vars are absent (CI / fresh
// clones), we substitute a 32-byte placeholder. Real deploys MUST set
// LOGTO_COOKIE_SECRET (Vercel env) — the placeholder produces invalid sessions
// at runtime so misconfiguration is loud-fail at first auth attempt.
const PLACEHOLDER_COOKIE_SECRET = 'mcpgen-build-placeholder-do-not-use-in-prod-x';

function buildConfig(): LogtoNextConfig {
  const missing = missingVars();
  const isProduction = process.env['NODE_ENV'] === 'production';
  if (missing.length > 0 && !isProduction) {
    // eslint-disable-next-line no-console
    console.warn(
      `[logto/client] missing required env vars: ${missing.join(', ')} — using empty placeholders (dev only).`,
    );
  }
  const cookieSecret = readEnv('LOGTO_COOKIE_SECRET');
  return {
    appId: readEnv('LOGTO_APP_ID'),
    appSecret: readEnv('LOGTO_APP_SECRET'),
    endpoint: readEnv('LOGTO_ENDPOINT'),
    baseUrl: readEnv('LOGTO_BASE_URL'),
    cookieSecret: cookieSecret.length > 0 ? cookieSecret : PLACEHOLDER_COOKIE_SECRET,
    cookieSecure: process.env['NODE_ENV'] === 'production',
  };
}

export const logtoConfig: LogtoNextConfig = buildConfig();

/**
 * Explicit redirect URI passed to `signIn()` / sign-up flows.
 *
 * The `@logto/next` SDK (4.x) defaults to `${baseUrl}/callback` when no
 * `redirectUri` is provided to `signIn()`. Our callback handler is mounted
 * at `/api/auth/logto/callback`, NOT `/callback` — so without this override
 * Logto Cloud rejects the auth request with `oidc.invalid_redirect_uri` 400
 * (the SDK default is not in the allowlist). This constant must match the
 * value registered in Logto Cloud → Applications → MCPGen Web → Redirect URIs.
 *
 * Reported by `.planning/ui-rebuild-sandbox/AUTH-DIAGNOSIS.md` (root cause).
 */
export const LOGTO_REDIRECT_URI: string = `${readEnv('LOGTO_BASE_URL') || 'http://localhost:3000'}/api/auth/logto/callback`;

/**
 * Optional opt-in fail-fast guard for production request-time assertions.
 * Plan 07-02 does not invoke this (Vercel sets the env vars before serving);
 * Phase 9 may wire it inside the auth route handlers if desired.
 */
export function assertLogtoConfigValid(): void {
  const missing = missingVars();
  if (missing.length > 0) {
    throw new Error(
      `Logto config: missing required env vars: ${missing.join(', ')}`,
    );
  }
}
