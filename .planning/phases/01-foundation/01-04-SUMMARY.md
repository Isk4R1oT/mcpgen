---
phase: 01-foundation
plan: 04
subsystem: database
tags: [drizzle, postgres, neon, timescaledb, pgvector, migration, schema, fnd-08]

# Dependency graph
requires:
  - "01-01 (monorepo skeleton — pnpm workspace, Turborepo, @mcpgen/shared-config)"
  - "01-02 (pre-commit hooks + CI + 4 local guards + decision-log scaffolding)"
  - "01-03 (cross-language contracts — @mcpgen/contracts package + STRIPE_METERS_KEY_REGEX + UsageEvent shape)"
provides:
  - "FND-08 — 5th frozen contract (Drizzle ORM TS schema in packages/contracts/src/db-schema.ts; first migration in infrastructure/neon/migrations/20260427000000_init_schema.sql)"
  - "9 tables covering architecture §7.1 + §7.2 + D-09 (pending_callbacks): organizations · users · projects · specs · generations · deployments · tools · pending_callbacks · usage_events"
  - "TimescaleDB hypertable on usage_events partitioned by `time` column"
  - "pgvector custom Drizzle type emitting vector(1536) for tools.embedding"
  - "Pitfall #19 mitigation runbook (infrastructure/neon/SCALING.md) for the W8 dev → Scale-tier upgrade per D-18"
  - "FND-08 acceptance smoke-test script (packages/contracts/scripts/test-migrate.ts) wired to `pnpm --filter @mcpgen/contracts db:test-migrate`"
  - "Drizzle Kit config with prefix: 'timestamp' (D-12 / docs/decisions/001) defending T-1-04 against migration filename collision in parallel worktrees"
  - "@mcpgen/contracts re-exports of Drizzle ORM tables + $inferSelect/$inferInsert row types via packages/contracts/src/db-types.ts"
affects:
  - "01-05 (apps scaffolds): apps/api Hono BFF imports Generation/Deployment row types from @mcpgen/contracts (no redeclaration); apps/dispatch reads pending_callbacks for SSE retry"
  - "01-06 (engine FastAPI): engine writes generations + tools rows; query patterns must align with the 9 tables"
  - "Phase 6 (Runtime Plane): tenant Workers emit usage_events rows via the runtime SDK; Drizzle row type UsageEventRow mirrors the Zod UsageEvent contract"
  - "Phase 8 (Observability/billing): adds CREATE MATERIALIZED VIEW usage_hourly continuous aggregate as a NEW timestamped migration"

tech-stack:
  added:
    - "drizzle-orm@^0.45.2 — TS schema → SQL migration generator"
    - "drizzle-kit@^0.31.10 — CLI for generate/check/push/migrate (devDep)"
    - "@neondatabase/serverless@^1.1.0 — runtime client for CF Workers + edge Hyperdrive (pre-installed for Phase-6 use; not yet imported by code)"
    - "pg@^8 + @types/pg@^8 — node-postgres driver for the test-migrate script (devDep)"
  patterns:
    - "TS Drizzle schema in @mcpgen/contracts is the source of truth; SQL migrations are auto-generated then committed; manual augmentation (CREATE EXTENSION + create_hypertable) lives at the top/bottom of the generated SQL with FROZEN markers"
    - "drizzle-kit `out` resolved relative to caller CWD (`packages/contracts/`), so the config writes paths from that directory: schema './src/db-schema.ts' + out '../../infrastructure/neon/migrations'"
    - "Custom Drizzle type for pgvector via customType<{ data: number[]; driverData: string }> with toDriver/fromDriver round-trip (vector(1536) for embeddings)"
    - "Composite primary keys via `(t) => ({ pk: primaryKey({ columns: [...] }) })` table-level callback (D-09 pending_callbacks on (job_id, event_id))"
    - "Migration filenames frozen by FND-08 spec: `20260427000000_init_schema.sql` (subsequent migrations inherit Drizzle native YYYYMMDDHHMMSS prefix per docs/decisions/001)"
    - "Test-migrate script with documented exit codes (1: env, 2: tables, 3: hypertable, 4: pgvector, 99: unexpected) — each failure mode has a precise return value for CI parsing"

