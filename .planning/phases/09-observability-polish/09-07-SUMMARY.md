---
phase: 09-observability-polish
plan: 07
subsystem: infra
tags: [sentry, sourcemaps, observability, ci, sentry-cli, turborepo]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "@sentry/nextjs withSentryConfig wired in apps/web/next.config.js (auto-upload during build)"
  - phase: 09-observability-polish
    provides: "@sentry/cloudflare 10.x init in apps/api + apps/dispatch (D-03 redaction Plan 09-01)"
provides:
  - "scripts/sourcemaps/upload-all.sh repo-root orchestrator with skip-when-no-token guard"
  - "pnpm sourcemaps:upload root script entry point (Phase 10 CI hook)"
  - "Per-app sourcemaps:upload scripts in apps/api, apps/dispatch (sentry-cli) + apps/web (no-op stub)"
  - "turbo.json sourcemaps:upload task with cache=false + ^build dependency"
  - ".env.example documenting CI-only SENTRY_AUTH_TOKEN env contract"
  - "vitest skip-test gate proving exit-0 + skip message when token absent"
affects: [10-launch, ci-cd, deploy-pipeline]

# Tech tracking
tech-stack:
  added: []  # No new deps — uses existing @sentry/cli (pinned PATTERNS.md Standard Stack)
  patterns:
    - "Skip-when-no-token guard pattern (D-01 + D-05 local-mode invariant) — bash early exit with set -euo pipefail"
    - "Per-app convenience scripts mirroring orchestrator block (CI can invoke either)"
    - "DRY_RUN flag for testing per-app loop without real sentry-cli invocation"
    - "CI-only env documented in .env.example with explicit T-9-sourcemaps-01 callout"

key-files:
  created:
    - "scripts/sourcemaps/upload-all.sh — repo-root orchestrator (chmod +x, skip-when-no-token, DRY_RUN)"
    - ".env.example — full env contract w/ SENTRY_AUTH_TOKEN CI-only callout"
    - "apps/api/tests/observability/sourcemaps-skip-when-no-token.test.ts — 4 vitest assertions"
  modified:
    - "package.json — added sourcemaps:upload root script"
    - "apps/api/package.json — added sourcemaps:upload sentry-cli command"
    - "apps/dispatch/package.json — added sourcemaps:upload sentry-cli command"
    - "apps/web/package.json — added sourcemaps:upload no-op stub (auto-upload via @sentry/nextjs)"
    - "apps/generation-engine/pyproject.toml — comment block documenting Phase 10 deferral"
    - "turbo.json — registered sourcemaps:upload task (cache=false, dependsOn ^build)"

key-decisions:
  - "CI-only SENTRY_AUTH_TOKEN — explicit .env.example callout with T-9-sourcemaps-01 reference (developer-machine compromise = prod source-map write access)"
  - "DRY_RUN env var for the orchestrator instead of mocking sentry-cli — keeps tests fast and deterministic without per-test process substitution"
  - "Per-app dist/ existence check inside the orchestrator (graceful skip with build-hint message) instead of hard-fail — the script may run before build completes during early CI iteration"
  - "apps/generation-engine documented in pyproject.toml comments only (not in [project.scripts]) — Phase 10 ships the actual sentry-cli Python wheel invocation; Phase 9 wires the contract"
  - "turbo.json cache=false for sourcemaps:upload — sentry-cli network side effects are not cacheable"

patterns-established:
  - "Repo-root orchestrator + per-app convenience commands: same pnpm-script name across all 4 apps (sourcemaps:upload), one bash entry point at scripts/sourcemaps/upload-all.sh"
  - "Skip-guard at top of script (early exit 0) before any side effects — preserves D-01 empty-DSN invariant across 4 app upload paths"

requirements-completed: [CTRL-08]

# Metrics
duration: ~12min
completed: 2026-04-30
---

# Phase 09 Plan 07: Sourcemaps Upload Pipeline Summary

