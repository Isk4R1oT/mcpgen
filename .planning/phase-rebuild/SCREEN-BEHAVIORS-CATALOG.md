# Screen Behaviors Catalog

> Master brief sheet for every canon screen — main flow + admin console.
> Source: `claude-design-reference/canon/`. Read-only catalog; behaviors must be replicated faithfully when porting to Next.js.

---

## Top-level summary

### Counts

- **Total screens catalogued: 32** (14 main + 18 admin)
- **Total backend endpoints needed: ~30** (12 already exist, ~18 missing)
- **Total new feature flags proposed: ~22** (all `_perm` + a few `_kill`/`_rollout`, default OFF unless noted)
- **Total drawer types: 11** (`FullLogBody`, `AccessLogBody`, `SettingsBody`, `VersionsBody` already in `ux-glue.jsx`; `BuildLogBody`, `BringYourOwnKey`, `SecurityPolicy`, `RotateBody`, `ImpersonateModal`, `SuspendModal`, plus the modal patterns in admin pages)
- **Cross-screen window globals consumed:** `useI18n`, `useErrorMode`, `mcpToast`, `mcpDrawer`, `MCPGEN_ERROR_BUS`, `SAMPLE_APIS`, `MARKETPLACE_SERVERS`, `USER_SERVERS`, `ADM_DATA`, `MCPTokens.makeCssVars`, `computeTokens`, `_mcpRegister`, `AccessLogBody`, `FullLogBody`, `SettingsBody`, `VersionsBody`, `LangSwitcher`

### Backend endpoints — status table

Path on canon screen → BFF endpoint → status:

| Concern | BFF endpoint | Exists? |
|---|---|---|
| Generate from spec (anonymous) | `POST /api/v1/jobs/anon` (or legacy `POST /api/v1/generate`) | ✅ EXISTS |
| Job stream (SSE) | `GET /api/v1/jobs/anon-stream/:id/stream` | ✅ EXISTS |
| Get generation result | `GET /api/v1/jobs/anon/:id` | ✅ EXISTS |
| Cancel generation (internal) | `POST /internal/v1/cancel-generation` | ✅ EXISTS (internal only) |
| Preview (post-Pass 1 IR) | `GET /api/v1/preview/:id` | ✅ EXISTS |
| Quality report | `GET /api/v1/quality/:id` | ✅ EXISTS |
| Playground stub | `GET /api/v1/playground/:id` | ✅ EXISTS (stub only) |
| Run tool from playground | `POST /api/v1/playground/:id/invoke` | ❌ MISSING — backend-not-ready |
| Save playground run as test | `POST /api/v1/playground/:id/tests` | ❌ MISSING |
| List playground history | `GET /api/v1/playground/:id/history` | ❌ MISSING |
| Run regression suite | `POST /api/v1/playground/:id/tests/run` | ❌ MISSING |
| Ephemeral deploy | `POST /api/v1/deploy/ephemeral` | ✅ EXISTS |
| Permanent deploy | `POST /api/v1/deploy/permanent/:id` | ✅ EXISTS (auth-gated) |
| Download bundle | `GET /api/v1/download/:id` | ✅ EXISTS |
| Claim anonymous generation | `POST /api/v1/claim_generation` | ✅ EXISTS |
| Dashboard list | `GET /api/v1/dashboard` | ✅ EXISTS (basic) |
| Single server detail | `GET /api/v1/deployments/:id` | ⚠ PARTIAL (only list `/deployments` exists) |
| Deployment usage | `GET /api/v1/usage/hourly` | ✅ EXISTS |
| Drift events | `GET /api/v1/deployments/:id/drift-events` | ✅ EXISTS |
| Drift apply (regenerate) | `POST /api/v1/drift-events/:id/regenerate` | ✅ EXISTS |
| Drift snooze | `POST /api/v1/deployments/:id/drift-snooze` | ❌ MISSING |
| Drift pin to old spec | `POST /api/v1/deployments/:id/pin` | ❌ MISSING |
| Rotate credential | `POST /api/v1/deployments/:id/credentials/:credId/rotate` | ❌ MISSING |
| Access log per-credential | `GET /api/v1/credentials/:id/access-log` | ❌ MISSING |
| Full activity log | `GET /api/v1/deployments/:id/activity` | ❌ MISSING |
| Server settings (region/visibility/pin) | `PATCH /api/v1/deployments/:id/settings` | ❌ MISSING |
| Versions list / rollback | `GET/POST /api/v1/deployments/:id/versions` | ❌ MISSING |
| Spec drift watcher (manual trigger) | `POST /api/v1/deployments/:id/drift/check` | ❌ MISSING |
| Marketplace listings | `GET /api/v1/marketplace/servers` | ❌ MISSING |
| Marketplace detail | `GET /api/v1/marketplace/servers/:id` | ❌ MISSING |
| Marketplace install | `POST /api/v1/marketplace/servers/:id/install` | ❌ MISSING |
| Marketplace fork | `POST /api/v1/marketplace/servers/:id/fork` | ❌ MISSING |
| Marketplace publish (mine) | `POST /api/v1/marketplace/publish` | ❌ MISSING |
| Marketplace star | `POST /api/v1/marketplace/servers/:id/star` | ❌ MISSING |
| Billing checkout | `POST /api/v1/billing/checkout` | ✅ EXISTS |
| Billing portal | `POST /api/v1/billing/portal` | ✅ EXISTS |
| Stripe webhook | `POST /api/v1/stripe/webhook` | ✅ EXISTS |
| Billing usage breakdown | `GET /api/v1/billing/usage` | ❌ MISSING |
| Invoices list | `GET /api/v1/billing/invoices` | ❌ MISSING |
| Spending caps | `PUT /api/v1/billing/spending-caps` | ❌ MISSING |
| Plan switch (proration preview) | `POST /api/v1/billing/preview-plan-change` | ❌ MISSING |
| Notifications feed | `GET /api/v1/notifications` | ❌ MISSING |
| Auth · sign-in (Logto) | `/api/auth/login` | ✅ EXISTS |
| Auth · MFA | provided by Logto | ✅ EXISTS via Logto |
| **Admin endpoints** (entire admin console) | `/api/admin/v1/*` | ❌ ALL MISSING — admin console is post-launch |

### Feature flags proposed (all `_perm` default OFF unless noted)

| Flag | Default | Purpose |
|---|---|---|
| `ui_marketplace_browse_perm` | OFF | Show marketplace browse + detail (read-only) |
| `ui_marketplace_install_perm` | OFF | Wire install button to real backend |
| `ui_marketplace_publish_perm` | OFF | Wire publish flow |
| `ui_marketplace_fork_perm` | OFF | Wire fork action |
| `ui_marketplace_star_perm` | OFF | Wire star action |
| `ui_dashboard_drift_perm` | OFF | Real drift events vs mock |
| `ui_dashboard_credentials_perm` | OFF | Show credentials section + rotate flow |
| `ui_dashboard_activity_perm` | OFF | Real activity log drawer |
| `ui_dashboard_settings_perm` | OFF | Settings drawer save action |
| `ui_dashboard_versions_perm` | OFF | Versions drawer rollback |
| `ui_playground_invoke_perm` | OFF | Real tool invocation (otherwise UI-only fake response) |
| `ui_playground_history_perm` | OFF | Persistent history |
| `ui_playground_save_test_perm` | OFF | Save run as test |
| `ui_playground_run_suite_perm` | OFF | Regression suite execution |
| `ui_playground_byok_perm` | OFF | Bring your own Anthropic key |
| `ui_billing_invoices_perm` | OFF | Real invoices list |
| `ui_billing_caps_perm` | OFF | Spending caps editor |
| `ui_billing_plan_switch_perm` | OFF | Plan upgrade/downgrade flow |
| `ui_notifications_perm` | OFF | Notifications drawer |
| `ui_auth_oauth_provider_perm` | OFF | OAuth-provider connect button (auth screen) |
| `ui_quality_byok_perm` | OFF | "Use your own Anthropic key" rate-limit recovery |
| `ui_admin_console_kill` | ON (kill-switch ON = closed) | Gate entire admin console; flip OFF when ready |

### Drawer / modal types in catalog

Already in `ux-glue.jsx`:
- `AccessLogBody({ keyName })` — credential access log table
- `FullLogBody({ serverName })` — last-N invocations log
- `SettingsBody({ serverName })` — region · drift-pause · visibility · danger-zone
- `VersionsBody({ serverName })` — version list + rollback

To implement (referenced inline in screens):
- `BuildLogBody` — full deploy log (deploy-fail screen)
- `BringYourOwnKey` — paste anthropic key (quality screen rate-limit)
- `SecurityPolicy` — security policy text (server-detail)
- `VaultSecurity` — vault explanation (deploy screen)
- `Notifications` — recent notifications (dashboard-list bell icon)
- `ShareSheet` — modal in deploy-success (share with team)
- `RotateModal` — rotate credential (dashboard)
- Generation Settings modal (preview screen)
- Drift Review modal (dashboard, with 3 modes: list/walk/pinned)
- Admin: `ImpersonateModal`, `SuspendModal`, `RollbackModal`, `KillSwitchModal`, `RefundModal`, `TakedownModal`, `RotateOAuthModal`, `EditFlagModal`, `DiffModal`, `RequestApprovalModal`

---

## MAIN FLOW SCREENS

---

## screen-landing (`screen-landing.jsx`, function `Landing`)

