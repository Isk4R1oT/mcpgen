#!/usr/bin/env bash
# CONTEXT specifics + FE-05: apps/web/src/styles/ and apps/web/src/components/ui/ are LOCKED
# after the initial MCP-Gen.zip unzip commit. Frontend phase = wire-up only; no visual changes.
#
# Escape hatch: drop a marker file `apps/web/.unzip-commit-allowed` alongside the unzip commit;
# this hook deletes the marker after seeing it once, so subsequent commits are guarded again.
set -euo pipefail

changed=$(git diff --cached --name-only)
UI_LOCKED_PATHS='^apps/web/src/(styles|components/ui)/'

if echo "$changed" | grep -qE "$UI_LOCKED_PATHS"; then
  # Allow the initial unzip commit (one-shot marker file).
  if [[ -f apps/web/.unzip-commit-allowed ]]; then
    rm -f apps/web/.unzip-commit-allowed
    exit 0
  fi
  echo "ERROR: apps/web/src/styles/ or apps/web/src/components/ui/ is LOCKED."
  echo "       Per CONTEXT specifics + FE-05: claude-design-ui/MCP-Gen.zip ships unchanged."
  echo "       Frontend phase (Phase 7) is wire-up ONLY — no visual / layout / typography / copy changes."
  exit 1
fi