key-files:
  created:
    # Drizzle schema source
    - "packages/contracts/src/db-schema.ts (~210 lines) — 9 pgTable declarations (organizations / users / projects / specs / generations / deployments / tools / pending_callbacks / usage_events), pgvector customType for tools.embedding (vector(1536)), composite PK on pending_callbacks, unique indexes on specs(project_id, content_hash) + tools(generation_id, name), btree indexes on usage_events(time) + (deployment_id, time)"
    - "packages/contracts/src/db-types.ts (~50 lines) — $inferSelect / $inferInsert re-exports for all 9 tables (Organization/NewOrganization … UsageEventRow/NewUsageEventRow)"
    # Migration + Drizzle config
    - "infrastructure/neon/drizzle.config.ts (~35 lines) — prefix: 'timestamp', dialect: 'postgresql', schema: './src/db-schema.ts', out: '../../infrastructure/neon/migrations', dbCredentials: { url: DATABASE_URL ?? '' } (empty fallback so generate/check work without env; push/migrate fail naturally on bad URL)"
    - "infrastructure/neon/migrations/20260427000000_init_schema.sql (130 lines) — first migration, manually augmented top with CREATE EXTENSION IF NOT EXISTS vector + timescaledb, bottom with SELECT create_hypertable('usage_events', 'time', if_not_exists => TRUE)"
    - "infrastructure/neon/migrations/meta/_journal.json — Drizzle Kit journal with the FND-08-frozen tag"
    - "infrastructure/neon/migrations/meta/20260427000000_snapshot.json — Drizzle Kit snapshot aligned with the frozen filename"
    # Runbooks + scripts
    - "infrastructure/neon/README.md (~80 lines) — Phase-1 setup runbook (Neon project + dev branch + extensions + DATABASE_URL location + push command + schema-change workflow + scaling pointer + references)"
    - "infrastructure/neon/SCALING.md (~50 lines) — Pitfall #19 / D-18 runbook for W8 dev → Scale-tier upgrade (≥4 vCPU 8 GB ~$220/mo), upgrade procedure across GH Actions / Vercel / Fly / CF Hyperdrive secrets, rollback semantics"
    - "packages/contracts/scripts/test-migrate.ts (~80 lines) — FND-08 acceptance script; exit codes 0/1/2/3/4/99 documented; verifies all 9 tables + hypertable + pgvector"
  modified:
    - "packages/contracts/package.json — added drizzle-orm + @neondatabase/serverless deps; drizzle-kit + pg + @types/pg devDeps; drizzle-kit:check / generate / push + db:test-migrate scripts"
    - "packages/contracts/src/index.ts — re-export ./db-schema.js + ./db-types.js"
    - "packages/contracts/tsconfig.json — include scripts/**/* so the test-migrate script is type-checked by `pnpm typecheck`"
    - "pnpm-lock.yaml — locked the new deps"

key-decisions:
  - "Used Drizzle's native YYYYMMDDHHMMSS prefix (no underscore between date and time) per docs/decisions/001 — avoids writing a post-generate rename script and `drizzle-kit check` validates lexicographic ordering identically"
  - "Renamed Drizzle's auto-generated `20260426131532_init_schema.sql` to the FND-08-frozen `20260427000000_init_schema.sql` and updated the journal+snapshot tags to match — one-time alignment for the first migration; subsequent migrations adopt Drizzle's CURRENT timestamp natively"
  - "drizzle.config.ts paths written from `packages/contracts/` CWD (not from the config file location) because drizzle-kit resolves `out`/`schema` relative to the caller's working directory; documented inline as a NOTE comment block in the config"
  - "DATABASE_URL falls back to '' in drizzle.config.ts so `drizzle-kit generate` and `drizzle-kit check` work without env (they only read the schema source); `push` and `migrate` fail naturally on bad URL — keeps CI-stage `check` runnable without a live DB"
  - "vector(1536) instead of architecture §7.1's VECTOR(1024) — plan explicitly specified 1536 (matches OpenAI text-embedding-3-small dimension); architecture.md will be reconciled in a future doc-only commit"
  - "Manual SQL augmentation (CREATE EXTENSION at top, create_hypertable at bottom) inside the FROZEN migration file with an explicit comment block warning future readers NOT to regenerate this file in place — pattern documented in infrastructure/neon/README.md schema-change workflow section"

