// packages/runtime-sdk/src/runtime/smart_id.ts
//
// Phase 6 (per D-07) — smart-ID parse/format. Single source of truth shared
// between tenant Workers AND apps/dispatch (cross-tenant fuzz check).
// Regex MUST match tests/runtime/fixtures/smart-id-fuzz.ts SMART_ID_REGEX
// (asserted in packages/runtime-sdk/tests/smart-id.test.ts).
//
// References:
//   - .planning/phases/06-runtime-plane/06-CONTEXT.md D-07
//   - .planning/phases/06-runtime-plane/06-RESEARCH.md Example 2
//   - packages/ir/src/types.ts SmartIdSchema (lines 85-90)
//   - docs/mcpgen-stage-e-design.md §6 (smart_id runtime)

import type { SmartId } from '../types.js';

// Format from packages/ir/src/types.ts SmartIdSchema:
//   "{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}"
// Where:
//   - server (tenant prefix) — lowercase alphanumeric + hyphens
//   - type ∈ { object | collection | schema }
//   - collection — alphanumeric + underscores
//   - identifier — any non-empty string
export const SMART_ID_REGEX =
  /^([a-z0-9][a-z0-9-]*):(object|collection|schema):([a-zA-Z_][a-zA-Z0-9_]*):(.+)$/;

export function parseSmartId(id: string): SmartId {
  const m = SMART_ID_REGEX.exec(id);
  if (!m || m.length < 5) throw new Error(`invalid_smart_id: ${id}`);
  const server = m[1];
  const type = m[2];
  const collection = m[3];
  const identifier = m[4];
  if (
    server === undefined ||
    type === undefined ||
    collection === undefined ||
    identifier === undefined
  ) {
    throw new Error(`invalid_smart_id: ${id}`);
  }
  if (type !== 'object' && type !== 'collection' && type !== 'schema') {
    throw new Error(`invalid_smart_id_type: ${type}`);
  }
  return { server, type, collection, identifier };
}

export function makeSmartId(parts: SmartId): string {
  return `${parts.server}:${parts.type}:${parts.collection}:${parts.identifier}`;
}
