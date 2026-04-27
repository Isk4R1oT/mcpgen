---
phase: 02-generation-engine-architect-pass-0-1
plan: 05
subsystem: engine
tags: [pass-0, deterministic, filter, auth-detect, validation, drop-reason, github-hybrid-auth, stripe-test-helpers, pitfall-e, pitfall-g, d-17, d-18, d-21, d-22, d-23, d-24]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Frozen IR (`mcpgen_ir.types.Endpoint/DroppedEndpoint/DropReason/Reason/AuthRequirement/Scheme/RecommendedMode/SecuritySchemes/ToolPlan/Category`); pre-commit pipeline (gitleaks/ruff/ruff-format/mypy/conventional-commit); engine `pyproject.toml` with mypy --strict + ruff `ANN` group; conftest `_sandbox_env` fixture."
  - plan: 02-01
    provides: "`apps/generation-engine/src/mcpgen_engine/llm/{client,agent_factory,sampling}.py` (no Pass 0 deterministic module imports these — verified by grep gate `no LLM imports`); `tests/conftest.py` priming `OPENROUTER_API_KEY` placeholder."
  - plan: 02-02
    provides: "`stages/stage_a.py` shipping the canonical `_endpoint_id` shape `\"METHOD path\"` that this plan's filter and auth_detect re-use for vendor-extension keying and result-dict keys."
  - plan: 02-03
    provides: "5 hand-tuned `pass-0-output.json` fixtures (stripe/github/notion/linear/slack) — `auth_requirements` shape and `dropped_endpoints` shape are the contract this plan's deterministic stages must hit. The github fixture's hybrid-auth representation (Bearer + GitHub App OAuth) is what `test_github_hybrid_auth` reproduces."
  - plan: 02-04
    provides: "Wave-0 stubs `tests/test_pass_0_filter.py` + `tests/test_pass_0_auth_detect.py` (all `pytest.skip` until this plan turns them green)."
provides:
  - "`apps/generation-engine/src/mcpgen_engine/passes/__init__.py` package marker."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py` package marker (orchestrator entry point lands in Plan 02-06)."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/filter.py` exporting `deterministic_filter(endpoints, options, extensions_by_endpoint=None) -> tuple[list[Endpoint], list[DroppedEndpoint]]`, `drop_reason_for(ep, options, extensions) -> DropReason | None`, and the local `UserOptions` Pydantic model used by Pass 0 stages."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/auth_detect.py` exporting `detect_auth_per_endpoint(endpoints, schemes, default, operation_security_by_endpoint=None, extensions_by_endpoint=None) -> dict[str, list[AuthRequirement]]` per D-21 (List, never single)."
  - "`apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py` exporting `Pass0Error` (with `.suggestions: list[str]`), `Pass0LlmOutput`, `CapsEnforcementResult`, `validate_naming(plans) -> None`, `enforce_caps(llm_output, target_complexity, max_tools_override) -> CapsEnforcementResult`, and `cluster_by_path_prefix(endpoints, min_cluster_size=30) -> list[str]`."
  - "59 pytest cases (46 in `test_pass_0_filter.py` + 13 in `test_pass_0_auth_detect.py`) covering T-2-B1, T-2-B2, T-2-B3, and the T-2-B5 caps subset."
affects:
  - "Plan 02-06 (Pass 0 LLM stage + chunked + e2e): consumes `deterministic_filter`, `detect_auth_per_endpoint`, and `enforce_caps`/`validate_naming`/`cluster_by_path_prefix` in the orchestrator's `run(raw_ir, options) -> Pass0Output`. Will plumb `extensions_by_endpoint` and `operation_security_by_endpoint` from raw spec capture (the FROZEN IR lacks these fields, so Plan 02-06 wires them alongside)."
  - "Plan 02-07 (Pass 1): reads `Pass0Output.tool_plans` post-validation; relies on D-17 naming regex being already enforced by Stage 0c so it never has to retry on naming failures."
  - "Plan 02-08 (pipeline + cache): the deterministic functions here are L1-cache-eligible inputs (their output is a function of inputs only)."

