#!/usr/bin/env bash
# CI visual-lock guard — defends FE-05 + CONTEXT D-03.
#
# Three-layer defense for the Phase-1 visual lock:
#   (1) .pre-commit-hooks/check-ui-locked.sh blocks locked-file edits at commit time
#   (2) THIS script re-runs the same regex against `git diff --name-only origin/main HEAD` at PR time
#       (defends T-1-01: --no-verify or fork-clone bypass of the local hook)
#   (3) Playwright screenshot-diff (apps/web/playwright.visual-lock.config.ts,
#       maxDiffPixelRatio: 0.001) catches accidental visual drift even when the locked
#       FILES are untouched (e.g. a CSS-var override in a wire-up route)
#
# Escape hatch (paired-ADR pattern, mirrors .pre-commit-hooks/launch-criteria-paired-decision.sh):
#   Locked-file edits MUST land paired with a doc named
#   `docs/decisions/<YYYY-MM-DD>-ui-lock-bump-<slug>.md` in the SAME PR diff.
#   The ADR forces a written decision log before the visual lock is broken.
set -euo pipefail

UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
PAIRED_ADR_PATTERN='^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-ui-lock-bump.*\.md$'

# Resolve the diff range. In CI, origin/main is fetched (fetch-depth: 0).
# Locally, fall back to `main` if `origin/main` is not configured (fresh clone or
# detached worktree). If neither exists, the guard logs and exits 0 (the local
# pre-commit hook is the first-line defense; CI is the redundant net).
if git rev-parse --verify --quiet origin/main >/dev/null; then
  base_ref="origin/main"
elif git rev-parse --verify --quiet main >/dev/null; then
  base_ref="main"
else
  echo "OK: no origin/main or main ref available locally; skipping guard."
  echo "    (CI runs with fetch-depth: 0 + git fetch origin main; this branch is enforced there.)"
  exit 0
fi

diff_files=$(git diff --name-only "$base_ref" HEAD)

locked_touched=$(echo "$diff_files" | grep -E "$UI_LOCKED_PATHS" || true)

if [[ -z "$locked_touched" ]]; then
  echo "OK: no locked UI assets touched in diff vs origin/main."
  exit 0
fi

# Locked file(s) touched — require paired ADR in the SAME diff.
adr_present=$(echo "$diff_files" | grep -E "$PAIRED_ADR_PATTERN" || true)

if [[ -n "$adr_present" ]]; then
  echo "OK: locked UI asset(s) touched, but paired UI-lock-bump ADR is present:"
  echo "$adr_present" | sed 's/^/       /'
  echo "  Locked files in this diff:"
  echo "$locked_touched" | sed 's/^/       /'
  exit 0
fi

echo "ERROR: locked UI asset(s) modified vs origin/main without a paired ADR."
echo ""
echo "  Files touched:"
echo "$locked_touched" | sed 's/^/    /'
echo ""
echo "  Per CONTEXT D-03 + FE-05: Phase 7 is wire-up only — no visual / layout /"
echo "  typography / copy changes. If the visual lock genuinely must be bumped,"
echo "  add the paired ADR in the SAME PR:"
echo ""
echo "    docs/decisions/$(date -u +%Y-%m-%d)-ui-lock-bump-<slug>.md"
echo ""
echo "  Then re-run this guard."
exit 1
