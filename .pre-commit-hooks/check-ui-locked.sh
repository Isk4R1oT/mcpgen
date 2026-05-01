#!/usr/bin/env bash
# CONTEXT D-03 + FE-05: locked UI assets ship from claude-design-ui/MCP-Gen.zip
# unzipped flat into apps/web/src/. The following files are LOCKED — no visual /
# layout / typography / copy changes are permitted in Phase 7 (wire-up phase):
#   apps/web/src/MCPGen.html
#   apps/web/src/app.jsx
#   apps/web/src/screen-*.jsx (9 files)
#   apps/web/src/ui.jsx
#   apps/web/src/tokens.jsx
#   apps/web/src/tweaks-panel.jsx
#   apps/web/src/global.css
#   apps/web/src/uploads/
#
# Escape hatch: locked-file edits MUST land paired with an ADR
# `docs/decisions/<YYYY-MM-DD>-ui-lock-bump-<slug>.md` STAGED IN THE SAME COMMIT.
# This hook mirrors the CI guard at .github/workflows/scripts/visual-lock-guard.sh
# (same regex, same paired-ADR semantics) — no asymmetry between local and CI.
set -euo pipefail

changed=$(git diff --cached --name-only)
UI_LOCKED_PATHS='^apps/web/src/(MCPGen\.html|app\.jsx|screen-.*\.jsx|ui\.jsx|tokens\.jsx|tweaks-panel\.jsx|global\.css|uploads/)$'
PAIRED_ADR_PATTERN='^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-ui-lock-bump.*\.md$'

locked_touched=$(echo "$changed" | grep -E "$UI_LOCKED_PATHS" || true)

if [[ -z "$locked_touched" ]]; then
  exit 0
fi

# Locked file(s) touched — require paired ADR staged in the SAME commit.
adr_present=$(echo "$changed" | grep -E "$PAIRED_ADR_PATTERN" || true)

if [[ -n "$adr_present" ]]; then
  echo "OK: locked UI asset(s) touched, but paired UI-lock-bump ADR is staged:"
  echo "$adr_present" | sed 's/^/       /'
  echo "  Locked files in this commit:"
  echo "$locked_touched" | sed 's/^/       /'
  exit 0
fi

echo "ERROR: locked UI file touched. Per CONTEXT D-03 + FE-05:"
echo "       apps/web/src/{MCPGen.html, app.jsx, screen-*.jsx, ui.jsx, tokens.jsx,"
echo "                     tweaks-panel.jsx, global.css, uploads/} are LOCKED."
echo "       Frontend phase (Phase 7) is wire-up ONLY — no visual / layout /"
echo "       typography / copy changes."
echo ""
echo "       If you genuinely need to change a locked asset:"
echo "         1. Create docs/decisions/$(date -u +%Y-%m-%d)-ui-lock-bump-<slug>.md"
echo "            explaining why the visual lock must be broken."
echo "         2. git add the ADR in the SAME commit as the locked-file change."
echo "         3. Re-run git commit (CI guard re-checks at PR time)."
exit 1
