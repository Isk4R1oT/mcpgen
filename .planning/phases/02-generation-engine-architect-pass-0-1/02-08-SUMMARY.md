---
phase: 02-generation-engine-architect-pass-0-1
plan: 08
subsystem: engine
tags: [cache, l1, l2, l3, filesystem, sharded, atomic-writes, gzip, sha256, engine-version, ttl, pipeline, orchestrator, sse, fastapi, streaming-response, last-event-id, idempotency-key, ulid, hand-rolled-sse, gen-12, d-37, d-38, d-39, d-40, d-41, d-47, d-48, d-52, d-53]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "FROZEN IR (`mcpgen_ir.types.RawIR/Pass0Output/Pass1Output`); FROZEN Phase-1 contracts (`packages/contracts/src/generation-api.ts` SSE envelope + `packages/contracts/src/idempotency.ts` GEN_ID_REGEX); pyproject pinning of fastapi + pydantic + httpx + structlog."
  - plan: 02-02
    provides: "`mcpgen_engine.stages.stage_a.run(spec_url, spec_content) -> RawIR` with deterministic `RawIR.spec_hash` (sha256 over canonical-sorted resolved JSON) — the L1 cache key input."
  - plan: 02-06
    provides: "`mcpgen_engine.passes.pass_0.run(raw_ir, options) -> Pass0Output` and `pass_0.filter.UserOptions` — consumed by the orchestrator."
  - plan: 02-07
    provides: "`mcpgen_engine.passes.pass_1.run(pass_0_output, raw_ir, spec_title, options) -> Pass1Output` — consumed by the orchestrator."

