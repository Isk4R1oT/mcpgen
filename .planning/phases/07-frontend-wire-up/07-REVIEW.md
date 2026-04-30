---
status: issues_found
phase: 07-frontend-wire-up
scope: wave-2-and-3
reviewed: 2026-04-30
depth: standard
files_reviewed: 26
diff_base: aaa17686d6b051e1a950e7774e30299f5711319e
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
---

# Phase 07 Wave 2+3 — Code Review

## Scope

Reviewed the Phase 07 Wave 2 (07-04 live-mode revalidation) + Wave 3 (07-05 dashboard + deploy CTA) wire-up. Skipped Wave 1 files (07-01..07-03, 07-06) — already reviewed during their own sessions.

Files: 26 source/test files updated in this run. Live-mode Route Handler proxies, Shiki Server Component highlighting, dashboard route + DeployWrapper integration, BFF dashboard-client, e2e tests.

## Summary

Overall the work is disciplined: locked-UI invariants honored via sibling sections, fixture/live mode dispatch consistent, Cookie + Idempotency-Key forwarding follows the same pattern across handlers (with one critical exception). Tests cover the data path (unit + e2e fixtures) + dual-mode SSE resume.

**1 critical**, **6 warning**, **6 info**.

The critical finding (CR-01) is the deploy proxy stripping `Idempotency-Key` — duplicate deployments are possible on retry, defeating the BFF idempotency contract (D-14). Several warnings concern silent error swallowing and an SSR fetch with a relative URL that always fails. Most info items are dead code / unused props.

---

## Critical

### CR-01: Deploy proxy does not forward `Idempotency-Key`, allowing duplicate deployments on retry

**Files:**
- `apps/web/src/app/api/v1/deploy/[generationId]/route.ts:99-115`
- `apps/web/src/lib/api/dashboard-client.ts:175-197` (no key generation client-side)

**Issue:** The live-mode proxy builds `headers` with only `Cookie` + `Content-Type`. The `Idempotency-Key` header (which `apps/web/src/app/api/v1/generate/route.ts` properly forwards) is dropped. The dashboard `deploy()` client doesn't generate or forward one either.

