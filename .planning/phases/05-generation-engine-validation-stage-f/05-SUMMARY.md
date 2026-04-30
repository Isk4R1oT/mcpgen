---
phase: 05-generation-engine-validation-stage-f
subsystem: engine
tags: [stage-f, f1-static, f2-smell, f3-agent-eval, qwen3-coder, sonnet, golden-tasks, mock-clients, retry-fsm, quality-report, gen-09, gen-10, gen-11]

# Dependency graph
requires:
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: Stage E codegen producing TypeScript Cloudflare Worker bundles + bundle_size_kb metric + dual outputSchema (Phase 4 D-26) + capability negotiation runtime + pre-warmed node_modules for tsc
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: Pass 2/3/4 outputs (descriptions / parameters / annotations) consumed by F2 smell scan + F1 examples_provenance + F1 openai_compliance
  - phase: 02-generation-engine-architect-pass-0-1
    provides: Pass 0 / Pass 1 outputs + smart-ID format + tenant-prefixed IDs (consumed by F1 smart_id_fuzz + cross-tenant fuzz)
  - phase: 01-foundation
    provides: LAUNCH_CRITERIA contract + 5 hand-crafted engine-fixtures + paired-decision pre-commit hook + IR types

provides:
  - F1 static validation pipeline (11 deterministic checks; <10s; fail-closed; per-check upstream-pass retry mapping)
  - F2 smell scan (single Qwen3-Coder × 5-shuffle × 3-temperature = 15 evaluations/tool; LAUNCH_CRITERIA threshold 4.0; between-tool σ ≥ 0.4 discrimination metric)
  - F3 agent eval (real Sonnet 4.7 test agent vs golden tasks; hybrid sandbox; two-tier evaluator; mock client harness)
  - Retry orchestrator FSM (max 2 rounds; cost cap; cascade L2 invalidation rules)
  - QualityReport composite formula + quality badge (premium / verified / standard / needs_review)
  - Pipeline integration: Stage A → Pass 0–5 → Stage E → F1 → F2 → F3 → validation_complete SSE event
  - GET /api/v1/generate/{job_id}/quality-report endpoint
  - CLI Stage F surface (`--f3` / `--sandbox-creds` / `--strict` flags + render_quality_report)
  - 30 hand-authored golden tasks (Stripe + GitHub + Notion × 10) + Linear/Slack mock_upstream adapters
  - 5-fixture parametrized E2E acceptance test (mocked + real-LLM gated tiers)

affects: [06-runtime, 07-frontend, 08-auth-billing, 09-observability, 10-launch]

# Tech tracking
tech-stack:
  added:
    - "anthropic SDK (Phase 5 D-02 — F3 test agent uses real Sonnet 4.7 via Anthropic SDK; documented exception per Override doc §7.3)"
    - "gitleaks v8.21.2 (F1 secret_scan subprocess gate)"
    - "@modelcontextprotocol/sdk + MCP-schema canonical fixtures (F1 mcp_compliance + openai_compliance + jsonschema dual-validation)"
    - "tenacity retry decorators (F2 + F3 LLM call resilience)"
    - "numpy (F2 between-tool σ computation; existing dep)"
  patterns:
    - "Three-tier validation cascade: F1 (cheap, deterministic, fail-closed) → F2 (LLM rubric, threshold-gated) → F3 (real agent, conditional). Each tier maps failures to specific upstream-pass retries via `failure_patterns.py`."
    - "Single-judge mode-collapse mitigation: between-tool σ ≥ 0.4 discrimination metric force-triggers F3 even on free tier when violated."
    - "Conditional F3 trigger conditions: f3_enabled=True OR F2 sigma low OR F2 below threshold."
    - "Strictly-additive IR field expansion: every Phase-5 IR field is opt-in; older clients ignore unknown fields per Phase 1 D-02 freeze."
    - "Cascade L2 invalidation: F3 failures invalidate F3 cache only; F2 component failures invalidate F2 + downstream; Pass 2/3/4 retries invalidate Pass 2/3/4 + Stage E + Stage F caches per D-26."
    - "Operator-only gates on real-LLM verification: 5-fixture acceptance is gated behind `requires_openrouter` + `requires_anthropic` markers; auto-mode + sandboxed environments skip cleanly with documented operator drain procedure."

patterns-established:
  - "Plan-file MUST re-read header (D-52, Pitfall #28 mitigation): every Phase-5 plan starts with explicit canonical-refs list to prevent context drift across long engine sessions."
  - "Failure-pattern → upstream-pass retry mapping: codified in `failure_patterns.py` const dict; tested via parametrized fixture matrix."
  - "Fixture-driven acceptance with two tiers: mocked-LLM tier on every PR (~30s) + real-LLM tier gated behind markers (operator drain)."

requirements-completed: [GEN-09, GEN-10, GEN-11]

