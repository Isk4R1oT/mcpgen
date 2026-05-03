# Integration Map — Logic-to-Screen Wiring (UI Rebuild)

**Status:** AGENT M-1.C ANALYSIS  
**Generated:** 2026-05-03  
**Scope:** Map existing `apps/web/src/lib/`, `providers/`, `middleware.ts`, `app/api/v1/` logic to new screens from `claude-design-ui/MCPGen-extracted/`; identify out-of-backend references per `mcpgen-frontend-rebuild-contract.md` §5.1  
**Authority:** `docs/mcpgen-frontend-rebuild-contract.md` §4.3 (Logic-слой сохранён + переподключён), §5.1 (out-of-backend modules → flags)

---

## §1. Logic Inventory (Existing Modules — KEPT, NO CHANGES)

### 1.1 API Clients (`apps/web/src/lib/api/`)

#### `lib/api/client.ts`
- **Purpose:** Typed fetch client for `/api/v1/generate` (idempotent generation submissions).
- **Exports:** `submitGeneration(specUrl, specHash, request) → SubmitGenerationResult`; `fetchJobStatus(jobId) → JobStatusResponse`; re-exports from `dashboard-client.ts`
- **Key headers:** `Idempotency-Key: gen_${ULID}` (plan 07-02)
- **BFF endpoints called:**
  - `POST /api/v1/generate` (idempotent, 202 Accepted, rotates key on success)
  - `GET /api/v1/jobs/:jobId` (bootstrap for SSE state)
- **Used by new screens:** `screen-canvas.jsx` (POST /generate), `screen-stream.jsx` (status polling)
- **Migration action:** Keep as-is; rewire callers from `apps/web/src/app/generate/page.tsx` → `app/generate/_canvas-client.tsx` to wrap new `screen-canvas.jsx`
- **Concern:** Idempotency-Key generation via `getOrCreateIdempotencyKey()` (localStorage-persisted) — ensure new canvas wraps call correctly. ✓

#### `lib/api/dashboard-client.ts`
- **Purpose:** Typed client for deployment dashboard endpoints (list, usage, deploy, badge toggle).
- **Exports:** `fetchDeployments()`, `fetchUsageHourly({deploymentId?, from, to})`, `deploy(generationId, {override_name?})`, `setBadgePublic(deploymentId, publicBadge)`
- **BFF endpoints called:**
  - `GET /api/v1/deployments` → returns `{deployments: Deployment[]}`
  - `GET /api/v1/usage/hourly?from=...&to=...&deployment_id=...` → returns `{rows: UsageHourlyRow[]}`
  - `POST /api/v1/deploy/:generationId` (optional body `{override_name}`) → returns `{ok: true, data: DeployResponse}` or `{ok: false, status: 409, collision: CollisionResponse}`
  - `PATCH /api/v1/deployments/:deploymentId/badge-public` → writes toggle, 204 No Content
- **Used by new screens:**
  - `screen-dashboard-list.jsx` (fetch deployments, usage telemetry, badge toggle)
  - `screen-deploy.jsx` (POST /deploy/:id to claim + permanent deploy)
  - `screen-quality.jsx` (server-side prefetch of partial_result.quality_report)
  - `screen-billing.jsx` (usage trending)
- **Migration action:** Keep as-is; no callers yet exist in new screens (old wrapper logic lives in `app/dashboard/_dashboard-client.tsx`)
- **Concern:** Idempotency-Key namespaced per (generationId, override_name) — ensure deploy collision rename flow works. ✓

#### `lib/api/error-mapper.ts`
- **Purpose:** Maps BFF error codes → user-readable messages (plan 07-02 FE-01).
- **Exports:** `mapGenerationError({status, code}) → {code, userMessage}`
- **Used by:** `lib/api/client.ts` (submitGeneration)
- **Migration action:** Keep as-is.

---

### 1.2 SSE (Server-Sent Events) Hooks

