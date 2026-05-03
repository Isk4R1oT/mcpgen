// apps/web/src/lib/flags/auth-method.ts
//
// Server-side flag-gate helper for the embedded-auth API routes
// (apps/web/src/app/api/auth/embedded/*). Each handler calls
// `assertAuthMethodEnabled('ui_auth_password_perm')` (or the relevant
// flag key) at the very top — when the flag is OFF the helper raises
// AuthMethodDisabledError and the route returns 404 / 403 / 501 per the
// task contract.
//
// Why a helper (vs inlining each check):
//   - keeps the per-route handlers readable
//   - centralizes the "anonymous entityId" convention so flag eval logs
//     are uniform across the auth surface
//   - lets us swap the eval source (Flipt → cache → segment override)
//     without touching the routes
//
// References:
//   - apps/web/src/lib/flags/index.ts (evaluateBooleanFlag)
//   - docs/mcpgen-feature-flags-contract.md §3 (flag-eval recipe)
//   - packages/feature-flags/default/features.yaml ui_auth_*

import { evaluateBooleanFlag } from '@/lib/flags';

/**
 * Thrown when an embedded-auth route is called but its underlying flag
 * is OFF. Each handler catches this and returns the documented status
 * code (404 for sign-in/magic-link/forgot-password, 403 for sign-up).
 */
export class AuthMethodDisabledError extends Error {
  readonly flagKey: string;
  constructor(flagKey: string) {
    super(`auth method disabled: flag "${flagKey}" is OFF`);
    this.name = 'AuthMethodDisabledError';
    this.flagKey = flagKey;
  }
}

/**
 * Evaluate the given Flipt boolean flag against an anonymous entity
 * (auth routes are pre-session — there's no user.id yet) and throw
 * AuthMethodDisabledError when the flag is OFF.
 *
 * Default value is `false` per the feature-flags contract §11
 * (anti-pattern #3 "no fail-open auth"): if Flipt is unreachable the
 * route is closed.
 */
export async function assertAuthMethodEnabled(flagKey: string): Promise<void> {
  const enabled = await evaluateBooleanFlag(flagKey, 'anonymous', {}, false);
  if (!enabled) {
    throw new AuthMethodDisabledError(flagKey);
  }
}
