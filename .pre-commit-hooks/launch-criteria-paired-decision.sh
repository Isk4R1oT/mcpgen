#!/usr/bin/env bash
# D-13: any commit touching launch-criteria.ts MUST include a paired docs/decisions/ entry.
# Defends T-1-03 (AI-fix-by-lowering-threshold, Pitfall #29).
#
# This is the single most-protected file in the repo. Lowering F2 ≥ 4.0 / F3 ≥ 0.7 /
# bundle thresholds requires a written decision, in the same commit. CI also asserts
# that the values match docs/mcpgen-implementation-plan.md §11.7.
set -euo pipefail

changed=$(git diff --cached --name-only)
if echo "$changed" | grep -q '^packages/contracts/src/launch-criteria\.ts$'; then
  if ! echo "$changed" | grep -qE '^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$'; then
    echo "ERROR: packages/contracts/src/launch-criteria.ts changed without paired docs/decisions/<YYYY-MM-DD>-<slug>.md entry."
    echo "       Per D-13 + Pitfall #29: changing F2/F3/bundle thresholds requires a written decision log."
    echo "       If you genuinely need to change a threshold:"
    echo "         1. Create docs/decisions/$(date +%Y-%m-%d)-<descriptive-slug>.md explaining the change"
    echo "         2. git add it in the same commit"
    echo "         3. Re-run git commit"
    exit 1
  fi
fi
