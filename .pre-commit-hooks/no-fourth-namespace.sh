#!/usr/bin/env bash
# D-08 / Pitfall #11 → T-1-05: never create a 4th CF dispatch namespace.
# Allowed: mcpgen-prod, mcpgen-staging, mcpgen-sandbox.
#
# Greps tracked files for `wrangler dispatch-namespace create <name>` invocations
# and fails the commit if any name is not in the allow-list OR if total distinct
# names exceeds 3.
set -euo pipefail

ALLOWED='^(mcpgen-prod|mcpgen-staging|mcpgen-sandbox)$'

# Collect all distinct namespace names referenced by `wrangler dispatch-namespace create`
# in tracked files under infrastructure/cloudflare/, *.toml, *.sh, *.md.
declare -a HITS=()
while IFS= read -r ns; do
  [[ -n "$ns" ]] && HITS+=("$ns")
done < <(git grep -h -E "wrangler[[:space:]]+dispatch-namespace[[:space:]]+create[[:space:]]+\S+" \
  -- 'infrastructure/cloudflare/**' '**/*.toml' '**/*.sh' '**/*.md' 2>/dev/null \
  | sed -E "s/.*wrangler[[:space:]]+dispatch-namespace[[:space:]]+create[[:space:]]+([a-z0-9-]+).*/\1/" \
  | sort -u || true)

UNIQUE_COUNT=${#HITS[@]}
FAILED=0

for ns in "${HITS[@]:-}"; do
  if [[ -n "$ns" && ! "$ns" =~ $ALLOWED ]]; then
    echo "ERROR: forbidden CF dispatch namespace '$ns' detected. Allowed: mcpgen-prod, mcpgen-staging, mcpgen-sandbox (D-08, Pitfall #11)."
    FAILED=1
  fi
done

if [[ "$UNIQUE_COUNT" -gt 3 ]]; then
  echo "ERROR: $UNIQUE_COUNT distinct CF dispatch namespaces found in tracked files; max 3 allowed (D-08)."
  FAILED=1
fi

exit "$FAILED"
