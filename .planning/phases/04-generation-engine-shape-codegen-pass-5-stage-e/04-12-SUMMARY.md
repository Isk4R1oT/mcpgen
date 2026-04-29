---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 12
subsystem: pipeline
tags: [pipeline-orchestration, stage-d, stage-e, l1-cache, sse-events, output-endpoint, cli-rewire, fixture-acceptance, deferred-items-drained]

# Dependency graph
requires:
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "Plans 04-01..04-11 — full Pass 5 + Stage E phase orchestrators (architect/author/runtime-shape/codegen)"
provides:
  - "Phase 4 final integration — Pass 5 + Stage E chained in `pipeline.py` per CONTEXT D-33"
  - "L1 cache 8-key payload (D-34) — incl. `pass_5_output` + `stage_e_manifest`"
  - "L2 cache `template_version` lever (D-35) — Stage-E template-bump invalidation"
  - "`GET /api/v1/generate/{job_id}/output/{relative_path}` HTTP endpoint (D-47)"
  - "CLI `write_stage_e_output.ts` — replaces retired `render_stub.ts` (D-37/D-38)"
  - "`_stable_error_code()` subclass-specific mapping per D-49 + D-51 (Phase 5 F1 retry consumes)"
  - "5 hand-tuned `pass-5-output.json` fixtures + 5 hand-tuned `stage-e-output/MANIFEST.json` fixtures (D-44)"
  - "Drained deferred-items.md — 5 categorized template TS errors fixed; Stripe + GitHub + Notion compile `tsc --noEmit` clean (D-43.5 zero-warning gate)"
affects:
  - "Phase 5 F1/F2/F3 retry orchestration consumes the per-class STAGE_E_TS_ERROR / STAGE_E_BUNDLE_TOO_LARGE / PASS_5_FAILED codes"
  - "Plan 04-13 manual MCP Inspector verification gate consumes the Stripe live render"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "8-key L1 cache payload: `{raw_ir, pass_0..5_output, stage_e_manifest}` + 8-tuple `reconstruct_from_l1()` return."
    - "Subclass-specific isinstance order most-specific-first in `_stable_error_code()` — `StageETsError` → `STAGE_E_TS_ERROR` BEFORE bare `StageEError` umbrella."
    - "Stage E output endpoint `GET /output/{relative_path:path}` re-renders deterministically from cached manifest — files NOT in L1 (D-34)."
    - "Path-traversal validation: reject `..` segments + leading `/` + backslash + NUL bytes BEFORE issuing fetch (defense in depth — engine validates on receive too)."
    - "`Pass 5 + Stage E` test stubs added to autouse fixtures in `test_api_generate.py` + `test_pipeline.py` + `test_pipeline_e2e.py` — keeps SSE-shape tests fast + isolated."
    - "Pass 5 fixture conversion: where `final-tools.json` exists (stripe/github/notion), Tool2 has same shape as FinalTool — direct conversion. Linear/Slack synthesize from Pass1Output + per-tool-type defaults (truncation thresholds per D-07, field-filtering categories per D-09)."
    - "Stage E manifest reproducibility: `.mcpgen.yaml` + `README.md` are the only timestamp-bearing files; every other file's sha256 is bit-stable across runs (D-36)."

