# E2E Pipeline Beta — Petstore Swagger 2.0 (auth-required)

- **Spec URL:** `https://petstore.swagger.io/v2/swagger.json`
- **Branch:** `feature/ui-rebuild-09.2`
- **Date:** 2026-05-03
- **Agent:** BETA
- **Job ID (BFF):** `gen_01KQPN5JBDHH723X0B7ZVN2J0N`

## TL;DR — Auth detection verdict: **BLOCKED (cannot evaluate)**

The engine **explicitly rejects Swagger 2.0** in Stage A (parser) before any auth detection runs. Per the agent prompt the expectation was that "Swagger 2.0 → OpenAPI 3 conversion runs in Stage A (parser); confirm no parse errors". This expectation is **wrong**: the current MVP rejects Swagger 2.0 with the message `UNSUPPORTED_SPEC_FORMAT: Swagger 2.0 is not supported in MVP; convert via swagger2openapi`. Therefore Pass 0 never runs, no `auth_mode` is selected, no auth middleware is rendered, and no auth UX hint is reachable for this spec.

Source of truth: `/Users/igor/Projects/mcpgen/apps/generation-engine/src/mcpgen_engine/stages/stage_a.py:270-289` (function `_detect_spec_format` raises `StageAError` when `"swagger" in resolved`). The behavior is the documented MVP scope per design decision **D-11** (cited inline in the docstring).

The Canvas UI does correctly surface the failure with a precise error message and a "start over" CTA, so the negative path UX for Stage A errors is healthy.

## 7-step grid

| Step | Screen | Outcome | Notes |
|------|--------|---------|-------|
| 1 | Landing → paste URL → make it | **PASS** | Hero input visible, form submits via Enter; canvas redirect happens. |
| 2 | Canvas → POST `/api/v1/generate` | **CAVEAT** | Direct UI form submission returns **HTTP 401 `missing_bearer`** through the Next.js dev rewrite proxy `/api/v1/*` → BFF :8787. This is a **global blocker** affecting Alpha, Beta, Gamma. Direct curl to BFF :8787 returns HTTP 202 correctly. Workaround: pre-submit jobId via direct BFF call. |
| 3 | SSE stream → completion | **FAIL** | Engine emits exactly two events: `event: A status: started` then `event: failed status: error code: STAGE_A_FAILED message: UNSUPPORTED_SPEC_FORMAT: Swagger 2.0 is not supported in MVP; convert via swagger2openapi`. Pipeline never advances. BFF `/api/v1/jobs/{id}` keeps returning `status: streaming` (does not learn about the failure). |
| 4 | `/preview` | **CAVEAT** | Renders 200 with **canon stub data** (`endpoints: 0`, `"47 included"`, `auth: oauth + api key` — all hardcoded canon mockup). The screen does NOT pull the real artifacts because none exist. No auth-detection metadata visible. |
| 5 | `/quality` | **FAIL** | 200 doc status but **client-side crash**: `TypeError: window.useErrorMode is not a function or its return value is not iterable`. Renders Next.js generic error fallback "Application error: a client-side exception has occurred while loading localhost". |
| 6 | `/playground` | **FAIL** | Navigation aborts (`ERR_ABORTED`) — the route is in the protected matcher (`apps/web/src/middleware.ts:163`) and middleware redirects to Logto sign-in, which the headless context cannot complete. Same caveat that affects Alpha/Gamma. |
| 7 | `/deploy` → submit cloud | **FAIL** | Same client-side crash as `/quality`: `window.useErrorMode is not a function`. Cannot exercise deploy form. No DeploySuccess. No Claude Desktop config rendered. No auth header note. |

## Auth-detection observations (the focus of this run)

| Question | Answer |
|---|---|
| Did Pass 0 detect `api_key`? | **NO — Pass 0 never executed.** Stage A (parser, deterministic) rejects Swagger 2.0 before reaching Stage B / Pass 0. |
| Is `auth_mode` field exposed on the IR / Quality screen? | **NO** — no artifacts exist. Quality screen crashes for an unrelated reason (`window.useErrorMode`). |
| Did codegen produce auth middleware (`X-Upstream-Auth` passthrough)? | **NO** — Stage E never ran. |
| Were any auth-secured endpoints silently dropped? | **N/A** — the entire spec was rejected at Stage A; no endpoint enumeration happened. |
| Does the Preview / Deploy UX surface "API key" / "auth header" / "credentials" hint? | **NO** — Preview shows canon stub text "auth: oauth + api key" but it is hardcoded canon copy, not data. Deploy crashes before render. Playground unreachable for anon caller. |

## Reachable evidence (despite the blocker)

The repo's deterministic auth pipeline IS in place and would have done the right thing if the spec were OpenAPI 3 with the same `apiKey` scheme. Specifically:

- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py:69-115`, `select_auth_mode`, returns `"passthrough"` whenever any endpoint declares `Scheme.apiKey` (and there is no `oauth2` / `aws_signature` to pre-empt it). The Petstore Swagger 2.0 spec declares exactly that single scheme (`api_key` apiKey in header), so a successful run would have produced `auth_mode = "passthrough"`.
- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py:118-166`, `render_auth_files`, would then emit `src/auth/middleware.ts` and `src/auth/credentials.ts` from the passthrough branch of `auth_middleware.ts.j2` / `auth_credentials.ts.j2`.
- The Pydantic IR in `packages/ir/python/types.py:17-35` confirms the shape: `Scheme.apiKey` + `RecommendedMode.passthrough`. No drift between engine and IR.

So the **internal logic is healthy**; the blocker is purely the input-format gate.

## Cross-agent global blockers

These are not Beta-specific. They surface in Alpha and Gamma logs as well:

1. **Next.js `/api/v1/*` rewrite returns 401 `missing_bearer`.** Confirmed via `curl http://localhost:3000/api/v1/generate` → 401, while `curl http://localhost:8787/api/v1/generate` → 202. Root cause is in `apps/web/next.config.js:34-56`: the `RAW_BFF_URL.replace(/\/api\/v1\/?$/, '')` strip + rewrite reconstruction lands on a path that the running BFF treats as protected. Cannot diagnose further without modifying code.
2. **`window.useErrorMode is not a function or its return value is not iterable`** crash on `/quality` and `/deploy` for any failed job. The crash chain (`Fast Refresh → unrecoverable error → full reload`) replaces the screen with the Next.js generic error fallback. Likely a missing window-scope shim for the JSX bridge when a job has no artifacts.
3. **BFF `/api/v1/jobs/{id}` does not propagate the engine `event: failed` → `status: failed`.** It keeps returning `status: streaming` indefinitely. Engine SSE has the failure correctly. This was already noted in `EXECUTION-STATE.md` / `E2E-FINDINGS-*` for prior runs.

## Suggested fixes (path-only — no canon edits)

1. **`apps/generation-engine/src/mcpgen_engine/stages/stage_a.py`** — wire the `swagger2openapi` (or pure-Python `prance` / `openapi_parser` with `swagger_to_openapi3=True`) conversion into the existing Swagger 2.0 detection branch instead of raising. Conversion is mandatory for the Petstore Swagger 2.0 fixture used by Beta, and unblocks the apiKey-passthrough auth assertion the agent prompt asks for. Until then the prompt's expectation is contradicted by D-11.
2. **`apps/web/next.config.js`** — the rewrite needs a closer look: with `MCPGEN_BFF_URL=http://localhost:8787/api/v1`, the strip yields `http://localhost:8787` and the rewrite re-appends `/api/v1/generate`, but empirically the BFF responds 401. Either log the actual URL Next.js synthesizes or replace the rewrite with an explicit Route Handler proxy (`apps/web/src/app/api/v1/generate/route.ts` already exists and forwards via `getBffUrl()`). Consider deleting the `beforeFiles` rewrite so Route Handlers win.
3. **`apps/web/src/`** — the `window.useErrorMode` crash on `/quality` and `/deploy` for jobs with no artifacts. Trace the JSX-bridge initialization in `apps/web/src/lib/jsx-bridge/screens.tsx`, ensure `window.useErrorMode` is registered (or made optional in the consuming JSX) before the screen tries to destructure its return. A "no artifacts yet, see canvas for status" graceful state would be more useful than the generic error wall.
4. **`apps/api/src/routes/v1/jobs.ts`** — when the engine SSE stream emits `event: failed`, the BFF should mirror it into the job state so `/api/v1/jobs/{id}` returns `status: failed`. Currently the job stays "streaming" forever. (See engine stream verbatim in `apps/web/.tmp-e2e/beta-ui-walk.json`.)
5. **`apps/web/src/components/canon/screen-preview*.tsx`** — `/preview` renders canon stub copy (`endpoints: 0`, `47 included`, `auth: oauth + api key`) when there are no artifacts. This is misleading because it looks like a successful preview. Either gate the screen on artifact presence or replace the visible numbers with em-dashes when artifacts are absent.

## Auth-detection final verdict

**Auth-detection: NOT EVALUATED on the assigned spec.** The Swagger 2.0 input is rejected before any auth logic runs. The pipeline blocker is at Stage A, not at Pass 0. The deterministic auth-mode logic at `stages/stage_e/auth.py:select_auth_mode` would correctly choose `passthrough` for the spec's apiKey scheme if the spec were ever converted to OpenAPI 3.

## File paths (for the caller)

- Beta script (read-only, in `.tmp-e2e/`): `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/beta-pipeline-v2.mjs`
- Beta UI-walk script: `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/beta-ui-walk.mjs`
- Engine stream evidence (raw SSE): `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/beta-ui-walk.json` (key `engine_stream_chunk`)
- Screenshots: `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/screenshots/beta-walk-*.png` and `beta-1*.png`, `beta-2*.png`, `beta-3*.png`
- Engine reject site: `/Users/igor/Projects/mcpgen/apps/generation-engine/src/mcpgen_engine/stages/stage_a.py:270`
- Auth selector: `/Users/igor/Projects/mcpgen/apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py:69`
- Next.js broken proxy: `/Users/igor/Projects/mcpgen/apps/web/next.config.js:34`
