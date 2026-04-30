# Phase 7: Frontend Wire-Up - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 07-frontend-wire-up
**Mode:** `--auto --ws frontend` (recommended option auto-selected for each gray area)
**Areas discussed:** Locked-UI handling · Next.js routing & screen mapping · Data layer & state management · Idempotency-key handling · Fixture-mode (Wave 1 unblocking) · Auth integration (Logto) · Quality badge rendering · One-click deploy + Claude Desktop config · Test strategy · Sentry source-map upload · Wave gating & merge order

> **Mid-discussion user clarification (2026-04-26):**
>
> > UI уже распакован (Phase 1 commit ee60dee) — НЕ переделывать. UI ЗАЛОЧЕН — никаких визуальных изменений. Phase 7 = wire-up only (state, fetch calls, SSE consumption, error display). Acceptance criterion: `git diff` apps/web/src/styles/ apps/web/src/components/ui/ shows ZERO changes. Wave 1 (landing/auth) — start now (independent). Wave 2-3 (generation/preview/dashboard) — execute defer until engine ready.
>
> Affected decisions: D-01, D-02, D-03, K (Wave gating).
> Affected scope statements: "In scope" (removed JSX → TSX migration; replaced with "import as-is").
> Affected deferred ideas: added "Port locked JSX → TSX / re-style with Tailwind utility classes / replace ui.jsx primitives with shadcn/ui — explicitly forbidden".

---

## A. Locked-UI handling — JSX → TSX migration vs. import as-is

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate JSX → TSX, recreate primitives in `apps/web/src/components/ui/` + `apps/web/src/styles/` (frozen-after-migration); rendered output is the lock | Initial auto-pick before user clarification — preserves "rendered output is the lock" interpretation but burns weeks on a port that drifts visuals | |
| **Import locked JSX as-is via Next.js native JSX support; wire-up code lives in NEW dirs (`apps/web/src/app/`, `apps/web/src/lib/`); the JSX files THEMSELVES are the lock target — file-diff lock, not pixel-diff lock** | User clarified mid-discussion: "UI уже распакован — НЕ переделывать"; the locked JSX files at their existing paths are the lock target; Next.js 15 SWC compiles `.jsx` natively | ✓ |
| Wrap `MCPGen.html` in an iframe served from a static path | Side-steps SSR but breaks SEO, kills Suspense, complicates auth, fails the transparency principle | |
| Run Babel-standalone at runtime to render the JSX in-browser | Matches the prototype but breaks SSR, hurts performance, blocks streaming SSE, needs CSP exceptions | |

**User's choice:** Import locked JSX as-is (chosen after mid-discussion clarification).
**Notes:** The pre-commit hook `.pre-commit-hooks/check-ui-locked.sh` had the wrong regex (it expected `apps/web/src/styles/` + `apps/web/src/components/ui/` subdirs but the unzip flattened to `apps/web/src/`). Phase 7 Plan 1 first task re-points the regex at actual locked paths AND consumes the still-present `apps/web/.unzip-commit-allowed` marker.

---

## B. Next.js routing & screen-to-route mapping

| Option | Description | Selected |
|--------|-------------|----------|
| **App Router with 1:1 screen-to-route mapping** | Canonical Next.js 15 path; native streaming SSE; React 19 Server Components; matches sprint timeline | ✓ |
| Pages Router with `getServerSideProps` for SSE | Worse Suspense story; would force a future migration; not aligned with React 19 idioms | |
| Hybrid (App Router for new wire-up routes, Pages Router for prototype embed) | Two-router complexity for solo founder; YAGNI | |

**User's choice:** App Router 1:1 mapping (auto-selected recommendation).
**Notes:** Route map locked in D-06 so the planner doesn't relitigate. Pricing route composes from locked `ui.jsx` primitives only — if that composition feels like a visual addition during planning, drop pricing and inline a placeholder until Phase 8.

---

## C. Data layer & state management

| Option | Description | Selected |
|--------|-------------|----------|
| **TanStack Query 5.x for server state + native React 19 hooks for local state + custom `useGenerationSSE` hook** | Already declared in `apps/web/package.json` Phase 1; matches "no premature abstractions" rule; pairs with Server Components | ✓ |
| TanStack Query + Zustand for SSE event log | Adds a third state library; YAGNI for wire-up phase | |
| Server-only state via React Server Components + `useFormState` | Insufficient for SSE / streaming progress visibility | |
| Redux Toolkit + RTK Query | Heavier than needed; Redux is YAGNI for solo-founder wire-up | |

