# Phase 1 — Public Hero Flow (5 parallel agents)

Read `SHARED-BRIEF.md` first. This file specifies per-agent ownership.

## File ownership matrix (NO OVERLAP — each agent only touches its own paths)

| Agent | Screen(s) | Canon source(s) | Output dir(s) | Route(s) |
|---|---|---|---|---|
| **A1** | Landing | `screen-landing.jsx` | `components/screens/landing/` | `app/page.tsx` (root) |
| **A2** | Canvas | `screen-canvas.jsx` | `components/screens/canvas/` | `app/generate/page.tsx` |
| **A3** | Stream | `screen-stream.jsx` | `components/screens/stream/` | `app/generate/[jobId]/page.tsx` |
| **A4** | Preview + Quality | `screen-preview.jsx`, `screen-quality.jsx` | `components/screens/preview/`, `components/screens/quality/` | `app/generate/[jobId]/preview/page.tsx`, `app/generate/[jobId]/quality/page.tsx` |
| **A5** | Playground + Deploy + DeploySuccess | `screen-playground.jsx`, `screen-deploy.jsx` | `components/screens/playground/`, `components/screens/deploy/`, `components/screens/deploy-success/` | `app/generate/[jobId]/playground/page.tsx`, `app/generate/[jobId]/deploy/page.tsx` |

Shared rule: each agent ALSO updates the `apps/web/src/app/<route>/page.tsx` for its routes. The OLD `_*-client.tsx` shims at those routes will be deleted in Phase 4 — for now, **replace** the page contents but leave the old `_*-client.tsx` files alone (Phase 4 sweeps them).

## Per-agent specifics

### A1 — Landing

- Read canon `screen-landing.jsx`. The function signature is:
  ```js
  function Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText, onPricing, onMarketplace, onSignIn })
  ```
  Behaviors per `SCREEN-BEHAVIORS-CATALOG.md` § landing.
- Implement `apps/web/src/components/screens/landing/landing.tsx` as a Client Component.
- Internal state: `useState` for `urlText`, `sample` (selected sample chip).
- `onMakeIt`:
  ```ts
  const router = useRouter();
  const onMakeIt = () => router.push(`/generate?spec_url=${encodeURIComponent(urlText.trim())}`);
  ```
