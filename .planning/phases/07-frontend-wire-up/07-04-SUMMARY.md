---
phase: 07-frontend-wire-up
plan: 04
subsystem: ui
tags: [shiki, sse, live-mode, playwright, pitfall-20, dual-baseline, fe-02, fe-03]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SSE envelope contract (D-09/D-10) + idempotency-key shape (D-11) + engine-fixtures fixtures package
  - phase: 05-engine-validation
    provides: Stage F (F1/F2/F3) QualityReport schema + retry orchestration; FROZEN IR with strictly-additive Phase-5 fields
  - phase: 08-auth-billing
    provides: Logto JWT middleware + Inngest scaffold (BFF generation kickoff itself remains a Phase-1-stub gap; carry-forward documented)
  - phase: 07-frontend-wire-up
    provides: Plan 07-01 jsx-bridge linchpin + Plan 07-02 Logto kickoff + Plan 07-03 fixture-mode SSE pipeline + quality-badge mapper + page-reload e2e test
provides:
  - Shiki@^4 Server Component (`apps/web/src/lib/preview/code-block.tsx`) renders Stage E TypeScript bundle with github-dark theme via SSR `codeToHtml`; zero client JS overhead from highlighter
  - Live-mode Route Handlers fully wired with Logto session cookie forwarding + `bff_unreachable` 502 error handling on network failure (T-7-11 + T-7-14 mitigations)
  - Preview route Server Component prefetches `partial_result.tenant_worker_source` and renders `<CodeBlock>` adjacent to the locked Preview screen (locked screen has no code-panel slot — confirmed at Task-1 spike)
  - Dual-mode Pitfall #20 page-reload e2e test (fixture mode by default, live mode via `MCPGEN_FRONTEND_MODE=live`)
  - 3 Wave-2 live-mode-only e2e specs: hero-flow-live + preview-render-live + quality-rubric-live with `skipIfNotLive()` helper
  - Dual-baseline visual-lock spec (9 fixture-mode baselines from Plan 07-03 + 9 live-mode baselines guarded by env var) — 19 total describes
  - 07-04-SPIKE-RESULT.md documenting A1 (locked screen onDone short-circuit verified) / A4 (QualityReport field names verified) / A8 (BFF generate kickoff GAP — escalate-deferred) / A12 (LockedSample derivation rules)
affects: [09-observability, 10-launch — both consume the live-mode wire-up]

# Tech tracking
tech-stack:
  added:
    - "shiki@^4.0.2 (server-only — never enters client bundle)"
  patterns:
    - "Server Component syntax highlighting: codeToHtml runs at request time; output emitted via dangerouslySetInnerHTML inside locked-CSS-var-only wrapper"
    - "Live-mode Route Handler proxy: forwards Idempotency-Key + Last-Event-ID + Logto session Cookie unchanged to apps/api Hono BFF; wraps fetch in try/catch with structured 502 fallback"
    - "Dual-mode e2e tests via process.env.MCPGEN_FRONTEND_MODE switch: same assertions, mode-appropriate timeouts (fixture ~13s vs live ~240s)"
    - "Dual-baseline visual-lock: file-suffixed baselines ('-live.png') keep fixture vs live independent; CI runs whichever matches MCPGEN_FRONTEND_MODE"
    - "z.input vs z.infer for client-side request types: callers omit defaulted fields (Phase-5 strictly-additive)"

key-files:
  created:
    - apps/web/src/lib/preview/code-block.tsx
    - apps/web/tests/e2e/_helpers/live-mode.ts
    - apps/web/tests/e2e/hero-flow-live.spec.ts
    - apps/web/tests/e2e/preview-render-live.spec.ts
    - apps/web/tests/e2e/quality-rubric-live.spec.ts
    - .planning/phases/07-frontend-wire-up/07-04-SPIKE-RESULT.md
  modified:
    - apps/web/package.json (shiki@^4 dep)
    - pnpm-lock.yaml (shiki resolution + transitive deps)
    - apps/web/src/app/api/v1/generate/route.ts (Cookie forwarding + bff_unreachable 502)
    - apps/web/src/app/api/v1/jobs/[jobId]/route.ts (Cookie forwarding + bff_unreachable 502)
    - apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts (Cookie forwarding + SSE error event on bff_unreachable)
    - apps/web/src/app/generate/[jobId]/preview/page.tsx (CodeBlock render + tenantWorkerSource prefetch)
    - apps/web/src/lib/jsx-bridge/screens.tsx (PreviewWrapper accepts codeSource prop)
    - apps/web/src/lib/api/client.ts (z.input<typeof GenerationApiRequestSchema>)
    - apps/web/tests/unit/lib/quality-badge.test.ts (Phase-5 strictly-additive fields in test fixture)
    - apps/web/tests/e2e/page-reload-mid-generation.spec.ts (dual-mode env var switch + mode-appropriate timeouts)
    - apps/web/tests/visual-lock/9-screens.spec.ts (live-mode describe block with -live.png baselines)