key-files:
  created:
    - "apps/generation-engine/tests/integration/test_pipeline_stage_d_e_errors.py — 13 tests, authoritative `_stable_error_code` mapping table"
    - "apps/generation-engine/tests/integration/test_stage_e_capability_gate.py — 5 tests, MCP `2025-06-18` capability gate static check"
    - "apps/generation-engine/tests/integration/test_stage_e_manifest_stability.py — 2 tests, byte-identical Stage E rendering across 2 runs"
    - "apps/generation-engine/tests/integration/test_l1_warm_phase_4.py — 2 tests, GEN-12 + D-36 8-tuple roundtrip"
    - "apps/generation-engine/tests/integration/test_phase_4_e2e.py — 16 parametrized tests across 5 fixtures (pass-5 structural-equivalence + stage-e manifest acceptance + zero-warning gate + warning-tolerated gate + live render)"
    - "apps/cli/src/init/write_stage_e_output.ts — pure async writer consuming the new engine output endpoint"
    - "apps/cli/tests/test_write_stage_e_output.test.ts — 11 tests, fetch + write + path-traversal + idempotency"
    - "packages/engine-fixtures/{stripe,github,notion,linear,slack}/pass-5-output.json — 5 hand-tuned fixtures"
    - "packages/engine-fixtures/{stripe,github,notion,linear,slack}/stage-e-output/MANIFEST.json — 5 hand-tuned fixtures"
  modified:
    - "apps/generation-engine/src/mcpgen_engine/pipeline.py — extended `run_pipeline` with Stage D + Stage E + 16-event canonical SSE sequence + `_stable_error_code` subclass-specific mapping + L1 8-key payload + 8-tuple `reconstruct_from_l1`"
    - "apps/generation-engine/src/mcpgen_engine/cache/keys.py — added `template_version: str = '1'` kwarg to `l2_key()` per D-35"
    - "apps/generation-engine/src/mcpgen_engine/api/generate.py — new `GET /output/{relative_path:path}` endpoint with path-traversal validation + extended `/artifacts` payload"
    - "apps/cli/src/init/index.ts — replaced `renderServerTs` call site with `writeStageEOutput`"
    - "packages/codegen-templates/templates/{index,server,sentry_redact,response_shaping,errors,auth_middleware,tool_action,tool_list_objects,tool_search,tool_upsert,tool_workflow}.ts.j2 — 11 templates fixed for `tsc --noEmit` clean"
    - "apps/generation-engine/tests/test_api_generate.py + test_pipeline.py + tests/integration/test_pipeline_e2e.py + tests/integration/test_l1_warm_pass_2_3_4.py + tests/stages/stage_e/test_run_e2e.py — Phase 3 → Phase 4 contract migration; Pass 5 + Stage E stubs added to autouse fixtures"
    - ".planning/phases/04-…/deferred-items.md — header note that all 5 TS errors are drained by commit 111d6cb"
  retired:
    - "apps/cli/src/init/render_stub.ts — D-37 retirement; replaced by `write_stage_e_output.ts`"
    - "apps/cli/tests/inspector.e2e.test.ts — Phase-3 stdio-server test retired (T-2-F3 covered by Stage E `tsc --noEmit` gate + plan 04-13 manual gate)"
    - "apps/cli/tests/init.test.ts `render_stub` describe block — same"

key-decisions:
  - "L1 fast-path returns 17 events (not 16 as the plan must_haves stated) — A:started + A:completed + B×4 + C×6 + D×2 + E×2 + completed:×1 = 17. The plan's '16 total' miscount is documented in `test_l1_warm_phase_4.py` and the test asserts the actual emitted shape."
  - "Stage E `WebStandardStreamableHTTPServerTransport` (Web-Standard variant) replaces the Node-flavoured `StreamableHTTPServerTransport` — the latter expects `IncomingMessage`/`ServerResponse`, the former accepts `Request` and returns `Promise<Response>` (right shape for CF Workers)."
  - "`McpServer.setRequestHandler` doesn't exist (it's on the lower-level `Server`). Dropped the manual `InitializeRequestSchema` registration in `server.ts.j2` — `McpServer.connect()` handles initialize internally."
  - "Mutable `content[]` + `[k: string]: unknown` index signature mirror in `McpDualResult` + `McpErrorResponse` — required for structural assignment to the SDK callback's `CallToolResult` return type which is `z.object().$loose`."
  - "`structuredContent: { [k: string]: unknown }` (not bare `unknown`) — matches SDK CallToolResultSchema. Caller wraps non-object payloads in `{ value }`."
  - "`tool_search.ts.j2` uses explicit `route as RoutingEntry` cast after the early-return narrowing — TS sometimes resets narrowing of indexed-access results inside async callbacks; the runtime check above remains the safety guarantee."
  - "Zod 4 `z.record(value)` requires explicit key schema — switched to `z.record(z.string(), z.unknown())` in tool_action / tool_list_objects / tool_upsert / tool_workflow templates."
  - "Pass 5 + Stage E test stubs added to autouse fixtures in 4 test files — keeps SSE-shape tests fast (~1s) instead of 30s tsc + wrangler subprocess cost. Real Pass 5 / Stage E coverage lives in `tests/passes/pass_5/*` + `tests/stages/stage_e/*` + `tests/integration/test_phase_4_e2e.py` (live render)."
  - "Linear + Slack `pass-5-output.json` fixtures synthesized from Pass1Output + per-tool-type defaults (no `final-tools.json` available for those fixtures pre-Phase-4). Stripe + GitHub + Notion fixtures derive directly from the existing `final-tools.json` (canonical Tool2 shape from Phase 3)."

