// packages/runtime-sdk/src/runtime/routes/list_objects.ts
//
// Phase 6 — base routeListObjects implementation. Stage E codegen overrides
// per the universal-tool RoutingRule.

import type { ListObjectsOpts } from '../../types.js';

export async function routeListObjects(
  opts: ListObjectsOpts,
): Promise<unknown> {
  return {
    opts,
    objects: [],
    note: 'base_runtime_stage_e_overrides_per_routing_rule',
  };
}