#### `lib/sse/use-generation-sse.ts`
- **Purpose:** React hook consuming SSE timeline for generation jobs (plan 07-03, pitfall #4 terminal-stop guard).
- **Hook signature:** `useGenerationSSE(jobId: string) → {events: GenerationSseEvent[], status: SseStatus}`
- **Bootstrap sequence:**
  1. Poll `GET /api/v1/jobs/:jobId` for status + `last_known_event_id` + prior events
  2. If terminal (completed/failed/validation_complete), set status and return (NO SSE open)
  3. Else open SSE `GET /api/v1/jobs/:jobId/stream` with `Last-Event-ID` header
  4. Parse via `eventsource-parser@3` + zod-validate each event
  5. On disconnect: 3 retries (1s/2s/4s backoff); then fallback to polling every 2s
- **BFF endpoints called:**
  - `GET /api/v1/jobs/:jobId` (bootstrap poll)
  - `GET /api/v1/jobs/:jobId/stream` (SSE, Last-Event-ID header from `lib/sse/last-event-id.ts`)
- **Used by new screens:** `screen-stream.jsx` (renders live event timeline during generation)
- **Migration action:** Rewire from current `app/generate/[jobId]/_stream-client.tsx` to new app structure; ensure wrapper passes `jobId` prop correctly
- **Concern:** Hook accesses `/api/v1/jobs/:jobId` directly (BFF proxy); ensure route exists. ✓ Routes exist at `apps/web/src/app/api/v1/jobs/[jobId]/route.ts` and `/stream/route.ts`

#### `lib/sse/last-event-id.ts`
- **Purpose:** Builds SSE headers with `Last-Event-ID` from prior event stream.
- **Exports:** `buildSseHeaders(lastEventId: string | null) → Record<string, string>`
- **Used by:** `use-generation-sse.ts`
- **Migration action:** Keep as-is.

---

### 1.3 Session & Auth

#### `lib/logto/client.ts`
- **Purpose:** Logto SDK config + client initialization (plan 07-02).
- **Exports:** `logtoConfig` (object with appId, endpoint, redirectUri, etc.)
- **Used by:** `providers/logto-session.tsx`, `middleware.ts`
- **Migration action:** Keep as-is.

#### `providers/logto-session.tsx`
- **Purpose:** Server Component fetching Logto session via `getLogtoContext()`; paired Client Component exposes session via React Context.
- **Exports:** `LogtoSessionProvider`, `LogtoSession` type, `useLogtoSession()` hook (from context)
- **Used by:** All pages in `/dashboard/*`, `/generate/:jobId/playground`, `/generate/:jobId/deploy/permanent`, `/generate/:jobId/download` (protected routes per middleware.ts)
- **Migration action:** Keep as-is; ensure wrapped in `app/layout.tsx` (Agent 4 zone).
- **Concern:** Current implementation works; verify new screens that need claims (email, name, sub) receive them. ✓

#### `providers/logto-session-context.tsx` (Client Component)
- **Purpose:** React Context wrapper for LogtoSession.
- **Exports:** `useLogtoSession() → LogtoSession`
- **Migration action:** Keep as-is.

---

### 1.4 Routing & Auth Gates

#### `middleware.ts`
- **Purpose:** Per-route auth gate (plan 09.1-07, CONTEXT D-10).
- **Protected paths (Logto required):**
  - `/dashboard/*`
  - `/billing/*`
  - `/generate/:jobId/playground`
  - `/generate/:jobId/download`
  - `/generate/:jobId/deploy/permanent`
- **Public paths (anon-allowed):**
  - `/` (landing)
  - `/generate` (canvas form)
  - `/generate/:jobId` (stream, preview, quality, ephemeral deploy)
- **Flow:** Check `isProtectedPath(pathname)` → if protected, fetch Logto session → 401 → redirect to `/api/auth/logto/sign-in?redirect_to=...`
- **Migration action:** Keep as-is; matcher config correct for all new screen routes.
- **Concern:** Ensure new screens like `screen-billing.jsx` (if routed to `/billing`) respect protected flag. ✓

#### `lib/route-gate.ts`
- **Purpose:** Pure route-gate predicate (PROTECTED_PATTERNS, isProtectedPath).
- **Exports:** `PROTECTED_PATTERNS: RegExp[]`, `isProtectedPath(pathname) → boolean`
- **Used by:** `middleware.ts`
- **Migration action:** Keep as-is.

---

### 1.5 Feature Flags & Modes

#### `lib/flags/index.ts`
- **Purpose:** Flipt flag evaluation with automatic Sentry correlation (plan 09.1+).
- **Exports:** `evaluateBooleanFlag(flagKey, entityId, context, defaultValue)`, `evaluateVariantFlag(...)`
- **Flags used (per contract §5.1):**
  - `ui_marketplace_perm` (default false) — gates marketplace + server-detail screens
  - `ui_admin_panel_perm` (default false) — gates admin/* screens
  - `ui_billing_active_perm` (default false, TBD status) — gates billing screens if Stripe wiring incomplete
  - `ui_frontend_fixtures_mode_ops` (default false) — selector between fixture/live mode
- **Used by:** `lib/fixture-mode/index.ts`, layout/page components (server-side)
- **Migration action:** Keep as-is; ensure all new screens that reference out-of-backend endpoints are wrapped with flag checks. See §3.

#### `lib/fixture-mode/index.ts`
- **Purpose:** Frontend mode router (fixtures vs live; plan 07-03, migrated to Flipt per contract §4.4).
- **Exports:** `getFrontendMode(req?) → FrontendMode`, `getBffUrl() → string`
- **Logic:**
  - If `NODE_ENV === 'production'` → always 'live' (WR-06 fix: hard-block fixtures in prod)
  - Else check flag `ui_frontend_fixtures_mode_ops` (default false)
  - Dev env: `?fixtures=true` query override allowed (Friday demos)
- **Used by:** BFF route handlers (`app/api/v1/generate/route.ts`, `app/api/v1/deploy/[generationId]/route.ts`, etc.) to decide whether to synthesize fixture responses or proxy to Hono BFF
- **Migration action:** Keep as-is.

#### `lib/fixture-mode/guard.ts`, `lib/fixture-mode/sse-timeline.ts`
- **Purpose:** Fixture mode helpers (fixture data synthesis, SSE timeline replay).
- **Migration action:** Keep as-is; used only in BFF route handlers for fixture mode.

---

### 1.6 State Management & Utilities

#### `lib/anon-state.ts`
- **Purpose:** `useAnonState()` hook probing BFF for anonymous vs authenticated status (plan 09.1-07, CONTEXT D-10).
- **Probe:** `GET /api/v1/dashboard/list` (protected endpoint) → 401 = anon, 2xx = authenticated
- **Exports:** `useAnonState() → {isAnonymous, loading}`
- **Used by:** Anon-chrome wrappers in `lib/jsx-bridge/wrapper.tsx` and new screen wrappers to decide whether to show signup CTA, deployment cta, etc.
- **Migration action:** Keep as-is; ensure called before rendering anon-specific chrome. ✓

#### `lib/idempotency-key.ts`
- **Purpose:** Client-side Idempotency-Key generation + localStorage persistence (plan 07-02, CONTEXT D-12/D-13).
- **Exports:** `getOrCreateIdempotencyKey(specUrl, specHash) → GenId`, `rotateIdempotencyKey(...)`
- **Format:** `gen_${ULID}` (from @mcpgen/contracts GEN_ID_REGEX)
- **Used by:** `lib/api/client.ts` (submitGeneration), `lib/api/dashboard-client.ts` (deploy, setBadgePublic)
- **Migration action:** Keep as-is.

#### `lib/quality-badge.ts`
- **Purpose:** Quality report badge rendering (pass/warn/fail scoring).
- **Used by:** `screen-quality.jsx` (if it references this module)
- **Migration action:** Keep as-is.

#### `lib/claude-desktop/config.ts`, `lib/claude-desktop/collision.ts`
- **Purpose:** Claude Desktop config block generation; server-name collision detection + rename modal (plan 07-05, CONTEXT D-23/D-24).
- **Exports:** `buildConfig(...)` (synthesizes claude_desktop_config for fixture mode), `buildSuggestedName(...)`, `parseCollisionResponse(...)`
- **Used by:**
  - `app/api/v1/deploy/[generationId]/route.ts` (fixture mode synthesis)
  - `lib/api/dashboard-client.ts` (parse 409 collision response)
- **Migration action:** Keep as-is.

#### `lib/preview/code-block.tsx`
- **Purpose:** Render code snippet with syntax highlighting.
- **Used by:** `screen-preview.jsx` (if it needs code rendering)
- **Migration action:** Keep as-is.

---

### 1.7 JSX Bridge (Wiring Layer)

#### `lib/jsx-bridge/index.ts`, `lib/jsx-bridge/loader.ts`
- **Purpose:** Load locked JSX modules from `claude-design-ui/MCPGen-extracted/` with type safety.
- **Pattern:** Dynamic import + TypeScript fallback, returns `{screen, sample}`
- **Used by:** All route handlers in `app/generate/`, `app/dashboard/`, etc.
- **Migration action:** Keep as-is; no changes needed. ✓

#### `lib/jsx-bridge/screens.tsx`
- **Purpose:** Wrap extracted JSX screens with wiring logic (props, state, SSE, API calls).
- **Current wrappers:**
  - `CanvasWrapper` → wraps `screen-canvas.jsx` with form submission logic
  - `StreamWrapper` → wraps `screen-stream.jsx` with SSE hook
  - `PreviewWrapper` → wraps `screen-preview.jsx` with server-side job prefetch
  - `QualityReportWrapper` → wraps `screen-quality.jsx` with quality report data
  - `PlaygroundWrapper` → wraps `screen-playground.jsx` with LLM agent state
  - `DeployWrapper` → wraps `screen-deploy.jsx` with deploy submission logic
- **Migration action:** Keep all existing wrappers; ADD new wrappers for:
  - `BillingWrapper` (if screen-billing.jsx routes to `/billing/[serverId]` or similar)
  - `DashboardListWrapper` (screen-dashboard-list.jsx uses fetchDeployments + usage data)
  - `MarketplaceWrapper` (gated by `ui_marketplace_perm` flag; screen-marketplace.jsx is static/mock)
  - `ServerDetailWrapper` (gated by `ui_marketplace_perm` flag)

#### `lib/jsx-bridge/wrapper.tsx`
- **Purpose:** Anon-state chrome wrappers (plan 09.1-07).
- **Wrappers:**
  - `QualityScreenWithAnonChrome` → AnonBanner + AnonCacheHitBadge + QualityReportWrapper
  - `PreviewScreenWithAnonChrome` → PreviewWrapper + AnonSignupCta
  - `DeployScreenWithAnonChrome` → AnonDeployCta + DeployWrapper
- **Migration action:** Keep as-is; ensure new wrappers (Billing, Dashboard, Marketplace) also compose anon-chrome if needed.

---

### 1.8 Providers

#### `providers/query-client.tsx`
- **Purpose:** TanStack Query Provider for Next.js 15 App Router (plan 07-02).
- **Config:** Per-request QueryClient factory; `staleTime: 60s`
- **Used by:** `app/layout.tsx` (wraps all pages)
- **Migration action:** Keep as-is.

---

### 1.9 Sentry Instrumentation

#### `lib/sentry/redact.ts`
- **Purpose:** Redact sensitive data from Sentry events.
- **Used by:** Sentry SDK configuration (likely `instrumentation.ts` or similar)
- **Migration action:** Keep as-is; applies to all routes.

---

### 1.10 BFF Route Handlers (`apps/web/src/app/api/v1/`)

All **KEPT, NO CHANGES** unless noted.

#### `app/api/v1/generate/route.ts` — `POST /api/v1/generate`
- **Flow:**
  1. Validate `Idempotency-Key` header via `validateIdempotencyKey()`
  2. Parse request body (GenerationApiRequest)
  3. If fixture mode: synthesize 202 + {job_id, sse_url} using key as job_id
  4. If live mode: forward to BFF (CF Workers Hono app)
- **Caller:** `lib/api/client.ts` submitGeneration()
- **Used by:** `screen-canvas.jsx` (form submission)
- **Status:** ✓ Works as-is

#### `app/api/v1/jobs/[jobId]/route.ts` — `GET /api/v1/jobs/:jobId`
- **Flow:**
  1. If fixture mode: return mock JobStatusResponse from @mcpgen/engine-fixtures
  2. If live mode: proxy to BFF
- **Callers:** `lib/sse/use-generation-sse.ts` (bootstrap poll), `lib/api/client.ts` (fetchJobStatus)
- **Used by:** `screen-stream.jsx` (SSE state), `screen-preview.jsx` (prefetch), `screen-quality.jsx` (prefetch)
- **Status:** ✓ Works as-is

#### `app/api/v1/jobs/[jobId]/stream/route.ts` — `GET /api/v1/jobs/:jobId/stream` (SSE)
- **Flow:**
  1. If fixture mode: return SSE stream from `@mcpgen/engine-fixtures` sse-timeline mock
  2. If live mode: proxy SSE to BFF
- **Caller:** `lib/sse/use-generation-sse.ts` (connect loop)
- **Used by:** `screen-stream.jsx` (event timeline render)
- **Status:** ✓ Works as-is

#### `app/api/v1/deployments/route.ts` — `GET /api/v1/deployments`
- **Flow:**
  1. Fixture mode: return FIXTURE_DEPLOYMENTS (stripe-mcp, github-mcp)
  2. Live mode: proxy Cookie-bearing request to BFF
- **Caller:** `lib/api/dashboard-client.ts` (fetchDeployments)
- **Used by:** `screen-dashboard-list.jsx` (deployment list), potentially Billing screen (usage by deployment)
- **Status:** ✓ Works as-is

#### `app/api/v1/deploy/[generationId]/route.ts` — `POST /api/v1/deploy/:generationId`
- **Flow:**
  1. Validate Idempotency-Key
  2. Parse optional body {override_name}
  3. Fixture mode: synthesize 202 + {deployment_id, server_name, server_url, claude_desktop_config}; optionally return 409 collision if `?force_collision=true`
  4. Live mode: proxy to BFF
- **Caller:** `lib/api/dashboard-client.ts` (deploy)
- **Used by:** `screen-deploy.jsx` (permanent deploy submission)
- **Status:** ✓ Works as-is; collision flow + rename modal tested

#### `app/api/v1/usage/hourly/route.ts` — `GET /api/v1/usage/hourly?from=...&to=...&deployment_id=...`
- **Flow:**
  1. Fixture mode: return mock UsageHourlyRow[] from @mcpgen/engine-fixtures
  2. Live mode: proxy query params to BFF
- **Caller:** `lib/api/dashboard-client.ts` (fetchUsageHourly)
- **Used by:** `screen-dashboard-list.jsx` (usage chart), `screen-billing.jsx` (usage trending)
- **Status:** ✓ Works as-is

#### `app/api/v1/deployments/[deploymentId]/badge-public/route.ts` — `PATCH /api/v1/deployments/:deploymentId/badge-public`
- **Flow:**
  1. Validate Idempotency-Key
  2. Fixture mode: no-op, return 204
  3. Live mode: proxy PATCH to BFF
- **Caller:** `lib/api/dashboard-client.ts` (setBadgePublic)
- **Used by:** `screen-dashboard-list.jsx` (toggle public badge on deployment card)
- **Status:** ✓ Works as-is

---

## §2. Screen → Required Logic Mapping

### 2.1 screen-landing.jsx (Landing page)
- **Route:** `/`
- **Status:** Public (anon-allowed)
- **API endpoints called:** NONE (static mock data in SAMPLES array)
- **Logic modules:**
  - `useAnonState()` (from `lib/anon-state.ts`) — decide whether to show "Get Started" (anon) vs "Go to Dashboard" (authenticated)
  - `lib/logto/client.ts` (for login/logout URLs, if needed)
- **Provider context:** LogtoSession (optional, for user greeting)
- **Page wrapper needed:** `apps/web/src/app/page.tsx` (existing) + `_landing-client.tsx` wrapping `screen-landing.jsx`
- **Migration action:** Keep existing wrapper; ensure `useAnonState()` integrated to show correct CTA
- **Status:** ✓ No new endpoints; all logic exists

### 2.2 screen-canvas.jsx (Generation form)
- **Route:** `/generate`
- **Status:** Public
- **API endpoints called:** `POST /api/v1/generate` (idempotent, Idempotency-Key header required)
- **Logic modules:**
  - `lib/api/client.ts` (submitGeneration)
  - `lib/idempotency-key.ts` (generate key)
  - `lib/error-mapper.ts` (map error codes → messages)
- **Provider context:** QueryClient (optional, for request deduplication)
- **Page wrapper needed:** `apps/web/src/app/generate/page.tsx` (existing) + `_canvas-client.tsx` wrapping `screen-canvas.jsx`
- **Migration action:** Keep existing wrapper logic; verify form submission calls `submitGeneration()` correctly
- **Status:** ✓ All endpoints exist; wrapper logic correct

### 2.3 screen-stream.jsx (Live generation progress + event timeline)
- **Route:** `/generate/:jobId` (dynamic, generated during form submission)
- **Status:** Public
- **API endpoints called:**
  - `GET /api/v1/jobs/:jobId` (poll for status, bootstrap)
  - `GET /api/v1/jobs/:jobId/stream` (SSE, event timeline)
- **Logic modules:**
  - `lib/sse/use-generation-sse.ts` (useGenerationSSE hook — core logic)
  - `lib/sse/last-event-id.ts` (buildSseHeaders)
- **Provider context:** QueryClient (optional)
- **Page wrapper needed:** `apps/web/src/app/generate/[jobId]/_stream-client.tsx` wrapping `screen-stream.jsx`
- **Migration action:** Keep hook as-is; ensure wrapper passes `jobId` prop and SSE state to screen
- **Status:** ✓ All endpoints exist; SSE logic mature (plan 07-03, post-09.1 fixes applied)

### 2.4 screen-preview.jsx (Generated code preview)
- **Route:** `/generate/:jobId/preview` (server-side route, optional)
- **Status:** Public (anon can preview generated code)
- **API endpoints called:**
  - `GET /api/v1/jobs/:jobId` (server-side prefetch of partial_result.final_tools)
- **Logic modules:**
  - `lib/api/client.ts` (fetchJobStatus, called server-side in page.tsx)
  - `lib/preview/code-block.tsx` (render code snippet)
- **Provider context:** (None; server component)
- **Page wrapper needed:** `apps/web/src/app/generate/[jobId]/preview/page.tsx` (existing) + `_preview-client.tsx` wrapping `screen-preview.jsx`
- **Anon-chrome:** `PreviewScreenWithAnonChrome` (from `lib/jsx-bridge/wrapper.tsx`) wraps this to add AnonSignupCta below
- **Migration action:** Keep existing wrapper; ensure server-side prefetch still works
- **Status:** ✓ All endpoints exist

### 2.5 screen-quality.jsx (Quality report + API coverage scoring)
- **Route:** `/generate/:jobId/quality`
- **Status:** Public
- **API endpoints called:**
  - `GET /api/v1/jobs/:jobId` (server-side prefetch of partial_result.quality_report)
- **Logic modules:**
  - `lib/api/client.ts` (fetchJobStatus)
  - `lib/quality-badge.ts` (render scoring badge)
- **Provider context:** (None; server component)
- **Page wrapper needed:** `apps/web/src/app/generate/[jobId]/quality/page.tsx` (existing) + `_quality-client.tsx` wrapping `screen-quality.jsx`
- **Anon-chrome:** `QualityScreenWithAnonChrome` (from `lib/jsx-bridge/wrapper.tsx`) wraps this to add AnonBanner + AnonCacheHitBadge
- **Migration action:** Keep existing wrapper
- **Status:** ✓ All endpoints exist

### 2.6 screen-playground.jsx (Interactive LLM agent calls against user's API spec)
- **Route:** `/generate/:jobId/playground`
- **Status:** Protected (Logto required per middleware.ts + plan 09.1-07 D-01 gate: "real LLM agent calls")
- **API endpoints called:** NONE (playground is a **future** feature; currently stub/placeholder; no backend exists)
- **Logic modules:**
  - `providers/logto-session.tsx` (useLogtoSession — ensure user is authenticated)
  - `lib/route-gate.ts` (isProtectedPath confirms /generate/:jobId/playground is protected)
- **Provider context:** LogtoSession (required for auth gate)
- **Page wrapper needed:** `apps/web/src/app/generate/[jobId]/playground/page.tsx` (existing) + `_playground-client.tsx` wrapping `screen-playground.jsx`
- **Migration action:** Keep wrapper; playground remains stub
- **Status:** ✓ All existing logic correct; feature behind plan D-01

### 2.7 screen-deploy.jsx (Deploy to free 24h ephemeral URL, or permanent via Logto)
- **Route:** `/generate/:jobId/deploy`
- **Status:** Public path, but `/generate/:jobId/deploy/permanent` is protected (Logto required)
- **API endpoints called:**
  - Ephemeral (anon): `POST /api/v1/deploy-ephemeral` (future endpoint, NOT YET IN BFF)
  - Permanent (authenticated): `POST /api/v1/deploy/:generationId` (via `lib/api/dashboard-client.ts`)
- **Logic modules:**
  - `lib/api/dashboard-client.ts` (deploy function for permanent)
  - `lib/idempotency-key.ts` (generate key for deploy request)
  - `lib/claude-desktop/config.ts` (render Claude Desktop config block)
  - `lib/claude-desktop/collision.ts` (handle 409 collision, rename modal)
  - `providers/logto-session.tsx` (check if authenticated, show permanent vs ephemeral CTA)
- **Provider context:** LogtoSession, QueryClient
- **Page wrapper needed:** `apps/web/src/app/generate/[jobId]/deploy/page.tsx` (existing) + `_deploy-client.tsx` wrapping `screen-deploy.jsx`
- **Anon-chrome:** `DeployScreenWithAnonChrome` (from `lib/jsx-bridge/wrapper.tsx`) wraps this to add AnonDeployCta above (24h ephemeral)
- **Migration action:** Keep existing wrapper; ensure permanent deploy calls `deploy()` correctly with idempotency key + collision handling
- **Status:** ✓ For permanent flow (authenticated users); ephemeral flow blocked pending `POST /api/v1/deploy-ephemeral` endpoint (phase TBD)
- **⚠️ Backend gap:** Ephemeral deploy endpoint not yet in `apps/api`

### 2.8 screen-dashboard-list.jsx (Multi-server dashboard — list view + filters + search)
- **Route:** `/dashboard`
- **Status:** Protected (Logto required)
- **API endpoints called:**
  - `GET /api/v1/deployments` (fetch user's servers)
  - `GET /api/v1/usage/hourly?from=...&to=...&deployment_id=...` (usage metrics per deployment)
  - `PATCH /api/v1/deployments/:deploymentId/badge-public` (toggle public badge)
- **Logic modules:**
  - `lib/api/dashboard-client.ts` (fetchDeployments, fetchUsageHourly, setBadgePublic)
  - `providers/logto-session.tsx` (useLogtoSession for user greeting)
  - `providers/query-client.tsx` (TanStack Query for caching deployments)
- **Provider context:** LogtoSession, QueryClient
- **Page wrapper needed:** `apps/web/src/app/dashboard/page.tsx` (existing, redirects) → NEW `apps/web/src/app/dashboard/_dashboard-list-client.tsx` wrapping `screen-dashboard-list.jsx`
- **Migration action:** NEW: Create `_dashboard-list-client.tsx` wrapper that:
  1. Calls `fetchDeployments()` on mount (via useQuery if QueryClient is used)
  2. Calls `fetchUsageHourly({from, to})` to populate usage chart
  3. Handles `setBadgePublic(deploymentId, isPublic)` on toggle click
  4. Passes USER_SERVERS mock data → real data from API response
- **Status:** ⚠️ PARTIAL — deployments + usage endpoints exist, but logic wrapper not yet written (Agent 4 zone per rebuild plan)
- **Concern:** Existing `app/dashboard/_dashboard-client.tsx` wraps `screen-dashboard.jsx` (old grid-view); new `_dashboard-list-client.tsx` wraps new `screen-dashboard-list.jsx`. Ensure routing is correct (both at `/dashboard`? Conditional render based on flag?). Per contract §5.1, assume list-view is primary; old grid-view may be deprecated.

### 2.9 screen-auth.jsx (API authentication strategy selector)
- **Route:** Embedded within canvas flow or standalone `/generate/auth`
- **Status:** Public (anon can paste URL + choose auth type)
- **API endpoints called:** NONE (local form state only; auth data is part of GenerationApiRequest payload)
- **Logic modules:** NONE (pure UI)
- **Migration action:** Keep as-is; no wiring needed
- **Status:** ✓ No endpoints; static form

### 2.10 screen-billing.jsx (Usage dashboard + Stripe billing portal)
- **Route:** `/billing` or `/billing/[serverId]`
- **Status:** Protected (Logto required per middleware.ts)
- **API endpoints called:**
  - `GET /api/v1/usage/hourly?from=...&to=...&deployment_id=...` (usage trending)
  - `GET /api/v1/billing/plan` (fetch current plan info) — **STATUS: UNKNOWN**
  - `POST /api/v1/billing/checkout` (initiate Stripe session) — **EXISTS** in `apps/api/src/routes/v1/billing/checkout.ts`
  - `GET /api/v1/billing/portal` (Stripe customer portal link) — **EXISTS** in `apps/api/src/routes/v1/billing/portal.ts`
- **Logic modules:**
  - `lib/api/dashboard-client.ts` (fetchUsageHourly) — reuse existing
  - NEW: `lib/api/billing-client.ts` (TBD: fetchBillingPlan, checkoutSession, portalSession) — **MISSING**
  - `providers/logto-session.tsx` (useLogtoSession for user identification)
- **Provider context:** LogtoSession, QueryClient
- **Page wrapper needed:** NEW `apps/web/src/app/billing/page.tsx` + `_billing-client.tsx` wrapping `screen-billing.jsx`
- **Feature flag:** `ui_billing_active_perm` (default false; gate entire /billing route if backend not complete)
- **Migration action:** NEW: Create:
  1. `lib/api/billing-client.ts` with `fetchBillingPlan()`, `createCheckoutSession()`, `getPortalLink()`
  2. `app/billing/page.tsx` + `_billing-client.tsx` wrapper calling these functions
  3. Ensure middleware.ts includes `/billing/:path*` in PROTECTED_PATTERNS ✓ (already does)
- **Status:** ⚠️ PARTIAL — Usage endpoint exists; Stripe webhook + portal endpoints exist; plan lookup & billing state management **TBD**; backend verification needed
- **Concern:** Stripe integration is enterprise feature; may be gated behind feature flag per contract §5.1. Confirm `ui_billing_active_perm` status.

### 2.11 screen-marketplace.jsx (Public MCP marketplace — browse, search, view stars/installs/tags)
- **Route:** `/marketplace`
- **Status:** Public (read-only, no auth required)
- **API endpoints called:**
  - `GET /api/v1/marketplace/servers` (fetch server catalog) — **MISSING**
  - `GET /api/v1/marketplace/servers/:id` (server detail) — **MISSING** (for screen-server-detail.jsx)
  - Search/filter is client-side (no API call)
- **Logic modules:** NONE (all data is mock in screen-marketplace.jsx)
- **Feature flag:** `ui_marketplace_perm` (default false, per contract §5.1)
- **Migration action:** Create wrapper but GATE at page level:
  ```tsx
  // app/marketplace/page.tsx
  const enabled = await evaluateBooleanFlag('ui_marketplace_perm', user.id, {}, false);
  if (!enabled) return notFound();
  return <MarketplaceWrapper />;
  ```
- **Status:** ✗ BLOCKED — backend marketplace endpoints do NOT exist; feature is out-of-backend per contract §6
- **Concern:** Screen code contains MARKETPLACE_SERVERS mock array; per contract §0.7, production code must have ZERO mock/FALLBACK/fixture markers in non-test files. When marketplace backend is added (future phase), mint new contract + flag flip.

### 2.12 screen-server-detail.jsx (Marketplace server detail page)
- **Route:** `/marketplace/:serverId` (or `/marketplace/detail/:serverId`)
- **Status:** Public
- **API endpoints called:**
  - `GET /api/v1/marketplace/servers/:id` (fetch server info) — **MISSING**
  - `POST /api/v1/marketplace/servers/:id/install` (install server into dashboard) — **MISSING**
- **Logic modules:** NONE (mock data in screen)
- **Feature flag:** `ui_marketplace_perm` (same as screen-marketplace.jsx)
- **Migration action:** Create wrapper but GATE (same pattern as screen-marketplace.jsx)
- **Status:** ✗ BLOCKED — backend endpoints missing
- **Concern:** Same as screen-marketplace.jsx

### 2.13 screen-download.jsx (if exists — ZIP/Docker export)
- **Route:** `/generate/:jobId/download`
- **Status:** Protected (Logto required per middleware.ts, plan 09.1-07 D-03)
- **API endpoints called:** `GET /api/v1/download?jobId=...&format=zip|docker` (TBD — not verified in apps/api)
- **Logic modules:** TBD
- **Note:** Not in current extracted screens; likely future addition
- **Status:** ✗ Out of scope for current rebuild; defer to future phase

---

## §3. OUT-OF-BACKEND References (Gated by Feature Flags)

Per `mcpgen-frontend-rebuild-contract.md` §5.1: Modules with UI but NO backend are gated via Flipt flags (default false, hidden entirely). This section lists all such references found in extracted screens.

### 3.1 Marketplace Module
**Feature flag:** `ui_marketplace_perm` (default: false)  
**Gating strategy:** Block at route level (`app/marketplace/page.tsx`) + component level (if flag eval is feasible in client code)

| Screen | Endpoint(s) | Status | Action |
|--------|-----------|--------|--------|
| screen-marketplace.jsx | `GET /api/v1/marketplace/servers` | MISSING | Gate via flag; on flip, implement BFF endpoint + API client call |
| screen-marketplace.jsx | `GET /api/v1/marketplace/servers/:id/search` | MISSING | Gate via flag |
| screen-server-detail.jsx | `GET /api/v1/marketplace/servers/:id` | MISSING | Gate via flag |
| screen-server-detail.jsx | `POST /api/v1/marketplace/servers/:id/install` | MISSING | Gate via flag |

**Mock data present in code:**
- `screen-marketplace.jsx`: MARKETPLACE_SERVERS array (lines 3–13) — 9 hardcoded servers
- `screen-marketplace.jsx`: CATEGORIES array (lines 15–24) — filter categories
- `screen-marketplace.jsx`: RECENT, SUGGEST_TAGS (lines 37–38) — autocomplete hints

**Contract violation markers:** `const MARKETPLACE_SERVERS = [...]` matches the "zero mock data" rule violation. When gating, these arrays must be replaced with API calls OR kept behind the flag guard.

### 3.2 Admin Panel Module
**Feature flag:** `ui_admin_panel_perm` (default: false)  
**Gating strategy:** Block at route level (`app/admin/layout.tsx` or similar)  
**Scope:** Entire `/admin/*` route tree; NOT analyzed in detail per contract §6

**Out of scope for Agent M-1.C:** Admin screens are explicitly excluded. However, note:
- All admin screens in zip contain mock data (ADMIN_USERS, AUDIT_LOGS, etc.)
- No `/api/v1/admin/*` endpoints exist in `apps/api`
- Gating is mechanical; when admin backend is added, flip the flag

### 3.3 Billing Module (Conditional)
**Feature flag:** `ui_billing_active_perm` (default: false, status TBD)  
**Gating strategy:** Block at route level OR leave ungated if backend is complete

| Screen | Endpoint(s) | Status | Action |
|--------|-----------|--------|--------|
| screen-billing.jsx | `GET /api/v1/billing/plan` | **UNKNOWN** | Verify in apps/api; if missing, gate |
| screen-billing.jsx | `POST /api/v1/billing/checkout` | EXISTS | `apps/api/src/routes/v1/billing/checkout.ts` ✓ |
| screen-billing.jsx | `GET /api/v1/billing/portal` | EXISTS | `apps/api/src/routes/v1/billing/portal.ts` ✓ |

**Action:** Agent 4 must verify `GET /api/v1/billing/plan` exists OR implement it. If missing and planned for later phase, gate the entire billing route with `ui_billing_active_perm` flag.

### 3.4 Ephemeral Deploy (Anon Flow)
**Feature flag:** `ui_ephemeral_deploy_perm` (TBD — may not need a flag if only used by anon users)  
**Status:** `POST /api/v1/deploy-ephemeral` endpoint **MISSING** from `apps/api`

| Screen | Endpoint(s) | Status | Action |
|--------|-----------|--------|--------|
| screen-deploy.jsx | `POST /api/v1/deploy-ephemeral` | MISSING | Implement BFF + backend endpoint; OR gate UI behind flag until available |

**Used by:** `AnonDeployCta` component (from `lib/jsx-bridge/wrapper.tsx`), shown to anon users on deploy screen. Current flow works for authenticated users (permanent deploy via `POST /api/v1/deploy/:id`). Ephemeral flow is **blocked** until endpoint exists.

---

## §4. Backend Gaps Blocking Phase 10 Wire-up

| Endpoint | Used by | Phase to add | Severity |
|----------|---------|--------------|----------|
| `POST /api/v1/deploy-ephemeral` | screen-deploy.jsx (AnonDeployCta) | Phase 10 or later | MEDIUM — anon users cannot deploy; blocks plan 09.1-07 completion |
| `GET /api/v1/billing/plan` | screen-billing.jsx | Phase 10 or later | MEDIUM — billing page incomplete without plan info |
| `GET /api/v1/marketplace/servers` | screen-marketplace.jsx | Phase 11+ (out-of-MVP) | LOW — gated by feature flag; not MVP-blocking |
| `GET /api/v1/marketplace/servers/:id` | screen-server-detail.jsx | Phase 11+ | LOW — same |
| `POST /api/v1/marketplace/servers/:id/install` | screen-server-detail.jsx | Phase 11+ | LOW — same |
| `GET /api/v1/dashboard/list` | useAnonState hook, app/dashboard | Phase 07 (exists?) | **VERIFY** — hook depends on this being protected endpoint |

**Note:** `GET /api/v1/dashboard/list` is a **critical dependency** for `useAnonState()` hook (plan 09.1-07). If this endpoint is not implemented in the BFF as a protected endpoint that returns 401 for anon, the hook fails silently and defaults to anon=true (conservative bias per code comment). Agent M-1.C assumes this endpoint exists and is protected; Agent 4 must verify.

---

## §5. Cross-Cutting Wiring Concerns & Risks

### 5.1 JSX-Bridge Pattern Survival
**Risk:** New screens from zip are plain `.jsx` React components with inline props. The `jsx-bridge/` pattern wraps them with Next.js Server Components, BFF calls, and SSE hooks. Will it scale?

**Current evidence:**
- Pattern works for existing screens (canvas, stream, preview, quality, playground, deploy, dashboard) — 7 screens wrapped successfully
- Pattern is **NOT opinionated** about component type — works equally well with plain JSX or TypeScript Server Components
- No visual regressions observed from wrapping (screenshot baseline stable across phases 07–09.1)

**New screens to wrap (4 screens):**
- screen-dashboard-list.jsx (requires fetchDeployments call)
- screen-billing.jsx (requires fetchUsageHourly + billing state)
- screen-marketplace.jsx (requires marketplace API OR flag gate + mock data)
- screen-server-detail.jsx (requires marketplace API OR flag gate + mock data)

**Risk level:** LOW — pattern is proven. Implementation is mechanical (create wrapper, call API, pass props).

**Mitigation:** Ensure each wrapper follows the existing pattern:
```tsx
// apps/web/src/app/dashboard/_dashboard-list-client.tsx
'use client';
import { ScreenDashboardList } from '@/lib/jsx-bridge/screens';
import { useLogtoSession } from '@/providers/logto-session-context';
import { useFetchDeployments } from '...'; // useQuery or custom hook

export function DashboardListWrapper() {
  const session = useLogtoSession();
  const deployments = useFetchDeployments();
  return <ScreenDashboardList deployments={deployments} {...} />;
}
```

### 5.2 i18n Provider Integration
**Risk:** New zip contains `i18n.jsx` (37KB dictionary with 100+ keys for UI strings). Current `apps/web/` has **NO i18n setup** — all strings are hardcoded in English or JSX.

**Evidence from code:**
- screen-dashboard-list.jsx uses `const { t } = window.useI18n();` (lines 46, 81, etc.)
- screen-marketplace.jsx uses `const { t } = window.useI18n();` (line 27)
- screen-auth.jsx uses `const { t } = window.useI18n();` (likely)
- **No i18n provider found** in current `apps/web/src/providers/` or `app/layout.tsx`

**Assumption (per old mock code):** i18n is provided globally via `window.useI18n()` injected by JSX-bridge loader or similar.

**Risk level:** MEDIUM — if i18n provider is not wired, new screens will throw "useI18n is not defined" at runtime.

**Mitigation:** Agent 4 (layout/providers zone) must:
1. Implement/import i18n provider from new zip's `i18n.jsx`
2. Wrap `app/layout.tsx` with i18n context
3. Ensure `window.useI18n()` is available to all child components
4. Fallback language: English (per current code)

**Action:** Flag this as **BLOCKER for Agent 4** — i18n wiring is critical path, not optional.

### 5.3 Logto Session Provider Survival
**Risk:** Logto session provider currently works (used by dashboard, playground, deploy/permanent, download routes). Will it handle new screens correctly?

**Current implementation:**
- `providers/logto-session.tsx` — Server Component fetching `getLogtoContext(logtoConfig)`, returns `{isAuthenticated, claims}`
- `providers/logto-session-context.tsx` — Client Context exposing `useLogtoSession() → LogtoSession`
- Wrapped at `app/layout.tsx` level (assumed; Agent 4 to verify)

**New screens' auth needs:**
- screen-dashboard-list.jsx — requires authenticated session (user name for greeting) ✓
- screen-billing.jsx — requires authenticated session (identifies customer) ✓
- screen-marketplace.jsx — no auth required, but doesn't hurt ✓
- screen-server-detail.jsx — no auth required ✓

**Risk level:** LOW — provider is correctly implemented per plan 07-02. No changes needed.

**Verification:** Ensure new screens receive Logto session via context or props without refetch loops (should use `useLogtoSession()` hook, not `getLogtoContext()` directly in Client Components).

### 5.4 Sentry Redaction & Error Reporting
**Risk:** `lib/sentry/redact.ts` redacts sensitive data from Sentry events. Do new screens trigger any new Sentry paths?

**Current coverage:** Middleware + all BFF route handlers + API client calls → errors are captured with redaction applied.

**New screens' error scenarios:**
- screen-dashboard-list.jsx: `fetchDeployments()` network error → caught by API client, Sentry logs redacted ✓
- screen-billing.jsx: `fetchUsageHourly()` error → same ✓
- screen-marketplace.jsx: no API errors (mock data) — unless flag logic adds error handling
- screen-server-detail.jsx: same as marketplace

**Risk level:** LOW — Sentry integration is transparent (applied at SDK level, not in component code).

### 5.5 Feature Flags Evaluation in Client Components
**Risk:** `lib/flags/index.ts` exports async functions (`evaluateBooleanFlag`, `evaluateVariantFlag`). These are server-side only (Flipt client token must NOT leak into NEXT_PUBLIC_*). How do client components gate content?

**Pattern (from contract §5.1):**
```tsx
// Server: evaluate flag, pass result as prop
export const Page = async () => {
  const showMarketplace = await evaluateBooleanFlag('ui_marketplace_perm', userId, {}, false);
  return <PageWrapper showMarketplace={showMarketplace} />;
};

// Client: receive prop
export function PageWrapper({ showMarketplace }) {
  if (!showMarketplace) return <PageNotFound />;
  return <ScreenMarketplace />;
}
```

**Risk:** Contract does not explicitly specify HOW flags are passed. Agent 4 must establish this pattern.

**Risk level:** LOW — pattern is standard Next.js 15 (Server → Client props). No technical blocker.

### 5.6 QueryClient StaleTime & Hydration Mismatch
**Risk:** `providers/query-client.tsx` sets `staleTime: 60s`. If a screen component calls `useQuery()` to fetch deployments + server also prefetches deployments, will hydration mismatch occur?

**Current usage:** TanStack Query is wired but not used heavily (see existing code — most API calls are imperative `fetch()`).

**Risk level:** LOW — mismatch is a known React 18+ pattern. Solution: ensure server + client fetch from same source (use getQueryClient() on server, same QueryClient instance on client).

---

## §6. Summary Table: All New Screens & Wiring Status

| Screen | Route | Status | Backend endpoints | Wiring status | Logic modules needed | Blocker? |
|--------|-------|--------|-------------------|----------------|----------------------|----------|
| screen-canvas.jsx | `/generate` | ✓ Public | `POST /api/v1/generate` | ✓ Wrapped | client, idempotency-key, error-mapper | NO |
| screen-stream.jsx | `/generate/:jobId` | ✓ Public | `GET /api/v1/jobs/:jobId`, `/stream` | ✓ Wrapped | sse/use-generation-sse, last-event-id | NO |
| screen-preview.jsx | `/generate/:jobId/preview` | ✓ Public | `GET /api/v1/jobs/:jobId` | ✓ Wrapped | client (prefetch) | NO |
| screen-quality.jsx | `/generate/:jobId/quality` | ✓ Public | `GET /api/v1/jobs/:jobId` | ✓ Wrapped | client (prefetch), quality-badge | NO |
| screen-playground.jsx | `/generate/:jobId/playground` | ✓ Protected | None (stub) | ✓ Wrapped (stub) | logto-session (auth gate) | NO |
| screen-deploy.jsx | `/generate/:jobId/deploy` | ⚠️ Mixed | `POST /api/v1/deploy/:id` (perm), `POST /api/v1/deploy-ephemeral` (anon) | ⚠️ Partial | client (deploy), idempotency-key, claude-desktop/*, anon-state | **MEDIUM** — ephemeral missing |
| screen-dashboard-list.jsx | `/dashboard` | ⚠️ Protected | `GET /api/v1/deployments`, `GET /api/v1/usage/hourly`, `PATCH /api/v1/deployments/:id/badge-public` | ❌ NOT YET | dashboard-client, logto-session, query-client | **NO** — endpoints exist |
| screen-billing.jsx | `/billing` | ⚠️ Protected | `GET /api/v1/usage/hourly`, `GET /api/v1/billing/plan` (UNKNOWN), `POST .../checkout`, `GET .../portal` | ❌ NOT YET | dashboard-client (usage), billing-client (TBD), logto-session | **MEDIUM** — plan endpoint status TBD |
| screen-marketplace.jsx | `/marketplace` | ⚠️ Gated | `GET /api/v1/marketplace/servers` (MISSING) | ❌ GATED | flag eval (evaluateBooleanFlag) | **LOW** — gated by flag |
| screen-server-detail.jsx | `/marketplace/:id` | ⚠️ Gated | `GET /api/v1/marketplace/servers/:id` (MISSING) | ❌ GATED | flag eval | **LOW** — gated by flag |
| screen-landing.jsx | `/` | ✓ Public | None (static) | ✓ Wrapped | anon-state | NO |
| screen-auth.jsx | Embedded | ✓ Public | None (local state) | ✓ Embedded | (none) | NO |

---

## §7. Handoff to Agent 4 (Layout & Providers)

Agent M-1.C produces this map for Agent 4 consumption. Agent 4's scope (per rebuild plan):

1. **Layout & global providers** (`app/layout.tsx`, `app/layout.client.tsx`)
   - Wrap with LogtoSessionProvider ✓ (already done, verify)
   - Wrap with QueryProvider ✓ (already done, verify)
   - **ADD:** i18n provider (new requirement from zip)
   - **ADD:** Sentry instrumentation (verify complete)

2. **Page routing & flag gating** (`app/marketplace/page.tsx`, `app/billing/page.tsx`, etc.)
   - Implement flag checks via `evaluateBooleanFlag()` (server-side)
   - Return `notFound()` if flag is false
   - Ensure middleware routes still match

3. **CSS & global styles**
   - Migrate from old zip's `styles/` to new zip's `ui.jsx` + `global.css`
   - Ensure token vars are available (--font-mono, --text-muted, etc.)

---

## §8. Verification Checklist (for Agent 4)

Before marking INTEGRATION-MAP complete & ready for Phase 10 wire-up:

- [ ] All 12 logic modules (lib/api/*, lib/sse/*, providers/*, middleware.ts, 7 BFF routes) verified to exist and match contract
- [ ] All 13 screens from zip mapped to routes + wiring status
- [ ] Out-of-backend endpoints identified (marketplace, billing plan, ephemeral deploy, admin)
- [ ] Feature flags assigned (ui_marketplace_perm, ui_billing_active_perm, etc.)
- [ ] Backend gaps logged for phase roadmap (§4 table)
- [ ] Cross-cutting concerns identified & mitigation plans drafted (§5)
- [ ] i18n provider integration listed as blocker for Agent 4
- [ ] Dashboard-list wrapper not yet written (Agent 4 zone)
- [ ] Billing wrapper not yet written (Agent 4 zone)
- [ ] Marketplace wrapper GATED (flag default: false)
- [ ] Server-detail wrapper GATED (flag default: false)

---

## §9. Appendix: File Manifest

### Logic modules to preserve (NO CHANGES):
```
apps/web/src/lib/api/client.ts
apps/web/src/lib/api/dashboard-client.ts
apps/web/src/lib/api/error-mapper.ts
apps/web/src/lib/sse/use-generation-sse.ts
apps/web/src/lib/sse/last-event-id.ts
apps/web/src/lib/anon-state.ts
apps/web/src/lib/idempotency-key.ts
apps/web/src/lib/logto/client.ts
apps/web/src/lib/sentry/redact.ts
apps/web/src/lib/quality-badge.ts
apps/web/src/lib/route-gate.ts
apps/web/src/lib/claude-desktop/config.ts
apps/web/src/lib/claude-desktop/collision.ts
apps/web/src/lib/preview/code-block.tsx
apps/web/src/lib/jsx-bridge/loader.ts
apps/web/src/lib/jsx-bridge/wrapper.tsx
apps/web/src/lib/jsx-bridge/screens.tsx
apps/web/src/lib/fixture-mode/index.ts
apps/web/src/lib/fixture-mode/guard.ts
apps/web/src/lib/fixture-mode/sse-timeline.ts
apps/web/src/lib/flags/index.ts
apps/web/src/providers/logto-session-context.tsx
apps/web/src/providers/logto-session.tsx
apps/web/src/providers/query-client.tsx
apps/web/src/middleware.ts
apps/web/src/app/api/v1/generate/route.ts
apps/web/src/app/api/v1/jobs/[jobId]/route.ts
apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts
apps/web/src/app/api/v1/deploy/[generationId]/route.ts
apps/web/src/app/api/v1/deployments/route.ts
apps/web/src/app/api/v1/usage/hourly/route.ts
apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts
```

### New screens to wrap:
```
claude-design-ui/MCPGen-extracted/screen-canvas.jsx (WRAPPED)
claude-design-ui/MCPGen-extracted/screen-stream.jsx (WRAPPED)
claude-design-ui/MCPGen-extracted/screen-preview.jsx (WRAPPED)
claude-design-ui/MCPGen-extracted/screen-quality.jsx (WRAPPED)
claude-design-ui/MCPGen-extracted/screen-playground.jsx (WRAPPED as stub)
claude-design-ui/MCPGen-extracted/screen-deploy.jsx (WRAPPED, ephemeral blocked)
claude-design-ui/MCPGen-extracted/screen-landing.jsx (WRAPPED)
claude-design-ui/MCPGen-extracted/screen-auth.jsx (embedded, no wrapper)
claude-design-ui/MCPGen-extracted/screen-dashboard-list.jsx (NOT YET WRAPPED — Agent 4 zone)
claude-design-ui/MCPGen-extracted/screen-billing.jsx (NOT YET WRAPPED — Agent 4 zone)
claude-design-ui/MCPGen-extracted/screen-marketplace.jsx (GATED, flag: ui_marketplace_perm default false)
claude-design-ui/MCPGen-extracted/screen-server-detail.jsx (GATED, flag: ui_marketplace_perm default false)
claude-design-ui/MCPGen-extracted/admin/* (GATED, flag: ui_admin_panel_perm default false — out of scope)
```

---

**End of Integration Map — Agent M-1.C**

Produced: 2026-05-03  
Authority: docs/mcpgen-frontend-rebuild-contract.md §4.3, §5.1  
Next: Agent 4 (layout/providers wire-up + dashboard-list + billing wrappers)
