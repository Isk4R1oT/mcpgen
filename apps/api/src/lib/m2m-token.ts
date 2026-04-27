// apps/api/src/lib/m2m-token.ts
//
// D-02: Cached M2M token for BFF→engine internal calls (cancel-generation, parse).
// Module-level cache; refresh when within 60s of expiry.
// NEVER log the token; only log expiresAt for debug.

interface M2mEnv {
  LOGTO_ENDPOINT: string;
  LOGTO_M2M_APP_ID: string;
  LOGTO_M2M_APP_SECRET: string;
  LOGTO_M2M_RESOURCE_INDICATOR: string;
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getM2mTokenForEngine(env: M2mEnv): Promise<string> {
  if (cached && Date.now() / 1000 < cached.expiresAt) return cached.token;

  const credentials = btoa(`${env.LOGTO_M2M_APP_ID}:${env.LOGTO_M2M_APP_SECRET}`);
  const res = await fetch(`${env.LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: env.LOGTO_M2M_RESOURCE_INDICATOR,
      scope: 'all',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Logto M2M token grant failed: ${String(res.status)} ${text}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: Date.now() / 1000 + body.expires_in - 60 };
  return cached.token;
}

export function _resetM2mCacheForTesting(): void { cached = null; }
