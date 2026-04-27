---
phase: 02-generation-engine-architect-pass-0-1
plan: 03
subsystem: engine
tags: [ir, fixtures, zod, pydantic, pass-0, pass-1, six-tool-pattern, smart-id, coverage-proof, contracts]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: IR Zod source-of-truth + Pydantic codegen pipeline + 5 hand-tuned fixture directories with ir.json/final-tools.json/quality-report.json/SOURCE.md
  - phase: 02-generation-engine-architect-pass-0-1
    provides: Plan 02-01 agent factory + provider routing pinning; Plan 02-02 Stage A deterministic OpenAPI 3.x parser
provides:
  - Pass0Output / Pass1Output extended with CoverageProof + SampleInvocation + per-endpoint auth_requirements + prompt_injection_warnings (additive IR evolution)
  - 10 hand-authored fixture JSON files (5 pass-0-output + 5 pass-1-output) covering Stripe / GitHub / Notion / Linear / Slack — fixtures-as-contract for downstream Pass 0/1 implementation
  - Fixture loader (src/index.ts) + shape test (tests/shape.test.ts) extended with 36 new invariant assertions
  - Paired decision doc (docs/decisions/2026-04-27-pass-0-1-ir-additive-types.md)
affects: [Plan 02-04 Pass 0 deterministic filter, Plan 02-05 Pass 0 LLM stage, Plan 02-06 Pass 1 schema synthesis, Plan 02-07 Pass 1 coverage validation, Plan 02-08 CLI mcpgen init, Plan 02-09 E2E acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive IR evolution via paired decision doc (Phase 1 D-13 protocol)"
    - "Per-endpoint auth_requirements as Dict[str, List[AuthRequirement]] supports Pitfall E hybrid auth (GitHub Bearer + GitHub App OAuth on same endpoint)"
    - "Smart-ID schema-level format `<spec-slug>:{type}:{collection}:{identifier}` — no tenant prefix at Phase 2; Phase 6 dispatch prepends `{tenant_short_id}-` at deploy time (D-31)"
    - "CoverageProof shape `{endpoint_id, mapped_to_universal_tool, sample_invocation: {url, method, params}}` — Pitfall #3 round-trip URL invariant"
    - "Fixtures-as-contract: ship hand-tuned Pass 0/1 outputs BEFORE LLM implementation (per Open Question 3 / D-55) so Plans 04-09 have a frozen truth target"

key-files:
  created:
    - packages/engine-fixtures/stripe/pass-0-output.json (9 tool plans, 15 endpoints, 1 composite candidate)
    - packages/engine-fixtures/stripe/pass-1-output.json (9 final tools = 6 universal + 3 actions, 100% coverage)
    - packages/engine-fixtures/github/pass-0-output.json (10 tool plans, 14 endpoints, hybrid auth on 13 endpoints)
    - packages/engine-fixtures/github/pass-1-output.json (10 tools = 6 universal + 3 actions + 1 workflow create_pr_from_branch)
    - packages/engine-fixtures/notion/pass-0-output.json (6 tool plans — pure data API, target_complexity=minimal)
    - packages/engine-fixtures/notion/pass-1-output.json (6 universal-only; delete maps to PATCH archive)
    - packages/engine-fixtures/linear/pass-0-output.json (9 tool plans across GraphQL operations)
    - packages/engine-fixtures/linear/pass-1-output.json (9 tools = 6 universal + 3 actions; GraphQL routing)
    - packages/engine-fixtures/slack/pass-0-output.json (10 tool plans, 1 composite candidate)
    - packages/engine-fixtures/slack/pass-1-output.json (10 tools = 6 universal + 3 actions + 1 workflow send_with_thread_followup)
    - docs/decisions/2026-04-27-pass-0-1-ir-additive-types.md
  modified:
    - packages/ir/src/types.ts (added SampleInvocation + CoverageProof; evolved Pass0Output.auth_requirements + Pass0Output.prompt_injection_warnings + Pass1Output.coverage_proof)
    - packages/ir/python/types.py (regenerated via codegen)
    - packages/ir/tests/types.test.ts (round-trip new shapes)
    - packages/engine-fixtures/src/index.ts (extended EngineFixture with pass0Output + pass1Output)
    - packages/engine-fixtures/tests/shape.test.ts (added 7 invariants × 5 fixtures + 1 GitHub Pitfall E check = 36 new assertions)
    - packages/engine-fixtures/{stripe,github,notion,linear,slack}/SOURCE.md (added pass_0_section + pass_1_section provenance markers; refreshed last_updated to 2026-04-27)

key-decisions:
  - "auth_requirements shape evolved from List<AuthRequirement> to Dict[endpoint_id, List<AuthRequirement>] — required by Phase 2 D-21 + GitHub Pitfall E hybrid auth; safe because Pass 0/1 implementation has not yet shipped (zero existing consumers)"
  - "prompt_injection_warnings field added to Pass0Output (Phase 2 D-51) for heuristic surface; default empty array"
  - "Pass1Output.coverage_proof: List<CoverageProof> added (Phase 2 D-33) — every Pass 0 endpoint must round-trip via new URL()"
  - "Smart-ID format at Phase 2 ships SCHEMA-LEVEL only ('stripe-api:{type}:...'); Phase 6 dispatch worker prepends tenant-short-id prefix at deploy time per D-31"
  - "Notion fixture uses target_complexity='minimal' (6 universal tools only) — canonical pure-data API per D-29; demonstrates Six-Tool Pattern in its purest form"
  - "Slack workflow uses partial_failure_strategy='report' — posted parent message cannot be atomically rolled back, so report-and-let-agent-recover beats fail-loud"
  - "Linear fixture preserves GraphQL operation syntax 'POST /graphql ({op})' as endpoint_id — Stage A normalizes GraphQL to REST-like endpoints; routing rules retain operation discriminator"

patterns-established:
  - "Pattern: every Pass 0 plan emits ToolPlan{name, category, source_endpoints, rationale} with rationale ≥ 10 chars (drives F2 smell scan input downstream)"
  - "Pattern: every Pass 1 universal tool routes via RoutingConfig.rules with params_mapping (e.g., {limit: per_page, cursor: page} for GitHub, {limit: first, cursor: after} for Linear GraphQL)"
  - "Pattern: dropped_endpoints uses can_user_override=true for LOW_VALUE/USER_EXCLUDED, false for hard-gated WEBHOOK/INTERNAL/AUTH_FLOW"
  - "Pattern: workflow tools (create_pr_from_branch, send_with_thread_followup) have explicit WorkflowDef.steps with description per step + partial_failure_strategy"

requirements-completed:
  - GEN-02
  - GEN-03

# Metrics
duration: 9min
completed: 2026-04-27
---

# Phase 2 Plan 03: IR additive types + 10 hand-authored Pass 0/1 fixtures Summary

**Pass0Output + Pass1Output extended with CoverageProof / SampleInvocation / per-endpoint auth_requirements / prompt_injection_warnings; 10 hand-authored fixture JSON files (Stripe / GitHub / Notion / Linear / Slack) ship as the frozen truth target for Plans 04-09.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-27T17:39:00Z
- **Completed:** 2026-04-27T17:51:30Z
- **Tasks:** 3
- **Files modified:** 18 (5 created Phase-2 fixture JSONs × 2 = 10; 1 decision doc; 5 SOURCE.md updates; types.ts; types.py; types.test.ts; index.ts; shape.test.ts)

## Accomplishments
- IR Zod source-of-truth extended with SampleInvocation + CoverageProof types; Pass0Output.auth_requirements evolved to per-endpoint Dict to support GitHub Pitfall E hybrid auth; Pass0Output.prompt_injection_warnings + Pass1Output.coverage_proof fields added.
- Pydantic mirror regenerated via `pnpm --filter @mcpgen/ir codegen` (1:1 alignment with Zod source verified by codegen:check).
- 10 hand-authored fixture JSON files committed (5 fixtures × 2 outputs each), all validating against Pass0Output.model_validate() and Pass1Output.model_validate(); GitHub fixture surfaces 13/14 endpoints with ≥ 2 hybrid-auth entries.
- Fixture loader + shape test extended with 36 new invariant assertions covering: Zod parse, coverage_pct=100, 6-universal-always, tool count [6,15], smart-ID schema-level format, sample-invocation URL round-trip, naming-regex compliance, GitHub hybrid-auth.
- Test count rose 30 → 66 in @mcpgen/engine-fixtures (+36 assertions); @mcpgen/ir test count 32 → 34 (+2 round-trip).

## Task Commits

Each task was committed atomically (Conventional Commits 1.0.0):

1. **Task 1a: Extend IR Zod types** — `87eb4b7` (feat: SampleInvocation + CoverageProof + auth_requirements dict shape + prompt_injection_warnings + coverage_proof; regenerated python/types.py; updated ir tests)
2. **Task 1b: Decision doc** — `2bf1b65` (docs: paired decision recording why auth_requirements shape evolution is contract-correct)
3. **Task 2a: Stripe fixtures** — `02b58fb` (feat: 9 tools, 15 endpoints, smart-ID stripe-api:..., 1 composite candidate)
4. **Task 2b: GitHub fixtures** — `6add5e5` (feat: 10 tools, 14 endpoints, hybrid auth on 13/14 endpoints, 1 workflow create_pr_from_branch)
5. **Task 2c: Notion fixtures** — `e979f98` (feat: 6 universal-only, target_complexity=minimal, delete→PATCH archive)
6. **Task 2d: Linear fixtures** — `6bf6097` (feat: 9 tools, GraphQL routing, 'POST /graphql ({op})' endpoint IDs)
7. **Task 2e: Slack fixtures** — `26bf059` (feat: 10 tools, 1 workflow send_with_thread_followup with 'report' partial-failure)
8. **Task 3: Loader + shape test** — `04aeca9` (test: +36 assertions, 66 total)

## Files Created/Modified

See `key-files` frontmatter above.

## Decisions Made

See `key-decisions` frontmatter above. Most consequential decisions:

1. **auth_requirements shape evolution** (List → Dict[endpoint_id, List]). The Phase 1 IR ship had `Pass0Output.auth_requirements: List<AuthRequirement>` (flat). Phase 2 D-21 + GitHub Pitfall E require per-endpoint dict. Justified because zero existing consumers (verified via `rg`) and Pass 0/1 implementation has not yet shipped. Recorded in paired decision doc per Phase 1 D-13 protocol.
2. **Smart-ID format ships schema-level only at Phase 2.** Tenant prefix prepended at deploy time by Phase 6 dispatch worker. Shape: `'stripe-api:{type}:{collection}:{identifier}'`. Test invariant guards against accidental `{tenant_short_id}-` leakage at Phase 2 (D-31).
3. **Linear GraphQL operations preserved as endpoint_id.** Format `POST /graphql (issueCreate)` retains the operation discriminator without inventing a synthetic REST path. Stage A normalizes during parsing (Phase 2 Plan 02-02 already shipped); routing rules use the same notation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed pnpm workspace dependencies**
- **Found during:** Task 1 Step 3 (`pnpm --filter @mcpgen/ir codegen`)
- **Issue:** Fresh state — `node_modules` missing (clean repo); `tsx` command not on PATH; codegen failed with `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`.
- **Fix:** Ran `pnpm install` from repo root.
- **Files modified:** None (lockfile already present, install only created `node_modules/`).
- **Verification:** `pnpm --filter @mcpgen/ir codegen` succeeded; emitted `packages/ir/python/types.py` (21805 bytes) with new classes.
- **Committed in:** N/A (workspace install, not source change).

**2. [Rule 1 - Bug] IR test fixtures broke after schema evolution**
- **Found during:** Task 1 Step 3 (`pnpm --filter @mcpgen/ir test`)
- **Issue:** `packages/ir/tests/types.test.ts` Pass0Output round-trip test used flat `auth_requirements: [...]` (pre-evolution shape) and Pass1Output round-trip used no `coverage_proof`. Both raised `invalid_type` after the schema change.
- **Fix:** Updated both round-trip samples to use the new shapes (Dict-keyed auth_requirements; non-empty coverage_proof; prompt_injection_warnings: []).
- **Files modified:** packages/ir/tests/types.test.ts
- **Verification:** `pnpm --filter @mcpgen/ir test` → 34 passed | 2 skipped.
- **Committed in:** 87eb4b7 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes were strictly required to land the planned schema evolution. No scope creep. Both stayed within Plan 02-03's stated files-modified set.

## Issues Encountered

- The plan body's <behavior> for Task 1 listed schemas that partially overlapped with Phase-1-shipped IR types (e.g., `DroppedEndpoint = z.object({endpoint_id, reason, notes})` versus the existing `{method, path, reason, can_user_override}`). Resolution: kept existing Phase-1 shapes for `ToolPlan` / `DroppedEndpoint` / `CompositeCandidate` (these are already adequate), and added only the genuinely-new `SampleInvocation` / `CoverageProof` types plus the planned new fields on `Pass0Output` / `Pass1Output`. This is consistent with the plan's "ADD what's missing" instruction in the <action> block.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 02-04 (Pass 0 deterministic filter)** can now read `pass-0-output.json` for each fixture and assert that its filter output matches the expected `dropped_endpoints` set.
- **Plan 02-05 (Pass 0 LLM stage)** can validate against Pass0Output.model_validate() with full hybrid-auth + prompt-injection-warnings surface.
- **Plan 02-06 (Pass 1 schema synthesis)** consumes the same fixtures as the truth target for tool count, naming, and routing rules.
- **Plan 02-07 (Pass 1 coverage validation)** can replay each `coverage_proof` entry through `urllib.parse.urlparse` to assert the URL round-trips.
- **Plan 02-09 (E2E acceptance)** structural-equivalence assertion has a frozen target.

No blockers. CI gates green: typecheck (IR + engine-fixtures), tests (34 + 66 passing), pre-commit hooks (gitleaks + ruff + ESLint + IR codegen freshness check) clean across all 8 commits.

## VALIDATION.md Wave 0 status

All 10 hand-tuned fixture entries flip from `[ ]` to `[x]`:
- [x] stripe/pass-0-output.json (9 tool plans)
- [x] stripe/pass-1-output.json (9 final tools, 100% coverage)
- [x] github/pass-0-output.json (10 tool plans, hybrid auth)
- [x] github/pass-1-output.json (10 final tools, 1 workflow)
- [x] notion/pass-0-output.json (6 tool plans, minimal complexity)
- [x] notion/pass-1-output.json (6 universal-only)
- [x] linear/pass-0-output.json (9 tool plans, GraphQL)
- [x] linear/pass-1-output.json (9 final tools)
- [x] slack/pass-0-output.json (10 tool plans, 1 composite candidate)
- [x] slack/pass-1-output.json (10 final tools, 1 workflow)

## Self-Check: PASSED

- [x] `packages/ir/src/types.ts` exports `Pass0Output`, `Pass1Output`, `DropReason`, `CoverageProof`, `SampleInvocation`, `ToolPlan`, `DroppedEndpoint`, `CompositeCandidate` — all confirmed via `grep -F` in committed file.
- [x] `packages/ir/python/types.py` regenerated — `class Pass0Output`, `class Pass1Output`, `class CoverageProof`, `class SampleInvocation`, `class DropReason(Enum)` all present.
- [x] All 10 fixture JSON files exist on disk and validate against `Pass0Output.model_validate()` / `Pass1Output.model_validate()` (verified by inline Python script).
- [x] All 5 SOURCE.md files contain `pass_0_section:` AND `pass_1_section:` AND `last_updated: 2026-04-27`.
- [x] `pnpm --filter @mcpgen/ir typecheck` passes; `pnpm --filter @mcpgen/ir test` 34 passed.
- [x] `pnpm --filter @mcpgen/engine-fixtures typecheck` passes; `pnpm --filter @mcpgen/engine-fixtures test` 66 passed.
- [x] All 8 commits land; pre-commit hooks pass on each (gitleaks + ruff + eslint + IR codegen freshness + Conventional Commits).
- [x] Commit hashes verified via `git log --oneline`: 87eb4b7, 2bf1b65, 02b58fb, 6add5e5, e979f98, 6bf6097, 26bf059, 04aeca9.

---
*Phase: 02-generation-engine-architect-pass-0-1*
*Completed: 2026-04-27*
