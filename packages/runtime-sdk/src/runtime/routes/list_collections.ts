// packages/runtime-sdk/src/runtime/routes/list_collections.ts
//
// Phase 6 — base routeListCollections implementation. Stage E codegen overrides
// per the universal-tool RoutingRule.

import type { ListCollectionsOpts } from '../../types.js';

export async function routeListCollections(
  opts: ListCollectionsOpts,
): Promise<unknown> {
  return {
    opts,
    collections: [],
    note: 'base_runtime_stage_e_overrides_per_routing_rule',
  };
}
