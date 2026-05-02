// packages/runtime-sdk/src/flags/edge.ts
//
// Edge-runtime variant of the Flipt client factory for Cloudflare Workers
// and Vercel Edge. Uses the `slim` build of @flipt-io/flipt-client-js which
// expects the WASM binary to be passed in by the consumer (rather than
// auto-loaded via fetch — which is restricted in CF isolates).
//
// CONSUMER WIRING (apps/api, apps/dispatch):
//
//   import { FliptClient } from '@mcpgen/runtime/flags/edge';
//   import wasmModule from '@flipt-io/flipt-client-js/engine.wasm';
//
//   let _client: Promise<FliptClient> | null = null;
//   function getFliptForCfWorker(env: Env) {
//     if (_client) return _client;
//     _client = FliptClient.init(
//       { url: env.FLIPT_URL, namespace: 'default', environment: env.FLIPT_ENVIRONMENT, ... },
//       { wasm: wasmModule }
//     );
//     return _client;
//   }
//
// updateInterval is NOT supported on edge (no setInterval) — refresh on
// cold start + ETag-cached re-fetch is the design. Per-isolate caching
// gives us ~30min cache horizon (typical CF isolate lifetime).

export { FliptClient } from '@flipt-io/flipt-client-js/slim';
export type {
  FlagContext,
  FliptInitConfig,
} from './index.js';
export {
  evaluateBooleanWithDefault,
  evaluateVariantWithDefault,
  serviceEntityId,
} from './index.js';
