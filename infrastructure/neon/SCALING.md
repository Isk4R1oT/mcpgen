# Neon Scaling Runbook (Pitfall #19, D-18)

## Status (Phase 1)

- **Compute:** dev tier (free, 1 vCPU, 2 GB RAM)
- **Branch:** `dev`
- **Extensions:** `vector`, `timescaledb` (both verified enabled per Assumption A2/A11; see
  `infrastructure/neon/README.md` for the one-time enable command)

## When to upgrade (D-18)

Before end of W8 (soft launch is W7+1; production cannot launch on dev tier).

Indicators that an earlier upgrade is required:

- `connection terminated unexpectedly` from Neon clients during integration tests (warning sign per RESEARCH §Pitfall #19)
- Slow autovacuum runs visible in `pg_stat_progress_vacuum`
- Hypertable continuous aggregates lagging > 1h behind real-time
- Sustained `wait_event = 'BufferIO'` showing memory pressure on `pg_stat_activity`

## Upgrade procedure

1. **Calendar entry W8:** "Upgrade Neon to Scale-tier (≥4 vCPU, 8 GB)" — set during Phase 1 Wave 1.
2. In Neon Console → Project `mcpgen` → Compute settings:
   - Set min compute = 4 vCPU
   - Set max compute = 8 vCPU
   - RAM = 8 GB
3. Verify capacity:
   ```bash
   psql "$DATABASE_URL" -c "SELECT current_setting('max_connections')"
   # Expected: ≥ 100
   psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_database WHERE datname = current_database()"
   # Expected: healthy stats (low blks_hit/read ratio improvement after upgrade)
   ```
4. Update `DATABASE_URL` in:
   - GitHub Actions secrets (per workstream secret env)
   - Vercel project env (Frontend wave)
   - Fly.io secrets (`flyctl secrets set DATABASE_URL=...` for the Generation Engine)
   - CF Workers Hyperdrive binding (D-17 — Hyperdrive sits in front of Neon for the BFF)
5. Run `pnpm --filter @mcpgen/contracts drizzle-kit:check` against the upgraded compute — schema must be unchanged.
6. Smoke-test:
   - Insert one `usage_events` row.
   - Query the (Phase-8) continuous aggregate.
   - Verify hypertable chunk count > 0:
     ```bash
     psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM _timescaledb_catalog.chunk WHERE hypertable_id = (SELECT id FROM _timescaledb_catalog.hypertable WHERE table_name = 'usage_events')"
     ```

## Cost

Scale-tier ≈ **$220/month**. Pre-bought before W8 per D-18.

## Rollback

Compute can be scaled DOWN with no data loss; storage is per-branch and uncoupled from
compute. If revenue justifies it, scale up further (8 → 16 vCPU); if it doesn't, scale
down to dev tier (data preserved, but autoscale-pause resume incurs ~5 s cold start on
the next request).

## References

- `.planning/phases/01-foundation/01-CONTEXT.md` D-18 (Neon dev tier free for Phase 1; Scale-tier ≥ 4 vCPU 8 GB by W8)
- `.planning/phases/01-foundation/01-RESEARCH.md` §"Pitfall #19" (pgvector + TimescaleDB OOM on dev tier under load)
- `infrastructure/neon/README.md` (Phase-1 setup runbook)
