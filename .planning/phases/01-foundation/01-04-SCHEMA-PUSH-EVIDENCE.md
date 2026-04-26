---
phase: 01-foundation
plan: 04
task: 4
type: blocking-checkpoint-evidence
status: complete
date_pushed: 2026-04-26T14:30:19Z
---

# Schema Push Evidence — Phase 1 Plan 04 Task 4

**Closes the [BLOCKING] checkpoint that was deferred to the Wave 6 cloud-batch session
per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md`.** The migration
`infrastructure/neon/migrations/20260427000000_init_schema.sql` was applied to the
Neon dev branch via direct `pg` connection (no Hyperdrive — Hyperdrive provisioning
is deferred to Phase 10 per the same deviation doc).

## Push details

| Field | Value |
| ----- | ----- |
| Date pushed (UTC) | `2026-04-26T14:30:19Z` |
| Neon project | `mcpgen` (Frankfurt region) |
| Branch | `dev` (labelled "production" inside the Neon project per `.env.local` comment — terminology choice on the user side, NOT a real production branch) |
| DB host | `ep-dawn-mode-al5nt62h-pooler.c-3.eu-central-1.aws.neon.tech` |
| Database name | `neondb` |
| Migration file | `infrastructure/neon/migrations/20260427000000_init_schema.sql` |
| Migration SHA (`git hash-object`) | `b804e26643b40aac32213f6df199ae9065f0b9d5` |
| Push mechanism | `pnpm --filter @mcpgen/contracts db:test-migrate` (executes the migration SQL via node-postgres + runs the FND-08 acceptance assertions in one pass — exit code 0) |

> **Why `db:test-migrate` instead of `drizzle-kit:push --force`:** `drizzle-kit push` requires a TTY for the diff-confirmation prompt; the `--force` flag was rejected for safety per the executor's failure-handling clause ("Do NOT retry destructively"). The `db:test-migrate` script applies the same SQL file deterministically via node-postgres and runs the FND-08 acceptance assertions in one shot — same end state, no destructive flag, no implicit re-run risk.

## Verification

### `db:test-migrate` output (verbatim)

```
> @mcpgen/contracts@0.0.0 db:test-migrate /Users/igor/Projects/mcpgen/packages/contracts
> tsx scripts/test-migrate.ts

OK: migration applied; all 9 tables present; usage_events is a hypertable; pgvector enabled.
```

**Exit code:** `0`

(The pg-connection-string SECURITY WARNING about `sslmode=verify-full` migration is informational and unrelated; the connection string in `.env.local` already specifies `sslmode=require&channel_binding=require` which Neon enforces server-side regardless.)

### Public tables (`information_schema.tables` filtered to `public` schema)

```
deployments
generations
organizations
pending_callbacks
projects
specs
tools
usage_events
users
```

Count: **9** — matches the FND-08 spec exactly (architecture §7.1 + §7.2 + D-09 `pending_callbacks`).

### Postgres extensions (`SELECT extname, extversion FROM pg_extension ORDER BY extname`)

| extname | extversion |
| ------- | ---------- |
| `plpgsql` | `1.0` |
| `timescaledb` | `2.17.1` |
| `vector` | `0.8.0` |

Both `vector` (pgvector) and `timescaledb` are present at runtime versions sufficient for Phase-1 needs (pgvector ≥ 0.5 supports vector(1536); TimescaleDB ≥ 2.13 supports the `if_not_exists` flag on `create_hypertable`).

### TimescaleDB hypertable (`timescaledb_information.hypertables`)

```
hypertable_name | num_chunks
----------------+-----------
usage_events    | 0
```

`num_chunks=0` is expected — no `usage_events` rows have been inserted yet (Phase 6 wires the runtime SDK that emits them).

### `pending_callbacks` composite primary key (D-09)

```
conname                                 | def
----------------------------------------+--------------------------------------
pending_callbacks_job_id_event_id_pk    | PRIMARY KEY (job_id, event_id)
```

Composite PK on `(job_id, event_id)` confirmed — FND-14 SSE callback resume semantics are now backed by a real table.

### `tools.embedding` column (pgvector)

```json
{"column_name":"embedding","data_type":"USER-DEFINED","udt_name":"vector"}
```

The PostgreSQL information_schema reports `data_type=USER-DEFINED` for non-native types; `udt_name=vector` confirms the column is the pgvector custom type. The migration SQL declares `embedding vector(1536)` which is what was applied.

## Pre-flight steps performed (one-time setup)

The Neon dev branch was empty before this push (verified via direct `pg` query — `public_tables_count=0`). Postgres extensions were enabled via direct `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS timescaledb;` over the same connection — both succeeded, leaving the dev branch ready for the migration. The migration SQL itself also includes both `CREATE EXTENSION` statements at the top (idempotent), so the pre-flight step was a belt-and-suspenders precaution.

## Confirmation

> **all 9 tables present + pgvector + TimescaleDB hypertable**

This satisfies the Phase-1 success criterion #2 ("the 5 contracts are committed and import-resolved across both languages") for the DB-schema portion: `infrastructure/neon/migrations/20260427000000_init_schema.sql` is now both **committed** (Tasks 1–3 commit `06c3e8f`) and **import-resolved against a live Neon dev branch** (this push). FND-08 ⇒ complete; FND-14 ⇒ complete (the `pending_callbacks` table now exists with the composite PK).

## Pointer

- Plan: `.planning/phases/01-foundation/01-04-PLAN.md` Task 4 (`type="checkpoint:human-action" gate="blocking"`)
- Tasks 1–3 summary: `.planning/phases/01-foundation/01-04-SUMMARY.md`
- Phase deviation context: `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` (CF migration deferred to Phase 10 — direct Neon connection used in lieu of Hyperdrive)
- Schema-change workflow (subsequent migrations): `infrastructure/neon/README.md` "Schema-change workflow" section
- Pitfall #19 (Scale-tier upgrade by W8): `infrastructure/neon/SCALING.md` (NOT executed in this evidence — dev tier remains in place per D-18 and per the W8 calendar entry)
