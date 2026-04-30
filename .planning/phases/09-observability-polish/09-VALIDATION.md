---
phase: 9
slug: observability-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detail mapping is in `09-RESEARCH.md` §"Validation Architecture (Nyquist Theorem mapping)" — this file is the executable contract; the planner fills the per-task table during planning.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **TS Framework** | vitest 1.6.x (existing in apps/web, apps/api, apps/dispatch) |
| **Python Framework** | pytest 8.x (existing in apps/generation-engine) |
| **Config files** | `apps/api/vitest.config.ts`, `apps/dispatch/vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/generation-engine/pyproject.toml [tool.pytest.ini_options]` |
| **Quick run command** | `pnpm --filter @mcpgen/api test -- --run` (per-app) / `cd apps/generation-engine && uv run pytest -k <module> -x` |
| **Full suite command** | `pnpm -r test && cd apps/generation-engine && uv run pytest` |
| **Estimated runtime** | ~120s full (TS) + ~90s full (Python) — total under 4 min target |

---

## Sampling Rate

- **After every task commit:** Run `vitest --run path/to/affected.test.ts` (TS) or `pytest -k <name> -x` (Python) — < 5s feedback
- **After every plan wave:** Run full per-app `pnpm test` for each app touched in the wave
- **Before `/gsd-verify-work`:** Full suite must be green for ALL 4 apps + generation-engine
- **Max feedback latency:** 5s for unit / 30s for integration

---

## Per-Task Verification Map