patterns-established:
  - "Per-pass `pass_X_run` orchestrator chained in `pipeline.py::run_pipeline` with `<stage>:started → <stage>:completed` SSE event pair around each call. Future Stage F (Phase 5) follows the same shape with F1/F2/F3 stage codes."
  - "L1 cache value layout grows monotonically per phase; `reconstruct_from_l1` returns an N-tuple matching the layout. Older L1 entries from a previous phase fail-fast on `model_validate` (no silent partial reads)."
  - "Subclass exception per stable SSE error code: subclass extends a common umbrella so `except StageEError` catch-all keeps working, but `_stable_error_code` does isinstance most-specific-first for per-code SSE event mapping. Future Phase 5 retry orchestration consumes these codes for targeted Pass 1/3/5 retries."
  - "Test-stub helper pattern in autouse fixtures: each Phase-3+ pipeline test stubs Pass 0..N at the orchestrator's import surface. New Phase-4 tests added Pass 5 + Stage E stubs to the existing 3 stub-using test modules with minimal duplication."

requirements-completed: [GEN-07, GEN-08]

# Metrics
duration: 110min
completed: 2026-04-29
---

# Phase 04 Plan 12: Pipeline + Stage D/E SSE + Output Endpoint + 5 Fixtures Summary

**Phase 4 final integration: pipeline.py chains Pass 5 + Stage E with the canonical 17-event SSE sequence; L1 cache stores the 8-key payload (`pass_5_output` + `stage_e_manifest` added); new `GET /output/{relative_path}` endpoint serves Stage E generated files; CLI `write_stage_e_output.ts` replaces retired `render_stub.ts`; 10 hand-tuned fixture JSONs ship; Stripe + GitHub + Notion compile `tsc --noEmit` clean with ZERO warnings (D-43.5 zero-warning acceptance gate).**

## Performance

- **Duration:** ~110 min (worktree work — drain deferred TS errors + pipeline extension + cache keys + output endpoint + 5 integration tests + CLI rewire + 10 fixture JSONs + ruff/mypy cleanup)
- **Started:** 2026-04-29T00:55:00Z
- **Completed:** 2026-04-29T01:55:00Z
- **Plan tasks:** 3 (per the plan must_haves) executed as 7 atomic commits.

## Accomplishments

### A. Drained 5 categorized template TS errors (commit `111d6cb`)

Plan 04-11 logged 5 categories of pre-existing template TS errors to
`deferred-items.md`. Plan 04-12 drained the list:

