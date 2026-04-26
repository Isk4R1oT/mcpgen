# 2026-04-26 — Launch criteria thresholds (F2 ≥ 4.0, F3 ≥ 0.7, bundle 800/950 KB)

## Status

Accepted.

## Context

`packages/contracts/src/launch-criteria.ts` introduces the immutable runtime
constants that gate generated-server publishability and Stage F validation:

| Constant                                | Value | Purpose                                         |
| --------------------------------------- | ----- | ----------------------------------------------- |
| `LAUNCH_CRITERIA.F2_SMELL_MIN`          | 4.0   | F2 smell scan minimum average score (0–5 scale) |
| `LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN`| 0.7   | F3 agent eval minimum pass rate (golden tasks)  |
| `LAUNCH_CRITERIA.BUNDLE_SIZE.PASS_KB`   | 800   | Tenant Worker bundle PASS threshold             |
| `LAUNCH_CRITERIA.BUNDLE_SIZE.WARN_KB`   | 950   | Tenant Worker bundle WARN threshold             |
| `LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE` | 950 | Tenant Worker bundle FAIL threshold (>950) |
| `LAUNCH_CRITERIA.COVERAGE_PCT_MIN`      | 100   | Pass 1 endpoint coverage minimum (% of Pass 0)  |

The pre-commit hook
[`launch-criteria-paired-decision.sh`](../../.pre-commit-hooks/launch-criteria-paired-decision.sh)
requires that any commit which modifies `launch-criteria.ts` ALSO commits a
paired `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry. This file is that paired
entry for the initial commit (T-1-03 / D-13 / Pitfall #29 — defense against
"AI-fix-by-lowering-threshold").

## Decision

Adopt the values above verbatim from the canonical Stage F design spec
(`docs/mcpgen-stage-f-design.md`) and operating reference (`CLAUDE.md`). They
are encoded as `as const` so TypeScript infers literal types — no widening to
`number`, no accidental mutation.

### Why F2 ≥ 4.0

- Per `docs/mcpgen-stage-f-design.md` §"F2 Smell scan", threshold 4.0 (out of 5)
  on the 6-component rubric (Purpose / Guidelines / Limitations / Parameter doc
  / Examples / Length & Completeness).
- Examples component is expected to score 1–2 in v0 (deferred to v1.1); average
  across the other 5 components must clear 4.0 to gate publishability.
- Stage F design notes: "production-grade quality bar (per MCP-Bench paper)";
  earlier proposals at ≥ 3.0 were judged too lenient and rejected.

### Why F3 ≥ 0.7

- Per `docs/mcpgen-stage-f-design.md` §"F3 Agent eval", server-level pass rate
  must be ≥ 0.7 (70%) across golden tasks for the API.
- "Calibrated to MCP-Bench observations" (Stage F design Appendix A item 9).
- Two-tier evaluator (rule-based + LLM judge); per-task pass requires
  `rules.all() AND judge.task_completion ≥ 7 AND grounding ≥ 6`.

### Why bundle PASS=800 / WARN=950 / FAIL_EXCLUSIVE=950 KB

- CF Workers free plan compressed bundle limit is 1 MB; paid plan 5 MB.
- Targeting 800 KB compressed gives ~200 KB margin for runtime SDK additions in
  Phase 6 + future codegen template growth.
- 950 KB is the WARN threshold (close to the free-plan limit); >950 KB is a
  hard FAIL (publishability blocked).

### Why coverage = 100%

- Pass 1 (Six-Tool Pattern consolidation) MUST not lose endpoints discovered by
  Pass 0. Drift here means agents lose access to documented functionality.
- Per `docs/mcpgen-pass-1-design.md`: "Coverage 100% mandatory" — failure paths
  (3 retries) result in degraded fallback (specialized_tools with warning), but
  the launch-criteria gate stays at 100%.

## Three-layer immutability defense (T-1-03)

1. **Pre-commit hook** `launch-criteria-paired-decision.sh` requires this very
   document (or a future-dated equivalent) on every change to
   `launch-criteria.ts`.
2. **CI assertion** (`launch-criteria-assertion` job in
   `.github/workflows/main-ci.yml`) uses `grep -qF` to check that each constant
   matches its documented value (`F2_SMELL_MIN: 4.0`, etc.).
3. **TypeScript `as const`** prevents widening of the literal types; any
   importer that tries to mutate the constant fails to compile.

## Consequences

- Lowering any threshold (e.g. F2 ≥ 3.5 to "make CI pass") requires:
  1. A new dated decision document in `docs/decisions/`
  2. The matching change in `packages/contracts/src/launch-criteria.ts`
  3. The matching change in CI grep target (`main-ci.yml`)
  All three in the same commit; the hook + CI gate enforce.
- This intentionally makes "fix-by-lowering-threshold" expensive — when the
  generated quality regresses, the right fix is to debug the offending Pass,
  not to slacken the gate.

## References

- `docs/mcpgen-stage-f-design.md` (Stage F validation spec — canonical source)
- `CLAUDE.md` §"Stage F (Validation — detail design)" (operating reference)
- `.planning/phases/01-foundation/01-CONTEXT.md` D-13
- `.planning/phases/01-foundation/01-PATTERNS.md` "launch-criteria.ts"
- `.pre-commit-hooks/launch-criteria-paired-decision.sh`
- `.github/workflows/main-ci.yml` `launch-criteria-assertion` job