> Filled by `gsd-planner` during plan creation. Skeleton:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | CTRL-08 | T-9-redact | redactBeforeSend strips Authorization header | unit (TS) | `vitest run packages/contracts/src/sentry-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | CTRL-08 | T-9-redact | Python equivalent strips Authorization | unit (py) | `uv run pytest tests/observability/test_sentry_redaction.py -k authorization` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 1 | CTRL-08 | T-9-redact | Spec body redacted at /v1/generate | unit (TS+py shared fixtures) | `vitest run + pytest` | ❌ W0 | ⬜ pending |
| 9-01-04 | 01 | 1 | CTRL-08 | T-9-pii | 6 leak vectors × 4 SDKs all redacted | unit table-driven | `pnpm -r test --filter "*sentry-redaction*"` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | CTRL-08 | — | Drizzle migration applies cleanly + idempotent | integration | `pnpm db:migrate && pnpm db:check` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 2 | CTRL-08 | T-9-bff-auth | GET /deployments returns org-scoped list | integration (Hono) | `vitest run apps/api/tests/routes/deployments.test.ts` | ❌ W0 | ⬜ pending |
| 9-03-02 | 03 | 2 | CTRL-08 | T-9-bff-auth | GET /usage/hourly aggregates | integration | `vitest run apps/api/tests/routes/usage-hourly.test.ts` | ❌ W0 | ⬜ pending |
| 9-03-03 | 03 | 2 | CTRL-08 | T-9-bff-auth | GET /deploy/[id] returns config snippet | integration | `vitest run apps/api/tests/routes/deploy-by-id.test.ts` | ❌ W0 | ⬜ pending |
| 9-03-04 | 03 | 2 | CTRL-08 | T-9-bff-auth | POST /badge-public toggles flag | integration | `vitest run apps/api/tests/routes/badge-public.test.ts` | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 2 | CTRL-08 | — | session_id reaches Langfuse OTel exporter | integration | `uv run pytest tests/observability/test_langfuse_session.py` | ❌ W0 | ⬜ pending |
| 9-04-02 | 04 | 2 | CTRL-08 | — | langfuse.session.id NOT scrubbed by Logfire | integration | `pytest -k logfire_scrub_callback` | ❌ W0 | ⬜ pending |
| 9-05-01 | 05 | 2 | CTRL-09 | — | All 7 createFunction IDs in INNGEST_FUNCTION_IDS | static (TS) | `vitest run apps/api/tests/inngest/orphan-audit.test.ts` | ❌ W0 | ⬜ pending |
| 9-06-01 | 06 | 3 | CTRL-08 | T-9-cross-tenant | Smart-ID regexes don't intersect across 5 tenants | integration (py) | `pytest tests/integration/test_cross_tenant_smart_id_fuzz.py` | ❌ W0 | ⬜ pending |
| 9-06-02 | 06 | 3 | CTRL-08 | T-9-cross-tenant | Dispatch rejects mismatched-prefix ID with 403 | integration (TS) | `vitest run apps/dispatch/tests/cross-tenant-id-block.test.ts` | ❌ W0 | ⬜ pending |
| 9-07-01 | 07 | 3 | CTRL-08 | T-9-2024-proto | 2024-protocol mock client gets tools/list w/o outputSchema | integration (py) | `pytest tests/integration/test_multi_protocol_client.py` | ❌ W0 | ⬜ pending |
| 9-08-01 | 08 | 3 | CTRL-08 | T-9-pii | leak-audit script returns zero hits against mocked Sentry events API | integration (TS) | `tsx scripts/observability/leak-audit.ts --mode mock` | ❌ W0 | ⬜ pending |
| 9-09-01 | 09 | 3 | CTRL-08 | — | Synthetic concurrent load: zero "connection terminated" over 10min | manual + automated | `vitest run tests/load/test_neon_oom_replication.test.ts --testTimeout 600000` | ❌ W0 | ⬜ pending |
| 9-10-01 | 10 | 3 | CTRL-08 | — | outbox monitor emits alert when sent_at IS NULL count > 10K | unit | `vitest run apps/api/tests/observability/outbox-depth.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/contracts/src/sentry-redaction.test.ts` — table-driven test, 6 leak vectors
- [ ] `apps/generation-engine/tests/observability/test_sentry_redaction.py` — Python equivalent + shared JSON fixture
- [ ] `apps/generation-engine/tests/observability/fixtures/leak_vectors.json` — shared TS+py fixture (6 vectors)
- [ ] `apps/api/tests/inngest/orphan-audit.test.ts` — static scan + set-equality vs INNGEST_FUNCTION_IDS
- [ ] `apps/api/tests/routes/deployments.test.ts` — Hono integration test pattern (auth middleware + Drizzle mock)
- [ ] `apps/api/tests/routes/usage-hourly.test.ts` — TimescaleDB aggregate query test
- [ ] `apps/api/tests/routes/deploy-by-id.test.ts` — single-deployment + claude_desktop_config snippet shape
- [ ] `apps/api/tests/routes/badge-public.test.ts` — toggle + org-ownership 403 case
- [ ] `apps/api/tests/observability/outbox-depth.test.ts` — mock outbox table to 10001 rows, assert alert
- [ ] `apps/dispatch/tests/cross-tenant-id-block.test.ts` — 403 on mismatched prefix
- [ ] `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` — 5 tenants × 5 specs intersection
- [ ] `apps/generation-engine/tests/integration/test_multi_protocol_client.py` — 2024-protocol mock
- [ ] `apps/generation-engine/tests/observability/test_langfuse_session.py` — OTel span attribute capture + scrub-callback assertion
- [ ] `apps/api/tests/load/test_neon_oom_replication.test.ts` — pgbench + pgvector + TimescaleDB workload (vitest with extended timeout)

*Existing infrastructure covers vitest + pytest base; only new test files (above) needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-client smoke (Cursor / Claude Desktop / ChatGPT Deep Research) | CTRL-08 §4 | Real MCP clients require interactive install + LLM calls outside CI budget | `docs/runbooks/multi-client-smoke.md` — 5 APIs × 3 clients = 15 runs at W7 |
| Real-Sentry leak audit (post-Sentry-org provisioning) | CTRL-08 §1 | Requires real Sentry org from Phase 10 | `pnpm leak-audit --mode real` after `SENTRY_AUTH_TOKEN` set; assert zero events match Bearer/sk_live/ghp_ |
| Real-Neon Scale-tier OOM verification | CTRL-08 §3 | Requires Neon Scale tier compute upgrade ($220/mo) at W7 | `docs/runbooks/neon-scale-upgrade.md` — snapshot dev branch → upgrade → re-run synthetic load against real Neon |
| BetterStack uptime checks live (apps/web, apps/api, apps/dispatch, apps/generation-engine, sample tenant Worker, Logto endpoint) | CTRL-08 §3 | Requires Phase 10 cloud deploys + BETTERSTACK_UPTIME_API_KEY | `docs/runbooks/betterstack-setup.md` — provisioning steps for W7 |
| Source maps upload (apps/web, apps/api, apps/dispatch) verified in Sentry UI | CTRL-08 §1 | Requires real Sentry org + SENTRY_AUTH_TOKEN | After Phase 10 deploy, trigger an exception in each app, click "View source" in Sentry — confirm original TS line shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (14 new test files listed above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for any single test
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills task table)

**Approval:** pending — set after planner finalizes per-task map and Wave 0 completes
