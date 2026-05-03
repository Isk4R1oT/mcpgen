# E2E-FINDINGS — Agent C (Gated routes + Dashboard + Auth redirects)

Branch: `feature/ui-rebuild-09.2`
Run: `cd apps/web && node .tmp-e2e/agent-c.mjs > .tmp-e2e/agent-c.log 2>&1`
Result JSON: `apps/web/.tmp-e2e/agent-c-results.json`
Screenshots: `apps/web/.tmp-e2e/screenshots/agent-c-*.png`

Service health at run-time: web=200, bff=200, engine=404 (root only — engine has no `/`), flipt=200.

All 4 UI flags expected OFF in this scenario per Flipt defaults.

---

## Summary table

| Route | Final URL | Doc Status | Title | Heading | Screenshot | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| `/marketplace` | `/marketplace` | **404** | `404: This page could not be found.` | `404` | `agent-c-marketplace.png` | PASS-with-defect | Status correct (404) but body is **default Next.js 404 fallback**, not canon UI. `pageerror: ReferenceError: React is not defined`. |
| `/marketplace/some-slug` | `/marketplace/some-slug` | **404** | `404: This page could not be found.` | `404` | `agent-c-marketplace-slug.png` | PASS-with-defect | Same default-404 + React-not-defined. Doc-resp logged was a follow-up `_next/webpack` 200 (HMR), but initial document was 404 — gate works. |
| `/admin` | `/admin/login` (after 307) | **404** | `404: This page could not be found.` | `404` | `agent-c-admin.png` | PASS-with-defect | `/admin/page.tsx` issues 307 → `/admin/login`, which then 404s when flag OFF. Two-step. Body = default Next 404. |
| `/admin/login` | `/admin/login` | **404** | `404: This page could not be found.` | `404` | `agent-c-admin-login.png` | PASS-with-defect | 404 (flag OFF). Default Next 404 body. **Not** an auth redirect — flag check wins before any auth concern. |
| `/billing` | `https://t3qfgh.logto.app/oidc/auth?...` (after 307→307) | **400** (Logto error JSON) | (empty) | (no h1/h2) | `agent-c-billing.png` | **BLOCKER** | Middleware gates `/billing/:path*` for auth and redirects to `/api/auth/logto/sign-in?redirect_to=/billing` BEFORE the page can run its flag check. Logto then errors `oidc.invalid_redirect_uri` — dev cookie secret empty + redirect URI mismatch. **Flag-OFF 404 contract is bypassed.** |
| `/dashboard` | `https://t3qfgh.logto.app/oidc/auth?...` (after 307→307) | **400** (Logto error JSON) | (empty) | (no h1/h2) | `agent-c-dashboard.png` | **BLOCKER** | Middleware redirect to Logto → Logto returns `invalid_redirect_uri`. User never sees canon DashboardListWrapper. (`logto_jbqn0bfqvu0ealq4y5if4` cookie present in browser but no session). |
| `/login` | `/login` | **404** | `MCPGen` | `404` | `agent-c-login.png` | PASS-with-note | Route does not exist (correct — auth lives at `/api/auth/logto/sign-in`). Title is canon `MCPGen` so the **root layout DID render** here, unlike marketplace/admin/billing. Heading "404" comes from the body, but it's actually still the Next default fallback content wrapped in canon layout. |
| `/auth/login` | `/auth/login` | **404** | `MCPGen` | `404` | `agent-c-auth-login.png` | PASS | Route does not exist; default 404 inside canon layout. |
| `/some-nonexistent-path-xyz` | `/some-nonexistent-path-xyz` | **404** | `MCPGen` | `404` | `agent-c-nonexistent.png` | PASS-with-defect | Default Next.js 404, not a canon-styled 404 page. **There is no `not-found.tsx` defined** anywhere under `apps/web/src/app/`. |

Verdict legend: PASS = behavior matches contract; PASS-with-defect = status correct but UX deviates from canon; PASS-with-note = caveat for awareness; BLOCKER = contract violated.

---

## Finding 1 — `/billing` flag gate is unreachable behind auth middleware

