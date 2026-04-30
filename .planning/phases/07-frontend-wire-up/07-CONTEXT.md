# Phase 7: Frontend Wire-Up - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-mode discussion (`--auto --ws frontend`); recommended option selected for each gray area; rationale logged inline. Single-pass per workflow Auto-mode pass cap.

> **User clarification (2026-04-26, mid-discussion):** UI was already extracted in Phase 1 commit `ee60dee` — НЕ переделывать. UI is LOCKED — no visual changes. Phase 7 = wire-up only (state, fetch calls, SSE consumption, error display). Acceptance criterion: `git diff` against the locked JSX shows ZERO changes. Wave 1 (landing/auth) starts now (independent). Wave 2–3 (generation/preview/dashboard) — **execution deferred** until upstream engine (Phase 5) and runtime (Phase 6) are ready, not just merge.

<domain>
## Phase Boundary

Wire the locked Claude-Design UI (already extracted into `apps/web/src/` in Phase 1 commit `ee60dee`) to live `POST /api/v1/generate` + per-job SSE callbacks + dashboard endpoints in three waves keyed to upstream readiness:

- **Wave 1 — start now (depends on Phase 1 contracts only):** landing form → `POST /api/v1/generate` (501-stub from `apps/api`), pricing/auth shells, Logto session bootstrap, idempotency-key handling, Next.js App Router scaffold, fixture-mode mock SSE against `packages/engine-fixtures/` so Wave 1 ships complete (form → mock SSE → preview render → mock deploy URL) before any engine pass exists
- **Wave 2 — execution deferred until Phase 5 engine ships:** plan exists from Phase 7 outset, but tasks do NOT execute until Phase 5 lands real `POST /api/v1/generate` + SSE event stream. Covers: generation playground SSE consumption, page-reload mid-generation resume via Postgres `generation.status` + `Last-Event-ID`, preview screen rendering of `FinalTool[]` + full code at every step (transparency principle), quality badge from F2/F3
- **Wave 3 — execution deferred until Phase 6 runtime ships:** plan exists; tasks do NOT execute until Phase 6 lands Dispatch Worker + tenant Worker deploy + usage-event pipeline. Covers: dashboard rendering deployed servers, usage events from TimescaleDB hourly aggregates, costs, one-click deploy → live tenant Worker URL, Claude Desktop config block with collision detection (per pitfall #30)

**Hard scope rule (constraint, not a gray area):**
The locked UI files at `apps/web/src/{MCPGen.html, app.jsx, screen-{landing,auth,canvas,stream,playground,preview,quality,deploy,dashboard}.jsx, ui.jsx, tokens.jsx, tweaks-panel.jsx, global.css, uploads/}` (committed in Phase 1 `ee60dee` from `claude-design-ui/MCP-Gen.zip`) are FROZEN. **DO NOT re-extract, re-interpret, port to TSX, restyle, refactor JSX → React 19 idiomatic, recreate via shadcn/ui, rewrite tokens, replace `global.css` with Tailwind classes, or otherwise touch them.** They are the visual lock target — the rendered output of these files exactly as-is is what the user signed off on.

The Phase-1 pre-commit hook `.pre-commit-hooks/check-ui-locked.sh` currently guards `^apps/web/src/(styles|components/ui)/` — but the actual locked files unzipped flat into `apps/web/src/` (the original hook regex was aspirational; the marker file `apps/web/.unzip-commit-allowed` was never consumed since those subdirs were never created). **Phase 7 first task** re-points the hook regex at the actual locked file set:

```
UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
```

CI guard MUST verify `git diff origin/main HEAD -- apps/web/src/MCPGen.html apps/web/src/*.jsx apps/web/src/global.css apps/web/src/uploads/` shows ZERO changes on every Phase 7 PR. Per ROADMAP Phase 7 success criterion #1 + RULES.md UI-LOCKED constraint + user clarification 2026-04-26.

**In scope (wire-up only — code lives in NEW directories alongside the locked JSX):**
- Update `.pre-commit-hooks/check-ui-locked.sh` to guard the actual locked file set (above) — Phase 7 Plan 1 first task
- Create `apps/web/src/app/` (Next.js 15 App Router): route segments that import the existing locked JSX screens via Next's built-in JSX support (Next.js 15 + Babel/SWC compile `.jsx` natively; no rewrite required) and wrap them with data-fetching + SSE state
- Create `apps/web/src/lib/`: SSE consumer hook (`useGenerationSSE`), idempotency-key generator, fetch-API client typed against `@mcpgen/contracts`, fixture-mode helpers, error formatters
- Create `apps/web/src/middleware.ts`: Logto session check on `/dashboard/*` routes
- Re-enable `apps/web/package.json` scripts (`build`/`lint`/`typecheck`/`test` are no-ops in Phase 1 per plan 01-05 commit message — Phase 7 wires real Next.js builds)
- Configure `next.config.js` to compile JSX at build time, register Tailwind 4 (already declared in package.json) so the locked `global.css` works inside Next, register `@logto/next`, register `withSentryConfig`
- Wire form submission to `POST /api/v1/generate` (501-stub in Wave 1 → real in Wave 2) with `Idempotency-Key: gen_${ulid}` header per Phase-1 contract D-11
- Wire SSE consumption per Phase-1 contract D-09/D-10 (envelope + `Last-Event-ID` resume + Postgres-as-source-of-truth fallback)
- Wire fixture-mode toggle (`MCPGEN_FRONTEND_MODE=fixtures|live`) — Wave 1 demos run against `@mcpgen/engine-fixtures`
- Wire dashboard data fetching (`GET /api/v1/deployments` + `GET /api/v1/usage/hourly` — these BFF endpoints are stubbed by Phase 1 / filled in Phase 6)
- Wire Logto Cloud SDK (`@logto/next`) for email + GitHub providers (no Google/Twitter/Apple per CTRL-02); session middleware on dashboard routes only
- Wire Sentry source-map upload via `@sentry/nextjs` (DSN already wired empty in Phase 1; Phase 7 confirms the build-time upload path on Vercel works)
- Visual-lock CI guard in `.github/workflows/frontend-ci.yml` + Playwright screenshot-diff regression as a redundant safety net on the rendered output of the 9 locked screens

**Out of scope (explicit, will be later phases or other workstreams):**
- ANY edit to the locked JSX, HTML, CSS, tokens, or assets — RULES.md constraint, not a question, not a "but in this case…"
- Porting `screen-*.jsx` / `ui.jsx` / `tokens.jsx` / `app.jsx` to TypeScript or recreating them as TSX — explicitly forbidden
- Replacing `global.css` with Tailwind utility classes or CSS Modules — `global.css` is the locked stylesheet
- Adding shadcn/ui or any other component library — the locked `ui.jsx` IS the component library
- Implementing `POST /api/v1/generate` itself — Phase 1 contract owner; Phase 8 ops workstream owns auth wiring; the BFF stub already returns 501 with Idempotency-Key echo per Phase 1 commit `ee60dee`
- Implementing the engine that produces SSE events — Phases 2–5 (`engine` workstream)
- Implementing the Dispatch Worker / tenant Worker / one-click deploy backend — Phase 6 (`runtime` workstream)
- Implementing Stripe checkout flow — Phase 8 (`ops` workstream); Phase 7 wires the *UI* of pricing page only and links to a placeholder checkout URL behind `?fixtures=true` query param until Phase 8 lands
- Implementing Drift Watcher backend — Phase 8; Phase 7 wires the drift surface in dashboard to a placeholder fixture
- Inline editing of tool descriptions in preview — v1.x backlog (`FE-06` / `GEN-15`)
- In-browser tool execution playground — v1.x backlog (`FE-06`)
- Markdown / PDF export of Quality Report — v1.x backlog (`FE-07`)
- Adding new screens or new copy not present in the locked design — UX flow doc is the copy authority for placeholder text only
- Storybook (D-27 below — explicitly excluded)

</domain>

<decisions>
## Implementation Decisions

> All decisions below were auto-selected per `--auto` mode; rationale captures *why* the recommended option was chosen so downstream agents (researcher, planner) understand the lock-in. Decisions reflect the user's mid-discussion clarification: locked JSX stays AS-IS; wire-up code lives alongside in new directories.

### A. Locked-UI handling — **NO migration, NO port to TSX**

- **D-01: The locked JSX/HTML/CSS files at their current `apps/web/src/` paths are the canonical source of truth and ship to production unchanged.** Next.js 15 compiles `.jsx` natively via SWC (no Babel config needed). `global.css` is imported once in `app/layout.tsx` to apply tokens app-wide. Tokens from `tokens.jsx` and primitives from `ui.jsx` are imported by route segments without modification. *Rationale:* user clarification 2026-04-26 + RULES.md UI-LOCKED. Any rewrite — no matter how "clean" — drifts the visual output and burns weeks of solo time without ICP value. Next.js 15 + React 19 happily render JSX produced for React 18; the prototype's UMD-React-18 + in-browser-Babel + unpkg setup is *only* the development harness, not the locked artifact — what's locked is the JSX file content + global.css, which Next compiles at build time.
- **D-02: `apps/web/src/MCPGen.html` (the in-browser-Babel prototype harness) is kept as a reference artifact only.** Its existence does NOT mean we serve it from Next.js. Routes import the screen JSX directly via the App Router. The HTML file remains in-place to preserve the visual-lock baseline (the rendered output of `MCPGen.html` is what we screenshot-diff against), but it is not a runtime entry point.
- **D-03: Pre-commit hook regex re-pointed in Phase 7 Plan 1 first task** to actually-locked paths:
  ```
  UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
  ```
  Same one-shot escape hatch via `apps/web/.unzip-commit-allowed` marker (currently still present from Phase 1 since it was never consumed) — the regex-update commit consumes the marker, then the hook is permanently armed. Plus: a `.github/workflows/frontend-ci.yml` job runs `git diff --name-only origin/main HEAD -- $UI_LOCKED_PATHS` and fails if non-empty unless the PR includes a paired `docs/decisions/<date>-ui-lock-bump.md` ADR. Mirrors the Phase-1 D-13 launch-criteria-thresholds pattern (locked constants + paired ADR).
- **D-04: Playwright screenshot-diff regression** runs on every Phase 7 PR against the 9 locked screens (landing, auth, canvas, stream, preview, quality, deploy, dashboard, playground), rendered via the real Next.js build. Acceptance: ≤0.1% pixel delta vs. the baseline screenshots captured from `MCPGen.html` rendered in the prototype harness. This is a redundant safety net to the file-diff CI guard — catches subtle regressions like a stray `<Suspense>` wrapper changing layout.

### B. Next.js 15 routing & screen-to-route mapping

- **D-05: App Router (NOT Pages Router); each existing screen file maps 1:1 to one route segment, server-rendered where possible.** *Rationale:* App Router is the canonical path for streaming SSE and React 19 Server Components; Pages Router has worse Suspense story and would force a future migration.
- **D-06: Route map (locked here so planner doesn't relitigate):**
  - `screen-landing.jsx` → `app/page.tsx` (Server Component shell; client island for the spec-URL form imports `screen-landing.jsx` directly)
  - `screen-auth.jsx` → `app/(auth)/sign-in/page.tsx` + `app/(auth)/sign-up/page.tsx` (route group; Logto SDK handles redirects; the same JSX renders both via prop)
  - `screen-canvas.jsx` → `app/generate/page.tsx` (server entry; renders the spec-URL submit canvas state)
  - `screen-stream.jsx` → `app/generate/[jobId]/page.tsx` (Server Component shell + `'use client'` SSE consumer island that wraps the JSX)
  - `screen-playground.jsx` → `app/generate/[jobId]/playground/page.tsx` (live SSE progress view)
  - `screen-preview.jsx` → `app/generate/[jobId]/preview/page.tsx` (renders `FinalTool[]` + full code; transparency principle)
  - `screen-quality.jsx` → `app/generate/[jobId]/quality/page.tsx` (F2/F3 badge + per-tool rubric breakdown)
  - `screen-deploy.jsx` → `app/generate/[jobId]/deploy/page.tsx` (one-click deploy CTA + Claude Desktop config block)
  - `screen-dashboard.jsx` → `app/dashboard/page.tsx` (Logto-protected; lists deployed servers + usage)
  - Pricing — composed from `ui.jsx` primitives in a tiny `app/pricing/page.tsx` (no dedicated screen JSX exists in the locked set; this is a new file in the wire-up surface, not a visual addition — copy comes from `mcpgen-ux-flow.md` §pricing). If user disputes this composition counts as "new visual", drop pricing route and inline a placeholder until Phase 8.
- **D-07: `app/layout.tsx` owns the global shell** — imports `global.css` once (so locked styles apply app-wide), sets up `next/font/google` for Instrument Serif + Inter + JetBrains Mono + Fraunces (PP / Berkeley fall through to free fonts as the prototype already does), provides Logto session, TanStack Query, Sentry boundary. The layout itself uses ONLY locked primitives from `ui.jsx`.

### C. Data layer & state management

- **D-08: TanStack Query 5.x for server state (deployments, usage aggregates, generation history). Native React 19 hooks (`useState` / `useReducer`) for local UI state. Custom `useGenerationSSE` hook for SSE consumption. NO Zustand / Jotai / Redux — adding a third state library is YAGNI for a wire-up phase.** *Rationale:* TanStack Query already declared in `apps/web/package.json` (Phase 1 commit `ee60dee`); built-in SSE/streaming patterns; pairs cleanly with Server Components. *Recommended option*: minimal stack for solo founder; matches the "no premature abstractions" rule from CLAUDE.md.
- **D-09: SSE consumption uses `eventsource-parser@3` (already in `apps/web/package.json`) with native `fetch()` + ReadableStream — NOT `EventSource` Web API.** *Rationale:* `EventSource` cannot send custom headers (we need `Authorization` for Logto session and `Last-Event-ID` for resume), is fire-and-forget on errors, and cannot send POST. Native `fetch()` + `eventsource-parser` is the canonical Next.js 15 / React 19 pattern, supports backpressure via ReadableStream, and gives explicit control over `Last-Event-ID` resume.
- **D-10: SSE hook contract (`apps/web/src/lib/sse/use-generation-sse.ts`):** accepts `{ jobId, lastEventId? }`, returns `{ events: SseEvent[], status: 'connecting'|'streaming'|'reconnecting'|'completed'|'failed', resume(): void }`. Internally:
  1. On mount, query `GET /api/v1/jobs/{jobId}` (Postgres source-of-truth fallback per Phase-1 D-09) for current status + `last_known_event_id`
  2. If `status` ∈ `{completed, failed}` → render terminal state, do NOT open SSE
  3. Otherwise open SSE to `GET /api/v1/jobs/{jobId}/stream` with `Last-Event-ID: ${last_known_event_id}` header (path matches Phase-1 BFF route in `apps/api/src/routes/v1/jobs/stream.ts` from commit `ee60dee`)
  4. Parse via `eventsource-parser@3` per envelope schema in `packages/contracts/src/generation-api.ts` (D-10 from Phase 1)
  5. On disconnect/error: 3 retries with exponential backoff (1s, 2s, 4s); after that fall back to polling `GET /api/v1/jobs/{jobId}` every 2s until status is terminal
- **D-11: "Page reload mid-generation" test is mandatory in this phase's acceptance** — Playwright test loads `/generate/[jobId]/playground`, kills the SSE socket at t=5s (via Playwright network interception), reloads the page, asserts the previous-event log is reconstructed from Postgres + new SSE events resume from the correct `event_id`. Per Pitfall #20 + ROADMAP Phase 7 SC #2.

### D. Idempotency-key handling

- **D-12: Client generates `Idempotency-Key: gen_${ulid}` (using `ulid` package) before submitting `POST /api/v1/generate`; key persists in `localStorage` keyed by `spec_url + spec_hash` for the duration of the form session.** *Rationale:* matches Phase-1 D-11 contract — server-supplied fallback exists, but client-side ULID gives deterministic retry from "Try again" buttons after network failures without creating a duplicate generation. *Plus:* `localStorage` survives page reloads of the canvas screen; once the response 202 lands with `job_id`, the key is rotated.
- **D-13: Add `ulid@^3` as a runtime dependency in `apps/web/package.json`** (not currently declared). Browser-safe ULID, ~1KB. *Version note:* RESEARCH.md "Standard Stack" verified `ulid@^3.0.2` via `npm view` 2026-04-26; v3 is API-identical to v2 with TS types + ESM-only export. Updated 2026-04-27 to align CONTEXT with RESEARCH/PATTERNS/Plan-07-01.

### E. Fixture-mode (Wave 1 unblocking before engine ships)

- **D-14: `MCPGEN_FRONTEND_MODE=fixtures` env var (set by `pnpm dev:fixtures` script) routes all generation API calls to a Next.js Route Handler at `app/api/v1/generate/route.ts` that returns 202 with a fixed `job_id` from `@mcpgen/engine-fixtures` and streams a pre-recorded SSE timeline.** *Rationale:* Phase-1 D-07 already locked 5 fixture-API set (Stripe, GitHub, Notion, Linear, Slack); reusing them in frontend mock mode means Wave 1 ships complete (form → SSE → preview → quality badge → mock deploy URL) before Phase 5 engine ships. The mock SSE timeline replays per-stage events with realistic timing (8–15s per stage); `last_event_id` resume is also supported by the mock so the Pitfall #20 reload test passes in fixture mode too.
- **D-15: When `MCPGEN_FRONTEND_MODE=live` (default in `pnpm build` and Vercel preview / production):** all `/api/v1/*` requests proxy through Next.js Route Handlers that forward to the Hono BFF on the CF Workers domain (`api.mcpgen.dev` placeholder; final domain set in Phase 8). The Route Handlers exist primarily to attach the Logto session JWT and to add the `User-Agent: mcpgen-web/${version}` header. This proxy layer keeps cookies same-origin and avoids CORS preflights for SSE.
- **D-16: Vercel deploys default to `live` mode**, but a `pnpm preview:fixtures` shortcut + `?fixtures=true` query-string override (developer-only, gated by `process.env.NODE_ENV !== 'production'`) lets us demo the frontend without engine availability during Friday demos through W6.

### F. Auth integration (Logto)

- **D-17: `@logto/next@^4` SDK with email + GitHub providers (no Google / Twitter / Apple per CTRL-02 + RULES.md).** *Rationale:* canonical Next.js 15 path; native App Router support; same Logto Cloud tenant as Phase 1 D-14 (free tier dev; Pro pre-bought at W7). Phase 7 wires only the *frontend* path — Logto Cloud tenant config is Phase 1 ownership; Phase 8 owns the BFF middleware that validates Logto JWTs.
- **D-18: Auth boundary:** `app/dashboard/*` routes are protected via Logto middleware (`middleware.ts` at the app root). `app/page.tsx` (landing), `app/generate/*`, `app/pricing` are public — anonymous users can paste a URL and run free-tier generation against fixtures. Authenticated users get persistent generation history + dashboard. The first authenticated generation is "claimed" from the anonymous session via the BFF `claim_generation` endpoint (Phase 8 owns implementation; Phase 7 wires the call shape only).
- **D-19: Session storage:** Logto's default cookie strategy (httpOnly, SameSite=Lax, Secure in production). NO localStorage tokens. Per CLAUDE.md security rules + Pitfall #12 (credential leak surface).

### G. Quality badge rendering (Wave 2)

- **D-20: F2/F3 badge tiers exactly per `docs/mcpgen-stage-f-design.md`:** premium (F1 pass + F2 ≥ 4.5 + F3 ≥ 0.85) · verified (F1 pass + F2 ≥ 4.0 + F3 ≥ 0.7) · standard (60–75) · needs_review (<60). Badge values come straight from the `QualityReport` JSON in the `generation.quality_report` Postgres column; thresholds imported as runtime constants from `packages/contracts/launch-criteria.ts` so any threshold change auto-flows to the UI without a manual rebump.
- **D-21: Free-tier UX (no F3 ran):** badge renders as `verified (F2-only)` with a tooltip "F3 agent eval not run on free tier — upgrade to Pro for full evaluation". Per CTRL-06 Free vs Pro mapping.
- **D-22: Public quality badge is opt-in** (per RULES.md §2.6 + PROJECT.md key decision); the dashboard exposes a "Make this badge public" checkbox per deployment, default unchecked. Phase 7 wires the toggle UI; backend storage is in Phase 8.

### H. One-click deploy + Claude Desktop config — Pitfall #30 (Wave 3)

- **D-23: Claude Desktop config block is generated server-side** (BFF returns `claude_desktop_config` JSON in the deploy response); the locked `screen-deploy.jsx` already has a config-block UI region — Phase 7 wires real values into it via props/data and adds a copy-to-clipboard handler in `lib/`. Browser cannot detect existing Claude Desktop config (sandboxed); Phase 7 surfaces detection only via *the CLI* (`mcpgen install <url>` Phase 6 capability) and adds the UI hint copy "Already have an `mcpgen` server in Claude Desktop? Run `mcpgen install --check` in your terminal first." (this copy goes into a placeholder slot in the locked JSX, not a new visual element).
- **D-24: Server-name uniqueness collision is detected at *deploy submit time*** (BFF returns 409 with suggested alternative names if `{tenant_short_id}-{spec_slug}` collides with the same user's existing deployments). Phase 7 wires the 409 response → surfaces a rename modal (the locked design has a generic modal primitive in `ui.jsx` — reused, not redrawn) with the suggested alternative pre-filled. Per Pitfall #30 second clause.
- **D-25: One-click "Open in Claude Desktop"** uses the `claude://` protocol handler when present (graceful no-op when not — falls back to copy-to-clipboard). Per `mcpgen-ux-flow.md` §10 hero flow. The CTA already exists in the locked `screen-deploy.jsx`; Phase 7 wires the `href`.

### I. Test strategy

- **D-26: Three test layers:**
  1. **Vitest unit tests** for `apps/web/src/lib/*` (SSE hook reconnect logic, idempotency-key generator, Claude Desktop config formatter, quality-badge tier mapper, fetch client error mapping) — fast, run on every commit
  2. **Playwright integration tests** for the 9 locked screens against `MCPGEN_FRONTEND_MODE=fixtures` — covers form-submit → SSE → preview → quality badge → deploy E2E without engine availability; runs on every PR
  3. **Playwright screenshot-diff** against the 9 locked screens (≤0.1% pixel delta acceptance); runs on every PR; failure blocks merge unless paired ADR exists. This is the redundant safety net to D-03's file-diff guard.
- **D-27: Mandatory acceptance test for Pitfall #20:** `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` — start generation, kill the SSE socket at t=5s (via Playwright network interception), reload, assert event log replay from Postgres + new events resume from `event_id`. Per ROADMAP Phase 7 success criterion #2. Runs in fixture mode in Wave 1 (against the mock SSE timeline) and re-runs in Wave 2 against real engine.
- **D-28: NO Storybook in MVP** (YAGNI — components are not reused outside Phase 7; locked design means the value of a separate component playground is low). Add post-launch if and only if a second product surface emerges.

### J. Sentry source-map upload

- **D-29: `@sentry/nextjs@^10` (already declared in Phase 1 with empty DSN); Vercel auto-uploads source maps via `withSentryConfig` wrapper.** *Rationale:* matches Phase-1 D-19 pattern (each app handles its own source-map upload); no extra CI step needed. Phase-1 commit `ee60dee` already wired `next.config.js` to use `withSentryConfig`.
- **D-30: `beforeSend` redaction filters strip `Authorization`, `X-Upstream-Auth`, `Cookie`, and any `request.url` query param matching `?key=` or `?token=`.** Per Pitfall #12 + CLAUDE.md privacy-LOCKED constraint. Phase 1 already wired the skeleton; Phase 7 fills the body.

### K. Wave gating & merge order — **execution deferral, not just merge deferral**

- **D-31: Wave 1 = start NOW.** Plan is written, tasks execute against Phase 1 contracts + BFF 501-stub + fixture-mode SSE. Wave 1 ends with a Vercel preview deployment that demonstrates: paste OpenAPI URL → fixture mode → mock SSE timeline → fixture preview render → mock deploy URL → Claude Desktop config block. Friday demo cadence target: end of W3 / start of W4.
- **D-32: Wave 2 = plan written in this phase, execution deferred** until Phase 5 (`engine` workstream) ships F2/F3 + real SSE events. Phase 7 plan files for Wave 2 exist with explicit `EXECUTION-BLOCKED-UNTIL: phase-5-merged` markers in their frontmatter so the executor agent refuses to start them prematurely. Wave 2 unblocks when `gsd-progress` confirms Phase 5 is merged AND the live `apps/api` `POST /api/v1/generate` returns real (non-501) responses against a sandbox spec.
- **D-33: Wave 3 = plan written in this phase, execution deferred** until Phase 6 (`runtime` workstream) ships Dispatch Worker + tenant Worker deploy + usage-event pipeline. Same `EXECUTION-BLOCKED-UNTIL: phase-6-merged` marker pattern. Wave 3 unblocks when one tenant Worker is deployed end-to-end and emits a usage event into TimescaleDB.
- **D-34: Three waves merge to `main` independently** (Wave 1 first, Wave 2 after Phase 5 engine merges, Wave 3 after Phase 6 runtime merges) per `docs/mcpgen-gsd-sprint-plan.md` merge order rules (`Foundation → Engine → Runtime → Ops → Frontend`). Frontend wire-up does NOT merge before its upstream phase. *Plus:* the frontend workstream branch is `feature/frontend-integration` (current branch); Phase 7 plans use `--ws frontend` flag and operate in this worktree.

### Folded Todos

*None — there are no pending todos in `.planning/todos/pending/`. Cross-reference checked.*

### Claude's Discretion

The following are intentionally NOT decided here — planner has flexibility:
- Specific Server Component / Client Component boundary (decided per-screen during planning based on which sub-trees need hooks)
- Server-side data fetching pattern (`fetch` cache strategy, `revalidatePath` vs `revalidateTag` invalidation) — pick the simplest per route
- Form validation library — `zod@^4` is already a dep; planner can use it directly or wrap in `react-hook-form` if cross-field validation gets complex
- Error boundary hierarchy depth — at minimum a root `error.tsx`, but per-route `error.tsx` can be added where helpful
- Whether to use Next.js Route Handlers or a thin Hono adapter for the `/api/v1/*` proxy — Route Handlers default; switch only if a concrete reason emerges
- Specific code-highlighting library for preview screen (`shiki@^1` is the suggested default — see Specific Ideas below — but planner may pick `prismjs` or even server-side rendering of pre-tokenized HTML if SSR-friendly highlighting becomes flaky)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase boundary & contracts
- `.planning/ROADMAP.md` §"Phase 7: Frontend Wire-Up" — phase goal + 4 success criteria + dependency graph (Wave 1 → Phase 1 contracts; Wave 2 → Phase 5; Wave 3 → Phase 6)
- `.planning/REQUIREMENTS.md` §"Frontend (FE)" — FE-01..05 acceptance criteria; FE-05 is the visual-lock constraint
- `.planning/phases/01-foundation/01-CONTEXT.md` D-04 (MCP SDK v1 pin), D-09/D-10 (SSE envelope + `Last-Event-ID` semantics), D-11 (idempotency-key conventions across 4 surfaces), D-08 (CF namespace strategy → tenant identity is `{tenant_short_id}-{spec_slug}` script name), D-14 (Logto Cloud free-tier scaffolded; Pro pre-bought W7)
- `packages/contracts/src/generation-api.ts` — `POST /api/v1/generate` request shape, SSE event envelope, error code enum, `Idempotency-Key` header convention (THE source of truth — read before wiring any HTTP call)
- `packages/contracts/src/launch-criteria.ts` — F2 ≥ 4.0 / F3 ≥ 0.7 / bundle thresholds as runtime constants; quality badge tier mapping imports from here
- `packages/contracts/src/usage-event.ts` — usage event shape; dashboard time-series consumes the TimescaleDB hourly aggregate of these
- `packages/ir/` — Zod source of truth for `Tool` / `FinalTool` / `QualityReport` / `ToolDescription` / `ToolAnnotations` / `ResponseConfig` / `RoutingRule` / `WorkflowDef` / `SmartIdSchema`; the preview screen renders `FinalTool[]` directly from this schema
- `packages/runtime-sdk/` — interface stub for tenant Worker SDK; dashboard "deployed servers" surfaces info that originates from this SDK's emit-site

### BFF endpoints (already scaffolded in Phase 1 commit `ee60dee`)
- `apps/api/src/routes/v1/generate.ts` — `POST /api/v1/generate` 501-stub w/ Idempotency-Key echo + `contract_version`; Phase 7 wires the frontend POST to this
- `apps/api/src/routes/v1/jobs/stream.ts` — `GET /api/v1/jobs/:id/stream` `streamSSE` route with `Last-Event-ID` per Phase-1 D-09; Phase 7 wires `useGenerationSSE` to this
- `apps/api/src/routes/_spike/sse.ts` — 90s SSE tester from Phase-1 D-15 spike; useful for local frontend dev when engine is offline
- `apps/api/src/index.ts` + `apps/api/wrangler.toml` — BFF entry + Hyperdrive binding (D-17 from Phase 1)

### Locked UI source — DO NOT EDIT
- `claude-design-ui/MCP-Gen.zip` — original locked design artifact (already extracted in Phase 1 commit `ee60dee`)
- `claude-design-ui/DESIGN.md` — design notes pointer
- `apps/web/src/MCPGen.html` — clickable prototype harness (in-browser Babel + UMD React 18 + unpkg) — kept as visual baseline reference; NOT a runtime entry
- `apps/web/src/screen-{landing,auth,canvas,stream,playground,preview,quality,deploy,dashboard}.jsx` — 9 locked screens; each maps 1:1 to a Next.js route (D-06)
- `apps/web/src/{ui,tokens,app,tweaks-panel}.jsx` — locked primitives + tokens + harness; imported as-is by route segments
- `apps/web/src/global.css` — locked stylesheet; imported once in `app/layout.tsx`
- `apps/web/src/uploads/` — locked image assets
- `apps/web/.unzip-commit-allowed` — Phase-1 escape-hatch marker for `check-ui-locked.sh`; Phase 7 first task consumes this when re-pointing the hook regex
- `.pre-commit-hooks/check-ui-locked.sh` — Phase-1 lock guard; Phase 7 Plan 1 first task updates the regex to actual locked paths
- `RULES.md` §"UI is LOCKED" — non-negotiable visual lock policy

### Engine fixtures (Wave 1 unblocking)
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` — 5 hand-crafted fixtures (`{IR, FinalTool[], QualityReport}`) authored in Phase 1 plan 01-07; mock-mode SSE timelines replay these
- `.planning/phases/01-foundation/01-CONTEXT.md` D-07 — fixture choice rationale + structure

### Pitfall mitigations referenced by phase
- `.planning/research/PITFALLS.md` #12 (credential leak into Sentry — `beforeSend` redaction is mandatory in `apps/web/sentry.client.config.ts`)
- `.planning/research/PITFALLS.md` #20 (SSE stream disconnect on Vercel cold start — Postgres state as source of truth, `last-event-id` resume, "page reload mid-generation" test mandatory)
- `.planning/research/PITFALLS.md` #30 (one-click Claude Desktop config collision — server-name `{tenant}-{spec_slug}` uniqueness check at deploy time + CLI-only config-merge detection because browser is sandboxed)

### UX / copy authority
- `docs/mcpgen-ux-flow.md` — copy and UX principles (visual is locked, but copy strings come from here when the locked JSX has placeholders); §3 (playground) + §4 (preview transparency principle) + §10 (60-second hero flow) + §9 (privacy mode, ICP-C edge case → v2)

### Engineering authority
- `docs/mcpgen-architecture.md` §3 (system layers), §6 (runtime plane — what dashboard renders), §7 (data model — what dashboard queries), §11 (privacy — what frontend must NEVER log)
- `docs/mcpgen-git-workflow-rules.md` — branch naming, atomic commits, conventional commits, NEVER `--no-verify`
- `docs/mcpgen-gsd-sprint-plan.md` §4 (Phase 7 frontend workstream layout), §5 (cross-workstream coordination), merge-order rules
- `CLAUDE.md` §10 (UX principles — 60-sec flow, CLI-first, transparency, progressive complexity, trust through transparency), §12 rule 15 (UI is LOCKED), §0 (`docs/` precedence chain)

### Stack decisions affecting wire-up
- `.planning/research/STACK.md` §6.1 (`@modelcontextprotocol/sdk@^1` pin — though not directly used by web, it's the schema target for the `FinalTool` shape rendered in preview), §6.6 (Hono streamSSE 30s sub-request limit — pitfall #20 mitigation depends on this)
- `.planning/research/ARCHITECTURE.md` §R-A4 + §R-A7 (SSE resume semantics; Postgres as source of truth)
- `.planning/research/FEATURES.md` ICP-A/B/C surface — landing copy and dashboard surfaces should not contradict ICP framing

### Phase-1 commit referenced throughout
- `ee60dee` — `feat(01-05): scaffold apps/web (locked UI) + apps/api (Hono BFF) + apps/dispatch (CF WfP stub)` — the commit that unzipped the locked UI into `apps/web/src/` and froze it. Phase 7 builds on this baseline without disturbing it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 scaffolding, commit `ee60dee`)
- `apps/web/package.json` — Next.js 15.x + React 19.x + Tailwind 4.x + Sentry 10.x + TanStack Query 5.x + `eventsource-parser@^3` + `zod@^4` + `@mcpgen/contracts` workspace dep already declared; Phase 7 only adds `@logto/next@^4` + `ulid@^3` + `@playwright/test` (devDep) + `shiki@^4` (dep, for preview code highlighting; planner can swap)
- `apps/web/sentry.{client,edge,server}.config.ts` — Sentry SDK skeleton already wired (empty DSN per Phase-1 D-19 + `beforeSend` skeleton per commit `ee60dee` description); Phase 7 fills `beforeSend` body with the redaction list from D-30
- `apps/web/next.config.js` — Phase 1 wraps with `withSentryConfig`; Phase 7 enables Tailwind 4 plugin and adds `@logto/next` middleware support
- `apps/web/tsconfig.json` — Phase 1 scaffold; Phase 7 enables `allowJs: true` so TS files in `app/` and `lib/` can import the locked `.jsx` directly
- `apps/web/src/{MCPGen.html, screen-*.jsx, ui.jsx, tokens.jsx, app.jsx, tweaks-panel.jsx, global.css, uploads/}` — LOCKED. Imported by route segments without modification.
- `apps/api/src/routes/v1/generate.ts` + `apps/api/src/routes/v1/jobs/stream.ts` — BFF stubs ready to wire to (501 + 90s SSE tester respectively)
- `packages/contracts/` — generation-api + usage-event + launch-criteria + idempotency Zod schemas; the BFF and frontend share the contract types via workspace dependency `@mcpgen/contracts`
- `packages/ir/` — `FinalTool` Zod source-of-truth; the preview screen renders `FinalTool[]` directly
- `packages/engine-fixtures/` — fixture set ships with ULID `event_id` timelines for mock-mode SSE replay

### Established Patterns (from Phase 1 plans 01-01..08)
- Workspace deps via `@mcpgen/<pkg>` workspace protocol; never `file:` paths
- Pre-commit hooks: gitleaks + ruff + eslint + mypy + conventional-pre-commit + ui-locked-guard; NEVER `--no-verify`
- Conventional Commits 1.0.0 mandatory; atomic commits; squash-merge only
- Per-workstream CI workflow files in `.github/workflows/` (`frontend-ci.yml` already exists as a thin entry-point marker per Phase-1 D-06; Phase 7 fills it)
- Locked-threshold enforcement pattern (Phase-1 D-13): runtime constants + paired ADR pre-commit gate. Phase 7 mirrors this for the visual lock (D-03 + D-04)
- Cross-workstream test ownership policy (Phase-1 D-21): frontend ws owns `apps/web/**` tests; cross-cutting failures escalate to MAIN as `chore(contracts):` PR
- Test ULIDs use predictable repeating-A pattern (Phase-1 commit `ee60dee` decision) to avoid gitleaks generic-api-key false positives — Phase 7 e2e tests follow the same pattern

### Integration Points (where new wire-up code connects)
- `apps/web/src/app/api/v1/*/route.ts` (Next.js Route Handlers, Phase 7 NEW) → `apps/api` Hono BFF endpoints (over HTTP); shared types via `@mcpgen/contracts`
- `apps/web/src/lib/sse/use-generation-sse.ts` (Phase 7 NEW) → Hono `/api/v1/jobs/{jobId}/stream` SSE endpoint defined in Phase-1 D-09 and scaffolded in `apps/api/src/routes/v1/jobs/stream.ts`
- `apps/web/src/app/**/page.tsx` (Phase 7 NEW) → import locked `apps/web/src/screen-*.jsx` AS-IS (no modification)
- `apps/web/src/middleware.ts` (Phase 7 NEW) → Logto Cloud tenant scaffolded in Phase 1 plan 01-07 (manual config; credentials in `.env.local` per memory)
- Vercel deploy target — already linked at the repo level (Phase 1 plan 01-05 scaffold confirmed Next.js builds; Phase 7 finishes the build-deploy contract)
- Dashboard data → BFF endpoints (`GET /api/v1/deployments`, `GET /api/v1/usage/hourly`) which are *not yet implemented* — Phase 7 stubs them against `@mcpgen/engine-fixtures` in fixture mode and lets Phase 8 fill the live path

</code_context>

<specifics>
## Specific Ideas

- **Hero flow target: paste-OpenAPI-URL → 60s → Claude Desktop config block** (PROJECT.md core value + ux-flow §10). Phase 7 acceptance includes a Playwright timing assertion: from form-submit to deploy-screen-rendered ≤ 60s in fixture mode (live mode acceptance lives in Phase 9 integration).
- **Transparency principle: "full code visible at every step"** (FE-03 + ux-flow §4). Preview screen renders the full Stage-E-generated TypeScript bundle (or its fixture equivalent) in a syntax-highlighted code panel — `shiki@^1` suggested for SSR-friendly highlighting; planner has discretion on the specific lib choice. The locked `screen-preview.jsx` already has a code-panel slot — Phase 7 wires content into it; no visual change.
- **Friday demo cadence (per Phase-1 OPS-01 + sprint plan §6.1):** Phase 7 plans must each produce a recordable demo clip; Wave 1 demo = "paste URL → fixture-mode generation → preview → quality badge → mock deploy URL"; Wave 2 demo = same flow against real engine; Wave 3 demo = end-to-end including dashboard with usage events. Friday W3/W4 = Wave 1 demo; subsequent waves on the Friday after their upstream phase merges.
- **No Berkeley Mono / PP fonts in production deployment** — they're licensed; the prototype already falls through to free fonts (Inter, Instrument Serif, JetBrains Mono, Fraunces) via `local('PP Editorial New')` + cdnfonts fallback; Phase 7 keeps that fallthrough chain via `next/font/google`. Visual-lock CI tolerates the font-fallback diff (already tolerated in the prototype's local font lookup).
- **Mode banner:** when `MCPGEN_FRONTEND_MODE=fixtures`, render a small persistent banner "Fixture mode — engine not connected" so demos at Friday cadence don't accidentally claim the engine is live. Banner is composed entirely from existing locked `ui.jsx` primitives — does not introduce new visual elements. Render none in production builds.
- **The Phase-1 marker file `apps/web/.unzip-commit-allowed` is currently still present** (it should have been consumed by the unzip commit but the hook regex didn't match the actual unzip target). Phase 7 Plan 1 first commit removes the marker simultaneously with re-pointing the hook regex, in a single atomic commit `chore(07-01): re-point ui-locked-guard regex to actual locked file paths`.

</specifics>

<deferred>
## Deferred Ideas

> Ideas that came up but belong in other phases. Don't lose them.

- **In-browser tool execution playground** ("Try this tool" button in preview that runs the generated MCP server in a sandbox) — backlog `FE-06`; ux-flow §3 calls it "the most important screen" but MVP ships static preview + "Try in Claude Desktop" CTA only. Reason: requires a hosted sandbox runtime (out of scope) and adds significant security surface.
- **Markdown / PDF export of Quality Report** — backlog `FE-07`; sales artifact for ICP-B API providers. Reason: post-launch nice-to-have, not on critical path to first 100 paying users.
- **Inline edit description in preview screen with diff against generated version** — backlog `GEN-15`. Reason: requires Pass-2-rerun-tool-only capability not in MVP.
- **Tool-level "regenerate this one"** — backlog `GEN-14`. Reason: same as above; modifies engine retry orchestration.
- **`mcpgen logs --tail` CLI subcommand** — backlog `CTRL-11`. Reason: CLI feature, not frontend.
- **Status badge SVG endpoint per deployment** — backlog `CTRL-14`. Reason: post-launch sharing feature.
- **Multi-region deploy** — out-of-scope per PROJECT.md. Reason: solo-friendly ops.
- **A/B deploys + canary releases / custom domains for tenant Workers** — backlog `CTRL-12` + `CTRL-13`.
- **SSO / Team plan / RBAC** — backlog `AUTH-01` + `AUTH-02`. Reason: solo-dev / solo-org ICP comes first.
- **Storybook component playground** — explicitly NOT in MVP per D-28. Reason: locked design + single product surface = no value.
- **In-frontend collision detection of existing Claude Desktop config** — surfaced via CLI only per D-23. Reason: browser sandbox prevents reading local FS.
- **Port locked JSX → TSX / re-style with Tailwind utility classes / replace `ui.jsx` primitives with shadcn/ui** — explicitly forbidden by user 2026-04-26 + RULES.md UI-LOCKED. Reason: visual drift + zero ICP value + weeks of solo time burned.
- **Pricing page implementation that introduces new visual elements** — D-06 composes pricing from existing `ui.jsx` primitives only; if even that feels like a visual addition during planning, drop pricing route and inline a placeholder until Phase 8 ships Stripe products.

### Reviewed Todos (not folded)
- *None — `.planning/todos/pending/` was empty when checked.*

</deferred>

---

*Phase: 07-frontend-wire-up*
*Context gathered: 2026-04-26*
*Auto-mode log: 11 gray areas auto-selected (A–K above); recommended option chosen for each; 34 decisions captured (D-01 through D-34); single-pass per Auto-mode pass cap. Mid-discussion user clarification 2026-04-26 narrowed scope from "JSX → TSX migration" to "wire-up only, no visual touches", and clarified Wave 2-3 deferral is execution-deferred (not just merge-deferred) — D-01/D-02 + K. Wave gating reflect the corrected scope.*
