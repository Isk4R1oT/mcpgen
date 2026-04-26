# Neon Postgres — Phase 1 Setup Runbook

**Source of truth for the DB schema:** `packages/contracts/src/db-schema.ts` (Drizzle ORM
TypeScript declarations). Migrations are committed under `infrastructure/neon/migrations/`
with timestamp prefixes (D-12 / `docs/decisions/001`).

## What this directory contains

| Path | Purpose |
| ---- | ------- |
| `drizzle.config.ts` | Drizzle Kit config (`dialect: postgresql`, `prefix: 'timestamp'`). |
| `migrations/20260427000000_init_schema.sql` | First migration (FND-08). Covers all tables in `docs/mcpgen-architecture.md` §7.1 + §7.2 + the `pending_callbacks` table for SSE callback resume (D-09). Manually augmented with `CREATE EXTENSION IF NOT EXISTS vector` / `timescaledb` and the `SELECT create_hypertable('usage_events', 'time')` call. |
| `migrations/meta/` | Drizzle Kit's snapshot + journal (DO NOT hand-edit; updated by `drizzle-kit generate`). |
| `SCALING.md` | Pitfall #19 mitigation runbook — the W8 dev → Scale-tier compute upgrade procedure (D-18). |

## One-time setup

1. Create a Neon project named `mcpgen` at <https://console.neon.tech>.
2. Create a branch named `dev`.
3. Enable extensions on the dev branch via the Neon Console SQL Editor:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```

   Verify with `psql "$DATABASE_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'timescaledb');"` (expected: 2 rows).
4. Copy the **pooled** connection string (Connection Details → "Pooled connection", role
   `default`). The URL must end with `?sslmode=require`.
5. Add to `.env.local` at the repo root (gitignored):

   ```env
   DATABASE_URL=postgresql://default:****@ep-xxxx-xxxx.us-east-2.aws.neon.tech/mcpgen?sslmode=require
   ```

   `.env.local` is in `.gitignore` and MUST NEVER be committed.

## Required env var

`DATABASE_URL` — Neon connection string (pooled, `sslmode=require`). Set in:

- Local dev: `.env.local`
- GitHub Actions: secrets (per workstream secret env)
- Vercel: project env (Frontend wave only — for SSR access to the same DB)
- Fly.io: `flyctl secrets set DATABASE_URL=...` (Generation Engine)
- Cloudflare Workers: Hyperdrive binding (D-17 — Hyperdrive sits in front of Neon for the BFF)

## Running the migration locally

```bash
set -a && source .env.local && set +a
pnpm --filter @mcpgen/contracts drizzle-kit:push
```

If the interactive prompt blocks on a brand-new DB:

```bash
pnpm exec drizzle-kit push --force --config infrastructure/neon/drizzle.config.ts
```

`--force` is safe here — the tables are brand new with no data to lose.

After the push, verify with:

```bash
pnpm --filter @mcpgen/contracts db:test-migrate
# Expected output: "OK: migration applied; all 9 tables present; usage_events is a hypertable; pgvector enabled."
```

## Schema-change workflow

DO NOT regenerate this migration in place. Subsequent schema changes go in NEW timestamped
files. The pre-commit hook `ir-codegen-check` does not catch DB drift; CI runs
`drizzle-kit check` (per Pitfall #18 / T-1-04 mitigation) and fails on duplicate or
out-of-order migration prefixes.

To add a schema change:

1. Edit `packages/contracts/src/db-schema.ts`.
2. Run `pnpm --filter @mcpgen/contracts drizzle-kit:generate --name=<descriptive_name>`.
   Drizzle emits `infrastructure/neon/migrations/YYYYMMDDHHMMSS_<descriptive_name>.sql`.
3. Commit BOTH the schema change AND the new migration in the same atomic commit.
4. CI runs `pnpm --filter @mcpgen/contracts drizzle-kit:check` — fails on inconsistencies.

## Scaling (D-18)

Phase 1 runs on the Neon **dev tier** (free, 1 vCPU, 2GB RAM) — sufficient for
`drizzle-kit push` + the test-migrate smoke test + Phase 2–5 engine integration.

Before W8 (soft launch is W7+1; production cannot launch on dev tier), upgrade to the
**Scale tier** (≥4 vCPU, 8GB) per the runbook in [`SCALING.md`](./SCALING.md). pgvector +
TimescaleDB + autovacuum on dev tier OOMs under load (Pitfall #19).

## References

- `docs/mcpgen-architecture.md` §7.1 (PostgreSQL schemas) + §7.2 (TimescaleDB hypertables)
- `.planning/phases/01-foundation/01-CONTEXT.md` D-08 (CF dispatch namespaces — `dispatch_namespace` column)
- `.planning/phases/01-foundation/01-CONTEXT.md` D-09 (`pending_callbacks` SSE resume backing store)
- `.planning/phases/01-foundation/01-CONTEXT.md` D-12 / `docs/decisions/001-drizzle-timestamp-prefix-native-format.md`
- `.planning/phases/01-foundation/01-CONTEXT.md` D-17 (Hyperdrive in front of Neon for BFF)
- `.planning/phases/01-foundation/01-CONTEXT.md` D-18 (dev tier free for Phase 1; Scale tier by W8)
- `.planning/phases/01-foundation/01-RESEARCH.md` §"Pattern 5" (Drizzle migration timestamp prefix)
- `.planning/phases/01-foundation/01-RESEARCH.md` §"Pattern 12" (Hyperdrive + Neon serverless setup)
- `.planning/phases/01-foundation/01-RESEARCH.md` §"Pitfall #18" (migration filename collision) + §"Pitfall #19" (pgvector + TimescaleDB OOM on dev tier)
