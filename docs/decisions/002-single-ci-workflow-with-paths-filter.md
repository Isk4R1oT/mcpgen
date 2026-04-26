# 002 — Single CI Workflow With dorny/paths-filter

**Date:** 2026-04-26
**Status:** Accepted (Phase 1)
**Decision drivers:** D-06 (per-workstream files mentioned), RESEARCH Open Question #6

## Context

D-06 prescribes per-workstream CI files (`engine-ci.yml`, `runtime-ci.yml`,
`frontend-ci.yml`, `ops-ci.yml`) plus a `main-ci.yml` aggregator. RESEARCH Open
Question #6 recommends a single `main-ci.yml` with `dorny/paths-filter@v3` and
conditional jobs.

## Decision

**Use a single `main-ci.yml` with `dorny/paths-filter` for affected-only execution;
keep thin per-workstream entry-point files for D-06 wording compliance.**

The per-workstream files (`engine-ci.yml` etc.) exist as documentation entry points
(a contributor exploring `.github/workflows/` finds them), but they only print a
marker step pointing to the real job in `main-ci.yml`. All actual lint / typecheck /
test work runs as conditional jobs in `main-ci.yml`.

## Rationale

- One PR check status to monitor (vs. 5 separate red/green badges).
- One workflow file to maintain (paths filters declared once).
- Same affected-only-execution behavior as D-06's wording.
- Easier `concurrency` group management (cancel-in-progress works across all jobs).

## Consequences

- The 4 per-workstream files do nothing beyond providing a clear discovery path to
  `main-ci.yml`.
- When adding a new workstream, the change is a single new conditional job in
  `main-ci.yml` + a new entry in the paths-filter outputs.
