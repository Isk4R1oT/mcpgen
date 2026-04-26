#!/usr/bin/env bash
# D-15 spike client. Run AFTER `wrangler deploy` to mcpgen-sandbox.
# Usage: bash apps/api/scripts/spike-sse.sh https://mcpgen-api-spike.<sandbox-host>.workers.dev/_spike/sse
set -euo pipefail
URL="${1:?Usage: $0 <spike URL>}"
echo "Connecting to $URL ..."
START=$(date +%s)
curl -N --max-time 100 "$URL" | while IFS= read -r line; do
  NOW=$(date +%s); ELAPSED=$((NOW - START))
  echo "[t=${ELAPSED}s] $line"
done
echo "Stream closed at t=$(($(date +%s) - START))s"