provides:
  - "`apps/generation-engine/src/mcpgen_engine/cache/__init__.py` — facade re-exporting `_engine_version`, `_canonical_json_sha256`, `l1_key`, `l2_key`, `l3_key`, `get_l1`/`set_l1`/`clear_l1`, `get_l2`/`set_l2`/`clear_l2`, `get_l3`/`set_l3`/`clear_l3`."
  - "`apps/generation-engine/src/mcpgen_engine/cache/keys.py` — pure-function key construction. `_engine_version()` reads `pyproject.toml` `[project] version` via `importlib.metadata.version('mcpgen-generation-engine')`. `l1_key(spec_hash)` / `l2_key(pass_name, pass_version, pass_input, sampling_profile_label)` / `l3_key(tool_name, tool_subset, pass_version)` — every key is a sha256 hex digest over an engine-version-prefixed canonical string. `_canonical_json_sha256(value)` = `sha256(json.dumps(value, sort_keys=True, separators=(',',':')))`."
  - "`apps/generation-engine/src/mcpgen_engine/cache/l1.py` — filesystem L1 cache. Sharded layout `<root>/l1/<key[:2]>/<key[2:]>.json.gz`. `get_l1` honours 30-day mtime TTL (D-40); stale entries unlinked on read. `set_l1` writes via `tempfile.NamedTemporaryFile(dir=parent) + Path.replace(target)` (POSIX atomic rename), then `chmod 0o600`. `_chmod_ancestors_within_cache` walks every ancestor up to the cache root and tightens to `0o700` (T-2-08-01 fix in commit f120b21). `clear_layer()` returns count of files deleted (used by tests + Phase 6+ `mcpgen cache clear`)."
  - "`apps/generation-engine/src/mcpgen_engine/cache/l2.py` — mirror of l1.py with `CACHE_LAYER_NAME='l2'`. Per-pass output keyed by sampling-profile-label-aware key. KISS-duplicated rather than abstracted (CLAUDE.md \"wait for the third duplication\" — see Phase-6 R2 backend for the refactor opportunity)."
  - "`apps/generation-engine/src/mcpgen_engine/cache/l3.py` — same shape; Phase-2 ships infra-only (Phase 3+ partial regeneration consumer)."
  - "`apps/generation-engine/src/mcpgen_engine/pipeline.py` — orchestrator. `async def run_pipeline(*, spec_url, spec_content, options, job_id) -> AsyncIterator[GenerationSseEvent]` chains Stage A → Pass 0 → Pass 1 with L1 fast-path. On cache hit (after Stage A computes spec_hash) emits 2 events (`A:completed` with `cache='l1_hit'` + `completed:completed`) and returns without firing any LLM calls. On cache miss persists `{raw_ir, pass_0_output, pass_1_output}` to L1 with `model_dump(by_alias=True)` for lossless round-trip. `GenerationSseEvent` Pydantic class mirrors the FROZEN Phase-1 Zod envelope. `reconstruct_from_l1(cached)` round-trips the cached payload back to typed IR objects."
  - "`apps/generation-engine/src/mcpgen_engine/api/__init__.py` — empty package marker."
  - "`apps/generation-engine/src/mcpgen_engine/api/generate.py` — FastAPI router. `POST /api/v1/generate` validates `Idempotency-Key` against `GEN_ID_REGEX` (D-48 — missing OR malformed → 400; no fallback), buffers job parameters in an in-process `_JOB_TABLE` dict, returns `202 + {job_id, sse_url}`. `GET /api/v1/generate/{job_id}/stream` returns `StreamingResponse` with hand-rolled SSE wire format `id:\\nevent:\\ndata:\\n\\n` per Phase-1 D-09. `Last-Event-ID` header drops events lexicographically below the cutoff (ULIDs are monotonic). `_build_user_options` rejects invalid `target_complexity` and out-of-range `max_tools_override` with 400 before any pipeline work."
  - "`apps/generation-engine/src/mcpgen_engine/main.py` — extended `create_app()` adds `app.include_router(generate_api.router)` after the existing `/health` handler."
  - "`apps/generation-engine/src/mcpgen_engine/settings.py` — extended with `mcpgen_cache_dir: str = '.cache/mcpgen'` pydantic-settings field + `get_settings()` `@lru_cache(maxsize=1)` factory. Tests call `get_settings.cache_clear()` after `monkeypatch.setenv` to pick up the env override."
  - "`.gitignore` — appended `.cache/mcpgen/` so on-disk cache content (which DOES contain spec text per D-39) never reaches git history."
  - "`apps/generation-engine/tests/test_cache_l1_l2.py` — 14 tests covering T-2-D2 (key composition + engine_version invalidation), T-2-D3 (atomic writes under concurrent `asyncio.gather` of 20 writers), L1 round-trip, 0o600 file perms verification, 30-day TTL eviction, `clear_layer` correctness, L2 mirror shape, and the canonical-JSON sha256 helper."
  - "`apps/generation-engine/tests/test_pipeline.py` — 5 tests: D-47 SSE sequence end-to-end (A:started → A:completed → B:started ×2 → B:completed ×2 → completed:completed), GEN-12 / T-2-D1 second-run zero LLM calls, L1 lossless round-trip, Stage A error → `failed:error` with `STAGE_A_FAILED` code, INVALID_INPUT propagation when both `spec_url` and `spec_content` are set."
  - "`apps/generation-engine/tests/test_api_generate.py` — 9 tests: 202 response shape, malformed/missing Idempotency-Key → 400, missing/both spec inputs → 400, invalid `target_complexity` → 400, unknown job → 404 on `/stream`, full SSE stage-sequence assertion, wire-format compliance (id/event/data + 26-char ULID id), Last-Event-ID resume."

affects:
  - "Plan 02-09 (CLI): the CLI POSTs to `/api/v1/generate` with a generated `gen_<ULID>` Idempotency-Key, then opens the SSE URL — D-42 / D-43 / D-44 directly consume this plan's HTTP surface. The CLI's `eventsource-parser` consumer matches the wire format exactly."
  - "Phase 3 (Pass 2/3/4 description authoring): when Phase 3 lands, the L2 cache becomes the per-pass output key (each pass gets its own cache slot) and the L1 invalidation strategy widens — currently L1 caches the architect-stage output (Pass 0 + Pass 1); Phase 3 will need to either invalidate L1 on description changes or add a separate L1.5 layer. Decision deferred to Plan 03-01."
  - "Phase 6 (BFF + dispatch worker): the `_JOB_TABLE` in-process buffer migrates to Postgres `generations` table (Phase-1 D-08 schema). The frozen Phase-1 contract means the wire shape will not change."
  - "Phase 6 R2 backend: `cache.l1.py` / `l2.py` / `l3.py` are intentionally duplicated rather than abstracted into a base class — this is the KISS escape hatch \"wait for the third duplication\". When Phase 6 introduces an R2 cache backend the duplication motivates a `BaseCacheLayer` Protocol that both filesystem and R2 adapters implement."