# Tech tracking
tech-stack:
  added: []  # Pure-function modules; no new dependencies — `fnmatch`, `re`, `collections.Counter`, `typing` are stdlib.
  patterns:
    - "**Frozen-IR workaround for missing per-endpoint fields:** the IR `Endpoint` model has no `extensions` or `security` fields. This plan plumbs them through optional sidecar parameters (`extensions_by_endpoint: Mapping[str, Mapping[str, object]]`, `operation_security_by_endpoint: Mapping[str, list[dict[str, list[str]]] | None]`) keyed by the same `\"METHOD path\"` shape Stage A's `_endpoint_id` emits. Plan 02-06 will populate these from the raw spec dict in the orchestrator."
    - "**Local Pydantic model for transient shapes:** `UserOptions`, `Pass0LlmOutput`, `CapsEnforcementResult` live in `passes/pass_0/` rather than `mcpgen_ir.types` because the IR plan-04 fixtures established only the *final* `Pass0Output` shape. Plan 02-06 will promote whichever of these surface to public API."
    - "**Stable error code in first whitespace-token:** `Pass0Error` messages start with `INVALID_NAMING:` / `DUPLICATE_NAMING:` / `MULTI_SERVER_SPLIT_REQUIRED:` / `INVALID_TARGET_COMPLEXITY:` / `INVALID_OVERRIDE:`. Downstream UX (CLI / API) parses by splitting on `:`. `.suggestions: list[str]` carries actionable detail (corrected name, cluster prefixes)."
    - "**Vendor-extension truthy strict-mode:** `_is_truthy` accepts `bool True` and `str \"true\"`/`\"True\"` only. Prevents accidental string-literal vendor flags from being interpreted as booleans (defensive against malformed specs)."
    - "**Drop-rule priority is order-encoded in `drop_reason_for`:** USER_EXCLUDED → explicit_includes → DEPRECATED → METHOD_NOT_SUPPORTED → INTERNAL → HEALTH_CHECK → WEBHOOK → AUTH_FLOW. `explicit_includes` overrides every BELOW-priority rule (D-24)."
    - "**Cap-trim heuristic** (no LLM): rank by (multi-endpoint plan ≥2 src? +1, rationale length, source_count). Multi-endpoint universal plans always survive cap-trim before single-endpoint specialized plans — matches the Phase-2 acceptance that universal CRUD coverage is a hard requirement."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/__init__.py — empty package marker (1 line)."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py — package docstring referencing 3 internal stages and Plan 02-06 orchestrator landing (11 lines)."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/filter.py — 261 lines: `deterministic_filter`, `drop_reason_for`, `UserOptions`. 8 drop reasons + User Override Flow + vendor-extension hooks for x-internal/x-webhook."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/auth_detect.py — 327 lines: `detect_auth_per_endpoint`, D-22 mapping table, GitHub Apps `x-github.enabledForGitHubApps` extension (Pitfall E), bearer-with-oauth special case (Slack-style)."
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py — 327 lines: `Pass0Error`, `validate_naming`, `enforce_caps`, `cluster_by_path_prefix`, `Pass0LlmOutput`, `CapsEnforcementResult`. D-17 regex + D-18 tier caps + D-19 Pro override + Pitfall G hard-fail."
  modified:
    - "apps/generation-engine/tests/test_pass_0_filter.py — Wave-0 stub (45 lines) replaced + extended to 428 lines: 32 filter tests (Stage 0a) + 14 validation tests (Stage 0c). All 46 cases green."
    - "apps/generation-engine/tests/test_pass_0_auth_detect.py — Wave-0 stub (28 lines) replaced + extended to 296 lines: 13 cases including GitHub hybrid auth (T-2-B3), all D-22 single-scheme mappings, operation-level overrides, no-auth fallback, D-21 List shape sanity check."