Exploitable scenarios:
1. **Double-click on the locked Deploy CTA** — `onDeployedFromLocked` short-circuits only after success; two near-simultaneous clicks both reach the BFF; two CF Workers tenants get provisioned and two `deployments` rows written.
2. **Rename modal resubmit after collision** — After 409, user clicks confirm and `runDeploy` fires fresh POST. Without an idempotency key, BFF cannot dedupe a flaky network repeat (Pitfall #14 + Pitfall #30 interaction).
3. **Network retry** — `fetch` may retry transient failures at the runtime layer; without the key, BFF treats each as new.

D-14 contract requires `Idempotency-Key` on write operations (deploy creates a tenant + DB row).

**Fix sketch:**
```typescript
// apps/web/src/lib/api/dashboard-client.ts
import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';
import { getOrCreateIdempotencyKey } from '../idempotency-key.js';

export const deploy = async (generationId, opts) => {
  const idempotencyKey = getOrCreateIdempotencyKey(`deploy:${generationId}`, opts?.override_name ?? '');
  // include header in init.headers
};

// apps/web/src/app/api/v1/deploy/[generationId]/route.ts (live-mode branch)
const idempotencyKey = req.headers.get(IDEMPOTENCY_KEY_HEADER);
if (!idempotencyKey || !validateIdempotencyKey(idempotencyKey)) {
  return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 });
}
const headers = { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey };
```

Same gap exists for `setBadgePublic` (`dashboard-client.ts:200-212`) and `badge-public/route.ts`; less destructive but still bypasses D-14. Consider a unified helper.

---

## Warnings

### WR-01: Server-side `fetchDeployments` / `fetchUsageHourly` always fail because `fetch('/api/v1/...')` lacks a base URL on Node runtime

**Files:** `apps/web/src/app/dashboard/page.tsx:63-83`, `apps/web/src/lib/api/dashboard-client.ts:108,136`

**Issue:** Both functions issue `fetch('/api/v1/...')`. In a Server Component, Node `fetch` requires absolute URL — relative throws `TypeError: Invalid URL`. The `try/catch` in `page.tsx` swallows the error; HydrationBoundary dehydrates an empty cache, client re-fetches on mount. SSR prefetch is silently no-op.

The comment at `page.tsx:54-62` claims "Next 15 supports relative URLs via origin auto-derivation" — incorrect for RSC `fetch`. Peer file `preview/page.tsx:65-66` correctly constructs `process.env.MCPGEN_PUBLIC_URL ?? \`http://localhost:${PORT}\``.

Violates CLAUDE.md "fix root causes / never silently ignore errors".

**Fix:** Either drop server-side prefetch and rely on client fetch (delete the misleading try/catch + comment), or build absolute URL like `preview/page.tsx`.

### WR-02: Server-side prefetch will not authenticate against the BFF

**File:** `apps/web/src/app/dashboard/page.tsx:64-83`

**Issue:** Even after fixing WR-01, the prefetch does not forward the Logto session cookie. From RSC there is no implicit cookie attachment. BFF returns 401/empty.

**Fix:** Use `cookies()` from `next/headers`:
```typescript
import { cookies } from 'next/headers';
const cookieStore = await cookies();
const cookieHeader = cookieStore.toString();
await qc.prefetchQuery({
  queryFn: async () => {
    const res = await fetch(`${origin}/api/v1/deployments`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
    });
    // …
  },
});
```

### WR-03: Toggle-public-badge silently swallows refetch failure with no surfacing

**File:** `apps/web/src/lib/jsx-bridge/screens.tsx:695-707`

**Issue:** `onTogglePublicBadge`'s catch is empty with only a comment ("we re-surface on next refresh"). User clicks the checkbox → PATCH fails → checkbox visually toggles back next render → no feedback shown. Optimistic state isn't rolled back. Inconsistent UI between click and refetch settle.

Violates CLAUDE.md "Always raise errors explicitly".

**Fix:** Add error state + surface message; rollback optimistic update on failure.

### WR-04: SSE proxy returns 502 status with `Content-Type: text/event-stream` — EventSource can't parse the error event

**File:** `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts:80-89`

**Issue:** When upstream BFF unreachable, handler returns the error event with `status: 502` AND `headers: SSE_HEADERS`. Most EventSource implementations treat any non-200 from initial `text/event-stream` as a hard error and never parse the body. The error event written to body won't reach `useGenerationSSE` as the comment suggests.

**Fix:**
```typescript
return new Response(errorEvent, {
  status: 200,  // EventSource accepts; hook's `event: error` handler routes to failed.
  headers: SSE_HEADERS,
});
```

### WR-05: `Last-Event-ID` header casing may not match BFF parser

**File:** `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts:67-70`

**Issue:** Handler builds `upstreamHeaders[LAST_EVENT_ID_HEADER]`. If constant is `'Last-Event-ID'` (canonical SSE), fine for fetch (which normalizes). But if BFF (Hono on CF Workers) reads via raw bindings without normalization, casing matters. Lowercase `last-event-id` is wire-canonical (RFC 6855).

**Fix:** Verify `LAST_EVENT_ID_HEADER` constant in `packages/contracts`; normalize at proxy-write time:
```typescript
upstreamHeaders['last-event-id'] = lastEventId;
```

### WR-06: Fixture mode not hard-blocked in production via env var

**Files:** `apps/web/src/lib/fixture-mode/index.ts:32-40`, `apps/web/src/app/api/v1/deployments/route.ts:30-51`

**Issue:** The `?fixtures=true` query-string override is hard-blocked in production (good). But `MCPGEN_FRONTEND_MODE=fixtures` set as **env var** in production is **not** blocked. If accidentally enabled, every authenticated user sees the same shared fixture deployments + usage data — direct cross-tenant data isolation violation (T-7-15 referenced in handler comments).

**Fix:**
```typescript
// fixture-mode/index.ts
export const getFrontendMode = (req?: Request): FrontendMode => {
  if (process.env.NODE_ENV === 'production') return 'live';
  // …rest
};
```
Or gate behind separate `MCPGEN_ALLOW_FIXTURES_IN_PROD=true`.

---

## Info

### INF-01: Unused `path` variable + dead `extraQuery` parameter in `runDeploy`

**File:** `apps/web/src/lib/jsx-bridge/screens.tsx:410-422`
Drop the unused parameter; add it back when needed.

### INF-02: Unused `userClaims` prop threaded but never rendered

**File:** `apps/web/src/lib/jsx-bridge/screens.tsx:672-714`
`DashboardWrapper` accepts `userClaims?: UserClaimsLite` and does `void userClaims`. Same dead-prop pattern in `PreviewWrapper:299-301` (`void finalTools; void qualityReport; void codeSource;`). Either render or drop; if intentionally deferred, add an issue tracker.

### INF-03: `formatConfigJson` cast loses type safety due to optional `headers`

**File:** `apps/web/src/lib/jsx-bridge/screens.tsx:393-408`
The cast hides an `exactOptionalPropertyTypes` mismatch. Align `ClaudeDesktopConfigBlock` with the Zod-derived type or refactor headers as a discriminated union.

### INF-04: `lint` script is a placeholder that always exits 0

**File:** `apps/web/package.json:12`
`"lint": "echo 'deferred to Plan 07-02 ...'"`. CI green-checking lint is misleading; implement (`eslint .`) or `exit 1` to make the deferral loud.

### INF-05: Dead `as string` cast after `typeof` check

**File:** `apps/web/src/app/generate/[jobId]/preview/page.tsx:70-73`
TS narrows after `typeof === 'string'`; drop the redundant `as string`.

### INF-06: `claudeProtocolHref` returns `claude://install?name=<server>` only — no `url=` payload

**File:** `apps/web/src/lib/claude-desktop/config.ts:55-56`
The protocol handler may need server URL or config payload. e2e test `claude-desktop-config.spec.ts:67-99` only asserts format, not handler behavior. Add a comment citing official Claude Desktop URL handler spec, or include `&url=`.

---

## Files Reviewed (26)

```
apps/web/package.json
apps/web/src/app/api/v1/deploy/[generationId]/route.ts
apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts
apps/web/src/app/api/v1/deployments/route.ts
apps/web/src/app/api/v1/generate/route.ts
apps/web/src/app/api/v1/jobs/[jobId]/route.ts
apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts
apps/web/src/app/api/v1/usage/hourly/route.ts
apps/web/src/app/dashboard/_dashboard-client.tsx
apps/web/src/app/dashboard/page.tsx
apps/web/src/app/generate/[jobId]/preview/page.tsx
apps/web/src/lib/api/client.ts
apps/web/src/lib/api/dashboard-client.ts
apps/web/src/lib/jsx-bridge/screens.tsx
apps/web/src/lib/preview/code-block.tsx
apps/web/tests/e2e/_helpers/live-mode.ts
apps/web/tests/e2e/claude-desktop-config.spec.ts
apps/web/tests/e2e/dashboard.spec.ts
apps/web/tests/e2e/deploy-collision.spec.ts
apps/web/tests/e2e/hero-flow-live.spec.ts
apps/web/tests/e2e/page-reload-mid-generation.spec.ts
apps/web/tests/e2e/preview-render-live.spec.ts
apps/web/tests/e2e/quality-rubric-live.spec.ts
apps/web/tests/unit/lib/api/dashboard-client.test.ts
apps/web/tests/unit/lib/quality-badge.test.ts
apps/web/tests/visual-lock/9-screens.spec.ts
```

## Recommendation

CR-01 (missing Idempotency-Key on `/deploy` proxy) is the blocking item — should land before any production deploy; it directly violates contract D-14. WR-01/WR-02 (broken SSR prefetch) are degraded UX rather than functional blockers because TanStack Query client-side recovers.

Recommended next: `/gsd-code-review-fix 7 --ws frontend` to auto-apply CR-01 + WR-01..WR-04, or address inline before phase verification.
