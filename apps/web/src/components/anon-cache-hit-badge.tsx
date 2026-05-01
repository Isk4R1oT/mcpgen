// apps/web/src/components/anon-cache-hit-badge.tsx
//
// Plan 09.1-07 — Cache-hit metadata badge per CONTEXT D-05 + D-10.
// Renders ABOVE the locked QualityReport screen when the SSE event 0
// metadata reports `cache_hit: true`. Surfaces the prior generation's
// quality score so the anon user understands why their result was instant.
//
// Banner copy follows CONTEXT D-10:
//   "Generated from cache (verified — quality {N.N} from prior generation)"
//
// Visibility:
//   - cacheHit undefined / null → null
//   - cacheHit present          → render the badge

'use client';

import type { ReactElement } from 'react';

export interface CacheHitMetadata {
  /** Quality score (F2 average) of the cached generation. CONTEXT D-05 §
   *  "served only when ≥ verified" — value MUST be ≥ 4.0. */
  readonly original_quality: number;
  /** ISO-8601 timestamp of the cached generation's creation. */
  readonly served_from: string;
}

export interface AnonCacheHitBadgeProps {
  /** SSE event 0 metadata, when the BFF replays a cached generation. */
  readonly cacheHit?: CacheHitMetadata | null;
}

export function AnonCacheHitBadge({ cacheHit }: AnonCacheHitBadgeProps): ReactElement | null {
  if (cacheHit === undefined || cacheHit === null) return null;

  const formatted = cacheHit.original_quality.toFixed(1);

  return (
    <div
      data-testid="cache-hit-badge"
      role="status"
      aria-label="cache hit"
      className="mc-mono"
      style={{
        maxWidth: 1180,
        margin: '12px auto 0',
        padding: '8px 14px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--paper-alt, transparent)',
        color: 'var(--text)',
        fontSize: 12.5,
      }}
    >
      Generated from cache (verified — quality {formatted} from prior generation)
    </div>
  );
}
