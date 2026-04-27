// apps/api/src/lib/logto-admin.ts
//
// CTRL-02 (Pitfall #17 subset) / D-05: Logto Management API client.
// Used by logto-mau-watch-v1 daily cron to read /api/dashboard/widgets/active-user-count.
//
// CRITICAL: audience for the MGMT API token is `https://${LOGTO_HOST}/api`
// — DISTINCT from the Phase 8 BFF M2M resource indicator
// (https://api.mcpgen.dev/m2m, used by getM2mTokenForEngine in lib/m2m-token.ts).
// The same M2M app credentials from Plan 01 are reused (no new credentials).
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-05 (verbatim)
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-05
//   - .planning/research/PITFALLS.md §#17

export interface LogtoAdminEnv {
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
}

let cachedMgmtToken: { token: string; expiresAt: number } | null = null;

async function getMgmtApiToken(env: LogtoAdminEnv): Promise<string> {
  if (cachedMgmtToken && Date.now() / 1000 < cachedMgmtToken.expiresAt) {
    return cachedMgmtToken.token;
  }
  const audience = `https://${new URL(env.LOGTO_ENDPOINT).host}/api`;
  const credentials = btoa(`${env.LOGTO_M2M_APP_ID}:${env.LOGTO_M2M_APP_SECRET}`);
  const tokenRes = await fetch(`${env.LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: audience,
      scope: 'all',
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Logto MGMT token grant failed: ${String(tokenRes.status)}`);
  }
  const body = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedMgmtToken = {
    token: body.access_token,
    expiresAt: Date.now() / 1000 + body.expires_in - 60,
  };
  return body.access_token;
}

export async function getLogtoMau(env: LogtoAdminEnv): Promise<number> {
  const token = await getMgmtApiToken(env);
  const res = await fetch(
    `${env.LOGTO_ENDPOINT}/api/dashboard/widgets/active-user-count`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Logto MAU read failed: ${String(res.status)}`);
  }
  const body = (await res.json()) as { count: number };
  return body.count;
}

export function _resetLogtoAdminCacheForTesting(): void {
  cachedMgmtToken = null;
}
