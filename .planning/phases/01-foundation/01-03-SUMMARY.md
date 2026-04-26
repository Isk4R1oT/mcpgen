---
phase: 01-foundation
plan: 03
subsystem: contracts
tags: [zod, pydantic, codegen, ir, contracts, runtime-sdk, foundation, frozen-contracts]

# Dependency graph
requires:
  - "01-01 (monorepo skeleton — pnpm workspace, Turborepo, @mcpgen/shared-config)"
  - "01-02 (pre-commit hooks + CI + 4 local guards + decision-log scaffolding)"
provides:
  - "@mcpgen/ir: Zod 4 source-of-truth for the Universal IR + committed Pydantic 2 mirror via datamodel-code-generator (D-01/D-02)"
  - "@mcpgen/contracts: Generation API + SSE envelope + Usage Event + Launch Criteria + Idempotency-key shape (D-09/D-10/D-11/D-13)"
  - "@mcpgen/runtime: tenant Worker SDK interface stub (11 methods) + 3 auth modes (Phase 1 = signatures only; Phase 6 implements bodies)"
  - "Three-layer immutability defense for launch-criteria thresholds — pre-commit hook + CI assertion + `as const` runtime constants (T-1-03)"
  - "Cross-package regex alignment — `tool_name` regex shared across @mcpgen/ir FinalTool.name and @mcpgen/contracts UsageEvent.tool_name with a runtime introspection test"
  - "Paired decision document `docs/decisions/2026-04-26-launch-criteria-thresholds.md` documenting F2=4.0, F3=0.7, bundle 800/950 KB rationale"
affects:
  - "01-04 (DB schema): consumes @mcpgen/contracts STRIPE_METERS_KEY_REGEX + UsageEvent shape for Drizzle schema columns"
  - "01-05 (apps scaffolds): apps/api imports GenerationApiRequest/Response + GenerationSseEvent; apps/dispatch imports validateCfWorkerName; apps/dispatch-sample imports Runtime + AuthMode"
  - "01-06 (engine FastAPI): apps/generation-engine imports `mcpgen_ir` Pydantic types from packages/ir/python/types.py; smoke test relies on RawIR / Pass0Output / FinalTool round-tripping"
  - "Phase 4 (Stage E codegen): Jinja2 templates emit imports of Runtime + createStubRuntime + AuthMode from @mcpgen/runtime; tools emit FinalTool-shaped JSON"
  - "Phase 5 (Stage F validation): F1/F2/F3 reports validate against QualityReport Zod schema; quality_badge enum bounds the 4 levels"
  - "Phase 6 (Runtime Plane): RUN-01..05 implement the 11 Runtime interface methods + emitUsageEvent against UsageEvent + UsageEventQueuePayload"
  - "Phase 9 (Observability): Sentry error spans tagged with deployment_id/tool_name from UsageEvent shape"

tech-stack:
  added:
    - "zod@^4.3.6 — Zod 4 native `z.toJSONSchema(target: 'draft-2020-12')` is the codegen primitive"
    - "@modelcontextprotocol/sdk@^1.29.0 (D-04 pin to 1.x; current latest verified via npm view)"
    - "datamodel-code-generator==0.26.4 (Python tool, invoked via `uvx --from`)"
  patterns:
    - "TS Zod source -> JSON Schema (combined $defs document) -> Pydantic 2 mirror via datamodel-code-generator. Output committed to git, NOT regenerated on install."
    - "Idempotency-key prefix-discriminated shape (`gen_${ULID}` / `deploy_${UUID}` / composite Stripe Meters key) makes cross-surface collisions impossible"
    - "Cross-package regex alignment via single-source-of-truth constant + runtime introspection test (Zod 4 `_zod.def.checks` field)"
    - "Three-layer immutability defense for security/correctness invariants: pre-commit hook + CI assertion + `as const` runtime constant"
    - "Paired decision document discipline — any change to a guard-protected file must include a dated `docs/decisions/<YYYY-MM-DD>-<slug>.md` in the same commit"
    - "Discriminated union with literal `mode` field for auth strategies (passthrough / stored / oauth) — TS narrows to OAuthAuth.upstream when mode === 'oauth'"
    - "createStub<X>() factories for Phase-1 interface stubs that throw documented `'implementation lands in Phase N'` errors — gives IDE autocomplete + compile-time integration without misleading partial behavior"
    - "Test-time `RUN_CODEGEN_TESTS=1` env-var gate for tests requiring out-of-band tooling (datamodel-code-generator) — local devs who don't have the tool can still run `pnpm test`"

