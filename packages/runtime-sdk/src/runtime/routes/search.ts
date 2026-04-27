// packages/runtime-sdk/src/runtime/routes/search.ts
//
// Phase 6 — base routeSearch implementation. The default body returns a
// structured "deferred to Stage E codegen" envelope: Phase-4 codegen
// overrides this method per the per-tool RoutingRule before bundling.
//
// For apps/dispatch-sample, the hand-coded handlers in apps/dispatch-sample/src/tools/
// call into Runtime methods, but the Phase-1 sample currently stubs them
// explicitly — Wave 2 keeps the per-tool override pattern.

import type { RouteSearchOpts } from '../../types.js';

export async function routeSearch(
  query: string,
  opts: RouteSearchOpts,
): Promise<unknown> {
  return {
    query,
    opts,
    results: [],
    note: 'base_runtime_stage_e_overrides_per_routing_rule',
  };
}
