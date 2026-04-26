---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-26
updated: 2026-04-26
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

> Populated after planner produced 8 plans on 2026-04-26. Verify commands extracted verbatim from each plan's `<verify><automated>` block.

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------|-------------------|--------|
| 1-01-1 | 01-01 | 1 | FND-01, OPS-02, OPS-03 | — | unit/structural | `test -f package.json && test -f pnpm-workspace.yaml && test -f turbo.json && test -f tsconfig.base.json && test -f .gitignore && test -f README.md && grep -q '"packageManager": "pnpm@10' package.json && grep -q 'apps/\*' pnpm-workspace.yaml && grep -q '"strict": true' tsconfig.base.json` | ⬜ pending |
| 1-01-2 | 01-01 | 1 | FND-01 | — | unit/structural | `test -f packages/shared-config/package.json && test -f packages/shared-config/eslint.config.mjs && test -f packages/shared-config/prettier.config.mjs && test -f packages/shared-config/vitest.config.base.ts && test -f packages/shared-config/tsconfig.base.json && grep -q '@typescript-eslint/no-explicit-any' packages/shared-config/eslint.config.mjs && grep -q "extends.*tsconfig.base.json" packages/shared-config/tsconfig.base.json` | ⬜ pending |
| 1-01-3 | 01-01 | 1 | FND-01 | — | integration/build | `pnpm install --no-frozen-lockfile && pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm prettier --check . && test -f pnpm-lock.yaml` | ⬜ pending |
| 1-02-1 | 01-02 | 2 | FND-12 | T-1-01..05, T-1-09 | unit/structural | `test -f .pre-commit-config.yaml && test -f .gitleaks.toml && test -f .commitlintrc.json && test -x .pre-commit-hooks/no-fourth-namespace.sh && test -x .pre-commit-hooks/launch-criteria-paired-decision.sh && test -x .pre-commit-hooks/check-ui-locked.sh && grep -q "gitleaks" .pre-commit-config.yaml && grep -q "ruff" .pre-commit-config.yaml && grep -q "mypy" .pre-commit-config.yaml && grep -q "eslint" .pre-commit-config.yaml && grep -q "conventional-pre-commit" .pre-commit-config.yaml && grep -q "cf-namespace-guard" .pre-commit-config.yaml && grep -q "launch-criteria-guard" .pre-commit-config.yaml && grep -q "ui-locked-guard" .pre-commit-config.yaml && grep -q "ir-codegen-check" .pre-commit-config.yaml && bash -n .pre-commit-hooks/no-fourth-namespace.sh && bash -n .pre-commit-hooks/launch-criteria-paired-decision.sh && bash -n .pre-commit-hooks/check-ui-locked.sh` | ⬜ pending |
| 1-02-2 | 01-02 | 2 | FND-12, OPS-02 | T-1-01..03, T-1-09 | unit/structural | `test -f .github/workflows/main-ci.yml && test -f .github/workflows/contract-codegen-check.yml && test -f .github/workflows/engine-ci.yml && test -f .github/workflows/runtime-ci.yml && test -f .github/workflows/frontend-ci.yml && test -f .github/workflows/ops-ci.yml && grep -q "dorny/paths-filter@v3" .github/workflows/main-ci.yml && grep -q "wagoid/commitlint-github-action@v6" .github/workflows/main-ci.yml && grep -q "pre-commit run --all-files" .github/workflows/main-ci.yml && grep -q "gitleaks/gitleaks-action@v2" .github/workflows/main-ci.yml && grep -q "F2_SMELL_MIN: 4\\.0" .github/workflows/main-ci.yml && grep -q "OPENROUTER_API_KEY" .github/workflows/main-ci.yml && grep -q "pnpm --filter @mcpgen/ir codegen --check" .github/workflows/contract-codegen-check.yml` | ⬜ pending |
| 1-02-3 | 01-02 | 2 | FND-12, OPS-02 | T-1-01..03 | integration | `which pre-commit && pre-commit run --all-files && test -f docs/decisions/000-test-ownership-policy.md && test -f docs/decisions/001-drizzle-timestamp-prefix-native-format.md && test -f docs/decisions/002-single-ci-workflow-with-paths-filter.md && test -f docs/decisions/README.md && grep -q "Cross-Workstream Test Ownership" docs/decisions/000-test-ownership-policy.md && grep -q "main.*workstream" docs/decisions/000-test-ownership-policy.md` | ⬜ pending |
| 1-03-1 | 01-03 | 3 | FND-02 | — | unit (vitest) + codegen integration | `cd packages/ir && pnpm install && pnpm typecheck && pnpm test --run && (pip install datamodel-code-generator==0.26.4 2>/dev/null \|\| uvx --version 2>/dev/null) && RUN_CODEGEN_TESTS=1 pnpm codegen && test -f python/types.py && grep -q "class FinalTool" python/types.py && grep -q "class ToolDescription" python/types.py && pnpm codegen:check` | ⬜ pending |
| 1-03-2 | 01-03 | 3 | FND-03, FND-04, FND-05, FND-14, CTRL-01 | T-1-03, T-1-08 | unit (vitest) | `cd packages/contracts && pnpm install && pnpm typecheck && pnpm test --run` | ⬜ pending |
| 1-03-3 | 01-03 | 3 | FND-06 | — | unit (vitest) + tsc | `cd packages/runtime-sdk && pnpm install && pnpm typecheck && pnpm test --run` | ⬜ pending |
| 1-04-1 | 01-04 | 4 | FND-08, FND-14 | T-1-04 | unit/structural | `cd packages/contracts && pnpm install && pnpm typecheck && grep -q "pgTable" src/db-schema.ts && grep -c "pgTable(" src/db-schema.ts \| grep -q "9" && grep -q "pending_callbacks" src/db-schema.ts && grep -q "usage_events" src/db-schema.ts && grep -q "vector(1536)" src/db-schema.ts && grep -q "\\$inferSelect" src/db-types.ts && grep -q "\\$inferInsert" src/db-types.ts` | ⬜ pending |
| 1-04-2 | 01-04 | 4 | FND-08 | T-1-04 | unit/structural + drizzle-kit check | `test -f infrastructure/neon/drizzle.config.ts && test -f infrastructure/neon/migrations/20260427000000_init_schema.sql && grep -q "prefix: 'timestamp'" infrastructure/neon/drizzle.config.ts && grep -q "CREATE EXTENSION IF NOT EXISTS vector" infrastructure/neon/migrations/20260427000000_init_schema.sql && grep -q "CREATE EXTENSION IF NOT EXISTS timescaledb" infrastructure/neon/migrations/20260427000000_init_schema.sql && grep -q "create_hypertable.*usage_events.*time" infrastructure/neon/migrations/20260427000000_init_schema.sql && for table in organizations users projects specs generations deployments tools pending_callbacks usage_events; do grep -q "CREATE TABLE.*\\b$table\\b" infrastructure/neon/migrations/20260427000000_init_schema.sql \|\| (echo "Missing CREATE TABLE for $table"; exit 1); done && grep -q "vector(1536)" infrastructure/neon/migrations/20260427000000_init_schema.sql` | ⬜ pending |
| 1-04-3 | 01-04 | 4 | FND-08 | — | unit/structural | `test -f infrastructure/neon/SCALING.md && test -f packages/contracts/scripts/test-migrate.ts && grep -q "Scale-tier" infrastructure/neon/SCALING.md && grep -q "create_hypertable\|_timescaledb_catalog.hypertable" packages/contracts/scripts/test-migrate.ts && cd packages/contracts && pnpm typecheck` | ⬜ pending |
| 1-04-4 | 01-04 | 4 | FND-08 | T-1-04 | manual / [BLOCKING] | manual psql + `pnpm --filter @mcpgen/contracts db:test-migrate` against live Neon dev branch (see Plan 04 Task 4) | ⬜ pending |
| 1-05-1 | 01-05 | 5 | FND-01, FND-10, CTRL-01 | T-1-07 | unit/structural + vitest | `test -d apps/web/src && ls apps/web/src/ \| head -1 && test -f apps/api/wrangler.toml && grep -q "upload_source_maps = true" apps/api/wrangler.toml && grep -q "hyperdrive" apps/api/wrangler.toml && test -f apps/dispatch/wrangler.toml && grep -q "dispatch_namespaces" apps/dispatch/wrangler.toml && grep -q "mcpgen-prod\|mcpgen-staging\|mcpgen-sandbox" apps/dispatch/wrangler.toml && test -x apps/api/scripts/spike-sse.sh && pnpm install --no-frozen-lockfile && pnpm --filter @mcpgen/api typecheck && pnpm --filter @mcpgen/api test --run && pnpm --filter @mcpgen/dispatch typecheck` | ⬜ pending |
| 1-05-2 | 01-05 | 5 | FND-01, CTRL-01 | T-1-07 | unit/structural + tsc | `test -f apps/dispatch-sample/src/index.ts && test -f apps/dispatch-sample/src/auth/middleware.ts && test -f apps/dispatch-sample/src/tools/customers_search.ts && test -f apps/dispatch-sample/src/tools/charges_fetch.ts && test -f apps/dispatch-sample/src/tools/subscriptions_list.ts && grep -q "@modelcontextprotocol/sdk" apps/dispatch-sample/package.json && grep -q "@mcpgen/runtime" apps/dispatch-sample/package.json && grep -q "from '@mcpgen/runtime'" apps/dispatch-sample/src/index.ts && grep -q "X-Upstream-Auth" apps/dispatch-sample/src/auth/middleware.ts && pnpm install --no-frozen-lockfile && pnpm --filter @mcpgen/dispatch-sample typecheck` | ⬜ pending |
| 1-05-3 | 01-05 | 5 | FND-01 | — | unit/structural + Bun build | `test -f apps/cli/build.ts && test -f apps/cli/src/index.ts && test -f apps/docs/package.json && test -f apps/docs/mint.json && grep -q "bun-linux-x64\|bun-darwin-arm64\|bun-darwin-x64\|bun-windows-x64" apps/cli/build.ts && grep -q "Command" apps/cli/src/index.ts && grep -q "mintlify" apps/docs/package.json && pnpm install --no-frozen-lockfile && pnpm --filter @mcpgen/cli typecheck && (which bun && cd apps/cli && bun run build.ts && for target in bun-linux-x64 bun-darwin-arm64 bun-darwin-x64; do test -f dist/mcpgen-$target; done) \|\| echo "bun not available locally; CLI build deferred to CI"` | ⬜ pending |
| 1-06-1 | 01-06 | 5 | FND-01, FND-11 | — | unit/structural + uv toolchain | `cd apps/generation-engine && uv sync && test -f pyproject.toml && test -f uv.lock && grep -q "fastapi" pyproject.toml && grep -q "pydantic-ai" pyproject.toml && grep -q "logfire" pyproject.toml && grep -q "opentelemetry-exporter-otlp-proto-http" pyproject.toml && grep -q "sentry-sdk\\[fastapi\\]" pyproject.toml && grep -q "asyncio_mode = \"auto\"" pyproject.toml && grep -q "requires_openrouter" pyproject.toml && uv run ruff --version && uv run mypy --version && uv run pytest --version` | ⬜ pending |
| 1-06-2 | 01-06 | 5 | FND-10, FND-11 | T-1-09 | unit (pytest) + ruff + mypy --strict | `cd apps/generation-engine && uv sync && uv run ruff check src tests && uv run mypy --strict src && uv run pytest -m "not requires_openrouter"` | ⬜ pending |
| 1-06-3 | 01-06 | 5 | FND-11 | T-1-09 | unit (pytest) + flyctl validate | `test -f apps/generation-engine/tests/test_smoke_qwen.py && test -f apps/generation-engine/Dockerfile && test -f apps/generation-engine/fly.toml && test -f infrastructure/fly/fly.toml && grep -q "qwen/qwen3-coder" apps/generation-engine/tests/test_smoke_qwen.py && grep -q "OPENROUTER_API_KEY" apps/generation-engine/tests/test_smoke_qwen.py && grep -q "skipif" apps/generation-engine/tests/test_smoke_qwen.py && grep -q "gitleaks" apps/generation-engine/Dockerfile && grep -q "uv sync" apps/generation-engine/Dockerfile && grep -q "auto_stop_machines" apps/generation-engine/fly.toml && cd apps/generation-engine && uv run pytest tests/test_smoke_qwen.py 2>&1 \| grep -q "skip\\\|passed"` | ⬜ pending |
| 1-07-1 | 01-07 | 6 | FND-07 | — | unit (vitest) + shape-test | `cd packages/engine-fixtures && pnpm install && pnpm typecheck && pnpm test --run` | ⬜ pending |
| 1-07-2 | 01-07 | 6 | FND-09 | T-1-05 | unit/structural | `test -x infrastructure/cloudflare/scripts/create-namespaces.sh && test -x infrastructure/cloudflare/scripts/list-namespaces.sh && test -f infrastructure/cloudflare/README.md && bash -n infrastructure/cloudflare/scripts/create-namespaces.sh && bash -n infrastructure/cloudflare/scripts/list-namespaces.sh && grep -q "cf-namespace-count" .github/workflows/main-ci.yml && grep -q "list-namespaces.sh" .github/workflows/main-ci.yml && grep -q "mcpgen-prod\|mcpgen-staging\|mcpgen-sandbox" infrastructure/cloudflare/scripts/create-namespaces.sh` | ⬜ pending |
| 1-07-3 | 01-07 | 6 | FND-13, OPS-01, OPS-03 | T-1-06 | unit/structural | `test -f infrastructure/logto/README.md && test -f docs/runbooks/logto-pro-upgrade.md && test -f docs/runbooks/migration-conflicts.md && test -f docs/runbooks/friday-demo-cadence.md && test -f docs/runbooks/README.md && grep -q "Logto Cloud" infrastructure/logto/README.md && grep -q "GitHub social connector\|GitHub OAuth app" infrastructure/logto/README.md && grep -q "self-host" infrastructure/logto/README.md && grep -q "W7\|pre-buy" docs/runbooks/logto-pro-upgrade.md && grep -q "T-1-06\|Pitfall #17" docs/runbooks/logto-pro-upgrade.md && grep -q "drizzle-kit check" docs/runbooks/migration-conflicts.md && grep -q "Friday" docs/runbooks/friday-demo-cadence.md && grep -q "OPS-01" docs/runbooks/friday-demo-cadence.md && grep -q "OPS-03" docs/runbooks/README.md` | ⬜ pending |
| 1-07-4 | 01-07 | 6 | FND-09, FND-13 | T-1-05, T-1-06 | manual / [BLOCKING] | `bash infrastructure/cloudflare/scripts/list-namespaces.sh` (live CF account) + Logto Cloud dashboard verification (see Plan 07 Task 4) | ⬜ pending |
| 1-08-1 | 01-08 | 7 | FND-15 | — | unit/structural | `test -x infrastructure/cloudflare/scripts/provision-hyperdrive.sh && bash -n infrastructure/cloudflare/scripts/provision-hyperdrive.sh && grep -q "wrangler hyperdrive create" infrastructure/cloudflare/scripts/provision-hyperdrive.sh && grep -q "REPLACE_WITH_HYPERDRIVE_ID" infrastructure/cloudflare/scripts/provision-hyperdrive.sh && grep -q "REPLACE_WITH_HYPERDRIVE_ID" apps/api/wrangler.toml && grep -q "REPLACE_WITH_HYPERDRIVE_ID" apps/dispatch/wrangler.toml` | ⬜ pending |
| 1-08-2 | 01-08 | 7 | FND-15 | — | manual / [BLOCKING] | wrangler deploy spike + curl SSE assertion (see Plan 08 Task 2) | ⬜ pending |
| 1-08-3 | 01-08 | 7 | FND-15, CTRL-01 | — | manual / [BLOCKING] | provision-hyperdrive.sh + fresh-clone E2E smoke (see Plan 08 Task 3) | ⬜ pending |
| 1-08-4 | 01-08 | 7 | (closeout — all FND/CTRL/OPS) | (all T-1-XX) | unit/structural | `test -f .planning/phases/01-foundation/01-PHASE-VERIFICATION.md && grep -q "8 of 8" .planning/phases/01-foundation/01-PHASE-VERIFICATION.md && grep -q "19 of 19" .planning/phases/01-foundation/01-PHASE-VERIFICATION.md && grep -q "9 of 9" .planning/phases/01-foundation/01-PHASE-VERIFICATION.md && for r in FND-01 FND-02 FND-03 FND-04 FND-05 FND-06 FND-07 FND-08 FND-09 FND-10 FND-11 FND-12 FND-13 FND-14 FND-15 CTRL-01 OPS-01 OPS-02 OPS-03; do grep -q "$r" .planning/phases/01-foundation/01-PHASE-VERIFICATION.md \|\| (echo "Missing $r"; exit 1); done && for t in T-1-01 T-1-02 T-1-03 T-1-04 T-1-05 T-1-06 T-1-07 T-1-08 T-1-09; do grep -q "$t" .planning/phases/01-foundation/01-PHASE-VERIFICATION.md \|\| (echo "Missing $t"; exit 1); done` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 dependencies are wired into Wave 1+ task acceptance criteria — no separate Wave 0 plan needed because every plan establishes its own scaffolding before the tests that depend on it (vertical slices).