patterns-established:
  - "Drizzle schema pattern in @mcpgen/contracts: pgTable per row + customType for non-native PG types (pgvector) + table-level callback for composite PKs / multi-column indexes"
  - "Migration filename FROZEN with YYYYMMDD000000 sentinel timestamp for first migration in a phase; subsequent migrations use real CURRENT timestamps (Drizzle native)"
  - "infrastructure/<service>/{config, migrations, README.md, SCALING.md} layout — config + first artifacts + setup runbook + scaling runbook colocated under the service's directory"
  - "Test-migrate scripts exit with documented exit codes per failure mode (env / tables / hypertable / extension / unexpected) so CI can parse failures without log scraping"
  - "@mcpgen/contracts re-exports both the Drizzle table objects AND the $inferSelect/$inferInsert types — consumers can do BOTH `db.select().from(generations)` AND `function f(g: Generation)` from a single import"

requirements-completed:
  - FND-08
  # FND-14 (pending_callbacks composite PK) — table is defined, but the requirement
  # is only fully satisfied once Task 4 [BLOCKING] pushes the schema to the live
  # Neon dev branch. Tracked as in_progress until the schema-push evidence is committed.

# Metrics
duration: ~22min
completed: 2026-04-26
---

# Phase 1 Plan 04: DB Schema + Drizzle Migration Summary

**FND-08 (5th frozen contract) shipped: Drizzle TS schema in @mcpgen/contracts + first migration `20260427000000_init_schema.sql` covering all 9 tables (architecture §7.1 + §7.2 + D-09 pending_callbacks) with pgvector + TimescaleDB hypertable DDL. Live schema push to Neon dev branch (Task 4) blocked pending DATABASE_URL.**

## Performance

- **Duration:** ~22 min (Tasks 1–3; Task 4 blocked at checkpoint)
- **Started:** 2026-04-26T18:11Z (approximate — agent spawn)
- **Completed (Tasks 1–3):** 2026-04-26T18:33Z
- **Tasks:** 3 of 4 (Task 4 = `[BLOCKING]` checkpoint, returned to user)
- **Files created:** 8 (db-schema.ts + db-types.ts + drizzle.config.ts + migration SQL + journal + snapshot + README.md + SCALING.md + test-migrate.ts)
- **Files modified:** 4 (packages/contracts/package.json + src/index.ts + tsconfig.json + pnpm-lock.yaml)

## Status: IN PROGRESS

Plan 04 is **not yet complete**. Tasks 1, 2, 3 are committed and verified locally; Task 4 (`[BLOCKING]` schema push) requires:

1. A real Neon dev DB project + branch (one-time setup per `infrastructure/neon/README.md`)
2. `DATABASE_URL` exported in shell or `.env.local` (gitignored)
3. User authorization to run `pnpm --filter @mcpgen/contracts drizzle-kit:push` against that DB

Until Task 4 evidence (`01-04-SCHEMA-PUSH-EVIDENCE.md`) is committed, the plan stays `in_progress` in STATE.md and ROADMAP.md. The frozen contract files (db-schema.ts, migration SQL, drizzle.config.ts, db-types.ts) ARE final and downstream plans (01-05 apps, 01-06 engine) MAY consume them.

## Accomplishments (Tasks 1–3)

