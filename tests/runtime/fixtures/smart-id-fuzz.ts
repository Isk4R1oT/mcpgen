// tests/runtime/fixtures/smart-id-fuzz.ts
//
// Phase 6 Wave 0 fixture — single source of truth regex used by:
//   - apps/dispatch/src/middleware/smartIdFuzz.ts (Wave 1 — runtime fuzz check)
//   - tests/runtime/smart-id-fuzz.test.ts (Wave 1 — dynamic check)
//   - F1 fixture in Phase 5 (static check; same regex)
//
// Format from packages/ir/src/types.ts SmartIdSchema:
//   "{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}"
// Where:
//   - tenant_short_id and spec_slug are lowercase alphanumeric + hyphens (collapsed via -)
//   - type ∈ { object | collection | schema }
//   - collection is alphanumeric + underscores
//   - identifier is any non-colon string (allows arbitrary upstream IDs)
//
// The regex below MUST be kept in sync with the SmartIdSchema format string.
// Cross-package alignment is asserted by tests/runtime/smart-id-fuzz.test.ts
// via Zod-introspection of @mcpgen/ir SmartIdSchema.format.

export const SMART_ID_REGEX = /^([a-z0-9][a-z0-9-]*):(object|collection|schema):([a-zA-Z_][a-zA-Z0-9_]*):(.+)$/;

export interface ParsedSmartId {
  readonly server: string;       // {tenant_short_id}-{spec_slug}
  readonly type: 'object' | 'collection' | 'schema';
  readonly collection: string;
  readonly identifier: string;
}

export function parseSmartIdFixture(id: string): ParsedSmartId | null {
  const m = SMART_ID_REGEX.exec(id);
  // m has 5 elements when matched (full match + 4 capture groups). Under
  // tsconfig `noUncheckedIndexedAccess`, the destructured slots are typed as
  // `string | undefined`; the regex guarantees they are present, so we
  // narrow explicitly rather than non-null-assert (per RULES Error Handling).
  if (!m || m.length < 5) return null;
  const server = m[1];
  const type = m[2];
  const collection = m[3];
  const identifier = m[4];
  if (server === undefined || type === undefined || collection === undefined || identifier === undefined) return null;
  if (type !== 'object' && type !== 'collection' && type !== 'schema') return null;
  return { server, type, collection, identifier };
}
