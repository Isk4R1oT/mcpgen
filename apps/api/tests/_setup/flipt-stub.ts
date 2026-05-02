// Vitest alias target — replaces the slim Flipt WASM client at module
// resolution time so apps/api unit tests can run in plain Node. Always
// returns the caller-supplied defaultValue.
//
// Real Flipt behavior is exercised by the smoke tests in
// packages/runtime-sdk and by manual `wrangler dev` runs.

export enum ErrorStrategy {
  Fail = 'fail',
  Fallback = 'fallback',
}

interface BoolEvalArgs {
  flagKey: string;
  entityId: string;
  context?: Record<string, string>;
}

interface BoolEvalResult {
  enabled: boolean;
}

export class FliptClient {
  static async init(): Promise<FliptClient> {
    return new FliptClient();
  }

  evaluateBoolean(_args: BoolEvalArgs): BoolEvalResult {
    return { enabled: false };
  }

  evaluateVariant(_args: BoolEvalArgs): { variantKey?: string } {
    return {};
  }
}

// `import wasmModule from '@flipt-io/flipt-client-js/engine.wasm'` — the
// alias points the .wasm specifier at this file too, so the default export
// must be importable. The stub doesn't use it.
const wasmModule = {} as unknown;
export default wasmModule;
