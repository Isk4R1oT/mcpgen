# E2E QA Agent B — /generate flow findings

Branch: `feature/ui-rebuild-09.2`
Date: 2026-05-03
Spec used: `https://petstore3.swagger.io/api/v3/openapi.json`
Probe target: `http://localhost:3000/generate` → BFF :8787 → engine :8000

Services confirmed up before testing:
- web :3000 → 200 on `GET /`
- BFF :8787 → 200 on `GET /health`
- engine :8000 → 200 on `GET /health`
- Flipt :8090 → 200 on `GET /health`

Run artifacts:
- Script: `apps/web/.tmp-e2e/agent-b.mjs`
- Log: `apps/web/.tmp-e2e/agent-b.log`
- Screenshots: `apps/web/.tmp-e2e/screenshots/agent-b-*.png` (4 frames: after-nav, after-paste, after-submit, on-error/on-stream)

---

## Issue 1 — `POST /api/v1/generate` always returns 401 from the browser
**Severity: blocker**

### Symptom
After the user pastes a valid OpenAPI URL on `/generate` and clicks "make it",
the browser fires `POST /api/v1/generate` and unconditionally receives
`401 {"error":"unauthorized","reason":"missing_bearer"}`. The flow toast bus
surfaces `"Unexpected error (HTTP 401) — see browser console for details."`,
the URL stays on `/generate`, no redirect to `/generate/{jobId}` happens, and
SSE is never opened. Anonymous hero flow (the entire 60-second promise) is
broken.

### Step
- Navigate to `http://localhost:3000/generate`.
- Paste `https://petstore3.swagger.io/api/v3/openapi.json` into `.mc-stamp input`.
- Click `.mc-btn.mc-btn-primary` ("make it").
- Network log: `POST http://localhost:3000/api/v1/generate -> 401`.

### Evidence
```
[2026-05-03T09:00:15.785Z] primary button text: "make it"
[2026-05-03T09:00:15.790Z] primary button visible: true enabled: true
[2026-05-03T09:00:15.826Z] [request] POST http://localhost:3000/api/v1/generate
[2026-05-03T09:00:15.846Z] [console.error] Failed to load resource: 401 (Unauthorized)
[2026-05-03T09:00:15.850Z] [response] 401 http://localhost:3000/api/v1/generate
            body={"error":"unauthorized","reason":"missing_bearer"}
[2026-05-03T09:00:15.851Z] [console.info] [mcp-toast] Unexpected error (HTTP 401)…
[2026-05-03T09:00:26.217Z] url after click: http://localhost:3000/generate  navigated: false
```

The same request, hitting the BFF directly, returns **202 Accepted**:
```
$ curl -X POST http://localhost:8787/api/v1/generate \
       -H 'Content-Type: application/json' \
       -H 'Idempotency-Key: gen_01HZZZZZZZZZZZZZZZZZZZZZZZ' \
       -d '{"spec_url":"https://petstore3.swagger.io/api/v3/openapi.json"}'
{"job_id":"gen_01KQPH4JGVKKMXPR1NMTMCKMAE","sse_url":"http://localhost:8787/api/v1/jobs/gen_01KQPH4JGVKKMXPR1NMTMCKMAE/stream",...}
HTTP=202
```

### Root cause (high confidence)
`MCPGEN_BFF_URL` is set in the Next.js dev shell to
`http://localhost:8787/api/v1` (verified via `ps eww 49210`):

```
… MCPGEN_BFF_URL=http://localhost:8787/api/v1 …  npm_lifecycle_script=next dev
```

In `apps/web/next.config.js` (lines 25, 39–48):
```js
const BFF_PROXY_TARGET = process.env.MCPGEN_BFF_URL || 'http://localhost:8787';
…
async rewrites() {
  return {
    beforeFiles: [
      { source: '/api/v1/:path*',
        destination: `${BFF_PROXY_TARGET}/api/v1/:path*` },
    ],
  };
}
```

With the env var set, this expands to:
- source: `/api/v1/:path*`
- destination: `http://localhost:8787/api/v1/api/v1/:path*` (the `/api/v1` is doubled)

Confirmed by direct probe — hitting the doubled path on the BFF reproduces the
exact 401 we get through the proxy:
```
$ curl -X POST http://localhost:8787/api/v1/api/v1/generate -d '{...}'
{"error":"unauthorized","reason":"missing_bearer"}
HTTP=401
```

Why 401 instead of 404: the BFF mounts `app.route('/api/v1/generate', generateRoute)`
on the public app (anon-allowed) and `app.route('/api/v1', protectedApp)` as a
catch-all (`apps/api/src/index.ts:187` and `:236`). `/api/v1/api/v1/generate`
does not match the public mount, so it falls into `protectedApp`, hitting
`authMiddleware` → `missing_bearer` (`apps/api/src/middleware/auth.ts:53`).

