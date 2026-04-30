---
phase: 05-generation-engine-validation-stage-f
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 49
files_reviewed_list:
  - apps/cli/src/init/index.ts
  - apps/cli/src/init/options.ts
  - apps/cli/src/init/render_quality_report.ts
  - apps/cli/src/init/sse_consumer.ts
  - apps/cli/src/init/write_stage_e_output.ts
  - apps/generation-engine/src/mcpgen_engine/api/generate.py
  - apps/generation-engine/src/mcpgen_engine/cache/__init__.py
  - apps/generation-engine/src/mcpgen_engine/cache/cache_invalidation.py
  - apps/generation-engine/src/mcpgen_engine/cache/keys.py
  - apps/generation-engine/src/mcpgen_engine/cache/l2.py
  - apps/generation-engine/src/mcpgen_engine/launch_criteria.py
  - apps/generation-engine/src/mcpgen_engine/llm/sampling.py
  - apps/generation-engine/src/mcpgen_engine/pipeline.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/__init__.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/__init__.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/bundle_size.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/json_schema.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/mcp_compliance.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/routing_completeness.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/secret_scan.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/template_artifacts.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/ts_compile.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/failure_patterns.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/golden_tasks.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/judge_prompts.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_clients.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/mock_upstream.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/quality_report.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/rubric.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/__init__.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/github.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/linear.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/notion.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/slack.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/stripe.py
  - apps/generation-engine/src/mcpgen_engine/stages/stage_f/server_runner.py
  - packages/contracts/src/generation-api.ts
  - packages/engine-fixtures/linear/mock_upstream.py
  - packages/engine-fixtures/slack/mock_upstream.py
  - packages/ir/python/types.py
  - packages/ir/scripts/codegen.ts
  - packages/ir/src/types.ts
findings:
  critical: 1
  warning: 12
  info: 11
  total: 24
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

Phase 5 implements Stage F (F1 static + F2 smell scan + F3 agent eval), QualityReport composite, retry orchestrator FSM, cascade L2 cache invalidation, golden-task fixtures, and the CLI surface (`--f3` / `--sandbox-creds` / `--strict`). Implementation is high quality overall: invariants are clearly documented, LAUNCH_CRITERIA thresholds are imported (not hardcoded), security-sensitive paths (sandbox creds, secret scan, smart-ID fuzz, untrusted spec sanitization) carry strong threat-model commentary, and the openWorldHint=true invariant is enforced both by Pydantic `Literal[True]` and by F1 mcp_compliance.

The single critical finding is a security-relevant filesystem race window in the Stage E output endpoint — a TOCTOU that could allow a generated-file path to be redirected after path validation. The remaining issues are split between (a) error-handling silent-failure spots that contradict CLAUDE.md "raise errors explicitly," (b) typing violations against the project's "no `Any`/`Dict[str, Any]`" rule, and (c) several correctness gaps in F1 / F2 / F3 that risk wrong scoring or stuck retries.

Performance / O(n²) issues were intentionally excluded per v1 scope, except where they're also correctness bugs.

## Critical Issues

### CR-01: TOCTOU between path validation and read in Stage E output endpoint

**File:** `apps/generation-engine/src/mcpgen_engine/api/generate.py:485-507`

**Issue:** `output_file()` validates the relative path, calls `file_path.resolve(strict=True)`, then re-checks containment via `relative_to(output_dir.resolve(strict=True))` before reading the bytes. Between the `resolve()` containment check and the subsequent `file_path.read_bytes()` (line 503), an attacker who can write to `${MCPGEN_OUTPUT_DIR}/<job_id>/...` (e.g., a co-tenant in shared `/tmp` since the default base is `/tmp/mcpgen-engine-output`) can swap a regular file for a symlink that points outside the output dir. `read_bytes()` resolves symlinks again at read time, so the file content actually returned may be `/etc/passwd` even though `resolved` was inside the dir.

