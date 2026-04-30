# Phase 7: Frontend Wire-Up — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 41 NEW + 8 MODIFIED + 1 DELETE = 50 wire-up files (LOCKED JSX excluded — they are inputs, not analogs)
**Analogs found:** 38 / 41 (3 files have no in-repo analog — covered by RESEARCH.md code snippets per §"Code Examples" + §"Pattern N")

---

## Reading Notes

- The locked `apps/web/src/{MCPGen.html, app.jsx, screen-*.jsx, ui.jsx, tokens.jsx, tweaks-panel.jsx, global.css, uploads/}` files are **inputs**, not analogs. They are imported as-is via the jsx-bridge shim per CONTEXT D-01/D-02 and RESEARCH §"Pattern 1". Modifying them is forbidden by RULES.md §5.7 + the re-pointed `.pre-commit-hooks/check-ui-locked.sh` regex.
- Phase-1 analog files cited inline (Hono BFF in `apps/api/`, contracts package, engine-fixtures) are the canonical sources of truth for HTTP shapes, header conventions, Zod schemas, and Sentry redaction patterns.
- Several Phase 7 files have no codebase analog (jsx-bridge shim, SSE consumer hook, Playwright config, Logto wrapper). For these, the planner consumes the verbatim code snippets in RESEARCH.md §"Pattern 1–5" + §"Code Examples". Those snippets ARE the pattern.
- Cite filenames as `apps/...`, `packages/...`, etc. Line numbers are quoted as `lines NN-NN` against the version of the file checked into commit `f2f4621` (current `feature/frontend-integration` HEAD).

---

## File Classification

### NEW Wire-Up Code (Phase 7 Wave 1 first; Wave 2/3 markers per CONTEXT D-31..D-34)

