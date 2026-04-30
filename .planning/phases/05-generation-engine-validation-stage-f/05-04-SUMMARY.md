---
phase: 05-generation-engine-validation-stage-f
plan: 04
subsystem: stage-f-f1-static-validation
tags: [stage-f, f1-static, secret-scan, json-schema, ts-compile, subprocess, fail-closed]
requires:
  - 05-01 (IR types + sampling profiles + Anthropic SDK)
  - 05-02 (canonical fixtures + gitleaks pin + paired-decision hook)
  - 05-03 (F1 cheap deterministic checks orchestrator skeleton)
provides:
  - run_f1 (full F1 entry point: 8 cheap + 3 subprocess checks)
  - secret_scan.run_secret_scan (gitleaks subprocess wrapper)
  - json_schema.validate_tool_schemas (Draft 2020-12 dual-validation)
  - ts_compile.run_ts_compile + parse_tsc_output
  - D-07 fail-closed contract test (locks F2/F3-skip semantics for Plan 05-08)
affects:
  - 05-05 (F2 smell scan — consumes run_f1 output for retry orchestration)
  - 05-08 (pipeline glue — consumes run_f1 + the fail-closed contract test)
tech-stack:
  added: []
  patterns: [asyncio.wait_for + SIGKILL cleanup, subprocess JSON-stdout parsing,
             jsonschema.Draft202012Validator + FormatChecker, regex error parser,
             AsyncMock-based orchestrator wiring tests]
key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/secret_scan.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/json_schema.py
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/ts_compile.py
    - apps/generation-engine/tests/stages/stage_f/test_secret_scan.py
    - apps/generation-engine/tests/stages/stage_f/test_f1_json_schema.py
    - apps/generation-engine/tests/stages/stage_f/test_f1_ts_compile.py
    - apps/generation-engine/tests/stages/stage_f/test_pipeline_f1_fail.py
  modified:
    - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py
      (added run_f1 entry point chaining cheap + subprocess tail)
    - apps/generation-engine/tests/stages/stage_f/test_f1_static_orchestrator.py
      (extended with run_f1 wiring tests via AsyncMock)
decisions:
  - "Single error code precedence on dual-schema fail: INPUT > OUTPUT (Pass 3 upstream of Pass 5)."
  - "ts_compile parser does NOT cap; the orchestrator caps to first 50 (D-05 step 11) so truncation is visible at the call site."
  - "BUNDLE_SIZE_HARD short-circuits the FULL pipeline (subprocess checks NOT invoked) — no retry can shrink a 1MB bundle."
  - "All other failures (terminal SECRETS_LEAKED + retryable) let the rest of the pipeline run — surface every failure in one round (cheaper than 3 retry rounds)."
  - "FormatChecker is enabled on the Draft 2020-12 metaschema validator but does not generate negative coverage at the F1 layer (schemas, not instances) — Pass 3 owns format-value validation against actual instances."
  - "json_schema eagerly loads the Plan 05-02 MCP schema bundle to fail fast on missing-fixture errors; the bundle itself is reserved for Plan 05-08's pipeline glue (envelope-level checks)."
  - "Sibling ts_compile module rather than re-export of stage_e/validate.py: F1 wants structured TsCompileResult outcomes; Stage E wants typed StageETsError fail-stop."
metrics:
  tasks-completed: 3
  red-green-cycles: 3
  total-tests-added: 33  # 6+10+8+9 (some had >1 case via parametrize)
  total-tests-passing: 257  # full apps/generation-engine/tests/stages/ suite, 3 require_wrangler skips
  net-loc:
    src: ~480
    tests: ~600
duration-min: 60
completed: 2026-04-29
---

# Phase 5 Plan 04: F1 Subprocess Checks + Fail-Closed Orchestrator Summary

**One-liner:** Wired the 3 subprocess-bearing F1 checks (gitleaks secret scan, jsonschema dual-validation, tsc --noEmit) into a full `run_f1` orchestrator with BUNDLE_SIZE_HARD short-circuit + locked the D-07 fail-closed contract test that Plan 05-08 will satisfy.

## Objective

Extend Plan 05-03's cheap-checks skeleton with the 3 expensive checks and ship the fail-closed semantics test. After this plan, F1 is fully operational: 11 deterministic checks complete in <10s on a typical fixture.

## What was built