### Function signature
`Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText, onPricing, onMarketplace, onSignIn })`

### useState hooks
- `counter` — `{ endpoints: 348, tools: 47, save: 76 }`. Mutated by `useEffect` on `sample?.id`.

### useEffect hooks
- On `sample?.id` change → set counter from `sample.endpoints/tools/save`.

### Cross-screen window globals consumed
- `window.useI18n()` — `t('marketplace')`, `t('docs')`, `t('pricing')`, `t('signin')`, `t('heroLine1..3End')`, `t('heroSub')`, `t('placeholder')`, `t('makeIt')`, `t('orDrop')`, `t('secondaryHeader/1/2/3')`, `t('tryWith')`, `t('cli')`, `t('endpoints')`, `t('tools')`, `t('fewerTokens')`, `t('liveCounter')`, `t('featured')`, `t('howItWorks')`, `t('step1Title/Body')`, etc., `t('finalCtaTitle/Body/Btn/Alt')`, `t('allSystems')`, `t('footerProduct/Community/Company/Legal')`, `t('fl_*')`, `t('builtIn')`, `t('footer')`.
- `<LangSwitcher/>` component.

### Backend interactions inferred
- None directly — landing posts URL on submit but only triggers `onMakeIt()` route navigation; the actual generation kicks off on the next route (preview → stream).
- Real wire-up: `urlText` carried via state into the generate flow. Use existing `POST /api/v1/jobs/anon` from preview/stream screen.

