# 005 — Phase 6 schema migrations: local_port + idempotency_key

Date: 2026-04-26
Status: Accepted
Workstream: runtime (cross-cutting; touches contracts package owned by main)

## Context
Phase 6 (RUN-01..07, CLI-02, CLI-03) needs two schema changes:
1. `deployments.local_port integer NULL` — local Bun child-process port (NULL for Phase-10 CF deploys; set for Phase-6 local deploys). Surfaced in 06-RESEARCH.md §"Open Question #1".
2. `usage_events.idempotency_key text NOT NULL` + `UNIQUE(deployment_id, idempotency_key, time)` — closes drift between FROZEN `UsageEvent` Zod schema (which has had `idempotency_key` since Phase 1) and the migrated DB (which did not store it). Surfaced in 06-RESEARCH.md §"Open Question #6".

## Decision
- Two separate timestamped migrations, frozen filenames `20260428000000_add_local_port_to_deployments.sql` and `20260428000001_add_idempotency_key_to_usage_events.sql`. Per FND-08 / docs/decisions/001 native YYYYMMDDHHMMSS prefix.
- Both migrations are tagged `[BLOCKING]` in 06-VALIDATION.md and pushed to Neon dev branch via `pnpm --filter @mcpgen/contracts db:test-migrate` before any Wave 1+ test runs.
- Per OPS-02 cross-workstream test ownership: `idempotency_key` change is a `chore(contracts):` PR — this decision-log entry is the paired record.

## TimescaleDB hypertable constraint (TS103)

`usage_events` is a TimescaleDB hypertable partitioned on `time` (per Phase-1 init schema's `create_hypertable` call). TimescaleDB enforces a hard DDL-layer rule (`ts_indexing_verify_columns` in `indexing.c`, error code `TS103`): every UNIQUE index on a hypertable MUST contain the partitioning column. The original Plan 06-00 Task 2 spec used `UNIQUE(deployment_id, idempotency_key)` which Neon rejected with `cannot create a unique index without the column "time" (used in partitioning)`.

Resolution: amended both the TS schema (`packages/contracts/src/db-schema.ts`) and the SQL migration to `UNIQUE(deployment_id, idempotency_key, time)`. Dedup semantics are preserved because `idempotency_key` already encodes the minute-bucket timestamp per Phase-1 D-11 shape `${deployment_id}_${minute_bucket_iso}_${tool_name}` — two events with the same `(deployment_id, idempotency_key)` necessarily share the same `time` bucket, so adding `time` to the index does not change collision behaviour.

Failure evidence: `.planning/phases/06-runtime-plane/06-00-MIGRATION-FAILURE.md` (commit `721d4a2`).

## Consequences
- Wave 4 Inngest function `usage-events-ingest-v1` inserts `idempotency_key` and uses `ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING` for defence-in-depth (UNIQUE constraint catches replays at DB layer).
- Wave 5 `mcpgen deploy` writes `local_port` when registering a local deployment; CF deploys (Phase 10) leave it NULL.
- `tests/runtime/usage-events-pipeline.test.ts` proves dedup works under double-emit.
- Plan 06-04 (Wave 4) `ON CONFLICT` clause must list all three columns of the unique index (`deployment_id, idempotency_key, time`) — single-column or two-column variants will throw a Postgres `there is no unique or exclusion constraint matching the ON CONFLICT specification` error at runtime.
