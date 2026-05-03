# Screen Diffs — Current apps/web/src/ vs claude-design-ui/MCPGen-extracted/

**Status:** Phase M-1 inventory comparison complete.  
**Date:** 2026-05-03  
**Scope:** All 13 core screens + core UI files + NEW files + admin module (18 screens)

---

## Summary

- **13 existing screens compared:** 11 have meaningful changes; 2 identical (tweaks-panel, global.css)
- **5 NEW screens in extracted:** screen-billing, screen-dashboard-list, screen-marketplace, screen-server-detail, + i18n & ux-glue
- **18 NEW admin screens:** admin/* module (out-of-MVP per contract §2.4)
- **3 files in current with NO counterpart in extracted:** (none — all existing files are present in new zip)
- **6 self-built components marked for deletion:** anon-banner, anon-cache-hit-badge, anon-deploy-cta, anon-signup-cta, live-stream-log, mode-banner

---

## Per-file analysis

### screen-auth.jsx
- **Current:** 230 lines | **Extracted:** 229 lines
- **Status:** minor diff (1-line change)
- **Diff summary:** 
  - Line removal in JSX structure (whitespace/formatting)
  - Auth type definitions identical
  - Event handlers and state management unchanged
- **Risk for migration:** low — structure preserved, no new proprops required
- **Mock literals:** none found

### screen-landing.jsx
- **Current:** 148 lines | **Extracted:** 266 lines (+118 lines)
- **Status:** major diff (207 diff lines)
- **Diff summary:**
  - **NEW:** `SAMPLE_APIS` array with 5 sample MCP definitions (Stripe Payments, Twilio SMS, HubSpot CRM, OpenAI API, GitHub)
  - **NEW:** Hero CTA section expanded with interactive sample picker
  - **NEW:** Feature grid added (3 key benefits)
  - **NEW:** Expanded "Why MCPGen" narrative section
  - `window.SAMPLE_APIS` exposed for cross-screen access (app.jsx uses it)
- **Risk for migration:** medium — new visual sections, but no API interaction. Sample picker is hardcoded; replace with real API list
- **Mock literals:** `SAMPLE_APIS = [...]` (5 sample APIs with full spec, names: lumen-payments, twilio-sms, hubspot, openai, github)

### screen-auth.jsx (details continued)
- No mock literals detected
- Auth flow intact

### screen-canvas.jsx
- **Current:** 335 lines | **Extracted:** 439 lines (+104 lines)
- **Status:** major diff (200 diff lines)
- **Diff summary:**
  - **NEW:** `TOOL_DATA` structure expanded with `rawTk` field (token count from raw OpenAPI spec) alongside existing `tk` (optimized count)
  - **NEW:** `TokenSaveBadge` component showing "raw → tk" savings % visualization
  - **NEW:** All tool objects now include `rawTk: <number>` for every endpoint (was missing in current)
  - Tool categories unchanged; layout structure preserved
- **Risk for migration:** medium-high — tool object schema changed. Any wiring that passes tools must include `rawTk` field
- **Mock literals:** `TOOL_DATA` structure with embedded rawTk values (Lumen Payments sample tools); no externalized mock but data structure requires wiring to provide rawTk from engine

### screen-dashboard.jsx
- **Current:** 314 lines | **Extracted:** 521 lines (+207 lines)
- **Status:** major diff (346 diff lines)
- **Diff summary:**
  - **NEW:** Drift review state machine (driftMode, walkIdx, decisions, acceptAll/skipAll functions)
  - **NEW:** Spec diff acceptance/skip workflow for reviewing breaking changes in OpenAPI
  - **NEW:** onClick handlers for "logs" button → `window.mcpDrawer()` modal
  - **NEW:** onClick handlers for "settings" button → `window.SettingsBody` component
  - **NEW:** "upgrade to pro" link now interactive (calls `window.mcpToast()`)
  - Button interactivity expanded; some previously static buttons now trigger side effects
  - SPEC_DIFF object referenced (new state prop required)
- **Risk for migration:** high — new state complexity. Must provide SPEC_DIFF prop, implement drawer/toast callbacks, handle acceptance workflow
- **Mock literals:** `SPEC_DIFF` object structure assumed (with .new, .removed, .modified arrays); endpoint names use "lumen-payments-mcp" as default sample

### screen-deploy.jsx
- **Current:** 169 lines | **Extracted:** 376 lines (+207 lines)
- **Status:** major diff (268 diff lines)
- **Diff summary:**
  - **NEW:** Error mode handling via `window.useErrorMode()` hook (willFail, deploy failure simulation)
  - **NEW:** Deployment failure state (setFailed) with conditional success/failure path
  - **NEW:** Console.log debugging UI expanded
  - **NEW:** File download section for Claude Desktop config
  - **NEW:** "Deploy" button now has inline error handling
- **Risk for migration:** high — new error state machine. Must wire useErrorMode hook (for demo purposes), provide real deployment API endpoint, handle success/failure transitions
- **Mock literals:** Error modes embedded in app.jsx (see below); deploy endpoint response structure assumed

### screen-preview.jsx
- **Current:** 290 lines | **Extracted:** 289 lines (-1 line)
- **Status:** minor diff (11 diff lines, mostly whitespace)
- **Diff summary:**
  - Line removal in code formatting
  - Structure, imports, and state management identical
  - Tool preview rendering unchanged
- **Risk for migration:** low — backward compatible
- **Mock literals:** none found

### screen-quality.jsx
- **Current:** 203 lines | **Extracted:** 243 lines (+40 lines)
- **Status:** medium diff (58 diff lines)
- **Diff summary:**
  - **NEW:** Quality report visualization with F1/F2/F3 dimension breakdown
  - **NEW:** Score badge styling and layout adjustments
  - **NEW:** Tool coverage percentage display
  - Structure of report object unchanged
- **Risk for migration:** medium — new visual elements but same data contracts. Quality object shape (F1, F2, F3, toolCoverage) assumed
- **Mock literals:** none found; report object structure is expected as prop

### screen-playground.jsx
- **Current:** 230 lines | **Extracted:** 367 lines (+137 lines)
- **Status:** major diff (213 diff lines)
- **Diff summary:**
  - **NEW:** `SEED_HISTORY` array (5 sample tool execution records with id, label, prompt, tools list, tk, ms, when, savedAsTest)
  - **NEW:** History rail UI component showing previous tool invocations
  - **NEW:** Test save/load workflow state
  - Tool execution canvas structure preserved
- **Risk for migration:** medium — new history component requires populated history data from API. SEED_HISTORY is demo data; must be replaced with real execution history from /v1/jobs/{id}/history endpoint
- **Mock literals:** `SEED_HISTORY` (5 sample executions with full params and timestamps)

### screen-stream.jsx
- **Current:** 145 lines | **Extracted:** 214 lines (+69 lines)
- **Status:** major diff (128 diff lines)
- **Diff summary:**
  - **NEW:** SSE event timeline structure expanded (progress %, intermediate artifacts)
  - **NEW:** Cache-hit badge UI component
  - **NEW:** Error state handling for spec-parse / auth-probe / deploy failures (integrated with error bus)
  - Event card rendering expanded with new edge cases
- **Risk for migration:** medium — new error states and visual elements. Must wire SSE event stream to provide cache-hit flag and error events; new error event types expected
- **Mock literals:** none found; SSE event stream structure expected from API

### screen-billing.jsx (NEW)
- **Extracted:** 306 lines
- **Purpose:** Pricing and subscription management screen
- **Status:** NEW — no current counterpart
- **Content:** Pricing tiers, plan comparison table, upgrade/downgrade flows
- **Risk for migration:** medium — Stripe wiring incomplete per contract §3.3; add `ui_billing_active_perm` flag (default OFF)
- **Mock literals:** Pricing data embedded (PRICING array with tiers, pricing, features); sample plan IDs

### screen-dashboard-list.jsx (NEW)
- **Extracted:** 511 lines
- **Purpose:** Dashboard in list/table view (alternative to single-deployment view)
- **Status:** NEW — no current counterpart
- **Content:** Sortable table of deployments, bulk actions, filtering
- **Risk for migration:** medium — requires `/dashboard/list` route. Uses `window.SAMPLE_APIS` for demo data
- **Mock literals:** `SAMPLE_APIS` reference (same as landing); table rows contain sample deployment data

### screen-marketplace.jsx (NEW)
- **Extracted:** 391 lines
- **Purpose:** Public marketplace to browse/publish MCP servers
- **Status:** NEW — OUT-OF-MVP per contract §2.4
- **Content:** Server list, search, publisher info, install flows
- **Risk for migration:** low for MVP — gate behind `ui_marketplace_perm` flag (default OFF). No wiring needed until Phase v1.x (Marketplace launch)
- **Mock literals:** Sample servers embedded (names, publishers, descriptions, download counts)

### screen-server-detail.jsx (NEW)
- **Extracted:** 208 lines
- **Purpose:** Individual MCP server detail page (marketplace context)
- **Status:** NEW — OUT-OF-MVP per contract §2.4
- **Content:** Server info, documentation, tool list, install CTA
- **Risk for migration:** low for MVP — gate behind `ui_marketplace_perm` flag (default OFF)
- **Mock literals:** Sample server data (Lumen Payments MCP with full spec)

### app.jsx
- **Current:** 121 lines | **Extracted:** 248 lines (+127 lines)
- **Status:** major diff (152 diff lines)
- **Diff summary:**
  - **NEW:** SCREENS array expanded to include 'dash-list', 'marketplace', 'server', 'billing'
  - **NEW:** `useErrorMode()` hook + error state bus (window.MCPGEN_ERROR_BUS) for cross-screen demo error injection
  - **NEW:** `ErrorDemoSwitch` component (floating UI to toggle error modes for demo/testing)
  - **NEW:** Sample API picker in main App component
  - Routing structure expanded to route to new screens
- **Risk for migration:** high — app.jsx is the routing hub. New screens must be imported and routed. Error bus is demo-only (remove in production path per contract I-2). useErrorMode hook is development tool
- **Mock literals:** `useErrorMode()` function with hardcoded error states ('spec-fail', 'auth-fail', 'deploy-fail', 'rate-limit'); error bus uses window globals

### tokens.jsx
- **Current:** 246 lines | **Extracted:** 244 lines (-2 lines)
- **Status:** minor diff (6 diff lines)
- **Diff summary:**
  - Minor formatting/whitespace changes
  - Design tokens values identical
  - Export structure unchanged
- **Risk for migration:** low — no functional changes
- **Mock literals:** none

### ui.jsx
- **Current:** 137 lines | **Extracted:** 136 lines (-1 line)
- **Status:** minor diff (7 diff lines)
- **Diff summary:**
  - Single line removed (whitespace)
  - Badge, Button, Card component definitions identical
  - Import/export structure unchanged
- **Risk for migration:** low — backward compatible
- **Mock literals:** none

### tweaks-panel.jsx
- **Current:** 419 lines | **Extracted:** 419 lines (identical)
- **Status:** identical — NO CHANGES
- **Diff summary:** zero diff lines
- **Risk for migration:** low — can copy as-is
- **Mock literals:** none (dev tool only; gated by `ui_tweaks_panel_perm` flag)

### global.css
- **Current:** 433 lines | **Extracted:** 433 lines (identical)
- **Status:** identical — NO CHANGES
- **Diff summary:** zero diff lines (bit-for-bit same)
- **Risk for migration:** low — can copy as-is
- **Mock literals:** none

---

## NEW files in extracted (no current counterpart)

| File | Size | Purpose | Status |
|------|------|---------|--------|
| `i18n.jsx` | 536 lines | Full i18n dictionary (37KB+) for UI translations | Distribute, no flag needed (client-side provider with en default) |
| `ux-glue.jsx` | 306 lines | Adapter layer: mock data ↔ screens (for standalone HTML mode) | Distribute as canon; **do NOT import** in Next.js production paths (contract §4.3) |
| `screen-billing.jsx` | 306 lines | Pricing & subscription UI | NEW; gate with `ui_billing_active_perm` flag (default OFF until Stripe live) |
| `screen-dashboard-list.jsx` | 511 lines | Dashboard table/list view alternative | NEW; add route `/dashboard/list` or conditional render via flag |
| `screen-marketplace.jsx` | 391 lines | Public MCP marketplace (OUT-OF-MVP) | NEW; gate with `ui_marketplace_perm` flag (default OFF per roadmap) |
| `screen-server-detail.jsx` | 208 lines | Individual MCP server page (marketplace) | NEW; gate with `ui_marketplace_perm` flag (default OFF) |
| `admin.html` | (entry point) | Admin app HTML shell | NEW; gate entire `/admin` route with `ui_admin_panel_perm` flag |
| `admin.css` | (admin styles) | Admin-specific CSS | NEW; distribute in `apps/web/src/admin.css` |
| `admin/admin-app.jsx` | (18 files) | Admin module (login, overview, users, billing, audit, broadcast, content, data, deploys, flags, integrations, llm, marketplace, obs, servers, support, ui) | NEW; gate with `ui_admin_panel_perm` flag (default OFF; internal_users segment ON) |

---

## Files in current to DELETE

| File | Reason | Superseded by |
|------|--------|---------------|
| `apps/web/src/components/mode-banner.tsx` | DEAD CODE — not imported anywhere (per contract §1.2) | None (delete) |
| `apps/web/src/components/anon-banner.tsx` | Duplcates anon-state UI logic in screens; zip screens handle this directly | screen-auth, screen-canvas, screen-deploy (built-in) |
| `apps/web/src/components/anon-cache-hit-badge.tsx` | screen-stream.jsx has cache-hit display built-in | screen-stream.jsx |
| `apps/web/src/components/anon-deploy-cta.tsx` | screen-deploy.jsx has deploy CTA built-in | screen-deploy.jsx |
| `apps/web/src/components/anon-signup-cta.tsx` | Auth flow in screen-auth.jsx; signup covered in screens | screen-auth, screen-landing |
| `apps/web/src/components/live-stream-log.tsx` | screen-stream.jsx provides full SSE timeline UI | screen-stream.jsx |

---

## High-risk migration concerns

### 1. **screen-dashboard.jsx** — Drift review state machine (HIGH)
   - **Risk:** New complex state (driftMode, walkIdx, decisions with keyed tracking)
   - **Impact:** Must provide SPEC_DIFF prop structure from API; implement drawer/toast callbacks; handle multi-step acceptance workflow
   - **Mitigation:** Phase M-4.9 wire-up must map backend spec-diff endpoint → SPEC_DIFF prop; implement window.mcpDrawer/mcpToast mock callbacks (for demo) or real drawer component

### 2. **screen-canvas.jsx** — New rawTk field in tool objects (MEDIUM-HIGH)
   - **Risk:** All tool objects now require `rawTk` (raw token count from spec). Phase M-4.1 wire-up will fail type-checking if tools lack this field
   - **Impact:** Engine must return `rawTk` for every tool; wiring layer must map it correctly
   - **Mitigation:** Phase M-4.1 (canvas wire-up) must extract rawTk from engine response or calculate it; ensure all sample tools in TOOL_DATA include rawTk

### 3. **app.jsx** — New routing + error bus (MEDIUM)
   - **Risk:** app.jsx now routes to 4 new screens (dash-list, marketplace, server, billing) and uses window.useErrorMode() error bus
   - **Impact:** Must import new screen components; error bus is demo-only (must hard-block in production per contract I-2)
   - **Mitigation:** Phase M-3 (UI replacement) updates app.jsx imports; Phase M-4 gates error-related code or removes it entirely for production build

### 4. **screen-playground.jsx** — History rail with SEED_HISTORY (MEDIUM)**
   - **Risk:** SEED_HISTORY (5 sample executions) is demo data; production must fetch real history from API
   - **Impact:** Must provide history prop or fetch hook; SEED_HISTORY must be replaced with real data
   - **Mitigation:** Phase M-4.7 (playground wire-up) queries /v1/jobs/{id}/history endpoint; removes SEED_HISTORY or gates it behind dev flag

### 5. **Admin module (18 screens) — Out-of-MVP (LOW risk, medium scope)**
   - **Risk:** 18 new screens, admin.html, admin.css; if not gated, will break MVP launch
   - **Impact:** Requires careful route-gating in middleware + feature flag
   - **Mitigation:** Phase M-3 distributes admin/* whole; Phase M-5 (feature flags) adds `ui_admin_panel_perm` gate (default OFF); routes return 404 until flag is enabled

---

## Mock literals enumeration (for Phase M-4)

### screen-landing.jsx
```javascript
const SAMPLE_APIS = [
  { name: 'lumen-payments', ... },
  { name: 'twilio-sms', ... },
  { name: 'hubspot', ... },
  { name: 'openai-api', ... },
  { name: 'github', ... },
];
// window.SAMPLE_APIS = SAMPLE_APIS; // exposed globally
```

### screen-canvas.jsx
- Embedded in TOOL_DATA structure (no separate FALLBACK_* constant, but hardcoded sample tool definitions)
- All tools reference `lumen-payments` implicitly in descriptions

### screen-dashboard.jsx
- References hardcoded sample name: `sample?.name || 'lumen-payments-mcp'`
- SPEC_DIFF object structure inferred but not initialized

### screen-playground.jsx
```javascript
const SEED_HISTORY = [
  { id: 'h1', label: 'list active plans', prompt: '...', tools: [...], tk: 412, ms: 180, when: '2m ago' },
  { id: 'h2', label: 'find rio@example.com', ... },
  { id: 'h3', label: 'order_lifecycle composite test', ... },
  { id: 'h4', label: 'refund w/ audit trail', ... },
  { id: 'h5', label: 'last 10 transactions', ... },
];
```

### app.jsx
```javascript
window.MCPGEN_ERROR_BUS = { value: 'none', listeners: [] };
function useErrorMode() { ... } // Demo error injection hook
const opts = [
  ['none',        'happy path'],
  ['spec-fail',   'spec parse fails'],
  ['auth-fail',   'auth probe fails'],
  ['deploy-fail', 'deploy crashes'],
  ['rate-limit',  'rate limited'],
];
```

### screen-marketplace.jsx, screen-server-detail.jsx
- Sample server data embedded (names, publishers, tool lists)

---

## Verification checklist (for Phase M-3 + M-4)

- [ ] All 13 existing screens replaced (or ~= content match reviewed)
- [ ] 5 NEW screens added (billing, dashboard-list, marketplace, server-detail, + i18n/ux-glue)
- [ ] 18 admin screens distributed
- [ ] 6 anon-* components deleted
- [ ] tweaks-panel.jsx and global.css verified identical
- [ ] app.jsx updated with new screen routing
- [ ] All SAMPLE_APIS, SEED_HISTORY, error modes listed above identified for replacement
- [ ] SPEC_DIFF prop contract defined in Phase M-4.9
- [ ] rawTk field requirement documented for canvas wire-up (Phase M-4.1)
- [ ] Feature flags scaffold: `ui_marketplace_perm`, `ui_admin_panel_perm`, `ui_billing_active_perm` created (Phase M-5)

---

**End of SCREEN-DIFFS.md**
