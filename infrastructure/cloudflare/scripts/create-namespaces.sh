#!/usr/bin/env bash
# DEFERRED — Phase 10 launch-readiness work.
# See .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md (revision 2).
#
# This script creates the 3 mandated CF dispatch namespaces (D-08, FND-09;
# defends T-1-05 / Pitfall #11 — never per-tenant). Per the Phase-1 deviation
# pivot, all CF + Fly.io compute provisioning is deferred to Phase 10. This
# script is committed now as the canonical procedure so it is reviewed,
# linted, and ready to run when the launch-prep window opens.
#
# Calling this script in Phase 1–9 exits with status 78 (EX_CONFIG, "config
# is not in usable state") and prints an actionable error. `bash -n` parses
# the file successfully (so CI lint stays green). Phase-10 enablement: remove
# the early-exit block below the marker.

set -euo pipefail

cat <<'ERR' >&2
ERROR: Cloudflare dispatch-namespace provisioning is DEFERRED to Phase 10.

Per .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md (revision 2),
Phases 1–9 run all compute locally; CF Workers / Workers-for-Platforms /
Hyperdrive are not provisioned until launch-prep (Phase 10).

Do not run this script in Phase 1. Local development uses:
  apps/api         → wrangler dev --local on http://localhost:8787
  apps/dispatch    → wrangler dev --local on http://localhost:8789
  tenant Workers   → wrangler dev --local on http://localhost:8790+

When Phase 10 begins:
  1. Remove the deferral guard (everything between the BEGIN/END markers
     below) and re-commit as `feat(10-NN): activate CF namespace creation`.
  2. Authenticate: wrangler login
  3. Run: bash infrastructure/cloudflare/scripts/create-namespaces.sh
  4. Verify: bash infrastructure/cloudflare/scripts/list-namespaces.sh
ERR
exit 78  # EX_CONFIG — sysexits.h "config is not in usable state"

# === BEGIN PHASE 10 ENABLEMENT ===
# (Remove the `cat ... exit 78` block above to activate. The lines below are
# the canonical idempotent provisioning procedure; reviewed in Phase 1 so the
# Phase-10 author has a working script ready to run.)

NAMESPACES=("mcpgen-prod" "mcpgen-staging" "mcpgen-sandbox")

echo "Verifying wrangler is authenticated..."
wrangler whoami || { echo "ERROR: not logged in. Run: wrangler login" >&2; exit 1; }

for ns in "${NAMESPACES[@]}"; do
  if wrangler dispatch-namespace list 2>/dev/null | grep -q "^${ns}\$"; then
    echo "OK: ${ns} already exists (idempotent skip)"
  else
    echo "Creating dispatch namespace: ${ns}"
    wrangler dispatch-namespace create "${ns}"
  fi
done

echo ""
echo "Final count:"
wrangler dispatch-namespace list
ACTUAL=$(wrangler dispatch-namespace list 2>/dev/null | grep -cE "^mcpgen-(prod|staging|sandbox)\$" || echo 0)
if [[ "${ACTUAL}" -ne 3 ]]; then
  echo "ERROR: expected 3 mcpgen-* namespaces; found ${ACTUAL}" >&2
  exit 1
fi
echo "OK: 3 namespaces present (mcpgen-prod, mcpgen-staging, mcpgen-sandbox)"

# === END PHASE 10 ENABLEMENT ===