The same flaw breaks every `/api/v1/*` request from the browser — verified for
`GET /api/v1/jobs/foo` (200 direct, 401 through Next).

### Suggested fix locations (do NOT touch canon)
Pick **one** of:

1. **Preferred — single source of truth for the proxy target:**
   `apps/web/next.config.js:25`
   ```diff
   - const BFF_PROXY_TARGET = process.env.MCPGEN_BFF_URL || 'http://localhost:8787';
   + // MCPGEN_BFF_URL may include or omit the /api/v1 suffix because
   + // apps/web/src/lib/fixture-mode/index.ts:getBffUrl() expects it included.
   + // Strip a trailing /api/v1 here so the rewrite never path-doubles.
   + const RAW = process.env.MCPGEN_BFF_URL || 'http://localhost:8787';
   + const BFF_PROXY_TARGET = RAW.replace(/\/api\/v1\/?$/, '');
   ```
   Mirror the same normalization in any other file that consumes
   `MCPGEN_BFF_URL` — currently `apps/web/src/lib/fixture-mode/index.ts:70`
   (`getBffUrl()`), but that function is dead code while the rewrite is
   active (`beforeFiles` runs before route handlers).

2. **Alternative — fix the dev shell:** unset `MCPGEN_BFF_URL` so the rewrite
   uses its `'http://localhost:8787'` fallback. Document in
   `apps/web/.env.example` that `MCPGEN_BFF_URL` must NOT include `/api/v1`
   when using `next dev`. Keep `getBffUrl()` callers (route handlers) updated
   to stop appending `/api/v1` themselves, or wire two distinct env vars.

3. **Optional cleanup:** since `beforeFiles` rewrites unconditionally swallow
   `/api/v1/*`, the route handlers under
   `apps/web/src/app/api/v1/{generate,jobs/[jobId]/...}/route.ts` are
   currently dead code in dev. Either delete them or move the rewrite to
   `afterFiles` so the handlers run as documented (their cookie-only
   forwarding still has no Bearer attached, so they would still 401 — the
   anon-aware BFF flow is the right path).

### Files for the fixer
- `apps/web/next.config.js` (rewrite target)
- `apps/web/src/lib/fixture-mode/index.ts` (getBffUrl callers)
- `apps/web/.env.example` (document expected shape of `MCPGEN_BFF_URL`)
- DO NOT edit `apps/api/src/...`, the BFF behaviour is correct.
- DO NOT edit any canon JSX.

---

## Issue 2 — `React is not defined` pageerror at first paint of `/generate`
**Severity: medium** (not user-blocking — page recovers on its own dynamic-import retry)

### Symptom
Within ~150 ms of `domcontentloaded`, the browser logs an uncaught
`ReferenceError: React is not defined` originating from `i18n.jsx:967` while
webpack is still wiring `lib/jsx-bridge/loader.ts`. Sentry will surface this
as a real error in production. The page nevertheless renders correctly within
~3–4 s once the dynamic-imported wrapper re-evaluates.

### Step
- Navigate to `http://localhost:3000/generate`.
- Observe pageerror in the console; observe screenshot `agent-b-1-after-nav.png`
  briefly empty before the canvas paints.

### Evidence
```
[pageerror] React is not defined
[pageerror.stack]
  ReferenceError: React is not defined
    at eval (webpack-internal:///(app-pages-browser)/./src/i18n.jsx:967:21)
    at (app-pages-browser)/./src/i18n.jsx (chunks/app/layout.js:331:1)
    …
    at eval (webpack-internal:///(app-pages-browser)/./src/lib/jsx-bridge/loader.ts:13:63)
    …
    at eval (webpack-internal:///(app-pages-browser)/./src/lib/jsx-bridge/index.ts:22:65)
```
Probe **after** 4-second dwell shows recovery:
```
[page-probe] {"hasReact":"object","hasReactDOM":"object","hasLanding":"function",
              "hasMCPTokens":"object","hasUseI18n":"function","hasI18nProvider":"function",
              "hasSampleApis":0, "domInputCount":1,"domButtonCount":6, …}
```

### Hypothesis on root cause
ESM static-import hoisting in
`apps/web/src/lib/jsx-bridge/loader.ts`. The file does:

```ts
import * as React from 'react';                      // hoisted
import * as ReactDOM from 'react-dom/client';        // hoisted
…
import '@/i18n';                                     // hoisted — runs first
…
if (typeof window !== 'undefined') {                  // body — runs LAST
  globalThis.React = React;                          // never reached in time
  globalThis.ReactDOM = ReactDOM;
}
```

`@/i18n` (and the screen-*.jsx that follow) reference the bare global
`React`. Because ES module evaluation runs all dependency modules before the
host module's body, the `globalThis.React = React` assignment hasn't happened
yet when `i18n.jsx` evaluates — hence the ReferenceError. The page recovers
later because Next's React Refresh / dynamic-import wrapper re-enters the
loader, by which time the assignments stuck.