1. **`index.ts.j2`** — `withSentry` default `Env` generic (`typeof cloudflareEnv`) has no overlap with our hand-rolled `Env` (TS2559); cast through `unknown` so the structural Env-check sees a freshly-typed handler. Switch to `WebStandardStreamableHTTPServerTransport` (CF Workers shape) — the Node `StreamableHTTPServerTransport` expects `IncomingMessage`/`ServerResponse` which don't exist in CF Workers.
2. **`sentry_redact.ts.j2`** — `@sentry/types` is not a direct dep; re-export `ErrorEvent` + `EventHint` from `@sentry/cloudflare` instead. (Beforesend takes `ErrorEvent` not the broader `Event`.)
3. **`server.ts.j2`** — `McpServer.setRequestHandler` doesn't exist on the high-level API; drop the manual `InitializeRequestSchema` registration. `McpServer.connect()` handles initialize internally.
4. **`response_shaping.ts.j2` + `errors.ts.j2`** — drop `readonly` qualifiers on `content[]` (SDK CallToolResultSchema requires mutable); add `[k: string]: unknown` index signature mirror so structural assignment to the SDK callback's return type succeeds; tighten `structuredContent` to `{ [k: string]: unknown }` per SDK schema (not bare `unknown`).
5. **`tool_action.ts.j2` / `tool_list_objects.ts.j2` / `tool_upsert.ts.j2` / `tool_workflow.ts.j2`** — Zod 4 `z.record(value)` requires explicit key schema; switched to `z.record(z.string(), z.unknown())`. Plus `tool_search.ts.j2` adds explicit `route as RoutingEntry` cast for `noUncheckedIndexedAccess` narrowing across async control flow.

Verified: Stripe + GitHub + Notion fixtures compile `tsc --noEmit` clean with **ZERO warnings + ZERO errors** (D-43.5 zero-warning acceptance gate satisfied).

### B. Pipeline orchestrator extended (commit `02a23de`)

`pipeline.py::run_pipeline` chains Pass 5 (Stage D) + Stage E after Pass 4 per CONTEXT D-33 verbatim. The new SSE sequence (canonical 17 events):

```
A:started, A:completed,
B:started+B:completed (×2 for pass_0, pass_1),
C:started+C:completed (×3 for pass_2, pass_3, pass_4),
D:started, D:completed,
E:started, E:completed,
completed:completed (phase=shape_codegen_complete)
```

Phase-3 backward compat: emit `sub_status="author_complete"` on the `pass_4 C:completed` event so legacy Phase-3 CLI consumers grepping the old string keep matching.

`_stable_error_code()` extended with subclass-specific mapping per CONTEXT D-49 + D-51 — `isinstance` checks happen MOST-SPECIFIC FIRST so the umbrella `StageEError` branch never collapses `StageETsError → STAGE_E_FAILED`. Phase 5 F1 retry orchestration keys off these specific codes per Stage F design Appendix A.

| Python exception                  | SSE error code               |
|-----------------------------------|------------------------------|
| `StageAError`                     | `STAGE_A_FAILED`             |
| `Pass0Error`                      | `PASS_0_FAILED`              |
| `Pass1Error`                      | `PASS_1_FAILED`              |
| `Pass2/3/4Error`                  | `STAGE_C_FAILED`             |
| `StageETsError`                   | `STAGE_E_TS_ERROR`           |
| `StageEBundleTooLargeError`       | `STAGE_E_BUNDLE_TOO_LARGE`   |
| bare `StageEError`                | `STAGE_E_FAILED`             |
| `Pass5Error`                      | `PASS_5_FAILED`              |
| any other unhandled exception     | `INTERNAL_ERROR`             |

L1 cache value expanded from 6 to 8 keys per CONTEXT D-34 — adds `pass_5_output` + `stage_e_manifest`. `reconstruct_from_l1()` returns an 8-tuple. The actual generated FILES are NOT cached in L1; the manifest carries per-file `{relative_path, sha256, render_template, render_inputs_hash}` and Stage E re-renders deterministically on every L1 hit.

### C. Cache keys + output endpoint (commit `02a23de`)

`cache/keys.py::l2_key()` extended with `template_version: str = "1"` kwarg per CONTEXT D-35. Default keeps Phase 2/3 callers backward-compatible. Stage E callers pass `STAGE_E_VERSION`; Pass 5 callers pass `"1"` (no Jinja2 templates in Pass 5).

`api/generate.py` gains `GET /api/v1/generate/{job_id}/output/{relative_path:path}` per CONTEXT D-47. Validates `relative_path` against `..`, leading `/`, backslash, and NUL bytes BEFORE touching disk (T-04-12-output-endpoint-traversal mitigation). Re-derives spec_hash via Stage A → looks up L1 entry → confirms `stage_e_manifest` present → finds the file in the manifest → reads from the on-disk Stage E output dir + verifies containment via `Path.resolve().relative_to()` (defense in depth). Returns `text/plain; charset=utf-8` for known text extensions, `application/octet-stream` otherwise.

