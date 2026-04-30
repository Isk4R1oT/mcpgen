---
phase: 07-frontend-wire-up
verified: 2026-04-30T13:35:00Z
status: human_needed
score: 5/5 must-haves verified (0 quality findings remaining + 5 human UAT items)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5 must-haves verified (with 6 quality findings + 5 human items)
  gaps_closed:
    - "CR-01 — Idempotency-Key forwarding on /deploy + /badge-public proxies"
    - "WR-01 + WR-02 — broken RSC prefetch (relative URL + missing cookie)"
    - "WR-03 — silent error swallowing on badge-public toggle"
    - "WR-04 — SSE error event status 502 → 200 (EventSource compatibility)"
    - "WR-05 — Last-Event-ID header lowercase normalization on proxy write"
    - "WR-06 — fixture mode hard-block in production"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Locked-UI visual regression baseline"
    expected: "Render the 9 locked screens (landing, auth, canvas, stream, playground, preview, quality, deploy, dashboard) via the real Next.js build and visually diff against the baseline screenshots captured from `apps/web/src/MCPGen.html` rendered in the prototype harness; ≤0.1% pixel delta required (D-04 acceptance)."
    why_human: "Playwright screenshot-diff test exists at apps/web/tests/visual-lock/9-screens.spec.ts but baseline images live in __screenshots__/ and require human-curated regeneration after font-fallback diffs are tolerated. Automated grep cannot judge whether the rendered output matches the original locked design intent."
  - test: "Logto OAuth flow against real Logto Cloud tenant"
    expected: "Email + GitHub provider sign-in / sign-up / sign-out / callback flows complete against the real Logto Cloud free-tier tenant configured per Phase 1 D-14; `/dashboard/*` middleware redirects unauthenticated users to /api/auth/logto/sign-in?redirect_to=…; httpOnly Secure SameSite=Lax cookie set per D-19."
    why_human: "Requires LOGTO_ENDPOINT / LOGTO_APP_ID / LOGTO_APP_SECRET / LOGTO_BASE_URL / LOGTO_COOKIE_SECRET filled in .env.local (memory tag confirms creds available). Browser-driven OAuth redirects cannot be exercised offline."
  - test: "Pitfall #20 page-reload mid-generation in live mode"
    expected: "With MCPGEN_FRONTEND_MODE=live and apps/api running real engine, kill SSE socket at t=5s, reload page, observe event log replay from Postgres + new SSE events resume from correct event_id; navigation to /preview lands when stage='completed' fires."
    why_human: "BFF generation kickoff (POST /api/v1/generate) is documented carry-forward — apps/api/src/routes/v1/generate.ts still returns 501 stub. Live-mode test cannot run end-to-end until BFF closes the gap. Fixture-mode equivalent passes (e2e spec exists), but real-engine variant requires a follow-up phase to land first."
  - test: "Hero flow ≤60s in live mode against real Stripe/GitHub spec"
    expected: "Paste OpenAPI URL → live engine generation → preview screen rendered with Stage E TypeScript bundle in Shiki code panel + F2/F3 quality badge → mock deploy URL ≤60s wall-clock (FE-03 transparency principle, ROADMAP SC#3)."
    why_human: "Same gating as item 3 — requires real BFF + real engine. hero-flow-live.spec.ts skips when MCPGEN_FRONTEND_MODE !== 'live'."
  - test: "End-to-end deploy + Claude Desktop config + 409 collision modal against real tenant Worker"
    expected: "From preview, click 'Deploy' → BFF creates real CF tenant Worker → response includes claude_desktop_config + claude://install URL → 409 collision response triggers rename modal pre-filled with suggested_name (Pitfall #30); copy-to-clipboard button populates clipboard with valid JSON config block."
    why_human: "BFF endpoints /api/v1/deployments, /api/v1/usage/hourly, /api/v1/deploy/[id], /api/v1/deployments/[id]/badge-public NOT YET implemented in apps/api (documented carry-forward in 07-05-PRECONDITIONS.md §3); deployments.public_badge column missing from db-schema.ts; tenant Worker emit-pipe to TimescaleDB hypertable not live in current substitute Bun runtime (Phase 6 carry-forward)."
