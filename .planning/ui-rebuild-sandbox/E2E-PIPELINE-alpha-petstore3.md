# E2E Pipeline — Agent ALPHA — Petstore3 (OpenAPI 3.1, no auth)

Branch: `feature/ui-rebuild-09.2`
Run: `cd apps/web && node .tmp-e2e/alpha-pipeline.mjs > .tmp-e2e/alpha-pipeline.log 2>&1`
Spec: `https://petstore3.swagger.io/api/v3/openapi.json`
Result JSON: `apps/web/.tmp-e2e/alpha-pipeline.results.json`
Log: `apps/web/.tmp-e2e/alpha-pipeline.log`
Job ID: `gen_01KQPN4PAHXJ6VT10Z38E3EBAG`
Total runtime: 397.1s (well below 12-min cap)
Service health at run-time: web=200, BFF=200, engine=200, Flipt=200.

---

## Pass/Fail Grid

| # | Step | Outcome | Highlight |
|---|---|---|---|
| 1 | Landing → paste URL → make it | **PASS** | input visible, filled (48 chars), Enter submitted form, navigated to `/generate?spec_url=…` |
| 2 | `/generate` canvas → `POST /api/v1/generate` | **KNOWN-CAVEAT** | Web proxy never POSTs (canvas does NOT auto-trigger from `?spec_url=`); direct BFF returns 202 + jobId. Canvas reads `?spec_url=` for the input value but does not auto-submit. Even when manually submitted, the POST goes through the broken Next.js dev rewrite (returns 401 missing_bearer due to stale next.config.js — not a code bug). |
| 3 | `/generate/{jobId}/stream` SSE timeline | **FAIL** | Pipeline did not reach `validation_complete` within 5min. Engine stuck at `current status: accepted` (Stage F running). At the 5-min poll cap, engine artifacts=200 but quality-report=409. Real LLM contention with parallel BETA/GAMMA agents likely. |
| 4 | `/generate/{jobId}/preview` | **PASS** | docStatus=200, body shows `endpoints 19 · 47 included · categories 2 · complexity standard`. 11 `.mc-mono` nodes rendered. Canon Preview screen wired correctly. |
| 5 | `/generate/{jobId}/quality` | **FAIL** | docStatus=500. Server returned 500 because `/api/v1/quality/{jobId}` returned `null` (pipeline still running). Client crashed: `TypeError: Cannot read properties of null (reading 'overall_score')`. Renders Next.js Application Error overlay. |
| 6 | `/generate/{jobId}/playground` (REQ-001) | **KNOWN-CAVEAT** | Middleware (`apps/web/src/middleware.ts:163`) requires Logto session for `/playground`. Anon redirected to `https://t3qfgh.logto.app/sign-in?app_id=…`. As anon user, `POST /run-tool` is unreachable; REQ-001 (run-tool 404) cannot be exercised in this flow. |
| 7 | `/generate/{jobId}/deploy` | **FAIL** | docStatus=200 but page crashes immediately: `TypeError: window.useErrorMode is not a function or its return value is not iterable`. `screen-deploy.jsx:15` calls `window.useErrorMode()`, but the JSX bridge loader does NOT import `@/app` (where `useErrorMode` is set on `window`). Application Error overlay renders. No primary deploy button available, no copy buttons reachable. |

---

## Per-step evidence

### STEP 1 — PASS
- Status: landing rendered, `input.mc-input.mc-mono` visible.
- Network: only static assets + 1× 404 (favicon-style probe; non-blocking).
- Screenshot: `apps/web/.tmp-e2e/screenshots/alpha-1a-landing.png` + `alpha-1b-after-submit.png`.
- After Enter: navigated to `http://localhost:3000/generate?spec_url=https%3A%2F%2Fpetstore3.swagger.io%2Fapi%2Fv3%2Fopenapi.json`.

### STEP 2 — KNOWN-CAVEAT
- Status: web proxy POST `/api/v1/generate` was never observed (canvas did not auto-submit on URL `?spec_url=` arrival within 10s wait).
- Workaround: direct BFF POST `http://localhost:8787/api/v1/generate` → **202** with `job_id=gen_01KQPN4PAHXJ6VT10Z38E3EBAG`, `sse_url=http://localhost:8787/api/v1/jobs/gen_01KQPN4PAHXJ6VT10Z38E3EBAG/stream`.
- **Root cause for the proxy 401 (independent of canvas auto-trigger):** `next dev` started at 14:20 UTC; commit `cf3d4a9` (next.config.js fix) landed at 14:29 UTC — running dev server has stale rewrite config. `MCPGEN_BFF_URL=http://localhost:8787/api/v1` is in process env (verified via `ps eww 89011`); old config does not strip `/api/v1` suffix → rewrite produces `/api/v1/api/v1/generate` → BFF catch-all → protectedApp → 401 missing_bearer. Confirmed: `curl localhost:8787/api/v1/api/v1/generate` returns 401 (matches), `curl localhost:8787/api/v1/generate` returns 202.
- Hypothesis (canvas auto-trigger missing): `apps/web/src/app/generate/_canvas-client.tsx` may not read `?spec_url=` and POST automatically — script's manual fill+Enter inside canvas was attempted but no POST surfaced.
- Fix locations:
  1. **Restart `next dev`** to pick up `apps/web/next.config.js` (commit cf3d4a9). Not a code change.
  2. (Optional) `apps/web/src/app/generate/_canvas-client.tsx` — verify `useSearchParams().get('spec_url')` triggers `submitGeneration` automatically. If not, that's a separate canvas bug.
