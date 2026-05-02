// apps/api/src/lib/flags.ts
//
// BFF-side Flipt client. Uses the slim WASM build of @flipt-io/flipt-client-js
// because apps/api runs on Cloudflare Workers / Vercel Edge runtimes which
// restrict how WASM is loaded. The consumer (this module) is responsible for
// providing the WASM binary explicitly via the `wasm` option.
//
// Module-level Promise<FliptClient> caching: in CF Workers each isolate
// reuses this Promise across requests for ~30min, amortising the WASM init
// cost. ETag-based refresh keeps state fresh without setInterval (which CF
// Workers do not support).
//
// Per docs/mcpgen-feature-flags-contract.md §3.2.

import { FliptClient, ErrorStrategy } from '@flipt-io/flipt-client-js/slim';
// @ts-expect-error — wrangler / vite both support importing .wasm modules,
// but @types resolution does not provide a Module type for them. Runtime
// surfaces a WebAssembly.Module instance which the slim Flipt client accepts.
import wasmModule from '@flipt-io/flipt-client-js/engine.wasm';

import {
  evaluateBooleanWithDefault,
  serviceEntityId,
  type FlagContext,
} from '@mcpgen/runtime/flags';

interface FliptEnv {
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
}

let _clientPromise: Promise<FliptClient> | null = null;

function getClient(env: FliptEnv): Promise<FliptClient> {
  if (_clientPromise !== null) return _clientPromise;
  const url = env.FLIPT_URL ?? 'http://localhost:8090';
  const environment = env.FLIPT_ENVIRONMENT ?? 'default';
  const baseOpts = {
    namespace: 'default',
    environment,
    url,
    errorStrategy: ErrorStrategy.Fallback,
  };
  const initOptions =
    env.FLIPT_CLIENT_TOKEN !== undefined
      ? { ...baseOpts, authentication: { clientToken: env.FLIPT_CLIENT_TOKEN } }
      : baseOpts;
  _clientPromise = FliptClient.init(initOptions, { wasm: wasmModule }).catch((err) => {
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
 * Safely evaluate a boolean flag. Always returns a Promise<boolean>; on any
 * failure (Flipt unreachable, init error, eval error) returns the supplied
 * `defaultValue` rather than throwing. Caller is responsible for providing
 * a category-appropriate default per contract §7.3.
 */
export async function evaluateBoolean(
  env: FliptEnv,
  flagKey: string,
  entityId: string,
  context: FlagContext,
  defaultValue: boolean,
): Promise<boolean> {
  try {
    const client = await getClient(env);
    return evaluateBooleanWithDefault(client, flagKey, entityId, context, defaultValue);
  } catch {
    return defaultValue;
  }
}

export { serviceEntityId };
export type { FlagContext };
