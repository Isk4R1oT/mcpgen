---
phase: 01-foundation
plan: 07
subsystem: infra
tags: [engine-fixtures, logto, cloudflare, runbooks, ops, deferred-cf, deferred-fly]

# Dependency graph
requires:
  - phase: 01-foundation/01-03
    provides: "@mcpgen/ir Zod schemas (RawIR, FinalTool, QualityReport) — fixtures validate against these"
  - phase: 01-foundation/01-03
    provides: "@mcpgen/contracts LAUNCH_CRITERIA (F2 ≥ 4.0, F3 ≥ 0.7) — fixture quality reports must clear these gates"
provides:
  - "@mcpgen/engine-fixtures package with 5 hand-crafted Pass-5 fixture sets (Stripe, GitHub, Notion, Linear, Slack)"
  - "Per-fixture SOURCE.md provenance markers (grep-verifiable spec_url + source_section)"
  - "Logto env-var contract (LOGTO_ENDPOINT/APP_ID/APP_SECRET/BASE_URL) consumed by apps/web + apps/api"
  - "Logto reference scaffold.ts (typecheck-clean, idempotent procedure for re-creation)"
  - "Phase-10-deferred CF namespace creation script with deferral guard (exit 78 if run in Phase 1–9)"
  - "4 ops runbooks: friday-demo-cadence (OPS-01), per-phase-fresh-session (OPS-03), logto-pro-upgrade (T-1-06), migration-conflicts (T-1-04)"