key-files:
  created:
    # @mcpgen/ir
    - "packages/ir/package.json (32 lines) — @mcpgen/ir@0.0.0, type=module, sub-path exports for `.` and `./types`, codegen + codegen:check scripts"
    - "packages/ir/tsconfig.json — extends @mcpgen/shared-config/tsconfig"
    - "packages/ir/vitest.config.ts (15 lines) — extends shared base, bumps testTimeout to 60s for codegen tests"
    - "packages/ir/src/types.ts (~290 lines) — 38 top-level Zod schemas: ToolAnnotations (openWorldHint=literal(true)), ToolDescription, ResponseConfig, SmartIdSchema, RoutingRule, WorkflowDef, FinalTool, RawIR (with RawEndpoint + SecurityScheme), Pass0..5Output, ToolPlan, AuthRequirement, CompositeCandidate, DroppedEndpoint, CompleteServerSpec, F1StaticReport, F2SmellReport, F2ToolSmellScore, RubricComponentScore, F3GoldenTaskResult, F3AgentEvalReport, QualityReport + QualityBadge enum. Exports TOOL_NAME_REGEX as the cross-file source of truth."
    - "packages/ir/src/index.ts (3 lines) — re-export from ./types"
    - "packages/ir/scripts/codegen.ts (~180 lines) — 4-step pipeline (Zod -> single combined $defs JSON Schema -> uvx datamodel-codegen -> python/types.py). Tries uvx, then python3 -m, then datamodel-codegen on PATH. --check mode regenerates to a tmp dir and byte-diffs vs committed mirror. --disable-timestamp ensures deterministic output."
    - "packages/ir/python/__init__.py (empty)"
    - "packages/ir/python/types.py (~21 KB, 950+ lines) — GENERATED Pydantic 2 mirror. Contains class FinalTool(BaseModel), class ToolDescription(BaseModel), class ToolAnnotations(BaseModel), class ResponseConfig(BaseModel), class RawIR(BaseModel), class Pass0Output..Pass5Output, class QualityReport, etc. NEVER hand-edited."
    - "packages/ir/pyproject.toml (16 lines) — exposes packages/ir/python/ as `mcpgen-ir` Python package for the engine, requires-python>=3.12, depends on pydantic>=2,<3"
    - "packages/ir/tests/types.test.ts (~280 lines) — 34 round-trip tests covering all top-level schemas. Negative cases enforce architectural invariants (openWorldHint=true, tool name regex, purpose >= 20 chars, parameter_overview 50-400 chars, workflow steps 2-5)"
    - "packages/ir/tests/codegen.test.ts (~50 lines) — 2 codegen tests gated by RUN_CODEGEN_TESTS=1: (1) script generates python/types.py with required classes; (2) --check exits 0 when fresh"
    - "packages/ir/README.md (~70 lines) — documents the 4-step pipeline + the edit-src-then-codegen workflow + the three-layer freshness defense"
    # @mcpgen/contracts
    - "packages/contracts/package.json (28 lines) — depends on @mcpgen/ir + zod^4.3.6"
    - "packages/contracts/tsconfig.json + vitest.config.ts"
    - "packages/contracts/src/index.ts (5 lines) — re-export all 4 contract files"
    - "packages/contracts/src/idempotency.ts (~85 lines) — ULID_REGEX (Crockford base32, no I/L/O/U), GEN_ID_REGEX, DEPLOY_ID_REGEX, STRIPE_METERS_KEY_REGEX (composite shape), TOOL_NAME_REGEX (single source of truth). 4 validators (validateIdempotencyKey, validateStripeMetersKey, validateCfWorkerName, validateUlid). 4 Zod schemas (UlidSchema, GenIdSchema, DeployIdSchema, StripeMetersKeySchema). Header constants IDEMPOTENCY_KEY_HEADER + LAST_EVENT_ID_HEADER."
    - "packages/contracts/src/generation-api.ts (~110 lines) — GenerationStage (10 stages: A/B/C/D/E/F1/F2/F3/completed/failed), GenerationSseError, GenerationSseEvent (job_id matches gen_${ULID}, monotonic ULID event_id, optional partial_result + error). EngineCallbackEnvelope tags engine -> BFF callback POSTs. GenerationApiRequest with .refine for spec_url xor spec_content. GenerationApiResponse (job_id + sse_url). GenerationOptions (target_complexity / explicit_includes / max_tools_override). GenerationErrorCode (7 values). IdempotencyKeyHeaderValue. Top-level comment block documents D-09/D-10 SSE resume semantics + pending_callbacks fallback."
    - "packages/contracts/src/usage-event.ts (~70 lines) — UsageEventStatus enum, UsageEventClientType enum, UsageEvent (mirrors usage_events Timescale columns; tool_name regex IMPORTED from ./idempotency.ts to enforce single source of truth), UsageEventQueuePayload (CF Queue -> Inngest leg), StripeMetersDimension enum (5 values per architecture §10.2)"
    - "packages/contracts/src/launch-criteria.ts (~35 lines) — LAUNCH_CRITERIA `as const` with F2_SMELL_MIN=4.0, F3_AGENT_PASS_RATE_MIN=0.7, BUNDLE_SIZE.{PASS_KB:800, WARN_KB:950, FAIL_KB_EXCLUSIVE:950}, COVERAGE_PCT_MIN=100. Top-of-file comment block documents the three-layer defense + paired-decision requirement."
    - "packages/contracts/tests/idempotency.test.ts (~120 lines) — 20 tests covering all 4 validators with positive + negative cases, including cross-prefix guards (gen_ rejects deploy_ keys and vice versa)"
    - "packages/contracts/tests/generation-api.test.ts (~225 lines) — 25 tests covering GenerationStage enum, GenerationSseEvent (positive, partial_result, error sub-object, retry_after_seconds non-negative), EngineCallbackEnvelope, GenerationApiRequest (.refine spec_url xor spec_content, max_tools_override bounds), GenerationApiResponse, IdempotencyKeyHeaderValue, GenerationErrorCode, header constants"
    - "packages/contracts/tests/usage-event.test.ts (~150 lines) — 14 tests covering UsageEvent shape + UsageEventQueuePayload + enum exports + cross-package regex alignment (asserts @mcpgen/contracts TOOL_NAME_REGEX === @mcpgen/ir TOOL_NAME_REGEX both as constant AND via FinalTool Zod schema introspection on `_zod.def.checks`)"
    - "packages/contracts/tests/launch-criteria.test.ts (~95 lines) — 12 tests covering all 6 constants + cross-doc consistency assertion against docs/mcpgen-stage-f-design.md (canonical Stage F threshold spec) and CLAUDE.md (operating reference)"
    # @mcpgen/runtime
    - "packages/runtime-sdk/package.json (24 lines) — @mcpgen/runtime, depends on @mcpgen/ir + @mcpgen/contracts + @modelcontextprotocol/sdk@^1.29.0 (D-04)"
    - "packages/runtime-sdk/tsconfig.json + vitest.config.ts"
    - "packages/runtime-sdk/src/types.ts (~110 lines) — SmartId (object|collection|schema discriminator), per-route option types (RouteSearch/Fetch/ListCollections/ListObjects/Upsert/Delete with readonly arrays), FieldFilteringConfig, ErrorTeachingContext, OAuthUpstreamConfig (PKCE mandatory), 3 AuthMode discriminated union variants (PassthroughAuth, StoredAuth, OAuthAuth)"
    - "packages/runtime-sdk/src/index.ts (~125 lines) — Runtime interface (11 methods: 2 smart-ID utilities + 6 universal-tool routes + 3 response shapers), RuntimeContext (upstreamCredential + deploymentId + emitUsageEvent), createStubRuntime() factory throws Phase-1 error on every method. Public re-exports of all option/auth types from ./types.js"
    - "packages/runtime-sdk/tests/interface.test.ts (~225 lines) — 19 tests: Test 1 compile-time type identity (uses every imported type in a sample object); Test 2 stub method behaviour (11 method assertions + error message points to RUN-01..05 in Phase 6); Test 3 SmartId discriminator restricts to {object|collection|schema} (with @ts-expect-error for unknowns); Test 4 AuthMode discriminated union narrows on .mode (switch covers all 3 modes)"
    # Decision document
    - "docs/decisions/2026-04-26-launch-criteria-thresholds.md (~85 lines) — paired-decision document required by .pre-commit-hooks/launch-criteria-paired-decision.sh. Documents rationale for F2=4.0, F3=0.7, bundle 800/950 KB with citations to docs/mcpgen-stage-f-design.md and three-layer defense overview."
  modified:
    - "pnpm-lock.yaml — added zod@4.3.6, @modelcontextprotocol/sdk@1.29.0, package internal links"

