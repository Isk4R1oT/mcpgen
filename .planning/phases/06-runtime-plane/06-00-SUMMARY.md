---
phase: 06-runtime-plane
plan: 00
subsystem: runtime
tags: [drizzle, neon, timescaledb, bun, hono, vitest, fixtures, smart-id, mcp-protocol-version, pii-redaction, workspace-scaffold, idempotency]

requires:
  - phase: 01-foundation
    provides: "FROZEN UsageEvent Zod schema (idempotency_key + STRIPE_METERS_KEY_REGEX), FROZEN @mcpgen/runtime-sdk Runtime interface, Drizzle init schema for deployments + usage_events hypertable, packages/ir SmartIdSchema, .gitleaks.toml allowlist patterns, docs/decisions/ pattern, FND-08 / D-12 timestamp-prefixed migration filename freeze"
provides:
  - "deployments.local_port (nullable int) live on Neon dev branch (RUN-01 — local Bun child-process port; NULL for Phase-10 CF deploys)"
  - "usage_events.idempotency_key (NOT NULL text) + UNIQUE(deployment_id, idempotency_key, time) live on Neon dev branch — closes drift between FROZEN UsageEvent Zod and migrated DB (RUN-06)"
  - "@mcpgen/tenant-worker-runner workspace package — empty-but-deployable Bun supervisor on :8788 (Wave 2 fills /admin/spawn|kill|list)"
  - "@mcpgen/inngest-dev workspace package — empty-but-deployable Inngest dev runner on :3030 (Wave 4 wires usage-events-ingest-v1, usage-fallback-drain-v1, usage-reconciler-v1, warm-keep-active-tenants-v1)"
  - "@mcpgen/tests-runtime workspace package — D-21-owned cross-app E2E test harness; fixtures importable without circular deps"
  - "tests/runtime/fixtures/smart-id-fuzz.ts — single source of truth SMART_ID_REGEX + parseSmartIdFixture; shared between Phase-5 F1 fixture, Wave 1 dispatch fuzz check, and Wave 1 dynamic test"
  - "tests/runtime/fixtures/mock-mcp-clients.ts — MOCK_PROTOCOL_VERSIONS for the 3 MCP spec versions (2025-06-18 / 2025-03-26 / 2024-11-05) + initialize / session-id / header builders"
  - "tests/runtime/fixtures/deliberate-leak.ts — PHASE6FIXTURE-shaped credential placeholders + REDACTION_HEADER_DENYLIST for Wave 5 PII audit"
  - "docs/decisions/005-phase-6-schema-migrations.md — paired decision-log entry per OPS-02 cross-workstream contract-change policy (covers BOTH Wave-0 migrations + the TimescaleDB TS103 amendment)"
  - "06-00-SCHEMA-PUSH-EVIDENCE.md — captured live-DB verification proving local_port + idempotency_key + usage_events_dep_idem_unique unique index are present on the Neon dev branch"
affects: [06-01, 06-02, 06-03, 06-04, 06-05, 06-06, 09, 10]

tech-stack:
  added:
    - "tests/* glob in pnpm-workspace.yaml (workspace family for E2E harnesses owned by runtime ws)"
    - "@types/bun (devDependency in 3 new packages — Bun-runtime apps, NOT CF Workers)"
    - "drizzle-kit push --force as canonical incremental schema-push command for Phase-6+ (db:test-migrate is fresh-DB-only)"
  patterns:
    - "TimescaleDB hypertable UNIQUE indexes MUST include the time partitioning column (TS103). Dedup semantics preserved because idempotency_key already encodes a minute-bucket timestamp per Phase-1 D-11."
    - "New Bun + Hono workspace apps reuse apps/dispatch's tsconfig + apps/api's vitest.config shape. Lint script is a pnpm-r-lint echo-stub matching the 12 existing apps; per-app eslint configs are intentionally absent."
    - "Cross-package regex alignment: SMART_ID_REGEX defined once in tests/runtime/fixtures/smart-id-fuzz.ts; F1 fixture (Phase 5) and dispatch runtime check (Wave 1) consume it via Zod-introspection of @mcpgen/ir SmartIdSchema.format."
    - "Deliberate-leak fixture strings reshape to .gitleaks.toml allowlist regexes (sk_test_.*placeholder.* and ghp_PLACEHOLDER.*) — keeps gitleaks coverage tight across the rest of tests/runtime/fixtures/ rather than path-allowlisting the whole directory."