### Backend-not-ready surfaces (flag-gating required)
- `Marketplace` link in top bar / footer / final CTA → flag-gate: `ui_marketplace_browse_perm` (OFF → render but route navigation ok; data fetched on Marketplace screen is what's flag-gated, not the link).
- "sign in" CTA → wire to Logto; if not yet integrated, use `ui_auth_perm` flag.

### Error states surfaced
- None (errorMode switch not visible on landing).

### Notable inline data / mocks in canon
- `SAMPLE_APIS` array (`lumen payments`, `helio commerce`, `nimbus storage`, `rookery issues`, `parley chat`) — exposed via `window.SAMPLE_APIS`, used by other screens too. KEEP as static seed data (sample chips on landing + entry cards in dashboard empty state).
- "HN front page #1 · apr 18", "show HN top 5", "producthunt #1 dev tools" — hardcoded social proof strings. Verbatim copy, keep exact text.
- `v0.4.2 · changelog` in footer.

### Unique behaviors / drawers / toasts
- "Final CTA" button focuses the URL input + scrolls to top.
- `CounterCell` / `CountUp` animated count-up on counter change.
- No drawers, no toasts.

### Implementation hint for Phase 1 agent
- Client component (interactive form + counter). Server-shell for SEO copy ok.
- Use `useTranslations()` (next-intl) replacing `useI18n`.
- Phase 0 primitives: `TopBar`, `Btn`, `LangSwitcher`, `Icon`, `CountUp`.

---

## screen-preview (`screen-preview.jsx`, function `Preview`)

### Function signature
`Preview({ sample, onMakeIt, onBack })`

### useState hooks
- `cats` — initialized from `PREVIEW_CATEGORIES` (5 fake categories). Toggled via checkbox.
- `combine` — `null | 'yes' | 'no'`. Whether to merge composite tools.
- `excludedOpen` — show/hide excluded endpoints panel.
- `included` — `Set` of endpoint paths user manually re-included.
- `excluded` — fixed `EXCLUDED_ENDPOINTS_INIT` (8 endpoints, mock).
- `settingsOpen` — Generation Settings modal toggle.
- `complexity` — `'minimal' | 'standard' | 'comprehensive'`.
- `serverName` — `${sample.id}-mcp` default, editable in advanced.
- `advancedOpen` — show advanced section in modal.

### useEffect hooks
- None directly.

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — used on re-generate banner.

### Backend interactions inferred
- `GET /api/v1/preview/:id` — already exists. Serves the post-Pass-0/1 IR for this screen.
- "re-generate" button → re-trigger generate with `included` and `excluded` overrides + `target_complexity` from settings → `POST /api/v1/jobs/anon` (or new `POST /api/v1/preview/:id/regenerate`).

### Backend-not-ready surfaces (flag-gating required)
- "re-generate" with explicit_includes/excludes → backend must accept overrides. Verify against current `GenerateRequest` schema. If not supported: flag `ui_preview_overrides_perm` (OFF → button shows toast "coming soon").
- Settings modal "override max-tools cap" (Pro-gated) → already disabled in canon; keep disabled with `pro` badge.

### Error states surfaced
- None on this screen. Error states surface on streaming.

### Notable inline data / mocks in canon
- `PREVIEW_CATEGORIES` — replace with real Pass 0/1 categories from preview API.
- `EXCLUDED_ENDPOINTS_INIT` — replace with real `dropped_endpoints` from Pass 0.
- Token math: `naiveTokens = 14200`, `baseOptTokens = combine === 'yes' ? 2800 : 3400`, `optTokens = baseOptTokens + included.size * 42`. Replace with real numbers from preview.token_budget.
- `dollars = ((naiveTokens - optTokens) / 1000 * 0.015).toFixed(2)` — keep formula but real numbers.
- `COMPLEXITY` — `{ minimal: ~15 tools, standard: ~47 tools, comprehensive: ~92 tools }`. Static UI only; engine receives `target_complexity` enum.

### Unique behaviors / drawers / toasts
- `setExcludedOpen` collapsible.
- "include" button on excluded row sets `Set`, then triggers re-gen banner.
- Re-gen banner toast: `"re-running with ${included.size} new endpoint${...}…"`.
- Generation Settings modal (custom inline modal — not drawer). 3 radio rows for complexity + categories list + "advanced" collapsible (server name + max-tools override).

### Implementation hint for Phase 1 agent
- Client component (lots of state).
- Phase 0: `TopBar`, `Card`, `SectionLabel`, `BlockBar`, `CountUp`, `Badge`, `Icon`, `Btn`, custom inline modal (or vaul `<Drawer>` if we standardize).

---

## screen-auth (`screen-auth.jsx`, function `AuthScreen`)

### Function signature
`AuthScreen({ sample, onContinue, onBack })`

### useState hooks
- `authType` — `'apikey' | 'basic' | 'oauth' | 'hmac'`.
- `mode` — `'passthrough' | 'stored' | 'oauth'`.
- `secret` — masked input.
- `tested` — boolean for verify state.
- `scopes` — `{read,write,refunds,customers_read,reports,webhooks}` boolean flags.

### useEffect hooks
- On `authType` change → reset mode if not in `auth.modes`.

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — `"opening ${auth.provider} consent screen…"`.

### Backend interactions inferred
- Auth detection itself runs in Pass 0. This screen is configuration UI.
- "test" button needs to actually probe upstream API → `POST /api/v1/preview/:id/auth-probe` (probably already exists in spec parsing) — verify.
- "connect with provider" button kicks OAuth flow → backend OAuth dance with provider.

### Backend-not-ready surfaces (flag-gating required)
- OAuth provider connect → flag `ui_auth_oauth_provider_perm` (OFF → render disabled with "coming soon" pill, or toast on click).
- "test" probe → if backend probe endpoint not yet built, flag `ui_auth_test_perm` (OFF → button always returns "verified" optimistically with disclaimer).

### Error states surfaced
- "auth-fail" mode is handled in `screen-stream`, NOT here. This screen is happy-path config.
- `tested` state shows green "✓ key reached the api · returned 200 in 184ms" when verified.

### Notable inline data / mocks in canon
- `AUTH_TYPES` — static auth profiles (codes A/B/D/E for apikey/basic/oauth/hmac).
- "Stripe" hardcoded as oauth provider name.
- `SCOPES_LIST` — 6 demo scopes (`read`, `write`, `refunds`, `customers_read`, `reports`, `webhooks`). For OAuth, replace with real provider scopes.

### Unique behaviors / drawers / toasts
- Type switcher chips (simulate other types) — UI helper for design preview; production keeps `authType` derived from Pass 0.

### Implementation hint for Phase 1 agent
- Client component.
- Phase 0: `TopBar`, `Card`, `Badge`, `SectionLabel`, `Icon`, `Btn`.

---

## screen-stream (`screen-stream.jsx`, function `StreamLog`)

### Function signature
`StreamLog({ onDone, onCancel, sample })`

### useState hooks
- `stepIdx` — current step (0..6).
- `progress` — 0..100.
- `exampleIdx` — rotating example pointer.
- `errored` — boolean.
- `frame` — spinner frame (0..7).

### useEffect hooks
- Main animation loop on `failStep` change — uses `requestAnimationFrame` to advance steps with per-step durations.
- Examples rotation on `stepIdx` (only during 'compress' step).
- Spinner frame rotation (interval 80ms).

### Cross-screen window globals consumed
- `window.useErrorMode()` — drives `errorMode` for spec-fail / auth-fail freeze.
- `window.mcpToast(msg)` — recovery actions.

### Backend interactions inferred
- This is the live SSE consumer. Real wire-up: `GET /api/v1/jobs/anon-stream/:id/stream` (✅ EXISTS).
- Each `STREAM_STEPS` entry maps to a Pass progress event.

### Backend-not-ready surfaces (flag-gating required)
- "try repair with ai" button → AI repair pipeline → flag `ui_stream_ai_repair_perm` (OFF → toast "coming soon").
- "edit spec inline" → inline editor not yet built → `ui_stream_inline_edit_perm` (OFF → toast).
- "switching to oauth2 client_credentials" → backend support → `ui_stream_alt_auth_perm` (OFF).
- "skip auth (read-only)" → backend read-only mode → `ui_stream_skip_auth_perm` (OFF).
- "notify me when done" → email notification → flag `ui_stream_email_notify_perm` (OFF).

### Error states surfaced
- `errorMode === 'spec-fail'` → freeze at step 0, show "spec failed to parse" card with line/column + code excerpt + 3 recovery buttons.
- `errorMode === 'auth-fail'` → freeze at step 1, show "auth probe returned 401" card + 3 recovery buttons.
- Other modes: pass-through (rate-limit handled on quality, deploy-fail on deploy).

### Notable inline data / mocks in canon
- `STREAM_STEPS` — 7 steps: parse / auth / prune / compress / cluster / compose / finalize. Replace each with real engine pass progress.
- `COMPRESSION_EXAMPLES` — 5 fake before/after examples (`"create_charge"` → `"charges a customer's card."`). Replace with real examples streamed from engine.
- `total = STREAM_STEPS.reduce((s, st) => s + st.dur, 0)` — currently 11000ms. Replace with real ETA from engine.
- "removed 14" / "247 / 348 done" / "found 12 clusters" / "3 created" / "4.2 kb minified" — replace with real progress.
- Spec-fail error excerpt mentions line 412 with unbalanced quote — verbatim placeholder. Replace with real parser error.

### Unique behaviors / drawers / toasts
- Spinner frames `['⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']`.
- "did you know?" tip card visible only when not errored.
- "notify me when done" CTA at the bottom.

### Implementation hint for Phase 1 agent
- Client component (animation + SSE).
- Replace `setTimeout`-based fake animation with real EventSource consuming `/api/v1/jobs/anon-stream/:id/stream`.
- Phase 0: `TopBar`, `Card`, `Btn`, `Icon`.

---

## screen-canvas (`screen-canvas.jsx`, function `Canvas`)

### Function signature
`Canvas({ sample, onPlay, onDeploy, onCmdK, onBack })`

### useState hooks
- `openCats` — open/closed state per category.
- `selected` — currently selected tool id (default `'create_charge'`).
- `filter` — search filter string.
- `chatOpen` — refinement chat open/closed.
- `tool` — current tool object (synced from `selected`).
- `diff` — `null | { id, before, after, beforeTk, afterTk }` — pending shorten diff.
- `autoCountdown` — auto-accept countdown (3 → 0).
- `changedSet` — `Set` of edited tool ids.
- `editing` — boolean for description textarea.
- `showSummary` — first-visit summary card. Persisted via `localStorage('mcpgen_canvas_summary_seen')`.

### useEffect hooks
- On `selected` change → set `tool` via `findTool(selected)`.
- `autoCountdown > 0` → countdown timer; at 0 → `acceptDiff()`.

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — share, chat actions.

### Backend interactions inferred
- Canvas data comes from generation result → `GET /api/v1/jobs/anon/:id` (✅ EXISTS).
- Description shorten → backend AI rewrite → `POST /api/v1/generate/:id/tools/:toolId/shorten` ❌ MISSING.
- Manual description edit save → `PATCH /api/v1/generate/:id/tools/:toolId` ❌ MISSING.
- Refinement chat → `POST /api/v1/generate/:id/chat` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- "auto-shorten" button → `ui_canvas_shorten_perm` (OFF → use static fake diff already in canon).
- "edit description" persist → `ui_canvas_edit_perm` (OFF → keep client-only, dropped on navigation).
- Refinement chat (right pane) → `ui_canvas_chat_perm` (OFF → static seeded messages, no input).
- Quick actions (shorten / add example / combine / set tone) → all `ui_canvas_quick_actions_perm` (OFF → toast).
- "share" button → `ui_canvas_share_perm` (OFF → toast `"share link copied · expires in 24 h"` already does this client-only).

### Error states surfaced
- None directly on canvas; errors surface during stream/quality/deploy.

### Notable inline data / mocks in canon
- `TOOL_DATA` — 4 categories, 11 tools total (`transactions`, `accounts`, `plans`, `composite`). Each tool has `id, name, tk, rawTk, desc, source, params[]`. Composite tools have `composite: true` and `tk: 62/48`. Replace with real generation IR.
- "10:42" / "10:43" timestamps in chat bubbles — verbatim mock.
- Total token count `↓76%` — replace with real `(1 - sum(tk)/sum(rawTk))` calculation.
- "saved 124 tokens total", "+18 tk", "found 2 candidates" — verbatim mock chat responses.

### Unique behaviors / drawers / toasts
- First-visit summary card with localStorage persistence (`mcpgen_canvas_summary_seen`).
- Auto-accept countdown on diff (3 second timer + manual override).
- Diff view: red `−` deleted line, green `+` added line, savings %.
- Chat collapsible from full pane to vertical icon.
- Status bar at bottom (`{N} tools · {totalTk} tokens · ↓76% · last edit Xs ago · ⌘K`).
- Cmd+K palette (handled in `app.jsx`).

### Implementation hint for Phase 1 agent
- Client component (heavy interactive state).
- Three-pane CSS Grid layout (`mc-three`).
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`.

---

## screen-quality (`screen-quality.jsx`, function `QualityReport`)

### Function signature
`QualityReport({ sample, onContinue, onBack })`

### useState hooks
- None at top level (all state implicit via constants `score`, `breakdown`, `tools`).

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.useErrorMode()` — for `rate-limit` mode.
- `window.mcpToast(msg)` — eval actions.
- `window.mcpDrawer(title, body, opts)` — "view all 47" per-tool drawer + "use your own anthropic key" drawer.

### Backend interactions inferred
- Quality report data → `GET /api/v1/quality/:id` (✅ EXISTS).
- "re-run eval" → `POST /api/v1/quality/:id/rerun` ❌ MISSING.
- "show public quality badge" toggle → `PATCH /api/v1/quality/:id/badge-public` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- "re-run eval" → `ui_quality_rerun_perm` (OFF → toast `"rerunning eval suite… ~28s"` is just a stub).
- "use your own anthropic key" (BYOK rate-limit recovery) → `ui_quality_byok_perm` (OFF → toast).
- "show public quality badge" → `ui_quality_public_badge_perm` (OFF → checkbox is non-persistent).
- "view all 47 →" drawer with random scores — replace with real `tool_scores` from quality API.

### Error states surfaced
- `errorMode === 'rate-limit'` → render banner card "agent eval skipped — anthropic api rate-limited" with 3 actions: retry in 3:00 / use your own key / skip-deploy.

### Notable inline data / mocks in canon
- Hardcoded `score = 4.3`.
- `breakdown` array — 5 metrics (description quality 4.2/5, annotations 5.0/5, composite 3/5, eval pass-rate 87%, param naming 4.6/5). Replace with real F2 + F3 results.
- `tools` array — 6 sample tools with score + flags. Replace with all-tool list from API.
- `recommendations` block — 3 hardcoded suggestions ("add example to find_customer", "shorten subscribe description", "consider failed_payments composite"). Replace with real recommendations from engine.
- "5 tasks tested · claude opus 4 · 13/15 successful" — verbatim mock.
- 5 hardcoded eval task results.
- "top 12% of generated servers" — verbatim placeholder.

### Unique behaviors / drawers / toasts
- Custom SVG `Gauge` component (220×130, 36 tick lines, needle + central score).
- Inline 47-tool drawer with random `Math.random` scores (clearly fake; replace).

### Implementation hint for Phase 1 agent
- Client component.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`, `BlockBar`.
- Implement `Gauge` as separate primitive.

---

## screen-playground (`screen-playground.jsx`, function `Playground`)

### Function signature
`Playground({ onBack, onDeploy, sample })`

### useState hooks
- `messages` — chat array `[{ role, text, tool?, done?, rows?, totalAmount? }]`.
- `input` — chat input value.
- `traces` — array of tool-trace records `{ n, name, in, out, lat }`.
- `running` — boolean.
- `keyTtl` — 47*60 → 0 countdown (session credential TTL in seconds).
- `history` — array of past runs (seeded with `SEED_HISTORY` 5 entries).
- `historyFilter` — `'all' | 'tests'`.
- `activeRunId` — currently selected history run id.
- `savedToast` — small inline "saved as test" toast text.

### useEffect hooks
- `keyTtl` countdown (1s interval).

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — many actions (`'running ${testCount} tests… ~12s'`, `'credential wiped from this session'`).

### Backend interactions inferred
- Tool invocation → `POST /api/v1/playground/:id/invoke` ❌ MISSING.
- History persistence → `GET/POST /api/v1/playground/:id/history` ❌ MISSING.
- Save run as test → `POST /api/v1/playground/:id/tests` ❌ MISSING.
- Run regression suite → `POST /api/v1/playground/:id/tests/run` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- All playground actions → `ui_playground_invoke_perm` / `ui_playground_history_perm` / `ui_playground_save_test_perm` / `ui_playground_run_suite_perm` (all OFF → keep existing fake-response behavior with `setTimeout(1600)`).
- BYOK key swap (model dropdown) → `ui_playground_byok_perm` (OFF → dropdown shows but submission ignores).

### Error states surfaced
- None on this screen.

### Notable inline data / mocks in canon
- `SUGGESTED_PROMPTS` — 4 fixed strings.
- `FAKE_TRANSACTIONS` — 5 fake amounts. Replace with real tool response.
- `SEED_HISTORY` — 5 seeded history runs. Replace with real persistent history (or empty if flag OFF).
- "claude sonnet 4.7 — yours", "claude opus 4.1 — yours", "gpt-5 — yours" model dropdown.
- Hardcoded latency/token counts: `218 tk · 240 ms`, `tk: 1240, ms: 240`.
- Cost calc: `cost = (totalNew / 1e6 * 15).toFixed(3)`, `naiveCost = (totalNaive / 1e6 * 15).toFixed(3)`. Keep formula.

### Unique behaviors / drawers / toasts
- Inline replay button on history items.
- Star/save toggle on history.
- Custom inline `savedToast` (separate from global toast system) — small black pill at bottom-center.
- Three-column layout: history rail / chat / live trace.

### Implementation hint for Phase 1 agent
- Client component (heavy state, long-running streams).
- Phase 0: `TopBar`, `Card`, `Btn`, `Icon`, `SectionLabel`, `Badge`, `CountUp`.

---

## screen-deploy (`screen-deploy.jsx`, function `Deploy`)

### Function signature
`Deploy({ onDeployed, onBack, sample })`

### useState hooks
- `opt` — `'cloud' | 'cf' | 'docker' | 'src'` (deploy target).
- `auth` — `'passthrough' | 'static'` (credentials forwarding).
- `deploying` — boolean.
- `failed` — boolean.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.useErrorMode()` — `'deploy-fail'` triggers failed state.
- `window.mcpToast(msg)` — various deploy actions.
- `window.mcpDrawer(title, body, opts)` — build log drawer + vault security drawer.

### Backend interactions inferred
- "deploy" → `POST /api/v1/deploy/ephemeral` (✅ EXISTS) or `POST /api/v1/deploy/permanent/:id` (✅ EXISTS — auth required).

### Backend-not-ready surfaces (flag-gating required)
- "your cloudflare workers" target → `ui_deploy_cf_byo_perm` (OFF → render disabled).
- "docker image" target → `ui_deploy_docker_perm` (OFF → already has `pro` badge; check Pro entitlement).
- "source + dockerfile" → `ui_deploy_src_perm` (OFF → already `pro` badge).
- "static, stored in vault" → `ui_deploy_stored_creds_perm` (OFF → already `pro` badge).
- "auto-fix & retry" / "use mcp-sdk@2.0.4" → `ui_deploy_autofix_perm` (OFF → toast).
- "view full log" drawer → flag `ui_deploy_buildlog_perm` (OFF → drawer shows static placeholder text).
- "customize" URL → `ui_deploy_custom_url_perm` (OFF → toast).

### Error states surfaced
- `errorMode === 'deploy-fail'` → after `setTimeout(1800)` → set `failed = true` → render alternate failure screen with "what happened" log, "likely cause" rec, retry/change/back buttons.

### Notable inline data / mocks in canon
- `DEPLOY_OPTIONS` — 4 hardcoded targets.
- "free: 100K calls/mo · pro: $19/mo + $0.0001/call" — pricing copy verbatim.
- "all 3 regions healthy" / "live · 1.4s ago" — verbatim placeholders.
- Build log content with `mcp-sdk@2.1` vs `2.0.4` runtime mismatch — verbatim.
- "edge-v3.8.2" / "edge-v3.9 (≈ may 14)" — verbatim placeholders.

### Unique behaviors / drawers / toasts
- 3 distinct render branches: form / deploying / failed.
- `DeploySuccess` (separate function below).

### Implementation hint for Phase 1 agent
- Client component.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`.

---

## screen-deploy-success (`screen-deploy.jsx`, function `DeploySuccess`)

### Function signature
`DeploySuccess({ onDashboard, sample })`

### useState hooks
- `copied` — `'' | 'url' | 'install' | 'share'`.
- `shareSheet` — modal toggle.
- `visibility` — `'private' | 'public'`.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — share actions.

### Backend interactions inferred
- Already deployed; this is post-success display.
- "publish to marketplace" toggle → `POST /api/v1/marketplace/publish` ❌ MISSING.
- "invite teammates" → `POST /api/v1/teams/invite` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- "publish to marketplace" toggle → `ui_marketplace_publish_perm` (OFF → toggle is client-only, no backend call).
- "invite teammates" → `ui_teams_invite_perm` (OFF → toast).
- One-click connect to claude desktop / cursor / cline / langgraph → `ui_deploy_oneclick_*_perm` per integration (OFF → all show config copy).

### Error states surfaced
- None — this is post-success.

### Notable inline data / mocks in canon
- URL: `${sample?.id || 'lumen'}-mcp-abc123.mcpgen.app/mcp` — replace `abc123` with real deployment id.
- Install command: `npx mcpgen install ${sample?.id}-mcp-abc123`.
- Share URL: `https://mcpgen.app/s/${sample?.id}-mcp-abc123`.
- Config JSON template (replace `{sample?.id}` and `{ID_KEY}` env-var token).
- 4 connect cards: `claude desktop · one-click`, `cursor · one-click`, `cline · one-click`, `langgraph · snippet ↓`.

### Unique behaviors / drawers / toasts
- Custom in-page modal (share sheet) — not a drawer.
- 1.4s delay on copy state reset.
- 3 "what now?" cards with click-to-action.

### Implementation hint for Phase 1 agent
- Client component.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`.

---

## screen-dashboard (`screen-dashboard.jsx`, function `Dashboard`)

### Function signature
`Dashboard({ onBack, onPlay, sample })`

### useState hooks
- `driftOpen` — drift modal open.
- `driftDismissed` — boolean.
- `diffTab` — `'new' | 'removed' | 'modified'` (drift tabs).
- `autoRegen` — checkbox state.
- `driftMode` — `'list' | 'walk' | 'pinned'` (drift review mode).
- `walkIdx` — current item in walk mode.
- `decisions` — `{ "${section}:${path}": "accept"|"skip" }` per-item decisions.
- `rotateOpen` — credential rotate modal toggle.

### useEffect hooks
- None directly.

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — activity log, settings, access-log, versions drawers.
- `window.mcpToast(msg)` — many.
- `window.FullLogBody`, `window.SettingsBody`, `window.AccessLogBody`, `window.VersionsBody` — drawer body components.

### Backend interactions inferred
- Server detail → `GET /api/v1/deployments/:id` ⚠ PARTIAL.
- Drift events → `GET /api/v1/deployments/:id/drift-events` (✅ EXISTS).
- Drift apply → `POST /api/v1/drift-events/:id/regenerate` (✅ EXISTS).
- Drift snooze → `POST /api/v1/deployments/:id/drift-snooze` ❌ MISSING.
- Drift pin → `POST /api/v1/deployments/:id/pin` ❌ MISSING.
- Activity log → `GET /api/v1/deployments/:id/activity` ❌ MISSING.
- Credential rotate → `POST /api/v1/deployments/:id/credentials/:id/rotate` ❌ MISSING.
- Credential access log → `GET /api/v1/credentials/:id/access-log` ❌ MISSING.
- Settings save (region/visibility/pin/auto-regen) → `PATCH /api/v1/deployments/:id/settings` ❌ MISSING.
- Versions list / rollback → `GET/POST /api/v1/deployments/:id/versions` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- Drift review (any mode) → `ui_dashboard_drift_perm` (OFF → render banner but with disabled review button + "drift detection — coming soon" pill).
- Auto-regenerate toggle → `ui_dashboard_auto_regen_perm` (OFF → checkbox is client-only).
- Pin to old version → `ui_dashboard_pin_perm` (OFF → button disabled).
- "snooze 7 days" → `ui_dashboard_drift_snooze_perm` (OFF → toast only).
- Credential rotate → `ui_dashboard_credentials_perm` (OFF → button disabled).
- Settings save → `ui_dashboard_settings_perm` (OFF → save toast but no real persist).
- Activity full log → `ui_dashboard_activity_perm` (OFF → drawer shows seeded `FullLogBody` data).
- Per-credential access log → `ui_dashboard_credentials_perm` (OFF → seeded `AccessLogBody` data).
- Versions drawer → `ui_dashboard_versions_perm` (OFF → seeded `VersionsBody` data).
- "consider upgrading to pro" → flag with billing link.

### Error states surfaced
- None directly on this dashboard view.

### Notable inline data / mocks in canon
- `SPEC_DIFF` — 3 new endpoints, 1 removed, 4 modified. Replace with real drift_events.
- "$63.20" cumulative savings — verbatim hardcoded.
- "12,840 calls" — appears MULTIPLE times across this screen. Replace with real `tool_calls_30d`.
- "82,180 / 100,000 calls" usage bar.
- "240ms p95" / "live for 12 days" / "v1.2.0" — replace with real deployment metadata.
- 6 "most-used tools" rows.
- 5 "recent activity" rows.
- "sk_live_••••••••8421" / "whsec_••••••••3211" — masked credentials display.
- "encrypted with aes-256 at rest" — verbatim copy.

### Unique behaviors / drawers / toasts
- Drift modal with 3 tabs (list/walk/pinned) and progress strip.
- Walk mode: keyboard-nav-friendly (arrow hints in caption).
- 4 drawers used: `FullLogBody`, `SettingsBody`, `AccessLogBody`, `VersionsBody`.
- 2 inline modals: drift review + rotate credential.

### Implementation hint for Phase 1 agent
- Client component (heavy state).
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`, `BlockBar`, `CountUp`.
- All 4 drawer body components must be available.

---

## screen-dashboard-list (`screen-dashboard-list.jsx`, function `DashboardList`)

### Function signature
`DashboardList({ onBack, onOpen, onMarketplace, onBilling, onLanding })`

### useState hooks
- `filter` — `'all' | 'live' | 'public' | 'drift'`.
- `view` — `'grid' | 'table'`.
- `search` — string.
- `sort` — `'updated' | 'calls' | 'name'`.
- `firstRun` — toggle for empty/populated state (DEMO ONLY — has dev pill at top right).

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.useI18n()` — many keys.
- `window.mcpDrawer(title, body, opts)` — notifications drawer.
- `window.mcpToast(msg)` — various.
- `window.SAMPLE_APIS` — used by `EmptyDashboard`.

### Backend interactions inferred
- Dashboard list → `GET /api/v1/dashboard` (✅ EXISTS).
- Notifications → `GET /api/v1/notifications` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- Notifications drawer → `ui_notifications_perm` (OFF → drawer shows seeded items, no real backend feed).
- "populated/empty" demo pills — REMOVE in production. They're demo state toggles.

### Error states surfaced
- None.

### Notable inline data / mocks in canon
- `USER_SERVERS` — 6 mock servers (`lumen`, `helio`, `nimbus`, `rookery`, `parley`, `anvil`). Replace with real `GET /api/v1/dashboard` response.
- "kira@dolla.io" user email in top bar.
- 3 fake notifications: "spec drift detected · lumen-payments-mcp", "quota at 80%", "eval pass-rate dropped".
- Sparkline heights — heuristic `kind`-based static arrays.
- Stats: `+12%`, `4.2m / ≈ $63`, `pro / 82% / renews may 14`, `1 / anvil-forms`.

### Unique behaviors / drawers / toasts
- `ServerCard` with sparkline + drift badge + visibility badge.
- `ServerTable` alternate view.
- `EmptyDashboard` first-run hero (3 entry cards: paste / fork / sample) + onboarding sidebar.
- `MiniStat` cards.
- `NewServerCard` (dashed border, click → onLanding).

### Implementation hint for Phase 1 agent
- Server-shell + Client island for state. Most data is static after fetch.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`, `LangSwitcher`.
- Implement `Sparkline`, `MiniStat`, `Metric` as small primitives.

---

## screen-marketplace (`screen-marketplace.jsx`, function `Marketplace`)

### Function signature
`Marketplace({ onBack, onDashboard, onOpen, onLanding })`

### useState hooks
- `cat` — current category id (`'all'` default).
- `sort` — `'popular' | 'recent' | 'installs' | 'tools'`.
- `query` — search string.
- `scope` — `'all' | 'verified' | 'mine'`.
- `acFocus` — autocomplete dropdown open.
- `acIdx` — current autocomplete index.
- `filtersOpen` — advanced filters panel toggle.
- `licenseFilter` — `'any' | 'mit' | 'apache'`.
- `minStars` — `0 | 100 | 1000 | 2000`.
- `updatedWithin` — `'any' | 'week' | 'month'`.

### useState refs
- `acRef` — for outside-click detection on autocomplete.

### useEffect hooks
- Reset `acIdx` on `query` change.
- Outside-click handler to close autocomplete.

### Cross-screen window globals consumed
- `window.useI18n()` — many keys.
- `window.mcpToast(msg)` — install/star actions.

### Backend interactions inferred
- Listings → `GET /api/v1/marketplace/servers` ❌ MISSING.
- Install → `POST /api/v1/marketplace/servers/:id/install` ❌ MISSING.
- Detail → `GET /api/v1/marketplace/servers/:id` ❌ MISSING (used by ServerDetail).

### Backend-not-ready surfaces (flag-gating required)
- Entire marketplace browse → `ui_marketplace_browse_perm` (OFF → render banner "marketplace coming soon" + sample listings as read-only previews).
- "install" CTA → `ui_marketplace_install_perm` (OFF → button copies install command + toast `"install command copied"` already does this — that's fine; but real install via dispatch worker is missing).
- "publish" CTA in top bar → `ui_marketplace_publish_perm` (OFF → toast).

### Error states surfaced
- None.

### Notable inline data / mocks in canon
- `MARKETPLACE_SERVERS` — 9 mock servers (stripe, github, linear, helio, nimbus, notion, shopify, postgres, twilio). Replace with `GET /api/v1/marketplace/servers`.
- `CATEGORIES` — 8 hardcoded categories.
- `RECENT = ['stripe', 'github', 'postgres']` autocomplete recent (would be from user history).
- `SUGGEST_TAGS = ['payments', 'official', 'database', 'github', 'storage']`.
- "+8200 installs this week" featured stats verbatim.

### Unique behaviors / drawers / toasts
- Custom autocomplete dropdown (server suggestions + tags + recent).
- Featured banner (only when `!query && cat === 'all' && scope === 'all'`).
- Trending sidebar (top 3 by `weekly`).

### Implementation hint for Phase 1 agent
- Server-shell for static listings (cacheable). Client island for search/autocomplete.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`, `LangSwitcher`.

---

## screen-server-detail (`screen-server-detail.jsx`, function `ServerDetail`)

### Function signature
`ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace })`

### useState hooks
- `tab` — `'readme' | 'tools' | 'changelog' | 'issues' | 'security'`.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.mcpToast(msg)` — star/fork/install.
- `window.mcpDrawer(title, body, opts)` — security policy drawer.

