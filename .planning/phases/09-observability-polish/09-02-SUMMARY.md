---
phase: 09-observability-polish
plan: 02
subsystem: database
tags: [drizzle, postgres, neon, migration, schema, badge]

# Dependency graph
requires:
  - phase: 07-frontend-wire-up
    provides: dashboard badge-public toggle UI expecting deployments.public_badge column
  - phase: 08-auth-billing
    provides: deployments.auto_regenerate_on_drift column (Phase 8 sibling additive pattern)
provides:
  - deployments.public_badge boolean column (notNull, default false) live in Neon dev branch
  - FROZEN migration 20260430000000_phase9_badge_public.sql with idempotent ADD COLUMN IF NOT EXISTS
  - Drizzle journal idx=4 entry tag=20260430000000_phase9_badge_public
  - Repaired Phase 8 snapshot prevId chain (was 36509bbb→ now 12c6731a; T-9-mig-01 mitigation)
  - Vitest regression test apps/api/tests/migrations/badge-public.test.ts gating future schema drift
affects: [09-03, 09-04, 09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle migration timestamp prefix > prior phase max (Pitfall #18)"
    - "Idempotent ADD COLUMN IF NOT EXISTS for partial-apply safety (Phase 8 pattern)"
    - "Drizzle snapshot prevId chain repair via single id swap (T-9-mig-01)"
    - "Hand-author FROZEN migration filename + matching snapshot when drizzle-kit emits auto timestamp"
    - "Conditional integration test via describe.skipIf(!process.env.DATABASE_URL) (D-01 empty-env no-op)"
    - "Neon serverless HTTP driver for surgical column adds when push trips on unrelated matview state"

key-files:
  created:
    - infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql
    - infrastructure/neon/migrations/meta/20260430000000_snapshot.json
    - apps/api/tests/migrations/badge-public.test.ts
    - .planning/phases/09-observability-polish/09-02-SCHEMA-PUSH-EVIDENCE.md
  modified:
    - packages/contracts/src/db-schema.ts
    - infrastructure/neon/migrations/meta/_journal.json
    - infrastructure/neon/migrations/meta/20260428000002_snapshot.json

key-decisions:
  - "Repair Phase 8 snapshot prevId chain (000002 prevId 36509bbb -> 12c6731a) inline as T-9-mig-01 mitigation"
  - "Hand-author FROZEN-prefixed migration files instead of accepting drizzle-kit auto timestamp"
  - "Apply ALTER TABLE via @neondatabase/serverless HTTP driver because drizzle-kit push tripped on Phase 8 unrelated unrefreshed usage_hourly matview"
  - "Snapshot 20260430000000_snapshot.json copied from 000002 base + public_badge column appended (preserves Phase 8 chain corruption invariants without expanding scope)"
  - "Test 5 (static-source contract) runs unconditionally; Tests 1-4 (live-DB) skip cleanly when DATABASE_URL unset"

patterns-established:
  - "Phase N additive column pattern: edit packages/contracts/src/db-schema.ts -> drizzle-kit:generate -> rename to FROZEN prefix -> hand-edit journal idx + snapshot prevId chain -> push via direct neon serverless when matview state blocks drizzle-kit push"
  - "Snapshot prevId repair (T-9-mig-01): when drizzle-kit:check reports 'collision: snapshots pointing to same parent', identify the journal-order ancestor and update prevId to its id; verify with drizzle-kit:check exit 0"

requirements-completed: [CTRL-08]

# Metrics
duration: 18min
completed: 2026-04-30
---

# Phase 9 Plan 02: Phase 9 public_badge Column Migration Summary

**Drizzle migration adds deployments.public_badge boolean (notNull, default false) to live Neon dev branch via FROZEN-prefix migration + repaired Phase 8 snapshot chain, unblocking Wave 2 BFF endpoints**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-30T17:11:00Z
- **Completed:** 2026-04-30T17:29:00Z
- **Tasks:** 3 (Task 2 was a checkpoint:human-verify auto-approved in auto-mode)
- **Files modified:** 4 created, 3 modified

## Accomplishments

- `deployments.public_badge` column live in Neon dev branch — verified via `information_schema.columns` (data_type=boolean, column_default=false, is_nullable=NO)
- FROZEN migration `20260430000000_phase9_badge_public.sql` (sha256 `8be57fb0cd30ee95c71eb8230318ba11a03861f2de15466b7ba4f78f208aec08`) — idempotent ADD COLUMN IF NOT EXISTS so re-runs are safe
- Drizzle journal idx=4 entry references `20260430000000_phase9_badge_public` (Pitfall #4 of Phase 9 RESEARCH satisfied)
- Phase 8 snapshot `20260428000002_snapshot.json` prevId chain repaired (was 36509bbb pointing to init snapshot, now 12c6731a pointing to idempotency_key snapshot per journal order) — `drizzle-kit:check` exits 0
- Regression test `apps/api/tests/migrations/badge-public.test.ts` — 5/5 tests pass with DATABASE_URL set; 1/5 passes + 4 skip cleanly without (D-01 invariant preserved)
- [BLOCKING] Wave 2 plans 09-03 / 09-04 (BFF endpoints reading/writing `deployments.public_badge`) unblocked

## Task Commits

1. **Task 1: Add public_badge to db-schema.ts and generate migration** — `4f1c780` (feat)
2. **Task 2 [BLOCKING]: Schema push to local Postgres dev DB** — `1eab631` (chore — evidence file; auto-approved checkpoint in auto-mode)
3. **Task 3: Migration integration test** — `7ee0439` (test)

## Files Created/Modified

- `packages/contracts/src/db-schema.ts` — appended `public_badge: boolean('public_badge').notNull().default(false)` to deployments table after auto_regenerate_on_drift
- `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` — FROZEN-prefix migration with idempotent ALTER TABLE
- `infrastructure/neon/migrations/meta/20260430000000_snapshot.json` — Drizzle snapshot (id 9a2b4c6d-..., prevId 5e5128f0 chain Phase 8)
- `infrastructure/neon/migrations/meta/_journal.json` — idx=4 entry tag=20260430000000_phase9_badge_public, when=1777551295910
- `infrastructure/neon/migrations/meta/20260428000002_snapshot.json` — prevId surgically swapped from 36509bbb (init) to 12c6731a (idempotency_key) to repair pre-existing Phase 8 chain corruption
- `apps/api/tests/migrations/badge-public.test.ts` — 5 vitest assertions (4 live-DB conditional + 1 static-source unconditional)
- `.planning/phases/09-observability-polish/09-02-SCHEMA-PUSH-EVIDENCE.md` — push evidence + auto-approval rationale + matview deferred note

## Decisions Made

- **Repair Phase 8 snapshot prevId chain (T-9-mig-01 inline):** drizzle-kit:check would never pass with the pre-existing chain corruption (000000 + 000002 both claimed init as parent). Per the plan's threat model, T-9-mig-01 is "mitigate" via journal hand-edit + drizzle-kit:check gate; fixing the historic Phase 8 prevId IS the mitigation. Single-byte prevId swap, no SQL or column changes.
- **Hand-author FROZEN-prefixed files:** drizzle-kit:generate produced `20260430121455_brave_betty_ross.sql` (current UTC HHMMSS suffix). Per Pitfall #18 + plan steps 3-4, the file MUST use FROZEN prefix `20260430000000`. Deleted auto-generated artifacts and hand-authored both SQL and snapshot, mirroring 20260428000000_add_local_port_to_deployments.sql precedent.
- **Use neon serverless HTTP driver instead of drizzle-kit push:** drizzle-kit push introspects live DB and tripped on Phase 8 `usage_hourly` matview created `WITH NO DATA` (error: 'materialized view "usage_hourly" has not been populated'). Refreshing that matview is unrelated to Phase 9 scope. Applied idempotent ALTER TABLE directly via the same neon driver Drizzle uses; verified via information_schema query.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired Phase 8 snapshot prevId chain corruption**
- **Found during:** Task 1 (drizzle-kit:generate first run)
- **Issue:** `infrastructure/neon/migrations/meta/20260428000002_snapshot.json` had `prevId: 36509bbb-...` (id of init schema), but `_journal.json` order placed it at idx=3 after `20260428000001_add_idempotency_key` (snapshot id `12c6731a-...`). Both 000000 and 000002 snapshots claimed init as parent, creating a fork. drizzle-kit reported "are pointing to a parent snapshot ... which is a collision" — blocking generate AND check.
- **Fix:** Updated 20260428000002_snapshot.json `prevId` from `36509bbb-4a6d-454b-afd7-ac56a4ac204b` to `12c6731a-905f-4e58-9e90-11f34c802d00` (id of idempotency_key snapshot per journal idx=2). Single-field swap; no SQL DDL, no schema content changes.
- **Files modified:** infrastructure/neon/migrations/meta/20260428000002_snapshot.json
- **Verification:** `pnpm --filter @mcpgen/contracts drizzle-kit:check` exits 0
- **Committed in:** 4f1c780 (Task 1 commit)
- **Threat model alignment:** This IS T-9-mig-01 mitigation per the plan's threat register ("Drizzle journal out-of-sync with migration filenames" — disposition: mitigate via "explicit journal hand-edit + drizzle-kit:check CI gate").

**2. [Rule 3 - Blocking] Direct ALTER TABLE via neon serverless instead of drizzle-kit push**
- **Found during:** Task 2 (drizzle-kit push)
- **Issue:** `drizzle-kit push` introspects live DB and failed with `materialized view "usage_hourly" has not been populated` (Phase 8 `WITH NO DATA` matview never refreshed). Refresh is heavy, requires Phase 8 ops decision, and is unrelated to Phase 9 column add.
- **Fix:** Applied idempotent `ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "public_badge" boolean DEFAULT false NOT NULL` directly via `@neondatabase/serverless` HTTP driver (same driver Drizzle uses). Verified the column via `information_schema.columns` query (data_type=boolean, column_default=false, is_nullable=NO).
- **Files modified:** none (live-DB state change only; migration SQL file is the canonical record)
- **Verification:** information_schema query result captured in 09-02-SCHEMA-PUSH-EVIDENCE.md
- **Committed in:** 1eab631 (Task 2 evidence commit)

---

**Total deviations:** 2 auto-fixed (Rule 3 blocking × 2)
**Impact on plan:** Both deviations were necessary to complete the plan's stated success criteria. The first was inline T-9-mig-01 mitigation per the plan's own threat register; the second was a workaround for an unrelated Phase 8 carry-forward (matview refresh state). No scope creep — both fixes preserved the plan's contract.

## Issues Encountered

- **drizzle-kit:generate emitted auto-timestamp filename** (`20260430121455_brave_betty_ross.sql`) instead of FROZEN `20260430000000` prefix. Resolved per plan step 3 (delete auto-generated, hand-author with FROZEN name).
- **.env.local has unquoted `&` in DATABASE_URL** breaking `set -a; source .env.local; set +a;`. Resolved via `grep + cut` extraction in shell.
- **psql not installed locally** — used `node + @neondatabase/serverless` instead for direct DB query.

## User Setup Required

None — no external service configuration. Migration applied to existing Neon dev branch using credentials already in `.env.local`.

## Next Phase Readiness

- **Wave 2 BFF endpoints (09-03, 09-04) UNBLOCKED:** `deployments.public_badge` exists in live DB; Drizzle schema source agrees; regression test gates future drift.
- **Carried forward to Phase 9 deferred-items:** `usage_hourly` matview refresh (created `WITH NO DATA` in Phase 8 plan 05; blocks `drizzle-kit push` until refreshed; not blocking for any Wave 2 plan since they read columns, not the matview).

## Self-Check: PASSED

All declared files verified on disk; all 3 task commit hashes (`4f1c780`, `1eab631`, `7ee0439`) verified in git log.

---
*Phase: 09-observability-polish*
*Completed: 2026-04-30*