affects: [02-engine, 03-bff, 04-stage-e, 05-stage-f, 06-runtime, 07-frontend, 08-billing, 09-observability, 10-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-crafted JSON fixtures with grep-verifiable SOURCE.md provenance — distinguishes hand-tuning from LLM hallucination"
    - "Phase-10 deferral guard pattern: scripts that exit 78 (EX_CONFIG) in current phase but stay bash-syntax-valid for CI"
    - "Reference-only TypeScript scripts (REFERENCE ONLY top-of-file marker + dedicated tsconfig.json for typecheck)"

key-files:
  created:
    - "packages/engine-fixtures/{stripe,github,notion,linear,slack}/{ir.json,final-tools.json,quality-report.json,SOURCE.md}"
    - "packages/engine-fixtures/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,tests/shape.test.ts,README.md}"
    - "infrastructure/cloudflare/README.md"
    - "infrastructure/cloudflare/scripts/create-namespaces.sh (deferred guard)"
    - "infrastructure/logto/README.md"
    - "infrastructure/logto/scaffold.ts (REFERENCE ONLY)"
    - "infrastructure/logto/tsconfig.json"
    - "docs/runbooks/README.md"
    - "docs/runbooks/friday-demo-cadence.md"
    - "docs/runbooks/per-phase-fresh-session.md"
    - "docs/runbooks/logto-pro-upgrade.md"
    - "docs/runbooks/migration-conflicts.md"
  modified:
    - "pnpm-lock.yaml (added @mcpgen/engine-fixtures workspace package)"

key-decisions:
  - "Deferred CF dispatch namespace creation to Phase 10 per PHASE-DEVIATIONS.md revision 2; create-namespaces.sh ships with exit-78 deferral guard so the canonical procedure is reviewed/linted now and ready for Phase 10 enablement"
  - "Logto tenant configured manually by user; scaffold.ts is REFERENCE ONLY (idempotent procedure for re-creation, never executed in Phase 1)"
  - "Fixture quality reports use the actual @mcpgen/ir QualityReport Zod shape (f1_static/f2_smell.overall_average/f3_agent_eval.pass_rate) — the plan's prose-level shape (f1.passed/f2.avg_score) is illustrative, not authoritative; the Zod schema wins"
  - "Plan 07 marked complete (modified scope): items deferred per PHASE-DEVIATIONS.md (CF namespaces + Pro-tier staging dry-run) are not blockers for Phase 1 closure"

patterns-established:
  - "Engine fixture provenance: every hand-crafted fixture directory has a SOURCE.md with grep-verifiable spec_url + source_section keys — these are the runtime acceptance criterion that distinguishes hand-tuned fixtures from LLM hallucination"
  - "Deferral guard: scripts that should not run in current phase exit 78 (EX_CONFIG) at top, with a BEGIN/END enablement marker block below for Phase-N activation"
  - "Reference-only TS scripts: top-of-file `// REFERENCE ONLY —` comment + dedicated tsconfig.json (with `types: [\"node\"]`) for typecheck cleanliness without forcing the script into the runtime path"

requirements-completed: [FND-07, FND-13, OPS-01, OPS-03]

# Metrics
duration: 16min
completed: 2026-04-26
---

# Phase 1 Plan 07: Engine Fixtures + Logto Documentation + Ops Runbooks Summary

**Five hand-crafted Pass-5 fixtures (Stripe/GitHub/Notion/Linear/Slack) + Logto env-var contract & reference scaffold + 4 ops runbooks + CF-namespace deferral guard — Phase 1 closes with all parallel-workstream blockers cleared and CF/Fly compute work cleanly deferred to Phase 10.**

## Modified Scope

This plan was executed under the modified scope documented in
[`.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md`](./01-PHASE-DEVIATIONS.md) revision 2 plus the
explicit user direction "Logto scaffold IS done (we have credentials)".

### In scope (executed)

1. **5 hand-crafted engine fixtures** — `packages/engine-fixtures/{stripe,github,notion,linear,slack}/` with `ir.json` + `final-tools.json` + `quality-report.json` + `SOURCE.md` (FND-07).
2. **Logto README** — env-var contract + reachability check (FND-13). Documentation-only — user manually configured the tenant.
3. **Logto scaffold.ts** — typecheck-clean reference script with `// REFERENCE ONLY —` top-of-file marker. Idempotent. Not executed in Phase 1.
4. **Logto Pro-upgrade runbook** — `docs/runbooks/logto-pro-upgrade.md` (T-1-06 mitigation).
5. **3 ops runbooks** — `friday-demo-cadence.md` (OPS-01), `per-phase-fresh-session.md` (OPS-03), `migration-conflicts.md` (Pitfall #18).
6. **CF namespace creation script with deferral guard** — `infrastructure/cloudflare/scripts/create-namespaces.sh` ships with `exit 78` guard; `bash -n` exits 0; running it exits 78. Phase-10 enablement removes the BEGIN/END marker block.

### Out of scope (deferred per PHASE-DEVIATIONS.md rev 2)

- Running CF namespace creation (Phase 10).
- Running Logto scaffold (user did it manually).
- Logto Pro-upgrade staging dry-run (deferred — staging requires the Phase-10 CF deploy).
- `cf-namespace-count` CI assertion job in `main-ci.yml` (deferred — assertion is meaningless until namespaces exist on the live account).
- `list-namespaces.sh` companion script (deferred — bundled with the CI assertion).

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-26T15:02:20Z
- **Completed:** 2026-04-26T15:18:00Z (approx)
- **Tasks:** 3 (Task 4 [BLOCKING] dropped per modified scope — user already handled Logto manually; CF deferred)
- **Files created:** 36 (24 in `packages/engine-fixtures/`, 3 in `infrastructure/cloudflare/`, 3 in `infrastructure/logto/`, 5 in `docs/runbooks/`, 1 SUMMARY)

## Accomplishments

- All 5 D-07 fixtures shipped with grep-verifiable SOURCE.md provenance (spec_url + source_section markers); 25 shape tests pass.
- Pitfall #24 mitigation operational: frontend (Phase 7), runtime (Phase 6), and ops (Phase 8) parallel workstreams now have realistic Pass-5 output to wire against before Phase 2 produces real engine output.
- Logto env-var contract documented and frozen — downstream apps depend on `LOGTO_ENDPOINT/APP_ID/APP_SECRET/BASE_URL` exactly.
- Logto scaffold.ts ships as a typecheck-clean reference (idempotent, never executed in Phase 1) — future re-creation of `mcpgen-staging` / `mcpgen-sandbox` has a canonical script.
- CF namespace creation deferred cleanly with an exit-78 guard — `bash -n` parses (CI lint stays green), running fails loudly with actionable Phase-10 enablement instructions.
- 4 ops runbooks committed: Friday demo cadence (OPS-01), per-phase fresh-session header (OPS-03), Logto Pro pre-buy (T-1-06), Drizzle migration conflict resolution (T-1-04 / Pitfall #18).

## Task Commits

1. **Task 1: 5 engine fixtures** — `957bda4` (feat)
2. **Task 2: CF namespace creation script with Phase-10 deferral guard** — `ad29ccd` (chore)
3. **Task 3: Logto README + scaffold.ts + 4 ops runbooks** — `d98d649` (docs)

## Files Created

### packages/engine-fixtures/ (FND-07, Pitfall #24)

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `tests/shape.test.ts`, `README.md`
- `stripe/ir.json` + `final-tools.json` (9 tools: 6 universal + charges_capture/charges_refund/subscriptions_cancel) + `quality-report.json` + `SOURCE.md`
- `github/ir.json` + `final-tools.json` (10 tools: 6 universal + issues_close/pull_requests_merge/releases_create + create_pr_from_branch workflow) + `quality-report.json` + `SOURCE.md`
- `notion/ir.json` + `final-tools.json` (6 tools: pure Six-Tool — no actions or workflows) + `quality-report.json` + `SOURCE.md`
- `linear/ir.json` + `final-tools.json` (9 tools: 6 universal + issues_create_with_relations/issues_archive/cycles_advance) + `quality-report.json` + `SOURCE.md`
- `slack/ir.json` + `final-tools.json` (10 tools: 6 universal + messages_send/messages_edit/channels_archive + send_with_thread_followup workflow) + `quality-report.json` + `SOURCE.md`

### infrastructure/cloudflare/ (FND-09 deferred)

- `README.md` — documents the 3-namespace cap (D-08, FND-09), three-layer T-1-05 defense plan (pre-commit + script + Phase-10 CI assertion), local-only dev port map.
- `scripts/create-namespaces.sh` — exit-78 deferral guard with Phase-10 enablement marker block.

### infrastructure/logto/ (FND-13)

- `README.md` — env-var contract, reachability-check command, sign-in methods (CTRL-02 anti-pattern #5: ONLY GitHub), self-host migration runbook (D-14).
- `scaffold.ts` — REFERENCE ONLY idempotent procedure to ensure mcpgen-web + mcpgen-engine-m2m apps and the GitHub connector exist on a tenant. Never logs secrets.
- `tsconfig.json` — local tsconfig (`types: ["node"]`) so `pnpm exec tsc --noEmit -p infrastructure/logto/tsconfig.json` is clean.

### docs/runbooks/ (OPS-01, OPS-03, T-1-04, T-1-06)

- `README.md` — index of runbooks + OPS-03 fresh-session header convention summary.
- `friday-demo-cadence.md` — OPS-01: Mon–Thu Loom + Friday EOD edit + Saturday post; missing 2 Fridays in a row triggers retro.
- `per-phase-fresh-session.md` — OPS-03: plan-file MUST re-read header + per-phase-area conditional entry table.
- `logto-pro-upgrade.md` — T-1-06: W7 Pro pre-buy procedure, monitoring (Phase 9), self-host trigger.
- `migration-conflicts.md` — T-1-04 / Pitfall #18: Drizzle prefix collision resolution + sub-second collision recovery + bad-migration recovery.

## Decisions Made

- **Defer CF namespace creation to Phase 10** with an in-script `exit 78` guard. Rationale: per PHASE-DEVIATIONS.md rev 2, all CF compute provisioning is Phase 10's job; the canonical procedure ships now (so it's reviewed and linted in Phase 1) but cannot accidentally run.
- **Logto scaffold.ts is REFERENCE ONLY**, not executed in Phase 1. Rationale: user has already configured the prod tenant manually. The script remains valuable as the canonical procedure for re-creating `mcpgen-staging` / `mcpgen-sandbox` later, and as a Phase-1 typecheck-clean test of the API shape we'll script against in CI later.
- **Fixture QualityReport shape follows the actual `@mcpgen/ir` Zod schema** (`f1_static.passed` / `f2_smell.overall_average` / `f3_agent_eval.pass_rate`), not the prose-level shape sketched in the plan's `<interfaces>` block (`f1.passed` / `f2.avg_score` / `f3.server_pass_rate`). Rationale: the test (`shape.test.ts`) validates against the Zod schema; the schema wins by Plan 03's contract-freeze decision.
- **Plan 07 status: `complete (modified scope)`**. Items deferred to Phase 10 (CF namespace creation + Pro-tier staging dry-run + CI assertion job) are documented in PHASE-DEVIATIONS.md and tracked there; they do not block Phase 1 closure.

## Deviations from Plan

The plan was executed against the modified scope summarised above. Deviations from the *original* plan (revision 0) are all explicitly authorised by `01-PHASE-DEVIATIONS.md` revision 2 and the user-provided objective; they are scope-pivot deferrals, not auto-fixes during execution.

No Rule 1 / Rule 2 / Rule 3 auto-fixes were needed during the actual three-task execution — every fixture file, runbook, and reference script landed on the first attempt.

**Notable scope adjustment (not a deviation per Rule 4):**

- The plan's Task 2 originally included `list-namespaces.sh` and a `cf-namespace-count` job appended to `.github/workflows/main-ci.yml`. Per the modified scope, these were dropped (deferred to Phase 10 alongside actual namespace creation — the CI assertion is meaningless until namespaces exist on the live CF account). The `create-namespaces.sh` deferral-guard mode preserves the architectural intent without those companion pieces.
- The plan's Task 3 originally included a `[BLOCKING]` Task 4 user-action checkpoint for CF + Logto provisioning. Both halves were dropped: CF deferred to Phase 10; Logto handled by the user manually before this plan ran.

## Issues Encountered

- **scaffold.ts typecheck initially failed** because the workspace `tsconfig.base.json` does not include `@types/node`. Resolved by adding `infrastructure/logto/tsconfig.json` with `types: ["node"]` and a relative-path extends (`../../tsconfig.base.json`) — the file is not a workspace member, so the canonical workspace `@mcpgen/shared-config/tsconfig` resolution doesn't work in that path.

## User Setup Required

None — the user manually completed the Logto Cloud setup before this plan ran; CF namespace creation is deferred to Phase 10 per PHASE-DEVIATIONS.md rev 2.

The Logto env vars expected in `.env.local`:
- `LOGTO_ENDPOINT` — `https://<tenant-id>.logto.app`
- `LOGTO_BASE_URL` — `http://localhost:3000` (dev) or `https://app.mcpgen.dev` (prod)
- `LOGTO_APP_ID` — from Logto Console → Applications → MCPGen Web
- `LOGTO_APP_SECRET` — same dialog (never commit)

## Next Phase Readiness

- Phase 1 closes with Plan 07 complete (modified scope) and Plan 08 next. Plan 08 will likely also be touched by PHASE-DEVIATIONS.md revision 2 (the SSE-spike-on-real-CF gate moves to Phase 10's launch criteria).
- Phase 2 (engine passes) unblocked: every Pass implementation can now `import { stripe, github, notion, linear, slack } from '@mcpgen/engine-fixtures'` to wire integration tests against realistic non-trivial Pass-5 output.
- Phase 6 (runtime) unblocked on the fixture side; CF dispatch deploys still deferred per PHASE-DEVIATIONS.md.
- Phase 7 (frontend) unblocked: dashboard mocks can use real-shaped `qualityReport` data.
- Phase 8 (billing) unblocked: usage-event simulator can replay against real-shaped tools.
- Phase 9 (observability) unblocked: Sentry/Langfuse traces can be replayed against fixtures without engine output.
- Phase 10 (launch): CF namespace creation, Hyperdrive provisioning, Fly.io engine deploy, Logto Pro staging dry-run, real-CF SSE spike — all queued per `PHASE-DEVIATIONS.md` revision 2.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- All 36 created files exist on disk (`test -f` for each entry above).
- All 3 task commits present in `git log`: `957bda4` (Task 1), `ad29ccd` (Task 2), `d98d649` (Task 3).
- 25 shape tests pass: `pnpm --filter @mcpgen/engine-fixtures test`.
- Workspace clean: `pnpm -r build && pnpm -r typecheck && pnpm -r test` all green.
- `bash -n infrastructure/cloudflare/scripts/create-namespaces.sh` exits 0; running it exits 78.
- `pnpm exec tsc --noEmit -p infrastructure/logto/tsconfig.json` exits 0.
- All grep markers present (spec_url + source_section per fixture; T-1-06/W7/5K MAU in logto-pro-upgrade; OPS-01/Friday EOD in friday-demo-cadence; T-1-04/drizzle-kit check in migration-conflicts; OPS-03/MUST re-read in runbooks README).

---
*Phase: 01-foundation*
*Completed: 2026-04-26*
