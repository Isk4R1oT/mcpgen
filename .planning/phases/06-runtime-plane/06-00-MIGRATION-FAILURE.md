---
phase: 06-runtime-plane
plan: 00
task: 3
type: blocking-checkpoint-evidence
status: failed
date_attempted: 2026-04-27T11:43:00Z
---

# Migration Push Failure — Phase 6 Plan 00 Task 3

The Drizzle migration `20260428000001_add_idempotency_key_to_usage_events.sql`
**failed to apply** to the Neon dev branch because the `UNIQUE(deployment_id, idempotency_key)`
index, as authored, is incompatible with TimescaleDB's hypertable partitioning constraint:

> **TimescaleDB hard constraint:** any unique index on a hypertable MUST include the
> partitioning column. The `usage_events` table is partitioned on `time`. Therefore a
> 2-column unique index `(deployment_id, idempotency_key)` cannot be created.

Per Plan 06-00 `<deviation_handling>`: this halts execution with `## PLAN INCONCLUSIVE`
because the failure is architectural (Rule 4) — the corrective fix requires changing the
plan's frozen index shape. The fix path is documented below for the next executor /
planner cycle.

## Verbatim error from `drizzle-kit push`

```
> @mcpgen/contracts@0.0.0 drizzle-kit:push /Users/igor/Projects/mcpgen-runtime/packages/contracts
> drizzle-kit push --config ../../infrastructure/neon/drizzle.config.ts --force

[✓] Pulling schema from database...

 Warning  You are about to execute current statements:

ALTER TABLE "deployments" ADD COLUMN "local_port" integer;
ALTER TABLE "usage_events" ADD COLUMN "idempotency_key" text NOT NULL;
CREATE UNIQUE INDEX "usage_events_dep_idem_unique" ON "usage_events" USING btree ("deployment_id","idempotency_key");

error: cannot create a unique index without the column "time" (used in partitioning)
    at /Users/igor/Projects/mcpgen-runtime/node_modules/.pnpm/pg-pool@3.13.0_pg@8.20.0/node_modules/pg-pool/index.js:45:11
    ...
  length: 149,
  severity: 'ERROR',
  code: 'TS103',
  ...
  file: 'indexing.c',
  line: '95',
  routine: 'ts_indexing_verify_columns'
```

PostgreSQL/TimescaleDB error code: **`TS103`** — `ts_indexing_verify_columns` raised
in `indexing.c:95`. This is a TimescaleDB-specific error class for hypertable
indexing constraints.

## Why the original plan shape cannot work

`usage_events` is registered as a TimescaleDB hypertable in
`infrastructure/neon/migrations/20260427000000_init_schema.sql` (search the file for
`SELECT create_hypertable('usage_events', 'time')`). TimescaleDB enforces — at the
DDL layer, no opt-out — that every UNIQUE index on a hypertable must contain the
partitioning column (`time` here). This is a fundamental architectural property of
TimescaleDB's chunk-based partitioning, not a configuration knob.

The plan's stated index shape:

```sql
CREATE UNIQUE INDEX "usage_events_dep_idem_unique"
    ON "usage_events" USING btree ("deployment_id","idempotency_key");
```

is rejected because it contains neither `time` nor a column functionally dependent
on `time`.

## Fix options (require plan amendment, NOT executor discretion)

Each option preserves the dedup intent (`ON CONFLICT (...) DO NOTHING` for
defence-in-depth) while satisfying the TimescaleDB constraint:

1. **Add `time` to the unique index** — change to
   `UNIQUE(deployment_id, idempotency_key, time)`. Cheapest by miles; preserves
   functional dedup over the same logical key (because `idempotency_key` already
   embeds the `minute_bucket_iso` per `STRIPE_METERS_KEY_REGEX` in
   `packages/contracts/src/idempotency.ts`, two events with the same
   `(deployment_id, idempotency_key)` will inherently share the same `time` bucket
   to within minute precision). Wave 4 Inngest function rewrites
   `ON CONFLICT (deployment_id, idempotency_key) DO NOTHING` to
   `ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING`.

