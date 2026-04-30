# Phase 7: Frontend Wire-Up - Research

**Researched:** 2026-04-26
**Domain:** Next.js 15 App Router wire-up against locked global-React JSX prototype + Hono BFF SSE consumption + Logto Cloud auth + Vercel deploy
**Confidence:** HIGH (locked artifacts + Phase-1 contracts inspected directly; library APIs verified via Context7 + npm registry; environment availability confirmed)

## Summary

Phase 7 wires the Phase-1 locked Claude-Design prototype JSX (already extracted into `apps/web/src/`) to the Phase-1 frozen contracts (`POST /api/v1/generate` + per-job SSE) and to the Phase-6 deferred dashboard endpoints. The user's mid-discussion clarification (2026-04-26) drops "JSX → TSX migration" and "shadcn/ui port" — the locked `.jsx` files at their existing paths are the lock target, and Next.js 15 SWC compiles `.jsx` natively without modification.

The single non-trivial integration challenge is **the locked JSX uses a global-React/UMD prototype harness pattern** (no `import`/`export`; `React`, `Btn`, `TopBar`, `Icon`, etc. are read as globals; each screen registers itself as `window.<ComponentName>`; `app.jsx` mounts via `ReactDOM.createRoot()` directly). Naive `import './screen-landing.jsx'` from a Next.js Server Component will fail because `React` is referenced but not imported, and dependent globals (`Btn`, `Icon`, `TopBar`) are sequenced via `<script>` tags in `MCPGen.html`, not via ESM. **This is the single architectural decision that must be locked in Plan 07-01.**

The recommended path (verified against Next.js 15 docs and the locked file contents): use `next/dynamic` with `{ ssr: false }` to load the prototype as a client-only entrypoint, **plus** a tiny harness shim that (a) exposes `React`/`ReactDOM` on `window` before screen JSX evaluates, (b) imports each screen file in dependency order so the `window.<ComponentName>=<ComponentName>` assignments at the bottom of each file run, (c) hands the resulting `window.Landing`, `window.Preview`, … to a router-aware wrapper Client Component which intercepts the locked screens' callback props (`onMakeIt`, `onContinue`, `onDeploy`) to navigate via Next's `useRouter`, and feeds the locked `sample` prop with real (or fixture) data. **No JSX file is modified; the harness is new code in `apps/web/src/lib/jsx-bridge/`.**

**Primary recommendation:** Plan 07-01 (Wave 1, first task) re-points `.pre-commit-hooks/check-ui-locked.sh` to the actual locked file regex AND scaffolds the `lib/jsx-bridge/` shim BEFORE any route file is written. Routes thereafter import only from the bridge, never directly from the JSX. SSE consumption uses `fetch()` + `eventsource-parser@3` `EventSourceParserStream` against a TransformStream pipeline (Node ≥18 / Cloudflare Workers / Vercel Edge runtime all support it). Fixture-mode is a single `app/api/v1/generate/route.ts` Route Handler and `app/api/v1/jobs/[id]/stream/route.ts` Route Handler that streams a synthetic ULID-monotonic SSE timeline from `@mcpgen/engine-fixtures`; `Last-Event-ID` resume is implemented in the same handler (~70 LoC) so Pitfall #20 reload-test passes in fixture mode too.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Form submission (`POST /api/v1/generate` with `Idempotency-Key`) | Frontend Server (Next.js Route Handler proxy) | Browser (form state, ULID generation, localStorage idempotency persistence) | Idempotency key generated client-side per D-12 for retry determinism; Route Handler attaches Logto session cookie + forwards to Hono BFF on CF Workers |
| SSE consumption (`GET /api/v1/jobs/:id/stream`) | Browser (fetch + ReadableStream + eventsource-parser) | Frontend Server (Next.js Route Handler proxy in live mode; Route Handler streaming synthetic timeline in fixture mode) | `EventSource` Web API cannot send custom headers (Authorization, Last-Event-ID); native fetch + parser is the canonical Next.js 15 pattern (D-09) |
| Page-reload mid-generation resume | Browser (read `last_known_event_id` from `GET /api/v1/jobs/:id`, send via `Last-Event-ID` header) | API/Backend (Postgres `pending_callbacks` is source of truth per D-09; Phase 8 ships the replay logic) | UX nicety on top of authoritative server state; Pitfall #20 |
| Auth (sign-in / sign-up / session check) | Frontend Server (`@logto/next/server-actions` + middleware on `/dashboard/*`) | Browser (sign-in/sign-out trigger components — `'use client'`) | Logto SDK uses httpOnly cookies (D-19); session validation in Server Components or middleware |
| Locked JSX rendering | Browser (client-only via `next/dynamic` `{ ssr: false }`) | Frontend Server (Server Component shells per route segment own data fetching + pass props to client islands) | The locked JSX uses `React.useState`, `useEffect`, refs, and `requestAnimationFrame` — pure client; SSR adds zero value and would crash on `window.MCPTokens` lookup |
| Code highlighting in preview (FE-03 transparency) | Frontend Server (Shiki `codeToHtml` in Server Component returns pre-tokenized HTML) | Browser (renders `dangerouslySetInnerHTML`) | SSR-friendly per Shiki Next.js pattern; zero client-side bundle bloat |
| Dashboard time-series queries (deployments + usage) | Frontend Server (Server Component prefetch via TanStack `prefetchQuery` + `HydrationBoundary`) | Browser (interactive filtering, refetch) | Phase 6/8 own the BFF endpoints; Phase 7 wires fetch shape against contracts |
| Quality badge tier mapping | Browser (pure function, imports `LAUNCH_CRITERIA` from `@mcpgen/contracts`) | — | Tier thresholds are a runtime constant; no server round-trip needed once `QualityReport` JSON is in hand |
| Sentry error capture | Browser + Frontend Server (`@sentry/nextjs` covers both via `sentry.{client,edge,server}.config.ts`) | — | Phase-1 D-19 already wired; Phase 7 fills `beforeSend` redaction body |
| Fixture-mode SSE simulation | Frontend Server (Next.js Route Handler streaming pre-recorded ULID timeline from `@mcpgen/engine-fixtures`) | — | Wave 1 unblocking; lives entirely in Next.js, no separate mock server |
| Visual-lock CI guard | CI (file-diff via pre-commit hook + GitHub Actions; pixel-diff via Playwright `toHaveScreenshot`) | — | D-03/D-04 redundant safety nets |

## Project Constraints (from CLAUDE.md + RULES.md + 07-CONTEXT.md)

These are non-negotiable directives the planner MUST verify compliance against; treat them with the same authority as locked decisions.

### From CLAUDE.md §10 + §12 rule 15
- **UI ЗАЛОЧЕН** (`claude-design-ui/MCP-Gen.zip` already extracted in Phase 1 commit `ee60dee`). FORBIDDEN: change visual / layout / typography / copy / tokens / `global.css`. Frontend phase = wire-up only.
- 60-second hero flow target: paste OpenAPI URL → 60s → Claude Desktop config block. Phase 7 wires the *path*; Phase 9 owns end-to-end timing acceptance.
- Trust through transparency: every step shows full code (FE-03; preview screen renders full Stage-E-generated TS bundle).
- Show, don't tell: every step renders a metric (token savings, cost). Locked JSX already has the slots; Phase 7 wires real values.

### From RULES.md §5.7 (UI lock)
- ❌ Visual/layout/typography/copy changes forbidden.
- ❌ Re-drawing components or screens "to match my taste" forbidden.
- ❌ Replacing `ui.jsx` primitives with shadcn/ui (or any other library) forbidden.
- ❌ Replacing `global.css` with Tailwind utility classes forbidden.

