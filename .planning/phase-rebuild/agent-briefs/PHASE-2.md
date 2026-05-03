# Phase 2 — Authed Shell (4 parallel agents)

Read `SHARED-BRIEF.md` first. Same rules. New ownership.

| Agent | Screen(s) | Canon source(s) | Output dir(s) | Route(s) |
|---|---|---|---|---|
| **B1** | Auth | `screen-auth.jsx` | `components/screens/auth/` | `app/auth/page.tsx` |
| **B2** | Dashboard + DashboardList | `screen-dashboard.jsx`, `screen-dashboard-list.jsx` | `components/screens/dashboard/`, `components/screens/dashboard-list/` | `app/dashboard/page.tsx`, `app/dashboard/[id]/page.tsx` |
| **B3** | Billing | `screen-billing.jsx` | `components/screens/billing/` | `app/billing/page.tsx` |
| **B4** | Marketplace + ServerDetail | `screen-marketplace.jsx`, `screen-server-detail.jsx` | `components/screens/marketplace/`, `components/screens/server-detail/` | `app/marketplace/page.tsx`, `app/marketplace/[serverId]/page.tsx` |

## Per-agent specifics

### B1 — Auth
- Canon `AuthScreen({ sample, onContinue, onBack })`.
- Renders auth-mode picker (apiKey / oauth / pat / basic / token / iam) — depends on which the spec actually declared. The `sample` prop carries spec metadata.
- This is the BACKEND-AUTH probe screen, NOT the user-Logto sign-in screen. Don't confuse with `apps/web/src/app/api/auth/logto/sign-in/route.ts`.
- Wire `onContinue` → start the actual generation by re-triggering `/api/v1/generate` with the auth config. `onBack` → previous step (Canvas).
- This screen is only reachable as part of the generate flow; verify upstream Canvas wires it correctly.
- Auth credential capture: render canon's auth-mode-specific input forms. Real BFF endpoint to validate credentials is missing → flag-gate `ui_auth_validate_perm` and toast on click; capture happens in localStorage / sessionStorage for now (passthrough credentials are sent at runtime in the deployed worker headers).

### B2 — Dashboard / Dashboard-list
- Canon `Dashboard({ onBack, onPlay, sample })` and `DashboardList({ onBack, onOpen, onMarketplace, onBilling, onLanding })`.
- DashboardList: `app/dashboard/page.tsx` Server Component fetches `useDashboardSummary()` server-side, hydrates the client.
- Dashboard (single server): `app/dashboard/[id]/page.tsx` reads the deployment id, fetches `useDeployments()` filtered.
- Drift detection / drift drawer / drift-regenerate CTA: real BFF endpoints exist (`GET /api/v1/deployments/:id/drift-events`). Wire them.
- "logs" / "settings" / "versions" drawer triggers: implement those drawer bodies under `components/screens/dashboard/drawers/{full-log,settings,versions}.tsx`. Each is a Client Component that loads its data lazily.
- Auth-protected: middleware redirects anon to Logto. Preserve canon UX.
- Tests: snapshot at 4 viewports + flow "dashboard → click drift → drawer opens".

### B3 — Billing
- Canon `Billing({ onBack, onLanding, onDashboard, onMarketplace })`.
- Auth + flag-gated: middleware sees `ui_billing_active_perm=OFF` → 404 by default.
- Inside billing: usage chart + invoices + plan upgrade CTA.
- BFF endpoints: `POST /api/v1/billing/checkout`, `POST /api/v1/billing/portal`, `GET /api/v1/usage/hourly`, `GET /api/v1/dashboard`. Use those.
- `useBillingPlan()` and `useBillingInvoices()` are stubs (BFF endpoints missing) — render canon's "loading" state.
- Upgrade-to-team drawer: render canon drawer body, wire confirm button to `createCheckoutSession({ plan: 'team' })`.

### B4 — Marketplace + ServerDetail
- Canon `Marketplace({ onBack, onDashboard, onOpen, onLanding })` and `ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace })`.
- Flag-gated: `ui_marketplace_perm=OFF` → 404.
- Marketplace lists servers (canon has `MARKETPLACE_SERVERS` literal — replace with `useMarketplaceServers()` which returns disabled-stub for now → render canon's empty grid with a "Coming soon" overlay).
- ServerDetail: `app/marketplace/[serverId]/page.tsx` — `useMarketplaceServer(id)` stub.
- "Install" CTA: gated by `ui_marketplace_install_perm` flag. Click triggers `toast('Coming soon')` until backend ready.
- Tests: snapshot + flow "marketplace card click → server-detail rendered".

## Coordination

- Logto session resolution: layout already wraps in `LogtoSessionProvider`. Use `useLogtoContext()` if you need claims client-side; on the server use the `apps/web/src/lib/logto/*` helpers.
- Dashboard agent + Billing agent both touch `/api/v1/dashboard` data. No conflict — they're orthogonal sub-shapes.

Hard cap 90min per agent.
