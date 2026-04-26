# Drizzle Migration Conflict Resolution (T-1-04)

**Decision drivers:** D-12, RESEARCH §Pitfall #18,
`docs/decisions/001-drizzle-timestamp-prefix-native-format.md`.

## Prevention (default — should never need this runbook)

- All migrations use `prefix: 'timestamp'` (drizzle-kit native format) producing
  `YYYYMMDDHHMMSS_<name>.sql` filenames.
- The `ir-codegen-check` pre-commit hook (Plan 02) catches IR drift; it does
  not check migrations directly — that is CI's job.
- CI's `ops` job runs `pnpm --filter @mcpgen/contracts drizzle-kit:check` on
  every PR; filename-prefix collisions fail the check before merge.

## When two PRs introduce migrations within the same second

Theoretical race: parallel git worktrees both generate migrations whose
timestamp prefixes round to the same second.

### Resolution procedure

1. The PR that merges **second** sees `drizzle-kit check` fail with
   `duplicate timestamp prefix` (or, more often, a merge-conflict on
   `meta/_journal.json`).
2. The author of the second PR re-runs:
   ```bash
   pnpm --filter @mcpgen/contracts drizzle-kit:generate
   ```
   against the **post-merge** `main` branch. This produces a new SQL file
   with a current timestamp.
3. Hand-merge the SQL DDL from the failed file into the new file (rare;
   usually a single `CREATE TABLE` block plus index DDL).
4. Delete the old colliding file; commit; re-PR with a `fix(db):` subject
   noting the rebase.

### Why we don't auto-rename

Drizzle-kit emits one file per generate run. Auto-renaming on collision
would silently lose the file's content if the rename target also collides
in a 3-way race. Surfacing the conflict at PR time is the safer trade —
the human author confirms the merged DDL matches intent.

## Sub-second collision (theoretical, not yet observed)

If two generate runs land in the same `YYYYMMDDHHMMSS` second:

- Add a manual suffix `_a` / `_b` to one filename (e.g.,
  `20260427000000_a_init_schema.sql`, `20260427000000_b_add_user_role.sql`).
- Document the suffix in `docs/decisions/<date>-migration-suffix.md` for
  future-reader traceability.
- Update `meta/_journal.json` to reference both files in chronological
  intent order.

## Recovering from a bad migration applied to Neon dev branch

If a migration was pushed to Neon and turns out to be wrong:

1. Generate a corrective migration: `pnpm --filter @mcpgen/contracts drizzle-kit:generate --custom` and hand-author the corrective SQL.
2. **Do not** edit the original migration file — it is FROZEN once pushed
   (per FND-08 + Plan 04 PATTERNS notes). Drizzle's journal hashes the
   file content; mutation breaks every downstream environment.
3. Test the corrective migration on a Neon branch first
   (`db:test-migrate`), then merge.

## Why migration filename format is FROZEN

The first migration filename `20260427000000_init_schema.sql` was set by
Plan 04 (FND-08). Renaming it after-the-fact would invalidate every
existing Neon dev branch + every future environment. Subsequent migrations
adopt drizzle-kit's current-timestamp output natively per
`docs/decisions/001-drizzle-timestamp-prefix-native-format.md`.