- Symptom: With `ui_billing_active_perm` OFF, direct-nav to `/billing` should produce 404. Instead, the request 307s to `/api/auth/logto/sign-in?redirect_to=/billing`, then 307s again to Logto Cloud, which returns HTTP 400 with body `{"code":"oidc.invalid_redirect_uri","message":"redirect_uri did not match any of the client's registered redirect_uris."}`.
- Evidence:
  - `agent-c-results.json` → `billing.docStatus = 400`, `billing.finalUrl = https://t3qfgh.logto.app/oidc/auth?...`
  - `billing.redirects = ["307 http://localhost:3000/billing -> /api/auth/logto/sign-in?redirect_to=%2Fbilling", "307 ...sign-in... -> https://t3qfgh.logto.app/oidc/auth?..."]`
  - Screenshot `agent-c-billing.png` shows raw Logto JSON error.
- Hypothesis: `apps/web/src/middleware.ts` matches `/billing/:path*` and does the Logto auth check before the page-level flag check in `apps/web/src/app/billing/page.tsx` ever runs. Order of operations precludes the flag from gating the route. Additionally, the dev Logto config has either a missing/invalid `LOGTO_COOKIE_SECRET` or the registered `redirect_uri` in Logto Cloud does not include `http://localhost:3000/callback` — the latter is what the error explicitly says.
- Suggested fix location (NEVER touch canon JSX):
  - `apps/web/src/middleware.ts` lines 62–73 (matcher) + 49–55 (redirect logic) — drop `/billing/:path*` from the protected matcher OR evaluate the flag *inside* the middleware before redirecting; the flag-OFF 404 must win over auth.
  - Or `apps/web/src/lib/route-gate.ts` (`isProtectedPath` / `PROTECTED_PATTERNS`) for the same effect.
  - Logto Cloud client config (out-of-repo): add `http://localhost:3000/callback` to allowed redirect URIs for `client_id=jbqn0bfqvu0ealq4y5if4` — but this is the auth-secret-empty-in-dev caveat the brief said to document, not fix.
- Severity: **blocker** (gated-route contract violated; user without flag can never reach a 404 — instead hits a confusing OIDC error JSON page).

---

## Finding 2 — `/dashboard` redirects to broken Logto OIDC instead of rendering canon DashboardListWrapper

- Symptom: `/dashboard` should render the canon `DashboardListWrapper` (job list view). Instead, hard-redirect chain `/dashboard → /api/auth/logto/sign-in?redirect_to=/dashboard → https://t3qfgh.logto.app/oidc/auth?...` ends with HTTP 400 + `oidc.invalid_redirect_uri`.
- Evidence:
  - `agent-c-results.json` → `dashboard.docStatus = 400`, `dashboard.finalUrl = https://t3qfgh.logto.app/oidc/auth?...`
  - Same redirect-chain pattern as `/billing` above.
  - Cookie `logto_jbqn0bfqvu0ealq4y5if4=WetOj9SHDlLN...` present (Logto session cookie initialized) but the OIDC handshake itself fails because the redirect_uri is not registered.
  - Screenshot `agent-c-dashboard.png` shows raw Logto error.
- Hypothesis: This is the **expected** middleware-gated behavior (`/dashboard/:path*` is in the `PROTECTED_PATTERNS` matcher) — Logto auth is required before render. The breakage is in dev-environment Logto config, not canon. Per the brief, this is a finding to document, not fix in this pass:
  - Either `LOGTO_COOKIE_SECRET` is empty, or
  - The Logto Cloud client (`client_id=jbqn0bfqvu0ealq4y5if4`) has not been configured with `http://localhost:3000/callback` in its registered redirect URIs.
- Suggested fix location (out of QA scope per brief):
  - `apps/web/.env.local` → set non-empty `LOGTO_COOKIE_SECRET`.
  - Logto Cloud admin console → register `http://localhost:3000/callback` for the dev client.
  - `apps/api/.dev.vars` may also need cookie secret coordination (control-plane shares the Logto tenant).