- [x] `apps/generation-engine/tests/test_smoke_qwen.py` — created in Plan 06 Task 3 (Day-1 smoke test stub per `docs/mcpgen-model-and-provider-override.md` §8); skips when `OPENROUTER_API_KEY` absent
- [x] `apps/generation-engine/tests/conftest.py` — created in Plan 06 Task 2 (env sandbox fixture)
- [x] `packages/ir/tests/codegen.test.ts` — created in Plan 03 Task 1 (verifies Zod → JSON Schema → Pydantic codegen idempotent on PR)
- [x] `packages/contracts/tests/launch-criteria.test.ts` — created in Plan 03 Task 2 (proves F2≥4.0, F3≥0.7, bundle thresholds are runtime constants and not configurable at runtime)
- [x] `packages/engine-fixtures/tests/shape.test.ts` — created in Plan 07 Task 1 (schema-validates each of 5 fixtures against IR + FinalTool + QualityReport)
- [x] `packages/runtime-sdk/tests/interface.test.ts` — created in Plan 03 Task 3 (interface-stub presence test)
- [x] vitest installed at workspace root + pytest installed via `uv add --dev pytest pytest-asyncio` — installed in Plan 01 Task 1 + Plan 06 Task 1
- [x] Pre-commit hook integration test (`pre-commit run --all-files` in CI smoke job) — wired in Plan 02 Task 2 (main-ci.yml `pre-commit` job)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three CF dispatch namespaces (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`) exist in CF account | FND-09 | Cloudflare API state — verified by `wrangler dispatch-namespace list` in CI but creation is one-shot manual via authenticated wrangler session | After Plan 07 Task 4: run `wrangler dispatch-namespace list` and confirm all 3 exist; pre-commit hook in `.pre-commit-hooks/no-fourth-namespace.sh` rejects PRs adding a 4th |
| Hono `streamSSE` 30-second sub-request limit verified on real CF Workers | FND-15, D-15 | Spike requires real CF deploy + 90-second timer; cannot run in unit test | Plan 08 Task 2: deploy spike worker; client opens SSE; assert event delivered at t≥85s reaches client; document result in `docs/decisions/2026-04-27-sse-30s-limit-spike.md` |
| Logto Cloud free tier scaffolded with email + GitHub providers; Pro-upgrade runbook tested on staging | FND-13, D-14 | Logto Cloud is external SaaS — login flow needs real OAuth callback URL | Plan 07 Task 4: manually create org in Logto Cloud → configure email + GitHub providers → run runbook end-to-end on staging tenant → record outcome in `docs/runbooks/logto-pro-upgrade.md` |
| Sentry source-map upload works per runtime (Vercel / CF Workers / Fly Machines) | FND-10, D-19 | Requires real Sentry org + DSN per env (Phase 9 fills DSN) | Trigger CI release per app with empty DSN; confirm CI artifact contains uploaded source maps; in Phase 9 swap empty DSN for real and re-verify |
| Drizzle migration prefix YYYYMMDDHHMMSS verified collision-resistant under parallel worktree commits | FND-08, D-12 | Race condition between two worktrees creating migrations within the same second is possible but rare | Two operators (or two terminals) generate migrations within 60s; CI `drizzle-kit check` must pass; document policy in `docs/runbooks/migration-conflicts.md` |
| Neon dev DB schema push verified live | FND-08 | Real DB push requires DATABASE_URL secret in shell | Plan 04 Task 4: `pnpm --filter @mcpgen/contracts drizzle-kit:push` + `psql $DATABASE_URL -c '\dt'` shows 9 tables; evidence captured in `01-04-SCHEMA-PUSH-EVIDENCE.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every plan task has `<verify><automated>` block; manual [BLOCKING] tasks documented above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has either an automated verify block or is a documented checkpoint:human-action)
- [x] Wave 0 covers all MISSING references (all Wave 0 dependencies wired into Wave 1+ tasks; see checklist above)
- [x] No watch-mode flags (all commands use `--run` for vitest; pytest uses default non-watch mode)
- [x] Feedback latency < 60s (full suite ~45s without LLM smoke; quick changed-only run < 15s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed off 2026-04-26 (Phase 1 closeout — see `01-PHASE-VERIFICATION.md` for ROADMAP success criterion mapping)
