// apps/api/src/middleware/auth.ts
//
// CTRL-02 / D-01 / D-02: Logto JWT verification middleware.
// Verifies bearer JWT against Logto JWKS via `jose`'s `createRemoteJWKSet`;
// caches JWKS for 10 min; rejects with 401 on missing/invalid/expired token.
// Distinguishes user JWTs (audience=LOGTO_BASE_URL) from M2M JWTs
// (audience=LOGTO_M2M_RESOURCE_INDICATOR) via the `aud` claim and stamps
// `c.var.auth = { isM2M, ... }` for downstream handlers.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-01, D-02
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-01, §10
//   - infrastructure/logto/README.md (env-var contract; LOGTO_M2M_* added Phase 8)

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createMiddleware } from 'hono/factory';

let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(env: { LOGTO_ENDPOINT: string }) {
  if (!jwksResolver) {
    jwksResolver = createRemoteJWKSet(
      new URL(`${env.LOGTO_ENDPOINT}/oidc/jwks`),
      { cooldownDuration: 30_000, cacheMaxAge: 600_000 },
    );
  }
  return jwksResolver;
}

export function _resetJwksCacheForTesting(): void {
  jwksResolver = null;
}

export interface AuthContext {
  subject: string;
  organizationId: string | null;
  isM2M: boolean;
  scopes: ReadonlyArray<string>;
  raw: JWTPayload;
}

export interface AuthEnv {
  LOGTO_ENDPOINT: string;
  LOGTO_BASE_URL: string;
  LOGTO_M2M_RESOURCE_INDICATOR: string;
}

export const authMiddleware = createMiddleware<{
  Bindings: AuthEnv;
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const authz = c.req.header('Authorization');
  if (!authz?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', reason: 'missing_bearer' }, 401);
  }
  const token = authz.slice(7);
  try {
    const issuer = `${c.env.LOGTO_ENDPOINT}/oidc`;
    const { payload } = await jwtVerify(token, getJwks(c.env), {
      issuer,
      audience: [c.env.LOGTO_BASE_URL, c.env.LOGTO_M2M_RESOURCE_INDICATOR],
    });
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const isM2M = aud === c.env.LOGTO_M2M_RESOURCE_INDICATOR;
    c.set('auth', {
      subject: payload.sub ?? '',
      organizationId: (payload.organization_id as string | undefined) ?? null,
      isM2M,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      raw: payload,
    });
    await next();
    return;
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'jwt_verify_failed';
    return c.json({ error: 'unauthorized', reason: code }, 401);
  }
});

export const requireM2M = createMiddleware<{ Variables: { auth: AuthContext } }>(async (c, next) => {
  const auth = c.var.auth;
  if (!auth?.isM2M) {
    return c.json({ error: 'forbidden', reason: 'm2m_required' }, 403);
  }
  await next();
});
