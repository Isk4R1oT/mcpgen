---
phase: 01-foundation
plan: 08
subsystem: infra
tags: [sse, hono, wrangler, fresh-clone-smoke, phase-verification, deferred-cf, deferred-fly]

# Dependency graph
requires:
  - phase: 01-foundation/01-05
    provides: "apps/api/src/routes/_spike/sse.ts (Hono streamSSE 90s spike route) + apps/api/scripts/spike-sse.sh (curl-based client)"
  - phase: 01-foundation/01-04
    provides: "Direct Neon connection proven via db:test-migrate (Hyperdrive replacement for dev)"
  - phase: 01-foundation/01-07
    provides: "PHASE-DEVIATIONS revision 2 lock + CF deferral guard scripts"
provides:
  - "Local-Bun SSE spike PASS (FND-15 modified scope) — 9 events, last id=8 at t=80s, stream closes at t=90s"
  - "docs/decisions/004-local-bun-sse-spike.md decision record + Phase-10 release-gate carry-forward"
  - "01-PHASE-VERIFICATION.md cross-referencing 8 SC + 19 REQ-IDs + 9 threats + 8 pitfalls"
  - "01-SUMMARY.md (phase-level) with locked rationale string + per-plan completion table + local port map"
  - "Fresh-clone E2E green: pnpm install/build/typecheck/test + uv sync + pytest + pre-commit all exit 0"
  - "Source-of-truth docs (CLAUDE.md + RULES.md + docs/mcpgen-*.md + claude-design-ui/) committed to git (Rule-1 fix for fresh-clone smoke)"
