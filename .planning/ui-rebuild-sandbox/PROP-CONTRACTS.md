# Prop Contracts — claude-design-ui/MCPGen-extracted/ Screen Analysis

**Phase M-1.B: Inventory of prop requirements and mock-data literals for extraction in Phase M-4.**

---

## screen-landing.jsx (267 lines)

### Component signature
```jsx
function Landing({ 
  onMakeIt, onSelectSample, sample, urlText, setUrlText, 
  onPricing, onMarketplace, onSignIn 
}) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onMakeIt` | () => void | yes | Fired when user clicks "Make it" CTA or submits form |
| `onSelectSample` | (sample: object) => void | yes | Fired when user clicks a sample chip |
| `sample` | { id, name, endpoints, tools, save } | no | Selected API sample; updates live counter on line 16 |
| `urlText` | string | yes | Current input value from spec URL field |
| `setUrlText` | (url: string) => void | yes | Updates the URL input field |
| `onPricing` | () => void | yes | Footer link to pricing page |
| `onMarketplace` | () => void | yes | Navigation to marketplace (line 29, 30, 143, 169) |
| `onSignIn` | () => void | yes | TopBar sign-in button |

### Mock literals to extract (Phase M-4)
- **Line 3–9**: `const SAMPLE_APIS = [...]` (5 sample APIs with hardcoded stats) → Replace with `samples` prop or fetch from API
- **Line 13**: `const [counter, setCounter] = React.useState({ endpoints: 348, tools: 47, save: 76 })` → Initial values should come from `sample` prop or fall back
- **Line 117**: Hardcoded "HN front page #1 · apr 18" text → May need i18n or API data
- **Line 156**: Hardcoded version "v0.4.2" → Should come from backend/build

### How ux-glue.jsx feeds this screen
- `window.useI18n()` (line 12) — global i18n context; NOT a per-screen prop
- No state hooks from ux-glue currently visible; screens are stateless JSX functions
- In Next.js production: props come from Server Component → Client wrapper

### API endpoints needed (real data source)
- GET `/api/v1/samples` (or similar) — list of sample APIs for the chip row
- GET `/build/version` or similar — application version string
- For copy/i18n strings: global i18n provider (already wired via `window.useI18n()`)

---

## screen-auth.jsx (230 lines)