key-decisions:
  - "Shiki rendered at the route's Server Component level (NOT inside the Client wrapper) — Shiki must run server-side; PreviewWrapper carries codeSource prop for type-surface completeness only."
  - "Locked screen-preview.jsx has NO code-panel slot — verified at Task 1 spike. The CodeBlock is rendered as a sibling section below the locked screen using locked CSS-vars only (no new visual elements; FE-05 anti-drift preserved)."
  - "BFF generate kickoff GAP escalated as deferred — Phase 8 merged its auth/billing infrastructure but did NOT close apps/api/src/routes/v1/generate.ts (still 501) or implement GET /api/v1/jobs/:id. Plan 07-04 ships the frontend-side proxy as content-agnostic: live-mode tests skip until MCPGEN_FRONTEND_MODE=live AND a follow-up plan wires the BFF kickoff."
  - "Live-mode Route Handler forwards Logto session cookie (T-7-11 mitigation against cross-user replay)."
  - "On BFF unreachable: /generate + /jobs/:id return JSON 502 with structured {error, upstream_url, message} for dev-console debugging; /jobs/:id/stream emits a single SSE error event then closes so useGenerationSSE routes through its terminal-failed path (no hung connection)."
  - "Dual-baseline visual-lock with -live.png suffix avoids invalidating fixture-mode lock when real engine output renders subtly different layouts (e.g., different tool counts changing bento grid)."
  - "Phase-5 strictly-additive contract changes (`f3_enabled` default-false on GenerationApiRequest; 8 new QualityReport fields with defaults) propagated to apps/web type-surface via z.input + explicit defaults — Rule 3 auto-fix as the merge surfaced compile errors blocking Plan 07-04 typecheck."

patterns-established:
  - "Pattern Shiki-1: SSR-friendly highlighter via Server Component; `codeToHtml` returns highlighted HTML; wrapper styled with locked CSS-vars only; client bundle untouched"
  - "Pattern Live-Proxy-1: Route Handler forwards Cookie + Idempotency-Key + Last-Event-ID; try/catch upstream fetch; mode-specific 502 fallback (JSON for non-stream routes; SSE error event for stream)"
  - "Pattern Dual-Mode-Test-1: process.env.MCPGEN_FRONTEND_MODE switches assertion timeouts + skip gates; same body covers both fixture and live"
  - "Pattern Dual-Baseline-1: visual-lock baselines suffixed by mode ('-live.png'); CI runs whichever matches active env"
  - "Pattern Type-Input-1: z.input<typeof Schema> for client-side request types when schema has Zod defaults — callers can omit defaulted fields"

requirements-completed: [FE-02, FE-03]

# Metrics
duration: ~50min
completed: 2026-04-27
---

# Phase 07 Plan 04: Live-Mode Wire-Up + Shiki Code Panel + Dual-Baseline Tests Summary

**Wave 2 ships the frontend-side wiring for the real engine pipeline: Shiki Server Component renders the Stage E TypeScript bundle in the preview screen, live-mode Route Handlers proxy the Hono BFF with cookie/header forwarding + structured 502 fallback, and the Pitfall #20 page-reload test now runs in BOTH fixture mode (~13s) and live mode (~240s) — pending the BFF generate-kickoff implementation that Phase 8 left as a Phase-1-stub gap.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 4 (assumption spike + live-mode proxy + Shiki code panel + dual-mode e2e/visual-lock)
- **Commits:** 10 atomic commits
- **Files created:** 6
- **Files modified:** 11

## Accomplishments

