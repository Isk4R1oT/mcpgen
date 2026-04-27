---
phase: 6
slug: runtime-plane
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `06-RESEARCH.md` §"Validation Architecture" (line 993+) and tied to the 9 Phase-6 requirements (RUN-01..07, CLI-02, CLI-03).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.0 (workspace standard from Phase 1; pinned in `packages/shared-config/`) |
| **Config file** | per-app `vitest.config.ts` (workspace pattern from Plan 01-05) |
| **Quick run command** | `pnpm -r --filter "./apps/dispatch" --filter "./apps/dispatch-sample" --filter "./apps/cli" --filter "./apps/tenant-worker-runner" --filter "./apps/inngest-dev" test --run` |
| **Full suite command** | `pnpm -r test --run` (workspace-wide, includes contract tests + cross-tenant fuzz) |
| **Estimated runtime** | ~45 seconds full suite (includes Postgres-touching integration tests against Neon dev DB) |
| **Load-test command** | `bun run apps/tenant-worker-runner/tests/p99-load.test.ts` (Bun-native harness; not part of vitest run) |
| **E2E smoke command** | `pnpm -r --filter "./tests/runtime" test --run` (full dispatch + sample + Inngest pipeline) |

---

## Sampling Rate

- **After every task commit:** Run quick run command (filtered to changed apps).
- **After every plan wave:** Run full suite command + cross-tenant smart-ID fuzz fixture.
- **Before `/gsd-verify-work`:** Full suite must be green AND P99 load test must report `< 50ms` over 30-second 100-rps run AND E2E smoke against `apps/dispatch-sample` must complete the full MCP `initialize` → `tools/list` → `tools/call` → usage-event → reconciler-skeleton flow.
- **Max feedback latency:** 45 seconds full suite; 10 seconds quick run.

---

## Per-Task Verification Map