key-files:
  created:
    - "infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql"
    - "infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql"
    - "docs/decisions/005-phase-6-schema-migrations.md"
    - ".planning/phases/06-runtime-plane/06-00-SCHEMA-PUSH-EVIDENCE.md"
    - ".planning/phases/06-runtime-plane/06-00-MIGRATION-FAILURE.md"
    - "apps/tenant-worker-runner/package.json"
    - "apps/tenant-worker-runner/tsconfig.json"
    - "apps/tenant-worker-runner/vitest.config.ts"
    - "apps/tenant-worker-runner/src/index.ts"
    - "apps/inngest-dev/package.json"
    - "apps/inngest-dev/tsconfig.json"
    - "apps/inngest-dev/vitest.config.ts"
    - "apps/inngest-dev/src/index.ts"
    - "tests/runtime/package.json"
    - "tests/runtime/tsconfig.json"
    - "tests/runtime/vitest.config.ts"
    - "tests/runtime/fixtures/smart-id-fuzz.ts"
    - "tests/runtime/fixtures/mock-mcp-clients.ts"
    - "tests/runtime/fixtures/deliberate-leak.ts"
  modified:
    - "packages/contracts/src/db-schema.ts (deployments + usage_events tables — local_port + idempotency_key + uniqueIndex import)"
    - "infrastructure/neon/migrations/meta/_journal.json (2 new migration entries with frozen tags)"
    - "pnpm-workspace.yaml (added tests/* glob)"
    - "pnpm-lock.yaml (3 new workspace packages resolved)"

key-decisions:
  - "TimescaleDB TS103 amendment: usage_events_dep_idem_unique is UNIQUE(deployment_id, idempotency_key, time) — a 3-column index instead of the planned 2 — because TimescaleDB enforces (ts_indexing_verify_columns) that every UNIQUE index on a hypertable include the partitioning column. Dedup semantics preserved: idempotency_key already encodes a minute-bucket timestamp, so the additional time column never widens the dedup window in practice."
  - "drizzle-kit push --force is the canonical incremental schema-push command for Phase-6+. The Phase-1 db:test-migrate script is fresh-DB-only and aborts with 'relation deployments already exists' against the live dev DB. Phase-10 should add an --incremental mode (carry-forward TODO captured in 06-00-SCHEMA-PUSH-EVIDENCE.md)."
  - "Three new packages tsconfig 'types' field uses 'bun' (NOT @cloudflare/workers-types as the dispatch closest-cousin uses). These apps run on Bun for local-compute Phase 6 and only swap to CF in Phase 10."
  - "Three new packages lint script is the pnpm-r-lint echo-stub used by the other 12 workspace packages. Per-app eslint config files are intentionally absent — workspace eslint runs once at repo root via 'pnpm -r lint' against eslint.config.mjs."
  - "Deliberate-leak fixture strings match existing .gitleaks.toml allowlist regexes (sk_test_.*placeholder.* and ghp_PLACEHOLDER.*) rather than adding tests/runtime/fixtures/.* to the path-allowlist, which would weaken gitleaks coverage for any future test fixture in that directory."

patterns-established:
  - "Pattern: TimescaleDB UNIQUE-index workaround — when TS103 fires, append the partitioning column. Document semantic invariance in the paired decision-log entry rather than splitting the dedup column shape."
  - "Pattern: New Bun + Hono workspace app scaffold — cousin apps/dispatch tsconfig with types: ['bun'], cousin apps/api vitest.config (Node env, tests/**/*.test.ts include), echo-stub lint script, default-export { port, fetch } shape."
  - "Pattern: Shared cross-package fixture — single SOT regex/constant in tests/runtime/fixtures/, consumed by both static (Phase 5 F1) and dynamic (Wave 1 dispatch) checks. Cross-package alignment asserted by a Wave-1 test that introspects @mcpgen/ir SmartIdSchema.format."
  - "Pattern: Strict-TS-safe regex destructuring — under noUncheckedIndexedAccess, declare each match group via array index access then explicit undefined-check, rather than tuple destructure or non-null-assert (matches RULES Error Handling §'never silently ignore them')."

