---
phase: 08-auth-billing
plan: 01
task: 5
type: blocking-checkpoint-evidence
status: complete
date_pushed: 2026-04-27T12:49:19Z
---

# Schema Push Evidence — Phase 8 Plan 01 Task 5

Closes the [BLOCKING] checkpoint that defends Phase 8 success criterion #2
(Drizzle migrations cover the full data model). Migration
`infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql`
applied to the Neon dev branch via `db:test-migrate`.

## Push details

| Field | Value |
| ----- | ----- |
| Date pushed (UTC) | `2026-04-27T12:49:19Z` |
| Neon branch | `dev` (`ep-dawn-mode-al5nt62h.c-3.eu-central-1.aws.neon.tech`) |
| Migration file | `infrastructure/neon/migrations/20260428000000_phase8_billing_drift.sql` |
| Migration SHA (`git hash-object`) | `4b4bfc4dacf0fb340b74f9088c114dcd4d3f29ce` |
| Push mechanism | `pnpm --filter @mcpgen/contracts db:test-migrate` |
| TimescaleDB extversion | `2.17.1` (Apache edition — see Deviations) |

## Verification

### `db:test-migrate` output (verbatim, final lines)

```
Phase 1 already applied; skipping init schema.
Applying Phase 8 billing+drift schema…
OK: Phase 8 migration applied; 6 new tables + 6 ALTER columns + usage_hourly materialized view + UNIQUE constraints all present.
```

### New tables (Phase 8) — six present

`drift_email_log`, `drift_events`, `mau_log`, `reconciliation_log`,
`subscription_events`, `usage_events_outbox`

### ALTER columns — six present

| Table | Column |
| ----- | ------ |
| `organizations` | `subscription_status` |
| `organizations` | `quota_period_start` |
| `specs` | `parsed_ir_jsonb` |
| `deployments` | `auto_regenerate_on_drift` |
| `generations` | `cumulative_cost_usd` |
| `generations` | `triggered_by` |

### `usage_hourly` materialized view — present

PostgreSQL `MATERIALIZED VIEW` over `usage_events` with hourly time-bucket
aggregation. Refreshed by an Inngest cron in Wave 2 (`stripe-meters-emit-v1`).

### UNIQUE / CHECK / PK constraints

| Constraint | Kind | Notes |
| ---------- | ---- | ----- |
| `subscription_events_stripe_event_id_key` | UNIQUE | Stripe webhook idempotency |
| `usage_events_outbox_idempotency_key_key` | UNIQUE | Outbox dedup |
| `organizations_stripe_customer_id_unique` | UNIQUE | Tightened from Phase 1 nullable column |
| `drift_email_log_tenant_id_week_start_pk` | PRIMARY KEY | Composite `(tenant_id, week_start)` for ISO-week dedup |
| `generations_triggered_by_check` | CHECK | `triggered_by IN ('user', 'drift_auto', 'drift_manual')` |
| `subscription_events_status_check` | CHECK | `status IN ('received', 'processed', 'error')` |
| `drift_events_status_check` | CHECK | `status IN ('pending', 'reviewing', 'regenerating', 'resolved', 'dismissed')` |

## Deviations

**[Wave 1 deviation — `usage_hourly` materialized view, NOT continuous
aggregate]** Neon ships TimescaleDB Apache edition (community); `WITH
(timescaledb.continuous)` and `add_continuous_aggregate_policy` are
TSL-licensed features and error with `ERROR 0A000: functionality not
supported under the current "apache" license`. Wave 1 falls back to a
regular PostgreSQL `MATERIALIZED VIEW` with manual `REFRESH`, which Wave 2
will drive from `stripe-meters-emit-v1` (the only consumer). API surface is
unchanged — downstream callers only `SELECT FROM usage_hourly`. Recorded
in `08-PHASE-DEVIATIONS.md` (Plan 05 Task 2 will append).

**[Wave 1 idempotency adaptation in `test-migrate.ts`]** The script now
gates Phase 1 / Phase 8 application on sentinel-table existence checks
(`deployments` for Phase 1, `subscription_events` for Phase 8), allowing
re-runs against the live Neon dev branch without re-applying SQL that
contains non-`IF NOT EXISTS` `CREATE TABLE` statements.

## Re-run command

```bash
DBURL=$(grep "^DATABASE_URL_UNPOOLED=" .env.local | cut -d= -f2-)
DATABASE_URL="$DBURL" pnpm --filter @mcpgen/contracts db:test-migrate
```