### Component signature
```jsx
function AuthScreen({ sample, onContinue, onBack }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `sample` | { id?, name? } | no | API name for display (line 63, 89); falls back to 'lumen' |
| `onContinue` | () => void | yes | Proceed to next screen after auth selection |
| `onBack` | () => void | yes | Return to previous screen |

### Mock literals to extract
- **Line 3–33**: `const AUTH_TYPES = { ... }` (4 hardcoded auth schemes) → Keep as constant; auth detection is domain logic, not API data
- **Line 51–58**: `const SCOPES_LIST = [...]` (6 hardcoded OAuth scopes) → Ideally would come from API-detected scope list, but may remain hardcoded as reasonable defaults
- **Line 119**: `window.mcpToast(...)` calls are UI hints, not mock data; can stay

### How ux-glue.jsx feeds this screen
- No direct state usage visible; screen is self-contained with React.useState
- Toast system is wired via `window.mcpToast()` (ux-glue.jsx lines 8–9) — global, not per-screen

### API endpoints needed
- No new endpoints strictly required for MVP; auth type detection is parsed from the uploaded OpenAPI spec
- Optional future: GET `/api/v1/auth-detection/{specHash}` to get pre-computed auth detection results

---

## screen-canvas.jsx (440 lines)

### Component signature
```jsx
function Canvas({ sample, onPlay, onDeploy, onCmdK, onBack }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `sample` | { id?, name? } | no | API name for display (line 161); falls back to 'lumen-payments' |
| `onPlay` | () => void | yes | Open playground to test tools |
| `onDeploy` | () => void | yes | Proceed to deploy flow |
| `onCmdK` | () => void | yes | Open command palette / search |
| `onBack` | () => void | yes | Return to landing or previous state |

### Mock literals to extract
- **Line 5–58**: `const TOOL_DATA = { ... }` (4 categories with 12+ hardcoded tools) — **CRITICAL**: This is the generated tool list from the spec parsing step. Replace with `tools` prop or state from backend API call.
  - Each tool has: `id, name, tk, rawTk, desc, short, source, params, composite`
  - Line 45–56: Composite tools are synthesized; mock examples provided
- **Line 102–107**: LocalStorage key `'mcpgen_canvas_summary_seen'` — UI state, can stay; not a data literal

### How ux-glue.jsx feeds this screen
- `localStorage` pattern (line 106–107) is standalone; no ux-glue dependency
- Canvas is the "edit" screen; it owns the tool list state after generation

### API endpoints needed
- POST `/api/v1/generate` (already exists; returns tool list + metadata) — wired upstream in stream → preview → auth flow
- Payload must include tool objects with full schema
- Token count (tk, rawTk) computed server-side or returned from generation

---

## screen-stream.jsx (215 lines)

### Component signature
```jsx
function StreamLog({ onDone, onCancel, sample }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onDone` | () => void | yes | Fired when generation completes successfully |
| `onCancel` | () => void | yes | User abort of generation |
| `sample` | { id?, name? } | no | API name for display (line 89); falls back to 'lumen-payments' |

### Mock literals to extract
- **Line 3–11**: `const STREAM_STEPS = [...]` (7 hardcoded generation pipeline steps) → Keep as constant; these are fixed pipeline stages, not API data
  - `id, label, note, dur` (duration in ms for demo animation)
  - `examples` flag triggers compression examples on line 7
- **Line 13–19**: `const COMPRESSION_EXAMPLES = [...]` (5 hardcoded before/after description pairs) — Ideally would come from real compression results from the generation step, but for demo/fallback, can remain hardcoded
- **Line 22**: `window.useErrorMode()` (custom hook) — Mock error states for demo; in production, error state comes from parent (e.g., URL query param or Redux/Zustand)

### How ux-glue.jsx feeds this screen
- Error injection via `window.useErrorMode()` (line 22) — this is a **demo hook for design testing**; does NOT exist in ux-glue.jsx. Must be scaffolded or come from context.
- SSE subscription logic (`useGenerationSSE()` hook) is NOT visible in this JSX; would be injected as a parent hook in Next.js wrapper

### API endpoints needed
- POST `/api/v1/generate` (already wired; SSE response) — initiates generation stream
- SSE stream consumes: `/api/v1/generate/{jobId}/stream` or `/api/v1/stream?jobId={jobId}` (existing in apps/web)

---

## screen-preview.jsx (290 lines)

### Component signature
```jsx
function Preview({ sample, onMakeIt, onBack }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `sample` | { id?, name?, endpoints? } | no | API name + endpoint count (line 30, 36); falls back to 'lumen', 348 |
| `onMakeIt` | () => void | yes | Continue to auth setup (line 203) |
| `onBack` | () => void | yes | Discard generation and return |

### Mock literals to extract
- **Line 3–9**: `const PREVIEW_CATEGORIES = [...]` (5 hardcoded endpoint categories) — **CRITICAL**: Replace with `categories` prop or computed from parsed spec (sample.endpoints / sample).
  - Fields: `id, label, count, on (toggled via checkbox), rare`
- **Line 11–20**: `const EXCLUDED_ENDPOINTS_INIT = [...]` (8 hardcoded excluded endpoints) — **CRITICAL**: Should come from spec analysis (POST /generate response). Replace with `excludedEndpoints` prop.
- **Line 37**: `const naiveTokens = 14200` and **Line 38**: `const baseOptTokens = combine === 'yes' ? 2800 : 3400` — Hardcoded token budgets. Should come from generation result or sample metadata.
- **Line 43–47**: `const COMPLEXITY = { ... }` (3 preset complexity levels with tool counts) — These are reasonable defaults; can remain constant if complexity presets are fixed.

### How ux-glue.jsx feeds this screen
- No ux-glue usage visible; screen is stateless except for local React.useState
- Generation result (from POST /generate) is passed upstream; preview reflects choices made in upstream flow

### API endpoints needed
- GET `/api/v1/samples/{id}/analysis` (optional; pre-computed endpoint analysis for faster load) OR
- Reuse POST `/api/v1/generate` response which includes `{ categories, excludedEndpoints, tokenBudget }` metadata

---

## screen-quality.jsx (243 lines)

### Component signature
```jsx
function QualityReport({ sample, onContinue, onBack }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `sample` | { id?, name? } | no | API name for display (line 63); falls back to 'lumen-payments' |
| `onContinue` | () => void | yes | Proceed to deploy screen |
| `onBack` | () => void | yes | Return to canvas |

### Mock literals to extract
- **Line 6**: `const score = 4.3` — Hardcoded overall quality score. Should come from `qualityResult` prop or POST `/api/v1/generate/{jobId}/quality` response.
- **Line 7–13**: `const breakdown = [...]` (5 hardcoded quality metrics) — Replace with `breakdown` prop from quality evaluation API.
- **Line 15–22**: `const tools = [...]` (6 hardcoded per-tool scores + flags) — Replace with `toolScores` prop from quality API.
- **Line 173–191**: Hardcoded eval result rows (5 agent eval tasks) — Replace with `evalResults` prop or API data.

### How ux-glue.jsx feeds this screen
- No ux-glue state visible; scores come from parent wrapper (Server Component or client-side API call)
- `window.mcpDrawer()` and `window.mcpToast()` are called (lines 85, 91, etc.) — wired via ux-glue.jsx globally

### API endpoints needed
- GET `/api/v1/generate/{jobId}/quality` — Fetch quality report (scores, breakdown, eval results)
- This endpoint is already planned but may not be fully implemented; scaffold if missing

---

## screen-playground.jsx (367 lines)

### Component signature
```jsx
function Playground({ onBack, onDeploy, sample }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onBack` | () => void | yes | Return to canvas |
| `onDeploy` | () => void | yes | Proceed to deploy |
| `sample` | { id?, name? } | no | API name for display (line 108); falls back to 'lumen-payments' |

### Mock literals to extract
- **Line 3–8**: `const SUGGESTED_PROMPTS = [...]` (4 hardcoded example prompts) — Can remain as reasonable defaults or come from `suggestedPrompts` prop.
- **Line 10–16**: `const FAKE_TRANSACTIONS = [...]` (5 fake result rows) — **CRITICAL**: Mock result data. In production, agent execution returns real data; this is test/demo only.
- **Line 19–25**: `const SEED_HISTORY = [...]` (5 hardcoded run history rows) — Mock history seeding. In production, comes from local state (SessionStorage) or server (GET `/api/v1/runs`).
- **Line 206**: Agent selector dropdown hardcoded to `['sonnet', 'opus', 'gpt']` — Should enumerate available models from backend or config.

### How ux-glue.jsx feeds this screen
- Credential TTL (line 32, 286) is self-managed; ux-glue is not involved
- Toast notifications (lines 206, 287) wired via ux-glue.jsx `window.mcpToast()`
- Agent selector (line 206) should ideally come from user's connected API keys / config

### API endpoints needed
- POST `/api/v1/run` — Execute agent call against a tool
- GET `/api/v1/runs/{jobId}` — Fetch run history for a generation
- Streaming response or polling for live traces (lines 304–311)

---

## screen-deploy.jsx (377 lines)

### Component signature
```jsx
function Deploy({ onDeployed, onBack, sample }) { ... }
function DeploySuccess({ onDashboard, sample }) { ... }
```

### Props expected (Deploy)
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onDeployed` | () => void | yes | Callback when deployment succeeds (line 25) |
| `onBack` | () => void | yes | Return to canvas |
| `sample` | { id?, name? } | no | API name for URL generation (line 108, 137); falls back to 'lumen' |

### Props expected (DeploySuccess)
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onDashboard` | () => void | yes | Navigate to user dashboard (line 192, 322) |
| `sample` | { id?, name? } | no | API name for share URL and config generation (line 170–182) |

### Mock literals to extract
- **Line 3–8**: `const DEPLOY_OPTIONS = [...]` (4 hardcoded deployment targets) — Can remain constant if deployment options don't change per-sample.
  - Fields: `id, title, tag, desc, meta`
- **Line 173–182** (DeploySuccess): Hardcoded Claude Desktop config JSON template — Should be generated dynamically based on deployed server URL and auth scheme.
- **Line 170**: `const url = '${sample?.id}-mcp-abc123.mcpgen.app/mcp'` — **CRITICAL**: Placeholder URL. Must be replaced with actual deployed URL from POST `/api/v1/deploy` response.
- **Line 171**: `const installCmd = 'npx mcpgen install ${sample?.id || 'lumen'}-mcp-abc123'` — Should use actual server ID from deployment result.
- **Line 172**: `const shareUrl = 'https://mcpgen.app/s/${sample?.id || 'lumen'}-mcp-abc123'` — Should use actual share slug/ID from deployment.

### How ux-glue.jsx feeds this screen
- Deploy success animations (line 94–104) are internal; no ux-glue state
- Toast notifications (e.g., line 65) wired via ux-glue.jsx

### API endpoints needed
- POST `/api/v1/deploy` — Initiate deployment to chosen target (cloud/CF/docker/src)
- Response must include: `{ url, installCmd, shareUrl, config }`
- Optional: WebSocket or polling for deployment progress (lines 94–104)

---

## screen-dashboard.jsx (150+ lines)

### Component signature
```jsx
function Dashboard({ onBack, onPlay, sample }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onBack` | () => void | yes | Return to dashboard list or landing |
| `onPlay` | () => void | yes | Open playground (line 60) |
| `sample` | { id?, name? } | no | Server name for display (line 55, 71); falls back to 'lumen-payments' |

### Mock literals to extract
- **Line 3–18**: `const SPEC_DIFF = { ... }` (3 new + 1 removed + 4 modified endpoint examples) — **CRITICAL**: Should come from spec drift detection API.
- **Line 32–36, 143–149**: Hardcoded "most-used tools" data (6 tool usage rows) — Replace with `topTools` prop or GET `/api/v1/servers/{id}/stats`.
- **Line 84–92**: Hardcoded stats (12,840 calls, 4.2m tokens saved, 240ms p95) — Replace with `serverStats` prop from GET `/api/v1/servers/{id}/stats`.

### How ux-glue.jsx feeds this screen
- Settings drawer (line 62) wired via ux-glue.jsx `window.mcpDrawer()` with `<window.SettingsBody>` component (ux-glue.jsx line 165)
- Logs drawer (line 61) wired via `<window.FullLogBody>` component (ux-glue.jsx line 125)

### API endpoints needed
- GET `/api/v1/servers/{id}` — Fetch server metadata and deployment info
- GET `/api/v1/servers/{id}/stats` — Fetch usage stats (calls, tokens, latency)
- GET `/api/v1/servers/{id}/drift` — Spec drift detection (optional; can be included in /stats)

---

## screen-dashboard-list.jsx (150+ lines)

### Component signature
```jsx
function DashboardList({ onBack, onOpen, onMarketplace, onBilling, onLanding }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onBack` | () => void | yes | Return to landing (used as onLanding parameter) |
| `onOpen` | (server) => void | yes | Open a specific server (line 114) |
| `onMarketplace` | () => void | yes | Navigate to marketplace (line 81) |
| `onBilling` | () => void | yes | Navigate to billing page (line 82) |
| `onLanding` | () => void | yes | Return to landing page (line 78, 127) |

### Mock literals to extract
- **Line 4–43**: `const USER_SERVERS = [...]` (6 hardcoded server entries) — **CRITICAL**: Replace with `servers` prop from GET `/api/v1/servers` (current user's servers).
  - Each server has: `id, name, api, tools, status, visibility, uptime, calls7, p95, deltaPct, version, updated, stars, installs, drift, region, owner`
- **Line 67–72**: Computed `totals` from servers list — Derived; no mock to replace.
- **Line 108–111**: Demo toggle UI (showing "populated" / "empty · day 1") — Remove in production; for prototype only.

### How ux-glue.jsx feeds this screen
- No direct ux-glue dependency visible; all state is local React.useState or computed from `servers` prop

### API endpoints needed
- GET `/api/v1/servers` — List all user's MCP servers with summary stats
- Optional: GET `/api/v1/servers?status=live&limit=10` for filtering variants

---

## screen-billing.jsx (150+ lines)

### Component signature
```jsx
function Billing({ onBack, onLanding, onDashboard, onMarketplace }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onBack` | () => void | yes | Return to previous page (not used directly; implicit) |
| `onLanding` | () => void | yes | Logo click to landing (line 75) |
| `onDashboard` | () => void | yes | Navigate to dashboard list (line 78) |
| `onMarketplace` | () => void | yes | Navigate to marketplace (line 79) |

### Mock literals to extract
- **Line 3–55**: `const PLANS = [...]` (4 hardcoded plan tiers: free, pro, team, enterprise) — Can remain constant if plans are fixed; otherwise fetch from GET `/api/v1/plans`.
- **Line 57–62**: `const INVOICES = [...]` (4 hardcoded invoice rows) — **CRITICAL**: Replace with `invoices` prop or fetch from GET `/api/v1/invoices`.
- **Line 68**: `const used = 82180, quota = 100000` — Hardcoded current period usage. Replace with `currentUsage` and `quota` props from GET `/api/v1/account/billing`.
- **Line 105, 123**: Payment method hardcoded to "visa ···· 4242" — Replace with actual payment method from GET `/api/v1/account/payment-method`.

### How ux-glue.jsx feeds this screen
- Modal drawer for upgrade flow (line 108) wired via ux-glue.jsx `window.mcpDrawer()`
- Toast notifications (line 113, 118) wired via ux-glue.jsx

### API endpoints needed
- GET `/api/v1/account/billing` — Current plan, usage, quota, payment method
- GET `/api/v1/invoices` — Invoice history
- POST `/api/v1/billing/upgrade` — Upgrade to new plan
- PATCH `/api/v1/account/payment-method` — Update card

---

## screen-marketplace.jsx (100+ lines)

### Component signature
```jsx
function Marketplace({ onBack, onDashboard, onOpen, onLanding }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `onBack` | () => void | yes | Return (navigation context) |
| `onDashboard` | () => void | yes | Navigate to user's dashboard (not visible in excerpt) |
| `onOpen` | (server) => void | yes | Open server detail page (line 63) |
| `onLanding` | () => void | yes | Navigate to landing (wired in TopBar) |

### Mock literals to extract
- **Line 3–13**: `const MARKETPLACE_SERVERS = [...]` (9 hardcoded server listings) — **CRITICAL OUT-OF-MVP**: Replace with `servers` prop or fetch from GET `/api/v1/marketplace/servers`.
  - Fields: `id, name, author, verified, tools, stars, installs, weekly, desc, tags, updated, license, forks, mine`
- **Line 15–24**: `const CATEGORIES = [...]` (8 hardcoded category filters) — Ideally fetched from GET `/api/v1/marketplace/categories`; can remain constant.
- **Line 37–38**: `const RECENT = [...]` and `const SUGGEST_TAGS = [...]` — Hardcoded autocomplete suggestions. Can come from user search history or tag cloud.

### How ux-glue.jsx feeds this screen
- No ux-glue state visible; marketplace is self-contained

### API endpoints needed
- **OUT-OF-MVP**: GET `/api/v1/marketplace/servers` — List public MCP servers (gated behind `ui_marketplace_perm` feature flag)
- **OUT-OF-MVP**: GET `/api/v1/marketplace/categories` — Available categories
- **OUT-OF-MVP**: GET `/api/v1/marketplace/servers/search?q={query}` — Search servers

---

## screen-server-detail.jsx (100+ lines)

### Component signature
```jsx
function ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace }) { ... }
```

### Props expected
| Prop | Type | Required? | Source |
|------|------|-----------|--------|
| `server` | { id, name, author, verified, desc, tools, tags, etc. } | no | Server object from marketplace (line 4 fallback: MARKETPLACE_SERVERS[0]) |
| `onBack` | () => void | yes | Return to previous page |
| `onInstall` | () => void | yes | Install this server into user's workspace (line 26, 49) |
| `onDashboard` | () => void | yes | Navigate to dashboard (line 25) |
| `onMarketplace` | () => void | yes | Return to marketplace list (line 21) |

### Mock literals to extract
- **Line 7–15**: `const tools = [...]` (7 hardcoded tools list) — **OUT-OF-MVP**: Should come from `server.tools` prop or GET `/api/v1/marketplace/servers/{id}/tools`.
- **Line 4**: Fallback to `window.MARKETPLACE_SERVERS[0]` — Ensures component doesn't error in isolation. In production, `server` prop must be provided.
- Line 89: Hardcoded quick-start snippet with `${s.author}/${s.name}` — Dynamic; uses passed `server` prop.

### How ux-glue.jsx feeds this screen
- No ux-glue usage visible; screen is passed `server` prop from marketplace parent

### API endpoints needed
- **OUT-OF-MVP**: GET `/api/v1/marketplace/servers/{id}` — Fetch full server detail (readme, tools, changelog, security)
- **OUT-OF-MVP**: POST `/api/v1/servers/install` — Clone/fork server into user's workspace

---

## Cross-screen patterns

### Common props (in EVERY screen)
- **`sample`** — Present in: landing (implicit), auth, canvas, stream, preview, quality, playground, deploy, dashboard, dashboard-list (absent), billing (absent), marketplace (absent), server-detail (as `server`).
  - Type: `{ id?, name?, endpoints? }`
  - Usually optional with fallback to 'lumen' or 'lumen-payments'
  - Represents the upstream API being converted into an MCP server

- **Navigation callbacks** (`onBack`, `onNext`, etc.) — Present in every screen.
  - These are NOT mock data; they are wiring props for routing/state management.

### Global state (via ux-glue.jsx, NOT per-screen props)
- **`window.useI18n()`** — Called in landing, dashboard-list, billing, marketplace.
  - Returns `{ t }` function for i18n lookup.
  - **NOT** a per-screen prop; it's a hook that reads from global React context.
  - Initialized by `window.useI18n = () => ({ t: (key) => window.i18n?.[key] || key })`
  - Strings defined in `i18n.jsx` (37KB i18n dict from zip).

- **`window.useErrorMode()`** — Called in stream-quality.jsx (design demo).
  - Returns `[errorMode]` ∈ `['spec-fail', 'auth-fail', 'rate-limit', 'deploy-fail', undefined]`.
  - **Design demo only**; does NOT exist in ux-glue.jsx.
  - Needs scaffolding: come from URL query param, Redux, or context.

- **`window.mcpToast(msg, opts)`** — Called in 8+ screens for notifications.
  - Wired via ux-glue.jsx (line 8) global event listener.
  - **NOT** a per-screen prop.

- **`window.mcpDrawer(title, body, opts)`** — Called in dashboard, quality, deploy success.
  - Wired via ux-glue.jsx (line 12) global event listener.
  - Body components: `<window.FullLogBody>`, `<window.SettingsBody>`, `<window.AccessLogBody>` (ux-glue.jsx lines 92–199).

### Common mock-extraction effort

**Most mock-heavy screens** (Phase M-4 priority):
1. **screen-canvas.jsx** — 1 large TOOL_DATA object (12+ tools, 4 categories). **Estimated effort: HIGH.** Multiple screens depend on tool list structure.
2. **screen-preview.jsx** — PREVIEW_CATEGORIES + EXCLUDED_ENDPOINTS_INIT (both large). **Estimated effort: HIGH.** Tied to spec analysis.
3. **screen-dashboard-list.jsx** — USER_SERVERS (6 servers with 10 fields each). **Estimated effort: HIGH.** Real data from DB.

**Medium mock-extraction effort**:
- screen-playground.jsx (SUGGESTED_PROMPTS, FAKE_TRANSACTIONS, SEED_HISTORY)
- screen-deploy.jsx (DEPLOY_OPTIONS are constants; URLs come from API)
- screen-dashboard.jsx (SPEC_DIFF, stats hardcoded)
- screen-quality.jsx (score, breakdown, eval results)
- screen-billing.jsx (PLANS, INVOICES, usage)

**Low mock-extraction effort**:
- screen-landing.jsx (SAMPLE_APIS, version) — Few literals, reasonable defaults.
- screen-auth.jsx (AUTH_TYPES, SCOPES_LIST) — Domain constants, not API data.
- screen-stream.jsx (STREAM_STEPS, COMPRESSION_EXAMPLES) — Design animation data.
- screen-server-detail.jsx (tools list) — OUT-OF-MVP anyway; low priority.
- screen-marketplace.jsx (MARKETPLACE_SERVERS, CATEGORIES) — OUT-OF-MVP anyway; low priority.

### Total estimated mock literals

Across all 13 public screens:
- **~25–35 hardcoded arrays/objects** to extract or parameterize
- **~60–80 hardcoded primitive values** (numbers, strings) to replace with props or API data
- **8 global callback patterns** (`window.mcpToast()`, `window.mcpDrawer()`, etc.)

**Estimated Phase M-4 effort per screen**: 1–3 hours for canvas/preview/dashboard-list; 20–45 minutes for others.

**Total Phase M-4 effort**: ~25–35 developer-hours across 13 screens.

---

## API Endpoint Summary (Must scaffold or confirm exist)

### Generation pipeline (POST flow)
- POST `/api/v1/generate` — Initiate spec upload + parse + auth detection → tool list → JSON response with TOOL_DATA
  - Response includes: `{ tools, categories, excludedEndpoints, tokenBudget, quality, deploymentOptions }`
  - Status: **EXISTS** (apps/web/src/app/api/v1/generate/route.ts mentioned in contract)
  - Phase M-4 work: Extract mock TOOL_DATA from screen-canvas.jsx; pass real response from API.

- GET `/api/v1/samples` — (Optional) List of sample APIs for landing screen chips.
  - Response: `[{ id, name, endpoints, tools, save }, ...]`
  - Status: **May not exist; scaffold if needed.**

### Server management (Dashboard / Dashboard-list)
- GET `/api/v1/servers` — List user's MCP servers.
  - Status: **Likely EXISTS** (used in screen-dashboard-list.jsx mockup).

- GET `/api/v1/servers/{id}` — Single server detail (stats, config).
  - Status: **Likely EXISTS**.

- GET `/api/v1/servers/{id}/stats` — Server usage stats (calls, tokens, latency, uptime).
  - Status: **May be merged into GET /servers/{id}; confirm.**

### Quality evaluation
- GET `/api/v1/generate/{jobId}/quality` — Quality report (scores, breakdown, eval results).
  - Status: **Likely PLANNED but not implemented; scaffold for M-4.**

### Deployment
- POST `/api/v1/deploy` — Deploy to cloud/CF/docker/src.
  - Response: `{ url, installCmd, shareUrl, config }`
  - Status: **EXISTS** (mentioned in screen-deploy.jsx mock flow).

### Billing & Account
- GET `/api/v1/account/billing` — Current plan, usage, quota, payment method.
  - Status: **Likely EXISTS** (Stripe integration mentioned in contract).

- GET `/api/v1/invoices` — Invoice history.
  - Status: **Likely EXISTS**.

- GET `/api/v1/account/payment-method` — Current payment card.
  - Status: **Likely EXISTS**.

### Marketplace (OUT-OF-MVP, gated by feature flag)
- GET `/api/v1/marketplace/servers` — Public MCP server listings.
- GET `/api/v1/marketplace/servers/{id}` — Single server detail.
- POST `/api/v1/servers/install` — Fork/clone into user's workspace.
- Status: **PLANNED but NOT IMPLEMENTED for MVP; hidden behind `ui_marketplace_perm` flag.**

---

## Feature Flags (per mcpgen-feature-flags-contract.md)

Screens gated by Flipt flags:

| Screen | Flag | Off behavior |
|--------|------|--------------|
| screen-marketplace.jsx | `ui_marketplace_perm` | Hidden from nav; route 404 |
| screen-server-detail.jsx | `ui_marketplace_perm` | Hidden from nav; route 404 |
| admin/* (18 screens) | `ui_admin_panel_perm` | Hidden from nav; route 404 |

Marketplace is present in zip but **not wired into production navigation until flag is ON**.

---

## Notes for Phase M-4 implementation

1. **Order of operations**: Extract mock data in dependency order:
   - Canvas (TOOL_DATA) first — many screens depend on tool list schema.
   - Preview (PREVIEW_CATEGORIES, EXCLUDED_ENDPOINTS_INIT) — depends on canvas.
   - Dashboard (SPEC_DIFF, stats) — independent.
   - Others in parallel.

2. **Shared mock fragments** (ux-glue.jsx lines 92–199):
   - `window.AccessLogBody`, `window.FullLogBody`, `window.SettingsBody` are drawer content fragments.
   - These contain hardcoded access logs (line 94–99), full logs (line 126–137), and settings UI.
   - Can remain as **design constants** (no replacement needed) since they are drawer content, not screen data.

3. **Global hooks to scaffold**:
   - `window.useErrorMode()` — Used only in stream-quality.jsx for demo. Needs implementation (URL query, context, or Redux).

4. **localStorage usage**:
   - canvas.jsx line 102–107 — `localStorage.getItem('mcpgen_canvas_summary_seen')`.
   - This is UI state (tour dismissal), not data mock; can remain.

5. **Verification checklist** (Invariant I-2):
   - After extraction, `rg 'FALLBACK_SAMPLE|LUMEN_|DEMO_DATA|stub:|lorem ipsum' apps/web/src --glob '!**/__tests__/**'` must return ZERO hits.
   - Except: i18n keys, loading skeletons, placeholders in form defaults are OK (add to whitelist if needed).