requirements-completed:
  - RUN-01
  - RUN-02
  - RUN-06
  - CTRL-09

duration: ~24 hours wall-clock (multi-session; Tasks 1-3 first session, Tasks 4-5 final session ~30 min active)
completed: 2026-04-27
---

# Phase 6 Plan 00: Wave 0 Schema + Scaffolds Summary

**Two Drizzle migrations live on Neon dev (deployments.local_port + usage_events.idempotency_key with TS103-amended UNIQUE index), three workspace packages scaffolded (tenant-worker-runner / inngest-dev / tests-runtime), three shared fixtures (smart-id-fuzz / mock-mcp-clients / deliberate-leak) committed — all blocking preconditions for Waves 1-5 cleared.**

## Performance

- **Duration:** ~24 hours wall-clock (multi-session execution; Tasks 1-3 ~3 hours of active work first session including TS103 debug, Tasks 4-5 ~30 min active in resume session)
- **Started:** 2026-04-26 (commit a9fedbc — first task commit)
- **Completed:** 2026-04-27 (commit 9e00e8a — final fixture commit)
- **Tasks:** 5/5
- **Files created:** 19
- **Files modified:** 4

## Accomplishments

- Resolved the FROZEN-UsageEvent-vs-DB drift surfaced in 06-RESEARCH §"Open Question #6" — `usage_events.idempotency_key` is now a real NOT NULL column with a hypertable-compatible UNIQUE constraint, paired with a docs/decisions/005 entry per OPS-02.
- Added the local-compute compatibility column `deployments.local_port` (nullable so Phase-10 CF deploys leave it NULL) — unblocks Wave 5 `mcpgen deploy` and Wave 1 dispatch routing-table population.
- Stood up three workspace packages (`apps/tenant-worker-runner/`, `apps/inngest-dev/`, `tests/runtime/`) with empty-but-deployable Bun + Hono stubs that typecheck cleanly under the strict tsconfig — Waves 1-5 can land their bodies without further scaffolding work.
- Established the cross-wave fixture spine: smart-ID regex (Wave 1 fuzz + Phase-5 F1 fixture share it), three MCP `protocolVersion` strings (Wave 1 capability gating + Wave 2 E2E), and the deliberate-leak credential placeholders (Wave 5 PII audit + Sentry redaction unit test).
- Documented the TimescaleDB TS103 detour and the `db:test-migrate` design tension in dedicated artefacts (`06-00-MIGRATION-FAILURE.md`, `06-00-SCHEMA-PUSH-EVIDENCE.md`, `docs/decisions/005-phase-6-schema-migrations.md`) so Phase-10 carry-forward work has the receipts.

## Task Commits

Each task was committed atomically per RULES §5.5 (atomic-commit policy):

1. **Task 1: Add local_port column to deployments** — `a9fedbc` (feat)
2. **Task 2: Add idempotency_key + UNIQUE to usage_events** — `ca7af5b` (chore)
2.5. **Task 2 amendment: TimescaleDB TS103 fix (added time to unique index)** — `13dee13` (chore)
   - Triggered by: TS103 PG error during the Task-3 push attempt; `721d4a2` records the failure first.
3. **Task 3: Push migrations to Neon dev (drizzle-kit push --force)** — `3ccdbd5` (docs — evidence)
4. **Task 4: Scaffold tenant-worker-runner / inngest-dev / tests-runtime** — `217a868` (feat)
5. **Task 5: Add shared cross-package fixtures** — `9e00e8a` (feat)

**Migration-failure receipt:** `721d4a2` (docs(06-00): record migration push failure (TimescaleDB unique-index constraint))

**Pre-execution decision-log:** `005-phase-6-schema-migrations.md` lives in `docs/decisions/` and was committed as part of `ca7af5b` per OPS-02.