| New File | Role | Data Flow | Closest Analog | Match Quality | Wave |
|----------|------|-----------|----------------|---------------|------|
| `apps/web/src/app/layout.tsx` | layout/provider | request-response (RSC shell) | RESEARCH §"Code Examples"-TanStack provider + Logto config — no in-repo Next.js layout exists yet | new-pattern (RESEARCH-only) | W1 |
| `apps/web/src/app/page.tsx` | route segment (Server Component shell + client island) | request-response | RESEARCH §"Pattern 1" jsx-bridge example | new-pattern | W1 |
| `apps/web/src/app/(auth)/sign-in/page.tsx` | route segment + Logto server action | request-response | RESEARCH §"Code Examples"-Logto sign-in route | new-pattern | W1 |
| `apps/web/src/app/(auth)/sign-up/page.tsx` | route segment + Logto server action | request-response | same as sign-in (sign-up is the same JSX with a `mode` prop per CONTEXT D-06) | new-pattern | W1 |
| `apps/web/src/app/generate/page.tsx` | route segment (canvas — form submission Client island) | request-response | RESEARCH §"Pattern 3" idempotency + `apps/web/src/screen-landing.jsx` lines 18-21 (locked `handleSubmit` callback to wire) | role-match | W1 |
| `apps/web/src/app/generate/[jobId]/page.tsx` | route segment (stream shell + SSE Client island) | streaming (SSE) | RESEARCH §"Pattern 2" `useGenerationSSE` + `apps/api/src/routes/v1/jobs/stream.ts` lines 17-32 (BFF SSE shape) | role-match | W2 |
| `apps/web/src/app/generate/[jobId]/playground/page.tsx` | route segment (live progress) | streaming (SSE) | same as `[jobId]/page.tsx` | role-match | W2 |
| `apps/web/src/app/generate/[jobId]/preview/page.tsx` | route segment (FinalTool[] + code panel) | request-response (SSR data hydration) | RESEARCH §"Code Examples"-Shiki Server Component | new-pattern | W2 |
| `apps/web/src/app/generate/[jobId]/quality/page.tsx` | route segment (F2/F3 badge) | request-response | uses `lib/quality/badge-tier.ts` (analog: `packages/contracts/src/launch-criteria.ts` lines 28-37 for thresholds) | role-match | W2 |
| `apps/web/src/app/generate/[jobId]/deploy/page.tsx` | route segment (one-click deploy + Claude config) | request-response (with 409 collision branch) | uses `lib/deploy/claude-config.ts` (no analog — RESEARCH §"Don't Hand-Roll") | new-pattern | W3 |
| `apps/web/src/app/dashboard/page.tsx` | route segment (Logto-protected; TanStack prefetch + HydrationBoundary) | request-response (server prefetch) | RESEARCH §"Code Examples"-TanStack `HydrationBoundary` + Logto `getLogtoContext` | new-pattern | W3 |
| `apps/web/src/app/pricing/page.tsx` | route segment (locked-primitive composition) | request-response (static) | composed from locked `ui.jsx` only — see RESEARCH §"Open Questions" #3 (drop if it feels like a visual addition) | role-match | W1 |
| `apps/web/src/app/api/v1/generate/route.ts` | Next Route Handler (proxy/fixture) | request-response | `apps/api/src/routes/v1/generate.ts` lines 13-27 (the BFF endpoint we proxy to) — same `Idempotency-Key` echo + 501 contract shape | exact-match | W1 |
| `apps/web/src/app/api/v1/jobs/[jobId]/route.ts` | Next Route Handler (status proxy) | request-response | `apps/api/src/routes/v1/generate.ts` (header-validation + JSON body shape pattern) | role-match | W2 |
| `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` | Next Route Handler (SSE proxy + fixture replay) | streaming (SSE) | `apps/api/src/routes/v1/jobs/stream.ts` lines 11-33 + `apps/api/src/routes/_spike/sse.ts` lines 11-29 (`streamSSE` + `Last-Event-ID` semantics + 9-event timeline pattern) | exact-match | W1 (fixtures) / W2 (live) |
| `apps/web/src/app/api/v1/deployments/route.ts` | Next Route Handler (dashboard list proxy) | request-response | `apps/api/src/routes/v1/generate.ts` (header forward + JSON proxy pattern) | role-match | W3 |
| `apps/web/src/app/api/v1/usage/hourly/route.ts` | Next Route Handler (time-series proxy) | request-response | same | role-match | W3 |
| `apps/web/src/app/api/v1/deploy/[generationId]/route.ts` | Next Route Handler (deploy proxy + 409) | request-response | same; 409 collision shape comes from CONTEXT D-24 + RESEARCH §"Pitfall 2" | role-match | W3 |
| `apps/web/src/middleware.ts` | Next.js middleware (Logto session check) | request-response (edge interceptor) | RESEARCH §"Code Examples"-Logto `getLogtoContext` pattern; no in-repo middleware exists yet | new-pattern | W1 |
| `apps/web/src/lib/jsx-bridge/loader.ts` | shim/connector (UMD-globals → ESM bridge) | side-effect import sequence | RESEARCH §"Pattern 1" verbatim (lines 334-388 of RESEARCH.md); also confirmed by tail of `apps/web/src/screen-landing.jsx` (`window.Landing = Landing;`) and `apps/web/src/app.jsx` lines 23 (`window.MCPTokens.makeCssVars(t)`) | new-pattern (RESEARCH-only; the linchpin) | W1 |
| `apps/web/src/lib/jsx-bridge/index.ts` | shim/connector (typed re-exports) | n/a | RESEARCH §"Pattern 1" lines 372-388 (typed prop shapes) | new-pattern | W1 |
| `apps/web/src/lib/jsx-bridge/screens.tsx` | per-screen wrappers (callback prop → router.push) | request-response | RESEARCH §"Anti-Patterns" + §"Pitfall 5" (do NOT import `app.jsx`) | new-pattern | W1 |
| `apps/web/src/lib/sse/use-generation-sse.ts` | hook (SSE consumer + reconnect) | streaming (SSE) | RESEARCH §"Pattern 2" verbatim (lines 401-529 of RESEARCH.md); also `apps/api/src/routes/v1/jobs/stream.ts` lines 22 (`Last-Event-ID` header reading) for the contract direction | new-pattern (RESEARCH-only) | W2 |
| `apps/web/src/lib/sse/last-event-id.ts` | helper (resume key persistence) | utility | `packages/contracts/src/idempotency.ts` lines 23-24 (`LAST_EVENT_ID_HEADER` constant — import from there, never redeclare) | exact-match | W2 |
| `apps/web/src/lib/idempotency-key.ts` | utility (ULID + localStorage) | utility | RESEARCH §"Pattern 3" verbatim (lines 535-560 of RESEARCH.md); imports `GEN_ID_REGEX` from `packages/contracts/src/idempotency.ts` lines 37 | new-pattern (RESEARCH-only) | W1 |
| `apps/web/src/lib/api/client.ts` | service (typed fetch client) | request-response | `packages/contracts/src/generation-api.ts` lines 98-114 (`GenerationApiRequest` + `GenerationApiResponse` Zod schemas — single source of truth for shapes); fetch wrapper pattern not in repo, build per CLAUDE.md global rule "External API calls: retries with warnings, then raise the last error" | role-match | W1 |
| `apps/web/src/lib/api/error-mapper.ts` | utility (error envelope formatter) | utility | `packages/contracts/src/generation-api.ts` lines 126-135 (`GenerationErrorCode` enum is the input domain) | role-match | W1 |
| `apps/web/src/lib/fixture-mode/index.ts` | mode toggle helper | config | RESEARCH §"Pattern 5" + CONTEXT D-14/D-15 (env-var gate) | new-pattern | W1 |
| `apps/web/src/lib/fixture-mode/sse-timeline.ts` | fixture replay engine | streaming (SSE) | RESEARCH §"Pattern 5" verbatim (lines 591-657 of RESEARCH.md); imports from `packages/engine-fixtures/src/index.ts` lines 11-21 | new-pattern (RESEARCH-only) | W1 |
| `apps/web/src/lib/quality-badge.ts` | utility (tier mapper) | pure function | RESEARCH §"Pattern 4" verbatim (lines 564-588 of RESEARCH.md); imports `LAUNCH_CRITERIA` from `packages/contracts/src/launch-criteria.ts` lines 28-37 | new-pattern (RESEARCH-only) | W2 |
| `apps/web/src/lib/claude-desktop/config.ts` | utility (clipboard + claude:// formatter) | utility | no in-repo analog; CONTEXT D-23/D-25 + RESEARCH §"Don't Hand-Roll" | new-pattern | W3 |
| `apps/web/src/lib/claude-desktop/collision.ts` | utility (409 → suggested-name parse) | utility | no in-repo analog; CONTEXT D-24 + RESEARCH §"Pitfall 2" | new-pattern | W3 |
| `apps/web/src/lib/logto/client.ts` | connector (Logto SDK config wrapper) | request-response | RESEARCH §"Code Examples"-Logto config (lines 805-815 of RESEARCH.md) | new-pattern (RESEARCH-only) | W1 |
| `apps/web/src/providers/query-client.tsx` | provider (TanStack Query Client) | request-response | RESEARCH §"Code Examples"-TanStack provider verbatim (lines 769-798 of RESEARCH.md) | new-pattern (RESEARCH-only) | W1 |
| `apps/web/src/providers/logto-session.tsx` | provider (Logto session context) | request-response | RESEARCH §"Code Examples"-Logto `getLogtoContext` pattern (lines 842-853 of RESEARCH.md) | new-pattern (RESEARCH-only) | W1 |
| `apps/web/playwright.config.ts` | test config | n/a | RESEARCH §"Code Examples"-Playwright config verbatim (lines 882-902 of RESEARCH.md); also `apps/api/vitest.config.ts` for the `defineConfig` import shape pattern | new-pattern (RESEARCH-only) | W1 |
| `apps/web/playwright.visual-lock.config.ts` | test config (separate visual baseline) | n/a | extends `apps/web/playwright.config.ts`; RESEARCH §"Code Examples" lines 894-895 (`maxDiffPixelRatio: 0.001`) | new-pattern | W1 |
| `apps/web/vitest.config.ts` | test config | n/a | `apps/api/vitest.config.ts` lines 1-8 (the `defineConfig({ test: { include, environment } })` pattern) — Phase 7 swaps `environment: 'node'` → `environment: 'jsdom'` per RESEARCH §"Wave 0 Gaps" | exact-match | W1 |
| `apps/web/vitest.setup.ts` | test setup (jsdom polyfills) | n/a | no in-repo analog; RESEARCH §"Wave 0 Gaps" enumerates polyfills | new-pattern | W1 |
| `apps/web/tests/e2e/landing-submit.spec.ts` | E2E test | n/a | RESEARCH §"Code Examples"-Page-reload spec (lines 910-940 of RESEARCH.md) — same `await page.fill` / `await page.click` shape | role-match | W1 |
| `apps/web/tests/e2e/auth.spec.ts` | E2E test (Logto sign-in flow) | n/a | same shape as landing-submit.spec.ts | role-match | W1 |
| `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` | E2E test (Pitfall #20 — MANDATORY per D-11/D-27) | n/a | RESEARCH §"Code Examples"-page-reload spec verbatim (lines 910-940 of RESEARCH.md) | exact-match (RESEARCH-only) | W2 |
| `apps/web/tests/e2e/deploy-collision.spec.ts` | E2E test (D-24 / Pitfall #30) | n/a | same Playwright shape | role-match | W3 |
| `apps/web/tests/e2e/dashboard.spec.ts` | E2E test | n/a | same Playwright shape | role-match | W3 |
| `apps/web/tests/visual-lock/9-screens.spec.ts` | visual-diff test | n/a | RESEARCH §"Code Examples"-Playwright visual-lock + CONTEXT D-04 | new-pattern | W1 |
| `apps/web/tests/visual-lock/baseline/` (directory) | visual baseline screenshots | n/a | n/a — directory committed empty; first PR populates per CONTEXT D-04 | n/a | W1 |
| `.github/workflows/frontend-ci.yml` | CI workflow (extend marker) | config | `.github/workflows/main-ci.yml` lines 115-131 (the existing `frontend` job — the marker file in `frontend-ci.yml` lines 14-17 stays per `docs/decisions/002-single-ci-workflow-with-paths-filter.md`; Phase 7 extends `main-ci.yml`'s `frontend` job, NOT this marker) | exact-match | W1 |
| `.github/workflows/scripts/visual-lock-guard.sh` | CI script (file-diff lock guard) | utility | `.pre-commit-hooks/check-ui-locked.sh` lines 1-23 (same `git diff --name-only` + UI_LOCKED_PATHS regex) | exact-match | W1 |

### MODIFIED Existing Files

| Modified File | Role | What Changes | Closest Analog |
|---------------|------|--------------|----------------|
| `apps/web/package.json` | manifest | re-enable scripts (`build`/`lint`/`typecheck`/`test`); add `@logto/next@^4`, `ulid@^3`, `@playwright/test@^1.59` (devDep), `shiki@^4` (W2) | `apps/api/package.json` lines 8-12 (real script bodies) + lines 14-26 (workspace `:*` deps + Logto/ULID dep declarations) — same exact shape |
| `apps/web/next.config.js` | config | Phase 7 keeps `withSentryConfig`; adds `allowJs: true`-related Next config if needed; per RESEARCH §"Pitfall 6" do NOT register Tailwind 4 plugin | current file lines 1-22 (already wraps with `withSentryConfig`) — minimal additions only |
| `apps/web/tsconfig.json` | config | flip `jsx: "preserve"` → `jsx: "react-jsx"` per RESEARCH §"State of the Art" + A2; keep `allowJs: true` | current file lines 4-12 |
| `apps/web/sentry.client.config.ts` | config | extend `beforeSend` body: add query-param redaction for `?key=` / `?token=` per CONTEXT D-30 (Authorization/X-Upstream-Auth/Cookie already handled at lines 16-21) | `apps/api/src/instrumentation.ts` lines 25-40 (server-side equivalent — same redaction list, same shape) |
| `apps/web/sentry.edge.config.ts` | config | same `beforeSend` body | same |
| `apps/web/sentry.server.config.ts` | config | same `beforeSend` body | same |
| `.pre-commit-hooks/check-ui-locked.sh` | hook | re-point `UI_LOCKED_PATHS` regex from `^apps/web/src/(styles\|components/ui)/` to actual locked path regex per CONTEXT D-03 | current file lines 1-23 (the only change is the regex on line 10 + the marker-file-removal logic stays at lines 14-17) |
| `apps/web/.unzip-commit-allowed` | marker | DELETE in Plan 07-01 first task per CONTEXT §"Specifics" + D-03 | n/a |

### LOCKED Files (Phase 7 must NOT modify — listed for completeness only)

These are imported as-is via `lib/jsx-bridge/loader.ts`. Modifying any of them fails the re-pointed `.pre-commit-hooks/check-ui-locked.sh` regex and `.github/workflows/scripts/visual-lock-guard.sh`.

- `apps/web/src/MCPGen.html`
- `apps/web/src/{app, screen-landing, screen-auth, screen-canvas, screen-stream, screen-playground, screen-preview, screen-quality, screen-deploy, screen-dashboard, ui, tokens, tweaks-panel}.jsx`
- `apps/web/src/global.css`
- `apps/web/src/uploads/*`

---

## Pattern Assignments (per file, with concrete excerpts)

### 1. `apps/web/src/app/api/v1/generate/route.ts` (Route Handler proxy/fixture)

**Analog:** `apps/api/src/routes/v1/generate.ts` (the BFF endpoint we proxy to) — match quality **exact**

**Imports pattern** (from analog lines 1-13):
```ts
// apps/api/src/routes/v1/generate.ts
import { Hono } from 'hono';
import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';
```

**Phase 7 adapts to Next Route Handler shape:**
```ts
// apps/web/src/app/api/v1/generate/route.ts (NEW)
import { NextRequest, NextResponse } from 'next/server';
import { IDEMPOTENCY_KEY_HEADER, GEN_ID_REGEX, GenerationApiRequest } from '@mcpgen/contracts';
```

**Header-echo + 501 contract shape** (analog lines 14-27):
```ts
// apps/api/src/routes/v1/generate.ts:14-27
generateRoute.post('/', (c) => {
  const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);
  return c.json(
    {
      error: 'not_implemented_phase_8',
      phase: 1,
      requested_idempotency_key: idempotencyKey,
      contract_version: '1.0.0',
    },
    501,
  );
});
```

**Apply this exactly** for fixture-mode response (return 202 with `job_id` from `@mcpgen/engine-fixtures` per CONTEXT D-14); for live-mode, forward the request body + `Idempotency-Key` header to the Hono BFF via `fetch(MCPGEN_BFF_URL + '/api/v1/generate', { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey, ... } })`. The `contract_version: '1.0.0'` echo and the `requested_idempotency_key` echo MUST be preserved verbatim — they're tested by `apps/api/tests/contract.test.ts` lines 29-51.

**Validation pattern:** validate request body against `GenerationApiRequest` from `packages/contracts/src/generation-api.ts` lines 98-108 before proxying.

---

### 2. `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` (SSE Route Handler)

**Analog 1:** `apps/api/src/routes/v1/jobs/stream.ts` — match quality **exact** (the upstream BFF SSE endpoint)
**Analog 2:** `apps/api/src/routes/_spike/sse.ts` — match quality **role-match** (the 9-event/90s `streamSSE` timeline pattern; reuse the timeline-emit shape for fixture mode)

**Imports pattern** (from analog 1 lines 11-13):
```ts
// apps/api/src/routes/v1/jobs/stream.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';
```

**Last-Event-ID resume** (analog 1 lines 17-32):
```ts
// apps/api/src/routes/v1/jobs/stream.ts:17-32
jobsStreamRoute.get('/:id/stream', (c) =>
  streamSSE(c, async (stream) => {
    const lastEventId = c.req.header(LAST_EVENT_ID_HEADER);
    await stream.writeSSE({
      data: JSON.stringify({ ... }),
      event: 'phase1_stub',
      id: '01HXAAAAAAAAAAAAAAAAAAAAA1',
    });
  }),
);
```

**Per-tick timeline emit** (analog 2 lines 16-29 — fixture mode adapts this loop):
```ts
// apps/api/src/routes/_spike/sse.ts:17-28
streamSSE(c, async (stream) => {
  const start = Date.now();
  let id = 0;
  while (Date.now() - start < 90_000) {
    await stream.writeSSE({
      data: JSON.stringify({ t_ms: Date.now() - start, id }),
      event: 'tick',
      id: String(id++),
    });
    await stream.sleep(10_000);
  }
});
```

**Phase 7 fixture-mode adapts to Next Route Handler `ReadableStream`** (Next.js does not have `streamSSE` — use `new ReadableStream` with `controller.enqueue` per RESEARCH §"Pattern 5" lines 624-657):

```ts
// apps/web/src/app/api/v1/jobs/[id]/stream/route.ts (NEW — fixture mode)
import { NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { LAST_EVENT_ID_HEADER } from '@mcpgen/contracts';
import { stripe as fixture } from '@mcpgen/engine-fixtures';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lastEventId = req.headers.get(LAST_EVENT_ID_HEADER);
  // ... ULID timeline + ReadableStream + Last-Event-ID resume — verbatim from RESEARCH §"Pattern 5"
}
```

The `runtime = 'nodejs'` declaration is required per RESEARCH §"Assumptions Log" A9.

**Live-mode (W2):** proxy `fetch` of the request through to `MCPGEN_BFF_URL + '/api/v1/jobs/' + id + '/stream'`, forwarding `Last-Event-ID` header; pipe response body straight through.

**ULID format compliance:** event_ids must match `ULID_REGEX` from `packages/contracts/src/idempotency.ts` lines 30-31 (Crockford base32, 26 chars).

---

### 3. `apps/web/src/lib/sse/use-generation-sse.ts` (SSE consumer hook)

**Analog:** RESEARCH §"Pattern 2" verbatim (RESEARCH.md lines 401-529); no in-repo analog (this is the linchpin of FE-02). Direction-of-data confirmation: `apps/api/src/routes/v1/jobs/stream.ts` line 22 reads `Last-Event-ID` from header — our hook MUST send it on every reconnect.

**Imports pattern** (from RESEARCH.md lines 404-410):
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import {
  GenerationSseEvent,
  LAST_EVENT_ID_HEADER,
  type GenerationSseEvent as TGenerationSseEvent,
} from '@mcpgen/contracts';
```

**Core pattern** (RESEARCH.md lines 412-528): poll `GET /api/v1/jobs/:id` first → if terminal, render and stop → else open SSE with `Last-Event-ID` header → parse via `EventSourceParserStream` → on `stage === 'completed' | 'failed'` set status terminal + return (Pitfall #4 stop-loop) → else on disconnect retry 3× with exponential backoff (1s/2s/4s) → fall back to polling every 2s.

**Critical guard (RESEARCH §"Pitfall 4" + lines 476-481):**
```ts
if (parsed.stage === 'completed' || parsed.stage === 'failed') {
  setStatus(parsed.stage);
  return; // do not reconnect on terminal
}
```

**Schema validation:** every parsed event re-validated through `GenerationSseEvent.parse(JSON.parse(value.data))` from `packages/contracts/src/generation-api.ts` lines 64-71.

---

### 4. `apps/web/src/lib/jsx-bridge/loader.ts` (UMD-globals → ESM bridge — the linchpin)

**Analog:** RESEARCH §"Pattern 1" verbatim (RESEARCH.md lines 334-388). This is the single architectural decision Plan 07-01 ships before any route. No in-repo analog — the locked JSX uses a UMD/global-React harness that has no precedent in our codebase.

**Confirmation that the locked JSX uses globals**, from a direct read of `apps/web/src/screen-landing.jsx` line 12 + tail (last 2 lines):
```jsx
// apps/web/src/screen-landing.jsx:12 — uses React as global
function Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText }) {
  const [counter, setCounter] = React.useState({ endpoints: 348, tools: 47, save: 76 });

// apps/web/src/screen-landing.jsx (last 2 lines) — registers as window global
window.Landing = Landing;
window.SAMPLE_APIS = SAMPLE_APIS;
```

And `apps/web/src/app.jsx` line 23:
```jsx
// apps/web/src/app.jsx:23 — reads MCPTokens from window
const cssVars = window.MCPTokens.makeCssVars(t);
```

**Bridge load order (RESEARCH.md lines 354-368):**
```ts
import '@/tokens';                    // sets window.MCPTokens
import '@/ui';                        // defines Btn, TopBar, Icon, Badge, Spark, etc. (globals)
import '@/screen-landing';            // sets window.Landing + window.SAMPLE_APIS
// ... other 8 screens in same shape
// DO NOT import '@/app' or '@/tweaks-panel' (Pitfall 5 — would call createRoot)
```

**Pre-import shim (RESEARCH.md lines 346-351):**
```ts
if (typeof window !== 'undefined') {
  // @ts-expect-error -- expose UMD-style globals to the locked JSX
  window.React = React;
  // @ts-expect-error -- only used by app.jsx; safe no-op if unused
  window.ReactDOM = ReactDOM;
}
```

**MCPTokens.makeCssVars invocation (per RESEARCH §"Open Questions" #2):** call `window.MCPTokens.makeCssVars(TWEAK_DEFAULTS)` once after import; apply CSS vars to `<html>` to fill the unresolved `var(--paper)` / `var(--ink)` references in `apps/web/src/global.css` lines 6-9.

**Mount discipline:** Plan 07-01 SHIP this file BEFORE any `app/page.tsx` is written. Verified per RESEARCH §"Pattern 1" "Critical".

---

### 5. `apps/web/src/lib/idempotency-key.ts` (ULID + localStorage)

**Analog:** RESEARCH §"Pattern 3" verbatim (RESEARCH.md lines 535-560); regex source: `packages/contracts/src/idempotency.ts` lines 37, 76-78.

**Imports pattern:**
```ts
import { ulid } from 'ulid';
import { GEN_ID_REGEX, type GenId } from '@mcpgen/contracts';
```

**Core pattern** (RESEARCH.md lines 540-559): localStorage key = `mcpgen.idem.${specUrl}|${specHash}`; reuse if exists AND matches `GEN_ID_REGEX`; else generate `gen_${ulid()}`; rotate (delete) after 202 lands with real `job_id`.

**Regex source-of-truth** (analog `packages/contracts/src/idempotency.ts:37`):
```ts
export const GEN_ID_REGEX = new RegExp(`^gen_${ULID_INNER_REGEX}$`);
```
NEVER redeclare locally — always import.

---

### 6. `apps/web/src/lib/quality-badge.ts` (tier mapper)

**Analog:** RESEARCH §"Pattern 4" verbatim (RESEARCH.md lines 564-588); thresholds source: `packages/contracts/src/launch-criteria.ts` lines 28-37.

**Threshold constants** (analog `packages/contracts/src/launch-criteria.ts:28-37`):
```ts
export const LAUNCH_CRITERIA = {
  F2_SMELL_MIN: 4.0,
  F3_AGENT_PASS_RATE_MIN: 0.7,
  BUNDLE_SIZE: { PASS_KB: 800, WARN_KB: 950, FAIL_KB_EXCLUSIVE: 950 },
  COVERAGE_PCT_MIN: 100,
} as const;
```

**Import pattern:**
```ts
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';
```

**Tier mapping** (RESEARCH.md lines 573-581 verbatim) — NEVER hardcode the 4.0 / 0.7 thresholds; always read from `LAUNCH_CRITERIA` so the paired-ADR pre-commit gate at `.pre-commit-hooks/launch-criteria-paired-decision.sh` is the single source of immutability per CONTEXT D-20 + Phase-1 D-13.

---

### 7. `apps/web/src/app/api/v1/jobs/[jobId]/route.ts` (status proxy)

**Analog:** `apps/api/src/routes/v1/generate.ts` lines 14-27 — match quality **role-match** (header forward + JSON proxy shape)

**Pattern:** in fixture mode, return the synthetic timeline events array + `last_known_event_id` shape that the SSE hook expects (RESEARCH §"Pattern 2" lines 432-433). In live mode, proxy `fetch(MCPGEN_BFF_URL + '/api/v1/jobs/' + id)` and pass through.

**Important:** the fixture-mode `GET /api/v1/jobs/:id` MUST return `{ status, last_known_event_id, events: TGenerationSseEvent[] }` per RESEARCH.md line 433 so the page-reload-mid-generation E2E test (D-27) can hydrate prior events from this endpoint.

---

### 8. `apps/web/src/middleware.ts` (Logto session check)

**Analog:** RESEARCH §"Code Examples"-Logto (RESEARCH.md lines 805-853) — no in-repo middleware.

**Per CONTEXT D-18:** protect ONLY `app/dashboard/*`. Public: `app/page.tsx`, `app/generate/*`, `app/pricing`. Use `getLogtoContext` per RESEARCH.md lines 844-853:
```tsx
const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
if (!isAuthenticated) redirect('/api/auth/logto/sign-in');
```

**Cookie security per CONTEXT D-19:** httpOnly, SameSite=Lax, Secure (production). Logto SDK enforces these defaults.

---

### 9. `apps/web/sentry.{client,edge,server}.config.ts` (modify body)

**Analog:** `apps/api/src/instrumentation.ts` lines 25-40 — match quality **exact** (the server-side equivalent uses identical redaction list).

**Existing skeleton** (`apps/web/sentry.client.config.ts:11-24`) already redacts headers per CONTEXT D-30; Phase 7 EXTENDS to also strip `?key=` / `?token=` query params from `request.url`:

```ts
// apps/web/sentry.client.config.ts (current lines 14-22)
beforeSend(event) {
  const headers = event.request?.headers as Record<string, string> | undefined;
  if (headers) {
    for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
      if (k in headers) headers[k] = '[REDACTED]';
    }
  }
  return event;
},
```

**Phase 7 ADDITION (per D-30 + Pitfall #12):** before returning `event`, strip query params:
```ts
if (event.request?.url) {
  const u = new URL(event.request.url);
  for (const k of ['key', 'token']) if (u.searchParams.has(k)) u.searchParams.set(k, '[REDACTED]');
  event.request.url = u.toString();
}
```

**Reuse target:** the redaction logic should be a single helper imported by all 3 Sentry config files. Match shape to `apps/api/src/instrumentation.ts:sentryOptionsFor` factory pattern (lines 25-40 export a callback that accepts env). The factory returns the options shape directly.

**Vitest unit test (Wave 0 Gap):** `apps/web/tests/unit/sentry.client.config.test.ts` asserts redaction works on a representative `event` object containing `Authorization: Bearer sk_test_AAAAAA`, `Cookie: session=xyz`, and `request.url: https://x.test?key=secret`. Test ULIDs follow Phase-1 repeating-A pattern (`01HXAAAAAAAAAAAAAAAAAAAAA1`) per `apps/api/tests/contract.test.ts:31`.

---

### 10. `apps/web/vitest.config.ts`

**Analog:** `apps/api/vitest.config.ts` lines 1-8 — match quality **exact** (same `defineConfig` shape; Phase 7 swaps `node` → `jsdom` per RESEARCH §"Wave 0 Gaps").

**Analog excerpt** (verbatim):
```ts
// apps/api/vitest.config.ts:1-8
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

**Phase 7 adapts:**
```ts
// apps/web/vitest.config.ts (NEW)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    alias: { '@': './src' },
  },
});
```

---

### 11. `apps/web/playwright.config.ts`

**Analog:** RESEARCH §"Code Examples"-Playwright config verbatim (RESEARCH.md lines 882-902); also `apps/api/vitest.config.ts` for the `defineConfig` import idiom (different package, same TS-config-as-data idiom).

**Pattern (RESEARCH.md lines 882-902 verbatim):**
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 }, // ≤0.1% per D-04
  },
  webServer: {
    command: 'MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

### 12. `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` (D-11/D-27 MANDATORY)

**Analog:** RESEARCH §"Code Examples"-Page-reload spec verbatim (RESEARCH.md lines 910-940). No in-repo Playwright tests. Test ULIDs use Phase-1 repeating-A pattern per `apps/api/tests/contract.test.ts:31` to avoid gitleaks false positives.

**Pattern:** start generation → wait for stage C → kill SSE socket via `context.route('**/api/v1/jobs/*/stream', (route) => route.abort())` → reload → unroute → assert prior events reconstructed from `GET /api/v1/jobs/:id` + new events resume from monotonic event_id.

**Critical assertion:** the new events must arrive with `event_id > lastSeenId` per RESEARCH.md lines 933-935. The fixture-mode SSE timeline at `apps/web/src/app/api/v1/jobs/[id]/stream/route.ts` MUST honor `Last-Event-ID` header skip-logic (RESEARCH.md lines 626-632).

---

### 13. `apps/web/package.json` (modify scripts + deps)

**Analog:** `apps/api/package.json` lines 6-26 — match quality **exact** (workspace `:*` deps, real `tsc --noEmit` script, `vitest --run` test script).

**Real script bodies** (analog lines 7-13):
```json
"scripts": {
  "dev": "wrangler dev",
  "build": "tsc --noEmit",
  "deploy": "wrangler deploy --upload-source-maps",
  "typecheck": "tsc --noEmit",
  "test": "vitest --run",
  "lint": "echo \"no lint step in @mcpgen/api ...\""
},
```

**Phase 7 replaces** the four `echo "Phase 1: ... deferred"` placeholders (current `apps/web/package.json:7-12`) with:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest --run && playwright test",
  "test:unit": "vitest --run"
}
```

**New deps (per RESEARCH §"Standard Stack" Phase 7 ADDITIONS):**
```json
"dependencies": {
  // existing — keep
  "next": "^15.0.0", "react": "^19.0.0", "react-dom": "^19.0.0",
  "@mcpgen/contracts": "workspace:*",
  "@sentry/nextjs": "^10.50.0", "tailwindcss": "^4.0.0",
  "eventsource-parser": "^3.0.8", "@tanstack/react-query": "^5.0.0",
  "zod": "^4.3.6",
  // NEW
  "@logto/next": "^4.2.10",
  "ulid": "^3.0.2",
  "@mcpgen/ir": "workspace:*",
  "@mcpgen/engine-fixtures": "workspace:*",
  "shiki": "^4.0.2"  // W2; discretionary
},
"devDependencies": {
  // existing — keep
  // NEW
  "@playwright/test": "^1.59.1"
}
```

**Note on `ulid` major version:** CONTEXT.md cites `^2`; RESEARCH.md A11 verifies `^3.0.2` is current and API-compatible (`ulid()` named export unchanged). Plan 07-01 should re-run `npm view ulid version` and pin to current major; both v2 and v3 produce 26-char Crockford base32 strings that match `ULID_REGEX`.

**Workspace deps:** `@mcpgen/contracts`, `@mcpgen/ir`, `@mcpgen/engine-fixtures` ALL use `workspace:*` (matches `apps/api/package.json:18-19`). NEVER use `file:` paths.

---

### 14. `.pre-commit-hooks/check-ui-locked.sh` (re-point regex)

**Analog:** the file itself, lines 1-23 — match quality **exact** (only the regex on line 10 changes).

**Current state** (`./.pre-commit-hooks/check-ui-locked.sh:10`):
```bash
UI_LOCKED_PATHS='^apps/web/src/(styles|components/ui)/'
```

**Phase 7 re-points to** (per CONTEXT D-03):
```bash
UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
```

**Marker file consumption** (lines 14-17) STAYS as-is — the existing one-shot escape hatch logic is correct; it's just the regex that was wrong. Plan 07-01 first commit removes `apps/web/.unzip-commit-allowed` simultaneously with re-pointing the regex per CONTEXT §"Specifics" §last bullet (single atomic commit).

**Atomic commit message** (CONTEXT §"Specifics"): `chore(07-01): re-point ui-locked-guard regex to actual locked file paths`.

---

### 15. `.github/workflows/scripts/visual-lock-guard.sh` (CI redundant guard)

**Analog:** `.pre-commit-hooks/check-ui-locked.sh` lines 7-12 — match quality **exact**. Same regex, same `git diff --name-only` shape, but runs against `origin/main HEAD` instead of `--cached` per CONTEXT D-03:

```bash
git diff --name-only origin/main HEAD -- $UI_LOCKED_PATHS
```

**ADR escape:** if non-empty, fail UNLESS the PR includes a paired `docs/decisions/<date>-ui-lock-bump.md` per CONTEXT D-03 (mirrors Phase-1 D-13 launch-criteria-paired-decision pattern; see `.github/workflows/main-ci.yml:199-219` for the analogous launch-criteria-assertion job).

---

### 16. `.github/workflows/frontend-ci.yml` (extend marker)

**Analog (do NOT modify):** the existing `apps/web/src/.github/workflows/frontend-ci.yml` lines 1-18 marker stays — per `docs/decisions/002-single-ci-workflow-with-paths-filter.md`, real work runs in `main-ci.yml`.

**REAL changes go to** `.github/workflows/main-ci.yml` `frontend` job at lines 115-131.

**Current frontend job** (`main-ci.yml:115-131`):
```yaml
frontend:
  needs: detect-changes
  if: needs.detect-changes.outputs.frontend == 'true'
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @mcpgen/web run typecheck
    - run: pnpm --filter @mcpgen/web run build
    - run: pnpm --filter @mcpgen/web run test
```

**Phase 7 ADDS** (per CONTEXT D-03/D-04 + RESEARCH §"Wave 0 Gaps"):
- `pnpm exec playwright install --with-deps chromium` (cached via `actions/cache` keyed on `apps/web/src/**` content hash)
- `bash .github/workflows/scripts/visual-lock-guard.sh` step (file-diff lock)
- `pnpm --filter @mcpgen/web exec playwright test` step (E2E + visual-diff)
- baseline screenshot caching/upload step

The shape of these additions matches the existing `engine` job's "smoke test" conditional pattern at `main-ci.yml:88-94`.

---

## Shared Patterns

These cross-cutting patterns apply to multiple new files; planner extracts to `lib/` once and reuses.

### Shared 1: Workspace Imports (NEVER local re-declarations)

**Source of truth:** `packages/contracts/src/index.ts` lines 1-9 + `packages/contracts/src/{idempotency,generation-api,launch-criteria,usage-event,db-schema,db-types}.ts`.

**Rule:** every Phase 7 file that needs a contract symbol imports from `@mcpgen/contracts` (or `@mcpgen/ir` for IR types). NEVER locally redeclare:
- `IDEMPOTENCY_KEY_HEADER` / `LAST_EVENT_ID_HEADER` (`packages/contracts/src/idempotency.ts:23-24`)
- `GEN_ID_REGEX` / `ULID_REGEX` (`packages/contracts/src/idempotency.ts:30-31, 37`)
- `GenerationApiRequest` / `GenerationSseEvent` / `GenerationErrorCode` (`packages/contracts/src/generation-api.ts:64-71, 98-108, 126-135`)
- `LAUNCH_CRITERIA` (`packages/contracts/src/launch-criteria.ts:28-37`)
- `FinalTool` / `QualityReport` from `@mcpgen/ir`

**Apply to:** all files in `apps/web/src/lib/api/*`, `apps/web/src/lib/sse/*`, `apps/web/src/lib/idempotency-key.ts`, `apps/web/src/lib/quality-badge.ts`, all Route Handlers.

### Shared 2: Sentry beforeSend Redaction Factory

**Source:** `apps/api/src/instrumentation.ts` lines 25-40 (`sentryOptionsFor(env)` factory). Phase 7 mirrors this on the web side: a single `redactSentryEvent(event)` helper imported by all 3 Sentry configs.

**Apply to:** `apps/web/sentry.client.config.ts`, `apps/web/sentry.edge.config.ts`, `apps/web/sentry.server.config.ts`.

**Excerpt (analog `apps/api/src/instrumentation.ts:30-39`):**
```ts
beforeSend(event: { request?: { headers?: Record<string, string> } }) {
  const headers = event.request?.headers;
  if (headers) {
    for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
      if (k in headers) headers[k] = '[REDACTED]';
    }
  }
  return event;
},
```

**Phase 7 EXTENSION:** add `request.url` query-param redaction for `?key=` / `?token=` per CONTEXT D-30.

### Shared 3: Test ULID Pattern (gitleaks-safe)

**Source:** `apps/api/tests/contract.test.ts:31` — predictable repeating pattern `01HXAAAAAAAAAAAAAAAAAAAAA2`.

**Apply to:** every Vitest unit test, every Playwright E2E test that needs a ULID-shaped fixture. Per CONTEXT §code_context "Established Patterns" (Phase-1 commit `ee60dee` decision): "predictable repeating-A ULIDs avoid gitleaks generic-api-key false-positives".

### Shared 4: Workspace Dep Pattern

**Source:** `apps/api/package.json:18-19, 22` — `workspace:*` for cross-package imports.

**Apply to:** `apps/web/package.json` — `@mcpgen/contracts: workspace:*`, `@mcpgen/ir: workspace:*`, `@mcpgen/engine-fixtures: workspace:*`. NEVER use `file:` or version-pinned local deps.

### Shared 5: Conventional Commits + Atomic Commits

**Source:** `docs/mcpgen-git-workflow-rules.md` (project-wide).

**Apply to:** every Phase 7 commit. Examples:
- Plan 07-01 first commit: `chore(07-01): re-point ui-locked-guard regex to actual locked file paths` (single atomic commit removes marker + updates regex per CONTEXT §"Specifics")
- Subsequent commits: `feat(07-01): scaffold lib/jsx-bridge shim` / `feat(07-02): wire landing form to /api/v1/generate` / `test(07-02): add Vitest unit tests for idempotency-key` / etc.
- NEVER `--no-verify`; NEVER force-push to main; squash-merge only.

### Shared 6: Validation in Server Components / Route Handlers

**Source:** `apps/api/src/routes/v1/generate.ts:14-16` (header read pattern) + `packages/contracts/src/generation-api.ts:98-108` (request body Zod schema).

**Apply to:** every Route Handler in `apps/web/src/app/api/v1/*/route.ts`. Validate inbound request bodies through Zod schemas from `@mcpgen/contracts` BEFORE proxying to BFF or fixture path. Validate inbound `Idempotency-Key` header via `validateIdempotencyKey` from `packages/contracts/src/idempotency.ts:76-78`.

### Shared 7: Server Component / Client Component Boundary

**Source:** RESEARCH §"Architectural Responsibility Map" + RESEARCH §"Component Responsibilities".

**Apply to:** every `apps/web/src/app/**/page.tsx`. Pattern: Server Component shell owns data fetching + Logto session check + TanStack `prefetchQuery`; Client island wraps the locked screen JSX via `next/dynamic({ ssr: false })` import of `@/lib/jsx-bridge` and owns `useState`/`useEffect`/`useGenerationSSE` hooks.

The boundary is non-negotiable per RESEARCH §"Anti-Patterns" first bullet: "Direct ESM-import of locked JSX from a Server Component crashes at SSR time on `React.useState` and `window.MCPTokens`."

---

## No Analog Found

These files have no in-repo analog. Planner uses RESEARCH.md code snippets verbatim — they ARE the canonical pattern. Each is verified by RESEARCH §"Sources" against Context7-fetched docs.

| File | Role | Data Flow | Source for the Pattern |
|------|------|-----------|------------------------|
| `apps/web/src/lib/jsx-bridge/loader.ts` + `index.ts` + `screens.tsx` | shim/connector | side-effect imports + typed re-exports | RESEARCH §"Pattern 1" (RESEARCH.md lines 334-388) — VERIFIED against locked file structure (`screen-landing.jsx` line 12 + tail; `app.jsx` line 23) |
| `apps/web/src/lib/sse/use-generation-sse.ts` | hook | streaming (SSE) | RESEARCH §"Pattern 2" (RESEARCH.md lines 401-529) — VERIFIED against `eventsource-parser@3` README + `apps/api/src/routes/v1/jobs/stream.ts` direction-of-data |
| `apps/web/src/lib/idempotency-key.ts` | utility | n/a | RESEARCH §"Pattern 3" (RESEARCH.md lines 535-560) — VERIFIED against `packages/contracts/src/idempotency.ts:37` |
| `apps/web/src/lib/quality-badge.ts` | utility | pure function | RESEARCH §"Pattern 4" (RESEARCH.md lines 564-588) — VERIFIED against `packages/contracts/src/launch-criteria.ts:28-37` |
| `apps/web/src/lib/fixture-mode/sse-timeline.ts` | streaming engine | streaming (SSE) | RESEARCH §"Pattern 5" (RESEARCH.md lines 591-657) — VERIFIED against `apps/api/src/routes/_spike/sse.ts` 9-event timeline pattern |
| `apps/web/src/lib/logto/client.ts` + `apps/web/src/providers/logto-session.tsx` | connector | request-response | RESEARCH §"Code Examples"-Logto (RESEARCH.md lines 805-853) — VERIFIED against Logto Next App Router docs (`/logto-io/docs` Context7) |
| `apps/web/src/providers/query-client.tsx` | provider | request-response | RESEARCH §"Code Examples"-TanStack (RESEARCH.md lines 769-798) — VERIFIED against TanStack Query advanced-ssr docs |
| `apps/web/src/lib/claude-desktop/{config,collision}.ts` | utility | n/a | CONTEXT D-23/D-24/D-25 + RESEARCH §"Don't Hand-Roll" — no library; design is small (clipboard + 409 parser); planner writes from CONTEXT directly |
| `apps/web/src/middleware.ts` | edge interceptor | request-response | RESEARCH §"Code Examples"-Logto + CONTEXT D-18 |
| `apps/web/playwright.config.ts` + `playwright.visual-lock.config.ts` | test config | n/a | RESEARCH §"Code Examples"-Playwright (RESEARCH.md lines 882-902) — VERIFIED against `/microsoft/playwright` Context7 docs |
| `apps/web/vitest.setup.ts` | test setup | n/a | RESEARCH §"Wave 0 Gaps" enumerates required polyfills (jsdom localStorage, fetch) |
| `apps/web/tests/visual-lock/9-screens.spec.ts` | visual-diff test | n/a | CONTEXT D-04 + RESEARCH §"Code Examples"-Playwright; baseline captured from Next.js build per RESEARCH §A10 |

---

## Metadata

**Analog search scope:**
- `apps/api/` (Hono BFF — primary analog source for header conventions, Zod validation, Sentry redaction, contract test pattern)
- `apps/api/tests/` (Vitest contract test — primary analog for test ULID pattern + `defineConfig` shape)
- `apps/api/src/routes/v1/` (BFF route handlers — primary analog for Route Handler shapes)
- `apps/api/src/routes/_spike/sse.ts` (streamSSE timeline pattern)
- `packages/contracts/src/` (Zod schemas + regex constants — single source of truth for HTTP shapes)
- `packages/engine-fixtures/src/` (fixture loader — Wave 1 SSE timeline source)
- `apps/web/sentry.{client,edge,server}.config.ts` (existing skeleton — Phase 7 extends)
- `apps/web/next.config.js` (existing `withSentryConfig` wrapper)
- `apps/web/tsconfig.json` (existing baseline; Phase 7 flips `jsx: preserve` → `jsx: react-jsx`)
- `apps/web/package.json` (existing skeleton; Phase 7 fills scripts + deps)
- `.github/workflows/main-ci.yml` (existing `frontend` job at lines 115-131)
- `.pre-commit-hooks/check-ui-locked.sh` (existing aspirational regex; Phase 7 re-points)
- `apps/web/src/{screen-landing.jsx, app.jsx, global.css}` (read-only inspection of locked artifacts to confirm UMD-globals pattern + CSS-var contract)

**Files scanned (read):** 19 source files + 4 config files + 1 hook + 1 workflow = 25 files

**Pattern extraction date:** 2026-04-26

**Notable findings:**
1. The locked JSX uses `window.<ComponentName> = <ComponentName>` registration AT THE BOTTOM of each `screen-*.jsx` file (verified via tail of `screen-landing.jsx`). The bridge import order is non-negotiable: `tokens → ui → screens` (matches `MCPGen.html` `<script>` sequence).
2. `apps/api/src/routes/v1/generate.ts:14-27` is the EXACT contract shape Phase 7 must echo from the Next.js Route Handler proxy in fixture mode. The `contract_version: '1.0.0'` and `requested_idempotency_key` echo are tested against `apps/api/tests/contract.test.ts:43-50`.
3. Sentry redaction is already a half-shipped pattern (`sentry.client.config.ts:14-22`); Phase 7's only addition is query-param scrubbing for `?key=` / `?token=` per CONTEXT D-30.
4. `apps/web/.unzip-commit-allowed` is still present as a stale Phase-1 marker; Plan 07-01 first commit deletes it as part of the re-pointed-regex commit (atomic).
5. `apps/web/src/global.css` lines 6-9 reference `var(--paper)`, `var(--text)`, `var(--font-sans)` etc. — these are populated by `window.MCPTokens.makeCssVars(t)` in `app.jsx:23`. The bridge MUST call `makeCssVars(TWEAK_DEFAULTS)` once at boot or all locked screens render unstyled (RESEARCH §"Open Questions" #2).
6. The `.github/workflows/frontend-ci.yml` marker file pattern (lines 1-18) is INTENTIONAL per `docs/decisions/002-single-ci-workflow-with-paths-filter.md` — Phase 7 extends `main-ci.yml`'s `frontend` job, not the marker.

---

*Phase: 07-frontend-wire-up*
*Pattern map authored: 2026-04-26*
*Files mapped: 50 (41 NEW + 8 MODIFIED + 1 DELETE)*
*Analog coverage: 38/41 in-repo (93%); remaining 3 (jsx-bridge, SSE hook, fixture-timeline) covered by RESEARCH.md verbatim code snippets*