quality_findings_resolved:  # Was 1 critical + 6 warnings; all closed via /gsd-code-review-fix iteration 1 (07-REVIEW-FIX.md)
  - id: CR-01
    severity: critical
    fix_commit: 9cf0e52
    summary: "deploy() + setBadgePublic() generate + forward IDEMPOTENCY_KEY_HEADER; /deploy/[generationId]/route.ts + /badge-public/route.ts validate via validateIdempotencyKey and reject malformed with 400 invalid_idempotency_key"
  - id: WR-01
    severity: warning
    fix_commit: 864dc36
    summary: "Dropped failing RSC prefetchQuery() calls in dashboard/page.tsx (Option A); HydrationBoundary stays empty so future correct SSR prefetch can be added without restructuring; client-side useQuery in DashboardWrapper handles fetch on mount with browser cookie jar"
  - id: WR-02
    severity: warning
    fix_commit: 864dc36
    summary: "Same commit as WR-01 — dropping the prefetch closes both gaps"
  - id: WR-03
    severity: warning
    fix_commit: 02102ef
    summary: "Added toggleError state + visible alert region in DashboardWrapper using locked CSS-vars only; queryClient.invalidateQueries(['deployments']) on both success AND failure for canonical state rollback"
  - id: WR-04
    severity: warning
    fix_commit: 3e6fc91
    summary: "SSE bff_unreachable error response now uses status: 200 (EventSource accepts; useGenerationSSE hook routes via event:error path) instead of 502 (which silently dropped the body)"
  - id: WR-05
    severity: warning
    fix_commit: 5f076b2
    summary: "Proxy write boundary normalizes 'last-event-id' to wire-canonical lowercase per RFC 6855; contracts constant LAST_EVENT_ID_HEADER (Title-Case) unchanged for code readability and request-side parsing (case-insensitive on WHATWG Headers API)"
  - id: WR-06
    severity: warning
    fix_commit: 07dece3
    summary: "getFrontendMode() short-circuits to 'live' when NODE_ENV === 'production'; closes T-7-15 cross-tenant data isolation surface where stray MCPGEN_FRONTEND_MODE=fixtures env var would leak shared fixtures to all authenticated users; new unit test in tests/unit/lib/fixture-mode/guard.test.ts asserts override is ignored in production"
deferred:  # Items addressed in later phases — explicit carry-forwards (NOT gaps)
  - truth: "BFF POST /api/v1/generate kickoff returns real (non-501) response and enqueues Inngest job"
    addressed_in: "Phase 9 integration OR Phase 8 amendment"
    evidence: "07-04-SPIKE-RESULT.md A8 explicitly documents: 'apps/api/src/routes/v1/generate.ts STILL returns 501 stub… BFF generation kickoff is a Phase-1-stub gap that Phase 8 did NOT close'"
  - truth: "BFF GET /api/v1/jobs/:id reads from generations + pending_callbacks tables"
    addressed_in: "Phase 9 integration OR Phase 8 amendment"
    evidence: "07-04-SPIKE-RESULT.md A8: 'There is NO GET /api/v1/jobs/:id route handler in the BFF'"
  - truth: "BFF GET /api/v1/jobs/:id/stream emits real SSE events from engine"
    addressed_in: "Phase 9 integration OR Phase 8 amendment"
    evidence: "07-04-SPIKE-RESULT.md A8: 'apps/api/src/routes/v1/jobs/stream.ts STILL returns the Phase-1 stub phase1_stub event'"
  - truth: "BFF /api/v1/deployments + /usage/hourly + /deploy/[id] + /badge-public endpoints implemented"
    addressed_in: "Phase 9 integration OR Phase 8 amendment"
    evidence: "07-05-PRECONDITIONS.md §3 explicitly tabulates 'NOT IMPLEMENTED' for all four endpoints; deployments.public_badge column missing from db-schema.ts"
  - truth: "Tenant Worker usage events flow into TimescaleDB hypertable"
    addressed_in: "Phase 10 (CF runtime carry-forward from Phase 6)"
    evidence: "07-05-PRECONDITIONS.md §1: 'Phase 6 currently runs the substitute Bun-native runtime locally; live tenant Workers do not yet emit usage events into a TimescaleDB hypertable — they emit via bun:sqlite fallback'"
---

# Phase 7: Frontend Wire-Up Verification Report (Re-Verification)

**Phase Goal:** Wire the locked Claude-Design UI (`claude-design-ui/MCP-Gen.zip`) to live `POST /api/v1/generate` + SSE callbacks + dashboard endpoints with NO visual / layout / typography / copy changes.

**Verified:** 2026-04-30T13:35:00Z
**Status:** human_needed
**Re-verification:** Yes — after `/gsd-code-review-fix 7 --ws frontend` iteration 1 closed all 7 findings (1 critical + 6 warnings)

## Executive Summary