Additionally, the read uses the unresolved `file_path` (not `resolved`), defeating the symlink check entirely if `<output_dir>/<rel>` was originally a symlink (`resolve(strict=True)` followed the link to a path inside the dir, but that link can be re-pointed before the read, OR the read path itself contains a symlink earlier in the chain — Python's `Path.read_bytes()` does NOT use the same canonicalisation).

**Fix:**
```python
# Read from the canonicalised path under O_NOFOLLOW semantics, not from
# the unresolved file_path. resolved is already strict-checked-contained.
import os

resolved = file_path.resolve(strict=True)
resolved.relative_to(output_dir.resolve(strict=True))
# Use os.open with O_NOFOLLOW on the FINAL component to refuse symlinks.
# Alternatively, drop /tmp default and require MCPGEN_OUTPUT_DIR to be a
# per-process dir owned by the engine UID with mode 0700.
fd = os.open(resolved, os.O_RDONLY | os.O_NOFOLLOW)
try:
    body = os.read(fd, os.fstat(fd).st_size)
finally:
    os.close(fd)
```
And/or change `resolve_output_dir()` (`pipeline.py:244-261`) to refuse the `/tmp/mcpgen-engine-output` default in production — `/tmp` is world-writable on POSIX and the per-job sub-dir is created with the umask-default `mkdir(parents=True, exist_ok=True)` (no explicit `mode=0o700`), so a co-tenant on a shared host can `mkdir /tmp/mcpgen-engine-output` first and own it before the engine starts.

## Warnings

### WR-01: F3 pipeline silently swallows all exceptions, masks real failures

**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:552-557`

**Issue:** `_run_stage_f` wraps the entire F3 invocation in `except Exception` with only a `pragma: no cover` log line. CLAUDE.md explicitly forbids "catch-all handlers that hide the root cause" and "no fallbacks unless I explicitly ask for them." A network blip during `wrangler dev` startup, a Pydantic validation error in a malformed golden task, or an `assert` violation in `server_runner._kill_process_group` will all be silently swallowed and result in `f3_result=None` flowing into the QualityReport — the operator sees `f3_agent_eval=null` and has no signal that F3 actually crashed vs. being skipped.

**Fix:**
```python
try:
    f3_result = await run_f3(...)
except (FileNotFoundError, ValidationError) as exc:
    # Known recoverable: missing fixture / bad golden task → skip F3
    _log.warning("pipeline.f3_unavailable", job_id=job_id, error_class=type(exc).__name__, error=str(exc))
    warnings.append(f"F3 skipped: {type(exc).__name__}: {exc}")
# Anything else (RuntimeError from spawn_server, OSError, AssertionError) propagates
# and lands in the broader pipeline `except Exception` so the operator sees `failed`.
```

### WR-02: F1 BUNDLE_SIZE_HARD short-circuit drops subsequent F1 outcomes — contradicts module docstring

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_static.py:138-144, 287-298`

**Issue:** The module docstring (lines 22-26) explicitly says "The orchestrator itself does NOT short-circuit on generic failures — it runs every cheap check so the F1 outcome matrix is complete in a single round (cheaper to surface 3 failures at once than discover them across 3 retry rounds). The ONLY hard short-circuit is BUNDLE_SIZE_HARD." That part is consistent. However, when `BUNDLE_SIZE_HARD` does fire, the subprocess checks (`secret_scan`, `json_schema`, `ts_compile`) are ALSO skipped — line 287-298 returns immediately with the cheap outcomes. A bundle-too-large case can still leak secrets or have invalid JSON Schemas; the operator only sees the bundle error and never learns about the leaked credential until they split into multi-server and re-run. `SECRETS_LEAKED` is also terminal per `failure_patterns.F1_CHECK_TO_RETRY` — so this matters: it should be surfaced even when bundle is hard.

**Fix:** Run secret_scan unconditionally (it's terminal anyway and cheap-ish at ~2s); only skip `json_schema` + `ts_compile` since those targets fix nothing for an oversized bundle.
```python
# Always run secret_scan; it's terminal and the operator needs to know about leaks
# regardless of bundle outcome.
secret_result = await secret_scan.run_secret_scan(generated_dir)
outcomes.append(_record("secret_scan", secret_result.passed, secret_result.error,
                         {"findings": len(secret_result.findings), "info": secret_result.details}))
if cheap.first_failure is not None and cheap.first_failure.error == "BUNDLE_SIZE_HARD":
    return F1RunResult(passed=False, outcomes=outcomes, first_failure=cheap.first_failure,
                       subprocess_checks_pending=False)
```

### WR-03: `looksLikeRawCredential` rejects valid file paths starting with credential prefixes

**File:** `apps/cli/src/init/options.ts:158-163, 181-187`

**Issue:** The path `~/sk_test_creds.yaml` or `./pk_local.env` will be rejected as if it were a raw credential. The CLI message says "the operator can rename the file" but the prefix list includes very common path tokens (`pk_`, `sk_`) that legitimately appear in path names. More importantly, the "starts with" detection runs on the *whole string*, not a basename — so even `./sk_test/creds.yaml` is rejected.

**Fix:**
```typescript
function looksLikeRawCredential(value: string): boolean {
  // Heuristic: only reject if the value contains NO path separators AND
  // is long enough to be an actual secret (raw secrets are typically >15 chars,
  // file paths typically contain '/' or '\\' or are short like 'creds.yml').
  if (value.includes('/') || value.includes('\\') || value.includes('.')) return false;
  if (value.length < 16) return false;
  for (const prefix of RAW_CREDENTIAL_PREFIXES) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
}
```

### WR-04: `_passes_per_task` may pass when judge values are coerced floats but rule_based fails silently

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py:188`

**Issue:** `tool_validity = all(tc.tool_name in tool_names for tc in traj.tool_calls)` — if `traj.tool_calls` is empty (agent never called any tool), `all([])` returns `True`. An agent that hallucinates a final answer without calling any tool will be marked `tool_validity=True`, `schema_compliance=True`, `dependency_order=True` (loop body never runs). The only check that catches it is `runtime_success = traj.terminated == "end_turn"` — but a clean text-only `end_turn` IS terminated="end_turn". So `rule.all_pass()` returns True for an agent that never used the server at all. Combined with a generous LLM judge ≥7, this gives a false-positive task pass.

**Fix:**
```python
# Refuse to mark a task as rule_based.passed when the agent never invoked
# the server. F3 is testing the SERVER; a task completed without tool calls
# proves nothing about the generated MCP surface.
if not traj.tool_calls:
    return RuleScore(
        tool_validity=False,
        schema_compliance=False,
        runtime_success=False,  # vacuous success → not a runtime exercise
        dependency_order=expected_seq is None,  # only OK if no sequence required
        efficient=True,
    )
```

### WR-05: F2 `low_confidence_run` triggers F3 only via OR with `not f2_result.passed`, mismatching docstring

**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:524-527` and `f2_smell.py:213,217-221`

**Issue:** The pipeline triggers F3 when `f3_enabled or f2_result.low_confidence_run or not f2_result.passed`. But the F2 docstring (`f2_smell.py:18-22`) says low_confidence is meant to "force-enable F3 even on free tier" — implying the policy is the same as `f3_enabled`. Currently any F2 fail (overall < 4.0) triggers F3, regardless of low-confidence. That's not necessarily wrong — but the warnings vector at f2_smell.py:215-220 ONLY appends "F3 will be force-triggered to confirm" when `low_confidence_run=True`; when F2 fails normally (sigma OK, score < 4), F3 still runs but no warning is emitted, so the QualityReport.warnings vector is missing a critical breadcrumb.

**Fix:** Add a parallel warning when F2 is force-running F3 due to threshold fail:
```python
warnings: list[str] = []
if low_confidence_run:
    warnings.append("F2 between-tool sigma low (<0.4) — quality assessment may be unreliable. F3 will be force-triggered to confirm.")
if not passed and not low_confidence_run:
    warnings.append(f"F2 overall {overall_score:.2f} < threshold {threshold:.2f} — F3 will be force-triggered.")
```

### WR-06: Smart-ID fuzz check silently false-positives on edge spec_slugs containing dashes

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py:30-35, 87-93`

**Issue:** The synthesized tenants are `f"abc1-{spec_slug}"` / `f"xyz2-{spec_slug}"`. The tenant regex `[a-z0-9]+(?:[-_][a-z0-9]+)+` accepts these prefixes. But for a spec_slug containing a hyphen — e.g., `my-api`, `web-hooks` — the resulting tenant string `abc1-my-api` is parseable as `tenant=abc1-my-api`, but if the actual generated runtime parser splits more conservatively (e.g., on first hyphen), the F1 fuzz parser passes while the real parser doesn't, defeating the cross-tenant rejection check entirely. The check is "contractually identical" per the docstring but there's no test asserting this against the actual TS runtime parser.

**Fix:** Either (a) restrict `spec_slug` validation upstream (Pass 1) to disallow hyphens — already implied by `^[a-z][a-z0-9_]{0,63}$` for tool names, but not enforced for spec_slug — or (b) shell out to the actual `runtime/smart_id.ts` parser via Node and do a real cross-check. Adding a `# TODO(Plan 05-08)` is not enough; this is a Pitfall #1 mitigation that's the whole point of the check.

### WR-07: `examples_provenance` substring match is too loose, biases toward false negatives

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py:120-135`

**Issue:** Module docstring says "biases towards false-positives." Actually it biases the OTHER way — toward false NEGATIVES (missing real hallucinations). Example: spec contains `{"name": "Alice"}` and Pass 2 emits `{"name": "Alicia"}`. Canonical-form substring check is `'{"name":"Alicia"}' in '{"name":"Alice"}\\n...'` → False, correctly flagged. But a hallucinated example `{"id": "5"}` will match if ANY response anywhere has `{"id":"5"}` — the canonical corpus is concatenated across ALL endpoints' examples, so a tool's example need only match SOME endpoint's example, not the endpoint backing that tool. This means a Charges tool can pass with examples lifted from Customers responses.

**Fix:**
```python
# Build a per-tool corpus: only check examples against the spec examples
# of the endpoints that source this tool.
def _collect_spec_examples_for_endpoints(raw_ir, endpoint_keys: set[str]) -> str:
    fragments = []
    for ep in raw_ir.get("endpoints", []) or []:
        key = f"{ep.get('method','').upper()} {ep.get('path','')}"
        if key not in endpoint_keys: continue
        # ... rest of the walker
```
Pass `source_endpoints` from the tool spec into the matcher so each tool's examples must match its OWN backing endpoints.

### WR-08: Auth middleware regex matches `requireAuth` inside `import { requireAuth }` — false positive

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/auth_middleware.py:48-50, 83-93`

**Issue:** `_OTHER_AUTH_RE = r"\b(requireAuth|apiKey|oauth|verifyToken|withAuth|authenticate)\b"` is matched anywhere in the file, including the import statement at the top. If `auth_middleware.ts.j2` does `import { requireAuth } from './handlers.js'` BEFORE referencing `ALLOWED_HOSTS`, this check fires AUTH_MIDDLEWARE_MISSING and triggers a Stage E retry — for a perfectly correct file. The Phase 4 codegen template most likely puts imports first.

**Fix:** Strip imports / strip TypeScript comments before matching, OR require the auth-decision token to appear inside a function body / call expression rather than an import:
```python
# Naive but adequate: strip lines starting with 'import ' or '//' before checking.
non_import_text = "\n".join(
    line for line in text.splitlines()
    if not line.lstrip().startswith(("import ", "//", "/*", "*"))
)
guard_match = _HOST_HEADER_GUARD_RE.search(non_import_text)
# ... etc on non_import_text
```

### WR-09: F2 `_score_one_tool` fails closed on a single LLM call exception, dropping the entire tool's score

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py:149-160`

**Issue:** The 15-call inner loop has no retry / partial-failure handling — a single transient OpenRouter failure on the 12th call propagates up through `asyncio.gather` and aborts the entire F2 run. CLAUDE.md says "External API calls: retries with warnings, then raise the last error." The docstring claims `Semaphore(10)` is the concurrency control but per-call retries are unimplemented. Cost of one F2 run is reportedly $0.20–0.50 and lasts 20–30s — losing all of that to a transient 502 is poor.

**Fix:** Wrap each `judge_agent.run` in a small retry helper:
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10),
       retry=retry_if_exception_type((httpx.HTTPError, asyncio.TimeoutError)))
async def _safe_run(agent, prompt, settings):
    return await agent.run(prompt, model_settings=settings)
```
Or accept partial scores if N≥10 of 15 calls succeed.

### WR-10: `set_l2` writes value before populating the sidecar index — non-atomic invalidation

**File:** `apps/generation-engine/src/mcpgen_engine/cache/l2.py:122-154`

**Issue:** `set_l2` writes the data file at line 148 (`tmp_path.replace(p)`), then opens the sidecar index at line 152 and re-writes it. A crash between these two writes leaves an L2 entry on disk that `invalidate_by_prefix` can't find — so cascade invalidation will silently miss the entry and the next run gets stale data through a different cache key (until 30-day TTL kicks in). For a Phase 5 retry orchestrator that depends on cascade invalidation for correctness, this is a bug.

**Fix:** Update the index BEFORE the data write, OR write a "pending" marker:
```python
# Update index FIRST. If the data write fails, invalidate_by_prefix sees
# the index entry and will unlink a non-existent file (idempotent — see
# the `else: removed += 0` branch already handling that case).
if original_key is not None:
    index = _read_index()
    index[original_key] = key
    _write_index(index)

# Now write the data atomically.
p = _path_for(...)
# ... rest unchanged
```

### WR-11: Pipeline `_run_stage_f` uses `model_dump` on Pass5Output tools without alias roundtrip

**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:826-829, 1069-1071`

**Issue:** `t.model_dump(mode="json", by_alias=True)` is correct, but for Pass 5 tools the IR's `Tool2.inputSchema` / `outputSchema` are `Dict[str, Any]` typed at the Pydantic side and emitted as-is. If a Pass 3 schema contains a Pydantic-typed value (e.g., `HttpUrl`), `mode="json"` coerces, but `by_alias=True` isn't needed for those dicts — the alias `in_ -> in` only applies to `SecuritySchemes`. More importantly: F1 mcp_compliance does `json.dumps(tool, default=str)` (mcp_compliance.py:93) which falls back to `str()` for unknown types, masking serialisation bugs that would surface to the dispatch worker at runtime. Combined with the `_serialize_f3` SSE serializer using `getattr(r.trajectory, "iteration_count", 0)` (pipeline.py:384) — silently defaulting to 0 if the trajectory shape changes — the engine has multiple defensive `getattr`/`default=str` chains that hide real type mismatches.

**Fix:** Remove the `default=str` fallback in mcp_compliance.py:93. If a tool isn't JSON-serializable, that IS a Stage E codegen bug — surface it loudly:
```python
try:
    json.dumps(tool)  # no default=str — fail loudly on non-serialisable
except (TypeError, ValueError) as exc:
    offenders.append((name, f"non-serialisable: {exc}"))
```

### WR-12: `parse_smart_id` regex accepts identifiers containing newlines / control chars

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/smart_id_fuzz.py:30-35`

**Issue:** The identifier group `(?P<id>.+)` matches any character except newline by default, but with `.+` and no `re.DOTALL`, an identifier with embedded `\n` would silently be truncated at the newline rather than rejected. More importantly, the test fuzz only checks two synthetic IDs against each other — it does NOT verify that the real Stage E runtime parser shares the same regex. A drift between Python regex and TS regex defeats Pitfall #1.

**Fix:** Either (a) load the regex from a single shared source (e.g., generate the TS regex from this file), or (b) call out to `node -e 'console.log(require("./runtime/smart_id.js").parse(...))'` from the test to verify cross-implementation parity.

## Info

### IN-01: Heavy use of `dict[str, Any]` violates CLAUDE.md "no generic types"

**File:** Multiple — `apps/generation-engine/src/mcpgen_engine/api/generate.py:38,61,..`, `pipeline.py:62`, `stage_f/f1_checks/json_schema.py:30`, all sandbox modules, etc.

**Issue:** CLAUDE.md "No generic types: `Any`, `unknown`, `Dict[str, Any]`" — the engine code is pragmatic about this rule (parsed JSON bodies, Pydantic round-trips), but several functions could use TypedDict / dataclasses instead. Examples: `ArtifactsResponse.stage_e_manifest?: StageEManifestPayload` in `apps/cli/src/init/index.ts:84` types `pass_5_output?: unknown` rather than `Pass5Output`. `_JOB_TABLE: dict[str, dict[str, Any]]` in `api/generate.py:61` could be a TypedDict.

**Fix:** Define a `JobTableEntry` TypedDict and an explicit `Pass5Output` import in the CLI artifacts response type.

### IN-02: `_INJECTION_RE` lifted in two modules without sharing

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/judge_prompts.py:41-43`

**Issue:** Comment says "Identical regex to Phase 2/3 `_PROMPT_INJECTION_REGEX`" — yet the regex is hand-copied into this module. A future tightening of the Pass 2/3 regex won't propagate. CLAUDE.md "Check if logic already exists before writing new code."

**Fix:** Import the shared regex from the Phase 2 module (or hoist to a `mcpgen_engine.security.injection` shared module).

### IN-03: Dataclass `RetryContext.history` is a `list[dict[str, Any]]` — should be a typed RetryHistoryItem

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py:108`

**Issue:** `history` is unstructured. The IR already defines `RetryHistoryItem` (`packages/ir/python/types.py:519`) — using it would give `model_dump()` parity with `QualityReport.retry_history` for free.

**Fix:**
```python
from mcpgen_ir.types import RetryHistoryItem
history: list[RetryHistoryItem] = field(default_factory=list)
```

### IN-04: Magic numbers in retry orchestrator should reference LAUNCH_CRITERIA-style constants module

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py:57-61`

**Issue:** `_MAX_ROUNDS=2`, `_COST_CAP_FREE_USD=0.50`, etc. are described as "project-level UX invariants" but live as private module constants. A future bump to e.g. `_MAX_ROUNDS=3` won't be guarded by the paired-decision hook. Either move these into `launch_criteria.py` or document explicitly that these are NOT subject to the hook.

**Fix:** Move to `mcpgen_engine.launch_criteria` as a `RETRY_BUDGET` sub-dict with the same shape as `BUNDLE_SIZE`.

### IN-05: `_OFFENDER_PREVIEW_CHARS=200` and `_MAX_OFFENDERS_REPORTED=10` are duplicated across F1 checks

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/examples_provenance.py:33-35` and `mcp_compliance.py:35`, `template_artifacts.py:24`, etc.

**Issue:** The same magic numbers appear in 5+ check modules. Should be a shared constant in `f1_checks/__init__.py`.

**Fix:** Hoist to `f1_checks/__init__.py`:
```python
F1_MAX_OFFENDERS_REPORTED: Final[int] = 10
F1_OFFENDER_PREVIEW_CHARS: Final[int] = 200
```

### IN-06: `assert` used as runtime safety check in `server_runner.spawn_server`

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/server_runner.py:204-207`

**Issue:** `assert "MCPGEN_F3_TEST" not in os.environ, "..."` — Python's `assert` is stripped under `python -O`. This is described as "a hard error in tests + production" but is exactly what `assert` does NOT guarantee in production.

**Fix:**
```python
if "MCPGEN_F3_TEST" in os.environ:
    raise RuntimeError(
        "DNS bypass flag leaked to parent process — security violation (D-51)"
    )
```

### IN-07: `_dedupe_by_target_pass` mutates `setdefault` into a private dict — fine but un-documented

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/retry_orchestrator.py:204-209`

**Issue:** `setdefault` keeps the FIRST trigger per target_pass. The docstring says "Collapse triggers that share a target_pass — one cascade per pass" but doesn't say "first-wins" — important for deterministic surfacing of `reason` in QualityReport.warnings.

**Fix:** Add explicit comment: `# First-trigger-wins: deterministic surface in retry_history.`

### IN-08: `_serialize_f3` uses `getattr(r.trajectory, "iteration_count", 0)` masking type drift

**File:** `apps/generation-engine/src/mcpgen_engine/pipeline.py:384`

**Issue:** `getattr(..., default=0)` swallows a TaskTrajectory schema change. If `iteration_count` gets renamed, the SSE payload silently emits 0 turns and the operator can't tell whether F3 ran at all.

**Fix:** Access `r.trajectory.iteration_count` directly. If the trajectory shape is uncertain, define a `TaskTrajectory` Protocol and accept it explicitly.

### IN-09: `_resolve_credential` returns `os.environ.get(env_var) or None`, where `or None` is dead

**File:** `apps/generation-engine/src/mcpgen_engine/stages/stage_f/sandbox/__init__.py:55-56`

**Issue:** `os.environ.get(env_var)` already returns `None` when missing. The `or None` is redundant — and would convert an empty string credential to `None`, which is intentional but should be explicit.

**Fix:**
```python
val = os.environ.get(env_var)
return val if val else None  # treat empty string as missing (clearer intent)
```

### IN-10: `looksLikeRawCredential` `Bearer ` prefix has trailing space — surprising

**File:** `apps/cli/src/init/options.ts:154-155`

**Issue:** `'Bearer '` and `'bearer '` include trailing spaces. A path argument from Commander never starts with a space (shell strips them), so these prefixes are unreachable. Either useless or testing for a leaked-secret-with-Bearer-prefix that came in through a different code path.

**Fix:** Drop the `'Bearer '` / `'bearer '` entries OR document that they're for paste-from-clipboard cases where Commander preserves the leading space.

### IN-11: `Pass5Output.tools[].outputSchema` is required but emitted as empty `{}` in some paths

**File:** `packages/ir/src/types.ts:139` and `packages/ir/python/types.py:138`

**Issue:** `outputSchema: z.record(z.string(), z.unknown())` is required — but the F1 `json_schema.py:130-132` treats `outputSchema=None` as "OPTIONAL in MCP 2025-06-18; absence is OK." That's inconsistent: the IR requires non-null; the F1 check accepts null. If the IR ever returns `outputSchema={}`, the F1 metaschema validator will accept it (empty schema is valid Draft 2020-12) but agents won't get the structured-output benefit. A non-empty default would be safer.

**Fix:** Either make `outputSchema` `.optional()` in the IR OR add an F1 invariant that non-empty `outputSchema` must define `type` / `properties`. Document the policy in one place.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