## Files Created

### Schema + migrations (Tasks 1-3)
- `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` — frozen-tag migration
- `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` — frozen-tag migration with the TS103-amended 3-column unique index
- `docs/decisions/005-phase-6-schema-migrations.md` — paired decision-log entry per OPS-02
- `.planning/phases/06-runtime-plane/06-00-MIGRATION-FAILURE.md` — TS103 error capture
- `.planning/phases/06-runtime-plane/06-00-SCHEMA-PUSH-EVIDENCE.md` — live-DB verification capture

### Workspace scaffolds (Task 4)
- `apps/tenant-worker-runner/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` — Bun supervisor on :8788
- `apps/inngest-dev/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` — Inngest dev runner on :3030
- `tests/runtime/{package.json,tsconfig.json,vitest.config.ts}` — D-21-owned cross-app harness

### Shared fixtures (Task 5)
- `tests/runtime/fixtures/smart-id-fuzz.ts` — SMART_ID_REGEX + parseSmartIdFixture()
- `tests/runtime/fixtures/mock-mcp-clients.ts` — MOCK_PROTOCOL_VERSIONS + initialize/session/header builders
- `tests/runtime/fixtures/deliberate-leak.ts` — DELIBERATE_LEAK_FIXTURES + REDACTION_HEADER_DENYLIST

## Files Modified

- `packages/contracts/src/db-schema.ts` — added `local_port`, `idempotency_key`, `deploymentIdemUnique` (3-column after TS103 amendment), and the `integer` + `uniqueIndex` imports.
- `infrastructure/neon/migrations/meta/_journal.json` — two new migration entries with frozen tags.
- `pnpm-workspace.yaml` — added `'tests/*'` glob (joins `'apps/*'` and `'packages/*'`).
- `pnpm-lock.yaml` — 3 new workspace projects (12 → 15).

## Acceptance Criteria

All 5 task `<acceptance_criteria>` blocks verified:

| Task | Criterion | Evidence |
|---|---|---|
| 1 | `local_port` column visible on Neon dev | `06-00-SCHEMA-PUSH-EVIDENCE.md` JSON |
| 1 | drizzle-kit:check exits 0 | re-run during Tasks 4-5 verify pass — exits 0 |
| 2 | `idempotency_key` (NOT NULL) + `usage_events_dep_idem_unique` index visible | `06-00-SCHEMA-PUSH-EVIDENCE.md` JSON; index def includes `(deployment_id, idempotency_key, "time")` |
| 2 | docs/decisions/005 contains `idempotency_key` | `grep -F "idempotency_key" docs/decisions/005-phase-6-schema-migrations.md` returns 4+ matches |
| 3 | drizzle-kit push exits 0 | recorded in `06-00-SCHEMA-PUSH-EVIDENCE.md` |
| 4 | 3 packages exist with correct names | `grep "@mcpgen/tenant-worker-runner"` etc. confirmed |
| 4 | `port: 8788` in tenant-worker-runner src | confirmed |
| 4 | `port: 3030` in inngest-dev src | confirmed |
| 4 | `tests/*` in workspace yaml | confirmed |
| 4 | pnpm install + 3× build/typecheck | all exit 0 |
| 5 | smart-id-fuzz exports `SMART_ID_REGEX` and `parseSmartIdFixture` | confirmed |
| 5 | mock-mcp-clients has all 3 protocolVersion values | confirmed |
| 5 | deliberate-leak has all 5 keys | confirmed |
| 5 | tests-runtime typecheck exits 0 | confirmed |

## Deviations from Plan

### Auto-fixed issues during Task 2 → Task 3 boundary