# Tech tracking
tech-stack:
  added:
    - "`python-ulid==3.1.0` (engine deps) — minted per-event SSE event_ids. The CLI still owns `gen_<ULID>` Idempotency-Key generation per D-48; the engine library is only used for SSE event_id minting (one ULID per emitted event)."
  patterns:
    - "**Cache key composition (D-37 / D-40):** every key is `sha256('<layer>:<engine_version>:<discriminators>'.encode('utf-8')).hexdigest()`. Engine version is read once from installed-package metadata (`importlib.metadata.version('mcpgen-generation-engine')`) — `pyproject.toml` `[project] version = '0.0.0'` becomes the embedded value. Bumping the version invalidates ALL entries by changing every key — old entries become unreachable rather than explicitly deleted, and 30-day filesystem mtime TTL reaps them within a month."
    - "**Sharded filesystem layout (D-39):** `<root>/<layer>/<key[:2]>/<key[2:]>.json.gz`. The first 2 hex chars of the sha256 key shard the directory tree so each parent directory holds at most ~256 entries — uniform sharding by sha256-prefix prevents ext4 dir_index slowdown on large caches."
    - "**Atomic write protocol:** `tempfile.NamedTemporaryFile(dir=parent, delete=False)` creates a unique adjacent path; we close it (the empty file is overwritten by `gzip.open(tmp_path, 'wt')`); `tmp_path.replace(p)` is atomic on POSIX (`rename(2)`); finally `p.chmod(0o600)` because `Path.replace` loses the tempfile mode bits on some filesystems. The walk in `_chmod_ancestors_within_cache` then tightens every ancestor up to the cache root to 0o700 — `Path.mkdir(parents=True, mode=...)` only enforces the mode on the LEAF, intermediate ancestors inherit umask."
    - "**Defense-in-depth invalidation via L2 sampling_profile_label (D-04 / Pitfall #2):** L2 keys embed `'PASS_0_SETTINGS'` / `'PASS_1_SETTINGS'` (the string label, not the full `ModelSettings` dict). Any change to `mcpgen_engine.llm.sampling.PASS_*_SETTINGS` (extra_body provider routing pin, temperature, max_tokens) requires bumping the label, which invalidates all L2 entries — protects against silent OpenRouter quantization drift returning to a stale cache."
    - "**Pydantic round-trip with `model_dump(by_alias=True)`:** the FROZEN IR `SecuritySchemes.in_` field is `Field(..., alias='in')`. Pydantic uses the alias on validation (input) but the field name on serialization (output) by default. Without `by_alias=True`, the L1 stores `{'in_': None}`; on second-run reload `model_validate({'in_': None})` fails because the alias `'in'` is required. `by_alias=True` round-trips losslessly. Caught by `test_pipeline_persists_full_architect_output_to_l1` on first wrong attempt."
    - "**Hand-rolled SSE wire format (Phase-1 D-09):** `id: <26-char ULID>\\nevent: <stage>\\ndata: <model_dump_json()>\\n\\n` per event. Generator yields `bytes` directly (no `sse-starlette` dependency). `Cache-Control: no-cache` and `X-Accel-Buffering: no` headers prevent nginx / CDN buffering. Verified end-to-end byte sample below."
    - "**Last-Event-ID resume via lex compare:** ULIDs are lexicographically monotonic over time (Crockford base32 + millisecond timestamp prefix). String compare `event.event_id <= last_event_id` is a safe \"already delivered\" predicate — no parsing required. Phase 6+ persists events to the Postgres `pending_callbacks` table for cross-process resume; Phase 2 only supports same-process resume (`_JOB_TABLE`)."
    - "**Stable error code mapping for SSE failures:** `_stable_error_code(exc)` maps known engine errors to one of `STAGE_A_FAILED` / `PASS_0_FAILED` / `PASS_1_FAILED` / `INTERNAL_ERROR`. The `error.message` carries the human-readable error text (often containing the stage-specific subcode like `MULTI_SERVER_SPLIT_REQUIRED`); the wire `error.code` stays stage-stable so the CLI / frontend can route on it without parsing free text. `INTERNAL_ERROR` is reserved for unexpected exceptions and re-raised after the SSE event so Sentry captures the stack trace."
    - "**In-process job table:** `_JOB_TABLE: dict[str, dict[str, Any]]` buffers `{spec_url, spec_content, options}` per `job_id` between the `POST /api/v1/generate` accept and the `GET /stream` consume. Phase 6+ swaps to the Postgres `generations` table (D-08). Tests reset via `_reset_job_table()` for isolation."

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/cache/__init__.py — 32 lines. Facade."
    - "apps/generation-engine/src/mcpgen_engine/cache/keys.py — 95 lines. L1/L2/L3 key construction + `_engine_version` + `_canonical_json_sha256`."
    - "apps/generation-engine/src/mcpgen_engine/cache/l1.py — 132 lines. Filesystem L1 with atomic writes + 0700/0600 perms + 30-day TTL + ancestor chmod walk."
    - "apps/generation-engine/src/mcpgen_engine/cache/l2.py — 90 lines. Filesystem L2 mirror of l1."
    - "apps/generation-engine/src/mcpgen_engine/cache/l3.py — 90 lines. Filesystem L3 mirror; shipped infra-only for Phase 3+."
    - "apps/generation-engine/src/mcpgen_engine/pipeline.py — 290 lines. Stage A → Pass 0 → Pass 1 orchestrator + `GenerationSseEvent` Pydantic envelope + L1 fast-path + stable-error-code mapping + `reconstruct_from_l1` helper."
    - "apps/generation-engine/src/mcpgen_engine/api/__init__.py — 1 line. Package marker."
    - "apps/generation-engine/src/mcpgen_engine/api/generate.py — 230 lines. POST /api/v1/generate + GET /api/v1/generate/{job_id}/stream + SSE generator + `Idempotency-Key` validation + `_reset_job_table` test helper."
    - ".planning/phases/02-generation-engine-architect-pass-0-1/02-08-SUMMARY.md — this file."
  modified:
    - "apps/generation-engine/src/mcpgen_engine/main.py — added `from .api import generate as generate_api` import and `app.include_router(generate_api.router)` inside `create_app()`."
    - "apps/generation-engine/src/mcpgen_engine/settings.py — added `mcpgen_cache_dir: str = '.cache/mcpgen'` field + `get_settings()` `@lru_cache(maxsize=1)` factory."
    - "apps/generation-engine/pyproject.toml — added `python-ulid>=3.1.0` to `[project] dependencies`; extended `[tool.ruff.lint.per-file-ignores]` for tests with `S106` + `SLF001` (S106 false-positive on `pass_name='pass_0'` kwargs; SLF001 OK in tests inspecting on-disk cache layout)."
    - "apps/generation-engine/uv.lock — `python-ulid==3.1.0` resolution."
    - "apps/generation-engine/tests/test_cache_l1_l2.py — replaced 4 Wave-0 stub skips with 14 active tests."
    - "apps/generation-engine/tests/test_pipeline.py — replaced 3 Wave-0 stub skips with 5 active tests."
    - "apps/generation-engine/tests/test_api_generate.py — replaced 3 Wave-0 stub skips with 9 active tests."
    - ".gitignore — appended `.cache/mcpgen/` per D-39."

