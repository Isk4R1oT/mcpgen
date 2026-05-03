# Phase Rebuild — Master Plan

**Goal:** Reimplement the canon in `claude-design-reference/canon/` (single source of truth) as production-grade TSX under our stack, wiring real data from BFF + Engine + Logto + Stripe + Flipt + Langfuse, with 100% pixel/behavior parity. Old shim-based `screen-*.jsx` import system is deleted at the end.

**Two locked principles** (per user 2026-05-03):
1. **All canon UI surfaces survive in code.** Backend-not-ready features go behind `_perm` flags (default OFF) — never stripped, never deferred. Flip flag → feature appears. This is why we built the flag system.
2. **Pixel-perfect implementation.** Visual baseline screenshots from canon HTML are the ground truth; Playwright snapshot tests block any drift > 0.5%.

---

## Phase ownership matrix (for parallel agents)

```
PHASE 0 — FOUNDATION                         (≈2 days, sequential then parallel)
├── F-Tokens         globals.css + tailwind.config.ts from canon tokens.jsx
├── F-VisualBaseline screenshot canon HTML at 4 viewports → visual-baseline/
├── F-UIKit          10 primitives (Btn/TopBar/Icon/Badge/Card/Input/Stamp/Drawer/Toast/Switch)
├── F-i18n           next-intl + en/ru dictionaries from canon i18n.jsx
├── F-Stores         Zustand error-mode store + sonner/vaul wrappers + SSE hook
├── F-BFFClients     typed BFF clients (Zod) + TanStack Query providers
└── F-Storybook      storybook setup + stories for all 10 primitives

PHASE 1 — PUBLIC FLOW                        (≈5 days, 5 parallel agents)
├── A1 Landing       /                       (canon screen-landing.jsx)
├── A2 Canvas        /generate               (canon screen-canvas.jsx) — paste → POST
├── A3 Stream        /generate/[jobId]       (canon screen-stream.jsx) — SSE timeline + 4 error branches
├── A4 Preview+Quality /generate/[jobId]/{preview,quality}
└── A5 Playground+Deploy /generate/[jobId]/{playground,deploy} (incl. DeploySuccess)

PHASE 2 — AUTHED SHELL                       (≈3 days, 4 parallel agents)
├── B1 Auth          /auth                   (canon screen-auth.jsx) + Logto wiring
├── B2 Dashboard     /dashboard, /dashboard/[id]
├── B3 Billing       /billing                (canon screen-billing.jsx) + Stripe meters
└── B4 Marketplace   /marketplace, /marketplace/[id]

PHASE 3 — ADMIN (behind ui_admin_panel_perm=OFF)  (≈5 days, 1 lead + 3 parallel)
├── C1 Admin shell + admin-ui kit            (admin/admin-app.jsx, admin/admin-ui.jsx)
├── C2 Admin core    overview/users/servers/data    (4 screens parallel)
├── C3 Admin ops     llm/marketplace/billing/deploys/flags/integrations  (6 parallel)
└── C4 Admin meta    audit/obs/support/content/broadcast/login          (6 parallel)

PHASE 4 — FLAG WIRING + CLEANUP              (≈3 days, 3 parallel)
├── D1 Flag audit    enumerate every backend-not-ready surface, register _perm flags
├── D2 Disabled UX   for each flag-OFF surface, render canon UI with disabled action + tooltip
└── D3 OLD CODE PURGE
                   delete apps/web/src/screen-*.jsx, app.jsx, ui.jsx, tokens.jsx,
                          i18n.jsx, ux-glue.jsx, tweaks-panel.jsx, global.css
                   delete apps/web/src/lib/jsx-bridge/
                   delete apps/web/src/providers/{global-react-shim,error-mode-shim,
                          i18n-provider,nav-shim}.tsx
                   delete apps/web/scripts/jsx-brace-escape-loader.cjs
                   delete next.config.js webpack JSX brace loader rule
                   delete _*-client.tsx route shims (replaced by direct routes)

PHASE 5 — VISUAL LOCK + E2E                  (≈2 days, 1 agent + me)
├── Playwright snapshot tests at 4 viewports for every screen → CI gate
├── E2E flow tests for each user journey (landing → deploy success; auth → dashboard; billing upgrade)
├── Lighthouse audit (perf budget per docs)
└── Final delete sweep (any remaining "old" / "shim" / "wave-2" markers)
```

**Total (with 3-5 parallel agents): ≈10–14 calendar days.**

---

## Phase 0 — Foundation (in progress)

Sequential gate, then parallel fan-out. ALL Phase 1+ agents wait until Phase 0 is locked + verified.