### From RULES.md §4.3 (Privacy LOCKED)
- ❌ NEVER log spec content (often internal API), upstream API responses (PII), upstream auth credentials.
- ✅ MAY log: generation metadata, tool names, IR structure, performance metrics, error traces, content_hash (sha256).
- Sentry `beforeSend` MUST strip `Authorization`, `X-Upstream-Auth`, `Cookie`, query params matching `?key=`/`?token=` (D-30 + Pitfall #12).

### From CLAUDE.md global rules
- Comments in English only.
- Functional programming preferred; OOP only for connectors. Pure functions; no parameter mutation.
- Strict typing everywhere; no `Any` / `unknown` / `Dict[str, Any]`.
- All imports at top of file.
- Single-purpose functions — no flag parameters that switch logic.
- External API calls: retries with warnings, then raise the last error.
- Error messages must include enough context to debug (request params, response body, status codes).
- Use structured logging fields, not interpolated strings.
- Maximum 3 attempts per stuck issue, then STOP and explain.

### From `docs/mcpgen-git-workflow-rules.md`
- Conventional Commits 1.0.0 mandatory: `type(scope): subject` ≤72 chars, imperative, no period.
- Atomic commits — one logical change per commit; if "and" appears in subject → split.
- Squash-merge only (linear history).
- NEVER `--no-verify`, NEVER force-push to main.
- Branch is already `feature/frontend-integration` (per CONTEXT.md D-34).

## User Constraints (from CONTEXT.md)

> Copied verbatim from `07-CONTEXT.md` § decisions and § domain. The planner MUST honor these as locked.

### Locked Decisions

**A. Locked-UI handling — NO migration, NO port to TSX**
- **D-01:** Locked JSX/HTML/CSS files at current `apps/web/src/` paths are the canonical source of truth and ship to production unchanged. Next.js 15 compiles `.jsx` natively via SWC. `global.css` imported once in `app/layout.tsx`. Tokens from `tokens.jsx` and primitives from `ui.jsx` imported by route segments without modification.
- **D-02:** `apps/web/src/MCPGen.html` is kept as a reference artifact only. Routes import the screen JSX directly via the App Router. The HTML is the visual-lock baseline (we screenshot-diff against its rendered output) but is not a runtime entry point.
- **D-03:** Pre-commit hook regex re-pointed in Phase 7 Plan 1 first task to:
  ```
  UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
  ```
  Same one-shot escape hatch via `apps/web/.unzip-commit-allowed`. Plus `.github/workflows/frontend-ci.yml` job runs `git diff --name-only origin/main HEAD -- $UI_LOCKED_PATHS` and fails if non-empty unless paired ADR exists. Mirrors Phase-1 D-13 launch-criteria pattern.
- **D-04:** Playwright screenshot-diff on every Phase 7 PR against the 9 locked screens. Acceptance: ≤0.1% pixel delta vs. baseline screenshots captured from `MCPGen.html` rendered in the prototype harness. Redundant safety net to D-03 file-diff guard.

**B. Next.js 15 routing & screen-to-route mapping**
- **D-05:** App Router (NOT Pages Router); each existing screen file maps 1:1 to one route segment, server-rendered where possible.
- **D-06:** Route map (locked): landing → `app/page.tsx`; auth → `app/(auth)/sign-in/page.tsx` + `app/(auth)/sign-up/page.tsx`; canvas → `app/generate/page.tsx`; stream → `app/generate/[jobId]/page.tsx`; playground → `app/generate/[jobId]/playground/page.tsx`; preview → `app/generate/[jobId]/preview/page.tsx`; quality → `app/generate/[jobId]/quality/page.tsx`; deploy → `app/generate/[jobId]/deploy/page.tsx`; dashboard → `app/dashboard/page.tsx`; pricing composed from `ui.jsx` primitives in tiny `app/pricing/page.tsx`.
- **D-07:** `app/layout.tsx` owns the global shell — imports `global.css` once, sets up `next/font/google` for Instrument Serif + Inter + JetBrains Mono + Fraunces, provides Logto session, TanStack Query, Sentry boundary.

**C. Data layer & state management**
- **D-08:** TanStack Query 5.x for server state. Native React 19 hooks for local UI state. Custom `useGenerationSSE` hook for SSE consumption. NO Zustand / Jotai / Redux.
- **D-09:** SSE consumption uses `eventsource-parser@3` with native `fetch()` + ReadableStream — NOT `EventSource` Web API.
- **D-10:** SSE hook contract (`apps/web/src/lib/sse/use-generation-sse.ts`) — see CONTEXT.md for full shape; key points: poll `GET /api/v1/jobs/{jobId}` first to determine current status; only open SSE if status not terminal; send `Last-Event-ID` header on connect; 3 retries exponential backoff (1s/2s/4s); fall back to polling every 2s if exhausted.
- **D-11:** "Page reload mid-generation" Playwright test is mandatory — kill SSE socket at t=5s, reload, assert previous-event log reconstructed from Postgres + new SSE events resume from correct `event_id`.

**D. Idempotency-key handling**
- **D-12:** Client generates `Idempotency-Key: gen_${ulid}` before submitting `POST /api/v1/generate`; persists in `localStorage` keyed by `spec_url + spec_hash` for the form session; rotates after 202 with `job_id`.
- **D-13:** Add `ulid@^2` as a runtime dependency in `apps/web/package.json`.

**E. Fixture-mode**
- **D-14:** `MCPGEN_FRONTEND_MODE=fixtures` env var routes generation API calls to a Next.js Route Handler that returns 202 with a fixed `job_id` from `@mcpgen/engine-fixtures` and streams a pre-recorded SSE timeline (8–15s per stage); `last_event_id` resume supported.
- **D-15:** When `MCPGEN_FRONTEND_MODE=live`: all `/api/v1/*` requests proxy through Next.js Route Handlers that forward to Hono BFF on CF Workers domain. Route Handlers attach Logto session JWT + `User-Agent: mcpgen-web/${version}`. Same-origin keeps cookies attached and avoids CORS preflights for SSE.
- **D-16:** Vercel deploys default to `live` mode; `pnpm preview:fixtures` shortcut + `?fixtures=true` query-string override (gated by `process.env.NODE_ENV !== 'production'`) for Friday demos through W6.

**F. Auth integration (Logto)**
- **D-17:** `@logto/next@^4` SDK with email + GitHub providers (no Google / Twitter / Apple). Same Logto Cloud tenant as Phase 1 D-14. Phase 7 wires only the *frontend* path; Phase 8 owns the BFF middleware that validates Logto JWTs.
- **D-18:** `app/dashboard/*` routes protected via Logto middleware. `app/page.tsx`, `app/generate/*`, `app/pricing` are public — anonymous users can run free-tier fixture-mode generation. First authenticated generation is "claimed" from the anonymous session via the BFF `claim_generation` endpoint (Phase 8 owns implementation; Phase 7 wires call shape only).
- **D-19:** Logto's default cookie strategy (httpOnly, SameSite=Lax, Secure in production). NO localStorage tokens.

**G. Quality badge rendering**
- **D-20:** F2/F3 badge tiers exactly per `docs/mcpgen-stage-f-design.md`. Badge values come from the `QualityReport` JSON in `generation.quality_report`; thresholds imported as runtime constants from `packages/contracts/launch-criteria.ts`.
- **D-21:** Free-tier UX (no F3 ran): badge renders as `verified (F2-only)` with tooltip.
- **D-22:** Public quality badge is opt-in. Dashboard exposes a "Make this badge public" checkbox per deployment, default unchecked. Phase 7 wires the toggle UI; backend storage in Phase 8.

**H. One-click deploy + Claude Desktop config**
- **D-23:** Claude Desktop config block generated server-side. Locked `screen-deploy.jsx` already has a config-block UI region — Phase 7 wires real values via props/data and adds a copy-to-clipboard handler in `lib/`. Browser cannot detect existing Claude Desktop config; Phase 7 surfaces detection only via *the CLI* and adds the UI hint copy "Already have an `mcpgen` server in Claude Desktop? Run `mcpgen install --check` in your terminal first."
- **D-24:** Server-name uniqueness collision detected at *deploy submit time* (BFF returns 409 with suggested alternative names if `{tenant_short_id}-{spec_slug}` collides). Phase 7 wires 409 → rename modal (using locked `ui.jsx` modal primitive) with suggested alternative pre-filled.
- **D-25:** One-click "Open in Claude Desktop" uses the `claude://` protocol handler when present (graceful no-op when not — falls back to copy-to-clipboard).

**I. Test strategy**
- **D-26:** Three test layers — Vitest unit tests for `apps/web/src/lib/*`, Playwright integration tests against `MCPGEN_FRONTEND_MODE=fixtures`, Playwright screenshot-diff (≤0.1% pixel delta).
- **D-27:** Mandatory acceptance test for Pitfall #20: `apps/web/tests/e2e/page-reload-mid-generation.spec.ts`.
- **D-28:** NO Storybook in MVP.

**J. Sentry source-map upload**
- **D-29:** `@sentry/nextjs@^10` (already declared); Vercel auto-uploads source maps via `withSentryConfig` wrapper.
- **D-30:** `beforeSend` redaction filters strip `Authorization`, `X-Upstream-Auth`, `Cookie`, and any `request.url` query param matching `?key=` or `?token=`.

**K. Wave gating & merge order — execution deferral, not just merge deferral**
- **D-31:** Wave 1 = start NOW. Plan written, tasks execute against Phase 1 contracts + BFF 501-stub + fixture-mode SSE.
- **D-32:** Wave 2 = plan written, execution deferred until Phase 5 ships. `EXECUTION-BLOCKED-UNTIL: phase-5-merged` markers in plan frontmatter.
- **D-33:** Wave 3 = plan written, execution deferred until Phase 6 ships. `EXECUTION-BLOCKED-UNTIL: phase-6-merged` markers.
- **D-34:** Three waves merge to `main` independently per `docs/mcpgen-gsd-sprint-plan.md` merge order rules (Foundation → Engine → Runtime → Ops → Frontend).

### Claude's Discretion (planner has flexibility)
- Specific Server Component / Client Component boundary per screen (decided per-screen during planning based on which sub-trees need hooks).
- Server-side data fetching pattern (`fetch` cache strategy, `revalidatePath` vs `revalidateTag` invalidation) — pick the simplest per route.
- Form validation library — `zod@^4` already a dep; planner can use it directly or wrap in `react-hook-form` if cross-field validation gets complex.
- Error boundary hierarchy depth — at minimum a root `error.tsx`; per-route `error.tsx` can be added where helpful.
- Whether to use Next.js Route Handlers or a thin Hono adapter for `/api/v1/*` proxy — Route Handlers default; switch only if a concrete reason emerges.
- Specific code-highlighting library for preview screen (`shiki@^1` is the suggested default — see Code Examples — but planner may pick `prismjs` or even server-side rendering of pre-tokenized HTML).

### Deferred Ideas (OUT OF SCOPE)
- In-browser tool execution playground ("Try this tool" button in preview) — backlog `FE-06`.
- Markdown / PDF export of Quality Report — backlog `FE-07`.
- Inline edit description in preview screen with diff against generated version — backlog `GEN-15`.
- Tool-level "regenerate this one" — backlog `GEN-14`.
- `mcpgen logs --tail` CLI subcommand — backlog `CTRL-11`.
- Status badge SVG endpoint per deployment — backlog `CTRL-14`.
- Multi-region deploy — out-of-scope per PROJECT.md.
- A/B deploys + canary releases / custom domains — backlog `CTRL-12` + `CTRL-13`.
- SSO / Team plan / RBAC — backlog `AUTH-01` + `AUTH-02`.
- Storybook component playground — explicitly NOT in MVP per D-28.
- In-frontend collision detection of existing Claude Desktop config — surfaced via CLI only per D-23.
- Port locked JSX → TSX / re-style with Tailwind utility classes / replace `ui.jsx` primitives with shadcn/ui — explicitly forbidden by user 2026-04-26 + RULES.md UI-LOCKED.
- Pricing page implementation that introduces new visual elements — D-06 composes pricing from existing `ui.jsx` primitives only; if even that feels like a visual addition during planning, drop pricing route and inline a placeholder until Phase 8 ships Stripe products.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FE-01** | Landing page wired to live `/api/v1/generate` job submission with `Idempotency-Key` header | `lib/idempotency/generate-key.ts` (`gen_${ulid}` per Phase-1 `GEN_ID_REGEX` in `packages/contracts/src/idempotency.ts`); Route Handler proxy to Hono BFF (`apps/api/src/routes/v1/generate.ts`) attaches Logto session JWT; localStorage persistence keyed by `${spec_url}+${spec_hash}` (D-12); error mapping per `GenerationErrorCode` enum (`invalid_spec`/`spec_too_large`/`rate_limited`/`cost_cap_exceeded`/`idempotency_key_replay`/`internal_error`) |
| **FE-02** | Generation playground consumes SSE callbacks per stage, recovers from disconnect via Postgres state read + `last-event-id` resume | `useGenerationSSE` hook (`lib/sse/use-generation-sse.ts`) using `fetch()` + `EventSourceParserStream` per `eventsource-parser@3` API ([CITED: github.com/rexxars/eventsource-parser/MIGRATE-v3.md]); polls `GET /api/v1/jobs/:id` first per D-10 step 1; sends `Last-Event-ID` header per `LAST_EVENT_ID_HEADER` constant (`packages/contracts/src/idempotency.ts`); pitfall #20 mitigation; Playwright reload test (D-11/D-27) — see Validation Architecture below |
| **FE-03** | Preview screen shows generated tool list, descriptions, parameters, annotations, response config, full code visible at every step (transparency principle) | Renders `FinalTool[]` from `@mcpgen/ir` Zod source-of-truth (the `FinalTool` shape is the canonical Pass-5 output: `inputSchema` + `outputSchema` + `annotations` + `response_config` + `description`); `shiki@^1` for SSR-friendly code highlighting in Server Component (`codeToHtml` returns HTML string) — confirmed canonical Next.js pattern [CITED: github.com/shikijs/shiki/blob/main/docs/packages/next.md]; locked `screen-preview.jsx` already has a code-panel slot |
| **FE-04** | One-click deploy from preview; dashboard shows deployed servers, usage events, costs, F2/F3 quality badge | Quality badge tier mapper imports `LAUNCH_CRITERIA` from `@mcpgen/contracts` (`F2_SMELL_MIN: 4.0` / `F3_AGENT_PASS_RATE_MIN: 0.7`); deploy flow wires 409 → rename modal (D-24); Claude Desktop config block (D-23) reads from BFF deploy response; dashboard time-series queries `GET /api/v1/usage/hourly` (TimescaleDB `usage_hourly` continuous aggregate per architecture §7.2 `usage_events` hypertable + matview); TanStack Query `prefetchQuery` + `HydrationBoundary` for SSR data hydration [CITED: github.com/tanstack/query advanced-ssr.md] |
| **FE-05** | Frontend phase = wire-up only; visual / layout / typography / copy must NOT be modified | Three-layer enforcement: (1) `.pre-commit-hooks/check-ui-locked.sh` re-pointed regex (D-03); (2) `.github/workflows/frontend-ci.yml` `git diff --name-only` job that fails on locked-path edits without paired ADR; (3) Playwright `toHaveScreenshot` against rendered `MCPGen.html` baseline at ≤0.1% pixel delta [CITED: github.com/microsoft/playwright/blob/main/docs/src/test-snapshots-js.md] (D-04) |

## Standard Stack

### Core (Phase 1 declared, Phase 7 verifies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `^15.0.0` (declared) — current registry: 16.2.4 | App Router + Route Handlers + SWC native JSX compilation | Already pinned in Phase 1 `apps/web/package.json`; React 19 Server Components support; canonical streaming-SSE Route Handler pattern — `[VERIFIED: npm view next version → 16.2.4]` `[CITED: docs/01-app/02-guides/streaming.mdx]` |
| `react` | `^19.0.0` | UI runtime | Phase 1 declared; locked JSX uses React 18 idioms which React 19 fully supports (no breaking changes for `useState`/`useEffect`/`useRef`/`createRoot`) |
| `react-dom` | `^19.0.0` | DOM renderer | Pairs with React 19 |
| `tailwindcss` | `^4.0.0` | (declared, not actively used by locked CSS) | Phase 1 declared; locked `global.css` is hand-written CSS-vars, NOT `@tailwind` directives — Tailwind is available for new wire-up code, but using it in route shells risks `<div>` class drift confusion. Recommendation: skip Tailwind classes in wire-up code; use inline `style={{}}` referencing the same CSS vars (`var(--ink)`, `var(--paper)`, `var(--border)`) the locked `global.css` defines. `[VERIFIED: head -40 apps/web/src/global.css → no @tailwind directives]` |
| `@sentry/nextjs` | `^10.50.0` | Error tracking + source-map upload via `withSentryConfig` | Phase 1 wired; `next.config.js` already wraps with `withSentryConfig`; source maps NEVER bundled into public artifact (T-1-07) |
| `eventsource-parser` | `^3.0.8` | SSE parsing of `data:`/`id:`/`event:` over fetch ReadableStream | `[VERIFIED: npm view eventsource-parser version → 3.0.8 matches]`; v3 is current major; `EventSourceParserStream` TransformStream API works in Node ≥18, Cloudflare Workers, Vercel Edge — exactly the runtimes Phase 7 spans `[CITED: github.com/rexxars/eventsource-parser README]` |
| `@tanstack/react-query` | `^5.0.0` | Server state for deployments + usage queries | Native Next.js 15 App Router support via `HydrationBoundary` + per-request `QueryClient` factory; `staleTime > 0` mandatory in SSR `[CITED: github.com/tanstack/query advanced-ssr.md]` |
| `zod` | `^4.3.6` | Form validation + contract validation | Phase 1 declared; matches `@mcpgen/contracts` Zod 4 source; Zod 4 native `z.toJSONSchema()` for any local form-derived schema work |
| `@mcpgen/contracts` | `workspace:*` | `GenerationApiRequest` / `GenerationApiResponse` / `GenerationSseEvent` / `LAUNCH_CRITERIA` / `IDEMPOTENCY_KEY_HEADER` / `LAST_EVENT_ID_HEADER` / `GEN_ID_REGEX` / `ULID_REGEX` | Frozen contract — read these from THIS package, never redeclare locally |
| `@mcpgen/ir` | `workspace:*` | `FinalTool` / `QualityReport` / `ToolDescription` / `ToolAnnotations` / `ResponseConfig` Zod source-of-truth | Preview/quality screens render directly from these schemas |

### Phase 7 ADDITIONS (per CONTEXT.md D-13 / D-17 / D-26 / D-04)

| Library | Version target | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `@logto/next` | `^4.2.10` | Logto Cloud auth (App Router server actions + middleware) | App Router has dedicated entry in Logto SDK; supports email + GitHub providers; Logto httpOnly cookie session — `[VERIFIED: npm view @logto/next version → 4.2.10]` `[VERIFIED: peerDependencies → next: ">=12"]` `[CITED: github.com/logto-io/docs quick-starts/framework/next-app-router/_integration.mdx]` |
| `ulid` | `^3.0.2` | Browser-safe ULID generator for `Idempotency-Key: gen_${ulid}` (D-12) | ~1KB; deterministic monotonic time-ordering matches Phase-1 `GEN_ID_REGEX = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/` (Crockford base32) — `[VERIFIED: npm view ulid version → 3.0.2]` Note: CONTEXT.md cites `^2`; `^3.0.2` is current major. Plan 07-01 must verify any breaking changes; ULID alphabet unchanged (Crockford base32). Recommendation: pin `ulid@^3` since regex is alphabet-based, not version-bound. |
| `@playwright/test` | `^1.59.1` (devDep) | E2E + screenshot-diff on locked screens | `[VERIFIED: npm view @playwright/test version → 1.59.1]` `toHaveScreenshot` API mature since v1.23; `maxDiffPixels` / `maxDiffPixelRatio` per-test or via `expect.toHaveScreenshot` config — `[CITED: github.com/microsoft/playwright/blob/main/docs/src/test-snapshots-js.md]` |
| `shiki` | `^4.0.2` (note: CONTEXT.md cites `^1`) | SSR-friendly code highlighting for preview screen full-code view | Server Component invokes `codeToHtml(src, { lang: 'ts', theme: 'github-dark' })` → returns HTML string; rendered via `dangerouslySetInnerHTML`; ZERO client bundle bloat — `[VERIFIED: npm view shiki version → 4.0.2]` `[CITED: github.com/shikijs/shiki/blob/main/docs/packages/next.md]`. **Discretionary** per CONTEXT.md "Claude's Discretion"; planner may pick `prismjs` or use Stage E's pre-tokenized HTML if available |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `eventsource-parser` + native `fetch()` | `EventSource` Web API | EventSource cannot send custom headers (`Authorization`, `Last-Event-ID`); fire-and-forget on errors; cannot send POST. Disqualified for Phase 7 use case (D-09). |
| `eventsource-parser` + native `fetch()` | `@microsoft/fetch-event-source` | Functional, but adds an extra dep when `eventsource-parser` already in `package.json`. Phase 1 chose `eventsource-parser`; no reason to flip. |
| TanStack Query | Zustand / Jotai | YAGNI for wire-up phase; TanStack Query covers server state perfectly; React 19 native hooks cover local UI state (D-08). |
| `next/dynamic({ ssr: false })` for locked JSX | Wrap `MCPGen.html` in iframe | Iframe breaks SEO, Suspense, auth cookie context, transparency principle. Disqualified in CONTEXT.md option-A discussion. |
| `next/dynamic({ ssr: false })` for locked JSX | Run Babel-standalone at runtime | Matches prototype but breaks SSR, hurts performance, blocks streaming SSE, needs CSP exceptions. Disqualified. |
| Server Components for locked screens | Pure Server Components | Locked JSX uses `useState` / `useEffect` / `requestAnimationFrame` / `window.MCPTokens` — pure client. SSR would crash on `window` lookup. Server-only is impossible without modifying the JSX. |
| Logto Cloud | NextAuth.js / Lucia / Iron-session | Project-locked to Logto in Phase 1 D-14 + RULES.md CTRL-02; flipping would deviate from frozen scope. |

### Installation (Plan 07-01 first task adds these deps)

```bash
# Wave 1 (Plan 07-01)
pnpm --filter=@mcpgen/web add @logto/next@^4 ulid@^3
pnpm --filter=@mcpgen/web add -D @playwright/test@^1.59

# Wave 2 (Plan 07-04+, blocked until Phase 5 merges)
pnpm --filter=@mcpgen/web add shiki@^4   # discretionary; planner may swap
```

**Version verification:** Before writing the Standard Stack table, the planner MUST run `npm view <package> version` for each Phase-7 addition and re-verify in 07-PLAN frontmatter — registry versions drift weekly.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                  Browser (locked JSX)                    │
                    │                                                          │
USER ─paste URL─→ Landing.jsx → onMakeIt() ───┐                                │
                                              │                                │
                    ┌────────── lib/jsx-bridge/ (NEW) ────────────────────────┐│
                    │ Loads window.React, then sequentially:                  ││
                    │  tokens.jsx → ui.jsx → screen-*.jsx                     ││
                    │ Re-exports window.Landing/Preview/Stream/... as ESM     ││
                    └─────────────────────────────────────────────────────────┘│
                                              │                                │
                    ┌────────── apps/web/src/app/ (Next.js 15 App Router) ────┐│
                    │ page.tsx ─Server Comp shell→ <ClientLanding {data}/>    ││
                    │ generate/page.tsx → form submit handler (Client) ──┐    ││
                    │ generate/[jobId]/page.tsx → useGenerationSSE hook  │    ││
                    │ middleware.ts → Logto session check on /dashboard/* ─┘  ││
                    └─────────────────────────────────────────────────────────┘│
                                              │                                │
                    ┌────────── apps/web/src/lib/ (NEW) ──────────────────────┐│
                    │ idempotency/generate-key.ts → gen_${ulid}               ││
                    │ sse/use-generation-sse.ts   → fetch+EventSourceParserStream││
                    │ api/generation-client.ts    → typed fetch client        ││
                    │ quality/badge-tier.ts       → tier mapping from LAUNCH_CRITERIA││
                    │ deploy/claude-config.ts     → copy-to-clipboard formatter││
                    └─────────────────────────────────────────────────────────┘│
                                              │                                │
                    ┌────── apps/web/src/app/api/v1/ (Route Handlers) ────────┐│
                    │ generate/route.ts  → MODE=fixtures: 202 + fixture id    ││
                    │                      MODE=live: proxy to Hono BFF       ││
                    │ jobs/[id]/stream/route.ts → MODE=fixtures: synth ULID   ││
                    │                              timeline; replay last_event_id││
                    │                              MODE=live: proxy stream    ││
                    │ jobs/[id]/route.ts → MODE=live: proxy GET (status)      ││
                    └─────────────────────────────────────────────────────────┘│
                                              │                                │
                    ───────────────────────────────────────────────────────────┘
                                              │
                                              ▼  HTTPS (live mode)
                                  ┌──────────────────────────┐
                                  │ apps/api (Hono on CF)    │
                                  │ POST /api/v1/generate    │
                                  │   501 in Phase 1 → real  │
                                  │   in Phase 5 (engine)    │
                                  │ GET  /api/v1/jobs/:id    │
                                  │ GET  /api/v1/jobs/:id/   │
                                  │      stream (streamSSE)  │
                                  │ GET  /api/v1/deployments │← Phase 6/8
                                  │ GET  /api/v1/usage/hourly│← Phase 6/8
                                  └──────────────────────────┘
                                              │
                              Phase 5 engine emits per-stage
                              ULID `event_id` events; on disconnect
                              the BFF replays from `pending_callbacks`
                              table (Phase 1 schema, Phase 8 logic)
```

### Component Responsibilities

| File (NEW) | Purpose | Lifetime |
|-----------|---------|----------|
| `apps/web/src/app/layout.tsx` | Imports `global.css`; sets `next/font/google`; provides Logto session, TanStack Query, Sentry boundary | 1 file (root layout) |
| `apps/web/src/middleware.ts` | Logto session check on `/dashboard/*` routes (D-18) | 1 file |
| `apps/web/src/app/page.tsx` | Landing — Server Component shell; client island wraps `window.Landing` from jsx-bridge | 1 file per route |
| `apps/web/src/app/(auth)/sign-in/page.tsx` + sign-up | Auth — Logto sign-in/sign-up via server actions | 2 files |
| `apps/web/src/app/generate/page.tsx` | Canvas — form submission handler (Client island) | 1 file |
| `apps/web/src/app/generate/[jobId]/page.tsx` | Stream — Server shell + Client island that drives `useGenerationSSE` and feeds `sample`-shaped state to `window.StreamLog` | 1 file |
| `apps/web/src/app/generate/[jobId]/{playground,preview,quality,deploy}/page.tsx` | Per-stage screens; each Server shell + Client wrapper | 4 files |
| `apps/web/src/app/dashboard/page.tsx` | Dashboard — Logto-protected; TanStack Query prefetch + HydrationBoundary | 1 file |
| `apps/web/src/app/pricing/page.tsx` | Pricing — composed from `ui.jsx` primitives (no new visual; plan-time gate to drop if it feels like a visual addition) | 1 file (or 0 if dropped) |
| `apps/web/src/app/api/v1/generate/route.ts` | POST proxy — fixtures vs live mode (D-14/D-15) | 1 file |
| `apps/web/src/app/api/v1/jobs/[id]/route.ts` | GET status proxy | 1 file |
| `apps/web/src/app/api/v1/jobs/[id]/stream/route.ts` | GET SSE stream — fixtures vs live mode | 1 file |
| `apps/web/src/lib/jsx-bridge/index.ts` | Loads locked screen JSX + tokens + ui as a side-effect import; exposes `window.<ComponentName>` symbols as typed ESM exports | 1 file (the linchpin) |
| `apps/web/src/lib/jsx-bridge/screens.tsx` | Per-screen React component wrappers that read from `window` (after dynamic import) and forward typed props | 1 file |
| `apps/web/src/lib/idempotency/generate-key.ts` | `gen_${ulid()}` + localStorage persistence (D-12) | 1 file |
| `apps/web/src/lib/sse/use-generation-sse.ts` | Custom hook per D-10 contract | 1 file |
| `apps/web/src/lib/api/generation-client.ts` | Typed fetch client against `@mcpgen/contracts` | 1 file |
| `apps/web/src/lib/api/dashboard-client.ts` | Typed queries for deployments + usage hourly | 1 file |
| `apps/web/src/lib/quality/badge-tier.ts` | `QualityReport → 'premium'\|'verified'\|'standard'\|'needs_review'` mapper using `LAUNCH_CRITERIA` constants | 1 file |
| `apps/web/src/lib/deploy/claude-config.ts` | Format Claude Desktop config block JSON; clipboard helper | 1 file |
| `apps/web/src/lib/fixtures/sse-timeline.ts` | Synthetic ULID-monotonic SSE timeline generator from `@mcpgen/engine-fixtures` (Wave 1) | 1 file |
| `apps/web/sentry.client.config.ts` (modify body — file already exists) | Fill `beforeSend` redaction body per D-30 | edit existing |
| `.pre-commit-hooks/check-ui-locked.sh` (modify regex — file exists) | Re-point to actual locked file regex (D-03) | edit existing |
| `.github/workflows/frontend-ci.yml` (extend marker — file exists) | Add real visual-lock guard job (D-03) + Playwright job (D-04) + Vitest job + Next.js build job | edit existing |
| `apps/web/playwright.config.ts` | Visual-diff threshold ≤0.1%; baseline storage | NEW |
| `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` | Pitfall #20 mandatory test (D-11/D-27) | NEW |
| `apps/web/tests/e2e/visual-lock.spec.ts` | Screenshot-diff against `MCPGen.html` baseline | NEW |
| `apps/web/tests/unit/*.test.ts` | Vitest unit tests for `lib/` | NEW |

### Pattern 1: Locked-JSX-as-Client-Only-Bridge

**What:** The locked JSX uses global `React.useState`, references `Btn`/`TopBar`/`Icon` as globals (defined in `ui.jsx`), reads `window.MCPTokens.makeCssVars` (defined in `tokens.jsx`), and the per-screen JSX files end with `window.Landing = Landing;` style registrations. They cannot be ESM-imported directly into a Next.js Server Component because `React` is not imported and dependent globals are sequenced via `<script>` tags in the prototype HTML, not via ESM.

**When to use:** Every Phase-7 route segment that needs to render a locked screen.

**How:** A tiny bridge in `lib/jsx-bridge/` that:

1. Lives behind `next/dynamic(() => import('@/lib/jsx-bridge'), { ssr: false })` so the bundle only loads in the browser.
2. On first import, sets `globalThis.React = require('react')` and `globalThis.ReactDOM = require('react-dom/client')` BEFORE the JSX side-effect imports run (the locked code reads `React.useState`, not `import { useState } from 'react'`).
3. Imports the locked files in dependency order via Next's native `.jsx` SWC compilation — no Babel-standalone runtime needed because Next.js 15 SWC handles JSX automatically when `tsconfig.json` has `allowJs: true`. The `window.<Component>=<Component>` assignments at the bottom of each screen run as a side effect of import.
4. Re-exports the now-defined `window.Landing`, `window.Preview`, `window.StreamLog`, etc. as typed ESM exports (`export const Landing = window.Landing as React.ComponentType<LandingProps>`).
5. Route segments import only from `@/lib/jsx-bridge`, never directly from a `screen-*.jsx` file.

**Critical:** This pattern is the single architectural lock-in for Phase 7. Plan 07-01 ships it before any other route is wired.

**Example (canonical, verified against locked file structure):**

```tsx
// apps/web/src/lib/jsx-bridge/loader.ts
// CLIENT-ONLY. Never imported from a Server Component without dynamic({ ssr: false }).

'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

// Expose React + ReactDOM on globalThis BEFORE any locked JSX evaluates.
// Locked JSX uses `React.useState(...)` and `ReactDOM.createRoot(...)` as globals,
// inherited from the prototype's UMD harness in MCPGen.html.
if (typeof window !== 'undefined') {
  // @ts-expect-error -- expose UMD-style globals to the locked JSX
  window.React = React;
  // @ts-expect-error -- only used by app.jsx; safe no-op if unused
  window.ReactDOM = ReactDOM;
}

// Import order matches MCPGen.html <script> sequence:
//   tokens.jsx → ui.jsx → screen-*.jsx → app.jsx
// Each side-effect import runs `window.<Symbol> = <Symbol>` assignments at file end.
import '@/tokens';                    // sets window.MCPTokens
import '@/ui';                        // defines Btn, TopBar, Icon, Badge, Spark, etc. (globals)
import '@/screen-landing';            // sets window.Landing + window.SAMPLE_APIS
import '@/screen-auth';               // sets window.AuthScreen
import '@/screen-canvas';             // sets window.Canvas
import '@/screen-stream';             // sets window.StreamLog
import '@/screen-playground';         // sets window.Playground
import '@/screen-preview';            // sets window.Preview
import '@/screen-quality';            // sets window.QualityReport
import '@/screen-deploy';             // sets window.Deploy + window.DeploySuccess
import '@/screen-dashboard';          // sets window.Dashboard

// Note: tweaks-panel.jsx is NOT imported in production; it's a dev harness only
// (its `useTweaks` hook ships in app.jsx but is unused once we provide `t` directly
// from layout.tsx via window.MCPTokens.makeCssVars defaults).

export type LockedSample = {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
};

export type LandingProps = {
  sample: LockedSample;
  urlText: string;
  setUrlText: (s: string) => void;
  onMakeIt: () => void;
  onSelectSample: (s: LockedSample) => void;
};
// ... typed prop shapes for all 9 screens
```

**Note on TS/JSX path resolution:** Phase 1 already set `apps/web/tsconfig.json` `allowJs: true` + `paths: { "@/*": ["./src/*"] }` and `jsx: preserve`. For Next 15 App Router with locked JSX, **flip `jsx: preserve` to `jsx: react-jsx`** (verified canonical Next.js setting per `[CITED: github.com/vercel/next.js docs/01-app/02-guides/migrating/from-vite.mdx]`). Rationale: `react-jsx` enables the automatic-runtime JSX transform so `React.useState(...)` calls resolve through the global `React` we exposed in `loader.ts`, while JSX elements themselves (`<Btn ... />`) compile via `react/jsx-runtime` without needing `import React from 'react'` at the top of every locked file.

### Pattern 2: SSE Consumption with `Last-Event-ID` Resume

**What:** `useGenerationSSE` hook consumes per-job SSE from the BFF using native `fetch()` + `eventsource-parser@3` `EventSourceParserStream` TransformStream, with mandatory page-reload-mid-generation resume per Pitfall #20.

**When to use:** Any screen that needs live generation progress (stream / playground; D-32 defers to Wave 2).

**Example (verified against `eventsource-parser@3` API + Phase-1 contracts):**

```ts
// apps/web/src/lib/sse/use-generation-sse.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import {
  GenerationSseEvent,
  LAST_EVENT_ID_HEADER,
  type GenerationSseEvent as TGenerationSseEvent,
} from '@mcpgen/contracts';

export type SseStatus = 'connecting' | 'streaming' | 'reconnecting' | 'completed' | 'failed';

export function useGenerationSSE(jobId: string): {
  events: TGenerationSseEvent[];
  status: SseStatus;
} {
  const [events, setEvents] = useState<TGenerationSseEvent[]>([]);
  const [status, setStatus] = useState<SseStatus>('connecting');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    async function bootstrap() {
      // D-10 step 1: read current status + last_known_event_id from Postgres source-of-truth
      const statusRes = await fetch(`/api/v1/jobs/${jobId}`);
      if (!statusRes.ok) {
        setStatus('failed');
        return;
      }
      const job = await statusRes.json() as { status: string; last_known_event_id: string | null; events: TGenerationSseEvent[] };

      // Hydrate prior events from Postgres replay
      setEvents(job.events ?? []);

      // D-10 step 2: terminal status → don't open SSE
      if (job.status === 'completed' || job.status === 'failed') {
        setStatus(job.status);
        return;
      }

      // D-10 step 3: open SSE with Last-Event-ID resume
      await connect(job.last_known_event_id);
    }

    async function connect(lastEventId: string | null) {
      if (cancelled) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus(retries === 0 ? 'connecting' : 'reconnecting');

      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (lastEventId) headers[LAST_EVENT_ID_HEADER] = lastEventId;

      try {
        const res = await fetch(`/api/v1/jobs/${jobId}/stream`, { headers, signal: ac.signal });
        if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
        setStatus('streaming');

        // eventsource-parser@3 TransformStream pipeline
        const stream = res.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream());

        const reader = stream.getReader();
        let lastSeenId: string | null = lastEventId;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.event === 'message' || !value.event) {
            const parsed = GenerationSseEvent.parse(JSON.parse(value.data));
            setEvents((prev) => [...prev, parsed]);
            lastSeenId = parsed.event_id;
            if (parsed.stage === 'completed' || parsed.stage === 'failed') {
              setStatus(parsed.stage);
              return; // do not reconnect on terminal
            }
          }
        }

        // Stream closed without terminal event — exponential backoff reconnect (D-10 step 5)
        if (!cancelled && retries < 3) {
          retries += 1;
          await new Promise((r) => setTimeout(r, 2 ** (retries - 1) * 1000));
          await connect(lastSeenId);
        } else if (!cancelled) {
          // Fall back to polling /api/v1/jobs/:id every 2s
          setStatus('reconnecting');
          await poll();
        }
      } catch (err) {
        if (cancelled) return;
        if (retries < 3) {
          retries += 1;
          await new Promise((r) => setTimeout(r, 2 ** (retries - 1) * 1000));
          await connect(lastEventId);
        } else {
          setStatus('reconnecting');
          await poll();
        }
      }
    }

    async function poll() {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await fetch(`/api/v1/jobs/${jobId}`);
        if (!r.ok) continue;
        const job = await r.json() as { status: string; events: TGenerationSseEvent[] };
        setEvents(job.events ?? []);
        if (job.status === 'completed' || job.status === 'failed') {
          setStatus(job.status as SseStatus);
          return;
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [jobId]);

  return { events, status };
}
```

`[CITED: github.com/rexxars/eventsource-parser/blob/main/README.md — EventSourceParserStream TransformStream pattern]` `[CITED: packages/contracts/src/generation-api.ts — GenerationSseEvent envelope + LAST_EVENT_ID_HEADER constant]`

### Pattern 3: Idempotency Key Generation + localStorage Persistence

```ts
// apps/web/src/lib/idempotency/generate-key.ts
import { ulid } from 'ulid';
import { GEN_ID_REGEX, type GenId } from '@mcpgen/contracts';

const STORAGE_PREFIX = 'mcpgen.idem.';

function storageKey(specUrl: string, specHashOrEmpty: string): string {
  return `${STORAGE_PREFIX}${specUrl}|${specHashOrEmpty}`;
}

export function getOrCreateIdempotencyKey(specUrl: string, specHashOrEmpty: string): GenId {
  const k = storageKey(specUrl, specHashOrEmpty);
  const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
  if (existing && GEN_ID_REGEX.test(existing)) return existing as GenId;
  const fresh = `gen_${ulid()}` as GenId;
  if (typeof localStorage !== 'undefined') localStorage.setItem(k, fresh);
  return fresh;
}

export function rotateIdempotencyKey(specUrl: string, specHashOrEmpty: string): void {
  // Called after the BFF returns 202 with a real job_id; the form-session key has done its job.
  const k = storageKey(specUrl, specHashOrEmpty);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
}
```

### Pattern 4: Quality Badge Tier Mapping

```ts
// apps/web/src/lib/quality/badge-tier.ts
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';

export type BadgeTier = 'premium' | 'verified' | 'standard' | 'needs_review';

// Threshold source: docs/mcpgen-stage-f-design.md (premium: F1 pass + F2≥4.5 + F3≥0.85 / verified: F1 pass + F2≥4.0 + F3≥0.7 / standard: 60-75 / needs_review: <60)
// LAUNCH_CRITERIA imports F2_SMELL_MIN=4.0 and F3_AGENT_PASS_RATE_MIN=0.7 from packages/contracts
export function badgeTier(qr: QualityReport): BadgeTier {
  if (qr.f1_static.passed === false) return 'needs_review';
  const f2 = qr.f2_smell.overall_average;
  const f3 = qr.f3_agent_eval?.pass_rate ?? null;
  if (f2 >= 4.5 && f3 !== null && f3 >= 0.85) return 'premium';
  if (f2 >= LAUNCH_CRITERIA.F2_SMELL_MIN && (f3 === null || f3 >= LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN)) return 'verified';
  if (f2 >= 3.0) return 'standard';
  return 'needs_review';
}

// D-21 free-tier UX: when F3 not run, badge label says "verified (F2-only)" with tooltip
export function badgeLabel(qr: QualityReport): string {
  const tier = badgeTier(qr);
  if (tier === 'verified' && qr.f3_agent_eval == null) return 'verified (F2-only)';
  return tier;
}
```

### Pattern 5: Fixture-Mode SSE Route Handler

```ts
// apps/web/src/app/api/v1/jobs/[id]/stream/route.ts
// Fixtures-mode handler: streams pre-recorded SSE timeline from @mcpgen/engine-fixtures.
// Live-mode delegates to apps/api Hono BFF via simple fetch proxy (omitted for brevity).

import { NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';
import { stripe as fixture } from '@mcpgen/engine-fixtures';

export const runtime = 'nodejs'; // 'edge' also supported; nodejs is simpler for fixtures

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lastEventId = req.headers.get(LAST_EVENT_ID_HEADER);

  const encoder = new TextEncoder();

  // Pre-generate a deterministic ULID timeline for this fixture (Stripe).
  // Stages A → B → C → D → E → F1 → F2 → F3 → completed (per generation-api.ts GenerationStage enum).
  // 10 stages × ~10s each = ~100s; within the 60s hero target after parallelization in real engine.
  const stages = ['A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed'] as const;
  const timeline = stages.map((stage, i) => ({
    job_id: id,
    event_id: ulid(),               // monotonic per timeline; resume key
    stage,
    status: stage === 'completed' ? 'completed' : 'started',
    partial_result: stage === 'completed' ? { final_tools: fixture.finalTools, quality_report: fixture.qualityReport } : undefined,
    delayMs: 1500 + Math.random() * 1500, // 1.5–3s per stage in fixture mode
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // D-14 last_event_id resume: skip past events the client already has.
      let resumeIdx = 0;
      if (lastEventId) {
        resumeIdx = timeline.findIndex((e) => e.event_id === lastEventId);
        if (resumeIdx < 0) resumeIdx = 0;
        else resumeIdx += 1;
      }

      for (let i = resumeIdx; i < timeline.length; i++) {
        const e = timeline[i];
        await new Promise((r) => setTimeout(r, e.delayMs));
        const sse = `id: ${e.event_id}\nevent: message\ndata: ${JSON.stringify({
          job_id: e.job_id,
          event_id: e.event_id,
          stage: e.stage,
          status: e.status,
          partial_result: e.partial_result,
        })}\n\n`;
        controller.enqueue(encoder.encode(sse));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

`[CITED: github.com/vercel/next.js docs/01-app/02-guides/streaming.mdx — Web Streams API ReadableStream pattern]` `[CITED: packages/contracts/src/generation-api.ts — GenerationSseEvent envelope]`

### Anti-Patterns to Avoid

- **Direct ESM-import of locked JSX from a Server Component:** Crashes at SSR time on `React.useState` (React not in scope) and `window.MCPTokens` (no `window` on server). Always go through `next/dynamic({ ssr: false })` + `lib/jsx-bridge/`.
- **Re-writing locked JSX to use ESM imports:** Forbidden by D-01/D-02 + RULES.md UI lock. The whole point of the bridge is to honor the file-as-is.
- **Editing `screen-stream.jsx` to consume real SSE:** The screen self-drives a visual progress bar via `requestAnimationFrame` against `STREAM_STEPS` durations (verified at lines 27–55 of the locked file). Wire-up replaces the *meaning* of those steps externally — the wrapper Client Component owns real `useGenerationSSE` state and decides when to call `onDone` based on real `stage === 'completed'` events. The screen's local timer keeps running; we don't touch it.
- **Adding new copy strings to locked screens:** `mcpgen-ux-flow.md` is the copy authority for placeholder text. Never invent copy.
- **Using `EventSource` Web API:** Cannot send `Authorization` or `Last-Event-ID` headers; Phase 7 needs both.
- **Passing the form's `Idempotency-Key` value into the BFF in the request body:** The contract says `Idempotency-Key` is a header (`packages/contracts/src/idempotency.ts` line 23); body is for `spec_url` / `spec_content` / `options` only.
- **Logging the request URL in Sentry without redaction:** Spec URLs may carry `?key=` or `?token=` query params (Pitfall #12). `beforeSend` MUST scrub these per D-30.
- **Keeping `MCPGEN_FRONTEND_MODE=fixtures` enabled in production builds:** D-16 — fixtures-mode is dev/preview only; gated by `process.env.NODE_ENV !== 'production'`. The mode banner is rendered exclusively from locked `ui.jsx` primitives.
- **Including the locked JSX in the Vitest test surface:** The locked files have no exports and reference `window.*` globals; importing them in jsdom unit tests will fail. Vitest unit scope is `apps/web/src/lib/**` only (D-26). Locked-screen tests live in Playwright (rendered-DOM scope).
- **Calling `onMakeIt()` synchronously when the form submit is also being awaited for an HTTP response:** The locked `screen-landing.jsx` calls `onMakeIt()` from `handleSubmit` immediately on submit; the wrapper must own the async form state externally and only call `onMakeIt()` (which navigates via `router.push('/generate/...')`) after the BFF returns 202 with a `job_id`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing (multi-byte boundary, `data:` line continuation, `id:`/`event:`/`retry:` semantics) | Custom string-splitter on `\n\n` | `eventsource-parser@3` `EventSourceParserStream` (already a dep) | Spec-compliant; handles utf-8 chunk boundaries; emits `ParseError` on malformed lines; `onRetry` callback for `retry:` field |
| ULID generation | Custom Crockford base32 + monotonic timestamp | `ulid@^3` `ulid()` | ~1KB; Crockford-base32-correct; matches Phase-1 `ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/`; Date.now()+random already monotonic-aware |
| Auth session + redirect flow | Custom OAuth state + cookie + token refresh | `@logto/next/server-actions` (`signIn`, `signOut`, `handleSignIn`, `getLogtoContext`) | Logto SDK enforces httpOnly + Secure + SameSite=Lax; `handleSignIn` validates state param; pairs with App Router |
| Server state caching + dedup | `useEffect` + manual fetch + manual cache | TanStack Query `useQuery` / `prefetchQuery` + `HydrationBoundary` | Per-request `QueryClient` factory pattern is the canonical Next.js 15 SSR shape (see Code Examples); built-in stale-while-revalidate + dedup |
| Code syntax highlighting in preview screen | Manual tokenizer / `<pre>` with regex paint | `shiki@^4` `codeToHtml` (Server Component) | TextMate grammars; SSR-friendly; zero client bundle; theme switchable |
| Visual regression detection | Custom canvas pixel-diff | Playwright `toHaveScreenshot` + `pixelmatch` | Built into `@playwright/test`; `maxDiffPixels` / `maxDiffPixelRatio` configurable; CI-integrated |
| Idempotency dedup at form-resubmit | Custom debounce | localStorage-keyed `gen_${ulid}` (D-12) | The BFF dedupes on the key; form-session reuse means "Try again" is a no-op until the key rotates |
| Streaming SSE proxy (live mode) | Custom buffering | Native `fetch` `ReadableStream` pipe through Route Handler | Web Streams API supported in Node ≥18, CF Workers, Vercel Edge |

**Key insight:** This phase is wire-up. The *only* reason to hand-roll is the JSX-bridge shim — and that's because the locked artifact has a one-of-a-kind harness pattern. Everywhere else, lean on the dep we already declared.

## Runtime State Inventory

> Phase 7 is wire-up — no rename / refactor / migration of stored data. Below is what the planner must NOT assume "is fresh"; nothing in Wave 1 requires data migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Wave 1 starts now and writes nothing to Postgres. Wave 2 reads `generations.status` (Phase 8 owns writes); Wave 3 reads `deployments` + `usage_events`/`usage_hourly` (Phase 6 owns writes). | None — Phase 7 is read-only against Phase-8/Phase-6-owned tables. |
| Live service config | Logto Cloud tenant — already manually configured per Phase-1 D-14 (`.env.local` per memory `reference_credentials.md`). Phase 7 reads `LOGTO_ENDPOINT` / `LOGTO_APP_ID` / `LOGTO_APP_SECRET` / `LOGTO_COOKIE_SECRET` env vars; Logto Cloud tenant already has email + GitHub providers enabled. | Verify via Logto Admin API that `https://localhost:3000/callback` redirect URI is registered for local dev; production redirect URI registered when Vercel domain assigned (Phase 10). |
| OS-registered state | None. Phase 7 doesn't register OS services. | None. |
| Secrets/env vars | `LOGTO_*` (Logto Cloud), `NEXT_PUBLIC_SENTRY_DSN` (empty in Phase 1, filled Phase 9), `SENTRY_AUTH_TOKEN` (Vercel build-time source-map upload), `MCPGEN_FRONTEND_MODE` (NEW — `fixtures`/`live`), `MCPGEN_BFF_URL` (NEW — `https://api.mcpgen.dev` placeholder; final domain set in Phase 8). | Plan 07-01 documents the env contract in `apps/web/.env.example` (no real secrets committed). |
| Build artifacts / installed packages | `apps/web/.unzip-commit-allowed` marker file is **still present** (per CONTEXT.md "Specific Ideas" §marker note) — was never consumed by Phase 1 because the original hook regex didn't match the actual unzip target. | Plan 07-01 first commit removes the marker simultaneously with re-pointing the hook regex (D-03 + Specific Ideas). |

**The canonical question:** *After Phase 7 ships, what runtime systems still have the old `apps/web` "no-op build" state?* Answer: only the `apps/web/package.json` scripts — Plan 07-01 replaces the four `echo` placeholder scripts (`build`/`lint`/`typecheck`/`test`) with real Next.js / ESLint / `tsc --noEmit` / `vitest --run` invocations.

## Common Pitfalls

### Pitfall 1: SSE Disconnect on Vercel Cold Start (Pitfall #20 — P1, mandatory)

**What goes wrong:** Frontend (Next.js Vercel) consumes generation SSE. User clicks Generate → 60s pipeline → Vercel cold-starts an adjacent edge function during generation, triggering a page re-render that drops the SSE socket. The user sees the progress bar reset to "connecting…" forever.

**Why it happens:** SSE is single-connection-stateful. Next.js 15 App Router with RSC sometimes triggers full re-renders on background revalidation. The Hono `streamSSE` 30-second sub-request limit on CF Workers (BLOCKER acknowledged in Phase 1 STATE.md) further bounds how long a single SSE socket stays alive.

**How to avoid:** Job state in Postgres = source of truth (D-09). SSE is UX nicety, not data path. On reconnect, Route Handler returns latest job state from DB and resumes SSE from `Last-Event-ID`. The `useGenerationSSE` hook implements this precisely (D-10): poll status first, only open SSE if not terminal, send `Last-Event-ID` header on every (re)connect, fall back to polling after 3 retries.

**Warning signs:**
- Phase 7 manual test: refresh during generation → state lost.
- Sentry: `failed to fetch` clustered around Vercel deploys.
- Playwright reload-test (D-27) fails — investigate immediately.

**Mandatory test:** `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` (D-11/D-27). Runs in fixture mode in Wave 1 against the synthetic SSE timeline; re-runs in Wave 2 against real engine.

### Pitfall 2: Claude Desktop Config Block Server-Name Collision (Pitfall #30 — P1)

**What goes wrong:** User has `acme-stripe-mcpgen` and `acme-stripe-handwritten` both in Claude Desktop config. Both expose `search` (Six-Tool Pattern). Claude Desktop deduplicates by tool name globally (or picks nondeterministically). Cross-server query confusion.

**Why it happens:** MCP spec doesn't mandate per-server tool namespacing on the client side. Older Claude Desktop builds collide on tool names.

**How to avoid (Phase 7 surface):** D-24 — collision detected at *deploy submit time* (BFF returns 409 with suggested alternative names). Phase 7 wires the 409 response → surfaces a rename modal (locked `ui.jsx` modal primitive) with the suggested alternative pre-filled. Browser CANNOT detect existing Claude Desktop config (sandboxed file system); D-23 surfaces detection only via the CLI (`mcpgen install --check`) and adds a UI hint copy in a placeholder slot of locked `screen-deploy.jsx`.

**Warning signs:** User support: "search returns weird data."

### Pitfall 3: Sentry Captures `X-Upstream-Auth` / Bearer Tokens (Pitfall #12 — P0)

**What goes wrong:** Generation form submission attaches an Idempotency-Key header. Logto adds an Authorization cookie. The user pastes a spec URL that contains `?token=` / `?key=` query params. Sentry's default `request.headers` and `request.url` capture leaks all of these to the Sentry org.

**How to avoid:** D-30 — `beforeSend` redaction filters strip `Authorization`, `X-Upstream-Auth`, `Cookie`, and any `request.url` query param matching `?key=` or `?token=`. Phase 1 wired the skeleton; Phase 7 fills the body and adds Vitest unit tests asserting redaction works on representative event objects.

**Warning signs:** Sentry event search for literal `Bearer ` returns >0; literal `sk_live_` or `ghp_` >0.

### Pitfall 4: SSE Stream-Closing Logic Loops on Terminal Stage

**What goes wrong:** The `useGenerationSSE` hook reconnects on disconnect with exponential backoff. If the engine emits a `stage: 'completed'` event and *then* closes the stream, naive reconnect logic re-opens the SSE, the BFF replays from `last_event_id` (which is the completed event), gets nothing new, the stream closes again, and the hook reconnects forever — burning CPU and quota.

**How to avoid:** In `useGenerationSSE`, set `setStatus('completed')` and `return` from the connect loop immediately on `stage === 'completed' || 'failed'` (Pattern 2 above does this). Add a Vitest unit test that feeds a synthetic `EventSourceParserStream` with a terminal event and asserts the hook does NOT reconnect.

### Pitfall 5: Locked JSX `app.jsx` Tries to Mount Its Own Root

**What goes wrong:** The locked `app.jsx` ends with `ReactDOM.createRoot(document.getElementById('root')).render(<App />);`. If this file is imported into a Next.js client component, `app.jsx` will try to mount React itself, conflicting with Next's hydration root.

**How to avoid:** **DO NOT import `app.jsx`** from the bridge. The bridge imports only `tokens.jsx` + `ui.jsx` + the 9 `screen-*.jsx` files. Each route segment renders its own `window.<Screen>` directly. The bridge's import list explicitly skips `app.jsx` and `tweaks-panel.jsx`.

**Warning signs:** Next.js console error "You attempted to call createRoot on a container that has already been passed to createRoot."

### Pitfall 6: Tailwind 4 Plugin Activated Without `@tailwind` Directives

**What goes wrong:** `tailwindcss@^4.0.0` is declared as a dep in `apps/web/package.json`. If Plan 07-01 sets up `next.config.js` to register the Tailwind PostCSS plugin, but `global.css` doesn't have `@tailwind base; @tailwind components; @tailwind utilities;` directives (verified — it has none), the plugin runs but emits zero utilities; meanwhile any utility class our wire-up code emits (e.g., `<div className="flex">`) renders unstyled.

**How to avoid:** Don't register Tailwind in `next.config.js` for Phase 7. Phase 7 wire-up code uses inline `style={{}}` referencing the same CSS variables `global.css` defines (`var(--ink)`, `var(--paper)`, etc.). If a future phase needs Tailwind utilities, that's a separate decision-log entry.

### Pitfall 7: `@logto/next` Cookie Secret Collision Between Local Dev and Vercel

**What goes wrong:** `LOGTO_COOKIE_SECRET` is used to sign session cookies. If different envs use different secrets (correct), but a developer copies a cookie from local dev into a Vercel preview, signature verification fails — and Logto's error message is "session expired" which masks the real cause.

**How to avoid:** Plan 07-01 documents `LOGTO_COOKIE_SECRET` as `pnpm --filter=@mcpgen/web run gen-cookie-secret` (just a `crypto.randomBytes(32).toString('base64url')` one-liner). `.env.example` mirrors this. Vercel env vars are set per environment in the Vercel dashboard.

## Code Examples

### TanStack Query Provider for Next.js 15 App Router

```tsx
// apps/web/src/lib/providers/query-provider.tsx
'use client';

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSR best practice: staleTime > 0 prevents immediate refetch on client hydration
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

`[CITED: github.com/tanstack/query/blob/main/docs/framework/react/guides/advanced-ssr.md]`

### Logto Sign-In Server Action + Callback Route Handler

```ts
// apps/web/src/lib/auth/logto.ts
import { LogtoNextConfig } from '@logto/next';

export const logtoConfig: LogtoNextConfig = {
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.LOGTO_ENDPOINT!,
  baseUrl: process.env.LOGTO_BASE_URL!, // http://localhost:3000 dev | https://mcpgen.dev prod
  cookieSecret: process.env.LOGTO_COOKIE_SECRET!,
};
```

```ts
// apps/web/src/app/api/auth/logto/sign-in/route.ts
import { signIn } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import { logtoConfig } from '@/lib/auth/logto';

export async function GET() {
  await signIn(logtoConfig);
  // signIn redirects to Logto endpoint; flow control returns via callback below
}
```

```ts
// apps/web/src/app/api/auth/logto/callback/route.ts
import { handleSignIn } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { logtoConfig } from '@/lib/auth/logto';

export async function GET(request: NextRequest) {
  await handleSignIn(logtoConfig, request.nextUrl.searchParams);
  redirect('/dashboard');
}
```

```tsx
// apps/web/src/app/dashboard/page.tsx (protected route)
import { getLogtoContext } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import { logtoConfig } from '@/lib/auth/logto';

export default async function DashboardPage() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) redirect('/api/auth/logto/sign-in');
  // ... render dashboard via jsx-bridge
}
```

`[CITED: github.com/logto-io/docs/blob/master/docs/quick-starts/framework/next-app-router/_integration.mdx]`

### Shiki Server Component Code Highlighting

```tsx
// apps/web/src/lib/preview/code-block.tsx (Server Component)
import { codeToHtml, type BundledLanguage } from 'shiki';

interface Props {
  code: string;
  lang: BundledLanguage;
}

export async function CodeBlock({ code, lang }: Props) {
  const html = await codeToHtml(code, {
    lang,
    theme: 'github-dark', // or use dual themes per Shiki docs
  });
  return <div className="mc-code-panel" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`[CITED: github.com/shikijs/shiki/blob/main/docs/packages/next.md]`

### Playwright Visual-Lock Config

```ts
// apps/web/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  expect: {
    toHaveScreenshot: {
      // ≤0.1% pixel delta acceptance per D-04
      maxDiffPixelRatio: 0.001,
      // OR maxDiffPixels: number — choose ratio for size-independence across viewports
    },
  },
  webServer: {
    command: 'MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

`[CITED: github.com/microsoft/playwright/blob/main/docs/src/test-configuration-js.md]`

### Page-Reload-Mid-Generation E2E Test (Pitfall #20 mandatory)

```ts
// apps/web/tests/e2e/page-reload-mid-generation.spec.ts
import { test, expect } from '@playwright/test';

test('SSE state survives page reload mid-generation (Pitfall #20)', async ({ page, context }) => {
  // Fixture mode: deterministic SSE timeline per Pattern 5
  await page.goto('/?fixtures=true');
  await page.fill('input[placeholder*="OpenAPI"]', 'https://api.stripe.com/openapi.yaml');
  await page.click('button:has-text("make it")');

  // Wait for stream screen to appear and the third stage to start
  await page.waitForURL(/\/generate\/.+/);
  await page.waitForSelector('text=/stage.*c|stage.*author/i', { timeout: 15_000 });
  const eventCountBefore = await page.locator('[data-testid="sse-event-row"]').count();

  // Kill the SSE socket via network interception
  await context.route('**/api/v1/jobs/*/stream', (route) => route.abort());

  // Reload the page mid-generation
  await page.reload();

  // Re-allow SSE; the Last-Event-ID header should resume the stream
  await context.unroute('**/api/v1/jobs/*/stream');

  // Assert: prior events are reconstructed from Postgres (fixture-mode mock returns them in /jobs/:id GET)
  // AND new events arrive with monotonic event_id > the last seen
  await page.waitForSelector('[data-testid="sse-event-row"]:nth-child(' + (eventCountBefore + 1) + ')', { timeout: 30_000 });

  // Final assertion: stream completes
  await page.waitForSelector('text=/preview|completed/i', { timeout: 60_000 });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `EventSource` Web API for SSE | `fetch()` + `eventsource-parser@3` `EventSourceParserStream` | eventsource-parser v3 added TransformStream API (2024) | Custom headers (Authorization, Last-Event-ID), POST support, explicit reconnect — D-09 |
| Pages Router for Next.js apps | App Router (`app/` directory) | Next.js 13.4 stable, Next 14 default, Next 15 canonical | RSC, streaming, parallel routes, intercepting routes — D-05 |
| `withRouter` + class components | `useRouter` from `next/navigation` + functional components + `'use client'` | Next.js 13 / React 18 | Phase 7 wrapper components that translate locked JSX callback props (`onMakeIt`) into navigation use this |
| `react-query@4` `Hydrate` component | `@tanstack/react-query@5` `HydrationBoundary` + `dehydrate` | TQ v5 (Oct 2023) | Per-request `QueryClient` factory; `staleTime > 0` mandatory in SSR |
| Zod 3 `z.toJSONSchema()` via external lib | Zod 4 native `z.toJSONSchema()` | Zod 4.x (Phase 1 already pinned) | Stage E uses Zod 4 native; Phase 7 form validation aligns |
| Babel-standalone in-browser JSX compilation (the prototype's harness) | Next.js 15 SWC build-time JSX compilation | Next 13+ default | Phase 7 compiles locked `.jsx` at build time via `tsconfig.json` `allowJs: true` + `jsx: react-jsx` — no runtime Babel needed |

**Deprecated/outdated for Phase 7:**
- `EventSource` Web API for our use case (cannot send custom headers).
- `react-query@4` API names like `Hydrate` (now `HydrationBoundary`).
- `next-transpile-modules` (replaced by `transpilePackages` in `next.config.js`; not needed for Phase 7 since `@mcpgen/contracts` and `@mcpgen/ir` are TypeScript-source workspace deps that Next 15 transpiles automatically — but if a future runtime issue appears, `transpilePackages: ['@mcpgen/contracts', '@mcpgen/ir', '@mcpgen/engine-fixtures']` is the canonical fix).
- `tsconfig.json` `jsx: preserve` (Phase 1 default) — Plan 07-01 flips to `jsx: react-jsx` for Next 15 SWC + locked-JSX automatic-runtime support.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `screen-stream.jsx` self-driven progress simulation (lines 27–55) is **visual only** and the wrapper Client Component CAN call `onDone` based on real SSE `stage === 'completed'` without modifying the screen | Anti-Patterns / Pattern 1 | If the screen blocks `onDone` until its own internal `stepIdx` reaches the end (verified at line 33: `if (i >= STREAM_STEPS.length) ... onDone()`), our wrapper's external completion may not fire — we'd need to either let the simulation finish (UX latency) or modify the screen (forbidden). **Mitigation:** Plan 07-04 first task is a 30-min spike — render `screen-stream.jsx` in a Next.js client component, fire fixture-mode SSE that completes in 1s, verify the screen still calls `onDone` after its 11s simulated total. If yes, behavior is acceptable: the timer just provides smoothing; the wrapper drives navigation. If no, escalate to user for a scope decision. |
| A2 | `next/dynamic({ ssr: false })` + `globalThis.React = React` shim is sufficient to make the locked JSX run | Pattern 1 | Untested in production; may surface edge cases like Next.js 15 React 19 `useFormStatus` not being on `React` global. **Mitigation:** Plan 07-01 includes a 1h spike that mounts `screen-landing.jsx` in this exact shape and renders to a test page. |
| A3 | Tailwind 4 is declared but unused in the locked CSS, so we can leave it inactive in Phase 7 wire-up code | Standard Stack / Pitfall 6 | If a future plan accidentally registers Tailwind PostCSS without `@tailwind` directives in `global.css`, utility classes will silently fail. Documented as Pitfall 6 above. |
| A4 | The `QualityReport` Zod schema in `@mcpgen/ir` exposes `f1_static.passed` (boolean), `f2_smell.overall_average` (number), and `f3_agent_eval?.pass_rate` (number\|undefined) per Phase-1 plan 01-07 commit decision (CONTEXT.md cites Phase-1 fixture shape). | Pattern 4 (badge tier mapper) | If actual field names differ (e.g., `overall_score` vs `overall_average`), the badge mapper TS will fail to compile. **Mitigation:** Plan 07-04 first task is to read `packages/ir/src/types.ts` `QualityReport` Zod export and cite the exact field names verbatim. |
| A5 | `claude://` protocol handler exists in current Claude Desktop builds for one-click "Open in Claude Desktop" CTA (D-25) | Don't Hand-Roll / D-25 | If `claude://` isn't supported, the CTA gracefully falls back to copy-to-clipboard; UX is degraded but not broken. **Mitigation:** No action needed — the design is graceful. |
| A6 | The locked `screen-deploy.jsx` has a "config-block UI region" (CONTEXT.md D-23) — verified there's an internal copy-block element that we can populate via props/data without modifying JSX | Don't Hand-Roll / D-23 | Wrapper may need to mount a portal or absolutely-positioned overlay if no native slot exists. **Mitigation:** Plan 07-09 first task reads `screen-deploy.jsx` end-to-end and confirms the slot. |
| A7 | The Hono BFF proxy from Next.js Route Handler to CF Workers `apps/api` does NOT incur a CORS preflight because we use same-origin (Vercel rewrites `/api/v1/*` to apps/api) — D-15 | Pattern Architecture Diagram | If CORS turns out to be required (e.g., if `apps/api` lives on `api.mcpgen.dev` separately and Vercel routes route through public DNS rather than rewrites), SSE preflight will fail. **Mitigation:** Plan 07-01 documents Vercel `rewrites` config in `next.config.js`; verifies via local dev that `/api/v1/*` proxies same-origin. |
| A8 | The `pending_callbacks` table (Phase-1 schema) supports the SSE replay path required by D-09 | Pattern 2 / Pitfall 1 | If Phase 8 implements replay differently (e.g., reading from `generations.events` JSONB column), the `useGenerationSSE` hook's expectation that `GET /api/v1/jobs/:id` returns prior events may not match. **Mitigation:** Plan 07-04 reviews `apps/api/src/routes/v1/jobs/stream.ts` and `apps/api/src/routes/v1/jobs/[id].ts` (when Phase 8 fills them) before wiring the hook against real data. |
| A9 | `eventsource-parser@3.0.8` `EventSourceParserStream` is a TransformStream that pipes through `pipeThrough()` correctly in Vercel Edge runtime AND Vercel Node runtime AND localhost Node 20+ — but Edge runtime support is the unverified leg | Pattern 2 / Pattern 5 | If Edge runtime rejects `EventSourceParserStream` (it shouldn't — TransformStream is Web Standards), the fallback is `runtime: 'nodejs'` for SSE Route Handlers, which is fine since Phase 7 doesn't need Edge for SSE. **Mitigation:** Set `export const runtime = 'nodejs'` explicitly in all `app/api/v1/**/route.ts` files. |
| A10 | The locked `MCPGen.html` rendered via the prototype's in-browser-Babel harness produces visually-identical output to Next.js 15 SWC build-time compilation of the same `.jsx` files (with `globalThis.React` shim) | Pattern 1 / D-04 baseline capture | If SWC emits subtly different JSX (e.g., key handling on fragments) than Babel-standalone, the screenshot baseline diff will fail. **Mitigation:** D-04 baseline is captured FROM the Next.js build (not from the prototype HTML) on the first PR; the prototype HTML serves as the pre-flight visual sanity check, not the byte-for-byte baseline. CONTEXT.md D-04 phrasing supports this reading. |
| A11 | `ulid@^3` is API-compatible with the `ulid()` function call shape we use (`gen_${ulid()}`) | Standard Stack / Pattern 3 | CONTEXT.md cites `ulid@^2`. Major-version bump may have changed the import or call shape. **Mitigation:** Plan 07-01 first task runs `npm view ulid@3 main` + reads README to confirm `ulid()` default export still returns a 26-char Crockford string. Both v2 and v3 confirmed export `ulid` named function. If the planner prefers the safer pin, use `ulid@^2`; semantics identical for our use. |
| A12 | The 5 Phase-1 fixtures (`@mcpgen/engine-fixtures` stripe/github/notion/linear/slack) each have a `finalTools[]` and `qualityReport` shape that the preview screen and quality screen can render directly from | Pattern 5 | If fixture shapes don't include all the fields the locked JSX expects in the `sample` prop (`{id, name, endpoints, tools, save}` per `screen-landing.jsx`), the wrapper will need to derive these. **Mitigation:** Plan 07-04 reads `packages/engine-fixtures/{stripe,github,...}/ir.json` and `final-tools.json` end-to-end to confirm shape; the `sample` shape is mostly metadata and is straightforward to derive from `RawIR.metadata`. |
| A13 | The Phase-1 `QualityReport` Zod schema explicitly distinguishes "F3 not run" (free tier) via `f3_agent_eval` being optional/nullable (D-21) | Pattern 4 | If the schema requires `f3_agent_eval`, the free-tier path may need a sentinel value. **Mitigation:** Verify in `packages/ir/src/types.ts` during Plan 07-04. |

**If this table is empty:** N/A — non-empty; planner and discuss-phase should review A1, A2, A8 before Plan 07-01 execution and confirm approach.

## Open Questions (RESOLVED)

> Each question's recommendation is the locked resolution carried into Phase 7 plans. Questions are kept here for audit-trail purposes; the textual `RESOLVED:` marker indicates the binding answer that downstream agents must respect.

1. **Tweaks panel removal in production** — **RESOLVED:** Plan 07-01 Task 5 grep-verifies no production path posts `__edit_mode_*` messages; the bridge does NOT import `tweaks-panel.jsx`. The locked file stays in repo unchanged.
   - What we know: `app.jsx` line 116 comment says "Tweaks panel removed — settings locked in via TWEAK_DEFAULTS." The `tweaks-panel.jsx` file is still in the repo (locked) but `app.jsx` no longer imports it.
   - Original concern: Whether the `iframe`-based `__edit_mode_*` postMessage hooks in `tweaks-panel.jsx` are referenced from anywhere in production.

2. **`MCPTokens.makeCssVars` invocation point** — **RESOLVED:** Plan 07-01 Task 5 calls `window.MCPTokens.makeCssVars(TWEAK_DEFAULTS)` once in the bridge `loader.ts` and applies the resulting CSS vars to `<html>`. The TWEAK_DEFAULTS object literal exposed in `app.jsx` line 3 is read via a separate static export from the bridge.
   - What we know: `app.jsx` line 23 calls `window.MCPTokens.makeCssVars(t)` to derive root CSS vars; `t` comes from `useTweaks(TWEAK_DEFAULTS)`. Without `app.jsx` mounted, no one calls `makeCssVars`.
   - Original concern: `global.css` reads vars like `--paper`, `--ink`, `--text` from `body`; not invoking `makeCssVars` would leave them undefined.

3. **Pricing route fate** — **RESOLVED:** Plan 07-02 Task 1 (or 07-05 Task 4 — planner discretion) drafts a minimal pricing page using ONLY `<TopBar/>` + `<Btn/>` + `<Badge/>` from locked `ui.jsx` with no new layout. The route is gated: if the composed page still feels like a visual addition during plan execution, drop the route and inline a placeholder in the landing's existing pricing link. Per CONTEXT.md "Deferred Ideas" final bullet: "Pricing page implementation that introduces new visual elements → drop the route and inline a placeholder until Phase 8."
   - What we know: D-06 says compose pricing from `ui.jsx` primitives in `app/pricing/page.tsx`; locked design has no dedicated pricing screen JSX. Copy from `mcpgen-ux-flow.md`.
   - Original concern: Whether composing from primitives counts as "introducing new visual elements."

4. **Where does the CF Workers `apps/api` live in production DNS?** — **RESOLVED:** Plan 07-01 ASSUMES same-origin (rewrite-based) per CONTEXT D-15's CORS-avoidance reasoning. Env var `MCPGEN_BFF_URL` is set to the rewrite path (`/api/v1`) in production and the absolute Hono dev URL (`http://localhost:8787/api/v1`) in local dev. If Phase 8 picks separate domains, a single `next.config.js` `rewrites` change suffices — no Phase 7 logic changes.
   - What we know: Phase-1 D-15 says CF dispatch namespace creation is deferred to Phase 10. `apps/api` runs on a non-dispatch CF Worker (BFF, not tenant). Production domain undecided (placeholder `api.mcpgen.dev`).
   - Original concern: Apex-domain rewrite vs. separate subdomain.

5. **`@mcpgen/engine-fixtures` lacks SSE-event timelines** — **RESOLVED:** Pattern 5 (Plan 07-03 Task 1) generates the timeline on-the-fly in `lib/fixture-mode/sse-timeline.ts` from the static `finalTools` + `qualityReport` JSONs (deterministic ULIDs derived from `spec_hash`). If Phase 1 later ships a `sse-timeline.json` file per fixture, Plan 07-04 swaps to reading the file — the route handler shape is identical.
   - What we know: `packages/engine-fixtures/stripe/` ships `ir.json` + `final-tools.json` + `quality-report.json`; CONTEXT D-14 says "fixtures ship with ULID `event_id` timelines for mock-mode SSE replay" — no separate timeline file in the current grep.
   - Original concern: Whether timelines exist as a separate file or are generated from static fixtures.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Next.js build, Vitest, Playwright | ✓ | v25.2.1 | — (already installed; engine ≥18.18 required by Next 15) |
| `pnpm` | Workspace install + scripts | ✓ | 10.30.2 | — |
| `npx` | Context7 CLI fallback | ✓ | 11.6.2 | — |
| `wrangler` (CF dev) | Local Hono BFF dev for live-mode SSE testing | ✗ | — | Phase 1 plan 01-08 acceptance ran via `wrangler dev --local`; Plan 07-01 either installs `wrangler` per-package or runs frontend against a hardcoded `MCPGEN_BFF_URL=http://localhost:8787` and assumes the engineer already has wrangler in `apps/api/`. **Decision:** rely on `apps/api`'s own wrangler dependency; document the `pnpm --filter=@mcpgen/api dev` command in 07-01's runbook. |
| Vercel CLI | Production deploy | ✗ | — | Vercel deploys via Git integration (the project root is already linked per Phase 1 plan 01-05 confirmation); CLI not strictly needed. Plan 07-10 (or whichever wave wires Vercel envs) uses Vercel dashboard for env vars. |
| Sentry CLI | Source-map upload during Vercel build | ✗ (locally) | — | Vercel auto-runs `@sentry/nextjs` `withSentryConfig` source-map upload via env vars `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`. CLI not needed at dev time. |
| Logto Cloud tenant + creds | All auth wire-up | ✓ | — (per memory `reference_credentials.md`: Logto Cloud creds in `.env.local`; Phase 1 plan 01-07 confirms manual config) | — |
| `@playwright/test` browsers | E2E + screenshot-diff | ✗ | — | Plan 07-01 first task runs `pnpm exec playwright install chromium webkit firefox` (one-time; CI pulls cached browsers via `actions/cache`). Documented in 07-01 runbook. |

**Missing dependencies with fallback:**
- `wrangler` locally — covered by `apps/api` package's own dev dependency.
- Vercel CLI — Git-integration replaces it.
- Sentry CLI locally — Vercel-side auto-runs at deploy time.
- Playwright browsers — `playwright install` one-shot; CI caches.

**Missing dependencies with NO fallback:**
- None — all required tooling is installable on first run.

## Validation Architecture

> Phase 7 Nyquist validation enabled (`config.json` `workflow.nyquist_validation: true`). VALIDATION.md is generated in plan-phase step 5.5.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 (declared in Phase 1 `apps/web/devDependencies`) for unit tests; `@playwright/test ^1.59` for E2E + visual-diff (added in Plan 07-01) |
| Config file | `apps/web/vitest.config.ts` (NEW — Plan 07-01 creates) + `apps/web/playwright.config.ts` (NEW — Plan 07-01 creates) |
| Quick run command | `pnpm --filter=@mcpgen/web run test:unit` (= `vitest --run`) |
| Full suite command | `pnpm --filter=@mcpgen/web run test` (= `vitest --run && playwright test`) — runs unit + E2E + visual-diff |
| Visual baseline location | `apps/web/tests/e2e/__screenshots__/` (auto-managed by Playwright) |
| Dev mode SSE test setup | `MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web run dev` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **FE-01** | Landing form generates `gen_${ulid}` Idempotency-Key matching `GEN_ID_REGEX` | unit | `pnpm --filter=@mcpgen/web exec vitest --run lib/idempotency` | ❌ Wave 0 (Plan 07-01 / Plan 07-04) |
| **FE-01** | Landing form POSTs to `/api/v1/generate` with `Idempotency-Key` header attached | E2E (fixtures) | `pnpm --filter=@mcpgen/web exec playwright test landing-submit.spec.ts` | ❌ Wave 0 |
| **FE-01** | Idempotency-Key persisted in localStorage and reused on retry within form session | unit | `pnpm --filter=@mcpgen/web exec vitest --run lib/idempotency/persistence` | ❌ Wave 0 |
| **FE-01** | Error mapping for each `GenerationErrorCode` enum value renders correct user message | unit + E2E | `vitest --run lib/api/error-mapper && playwright test error-display.spec.ts` | ❌ Wave 0 |
| **FE-02** | `useGenerationSSE` hook polls `/api/v1/jobs/:id` first; only opens SSE if status non-terminal | unit (jsdom + MSW or vitest server-mocks) | `vitest --run lib/sse/use-generation-sse` | ❌ Wave 0 |
| **FE-02** | `useGenerationSSE` parses `eventsource-parser@3` events through TransformStream pipeline | unit | `vitest --run lib/sse/parser` | ❌ Wave 0 |
| **FE-02** | `useGenerationSSE` sends `Last-Event-ID` header on reconnect with the last seen event_id | unit + E2E | `vitest --run lib/sse/reconnect && playwright test sse-resume.spec.ts` | ❌ Wave 0 |
| **FE-02** | **Page reload mid-generation rebuilds event log + resumes from `last_event_id` (Pitfall #20 — MANDATORY per D-11/D-27)** | E2E (fixtures) | `playwright test page-reload-mid-generation.spec.ts` | ❌ Wave 0 |
| **FE-02** | After 3 reconnect failures, hook falls back to polling every 2s | unit | `vitest --run lib/sse/polling-fallback` | ❌ Wave 0 |
| **FE-02** | Hook returns `status: 'completed'` and stops reconnecting on terminal stage event | unit | `vitest --run lib/sse/terminal-stop` | ❌ Wave 0 |
| **FE-03** | Preview screen renders `FinalTool[]` from `@mcpgen/engine-fixtures.stripe` (all fields visible) | E2E (fixtures) | `playwright test preview-render.spec.ts` | ❌ Wave 0 (Wave 2 deferred) |
| **FE-03** | Preview screen full-code panel renders syntax-highlighted TS via Shiki | E2E (fixtures) + visual-diff | `playwright test preview-code-panel.spec.ts` | ❌ Wave 0 |
| **FE-03** | Quality screen renders F2/F3 rubric breakdown from `QualityReport.f2_smell.per_component` | E2E (fixtures) | `playwright test quality-rubric.spec.ts` | ❌ Wave 0 |
| **FE-04** | Quality badge tier mapper maps `QualityReport` to 'premium'/'verified'/'standard'/'needs_review' | unit | `vitest --run lib/quality/badge-tier` | ❌ Wave 0 |
| **FE-04** | Free-tier badge renders "verified (F2-only)" when `f3_agent_eval == null` | unit + E2E | `vitest --run lib/quality/badge-label && playwright test free-tier-badge.spec.ts` | ❌ Wave 0 |
| **FE-04** | Deploy 409 collision response → rename modal pre-fills suggested name | E2E (fixtures) | `playwright test deploy-collision-modal.spec.ts` | ❌ Wave 0 (Wave 3 deferred) |
| **FE-04** | Claude Desktop config block copy-to-clipboard formats valid JSON | unit | `vitest --run lib/deploy/claude-config` | ❌ Wave 0 |
| **FE-04** | Dashboard renders deployments + usage from TanStack Query (TimescaleDB hourly aggregates) | E2E (fixtures) | `playwright test dashboard.spec.ts` | ❌ Wave 0 (Wave 3 deferred) |
| **FE-05** | `git diff origin/main HEAD -- $UI_LOCKED_PATHS` returns empty on every PR (file-diff lock) | CI guard | `bash .pre-commit-hooks/check-ui-locked.sh` (in CI: GitHub Actions step) | ✅ exists, regex needs re-pointing in Plan 07-01 |
| **FE-05** | Playwright screenshot-diff against `MCPGen.html` baseline at ≤0.1% pixel delta | E2E visual-diff | `playwright test --grep visual-lock` | ❌ Wave 0 |
| **FE-05** | All 9 locked screens render without modification (DOM tree identical to baseline) | E2E visual-diff | `playwright test visual-lock-all-screens.spec.ts` | ❌ Wave 0 |
| Pitfall #12 | Sentry `beforeSend` strips Authorization, X-Upstream-Auth, Cookie, query params matching ?key=/?token= | unit | `vitest --run sentry.client.config.test` | ❌ Wave 0 |
| Pitfall #20 | (covered above by FE-02 mandatory test) | E2E | (above) | ❌ Wave 0 |
| Pitfall #30 | Server-name collision 409 → rename modal | E2E | (covered above by FE-04 deploy-collision-modal.spec.ts) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter=@mcpgen/web run test:unit` (Vitest unit suite — runs in <30s once stable)
- **Per wave merge:** `pnpm --filter=@mcpgen/web run test` (Vitest unit + Playwright E2E + visual-diff) — runs in CI on every PR
- **Phase gate:** Full suite green; `git diff origin/main HEAD -- $UI_LOCKED_PATHS` returns empty (or paired ADR exists); `gsd-verify-work` passes

### Wave 0 Gaps

The following test infrastructure does NOT exist yet and MUST be created before any feature task. Plan 07-01 ships these in its first wave (Wave 0).

- [ ] `apps/web/vitest.config.ts` — Vitest config: `environment: 'jsdom'`; `setupFiles: ['./tests/setup.ts']`; alias `@/*` → `./src/*`
- [ ] `apps/web/playwright.config.ts` — Playwright config per Code Examples above; `webServer` runs `MCPGEN_FRONTEND_MODE=fixtures pnpm dev`; `expect.toHaveScreenshot.maxDiffPixelRatio: 0.001`
- [ ] `apps/web/tests/setup.ts` — Vitest jsdom setup: provide `globalThis.localStorage` polyfill (jsdom has it), provide `globalThis.fetch` if not present (jsdom 25+ has it)
- [ ] `apps/web/tests/e2e/__screenshots__/` — empty dir; baseline screenshots written on first run, then gitignored OR committed (D-04 implies committed)
- [ ] `apps/web/tests/e2e/visual-lock.spec.ts` — captures the baseline from the prototype HTML on first run; subsequent runs assert
- [ ] `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` — Pitfall #20 mandatory test (D-11/D-27)
- [ ] `apps/web/tests/unit/lib/idempotency/generate-key.test.ts` — covers FE-01
- [ ] `apps/web/tests/unit/lib/sse/use-generation-sse.test.ts` — covers FE-02 (using vitest mock for `EventSourceParserStream`)
- [ ] `apps/web/tests/unit/lib/quality/badge-tier.test.ts` — covers FE-04
- [ ] `apps/web/tests/unit/lib/deploy/claude-config.test.ts` — covers FE-04
- [ ] `apps/web/tests/unit/sentry.client.config.test.ts` — covers Pitfall #12
- [ ] Framework install (Plan 07-01 first task):
  ```bash
  pnpm --filter=@mcpgen/web add -D @playwright/test@^1.59
  pnpm exec playwright install --with-deps chromium webkit firefox
  ```
- [ ] `.github/workflows/main-ci.yml` `frontend` job updates: add `playwright test` step, add baseline screenshot caching via `actions/cache` (key on `apps/web/src/**` content hash), add file-diff visual-lock guard step
- [ ] `apps/web/package.json` scripts replace Phase-1 echo placeholders with real commands:
  ```json
  "build": "next build",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest --run && playwright test",
  "test:unit": "vitest --run"
  ```

## Security Domain

> Required because `security_enforcement` defaults to enabled (no explicit `false` in `config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `@logto/next@^4` (D-17): email + GitHub providers; httpOnly cookie session; `signIn` / `handleSignIn` / `getLogtoContext` server actions; the SDK enforces OAuth state parameter validation |
| V3 Session Management | yes | `@logto/next` httpOnly + Secure (in production) + SameSite=Lax cookies (D-19); cookie-secret rotation via env var per environment |
| V4 Access Control | yes | Logto middleware on `app/dashboard/*` only; `app/page.tsx`, `app/generate/*`, `app/pricing` are public; "claim anonymous session" call on first authenticated generation (Phase 8 owns implementation; Phase 7 wires call shape only per D-18) |
| V5 Input Validation | yes | All form input validated through Zod schemas from `@mcpgen/contracts` (`GenerationApiRequest`); spec_url field validated as `z.string().url()`; `Idempotency-Key` header validated against `GEN_ID_REGEX` before submit; SSE events validated against `GenerationSseEvent` schema before render |
| V6 Cryptography | partial | Phase 7 does NOT handle cryptography directly. ULID generation uses `ulid` package (Math.random + Date.now — non-cryptographic, OK for Idempotency-Key shape per D-12; the BFF is the dedup authority). Logto handles all session-token crypto. |
| V7 Error Handling | yes | Sentry `beforeSend` redaction (D-30); error boundary at root via `app/error.tsx`; error messages sanitized via `lib/api/error-mapper.ts` (don't leak internal stack traces to users); all `fetch` retries log structured fields per CLAUDE.md global rule |
| V8 Data Protection | yes | Privacy LOCKED per RULES.md §4.3: NEVER log spec content, upstream API responses, upstream credentials. Sentry `beforeSend` redaction for `Authorization` / `X-Upstream-Auth` / `Cookie` (D-30 + Pitfall #12); query-param redaction for `?key=` / `?token=` |
| V9 Communication | yes | All API calls over HTTPS (Vercel + CF Workers terminate TLS); same-origin proxy avoids CORS preflight for SSE (D-15); cookies marked Secure in production |
| V12 API & Web Service | yes | All BFF endpoints typed against `@mcpgen/contracts` Zod schemas; Idempotency-Key header per Phase-1 D-11 / FND-14; `Last-Event-ID` header per Phase-1 D-09 |

### Known Threat Patterns for Next.js + Logto + CF Workers stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pass-through credential leakage into Sentry / Langfuse / Vercel logs | Information Disclosure | Sentry `beforeSend` redaction (D-30 + Pitfall #12); never log `request.headers` raw; Vercel function logs auto-redacted via Sentry SDK; Langfuse not in Phase 7 surface |
| OAuth state CSRF in Logto sign-in flow | Spoofing / Tampering | Logto SDK enforces state parameter validation in `handleSignIn` (verified in Logto Next docs); never override |
| SSE socket replay attack (resending old `Last-Event-ID` to extract stale events) | Information Disclosure | BFF authorizes per-request via Logto session cookie; `Last-Event-ID` is a positional resume token, not a security token; only the requester (cookie-authed) can read; replay across users blocked by cookie |
| Cookie theft via XSS | Tampering / Information Disclosure | httpOnly cookie (Logto default); React 19 auto-escapes JSX content; `dangerouslySetInnerHTML` ONLY used in Shiki Server Component output (server-controlled markup, not user input) |
| Spec URL containing tracking params (`?key=secret`) leaked into Sentry | Information Disclosure | Sentry `beforeSend` redacts `request.url` query params matching `?key=` / `?token=` (D-30) |
| `claude://` protocol handler hijack | Tampering | Browser-enforced protocol-handler permission; graceful fallback to copy-to-clipboard ensures no escalation if `claude://` is unregistered |
| Idempotency-Key replay (resubmit triggering duplicate generation) | Repudiation | BFF dedupes on `gen_${ulid}` — server-side authority; client-side localStorage keyed by `spec_url + spec_hash` per D-12 prevents double-submit during form session |
| DNS rebinding on SSE endpoint | Spoofing | `apps/api` Hono BFF (Phase 6/8) installs `hostHeaderValidation` middleware (Pitfall #15); Phase 7 frontend has no role here |
| Locked JSX with dangerouslySetInnerHTML or eval | Tampering | Verified by `grep`: locked JSX contains zero `dangerouslySetInnerHTML` and zero `eval`/`new Function`. Confirmed safe to render. |
| Cross-tenant generation peek via job_id enumeration | Information Disclosure | BFF authorizes `GET /api/v1/jobs/:id` against Logto session; anonymous-session generations are claimable but not enumerable; Phase 8 owns this control — Phase 7 wires fetch shape against the contract |

## Sources

### Primary (HIGH confidence)
- `/vercel/next.js` (Context7) — App Router migration from existing React SPA via `next/dynamic({ ssr: false })`; Web Streams API ReadableStream Route Handler pattern; `tsconfig.json` `jsx: react-jsx` + `allowJs: true` for mixed JS/TS projects; `transpilePackages` for monorepo deps
- `/rexxars/eventsource-parser` (Context7) — `EventSourceParserStream` TransformStream API; `createParser` callback API; `pipeThrough` pattern from Node 18+ ReadableStream
- `/logto-io/docs` (Context7) — `@logto/next/server-actions` App Router integration; `signIn`, `handleSignIn`, `getLogtoContext`; redirect URI configuration; cookie-secret config
- `/microsoft/playwright` (Context7) — `toHaveScreenshot` API; `maxDiffPixels` / `maxDiffPixelRatio` config; `expect.toHaveScreenshot` global config in `playwright.config.ts`
- `/shikijs/shiki` (Context7) — Server Component `codeToHtml` pattern; bundle size considerations; `BundledLanguage` types
- `/tanstack/query` (Context7) — App Router `HydrationBoundary` + `prefetchQuery` pattern; per-request `QueryClient` factory
- `packages/contracts/src/{generation-api,idempotency,launch-criteria,usage-event}.ts` (verified directly via Read) — frozen Phase-1 contracts
- `packages/ir/src/types.ts` (verified directly via Read header) — `FinalTool` / `QualityReport` Zod source-of-truth
- `apps/web/src/{*.jsx, MCPGen.html, global.css}` (verified directly via Read) — locked JSX architectural pattern (global UMD-style; `window.<Component>` registrations; no imports/exports)
- `apps/api/src/routes/v1/{generate.ts, jobs/stream.ts}` (verified directly via Read) — BFF 501-stub + SSE-stub shapes
- `.planning/phases/07-frontend-wire-up/07-CONTEXT.md` — 34 locked decisions D-01..D-34
- `.planning/phases/01-foundation/01-CONTEXT.md` (referenced via CONTEXT.md and STATE.md) — Phase 1 freezes
- `.planning/research/PITFALLS.md` #12, #20, #30 (and adjacent #11, #15)
- `RULES.md` §5.7 (UI lock) + §4.3 (privacy lock)
- `docs/mcpgen-architecture.md` §6 (runtime — what dashboard renders), §7 (data model — `usage_hourly` continuous aggregate, `deployments` table), §11 (privacy)

### Secondary (MEDIUM confidence)
- `npm view <pkg> version` — registry version verification for `next` (16.2.4), `@logto/next` (4.2.10), `ulid` (3.0.2), `shiki` (4.0.2), `eventsource-parser` (3.0.8), `@playwright/test` (1.59.1)
- `npm view @logto/next peerDependencies` — Next.js peer-range `>=12` (Next 15 supported)
- Phase-1 `01-08-SPIKE-RESULT.md` (referenced via STATE.md) — local-Bun SSE spike via `wrangler dev --local` (9 events / 90s / last id=8 at t=80s)

### Tertiary (LOW confidence — flagged for validation in plan)
- The exact field names of `@mcpgen/ir` `QualityReport` (`f2_smell.overall_average` vs alternatives) — read header, not full schema; planner verifies in 07-04 first task (A4)
- Whether `screen-stream.jsx` self-driven progress simulation can be externally short-circuited via `onDone` (A1) — requires Plan 07-04 spike
- Whether `claude://` protocol handler is registered by current Claude Desktop builds (A5) — graceful fallback in design ensures non-blocker
- Whether `apps/web/src/screen-deploy.jsx` has a slot for the Claude Desktop config block per D-23 (A6) — Plan 07-09 first task confirms

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every Phase-7 addition (`@logto/next`, `ulid`, `shiki`, `@playwright/test`) verified against npm registry; Phase-1 declared deps verified by `cat apps/web/package.json`
- Architecture: HIGH for Pattern 1 (locked-JSX bridge — extracted by direct file inspection of all 9 screens + tokens.jsx + ui.jsx + MCPGen.html), HIGH for Pattern 2 (SSE — verified against eventsource-parser@3 docs and Phase-1 contract), MEDIUM for SSR boundaries (planner has discretion per D-08 / CONTEXT.md "Claude's Discretion")
- Pitfalls: HIGH — all three primary pitfalls (#12, #20, #30) sourced from `.planning/research/PITFALLS.md` and have direct CONTEXT.md decision mappings
- Wave gating: HIGH — D-31/D-32/D-33/D-34 explicitly lock execution deferral
- Test architecture: HIGH — Vitest already declared; Playwright pattern verified via Context7; Pitfall #20 mandatory test shape derived from D-11/D-27 + the page-reload-mid-generation pattern in the SSE hook
- Security domain: HIGH — Logto + Sentry redaction patterns are project-locked (Phase 1 D-19); no novel security work in Phase 7

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days for stable Phase-1 contracts; library versions may shift — re-verify `npm view` in Plan 07-01 first task)
