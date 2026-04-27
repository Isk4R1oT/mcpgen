# Plan 06-00 — Schema Push Evidence

**Date:** 2026-04-27
**Status:** Pushed to Neon dev DB
**Method:** `drizzle-kit push --config ../../infrastructure/neon/drizzle.config.ts --force` (TTY-less mode)

## Context

The original `pnpm --filter @mcpgen/contracts db:test-migrate` script is designed for fresh-DB acceptance and aborts with "relation deployments already exists" when run against the live dev DB (which already has Phase-1 init). For Phase-6 incremental migrations, `drizzle-kit push --force` is the correct command — it pulls live schema, computes the diff, and applies only the new statements.

## Commits

| Commit | Subject |
|--------|---------|
| `a9fedbc` | feat(06-00): add local_port column to deployments |
| `ca7af5b` | chore(contracts): add idempotency_key + UNIQUE to usage_events |
| `721d4a2` | docs(06-00): record migration push failure (TimescaleDB unique-index constraint) |
| `13dee13` | chore(contracts): include time column in usage_events unique index (TimescaleDB TS103) |

## TimescaleDB TS103 amendment

The original index `UNIQUE(deployment_id, idempotency_key)` was rejected with PG error `TS103` because `usage_events` is a hypertable partitioned on `time`, and TimescaleDB enforces (`ts_indexing_verify_columns` in `indexing.c`) that every UNIQUE index on a hypertable must include the partitioning column. Amendment: `UNIQUE(deployment_id, idempotency_key, time)`. Dedup semantics preserved — `idempotency_key` already encodes the minute-bucket timestamp per Phase-1 D-11. See `docs/decisions/005-phase-6-schema-migrations.md` for the full rationale.

## Verification (live DB query)

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('deployments','usage_events')
  AND column_name IN ('local_port','idempotency_key')
ORDER BY table_name, column_name;
```

Result:
```json
[
  {"table_name":"deployments","column_name":"local_port"},
  {"table_name":"usage_events","column_name":"idempotency_key"}
]
```

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'usage_events_dep_idem_unique';
```

Result:
```json
[{"indexname":"usage_events_dep_idem_unique","indexdef":"CREATE UNIQUE INDEX usage_events_dep_idem_unique ON public.usage_events USING btree (deployment_id, idempotency_key, \"time\")"}]
```

## Phase-10 carry-forward

The `db:test-migrate` script abort against a live DB is a known design tension — fresh-DB acceptance test vs. incremental dev push. Phase-10 launch readiness should:

1. Audit `packages/contracts/scripts/test-migrate.ts` to add an `--incremental` mode that accepts an already-initialized DB and applies only un-applied migrations.
2. Or: switch the Phase-6 schema-push gate to `drizzle-kit push --force` everywhere (CI + local) and reserve `db:test-migrate` for fresh-DB regression tests (which should run against an ephemeral test-DB container, not the dev branch).

For Phase 6, `drizzle-kit push --force` against `DATABASE_URL_UNPOOLED` is the canonical command.
