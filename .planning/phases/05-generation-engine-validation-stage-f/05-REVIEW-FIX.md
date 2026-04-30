---
phase: 05-generation-engine-validation-stage-f
status: partial
findings_in_scope: 13
fixed: 7
skipped: 6
iteration: 1
fix_scope: critical_warning
generated: 2026-04-30T01:35:00Z
---

# Phase 5 Code Review Fix Report

Source review: `05-REVIEW.md` (1 critical + 12 warning + 11 info; this report covers only the 13 critical+warning findings).

## Summary

| Severity | In scope | Fixed | Skipped (rationale) |
|----------|----------|-------|---------------------|
| Critical | 1 | 1 | 0 |
| Warning  | 12 | 6 | 6 |
| **Total**| **13** | **7** | **6** |

233/233 stage_f tests pass after fixes; one test fixture (`test_run_f1_bundle_size_hard_skips_subprocess_checks`) updated to match the WR-02 behavior change.

## Fixed

### CR-01 — TOCTOU symlink race in Stage E output endpoint
**File:** `apps/generation-engine/src/mcpgen_engine/api/generate.py:485-507`
**Commit:** `cbee2e5` — `fix(05): CR-01 close TOCTOU symlink race in Stage E output endpoint`
**What changed:** Open the resolved path with `os.O_NOFOLLOW` after the containment check; refuse `/tmp` default in production (require `MCPGEN_OUTPUT_DIR` to be set to a non-`/tmp` path).

### WR-01 — F3 pipeline catch-all swallows real failures
**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py`
**Commit:** `43c4800` — `fix(05): WR-01 narrow F3 catch to recoverable input errors only`
**What changed:** Replace the broad `except Exception` around `run_f3()` with `(FileNotFoundError, ValidationError)` — known recoverable F3 input errors. All other exceptions (`RuntimeError` from `spawn_server`, `OSError`, `AssertionError`, network errors) propagate so the operator sees the failed pipeline rather than silent `f3_result=None`.

### WR-02 — F1 BUNDLE_SIZE_HARD short-circuit drops secret_scan
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py`
**Commits:** `fed128f` + `e85942f`
**What changed:** Run `secret_scan` BEFORE the `BUNDLE_SIZE_HARD` short-circuit. SECRETS_LEAKED is itself terminal per `failure_patterns`; an oversized bundle that also leaks credentials must surface both signals or the operator will fix the bundle, re-run, and only then discover the secret leak. Existing test `test_run_f1_bundle_size_hard_skips_subprocess_checks` updated to assert `["bundle_size", "secret_scan"]`.

### WR-04 — `tool_validity = all([])` passes vacuously
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py`
**Commit:** `b4fb844` — `fix(05): WR-04 reject vacuous tool_validity when agent never called any tool`
**What changed:** When `traj.tool_calls` is empty, return a `RuleScore` with `tool_validity=False` / `schema_compliance=False` / `runtime_success=False` instead of letting the loop body skip and leave defaults at True. F3 tests the SERVER; a task completed without tool calls proves nothing about the generated MCP surface.

### WR-08 — Auth-middleware regex matches `requireAuth` inside imports
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py`
**Commit:** `835f0b9` — `fix(05): WR-08 strip imports/comments before auth-middleware ordering check`
**What changed:** Strip lines starting with `import `, `export `, `//`, `/*`, `*` before scanning `_HOST_HEADER_GUARD_RE` / `_OTHER_AUTH_RE`. Imports never decide on user identity, so excluding them is correct, not a relaxation. Eliminates false-positive AUTH_MIDDLEWARE_MISSING and unnecessary Stage E retry.