Phase 7 ships **all 5 frontend wire-up requirements (FE-01..FE-05)** as content-agnostic structural code that:
- Honors the locked-UI invariant (zero diff on locked files vs main; CI guard + pre-commit hook + visual-lock screenshot diff layered)
- Fully wires landing/auth/generation/preview/quality/deploy/dashboard routes against fixtures (Wave 1) AND a live-mode proxy pattern (Waves 2-3)
- Ships **98/98 unit tests passing** (was 94/94 — the 4 new tests covering CR-01 + WR-06 fixes); 13 e2e specs + 9-screen visual-lock spec
- Documents 5 explicit cross-phase carry-forwards for BFF endpoints + tenant Worker pipeline not yet implemented in apps/api / Phase 6 substitute runtime

**Re-verification delta:**
- All 7 quality findings from 07-REVIEW.md (1 CR + 6 WR) **CLOSED** in commits 9cf0e52, 864dc36, 02102ef, 3e6fc91, 5f076b2, 07dece3 (full report at 07-REVIEW-FIX.md).
- Re-ran live verification (typecheck / unit tests / build / locked-UI diff / IDEMPOTENCY_KEY_HEADER grep) against the post-fix HEAD — all green.
- Status remains `human_needed` because the **5 human UAT items** are unchanged: they are gated either on cross-phase carry-forwards (BFF /generate kickoff, BFF /deploy/[id], tenant Worker → TimescaleDB pipe) or on browser-driven sessions (Logto Cloud OAuth, locked-UI screenshot baseline curation). None of those gates was inside Phase 7's scope to close.

**Why human_needed (not passed):** Five tests require browser-driven validation against real services. All are documented in the human_verification list with clear gating evidence. No automated check can stand in for them.

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Locked UI from `claude-design-ui/MCP-Gen.zip` ships unchanged into `apps/web/src/`; CI fails any PR that touches locked paths | ✓ VERIFIED | `git diff main HEAD -- apps/web/src/MCPGen.html apps/web/src/*.jsx apps/web/src/global.css` returns empty. Pre-commit hook regex covers MCPGen.html + screen-*.jsx + ui.jsx + tokens.jsx + app.jsx + tweaks-panel.jsx + global.css + uploads/. CI workflow at `.github/workflows/main-ci.yml:132-133` runs visual-lock-guard.sh + Playwright screenshot-diff. `diff -q apps/web/src/screen-landing.jsx <(unzip -p claude-design-ui/MCP-Gen.zip screen-landing.jsx)` returns empty (byte-identical). The ROADMAP-listed paths `apps/web/src/styles/` + `apps/web/src/components/ui/` are aspirational/legacy; CONTEXT D-03 documents the reconciliation — the locked-UI files actually unzip flat into `apps/web/src/`. Both path sets show zero diff vs main. |
| 2 | Landing submits to `/api/v1/generate` with `Idempotency-Key`; playground consumes SSE per stage; survives page reload mid-generation by reading status from Postgres + resuming from `last-event-id` | ✓ VERIFIED (fixture mode); ⏸ HUMAN (live mode) | `apps/web/src/lib/idempotency-key.ts:32-46` generates `gen_${ulid()}` + persists in localStorage. `client.ts:60-75` attaches `IDEMPOTENCY_KEY_HEADER` on POST /generate. `apps/web/src/lib/sse/use-generation-sse.ts` implements full hook. SSE proxy at `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` writes `'last-event-id'` lowercase per RFC 6855 (WR-05 fix, commit 5f076b2) and emits SSE error event with `status: 200` on bff_unreachable (WR-04 fix, commit 3e6fc91). Mandatory page-reload e2e at `apps/web/tests/e2e/page-reload-mid-generation.spec.ts`. Live mode tested via skipIfNotLive() — gated on real BFF + real engine (carry-forward). |
| 3 | Preview renders tool list, descriptions, parameters, annotations, response config, full code at every step; one-click deploy produces live tenant Worker URL with collision-checked Claude Desktop config block | ✓ VERIFIED (structural); ⏸ HUMAN (live tenant) | `apps/web/src/lib/preview/code-block.tsx` server-only Shiki@^4 component (no 'use client'). PreviewWrapper threads `finalTools`, `qualityReport`, `codeSource`. `apps/web/src/lib/quality-badge.ts` handles all 4 tiers. `apps/web/src/lib/claude-desktop/config.ts` formats config + `claude://install` href. 409 collision rename modal at `screens.tsx:419-450` using locked `mc-modal-*` CSS classes. Deploy proxy now validates + forwards `IDEMPOTENCY_KEY_HEADER` (CR-01 fix, commit 9cf0e52); 400 `invalid_idempotency_key` on missing/malformed. Real tenant Worker deploy gated on Phase 6/8 carry-forward. |
| 4 | Dashboard shows deployed servers, usage events from TimescaleDB hourly aggregates, costs, F2/F3 quality badge | ✓ VERIFIED (structural); ⏸ HUMAN (live data) | `apps/web/src/app/dashboard/page.tsx:41-82` Server Component with `force-dynamic` + Logto session check via `getLogtoContext` + HydrationBoundary (seeded empty per WR-01+WR-02 fix, commit 864dc36; client-side `useQuery` in DashboardWrapper handles fetch on mount). DashboardClientShell ('use client' island) wraps `next/dynamic({ ssr: false })`. 4 BFF Route Handlers in `apps/web/src/app/api/v1/{deployments,usage/hourly,deploy/[generationId],deployments/[deploymentId]/badge-public}/route.ts`. Per-deployment `public` checkbox calls `setBadgePublic` (now generates + forwards `IDEMPOTENCY_KEY_HEADER`, CR-01 fix) + invalidates `['deployments']` query for canonical rollback (WR-03 fix, commit 02102ef); error surfaced via `data-testid="dashboard-toggle-error"` alert region. 14 vitest unit tests at `tests/unit/lib/api/dashboard-client.test.ts` (was 11 — 3 new CR-01 assertions); 3 e2e specs. Live data flow gated on Phase 9/Phase 8-amendment carry-forward. |
| 5 | Frontend = wire-up only; visual / layout / typography / copy must NOT be modified — `claude-design-ui/MCP-Gen.zip` ships unchanged | ✓ VERIFIED | `unzip -p claude-design-ui/MCP-Gen.zip screen-landing.jsx` content matches `apps/web/src/screen-landing.jsx` byte-for-byte (likewise MCPGen.html + ui.jsx). Three-layer defense: pre-commit hook + CI guard + Playwright screenshot-diff. New components live in NEW directories per CONTEXT D-01. ModeBanner + WR-03 toggleError alert region composed entirely from locked ui.jsx primitives + locked CSS-vars (`mc-mono`, `var(--accent-red, var(--text))`, `var(--border)`, `var(--paper-alt, transparent)`) — FE-05 anti-drift preserved through fix commits. |