2. **Drop the DB-layer UNIQUE; rely on application-layer dedup only.** Inngest function
   would need to do a `SELECT 1 FROM usage_events WHERE deployment_id=$1 AND idempotency_key=$2 LIMIT 1`
   pre-check before insert. Loses the defence-in-depth promise from
   `docs/decisions/005-phase-6-schema-migrations.md` Consequences §; not recommended.

3. **Move the dedup table out of the hypertable.** Create a separate
   `usage_event_dedup` btree table keyed on `(deployment_id, idempotency_key)` that
   the Inngest function inserts into first; rolls back if conflict; then inserts the
   real row into `usage_events`. Two-table-write transaction; doable but
   architecturally heavier than option 1.

## Recommended path

**Option 1.** Update Plan 06-00 Task 2 instructions to:
- Schema TS: `uniqueIndex('usage_events_dep_idem_unique').on(t.deployment_id, t.idempotency_key, t.time)`
- Migration SQL: `CREATE UNIQUE INDEX "usage_events_dep_idem_unique" ON "usage_events" USING btree ("deployment_id","idempotency_key","time");`
- Update `docs/decisions/005-phase-6-schema-migrations.md` Consequences:
  Wave 4 Inngest function uses
  `ON CONFLICT (deployment_id, idempotency_key, time) DO NOTHING`.
- Add a note in the decision-log that the 3-column constraint is forced by
  TimescaleDB hypertable indexing rules; the dedup intent is preserved because
  `idempotency_key` (`${deployment_id}_${minute_bucket_iso}_${tool_name}`)
  encodes the `time` bucket already.

## Current state of the repo at failure time

| Artifact | Status |
| -------- | ------ |
| `packages/contracts/src/db-schema.ts` | Modified (Task 1 committed `a9fedbc`, Task 2 committed `ca7af5b`) — both columns + the bad index declared |
| `infrastructure/neon/migrations/20260428000000_add_local_port_to_deployments.sql` | Committed (`a9fedbc`); **NOT applied** to Neon dev (push aborted before either statement landed because Postgres ran the batch atomically) |
| `infrastructure/neon/migrations/20260428000001_add_idempotency_key_to_usage_events.sql` | Committed (`ca7af5b`); **NOT applied** to Neon dev |
| `docs/decisions/005-phase-6-schema-migrations.md` | Committed (`ca7af5b`) |
| Neon dev branch `usage_events` table | **Unchanged** — no `idempotency_key` column, no unique index |
| Neon dev branch `deployments` table | **Unchanged** — no `local_port` column |
| `drizzle-kit:check` | Passes (it only validates TS schema vs migrations directory; doesn't talk to DB) |

## Next agent action

Re-spawn this plan after a planner amends Task 2 per Option 1 above. The TS schema +
SQL migration files committed in `a9fedbc` and `ca7af5b` will need a follow-up commit
that adjusts the index shape; the migrations themselves can be edited in place
**before** they are applied (per the FROZEN filename rule, the rule applies once
the migration has been pushed to a real DB — these never were).

## Pointer

- Plan: `.planning/phases/06-runtime-plane/06-00-PLAN.md` Task 3
- Failed commit chain: `a9fedbc` (Task 1) + `ca7af5b` (Task 2)
- TimescaleDB docs: https://docs.timescale.com/use-timescale/latest/hypertables/about-hypertables/#limitations (Limitations §"Constraint exclusion")
- `infrastructure/neon/migrations/20260427000000_init_schema.sql` line near "create_hypertable"
- `packages/contracts/src/idempotency.ts` `STRIPE_METERS_KEY_REGEX` (proves `idempotency_key` already encodes `minute_bucket_iso`, so adding `time` to the index does not change dedup semantics)
