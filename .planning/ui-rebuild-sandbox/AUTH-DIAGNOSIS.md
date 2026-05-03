# Logto Auth Diagnosis — `feature/ui-rebuild-09.2`

**Date:** 2026-05-03
**Reproducer:** `GET http://localhost:3000/dashboard` → 307 → `/api/auth/logto/sign-in?redirect_to=/dashboard` → 307 → `https://t3qfgh.logto.app/oidc/auth?...` → **HTTP 400 `oidc.invalid_redirect_uri`**

---

## 1. What is actually being sent to Logto

`curl -sv 'http://localhost:3000/api/auth/logto/sign-in?redirect_to=%2Fdashboard'` returns this `Location` (verbatim, decoded):

```
https://t3qfgh.logto.app/oidc/auth
  ?client_id=jbqn0bfqvu0ealq4y5if4
  &redirect_uri=http://localhost:3000/callback         <-- ⚠ THE PROBLEM
  &code_challenge=dSJKGHwdyUlWIzBPj-2Jiqi-qV-SZa365LPTH0KRcR0
  &code_challenge_method=S256
  &state=utsGTwUL...
  &response_type=code
  &prompt=consent
  &scope=openid+offline_access+profile
```

`Set-Cookie: logto_jbqn0bfqvu0ealq4y5if4=...` is issued (so the SDK is alive — pre-authorize PKCE state cookie).

## 2. Why the SDK sends `/callback` (not `/api/auth/logto/callback`)

`@logto/next@4.2.10` `signIn(config, options)` source
(`node_modules/.pnpm/@logto+next@4.2.10_.../@logto/next/lib/server-actions/index.js:7`):

```js
const finalOptions = typeof options === 'string' || options === undefined
    ? { redirectUri: options ?? `${config.baseUrl}/callback`, interactionMode }
    : options;
```

So the SDK default redirectUri is **`${baseUrl}/callback`**.

Our code never overrides it:

| File | Behavior |
|---|---|
| `apps/web/src/app/api/auth/logto/sign-in/route.ts:13` | `await signIn(logtoConfig);` — no second arg → SDK default `http://localhost:3000/callback` |
| `apps/web/src/app/api/auth/logto/sign-up/route.ts:16-19` | `signIn(logtoConfig, { firstScreen: 'register' })` — second arg is an OBJECT, so `finalOptions = options` directly. **No `redirectUri` field is included** → `nodeClient.signIn()` falls back to its own default (also `${baseUrl}/callback` per Logto Node SDK convention). The `firstScreen` hint passes through. |
| `apps/web/src/app/api/auth/logto/callback/route.ts` | Handler is mounted at **`/api/auth/logto/callback`** — never visited because Logto returns 400 first, and even if it succeeded the user would land at `/callback` which has no handler (404). |

## 3. What the Logto Cloud client `jbqn0bfqvu0ealq4y5if4` likely has registered

We cannot read the admin console from here, but the planning doc
`.planning/phases/07-frontend-wire-up/07-02-PLAN.md:55` says:

> "Register redirect URI `http://localhost:3000/api/auth/logto/callback` in Logto Cloud Admin → Applications → MCPGen Web → Redirect URIs"

So the **design intent** was `/api/auth/logto/callback`. The HTTP 400 proves Logto Cloud's allowlist does NOT contain `http://localhost:3000/callback`. Either:

- The admin actually registered the long path per the plan, and the code is wrong (forgot to override the SDK default) → **most likely**
- Or the admin registered nothing matching → we still need to fix one side

## 4. `LOGTO_COOKIE_SECRET` — separate latent bug, NOT the cause of the 400

`.env.local` does **not** set `LOGTO_COOKIE_SECRET`. `apps/web/src/lib/logto/client.ts:50,67` substitutes the placeholder string `"mcpgen-build-placeholder-do-not-use-in-prod-x"` (45 chars) so `CookieStorage` doesn't throw. This is the reason the pre-authorize cookie is being issued at all (otherwise SDK init would crash). But when the callback runs, the SDK will try to **decrypt** the PKCE state cookie with this placeholder — fine for round-trip in a single dev session, but it's a wrong-shape secret (Logto wants 32+ random bytes, base64url) and it short-circuits security guarantees. Once the redirect_uri is fixed, this will probably *work* in dev but it should be set correctly.

## 5. Tenant + client_id consistency check

| Source | Endpoint | App ID |
|---|---|---|
| `.env.local:33-34` | `https://t3qfgh.logto.app/` | `jbqn0bfqvu0ealq4y5if4` |
| Outbound URL (curl) | `https://t3qfgh.logto.app/oidc/auth?client_id=jbqn0bfqvu0ealq4y5if4&...` | matches |
| Cookie name | `logto_jbqn0bfqvu0ealq4y5if4` | matches |

✅ Tenant + client_id are consistent. The 400 is purely about the redirect_uri allowlist.

## 6. Diagnosis (root cause, ranked)

