# E2E-PIPELINE — Agent GAMMA (Larger API + Bearer Auth)

Branch: `feature/ui-rebuild-09.2`
Run: `cd apps/web && node .tmp-e2e/gamma-pipeline.mjs > .tmp-e2e/gamma-pipeline.log 2>&1`
Result JSON: `apps/web/.tmp-e2e/gamma-pipeline.results.json`
Screenshots: `apps/web/.tmp-e2e/screenshots/gamma-*.png`
Total run time: 109.7 s

Service health at run-time: web=200, bff=200, engine=200 (`/health`), flipt=200.

## Spec selection — the brief targets

| # | Spec URL | Result of pre-flight | Outcome |
|---|---|---|---|
| Primary | `https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml` | **404** — repo's `master` branch was emptied; spec moved to `manual_spec` branch (only README + LICENSE on master) | Re-pointed to `https://raw.githubusercontent.com/openai/openai-openapi/manual_spec/openapi.yaml` |
| Primary (resolved) | `manual_spec/openapi.yaml` (148 endpoints, `securitySchemes.ApiKeyAuth: {type: http, scheme: bearer}`) | **STAGE_A_FAILED — UNSUPPORTED_SPEC_FORMAT**: response definition for `POST /audio/transcriptions` mixes `application/json + text/event-stream` content with `oneOf` — fails the engine parser's response oneOf-vs-Reference validation. | Pivoted to fallback. |
| Fallback 1 | `https://api.apis.guru/v2/specs/notion.com/1.0/openapi.yaml` (Notion) | **404** at given path; `1.0.0` exists but is only **13 ops** + no explicit bearer scheme block | Skipped — too small for the cap-behavior test. |
| Fallback 2 (used) | `https://api.apis.guru/v2/specs/digitalocean.com/2.0/openapi.yaml` | OAS 3.0.0, **183 paths / ~290 operations**, `components.securitySchemes.bearer_auth: {type: http, scheme: bearer}` — well above the 50-tool hard cap. | **Selected for the run.** |
| DO actual outcome | — | **STAGE_A_FAILED — CIRCULAR_REF**: cannot resolve `#/paths/~1v2~1account~1keys~1%7Bssh_key_identifier%7D/get/parameters/0` — engine's `$ref` resolver rejects URL-encoded `{ssh_key_identifier}` path segments. | Pipeline never reaches Pass 0 cap evaluation. |

> **Net result:** every Bearer-auth spec at the size class the brief calls for (the "larger API" arm) is rejected by Stage A's parser. **The cap-behavior arm of the test cannot be exercised end-to-end with the current parser.** This is the headline finding.

---

## Step grid