- **9 tables defined** in `packages/contracts/src/db-schema.ts` covering identity (organizations / users), projects + specs, generations (with quality_report + llm_cost_breakdown JSONB), deployments (with `dispatch_namespace` per D-08 — never per-tenant), tools (with pgvector embedding), pending_callbacks (D-09 SSE resume backing store with composite PK on (job_id, event_id)), and usage_events (TimescaleDB hypertable per architecture §7.2).
- **First migration generated and committed** at `infrastructure/neon/migrations/20260427000000_init_schema.sql`. Drizzle emitted the file with its CURRENT timestamp; the file was renamed (along with the journal + snapshot) to the FND-08-frozen filename. Migration was manually augmented with `CREATE EXTENSION IF NOT EXISTS vector` + `timescaledb` at the top and `SELECT create_hypertable('usage_events', 'time', if_not_exists => TRUE)` at the bottom. `pnpm --filter @mcpgen/contracts drizzle-kit:check` exits 0.
- **5th frozen contract complete (TS surface):** `packages/contracts/src/db-types.ts` re-exports `$inferSelect` / `$inferInsert` for all 9 tables (Organization/NewOrganization, User/NewUser, …, UsageEventRow/NewUsageEventRow). Downstream BFF + engine code can now `import { Generation, NewGeneration } from '@mcpgen/contracts'`.
- **Pitfall #19 mitigation runbook** (`infrastructure/neon/SCALING.md`) documents the W8 dev → Scale-tier (≥4 vCPU 8 GB / ~$220/mo) upgrade procedure across all 4 secret stores (GH Actions, Vercel, Fly, CF Hyperdrive binding), early-upgrade indicators, smoke-test commands, and rollback semantics.
- **FND-08 acceptance script** (`packages/contracts/scripts/test-migrate.ts`) ready to run as soon as `DATABASE_URL` is provided. Documented exit codes (1: env, 2: tables, 3: hypertable, 4: pgvector, 99: unexpected) let CI parse failures without log scraping.

## Task Commits

Each task was committed atomically per Conventional Commits + git-workflow-rules. All commits passed the 9-hook pre-commit chain (gitleaks, ruff/mypy skipped no-files, eslint workspace lint, conventional-pre-commit, cf-namespace-guard, launch-criteria-guard, ir-codegen-check, ui-locked-guard) and the conventional-commit-msg validator.