- Severity: **high** (dashboard is the post-auth landing surface; cannot smoke-test it in dev without Logto fix). Architectural side: caller should consider whether DashboardListWrapper should have any anonymous-fallback "please sign in" rendering before the middleware redirect kicks in.

---

## Finding 3 — Default Next.js 404 page is rendered everywhere; no canon `not-found.tsx`

- Symptom: For `/marketplace`, `/marketplace/some-slug`, `/admin`, `/admin/login`, `/some-nonexistent-path-xyz`, the served body is the Next.js built-in 404 fallback (`<html id="__next_error__">` + `<meta name="next-error" content="not-found">`), with title `404: This page could not be found.` and a black-and-white "404 | This page could not be found." stub. There is no canon-styled 404 surface (no MCPGen branding, no canon nav, no canon footer).
- Evidence:
  - `find /Users/igor/Projects/mcpgen/apps/web/src/app -iname 'not-found*'` → 0 hits.
  - Raw HTML from `curl -i http://localhost:3000/marketplace` shows `<html id="__next_error__">` and inline error stub.
  - Title divergence in results JSON: `/marketplace`, `/marketplace/some-slug`, `/admin`, `/admin/login` get title `404: This page could not be found.` (default), whereas `/login`, `/auth/login`, `/some-nonexistent-path-xyz` get title `MCPGen` (root layout applied) — this happens because pages that throw `notFound()` from inside their RSC trigger the global error fallback while pages that simply don't exist hit the layout's catch-all rendering. Either way, no canon 404 component is mounted.
- Hypothesis: Phase 09.2 wiring did not add an `apps/web/src/app/not-found.tsx` (and/or per-segment `not-found.tsx` for marketplace/admin/billing). When `notFound()` is called from a flag-gated page, Next.js falls back to its built-in error page.
- Suggested fix location (NEVER canon JSX — this is wiring):
  - **Add** `apps/web/src/app/not-found.tsx` that renders the canon error/empty-state component (whatever the canon design provides as the "this page does not exist" surface). Per `claude-design-ui/MCP-Gen.zip` the canon may already include a 404 illustration — wrap it in a server component here.
  - Optionally add per-segment `not-found.tsx` under `apps/web/src/app/marketplace/`, `apps/web/src/app/admin/`, `apps/web/src/app/billing/` so flag-OFF 404s render under the gated module's local layout (if any).
- Severity: **medium** (gates work — status code is correct — but UX is broken: agents/users see a non-branded fallback that could be mistaken for a deploy/build failure).

---

## Finding 4 — `ReferenceError: React is not defined` page-error on every default-404

- Symptom: Every route that lands on the default Next 404 raises `ReferenceError: React is not defined` as a `pageerror` event in Playwright, EXCEPT `/billing` and `/dashboard` (which never reach the page render — they bounce to Logto). 7 of 9 routes have this error.
- Evidence:
  - `agent-c-results.json` — `pageErrors: ["ReferenceError: React is not defined"]` on marketplace, marketplace-slug, admin, admin-login, login, auth-login, nonexistent.
  - The error fires on the *client* during hydration of the default 404 fallback.
- Hypothesis: A client component imported by the root layout (or the default `error`/`not-found` boundary) is using JSX without an explicit `import React from 'react'` and the project's `tsconfig`/`jsx` setting is `react-jsx` (automatic runtime), but the bundle for the error fallback is being built with a different/older transform that expects classic runtime — OR a CommonJS require chain is dragging in something compiled with classic JSX. Most likely candidate is a stale `.next/` cache mixing classic+automatic transforms, or a global error/not-found stub somewhere that uses `React.createElement`-style code without importing React.
- Suggested fix location (NEVER canon JSX):
  - `apps/web/next.config.{js,ts,mjs}` — verify `compiler.reactRemoveProperties` or any custom JSX runtime override.
  - `apps/web/tsconfig.json` — confirm `"jsx": "preserve"` (Next default) and `"jsxImportSource"` not set to anything custom.
  - Search for stray `React.createElement` / classic-runtime usage: `rg -n "React\\.createElement" apps/web/src` and `rg -n '"jsx":' apps/web/tsconfig.json`.
  - Likely the eventual fix to Finding 3 (adding canon `not-found.tsx`) sidesteps this — the error stems from the default Next stub, which won't be exercised once a real not-found component exists.
  - Try `rm -rf apps/web/.next` and restart dev — if the error vanishes, it's stale-cache classic-runtime.