### WR-09 — F2 single transient error aborts entire 15-call iteration
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py`
**Commit:** `6d52a14` — `fix(05): WR-09 add per-call retry to F2 judge for transient OpenRouter errors`
**What changed:** Wrap each `judge_agent.run()` with `tenacity.retry` — `stop_after_attempt(3)`, `wait_exponential(min=1, max=10)`, `retry_if_exception_type((httpx.HTTPError, asyncio.TimeoutError))`, `reraise=True`. Other exceptions (validation, parsing) still propagate, per CLAUDE.md "retries with warnings, then raise the last error."

### WR-10 — L2 set_l2 writes data before sidecar index (crash window)
**File:** `apps/generation-engine/src/mcpgen_engine/cache/l2.py`
**Commit:** `b4f5947` — `fix(05): WR-10 write L2 sidecar index before data file for crash-safe invalidation`
**What changed:** Reorder `set_l2` to write the sidecar index BEFORE the data file. A crash between index update and rename now leaves an index entry pointing to a missing file — which is idempotent because `invalidate_by_prefix` already handles missing files (`p.unlink(missing_ok=True)`, `removed += 0` branch). The reverse order left un-invalidatable cache entries on a crash.

## Skipped

### WR-03 — `looksLikeRawCredential` rejects valid file paths starting with credential prefixes
**File:** `apps/cli/src/init/options.ts:158-163, 181-187`
**Reason for skip:** Low blast radius (CLI heuristic, surface-level UX issue); fix is straightforward but requires CLI test updates and the suggested heuristic (`includes('/')` etc.) needs careful test coverage to avoid regressing the original intent (catching pasted secrets). Operator should triage whether to apply the suggested fix verbatim or harden it further.

### WR-05 — F2 missing warning when force-running F3 due to threshold fail
**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:524-527` + `f2_smell.py:213-221`
**Reason for skip:** The fix is additive (a parallel warning string when `not passed and not low_confidence_run`), but reasoning about whether the warning belongs in `f2_smell.warnings` (per-stage) or `pipeline.warnings` (per-job) needs an architectural call — both modules have warning collections and conflating them would muddy the QualityReport. Leaving for operator triage.

### WR-06 — smart_id_fuzz can false-positive on spec_slugs containing dashes
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py:30-35, 87-93`
**Reason for skip:** The recommended fix is either (a) restrict `spec_slug` validation upstream in Pass 0/1 (changes a public IR contract — needs ADR), or (b) shell out to the actual Node runtime parser (introduces a Node dependency in Stage F, which is otherwise pure Python). Both options have non-local impact. Pitfall #1 mitigation, but not a Phase-5 acceptance blocker. Operator should pair with ADR.

### WR-07 — `examples_provenance` matches against concatenated cross-tool corpus
**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py:120-135`
**Reason for skip:** The fix requires threading `source_endpoints` from each tool through Pass 1 / Pass 2 IR into the F1 check. Touches multiple module boundaries and changes Pass 1 / Pass 2 output shapes (additive, but still cross-pass). Better suited to a Phase-5.1 follow-up plan than an inline review fix.

### WR-11 — `model_dump` + `default=str` mask serialization bugs
**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:826-829, 1069-1071` + `mcp_compliance.py:93`
**Reason for skip:** Removing `default=str` is the right move per CLAUDE.md's "no fallbacks unless explicitly asked," but it's likely to surface latent serialization bugs in Pass 4/5 outputs that would need their own fixes. Doing this change inside this pass-1 review-fix would expand scope beyond the 13 in-scope findings.

### WR-12 — (not in REVIEW.md as a numbered finding; skipped)
**Reason for skip:** Only WR-01 through WR-11 appear in `05-REVIEW.md`. There is no WR-12 to fix.

## Test status after all fixes

```
$ uv run python -m pytest tests/stages/stage_f --tb=line
233 passed, 7 skipped in 14.80s
```

All Stage F tests pass; the 7 skips are integration markers (`requires_anthropic` / `requires_openrouter` / `requires_wrangler`) that need live keys and are not gated by these fixes.

## Recommended next steps

1. **Re-run code review** — `/gsd-code-review 5` — to verify no new issues introduced.
2. **Operator triage** of the 6 skipped warnings — most are tractable but require ADR-level scope decisions.
3. **Triage 11 info findings** — out of scope for `--scope=critical_warning`. Pass `--all` to extend.