**Repo-root `pnpm sourcemaps:upload` orchestrator with skip-when-no-token guard wires per-app `@sentry/cli` invocations for apps/api + apps/dispatch; apps/web auto-uploads via `@sentry/nextjs`; apps/generation-engine deferred to Phase 10 — closes D-05.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-30T20:30:00Z (approx)
- **Completed:** 2026-04-30T20:34:00Z (approx)
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 7 (1 created script, 1 created env example, 1 created test, 4 modified package files, 1 modified turbo.json, 1 modified pyproject.toml)

## Accomplishments

- **Skip-when-no-token contract documented + tested.** `bash scripts/sourcemaps/upload-all.sh` with empty `SENTRY_AUTH_TOKEN` exits 0 immediately and prints `[sourcemaps] SENTRY_AUTH_TOKEN not set — skipping upload (local mode per D-01)`. Verified by 3 of the 4 vitest assertions.
- **Per-app upload commands wired without dependency churn.** `apps/api/package.json` + `apps/dispatch/package.json` use the existing `@sentry/cli` (already pinned via PATTERNS.md Standard Stack); apps/web ships a no-op stub script (auto-upload via `@sentry/nextjs withSentryConfig` already in `next.config.js`).
- **CI-only env contract surfaced in `.env.example`.** Explicit `# === Sentry source maps (CI-only — DO NOT add to .env.local per Sentry security guidance) ===` section with T-9-sourcemaps-01 callout. Phase 10 CI provisions `SENTRY_AUTH_TOKEN` + per-app project IDs; Phase 9 only ships placeholders.
- **Turborepo task registered** with `cache=false` (network side effects) and `dependsOn ^build` (per-app `dist/` must exist before upload).

## Task Commits

Each task was committed atomically (TDD: RED + GREEN):

1. **Task 1 (RED): failing skip-when-no-token test** — `045119b` (test)
2. **Task 1 (GREEN): wire orchestrator + per-app commands + env doc** — `3eec0ee` (feat)

_No REFACTOR commit — implementation was minimal and idiomatic on first pass._

## Files Created/Modified

**Created:**
- `scripts/sourcemaps/upload-all.sh` — bash orchestrator (chmod 755). Skip guard, `VERSION` derivation from `SENTRY_RELEASE` or `git rev-parse --short HEAD`, `DRY_RUN` flag, per-app blocks for apps/api + apps/dispatch with `dist/` existence checks, info-level apps/web + apps/generation-engine messages.
- `.env.example` — committed env contract. 9 sections (Database, OpenRouter, Cloudflare, Sentry DSNs, Sentry source maps, Langfuse, Inngest, BetterStack). The Sentry source maps section carries the CI-only warning verbatim from threat T-9-sourcemaps-01.
- `apps/api/tests/observability/sourcemaps-skip-when-no-token.test.ts` — 4 vitest assertions:
  1. Script exists and is executable (`statSync().mode & 0o111 > 0`)
  2. Empty `SENTRY_AUTH_TOKEN` → exit 0 + "skipping upload" stdout
  3. Unset `SENTRY_AUTH_TOKEN` (key omitted from env) → exit 0 + skip
  4. `SENTRY_AUTH_TOKEN=fake SOURCEMAPS_DRY_RUN=1` → exit 0 + apps/api announcement, no skip message

**Modified:**
- `package.json` — added `"sourcemaps:upload": "bash scripts/sourcemaps/upload-all.sh"` to root scripts.
- `apps/api/package.json` — added `"sourcemaps:upload": "@sentry/cli sourcemaps upload --release ${SENTRY_RELEASE:-$(git rev-parse --short HEAD)} dist/"`.
- `apps/dispatch/package.json` — same per-app sentry-cli command.
- `apps/web/package.json` — no-op stub with explanatory message (apps/web auto-uploads via `@sentry/nextjs withSentryConfig`).
- `apps/generation-engine/pyproject.toml` — `[tool.uv.sources]` section appended with comment block documenting Phase 10 invocation pattern (`sentry-cli sourcemaps upload --release "$VERSION" --upload-source dist/`).
- `turbo.json` — added `sourcemaps:upload` task: `dependsOn: ^build`, `outputs: []`, `cache: false`.