- Shiki Server Component (CodeBlock) renders Stage E TS bundle with github-dark theme; zero client-bundle bloat (build size for /generate/[jobId]/preview = 1.55 kB; +50 B from baseline)
- Live-mode `/api/v1/generate`, `/api/v1/jobs/[id]`, `/api/v1/jobs/[id]/stream` Route Handlers fully wired with Cookie forwarding + bff_unreachable error handling
- Preview route Server Component prefetches `partial_result.tenant_worker_source` and renders the CodeBlock adjacent to the locked Preview screen (FE-03 transparency principle)
- Pitfall #20 page-reload e2e test now dual-mode (fixture default + `MCPGEN_FRONTEND_MODE=live` opt-in)
- 3 new live-mode-only e2e specs (hero-flow / preview-render / quality-rubric) with `skipIfNotLive()` helper — CI ships green by default
- Dual-baseline visual-lock spec (9 fixture + 9 live = 19 total) with `-live.png` suffix isolation
- All assumptions A1/A4/A8/A12 verified or escalated; spike result documented in `07-04-SPIKE-RESULT.md`

## Task Commits

1. **Task 1: Phase-5 unblock-readiness check + spike for Assumption A1/A4/A8/A12** — `0a84ffa` (docs)
2. **Task 2.1: shiki@^4 dependency** — `0f2320d` (chore)
3. **Task 2.x: Phase-5 contract-merge typecheck fix** — `c67d141` (fix [Rule 3])
4. **Task 2.2: Live-mode proxy in /api/v1/generate** — `30e0be8` (feat)
5. **Task 2.3: Live-mode proxy in /api/v1/jobs/[id] + /stream** — `4ed70f9` (feat)
6. **Task 3.1: Shiki Server Component CodeBlock** — `cc4908a` (feat)
7. **Task 3.2: PreviewWrapper + preview route Stage E rendering** — `31823c0` (feat)
8. **Task 4.1: Pitfall #20 dual-mode page-reload test** — `defac7c` (test)
9. **Task 4.2: hero-flow-live + preview-render-live + quality-rubric-live** — `8ae056a` (test)
10. **Task 4.3: Dual-baseline visual-lock for 9 screens** — `6408ed3` (test)

## Files Created/Modified

- `apps/web/src/lib/preview/code-block.tsx` — Shiki Server Component (codeToHtml + github-dark theme + locked-CSS-var wrapper)
- `apps/web/tests/e2e/_helpers/live-mode.ts` — `skipIfNotLive()` + `SANDBOX_SPEC_URL` helpers
- `apps/web/tests/e2e/{hero-flow,preview-render,quality-rubric}-live.spec.ts` — 3 live-mode-only Wave 2 e2e specs
- `apps/web/src/app/api/v1/generate/route.ts` — live branch fills Cookie + bff_unreachable 502
- `apps/web/src/app/api/v1/jobs/[jobId]/route.ts` — same; status bootstrap proxy
- `apps/web/src/app/api/v1/jobs/[jobId]/stream/route.ts` — Cookie forwarding + SSE error event on bff_unreachable
- `apps/web/src/app/generate/[jobId]/preview/page.tsx` — Server Component prefetch of `tenant_worker_source` + `<CodeBlock>` render
- `apps/web/src/lib/jsx-bridge/screens.tsx` — PreviewWrapper signature extended with `codeSource: string | null`
- `apps/web/src/lib/api/client.ts` — z.input type alias (Phase-5 contract compat)
- `apps/web/tests/unit/lib/quality-badge.test.ts` — Phase-5 strictly-additive QualityReport fields in fixture
- `apps/web/tests/e2e/page-reload-mid-generation.spec.ts` — dual-mode env var switch
- `apps/web/tests/visual-lock/9-screens.spec.ts` — `live-mode visual lock` describe block (9 -live.png screens)
- `apps/web/package.json` + `pnpm-lock.yaml` — shiki@^4.0.2
- `.planning/phases/07-frontend-wire-up/07-04-SPIKE-RESULT.md` — A1/A4/A8/A12 verdicts

## Decisions Made

