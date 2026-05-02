// apps/web/src/lib/fixture-mode/index.ts
//
// Plan 07-03 (migrated 2026-05-03 per docs/mcpgen-feature-flags-contract.md
// §4.4 to Flipt flag `ui_frontend_fixtures_mode_ops`).
//
// Frontend-mode router. Reads the `ui_frontend_fixtures_mode_ops` boolean
// flag from Flipt to choose between fixture-mode SSE replay (against
// @mcpgen/engine-fixtures) and live-mode proxy to the Hono BFF.
//
// `?fixtures=true` query-string override is allowed when NODE_ENV !== 'production'
// per CONTEXT D-16 — lets a developer demo the frontend without engine
// availability during Friday demos.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-14, D-15, D-16
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 5"
//   - docs/mcpgen-feature-flags-contract.md §4.4 (env-var migration inventory)
//   - docs/mcpgen-feature-flags-contract.md §7.3 (defaultValue=false matches DEFAULT_MODE='live')

import { evaluateBooleanFlag } from '@/lib/flags';

export type FrontendMode = 'fixtures' | 'live';

const FLAG_KEY = 'ui_frontend_fixtures_mode_ops';
const DEFAULT_MODE: FrontendMode = 'live';
const QUERY_PARAM = 'fixtures';
const BFF_ENV_VAR = 'MCPGEN_BFF_URL';
const DEFAULT_BFF_URL = 'http://localhost:8787/api/v1';

/**
 * Returns the effective frontend mode for the current request.
 *
 * - Reads `ui_frontend_fixtures_mode_ops` from Flipt (default false → 'live').
 * - When NODE_ENV !== 'production', a `?fixtures=true` query string on `req`
 *   overrides the flag to 'fixtures' (developer convenience for Friday demos).
 *
 * Per CONTEXT D-16 + WR-06 fix: BOTH the query-string override AND the flag
 * value are HARD-blocked in production builds. A stray flag flip in
 * production would otherwise make every authenticated user see the same
 * shared fixture deployments + usage data — direct cross-tenant data
 * isolation violation (T-7-15).
 */
export const getFrontendMode = async (req?: Request): Promise<FrontendMode> => {
  // WR-06 fix: in production, fixture mode is unreachable regardless of
  // flag state or query-string override. Short-circuit BEFORE Flipt eval
  // to avoid network call cost on the prod hot path.
  if (process.env.NODE_ENV === 'production') return 'live';

  const enabled = await evaluateBooleanFlag(FLAG_KEY, 'service:web', {}, false);
  const flagMode: FrontendMode = enabled ? 'fixtures' : DEFAULT_MODE;

  if (req === undefined) return flagMode;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get(QUERY_PARAM) === 'true') return 'fixtures';
  } catch {
    // Malformed URL — ignore the override silently and fall back to flag.
  }
  return flagMode;
};

/**
 * BFF base URL for live-mode proxy. Default is localhost wrangler dev port.
 * Phase 8 wires the production CF Workers domain via Vercel env.
 *
 * Stays as env var (per contract §12.1, deploy-time URLs are config, not
 * feature flags).
 */
export const getBffUrl = (): string => process.env[BFF_ENV_VAR] ?? DEFAULT_BFF_URL;