key-decisions:
  - "Combined JSON Schema document with $defs (one file `ir.json`) instead of one file per Zod export. Reason: datamodel-code-generator's modular-references path produces an output DIRECTORY, not a single types.py file. Combining preserves the single-file mirror that the engine + Stage E codegen + tests all expect."
  - "Used `--disable-timestamp` flag for datamodel-code-generator. Without it, every regeneration injects a fresh `# timestamp: <ISO>` line in the file header, making the byte-diff in --check mode always non-zero. Determinism is required for the freshness check to be useful."
  - "Cross-package tool_name regex single-source-of-truth pattern: TOOL_NAME_REGEX exported from @mcpgen/contracts/idempotency.ts; @mcpgen/ir/types.ts also exports the same TOOL_NAME_REGEX value-equal constant; usage-event.ts imports from idempotency.ts; tests/usage-event.test.ts asserts both constants are .source-equal AND introspects FinalTool.name via Zod 4's `_zod.def.checks` field to verify the LIVE regex compiled into the schema matches. Defends against silent drift between IR tool definitions and billing rows."
  - "Stripe Meters key regex uses composite shape `${UUID}_${minute_bucket_iso}_${tool_name}` instead of `gen_${ULID}` because Stripe Meters dedup window is 24h on a per-key basis and we want the tool_name + minute to scope dedup naturally (different tools, different minutes => different keys, different bills)."
  - "DEPLOY_ID_REGEX accepts any RFC 4122 UUID v1-v8 (relaxed variant byte) because Cloudflare doesn't constrain the variant. Strict v4 would reject legitimate dispatch worker names."
  - "Cross-doc consistency test points at docs/mcpgen-stage-f-design.md + CLAUDE.md instead of docs/mcpgen-implementation-plan.md §11.7 because the implementation plan §10 documents must-have launch criteria (qualitative gates) while the literal numeric thresholds 4.0 and 0.7 live in the Stage F design spec. The CI launch-criteria-assertion job (Plan 02) greps the launch-criteria.ts file directly with -qF, so docs path doesn't matter for that defense — only for this test's redundant assurance layer."
  - "createStubRuntime() throws documented `'Phase 1 stub; lands in Phase 6 (RUN-01..05)'` errors instead of returning sentinel values. Reason: silent stubs lead to misleading partial behaviour (e.g. apps/dispatch-sample passes its tests because the stub returned `undefined`); explicit throws force any caller to handle it correctly OR be replaced before Phase 6."
  - "Compile-time test for Type 1 (interface compiles) constructs a values-shaped object using every imported type at least once instead of `type _R = Runtime` aliases. Strict tsconfig (`noUnusedLocals`) flags unused type aliases as errors. The values-object pattern works under strict mode + actually provides runtime assertions on `typeof` to satisfy the test framework."