### F-Tokens (sequential, runs first)
**Output:** `apps/web/src/styles/globals.css` + `apps/web/tailwind.config.ts`
**Source:** `claude-design-reference/canon/tokens.jsx` (the `makeCssVars(tweak)` function)
**Spec:** translate canon palettes (A/B/C/D), 3 font stacks (pp/grot/serif), scale (compact/cozy/comfortable), border styles (soft/sharp/none), shadow styles (block/lift/flat), case (lower/normal), bg (paper/cream) into static CSS vars that match exactly what the canon's `makeCssVars()` outputs. Also extend Tailwind theme so all canon class patterns (`mc-screen`, `mc-grain`, `mc-display-xl`, `mc-mono`, `mc-h1..h3`, `mc-caption`, `mc-caption-up`, `mc-stamp`, `mc-input`, `mc-link`, `mc-btn-*`, `mc-card`, `mc-banner`, `mc-code`, `mc-row`) resolve to canon styling.

### F-VisualBaseline (parallel, can start anytime)
**Output:** `claude-design-reference/visual-baseline/{landing,canvas,stream,preview,quality,playground,deploy,deploy-success,dashboard,dashboard-list,billing,marketplace,server-detail,auth}-{375,768,1280,1920}.png`
**Method:** open `claude-design-reference/canon/MCPGen.html` in headless Chromium with each viewport, navigate via the canon's screen prop (set `?screen=stream` etc.), screenshot full-page.
**Why:** these are the ground truth for Phase 1+ Playwright snapshot tests.

### F-UIKit (after F-Tokens)
**Output:** `apps/web/src/components/ui/{btn,top-bar,icon,badge,card,input,stamp,drawer,toast,switch,lang-switcher}.tsx`
**Source:** `claude-design-reference/canon/ui.jsx` for API + visual spec.
**Stack:** shadcn-ui primitives where applicable (Button → Btn wrapper, Sheet → Drawer wrapper, Sonner → Toast). Pure-canon visual via Tailwind classes from F-Tokens.

### F-i18n (parallel with F-UIKit)
**Output:** `apps/web/messages/{en,ru}.json` + `apps/web/i18n.ts` (next-intl config) + `apps/web/middleware.ts` extension for locale prefix.
**Source:** `claude-design-reference/canon/i18n.jsx` LANGUAGES array + the embedded dictionaries.
**Verify:** every key in canon dictionary == key in JSON; every TSX call to `useTranslations()` resolves.

### F-Stores (parallel with F-UIKit)
**Output:**
- `apps/web/src/stores/error-mode.ts` — Zustand store mirroring canon `useErrorMode()` (none/spec-fail/auth-fail/deploy-fail/rate-limit)
- `apps/web/src/lib/toast.ts` — sonner wrapper matching canon `mcpToast(msg, opts)` API
- `apps/web/src/lib/drawer.tsx` — vaul wrapper matching canon `mcpDrawer(title, body, opts)`
- `apps/web/src/lib/sse/use-generation-sse.ts` — typed SSE consumer for /api/v1/jobs/[jobId]/stream

### F-BFFClients (parallel with F-UIKit)
**Output:** `apps/web/src/lib/api/{generate,jobs,deploys,marketplace,dashboard,billing}.ts` — typed BFF clients with Zod request/response validation, TanStack Query hooks (`useGenerate`, `useJob`, `useDeployments`, etc.).

### F-Storybook (after F-UIKit)
**Output:** `apps/web/.storybook/` config + 10 stories (one per primitive). Visual regression smoke test in CI.

**Phase 0 gate criteria:**
1. `pnpm tsc --noEmit` exits 0
2. Storybook renders all 10 primitives
3. Visual baseline screenshots captured
4. Tokens lint: `apps/web/src/styles/globals.css` exposes every CSS var that canon `makeCssVars()` outputs

---

## Phase 1+ — see ownership matrix above

Each phase 1+ agent is briefed identically:
- **Read:** `claude-design-reference/canon/<screen>.jsx` (visual + behavior spec)
- **Implement:** under `apps/web/src/components/screens/<screen>/`
- **Use:** Phase 0 UI kit + tokens + i18n + stores + BFF clients
- **Test:** Playwright snapshot at 4 viewports against `claude-design-reference/visual-baseline/<screen>-<viewport>.png`; flow test for primary user action
- **Flag-gate** any backend-not-ready surface; never strip
- **Update:** `apps/web/src/app/<route>/page.tsx` to render the new component (Server Component) + a `<route>-client.tsx` only if interactivity demands

---

## Anti-patterns (banned for the whole rebuild)

- ❌ Editing any file under `claude-design-reference/canon/`.
- ❌ Importing canon `.jsx` at runtime (the old jsx-bridge approach is being dismantled in Phase 4).
- ❌ Stripping unimplemented surfaces. Always render-with-flag.
- ❌ "Just one quick simplification" of canon visual or copy.
- ❌ Multi-screen agents (1 agent = 1 screen ownership; PRs stay small).
- ❌ Skipping the visual snapshot test on a screen.