| # | Step | Outcome | Evidence |
|---|---|---|---|
| 1 | Landing → paste URL → `make it` | **PASS** | Landing input visible, accepted 64-char URL, Enter triggered nav to `/generate?spec_url=...`. Screenshots `gamma-1a-landing.png`, `gamma-1b-after-submit.png`. |
| 2 | `POST /api/v1/generate` → 202 + jobId | **PASS** | Direct BFF (proxy 401 known blocker, see below): `POST http://localhost:8787/api/v1/generate Idempotency-Key=gen_V725H5HWPYGHRS7G3DA49DBJQ0` → **202** `{job_id: "gen_01KQPNJ3D6N9PPQJMSR3E0C93X", sse_url, idempotency_key}`. Canvas at `/generate/{jobId}`. Screenshots `gamma-2-post-result.png`, `gamma-2b-canvas.png`. |
| 3 | SSE stream → completed (or hard-fail at cap) | **FAIL-parser** | SSE events: `A/started` then **`failed`** at +5.7s with `STAGE_A_FAILED: CIRCULAR_REF`. capBehavior = `parser_blocked_before_cap_check`. Canvas correctly surfaces the failure (see `gamma-2b-canvas.png` — red failure card with stage code + verbatim error message + "start over" CTA). Screenshot `gamma-3-stream.png`. |
| 4 | `/preview` — tools count | **PASS-with-defect** | docStatus=200, page renders **canon Preview shell with hardcoded placeholder data** ("OpenAPI 3.1", endpoints `0 · 47 included`, complexity `standard`, **auth `oauth + api key`** — none of which reflect the failed pipeline or the DO spec's actual bearer auth). The BFF preview endpoint returned **401 missing_bearer** so the client falls back to canon-default props. Screenshot `gamma-4-preview.png`. |
| 5 | `/quality` — F1/F2 scores | **PASS-with-defect (UI crash)** | docStatus=200 but page **crashes client-side**: `TypeError: window.useErrorMode is not a function or its return value is not iterable` at `src/screen-quality.jsx:19`. Engine `/quality-report` returned **409** (job failed → no report). UI shows Next.js application-error fallback. Screenshot `gamma-5-quality.png`. |
| 6 | `/playground` — tools dropdown | **PASS** | docStatus=200 → 307 redirect chain → `/api/auth/logto/sign-in?redirect_to=...`. Sign-in screen rendered (anon → middleware-protected route, expected per `route-gate.ts`). 0 dropdowns (login screen, not playground). Screenshot `gamma-6-playground.png`. |
| 7 | `/deploy` → submit → DeploySuccess (Bearer note) | **FAIL** | docStatus=200 but page **crashes client-side**: same `window.useErrorMode is not a function` at `src/screen-deploy.jsx:15`. **No deploy form** (no primary Deploy button visible, no auth-mode picker, no Bearer-token input). Cannot exercise the "Bearer auth header note in DeploySuccess" criterion at all. Screenshots `gamma-7a-deploy-form.png`, `gamma-7b-deploy-result.png`. |

Verdict legend: PASS = behavior matches contract; PASS-with-defect = step technically succeeded but UX deviates from spec; FAIL = contract violated.

---

## Brief-specific verifications

### Bearer-auth detection
- **Pass 0 detection result:** `null` — pipeline failed at Stage A (parser), never reached Pass 0 / auth-detection. `findings.bearerDetected = false`, `findings.authModeDetected = null`.
- **DO spec ground truth:** `components.securitySchemes.bearer_auth = {type: http, scheme: bearer, description: "## OAuth Authentication ..."}`. The engine would have detected this if it could parse the spec.
- **OpenAI spec ground truth (rejected primary):** `components.securitySchemes.ApiKeyAuth = {type: http, scheme: bearer}` — same shape.
- **Verdict:** **UNVERIFIED.** Cannot confirm bearer detection in IR / final tool config because Stage A blocks it. Path-only fix below clears the path.

### Endpoint > 50 cap behavior
- **Behavior observed for spec with 290 endpoints:** pipeline fails at Stage A with `CIRCULAR_REF`. This is a **parser-level rejection**, not a Pass 0 cap rejection. The graceful-split UX is therefore **unreachable** with this spec.
- **No "split into multi-server" suggested prefixes** surfaced anywhere in the run (canvas card just shows the parser error verbatim).
- **No Pro override prompt** surfaced (would have lifted cap to 100, still < 290 — but UI flow never gets there).
- **Verdict:** cap-behavior **NOT TESTABLE on real-world bearer-auth specs of the target size** until Stage A's `$ref` resolver handles URL-encoded path templates and oneOf-with-multi-content-type response shapes.

### Stage E codegen → Bearer auth middleware
- **NOT REACHED.** Stage E only runs after Stage D. Stage A fail-fast → no codegen at all.

### Deploy success screen — Bearer auth field
- **NOT REACHED.** Deploy screen client-crashes before showing the form (see Step 7). Cannot verify the Bearer-token input or `X-Upstream-Auth: Bearer ...` documentation note.

### Multi-server hint UX
- **NOT SURFACED** for this spec. Canvas surfaces the raw `CIRCULAR_REF` error, not the "split into multi-server with these prefixes" hint that the brief asked us to verify.

---

## Findings & path-only suggested wiring fixes

### F-1 (BLOCKER, dev infra) — Next.js dev proxy returns 401 for `POST /api/v1/generate`

- **Symptom:** Browser-issued POST `/api/v1/generate` (via canon Landing form) hits the Next.js dev rewrite at `next.config.js` lines 47-56 and **always** receives `401 {"error":"unauthorized","reason":"missing_bearer"}`. Direct BFF (`http://localhost:8787/api/v1/generate`) returns `202`. All three parallel agents (alpha/beta/gamma) hit this same wall at Step 2 — already documented in `E2E-FINDINGS-agent-b.md §1`.
- **Workaround in this run:** Playwright script bypasses the proxy and POSTs directly to BFF in Step 2. All seven steps then proceed against the real `jobId`.
- **Hypothesis:** the dev-mode rewrite `{ source: '/api/v1/:path*', destination: 'http://localhost:8787/api/v1/:path*' }` (via `BFF_PROXY_TARGET`) is being shadowed by the Next App Router route handler at `apps/web/src/app/api/v1/generate/route.ts`. `beforeFiles` is supposed to win, but the route handler's `console.log('[alpha-diag]')` never fires for failed proxy POSTs — and the response 401 body is the **BFF protectedApp catch-all** message, not the route-handler 502 / 400 paths. So the request is being delivered to the BFF, but to a different Hono route than the public `app.route('/api/v1/generate', generateRoute)` registration. Most plausible: rewrite is hitting the BFF at the wrong path or with a header that flips it into a protectedApp branch.
- **Suggested wiring fix (path-only, NEVER canon JSX):**
  - `apps/web/next.config.js` lines 32-34: log `BFF_PROXY_TARGET` at startup so the actual rewrite destination is observable, and add an explicit pre-`beforeFiles` rewrite check; alternately delete the route handler at `apps/web/src/app/api/v1/generate/route.ts` so all `/api/v1/*` traffic goes through the rewrite (the route handler currently double-handles).
  - `apps/api/src/index.ts` lines 187-236: the `protectedApp.use('*', authMiddleware)` catch-all at line 183 is what generates the 401 body the user sees. Add request logging in dev to print the matched route name on 401 — that immediately reveals which Hono route is handling the proxied POST.
- **Severity:** blocker for the canon hero flow. Without bypass, no agent can reach Step 3.

### F-2 (BLOCKER, wiring) — `window.useErrorMode is not a function` crashes Quality + Deploy screens

- **Symptom:** `/generate/{jobId}/quality` and `/generate/{jobId}/deploy` both render Next.js error fallback with two identical `pageerror`s:
  - `src/screen-quality.jsx:19 — const [errorMode] = window.useErrorMode();`
  - `src/screen-deploy.jsx:15 — const [errorMode] = window.useErrorMode();`
- **Hypothesis:** `useErrorMode` is defined in `apps/web/src/app.jsx` at line 19 and registered via `window.useErrorMode = useErrorMode` at line 34. But `app.jsx` is **explicitly excluded** from `apps/web/src/lib/jsx-bridge/loader.ts` ("Pitfall 5: DO NOT side-effect-import `@/app` — its top level calls `ReactDOM.createRoot()` which would fight Next's hydration root"). Result: when the locked screens use `window.useErrorMode()`, the global is undefined and React unwraps `undefined()` → `TypeError`. Same gap-pattern as `window.MCPTokens` got handled (extracted to `@/tokens` side-effect import), but `useErrorMode` was missed.
- **Suggested wiring fix (path-only, NEVER canon JSX):**
  - **New file** `apps/web/src/providers/error-mode-shim.ts` (or `.tsx`) that re-implements the same hook (or imports the existing `useErrorMode` from `@/app` *carefully* — only the function, not the React.createRoot side effect). Set `window.useErrorMode = useErrorMode` at module top. Keep the `MCPGEN_ERROR_BUS` global initialization.
  - `apps/web/src/lib/jsx-bridge/loader.ts` after line 26 (after `import '@/providers/global-react-shim';`) add:
    ```ts
    import '@/providers/error-mode-shim';   // sets window.useErrorMode + window.MCPGEN_ERROR_BUS
    ```
    The screen JSX side-effect imports start on line 41+ — placing the shim before them guarantees `window.useErrorMode` exists when any screen module first executes.
- **Severity:** blocker. Quality + Deploy screens are unrenderable for any non-fixture jobId. Both alpha and beta agents would also hit this once their happy path reaches Step 5/7 — gamma reproduces the canon-defect cleanly.

### F-3 (BLOCKER, engine) — Stage A parser cannot ingest current OpenAI spec (oneOf + multi content-type)

- **Symptom:** Posting `https://raw.githubusercontent.com/openai/openai-openapi/manual_spec/openapi.yaml` produces `STAGE_A_FAILED: UNSUPPORTED_SPEC_FORMAT — '{description: OK, content: {application/json: {...oneOf...}, text/event-stream: {...anyOf...}}}' is not valid under any of the given schemas` at `paths./audio/transcriptions.post.responses.200`. The engine's parser-level OAS validator rejects responses that combine multiple `content-type` schemas with `oneOf`/`anyOf`.
- **Hypothesis:** Engine uses an OAS 3.0 schema validator (likely `openapi-spec-validator`) that hasn't been relaxed for OAS 3.1 idiomatic patterns. The OpenAI spec is OAS 3.0 but uses `text/event-stream` as a streaming response — a valid pattern that's increasingly common.
- **Suggested wiring fix (path-only, NEVER canon JSX):**
  - `apps/generation-engine/` Stage A IR builder — relax response validation to accept multi-content-type schemas with discriminated unions, OR pre-process responses by collapsing each content-type to its own response variant before validating.
  - At minimum surface a more agent-friendly error: the canvas card currently dumps the raw Python `ValidationError` repr (3 KB of escaped Python tuple) instead of `"OpenAI's spec uses an OAS 3.0 streaming pattern we don't yet support — please pin to an older version or use the JSON-only equivalent"`.
- **Severity:** blocker for OpenAI as a marketing demo target.

### F-4 (BLOCKER, engine) — Stage A `$ref` resolver fails on URL-encoded path templates

- **Symptom:** Posting `https://api.apis.guru/v2/specs/digitalocean.com/2.0/openapi.yaml` produces `STAGE_A_FAILED: CIRCULAR_REF: Cannot resolve reference "file:///__placeholder_url__.yaml#/paths/~1v2~1account~1keys~1%7Bssh_key_identifier%7D/get/parameters/0": 'Object at "/paths" does not contain key: /v2/account/keys/%7Bssh_key_identifier%7D'`.
- **Hypothesis:** the resolver decodes the JSON Pointer (`~1` → `/`) but does NOT URL-decode `%7B` / `%7D` back to `{ }` before looking up the key. The path map keys are `/v2/account/keys/{ssh_key_identifier}` (literal braces), not the URL-encoded form. Misnamed `CIRCULAR_REF` — it's actually a missing-key resolution failure.
- **Suggested wiring fix (path-only, NEVER canon JSX):**
  - `apps/generation-engine/` Stage A `$ref` resolver: `urllib.parse.unquote()` each JSON-Pointer segment after `~`-decoding before key lookup. (Or pre-canonicalize all `paths` keys to URL-encoded form during ingestion — pick one; right now the encoding boundaries are inconsistent.)
  - Rename the error code from `CIRCULAR_REF` to `UNRESOLVED_REF` — circular refs imply a cycle, this is a missing key.
- **Severity:** blocker for any spec that uses URL-encoded path templates in ref targets — DigitalOcean (290 ops, real-world spec hosted by Swagger Index).

### F-5 (DEFECT) — Preview screen shows hardcoded canon-default props on engine failure

- **Symptom:** When BFF preview endpoint returns 401 (or any non-200), `apps/web/src/screen-preview.jsx` falls back to canon-bundled mock data (`auth oauth + api key`, `endpoints 0 · 47 included`, `complexity standard`, `format OpenAPI 3.1`). User cannot tell from the preview screen alone whether they're seeing real data or placeholder.
- **Hypothesis:** the wiring layer (`apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx`) silently falls through on 401 instead of branching to a "pipeline-failed → here's the canvas error message" surface. Probably defaults to canon's built-in sample props.
- **Suggested wiring fix (path-only, NEVER canon JSX):**
  - `apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx` (and its sibling `screens.tsx` `PreviewWrapper`) — when the BFF returns non-200, set the canon's `errorMode` prop (the same prop driven by `useErrorMode`) to `'spec-fail'` so the canon Preview renders its own failed-state UI per `screen-preview.jsx`.
- **Severity:** defect (mis-leading UX), not blocker.

### F-6 (DEFECT) — Canvas surfaces raw Python error verbatim instead of agent-friendly message

- **Symptom:** Canvas (`/generate/{jobId}`) shows `STAGE_A_FAILED · CIRCULAR_REF: Cannot resolve reference "file:///__placeholder_url__.yaml#/paths/...` — verbatim from the Python parser exception. While transparency is the project value, the placeholder-URL `file:///__placeholder_url__.yaml` is a **leak of an internal implementation detail** (the engine uses a placeholder filename when ingesting URL-fetched specs).
- **Hypothesis:** Stage A error path joins `error.code + ': ' + error.message` directly. No translation layer between engine error → user-facing copy.
- **Suggested wiring fix (path-only):**
  - `apps/web/src/screen-canvas.jsx` is canon (cannot edit). Wiring layer in `apps/web/src/app/generate/[jobId]/page.tsx` (or wrapper) should translate engine `error.code` → user-facing message, e.g. `STAGE_A_FAILED + UNRESOLVED_REF` → `"This spec uses an URL-encoding pattern in $refs that we can't yet resolve — try the JSON variant of this OpenAPI spec."` Strip `file:///__placeholder_url__.yaml` from anything user-visible.
- **Severity:** defect (UX polish + internal-detail leak), not blocker.

### F-7 (CONFIRMED CAVEAT) — Playground 307s to Logto sign-in

- Per `apps/web/src/middleware.ts` matcher line 163-164, `/generate/:jobId/playground` is a protected route. Anon → 307 → `/api/auth/logto/sign-in?redirect_to=...`. **Expected behavior** per `09.1-CONTEXT.md D-10`. Documented and matches alpha + beta agent observations.

---

## Final findings (machine-readable)

```json
{
  "spec": "https://api.apis.guru/v2/specs/digitalocean.com/2.0/openapi.yaml",
  "authModeDetected": null,
  "bearerDetected": false,
  "endpointCountObserved": null,
  "capBehavior": "parser_blocked_before_cap_check",
  "failureMode": "STAGE_A_FAILED: CIRCULAR_REF: Cannot resolve reference \"file:///__placeholder_url__.yaml#/paths/~1v2~1account~1keys~1%7Bssh_key_identifier%7D/get/parameters/0\": 'Object at \"/paths\" does not contain key: /v2/account/keys/%7Bssh_key_identifier%7D'",
  "toolsCount": null,
  "qualityScores": null,
  "deploySuccessSeen": false,
  "bearerHeaderNoteSeen": false,
  "postStatus": 202,
  "jobId": "gen_01KQPNJ3D6N9PPQJMSR3E0C93X"
}
```

---

## Auth-mode verdict

**UNVERIFIED — Bearer detection cannot be confirmed.**

Reason: every Bearer-auth spec at the target size class (OpenAI 148 ops, DigitalOcean 290 ops) is rejected by Stage A's parser before Pass 0 / auth-detection runs. The pipeline's bearer-detection logic exists in code (per `pass-0-design.md`) but cannot be exercised end-to-end through the UI on real-world specs. To verify: (a) clear F-3 + F-4 in the engine, OR (b) supply a small bearer-auth spec (≤ 30 endpoints, no oneOf-multi-content-type, no URL-encoded refs) — but that wouldn't exercise the cap-behavior arm of the test the brief asked for.

## Cap-behavior verdict on > 50 endpoints

**UNVERIFIED — engine never reaches Pass 0.**

Both candidate specs (148 + 290 endpoints) fail at Stage A parsing. The graceful "split into multi-server with suggested prefixes" UI surface, the Pro override prompt, and the cap-exceeded hard fail all live downstream of Stage A and could not be exercised. Once F-3 + F-4 land, this test should be re-run on the same DO spec — that's the cleanest path to validating cap behavior on a real bearer-auth API.

---

## Remaining blockers ranked

1. **F-3 + F-4** — engine Stage A parser cannot ingest either of the two real-world large bearer-auth specs the brief targets. Without these, "larger API + Bearer auth" cannot be tested at all.
2. **F-2** — `window.useErrorMode` wiring gap. Even if engine succeeds, Quality + Deploy screens crash. Same defect would affect alpha + beta downstream.
3. **F-1** — Next dev proxy 401. Affects all 3 agents at Step 2; bypassed in this run via direct BFF, but blocks any anon user in dev.
4. **F-5 + F-6** — UX polish (preview placeholder fallback misleading; canvas leaks internal placeholder URL).
