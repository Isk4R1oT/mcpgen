// apps/web/src/lib/fixture-mode/guard.ts
//
// Plan 07-03 — Production guard for fixture-mode features. Per CONTEXT D-16
// the `?fixtures=true` query-string override and the env-var-driven fixture
// SSE replay MUST be impossible to enable on a production build.
//
// Route Handlers call `isFixturesAllowed()` defensively before serving
// fixture data; in production the function returns false and the handler
// falls through to the live-mode branch.
//
// T-7-09 (Information Disclosure): a careless `MCPGEN_FRONTEND_MODE=fixtures`
// on Vercel prod would otherwise leak the demo timeline as live data.

export const isFixturesAllowed = (): boolean => process.env.NODE_ENV !== 'production';
