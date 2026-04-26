# 000 — Cross-Workstream Test Ownership Policy

**Date:** 2026-04-26
**Status:** Accepted (Phase 1)
**Decision drivers:** D-21, OPS-02, Pitfall #26

## Context

MCPGen runs 5 parallel workstreams (`main`, `engine`, `runtime`, `frontend`, `ops`)
per `docs/mcpgen-gsd-sprint-plan.md` §3. When a test fails in CI, ambiguity over
ownership causes either (a) two workstreams both attempting fixes (Pitfall #26:
dueling commits) or (b) neither owning the fix (test stays red).

## Decision

**Failing tests are owned by the workstream that owns the file the test exercises.**

Mapping rules:

- `tests/engine/*`, `apps/generation-engine/tests/*` → **engine** workstream
- `apps/api/tests/*`, `apps/dispatch/tests/*`, `apps/dispatch-sample/tests/*`,
  `packages/runtime-sdk/tests/*` → **runtime** workstream
- `apps/web/tests/*`, `apps/cli/tests/*` → **frontend** workstream
- `infrastructure/**`, `.github/workflows/**`, `apps/api/src/routes/**` → **ops** workstream
- `packages/contracts/tests/*`, `packages/ir/tests/*`, `packages/engine-fixtures/tests/*`
  → **main** workstream (cross-workstream contracts)

Cross-workstream test failures (e.g., a contract change breaks engine + runtime +
frontend simultaneously) escalate to **main** as a `chore(contracts): ...` PR. The
contracts workstream owns the fix; downstream workstreams rebase after merge.

## Operating Procedure

1. Daily sync ritual (per `docs/mcpgen-gsd-sprint-plan.md` §5.1) MUST run before
   any session starts work — surfaces conflicts before code is written.
2. Plan files for every workstream include a "MUST re-read these files first"
   header per OPS-03.
3. CI failure → assignee = workstream owner per the mapping above.

## Consequences

- Cross-workstream debugging is centralized in `main` rather than ping-ponging.
- Workstream isolation is real, not aspirational.
- The cost: an extra hop (escalation) for genuinely cross-cutting bugs, traded
  against avoiding wasted dueling work.