### D. CLI rewire (commit `9b18b18`)

`apps/cli/src/init/render_stub.ts` **DELETED** per CONTEXT D-37. The Phase-3 hand-rolled stdio MCP server stub is gone; Stage E now emits the canonical ~25-30 file tenant Worker tree directly via the codegen-templates pipeline.

`apps/cli/src/init/write_stage_e_output.ts` (NEW) — pure async function consuming `StageEManifestFile[]` + fetching each file from the engine's new output endpoint + writing via existing `writeOutputFile`. Validates `relative_path` defensively before issuing the fetch. Idempotent across re-runs.

`apps/cli/src/init/index.ts` — replaces `renderServerTs` call site with `writeStageEOutput`; expects `stage_e_manifest` in the artifacts payload (Phase-4 contract). `package.json` + `README.md` are still rendered client-side (renderPackageJson / renderReadme) for the Claude-Desktop snippet UX continuity.

### E. 5 hand-tuned `pass-5-output.json` fixtures (commit `498cce5`)

For each of {stripe, github, notion, linear, slack}, ship a hand-tuned `pass-5-output.json` Pydantic-validated against `Pass5Output`. Stripe + GitHub + Notion derive directly from the existing `final-tools.json` (canonical Tool2 shape from Phase 3). Linear + Slack synthesize from Pass1Output + per-tool-type defaults (truncation thresholds per D-07 verbatim, field-filtering categories per D-09, Description with 5 of 6 paper rubric components — Examples deferred to v1.1 per Pass 2 design).

### F. 5 hand-tuned `stage-e-output/MANIFEST.json` fixtures (commit `7535990`)

Each fixture's `MANIFEST.json` is the byte-stable Stage E reference. Generated by running real `stage_e.run(...)` + capturing the resulting `StageEManifest` after `tsc --noEmit` + `wrangler --dry-run`. Per-fixture status:

| fixture | files | bundle KiB | tsc passed | warnings |
|---------|-------|------------|------------|----------|
| stripe  |  32   |   246.57   |    yes     |    0     |
| github  |  33   |   262.99   |    yes     |    0     |
| notion  |  29   |   246.57   |    yes     |    0     |
| linear  |  32   |   246.57   |    yes     |    0     |
| slack   |  33   |   246.57   |    yes     |    0     |

Stripe + GitHub + Notion gate on `ts_compile_passed=True` AND `warning_count == 0` (D-43.5 zero-warning gate). Linear + Slack gate on `passed=True` only (warning_count merely logged). All 5 fixtures `bundle_size_kb < 950` (D-28 hard ceiling). All 5 fixtures `template_version: "1"`.

### G. 5 new integration tests (commit `ab8d901`)

* `test_pipeline_stage_d_e_errors.py` — 13 tests covering authoritative `_stable_error_code` mapping per CONTEXT D-49 + D-51.
* `test_stage_e_capability_gate.py` — 5 tests covering D-49 Pitfall #4 (MCP `2025-06-18` capability gate; structural template check).
* `test_stage_e_manifest_stability.py` — 2 tests rendering Stage E twice and asserting byte-identical sha256s (D-43 step 4 + D-36 reproducibility contract).
* `test_l1_warm_phase_4.py` — 2 tests extending the Phase-3 GEN-12 + D-36 contract: cold + warm pipeline runs in same process produce ZERO Pass 5 / Stage E invocations on the warm run; Pass5Output + StageEManifest reconstructed from L1 are bit-identical to cold; warm-cache emits exactly 17 SSE events.
* `test_phase_4_e2e.py` — 16 parametrized tests across 5 fixtures (5 Pass-5 structural-equivalence + 3 stage-e structural-equivalence + 3 zero-warning-gate + 2 warning-tolerated-gate + 3 live-render).