### Backend interactions inferred
- Detail → `GET /api/v1/marketplace/servers/:id` ❌ MISSING.
- Install → `POST /api/v1/marketplace/servers/:id/install` ❌ MISSING.
- Star → `POST /api/v1/marketplace/servers/:id/star` ❌ MISSING.
- Fork → `POST /api/v1/marketplace/servers/:id/fork` ❌ MISSING.
- Tools list → may be embedded in detail response or `GET /api/v1/marketplace/servers/:id/tools` ❌ MISSING.
- Changelog → `GET /api/v1/marketplace/servers/:id/versions` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- "install" → `ui_marketplace_install_perm` (OFF → toast `"config copied · paste into claude desktop"`).
- "star" → `ui_marketplace_star_perm` (OFF → toast).
- "fork" → `ui_marketplace_fork_perm` (OFF → toast `"forked into your workspace"`).
- "request soc2 report" → `ui_security_soc2_perm` (OFF → toast).

### Error states surfaced
- None.

### Notable inline data / mocks in canon
- `tools` array — 7 hardcoded tools per detail page (`create_charge`, `list_charges`, etc.). Replace.
- Changelog: `v2.4.0`, `v2.3.1`, `v2.3.0` with verbatim notes. Replace.
- "no known vulnerabilities" + "audited weekly" + "fingerprint 8e3a 1d24 a91c 4e2f" — verbatim security copy.
- "284 avg tokens / call" / "76% token savings" — replace with real metrics.

