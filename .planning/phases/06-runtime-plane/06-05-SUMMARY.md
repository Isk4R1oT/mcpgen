---
phase: 06-runtime-plane
plan: 05
subsystem: runtime
tags: [cli, deploy, claude-desktop, bun-compile, ci, runtime]
requires:
  - 06-02   # tenant-worker-runner /admin/spawn endpoint
provides:
  - mcpgen-deploy-local      # `mcpgen deploy <bundle-dir>` end-to-end
  - mcpgen-deploy-cf-deferral # `--cf` exit-78 EX_CONFIG banner
  - claude-desktop-config-emit # paste-ready JSON block + collision detection
  - bun-compile-binary-matrix # 4-target CI cross-compile + verify
affects:
  - apps/cli                  # real deploy command replaces Phase-1 stub
  - .github/workflows         # new cli-binary-matrix.yml workflow
tech-stack:
  added:
    - vitest@1.6.0 in apps/cli devDependencies (CLI now has real tests)
    - softprops/action-gh-release@v2 (release artifact upload)
  patterns:
    - exit-78 EX_CONFIG deferral idiom mirrored from create-namespaces.sh
    - warn-and-continue collision handling (deploy succeeded, config emit non-fatal)
    - exactOptionalPropertyTypes-safe optional spawn param assembly
key-files:
  created:
    - apps/cli/src/runner-client.ts
    - apps/cli/src/claude-desktop-config.ts
    - apps/cli/src/commands/deploy.ts
    - apps/cli/src/commands/deploy-cf-deferral.ts
    - apps/cli/tests/claude-desktop-config.test.ts
    - apps/cli/tests/deploy.test.ts
    - apps/cli/tests/deploy-cf-deferral.test.ts
    - apps/cli/vitest.config.ts
    - .github/workflows/cli-binary-matrix.yml
  modified:
    - apps/cli/src/index.ts          # registerDeploy(program) replaces stub
    - apps/cli/build.ts              # --target / --upload-dir flags
    - apps/cli/package.json          # vitest devdep + test script
decisions:
  - exactOptionalPropertyTypes requires conditional assignment of optional spawn fields
  - Collision is warn-and-continue (exit 0) — deploy already succeeded; config emit side-effect
  - emitBlockToStdout is the safe default — never mutates user's claude_desktop_config.json
  - Build script accepts --target=<t> for selective single-target builds in CI matrix
metrics:
  duration: ~10 minutes
  completed: 2026-04-26
  tasks: 3
  files: 11
  tests: 11 (all passing)
---

# Phase 06 Plan 05: mcpgen deploy + Claude Desktop config + Bun-compile matrix Summary

## One-liner

Real `mcpgen deploy <bundle-dir>` CLI command — registers tenant via tenant-worker-runner /admin/spawn, emits paste-ready Claude Desktop config block with name+URL collision detection, ships as 4-target Bun-compiled single binary via GH Actions matrix.

## Closed Requirements

- **CLI-02** — `mcpgen deploy` real impl + `--cf` Phase-10 deferral (exit 78 EX_CONFIG)
- **CLI-03** — Bun-compile 4-target binary distribution (linux-x64, darwin-x64, darwin-arm64, windows-x64)
- **RUN-07** — One-click Claude Desktop config block with collision detection by name AND URL

## Tasks & Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | runner HTTP client + Claude Desktop config emitter (TDD, 7 tests) | `25c81f1` |
| 2 | deploy command + --cf deferral + index.ts wire-up (4 tests) | `0027129` |
| 3 | Bun-compile binary matrix CI workflow + build.ts hardening | `365c054` |

## Architecture Notes

### Deploy flow (local-mode default)

```
mcpgen deploy <bundle-dir>
  ↓ derive scriptName (basename, sanitised)
  ↓ POST localhost:8788/admin/spawn { scriptName, bundlePath }
  ↓ tenant-worker-runner allocates port (8790+), spawns Bun, upserts deployments row
  ↓ readExistingConfig() → buildBlock({ name, url }, existing)
       ├─ name collision? → throw mcp_server_name_collision
       └─ URL collision?  → throw mcp_server_url_collision
  ↓ emitBlockToStdout (paste-ready JSON; never mutates user config file)
  ↓ "✓ Deployed <scriptName> -> http://localhost:879N"  (exit 0)
```

### `--cf` deferral

