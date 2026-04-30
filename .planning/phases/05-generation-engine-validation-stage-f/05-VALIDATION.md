---
phase: 5
slug: generation-engine-validation-stage-f
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Phase 5 is itself a validation phase — this strategy covers how Phase 5 validates that F1/F2/F3 work correctly.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.3 + pytest-asyncio 0.24 (already in `apps/generation-engine/[dependency-groups] dev`) |
| **Config file** | `apps/generation-engine/pyproject.toml::[tool.pytest.ini_options]` (already configured for ruff + mypy --strict) |
| **Quick run command** | `uv run pytest apps/generation-engine/tests/stages/stage_f/ -x --no-cov` |
| **Full suite command** | `pnpm -r test && uv run pytest -x` (workspace-wide) |
| **Sonnet smoke test** | `uv run pytest apps/generation-engine/tests/test_smoke_sonnet.py -m requires_anthropic` |
| **Estimated runtime (mocked)** | ~30 seconds |
| **Estimated runtime (real LLM)** | ~3 min Stripe; ~9 min for Stripe + GitHub + Notion |

---

## Sampling Rate

- **After every task commit:** `uv run pytest apps/generation-engine/tests/stages/stage_f/ -x --no-cov` (~30s; mocked LLM)
- **After every plan wave:** Workspace `pnpm -r test && uv run pytest -x` (~3 min; mocked LLM)
- **Before `/gsd-verify-work`:** Real-LLM run on Stripe + GitHub + Notion fixtures (`-m "requires_openrouter and requires_anthropic"`) — gated behind manual flag in CI to control cost (~$0.20 F2 + ~$3 F3 = ~$3.20 per verification)
- **Max feedback latency:** 30 seconds (mocked) / 3 min (per-fixture real-LLM)

---

