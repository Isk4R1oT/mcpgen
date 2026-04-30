// apps/web/src/lib/fixture-mode/index.ts
//
// Plan 07-03 — Frontend-mode router. Reads `MCPGEN_FRONTEND_MODE` env var
// (default 'live') to choose between fixture-mode SSE replay (against
// @mcpgen/engine-fixtures) and live-mode proxy to the Hono BFF.
//
// `?fixtures=true` query-string override is allowed when NODE_ENV !== 'production'
// per CONTEXT D-16 — lets a developer demo the frontend without engine
// availability during Friday demos.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-14, D-15, D-16
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 5"

export type FrontendMode = 'fixtures' | 'live';

const ENV_VAR = 'MCPGEN_FRONTEND_MODE';
const DEFAULT_MODE: FrontendMode = 'live';
const QUERY_PARAM = 'fixtures';
const BFF_ENV_VAR = 'MCPGEN_BFF_URL';
const DEFAULT_BFF_URL = 'http://localhost:8787/api/v1';

const isFixturesMode = (raw: string | undefined): boolean => raw === 'fixtures';

/**
 * Returns the effective frontend mode for the current request.
 *
 * - Reads `MCPGEN_FRONTEND_MODE` env var (default 'live').
 * - When NODE_ENV !== 'production', a `?fixtures=true` query string on `req`
 *   overrides the env var to 'fixtures' (developer convenience for Friday demos).
 *
 * Per CONTEXT D-16 + WR-06 fix: BOTH the query-string override AND the env
 * var override are HARD-blocked in production builds. A stray
 * `MCPGEN_FRONTEND_MODE=fixtures` in the deploy environment would otherwise
 * make every authenticated user see the same shared fixture deployments +
 * usage data — direct cross-tenant data isolation violation (T-7-15).
 */
export const getFrontendMode = (req?: Request): FrontendMode => {
  // WR-06 fix: in production, fixture mode is unreachable regardless of
  // env-var or query-string state.
  if (process.env.NODE_ENV === 'production') return 'live';

  const envMode = isFixturesMode(process.env[ENV_VAR]) ? 'fixtures' : DEFAULT_MODE;

  if (req === undefined) return envMode;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get(QUERY_PARAM) === 'true') return 'fixtures';
  } catch {
    // Malformed URL — ignore the override silently and fall back to env.
  }
  return envMode;
};

/**
 * BFF base URL for live-mode proxy. Default is localhost wrangler dev port.
 * Phase 8 wires the production CF Workers domain via Vercel env.
 */
export const getBffUrl = (): string => process.env[BFF_ENV_VAR] ?? DEFAULT_BFF_URL;