key-decisions:
  - "**`get_settings()` `@lru_cache(maxsize=1)` factory introduced.** The original Phase-1 `settings.py` instantiated `EngineSettings()` only when called directly. Plan 02-08 needs a process-wide cached singleton so the cache modules can read `mcpgen_cache_dir` without re-reading env on every `get_l1`/`set_l1` call. Tests call `get_settings.cache_clear()` after `monkeypatch.setenv` to pick up the env override (autouse fixture in every cache-touching test file). The `# type: ignore[call-arg]` on the constructor is the documented escape hatch — pydantic-settings populates required fields from env, mypy doesn't model that."
  - "**KISS-duplicated `cache/l1.py` / `l2.py` / `l3.py` rather than abstracting via a base class.** The three modules differ only in `CACHE_LAYER_NAME`. CLAUDE.md says \"wait for the third duplication\" — we have the third here, but a base class would obscure rather than clarify (the bodies are 50 lines each). When Phase 6 introduces an R2 backend, that's the natural moment to refactor: a `BaseCacheLayer` Protocol that both filesystem and R2 adapters implement. Documented in `cache/__init__.py` docstring + every layer docstring."
  - "**`model_dump(by_alias=True)` on the L1 store path.** The FROZEN IR `SecuritySchemes.in_` field uses `Field(..., alias='in')`. Without `by_alias=True`, second-run reload fails on `model_validate` because the alias `'in'` is required. Caught when `test_pipeline_persists_full_architect_output_to_l1` first ran — fixed inline (Rule 1 — bug)."
  - "**`_chmod_ancestors_within_cache` walk added in commit f120b21 (Rule 2 — security).** `Path.mkdir(parents=True, mode=0o700)` only enforces the mode on the LEAF directory. The cache root and per-layer subdir were inheriting the process umask (0o755 on macOS / Linux defaults), exposing metadata to other local users on multi-user dev machines. Tightened to 0o700 on every `set_l*` call. Best-effort (`OSError` swallowed) since perms on a directory we don't own (e.g. shared `/tmp` on CI) aren't our invariant. Verified end-to-end: every cache directory + the leaf file now report 0o700 / 0o600 respectively."
  - "**Hand-rolled SSE generator vs `sse-starlette`.** Per RESEARCH §\"Phase 2 SSE FastAPI handler\" the hand-rolled approach is ~30 lines and matches the FROZEN Phase-1 contract one-to-one. `sse-starlette`'s `EventSourceResponse` adds convenience but also a dependency surface that could drift from the contract. Hand-rolled wins on simplicity + frozen-contract fidelity; the entire generator is 12 lines."
  - "**`_JOB_TABLE` in-process buffer for Phase 2.** D-08 (Phase-1) reserves the Postgres `generations` table for Phase 6+; Phase 2 buffers job parameters in a process-local dict between `POST /api/v1/generate` accept and `GET /stream` consume. The `_reset_job_table` helper is exposed for test isolation (each test gets a fresh table via `monkeypatch` autouse fixture). When Phase 6 lands the swap is a 5-line diff in `api/generate.py`."
  - "**Stable error codes are stage-stable, not subcode-stable.** `STAGE_A_FAILED` covers all StageAError subcodes (`SPEC_TOO_LARGE`, `UNSUPPORTED_SPEC_FORMAT`, `CIRCULAR_REF`, `INVALID_INPUT`, `REMOTE_FETCH_FAILED`); `PASS_0_FAILED` covers all Pass0Error subcodes (`MULTI_SERVER_SPLIT_REQUIRED`, `LLM_VALIDATION_FAILED`, `LLM_TRANSIENT_FAILED`, `SPEC_TOO_LARGE_ENDPOINTS`); `PASS_1_FAILED` covers all Pass1Error subcodes. The CLI / frontend route on the stage code; the stage-specific subcode lives in `error.message`. This keeps the SSE wire surface narrow without losing diagnostic detail."
  - "**`reconstruct_from_l1(cached) -> tuple[RawIR, Pass0Output, Pass1Output]` helper.** Phase-2 pipeline doesn't itself need this path (the L1 fast-path emits SSE events without re-validating into typed IR), but Phase 4 codegen + tests do. Lives in `pipeline.py` next to the `set_l1` payload shape so the two stay in sync — the dict shape `{'raw_ir', 'pass_0_output', 'pass_1_output'}` is the contract."