patterns-established:
  - "Frozen-contracts package convention: every cross-app type lives in either packages/ir/src/ (cross-language: TS + Python) or packages/contracts/src/ (TS-only API surfaces); no cross-app types in app code"
  - "Zod 4 native z.toJSONSchema (no third-party converter); Zod 4 record signature = z.record(keySchema, valueSchema) (NOT z.record(valueSchema)); regex introspection via x._zod.def.checks[].pattern"
  - "Codegen output committed to git (NOT regenerated on install); freshness enforced by 3-layer check (pre-commit + CI + script-internal --check mode)"
  - "createStubRuntime() factory pattern for Phase-1 interface stubs (throws explicit Phase-N implementation pointer)"
  - "Test files use module-level VALID_X fixtures (typed `as const`) to keep individual test cases focused on the assertion, not on shape construction"
  - "Compile-time type assertions use values-shaped sample objects (`const sample: { x: SomeType } = {...}`) rather than `type _x = SomeType` aliases (the latter trip strict tsconfig's noUnusedLocals)"
  - "Cross-package regex alignment: define the regex once in one package's leaf module + re-import everywhere else + add a runtime introspection test"
  - "Paired-decision discipline: any change to a guard-protected file (currently launch-criteria.ts; pattern extends to future invariants) must commit a dated docs/decisions/<YYYY-MM-DD>-<slug>.md in the same commit"

requirements-completed:
  - FND-02
  - FND-03
  - FND-04
  - FND-05
  - FND-06
  - FND-14
  - CTRL-01

# Metrics
duration: ~26min
completed: 2026-04-26
---

# Phase 1 Plan 03: Cross-Language Contract Freeze Summary