affects: [02-engine, 03-bff, 06-runtime, 10-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local-Bun SSE acceptance via wrangler dev --local with explicit Phase-10 carry-forward note for the real-CF gap"
    - "Fresh-clone E2E via temporary git clone (Option A) — sanitises against working-tree-only state and surfaces uncommitted-doc bugs"
    - "Phase-level SUMMARY.md (this plan creates 01-SUMMARY.md) distinct from per-plan SUMMARYs (01-NN-SUMMARY.md) — phase-level has scope rationale + per-plan table + carry-forward; per-plan has task commits + deviations"

key-files:
  created:
    - "docs/decisions/004-local-bun-sse-spike.md"
    - ".planning/phases/01-foundation/01-08-SPIKE-RESULT.md"
    - ".planning/phases/01-foundation/01-PHASE-VERIFICATION.md"
    - ".planning/phases/01-foundation/01-SUMMARY.md"
    - ".planning/phases/01-foundation/01-08-SUMMARY.md (this file)"
  modified:
    - "(none — Plan 08 modified scope is acceptance + verification, no source code changes beyond the doc-commit Rule-1 fix)"
  added_to_git_via_rule_1_fix:
    - "CLAUDE.md, RULES.md (project source-of-truth refs)"
    - "docs/mcpgen-architecture.md, docs/mcpgen-generation-engine-v2.md, docs/mcpgen-git-workflow-rules.md, docs/mcpgen-gsd-sprint-plan.md, docs/mcpgen-implementation-plan.md, docs/mcpgen-model-and-provider-override.md"
    - "docs/mcpgen-pass-{0..5}-design.md, docs/mcpgen-stage-{e,f}-design.md, docs/mcpgen-ux-flow.md"
    - "claude-design-ui/DESIGN.md, claude-design-ui/MCP-Gen.zip"

key-decisions:
  - "Plan 08 executed under modified scope per PHASE-DEVIATIONS.md rev 2: real-CF SSE spike replaced with local-Bun spike (wrangler dev --local on port 8787); Hyperdrive provisioning replaced with direct Neon (proven by Plan 04 Task 4)"
  - "Local-Bun spike acceptance is at t=80s for the last event (id=8 — the 9th event in the route's 9-event sequence), not t=85s as the original plan stated. Route emits at 10s intervals starting t=0; the 90s loop-exit boundary keeps the stream open until t=90s. The 'event at t≥80s + stream alive at t≥85s' result satisfies D-15's substantive intent (long-lived SSE > 60s without runtime-imposed cut)"
  - "Real-CF spike + Phase-10 launch-criteria gate constants are NOT added to launch-criteria.ts in Phase 1 because doing so would create false-valued runtime constants that gate every Phase 2-9 build. Phase 10 owns the gate addition AND the verification in the same window (paired decision-log entry mandatory per T-1-03)"
  - "Fresh-clone E2E via temporary git clone (Option A) over working-tree pnpm install (Option B) — surfaces uncommitted-doc bugs. Specifically caught the CLAUDE.md/RULES.md/docs/* uncommitted-files bug that broke launch-criteria.test.ts cross-doc consistency assertions"
  - "Rule-1 auto-fix: committed CLAUDE.md + RULES.md + 11 mcpgen-*.md docs + claude-design-ui/ to git in commit 1de0589. These are gitleaks-allowlisted via .gitleaks.toml so secret-scan stays clean. The cross-doc test in launch-criteria.test.ts is now satisfied across both main tree and fresh clones"
  - "Phase 1 status remains in_progress until verifier-agent runs (auto-advance enabled per .planning/config.json workflow.auto_advance=true). Plan 08 marks 8/8 plans complete but the phase-goal verification gate is the verifier agent, not this plan"

patterns-established:
  - "SSE spike acceptance via local Bun (workerd) with explicit gap documentation — when the production runtime can't be exercised in dev, document the gap as a release gate rather than skipping the empirical check entirely"
  - "Phase-1 closeout doc shape: 8 success criteria × {PASS, DEFERRED, DOWNGRADED, PARTIAL} × evidence pointer; 19 REQ-IDs traceability table; 9 T-1-XX threat IDs; carry-forward checklist for items deferred"
  - "Phase-level SUMMARY.md structure: rationale string (locked, user-direction) + per-plan completion table + local port map + 8 SC status + Phase-10 carry-forward — distinct from per-plan SUMMARYs which document task commits + deviations"

requirements-completed: [FND-15, CTRL-01]

# Metrics
duration: ~25min  # local Bun spike (~95s) + fresh-clone E2E (~3min) + 19-doc commit + 4 markdown docs + 4 commits
completed: 2026-04-26
---

# Phase 1 Plan 08: Local Bun SSE Spike + Fresh-Clone E2E + Phase-1 Closeout Summary

**Hono streamSSE empirically validated locally via `wrangler dev --local` on port 8787 (9 events received, last event id=8 at t=80s, stream closes at t=90s); fresh-clone E2E green across all 7 commands (after Rule-1 fix committing CLAUDE.md + RULES.md + docs/mcpgen-* + claude-design-ui/ to git); Phase-1 verification doc + phase-level SUMMARY authored — Phase 1 ships with 6 plans complete + 2 plans complete-modified-scope and 2 explicit Phase-10 deferrals (real-CF SSE spike + Logto Pro-tier staging dry-run).**

## Modified Scope

This plan was executed under the modified scope documented in
[`./01-PHASE-DEVIATIONS.md`](./01-PHASE-DEVIATIONS.md) revision 2 plus the
explicit user direction in the executor prompt.

### In scope (executed)

1. **Local Bun SSE spike** — `wrangler dev --local --port 8787` runs the unmodified Plan 05 route (`apps/api/src/routes/_spike/sse.ts`); client (`apps/api/scripts/spike-sse.sh`) consumes the stream via `curl -N --max-time 100`. PASS — 9 events received over 90 seconds, last event (id=8) at t=80s, stream closes cleanly at t=90s on the route's `Date.now() - start < 90_000` exit condition. Drift cumulative +13ms over 80s. Decision recorded at `docs/decisions/004-local-bun-sse-spike.md`.

2. **Fresh-clone E2E smoke** — Option A (temporary clone): `git clone --no-local` to a tmp dir, then `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r typecheck && pnpm -r test`, `cd apps/generation-engine && uv sync && uv run pytest -q -k 'not smoke'`, and `pre-commit run --all-files`. All 7 commands exit 0 after the Rule-1 fix.

3. **Phase-1 PHASE-VERIFICATION.md** — `.planning/phases/01-foundation/01-PHASE-VERIFICATION.md` covering all 8 ROADMAP success criteria (PASS / DEFERRED / DOWNGRADED / PARTIAL), 19 REQ-IDs, 9 T-1-XX threats, 8 mapped pitfalls, and 7-item Phase-10 carry-forward task list.

4. **Phase-1 01-SUMMARY.md** (phase-level) — locked rationale string ("CF Workers / Workers for Platforms / Fly.io migration deferred to Phase 10. Phases 1-9 use local compute + cloud services hybrid (Neon + Logto + OpenRouter + Langfuse-local). Decision rationale: avoid $30+/month recurring during dev iteration."), per-plan completion table (8 plans), local port map, 8 SC status, Phase-10 carry-forward.

### Out of scope (DEFERRED to Phase 10)

- Hyperdrive provisioning for production BFF (replaced in Phase 1 by direct Neon — already proven by Plan 04 Task 4 via `db:test-migrate`)
- Real CF Workers deploy of the SSE spike (the actual 30s sub-request validation — `wrangler deploy --upload-source-maps --name mcpgen-api-spike` to `mcpgen-sandbox` is a Phase-10 launch-readiness gate)
- Logto Cloud Pro-tier staging dry-run (deferred — staging requires the deferred CF deploy)

## Performance

- **Duration:** ~25 min total
- **Spike test wall-clock:** 90s (server-side loop exit at t=90s)
- **Fresh-clone E2E wall-clock:** ~3 min (clone + install + build + typecheck + test + uv sync + pytest + pre-commit)
- **Doc authoring:** 4 markdown documents (decision, spike-result, verification, phase-summary) + 1 per-plan summary (this file)
- **Commits:** 4 (atomic; one per task)

## Accomplishments

- Hono streamSSE empirically validated for 90-second long-running streams under workerd local runtime (functional baseline for Phase 8 BFF impl).
- Fresh-clone E2E green across 7 commands (TS install/build/typecheck/test + Python sync/test + pre-commit) — Phase-1 success criterion #1 PASS confirmed against a clean tmp clone, not just the working tree.
- Phase-1 closeout doc cross-references every ROADMAP success criterion + REQ-ID + threat ID + pitfall to a verifying artifact; explicit DEFERRED / DOWNGRADED / PARTIAL statuses with Phase-10 carry-forward.
- Rule-1 auto-fix discovered and committed: project source-of-truth docs (CLAUDE.md, RULES.md, docs/mcpgen-*.md, claude-design-ui/) were never in git despite being referenced from `packages/contracts/tests/launch-criteria.test.ts`; commit `1de0589` lands them as a `chore(01-08)` Rule-1 fix.
- Phase-level 01-SUMMARY.md (distinct from per-plan SUMMARYs) authored with the locked user-direction rationale string + 8-plan completion table + local port map + Phase-10 carry-forward.

## Task Commits

Plan 08 ran under modified scope as a 4-task sequence (vs the original plan's 4 tasks, but task content differs per PHASE-DEVIATIONS.md rev 2):

1. **Task 1: Run local-Bun SSE spike + author decision record + raw evidence** — `b050b91` (feat)
   - Spike server: `wrangler dev --local --port 8787` (workerd 4.85.0, compatibility_date 2026-04-24, nodejs_compat)
   - Spike client: `bash apps/api/scripts/spike-sse.sh http://localhost:8787/_spike/sse` (curl --max-time 100)
   - Result: PASS (9 events, last id=8 at t=80s, stream closes at t=90s)
   - Files: `docs/decisions/004-local-bun-sse-spike.md` + `.planning/phases/01-foundation/01-08-SPIKE-RESULT.md`

2. **Task 2: Rule-1 auto-fix — commit project source-of-truth docs to fix fresh-clone smoke** — `1de0589` (chore)
   - Discovered while running fresh-clone E2E (Option A: tmp git clone). `packages/contracts/tests/launch-criteria.test.ts` reads CLAUDE.md and `docs/mcpgen-stage-f-design.md`; both were authored in the working tree but never committed.
   - Committed: CLAUDE.md, RULES.md, 11× docs/mcpgen-*.md, claude-design-ui/DESIGN.md, claude-design-ui/MCP-Gen.zip (19 files, 15285 lines)
   - Verified: gitleaks PASS (paths allowlisted in `.gitleaks.toml`); fresh-clone re-run PASS

3. **Task 3: Author Phase-1 verification doc + phase-level SUMMARY** — `d285955` (docs)
   - 01-PHASE-VERIFICATION.md (8 SC + 19 REQ-IDs + 9 threats + 8 pitfalls + Phase-10 carry-forward)
   - 01-SUMMARY.md (phase-level, with locked rationale string + per-plan table + port map)

4. **Task 4: This per-plan SUMMARY** — `<this commit>` (docs)
   - 01-08-SUMMARY.md
   - STATE.md, ROADMAP.md, REQUIREMENTS.md updates

## Files Created/Modified

### Created (Plan 08)

- `docs/decisions/004-local-bun-sse-spike.md` — decision record + transcript + Phase-10 release-gate carry-forward
- `.planning/phases/01-foundation/01-08-SPIKE-RESULT.md` — raw evidence (transcript, timing, server boot log)
- `.planning/phases/01-foundation/01-PHASE-VERIFICATION.md` — closeout cross-reference (350 lines)
- `.planning/phases/01-foundation/01-SUMMARY.md` — phase-level summary with rationale + per-plan table + port map
- `.planning/phases/01-foundation/01-08-SUMMARY.md` — this file

### Committed via Rule-1 fix (project source-of-truth docs that were already authored but never landed in git)

- `CLAUDE.md`, `RULES.md`
- `docs/mcpgen-architecture.md`, `docs/mcpgen-generation-engine-v2.md`, `docs/mcpgen-git-workflow-rules.md`, `docs/mcpgen-gsd-sprint-plan.md`, `docs/mcpgen-implementation-plan.md`, `docs/mcpgen-model-and-provider-override.md`
- `docs/mcpgen-pass-{0..5}-design.md`, `docs/mcpgen-stage-{e,f}-design.md`, `docs/mcpgen-ux-flow.md`
- `claude-design-ui/DESIGN.md`, `claude-design-ui/MCP-Gen.zip`

### Modified

- (none — Plan 08 is acceptance + verification, no source code changes beyond the doc-commit Rule-1 fix)

## Decisions Made

- **Local-Bun SSE acceptance is the Phase-1 gate; real-CF re-spike is a Phase-10 release gate.** Per `01-PHASE-DEVIATIONS.md` rev 2 + explicit objective. The local Bun spike (`wrangler dev --local`) does NOT validate the production CF Workers 30s sub-request limit — gap documented in `docs/decisions/004-local-bun-sse-spike.md` "Consequences > Gap (explicit)" and "Phase-10 release gates".
- **Phase-10 launch-criteria gate constants are NOT added to `launch-criteria.ts` in Phase 1.** Adding them now would create `false`-valued runtime constants gating every Phase 2-9 build. Phase 10 owns the gate addition AND the verification in the same window. Paired decision-log entry mandatory per T-1-03.
- **Fresh-clone E2E via temporary git clone (Option A), not working-tree pnpm install (Option B).** Rationale: Option B masks uncommitted-file bugs (and Plan 08 caught exactly such a bug — the source-of-truth docs were never committed despite being referenced from a contracts test).
- **Phase-level 01-SUMMARY.md is distinct from per-plan 01-08-SUMMARY.md.** Phase-level has scope rationale + per-plan table + local port map + Phase-10 carry-forward (lives at `01-SUMMARY.md`); per-plan has task commits + deviations (lives at `01-NN-SUMMARY.md`).
- **Plan 08 acceptance is at t=80s for the last event, not t=85s.** The route emits at 10s intervals starting t=0 (9 events: t=0/10/.../80); the loop exits when wall-time reaches 90s. The "event at t≥80s + stream alive at t≥85s" result satisfies D-15's substantive intent (long-lived SSE > 60s without runtime-imposed cut).

## Deviations from Plan

The plan was executed against the modified scope summarised above. Deviations from the *original* plan (revision 0) are all explicitly authorised by [`01-PHASE-DEVIATIONS.md`](./01-PHASE-DEVIATIONS.md) revision 2 and the user-provided objective.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Source-of-truth docs not committed to git, breaking fresh-clone smoke**

- **Found during:** Task 2 (fresh-clone E2E smoke run from a temporary `git clone --no-local`)
- **Issue:** `packages/contracts/tests/launch-criteria.test.ts` reads `CLAUDE.md` and `docs/mcpgen-stage-f-design.md` to assert cross-doc launch-criteria consistency (T-1-03 defense; written in Plan 01-03). On the first fresh-clone run, both reads failed with `ENOENT` because those source-of-truth docs were authored in the working tree but never committed. This broke the Phase-1 success criterion #1 (`pnpm -r test` from a fresh clone).
- **Fix:** Committed CLAUDE.md, RULES.md, 11× `docs/mcpgen-*.md`, and `claude-design-ui/{DESIGN.md, MCP-Gen.zip}` to git (commit `1de0589`). Gitleaks allowlist (`.gitleaks.toml [allowlist].paths`) already covered `docs/`, `.planning/`, and `claude-design-ui/` so secret-scan stays clean.
- **Files added to git:** 19 (15285 lines)
- **Verification:** Re-ran fresh-clone E2E (`pnpm install/build/typecheck/test`, `uv sync`, `uv run pytest -q -k 'not smoke'`, `pre-commit run --all-files`) — all 7 commands exit 0.
- **Committed in:** `1de0589` (separate atomic commit per Plan 08 task discipline; the source-of-truth docs commit is functionally part of fresh-clone-E2E-Task-2's "make it green" responsibility, but factored into its own commit for traceability and per the user's CLAUDE.md "Keep changes minimal and related to the current request" — the doc commit IS the fix for the test failure)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The auto-fix is essential for correctness (Phase-1 success criterion #1 fails without it). It adjusted which-files-are-committed but did not expand scope — the plan's gate is "fresh-clone E2E green", and that gate cannot pass without the docs in git. No scope creep.

## Issues Encountered

- **`wrangler dev --local` requires a Hyperdrive local-emulation env var.** First boot attempt failed with `When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality.` Resolved by exporting `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to the Neon dev branch DATABASE_URL (the spike route does not exercise the binding, but workerd validates all bindings at boot). Documented in `01-08-SPIKE-RESULT.md` "Server boot environment".
- **`.env.local` shell-parser-incompatibility from `&` in DATABASE_URL.** `set -a && source .env.local && set +a` failed at line 10 because the URL contains `&channel_binding=require` and shell tries to background `&channel_binding=require` as a subprocess. Resolved by extracting DATABASE_URL via `python3` parser; documented as a one-time workaround in this plan's verification flow. Future plans should use `python3` (or another non-shell extractor) for `.env.local` reads when the values may contain shell metacharacters.

## User Setup Required

None — Plan 08 is acceptance + verification + doc authoring. No external service configuration required.

(Phase-1 already required user setup for Logto Cloud (Plan 07) + Neon (Plan 04 evidence); both completed before this plan ran.)

## Next Phase Readiness

- **Phase 2 (Generation Engine — Architect: Pass 0 + Pass 1)** unblocked. All Phase-2 prerequisites satisfied (MODEL singleton, Day-1 Qwen smoke test, IR Zod source, engine fixtures, OPS-03 fresh-session header convention).
- **Phase 6 (Runtime Plane)** — engine-fixtures available for parallel work; CF dispatch deploys deferred per `01-PHASE-DEVIATIONS.md` rev 2.
- **Phase 7 (Frontend Wire-Up)** — engine-fixtures available; UI locked at `claude-design-ui/MCP-Gen.zip` (now committed via Rule-1 fix).
- **Phase 8 (Auth + Billing)** — usage-event simulator can replay against engine-fixtures.
- **Phase 9 (Observability & Polish)** — ready for cross-tenant fuzz + multi-client smoke + Inngest orphan audit.
- **Phase 10 (Launch)** — gains 7 carry-forward items per `01-PHASE-VERIFICATION.md` §"Phase-10 Carry-Forward Tasks" (CF namespaces, Hyperdrive, real-CF SSE re-spike, Fly deploy, Logto Pro-tier staging, Vercel deploy of `apps/web`, Phase-10 launch-criteria gate constants with paired decision-log entry).

## Self-Check: PASSED

Verified after writing this SUMMARY:

- All 5 created files exist on disk: `test -f` for each entry above (4 markdown docs + this file).
- All 4 task commits present in `git log`: `b050b91` (Task 1 spike), `1de0589` (Rule-1 docs fix), `d285955` (verification + phase summary), and the upcoming Task 4 commit (this file + STATE/ROADMAP/REQ updates).
- Fresh-clone E2E re-confirmed: `pnpm install/build/typecheck/test`, `uv sync`, `uv run pytest -q -k 'not smoke'`, `pre-commit run --all-files` — all 7 commands exit 0 against a temporary `git clone --no-local`.
- Local-Bun SSE spike timing recorded: 9 events received, last event (id=8) at t=80s, stream closes at t=90s.
- All 8 ROADMAP success criteria mapped to a verifying artifact in `01-PHASE-VERIFICATION.md`; 19 REQ-IDs + 9 T-1-XX threats + 8 pitfalls all covered.
- Phase-level `01-SUMMARY.md` includes the locked rationale string verbatim, per-plan completion table (8 plans), local port map, and Phase-10 carry-forward.
- FND-15 marked complete (modified scope: local Bun spike); CTRL-01 marked complete (frozen contract surface, SSE handler shape empirically validated).

---
*Phase: 01-foundation*
*Completed: 2026-04-26*