- Severity: **medium** (cosmetic in dev, but it pollutes Sentry/console and indicates a real bundler hygiene issue worth tracking).

---

## Finding 5 — `/admin` issues internal 307 → `/admin/login` before the flag gate fires

- Symptom: Direct-nav `/admin` performs a 307 → `/admin/login` then 404. Two-hop instead of single-hop 404 at `/admin`.
- Evidence:
  - `agent-c-results.json` → `admin.redirects = ["307 http://localhost:3000/admin -> /admin/login"]`, `admin.finalUrl = http://localhost:3000/admin/login`, `admin.docStatus = 404`.
- Hypothesis: `apps/web/src/app/admin/page.tsx` (or its `layout.tsx`) does an unconditional `redirect('/admin/login')` BEFORE evaluating `ui_admin_panel_perm`. Or the redirect is happening in a server-side hook that runs before the flag eval. Result is correct (final 404) but the 307 hop is unnecessary work and gives away that `/admin` exists.
- Suggested fix location (wiring, NEVER canon):
  - `apps/web/src/app/admin/page.tsx` — move the flag check (`evaluateBooleanFlag('ui_admin_panel_perm', ...)`) above any `redirect(...)` call; if flag OFF → `notFound()` immediately.
  - `apps/web/src/app/admin/layout.tsx` — same check at the layout boundary so the entire `/admin/*` segment 404s in one hop.
- Severity: **low** (flag gate ultimately works; just leaks an existence-of-route signal via the 307).

---

## Finding 6 — Marketplace HMR follow-up logged as `200` from `_next/webpack` is benign noise

- Symptom: For `/marketplace/some-slug` the `docResponse` field in JSON shows `200 http://localhost:3000/_next/static/webpack/82188ae8471c8be9.webpack.hot-update.json` instead of the document response.
- Evidence: The doc response was actually `404` (status, headers, body all confirm), but the script's `responses[0]` captured the first response object across all requests and the dev-server's HMR ping happened to fire concurrently. The route's actual final document status is 404 (`docStatus` field is correct).
- Hypothesis: Script artifact, not an app bug. Dev `next dev` HMR injects webpack-update polls at idle.
- Suggested fix location: `apps/web/.tmp-e2e/agent-c.mjs` — filter `_next/static/webpack` URLs from `responses[]` before picking `[0]`. Non-load-bearing for findings.
- Severity: **low** (script reporting only; data integrity preserved via `docStatus`).

---

## Auth dev-environment caveat (per brief — document not fix)

- `LOGTO_COOKIE_SECRET` empty in dev → cookie cannot be encrypted/decrypted reliably, so the Logto session cycle is fragile.
- Logto Cloud client `jbqn0bfqvu0ealq4y5if4` does not have `http://localhost:3000/callback` registered, evidenced by every `/api/auth/logto/sign-in` flow ending in `400 oidc.invalid_redirect_uri`. The Logto error message is unambiguous.
- Affected surfaces: `/dashboard`, `/billing`, and any future `/generate/:jobId/playground|download|deploy/permanent` per `middleware.ts` matcher.
- Per brief: not solving auth in this pass. Findings 1 and 2 above describe the symptom; remediation is in Logto Cloud admin + `.env.local`, not in canon JSX.

---

## Files touched by Agent C (and only these)

- `apps/web/.tmp-e2e/agent-c.mjs` (new)
- `apps/web/.tmp-e2e/agent-c.log` (run output)
- `apps/web/.tmp-e2e/agent-c-results.json` (structured run data)
- `apps/web/.tmp-e2e/screenshots/agent-c-*.png` (9 screenshots)
- `.planning/ui-rebuild-sandbox/E2E-FINDINGS-agent-c.md` (this file)

No canon JSX touched. No code under `apps/web/src/` modified.
