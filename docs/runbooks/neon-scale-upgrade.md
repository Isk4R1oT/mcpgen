# Runbook: Neon Scale-tier compute upgrade (W7 calendar action)

**References:**

- 09-CONTEXT.md D-17 (Neon Scale-tier upgrade is a Phase 10 W7 calendar action)
- 09-CONTEXT.md D-16 (local synthetic OOM repro test pre-condition)
- `.planning/research/PITFALLS.md` §"#19 pgvector + TimescaleDB Mutual OOM on Neon"
- 09-RESEARCH.md §"Pitfall 19" (Neon OOM mitigation steps)
- `apps/api/tests/load/test_neon_oom_replication.test.ts` (local repro under
  `pnpm --filter @mcpgen/api test:load` with `RUN_LOAD_TESTS=1`)
- `apps/api/scripts/seed-synthetic-usage.ts` (workload seed for the load test)

## When to use

- **W7 of the Phase-10 launch sprint**, before the public launch — the
  default Neon Free / Launch compute tier shares memory across pgvector,
  TimescaleDB, and tsvector workloads, and Pitfall #19 surfaces in
  production as `connection terminated unexpectedly` cascades when the
  three workloads collide.
- **After any major schema change** that adds a new TimescaleDB hypertable
  or pgvector column — re-validate the upgrade headroom.
- **After unscheduled Neon `connection terminated` alerts** in BetterStack
  uptime — confirm via `pnpm outbox:monitor` that the outbox isn't
  backing up (D-21) before declaring the cause is OOM.

This runbook is **idempotent** — re-runs are no-ops; you can safely re-walk
all steps if you are unsure which step you completed last.

## Manual click-path

1. **Snapshot the Neon dev branch** (recovery anchor).
   - Open <https://console.neon.tech>.
   - Project → **Branches** → `main` → **Create snapshot**.
   - Name: `pre-scale-upgrade-YYYY-MM-DD`.
   - Wait for snapshot status `ready` (typically 30–60 s).

2. **Upgrade compute tier to Scale (≥4 vCPU, 8 GB)**.
   - Project → **Settings** → **Compute**.
   - Plan: **Scale** (or higher).
   - Memory: ≥ 8 GB; vCPU: ≥ 4.
   - Click **Save**; Neon will recreate the compute endpoint.
   - Wait for compute spin-up (typically 60–120 s) — `Status: active`.

3. **Apply the Pitfall #19 SQL knobs** via psql.
   - From the local terminal:

     ```bash
     psql "$DATABASE_URL_UNPOOLED" <<'SQL'
     ALTER SYSTEM SET autovacuum_work_mem = '256MB';
     ALTER SYSTEM SET timescaledb.max_background_workers = 2;
     SELECT pg_reload_conf();
     SQL
     ```

   - The two settings cap autovacuum + TimescaleDB worker memory so they
     can't both spike at once and OOM the compute.
   - If Neon refuses `ALTER SYSTEM` (managed-Postgres restriction), file
     the equivalent settings via Neon Console → **Compute Settings** →
     **Advanced** instead.

4. **Re-run the synthetic load test against the upgraded Neon instance**.

   ```bash
   RUN_LOAD_TESTS=1 \
   NEON_OOM_RUN_DURATION_MS=600000 \
   DATABASE_URL="$DATABASE_URL_NEON_SCALE" \
     pnpm --filter @mcpgen/api test:load --reporter verbose
   ```

   - `NEON_OOM_RUN_DURATION_MS=600000` runs the full 10-min sustained
     workload (matches the original Pitfall #19 repro window).
   - The test fails if **any** stream reports a
     `connection terminated unexpectedly` error.

5. **Verify zero `connection terminated unexpectedly` errors** over the
   10-min run.
   - If the test passes → upgrade is verified; proceed to step 6.
   - If the test fails → see "Troubleshooting" below; do **NOT** proceed
     to launch.

6. **Sign-off + screenshot**.
   - Take a screenshot of the Neon Console showing `Compute: Scale`.
   - Take a screenshot of the green test output.
   - Paste both into the `09-PHASE-VERIFICATION.md` Phase-10 verification
     section under "Neon Scale-tier upgrade — W7".
   - Move the deferred item from `STATE.md` → "Deferred Items" to
     "Completed in Phase 10".

## Output

- Neon project on Scale tier, ≥ 4 vCPU + 8 GB.
- `autovacuum_work_mem=256MB` and
  `timescaledb.max_background_workers=2` applied.
- 10-min synthetic load test green against the upgraded compute.
- Screenshot evidence captured in `09-PHASE-VERIFICATION.md`.
- Pitfall #19 marked **mitigated** in `PITFALLS.md`.

## Troubleshooting

- **Load test still reports `connection terminated`** after upgrade.
  - Check Neon Console → **Monitoring** → **Memory usage** during the
    test window. If memory peaked < 80% but errors still fire, the
    cause is connection-pool exhaustion, not OOM — check
    `apps/api/src/db.ts` (Neon HTTP driver pool size) and the
    `usage_events_outbox_pending_idx` partial index health.
- **`ALTER SYSTEM` returns "permission denied"** on managed Neon.
  - Use Neon Console → **Compute Settings** → **Advanced** instead.
  - If the setting is not exposed in the Console, file a Neon support
    ticket; Pitfall #19 is the canonical justification.
- **Snapshot create button is greyed out**.
  - Free / Launch tier limits snapshots to 24 h retention. Upgrade the
    tier first (step 2), then retry the snapshot (step 1).
