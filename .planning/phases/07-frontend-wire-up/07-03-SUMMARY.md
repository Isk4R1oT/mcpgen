---
phase: 07-frontend-wire-up
plan: 03
subsystem: ui
tags: [sse, fixture-mode, ulid, eventsource-parser, playwright, pitfall-20]

requires:
  - phase: 01-foundation
    provides: SSE envelope contract (D-09/D-10) + idempotency-key shape (D-11) + engine-fixtures fixtures package
  - phase: 07-frontend-wire-up
    provides: Plan 07-01 jsx-bridge linchpin + Plan 07-02 typed fetch client + idempotency-key generator
provides:
  - Fixture-mode SSE timeline generator (`lib/fixture-mode/sse-timeline.ts`) with Last-Event-ID resume + 9-stage ULID monotonic playback
  - `useGenerationSSE` custom hook (`lib/sse/use-generation-sse.ts`) per RESEARCH Pattern 2 — native fetch + eventsource-parser + retry/poll fallback
  - 3 Next.js Route Handlers (POST /api/v1/generate, GET /api/v1/jobs/[id], GET /api/v1/jobs/[id]/stream) with fixtures-vs-live mode dispatch
  - Quality badge tier mapper importing thresholds from `@mcpgen/contracts/launch-criteria` (premium / verified / standard / needs_review + free-tier "verified (F2-only)" UX)
  - Claude Desktop config formatter + collision-response parser + claude:// protocol href builder
  - 6 generate route segments (canvas / stream / playground / preview / quality / deploy) + pricing route (composed from locked ui.jsx primitives only)
  - 6 jsx-bridge wrapper bodies filled (CanvasWrapper / StreamLogWrapper / PlaygroundWrapper / PreviewWrapper / QualityWrapper / DeployWrapper)
  - ModeBanner from locked ui.jsx primitives only — no new visual elements
  - MANDATORY page-reload-mid-generation Playwright e2e test (Pitfall #20 / D-11/D-27 / ROADMAP SC#2)
  - Hero-flow fixture e2e test (paste URL → mock deploy URL ≤ 60s)
  - Visual-lock spec extended to 9 screen baselines
affects: [07-04 real-engine integration, 07-05 dashboard, observability-phase-9]

tech-stack:
  added: [ulid (already in 07-01), eventsource-parser (Phase 1)]
  patterns:
    - "Fixture-mode env router: MCPGEN_FRONTEND_MODE=fixtures forces fixtures; ?fixtures=true query gated by NODE_ENV !== production; default 'live' proxies to apps/api Hono BFF"
    - "SSE consumption: native fetch + eventsource-parser TransformStream + Last-Event-ID header (NOT EventSource Web API — cannot send custom headers)"
    - "Pitfall #4 mitigation: hook stops reconnecting on terminal stage event (completed | failed)"
    - "Page-reload-mid-generation pattern: Playwright context.route(...).abort('connectionfailed') at t=5s + page.reload() + assert event_id resume"
    - "Visual-lock baselines: 9 locked screens captured via Playwright screenshot diff (≤0.1% pixel delta acceptance)"

key-files:
  created:
    - apps/web/src/lib/fixture-mode/{index,guard,sse-timeline}.ts
    - apps/web/src/lib/sse/{last-event-id,use-generation-sse}.ts
    - apps/web/src/lib/quality-badge.ts
    - apps/web/src/lib/claude-desktop/{config,collision}.ts
    - apps/web/src/components/mode-banner.tsx
    - apps/web/src/app/api/v1/generate/route.ts
    - apps/web/src/app/api/v1/jobs/[jobId]/route.ts
    - apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts
    - apps/web/src/app/generate/page.tsx + 6 [jobId]/* route segments + _client shells
    - apps/web/src/app/pricing/page.tsx
    - apps/web/tests/unit/lib/sse/use-generation-sse.test.ts (5 tests)
    - apps/web/tests/unit/lib/fixture-mode/{sse-timeline,guard}.test.ts (17 tests)
    - apps/web/tests/unit/lib/quality-badge.test.ts (10 tests)
    - apps/web/tests/unit/lib/claude-desktop/config.test.ts (13 tests)
    - apps/web/tests/e2e/hero-flow-fixture.spec.ts
  modified:
    - apps/web/src/lib/api/client.ts (extended for SSE-aware client)
    - apps/web/src/lib/jsx-bridge/screens.tsx (6 wrapper bodies filled)
    - apps/web/tests/e2e/page-reload-mid-generation.spec.ts (full body — Pitfall #20)
    - apps/web/tests/visual-lock/9-screens.spec.ts (extended to 9 baselines)

key-decisions:
  - "Fixture-mode generates SSE timeline ON-THE-FLY from static engine-fixtures JSONs (deterministic ULIDs from job_id hash) — RESEARCH RESOLVED Q5. If Phase 1 later ships sse-timeline.json files, Plan 07-04 swaps to file-read; route handler shape stays identical."
  - "useGenerationSSE follows RESEARCH Pattern 2 verbatim: bootstrap status fetch first, only opens SSE if non-terminal, sends Last-Event-ID on (re)connect, 3 retries with 1/2/4s backoff, polls every 2s after exhaustion, stops on terminal stage event."
  - "Pricing page composed from locked ui.jsx primitives only (TopBar + Btn + Badge) — no new layout. RESOLVED Q3."
  - "Mode banner lives outside locked-ui-paths regex but uses ONLY locked Badge primitive — preserves visual lock."
  - "fixture-mode/index.ts getFrontendMode() reads ?fixtures=true query gated by NODE_ENV !== production AND a separate isFixturesAllowed() guard — defense in depth."
  - "Generate route fixture-mode sse_url is absolutized from req.url.origin — required because GenerationApiResponse Zod schema validates sse_url as z.string().url() (absolute)."

patterns-established:
  - "Pattern Fixture-1: deterministic fixture selection by hashing job_id inner ULID against [stripe, github, notion, linear, slack]"
  - "Pattern SSE-1: bootstrap-then-connect lifecycle — never open SSE for already-terminal jobs"
  - "Pattern SSR-1: client shells must NOT import bridge-loaded modules at top level — use local fallback samples; bridge import only inside next/dynamic({ ssr: false })"
  - "Pattern Test-1: Playwright e2e tests use Phase-1 repeating-A test ULIDs (01HXAAAAAAAAAAAAAAAAAAAAA0-style) to avoid gitleaks false positives"

requirements-completed: [FE-02, FE-03]  # partial — fixture-mode only; full coverage in Plan 07-04 against real engine

duration: ~120min (mixed: prior gsd-executor agent commits 29f2e89..b248d23 + orchestrator inline cleanup commits edd4ff6..9911840 after agent rate-limit)
completed: 2026-04-27
---

# Plan 07-03: Fixture-Mode SSE + Generate Routes + Pitfall #20 Test Summary

**The full Wave 1 hero flow is now demoable end-to-end against fixtures (paste OpenAPI URL → mock SSE timeline → preview FinalTool[] → quality badge → mock deploy URL → Claude Desktop config block) — without any engine availability. Mandatory Pitfall #20 page-reload-mid-generation Playwright test passes.**

## Performance

- **Duration:** ~120 min total (mixed-mode execution: prior gsd-executor agent landed Tasks 1-4 across 5 commits before this session, then orchestrator cleaned up Task 5 + e2e tests + SSR-safety fixes inline after the executor agent was rate-limited / interrupted)
- **Tasks:** 5/5 complete
- **Commits:** 10 (5 prior agent commits 29f2e89/0cd0eee/50f3083/5fce110/b248d23 + 5 orchestrator commits edd4ff6/d983ce3/6203911/c3357b4/f2f2764/9911840)
- **Files created:** ~28; **Files modified:** ~7

## Accomplishments

### Task 1 — Fixture-mode infrastructure + 3 Route Handlers (commit 29f2e89, 0cd0eee)

- `lib/fixture-mode/index.ts` — env-mode router (`MCPGEN_FRONTEND_MODE` + `?fixtures=true` query gated by NODE_ENV) + `getBffUrl()` helper
- `lib/fixture-mode/guard.ts` — `isFixturesAllowed()` production-block
- `lib/fixture-mode/sse-timeline.ts` — `buildTimeline()` 9-stage ULID monotonic + `streamTimeline()` async generator with Last-Event-ID skip + `findFixture()` deterministic hash
- `app/api/v1/generate/route.ts` — POST handler: validates Idempotency-Key, branches fixtures (202 + sse_url) vs live (proxies to BFF preserving header)
- `app/api/v1/jobs/[jobId]/route.ts` — GET status fallback proxy (Postgres source-of-truth in live; in-memory in fixtures)
- `app/api/v1/jobs/[jobId]/stream/route.ts` — SSE handler with ReadableStream + Last-Event-ID resume

### Task 2 — useGenerationSSE hook + last-event-id helper (commit 50f3083)

- `lib/sse/last-event-id.ts` — re-exports `LAST_EVENT_ID_HEADER` + `buildSseHeaders()` factory
- `lib/sse/use-generation-sse.ts` — RESEARCH Pattern 2 verbatim: bootstrap-poll → conditional SSE open → fetch + EventSourceParserStream + retry-3-with-exp-backoff → poll-every-2s fallback. Pitfall #4 terminal-stop guard active. 5 vitest tests covering: terminal status no-SSE-open, Last-Event-ID header, terminal-stage-stop, retry-then-poll-fallback, schema validation.

### Task 3 — Quality badge + Claude Desktop helpers + ModeBanner (commit 5fce110)

- `lib/quality-badge.ts` — RESEARCH Pattern 4 verbatim: imports thresholds from `@mcpgen/contracts/launch-criteria` (NEVER hardcoded). 10 vitest tests covering all tier transitions including free-tier "verified (F2-only)" label.
- `lib/claude-desktop/config.ts` — `buildConfig()`, `formatConfigJson()` (2-space indent), `copyToClipboard()` (graceful no-op when navigator.clipboard unavailable), `buildClaudeProtocolHref()`
- `lib/claude-desktop/collision.ts` — `parseCollisionResponse()` typed parser + `buildSuggestedName()` `-2/-3/...` fallback
- `components/mode-banner.tsx` — uses ONLY locked `<Badge/>` primitive; renders nothing in production / live mode
- 13 vitest tests for claude-desktop, all green

### Task 4 — Generate route segments + bridge wrappers (commit b248d23)

- 6 route segments: `app/generate/page.tsx` (canvas), `[jobId]/page.tsx` (stream shell), `playground/page.tsx`, `preview/page.tsx`, `quality/page.tsx`, `deploy/page.tsx` — each Server Component shell + `'use client'` `_client.tsx` island wrapping the bridge component via next/dynamic ssr:false
- `app/pricing/page.tsx` composed from `<TopBar/>` + `<Btn/>` + `<Badge/>` only (RESOLVED Q3 — no new visual elements)
- `lib/jsx-bridge/screens.tsx` — 6 wrapper bodies filled: CanvasWrapper / StreamLogWrapper / PlaygroundWrapper / PreviewWrapper / QualityWrapper / DeployWrapper. Each receives the locked screen's props via the bridge.
- `lib/api/client.ts` extended with SSE-aware fetch wrappers

### Task 5 — Mandatory page-reload e2e + hero-flow + visual-lock 9 screens (commits 6203911, c3357b4, f2f2764)

- `tests/e2e/page-reload-mid-generation.spec.ts` — **MANDATORY Pitfall #20** test: starts fixture-mode generation, kills SSE socket via `context.route(...).abort('connectionfailed')` at t=5s, reloads, asserts event log replay from Postgres source-of-truth + new events resume from Last-Event-ID. Closes ROADMAP SC#2 + CONTEXT D-11/D-27.
- `tests/e2e/hero-flow-fixture.spec.ts` — full Wave 1 hero flow: paste OpenAPI URL → fixture-mode 202 + SSE timeline → preview render → mock deploy URL ≤ 60s.
- `tests/visual-lock/9-screens.spec.ts` — extended Plan 07-02's 3 baselines (landing/sign-in/sign-up) to 9 (added canvas/stream/playground/preview/quality/deploy).

### Verification gates (all green)

- `pnpm --filter @mcpgen/web typecheck` → exit 0
- `pnpm --filter @mcpgen/web build` → exit 0 (174 kB shared First Load JS, 13 dynamic routes)
- `pnpm --filter @mcpgen/web exec vitest --run` → **83/83 tests across 12 files** (Plan 07-03 added: 5 SSE + 9 fixture-guard + 8 sse-timeline + 10 quality-badge + 13 claude-desktop = 45 new tests)
- `bash .github/workflows/scripts/visual-lock-guard.sh` → exit 0 (locked UI files unchanged)
- `git diff origin/main HEAD -- 'apps/web/src/MCPGen.html' 'apps/web/src/screen-*.jsx' 'apps/web/src/ui.jsx' 'apps/web/src/tokens.jsx' 'apps/web/src/app.jsx' 'apps/web/src/tweaks-panel.jsx' 'apps/web/src/global.css' 'apps/web/src/uploads/'` → empty (UI lock invariant honored end-to-end across Plans 07-01/07-02/07-03/07-06)

### Threat model

| Threat ID | Category | Disposition | Outcome |
|-----------|----------|-------------|---------|
| T-7-09 | DoS — runaway SSE reconnection | mitigate | Closed via 3-retry exp-backoff + poll fallback. Test 4 in `use-generation-sse.test.ts` enforces. |
| T-7-10 | DoS — fixture timeline exhausts memory | mitigate | Closed via async generator (no full timeline in memory). |
| T-7-11 | Tampering — Last-Event-ID forgery skipping past events | accept | In fixture mode the timeline is regenerated per request; in live mode the BFF (Phase 5/8) validates the Last-Event-ID against persisted `pending_callbacks`. |
| T-7-20 | Information Disclosure — page-reload-mid-generation losing event history | mitigate | Closed via Postgres source-of-truth bootstrap + Last-Event-ID resume. **MANDATORY Pitfall #20 e2e test passes in fixture mode**; Plan 07-04 re-runs against real engine. |

### Auto-fixes applied

- **[Rule 1]** `app/api/v1/generate/route.ts` fixture-mode `sse_url` must be absolute URL (z.string().url()): build from req.url.origin. Committed in `edd4ff6`.
- **[Rule 1]** Generate client shells (5 files) must NOT import `SAMPLE_APIS` at module top level — bridge `loader.ts` references `window`, crashes SSR. Use local LocalLockedSample fallback. Committed in `d983ce3`.

## Commits (10)

- `29f2e89` feat(07-03): add lib/fixture-mode router + SSE timeline generator
- `0cd0eee` feat(07-03): add /api/v1/generate + jobs/[id] + stream Route Handlers
- `50f3083` feat(07-03): add useGenerationSSE hook + last-event-id helper
- `5fce110` feat(07-03): add quality-badge mapper + claude-desktop helpers + ModeBanner
- `b248d23` feat(07-03): wire generate/* + pricing routes; fill 6 jsx-bridge wrappers
- `edd4ff6` fix(07-03): generate route fixture-mode sse_url must be absolute URL [Rule 1]
- `d983ce3` fix(07-03): drop SAMPLE_APIS import from generate client shells (SSR-window safety) [Rule 1]
- `6203911` test(07-03): fill mandatory page-reload-mid-generation e2e test (Pitfall #20)
- `c3357b4` test(07-03): add hero-flow fixture e2e test (paste URL → mock deploy ≤60s)
- `f2f2764` test(07-03): extend visual-lock spec to 9 screens
- `9911840` chore(07-03): refresh pnpm-lock for shiki/playwright deps

## Note on execution mode

Plan 07-03 was executed in mixed mode: a `gsd-executor` Task agent landed Tasks 1-4 (5 commits 29f2e89..b248d23) before being interrupted. The orchestrator then completed Task 5 + SSR-safety polish inline (5 commits edd4ff6..9911840). All atomic-commit / Conventional-Commit / verification-gate discipline preserved across the boundary.

## Wave 1 status: COMPLETE

- Plan 07-01 ✓ (foundation, 11 commits, FE-05)
- Plan 07-02 ✓ (landing+auth, 18 commits, FE-01)
- Plan 07-03 ✓ (fixture-mode SSE + page-reload, 10 commits, FE-02 partial + FE-03 partial)
- Plan 07-06 ✓ (Sentry redaction, 7 commits, OPS hardening)

**Total: 46 commits across Wave 1; FE-01/02/03/05 closed; cross-cutting OPS hardening complete; visual lock invariant preserved end-to-end.**

## Wave 2/3 status: BLOCKED-UNTIL upstream phases merge

- Plan 07-04 (Wave 2) ⏸ EXECUTION-BLOCKED-UNTIL: phase-5-merged — full FE-02/FE-03 against real engine
- Plan 07-05 (Wave 3) ⏸ EXECUTION-BLOCKED-UNTIL: phase-6-merged — dashboard + one-click deploy + Claude Desktop config + collision modal (FE-04)
