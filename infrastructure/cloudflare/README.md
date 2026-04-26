# Cloudflare Infrastructure (DEFERRED to Phase 10)

> **Phase 1–9 status:** All Cloudflare Workers / Workers-for-Platforms /
> Hyperdrive provisioning is **deferred to Phase 10** per
> [`.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md`](../../.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md)
> (revision 2). Local development runs everything on Bun / Node via
> `wrangler dev --local`.

## What lives here

| Path                           | Purpose                                                                                              | Status      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------- |
| `scripts/create-namespaces.sh` | Idempotent script to create the 3 CF dispatch namespaces (D-08, FND-09; defends T-1-05 / Pitfall #11) | **Deferred** — exits 78 in Phase 1; Phase-10 enablement removes the guard block |

## Three-namespace cap (D-08)

The architecture mandates **exactly 3** CF dispatch namespaces:
`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`. Tenant identity is
per-Worker-script (not per-namespace): each tenant Worker is named
`{tenant_short_id}-{spec_slug}` and tagged with `tenant_id`, `plan_tier`,
`spec_hash` (max 8 tags per script per CF API limit).

The 3-namespace cap is defended by:

1. **Pre-commit hook** `cf-namespace-guard` (Plan 02) — blocks commits that
   add a 4th namespace name to tracked configs. **Active and dormant** in
   Phase 1 (no namespaces created yet, so the trigger condition cannot fire).
2. **Provisioning script** `scripts/create-namespaces.sh` — when run, refuses
   to create more than 3.
3. **(Phase 10)** CI assertion against the live CF account state — added when
   the deferral guard is removed.

## Local development (Phase 1–9)

Per the deviation pivot, local services replace CF deploys:

| CF deploy target            | Local replacement                                  |
| --------------------------- | -------------------------------------------------- |
| `apps/api` Worker           | `wrangler dev --local` on `http://localhost:8787`  |
| `apps/dispatch` Worker      | `wrangler dev --local` on `http://localhost:8789`  |
| Tenant Workers (per spec)   | `wrangler dev --local` on `http://localhost:8790+` |
| Hyperdrive → Neon Postgres  | Direct `@neondatabase/serverless` over HTTP        |

## Phase 10 enablement

1. Remove the deferral guard block (between the `BEGIN PHASE 10 ENABLEMENT`
   and `END PHASE 10 ENABLEMENT` markers) in `scripts/create-namespaces.sh`.
2. `wrangler login` on the launch machine.
3. `bash scripts/create-namespaces.sh` — creates the 3 namespaces.
4. Add the CI assertion job (`cf-namespace-count`) to
   `.github/workflows/main-ci.yml`. The assertion script body is documented
   in the original Phase-1 plan; deferred for review until activation.
5. Activate the `cf-namespace-guard` pre-commit hook against real CF state.
6. Provision Hyperdrive: `wrangler hyperdrive create mcpgen-pg --connection-string $DATABASE_URL` and paste the resulting `HYPERDRIVE_ID` into `apps/api/wrangler.toml` + `apps/dispatch/wrangler.toml`.
