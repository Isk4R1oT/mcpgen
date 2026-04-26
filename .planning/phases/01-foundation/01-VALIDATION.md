---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (TS workspaces) + pytest 8.x (Python engine) |
| **Config file** | `vitest.config.ts` per app/package; `pyproject.toml` in `apps/generation-engine/` |
| **Quick run command** | `pnpm -r test --run --changed` |
| **Full suite command** | `pnpm -r test --run && cd apps/generation-engine && uv run pytest -q` |
| **Estimated runtime** | ~45 seconds (no LLM calls; smoke test skipped without `OPENROUTER_API_KEY`) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r test --run --changed` (scoped to changed packages)
- **After every plan wave:** Run full suite (`pnpm -r test --run && uv run pytest -q`)
- **Before `/gsd-verify-work`:** Full suite must be green AND `pnpm -r build && pnpm -r typecheck` must succeed
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-XX-XX | TBD | TBD | FND-XX | T-1-XX / — | populated by gsd-planner | unit/integration | populated by gsd-planner | ❌ W0 | ⬜ pending |

*Populated by gsd-planner during planning. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/generation-engine/tests/test_smoke_qwen.py` — Day-1 smoke test stub (per `docs/mcpgen-model-and-provider-override.md` §8); skips when `OPENROUTER_API_KEY` absent
- [ ] `apps/generation-engine/tests/conftest.py` — pytest fixtures for IR/FinalTool roundtrip
- [ ] `packages/ir/tests/codegen.test.ts` — verifies Zod → JSON Schema → Pydantic codegen idempotent on PR
- [ ] `packages/contracts/tests/launch-criteria.test.ts` — proves F2≥4.0, F3≥0.7, bundle thresholds are runtime constants and not configurable at runtime
- [ ] `packages/engine-fixtures/tests/shape.test.ts` — schema-validates each of 5 fixtures (stripe/github/notion/linear/slack) against IR + FinalTool + QualityReport
- [ ] `packages/runtime-sdk/tests/interface.test.ts` — interface-stub presence test (no behavior yet)
- [ ] vitest installed at workspace root + pytest installed via `uv add --dev pytest pytest-asyncio`
- [ ] Pre-commit hook integration test (run `pre-commit run --all-files` in CI smoke job)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three CF dispatch namespaces (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`) exist in CF account | FND-04 | Cloudflare API state — verified by `wrangler dispatch-namespace list` in CI but creation is one-shot manual via authenticated wrangler session | After Wave 2: run `wrangler dispatch-namespace list` and confirm all 3 exist; pre-commit hook in `.pre-commit-hooks/no-fourth-namespace.sh` rejects PRs adding a 4th |
| Hono `streamSSE` 30-second sub-request limit verified on real CF Workers | D-15 | Spike requires real CF deploy + 90-second timer; cannot run in unit test | Deploy spike worker to `mcpgen-sandbox`; client opens SSE; assert event delivered at t=85s reaches client; document result in `docs/decisions/2026-04-2X-sse-30s-limit.md` |
| Logto Cloud free tier scaffolded with email + GitHub providers; Pro-upgrade runbook tested on staging | FND-14, D-14 | Logto Cloud is external SaaS — login flow needs real OAuth callback URL | Manually create org in Logto Cloud → configure email + GitHub providers → run runbook end-to-end on staging tenant → record outcome in `docs/runbooks/logto-pro-upgrade.md` |
| Sentry source-map upload works per runtime (Vercel / CF Workers / Fly Machines) | OPS-02, D-19 | Requires real Sentry org + DSN per env (Phase 9 fills DSN) | Trigger CI release per app with empty DSN; confirm CI artifact contains uploaded source maps; in Phase 9 swap empty DSN for real and re-verify |
| Drizzle migration prefix YYYYMMDD_HHMMSS verified collision-resistant under parallel worktree commits | FND-12, D-12 | Race condition between two worktrees creating migrations within the same second is possible but rare | Two operators (or two terminals) generate migrations within 60s; CI `drizzle-kit check` must pass; document policy in `docs/runbooks/migration-conflicts.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