- `onMarketplace`/`onPricing`: `router.push('/marketplace')` / `router.push('/pricing')`.
- `onSignIn`: `window.location.assign('/api/auth/logto/sign-in')` — NOT `router.push` (cross-origin redirect to Logto).
- Sample chip data: stub from `useSampleApis()` BFF hook (likely returns disabled-stub for now → render canon's empty-chip-row state).
- LangSwitcher: import the production `apps/web/src/components/lang-switcher.tsx`.
- Replace `app/page.tsx` body to render this component (Server Component shell).
- Tests: visual snapshot at 4 viewports + flow test "click make it → /generate?spec_url=...".

### A2 — Canvas

- Read canon `screen-canvas.jsx`. Function signature:
  ```js
  function Canvas({ sample, onPlay, onDeploy, onCmdK, onBack })
  ```
- Canvas is the post-paste analysis screen — has DETECTED panel, TOKEN BUDGET, suggestions, "continue · auth setup →" CTA.
- `app/generate/page.tsx` — Server Component reads `?spec_url` query param. Passes to client.
- The `_canvas-client.tsx` currently auto-submits via `submitGeneration` then redirects to `/generate/[jobId]`. Preserve that behavior in the new component:
  - On mount with `spec_url`: POST `/api/v1/generate` (use `useGenerate` mutation from `lib/api/generate`).
  - On 202 response: `router.push('/generate/${job_id}')`.
  - On error: surface via `toast(error)`.
- The "continue · auth setup" CTA: navigate to next step. Per canon, this is part of a 4-step wizard before generation actually fires. Inspect canon for the exact step transitions; the wizard state is internal to Canvas.
- Tests: snapshot + flow "paste URL → submit → redirect to /generate/[jobId]".

### A3 — Stream

- Read canon `screen-stream.jsx`. Function signature:
  ```js
  function StreamLog({ onDone, onCancel, sample })
  ```
- Stream renders the SSE timeline with multi-stage progress + 5 error branches (spec-fail, auth-fail, deploy-fail, rate-limit, none).
- Use `useGenerationSSE(jobId)` from `lib/sse/use-generation-sse.ts` — already battle-tested. Maps SSE events to screen state.
- Use `useErrorMode()` from `stores/error-mode.ts` to drive error-branch rendering.
- Error recovery CTAs: "try repair with ai", "edit spec inline", "re-enter credential", etc. — wire each to a real action OR a `toast()` stub if backend not ready (per `SCREEN-BEHAVIORS-CATALOG.md`).
- `onDone`: navigate to `/generate/${jobId}/preview` when SSE event `completed` arrives.
- `onCancel`: cancel the job (BFF `DELETE /api/v1/jobs/{id}` if exists, else toast).
- Tests: snapshot + flow "stream renders progress for a known job_id (use a fixture stream from `@mcpgen/engine-fixtures`)".

### A4 — Preview + Quality (one agent owns both, they're tightly coupled by IR)

- Canon: `screen-preview.jsx` (`Preview({ sample, onMakeIt, onBack })`) + `screen-quality.jsx` (`QualityReport({ sample, onContinue, onBack })`).
- Preview reads the IR artifacts: `useJobArtifact(jobId, 'final-tools')` and renders the tool list, endpoint counts, naive-vs-optimized token budget.
- Quality reads `useJobArtifact(jobId, 'quality-report')` and renders F1/F2 scores, breakdowns, eval tasks.
- For both screens, when artifacts are still pending or the BFF returns null → render canon's "loading" empty state (canon already has it).
- `onContinue` from Quality → `/generate/${jobId}/playground`.
- `onMakeIt` from Preview → re-trigger generation? Or navigate to `/generate?spec_url=...`? Inspect canon — `onMakeIt` on Preview is described as "go back to refine spec" CTA.
- Tests: snapshot for each + flow "preview → continue → quality" given a completed jobId fixture.

### A5 — Playground + Deploy + DeploySuccess (one agent — same artifact data flow)

- Canon: `screen-playground.jsx` + `screen-deploy.jsx` (which contains both `Deploy` and `DeploySuccess` functions).
- Playground reads the tool list and the user types/picks tools to invoke. The run-tool BFF endpoint is **MISSING** (REQ-001 in old SHARED-FILE-REQUESTS.md). Use the disabled-stub from `lib/api/*` and gate the run action behind `ui_playground_run_tool_perm` (default OFF) — render canon's "trace failed" branch when stub returns `flag_off_or_not_implemented`.
- Deploy submits the deployment target choice. Real BFF endpoints exist (`POST /api/v1/deploy/ephemeral`, `POST /api/v1/deploy/permanent/:id`) — wire them.
- DeploySuccess shows the live MCP URL + Claude Desktop config + copy buttons. After deploy success, navigate to it (or render inline based on canon flow).
- The "permanent claim" CTA on DeploySuccess requires Logto auth (middleware-protected). Preserve canon UX: anonymous user sees claim CTA → click triggers `/api/auth/logto/sign-in` redirect.
- Tests: snapshot for each + flow "playground tools dropdown renders" + "deploy submit → success screen renders".

## Cross-agent coordination

- ONE deploy command is fine if everyone respects file ownership. If a primitive is missing from `apps/web/src/components/ui/` flag it in your deliverable; orchestrator (me) extends the kit between Phase 1 and Phase 2.
- If you need a new helper that's clearly cross-screen (e.g. a `useJobArtifact` hook), put it under `apps/web/src/lib/api/` (NOT inside your screen folder). Add a header comment "shared — Phase 1 A_n".
- The `apps/web/src/app/generate/[jobId]/_stream-client.tsx` and similar `_*-client.tsx` shims in `app/generate/[jobId]/{preview,quality,playground,deploy}/` are the OLD wiring. **Replace `page.tsx`** to render your new component; **leave the `_*-client.tsx` shims alone** — Phase 4 deletes them when we know the new system is stable.

## Hard cap

90 min per agent. After all 5 finish: orchestrator runs full Playwright snapshot suite, integrates results, and dispatches Phase 2.
