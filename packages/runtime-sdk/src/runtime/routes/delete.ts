// packages/runtime-sdk/src/runtime/routes/delete.ts
//
// Phase 6 — base routeDelete implementation. Stage E codegen overrides
// per the universal-tool RoutingRule (smart routing by opts.type).

import type { DeleteOpts } from '../../types.js';

export async function routeDelete(opts: DeleteOpts): Promise<unknown> {
  return {
    opts,
    note: 'base_runtime_stage_e_overrides_per_routing_rule',
  };
}