### Task 1 — gitleaks secret_scan + jsonschema dual-validation

**`f1_checks/secret_scan.py`** invokes `gitleaks detect --no-git --redact --report-format json --report-path -` via `asyncio.create_subprocess_exec`. Default rules cover Stripe `sk_live_`, GitHub PATs (`ghp_`/`gho_`/`ghs_`), AWS access keys, and ~150 other secret patterns (gitleaks 8.30.1 pinned in Plan 05-02).

Failure modes:
- `GITLEAKS_NOT_INSTALLED` — binary missing on PATH; surfaced distinctly.
- `SECRET_SCAN_TIMEOUT` — subprocess exceeded 10s budget; killed + waited up to 5s.
- `SECRET_SCAN_OUTPUT_INVALID` — non-JSON stdout (corrupted run; rare).
- `SECRETS_LEAKED` — one or more findings; **terminal** per D-06 (`F1_CHECK_TO_RETRY["SECRETS_LEAKED"] is None`).

`--redact` ensures findings carry the literal string `"REDACTED"` instead of the raw secret value. Findings capped at 20 to keep SSE payloads bounded.

**`f1_checks/json_schema.py`** uses `jsonschema.Draft202012Validator` with `FormatChecker` to validate that BOTH `inputSchema` AND `outputSchema` (when present) are well-formed Draft 2020-12 schemas. `outputSchema` is OPTIONAL per MCP 2025-06-18; `inputSchema` is REQUIRED. Eager-loads the Plan 05-02 MCP schema bundle from `packages/engine-fixtures/_canonical/mcp-schema.json` to fail fast on missing-fixture errors.

When BOTH schemas fail on the same tool, error code chooses INPUT (Pass 3 retry) over OUTPUT (Pass 5 retry) because Pass 3 is upstream — fixing input cascades.

### Task 2 — ts_compile subprocess wrapper

**`f1_checks/ts_compile.py`** invokes `npx tsc --noEmit -p tsconfig.json` via `asyncio.create_subprocess_exec` against the generated dir. Reuses Phase 4 D-39 pre-warmed `packages/codegen-templates/node_modules/`.

Sibling to Phase 4's `stage_e/validate.py::run_tsc_no_emit` rather than a re-export: Phase 4 raises typed `StageETsError` because codegen treats tsc errors as fail-stop; F1 instead returns a structured `TsCompileResult` so the orchestrator can record an outcome row.

`parse_tsc_output` is pure-Python regex over the standard tsc error format (`file(line,col): error TSxxxx: message`); the orchestrator caps at 50 errors per D-05 step 11. Combines stdout + stderr (tsc `--pretty` toggles which one carries errors).

### Task 3 — `run_f1` orchestrator + D-07 fail-closed contract

**`f1_static.py::run_f1`** chains `run_f1_cheap_checks` (Plan 05-03) with the 3 subprocess checks. Cheapest-first ordering preserved.

Behavior:
- BUNDLE_SIZE_HARD short-circuits the FULL pipeline — subprocess checks NOT invoked because no retry can shrink a 1MB bundle.
- All other failures (terminal SECRETS_LEAKED + retryable e.g. TS_COMPILE_FAILED) let the rest of the pipeline run so the caller sees every failure in one round.
- `subprocess_checks_pending=False` on every return path now that the 11-step pipeline is complete.

**`test_pipeline_f1_fail.py`** locks the D-07 contract for Plan 05-08:
- F1 fail → F2 + F3 NOT invoked.
- F1 pass → F2 invoked; F2 pass → F3 invoked; F2 fail → F3 still blocked.
- Terminal vs retryable F1 failures both block F2/F3 equally (`retry_target` only tells the orchestrator what to retry, not whether to gate downstream).

## Verification

- 16 tests in `test_secret_scan.py + test_f1_json_schema.py` (Task 1).
- 8 tests in `test_f1_ts_compile.py` (Task 2; integration smokes skip without wrangler).
- 5 new orchestrator tests in `test_f1_static_orchestrator.py` (Task 3) + 7 new tests in `test_pipeline_f1_fail.py`.
- Full stage_f/ suite: 70 passing, 3 require_wrangler skips on a machine without the wrangler binary.
- Full stages/ suite: **257 passing, 3 skipped** in 81s.
- Lint clean: `ruff check src/mcpgen_engine/stages/stage_f/ tests/stages/stage_f/` → All checks passed!
- Type clean: `mypy src/mcpgen_engine/stages/stage_f/` → no issues found in 15 source files.

