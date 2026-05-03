# Phase 3 — Admin Console (1 lead + 3 parallel waves)

Read `SHARED-BRIEF.md` first. **Critical:** the entire admin namespace renders in code, but is gated by `ui_admin_panel_perm=OFF` at the middleware level. With the flag OFF (default), `/admin/*` returns 404. Flipping the flag ON immediately exposes the full admin shell. **Do not delay implementation because the flag is OFF — implement everything.**

## Phase 3 split

### C1 — Admin shell + admin-ui kit (sequential, lead agent runs first)

- **Outputs:** `components/admin-ui/{btn,top-bar,table,filter-bar,…}.tsx` + `components/screens/admin/admin-shell.tsx` + `app/admin/layout.tsx`.
- **Sources:** `claude-design-reference/canon/admin/admin-app.jsx` (shell + auth state) + `claude-design-reference/canon/admin/admin-ui.jsx` (admin primitives — these differ from main `ui.jsx`: more table/grid/filter-heavy).
- **Auth:** admin login (`screen admin-login`) is part of the shell (canon admin-login.jsx). Implement as a separate route at `/admin/login` (also flag-gated). Wire to a NEW Logto org "admin" (out of scope for code — document in `FLAGS-NEEDED.md`).
- **Layout:** `app/admin/layout.tsx` wraps every `/admin/*` route with the canon admin shell + nav.
- After C1 completes, C2/C3/C4 can run in parallel.

### C2 — Admin core (4 parallel — overview / users / servers / data)

| Sub-agent | Canon | Output | Route |
|---|---|---|---|
| C2-overview | `admin/admin-overview.jsx` | `components/screens/admin/overview/` | `app/admin/page.tsx` |
| C2-users | `admin/admin-users.jsx` | `components/screens/admin/users/` | `app/admin/users/page.tsx` |
| C2-servers | `admin/admin-servers.jsx` | `components/screens/admin/servers/` | `app/admin/servers/page.tsx` |
| C2-data | `admin/admin-data.jsx` | `components/screens/admin/data/` | `app/admin/data/page.tsx` |

### C3 — Admin ops (6 parallel)

| Sub-agent | Canon | Output | Route |
|---|---|---|---|
| C3-llm | `admin/admin-llm.jsx` | `components/screens/admin/llm/` | `app/admin/llm/page.tsx` |
| C3-marketplace | `admin/admin-marketplace.jsx` | `components/screens/admin/marketplace/` | `app/admin/marketplace/page.tsx` |
| C3-billing | `admin/admin-billing.jsx` | `components/screens/admin/billing/` | `app/admin/billing/page.tsx` |
| C3-deploys | `admin/admin-deploys.jsx` | `components/screens/admin/deploys/` | `app/admin/deploys/page.tsx` |
| C3-flags | `admin/admin-flags.jsx` | `components/screens/admin/flags/` | `app/admin/flags/page.tsx` |
| C3-integrations | `admin/admin-integrations.jsx` | `components/screens/admin/integrations/` | `app/admin/integrations/page.tsx` |

### C4 — Admin meta (6 parallel)

| Sub-agent | Canon | Output | Route |
|---|---|---|---|
| C4-audit | `admin/admin-audit.jsx` | `components/screens/admin/audit/` | `app/admin/audit/page.tsx` |
| C4-obs | `admin/admin-obs.jsx` | `components/screens/admin/obs/` | `app/admin/obs/page.tsx` |
| C4-support | `admin/admin-support.jsx` | `components/screens/admin/support/` | `app/admin/support/page.tsx` |
| C4-content | `admin/admin-content.jsx` | `components/screens/admin/content/` | `app/admin/content/page.tsx` |
| C4-broadcast | `admin/admin-broadcast.jsx` | `components/screens/admin/broadcast/` | `app/admin/broadcast/page.tsx` |
| C4-login | `admin/admin-login.jsx` | `components/screens/admin/login/` | `app/admin/login/page.tsx` |

## Common rules for ALL admin agents

- **All BFF admin endpoints are missing.** Use the disabled-stub from `apps/web/src/lib/api/admin.ts` for every data fetch. Render canon's loading / empty state.
- **All admin actions** (impersonate, suspend, rollback, kill-switch flip, refund, takedown, oauth rotate, etc.) → flag-gated `ui_admin_<action>_perm` (default OFF) + `toast('admin action: not yet wired')` stub.
- **Admin shell must NOT redirect to non-admin pages on action.** Keep user inside admin context.
- **Tables, filter bars, modal forms** — use C1's `components/admin-ui/` primitives, NOT main `components/ui/` (admin has different visual language per canon).
- **Tests:** snapshot at 1280 width is enough for admin (no mobile responsiveness audit per Phase 5 brief).
- **Flag enforcement:** to enable admin during Phase 5 visual lock, set `ui_admin_panel_perm=ON` in Flipt and rerun snapshots. Default stays OFF for production.

Hard cap 60min per sub-agent (smaller scope than Phase 1).