**4 frozen contracts (IR + Generation API + Usage Event + Launch Criteria + Idempotency) + Tenant Worker SDK interface stub. TS Zod is the single source of truth; the Python Pydantic mirror is generated and committed; cross-package regex alignment and three-layer launch-criteria immutability are enforced by tests + pre-commit + CI.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-04-26T17:38Z (approximate — agent spawn time)
- **Completed:** 2026-04-26T18:04Z
- **Tasks:** 3 / 3
- **Files created:** 32 (12 in packages/ir + 13 in packages/contracts + 6 in packages/runtime-sdk + 1 decision doc)
- **Files modified:** 1 (pnpm-lock.yaml)
- **Tests added:** 124 (34 IR types + 71 contracts + 19 runtime-sdk; +2 codegen tests gated by RUN_CODEGEN_TESTS=1)

## Accomplishments

- Frozen 4 of the 5 cross-language contracts: the Universal IR (Zod 4 source + auto-generated Pydantic 2 mirror committed to git), the Generation API + SSE event envelope (with D-09 resume semantics + Last-Event-ID header convention), the Usage Event shape (mirrors TimescaleDB columns + Stripe Meters dedup key shape), and the Launch Criteria runtime constants (F2 ≥ 4.0, F3 ≥ 0.7, bundle 800 KB pass / 950 KB warn / >950 KB fail, coverage 100%).
- Frozen the 5th contract: the Tenant Worker SDK interface stub — 11 methods (2 smart-ID utilities + 6 universal-tool routes + 3 response shapers) + 3 auth modes (passthrough/stored/oauth) + RuntimeContext. Phase 1 ships signatures only; Phase 6 (RUN-01..05) implements the bodies.
- Activated the IR codegen freshness check end-to-end: the Plan 02 pre-commit hook `ir-codegen-check` and CI workflow `contract-codegen-check.yml` both fire correctly now; the codegen script supports `--check` mode (regenerates to a temp dir and byte-diffs vs the committed mirror); `--disable-timestamp` ensures deterministic output.
- Activated the launch-criteria three-layer immutability defense: the pre-commit hook `launch-criteria-paired-decision.sh` correctly required and validated the paired `docs/decisions/2026-04-26-launch-criteria-thresholds.md` file at commit time; the CI assertion in `main-ci.yml` will now find the literal `F2_SMELL_MIN: 4.0` etc. in `launch-criteria.ts` and pass.
- Cross-package regex alignment: the `tool_name` regex is defined once in `@mcpgen/contracts/src/idempotency.ts` and re-imported by `@mcpgen/contracts/src/usage-event.ts`. The same constant is also exported from `@mcpgen/ir/src/types.ts` and used in `FinalTool.name`. A runtime test asserts both constants are `.source`-equal AND introspects the live regex on the IR Zod schema (via Zod 4's `_zod.def.checks[].pattern`) to verify it matches.

## Task Commits

Each task was committed atomically per Conventional Commits + git-workflow-rules. All commits passed the 9-hook pre-commit chain (gitleaks, ruff/mypy skipped no-files, eslint workspace lint, conventional-pre-commit, cf-namespace-guard, launch-criteria-guard, ir-codegen-check, ui-locked-guard) and the conventional-commit-msg validator.

1. **Task 1: @mcpgen/ir Zod source + Pydantic codegen pipeline + tests** — `94fc238` (feat)
2. **Task 2: @mcpgen/contracts (4 contract files + 4 test files) + paired launch-criteria decision** — `2cebc18` (feat) — first commit in repo to activate the launch-criteria-paired-decision pre-commit hook (passed because the decision doc was staged in the same commit)
3. **Task 3: @mcpgen/runtime tenant Worker SDK interface stub + tests** — `f098d87` (feat)

**Plan metadata commit:** Created at the end of this plan with SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md updates.

## Test Counts

| Package           | Test files | Tests | Notes                                                                                          |
| ----------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------- |
| `@mcpgen/ir`      | 2          | 34 + 2 skipped (gated) | Codegen tests behind `RUN_CODEGEN_TESTS=1`; CI sets the env var                |
| `@mcpgen/contracts` | 4        | 71    | Includes cross-package regex alignment + cross-doc consistency tests                          |
| `@mcpgen/runtime` | 1          | 19    | Covers compile-time type identity + 11 stub method behaviours + 2 type-level discriminator tests |
| **Total**         | **7**      | **124** (+ 2 gated)  |                                                                                                |

`pnpm -r typecheck` and `pnpm -r build` exit 0 across all 4 packages (shared-config, ir, contracts, runtime-sdk).

## Frozen Constants

```
LAUNCH_CRITERIA.F2_SMELL_MIN          = 4.0
LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN = 0.7
LAUNCH_CRITERIA.BUNDLE_SIZE.PASS_KB   = 800
LAUNCH_CRITERIA.BUNDLE_SIZE.WARN_KB   = 950
LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE = 950
LAUNCH_CRITERIA.COVERAGE_PCT_MIN      = 100
```

These are exported `as const`. TypeScript infers literal types (`4.0`, `0.7`, etc.) — no widening to `number`. Any consumer attempting mutation fails to compile.

## Idempotency-Key Validators (4 surfaces)

| Surface                                       | Shape                                              | Validator                  | Regex source                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. BFF `Idempotency-Key` header               | `gen_${ULID}` (4 + 26 chars)                       | `validateIdempotencyKey()` | `^gen_[0-9A-HJKMNP-TV-Z]{26}$`                                                                                                                                   |
| 2. Inngest job dedup key                      | same as surface 1                                  | (same)                     | (same)                                                                                                                                                            |
| 3. Stripe Meters event dedup key              | `${UUID}_${YYYY-MM-DDTHH:MM}_${tool_name}`         | `validateStripeMetersKey()` | `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_[a-z][a-z0-9_]{0,63}$` |
| 4. CF dispatch tenant Worker name             | `deploy_${UUID}` (7 + 36 chars)                    | `validateCfWorkerName()`   | `^deploy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`                                                                                          |

All 4 validators tested with positive + cross-prefix-rejection + length-boundary cases.

## Runtime SDK Interface (11 methods + 3 auth modes)

```
Smart-ID utilities:    parseSmartId(id), makeSmartId(parts)
Six-Tool routes:       routeSearch, routeFetch, routeListCollections,
                       routeListObjects, routeUpsert, routeDelete
Response shapers:      shapeResponse(raw, ResponseConfig),
                       applyFieldFilter(raw, FieldFilteringConfig),
                       handleUpstreamError(err, ErrorTeachingContext)

Auth modes:            PassthroughAuth | StoredAuth | OAuthAuth
                       (discriminator on `mode` field;
                        OAuth requires PKCE: literal(true))
```

`createStubRuntime()` returns an object whose methods all throw `'Runtime.<method>() is an interface-only stub in Phase 1; implementation lands in Phase 6 (RUN-01..05).'`. Phase 4 codegen + Phase 5 dispatch-sample + tests can rely on the type surface today.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] datamodel-code-generator binary name vs package name mismatch**

