---
phase: 2
slug: generation-engine-architect-pass-0-1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Authored from `02-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (engine)** | `pytest 8.x` + `pytest-asyncio 0.24` + `pytest-httpx 0.32` (already installed Phase 1) |
| **Framework (CLI)** | `bun test` (built into Bun 1.x); `vitest` reserved as fallback if Bun coverage gaps surface |
| **Config file (engine)** | `apps/generation-engine/pyproject.toml [tool.pytest.ini_options]` (exists Phase 1) |
| **Config file (CLI)** | `apps/cli/package.json` `scripts.test` — Wave 0 wires real `bun test` (currently a no-op stub) |
| **Quick run (engine)** | `cd apps/generation-engine && uv run pytest -x` |
| **Quick run (CLI)** | `cd apps/cli && bun test` |
| **Phase-2 fast suite** | `cd apps/generation-engine && uv run pytest tests/test_pipeline.py tests/test_smart_id_no_overlap.py -x` (mocked LLM, <10s) |
| **Full suite command** | `pnpm -r test` (workspace — engine + CLI + contracts + fixture shape) |
| **Estimated runtime** | ~30s engine fast suite (mocked LLM) · ~3 min full workspace (no real OpenRouter) · ~6 min including real Stripe E2E |

---

## Sampling Rate

- **After every task commit:** `cd apps/generation-engine && uv run pytest tests/test_smoke_qwen.py tests/test_stage_a.py tests/test_pass_0_filter.py tests/test_pass_1_classify.py tests/test_smart_id_no_overlap.py -x` (mocked LLM where applicable, <30s wall).
- **After every plan wave:** `pnpm -r test` (full workspace, mocked LLM).
- **Before `/gsd-verify-work` (phase gate):** `pnpm -r test && OPENROUTER_API_KEY=<real> uv run pytest tests/test_smoke_qwen.py -x && bun test apps/cli/tests/init.e2e.test.ts` — all green; full Stripe E2E ≤60s wall on M1.
- **Nightly (out-of-band, non-blocking):** `uv run pytest tests/snapshots/ -x` against 5 fixtures; diffs surface as CI comments.
- **Max feedback latency:** 30 seconds for the per-task fast suite.

---

## Per-Task Verification Map

> Concrete tests are listed below; per-task assignment will be filled when plans are authored. Format mirrors RESEARCH.md §"Validation Architecture > Phase Requirements → Test Map".

| Req ID | Test ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|---------|----------|-----------|-------------------|-------------|--------|
| GEN-01 | T-2-A1 | Stage A parses Stripe (3.0.0) → RawIR with deterministic `spec_hash`, `dependency_graph` non-empty | unit | `uv run pytest tests/test_stage_a.py::test_parses_stripe_3_0 -x` | ❌ W0 | ⬜ pending |
| GEN-01 | T-2-A2 | Stage A parses GitHub (3.0.3) → identical IR shape | unit | `uv run pytest tests/test_stage_a.py::test_parses_github_3_0_3 -x` | ❌ W0 | ⬜ pending |
| GEN-01 | T-2-A3 | Stage A rejects circular ref with `CIRCULAR_REF` error (using prance `recursion_limit=2` + handler — Pitfall C) | unit | `uv run pytest tests/test_stage_a.py::test_circular_ref_handler -x` | ❌ W0 | ⬜ pending |
| GEN-01 | T-2-A4 | Stage A rejects spec >10MB raw with `SPEC_TOO_LARGE` | unit | `uv run pytest tests/test_stage_a.py::test_spec_too_large -x` | ❌ W0 | ⬜ pending |
| GEN-01 | T-2-A5 | Stage A rejects malformed YAML/JSON with `UNSUPPORTED_SPEC_FORMAT` | unit | `uv run pytest tests/test_stage_a.py::test_unsupported_format -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B1 | Pass 0 deterministic filter drops `/v1/test_helpers/*` as INTERNAL (Pitfall G) | unit | `uv run pytest tests/test_pass_0_filter.py::test_drops_test_helpers -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B2 | Pass 0 deterministic filter drops deprecated, healthchecks, webhooks per `DropReason` enum (D-23) | unit | `uv run pytest tests/test_pass_0_filter.py -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B3 | Pass 0 auth detection emits `List[AuthRequirement]` per endpoint for hybrid (GitHub Bearer + Apps via `x-github.enabledForGitHubApps` — Pitfall E) | unit | `uv run pytest tests/test_pass_0_auth_detect.py::test_github_hybrid_auth -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B4 | Pass 0 emits `{resource}_{action}` snake_case names matching `^[a-z][a-z0-9_]{0,63}$` | unit (mocked LLM) | `uv run pytest tests/test_pass_0_e2e.py::test_naming_regex -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B5 | Pass 0 hard-fails >80 with `MULTI_SERVER_SPLIT_REQUIRED` + concrete top-level path-prefix suggestions | unit | `uv run pytest tests/test_pass_0_e2e.py::test_multi_server_split -x` | ❌ W0 | ⬜ pending |
| GEN-02 | T-2-B6 | Pass 0 chunked path triggers when >200 endpoints AFTER deterministic filter | integration (mocked LLM) | `uv run pytest tests/test_pass_0_chunked.py::test_chunked_threshold -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C1 | Pass 1 emits 6 universal tools always, even when API has only some | unit | `uv run pytest tests/test_pass_1_classify.py::test_six_universal_always_emitted -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C2 | Pass 1 `search(query: string)` and `fetch(id: string)` exact OpenAI-compliant signatures (no extra params allowed) | unit | `uv run pytest tests/test_pass_1_classify.py::test_openai_compliance_signatures -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C3 | Pass 1 emits `coverage_proof` per Pass 0 endpoint; URL round-trips via `urllib.parse.urlparse` (Pitfall #3) | unit | `uv run pytest tests/test_pass_1_coverage.py::test_coverage_proof_url_roundtrip -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C4 | Pass 1 smart-ID schema-level format `{spec_slug}:{type}:{collection}:{identifier}` (no tenant prefix yet — Phase 6 prepends) | unit | `uv run pytest tests/test_pass_1_routing.py::test_smart_id_format -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C5 | Two synthetic tenants (`acme-` + `widgets-`) wrapping `stripe` produce non-overlapping ID regexes (Pitfall #1) | unit | `uv run pytest tests/test_smart_id_no_overlap.py::test_synthetic_two_tenants -x` | ❌ W0 | ⬜ pending |
| GEN-03 | T-2-C6 | Pass 1 final tool count 6–12 on Stripe fixture | E2E (mocked LLM) | `uv run pytest tests/test_pipeline.py::test_stripe_e2e -x` | ❌ W0 | ⬜ pending |
| GEN-12 | T-2-D1 | Second pipeline run on same spec produces zero `LangfuseObservation` events with `model_name=qwen/qwen3-coder` | integration | `uv run pytest tests/test_cache_l1_l2.py::test_second_run_zero_llm_calls -x` | ❌ W0 | ⬜ pending |
| GEN-12 | T-2-D2 | L1 cache key embeds `engine_version` from `pyproject.toml`; bumping invalidates entries | unit | `uv run pytest tests/test_cache_l1_l2.py::test_engine_version_invalidation -x` | ❌ W0 | ⬜ pending |
| GEN-12 | T-2-D3 | Atomic cache write via tempfile-rename survives concurrent access | unit | `uv run pytest tests/test_cache_l1_l2.py::test_atomic_writes -x` | ❌ W0 | ⬜ pending |
| GEN-13 | T-2-E1 | Day-1 smoke test imports `OpenAIModel` (NOT `OpenAIChatModel` — Pitfall A) | smoke | `uv run pytest tests/test_smoke_qwen.py -x` | ✅ (Phase 1) — extends |
| GEN-13 | T-2-E2 | Smoke test asserts `extra_body.provider.order == ["fireworks"]` is forwarded to OpenRouter request body (D-08, Pitfall #2/B) | smoke | `uv run pytest tests/test_smoke_qwen.py::test_extra_body_forwarded -x` | ❌ W0 | ⬜ pending |
| GEN-13 | T-2-E3 | All Pass 0/1 LLM call sites import `MODEL` from `llm.client` (no duplicate `OpenAIModel` constructions) | static | `uv run pytest tests/test_no_duplicate_model_construction.py -x` | ❌ W0 | ⬜ pending |
| CLI-01 | T-2-F1 | `mcpgen init <stripe-url>` writes `./mcpgen-output/stripe-api/{ir,pass-0-output,pass-1-output}.json + server.ts + package.json + README.md` | E2E | `bun test apps/cli/tests/init.e2e.test.ts` | ❌ W0 | ⬜ pending |
| CLI-01 | T-2-F2 | Wall-clock from CLI invocation to `server.ts` written ≤60s on M1 (90s soft cap, >90s fails CI) | perf | `bun test apps/cli/tests/init.perf.test.ts` (CI macos-arm64 runner) | ❌ W0 | ⬜ pending |
| CLI-01 | T-2-F3 | Generated `server.ts` `tools/list` MCP-Inspector validates without errors | E2E | `bun test apps/cli/tests/inspector.e2e.test.ts` | ❌ W0 | ⬜ pending |
| CLI-01 | T-2-F4 | CLI auto-spawn engine when localhost:8000 is unreachable (D-44); graceful SIGTERM on CLI exit | unit (mocked spawn) | `bun test apps/cli/tests/auto_spawn.test.ts` | ❌ W0 | ⬜ pending |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test scaffolding files that **must exist before** Phase 2 implementation tasks can begin (per Nyquist sampling continuity):

### Engine (Python)
- [x] `apps/generation-engine/tests/test_stage_a.py` — covers GEN-01 (parse, error paths, dependency graph). _Plan 02-02_
- [x] `apps/generation-engine/tests/test_pass_0_filter.py` — covers GEN-02 deterministic filter + DropReason mapping. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_0_auth_detect.py` — covers GEN-02 hybrid auth (Pitfall #6 + Pitfall E). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_0_chunked.py` — covers GEN-02 chunked path (>200 endpoints). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_0_e2e.py` — covers GEN-02 full Pass 0 against fixtures (mocked LLM). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_1_classify.py` — covers GEN-03 universal/action/workflow/specialized + OpenAI compliance. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_1_routing.py` — covers GEN-03 routing rule construction + smart ID format. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_1_coverage.py` — covers GEN-03 `coverage_proof` URL round-trip (Pitfall #3). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pass_1_e2e.py` — covers GEN-03 Pass 1 E2E (mocked LLM). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_pipeline.py` — covers GEN-01+02+03 full pipeline (mocked LLM); also GEN-12 second-run cache hit. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_smart_id_no_overlap.py` — covers Pitfall #1 (D-31, D-56) two-tenant non-overlap. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_cache_l1_l2.py` — covers GEN-12 (filesystem cache, atomic writes, engine_version invalidation). _Plan 02-04_
- [x] `apps/generation-engine/tests/test_no_duplicate_model_construction.py` — static check: no module outside `mcpgen_engine.llm.*` imports `OpenAIModel` or `OpenAIProvider` directly. _Plan 02-01_
- [x] `apps/generation-engine/tests/test_api_generate.py` — covers SSE event sequence on `POST /api/v1/generate`. _Plan 02-04_
- [x] `apps/generation-engine/tests/test_smoke_qwen.py` — **extension** of Phase 1 file: add `test_extra_body_forwarded` (D-08). _Plan 02-01_

### CLI (Bun)
- [x] `apps/cli/tests/init.test.ts` — covers CLI-01 unit (output rendering, idempotency-key generation, error handling). _Plan 02-04_
- [x] `apps/cli/tests/init.e2e.test.ts` — covers CLI-01 E2E with real engine on localhost. _Plan 02-04_
- [x] `apps/cli/tests/init.perf.test.ts` — covers CLI-01 wall-clock ≤60s. _Plan 02-04_
- [x] `apps/cli/tests/inspector.e2e.test.ts` — covers CLI-01 MCP Inspector validation of generated `server.ts`. _Plan 02-04_
- [x] `apps/cli/tests/auto_spawn.test.ts` — covers D-44 spawn pattern (mocked `Bun.spawn`). _Plan 02-04_
- [x] `apps/cli/package.json` `scripts.test` — replace stub with real `bun test` invocation. _Plan 02-04_

### Hand-tuned fixtures (Wave 1, BEFORE implementation per Open Question 3 in RESEARCH.md)
- [x] `packages/engine-fixtures/stripe/pass-0-output.json` — hand-authored from real Stripe spec; the contract Pass 0 must hit. _Plan 02-03_
- [x] `packages/engine-fixtures/stripe/pass-1-output.json` — hand-authored; the contract Pass 1 must hit. _Plan 02-03_
- [x] `packages/engine-fixtures/github/pass-0-output.json` + `pass-1-output.json`. _Plan 02-03_
- [x] `packages/engine-fixtures/notion/pass-0-output.json` + `pass-1-output.json`. _Plan 02-03_
- [x] `packages/engine-fixtures/linear/pass-0-output.json` + `pass-1-output.json`. _Plan 02-03_
- [x] `packages/engine-fixtures/slack/pass-0-output.json` + `pass-1-output.json`. _Plan 02-03_

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated `server.ts` loads cleanly in Claude Desktop with the README config snippet | CLI-01 (UX hero flow) | Claude Desktop is a GUI that needs a human eye on the tool list | After CLI generates `mcpgen-output/stripe-api/`, copy the README config snippet to `~/Library/Application Support/Claude/claude_desktop_config.json`, restart Claude Desktop, verify Pass 1 final tools appear in the tool picker; record screenshot in `02-PHASE-VERIFICATION.md`. |
| Day-1 smoke test passes against **real** OpenRouter with **real** `OPENROUTER_API_KEY` (not the conftest placeholder) | GEN-13 / OPS-03 / Pitfall #27 | CI runs the smoke test only when key is present; before merge to `main`, a human runs it locally to prove the pinning works against live infrastructure | Set `OPENROUTER_API_KEY=<real>` in shell, run `cd apps/generation-engine && uv run pytest tests/test_smoke_qwen.py -v -s`; verify (a) call succeeds, (b) cost <$0.01, (c) Langfuse trace shows `provider.order=["fireworks"]` reaching OpenRouter. |
| Stripe golden spec genuine wall-clock ≤60s on M1 from clean cache | CLI-01 (perf budget) | CI macos-arm64 runner approximates but human must verify on real M1 hardware once per phase | `rm -rf .cache/mcpgen && time pnpm dev:cli init https://api.stripe.com/openapi.json --output-dir /tmp/mcpgen-stripe`; record wall time in `02-PHASE-VERIFICATION.md`. |

---

## Validation Sign-Off

- [ ] All Phase 2 tasks have `<acceptance_criteria>` referencing one of the test commands above (or a Wave 0 dependency)
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all ❌ W0 references in the verification map
- [ ] No watch-mode flags in any test command (CI must run once and exit)
- [ ] Feedback latency <30s for per-task fast suite
- [ ] `nyquist_compliant: true` set in frontmatter once all checkboxes pass

**Approval:** pending
