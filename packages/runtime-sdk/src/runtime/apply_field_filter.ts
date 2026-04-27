// packages/runtime-sdk/src/runtime/apply_field_filter.ts
//
// Phase 6 — base applyFieldFilter. Removes always_exclude keys from the
// response object recursively (depth-first). always_include / opt_in are
// signalling fields consumed by Stage E codegen at description-time; runtime
// only enforces always_exclude (the privacy-relevant subset per Pass 5).

import type { FieldFilteringConfig } from '../types.js';

export function applyFieldFilter(
  raw: unknown,
  filter: FieldFilteringConfig,
): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  if (Array.isArray(raw)) return raw.map((r) => applyFieldFilter(r, filter));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (filter.always_exclude.includes(k)) continue;
    out[k] = applyFieldFilter(v, filter);
  }
  return out;
}
