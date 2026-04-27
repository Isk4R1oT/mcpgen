# Logto — MCPGen Auth Provider

**Sources of truth:** D-14, FND-13, RESEARCH §Pattern 13, [`docs/runbooks/logto-pro-upgrade.md`](../../docs/runbooks/logto-pro-upgrade.md).

## Status (Phase 1)

The Logto Cloud tenant for MCPGen has been **manually configured** by the user
(`mcpgen-prod` tenant) with email-password sign-in, the GitHub social connector,
a traditional-web app, and a machine-to-machine app. The credentials live in
`.env.local` (env-var contract documented below).

This README is **documentation-only** — it describes the env-var contract that
downstream apps consume and the canonical procedure that produced the live
state (so the `mcpgen-staging` and `mcpgen-sandbox` tenants can be re-created
from scratch without losing context).

The reference TypeScript scaffolding script in [`scaffold.ts`](./scaffold.ts) is
**reference-only** — it is not executed in Phase 1 (the user has already done
the work manually). It is committed as a typecheck-clean canonical procedure so
a future developer can re-create the tenant idempotically when needed.

## Env-var contract

Every app that talks to Logto reads these four env vars from `.env.local` (or
the equivalent platform secret store). The contract is **stable and frozen**;
downstream apps depend on these names exactly.

| Var                | Source                                                                                  | Used by                                  |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| `LOGTO_ENDPOINT`   | Logto Console → Tenants → `mcpgen-prod` → Settings → tenant URL (e.g. `https://<tenant-id>.logto.app`) | All apps that validate Logto tokens     |
| `LOGTO_BASE_URL`   | Application root URL where Logto redirects after sign-in (`http://localhost:3000` in dev; `https://app.mcpgen.dev` in prod) | `apps/web`, `apps/api`              |
| `LOGTO_APP_ID`     | Logto Console → Applications → "MCPGen Web" → App ID                                    | `apps/web` (OIDC client)                 |
| `LOGTO_APP_SECRET` | Same dialog → App Secret. **Never commit; never log.**                                 | `apps/web` (OIDC client)                 |

For the M2M app (engine ↔ BFF callbacks), an additional triple lives under
`LOGTO_M2M_*` (added Phase 8 Wave 1 — used by `apps/api/src/lib/m2m-token.ts`
and `apps/api/src/middleware/auth.ts`):

| Var                              | Source                                                                                         | Used by                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `LOGTO_M2M_APP_ID`               | Logto Console → Applications → "MCPGen Engine M2M" (Phase 8) → App ID                          | `apps/api` (M2M client_credentials grant)|
| `LOGTO_M2M_APP_SECRET`           | Same dialog → App Secret. **Never commit; never log.**                                         | `apps/api` (M2M client_credentials grant)|
| `LOGTO_M2M_RESOURCE_INDICATOR`   | Logto Console → API Resources → `https://api.mcpgen.dev/m2m` → Resource Indicator              | `apps/api` (M2M JWT audience)            |

## Reachability check

Run this to verify credentials are valid and the tenant is reachable. Exits 0
on success, non-zero with a diagnostic on failure. **Never logs the secret.**

```bash
# Requires: curl, jq, .env.local with LOGTO_* vars exported.
set -a; source .env.local; set +a

# Step 1: client_credentials grant on the M2M app (or the web app — Logto
# accepts both for the management API audience).
TOKEN=$(curl -fsS -X POST "${LOGTO_ENDPOINT}/oidc/token" \
  -u "${LOGTO_APP_ID}:${LOGTO_APP_SECRET}" \
  -d "grant_type=client_credentials&resource=https://${LOGTO_ENDPOINT#https://}/api&scope=all" \
  | jq -r .access_token)

[ -n "${TOKEN}" ] && [ "${TOKEN}" != "null" ] || { echo "ERROR: no access_token"; exit 1; }

# Step 2: GET /api/applications — proves the tenant exists and the M2M
# scope is correct.
curl -fsS "${LOGTO_ENDPOINT}/api/applications" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq 'length' \
  | { read N; echo "OK: ${N} application(s) visible to this token"; }
```

## Sign-in methods (CTRL-02 anti-pattern #5)

The tenant is configured with:

- **Email + password** (primary)
- **GitHub social connector** (secondary)

**No** Google / Twitter / Apple connectors per implementation-plan §11.6
anti-pattern #5 ("OAuth login Google + GitHub + Twitter + Apple → no.
Email + GitHub. Всё."). Adding more connectors is a deliberate scope-pivot
decision that requires a new D-* row.

## Apps per tenant

Each tenant runs:

1. One **traditional web** application — used by `apps/web` for the OIDC
   authorization code flow with the Logto App ID + App Secret pair.
2. One **machine-to-machine** application — used by the Generation Engine and
   BFF for service-to-service calls. Provisioned but not used in Phase 1.

## Phase 8 + W7 (Pro pre-buy — T-1-06 mitigation)

See [`docs/runbooks/logto-pro-upgrade.md`](../../docs/runbooks/logto-pro-upgrade.md). Calendar entry W7 is
required: the free tier caps at 5K MAU and a viral W9 launch can saturate it
within hours. Pro tier is $60/mo for 50K MAU.

## Phase t+3mo (Self-host migration — D-14)

Triggered by: > 5K MAU on Pro tier consistently OR cost > revenue threshold OR
data-residency requirement.

### Self-host runbook

1. Provision Fly Machine with PG 16 + Redis (or Neon branch + Upstash Redis).
2. Deploy Logto OSS via the official Docker image: `docker pull svhd/logto:latest`.
3. Export tenant config from Logto Cloud Admin API:
   `curl -H "Authorization: Bearer $LOGTO_M2M_TOKEN" https://<tenant-id>.logto.app/api/configs > backup.json`.
4. Import into the self-hosted instance: `curl -X POST -d @backup.json $SELF_HOSTED_LOGTO/api/configs`.
5. Update `LOGTO_ENDPOINT` env var across all apps; rotate `LOGTO_APP_SECRET`.
6. DNS cutover: point `auth.mcpgen.dev` from Logto Cloud → self-host IP.
7. Verify: end-to-end OAuth flow on the staging tenant first.

Dry-run on staging by W8 per D-14 (deferred from Phase 1 per
PHASE-DEVIATIONS.md — staging requires the deferred CF/Fly compute deploy).

## Reference scaffolding script

[`scaffold.ts`](./scaffold.ts) is a typecheck-clean reference script that
**could** scaffold a Logto tenant idempotently if needed in the future
(e.g., when re-creating `mcpgen-staging` from scratch or when bootstrapping a
new dev environment). It is not executed in Phase 1.

To run when needed:

```bash
pnpm tsx infrastructure/logto/scaffold.ts
# Reads .env.local, runs an M2M client_credentials grant, lists existing
# applications + connectors, and creates anything missing. Idempotent.
# Outputs created App IDs to stdout — NEVER outputs secrets.
```