patterns-established:
  - "**Sharded filesystem cache + atomic tempfile-rename + ancestor chmod walk** — applied uniformly across L1/L2/L3 (KISS-duplicated). The pattern is the canonical \"local filesystem cache with multi-user safety\" template for Phase 6+ when an R2 backend lands."
  - "**`get_settings.cache_clear()` after `monkeypatch.setenv`** — every test file that mutates `MCPGEN_CACHE_DIR` (or any other env) defines an autouse fixture that calls this. Documented in cache test docstrings; carries forward to Phase 3+ tests that touch settings."
  - "**Stage-stable SSE error codes + subcode-in-message** — every future Stage (B/C/D/E/F1/F2/F3) will follow the same pattern: stage-stable wire code, subcode-rich message. The CLI-facing routing surface stays narrow (10 codes total across the full pipeline) while the diagnostic surface stays rich."

# Metrics
metrics:
  duration: "~2.5 hours wall-clock (2 tasks + 1 deviation fix)"
  completed_date: "2026-04-28"
  tests_added: 28
  files_created: 8
  files_modified: 7
  commits: 4
  loc_added: ~1300

---

# Phase 2 Plan 08: Cache infrastructure + pipeline orchestrator + SSE endpoint Summary

**One-liner:** Filesystem L1/L2/L3 cache with engine_version invalidation + Stage A → Pass 0 → Pass 1 orchestrator emitting Phase-1-frozen SSE events from POST `/api/v1/generate`, locking in the GEN-12 zero-LLM second-run invariant.

---

## What landed

Plan 02-08 wires three previously-isolated modules into a callable HTTP API:

1. **Cache layer** — five new modules under `apps/generation-engine/src/mcpgen_engine/cache/` (`keys.py`, `l1.py`, `l2.py`, `l3.py`, `__init__.py`). Sharded filesystem layout `<root>/<layer>/<key[:2]>/<key[2:]>.json.gz` with atomic tempfile-rename writes, 0700 directory + 0600 file perms, 30-day mtime TTL. L1 keys are `sha256('l1:<engine_version>:<spec_hash>')`; L2 keys add pass_name + pass_version + sampling_profile_label + sha256(canonical input); L3 ships infra-only for Phase 3+ partial regeneration.
2. **Pipeline orchestrator** — `apps/generation-engine/src/mcpgen_engine/pipeline.py`. Single async-generator chains Stage A → Pass 0 → Pass 1 with an L1 fast-path keyed by `RawIR.spec_hash`. On cache hit the entire architect output is served from disk; on miss the pipeline persists `{raw_ir, pass_0_output, pass_1_output}` to L1 with `model_dump(by_alias=True)` for lossless round-trip. Emits `GenerationSseEvent` instances mirroring the frozen Phase-1 Zod envelope.
3. **HTTP API** — `apps/generation-engine/src/mcpgen_engine/api/generate.py`. `POST /api/v1/generate` validates `Idempotency-Key` against `GEN_ID_REGEX` (D-48) and returns `202 + {job_id, sse_url}`. `GET /api/v1/generate/{job_id}/stream` returns `StreamingResponse` with hand-rolled SSE wire format `id:\nevent:\ndata:\n\n` per Phase-1 D-09. `Last-Event-ID` resume drops events lexicographically below the cutoff (ULIDs are monotonic).
4. **Settings + .gitignore** — `MCPGEN_CACHE_DIR` (default `.cache/mcpgen`) added to `EngineSettings`; `.gitignore` ignores the cache root.

## GEN-12 invariant proven

`tests/test_pipeline.py::test_second_run_zero_llm_calls`:

- First run on a synthetic 3-endpoint OpenAPI spec: `pytest-httpx` records ≥2 OpenRouter calls (Pass 0 + Pass 1).
- Second run on the same spec: 0 additional OpenRouter calls. Final SSE event carries `partial_result.cache='l1_hit'`.
- Mock fails closed — any unregistered LLM call would raise `pytest_httpx.IncompatibleResponses`.

The L1 store contains the full architect output. Cache key sample for the first run (synthetic spec, engine_version `0.0.0`):

```
engine_version: 0.0.0
L1 key: c3be0c176e349110...  (sha256 prefix)
L2 key: b7374394c97c675a...  (pass_0 + PASS_0_SETTINGS + canonical input hash)
L3 key: 56c7e5dde3320a4e...  (search + tool_subset + pass_version=1)
```

## SSE wire format byte sample (proves D-09 contract compliance)

Captured from `run_pipeline` failed path (raw bytes):

```
'id: 01KQ85H6WD7H4FN7936C5TYRWM\n'
'event: A\n'
'data: {"job_id":"gen_01HZW3J6V7XAEMP9N0DZTA8FB1","event_id":"01KQ85H6WD7H4FN7936C5TYRWM","stage":"A","status":"started","partial_result":null,"error":null}\n'
'\n'
```

`event_id` is a 26-char Crockford ULID; `data` payload validates against the FROZEN Phase-1 `GenerationSseEvent` Zod schema (verified field-set: `{job_id, event_id, stage, status, partial_result, error}`).

## SSE event sequence per pipeline run (D-47)

Cold path (cache miss):

| # | stage | status | partial_result |
|---|-------|--------|----------------|
| 1 | A | started | null |
| 2 | A | completed | `{endpoint_count: "3"}` |
| 3 | B | started | `{phase: "pass_0"}` |
| 4 | B | completed | `{phase: "pass_0", tool_plan_count: "3", dropped_count: "0"}` |
| 5 | B | started | `{phase: "pass_1"}` |
| 6 | B | completed | `{phase: "pass_1", final_tool_count: "6", coverage_pct: "100.0"}` |
| 7 | completed | completed | `{phase: "architect_complete"}` |

Warm path (L1 hit): only events 2 + 7, both carrying `cache: "l1_hit"`. Total 2 events instead of 7 → quick visual signal in the CLI's progress display.

## Cache file perms verification (D-39 / T-2-08-01)

After `set_l1(l1_key('a' * 64), {'demo': True})` against `/tmp/mcpgen-perm-demo2`:

```
0o700 (dir) /tmp/mcpgen-perm-demo2
0o700 (dir) /tmp/mcpgen-perm-demo2/l1
0o700 (dir) /tmp/mcpgen-perm-demo2/l1/4f
0o600 (file) /tmp/mcpgen-perm-demo2/l1/4f/c352a358b98008521a993f209b48c870672eb8f1d73a1a85320da471c68ef4.json.gz
```

All ancestors honour 0o700; the leaf file honours 0o600. `test_l1_file_has_0600_perms` asserts the file mode bits programmatically.

## Live engine smoke test

`uv run uvicorn mcpgen_engine.main:app --port 8765`:

- `GET /health` → `{"status":"ok"}`
- `POST /api/v1/generate` with valid Idempotency-Key → `202 + {"job_id":"gen_01HZW3J6V7XAEMP9N0DZTA8FB1","sse_url":"/api/v1/generate/gen_01HZW3J6V7XAEMP9N0DZTA8FB1/stream"}`
- `POST /api/v1/generate` with bad Idempotency-Key → `400 Bad Request`

Engine logs are structured (structlog) — only structural fields (`job_id`, `has_spec_url`, `has_spec_content`); no spec content reaches stdout (D-52).

## Threat coverage (per plan threat register)

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-2-08-01 (Information Disclosure — cache files) | 0700 dirs (full ancestor walk) + 0600 file + `.gitignore`d cache root | ✅ verified end-to-end |
| T-2-08-02 (Cache poisoning) | sha256 over canonical-sorted JSON; engine_version embedded in every key — version bump invalidates poisoned entries | ✅ test_engine_version_invalidation |
| T-2-08-03 (DoS) | spec body 10MB cap (Stage A); `httpx.AsyncClient(timeout=30)` for spec URL fetch (Stage A) | ✅ inherited from Plan 02-02 |
| T-2-08-04 (Spoofing — Idempotency-Key) | `GEN_ID_REGEX` enforced server-side; missing OR malformed → 400 | ✅ test_post_generate_rejects_{invalid,missing}_idempotency_key |
| T-2-08-05 (Repudiation — replayed cached output) | accept (Phase 6 adds cache-write integrity hash + audit log) | accepted per plan |
| T-2-08-06 (Information Disclosure — logging) | structlog structural fields only; spec content never logged | ✅ verified by inspection of engine stdout under live smoke test |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `model_dump(by_alias=True)` on L1 store path**
- **Found during:** Task 2 — running `test_pipeline_persists_full_architect_output_to_l1`.
- **Issue:** First-attempt code used `raw_ir.model_dump(mode="json")` which serialises `SecuritySchemes.in_` as `'in_'` (the field name). On second-run reload, `RawIR.model_validate({'in_': ...})` failed because the FROZEN IR uses `Field(..., alias='in')` and pydantic uses the alias on validation. GEN-12 second-run cache hit was broken.
- **Fix:** Switched all three `model_dump` calls to `by_alias=True` so the on-disk payload uses `'in'` and round-trips losslessly through `model_validate`.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/pipeline.py`.
- **Commit:** `e9c74d7` (folded into Task 2 commit since the test was caught before commit).

**2. [Rule 2 — Security] `_chmod_ancestors_within_cache` walk added**
- **Found during:** Manual verification of D-39 perms after Task 2 — found cache root + per-layer subdir at default 0o755 instead of 0o700. `Path.mkdir(parents=True, mode=0o700)` only sets mode on the LEAF; intermediate ancestors inherit umask.
- **Issue:** On multi-user dev machines (or shared CI runners) other local users could `ls` the cache directory and discover spec hashes — leaking spec metadata and partial trust signals (T-2-08-01).
- **Fix:** Added `_chmod_ancestors_within_cache(leaf)` helper to L1/L2/L3 that walks every ancestor up to the cache root and tightens to 0o700, called from every `set_l*`. Best-effort (`OSError`/`PermissionError` swallowed) since perms on a directory we don't own are not our invariant.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/cache/{l1,l2,l3}.py`.
- **Commit:** `f120b21`.

### Test refactor