**1. [Rule 1 - Bug] TimescaleDB TS103 violation on usage_events unique index**
- **Found during:** Task 3 (drizzle-kit push attempt — pre-Wave-0 migrations)
- **Issue:** Postgres rejected `CREATE UNIQUE INDEX (deployment_id, idempotency_key)` with TS103 because `usage_events` is a TimescaleDB hypertable partitioned on `time`, and TimescaleDB enforces that every UNIQUE index include the partitioning column. The plan's frozen migration body therefore could not apply.
- **Fix:** Amended both `packages/contracts/src/db-schema.ts` (added `time` to the `uniqueIndex` declaration) and the SQL migration (changed the column list to `(deployment_id, idempotency_key, time)`). Documented the semantic invariance — `idempotency_key` already encodes a minute-bucket timestamp per Phase-1 D-11, so the time column never widens the dedup window in practice. The frozen-filename rule was preserved (no rename); the body change is the only diff.
- **Files modified:** `packages/contracts/src/db-schema.ts`, `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql`, `docs/decisions/005-phase-6-schema-migrations.md` (rationale appended)
- **Verification:** Live DB query in `06-00-SCHEMA-PUSH-EVIDENCE.md` confirms the 3-column index def
- **Commit:** `13dee13`
- **Failure receipt commit:** `721d4a2`

**2. [Rule 3 - Blocker] db:test-migrate refused to run against the live dev DB**
- **Found during:** Task 3 (push attempt with the original `pnpm --filter @mcpgen/contracts db:test-migrate`)
- **Issue:** The Phase-1 `test-migrate.ts` script is designed for fresh-DB acceptance and aborts with "relation deployments already exists" when run against a DB that already has Phase-1 init applied. This blocks Task 3 because the dev DB is exactly that state.
- **Fix:** Switched the canonical Phase-6 schema-push command to `drizzle-kit push --force --config infrastructure/neon/drizzle.config.ts`, which pulls live schema, computes the diff, and applies only the new statements. Documented the design tension and Phase-10 carry-forward TODO in `06-00-SCHEMA-PUSH-EVIDENCE.md` ("audit `packages/contracts/scripts/test-migrate.ts` to add an `--incremental` mode" OR "switch the Phase-6 schema-push gate to drizzle-kit push --force everywhere and reserve `db:test-migrate` for fresh-DB regression tests against an ephemeral container").
- **Files modified:** none in source (one-shot CLI invocation; the new pattern is documented for Wave 1+ to follow)
- **Verification:** Push succeeded, both columns + the unique index live on Neon dev (evidence file)
- **Commit:** `3ccdbd5` (docs — evidence)

### Auto-fixed issues during Task 4

**3. [Rule 3 - Blocker] tsconfig referenced @cloudflare/workers-types but the new apps don't depend on it**
- **Found during:** Task 4 (`pnpm --filter @mcpgen/tenant-worker-runner build` after copying apps/dispatch tsconfig verbatim)
- **Issue:** The closest-cousin tsconfig for new apps was `apps/dispatch/tsconfig.json`, which sets `types: ["@cloudflare/workers-types"]`. The new tenant-worker-runner and inngest-dev are local Bun apps (not CF Workers in Phase 6 per local-compute pivot), so they do NOT have that types package as a transitive dependency. tsc --noEmit therefore failed with TS2688 ("Cannot find type definition file").
- **Fix:** Switched both new tsconfigs to `types: ["bun"]` since `@types/bun` is already in their devDependencies per the planner's verbatim package.json. Aligns with the local-compute pivot.
- **Files modified:** `apps/tenant-worker-runner/tsconfig.json`, `apps/inngest-dev/tsconfig.json`
- **Verification:** Both packages now build cleanly (`pnpm --filter @mcpgen/tenant-worker-runner build` exits 0)
- **Commit:** included in `217a868`

**4. [Rule 3 - Blocker] lint script invoked eslint with no per-app config**
- **Found during:** Task 4 (commit pre-commit hook ran `pnpm -r lint`)
- **Issue:** Planner's verbatim package.json had `"lint": "eslint . --ext .ts"`. ESLint v10 looks for `eslint.config.(js|mjs|cjs)` in each package; none of these new packages have a per-app config (workspace eslint runs once from repo root via the existing `eslint.config.mjs`). The 12 existing workspace packages all use an echo-stub lint script for the same reason.
- **Fix:** Switched all 3 lint scripts to the same echo-stub pattern: `"lint": "echo \"no lint step in @mcpgen/<name> (covered by workspace eslint via pnpm -r lint)\""`.
- **Files modified:** `apps/tenant-worker-runner/package.json`, `apps/inngest-dev/package.json`, `tests/runtime/package.json`
- **Verification:** `pnpm -r lint` now passes for all 15 workspace projects (pre-commit hook output confirms)
- **Commit:** included in `217a868`