## Acceptance criteria from PLAN.md

- [x] 2 check modules exist (secret_scan.py + json_schema.py); ts_compile.py exists.
- [x] `grep "gitleaks" secret_scan.py` returns 16 (≥2 required).
- [x] `grep "Draft202012Validator" json_schema.py` returns 5 (≥1 required).
- [x] `grep "FormatChecker" json_schema.py` returns 4 (≥1 required).
- [x] `grep "_canonical/mcp-schema.json" json_schema.py` returns 3 (≥1 required).
- [x] `grep "TIMEOUT|wait_for" secret_scan.py` returns 4 (≥1 required).
- [x] `grep "SECRETS_LEAKED" secret_scan.py` returns 3 (≥1 required).
- [x] `grep "tsc --noEmit|tsc.*noEmit" ts_compile.py` returns 2 (≥1 required).
- [x] `grep "TS_COMPILE_FAILED" ts_compile.py` returns 5 (≥1 required).
- [x] `grep "wait_for|timeout" ts_compile.py` returns 8 (≥1 required).
- [x] `grep "TsError|parse_tsc_output" ts_compile.py` returns 7 (≥2 required).
- [x] `grep "async def run_f1\b" f1_static.py` returns 1 (≥1 required).
- [x] `grep "from .f1_checks import" f1_static.py` returns 1 (≥1 required).
- [x] `grep "subprocess_checks_pending=False" f1_static.py` returns 3 (≥1 required).
- [x] `grep "BUNDLE_SIZE_HARD" f1_static.py` returns 8 (≥1 required).
- [x] `python -c "from mcpgen_engine.stages.stage_f.f1_static import run_f1; print('OK')"` outputs `OK`.
- [x] `pytest tests/stages/stage_f/test_pipeline_f1_fail.py` exits 0 (7 passing).
- [x] gitleaks tests skip cleanly when binary absent (verified via mocked path).
- [x] integration tests skip cleanly without wrangler binary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed `--no-cov` flag from verify command**
- **Found during:** Task 1 verification.
- **Issue:** Plan's `<verify>` blocks specified `pytest --no-cov`, but the engine's pytest setup does not load `pytest-cov`. `pytest --no-cov` exits with `unrecognized arguments` and zero tests run.
- **Fix:** Used `uv run pytest <files>` (no `--no-cov`) for all verification calls.
- **Files modified:** none (test invocation only).

**2. [Rule 1 - Bug] GitHub PAT test fixture lacked sufficient entropy**
- **Found during:** Task 1 GREEN run.
- **Issue:** Plan's example PAT (`ghp_abcdefghijklmnopqrstuvwxyz0123456789AB`) is all-lowercase and fails the gitleaks `github-pat` rule's Shannon-entropy floor — gitleaks ignored it as a false positive.
- **Fix:** Replaced with a high-entropy fixture (`ghp_p0M4kEtHe5BE7Ab1ldUz9HjLnmK9Lk1AbCdE`) that triggers the rule.
- **Files modified:** `tests/stages/stage_f/test_secret_scan.py`.
- **Commit:** `a7e7433` (combined with GREEN).

**3. [Rule 2 - Critical] Pure-format-checker negative test removed**
- **Found during:** Task 1 GREEN ruff lint.
- **Issue:** A planned test for `FormatChecker` rejecting a malformed `examples` value did not actually exercise the F1 layer (FormatChecker validates instances, the F1 check validates schemas as instances of the metaschema). The test created two unused dict variables (F841 lint errors).
- **Fix:** Replaced the case with a positive contract assertion (clean `format: date-time` example passes). Negative coverage for malformed format values lives at Pass 3, where instances are resolved.
- **Files modified:** `tests/stages/stage_f/test_f1_json_schema.py`.
- **Commit:** `a7e7433` (combined with GREEN).

**4. [Rule 1 - Bug] Mypy `no-any-return` on `_load_mcp_schema_bundle`**
- **Found during:** Task 1 mypy run.
- **Issue:** `json.loads` returns `Any`, so the declared `dict[str, Any]` return type triggered `[no-any-return]`.
- **Fix:** Annotated the local with `data: dict[str, Any]` before returning.
- **Files modified:** `src/mcpgen_engine/stages/stage_f/f1_checks/json_schema.py`.
- **Commit:** `a7e7433`.

