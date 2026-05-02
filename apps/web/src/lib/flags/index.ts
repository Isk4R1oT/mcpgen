// apps/web/src/lib/flags/index.ts
//
// Web app's Flipt client wrapper with automatic Sentry feature-flag
// correlation. Per docs/mcpgen-feature-flags-contract.md §9.1 — every flag
// eval result is attached to the current Sentry scope/event so error
// reports include the flag state at the time of the failure.
//
// Usage (server components):
//   const enabled = await evaluateBooleanFlag(
//     'pass5_response_format_param_rollout',
//     user.id,
//     { plan: user.plan },
//     false,
//   );
//
// Usage (client components): bootstrap evaluations server-side and pass as
// props. Never put a server token (`FLIPT_CLIENT_TOKEN`) in NEXT_PUBLIC_*.

import * as Sentry from '@sentry/nextjs';
import {
  getFlipt,
  evaluateBooleanWithDefault,
  evaluateVariantWithDefault,
  type FlagContext,
} from '@mcpgen/runtime/flags';

const FLIPT_URL = process.env.FLIPT_URL ?? 'http://localhost:8090';
const FLIPT_ENVIRONMENT = process.env.FLIPT_ENVIRONMENT ?? 'default';
const FLIPT_CLIENT_TOKEN = process.env.FLIPT_CLIENT_TOKEN;

async function client() {
  return getFlipt({
    url: FLIPT_URL,
    namespace: 'default',
    environment: FLIPT_ENVIRONMENT,
    clientToken: FLIPT_CLIENT_TOKEN,
  });
}

/**
 * Evaluate a boolean flag, attach result to Sentry scope, return the value.
 * Sentry's feature-flags integration buffers the (key, value) pair; if a
 * subsequent error happens, the buffered flag state lands on the error
 * event automatically (see Sentry v10 featureFlagsIntegration).
 */
export async function evaluateBooleanFlag(
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: boolean,
): Promise<boolean> {
  const c = await client();
  const value = evaluateBooleanWithDefault(c, flagKey, entityId, context, defaultValue);
  reportFlagToSentry(flagKey, value);
  return value;
}

/**
 * Evaluate a variant flag with the same Sentry correlation behavior.
 */
export async function evaluateVariantFlag(
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: string,
): Promise<string> {
  const c = await client();
  const value = evaluateVariantWithDefault(c, flagKey, entityId, context, defaultValue);
  reportFlagToSentry(flagKey, value);
  return value;
}

function reportFlagToSentry(flagKey: string, value: boolean | string): void {
  // Sentry v10 has featureFlagsIntegration which is the preferred path; we
  // also call setTag as a fallback so the data shows on alerts even before
  // the integration is wired in instrumentation.ts (it's added below).
  try {
    Sentry.setTag(`flag.${flagKey}`, String(value));
    const client = Sentry.getClient();
    if (client === undefined) return;
    type FlagsIntegration = {
      addFeatureFlag?: (name: string, value: boolean | string) => void;
    };
    const integration = client.getIntegrationByName?.('FeatureFlags') as
      | FlagsIntegration
      | undefined;
    integration?.addFeatureFlag?.(flagKey, value);
  } catch {
    // Sentry not initialized in this environment (likely a test) — fine.
  }
}
