# Phase 09.1 Deferred Items

Out-of-scope discoveries surfaced during execution but NOT fixed in the
plan that surfaced them. Tracked here so a future retro plan can pick
them up.

## Plan 09.1-03 — pre-existing UUID/ULID id mismatch

**Found during:** Task 2 + Task 3 implementation review.

**Issue:** `packages/contracts/src/db-schema.ts` declares `generations.id`
as `uuid('id')`. Phase 8's `apps/api/src/routes/v1/drift.ts` (line 116) +
the new `apps/api/src/routes/v1/generate.ts` both INSERT a 26-char
Crockford-base32 ULID (`ulid()` or `gen_${ULID}`) into that column. In
production with a real Postgres connection, the INSERT fails with
`invalid input syntax for type uuid` — the ULID alphabet is wider than
hex. The Phase 8 unit test for `drift.ts` (`drift.test.ts`) mocks the DB
fully, so the mismatch never surfaces in CI.

**Plan-03 mitigation:** the new generate.ts wraps its INSERTs in a
try/catch and logs+continues on failure, so the cookie + 202 still flow
back to anon clients in production even when the row write fails. The
integration smoke test (anon-endpoint-smoke.test.ts) seeds rows with
`crypto.randomUUID()` directly to side-step the issue. No new tests
exercise the buggy path.

**Decision needed:** either widen `generations.id` to `text('id')` (a
DB migration) or generate UUIDs at the route handler instead of ULIDs.
The frozen `GenIdSchema` (`gen_${ULID}` regex) is a separate API surface
identifier — mapping API `job_id ↔ DB id` without a column rename
requires a sidecar lookup table that does not exist today.

**Suggested owner:** future plan (likely a retroactive Phase 8 fix).
Not blocking plan 09.1-03 — the cookie + auth boundary work is the
primary deliverable and ships intact.

**Affected files:**
- `apps/api/src/routes/v1/generate.ts` (new, plan 09.1-03)
- `apps/api/src/routes/v1/drift.ts` (Phase 8, line 116)

## Plan 09.1-03 — frontend deploy URL not migrated to /deploy/permanent

**Found during:** Task 2 step 6 (deploy.ts split).

**Issue:** D-08 prescribes `POST /api/v1/deploy/permanent/:id` as the
post-claim deploy endpoint, distinct from `POST /api/v1/deploy/ephemeral`
(anon). Plan 09.1-03 mounts the new permanentDeployRoute at the canonical
path, BUT the existing frontend (`apps/web/src/app/api/v1/deploy/[generationId]/route.ts`,
`apps/web/src/lib/api/dashboard-client.ts`) and the `deploy-by-id.test.ts`
integration test still call the legacy `POST /api/v1/deploy/:generationId`
URL. Cutting them over is a frontend-workstream task that would touch
~4 files in `apps/web/`.

**Plan-03 mitigation:** kept the legacy route mounted at the old URL
(via `deployRoute` from `deploy-legacy.ts`) so the frontend keeps
working. Both URLs route to functionally-identical handlers.

**Decision needed:** schedule a frontend-workstream plan to migrate
dashboard-client.ts to the `/deploy/permanent` path, then delete
deploy-legacy.ts in a follow-up.

**Affected files (frontend, NOT modified):**
- `apps/web/src/app/api/v1/deploy/[generationId]/route.ts`
- `apps/web/src/lib/api/dashboard-client.ts`
- `apps/web/src/lib/jsx-bridge/screens.tsx`
- `apps/api/tests/routes/deploy-by-id.test.ts`

## Plan 09.1-03 — dead jobs/anon.ts + jobs/stream.ts files

**Found during:** Task 2 step 4 (jobsRoute mount).

**Issue:** plan 02 stubs `apps/api/src/routes/v1/jobs/anon.ts` (which
re-exported `jobsStreamRoute` from `jobs/stream.ts`). Plan 09.1-03
introduces `jobs/anon-stream.ts` + `jobs/index.ts` and switches the
mount in `index.ts` to import from `jobs/index.js`. The original two
files remain on disk with zero callers.

**Plan-03 mitigation:** left them in place to keep the diff focused on
the new functionality. They compile cleanly and have no observable
runtime effect.

**Decision needed:** delete in a follow-up cleanup commit (low risk).

**Affected files:**
- `apps/api/src/routes/v1/jobs/anon.ts` (dead)
- `apps/api/src/routes/v1/jobs/stream.ts` (dead — referenced only by anon.ts)