**User's choice:** TanStack Query + native hooks + custom SSE hook (auto-selected).

| Option | Description | Selected |
|--------|-------------|----------|
| **Native `fetch()` + `eventsource-parser@3` (already a dep)** | Sends custom headers (`Authorization`, `Last-Event-ID`); supports POST; explicit reconnect control; canonical Next.js pattern | ✓ |
| `EventSource` Web API | Cannot send custom headers; fire-and-forget on errors; cannot send POST — disqualifies it for our use case | |
| `@microsoft/fetch-event-source` | Functional alternative but adds a dep when `eventsource-parser` is already in `package.json` | |

**User's choice:** Native fetch + eventsource-parser (auto-selected).

---

## D. Idempotency-key handling

| Option | Description | Selected |
|--------|-------------|----------|
| **Client-side `Idempotency-Key: gen_${ulid}` persisted in `localStorage` keyed by `spec_url + spec_hash`** | Deterministic retry from "Try again" buttons; survives page reloads; aligns with Phase-1 D-11 | ✓ |
| Server-supplied key only (BFF generates if missing) | Loses deterministic retry from same form session after reloads | |
| Client-side UUID v4 | Misses ULID's monotonic time-ordering benefit; Phase-1 contract uses ULID elsewhere | |

**User's choice:** Client ULID + localStorage (auto-selected).

---

## E. Fixture-mode (Wave 1 unblocking)

| Option | Description | Selected |
|--------|-------------|----------|
| **`MCPGEN_FRONTEND_MODE=fixtures` env routes to a Next.js Route Handler that streams pre-recorded SSE timeline from `@mcpgen/engine-fixtures`** | Enables Wave 1 to ship complete (form → SSE → preview → quality → mock deploy) before engine; reuses Phase-1 fixture set; supports `last_event_id` resume so reload test passes in fixture mode | ✓ |
| Stand up a separate mock-server in `apps/api` | Adds a runtime surface to maintain; YAGNI when Next.js Route Handlers can do the same | |
| Hardcode a static JSON response (no streaming) | Defeats the purpose of testing SSE consumption end-to-end | |
| Use MSW (Mock Service Worker) | Adds a dep + adds intercept layer fragility for browser-only mocking | |

**User's choice:** Env-toggled Route Handler (auto-selected).

---

## F. Auth integration (Logto)

| Option | Description | Selected |
|--------|-------------|----------|
| **`@logto/next@^4` SDK with email + GitHub providers; httpOnly cookie session; middleware on `/dashboard/*`** | Canonical Next.js 15 path; aligned with Phase-1 D-14; matches CTRL-02 + RULES.md provider list | ✓ |
| NextAuth.js | Different opinionated stack; would deviate from project-locked Logto choice | |
| Custom session via Lucia / Iron-session | Builds auth from scratch; YAGNI when Logto is project-locked | |

**User's choice:** `@logto/next` with cookie session (auto-selected).

---

## G. Quality badge rendering

| Option | Description | Selected |
|--------|-------------|----------|
| **Tier mapping imports thresholds from `packages/contracts/launch-criteria.ts`; rendered from `QualityReport` JSON in Postgres** | Threshold changes auto-flow to UI; matches Phase-1 D-13 locked-constants pattern | ✓ |
| Hardcode tier thresholds in frontend | Drifts when launch criteria change; defeats Phase-1 D-13 enforcement | |
| Frontend computes scores from raw F2/F3 outputs | Duplicates engine logic; brittle; bandwidth-wasteful | |

**User's choice:** Import from contracts (auto-selected).

---

## H. One-click deploy + Claude Desktop config (Pitfall #30)

| Option | Description | Selected |
|--------|-------------|----------|
| **BFF returns `claude_desktop_config` JSON; frontend renders into existing config-block UI region in locked `screen-deploy.jsx` with copy-to-clipboard; `claude://` protocol handler with copy fallback; collision detection at deploy submit time via 409 response** | Aligns with browser sandbox limits; reuses locked UI; matches Pitfall #30 mitigation | ✓ |
| Frontend computes config block client-side | Duplicates BFF logic; introduces drift surface | |
| Detect existing Claude Desktop config via browser API | Browser cannot read local FS — physically impossible from a sandbox | |

**User's choice:** Server-rendered config + 409-collision-detection (auto-selected).

---

## I. Test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| **Three layers: Vitest (lib/) + Playwright integration (fixture mode) + Playwright screenshot-diff (visual lock)** | Fast unit feedback + E2E without engine + redundant visual safety net | ✓ |
| Vitest only (no Playwright) | Misses E2E coverage of SSE reconnect flow; cannot enforce visual lock empirically | |
| Cypress instead of Playwright | Phase 1 didn't pin Cypress; Playwright has better Next.js 15 support | |