### Unique behaviors / drawers / toasts
- 5 tabs (readme / tools / changelog / issues / security).
- Right rail with about / install commands / top installs.
- Quick start `mc-code` block with `npx mcpgen install ${author}/${name}`.
- Security policy drawer with audited details.

### Implementation hint for Phase 1 agent
- Server component (mostly static).
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`.

---

## screen-billing (`screen-billing.jsx`, function `Billing`)

### Function signature
`Billing({ onBack, onLanding, onDashboard, onMarketplace })`

### useState hooks
- `billingCycle` — `'monthly' | 'annual'`.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.useI18n()` — many keys.
- `window.mcpToast(msg)` — various.
- `window.mcpDrawer(title, body, opts)` — upgrade/spending-limits drawers.

### Backend interactions inferred
- Plan / current state → `GET /api/v1/billing` ❌ MISSING (only `checkout`/`portal` exist).
- Invoices list → `GET /api/v1/billing/invoices` ❌ MISSING.
- Usage breakdown → `GET /api/v1/billing/usage` ❌ MISSING.
- Update card → `POST /api/v1/billing/portal` (✅ EXISTS — Stripe portal redirect).
- Upgrade plan → `POST /api/v1/billing/checkout` (✅ EXISTS).
- Cancel plan → `POST /api/v1/billing/portal` redirect.
- Spending caps → `PUT /api/v1/billing/spending-caps` ❌ MISSING.
- Plan switch preview (proration) → `POST /api/v1/billing/preview-plan-change` ❌ MISSING.
- Download all invoices ZIP → `GET /api/v1/billing/invoices/export` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- Invoices list → `ui_billing_invoices_perm` (OFF → table shows seeded `INVOICES` data).
- Usage breakdown → `ui_billing_usage_breakdown_perm` (OFF → seeded data).
- Spending caps editor → `ui_billing_caps_perm` (OFF → drawer shows preview only).
- Plan upgrade flow → if Stripe checkout integrated, OK; otherwise `ui_billing_plan_switch_perm` (OFF → toast).
- "talk to sales" → `ui_billing_enterprise_perm` (OFF → toast).
- Tax info → `ui_billing_tax_perm` (OFF).
- Proration preview drawer (upgrade to team) → `ui_billing_proration_perm` (OFF → drawer shows static text).

### Error states surfaced
- None.

### Notable inline data / mocks in canon
- `PLANS` — 4 plans (free, pro, team, enterprise) with feature lists. Pro is `current: true`. Replace with real plan from auth.
- `INVOICES` — 4 mock invoices (apr/mar/feb/jan 2026). Replace.
- "$284,440 mrr" — wait that's admin only.
- "82,180 / 100,000 calls" / "82%" / "$1.00 overage" — replace with real period usage.
- "visa ····  4242" / "expires 09/28 · kira frost" — payment method mock.
- 4 servers usage breakdown.
- 4 hardcoded FAQ Q&A.

