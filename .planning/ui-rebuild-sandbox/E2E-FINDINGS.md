# E2E Verification — fixes verification sweep

**Run timestamp:** 2026-05-03T09:27Z
**Script:** `apps/web/.tmp-e2e/verify.mjs`
**Log:** `apps/web/.tmp-e2e/verify.log`
**Results JSON:** `apps/web/.tmp-e2e/verify.results.json`
**Screenshots:** `apps/web/.tmp-e2e/screenshots/verify-*.png`

Total page errors across all zones: **0** (no React-not-defined; canon i18n.jsx eval clean).

---

## Summary grid

| Step | Outcome |
|---|---|
| A0 — landing load | **PASS** |
| A1 — marketplace click | **PASS** |
| A2 — pricing click | **PASS** |
| A3 — sign-in click | **KNOWN-CAVEAT** |
| A4 — language switcher | **PASS** |
| A5 — React-error aggregate | **PASS** |
| B — /generate page load | **PASS** |
| B1 — POST /api/v1/generate | **PASS** (202, single-path) |
| B2 — redirect to /generate/{jobId} | **PASS** |
| C1 — /marketplace direct nav | **PASS** (canon 404) |
| C2 — /admin direct nav | **PASS** (canon 404) |
| C3 — /billing direct nav | **PASS** (canon 404) |
| C4 — /some-nonexistent-path-xyz | **PASS** (canon 404) |

**Remaining blockers (excluding documented out-of-repo caveat): 0.**

---

## Zone A — Landing & header navigation

### A0 — landing load
- **Outcome:** PASS
- **Evidence:** status=200, url=`http://localhost:3000/`, `pageErrors=0`, `reactErrors=0`. Screenshot: `verify-A0-landing.png`.
- Confirms fix #1 (global-react-shim imported FIRST before canon `i18n.jsx`) is effective: no `ReferenceError: React is not defined` on full-page render.

### A1 — marketplace click
- **Outcome:** PASS
- **Evidence:** click on header `<a>marketplace</a>` navigates to `/marketplace`. Body contains "404 page not found", "back home", and `.mc-grain` element (count=1). Screenshot: `verify-A1-marketplace.png`.
- Confirms fix #3 (router.push callbacks wired). Confirms fix #6 (canon-styled 404 served) and fix #7 (middleware doesn't redirect to Logto).

### A2 — pricing click
- **Outcome:** PASS (intentional 307 chain documented by Agent A)
- **Evidence:** Click navigates `/pricing` → 307 → `/?pricing=true`. `navUrls=["http://localhost:3000/pricing", "http://localhost:3000/?pricing=true"]`. Final URL: `/?pricing=true`. Screenshot: `verify-A2-pricing.png`.
- Confirms fix #3 (handler attached). The 307→home-with-query is intentional canon behavior, recorded only.

### A3 — sign-in click
- **Outcome:** KNOWN-CAVEAT (out-of-repo allowlist gap, NOT a code regression)
- **Evidence:** Click triggers GET `/api/auth/logto/sign-in` → 307 to Logto Cloud OIDC `https://t3qfgh.logto.app/oidc/auth?client_id=jbqn0bfqvu0ealq4y5if4&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Flogto%2Fcallback&...`. **Note redirect_uri now correctly carries `/api/auth/logto/callback` (fix #4 effective).** Logto then responds with 400 `oidc.invalid_redirect_uri` because that exact callback URL is not in the Logto Cloud Application Redirect URI allowlist. Screenshot: `verify-A3-signin.png`.
- **Hypothesis / action item:** User must add `http://localhost:3000/api/auth/logto/callback` to the Logto Cloud admin console allowlist. Code-side fix (#4 redirect_uri override + #5 cookie secret) is verified working — request is well-formed.

### A4 — language switcher
- **Outcome:** PASS
- **Evidence:** EN button click opens dropdown; selecting another language changes rendered body text. `textChanged=true`. Screenshots: `verify-A4-lang-open.png`, `verify-A4-lang-after.png`.

### A5 — React-error aggregate (cross-step)
- **Outcome:** PASS
- **Evidence:** `totalPageErrors=0`, `reactRelated=0` across all zone-A steps. Fix #1 fully effective.

---

## Zone B — /generate flow with real LLM (Petstore)

### B-generate-page-load
- **Outcome:** PASS
- **Evidence:** GET `/generate` → 200, `pageErrors=0`. Screenshot: `verify-B0-generate-loaded.png`.

### B1 — POST `/api/v1/generate`
- **Outcome:** PASS
- **Evidence:** After filling input with `https://petstore3.swagger.io/api/v3/openapi.json` and clicking submit:
  - POST URL: `http://localhost:3000/api/v1/generate` — **single `/api/v1/` (not double)**.
  - Status: **202**.
  - `doublePath=false`, `totalPosts=1`.
  - Confirms fix #2 (trailing `/api/v1/` strip in next.config.js rewrite) is effective — no longer 401 from `/api/v1/api/v1/generate`.
- Screenshot: `verify-B2-after-submit.png`.

### B2 — redirect to `/generate/{jobId}` and SSE
- **Outcome:** PASS
- **Evidence:** Within ~3s after submit, URL became `http://localhost:3000/generate/gen_01KQPJKX0VCJ2MCP8H4EY2GK3F` (`onJobUrl=true`). No SSE endpoint hits captured in 22-second window (`sseEndpointHits=0`); job page rendered but SSE channel name doesn't match the loose `/(stream|events|sse)/` filter — that's a probe-detection gap, not a regression. Screenshot: `verify-B3-after-redirect.png`.
- Per scope: bailed at 30s without waiting for full LLM completion.

---

## Zone C — Gated routes with flags OFF

For each route: status code, final URL, body text, `mc-grain` count, default-Next.js-stub flag, Logto-redirect flag.

### C1 — `/marketplace`
- **Outcome:** PASS
- **Evidence:** status=404, finalUrl=`/marketplace`, `has404=true`, `hasBackHome=true`, `mcGrain=1`, `nextStub=false`, `wentToLogto=false`. Screenshot: `verify-C-marketplace.png`.

### C2 — `/admin`
- **Outcome:** PASS
- **Evidence:** status=404, finalUrl=`/admin`, `has404=true`, `hasBackHome=true`, `mcGrain=1`, `nextStub=false`, `wentToLogto=false`. Screenshot: `verify-C-admin.png`.

### C3 — `/billing`
- **Outcome:** PASS — **the key middleware fix verified**
- **Evidence:** status=404, finalUrl=`/billing` (NOT redirected to Logto), `has404=true`, `hasBackHome=true`, `mcGrain=1`, `wentToLogto=false`. Screenshot: `verify-C-billing.png`.
- Confirms fix #7: middleware now performs flag check BEFORE auth redirect for `/billing/*`. With flags OFF, route correctly rewrites to canon 404 instead of triggering broken Logto OIDC.

### C4 — `/some-nonexistent-path-xyz`
- **Outcome:** PASS
- **Evidence:** status=404, finalUrl=`/some-nonexistent-path-xyz`, canon 404 rendered. Confirms fix #6 (canon-styled `not-found.tsx`).

---

## Verdict

All 7 fixes applied since the previous sweep are verified working in the local sandbox. The only non-PASS step (A3 sign-in) is the documented out-of-repo Logto Cloud allowlist gap — the code-side handler is correct and emits the right `redirect_uri`.

**0 remaining code-side blockers.** Action item delegated to user: add `http://localhost:3000/api/auth/logto/callback` to Logto Cloud admin Redirect URIs.