- **Found during:** Task 1 first `pnpm codegen` run
- **Issue:** Plan 03 prescribed `uvx datamodel-code-generator` directly. The PyPI package is `datamodel-code-generator` but the executable it provides is `datamodel-codegen` (different name). `uvx datamodel-code-generator` errors with `An executable named 'datamodel-code-generator' is not provided by package 'datamodel-code-generator'`.
- **Fix:** Switched to `uvx --from datamodel-code-generator==0.26.4 datamodel-codegen ...`. Documented in the script's comment block.
- **Files modified:** `packages/ir/scripts/codegen.ts`.
- **Committed in:** `94fc238` (Task 1 commit; the fix landed in the same commit as the original file).

**2. [Rule 1 — Bug] datamodel-codegen non-deterministic output (timestamp header)**

- **Found during:** Task 1 first `pnpm codegen:check` run
- **Issue:** The first `--check` run reported drift even though the file was just generated. Diff showed identical sizes (20961 vs 20961) but different content — the offending difference was the `# timestamp: 2026-04-26T...` line in the file header.
- **Fix:** Added `--disable-timestamp` to the datamodel-code-generator argument list. The freshness check now byte-compares deterministically.
- **Files modified:** `packages/ir/scripts/codegen.ts`.
- **Committed in:** `94fc238` (Task 1 commit).

**3. [Rule 1 — Bug] Modular references mode requires output directory, not file**

- **Found during:** Task 1 second `pnpm codegen` run
- **Issue:** datamodel-code-generator errored with `Modular references require an output directory, not a file` because the input was a directory of separate JSON Schema files (one per top-level Zod export) but the output was a single `python/types.py` file.
- **Fix:** Restructured the codegen script to emit a SINGLE combined JSON Schema document (`build/jsonschema/ir.json`) with `$defs` containing all 38 top-level types. datamodel-codegen generates one class per `$defs` entry into a single types.py file.
- **Files modified:** `packages/ir/scripts/codegen.ts`.
- **Committed in:** `94fc238` (Task 1 commit).