All 38 new tests pass + 11 new CLI write_stage_e_output tests pass + 75 integration + API + pipeline tests pass + 179 stage_e tests still pass. mypy + ruff clean across our new files.

## Task Commits

| # | Commit  | Subject                                                                          |
|---|---------|----------------------------------------------------------------------------------|
| 1 | `111d6cb` | `fix(04-12): drain deferred-items.md template TS errors (5 categorized fixes)`   |
| 2 | `02a23de` | `feat(04-12): chain Pass 5 + Stage E in pipeline.py + Phase-4 cache + output endpoint` |
| 3 | `ab8d901` | `test(04-12): scaffold 5 Phase-4 integration tests (38 tests total)`             |
| 4 | `9b18b18` | `feat(04-12): retire render_stub.ts; add write_stage_e_output.ts (CLI Phase 4)`  |
| 5 | `498cce5` | `test(04-12): hand-tune 5 pass-5-output.json fixtures (D-44)`                    |
| 6 | `7535990` | `test(04-12): hand-tune 5 stage-e-output/MANIFEST.json fixtures (D-44)`          |
| 7 | `bf17bf0` | `chore(04-12): ruff auto-fixes + drained deferred-items.md`                      |

## tsc --noEmit Output (Stripe + GitHub + Notion)

For each of the 3 acceptance fixtures, the live Stage E render captured:

```
Stripe   — 32 files, bundle 246.57 KiB, tsc_passed=true, warnings=0
GitHub   — 33 files, bundle 262.99 KiB, tsc_passed=true, warnings=0
Notion   — 29 files, bundle 246.57 KiB, tsc_passed=true, warnings=0
```

D-43.5 zero-warning acceptance gate **SATISFIED** for all 3 acceptance fixtures.

## Files Created/Modified

(See `key-files` block in frontmatter for the canonical list.)

## Decisions Made