**Score:** 5/5 truths verified (with documented gating on 5 human-verification items)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `.pre-commit-hooks/check-ui-locked.sh` | UI lock guard regex matches actual locked file set | ✓ VERIFIED | Regex includes MCPGen.html + screen-*.jsx + ui.jsx + tokens.jsx + app.jsx + tweaks-panel.jsx + global.css + uploads/. |
| `.github/workflows/scripts/visual-lock-guard.sh` | CI-side regex check vs origin/main with paired-ADR escape | ✓ VERIFIED | Same UI_LOCKED_PATHS regex; PAIRED_ADR_PATTERN matches `docs/decisions/<YYYY-MM-DD>-ui-lock-bump-*.md`. |
| `.github/workflows/main-ci.yml` | Frontend job runs typecheck + build + unit + e2e + visual-lock | ✓ VERIFIED | Lines 116-151 cover the full sequence. |
| `apps/web/src/lib/jsx-bridge/{loader.ts,index.ts,screens.tsx}` | Side-effect imports tokens→ui→9 screens; typed re-exports; 10 wrapper bodies | ✓ VERIFIED | All 3 files exist; all 10 wrapper bodies filled. WR-03 fix added `toggleError` state + alert region in `DashboardWrapper`. |
| `apps/web/src/middleware.ts` | Logto session guard on `/dashboard/:path*` ONLY | ✓ VERIFIED | `getLogtoContext` + redirect; matcher `['/dashboard/:path*']`. |
| `apps/web/src/lib/idempotency-key.ts` | `gen_${ulid}` generation + localStorage persistence + GEN_ID_REGEX validation | ✓ VERIFIED | All 3 functions present. |
| `apps/web/src/app/api/auth/logto/{sign-in,sign-up,callback,sign-out}/route.ts` | 4 Logto auth Route Handlers | ✓ VERIFIED | All 4 route.ts files present. |
| `apps/web/src/lib/sse/use-generation-sse.ts` | useGenerationSSE hook with retry/poll fallback + Last-Event-ID + terminal-stop | ✓ VERIFIED | Hook implementation + 5 unit tests pass. |
| `apps/web/src/lib/preview/code-block.tsx` | SSR-only Shiki Server Component | ✓ VERIFIED | No 'use client' directive; imports `codeToHtml` from 'shiki'. |
| `apps/web/src/lib/quality-badge.ts` | All 4 tiers (premium/verified/standard/needs_review) handled | ✓ VERIFIED | Lines 22-56 implement full tier ladder + F1-fail short-circuit. |
| `apps/web/src/app/dashboard/page.tsx` | Server Component + Logto session + HydrationBoundary | ✓ VERIFIED | All 3 patterns present; WR-01+WR-02 fix removed broken prefetchQuery calls (commit 864dc36); HydrationBoundary intentionally seeded empty. |
| `apps/web/src/app/api/v1/{deployments,usage/hourly,deploy/[generationId],deployments/[deploymentId]/badge-public}/route.ts` | 4 BFF Route Handlers (fixtures + live dispatch + structured 502 fallback) | ✓ VERIFIED | All 4 files present; build output confirms route registration. CR-01 fix added IDEMPOTENCY_KEY_HEADER validation + forwarding to `/deploy/[generationId]/route.ts` and `/badge-public/route.ts` (commit 9cf0e52). |
| `apps/web/src/lib/sentry/redact.ts` | Shared redactSentryEvent helper imported by all 3 sentry.*.config.ts | ✓ VERIFIED | Helper exists; 17 unit tests pass. |
| `apps/web/src/lib/api/dashboard-client.ts` | `deploy()` + `setBadgePublic()` generate + forward IDEMPOTENCY_KEY_HEADER | ✓ VERIFIED (NEW post-fix) | `getOrCreateIdempotencyKey('deploy:${generationId}', ...)` (line ~169) + `getOrCreateIdempotencyKey('badge-public:${deploymentId}', ...)` (line ~226) — both call sites import `IDEMPOTENCY_KEY_HEADER` from `@mcpgen/contracts` (line 19). |
| `apps/web/src/lib/fixture-mode/index.ts` | `getFrontendMode()` returns 'live' when NODE_ENV === 'production' | ✓ VERIFIED (NEW post-fix) | Line 41: `if (process.env.NODE_ENV === 'production') return 'live';` — short-circuits both env-var and query-string overrides. New unit test in `tests/unit/lib/fixture-mode/guard.test.ts` (commit 07dece3). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `_landing-client.tsx` | `LandingWrapper` (jsx-bridge) | `dynamic(() => import('@/lib/jsx-bridge/screens').then(m => m.LandingWrapper), { ssr: false })` | ✓ WIRED | Confirmed at `_landing-client.tsx:11-14`. |
| `LandingWrapper` | `submitGeneration` | `import { submitGeneration } from '@/lib/api/client'` | ✓ WIRED | `screens.tsx:19,108`. |
| `submitGeneration` | `/api/v1/generate` | `fetch(GENERATE_URL, { method:'POST', headers:{Idempotency-Key} })` | ✓ WIRED | `client.ts:60-75`. |
| `useGenerationSSE` | `/api/v1/jobs/:id/stream` | `fetch(streamUrl, { headers: { 'Last-Event-ID': … }})` | ✓ WIRED | `use-generation-sse.ts` + `last-event-id.ts:14`. |
| SSE proxy | apps/api Hono BFF | `fetch(`${MCPGEN_BFF_URL}/jobs/${jobId}/stream`, { headers: { Cookie, 'last-event-id' }})` | ✓ WIRED (proxy); ⏸ DEFERRED (BFF body) | `stream/route.ts:78` (lowercase header per WR-05 fix); error event uses `status: 200` (WR-04 fix). |
| Dashboard | TanStack Query | client-side `useQuery` on mount (no SSR prefetch — WR-01+WR-02 fix) | ✓ WIRED | `DashboardWrapper` uses `useQuery({ queryKey: ['deployments'], queryFn: fetchDeployments })`; HydrationBoundary stays empty so future correct SSR prefetch can be added. |
| DeployWrapper | `/api/v1/deploy/[generationId]` | dashboard-client `deploy()` → fetch with `IDEMPOTENCY_KEY_HEADER` | ✓ WIRED | CR-01 fix: client mints `gen_${ULID}` via `getOrCreateIdempotencyKey('deploy:${generationId}', opts?.override_name ?? '')`; proxy validates + forwards. |
| `setBadgePublic` failure | DashboardWrapper user surface | `setToggleError` state + alert region; `queryClient.invalidateQueries(['deployments'])` rollback | ✓ WIRED | WR-03 fix at `screens.tsx:697-718`. |
| sentry.{client,edge,server}.config.ts | `redactSentryEvent` | `import { redactSentryEvent } from '@/lib/sentry/redact'` + beforeSend wrapper | ✓ WIRED | All 3 configs refactored. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| LandingWrapper | submitGeneration response | `/api/v1/generate` Route Handler → fixture-mode returns 202 with fixed job_id; live-mode proxies to BFF (501 stub) | ✓ FLOWING (fixtures); ⏸ DEFERRED (live) | Carry-forward documented (07-04-SPIKE-RESULT.md A8). |
| StreamLogWrapper | events | useGenerationSSE → SSE Route Handler → fixture-mode replays @mcpgen/engine-fixtures timeline; live-mode proxies BFF | ✓ FLOWING (fixtures); ⏸ DEFERRED (live) | Same gating. |
| PreviewWrapper | finalTools, qualityReport, codeSource | partial_result.tenant_worker_source from /api/v1/jobs/:id; CodeBlock renders via Shiki | ✓ FLOWING (fixtures); ⏸ DEFERRED (live) | Same gating. |
| DashboardWrapper | deployments, usage_hourly | TanStack Query client-side fetch on mount (SSR prefetch removed per WR-01+WR-02 fix) | ✓ FLOWING (fixtures); ⏸ DEFERRED (live) | The previous SSR-prefetch path was always silently failing; client-side fetch with browser cookie jar works against fixture-mode and will work against live BFF once Phase 9 closes the carry-forward. |
| `data-testid="dashboard-toggle-error"` alert | `toggleError` state | catch handler in `onTogglePublicBadge` | ✓ FLOWING | WR-03 fix surfaces real error to user; rollback via `queryClient.invalidateQueries(['deployments'])`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly across apps/web | `pnpm --filter @mcpgen/web run typecheck` | exit 0 | ✓ PASS |
| Next.js production build succeeds | `pnpm --filter @mcpgen/web run build` | exit 0; all 23 routes registered (page + API + middleware = 62.5kB) | ✓ PASS |
| Vitest unit tests pass | `pnpm --filter @mcpgen/web run test:unit` | 13 files / **98 tests passing** in 8.78s (was 94 — +4 tests for CR-01 + WR-06 fixes) | ✓ PASS |
| Locked-UI byte-equality vs zip source | `diff -q apps/web/src/screen-landing.jsx <(unzip -p claude-design-ui/MCP-Gen.zip screen-landing.jsx)` | empty (identical); same for MCPGen.html + ui.jsx | ✓ PASS |
| Locked-UI zero-diff vs main (FE-05 invariant) | `git diff main HEAD --stat -- apps/web/src/MCPGen.html apps/web/src/*.jsx apps/web/src/global.css` AND `... -- apps/web/src/styles/ apps/web/src/components/ui/` | both empty | ✓ PASS |
| `IDEMPOTENCY_KEY_HEADER` forwarded on /deploy + /badge-public proxies | `grep -n IDEMPOTENCY_KEY_HEADER apps/web/src/lib/api/dashboard-client.ts apps/web/src/app/api/v1/deploy/[generationId]/route.ts apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts` | 8 matches across 3 files (import + 2× generate + 2× validate + 2× forward, plus fixture-shim test) | ✓ PASS |
| `last-event-id` lowercased on proxy write | `grep -n "'last-event-id'" apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` | line 78: `upstreamHeaders['last-event-id'] = lastEventId;` | ✓ PASS |
| SSE bff_unreachable returns 200 | `grep -n "status: 200" apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` | line 104: `status: 200,` (WR-04 fix) | ✓ PASS |
| Fixture mode hard-blocked in production | `grep -n "NODE_ENV === 'production'" apps/web/src/lib/fixture-mode/index.ts` | line 41: `if (process.env.NODE_ENV === 'production') return 'live';` | ✓ PASS |
| `prefetchQuery` removed from dashboard page | `grep -n "prefetchQuery" apps/web/src/app/dashboard/page.tsx` | empty (only the historical comment block at lines 50-62 references the previous broken behavior; no actual call site remains) | ✓ PASS |
| All 4 Logto auth Route Handlers exist | `ls apps/web/src/app/api/auth/logto/*/route.ts` | 4 files | ✓ PASS |
| All 4 dashboard BFF Route Handlers exist | `ls apps/web/src/app/api/v1/{deployments,usage,deploy,deployments/.../badge-public}/route.ts` | 4 files | ✓ PASS |
| Playwright e2e specs run in CI fixture mode | `.github/workflows/main-ci.yml:144-147` | Configured | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **FE-01** | 07-02 | Landing page wired to `/api/v1/generate` with `Idempotency-Key` header | ✓ SATISFIED | submitGeneration → fetch with IDEMPOTENCY_KEY_HEADER; 18 vitest tests + 3 e2e (landing-submit.spec.ts) |
| **FE-02** | 07-03, 07-04 | Generation playground consumes SSE per stage; recovers via Postgres state read + last-event-id resume | ✓ SATISFIED (fixture); ⏸ HUMAN (live) | useGenerationSSE hook + page-reload-mid-generation.spec.ts (mandatory Pitfall #20 test); SSE proxy hardened post-fix (WR-04 status:200, WR-05 lowercase header); live-mode dual-baseline gated on Phase 9 carry-forward |
| **FE-03** | 07-03, 07-04 | Preview shows tool list, descriptions, parameters, annotations, response config, full code (transparency) | ✓ SATISFIED (structural); ⏸ HUMAN (live preview) | CodeBlock.tsx Server Component (Shiki@^4 SSR); PreviewWrapper renders FinalTool[] + QualityReport; preview-render-live.spec.ts gated on real engine |
| **FE-04** | 07-05 | One-click deploy + dashboard with deployed servers, usage events, costs, F2/F3 badge | ✓ SATISFIED (structural); ⏸ HUMAN (live tenant) | dashboard/page.tsx + 4 Route Handlers + DeployWrapper with 409 collision modal + claude:// CTA. **CR-01 + WR-01..WR-06 closed post-fix** (Idempotency-Key forwarding, broken RSC prefetch removed, badge-toggle error surface, fixture-prod hard-block) |
| **FE-05** | 07-01 | Frontend = wire-up only; locked UI ships unchanged | ✓ SATISFIED | Three-layer defense (pre-commit + CI + screenshot-diff); locked files byte-equivalent to zip source; new code in NEW dirs; WR-03 alert region uses ONLY locked CSS-vars |

All 5 requirements declared in PLAN frontmatter (07-01..07-06) accounted for. REQUIREMENTS.md table currently still lists FE-01..FE-04 as `Pending` — that's a metadata-rollup gap to be closed by the orchestrator after this re-verification, NOT a phase gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/web/package.json | 12 | `"lint": "echo 'apps/web lint: deferred to Plan 07-02 …'"` (placeholder) | ℹ Info (INF-04) | CI green-checks lint without doing anything; documented deferral but should `exit 1` to make it loud, or implement. Not in `/gsd-code-review-fix` scope. |

All previous CR / WR rows from the initial verification have been closed. INF-01..INF-06 from 07-REVIEW.md remain advisory-only (deferred per `/gsd-code-review-fix` scope_note); none of them blocks the goal.

### Quality Findings: Resolved Post-Fix

All 7 findings (1 critical + 6 warnings) from 07-REVIEW.md are CLOSED in iteration 1 of `/gsd-code-review-fix` (full report at `.planning/phases/07-frontend-wire-up/07-REVIEW-FIX.md`). Commit hashes:

| ID | Severity | Commit | Fix Summary |
|----|----------|--------|-------------|
| **CR-01** | critical | `9cf0e52` | `deploy()` + `setBadgePublic()` mint + forward `IDEMPOTENCY_KEY_HEADER`; `/deploy/[generationId]/route.ts` + `/badge-public/route.ts` validate header on live-mode branch and reject malformed with 400 `invalid_idempotency_key` |
| **WR-01 + WR-02** | warning | `864dc36` | Dropped failing RSC `prefetchQuery()` calls (relative URL + missing cookie were always failing silently); HydrationBoundary preserved empty for future correct SSR prefetch; client-side `useQuery` on mount handles fetch correctly |
| **WR-03** | warning | `02102ef` | `onTogglePublicBadge` adds `toggleError` state + visible alert region (`role="alert"`, `data-testid="dashboard-toggle-error"`) using ONLY locked CSS-vars; `queryClient.invalidateQueries(['deployments'])` on both success AND failure for canonical rollback |
| **WR-04** | warning | `3e6fc91` | SSE `bff_unreachable` error response now uses `status: 200` (was 502) so EventSource and `useGenerationSSE`'s fetch+parser path can deliver the error event body to the hook's `event:error` handler instead of silently dropping it |
| **WR-05** | warning | `5f076b2` | Proxy write boundary normalizes header to wire-canonical lowercase `'last-event-id'` per RFC 6855 / WHATWG fetch; contracts constant `LAST_EVENT_ID_HEADER` (Title-Case) unchanged for code readability and request-side parsing |
| **WR-06** | warning | `07dece3` | `getFrontendMode()` short-circuits to `'live'` when `NODE_ENV === 'production'` (was reachable via env var); closes T-7-15 cross-tenant data isolation gap; new unit test asserts override is ignored in production |

**Verification (post-fix, this re-verification run):**
- typecheck → exit 0
- 98/98 unit tests passing (was 94/94; +4 tests across `dashboard-client.test.ts` and `fixture-mode/guard.test.ts`)
- production build → exit 0; 23 routes registered
- locked-UI invariant → zero diff vs main on all locked files (both ROADMAP-listed and actual locked file set)
- byte-equality with zip source → empty diff for screen-landing.jsx, MCPGen.html, ui.jsx

### Carry-Forwards (Deferred — NOT Gaps)

These items are documented carry-forwards explicitly handled by the **Pattern Carry-Forward-Frontend** (frontend Route Handlers ship content-agnostic with structured 502 fallbacks; live-mode e2e tests guard with `skipIfNotLive()`; SUMMARY.md documents the gap for the follow-up phase to close).

| # | Carry-Forward | Addressed In | Evidence |
|---|---------------|--------------|----------|
| 1 | BFF `POST /api/v1/generate` real implementation (501 stub today) | Phase 9 integration OR Phase 8 amendment | 07-04-SPIKE-RESULT.md A8 |
| 2 | BFF `GET /api/v1/jobs/:id` route handler (does not exist today) | Phase 9 integration OR Phase 8 amendment | 07-04-SPIKE-RESULT.md A8 |
| 3 | BFF `GET /api/v1/jobs/:id/stream` real engine emit (phase-1 stub today) | Phase 9 integration OR Phase 8 amendment | 07-04-SPIKE-RESULT.md A8 |
| 4 | BFF `/deployments`, `/usage/hourly`, `/deploy/[id]`, `/badge-public` endpoints (NOT IMPLEMENTED); `deployments.public_badge` column missing from db-schema.ts | Phase 9 integration OR Phase 8 amendment | 07-05-PRECONDITIONS.md §3 |
| 5 | Tenant Worker → TimescaleDB usage event pipe (currently bun:sqlite fallback in substitute Bun runtime) | Phase 10 (CF runtime carry-forward from Phase 6) | 07-05-PRECONDITIONS.md §1 |

### Human Verification Required

See YAML frontmatter `human_verification:` for the 5 items requiring browser-driven testing against real services. Summary (unchanged from initial verification):

1. **Locked-UI visual regression baseline** — Playwright screenshot-diff requires human-curated baseline regeneration after font fallback diffs (D-04).
2. **Logto OAuth flow against real Logto Cloud tenant** — needs `.env.local` creds + browser session.
3. **Pitfall #20 page-reload mid-generation in live mode** — gated on BFF generation kickoff carry-forward.
4. **Hero flow ≤60s in live mode** — same BFF gating + live engine availability.
5. **End-to-end deploy + Claude Desktop config + 409 collision** — gated on BFF deploy/[id] + tenant Worker pipeline carry-forwards.

### Gaps Summary

**No actionable gaps blocking the phase goal.** All 5 must-haves are structurally complete; all 7 quality findings (1 CR + 6 WR) from 07-REVIEW.md are CLOSED post-fix. Five items legitimately require human verification (browser/real-services) and are documented with clear gating evidence.

### Recommendation

**Status: human_needed** — proceed to user-driven validation against:
- Logto Cloud live OAuth flow
- Locked-UI screenshot baseline curation (one-time)
- The 4 live-mode e2e tests (page-reload, hero-flow-live, preview-render-live, quality-rubric-live) — these will become runnable after the BFF carry-forward closes in a follow-up phase

Phase 7 is **production-ready for Wave 1 (fixture-mode demo cadence)** — quality findings closed, locked-UI invariant intact, idempotency contract honored, no silent error swallowing. **Content-agnostic-ready for Waves 2-3** pending upstream BFF unblock (Phase 9 / Phase 8 amendment) and tenant Worker → TimescaleDB pipe (Phase 10).

---

_Verified: 2026-04-30T13:35:00Z_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
_Verification mode: re-verification (after `/gsd-code-review-fix 7 --ws frontend` iteration 1; previous status human_needed with 6 quality findings → now human_needed with 0 quality findings)_