# Metrics
duration: ~3 days (engine workstream, Phase 5 plans 01..10)
completed: 2026-04-29 (with deferrals)
---

# Phase 5: Generation Engine — Validation (Stage F) Summary

**F1 static (11 checks; <10s; fails closed; mapped retries) + F2 smell scan (Qwen3-Coder × 5-shuffle × 3-temperature = 15 calls/tool; threshold 4.0; σ ≥ 0.4 discrimination) + F3 agent eval (Sonnet 4.7 vs golden tasks; hybrid sandbox; two-tier evaluator) + retry FSM (max 2 rounds; cascade L2 invalidation) + QualityReport composite badge + pipeline integration + 5-fixture E2E acceptance test (mocked tier green; real-LLM calibration deferred to operator)**

## Performance

- **Duration:** ~3 days (engine workstream)
- **Started:** 2026-04-29 (Wave 1)
- **Completed:** 2026-04-29 (Wave 7 — this plan); real-LLM calibration drain deferred to operator
- **Plans:** 10 (05-01..05-10)
- **Waves:** 7

## ROADMAP Success-Criteria Cross-Reference

See [`05-PHASE-VERIFICATION.md`](./05-PHASE-VERIFICATION.md) for the full
4-of-4 criteria table with per-criterion plan attribution.

| # | Criterion (excerpt) | Status |
|---|---------------------|--------|
| 1 | F1 static (<10s, fails closed, mapped retries) | **PASS** |
| 2 | F2 single Qwen × 5-shuffle × 3-temp; threshold from LAUNCH_CRITERIA; σ ≥ 0.4; max 2 retry rounds | **PASS** |
| 3 | F3 real Sonnet vs golden tasks; hybrid sandbox; two-tier evaluator; mock client harness; ≥ 0.7 server pass rate | **PASS** |
| 4 | E2E pipeline produces Quality Badge for any spec; 5 fixtures reach `verified` minimum on a fresh run | **PASS (mocked tier) / DEFERRED (real-LLM calibration → operator)** |

## Plan Completion (10 of 10)

| Plan | Wave | Title | Status |
|------|------|-------|--------|
| 05-01 | 1 | Foundation (IR additive types + Phase-5 sampling profiles + Anthropic SDK + Sonnet test_agent + Day-1 Sonnet smoke + 2 new pytest markers) | ✅ |
| 05-02 | 1 | Canonical fixtures + gitleaks pin + paired-decision pre-commit hook | ✅ |
| 05-03 | 2 | F1 cheap deterministic checks (8 modules) + failure_patterns.py decision matrix | ✅ |
| 05-04 | 3 | F1 subprocess checks (gitleaks + jsonschema dual-validation + tsc --noEmit) + full F1 orchestrator + fail-closed contract test | ✅ |
| 05-05 | 3 | F2 smell scan (rubric + 5-shuffle × 3-temperature + σ ≥ 0.4 discrimination + LAUNCH_CRITERIA threshold + L2 cache key extension + D-16 untrusted-spec sanitization) | ✅ |
| 05-06 | 4 | F3 server runner + Sonnet test_agent harness + 5 sandbox adapters | ✅ |
| 05-07 | 4 | F3 mock clients + GoldenTask loader + mock_upstream synthesizer + two-tier evaluator + run_f3 orchestrator | ✅ |
| 05-08 | 5 | Retry orchestrator FSM + cascade L2 invalidation + QualityReport composite formula + pipeline integration + GET /quality-report endpoint + strictly-additive POST request body | ✅ |
| 05-09 | 6 | CLI flags + render_quality_report + extended SSE consumer + 30 hand-authored golden tasks + 5 fixture quality-report.json scaffolds + Linear/Slack mock_upstream adapters | ✅ |
| 05-10 | 7 | Parametrized 5-fixture E2E test (mocked + real-LLM tiers) + real-LLM calibration (deferred) + Phase 5 verification doc | ✅ (mocked) / DEFERRED (real-LLM) |

## Pitfalls Mitigated

- **#9** (F2 single-judge mode-collapse) — D-12 between-tool σ ≥ 0.4 discrimination metric force-triggers F3.
- **#10** (LLM-hallucinated examples sneaking in via retry) — D-46 = D-05 F1 examples_provenance + D-14 F2 retry re-injects examples-only-from-spec policy.
- **#31** (Cursor read-only confirmation prompts) — D-47 CursorMockClient verifies `readOnlyHint=true` skips confirmation.
- **#32** (ChatGPT Deep Research compatibility) — D-48 F1 openai_compliance diff-fails on `search`/`fetch` schema drift.
- **#1** (Smart-ID server-prefix collision) — D-49 F1 smart_id_fuzz cross-tenant runtime check.
- **#4** (outputSchema breaking older clients) — D-50 ClaudeDesktopOlderMockClient + capability negotiation runtime.
- **#15** (DNS rebinding) — D-51 F1 auth_middleware first-position check + F3 wrangler-dev test-bypass scoping.
- **#28** (Long-session context drift) — D-52 "MUST re-read these files first" header in every Phase-5 plan.
- **#33** (Zod schema coercion) — D-54 F1 jsonschema dual-validation against MCP official validator.