**4. [Rule 1 — Bug] Invalid ULID test fixture (contained forbidden 'L' character)**

- **Found during:** Task 2 first `pnpm test` run
- **Issue:** Test fixture `01HXP3J8Y0K9V8R7N6M5L4K3J2` contained an `L` at position 21. The Crockford base32 alphabet excludes `I`, `L`, `O`, `U` (to avoid visual ambiguity with `1`, `1`, `0`, `V`). The ULID regex correctly rejected it, breaking 8 positive-path tests.
- **Fix:** Replaced `L` with `K` in two test files (`generation-api.test.ts` and `idempotency.test.ts`); added a comment noting "no I/L/O/U" next to each fixture for future readers.
- **Files modified:** `packages/contracts/tests/idempotency.test.ts`, `packages/contracts/tests/generation-api.test.ts`.
- **Committed in:** `2cebc18` (Task 2 commit; pre-fix iteration was within the same task work).

**5. [Rule 3 — Blocking] Cross-doc consistency test pointed at the wrong document**

- **Found during:** Task 2 second `pnpm test` run
- **Issue:** Plan 03 prescribed `docs/mcpgen-implementation-plan.md §11.7` as the canonical threshold doc, but that doc only has §10 ("Launch Criteria" — qualitative gates) and §11 ("What's Explicitly NOT in MVP"). The literal numeric thresholds (`≥4.0`, `≥0.7`) live in `docs/mcpgen-stage-f-design.md` and are quoted verbatim in `CLAUDE.md`. The test as originally written would always fail.
- **Fix:** Pointed the test at `docs/mcpgen-stage-f-design.md` (canonical Stage F spec) + `CLAUDE.md` (operating reference). The CI launch-criteria-assertion job from Plan 02 is unaffected (it greps `launch-criteria.ts` directly).
- **Files modified:** `packages/contracts/tests/launch-criteria.test.ts`.
- **Committed in:** `2cebc18` (Task 2 commit).

**6. [Rule 3 — Blocking] Strict tsconfig flagged unused imports + comment containing "@ts-expect-error"**

- **Found during:** Task 3 first `pnpm typecheck` run
- **Issue:** The shared `noUnusedLocals` setting flagged 5 type-only imports + 8 type aliases (`type _R = Runtime`, etc.) as unused. Additionally, a comment that included the literal string `@ts-expect-error directive...` was being parsed as a real `@ts-expect-error` directive on the next line, which was already a closing brace (no error to expect → "Unused @ts-expect-error directive").
- **Fix:** Restructured `index.ts` to import each option type only once at the top + re-export them in a single statement at the bottom. Restructured the compile-time test to construct a values-shaped sample object using every type at least once. Reworded the comment in `interface.test.ts` to avoid the substring `"@ts-expect-error directive"`.
- **Files modified:** `packages/runtime-sdk/src/index.ts`, `packages/runtime-sdk/tests/interface.test.ts`.
- **Committed in:** `f098d87` (Task 3 commit).

### Authentication Gates

None — `uvx`, npm, and pnpm all worked without credentials in this plan.

## Verification Confirmation

```
$ pnpm install --frozen-lockfile        # exits 0
$ pnpm -r typecheck                     # 4 packages all pass (shared-config, ir, contracts, runtime-sdk)
$ pnpm -r test                          # 124 passed across 7 test files
$ pnpm -r build                         # 4 packages all pass (typecheck-equivalent)
$ pnpm --filter @mcpgen/ir codegen      # produces packages/ir/python/types.py (~21 KB)
$ pnpm --filter @mcpgen/ir codegen:check # exits 0 (no drift)
$ test -f packages/ir/python/types.py   # exists
$ grep -q "class FinalTool(BaseModel)" packages/ir/python/types.py  # exits 0
$ grep -q "class ToolDescription(BaseModel)" packages/ir/python/types.py  # exits 0
$ grep -qF "F2_SMELL_MIN: 4.0" packages/contracts/src/launch-criteria.ts  # exits 0
$ grep -qF "F3_AGENT_PASS_RATE_MIN: 0.7" packages/contracts/src/launch-criteria.ts  # exits 0
$ grep -qF "PASS_KB: 800" packages/contracts/src/launch-criteria.ts  # exits 0
$ grep -qF "WARN_KB: 950" packages/contracts/src/launch-criteria.ts  # exits 0
```

## Pointer for Downstream Plans

