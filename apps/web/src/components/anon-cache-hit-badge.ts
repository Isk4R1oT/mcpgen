// apps/web/src/components/anon-cache-hit-badge.ts
//
// Phase M-4-INFRA — Type-only stub.
//
// The component itself was deleted in M-3 (see
// .planning/ui-rebuild-sandbox/M-2-QUARANTINE-REPORT.md). The new canon
// quality screen does not render an explicit cache-hit badge — that
// concept is folded into screen-quality.jsx layout.
//
// However, the page client at
// `app/generate/[jobId]/quality/_quality-client.tsx` still imports
// `CacheHitMetadata` as a type, and the parent `page.tsx` passes a
// `CacheHitShape` value built from the BFF response (see
// app/generate/[jobId]/quality/page.tsx readCacheHit()). M-4-INFRA is
// Forbidden from touching either file (Wave-2 owns both). Mirror the
// shape that page.tsx actually constructs so typecheck stays green;
// Wave-2 will drop the type when it rewrites the quality client.

export interface CacheHitMetadata {
  /** Quality score recorded on the original generation. */
  readonly original_quality: number;
  /** Source generation id the cache hit was served from. */
  readonly served_from: string;
}
