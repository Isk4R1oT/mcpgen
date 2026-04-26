# `docs/decisions/` — MCPGen Decision Log

Lightweight ADR-style records for engineering decisions that diverge from a
canonical doc, lock an operational policy, or change a runtime constant gated
by `.pre-commit-hooks/launch-criteria-paired-decision.sh` (D-13).

## File-naming conventions

There are **two** parallel conventions, by purpose:

1. **Numbered (`<NNN>-<slug>.md`)** — for general engineering decisions, lexically
   ordered (`000-`, `001-`, `002-`, ...). Use this for anything that is _not_
   a change to `packages/contracts/src/launch-criteria.ts`.

2. **Date-prefixed (`<YYYY-MM-DD>-<slug>.md`)** — required by D-13 for any commit
   that touches `packages/contracts/src/launch-criteria.ts`. The pre-commit hook
   `.pre-commit-hooks/launch-criteria-paired-decision.sh` enforces this regex
   exactly: `^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$`. The two
   conventions can coexist in this directory.

## File template (mandatory sections)

```markdown
# <NNN | YYYY-MM-DD> — <Title>

**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded by <ref>
**Decision drivers:** <list of D-* / OPS-* / Pitfall #N references>

## Context

What problem are we solving? What constraints exist?

## Decision

What did we decide? (One paragraph; quotable.)

## Rationale (or Alternatives Considered)

Why? What did we evaluate and reject?

## Consequences

What changes downstream? Any new constraints, costs, or risks introduced?
```

## When to add a decision

- Diverging from a directive in `docs/` or `RULES.md` for a defensible engineering reason.
- Locking an operational policy (e.g., test ownership, code-review gating).
- Changing a runtime constant in `packages/contracts/src/launch-criteria.ts` (D-13 mandatory pair).
- Picking between two roughly-equivalent options where the choice is not obvious from the docs.

## When NOT to add a decision

- Implementing a feature exactly as planned in `.planning/phases/<N>/<plan>.md` — the plan _is_ the decision.
- Trivial style choices (variable naming, file layout) that fit existing conventions.
- One-off bug fixes.

## Index

- `000-test-ownership-policy.md` — D-21 / OPS-02: cross-workstream test ownership.
- `001-drizzle-timestamp-prefix-native-format.md` — Open Question #1: accept Drizzle native `YYYYMMDDHHMMSS_` prefix.
- `002-single-ci-workflow-with-paths-filter.md` — Open Question #6: single `main-ci.yml` + per-workstream entry-point markers.