### Auto-fixed issues during Task 5

**5. [Rule 1 - Bug] noUncheckedIndexedAccess narrows regex match destructure to string | undefined**
- **Found during:** Task 5 (typecheck after writing planner's verbatim smart-id-fuzz.ts)
- **Issue:** `const [, server, type, collection, identifier] = m;` produces 4 `string | undefined` slots under `noUncheckedIndexedAccess`. Returning them in the `ParsedSmartId` (declared as `string`) failed with TS2322. The successful regex match guarantees the slots are populated, but the type system can't see that without help.
- **Fix:** Replaced tuple destructure with explicit `m[1]..m[4]` access plus an `=== undefined` check that narrows. Chose this over the non-null-assert (`!`) per RULES Error Handling §"never silently ignore them".
- **Files modified:** `tests/runtime/fixtures/smart-id-fuzz.ts`
- **Verification:** `pnpm --filter @mcpgen/tests-runtime typecheck` exits 0
- **Commit:** included in `9e00e8a`

**6. [Rule 3 - Blocker] noUnusedParameters flagged two reserved-for-future parameters**
- **Found during:** Task 5 (typecheck)
- **Issue:** `makeInitializeRequest(protocolVersion, sessionId)` and `makeMockClientHeaders(protocolVersion, sessionId)` both had a parameter that the body never reads (`sessionId` in the first, `protocolVersion` in the second). Strict tsconfig fails them as TS6133. Dropping the parameters would cripple the public API for Wave-1 capability-gating tests that need to hold the parameter shape symmetric with the future `Mcp-Protocol-Version` header behaviour.
- **Fix:** Underscore-prefixed both parameters (`_sessionId`, `_protocolVersion`) and added inline comments explaining why the public shape is preserved.
- **Files modified:** `tests/runtime/fixtures/mock-mcp-clients.ts`
- **Verification:** typecheck exits 0
- **Commit:** included in `9e00e8a`

**7. [Rule 3 - Blocker] gitleaks rejected planner's verbatim deliberate-leak credential strings**
- **Found during:** Task 5 (commit pre-commit hook ran gitleaks)
- **Issue:** Planner's verbatim values `Bearer sk_test_PHASE6FIXTURENOTAREALSECRET12345678`, `sk_live_PHASE6FIXTURENOTAREALSECRET12345678`, and `ghp_PHASE6FIXTURENOTAREALSECRET12345678abcd` matched the default gitleaks `stripe-access-token` and `github-pat` rules and the commit was blocked.
- **Fix:** Reshaped the strings to match the existing `.gitleaks.toml` allowlist regexes (`sk_test_.*placeholder.*` and `ghp_PLACEHOLDER.*`). The `sk_live_` shape has no allowlist regex, so the `stripe_live` field now uses an `sk_test_` shape with `live_mode` in the value — the redactor goes by header name (Authorization / X-Upstream-Auth / Cookie via REDACTION_HEADER_DENYLIST), not by token-shape regex, so the assertion semantics are preserved. Documented the trade-off in an inline comment so a future reviewer understands why we did NOT path-allowlist `tests/runtime/fixtures/.*` (which would weaken gitleaks coverage for any future fixture in that directory).
- **Files modified:** `tests/runtime/fixtures/deliberate-leak.ts`
- **Verification:** pre-commit gitleaks passes (`Detect hardcoded secrets................Passed`)
- **Commit:** included in `9e00e8a`

**Total deviations:** 7 auto-fixed (1 Rule 1 — TS103 bug; 1 Rule 1 — strict-TS regex; 5 Rule 3 — build/precommit blockers).

**Impact:** All deviations preserve the planner's intent (single migration set per Wave 0; same workspace-scaffold semantics; same fixture API shape). The TS103 detour is structural and propagates to the long-term unique-index column list; Phase-10 should keep the 3-column shape. The `drizzle-kit push --force` switch is a pattern, not a one-shot, and is reflected in the schema-push evidence file. The strict-TS narrowing pattern in `parseSmartIdFixture` is documented as a Phase-6 idiom in the deviation entry above; Wave 1's smart-id-fuzz.test.ts should follow it. None of the deviations affect the contract-frozen UsageEvent schema, the Runtime interface surface, or the SmartIdSchema format.

## Authentication Gates

None encountered — Neon `DATABASE_URL_UNPOOLED` was already populated in `.env.local` from Phase-1 setup, and the only network call was `drizzle-kit push --force` against the dev branch (succeeded first attempt after the TS103 amendment).

## Known Stubs

The 4 source files committed in Tasks 4 + 5 are intentional empty-but-deployable stubs per the plan's `<objective>`:

| File | Stub | Resolved by |
|---|---|---|
| `apps/tenant-worker-runner/src/index.ts` | All routes return 404 except `/health` | Wave 2 (06-02-PLAN) — fills `/admin/spawn`, `/admin/kill`, `/admin/list` |
| `apps/inngest-dev/src/index.ts` | All routes return 404 except `/health` | Wave 4 (06-04-PLAN) — wires `usage-events-ingest-v1`, `usage-fallback-drain-v1`, `usage-reconciler-v1`, `warm-keep-active-tenants-v1` |
| `tests/runtime/` | No `*.test.ts` files yet | Waves 1-5 — add tests as each wave lands |
| `tests/runtime/fixtures/*.ts` | Fixtures themselves are complete; consumers don't exist yet | Waves 1, 2, 5 — consume the fixtures |

These are not dishonest stubs — they are the plan's deliverable. Each is documented in the plan's `<objective>` and the `<output>` of every downstream wave references them.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond what the plan's `<threat_model>` already enumerated. Tasks 1+2 are exactly the `mitigate` dispositions for `T-6-13` (UNIQUE constraint dedup) and `T-6-INFRA-01` (frozen migration filenames + journal entry). Tasks 4+5 add no new ingress / egress surface.

## Issues Encountered

None blocking. The TS103 detour was caught by drizzle-kit push and resolved within the plan's <verification> loop in the first session — no manual escalation required. All other deviations were caught by pre-commit hooks or typecheck during Tasks 4+5 and resolved within the plan's <verification> loop in the resume session.

## Next Phase Readiness

- **Wave 1 (06-01):** can read `deployments.local_port` from Drizzle, can import `SMART_ID_REGEX` from the shared fixture, can use `MOCK_PROTOCOL_VERSIONS` for capability-gating tests. No further migrations needed.
- **Wave 2 (06-02):** can fill the tenant-worker-runner stub bodies (admin endpoints) and consume `@mcpgen/runtime` real implementations as Wave 2 builds them.
- **Wave 4 (06-04):** can fill the inngest-dev stub bodies; the 4 stable function IDs are already documented in the stub comment block.
- **Wave 5 (06-05):** can use `DELIBERATE_LEAK_FIXTURES` for the PII audit + Sentry redaction tests.
- **Phase 10:** carry-forward TODO captured in `06-00-SCHEMA-PUSH-EVIDENCE.md` for the `db:test-migrate --incremental` audit.

## Self-Check: PASSED

All claimed files verified present:
- `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` ✓
- `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` ✓
- `docs/decisions/005-phase-6-schema-migrations.md` ✓
- `apps/tenant-worker-runner/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` ✓
- `apps/inngest-dev/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` ✓
- `tests/runtime/{package.json,tsconfig.json,vitest.config.ts}` ✓
- `tests/runtime/fixtures/{smart-id-fuzz,mock-mcp-clients,deliberate-leak}.ts` ✓

All 7 task / amendment commits present in `git log`:
- `a9fedbc` ✓
- `ca7af5b` ✓
- `721d4a2` ✓
- `13dee13` ✓
- `3ccdbd5` ✓
- `217a868` ✓
- `9e00e8a` ✓