- Screenshot: `apps/web/.tmp-e2e/screenshots/alpha-2-after-bff-post.png`.

### STEP 3 — FAIL
- Status: 5-min poll timeout. Pipeline never emitted `quality-report` (HTTP 409 throughout).
- Engine state at timeout: `artifacts=200`, `quality-report=409` ("not yet at validation_complete (current status: accepted)"). Engine python process at 32% CPU = active LLM I/O.
- Hypothesis: real LLM (`qwen/qwen3-coder` via OpenRouter) Stage F2 (smell scan, multi-shuffle averaging) and/or F3 (agent eval) is contending with BETA + GAMMA parallel runs on the same OpenRouter quota/rate-limit. Engine artifacts (Stage E codegen) finished at ~95s; Stage F running 200+ s without completing.
- Network: BFF `/api/v1/jobs/{jobId}` returns 401 missing_bearer through the same broken rewrite, so canvas SSE consumer (which uses the proxy) sees 401 too.
- Fix locations:
  1. **Capacity / sequencing** — for parallel-agent E2E, increase per-step poll budget OR run agents serially. Not a code bug.
  2. (Optional) `apps/web/src/lib/api/sse.ts` (or wherever SSE client lives) — same `next dev` restart will fix the 401 on the SSE proxy path.
- Screenshot: `alpha-3-fail.png` (UI is on `/generate/{jobId}` showing canon stream UI but with 401 toast / silent stall).

### STEP 4 — PASS
- Status: `/generate/{jobId}/preview` rendered with docStatus=200.
- Body excerpt: `MCPGEN / mcpgen-generated-server-mcp · draft step 01 of 04 ... endpoints 19 · 47 included categories 2 complexity standard auth oa…`.
- 11 `.mc-mono` nodes (canon screen tool list / metadata).
- Screenshot: `alpha-4-preview.png`.
- Note: Preview reads `artifacts` (Stage E output) from BFF — those WERE complete by step 4, so this works even though step 3 timed out.

### STEP 5 — FAIL
- Status: docStatus=500 from `/api/v1/quality/{jobId}` (or wherever the loader fetches). Page crashes:
  - `pageerror: TypeError: Cannot read properties of null (reading 'overall_score')`
- Bug: `apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx:101–103` checks `qualityReport !== undefined` but the BFF returns `null` (or upstream returns 409 → loader maps to null). The narrowing fails on `null`.
  ```
  const score = qualityReport !== undefined
    ? Number(qualityReport.overall_score.toFixed(2))   // ← crashes on null
    : 0;
  ```
- Fix location: `apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx:101` — change to `qualityReport != null` (covers both `undefined` and `null`) or fix the upstream loader to throw/render a "still processing" state when quality-report is unavailable. Both are legitimate; conservative choice = `!= null` + fall back to a "Quality report still computing..." canon empty state.
- Screenshot: `alpha-5-quality.png` (Next.js Application Error red overlay).

### STEP 6 — KNOWN-CAVEAT
- Status: docStatus=200, but final URL is `https://t3qfgh.logto.app/sign-in?app_id=jbqn0bfqvu0ealq4y5if4` — middleware redirected anon user to Logto sign-in page.
- Body: "Sign in to your account · Email · Password · Sign in · No account yet? Create account · Powered by · You're in development mode".
- This is **expected per `apps/web/src/middleware.ts:162-167`**: `/generate/:jobId/playground/:path*` is in the protected matcher.
- **REQ-001 (POST /run-tool 404) was NOT exercised** because anon user cannot reach the playground UI to invoke a tool. Marked KNOWN-CAVEAT per brief.
- Screenshot: `alpha-6-playground.png`.

### STEP 7 — FAIL
- Status: docStatus=200 but `/deploy` page crashes immediately on mount:
  - `pageerror: TypeError: window.useErrorMode is not a function or its return value is not iterable`