key-decisions:
  - "**Vendor extensions as sidecar Mapping**, not on `Endpoint`. The frozen IR `Endpoint` model has `extra=\"forbid\"` and no `extensions` field, so adding one would require coordinated codegen + IR re-freeze — out of scope. Sidecar dict keyed by `\"METHOD path\"` matches Stage A's `_endpoint_id` exactly. Plan 02-06 orchestrator will populate by walking the raw spec dict before validation."
  - "**Operation-level `security` override as sidecar Mapping**, not on `Endpoint` (same rationale)."
  - "**`UserOptions` defined locally in `filter.py`**, not in `mcpgen_ir.types` (the plan suggested IR codegen but that was speculative). Local definition keeps the contract honest until Plan 02-06 freezes the public API shape."
  - "**Drop-priority order:** USER_EXCLUDED runs BEFORE explicit_includes (the user cannot accidentally bypass an exclude). All other rules run AFTER explicit_includes (the user can re-include anything they want). Documented in module docstring + `drop_reason_for` comments."
  - "**`_endpoint_id` returns `\"METHOD path\"` (uppercase method)** — matches Stage A's helper exactly. Filter and auth_detect both define a private `_endpoint_id` rather than importing from Stage A to avoid a circular dependency between the deterministic stages and the parser."
  - "**Conservative cap-trim heuristic** prefers multi-endpoint plans + longer rationales. No LLM; deterministic across runs (with stable input order). The actual ranking criteria are the simplest possible that satisfy the Phase-2 acceptance contract; Plan 02-08 may revisit if F2 smell scan signals over-trimming of valuable specialized plans."
  - "**Fall-through `none` AuthRequirement** for endpoints with no auth signal anywhere. Per D-21 the value list must be non-empty; emitting an explicit `Scheme.none` entry beats raising or returning empty list. CLI/UX render this as 'public endpoint' (notes field already says so)."

patterns-established:
  - "**`grep -E 'from mcpgen_engine\\.llm' src/mcpgen_engine/passes/pass_0/{filter,auth_detect,validation}.py` returns NO matches.** This is the deterministic-stage gate; future plans modifying these modules MUST keep the gate satisfied. The `test_no_duplicate_model_construction.py` AST gate (Plan 02-01) covers `OpenAIModel` / `OpenAIProvider`; this plan's modules satisfy it because they import zero LLM symbols."
  - "**Sidecar Mapping pattern for IR-missing fields** is reusable: when frozen IR types are too narrow to express a runtime concern (here: vendor extensions, operation security), pass an additional `Mapping[endpoint_id, T]` parameter rather than mutating the IR. Keeps the frozen IR honest as a contract while letting deterministic stages access richer information."
  - "**Test fixtures mirror engine module fixtures.** `_make_endpoint(*, method=..., path=..., deprecated=...)` factory is duplicated (almost-verbatim) in `test_pass_0_filter.py` and `test_pass_0_auth_detect.py`. If a third Pass 0 test file lands in Plan 02-06, the fixture should be promoted to `conftest.py` (deferred — current duplication keeps each test file self-contained)."

requirements-completed: []
requirements-touched: [GEN-02]

