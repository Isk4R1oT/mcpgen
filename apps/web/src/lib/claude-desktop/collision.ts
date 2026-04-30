// apps/web/src/lib/claude-desktop/collision.ts
//
// Plan 07-03 — Server-name collision parser. The BFF returns 409 when a
// `{tenant_short_id}-{spec_slug}` Worker name already exists for that tenant
// (Pitfall #30); the response body carries `existing_name` and `suggested_name`.
//
// We expose a Zod-validated parser plus a client-side fallback suggester for
// the case where the BFF didn't ship a suggestion (defensive).

import { z } from 'zod';

export interface CollisionResponse {
  error: 'server_name_collision';
  existing_name: string;
  suggested_name: string;
}

const CollisionResponseSchema = z.object({
  error: z.literal('server_name_collision'),
  existing_name: z.string().min(1),
  suggested_name: z.string().min(1),
});

export const parseCollisionResponse = (body: unknown): CollisionResponse | null => {
  const parsed = CollisionResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data;
};

/**
 * Suffixes `currentName` with `-2`, `-3`, … until the result is not in
 * `existingNames`. Used as a defensive fallback when the BFF didn't supply a
 * suggestion in the 409 body.
 */
export const buildSuggestedName = (
  currentName: string,
  existingNames: ReadonlyArray<string>,
): string => {
  const taken = new Set(existingNames);
  if (!taken.has(currentName)) return currentName;
  let n = 2;
  while (taken.has(`${currentName}-${n}`)) n += 1;
  return `${currentName}-${n}`;
};