(See `key-decisions` block in frontmatter for the canonical list.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Pre-existing template TS errors blocking acceptance gate**
- **Found during:** Task 3 acceptance run (live Stage E render against Stripe fixture).
- **Issue:** Plan 04-11 logged 5 categories of pre-existing template TS errors to `deferred-items.md` and assigned ownership to plan 04-12. Without these fixes, Stripe + GitHub + Notion fixtures fail `tsc --noEmit`, breaking the D-43.5 zero-warning acceptance gate.
- **Fix:** All 5 categories drained — see "Accomplishments §A" above.
- **Files modified:** 11 templates in `packages/codegen-templates/templates/`.
- **Committed in:** `111d6cb`.

**2. [Rule 1 — Bug] NOTE 8 plan-vs-reality SSE event count miscount**
- **Found during:** Task 1 integration test (`test_l1_warm_phase_4.py::test_warm_run_zero_qwen_calls`).
- **Issue:** Plan must_haves said "16 events total" for the L1 fast-path canonical sequence, but A:started + A:completed + B×4 + C×6 + D×2 + E×2 + completed×1 actually sums to 17 events.
- **Fix:** Updated test assertion to `len(warm_events) == 17` with a comment explaining the plan's miscount.
- **Files modified:** `apps/generation-engine/tests/integration/test_l1_warm_phase_4.py`.
- **Committed in:** `ab8d901`.

**3. [Rule 1 — Bug] Phase-3 era tests assume Phase-3 contract**
- **Found during:** Task 1 regression run (after pipeline.py extension landed).
- **Issue:** `test_api_generate.py::test_sse_stream_emits_phase_3_stage_sequence` and `test_pipeline_e2e.py::test_full_pipeline_stripe_author_complete` asserted `phase=author_complete` on the terminal event; Phase 4 D-33 now emits `phase=shape_codegen_complete`. `test_l1_warm_pass_2_3_4.py::test_warm_run_outputs_bit_identical` unpacks a 6-tuple from `reconstruct_from_l1` which is now an 8-tuple.
- **Fix:** Updated assertions to match Phase 4 contract; added Pass 5 + Stage E test stubs to autouse fixtures so SSE-shape tests stay fast (~1s vs 30s tsc subprocess).
- **Files modified:** `apps/generation-engine/tests/test_api_generate.py`, `apps/generation-engine/tests/test_pipeline.py`, `apps/generation-engine/tests/integration/test_pipeline_e2e.py`, `apps/generation-engine/tests/integration/test_l1_warm_pass_2_3_4.py`, `apps/generation-engine/tests/stages/stage_e/test_run_e2e.py`.
- **Committed in:** `02a23de`.

**4. [Rule 1 — Bug] CLI Phase-3 `render_stub` referenced from defunct tests**
- **Found during:** Task 2 CLI rewire (`render_stub.ts` deleted).
- **Issue:** `apps/cli/tests/init.test.ts` and `apps/cli/tests/inspector.e2e.test.ts` still imported `renderServerTs` from the deleted file.
- **Fix:** Removed the `render_stub` describe block from `init.test.ts`; replaced `inspector.e2e.test.ts` with a `test.skip` stub citing the Phase 4 retirement.
- **Files modified:** `apps/cli/tests/init.test.ts`, `apps/cli/tests/inspector.e2e.test.ts`.
- **Committed in:** `9b18b18`.

### Out-of-Scope (Deferred)

None. Plan 04-12 fully drained Plan 04-11's `deferred-items.md` log.

## Self-Check: PASSED

All declared `key-files` exist on disk:
- `apps/generation-engine/src/mcpgen_engine/pipeline.py` ✓
- `apps/generation-engine/src/mcpgen_engine/cache/keys.py` ✓
- `apps/generation-engine/src/mcpgen_engine/api/generate.py` ✓
- `apps/cli/src/init/write_stage_e_output.ts` ✓
- `apps/cli/tests/test_write_stage_e_output.test.ts` ✓
- 5 × `packages/engine-fixtures/<name>/pass-5-output.json` ✓
- 5 × `packages/engine-fixtures/<name>/stage-e-output/MANIFEST.json` ✓
- 5 × new integration test files ✓
- `apps/cli/src/init/render_stub.ts` is **GONE** ✓

All 7 task commits present in `git log`:
- `111d6cb` (template TS fixes) ✓
- `02a23de` (pipeline.py + cache + output endpoint) ✓
- `ab8d901` (5 integration tests) ✓
- `9b18b18` (CLI rewire) ✓
- `498cce5` (5 pass-5-output.json fixtures) ✓
- `7535990` (5 stage-e MANIFEST.json fixtures) ✓
- `bf17bf0` (ruff auto-fixes + drained log header) ✓

Wave-0 test runs all green:
- 11 CLI `test_write_stage_e_output.test.ts` tests pass.
- 13 `test_pipeline_stage_d_e_errors.py` tests pass.
- 5 `test_stage_e_capability_gate.py` tests pass.
- 2 `test_stage_e_manifest_stability.py` tests pass.
- 2 `test_l1_warm_phase_4.py` tests pass.
- 16 `test_phase_4_e2e.py` parametrized tests pass.
- 5 `test_pipeline.py` tests pass; 9 `test_api_generate.py` tests pass; 23 integration tests pass; 179 stage_e tests pass.
- All 42 CLI tests pass (9 skip).
- mypy + ruff clean across our new files.

## Next Phase Readiness

Plan 04-13 (manual MCP Inspector verification gate) consumes:
- `stages/stage_e.run(...)` rendered output, accessible via the new
  `GET /api/v1/generate/{job_id}/output/{relative_path}` endpoint.
- 5 hand-tuned `MANIFEST.json` fixtures for byte-stable comparisons.
- Subclass-specific SSE error codes for retry orchestration in Phase 5.

Phase 5 (F1/F2/F3 + retry orchestration) consumes:
- `_stable_error_code` mapping table (per-subclass codes for targeted
  Pass 1/3/5 retries per Stage F design Appendix A).
- 5-fixture acceptance suite as the Phase 5 baseline (pre-Stage F).

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Plan: 12*
*Completed: 2026-04-29*