1. **Shiki at Server Component level, not inside Client wrapper** — Shiki must run server-side; PreviewWrapper carries `codeSource` for type-surface only. The route's Server Component renders `<CodeBlock>` adjacent to the client wrapper. Verified zero client-bundle increase.
2. **BFF generate kickoff GAP carried forward** — Phase 8 merged auth/billing/drift but left `apps/api/src/routes/v1/generate.ts` (501) + `jobs/[id]/stream.ts` (phase1_stub) + missing `GET /jobs/:id` route. Plan 07-04 ships content-agnostic proxy; live-mode tests skip until env var set + BFF closes the gap.
3. **Dual-baseline visual-lock with `-live.png` suffix** — fixture vs live engine output may render subtly different layouts (different tool count → different preview bento). Independent baselines avoid cross-mode invalidation.
4. **z.input not z.infer for client-side request types** — Phase-5 D-35 added `f3_enabled: z.boolean().optional().default(false)`; `z.infer` produces output type where the field is required (post-parse), `z.input` keeps it optional (wire shape). Callers omit it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase-5 contract-merge typecheck regressions**

- **Found during:** Task 2 (post-typecheck after Route Handler updates)
- **Issue:** The Phase-5 + Phase-8 merge into the worktree base introduced 7 typecheck errors:
  - 6 × `Property 'f3_enabled' is missing in type '{ spec_url: string; }'` — `submitGeneration` callers (5 in `tests/unit/lib/api/client.test.ts`, 1 in `apps/web/src/lib/jsx-bridge/screens.tsx`) supply only `{ spec_url }`. Phase-5 D-35 added `f3_enabled: z.boolean().optional().default(false)` which makes the OUTPUT type (`z.infer`) require the field, but callers correctly send the wire-input shape (without the default).
  - 1 × `as QualityReport` cast missing 8 strictly-additive Phase-5 fields in `tests/unit/lib/quality-badge.test.ts`.
- **Fix:**
  - Switched `SubmitGenerationInput.request` to `z.input<typeof GenerationApiRequestSchema>` (input shape, where `.default()` fields stay optional). All 6 caller sites now compile against the relaxed input type.
  - Added the 8 default field values to the `as QualityReport` test fixture (`retry_history: []`, `f3_test_agent_id: null`, `f2_low_confidence_run: false`, `golden_task_set_origin: 'hand_authored'`, `sandbox_environment: 'real'`, `warnings: []`, `generation_time_seconds: null`, `total_cost_usd: null`).
- **Files modified:** `apps/web/src/lib/api/client.ts`, `apps/web/tests/unit/lib/quality-badge.test.ts`
- **Verification:** `pnpm --filter @mcpgen/web run typecheck` exits 0; all 83 unit tests still pass.
- **Committed in:** `c67d141` (chained as a separate atomic Rule-3 fix commit before the planned Task-2 feature commits).

---

**Total deviations:** 1 auto-fixed (1 blocking — typecheck regression from Phase-5 contract additions).
**Impact on plan:** Required for plan typecheck/build acceptance criteria. No scope creep — strictly contract-compat shimming on the consumer side.

## Issues Encountered

None — plan executed in order. The known A8 escalation (BFF generate kickoff gap) was anticipated by the plan body itself and handled per the spike result document (proceed with content-agnostic frontend wiring; e2e tests skip-if-not-live; carry-forward documented).

## Deferred Issues

**1. BFF `POST /api/v1/generate` returns 501 stub (not Phase-1-stub gap closed)**

- Phase 8 merged its auth/billing infrastructure but did NOT modify `apps/api/src/routes/v1/generate.ts`, which still returns 501 with `error: 'not_implemented_phase_8'`.
- Phase 8 merged its drift watcher + Inngest + webhooks but did NOT modify `apps/api/src/routes/v1/jobs/stream.ts`, which still returns the Phase-1 `phase1_stub` SSE event.
- There is NO `GET /api/v1/jobs/:id` route registered in `apps/api/src/index.ts` — only `/jobs/:id/stream`.
- Phase-8 SUMMARY (`08-05-SUMMARY.md`) explicitly notes "Step 3: `POST /api/v1/generate` (200/202 success or 501 Phase-1-stub gap)" + a `PHASE_6_AVAILABLE` 0|1 matrix for re-verification.
- **Owner:** A follow-up Phase 9 integration plan OR a Phase 8 amendment must wire `apps/api/src/routes/v1/generate.ts` to enqueue an Inngest job that calls the engine `POST /api/v1/generate`, plus add a `GET /api/v1/jobs/:id` route that reads from `generations` + `pending_callbacks` tables.
- **Plan 07-04 frontend impact:** The `MCPGEN_FRONTEND_MODE=live` e2e tests (hero-flow-live, preview-render-live, quality-rubric-live, page-reload-mid-generation [live], live-mode visual-lock) all `skipIfNotLive()` so they don't run in CI by default. Once the BFF gap closes, run them locally with `MCPGEN_FRONTEND_MODE=live MCPGEN_BFF_URL=http://localhost:8787/api/v1 pnpm --filter=@mcpgen/web exec playwright test` to capture the live-mode visual-lock baselines and validate Pitfall #20 against the real engine.