`mcpgen deploy --cf` short-circuits to `emitCfDeferralBanner()` — writes the same `DEFERRED to Phase 10` banner shape as `infrastructure/cloudflare/scripts/create-namespaces.sh` and exits with code **78** (`EX_CONFIG`, sysexits.h "config is not in usable state"). The unified exit-78 idiom across bash + TS gives the user a single concept to learn for "this thing waits for Phase 10".

### Collision handling (WARNING-1)

Spawn already succeeded by the time we reach the config-emit step. So collision is **non-fatal**:
- stderr: `Claude Desktop config collision detected — emit skipped: <reason>` + hint at `--name <override>`
- stdout: still prints the success line (`✓ Deployed ...`)
- exit code: **0** (the deployment worked; config emit is a side-effect convenience)

Tests assert this contract via two cases — collision warn-and-continue, and `--name <override>` retry succeeding.

### Bun-compile matrix (1 build × 4 verify)

Per RESEARCH Open Question #7: cross-compile all 4 targets on a single ubuntu-24.04 runner (Bun supports cross-arch compile from Linux), then `--version`-verify each binary on its native OS:

| Target | Native verify OS |
| ------ | ---------------- |
| `bun-linux-x64`   | `ubuntu-latest` |
| `bun-darwin-x64`  | `macos-13` (Intel) |
| `bun-darwin-arm64`| `macos-14` (Apple Silicon) |
| `bun-windows-x64` | `windows-latest` |

`if: github.event_name == 'release'` gates a third job that uploads the staged binaries to the GitHub release via `softprops/action-gh-release@v2`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig `exactOptionalPropertyTypes` rejected `generationId: opts.generationId` spread**
- **Found during:** Task 2 typecheck
- **Issue:** `Type 'string | undefined' is not assignable to type 'string'` because `SpawnOptions.generationId?: string` (without `| undefined`) under `exactOptionalPropertyTypes: true` forbids passing `undefined` explicitly.
- **Fix:** Conditionally assign `generationId` only when `opts.generationId` is truthy (build the spawn options object incrementally).
- **Files modified:** `apps/cli/src/commands/deploy.ts`
- **Commit:** `0027129`

**2. [Rule 3 - Blocking] `package.json test` script `"vitest --run"` collided with `pnpm --filter @mcpgen/cli test --run`**
- **Found during:** Task 1 verify
- **Issue:** Plan's verify command appended `--run` again, producing `vitest --run --run` which CAC rejected with `Expected a single value for option "--run"`.
- **Fix:** Used `pnpm exec vitest --run <file>` directly during local verification. The CI workflow uses `pnpm test` which expands to a single `--run` correctly.
- **Files modified:** none (script was already correct, just test-invocation note)

### Auth gates / blockers

None.

## Threat Model Status

- **T-6-30 (Tampering — config collision):** mitigated by `buildBlock` checking BOTH `mcpServers.{name}` and URL; warn-and-continue contract; `--name <override>` documented in stderr hint.
- **T-6-INFRA-09 (malicious bundle path):** accepted — local-dev tool only; runner binds to localhost; user vetted bundle directories themselves.
- **T-6-INFRA-10 (unsigned binaries):** accepted — codesign deferred to Phase 9/10. Verify-job confirms `--version` runs on each native OS, which is the MVP smoke gate.

## Self-Check: PASSED

Files created and committed:
- `apps/cli/src/runner-client.ts` (commit 25c81f1) — FOUND
- `apps/cli/src/claude-desktop-config.ts` (commit 25c81f1) — FOUND
- `apps/cli/src/commands/deploy.ts` (commit 0027129) — FOUND
- `apps/cli/src/commands/deploy-cf-deferral.ts` (commit 0027129) — FOUND
- `.github/workflows/cli-binary-matrix.yml` (commit 365c054) — FOUND

All 11 tests passing (`pnpm exec vitest --run` in `apps/cli`):
- claude-desktop-config.test.ts: 7 tests
- deploy-cf-deferral.test.ts: 1 test
- deploy.test.ts: 3 tests

Local single-target Bun build succeeded:
- `dist/mcpgen-bun-linux-x64` produced; JSON summary line printed.

Commits in history:
- `25c81f1` (Task 1) — FOUND
- `0027129` (Task 2) — FOUND
- `365c054` (Task 3) — FOUND