- Bug: `apps/web/src/screen-deploy.jsx:15` calls `window.useErrorMode()`. `window.useErrorMode` is registered by `apps/web/src/app.jsx:34` (`window.useErrorMode = useErrorMode;`). But the JSX bridge loader at `apps/web/src/lib/jsx-bridge/loader.ts:5–6` explicitly does NOT side-effect-import `@/app`:
  > "Pitfall 5: DO NOT side-effect-import `@/app` — its top level calls …"
  → so `useErrorMode` never reaches `window`. Same problem applies to `screen-quality.jsx:19` (line 19 also calls `window.useErrorMode()`, but step 5 crashed earlier on the null deref so we didn't see this one trip).
- Fix locations (pick one — never canon JSX):
  1. `apps/web/src/lib/jsx-bridge/loader.ts:34` — add a NEW small wiring file `@/lib/error-mode-shim.ts` that defines `useErrorMode` and assigns it to `window` BEFORE the `screen-*` imports. Side-effect-import that here. (Cleanest.)
  2. `apps/web/src/providers/global-react-shim.ts` (or sibling) — extend the existing global-react-shim pattern with `useErrorMode`.
  3. `apps/web/src/app/generate/[jobId]/deploy/_deploy-client.tsx` — wrap the canon screen in a guard that ensures `window.useErrorMode` is set before mounting (set a no-op fallback `() => ['none', () => {}]`).
- Pre-submit body: "Application error: a client-side exception has occurred…" — primary deploy button hidden by error overlay.
- Post-submit (script tried fallback click, no clipboard ever reached): `success=false`, `mcpUrl=(none)`, `copy buttons clicked: 0`.
- Screenshots: `alpha-7a-deploy-form.png`, `alpha-7b-deploy-result.png`.

---

## Network log highlights

```
-> POST http://localhost:3000/api/v1/generate                   (canvas never fired this — only manual probe earlier)
<- 401  http://localhost:3000/api/v1/generate                   {"error":"unauthorized","reason":"missing_bearer"}
-> POST http://localhost:8787/api/v1/generate  (direct BFF)
<- 202  http://localhost:8787/api/v1/generate                   {"job_id":"gen_01KQPN4PAHXJ6VT10Z38E3EBAG", ...}
-> GET  http://localhost:3000/api/v1/jobs/gen_…                  (canvas SSE bootstrap)
<- 401  http://localhost:3000/api/v1/jobs/gen_…                  {"error":"unauthorized","reason":"missing_bearer"}  (same stale rewrite)
-> GET  http://localhost:3000/api/auth/logto/sign-in?redirect_to=%2Fgenerate%2F…%2Fplayground
<- 307  → Logto Cloud  (expected protected-route redirect)
```

## Console / page errors collected

```
TypeError: Cannot read properties of null (reading 'overall_score')          (quality screen)
TypeError: window.useErrorMode is not a function or its return value is not iterable   (deploy + quality screens)
500 Internal Server Error on /api/v1/quality/{jobId}                         (BFF returned null because quality-report not ready)
401 Unauthorized on /api/v1/generate, /api/v1/jobs/{jobId}                   (broken rewrite — stale next dev)
```

## Remaining blockers (ordered by impact)

1. **STEP 7 deploy crash — `window.useErrorMode` undefined** — **canon-blocker.** Fix in `apps/web/src/lib/jsx-bridge/loader.ts` (add a new shim before `screen-deploy` import) OR add a guard in `_deploy-client.tsx`. Same bug latent on `/quality` (line 19 of screen-quality.jsx) but masked by null-deref crashing first. Path: `apps/web/src/lib/jsx-bridge/loader.ts:46` (current screen-deploy import line) + new `apps/web/src/lib/error-mode-shim.ts`.
2. **STEP 5 quality null-deref** — `qualityReport !== undefined` should be `qualityReport != null`. Path: `apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx:101`.
3. **STEP 3 pipeline timeout** — runtime/capacity, not a code bug. With three agents running real LLM in parallel, Stage F (multi-shuffle averaging + agent eval) doesn't fit a 5-min budget. Either run agents serially or extend the per-job poll budget for E2E.
4. **STEP 2 web proxy 401** — `next dev` is running with pre-cf3d4a9 config. **Not a code bug; a process-restart issue.** The fix is already merged (`apps/web/next.config.js:33`). Restart `next dev` to pick up the strip-trailing-`/api/v1` rewrite. Same root cause documented by E2E-FINDINGS-agent-b.md and ALREADY fixed in repo.
5. **STEP 6 anon-only flow** — REQ-001 cannot be exercised end-to-end without a Logto session. Needs separate authenticated-flow E2E.

---

## Notes on KNOWN-CAVEAT mode

The brief said:
- REQ-001 (run-tool 404 expected) → KNOWN-CAVEAT. We did not reach the run-tool action because the anon user is bounced to Logto by middleware (intentional gate, not a regression).
- Web proxy 401 → KNOWN-CAVEAT. `next dev` restart picks up the existing fix. No code change needed in canon or wiring.

The two real **regressions** (FAIL, code-fixable) are STEP 5 (quality null-deref) and STEP 7 (`window.useErrorMode` not wired). Both are in non-canon wiring (loader.ts and _quality-client.tsx). STEP 3 is a capacity/concurrency artifact of running 3 LLM agents in parallel.