- **Plan 01-04 (DB schema):** `infrastructure/neon/migrations/...` should reference the column shapes from `packages/contracts/src/usage-event.ts` (UsageEvent) so the Drizzle schema and the Zod schema share a single source of truth for types. The `pending_callbacks` table for the SSE resume fallback (D-09) consumes `event_id: gen_${ULID}` and `last_event_id: ULID_REGEX`. The launch-criteria CI assertion job is now active — any future change to launch-criteria.ts requires a paired decision doc.
- **Plan 01-05 (apps scaffolds):** `apps/api` (Hono BFF) MUST consume `GenerationApiRequest`, `GenerationApiResponse`, `GenerationSseEvent`, `EngineCallbackEnvelope`, `IDEMPOTENCY_KEY_HEADER`, `LAST_EVENT_ID_HEADER` from `@mcpgen/contracts` — DO NOT redeclare these types. `apps/dispatch` MUST consume `validateCfWorkerName` from `@mcpgen/contracts`. `apps/dispatch-sample` MUST `import { Runtime, AuthMode, createStubRuntime } from '@mcpgen/runtime'` as the canonical reference shape that Phase 4 codegen will emit.
- **Plan 01-06 (engine FastAPI):** `apps/generation-engine` adds `mcpgen-ir` to its Python deps via the local-path install or workspace-aware uv (TBD); imports `from mcpgen_ir.types import RawIR, FinalTool, Pass0Output, Pass1Output, ..., QualityReport, QualityBadge`. Smoke test (Day-1 Qwen) round-trips RawIR/FinalTool to verify the Python mirror is operational.
- **Phase 4 (Stage E codegen):** Jinja2 templates emit `import { Runtime, AuthMode, createStubRuntime } from '@mcpgen/runtime'` and consume `FinalTool.inputSchema/outputSchema/annotations/response_config/source_endpoints` 1:1.
- **Phase 6 (Runtime Plane):** RUN-01..05 implement the 11 Runtime interface methods. The `createStubRuntime()` factory disappears once `createProductionRuntime(env: WorkerEnv): Runtime` is added.
- **Cross-package regex alignment:** any future contract that includes a tool name MUST `import { TOOL_NAME_REGEX } from '@mcpgen/contracts/idempotency'` rather than redeclaring the regex literal.

## Self-Check: PASSED

**Files claimed created — all exist:**

- `packages/ir/package.json` ✓
- `packages/ir/tsconfig.json` ✓
- `packages/ir/vitest.config.ts` ✓
- `packages/ir/src/types.ts` ✓
- `packages/ir/src/index.ts` ✓
- `packages/ir/scripts/codegen.ts` ✓
- `packages/ir/python/__init__.py` ✓
- `packages/ir/python/types.py` ✓
- `packages/ir/pyproject.toml` ✓
- `packages/ir/tests/types.test.ts` ✓
- `packages/ir/tests/codegen.test.ts` ✓
- `packages/ir/README.md` ✓
- `packages/contracts/package.json` ✓
- `packages/contracts/tsconfig.json` ✓
- `packages/contracts/vitest.config.ts` ✓
- `packages/contracts/src/index.ts` ✓
- `packages/contracts/src/idempotency.ts` ✓
- `packages/contracts/src/generation-api.ts` ✓
- `packages/contracts/src/usage-event.ts` ✓
- `packages/contracts/src/launch-criteria.ts` ✓
- `packages/contracts/tests/idempotency.test.ts` ✓
- `packages/contracts/tests/generation-api.test.ts` ✓
- `packages/contracts/tests/usage-event.test.ts` ✓
- `packages/contracts/tests/launch-criteria.test.ts` ✓
- `packages/runtime-sdk/package.json` ✓
- `packages/runtime-sdk/tsconfig.json` ✓
- `packages/runtime-sdk/vitest.config.ts` ✓
- `packages/runtime-sdk/src/types.ts` ✓
- `packages/runtime-sdk/src/index.ts` ✓
- `packages/runtime-sdk/tests/interface.test.ts` ✓
- `docs/decisions/2026-04-26-launch-criteria-thresholds.md` ✓

**Commits claimed — all present in `git log`:**

- `94fc238` feat(01-03): add @mcpgen/ir package with Zod source + Pydantic codegen pipeline (D-01/D-02) ✓
- `2cebc18` feat(01-03): add @mcpgen/contracts package + paired launch-criteria decision (D-09/D-10/D-11/D-13) ✓
- `f098d87` feat(01-03): add @mcpgen/runtime SDK interface stub for tenant Workers (FND-06/D-04) ✓