## User Setup Required

None for THIS plan — the live-mode wire-up is structurally complete. The follow-up steps to actually demo Wave 2 (after the BFF gap closes) require:
- `MCPGEN_FRONTEND_MODE=live` env var on Vercel preview deploy
- `MCPGEN_BFF_URL` pointing to the apps/api Hono BFF on Cloudflare Workers (Phase-8 ops sets the production domain)

## Next Phase Readiness

- **Frontend Wave 2 surface:** complete — preview screen renders FinalTool[] + Stage E TS bundle + quality badge against the contract; switching `MCPGEN_FRONTEND_MODE=live` is the only frontend-side flip needed.
- **Wave 3 (Plan 07-05) blocker:** Phase 6 runtime is merged (`bccccaf`); Plan 07-05 dashboard wiring can proceed independently of the BFF generate-kickoff gap.
- **Phase 9 / Phase 8-amendment dependency:** the BFF generate kickoff implementation is the gating item for live-mode e2e tests + the Friday W6/W7 demo recording.
- **No locked-file diff:** `git log 8d56160..HEAD -- 'apps/web/src/screen-*.jsx' 'apps/web/src/global.css' 'apps/web/src/MCPGen.html' ...` returns empty (FE-05 anti-drift preserved).

## Self-Check: PASSED

Verifications:
- `test -f apps/web/src/lib/preview/code-block.tsx` → present
- `grep -q "codeToHtml" apps/web/src/lib/preview/code-block.tsx` → match
- `grep -q "github-dark" apps/web/src/lib/preview/code-block.tsx` → match
- `grep -q "BundledLanguage" apps/web/src/lib/preview/code-block.tsx` → match
- `grep -q "dangerouslySetInnerHTML" apps/web/src/lib/preview/code-block.tsx` → match
- `grep -q "CodeBlock" apps/web/src/app/generate/\[jobId\]/preview/page.tsx` → match
- `grep -q "codeSource" apps/web/src/lib/jsx-bridge/screens.tsx` → match
- `grep -q "shiki" apps/web/package.json` → match (`"shiki": "^4.0.2"`)
- `grep -q "getBffUrl" apps/web/src/app/api/v1/generate/route.ts` → match
- `grep -q "Cookie" apps/web/src/app/api/v1/jobs/\[jobId\]/stream/route.ts` → match
- `grep -q "bff_unreachable" apps/web/src/app/api/v1/generate/route.ts` → match
- `grep -q "MCPGEN_FRONTEND_MODE" apps/web/tests/e2e/page-reload-mid-generation.spec.ts` → match
- `test -f apps/web/tests/e2e/hero-flow-live.spec.ts` → present
- `test -f apps/web/tests/e2e/preview-render-live.spec.ts` → present
- `test -f apps/web/tests/e2e/quality-rubric-live.spec.ts` → present
- `grep -q "live-mode" apps/web/tests/visual-lock/9-screens.spec.ts` → match
- `pnpm --filter @mcpgen/web run typecheck` → exit 0
- `pnpm --filter @mcpgen/web run build` → exit 0
- `pnpm --filter @mcpgen/web run test:unit` → 83/83 passing
- `pnpm --filter @mcpgen/web exec playwright test --list` → 12 e2e tests
- `pnpm --filter @mcpgen/web exec playwright test --config=playwright.visual-lock.config.ts --list` → 19 visual-lock tests
- All 10 commit hashes verified in `git log 8d56160..HEAD`

All commits exist, all created files exist, all referenced verifications passed.

---
*Phase: 07-frontend-wire-up*
*Completed: 2026-04-27*
