// apps/api/src/lib/flags.ts
//
// BFF flag evaluation — uses Flipt's REST evaluation API directly via fetch
// instead of the @flipt-io/flipt-client-js slim WASM build, because wrangler
// doesn't bundle the slim build's `engine.wasm` import correctly under CF
// Workers (Uncaught CompileError: WasmModuleObject::Compile expected magic
// word 00 61 73 6d, found 69 6d 70 6f).
//
// The REST API path is the same evaluation that the WASM client would do
// in-process, just with a network round-trip per call. For BFF use this is
// acceptable — flag eval happens once per request handler, latency budget
// remains <50ms over upstream (per RULES.md runtime budget).
//
// Per docs/mcpgen-feature-flags-contract.md §3.2 — when WASM bundling is
// resolved (next major @flipt-io/flipt-client-js release with proper CF
// Workers wasm helper), revert to slim+WASM in-process for ~100µs eval.

import {
  serviceEntityId,
  type FlagContext,
} from '@mcpgen/runtime/flags';

interface FliptEnv {
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
}

interface BooleanEvalResponse {
  enabled?: boolean;
}

/** Reset the singleton — only used in tests (no-op in REST-mode). */
export function _resetFliptForTests(): void {
  /* nothing to reset — REST mode is stateless */
}

/**
 * Safely evaluate a boolean flag. Always returns a Promise<boolean>; on any
 * failure (Flipt unreachable, eval error, non-200) returns the supplied
 * `defaultValue` rather than throwing. Caller provides category-appropriate
 * default per contract §7.3.
 */
export async function evaluateBoolean(
  env: FliptEnv,
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: boolean,
): Promise<boolean> {
  const url = env.FLIPT_URL ?? 'http://localhost:8090';
  const namespace = 'default';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.FLIPT_CLIENT_TOKEN !== undefined) {
    headers.Authorization = `Bearer ${env.FLIPT_CLIENT_TOKEN}`;
  }

  // Strip undefined context values to keep payload minimal.
  const ctx: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (v !== undefined) ctx[k] = v;
  }

  try {
    const res = await fetch(`${url}/evaluate/v1/boolean`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        namespaceKey: namespace,
        flagKey,
        entityId,
        context: ctx,
      }),
      signal: AbortSignal.timeout(2000), // 2s cap — flag eval must not block requests
    });
    if (!res.ok) return defaultValue;
    const data = (await res.json()) as BooleanEvalResponse;
    return typeof data.enabled === 'boolean' ? data.enabled : defaultValue;
  } catch {
    return defaultValue;
  }
}

export { serviceEntityId };
export type { FlagContext };