### Suggested fix location (do NOT touch canon)
- `apps/web/src/lib/jsx-bridge/loader.ts` — lift the `globalThis.React = …`
  / `globalThis.ReactDOM = …` assignment OUT of the conditional and OUT of
  the module body and into a **side-effect-only** helper module imported
  FIRST. Example:

  Create `apps/web/src/lib/jsx-bridge/_globals.ts`:
  ```ts
  'use client';
  import * as React from 'react';
  import * as ReactDOM from 'react-dom/client';
  if (typeof window !== 'undefined') {
    (globalThis as any).React = React;
    (globalThis as any).ReactDOM = ReactDOM;
  }
  ```

  Then in `loader.ts`, replace the current React/ReactDOM imports + the
  `if (typeof window…)` block with a single first import:
  ```ts
  import './_globals';      // side-effect — sets globalThis.React FIRST
  import '@/tokens';
  import '@/ui';
  import '@/i18n';
  …
  ```

  ESM guarantees `_globals.ts` is fully evaluated (including its body) before
  any subsequent import in `loader.ts` is resolved. That eliminates the race.

### Files for the fixer
- `apps/web/src/lib/jsx-bridge/loader.ts` (edit)
- `apps/web/src/lib/jsx-bridge/_globals.ts` (new file)
- DO NOT touch any canon JSX (`screen-*.jsx`, `i18n.jsx`, `ui.jsx`, etc.).

---

## Issue 3 — `<Btn>` inside the canvas form fires both form submit and onClick
**Severity: low** (currently masked by Issue 1; will surface as duplicate POST when 1 is fixed)

### Symptom
The canon `screen-landing.jsx` renders a primary button via the canon
`<Btn>` component inside `<form onSubmit={handleSubmit}>`. The wrapper passes
the same `onMakeIt` to both the form's `onSubmit` and the button's `onClick`.
Because canon `<Btn>` (`ui.jsx:64`) renders a plain `<button>` with **no
`type` attribute**, the browser defaults to `type="submit"`. Clicking the
button therefore triggers (a) the button's `onClick={onMakeIt}` and
(b) `form.onSubmit -> e.preventDefault(); onMakeIt()` — i.e. `onMakeIt` runs
twice. Today this is hidden because both calls fail at the BFF (Issue 1);
once Issue 1 is fixed, the user will see a duplicate `POST /api/v1/generate`
(the second call lands on a stale idempotency-key bucket and produces a
second job-id, splitting telemetry and triggering anon-rate-limit faster).

### Step
- (Will be observable once Issue 1 is fixed.) Click "make it" once on
  `/generate` → two `POST /api/v1/generate` requests in DevTools network
  panel.

### Evidence
- `claude-design-ui/MCPGen-extracted/ui.jsx:64`: button has no `type`.
- `claude-design-ui/MCPGen-extracted/screen-landing.jsx:51,61`: form +
  in-form Btn both routed to `onMakeIt`.
- `apps/web/src/app/generate/_canvas-client.tsx:67-78,92-101`: passes the
  same `onMakeIt` callback to the wrapper, no debounce.

### Hypothesis on root cause
Locked canon — the design predates the wiring. The wiring side hasn't
debounced or guarded against double-call.

### Suggested fix location (do NOT touch canon)
`apps/web/src/app/generate/_canvas-client.tsx` — wrap `onMakeIt` in a guard
that no-ops while a submission is already in flight:
```ts
const inFlight = useRef(false);
const onMakeIt = useCallback(async () => {
  if (inFlight.current || loading) return;       // <- new guard
  inFlight.current = true;
  try { … existing body … }
  finally { inFlight.current = false; }
}, [router, urlText, loading]);
```
Cheaper alternative: keep using the existing `loading` state to short-circuit
(line 95 already does `loading ? noop : onMakeIt`, but `loading` only flips
to true AFTER the first await — both calls happen synchronously on click
before then, so the noop swap doesn't help; the ref guard above is
synchronous and stops the double-fire).

### Files for the fixer
- `apps/web/src/app/generate/_canvas-client.tsx`
- DO NOT modify `claude-design-ui/MCPGen-extracted/ui.jsx` to add `type="button"`.

---

## Out of scope here (Agent B did not investigate)
- Logto sign-in / dashboard / billing / marketplace flows — Agent A/C scope.
- SSE event timeline rendering — could not reach the stream page because of
  Issue 1.
- `/generate/[jobId]/preview|quality|deploy|playground` route shells.

## Bottom-line
The only thing keeping the entire anonymous hero flow dead is the
`MCPGEN_BFF_URL` path-doubling in the dev rewrite (Issue 1). Fixing it is a
~3-line change in `apps/web/next.config.js`. Issues 2 and 3 are quality
bugs that a real user would also hit, but neither blocks the demo path.
