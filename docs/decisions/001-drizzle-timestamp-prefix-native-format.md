# 001 — Accept Drizzle Native Timestamp Prefix Format

**Date:** 2026-04-26
**Status:** Accepted (Phase 1)
**Decision drivers:** D-12, RESEARCH §Pattern 5, Open Question 1

## Context

D-12 specifies migration filename format `YYYYMMDD_HHMMSS_<descriptive_name>.sql`
(with an underscore between date and time). Drizzle Kit's native `prefix: 'timestamp'`
produces `YYYYMMDDHHMMSS_<name>.sql` (no underscore between date and time). One-character
cosmetic divergence.

## Decision

**Accept Drizzle's native format `YYYYMMDDHHMMSS_<name>.sql`.** First migration is
`20260427000000_init_schema.sql`.

## Rationale

- Pitfall #18's driver is "lexicographic sort, not numeric collision" — both formats
  satisfy this.
- Writing a custom post-`drizzle-kit generate` rename script adds tooling surface and
  ROI is low.
- Both formats sort identically at the second granularity required.

## Consequences

- CONTEXT.md D-12 wording is semantically equivalent to what we ship. No code change
  to D-12; this decision-log is the bridge.
- `drizzle-kit check` in CI catches duplicates either way.
