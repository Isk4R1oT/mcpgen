---
phase: 7
slug: frontend-wire-up
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `07-RESEARCH.md` §"Validation Architecture" + Phase-1 D-21 cross-workstream test ownership.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6 (unit) + Playwright 1.59 (e2e + screenshot-diff) — both already declared/required in `apps/web/package.json` |
| **Config file** | `apps/web/vitest.config.ts` (Wave 0 creates) + `apps/web/playwright.config.ts` (Wave 0 creates) |
| **Quick run command** | `pnpm --filter @mcpgen/web test` (Vitest unit only — fast feedback per commit) |
| **Full suite command** | `pnpm --filter @mcpgen/web test:all` (Vitest + Playwright integration + Playwright screenshot-diff) |
| **Estimated runtime** | ~10s Vitest unit; ~60s Playwright integration; ~30s screenshot-diff (parallelized to ~75s total) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mcpgen/web test` (Vitest unit; covers `apps/web/src/lib/*` SSE-hook reconnect logic, idempotency-key generator, Claude-Desktop-config formatter, quality-badge tier mapper, fetch-client error mapping)
- **After every plan wave:** Run `pnpm --filter @mcpgen/web test:all` (full Vitest + Playwright integration + Playwright screenshot-diff in fixture mode)
- **Before `/gsd-verify-work`:** Full suite must be green; visual-lock CI guard (`git diff origin/main HEAD -- $UI_LOCKED_PATHS`) MUST also be empty
- **Max feedback latency:** 10s Vitest / 90s full

---

## Per-Task Verification Map

> Tasks are listed by plan stub. Plan numbers align with the wave-based layout from CONTEXT.md D-31..D-34. Wave 2 / Wave 3 tasks have `EXECUTION-BLOCKED-UNTIL: phase-{5,6}-merged` markers — they are pre-staged but not exercised in Wave 1 sampling.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | FE-05 | — | Lock guard regex matches actual locked paths | unit (bash) | `bash .pre-commit-hooks/check-ui-locked.sh` (against test fixture) | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | FE-05 | — | `apps/web/.unzip-commit-allowed` consumed by lock-update commit | unit (bash) | `test ! -f apps/web/.unzip-commit-allowed` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | FE-05 | — | jsx-bridge shim exposes window-global components as ESM | unit | `pnpm --filter @mcpgen/web test src/lib/jsx-bridge` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 1 | FE-05 | — | Visual-lock CI guard fails on locked-file diff | integration (CI) | `bash .github/workflows/scripts/visual-lock-guard.sh` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | FE-01 | T-7-12 | Landing form generates `Idempotency-Key: gen_${ulid}` per submit | unit | `pnpm --filter @mcpgen/web test src/lib/idempotency-key` | ❌ W0 | ⬜ pending |
| 7-02-02 | 02 | 1 | FE-01 | T-7-12 | localStorage rotates key on 202 with new `job_id` | integration | `pnpm --filter @mcpgen/web test:e2e tests/e2e/landing-submit.spec.ts` | ❌ W0 | ⬜ pending |
| 7-02-03 | 02 | 1 | FE-01 | — | App Router `app/page.tsx` imports `screen-landing.jsx` via bridge | screenshot-diff | `pnpm --filter @mcpgen/web test:visual landing` | ❌ W0 | ⬜ pending |
| 7-02-04 | 02 | 1 | FE-01 | — | Logto sign-in / sign-up routes via `(auth)` group | integration | `pnpm --filter @mcpgen/web test:e2e tests/e2e/auth.spec.ts` | ❌ W0 | ⬜ pending |
| 7-03-01 | 03 | 1 | FE-02 | — | Fixture-mode env router returns 202 + replays SSE timeline from `@mcpgen/engine-fixtures` | unit | `pnpm --filter @mcpgen/web test src/lib/fixture-mode` | ❌ W0 | ⬜ pending |
| 7-03-02 | 03 | 1 | FE-02 | — | Fixture-mode `?fixtures=true` query override gated by `NODE_ENV !== production` | unit | `pnpm --filter @mcpgen/web test src/lib/fixture-mode/guard` | ❌ W0 | ⬜ pending |
| 7-03-03 | 03 | 1 | FE-02 | T-7-20 | `useGenerationSSE` reconnect with exponential backoff (1s, 2s, 4s) then poll fallback | unit | `pnpm --filter @mcpgen/web test src/lib/sse/use-generation-sse` | ❌ W0 | ⬜ pending |
| 7-03-04 | 03 | 1 | FE-02 | T-7-20 | Page-reload mid-generation: kill SSE at t=5s, reload, replay event log + resume from `event_id` | e2e (mandatory) | `pnpm --filter @mcpgen/web test:e2e tests/e2e/page-reload-mid-generation.spec.ts` | ❌ W0 | ⬜ pending |
| 7-04-01 | 04 | 2 ⏸ | FE-02, FE-03 | — | Wave 2 unblock condition: real `apps/api` `/api/v1/generate` returns non-501 against sandbox spec | manual gate | `gsd-progress` confirms Phase 5 merged | ❌ W0 | ⬜ blocked-until-phase-5 |
| 7-04-02 | 04 | 2 ⏸ | FE-03 | — | Preview screen renders `FinalTool[]` with full code panel (transparency principle) | screenshot-diff | `pnpm --filter @mcpgen/web test:visual preview` | ❌ W0 | ⬜ blocked-until-phase-5 |
| 7-04-03 | 04 | 2 ⏸ | FE-03 | — | Quality badge tier mapping imports thresholds from `packages/contracts/launch-criteria.ts` | unit | `pnpm --filter @mcpgen/web test src/lib/quality-badge` | ❌ W0 | ⬜ blocked-until-phase-5 |
| 7-04-04 | 04 | 2 ⏸ | FE-02, FE-03 | T-7-20 | Page-reload test re-runs against REAL engine (not just fixture) | e2e | `pnpm --filter @mcpgen/web test:e2e tests/e2e/page-reload-mid-generation.spec.ts -- --mode=live` | ❌ W0 | ⬜ blocked-until-phase-5 |
| 7-05-01 | 05 | 3 ⏸ | FE-04 | — | Wave 3 unblock condition: tenant Worker deployed end-to-end + usage event in TimescaleDB | manual gate | `gsd-progress` confirms Phase 6 merged | ❌ W0 | ⬜ blocked-until-phase-6 |
| 7-05-02 | 05 | 3 ⏸ | FE-04 | T-7-30 | Server-name uniqueness collision: 409 response → rename modal with suggested alternative | e2e | `pnpm --filter @mcpgen/web test:e2e tests/e2e/deploy-collision.spec.ts` | ❌ W0 | ⬜ blocked-until-phase-6 |
| 7-05-03 | 05 | 3 ⏸ | FE-04 | — | Dashboard renders deployments + usage hourly aggregates + cost summary + F2/F3 badge | screenshot-diff + integration | `pnpm --filter @mcpgen/web test:visual dashboard && pnpm --filter @mcpgen/web test:e2e tests/e2e/dashboard.spec.ts` | ❌ W0 | ⬜ blocked-until-phase-6 |
| 7-05-04 | 05 | 3 ⏸ | FE-04 | — | One-click "Open in Claude Desktop" `claude://` protocol handler with copy-fallback | unit | `pnpm --filter @mcpgen/web test src/lib/claude-desktop` | ❌ W0 | ⬜ blocked-until-phase-6 |
| 7-06-01 | 06 | 1 | OPS-01 (cross) | T-7-12 | Sentry `beforeSend` strips `Authorization`, `X-Upstream-Auth`, `Cookie`, `?key=`, `?token=` | unit | `pnpm --filter @mcpgen/web test sentry.client.config` | ❌ W0 | ⬜ pending |
| 7-06-02 | 06 | 1 | OPS-01 (cross) | — | `withSentryConfig` source-map upload smoke test (Vercel preview) | manual | Vercel preview deploy + check Sentry release artifacts | ✅ existing | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⏸ blocked-until-phase-N (Wave 2/3 deferred per D-32/D-33)*

> **Wave gating note:** rows marked `⏸` are pre-staged at planning time but do NOT count toward Wave 1 verification. Their plan files carry `EXECUTION-BLOCKED-UNTIL: phase-{5,6}-merged` markers; the executor refuses to start them until upstream is green. Wave 1 alone (rows 7-01-* through 7-03-* + 7-06-*) is what `/gsd-verify-work` needs to pass for Phase 7 Wave 1 to ship.

---

## Wave 0 Requirements

> Wave 0 = test-infrastructure scaffolding executed BEFORE any Wave 1 task touches production code. Every Wave-0 stub starts as ❌ red and turns ✅ green only when the corresponding Wave-1 task lands.

- [ ] `apps/web/vitest.config.ts` — Vitest 1.6 config with `environment: 'jsdom'`, path alias to `apps/web/src/*`, `setupFiles: ['./vitest.setup.ts']`
- [ ] `apps/web/vitest.setup.ts` — global polyfills: `crypto.randomUUID` (for ULID), `localStorage` (jsdom default ok), `fetch` (msw not used per CONTEXT D-13)
- [ ] `apps/web/playwright.config.ts` — Playwright 1.59 config: 3 projects (`chromium`/`firefox`/`webkit`), `MCPGEN_FRONTEND_MODE=fixtures` env, `webServer` autostart `pnpm dev:fixtures`, `expect.toHaveScreenshot.maxDiffPixelRatio: 0.001` (≤0.1% pixel delta per D-04)
- [ ] `apps/web/playwright.visual-lock.config.ts` — separate config for screenshot-diff baseline against the 9 locked screens; baseline images committed under `apps/web/tests/visual-lock/__screenshots__/`
- [ ] `apps/web/tests/e2e/` — empty stubs for: `landing-submit.spec.ts`, `auth.spec.ts`, `page-reload-mid-generation.spec.ts` (mandatory per Pitfall #20 + ROADMAP SC#2), `deploy-collision.spec.ts` (Wave 3 stub), `dashboard.spec.ts` (Wave 3 stub)
- [ ] `apps/web/tests/visual-lock/__screenshots__/` — baseline directory; CI generates baseline on first green build, subsequent runs diff against it
- [ ] `apps/web/src/lib/__stubs__/` — Vitest stub directory for: `idempotency-key.test.ts`, `quality-badge.test.ts`, `claude-desktop.test.ts`, `fixture-mode.test.ts`, `sse/use-generation-sse.test.ts`
- [ ] `.github/workflows/frontend-ci.yml` — Phase-1 thin marker filled in: runs Vitest, Playwright (fixture mode), screenshot-diff, visual-lock guard `bash scripts/visual-lock-guard.sh`
- [ ] `.github/workflows/scripts/visual-lock-guard.sh` — `git diff --name-only origin/main HEAD -- "apps/web/src/MCPGen.html" "apps/web/src/*.jsx" "apps/web/src/global.css" "apps/web/src/uploads/"` → exit 1 if non-empty unless paired ADR exists (`docs/decisions/<date>-ui-lock-bump.md`)
- [ ] `apps/web/package.json` script additions: `dev:fixtures`, `dev:live`, `preview:fixtures`, `test`, `test:all`, `test:e2e`, `test:visual` (Phase 1 left these as no-ops per commit `ee60dee`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry source-map upload to private DSN works on Vercel preview | OPS-01 (cross-cutting) + D-29/D-30 | Requires actual Vercel preview deploy + private Sentry org access; cannot be exercised in CI without leaking auth tokens | After Wave 1 lands: `vercel deploy --target preview`; open Sentry org → Releases → confirm release artifact uploaded; verify a deliberate `throw new Error('redaction probe')` emits an event whose `request.headers` does NOT contain `Authorization`/`X-Upstream-Auth`/`Cookie` |
| Logto Cloud sign-in / sign-up flow against production tenant | FE-01 + CTRL-02 | Logto Cloud sandbox tenant credentials live in `.env.local` (per memory `reference_credentials.md`) — cannot be wired into CI without exposing tenant secret | Manual smoke after Wave 1 deploy: visit `/sign-in`, complete email + GitHub flows, land on `/dashboard` with a session cookie, confirm `localStorage` contains zero auth tokens (Pitfall #12) |
| Wave 1 60-second hero-flow Playwright timing assertion (paste URL → mock deploy URL ≤60s in fixture mode) | FE-01..FE-04 + PROJECT.md core value | `--max-duration` is enforced in CI but live network latency variability on Vercel preview can flake the assertion; manual verification on Friday demo cadence is the canonical gate | Friday W3/W4 demo: record screen capture of Wave 1 hero flow with stopwatch; submit clip per OPS-01 |
| Visual-lock CI guard against an actual rebase merge from `main` | FE-05 | The lock guard works against `origin/main` HEAD diff; verifying the EXIT-1 path requires deliberately editing a locked file in a PR — done once during Phase 7 Plan 1 review, not on every PR | One-time: open a PR that changes one byte of `apps/web/src/global.css`; assert CI fails with "ERROR: locked"; close PR without merging |
| Real-CF SSE 30-min spike against `apps/api` (Phase-1 D-15 fallback validation) | FE-02 | Phase 1 deferred real-CF SSE re-spike to Phase 10 per `01-PHASE-DEVIATIONS.md` rev 2; Phase 7 Wave 1 uses local Bun spike result + fixture-mode timeline | n/a in Wave 1; Wave 2 inherits Phase-5/Phase-10 verification |

---

## Validation Sign-Off

- [ ] All Wave-1 tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive Wave-1 tasks without automated verify (rows 7-01-01..7-03-04, 7-06-01 — covered)
- [ ] Wave 0 covers all MISSING references (vitest config, playwright config, e2e stub files, visual-lock guard script)
- [ ] No watch-mode flags (Vitest runs with `--run`; Playwright with `--reporter=line`)
- [ ] Feedback latency < 10s for Vitest unit / < 90s for full
- [ ] Wave 2/Wave 3 task rows preserved with `⏸ blocked-until-phase-{5,6}` status — executor must respect `EXECUTION-BLOCKED-UNTIL` markers
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 stubs land green

**Approval:** pending (Wave 0 not yet executed; turns approved when Plan 07-01 commits Wave-0 stub files)