1. **PRIMARY CAUSE — redirect_uri mismatch.** Code ships SDK default `http://localhost:3000/callback`; Logto Cloud client expects (per planning) `http://localhost:3000/api/auth/logto/callback`. The 400 fires before any cookie/secret logic matters.
2. **LATENT BUG — empty `LOGTO_COOKIE_SECRET`.** Will not cause the 400, but lights up after the redirect_uri is fixed: SDK uses 45-char placeholder, callback decryption is technically working but insecure and not what the secret is supposed to be.
3. **No other issue.** Tenant, client_id, app secret, baseUrl are all internally consistent.

---

## 7. Recommended fix split

### A. Fixable in repo (env + 2 lines of code)

| # | Change | File | Why |
|---|---|---|---|
| A1 | Pass explicit `redirectUri` to `signIn`. Replace `await signIn(logtoConfig);` with `await signIn(logtoConfig, ` `${process.env.LOGTO_BASE_URL}/api/auth/logto/callback` `);` | `apps/web/src/app/api/auth/logto/sign-in/route.ts:13` | SDK default is `/callback`; we ship handler at `/api/auth/logto/callback`. Force the SDK to use OUR path. |
| A2 | Pass explicit `redirectUri` alongside `firstScreen` in sign-up. Change the options object to `{ redirectUri: ` `${process.env.LOGTO_BASE_URL}/api/auth/logto/callback` `, firstScreen: 'register' }`. | `apps/web/src/app/api/auth/logto/sign-up/route.ts:16-19` | Same reason; the typed object form bypasses the default branch in the SDK so we must supply the field ourselves. |
| A3 | Set `LOGTO_COOKIE_SECRET` in `.env.local` (32+ random bytes, base64url): `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` then add `LOGTO_COOKIE_SECRET=<output>` to `.env.local` (after line 36). | `/Users/igor/Projects/mcpgen/.env.local` | The placeholder works in dev but is documented in `client.ts:48-50` as "loud-fail at first auth attempt"; better to set a real one to unmask any future secret-related bug. Required by `apps/web/.env.example:17-19`. |
| A4 | (Optional but cleaner) Centralize the callback path as `LOGTO_REDIRECT_URI` const in `apps/web/src/lib/logto/client.ts` and import in both routes, so it's single-sourced. | `apps/web/src/lib/logto/client.ts` | DRY; avoids future drift between sign-in and sign-up routes. |

### B. Requires Logto Cloud admin console (out-of-repo, manual)

Console URL: `https://cloud.logto.io/` → Sign in → tenant `mcpgen-dev` → Applications → app `jbqn0bfqvu0ealq4y5if4` (likely named "MCPGen Web") → **"Redirect URIs"** field.

| # | Action | Field | Value | Why |
|---|---|---|---|---|
| B1 | **Verify** what's currently in the Redirect URIs allowlist | "Redirect URIs" | (read existing list) | Confirms whether plan's `/api/auth/logto/callback` was actually registered or not. |
| B2 | **Add** (or ensure present) `http://localhost:3000/api/auth/logto/callback` | "Redirect URIs" | `http://localhost:3000/api/auth/logto/callback` | After fix A1+A2 the SDK will send this exact value; must be allowlisted. |
| B3 | (Sanity) **Add** `http://localhost:3000/callback` as a fallback during transition (optional, can remove after A1/A2 ship) | "Redirect URIs" | `http://localhost:3000/callback` | Lets the current code keep working until A1/A2 lands; remove afterwards to keep the allowlist tight. |
| B4 | **Add** Post Sign-out Redirect URI: `http://localhost:3000/` | "Post Sign-out Redirect URIs" | `http://localhost:3000/` | `signOut` route redirects user back to landing — needs allowlisting too (will fail similarly if missing, but only after sign-in works). |
| B5 | Click **"Save changes"** | — | — | Logto Cloud applies allowlist diffs immediately. |

### C. Optional dev-UX improvements

| # | Change | Why |
|---|---|---|
| C1 | Add `assertLogtoConfigValid()` call at the top of each route handler (`sign-in`, `sign-up`, `callback`, `sign-out`) when `NODE_ENV !== 'production'`. | `client.ts:79-86` already exports the helper but never runs it. Would surface "missing `LOGTO_COOKIE_SECRET`" as a 500 with a useful message instead of silently using the placeholder. |
| C2 | Improve `console.warn` in `client.ts:55-60` to also log the *configured* `redirectUri` once, e.g. on first call, so the dev sees in the terminal exactly what's about to be sent to Logto. | Would have caught this bug in seconds. |
| C3 | Add a Playwright E2E that hits `/dashboard` with no session and asserts the resulting `Location` Logto URL contains `redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Flogto%2Fcallback`. | Pure regression guard against this exact mismatch. |

---

## 8. Suggested order of operations

1. **B1** — verify what's actually registered in Logto Cloud (1 min, decides whether the bug is in code or in admin console or both).
2. **A3** — set `LOGTO_COOKIE_SECRET` in `.env.local` (1 min).
3. **A1 + A2** — patch the two route handlers to pass an explicit `redirectUri`. Restart `pnpm dev`.
4. **B2** — ensure `http://localhost:3000/api/auth/logto/callback` is in the allowlist.
5. **B4** — add post-sign-out URL while you're in the console.
6. Re-test `curl -I http://localhost:3000/dashboard` → should now follow through to Logto's email/GitHub picker, not 400.
7. Optional: C1, C3.