## Decisions Made

See `key-decisions` in frontmatter. The most consequential: **the orchestrator runs `dist/` existence checks per app and emits an info-level skip message instead of hard-failing**. Rationale: in early CI iteration, the build step may run in a separate Turbo job; a hard fail would break the pipeline. The check lets the orchestrator be safely re-run.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block enumerated 10 steps; all 10 were performed verbatim. The plan's `<verify>` automated command (`pnpm --filter @mcpgen/api test -- --run tests/observability/sourcemaps-skip-when-no-token.test.ts && bash scripts/sourcemaps/upload-all.sh`) ran clean.

## Issues Encountered

- **Concurrent commit from a parallel 09-06 agent (`6b2c53d test(09-06): add Inngest orphan audit static-source AST scan`) landed between RED and GREEN.** Confirmed via `git log` author timestamp (`Apr 30 20:32:25`); not from this session. Verified the 09-07 RED + GREEN commits are contiguous in plan-scope (separate file paths from 09-06) and the working tree had no merge conflicts. No action needed.
- **Stray untracked file `apps/generation-engine/tests/observability/test_run_tracing_spike.py`** present at session start (origin: prior plan). Excluded from the 09-07 GREEN commit via `git restore --staged`; left as-is in the working tree (Rule: scope-only fixes; not 09-07's concern).

## User Setup Required

None — Phase 9 ships the command + skip path; Phase 10 CI provisions the token.

## Phase 10 Carry-forward (Token Provisioning)

Phase 10 must, in CI secret store (GitHub Actions / Cloudflare / Vercel / Fly):
1. Provision `SENTRY_AUTH_TOKEN` (org-scoped from sentry.io → org settings → auth tokens). Reference: `.env.example` line 56-57 (the SENTRY_AUTH_TOKEN entry + warning).
2. Provision `SENTRY_ORG` and per-app project IDs: `SENTRY_PROJECT_API`, `SENTRY_PROJECT_DISPATCH`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_ENGINE`. Reference: `.env.example` lines 58-62.
3. Wire `pnpm sourcemaps:upload` into the production deploy job AFTER `wrangler deploy` (apps/api + apps/dispatch) and AFTER `next build` (apps/web — auto-handled by @sentry/nextjs).
4. For apps/generation-engine: replace the pyproject.toml comment block with an actual `sentry-cli sourcemaps upload --release "$VERSION" --upload-source dist/` once the PyInstaller bundle target is added.

## Self-Check: PASSED

- Script exists and is executable: `scripts/sourcemaps/upload-all.sh` (mode 755) — FOUND
- Script contains `SENTRY_AUTH_TOKEN`: FOUND (line 25 + line 51 ref)
- Script contains `skipping upload`: FOUND (line 26)
- Root `package.json` `scripts` contains `sourcemaps:upload`: FOUND
- `apps/api/package.json` `scripts` contains `sourcemaps:upload`: FOUND
- `apps/dispatch/package.json` `scripts` contains `sourcemaps:upload`: FOUND
- `.env.example` contains `SENTRY_AUTH_TOKEN`: FOUND
- `.env.example` contains `CI-only`: FOUND
- Test file exists and contains `SENTRY_AUTH_TOKEN`: FOUND
- Vitest run: 4 tests pass (162 passed total in apps/api suite, 0 regressions)
- Bash run with empty token: exit 0 + "skipping upload (local mode per D-01)"
- Commits exist: `045119b` (test) — FOUND; `3eec0ee` (feat) — FOUND

---
*Phase: 09-observability-polish*
*Plan: 07*
*Completed: 2026-04-30*
