// packages/runtime-sdk/src/flags/index.ts
//
// Flipt v2 client factory for MCPGen platform services (apps/web, apps/api,
// apps/dispatch, apps/cli). Generated tenant Workers DO NOT use Flipt
// (immutability invariant — see docs/mcpgen-feature-flags-contract.md §3.6).
//
// Two builds available depending on runtime:
//   - default: '@flipt-io/flipt-client-js' (Node, browser with bundler)
//   - slim:    '@flipt-io/flipt-client-js/slim' (CF Workers, Vercel Edge)
//
// CF Workers / Vercel Edge consumers should import from
// '@mcpgen/runtime/flags/edge' instead of this module.
//
// All eval calls are SYNCHRONOUS after init — the WASM engine evaluates
// in-memory in ~100µs. Network round-trip happens only on `refresh()`.

import { FliptClient, ErrorStrategy } from '@flipt-io/flipt-client-js';

export interface FliptInitConfig {
  url: string;
  environment: string; // 'default' | 'staging' | 'production'
  namespace: string; // usually 'default'
  clientToken: string | undefined;
  /** Auto-refresh interval in seconds (Node-only; ignored on edge runtimes). */
  updateInterval?: number;
}

export interface FlagContext {
  // String-only context per Flipt API. Numbers stringified by caller.
  // Whitelisted keys per contract §7.2:
  plan?: string;
  country?: string;
  email_domain?: string;
  cli_version?: string;
  os?: string;
  org_id?: string;
  env?: string;
  beta_opt_in?: string;
  [key: string]: string | undefined;
}

let _clientPromise: Promise<FliptClient> | null = null;

/**
 * Returns a singleton Flipt client. Call once at module init or first
 * request; subsequent calls return the cached instance.
 *
 * Failure mode: if Flipt server is unreachable, `errorStrategy: 'fallback'`
 * makes the SDK return last-known-good state. On cold start with no cached
 * state, `evaluateBoolean*Default` helpers below return the `defaultValue`
 * argument.
 */
export function getFlipt(config: FliptInitConfig): Promise<FliptClient> {
  if (_clientPromise !== null) return _clientPromise;

  const initOptions: Parameters<typeof FliptClient.init>[0] = {
    namespace: config.namespace,
    environment: config.environment,
    url: config.url,
    updateInterval: config.updateInterval ?? 30,
    errorStrategy: ErrorStrategy.Fallback,
  };
  if (config.clientToken !== undefined) {
    initOptions.authentication = { clientToken: config.clientToken };
  }
  _clientPromise = FliptClient.init(initOptions).catch((err) => {
    // Reset so next call can retry, then re-throw so caller knows init failed.
    _clientPromise = null;
    throw err;
  });

  return _clientPromise;
}

/** Reset the singleton — only used in tests. */
export function _resetFliptForTests(): void {
  _clientPromise = null;
}

/**
 * Safe boolean evaluation. Catches any SDK error and returns
 * `defaultValue`. Use this in critical paths where a Flipt outage must NOT
 * break the request.
 */
export function evaluateBooleanWithDefault(
  client: FliptClient,
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: boolean,
): boolean {
  try {
    const result = client.evaluateBoolean({
      flagKey,
      entityId,
      context: stripUndefined(context),
    });
    return result.enabled;
  } catch {
    return defaultValue;
  }
}

/**
 * Safe variant evaluation. Catches any SDK error and returns
 * `defaultValue`.
 */
export function evaluateVariantWithDefault(
  client: FliptClient,
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: string,
): string {
  try {
    const result = client.evaluateVariant({
      flagKey,
      entityId,
      context: stripUndefined(context),
    });
    return result.variantKey ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function stripUndefined(ctx: FlagContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Convenience entityId for service-to-service calls without a user context.
 * Per contract §7.1 — never use null/empty entityId.
 */
export function serviceEntityId(serviceName: string): string {
  return `service:${serviceName}`;
}

export type { FliptClient };