## Per-Task Verification Map

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 (Wave 0 + IR types) | 1 | GEN-09/10/11 | — | Strictly-additive IR types | unit | `uv run pytest apps/generation-engine/tests/test_ir_additive.py -x` | ❌ Wave 0 | ⬜ |
| 05-02 (F1 deterministic checks) | 2 | GEN-09 | T-#1, T-#15, T-#33 | F1 fails closed; secret_scan blocks deploy | unit + integration | `uv run pytest apps/generation-engine/tests/stages/stage_f/test_f1_*.py -x` | ❌ Wave 0 | ⬜ |
| 05-02 (gitleaks subprocess) | 2 | GEN-09 | T-#12 | Secrets never leak | integration | `uv run pytest tests/stages/stage_f/test_secret_scan.py -x` | ❌ Wave 0 | ⬜ |
| 05-02 (OpenAI compliance fixture) | 2 | GEN-09 | T-#32 | search/fetch shape immutable | unit (snapshot) | `uv run pytest tests/stages/stage_f/test_openai_compliance.py -x` | ❌ Wave 0 | ⬜ |
| 05-03 (F2 5-shuffle × 3-temp) | 3 | GEN-10 | T-#9 | 15 calls per tool | unit (mocked LLM) | `uv run pytest tests/stages/stage_f/test_f2_smell.py::test_15_calls -x` | ❌ Wave 0 | ⬜ |
| 05-03 (σ discrimination) | 3 | GEN-10 | T-#9 | σ < 0.4 force-triggers F3 | integration (mocked) | `uv run pytest tests/stages/stage_f/test_f2_sigma.py -x` | ❌ Wave 0 | ⬜ |
| 05-03 (LAUNCH_CRITERIA import) | 3 | GEN-10 | — | Threshold never hardcoded | static | `! grep -rE "(4\.0\\|0\\.7)" apps/generation-engine/src/mcpgen_engine/stages/stage_f/ \| grep -v LAUNCH_CRITERIA` returns 0 hits | ❌ Wave 0 | ⬜ |
| 05-04 (Retry orchestrator FSM) | 4 | GEN-10/11 | — | Max 2 rounds; cascade invalidation | unit + integration | `uv run pytest tests/stages/stage_f/test_retry_orchestrator.py -x` | ❌ Wave 0 | ⬜ |
| 05-05 (F3 server runner) | 4 | GEN-11 | T-#15 | wrangler dev subprocess + cleanup | integration (real wrangler) | `uv run pytest tests/stages/stage_f/test_server_runner.py -x -m requires_wrangler` | ❌ Wave 0 | ⬜ |
| 05-05 (F3 Sonnet test agent) | 4 | GEN-11 | — | Loop on stop_reason="tool_use" | integration (Anthropic) | `uv run pytest tests/stages/stage_f/test_test_agent_harness.py -m requires_anthropic` | ❌ Wave 0 | ⬜ |
| 05-06 (Two-tier evaluator) | 4 | GEN-11 | — | rule_based + LLM judge | unit | `uv run pytest tests/stages/stage_f/test_two_tier_eval.py -x` | ❌ Wave 0 | ⬜ |
| 05-06 (Mock clients harness) | 4 | GEN-11 | T-#4, T-#31, T-#32 | Cursor + Claude Desktop older + ChatGPT Deep Research | integration (real wrangler) | `uv run pytest tests/stages/stage_f/test_mock_clients.py -x -m requires_wrangler` | ❌ Wave 0 | ⬜ |
| 05-07 (Pipeline integration) | 5 | GEN-09/10/11 | — | F1→F2→F3→validation_complete SSE | integration | `uv run pytest tests/stages/stage_f/test_pipeline_f1_fail.py tests/stages/stage_f/test_pipeline_e2e.py -x` | ❌ Wave 0 | ⬜ |
| 05-08 (CLI + new GET endpoint) | 5 | GEN-09/10/11 | — | CLI shows F1/F2/F3 progress + QualityBadge | unit + e2e | `bun test apps/cli/src/init/ && uv run pytest tests/api/test_quality_report_endpoint.py -x` | ❌ Wave 0 | ⬜ |
| 05-09 (Fixture references) | 6 | GEN-09/10/11 | — | Stripe + GitHub + Notion → verified; Linear + Slack → standard | integration (real LLM) | `uv run pytest tests/stages/stage_f/test_pipeline_e2e.py -m "requires_openrouter and requires_anthropic"` | ❌ Wave 0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/generation-engine/tests/stages/stage_f/test_f1_*.py` — 11 test files matching 11 deterministic F1 checks (covers GEN-09)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_f2_smell.py` — covers GEN-10 (mocked LLM unit tests)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_f2_sigma.py` — covers between-tool σ ≥ 0.4 discrimination (Pitfall #9)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_retry_orchestrator.py` — covers retry FSM + cascade invalidation
- [ ] `apps/generation-engine/tests/stages/stage_f/test_server_runner.py` — covers `wrangler dev --local` subprocess (`requires_wrangler` marker; skips if wrangler not on PATH)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_test_agent_harness.py` — covers Sonnet test agent loop (`requires_anthropic` marker)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_mock_clients.py` — covers 3 mock clients (Cursor / Claude Desktop older / ChatGPT Deep Research)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_two_tier_eval.py` — covers rule-based + LLM judge
- [ ] `apps/generation-engine/tests/stages/stage_f/test_secret_scan.py` — covers gitleaks subprocess
- [ ] `apps/generation-engine/tests/stages/stage_f/test_openai_compliance.py` — covers Pitfall #32 search/fetch fixture diff
- [ ] `apps/generation-engine/tests/stages/stage_f/test_pipeline_f1_fail.py` — covers F1-fail-closed semantics (D-07)
- [ ] `apps/generation-engine/tests/stages/stage_f/test_pipeline_e2e.py` — full pipeline integration on Stripe fixture (real LLM gated)
- [ ] `apps/generation-engine/tests/test_smoke_sonnet.py` — Day-1 Sonnet reachability gate (mirrors `test_smoke_qwen.py`)
- [ ] `apps/generation-engine/tests/conftest.py` extension: add `requires_anthropic` and `requires_wrangler` pytest markers
- [ ] `packages/engine-fixtures/_canonical/search_signature.json` + `_canonical/fetch_signature.json` + `_canonical/mcp-schema.json` — hand-created canonical fixtures (Pitfall #32 + JSON Schema validation)
- [ ] `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json` — hand-author 3 × 10 = 30 tasks (D-23, D-43)
- [ ] `packages/engine-fixtures/{stripe,github,notion,linear,slack}/quality-report.json` — fill realistic F1/F2/F3 ranges (D-42); calibrate from 3 fresh pipeline runs per fixture
- [ ] `packages/engine-fixtures/{linear,slack}/mock_upstream.py` — Python-side spec-derived mock-response generator (D-22)

*Existing infrastructure:* `pytest 8.3` + `pytest-asyncio 0.24` + `requires_openrouter` marker + `_sandbox_env` fixture from Phase 2 are reused — Phase 5 only ADDS new test files + 2 new pytest markers.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Quarterly human calibration of F2 judge ICC > 0.85 | GEN-10 (Pitfall #9) | Requires human evaluators sampling 30 tools | Quarterly run: sample 30 tools across fixtures; have 2+ humans score each on 6-component rubric; compute ICC against Qwen judge scores; if < 0.85 → adjust judge prompt or evaluate adding second model per Override doc §4.4 fallback |
| Real Cursor / Claude Desktop / ChatGPT Deep Research smoke against deployed servers | GEN-11 (Pitfall #4, #31, #32) | Real client behavior cannot be simulated 100% (Cursor confirmation logic is opaque) | Phase 9 owns the real-client smoke; Phase 5 ships mock clients only |
| F3 sandbox credential refresh (Stripe test mode key rotation, GitHub test PAT expiry) | GEN-11 | Out-of-band credential management | Operator manages `~/.mcpgen/sandbox-creds.yaml`; never persisted in repo or logs (gitleaks gate enforces) |
| Visual review of CLI progress output across terminals (color, alignment) | D-38 | Terminal rendering is platform-specific | Manual eyeball test on macOS Terminal + iTerm2 + Linux gnome-terminal during Phase 5 wave 5 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (16 new test files + 2 markers + 4 fixture files)
- [ ] No watch-mode flags (all tests run-once with `-x`)
- [ ] Feedback latency < 30s (mocked LLM tests are the per-commit gate)
- [ ] Real-LLM tests gated behind `-m "requires_openrouter and requires_anthropic"` to control cost
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 completes

**Approval:** pending