**3. [Rule 3 — Tooling] `test_atomic_writes_survive_concurrent_access` converted to async**
- **Found during:** Verbose isolated-test run after Task 2 commit.
- **Issue:** `asyncio.run()` inside a sync test conflicted with `pytest-asyncio` `asyncio_mode = "auto"` when an adjacent async test had already created a session-scoped event loop. Surfaced as a `ResourceWarning: unclosed event loop` escalated to error under `filterwarnings = ["error"]`. The test still passed in isolation when run alongside other cache tests because pytest-asyncio created the loop at session entry; running with explicit `-v` after another async test exposed the race.
- **Fix:** Converted to `async def test_...` so pytest-asyncio drives the event loop. Coverage identical (T-2-D3 still asserted: 20 concurrent writers via `asyncio.gather` against a shared key, gzip readable on disk).
- **Files modified:** `apps/generation-engine/tests/test_cache_l1_l2.py`.
- **Commit:** `ca84683`.

### Dep added

**4. [Rule 3 — Missing dep] `python-ulid==3.1.0` added to engine deps**
- **Found during:** Task 2 — `pipeline.py` needs to mint per-event SSE event_ids (Crockford ULIDs, lexicographically monotonic).
- **Action:** `uv add python-ulid` in `apps/generation-engine/`. The CLI still owns `gen_<ULID>` Idempotency-Key generation per D-48; the engine library is only used for SSE event_id minting.
- **Files modified:** `apps/generation-engine/pyproject.toml`, `apps/generation-engine/uv.lock`.
- **Commit:** `e9c74d7` (folded into Task 2 commit).

## Verification

```bash
# Per-task fast suite (matches plan VALIDATION row sampling rate)
cd apps/generation-engine && uv run pytest tests/test_cache_l1_l2.py tests/test_pipeline.py tests/test_api_generate.py -v
# 28 passed in 2.08s

# Critical GEN-12 invariant (T-2-D1 / D-41)
uv run pytest tests/test_pipeline.py::test_second_run_zero_llm_calls -v
# PASSED — second run made 0 LLM calls; final event partial_result.cache=='l1_hit'

# Engine version invalidation (T-2-D2 / D-40)
uv run pytest tests/test_cache_l1_l2.py::test_engine_version_invalidation -v
# PASSED — bumping `version()` to 0.0.1 changes the L1 key; old entry stranded

# Atomic writes under concurrent load (T-2-D3)
uv run pytest tests/test_cache_l1_l2.py::test_atomic_writes_survive_concurrent_access -v
# PASSED — 20 writers via asyncio.gather, gzip readable on disk, no torn write

# Strict-mypy on every new module
uv run mypy --strict src/mcpgen_engine/  # Success: no issues found in 32 source files

# Ruff strict
uv run ruff check src/mcpgen_engine/cache/ src/mcpgen_engine/pipeline.py src/mcpgen_engine/api/  # All checks passed!

# .gitignore includes cache root
grep -F ".cache/mcpgen" .gitignore  # → ".cache/mcpgen/"

# L4 (Anthropic prompt caching) NOT in codebase per D-38
grep -r "anthropic\|prompt_cache" src/mcpgen_engine/cache/ || echo "no L4 references"
# (no matches — D-38 honoured)
```

## Self-Check: PASSED

- [x] `apps/generation-engine/src/mcpgen_engine/cache/__init__.py` exists (32 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/cache/keys.py` exists (95 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/cache/l1.py` exists (132 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/cache/l2.py` exists (90 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/cache/l3.py` exists (90 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/pipeline.py` exists (290 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/api/__init__.py` exists
- [x] `apps/generation-engine/src/mcpgen_engine/api/generate.py` exists (230 lines)
- [x] `apps/generation-engine/src/mcpgen_engine/main.py` includes the generate router (`grep -F 'app.include_router(generate' src/mcpgen_engine/main.py` → match)
- [x] `apps/generation-engine/src/mcpgen_engine/settings.py` exposes `mcpgen_cache_dir` + `get_settings()`
- [x] `.gitignore` ignores `.cache/mcpgen/`
- [x] All 28 tests green; mypy --strict clean (32 source files); ruff clean
- [x] Commits exist on branch:
  - `4d18a42` feat(engine): add filesystem L1/L2/L3 cache with engine_version invalidation
  - `e9c74d7` feat(engine): add pipeline orchestrator + POST /api/v1/generate SSE endpoint
  - `ca84683` test(engine): convert atomic-write cache test to async
  - `f120b21` fix(engine): tighten ancestor cache directory perms to 0700
- [x] Live engine smoke test (uvicorn on port 8765): /health, /api/v1/generate, malformed Idempotency-Key all produce expected responses
