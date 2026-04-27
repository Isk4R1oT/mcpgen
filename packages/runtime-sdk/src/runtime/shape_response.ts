// packages/runtime-sdk/src/runtime/shape_response.ts
//
// Phase 6 — base shapeResponse. Wave 2 ships pass-through; Phase-4 codegen
// wires the per-tool ResponseConfig (pagination + truncation + outputSchema).
// Pass 5 details in docs/mcpgen-pass-5-design.md.

import type { ResponseConfig } from '@mcpgen/ir';

export function shapeResponse(raw: unknown, _config: ResponseConfig): unknown {
  return raw;
}