# Threats addressed by this plan (per `<threat_model>` in 02-05-PLAN.md)
threats-addressed:
  - id: T-2-13
    category: InfoDisclosure
    disposition: mitigated
    mechanism: "structlog emits structural counts only — `kept_count`, `dropped_count_by_reason`, `endpoint_count`, `hybrid_count`, `scheme_count`, `effective_cap`. No `description`/`summary`/`tool_name`/`rationale` ever interpolated into log messages. D-52 enforced verbatim."
  - id: T-2-14
    category: Tampering
    disposition: accepted (per plan's threat register)
    mechanism: "All vendor-extension flags (`x-internal`, `x-webhook`, `x-github.enabledForGitHubApps`) are evaluated as booleans via `_is_truthy`; never as natural-language input. Filter is purely deterministic — no LLM call exposed to spec-borne payloads."

# Metrics
duration: ~50min
completed: 2026-04-27T17:06:58Z
tasks: 3 atomic commits
files-created: 5
files-modified: 2
lines-added: ~1620
test-cases-green: 59
---

# Phase 02 Plan 05: Pass 0 Deterministic Stages (Filter + Auth Detect + Validation)

**Ships the 3 pure-function deterministic modules around the Pass 0 LLM call (Stage 0b lands in Plan 02-06): `filter.py` (Stage 0a), `auth_detect.py` (D-21/D-22 hybrid auth), and `validation.py` (Stage 0c — D-17 naming regex + D-18 tier caps + Pitfall G multi-server-split). Turns Wave-0 stubs `test_pass_0_filter.py` and `test_pass_0_auth_detect.py` green with 59 cases total. Closes the GEN-02 deterministic surface; Plan 02-06 wraps these with the Qwen LLM call to deliver the full Pass 0 orchestrator.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-04-27T17:06:58Z
- **Tasks:** 3 (atomic commits, Conventional Commits scope `engine`)
- **Files created:** 5 (`passes/__init__.py`, `passes/pass_0/__init__.py`, `passes/pass_0/{filter,auth_detect,validation}.py`)
- **Files modified:** 2 (`tests/test_pass_0_filter.py` Wave-0 stub → 46 green tests; `tests/test_pass_0_auth_detect.py` Wave-0 stub → 13 green tests)
- **Test cases green:** 59 (T-2-B1 + T-2-B2 + T-2-B3 + T-2-B5 caps subset)
- **Lines added:** ~1620 net (~927 module + ~726 tests, minus Wave-0 stub deletions)

## Accomplishments

### Stage 0a — `filter.py` (Task 1, commit `cbc2ff2`)

- 8 deterministic drop rules per D-23 (DEPRECATED, INTERNAL, HEALTH_CHECK, WEBHOOK, AUTH_FLOW, METHOD_NOT_SUPPORTED, USER_EXCLUDED). REDUNDANT and LOW_VALUE come from Stage 0b LLM (Plan 02-06); EXCEEDS_CAP from Stage 0c.
- **Pitfall G mitigation verified empirically:** `/v1/test_helpers/`, `/v1/sandbox/`, `/internal/`, `/admin/` paths drop as INTERNAL. Test `test_drops_test_helpers` covers Stripe's 42-op test_helpers cluster directly. Path matching is case-insensitive.
- **D-24 User Override Flow:** `explicit_excludes` glob → USER_EXCLUDED (highest priority); `explicit_includes` glob → bypass below-rules and keep. fnmatch-based glob matching via stdlib.
- **Vendor flags via sidecar Mapping**: `extensions_by_endpoint` parameter accepts a `Mapping[str, Mapping[str, object]]` keyed by `\"METHOD path\"` matching Stage A's `_endpoint_id` shape; `x-internal=true` and `x-webhook=true` add to INTERNAL/WEBHOOK drops.
- **structlog event:** `pass_0.filter.complete` carries `kept_count`, `dropped_count`, `dropped_count_by_reason` (counter dict) — zero spec text in log fields per D-52.
- **`UserOptions` Pydantic model** (local to engine, not IR): `target_complexity`, `max_tools_override`, `explicit_includes`, `explicit_excludes` with `extra=\"forbid\"`.

### Per-endpoint Auth — `auth_detect.py` (Task 2, commit `5bd57fb`)

- **D-21 per-endpoint List**: returns `Dict[str, List[AuthRequirement]]` keyed by `\"METHOD path\"`. Hybrid endpoints emit ≥2 entries; non-hybrid emit exactly 1; public endpoints emit a single explicit `Scheme.none` entry (so the value is never empty).
- **D-22 deterministic mapping** verified end-to-end via tests:
  - `apiKey` (header/query) → passthrough
  - `http` `basic` → passthrough
  - `http` `bearer` → passthrough (UNLESS spec also declares oauth2 — then oauth_flow)
  - `oauth2` → oauth_flow
  - `aws_signature` / `awsSig4` / `signature` → stored
  - any other / unknown → none with passthrough
- **Pitfall E (GitHub Apps)**: `extensions_by_endpoint[endpoint_id][\"x-github\"][\"enabledForGitHubApps\"] == True` APPENDS a 2nd `AuthRequirement(scheme=oauth2, recommended_mode=oauth_flow, notes=\"GitHub App installation token (...)\")`. Verified via `test_github_hybrid_auth` reproducing 2 entries; `test_github_hybrid_with_no_global_default` covers the empty-securitySchemes-but-has-vendor-flag case.
- **Operation-level security override** plumbed via `operation_security_by_endpoint: Mapping[str, list[...] | None]`. Empty list = explicit no-auth (OpenAPI semantics); non-empty = override global default.
- **structlog event:** `pass_0.auth_detect.complete` carries `endpoint_count`, `hybrid_count`, `scheme_count`, `global_default_present` — no spec text.

### Stage 0c — `validation.py` (Task 3, commit `fb5168c`)

- **`validate_naming`** enforces D-17 regex `^[a-z][a-z0-9_]{0,63}$` + uniqueness across plans. Stable error codes `INVALID_NAMING:` and `DUPLICATE_NAMING:` with `.suggestions[0]` carrying the lowercased+snake-cased correction.
- **`enforce_caps`** implements D-18 tier caps (minimal=15 / standard=50 / comprehensive=80) + D-19 Pro `max_tools_override` (capped at 100). Three branches:
  - `len(plans) <= effective_cap` → unchanged
  - `effective_cap < len(plans) <= 80` → trim by priority heuristic; surface dropped plans as `DroppedEndpoint(reason=EXCEEDS_CAP, can_user_override=True)`
  - `len(plans) > 80` → `Pass0Error(\"MULTI_SERVER_SPLIT_REQUIRED\", suggestions=cluster_by_path_prefix(...))`
- **`cluster_by_path_prefix`** clusters endpoints by first 2 path segments (`/v1/treasury/abc` → `/v1/treasury`); returns alphabetically-sorted clusters meeting the threshold (default 30). Test `test_cluster_by_path_prefix_returns_sorted_list` covers Stripe-realistic data shapes.
- **`Pass0Error`** with `.suggestions: list[str]` attribute. The first whitespace-delimited token of the message is the stable user-facing error code.
- **`Pass0LlmOutput` + `CapsEnforcementResult`** Pydantic models bridge between LLM output (Plan 02-06) and the FROZEN `Pass0Output`. Engine-internal until Plan 02-06.
- **Cap-trim priority heuristic** (no LLM): `(multi_endpoint_bonus, rationale_length, source_count)` tuple. Multi-endpoint plans (≥2 source endpoints — e.g., universal CRUD subsuming several Pass-0 endpoints) always survive trim before single-endpoint specialized plans. Verified via `test_enforce_caps_priority_keeps_multi_endpoint_plans`.

## Files Created/Modified

See `key-files` frontmatter above.

## Decisions Made

See `key-decisions` frontmatter above. Salient highlights:

1. **Sidecar `Mapping` pattern for IR-missing fields** (extensions, operation security) avoids re-freezing the IR. Plan 02-06 wires from the raw spec dict.
2. **`UserOptions` local to engine** — Plan 02-06 promotes the public-API surface to IR after the LLM contract finalizes.
3. **Drop-priority order** explicitly documented: USER_EXCLUDED first (cannot bypass), explicit_includes second (overrides below), then the 6 deterministic rules.
4. **Cap-trim heuristic** uses a deterministic 3-tuple priority key: multi-endpoint bonus + rationale length + source-count. No LLM in the loop; reproducible across runs.
5. **Fall-through `Scheme.none` entry** for endpoints with no auth signal — preserves D-21 invariant that the per-endpoint list is always non-empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Plumb vendor extensions and operation-level security via sidecar `Mapping` parameters.**

- **Found during:** Task 1 (filter.py write); reaffirmed Task 2 (auth_detect.py).
- **Issue:** The plan body assumes `ep.extensions.get(\"x-internal\")` and `ep.security` access patterns, but the FROZEN IR `Endpoint` model (Plan 02-03) has neither field — it carries only `parameters`, `request_body`, `responses`, `tags`, `deprecated`. Adding the fields would require IR re-freeze + cross-stack codegen, which is out of scope for Plan 02-05.
- **Fix:** Both `filter.deterministic_filter` and `auth_detect.detect_auth_per_endpoint` accept `Mapping[str, Mapping[str, object]]` sidecar parameters keyed by `\"METHOD path\"` matching Stage A's `_endpoint_id`. Plan 02-06's orchestrator populates these from the raw spec dict (already preserved in `prance.specification`) before invoking these stages.
- **Files modified:** `passes/pass_0/filter.py` (parameter `extensions_by_endpoint`); `passes/pass_0/auth_detect.py` (parameters `operation_security_by_endpoint`, `extensions_by_endpoint`).
- **Documented in:** module docstrings + the patterns-established frontmatter section above. Plan 02-06's plan body should anticipate this requirement.

**2. [Rule 2 — Missing critical functionality] Define `UserOptions` and `Pass0LlmOutput` locally rather than importing from `mcpgen_ir.types`.**

- **Found during:** Task 1 (filter.py needs `UserOptions`); Task 3 (validation.py needs `Pass0LlmOutput`).
- **Issue:** The plan body says \"`UserOptions` is a Pydantic model expected to be importable from `mcpgen_ir.types`\" — but the IR codegen run in Plan 02-03 did not produce `UserOptions` (the IR's `Pass0Output` already has the relevant fields, but no `UserOptions` was authored). Same for `Pass0LlmOutput` — it's a transient bridge shape, not the public IR `Pass0Output`.
- **Fix:** Defined `UserOptions` in `filter.py` (canonical home for option-driven filtering) and `Pass0LlmOutput` + `CapsEnforcementResult` in `validation.py`. Both Pydantic v2 with `extra=\"forbid\"`. Plan 02-06 will decide whether to promote any of these to public IR after Stage 0b LLM contract finalizes.
- **Files modified:** `passes/pass_0/filter.py` (`UserOptions`); `passes/pass_0/validation.py` (`Pass0LlmOutput`, `CapsEnforcementResult`).
- **Documented in:** module docstrings explicitly note \"defined locally — Plan 02-06 promotes to IR if needed\".

**3. [Rule 1 — Bug guard] Pre-commit ruff `v0.7.4` enforces `ANN101` (`self` annotation) — local newer ruff treats it as deprecated.**

- **Found during:** Task 3 commit attempt.
- **Issue:** `Pass0Error.__init__` originally used implicit `self`; pre-commit ruff (v0.7.4 from `.pre-commit-config.yaml`) flagged ANN101 even though local `uv run ruff` (newer) silently accepts it.
- **Fix:** Added explicit `self: Pass0Error` annotation in `Pass0Error.__init__`. mypy --strict accepts the redundant annotation; ruff v0.7.4 is satisfied.
- **Files modified:** `passes/pass_0/validation.py` line ~78.
- **Verification:** `git commit` succeeded with all pre-commit hooks (gitleaks, ruff, ruff-format, mypy, conventional-commit) green. Commit hash `fb5168c`.

**Total deviations:** 3 (all Rule 2/1 — completeness/guard; no architectural changes).
**Impact on plan:** Strictly additive — public function signatures grew with optional sidecar parameters (default `None` → backward-compatible with the plan's intended call sites). `UserOptions` location moved engine-local but remains importable for tests and Plan 02-06.

## Issues Encountered

- **None blocking.** All 3 tasks committed atomically with green pre-commit hooks.
- **Pre-commit ruff version pin** (v0.7.4) caught one ANN101 warning that newer local ruff didn't flag — handled inline (Deviation #3).
- **Pre-commit ruff-format auto-modified** Task 2's `auth_detect.py` and the test file once after initial staging (line-collapse on long parameter type annotation). Re-staged + re-committed; no code semantics changed.

## VALIDATION.md Status

Per `02-VALIDATION.md` Per-Task Verification Map:

| Row | Behavior | Status before | Status after |
|-----|----------|---------------|--------------|
| T-2-B1 | Drops `/v1/test_helpers/*` as INTERNAL (Pitfall G) | ⬜ pending | ✅ green |
| T-2-B2 | Drops deprecated/healthchecks/webhooks per `DropReason` enum (D-23) | ⬜ pending | ✅ green |
| T-2-B3 | Per-endpoint List with GitHub hybrid auth (Pitfall E + #6) | ⬜ pending | ✅ green |
| T-2-B5 (subset) | Caps validation: `MULTI_SERVER_SPLIT_REQUIRED` + concrete suggestions | ⬜ pending | ✅ green (subset; full row also requires the LLM e2e from Plan 02-06) |

T-2-B4 (naming regex via mocked LLM e2e) and T-2-B5 (full e2e via mocked LLM) remain ⬜ pending — they land in Plan 02-06 when the LLM stage is wired. The deterministic naming-regex enforcement and cap hard-fail logic that those e2e tests will validate are both in place and individually unit-tested in this plan.

## User Setup Required

None — no external service configuration; pure Python stdlib + frozen IR.

## Next Phase Readiness

**Plan 02-06 (Pass 0 LLM stage + chunked + e2e)** can immediately:

1. Import `passes.pass_0.filter.deterministic_filter` and `passes.pass_0.auth_detect.detect_auth_per_endpoint` — both pure functions ready for the orchestrator.
2. Import `passes.pass_0.validation.{enforce_caps, validate_naming, cluster_by_path_prefix, Pass0Error, Pass0LlmOutput, CapsEnforcementResult}` for post-LLM validation.
3. Plumb vendor extensions + operation-level security from the raw spec dict into `extensions_by_endpoint` / `operation_security_by_endpoint` sidecar maps — the orchestrator's responsibility.
4. Use `Pass0LlmOutput` as the LLM agent's structured-output type; feed it through `enforce_caps` then `validate_naming`.
5. Compose the `Pass0Output` final shape: `tool_plans=validated.tool_plans, dropped_endpoints=[*stage_0a_dropped, *validated.cap_dropped], composite_candidates=llm_output.composite_candidates, auth_requirements=auth_dict, target_complexity=options.target_complexity, prompt_injection_warnings=[]`.

No blockers; Plan 02-06 is unblocked.

## Self-Check: PASSED

- [x] `apps/generation-engine/src/mcpgen_engine/passes/__init__.py` — FOUND
- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_0/__init__.py` — FOUND
- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_0/filter.py` — FOUND
- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_0/auth_detect.py` — FOUND
- [x] `apps/generation-engine/src/mcpgen_engine/passes/pass_0/validation.py` — FOUND
- [x] `apps/generation-engine/tests/test_pass_0_filter.py` — FOUND (46 cases, all green)
- [x] `apps/generation-engine/tests/test_pass_0_auth_detect.py` — FOUND (13 cases, all green)
- [x] Commit `cbc2ff2` (Task 1: filter) — FOUND in `git log`
- [x] Commit `5bd57fb` (Task 2: auth_detect) — FOUND in `git log`
- [x] Commit `fb5168c` (Task 3: validation) — FOUND in `git log`
- [x] `grep -F "def drop_reason_for" passes/pass_0/filter.py` — FOUND
- [x] `grep -F "def deterministic_filter" passes/pass_0/filter.py` — FOUND
- [x] `grep -F "DropReason.INTERNAL" passes/pass_0/filter.py` — FOUND
- [x] `grep -F "/v1/test_helpers" passes/pass_0/filter.py` — FOUND (Pitfall G)
- [x] `grep -F "def detect_auth_per_endpoint" passes/pass_0/auth_detect.py` — FOUND
- [x] `grep -F "x-github" passes/pass_0/auth_detect.py` — FOUND (Pitfall E)
- [x] `grep -F "enabledForGitHubApps" passes/pass_0/auth_detect.py` — FOUND
- [x] `grep -F "class Pass0Error" passes/pass_0/validation.py` — FOUND
- [x] `grep -F "def enforce_caps" passes/pass_0/validation.py` — FOUND
- [x] `grep -F "def validate_naming" passes/pass_0/validation.py` — FOUND
- [x] `grep -F "def cluster_by_path_prefix" passes/pass_0/validation.py` — FOUND
- [x] `grep -F "MULTI_SERVER_SPLIT_REQUIRED" passes/pass_0/validation.py` — FOUND
- [x] `grep -F '^[a-z][a-z0-9_]{0,63}$' passes/pass_0/validation.py` — FOUND (D-17 regex verbatim)
- [x] `grep -E "from mcpgen_engine\\.llm" src/mcpgen_engine/passes/` returns NO matches (deterministic OK)
- [x] `cd apps/generation-engine && uv run pytest tests/test_pass_0_filter.py tests/test_pass_0_auth_detect.py` exits 0 with **59 passed**
- [x] `cd apps/generation-engine && uv run mypy src/mcpgen_engine/passes/ tests/test_pass_0_filter.py tests/test_pass_0_auth_detect.py` exits 0 — Success: no issues found in 7 source files
- [x] `cd apps/generation-engine && uv run ruff check src/mcpgen_engine/passes/ tests/test_pass_0_filter.py tests/test_pass_0_auth_detect.py` exits 0 — All checks passed
- [x] All 3 commits passed pre-commit hooks (gitleaks + ruff + ruff-format + mypy + conventional-commit) — no `--no-verify` used

---
*Phase: 02-generation-engine-architect-pass-0-1*
*Completed: 2026-04-27*