### Unique behaviors / drawers / toasts
- Plan picker with monthly/annual toggle.
- "recommended" ribbon on Pro plan.
- Spending limits drawer with $25/$50/$100/$250 chips.
- Proration drawer for upgrade.

### Implementation hint for Phase 1 agent
- Server component for static parts; client island for cycle toggle + drawer triggers.
- Phase 0: `TopBar`, `Card`, `Btn`, `Badge`, `Icon`, `SectionLabel`, `BlockBar`, `LangSwitcher`.

---

## ADMIN CONSOLE SCREENS (entire admin gated by `ui_admin_console_kill` killswitch)

> All admin endpoints are MISSING. Admin console is post-launch (Phase 11+). Treat all admin screens as flag-gated until then.

---

## admin-app (`admin/admin-app.jsx`, function `App`)

### Function signature
`App()` (no props — wraps everything)

### useState hooks
- `authed` — boolean (login gate).
- `screen` — current admin screen id.
- `theme` — `'dark' | 'light'`.
- `density` — `'compact' | 'comfy'`.
- `demoState` — `'default' | 'empty' | 'loading' | 'partial' | 'incident' | 'maintenance'`. **DEMO ONLY**, remove in production.
- `paletteOpen` — Cmd-K palette.
- `env` — `'prod' | 'staging' | 'dev'`.
- `toast` — local single-toast string.

### useEffect hooks
- Set `documentElement.dataset.theme/density` on theme/density change.
- Cmd+K listener (toggles palette).

### Cross-screen window globals consumed
- `window.computeTokens` — admin-specific token computer (different from `MCPTokens.makeCssVars`).
- `window._mcpRegister` — for ToastHost/DrawerHost (shared with main app).

### Backend interactions inferred
- Auth check → `GET /api/admin/v1/me` ❌ MISSING.
- Then per-screen endpoints (see each).

### Backend-not-ready surfaces (flag-gating required)
- Entire admin console → `ui_admin_console_kill` (kill-switch, default ON = admin closed).

### Error states surfaced
- None at app level (except via incident/maintenance demo states).

### Notable inline data / mocks in canon
- `NAV` — 4 groups (ops/people/product/platform), 14 items total.
- `demoState` toggle — REMOVE in production.
- Status bar at bottom: "all systems · 98.9% uptime · 30d · db 12ms · queue 42 · active sessions 1,204 · build a91c4e2 · 2 min ago".
- Cmd-K palette commands (groups: navigate / jump to / actions).

### Unique behaviors / drawers / toasts
- Cmd-K command palette with 3 grouped sections.
- Demo state selector (status bar override).
- Theme + density toggles.
- Per-screen routing.

### Implementation hint for Phase 1 agent
- Wraps all admin screens. Use a layout like `app/admin/layout.tsx` (Server) + Client island for nav state.
- Phase 0: needs admin-specific tokens + admin layout primitives (`PageHead`, `KPI`, `Pill`, `Sparkline`, `Toggle`, `Table`).

---

## admin-login (`admin/admin-login.jsx`, function `LoginScreen`)

### Function signature
`LoginScreen({ onIn })`

### useState hooks
- `stage` — `'sso' | 'mfa' | 'locked' | 'success'`.
- `email` — default `'jana.k@mcpgen.dev'`.
- `code` — 6-digit MFA code.
- `err` — error message.
- `reason` — for breakglass/scheduled shifts.
- `shift` — `'on-call' | 'scheduled' | 'breakglass'`.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.computeTokens`.

### Backend interactions inferred
- Logto staff SSO → `/api/auth/login?provider=okta` ❌ MISSING (Logto has Okta connector; staff sign-in flow is separate).
- MFA verify → `/api/admin/v1/auth/mfa` ❌ MISSING.
- Session start → `/api/admin/v1/auth/session` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- Entire admin login → `ui_admin_console_kill` (gate everything until ready).

### Error states surfaced
- "staff sso requires an @mcpgen.dev address" — client-side validation.
- "enter the 6-digit code from your authenticator" — input validation.

### Notable inline data / mocks in canon
- "you are connecting from an unrecognised network" — mock geo banner.
- System status mini-table (mocked).
- "session imp_xxxx · 30 min" / "sess_8a91qp4f3c2e" — mock IDs.
- "v4.12.0 · soc2 type ii · iso 27001 · all sessions are recorded" — verbatim badge.

### Unique behaviors / drawers / toasts
- 3-stage form (SSO → MFA → success).
- Shift selection (on-call / scheduled / breakglass).
- Breakglass requires reason.
- Step indicator at top.

### Implementation hint for Phase 1 agent
- Client component.

---

## admin-overview (`admin/admin-overview.jsx`, function `Overview`)

### Function signature
`Overview({ ctx })` — `ctx` provides `screen, setScreen, demoState, showToast`.

### useState hooks
- None directly (uses `ctx`).

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.ADM_DATA` — mock data.

### Backend interactions inferred
- KPIs → `GET /api/admin/v1/overview` ❌ MISSING.
- Recent activity → `GET /api/admin/v1/audit?limit=6` ❌ MISSING.
- Moderation top → `GET /api/admin/v1/moderation?priority=high` ❌ MISSING.
- Region health → `GET /api/admin/v1/regions` ❌ MISSING.

### Backend-not-ready surfaces (flag-gating required)
- All admin endpoints — gated by `ui_admin_console_kill`.

### Error states surfaced
- `demoState === 'incident'` → IncidentBanner with "cdg degraded — p95 342ms…".
- `demoState === 'maintenance'` → IncidentBanner.
- `demoState === 'empty'` → EmptyState ("no activity in this window").
- `demoState === 'loading'` → KPIs show `…`.

### Notable inline data / mocks in canon
- KPIs: "1,204 active orgs · +38 (7d)", "4,812 servers · live", "8.42m invocations · 24h", "0.18% error rate", "$284,440 mrr · +8.4% mom", "42 open tickets · 3 urgent · 2 over sla", "8 moderation queue", "3 failed deploys 24h".
- All data sourced from `window.ADM_DATA`.

### Unique behaviors / drawers / toasts
- "broadcast" CTA → `ctx.setScreen('broadcast')`.
- "open audit log →" link → `ctx.setScreen('audit')`.

### Implementation hint for Phase 1 agent
- Server component (mostly static once data fetched).
- Phase 0: `PageHead`, `KPI`, `Card`, `SectionLabel`, `Pill`, `IncidentBanner`, `EmptyState`, `Sparkline`.

---

## admin-users (`admin/admin-users.jsx`, function `UsersScreen`)

### Function signature
`UsersScreen({ ctx })`