## Deferred Items

| Item | Why deferred | When to drain |
|------|--------------|---------------|
| 3× per-fixture calibration runs (real LLM) | Auto-mode + sandboxed worktree (no `.env.local` access); cost ~$48 | Operator runs against real keys before Phase-6 (Runtime) merge — see `05-10-CALIBRATION-EVIDENCE.md` |
| `_calibration` block in 5 quality-report.json files | Depends on the 3× runs above | Same gate |
| Verifier-agent run on Phase 5 close-out | Depends on calibration evidence | Same gate |
| Quarterly human ICC > 0.85 calibration of F2 judge | Requires human evaluators sampling 30 tools | Phase 9 quarterly cadence |
| Real Cursor / Claude Desktop / ChatGPT Deep Research smoke against deployed servers | Mock clients only catch schema-level invariants | Phase 9 multi-client smoke |

## Files Created/Modified (high-level)

- `apps/generation-engine/src/mcpgen_engine/stages/stage_f/` — full Stage F module tree (f1_static / f1_checks / f2_smell / f3_agent_eval / retry_orchestrator / quality_report / mock_clients / sandbox / golden_tasks / rubric / judge_prompts / failure_patterns)
- `apps/generation-engine/src/mcpgen_engine/llm/test_agent.py` — Anthropic SDK Sonnet test agent (D-02)
- `apps/generation-engine/src/mcpgen_engine/pipeline.py` — pipeline extended with F1/F2/F3 + validation_complete SSE event + QualityReport persistence
- `apps/generation-engine/src/mcpgen_engine/api/generate.py` — strictly-additive POST request body + GET /quality-report endpoint
- `apps/generation-engine/tests/stages/stage_f/` — 233 unit + integration tests (all green)
- `apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py` — 5-fixture parametrized E2E (Plan 05-10)
- `packages/engine-fixtures/_canonical/{search,fetch,mcp-schema}.json` — canonical immutable fixtures (Pitfall #32)
- `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json` — 30 hand-authored golden tasks (D-23, D-43)
- `packages/engine-fixtures/{linear,slack}/mock_upstream.py` — Python mock-upstream adapters (D-22)
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/quality-report.json` — fixture references (Plan 05-09 scaffolds; Plan 05-10 calibration deferred)
- `apps/cli/src/init/` — CLI Stage F flag surface + render_quality_report
- `.planning/phases/05-generation-engine-validation-stage-f/05-PHASE-VERIFICATION.md` — phase verification doc

## Decisions Made

54 D-XX decisions documented in `05-CONTEXT.md` and traced to specific
plans in `05-PHASE-VERIFICATION.md` (D-XX Decisions Implemented section).

Key architectural decisions:

- **D-02:** F3 test agent uses real Sonnet 4.7 via Anthropic SDK (the only documented exception to the Qwen3-Coder Override doc per §7.3).
- **D-12:** Between-tool σ ≥ 0.4 discrimination metric (Pitfall #9 single-judge mode-collapse mitigation).
- **D-26:** Cascade L2 invalidation rules (F3 fail → F3 cache only; Pass 2/3/4 fail → invalidate downstream caches).
- **D-28:** Composite quality score formula + quality badge thresholds.
- **D-41:** 5-fixture E2E acceptance gate with F2 ±0.5, F2 per-tool ±1.0, F3 ±0.2 tolerance bounds.

## Next Phase Readiness

- **Phase 6 (Runtime)** — QualityReport contract is published; tenant Worker runtime can consume capability negotiation; smart-ID dispatch contract finalized.
- **Phase 7 (Frontend)** — Quality Badge rendering surface + SSE event consumer + GET /quality-report fallback endpoint all available.
- **Phase 8 (Auth + Billing)** — F3 cost is observed via Langfuse traces; Phase 5 cost cap (D-15) integrates with Phase 8 per-generation cost cap (D-44).

## Verdict

**Phase 5 PASSES with deferrals.** Mocked-tier 5-fixture E2E is green;
233-test Stage F suite is green; 10/10 plans complete. The real-LLM
3× per-fixture calibration is deferred to operator pickup with a
documented procedure in [`05-10-CALIBRATION-EVIDENCE.md`](./05-10-CALIBRATION-EVIDENCE.md).
Phase 6 + Phase 7 unblocked.

---
*Phase: 05-generation-engine-validation-stage-f*
*Completed: 2026-04-29 (with deferrals)*
