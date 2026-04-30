#!/usr/bin/env bash
# Pre-commit hook: any change to packages/engine-fixtures/_canonical/*.{json,md}
# requires a paired docs/decisions/<YYYY-MM-DD>-<slug>.md entry in the same commit.
#
# Mirrors .pre-commit-hooks/launch-criteria-paired-decision.sh (Phase 1 D-13 + Pitfall #29).
# Phase 5 D-48 — defends T-5-05 (search/fetch immutability, Pitfall #32) +
# T-5-06 (mcp-schema pin, Pitfall #33).
#
# Why staged-change-A-only filter on the decision doc match: a paired decision must be a
# NEW file in this commit (filter A). Modifying an existing decision doc to satisfy the gate
# would silently bypass the audit trail.

set -euo pipefail

canonical_changed=$(git diff --cached --name-only | grep -E '^packages/engine-fixtures/_canonical/.*\.(json|md)$' || true)
if [[ -z "$canonical_changed" ]]; then
    exit 0
fi

decision_added=$(git diff --cached --name-only --diff-filter=A | grep -E '^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$' || true)
if [[ -z "$decision_added" ]]; then
    echo "ERROR: changes to canonical fixtures detected but no paired decision doc:"
    echo "$canonical_changed"
    echo
    echo "Add docs/decisions/$(date +%Y-%m-%d)-<slug>.md justifying the change in the SAME commit."
    echo "See .planning/phases/05-generation-engine-validation-stage-f/05-CONTEXT.md D-48 + Pitfall #32."
    exit 1
fi
exit 0
