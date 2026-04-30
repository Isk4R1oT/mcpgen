# Phase 9 Plan 02 — Schema Push Evidence

**Plan:** 09-02 (D-19 — public_badge column)
**Date:** 2026-04-30
**Migration:** `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql`
**Auto-mode:** auto-approved after end-to-end verification

## Push Method

`drizzle-kit push` introspects the live DB and tripped on Phase 8's
`usage_hourly` materialized view (created `WITH NO DATA`, not yet refreshed):

```
error: materialized view "usage_hourly" has not been populated
hint: 'Use the REFRESH MATERIALIZED VIEW command.'
```

This is a Phase 8 carry-forward, OUT OF SCOPE for this plan (deferred).
Worked around by applying the idempotent ALTER TABLE directly via
`@neondatabase/serverless` HTTP driver (same driver Drizzle would use),
matching the runbook in `infrastructure/neon/README.md` for surgical
column additions.

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
await sql\`ALTER TABLE \"deployments\" ADD COLUMN IF NOT EXISTS \"public_badge\" boolean DEFAULT false NOT NULL\`;
"
```

## Verification (information_schema query)

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name='deployments' AND column_name='public_badge';
```

Result:

```json
[
  {
    "column_name": "public_badge",
    "data_type": "boolean",
    "column_default": "false",
    "is_nullable": "NO"
  }
]
```

## Acceptance

- [x] Column exists in live Neon dev branch DB
- [x] Type: `boolean`
- [x] Default: `false` (privacy-safe per D-19 rationale)
- [x] NOT NULL (`is_nullable: NO`)

## Wave 2 Gate Status

**[BLOCKING] CLEARED** — Wave 2 plans 09-03 and 09-04 (BFF endpoints
`POST /api/v1/deployments/[id]/badge-public` and `GET /api/v1/deployments`)
can now read/write `deployments.public_badge`.

## Deferred

- `usage_hourly` materialized view refresh — Phase 8 carry-forward
  (matview created `WITH NO DATA`, must be refreshed before next
  `drizzle-kit push` succeeds via standard CLI path). Logged for
  Phase 9 deferred-items.