> Tasks below are illustrative — `gsd-planner` will produce the canonical task IDs in `06-NN-PLAN.md` files. The verification mechanisms here are the contract those plans must satisfy.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-W0-01 | 00 | 0 | RUN-* | — | Drizzle migration `20260428000000_add_local_port_to_deployments.sql` pushed to Neon dev | migration | `pnpm --filter @mcpgen/contracts db:test-migrate` | ❌ W0 | ⬜ pending |
| 6-W0-02 | 00 | 0 | RUN-06 | — | Drizzle migration `20260428000001_add_idempotency_key_to_usage_events.sql` pushed to Neon dev (closes contract-vs-DB drift identified in research §"Open Questions" #6) | migration | `pnpm --filter @mcpgen/contracts db:test-migrate` | ❌ W0 | ⬜ pending |
| 6-01-01 | 01 | 1 | RUN-01 | T-6-01 / pitfall #11 | Dispatch on `localhost:8789` resolves tenant via Postgres `deployments` + 5-min in-memory cache; never creates a 2nd dispatch namespace | integration | `pnpm --filter @mcpgen/dispatch test --run dispatch.routing.test.ts` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | RUN-01 | T-6-04 / pitfall #4 | Dispatch parses MCP `protocolVersion` and rewrites `tools/list` (strips `outputSchema`) for clients <2025-06-18 | integration | `pnpm --filter @mcpgen/dispatch test --run capability-gating.test.ts` | ❌ W0 | ⬜ pending |
| 6-01-03 | 01 | 1 | RUN-01 | T-6-15 / pitfall #15 | `hostHeaderValidation` middleware rejects requests with `Host` not in `ALLOWED_HOSTS` env (default `localhost,127.0.0.1` in dev) | unit | `pnpm --filter @mcpgen/dispatch test --run host-header-validation.test.ts` | ❌ W0 | ⬜ pending |
| 6-01-04 | 01 | 1 | RUN-01 | T-6-01 / pitfall #1 | Cross-tenant smart-ID fuzz: dispatch returns 403 `smart_id_tenant_mismatch` when smart-ID prefix doesn't match addressed tenant | fuzz | `pnpm --filter @mcpgen/dispatch test --run smart-id-fuzz.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | RUN-02 | T-6-14 / pitfall #14 | `apps/tenant-worker-runner/` spawns one Bun child process per active deployment on `localhost:8790+`; admin endpoints `/admin/spawn`, `/admin/kill`, `/admin/list` work end-to-end | integration | `pnpm --filter @mcpgen/tenant-worker-runner test --run supervisor.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 2 | RUN-02 | — | `apps/dispatch-sample` (3 hand-coded Stripe tools) wired through new dispatch + auth + usage pipeline; replaces Phase-1 `createStubRuntime()` with real `@mcpgen/runtime` factory | E2E | `pnpm --filter ./tests/runtime test --run dispatch-sample.e2e.test.ts` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 3 | RUN-03 | T-6-12 / pitfall #12 | Pass-through middleware decrypts `X-Upstream-Auth` via HKDF-derived key per request, forwards to upstream, NEVER persists; deliberate-leak audit returns zero `Bearer ` matches | security | `pnpm --filter @mcpgen/runtime test --run passthrough-credentials.test.ts && pnpm --filter @mcpgen/runtime test --run pii-leak-audit.test.ts` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 3 | RUN-04 | T-6-09 | Stored credentials use AES-256-GCM with per-tenant DEK in `bun:sqlite`; DEK wrapped under `RUNTIME_KEK` env var; `get/put/delete` interface mirrors CF KV binding | unit + integration | `pnpm --filter @mcpgen/runtime test --run stored-credentials-aes.test.ts` | ❌ W0 | ⬜ pending |
| 6-03-03 | 03 | 3 | RUN-05 | T-6-10 | OAuth-mode stub returns structured `{ error: "oauth_mode_phase_10_deferral", deferred_to_phase: 10 }` payload; `auth_mode = "oauth"` routes to stub; FE-04 detection contract honored | unit | `pnpm --filter @mcpgen/runtime test --run oauth-stub.test.ts` | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 4 | RUN-06 | T-6-13 / pitfall #13 | Tenant Worker → `ctx.waitUntil(send_to_inngest_dev(...))` → Inngest dev (`:8288`) → `usage-events-ingest-v1` writes to TimescaleDB `usage_events` hypertable; idempotent on `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` | integration | `pnpm --filter ./tests/runtime test --run usage-events-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 6-04-02 | 04 | 4 | RUN-06 | T-6-13 / pitfall #13 | KV fallback bucket (local SQLite) catches Inngest-dev send failures; `usage-fallback-drain-v1` runs every 5 min and re-emits to Inngest | integration | `pnpm --filter @mcpgen/inngest-dev test --run fallback-drain.test.ts` | ❌ W0 | ⬜ pending |
| 6-04-03 | 04 | 4 | CTRL-09 | — | Inngest function IDs are stable strings (`usage-events-ingest-v1`, `usage-fallback-drain-v1`, `usage-reconciler-v1`, `warm-keep-active-tenants-v1`); orphan audit returns zero | unit | `pnpm --filter @mcpgen/inngest-dev test --run function-ids-stable.test.ts` | ❌ W0 | ⬜ pending |
| 6-04-04 | 04 | 4 | RUN-06 | — | `usage-reconciler-v1` skeleton reads TimescaleDB hourly aggregates, logs would-be Stripe payload (Phase 8 wires real Stripe call) | unit | `pnpm --filter @mcpgen/inngest-dev test --run reconciler-skeleton.test.ts` | ❌ W0 | ⬜ pending |
| 6-05-01 | 05 | 5 | CLI-02 | T-6-30 / pitfall #30 | `mcpgen deploy <bundle>` registers Postgres `deployments` row, calls `tenant-worker-runner /admin/spawn`, returns `localhost:879N` URL + Claude Desktop config block with collision detection on name AND URL | integration | `pnpm --filter @mcpgen/cli test --run deploy.test.ts` | ❌ W0 | ⬜ pending |
| 6-05-02 | 05 | 5 | CLI-02 | — | `mcpgen deploy --cf` returns Phase-10 deferral banner (exit 78) without attempting wrangler deploy | unit | `pnpm --filter @mcpgen/cli test --run deploy-cf-deferral.test.ts` | ❌ W0 | ⬜ pending |
| 6-05-03 | 05 | 5 | RUN-07 | T-6-30 / pitfall #30 | One-click Claude Desktop config block: paste-ready JSON for macOS / Windows / Linux config paths; collision detection rejects duplicates by name OR URL | unit | `pnpm --filter @mcpgen/cli test --run claude-desktop-config.test.ts` | ❌ W0 | ⬜ pending |
| 6-05-04 | 05 | 5 | CLI-03 | — | Bun-compile binary matrix produces 4 binaries (`bun-darwin-arm64/x64`, `bun-linux-x64`, `bun-windows-x64`); npm `optionalDependencies` per-OS selector + GitHub release artifact upload | CI | `bun run apps/cli/build.ts && ls dist/mcpgen-bun-*` | ❌ W0 | ⬜ pending |
| 6-06-01 | 06 | 5 | RUN-02 | T-6-14 / pitfall #14 | Bun-native P99 harness reports P99 < 50ms over 30-second 100-rps run against fixed-latency stub upstream | load | `bun run apps/tenant-worker-runner/tests/p99-load.test.ts` | ❌ W0 | ⬜ pending |
| 6-06-02 | 06 | 5 | RUN-02 | T-6-14 / pitfall #14 | `warm-keep-active-tenants-v1` Inngest cron pings `/health` on each tenant Worker port every 5 min; Inngest function ID matches CTRL-09 stable-string convention | unit | `pnpm --filter @mcpgen/inngest-dev test --run warm-keep.test.ts` | ❌ W0 | ⬜ pending |
| 6-06-03 | 06 | 5 | RUN-03 | T-6-12 / pitfall #12 | Sentry `beforeSend` redaction in `@mcpgen/runtime` scrubs `Authorization`, `X-Upstream-Auth`, `Cookie`, plus spec-declared auth headers; deliberate-leak fixture proves zero hits | security | `pnpm --filter @mcpgen/runtime test --run sentry-redaction.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ❌ W0 = file not yet created (tracked in Wave 0)*

---

## Wave 0 Requirements

> Wave 0 = files that must exist BEFORE any test in the verification map can run. The planner injects these as the first wave.

- [ ] `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` — adds `local_port INTEGER NULL` column to `deployments` (RESEARCH.md Open Question #1, recommended new migration). **`[BLOCKING]` schema push task** runs `pnpm --filter @mcpgen/contracts db:test-migrate` after authoring.
- [ ] `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` — adds `idempotency_key TEXT NOT NULL` + `UNIQUE (deployment_id, idempotency_key)` constraint to `usage_events` (RESEARCH.md Open Question #6 — closes contract-vs-DB drift). **`[BLOCKING]` schema push task** + `chore(contracts):` PR per OPS-02.
- [ ] `apps/tenant-worker-runner/` scaffold — Bun child-process supervisor with admin endpoints (RESEARCH.md Open Question #2: recommended new app, NOT folded into `apps/dispatch/`).
- [ ] `apps/inngest-dev/` scaffold — local Inngest dev runner home (RESEARCH.md Open Question #4: recommended new dedicated app vs. polluting dispatch or BFF).
- [ ] `tests/runtime/` workspace package — cross-app E2E smoke harness (per Phase-1 D-21 cross-workstream test ownership).
- [ ] `tests/runtime/fixtures/smart-id-fuzz.ts` — shared fuzz regex sourced from `@mcpgen/ir` `SmartIdSchema` (single source of truth between F1 fixture in Phase 5 + dispatch runtime check in Phase 6).
- [ ] `tests/runtime/fixtures/mock-mcp-clients.ts` — three real-world MCP client `protocolVersion` values (`2025-06-18` / `2025-03-26` / `2024-11-05`) used by capability-gating test.
- [ ] `apps/cli/build.ts` CI matrix — Wave 5 hardens Phase-1's local-only build into a 4-target verify-on-OS matrix (RESEARCH.md Open Question #7: 1 Linux build job × 4 native verify jobs).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One-click Claude Desktop config block actually pastes into `~/Library/Application Support/Claude/claude_desktop_config.json` and Claude Desktop sees the new MCP server entry without restart errors | RUN-07 | Claude Desktop is a closed application; no automated harness can simulate "user pastes JSON and restarts the app" end-to-end | (1) Run `mcpgen deploy apps/dispatch-sample`. (2) Copy the printed config block. (3) Paste into Claude Desktop config file. (4) Restart Claude Desktop. (5) Verify the `sample-stripe` server appears in the MCP servers list AND the 3 tools (`customers_search`, `charges_fetch`, `subscriptions_list`) are callable from a chat. (6) Run a test query against each tool and verify upstream Stripe (or stub) response shapes match. |
| Bun-compiled binary `--help` runs on each native OS without Gatekeeper / SmartScreen rejection | CLI-03 | macOS Gatekeeper + Windows SmartScreen prompts cannot be fully automated in CI without code-signing certificates (out of solo-friendly scope for MVP) | (1) Download each binary artifact from GitHub release. (2) On macOS: `chmod +x mcpgen-bun-darwin-arm64 && ./mcpgen-bun-darwin-arm64 --help` — confirm Gatekeeper prompt + manual override. (3) On Windows: double-click + SmartScreen prompt + "Run anyway". (4) On Linux: `chmod +x mcpgen-bun-linux-x64 && ./mcpgen-bun-linux-x64 --help`. (5) Document any signing requirements that surface as Phase-9 / Phase-10 carry-forward. |
| Phase-10 lift-shift contract: change export wrapper from Bun `serve()` to CF Workers `export default`, deploy via `wrangler deploy`, smoke-test against real CF dispatch namespace | RUN-01..07 (cross-cutting) | CF deploys are deferred to Phase 10 per local-compute pivot; Phase 6 cannot validate the lift-shift end-to-end | Phase 10 launch criteria: re-run all Phase-6 integration tests against the real CF deploy with the export wrapper swapped. Document in `06-PHASE-DEVIATIONS.md` (carry-forward to Phase 10). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 items above)
- [ ] No watch-mode flags (use `--run` everywhere)
- [ ] Feedback latency < 45s full suite, < 10s quick run
- [ ] `nyquist_compliant: true` set in frontmatter once planner closes Wave 0 gaps

**Approval:** pending (will flip to `approved YYYY-MM-DD` once gsd-plan-checker reports VERIFICATION PASSED with all Wave 0 items resolved)