### useState hooks
- `sel` — selected user (default `D.users[2]`).
- `tab` — `'overview' | 'servers' | 'sessions' | 'billing' | 'audit' | 'danger'`.
- `showImp` — impersonate modal toggle.
- `showSusp` — suspend modal toggle.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.ADM_DATA`.
- `window.mcpDrawer(title, body, opts)` — user filters drawer.

### Backend interactions inferred
- List users → `GET /api/admin/v1/users` ❌ MISSING.
- User detail → `GET /api/admin/v1/users/:id` ❌ MISSING.
- Impersonate → `POST /api/admin/v1/users/:id/impersonate` ❌ MISSING (4-eyes required).
- Suspend → `POST /api/admin/v1/users/:id/suspend` ❌ MISSING (4-eyes).
- Force password reset → `POST /api/admin/v1/users/:id/password-reset` ❌ MISSING.
- Revoke all sessions → `POST /api/admin/v1/users/:id/revoke-sessions` ❌ MISSING.
- Rotate all api keys → `POST /api/admin/v1/users/:id/rotate-keys` ❌ MISSING.
- GDPR export → `POST /api/admin/v1/users/:id/gdpr-export` ❌ MISSING.
- Delete account → `POST /api/admin/v1/users/:id/delete` ❌ MISSING (4-eyes).

### Backend-not-ready surfaces
- All admin actions gated.

### Error states surfaced
- `demoState === 'empty'` → EmptyState.

### Notable inline data / mocks in canon
- `D.users` — 10 mock users.
- 3 hardcoded recent sessions per user.
- "raw entity" JSON code block — verbatim.

### Unique behaviors / drawers / toasts
- Split layout (left list / right detail).
- Tabs: overview / servers / sessions / billing / audit / danger.
- ImpersonateModal — reason required.
- SuspendModal — predefined reason dropdown + free-form text + notify-email toggle.
- Danger zone: 4 buttons (force pw reset / revoke sessions / rotate keys / delete).

### Implementation hint for Phase 1 agent
- Phase 0: `PageHead`, `Pill`, `Card`, `SectionLabel`, `Btn`, `Toggle`, `EmptyState`.

---

## admin-servers (`admin/admin-servers.jsx`, function `ServersScreen`)

### Function signature
`ServersScreen({ ctx })`

### useState hooks
- `sel` — selected server (default `D.servers[7]`).
- `tab` — `'overview' | 'tools' | 'deploys' | 'traffic' | 'drift' | 'listing' | 'danger'`.
- `showRollback` — boolean.

### useEffect hooks
- None.

### Cross-screen window globals consumed
- `window.ADM_DATA`.
- `window.mcpDrawer(title, body, opts)` — runbook drawer.

### Backend interactions inferred
- List servers → `GET /api/admin/v1/servers` ❌ MISSING.
- Detail → `GET /api/admin/v1/servers/:id` ❌ MISSING.
- Force re-publish → `POST /api/admin/v1/servers/:id/redeploy` ❌ MISSING.
- Rollback → `POST /api/admin/v1/servers/:id/rollback` ❌ MISSING.
- Takedown → `POST /api/admin/v1/servers/:id/takedown` ❌ MISSING (4-eyes).
- Drift force regenerate → `POST /api/admin/v1/servers/:id/drift/regenerate` ❌ MISSING.
- Pin to old spec → `POST /api/admin/v1/servers/:id/pin` ❌ MISSING.

### Error states surfaced
- `sel.status === 'incident'` → red incident banner with runbook drawer.

### Notable inline data / mocks in canon
- `D.servers` — 12 mock servers.
- KPIs: invocations 24h / p95 / error rate / deploys / flags.
- Diff format: del/add lines for spec drift.
- "8.2% errors · investigating" verbatim.

### Unique behaviors / drawers / toasts
- Split layout.
- 7 tabs.
- Rollback modal: pick a version radio.
- Drift tab with diff visualization.
- Runbook drawer for incidents.

### Implementation hint for Phase 1 agent
- Phase 0: `PageHead`, `Pill`, `Card`, `SectionLabel`, `Btn`, `Table`, `IncidentBanner`, `StatusDotForServer`.

---

## admin-marketplace (`admin/admin-marketplace.jsx`, function `MarketplaceScreen`)

### Function signature
`MarketplaceScreen({ ctx })`

### useState hooks
- `tab` — `'queue' | 'reports' | 'featured' | 'categories' | 'policy'`.
- `sel` — currently inspected queue item (default `D.queue[0]`).
- `showTakedown` — modal toggle.

### Cross-screen window globals consumed
- `window.ADM_DATA`.
- `window.mcpDrawer(title, body, opts)` — moderation filters.
- `window.mcpToast(msg)`.

### Backend interactions inferred
- Queue → `GET /api/admin/v1/moderation/queue` ❌ MISSING.
- Approve → `POST /api/admin/v1/moderation/:id/approve` ❌ MISSING.
- Reject (takedown) → `POST /api/admin/v1/moderation/:id/reject` ❌ MISSING (4-eyes).
- Bulk approve → `POST /api/admin/v1/moderation/bulk-approve` ❌ MISSING.

### Error states surfaced
- None.

### Notable inline data / mocks in canon
- `D.queue` — moderation queue items.
- Auto-checks list (5 items: license / cves / oauth scopes / pii / trademark).
- "policy hit: oauth scope `admin:org` exceeds least-privilege" verbatim.

### Unique behaviors / drawers / toasts
- Filters drawer.
- TakedownModal — policy violation dropdown + message to author.

---

## admin-deploys (`admin/admin-deploys.jsx`, function `DeploysScreen`)

### Function signature
`DeploysScreen({ ctx })`

### useState hooks
- `showKill` — global kill switch modal.
- `showFlag` — per-flag flip approval modal.

### Cross-screen window globals consumed
- `window.ADM_DATA`.

### Backend interactions inferred
- Regions → `GET /api/admin/v1/regions` ❌ MISSING.
- Deploys → `GET /api/admin/v1/deploys` ❌ MISSING.
- Kill switches → `GET/POST /api/admin/v1/killswitches` ❌ MISSING (4-eyes).
- Per-deploy rollback → `POST /api/admin/v1/deploys/:id/rollback` ❌ MISSING.

### Notable inline data / mocks in canon
- `D.regions` — 7 regions.
- `D.deploys` — 6 recent.
- 5 hardcoded kill switches.
- "1.4M qps will start receiving 503" — verbatim warning.

### Unique behaviors / drawers / toasts
- Region grid.
- Kill switch master modal — requires INC reference + typed confirmation phrase.
- Per-flag approval modal.

---

## admin-billing (`admin/admin-billing.jsx`, function `BillingScreen`)

### Function signature
`BillingScreen({ ctx })`

### useState hooks
- `tab` — `'invoices' | 'refunds' | 'dunning' | 'plans' | 'tax'`.
- `showRefund` — invoice being refunded (or null).

### Cross-screen window globals consumed
- `window.ADM_DATA`.
- `window.mcpDrawer(title, body, opts)` — issue credit drawer.

### Backend interactions inferred
- Invoices → `GET /api/admin/v1/billing/invoices` ❌ MISSING.
- Refund → `POST /api/admin/v1/billing/invoices/:id/refund` ❌ MISSING.
- Retry charge → `POST /api/admin/v1/billing/invoices/:id/retry` ❌ MISSING.
- Issue credit → `POST /api/admin/v1/billing/credits` ❌ MISSING.
- Dunning sequence → `GET/PUT /api/admin/v1/billing/dunning` ❌ MISSING.

### Notable inline data / mocks in canon
- `D.invoices` — invoices.
- Top KPIs: MRR, failed payments, refunds, credits outstanding.
- Dunning sequence — 6 hardcoded steps.
- "refunds > $500 require 4-eyes" rule.

### Unique behaviors / drawers / toasts
- RefundModal — half/full chips, method (card/credit), reason dropdown.
- Issue credit drawer.

---

## admin-llm (`admin/admin-llm.jsx`, function `LLMScreen`)

### Function signature
`LLMScreen({ ctx })`

### useState hooks
- `tab` — `'routing' | 'evals' | 'rate-limits' | 'prompts' | 'safety'`.

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — propose route change drawer.

### Backend interactions inferred
- Active routes → `GET /api/admin/v1/llm/routes` ❌ MISSING.
- Provider mix → `GET /api/admin/v1/llm/providers` ❌ MISSING.
- Eval runs → `GET /api/admin/v1/llm/evals` ❌ MISSING.
- Run eval → `POST /api/admin/v1/llm/evals/run` ❌ MISSING.
- Propose route change → `POST /api/admin/v1/llm/routes/proposals` ❌ MISSING (2 approvers).

### Notable inline data / mocks in canon
- 4 routes: `tool-calls/standard` / `tool-calls/cheap` / `spec-synth` / `moderation`.
- 4 providers: anthropic 72% / openai 18% / google 7% / self-host 3%.
- 4 hardcoded eval runs.
- "Tokens 184.2 m · 24h", "$48,210 model spend · 30d", "742 ms avg latency", "94.2% eval pass rate".

### Unique behaviors / drawers / toasts
- BarRow custom helper.
- Proposed change diff display.

---

## admin-obs (`admin/admin-obs.jsx`, function `ObservabilityScreen`)

### Function signature
`ObservabilityScreen({ ctx })`

### useState hooks
- `tab` — `'errors' | 'latency' | 'traces' | 'sessions'`.

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — filters drawer.

### Backend interactions inferred
- Top error groups → `GET /api/admin/v1/obs/errors?period=24h&group=stack-hash` ❌ MISSING.
- Silence error → `POST /api/admin/v1/obs/errors/:id/silence` ❌ MISSING.
- "open in datadog" → external link.

### Notable inline data / mocks in canon
- 5 hardcoded error groups (`UpstreamTimeoutError`, `SchemaValidationError`, `RateLimitExceeded`, `OauthTokenRevoked`, `DatabaseConnectionError`).
- Top KPIs: errors / p95 / p99 / saturated regions.

---

## admin-flags (`admin/admin-flags.jsx`, function `FlagsScreen`)

### Function signature
`FlagsScreen({ ctx })`

### useState hooks
- `showEdit` — flag being edited (or null).

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — new flag drawer.

### Backend interactions inferred
- Flags list → `GET /api/admin/v1/flags` (Flipt API or BFF wrapper) ❌ MISSING.
- Flip flag → `PATCH /api/admin/v1/flags/:id` ❌ MISSING.
- Create flag → `POST /api/admin/v1/flags` ❌ MISSING.
- Promote/freeze experiment → `POST /api/admin/v1/flags/:id/{promote,freeze,kill}` ❌ MISSING.

### Notable inline data / mocks in canon
- 5 hardcoded flags (`fl_drift_v2`, `fl_mp_featured`, `fl_haiku_router`, `fl_billing_v3`, `fl_admin_panel`).
- Active experiment: `cheap-route haiku-4` with control 92.1% / variant 93.7% / latency Δ −14% / cost Δ −38%.
- "flips above 25% require 4-eyes" rule.

### Unique behaviors / drawers / toasts
- New flag drawer.
- Edit flag modal — stage chips + targeting SQL display.

---

## admin-support (`admin/admin-support.jsx`, function `SupportScreen`)

### Function signature
`SupportScreen({ ctx })`

### useState hooks
- `sel` — selected ticket (default `tickets[0]`).

### Cross-screen window globals consumed
- (None special.)

### Backend interactions inferred
- Tickets → `GET /api/admin/v1/support/tickets` ❌ MISSING (or via Plain/Linear/Zendesk integration).
- Reply → `POST /api/admin/v1/support/tickets/:id/replies` ❌ MISSING.
- Internal note → `POST /api/admin/v1/support/tickets/:id/notes` ❌ MISSING.
- Resolve → `POST /api/admin/v1/support/tickets/:id/resolve` ❌ MISSING.
- Snooze → `POST /api/admin/v1/support/tickets/:id/snooze` ❌ MISSING.
- Assign → `POST /api/admin/v1/support/tickets/:id/assign` ❌ MISSING.

### Notable inline data / mocks in canon
- 6 hardcoded tickets (t_877..t_882).
- Customer card mock data.
- Macros: `oauth-debug`, `refund-offer`.

### Unique behaviors / drawers / toasts
- Split layout.
- Conversation thread view.
- Reply form with macros + attach + internal note toggle.

---

## admin-audit (`admin/admin-audit.jsx`, function `AuditScreen`)

### Function signature
`AuditScreen({ ctx })`

### useState hooks
- `showDiff` — current event being inspected (or null).

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — audit webhook config drawer.

### Backend interactions inferred
- Events → `GET /api/admin/v1/audit?period=24h` ❌ MISSING.
- Export 90d → `POST /api/admin/v1/audit/export?days=90` ❌ MISSING.
- Audit webhook config → `GET/PUT /api/admin/v1/audit/webhook` ❌ MISSING.

### Notable inline data / mocks in canon
- 9 hardcoded events.
- Kind/actor/target/date filter inputs.
- State diff (red/green lines, e.g. `"status": "active"` → `"suspended"`).
- Side effects list (sessions revoked, keys disabled, email sent).
- Signed sha256 hash.

### Unique behaviors / drawers / toasts
- Diff modal with state diff + side effects + signed hash.
- Webhook config drawer (signing secret rotate).

---

## admin-integrations (`admin/admin-integrations.jsx`, function `IntegrationsScreen`)

### Function signature
`IntegrationsScreen({ ctx })`

### useState hooks
- `tab` — `'oauth' | 'webhooks' | 'secrets' | 'smtp' | 'dns'`.
- `showRotate` — boolean.

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — add provider drawer.

### Backend interactions inferred
- OAuth providers → `GET /api/admin/v1/integrations/oauth` ❌ MISSING.
- Rotate OAuth secret → `POST /api/admin/v1/integrations/oauth/:id/rotate` ❌ MISSING.
- Add provider → `POST /api/admin/v1/integrations/oauth` ❌ MISSING.
- Webhooks → `GET/PUT/DELETE /api/admin/v1/integrations/webhooks` ❌ MISSING.
- Secrets → `GET /api/admin/v1/integrations/secrets` ❌ MISSING (KMS-backed).
- Reveal secret → `POST /api/admin/v1/integrations/secrets/:id/reveal` ❌ MISSING (logged with reason).
- Rotate secret → `POST /api/admin/v1/integrations/secrets/:id/rotate` ❌ MISSING.

### Notable inline data / mocks in canon
- 6 OAuth providers (github, google, slack, microsoft, discord, notion).
- 3 outgoing webhooks (slack, acme.com billing, observe.co).
- 5 secrets (STRIPE_SECRET_KEY, ANTHROPIC_API_KEY, SENDGRID_API_KEY, DATABASE_URL_PRIMARY, JWT_SIGNING_KEY).

### Unique behaviors / drawers / toasts
- Add provider drawer.
- Rotate modal with overlap window chips (1h/6h/24h/7d).

---

## admin-content (`admin/admin-content.jsx`, function `ContentScreen`)

### Function signature
`ContentScreen({ ctx })`

### useState hooks
- `tab` — `'docs' | 'listings' | 'email' | 'in-app' | 'status page'`.

### Backend interactions inferred
- Docs → `GET/PUT /api/admin/v1/content/docs` ❌ MISSING.
- Email templates → `GET/PUT /api/admin/v1/content/email` ❌ MISSING.
- Send test email → `POST /api/admin/v1/content/email/:id/test` ❌ MISSING.

### Notable inline data / mocks in canon
- 5 doc pages (quickstart / oauth / billing / spec-drift / runbooks).
- 6 email templates.
- Hardcoded `payment-failed` email preview body.

### Unique behaviors / drawers / toasts
- 2-pane layout: list + preview.

---

## admin-broadcast (`admin/admin-broadcast.jsx`, function `BroadcastScreen`)

### Function signature
`BroadcastScreen({ ctx })`

### useState hooks
- `audience` — segment id.
- `chKind` — `'email' | 'in-app banner' | 'both'`.
- `showSend` — request approval modal.

### Cross-screen window globals consumed
- `window.mcpDrawer(title, body, opts)` — broadcast history drawer.

### Backend interactions inferred
- Audiences → `GET /api/admin/v1/broadcast/audiences` ❌ MISSING.
- Custom segment SQL run → `POST /api/admin/v1/broadcast/audiences/dry-run` ❌ MISSING.
- Send broadcast → `POST /api/admin/v1/broadcast/send` ❌ MISSING (2 approvers).
- History → `GET /api/admin/v1/broadcast/history` ❌ MISSING.
- Spam-score check → `POST /api/admin/v1/broadcast/spam-check` ❌ MISSING.

### Notable inline data / mocks in canon
- 6 predefined audiences (`all`, `plan_pro`, `plan_ent`, `failed_pay`, `incident`, `custom`).
- Hardcoded SQL example for custom audience.
- Hardcoded subject + body for outage broadcast.
- Safety checks: 6 items.

### Unique behaviors / drawers / toasts
- 3-step composer (audience / channel / schedule).
- Live preview pane.
- Request approval modal — pick 2nd approver.
- Custom SQL editor for `custom` audience.

---

## Verification spot-checks

### Spot-check 1: `screen-canvas.jsx` Canvas
- ✅ Props: `sample, onPlay, onDeploy, onCmdK, onBack` — confirmed (line 89).
- ✅ `localStorage('mcpgen_canvas_summary_seen')` persistence — confirmed (line 102).
- ✅ Auto-accept countdown 3s — confirmed (line 132).
- ✅ Status bar copy: `{N} tools · {tk} · ↓76% · last edit 10s ago · ⌘K` — confirmed (line 428).

### Spot-check 2: `screen-stream.jsx` StreamLog
- ✅ `errorMode === 'spec-fail'` halts at step 0; `'auth-fail'` at step 1 — confirmed (line 26-28).
- ✅ Spinner frames `['⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']` — confirmed (line 79).
- ✅ STREAM_STEPS has 7 entries with `dur` ms — confirmed.

### Spot-check 3: `screen-dashboard.jsx` Dashboard
- ✅ Drift modal modes `'list' | 'walk' | 'pinned'` — confirmed (line 26).
- ✅ Per-item decisions keyed `${section}:${path}` — confirmed (line 30).
- ✅ "$63.20" cumulative savings copy verbatim — confirmed (line 170).
- ✅ "12,840" calls — confirmed multiple occurrences.

### Cross-reference against `apps/api/src/routes/v1/`:
- ✅ `generate.ts`, `jobs/anon.ts`, `jobs/anon-stream.ts`, `preview.ts`, `quality.ts`, `playground.ts` (stub), `deploy-ephemeral.ts`, `permanent-deploy.ts`, `download.ts`, `claim.ts`, `dashboard.ts`, `deployments.ts`, `usage.ts`, `drift.ts`, `billing/{checkout,portal,index}.ts`, `stripe-webhook.ts` — all confirmed.
- ❌ Missing: marketplace/*, admin/*, playground tool-invoke, drift-snooze, drift-pin, credentials/rotate, credentials/access-log, deployments/:id/activity, deployments/:id/settings, deployments/:id/versions, billing/invoices, billing/usage, billing/spending-caps, notifications.

---

## Final notes for Phase 1 implementation

1. **i18n keys** are extensive in main flow screens (landing, dashboard-list, marketplace, billing). Pull from `i18n.jsx` (5 locales: en/ru/es/de/ja) and migrate to next-intl.
2. **Drawer system**: vaul `<Drawer>` mounted once at root; `openDrawer({title, body, eyebrow})` hook replaces `window.mcpDrawer`. Body components (`FullLogBody`, `SettingsBody`, etc.) become server-or-client components depending on data needs.
3. **Toast system**: sonner `<Toaster>` at root; `toast()` API replaces `window.mcpToast`.
4. **Error mode** (`useErrorMode`): keep for design-preview only? Or graduate to a real "demo" mode for support screenshots? Decision needed before Phase 1 — recommend keeping in dev/staging only behind `ui_demo_error_states_kill` flag (default ON in prod = hidden).
5. **Mock data** in canon files (`SAMPLE_APIS`, `USER_SERVERS`, `MARKETPLACE_SERVERS`, `ADM_DATA`, `SEED_HISTORY`, `EXCLUDED_ENDPOINTS_INIT`, `PREVIEW_CATEGORIES`, `TOOL_DATA`, `STREAM_STEPS`, etc.) — keep some as static seed data (sample chips on landing) and replace others with API calls (USER_SERVERS, MARKETPLACE_SERVERS).
6. **Admin console** is post-launch (Phase 11+); gate with single kill-switch `ui_admin_console_kill` (default ON = closed).
7. **`MCPGEN_ERROR_BUS`** global singleton in `app.jsx` — port to a small Zustand store; dev/QA can flip it via dev-only command palette item.
8. **`localStorage`** keys to preserve: `mcpgen_canvas_summary_seen` (canvas first-visit dismiss).
9. **Three-pane and split layouts**: canvas (`mc-three`), playground (3-col grid), admin-users/servers/support (`adm-split`). Use CSS Grid or Tailwind `grid-cols-*`.
10. **Demo state toggle** in dashboard-list (`firstRun` populated/empty pills) and admin-app (`demoState` selector) — REMOVE in production builds.