### Plan refinements (intentional, not deviations)

- **Failure-precedence on dual-schema fail surfaces INPUT first.** Plan said "different code per kind"; concrete tie-break adopted: Pass 3 upstream of Pass 5, so input failures cascade and we report `JSON_SCHEMA_INVALID_INPUT` whenever any input error exists, regardless of output errors on the same tool. Documented in module docstring + verified by `test_input_failure_takes_precedence_over_output_in_error_code`.

- **`run_f1` short-circuit ONLY on BUNDLE_SIZE_HARD.** Plan suggested "abort early on hard failures"; we preserved Plan 05-03's semantics (only BUNDLE_SIZE_HARD short-circuits; everything else allows the rest of the pipeline to run for cheaper one-round failure surfacing). This matches the Plan 05-03 `run_f1_cheap_checks` design exactly.

## Authentication gates

None encountered.

## Threat surface (compared to plan threat_model)

| Threat ID | Status | Note |
|-----------|--------|------|
| T-5-14 (Information Disclosure — gitleaks output) | Mitigated | `--redact` 100% + raw-secret leak verified absent in test_stripe_key_detected. |
| T-5-15 (Tampering — dual-schema validation) | Mitigated | Both inputSchema + outputSchema validated; FormatChecker active. |
| T-5-16 (DoS — subprocess timeouts) | Mitigated | All 3 subprocesses use asyncio.wait_for + SIGKILL + 5s cleanup. |
| T-5-17 (DoS — F1 fail-closed bypass) | Mitigated | F1RunResult.passed is the single SOT; test_pipeline_f1_fail.py locks the gate. |

No new threat surface introduced beyond what the plan modelled.

## Files at a glance

| File | Lines | Tests | Purpose |
|------|-------|-------|---------|
| `f1_checks/secret_scan.py` | 175 | 6 | gitleaks subprocess wrapper |
| `f1_checks/json_schema.py` | 173 | 10 | Draft 2020-12 dual-validation |
| `f1_checks/ts_compile.py` | 175 | 8 | tsc --noEmit subprocess + parser |
| `f1_static.py` (extended) | +127 | 5 (orchestrator) + 7 (fail-closed) | run_f1 entry point |

## Commits

- `872608f` test(05-04): RED — failing tests for F1 secret_scan + json_schema
- `a7e7433` feat(05-04): GREEN — F1 secret_scan + json_schema subprocess checks
- `d48053e` test(05-04): RED — failing tests for F1 ts_compile subprocess wrapper
- `58c18ef` feat(05-04): GREEN — F1 ts_compile subprocess wrapper
- `f4e8cfa` test(05-04): RED — failing tests for run_f1 orchestrator + D-07 fail-closed
- `396f59f` feat(05-04): GREEN — run_f1 orchestrator wires 8 cheap + 3 subprocess checks

## TDD Gate Compliance

Each task followed RED → GREEN strictly. No REFACTOR commits were needed — code was written deliberately at GREEN; lint + mypy fixes were folded into the GREEN commit (atomic per task). Gate sequence verified: every GREEN commit follows a RED commit for the same task.

## What Plan 05-05 / 05-08 inherit

- **`run_f1` is the canonical F1 entry point.** Plan 05-05 (F2 smell scan) calls F2 only after `await run_f1(...)` returns `passed=True`.
- **D-07 fail-closed contract test exists.** Plan 05-08 implements `stages/stage_f/__init__.py::run_stage_f` and replaces the inline harness in `test_pipeline_f1_fail.py` with a real pipeline call while keeping the assertions intact.
- **Failure-pattern → retry mapping is fully covered for F1.** All 12 F1 error codes in `failure_patterns.py::F1_CHECK_TO_RETRY` now have a test that asserts their retry target (terminal vs. specific pass).

## Self-Check: PASSED

All 10 created/modified files exist on disk; all 6 commits exist in git history.
- 10/10 files present (3 src modules + 5 test files + 2 modified files).
- 6/6 commits in `git log` (3 RED + 3 GREEN, 1 per task).
- 257/257 stage tests pass (3 require_wrangler skips on a machine without the wrangler binary).
- ruff + mypy clean across the entire `stage_f/` tree.