1. **Task 1: Drizzle TS schema (db-schema.ts) + db-types.ts + package.json scripts/deps** — `c3b9184` (feat)
2. **Task 2: drizzle.config.ts + first migration SQL + README.md (Phase-1 setup runbook)** — `06c3e8f` (feat)
3. **Task 3: SCALING.md (Pitfall #19) + db:test-migrate smoke script + tsconfig include update** — `77cf97e` (chore)

**Task 4 [BLOCKING]:** NOT STARTED — see "Pending Checkpoint" section below.

**Plan metadata commit:** Will be created together with this SUMMARY.md + STATE.md/ROADMAP.md/REQUIREMENTS.md updates marking the plan as `in_progress` (NOT `complete`).

## Files Created / Modified

### Created (8)

- `packages/contracts/src/db-schema.ts` — Drizzle ORM schema (9 pgTables + pgvector customType + composite PK + indexes)
- `packages/contracts/src/db-types.ts` — `$inferSelect` / `$inferInsert` re-exports for downstream consumers
- `packages/contracts/scripts/test-migrate.ts` — FND-08 acceptance smoke script (exit codes 0/1/2/3/4/99)
- `infrastructure/neon/drizzle.config.ts` — Drizzle Kit config (`prefix: 'timestamp'`, schema/out paths from `packages/contracts/` CWD)
- `infrastructure/neon/migrations/20260427000000_init_schema.sql` — First migration (FROZEN filename per FND-08)
- `infrastructure/neon/migrations/meta/_journal.json` — Drizzle Kit journal with FND-08-aligned tag
- `infrastructure/neon/migrations/meta/20260427000000_snapshot.json` — Drizzle Kit snapshot
- `infrastructure/neon/README.md` — Phase-1 Neon setup runbook
- `infrastructure/neon/SCALING.md` — Pitfall #19 / D-18 W8-upgrade runbook

### Modified (4)

- `packages/contracts/package.json` — drizzle-orm + @neondatabase/serverless deps; drizzle-kit + pg + @types/pg devDeps; 4 new scripts (drizzle-kit:check / generate / push, db:test-migrate)
- `packages/contracts/src/index.ts` — re-export ./db-schema.js + ./db-types.js
- `packages/contracts/tsconfig.json` — include scripts/**/* in typecheck
- `pnpm-lock.yaml` — locked the 5 new deps + their transitive graph

## Pending Checkpoint: Task 4 [BLOCKING]

**Status:** awaiting user action.

**What's needed:**

1. Create a Neon project named `mcpgen` and a branch named `dev` per `infrastructure/neon/README.md` "One-time setup".
2. Enable extensions on the dev branch via the Neon SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```
3. Add `DATABASE_URL=postgresql://...?sslmode=require` to `.env.local` (gitignored) at the repo root.
4. Authorize execution of:
   ```bash
   set -a && source .env.local && set +a
   pnpm --filter @mcpgen/contracts drizzle-kit:push
   pnpm --filter @mcpgen/contracts db:test-migrate
   ```
5. On success, capture the evidence in `.planning/phases/01-foundation/01-04-SCHEMA-PUSH-EVIDENCE.md` per the template in 01-04-PLAN.md Task 4 step 10, and re-run `/gsd-execute-phase 1` (or `/gsd-execute-plan 01-04`) to mark the plan complete.

**Why this is blocking:** Phase-1 success criterion #2 explicitly requires the migration "committed and import-resolved" against a live database. `pnpm build && pnpm typecheck` will pass without the push (TS types come from Drizzle schema config, not the live DB), creating a false-positive verification state. The push closes that loop.

**Why this can't be auto-executed:** modifying a shared upstream resource (Neon DB) without explicit user authorization violates the executor's destructive-action policy. There is also no `DATABASE_URL` available in the current environment (no `.env.local`, no shell env var).

## Verification Confirmation (Tasks 1–3)

```
$ pnpm install --frozen-lockfile           # exits 0
$ pnpm -r typecheck                        # 4 packages all pass
$ pnpm -r test                             # 124 passed across 7 test files
$ pnpm --filter @mcpgen/contracts drizzle-kit:check  # "Everything's fine 🐶🔥"
$ test -f infrastructure/neon/drizzle.config.ts                                     # exists
$ test -f infrastructure/neon/migrations/20260427000000_init_schema.sql             # exists
$ grep -c "pgTable(" packages/contracts/src/db-schema.ts                            # 9
$ grep -c "vector(1536)" packages/contracts/src/db-schema.ts                        # 1
$ grep -c "vector(1536)" infrastructure/neon/migrations/20260427000000_init_schema.sql  # 1
$ grep -c "primaryKey({ columns: \[t.job_id, t.event_id\] })" packages/contracts/src/db-schema.ts  # 1
$ grep -c "PRIMARY KEY.*job_id.*event_id" infrastructure/neon/migrations/20260427000000_init_schema.sql  # 1
$ grep -c "CREATE EXTENSION IF NOT EXISTS vector" infrastructure/neon/migrations/20260427000000_init_schema.sql      # 1
$ grep -c "CREATE EXTENSION IF NOT EXISTS timescaledb" infrastructure/neon/migrations/20260427000000_init_schema.sql # 1
$ grep -c "create_hypertable('usage_events', 'time'" infrastructure/neon/migrations/20260427000000_init_schema.sql   # 1
$ for t in organizations users projects specs generations deployments tools pending_callbacks usage_events; do \
    grep -q "CREATE TABLE \"$t\"" infrastructure/neon/migrations/20260427000000_init_schema.sql && echo "OK: $t"; done
# → 9 OK lines
```

## Decisions Made

- **Drizzle native YYYYMMDDHHMMSS prefix accepted** (per docs/decisions/001) instead of writing a post-generate rename script. `drizzle-kit check` validates lexicographic ordering either way.
- **Migration filename one-time aligned to `20260427000000_init_schema.sql`** for FND-08 by renaming Drizzle's auto-generated `20260426131532_init_schema.sql` and updating the journal + snapshot tags. Subsequent migrations will adopt Drizzle's CURRENT timestamp natively.
- **drizzle.config.ts paths written from `packages/contracts/` CWD** because drizzle-kit resolves `schema` and `out` relative to the caller's working directory, not the config file location. Documented inline as a NOTE comment block.
- **`DATABASE_URL ?? ''` fallback in drizzle.config.ts** so `drizzle-kit generate` and `drizzle-kit check` work without env (they only read the schema source); `push` and `migrate` fail naturally on bad URL.
- **`vector(1536)` instead of architecture §7.1's `VECTOR(1024)`** — plan explicitly specified 1536 (matches OpenAI text-embedding-3-small dimension). Architecture.md will be reconciled in a future doc-only commit. Logged here as a known plan-vs-architecture diff.
- **Manual SQL augmentation inside the FROZEN migration** (CREATE EXTENSION at top, create_hypertable at bottom) with explicit comment markers warning future readers NOT to regenerate the file in place. The schema-change workflow lives in `infrastructure/neon/README.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] drizzle-kit `out: './migrations'` resolved to packages/contracts/migrations instead of infrastructure/neon/migrations**

- **Found during:** Task 2 first `pnpm drizzle-kit:generate` run
- **Issue:** The plan prescribed `out: './migrations'` (which the PATTERNS.md analog also showed). Drizzle Kit resolves `out` relative to the CALLER's CWD, not the config file location. Since `pnpm --filter @mcpgen/contracts ...` runs from `packages/contracts/`, the migration was emitted to `packages/contracts/migrations/20260426131532_init_schema.sql` instead of the FND-08-required `infrastructure/neon/migrations/20260427000000_init_schema.sql`.
- **Fix:** Updated drizzle.config.ts to use paths relative to the caller CWD: `schema: './src/db-schema.ts'` + `out: '../../infrastructure/neon/migrations'`. Removed the wrong-location output (`packages/contracts/migrations/`), regenerated, then renamed to the FND-08-frozen filename and aligned the journal + snapshot tags.
- **Files modified:** `infrastructure/neon/drizzle.config.ts`.
- **Committed in:** `06c3e8f` (Task 2 commit; the fix landed before any wrong-location output was committed).

**2. [Rule 2 — Missing critical] FND-08-frozen filename `20260427000000_init_schema.sql` did not match Drizzle's auto-generated `20260426131532_init_schema.sql`**

- **Found during:** Task 2 immediately after generate
- **Issue:** Drizzle Kit emits with the CURRENT system timestamp; the plan / FND-08 spec / PATTERNS.md all reference the exact frozen filename `20260427000000_init_schema.sql`. Without renaming, downstream PATTERNS.md analogs and the plan's acceptance criteria (which `test -f` the exact path) would fail.
- **Fix:** Renamed both the SQL file and the meta snapshot file (`*_snapshot.json`), and edited `meta/_journal.json` to update the `tag` field to match. drizzle-kit check still exits 0 after the rename.
- **Files modified:** `infrastructure/neon/migrations/20260427000000_init_schema.sql`, `infrastructure/neon/migrations/meta/20260427000000_snapshot.json`, `infrastructure/neon/migrations/meta/_journal.json`.
- **Committed in:** `06c3e8f` (Task 2 commit).

**3. [Rule 2 — Missing critical] scripts/ dir not in tsconfig include — test-migrate.ts would not be type-checked by CI**

- **Found during:** Task 3 typecheck verification
- **Issue:** `packages/contracts/tsconfig.json` had `include: ["src/**/*", "tests/**/*", "vitest.config.ts"]` — the new `scripts/test-migrate.ts` would silently drift from the rest of the package. Manual `tsc --ignoreConfig` confirmed the script type-checks cleanly under strict mode, but the package's own typecheck script wouldn't catch future regressions.
- **Fix:** Added `"scripts/**/*"` to the include array.
- **Files modified:** `packages/contracts/tsconfig.json`.
- **Committed in:** `77cf97e` (Task 3 commit).

---

**Total deviations:** 3 auto-fixed (1 blocking discovery — wrong-CWD path resolution; 2 missing-critical wiring).
**Impact on plan:** All deviations corrected before any wrong-location artifact was committed. No scope creep; plan structure unchanged. The drizzle.config.ts CWD note is documented inline so future plans don't repeat the discovery.

### Authentication Gates

**1. Neon DATABASE_URL not provided — Task 4 blocked at human-action checkpoint**

- **Surface:** Task 4 (`[BLOCKING]` schema push)
- **Gate:** Push to a live Neon dev branch requires `DATABASE_URL` env var; environment scan confirmed no `.env.local`, no `.env`, no shell env var. Modifying a shared upstream resource without explicit user authorization is also out-of-scope per executor's destructive-action policy (see `<sequential_execution>` directive in spawn prompt).
- **Outcome:** Returned a `## CHECKPOINT REACHED` message of type `human-action` to the orchestrator. Tasks 1–3 are committed and verified; the plan stays `in_progress` until the user provides `DATABASE_URL` and authorizes the push.

## Issues Encountered

- **drizzle-kit `out` path semantics:** discovery (Deviation 1) — the path is relative to caller CWD, not config file location. Documented inline as a NOTE comment block in `drizzle.config.ts` so future contributors don't repeat this. Schema-change workflow in `infrastructure/neon/README.md` runs the commands from the right CWD via `pnpm --filter @mcpgen/contracts ...`.
- **No other issues during Tasks 1–3.**

## User Setup Required

**Required to complete the plan (Task 4):**

1. Neon Console → create project `mcpgen` → create branch `dev`.
2. Neon SQL Editor → `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS timescaledb;`.
3. Copy "Pooled connection" URL (must end with `?sslmode=require`) to `.env.local` at the repo root as `DATABASE_URL=postgresql://...`.
4. Authorize and run:
   ```bash
   set -a && source .env.local && set +a
   pnpm --filter @mcpgen/contracts drizzle-kit:push
   pnpm --filter @mcpgen/contracts db:test-migrate
   ```
   Expected: "OK: migration applied; all 9 tables present; usage_events is a hypertable; pgvector enabled."
5. Capture evidence in `.planning/phases/01-foundation/01-04-SCHEMA-PUSH-EVIDENCE.md` per the template in 01-04-PLAN.md Task 4 step 10. Commit. Re-run `/gsd-execute-phase 1`.

## Pointer for Downstream Plans

- **Plan 01-05 (apps scaffolds):** apps/api Hono BFF MUST `import { Generation, NewGeneration, Deployment, NewDeployment, ... } from '@mcpgen/contracts'` rather than redeclaring row types. apps/dispatch reads `pending_callbacks` for SSE retry — type via `import { PendingCallback } from '@mcpgen/contracts'`.
- **Plan 01-06 (engine FastAPI):** the engine writes generations + tools rows. The Drizzle TS types do NOT cross the language boundary; the engine writes via the @mcpgen/contracts STRIPE_METERS_KEY_REGEX + UsageEvent shape (already frozen in Plan 01-03) and the Pydantic mirror of those types (packages/ir/python/types.py).
- **Phase 6 (Runtime Plane):** RUN-01..05 emit `usage_events` rows via the runtime SDK. The Drizzle row type `UsageEventRow` mirrors the Zod `UsageEvent` contract column-for-column.
- **Phase 8 (Observability/billing):** add `CREATE MATERIALIZED VIEW usage_hourly WITH (timescaledb.continuous) AS ...` as a NEW timestamped migration (e.g., `20260601000000_usage_hourly_continuous_aggregate.sql`). DO NOT regenerate the Phase-1 migration in place.
- **Schema-change workflow:** edit `packages/contracts/src/db-schema.ts` → run `pnpm --filter @mcpgen/contracts drizzle-kit:generate --name=<descriptive_name>` → commit BOTH the schema change AND the new migration in the same atomic commit. CI's `drizzle-kit check` fails on inconsistencies.

## Self-Check: PASSED

**Files claimed created — all exist:**

- `packages/contracts/src/db-schema.ts` ✓
- `packages/contracts/src/db-types.ts` ✓
- `packages/contracts/scripts/test-migrate.ts` ✓
- `infrastructure/neon/drizzle.config.ts` ✓
- `infrastructure/neon/migrations/20260427000000_init_schema.sql` ✓
- `infrastructure/neon/migrations/meta/_journal.json` ✓
- `infrastructure/neon/migrations/meta/20260427000000_snapshot.json` ✓
- `infrastructure/neon/README.md` ✓
- `infrastructure/neon/SCALING.md` ✓

**Files claimed modified — all show changes vs Plan-03 baseline:**

- `packages/contracts/package.json` ✓
- `packages/contracts/src/index.ts` ✓
- `packages/contracts/tsconfig.json` ✓
- `pnpm-lock.yaml` ✓

**Commits claimed — all present in `git log`:**

- `c3b9184` feat(01-04): add Drizzle ORM TS schema for FND-08 (9 tables + pgvector + D-09) ✓
- `06c3e8f` feat(01-04): add Drizzle config + first migration SQL (FND-08) ✓
- `77cf97e` chore(01-04): add Neon SCALING.md (D-18) + db:test-migrate smoke script ✓

---
*Phase: 01-foundation*
*Status: in_progress (Task 4 [BLOCKING] pending checkpoint)*
*Tasks 1–3 completed: 2026-04-26*