**User's choice:** Three test layers (auto-selected).

| Option | Description | Selected |
|--------|-------------|----------|
| Add Storybook | Components not reused outside Phase 7; locked design = low value | |
| **No Storybook** | YAGNI for solo founder; locked-design + single-product-surface = no benefit | ✓ |

**User's choice:** No Storybook (auto-selected).

---

## J. Sentry source-map upload

| Option | Description | Selected |
|--------|-------------|----------|
| **`@sentry/nextjs@^10` `withSentryConfig` wrapper (already wired in Phase 1); Vercel auto-uploads source maps; `beforeSend` strips `Authorization` / `X-Upstream-Auth` / `Cookie` / `?key=` / `?token=`** | Matches Phase-1 D-19 pattern; covers Pitfall #12 deliberately-leak audit | ✓ |
| Manual `sentry-cli` upload step in CI | Redundant when `withSentryConfig` already auto-uploads | |
| Disable source maps until Phase 9 | Defeats the Phase-1 source-map upload acceptance | |

**User's choice:** withSentryConfig + beforeSend redaction (auto-selected).

---

## K. Wave gating & merge order — execution deferral

| Option | Description | Selected |
|--------|-------------|----------|
| Run Wave 2-3 plans against fixture mode now; merge after engine/runtime ships | Wastes effort: tests would re-run anyway against real engine; risk of carrying mock-only assumptions into real wire-up | |
| **Wave 1 plan + execute now (against Phase 1 contracts + fixtures); Wave 2-3 plans WRITTEN now (so the planner doesn't have to re-context) but EXECUTION blocked via `EXECUTION-BLOCKED-UNTIL: phase-{5,6}-merged` plan-frontmatter markers** | Captures decisions while context is fresh; defers cost until real engine signals exist; mirrors user's clarification | ✓ |
| Wait until Phase 5 + 6 merge to even start Phase 7 planning | Loses 3+ weeks of frontend Wave 1 work that could ship in parallel; misses Friday demo cadence at W3/W4 | |

**User's choice:** Wave 1 plan + execute; Wave 2-3 plan-only (execution-blocked) — chosen after user clarified that Wave 2-3 execution is deferred, not just merge.

---

## Claude's Discretion (areas where planner has flexibility)

- Specific Server Component / Client Component boundary per route (decided per-screen during planning based on which sub-trees need hooks)
- Server-side data fetching pattern (`fetch` cache strategy, `revalidatePath` vs `revalidateTag` invalidation) — pick the simplest per route
- Form validation library — `zod@^4` is already a dep; planner can use it directly or wrap in `react-hook-form` if cross-field validation gets complex
- Error boundary hierarchy depth — at minimum a root `error.tsx`, but per-route `error.tsx` can be added where helpful
- Whether to use Next.js Route Handlers or a thin Hono adapter for the `/api/v1/*` proxy — Route Handlers default; switch only if a concrete reason emerges
- Specific code-highlighting library for preview screen (`shiki@^1` is the suggested default but planner may pick `prismjs` or even server-side rendering of pre-tokenized HTML if SSR-friendly highlighting becomes flaky)

## Deferred Ideas (mentioned but belong in other phases)

- In-browser tool execution playground → backlog `FE-06`
- Markdown / PDF export of Quality Report → backlog `FE-07`
- Inline edit description in preview → backlog `GEN-15`
- Tool-level "regenerate this one" → backlog `GEN-14`
- `mcpgen logs --tail` CLI subcommand → backlog `CTRL-11`
- Status badge SVG endpoint → backlog `CTRL-14`
- Multi-region deploy → out-of-scope per PROJECT.md
- A/B deploys + canary releases / custom domains → backlog `CTRL-12`/`CTRL-13`
- SSO / Team plan / RBAC → backlog `AUTH-01`/`AUTH-02`
- Storybook component playground → explicitly excluded (D-28)
- In-frontend collision detection of existing Claude Desktop config → CLI-only per D-23 (browser sandbox limit)
- Port locked JSX → TSX / re-style with Tailwind utility classes / replace `ui.jsx` primitives with shadcn/ui → **explicitly forbidden by user 2026-04-26 + RULES.md UI-LOCKED**
- Pricing page implementation that introduces new visual elements → if planner cannot compose pricing from locked `ui.jsx` primitives only, drop the route and inline a placeholder until Phase 8
