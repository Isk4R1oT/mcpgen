#!/usr/bin/env bash
# Unit test for .pre-commit-hooks/check-ui-locked.sh
# Three scenarios:
#   1. No locked file staged → exit 0
#   2. Locked file staged + paired ADR staged → exit 0
#   3. Locked file staged + NO paired ADR → exit 1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/check-ui-locked.sh"

fail_count=0

run_case() {
  local name="$1"
  local expected_exit="$2"
  shift 2
  local files_to_stage=("$@")

  tmpdir=$(mktemp -d)
  (
    cd "$tmpdir"
    git init -q
    git config user.email "test@example.com"
    git config user.name "test"
    git commit -q --allow-empty -m "init"
    for f in "${files_to_stage[@]}"; do
      mkdir -p "$(dirname "$f")"
      echo "test content" > "$f"
      git add "$f"
    done
    set +e
    bash "$HOOK" >/dev/null 2>&1
    actual_exit=$?
    set -e
    if [[ "$actual_exit" != "$expected_exit" ]]; then
      echo "FAIL [$name]: expected exit $expected_exit, got $actual_exit"
      exit 1
    else
      echo "PASS [$name]: exit $actual_exit (expected)"
      exit 0
    fi
  ) || fail_count=$((fail_count+1))
  rm -rf "$tmpdir"
}

# Case 1: no locked file → exit 0
run_case "no_locked_file" 0 "src/some-other-file.ts"

# Case 2: locked file + paired ADR → exit 0
run_case "locked_with_adr" 0 \
  "apps/web/src/screen-landing.jsx" \
  "docs/decisions/2026-05-01-ui-lock-bump-test.md"

# Case 3: locked file + NO ADR → exit 1
run_case "locked_without_adr" 1 \
  "apps/web/src/screen-landing.jsx"

if [[ "$fail_count" -gt 0 ]]; then
  echo ""
  echo "$fail_count test(s) failed."
  exit 1
fi

echo ""
echo "All check-ui-locked.sh unit tests passed."
exit 0
