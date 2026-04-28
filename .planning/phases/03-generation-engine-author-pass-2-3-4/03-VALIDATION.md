---
phase: 03
slug: generation-engine-author-pass-2-3-4
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-28
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sourced from `03-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest 8.x` + `pytest-asyncio` (Python engine); `bun:test` (TS CLI) |
| **Config file** | `apps/generation-engine/pyproject.toml` `[tool.pytest.ini_options]`; `apps/cli` picks up `tests/**/*.test.ts` by default |
| **Quick run command** | `cd apps/generation-engine && uv run pytest -x -q tests/passes/<module>/test_<file>.py` (per task) |
| **Full suite command** | `cd apps/generation-engine && uv run pytest && cd ../cli && bun test` |
| **Estimated runtime** | ~60–180 s (engine quick), ~5 min (engine full incl. integration), ~30 s (CLI) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/generation-engine && uv run pytest -x -q tests/passes/pass_N/test_<module>.py` (the module being changed)
- **After every plan wave:** Run `cd apps/generation-engine && uv run pytest -x` (full engine suite, ≤5 min)
- **Before `/gsd-verify-work`:** Full engine + CLI suite green AND fixture-equivalence test passes on Stripe + GitHub + Notion
- **Max feedback latency:** 180 s (per-task), 300 s (per-wave)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-* | 01 | 1 | GEN-04 | T-03-PI / T-03-EX | Per-tool-type prompt templates load + cache_control headers; spec excerpts wrapped in `<spec_excerpt>` XML | unit | `uv run pytest tests/passes/pass_2/test_prompts.py -x` | ❌ W0 | ⬜ pending |
| 03-02-* | 02 | 1 | GEN-04 | T-03-EX | Length budgets enforced per tool type (universal 200–400, action 100–200, workflow 150–300, specialized 80–150); forbidden-pattern regex catches marketing/filler/tautology/vague | unit | `uv run pytest tests/passes/pass_2/test_validation.py -x` | ❌ W0 | ⬜ pending |
| 03-02-* | 02 | 1 | GEN-04 | T-03-EX | Pass 2 retry re-runs forbidden + examples-from-spec checks | unit | `uv run pytest tests/passes/pass_2/test_validation.py::test_retry_revalidates -x` | ❌ W0 | ⬜ pending |
| 03-03-* | 03 | 1 | GEN-04 | — | Inline Qwen quality gate retries on score <3 (max 1 retry); abbreviated 4-component rubric | unit | `uv run pytest tests/passes/pass_2/test_quality_gate.py -x` | ❌ W0 | ⬜ pending |
| 03-04-* | 04 | 2 | GEN-05 | — | Phase 1 deterministic param extraction from RawIR + Pass 1 routing | unit | `uv run pytest tests/passes/pass_3/test_extract.py -x` | ❌ W0 | ⬜ pending |
| 03-05-* | 05 | 2 | GEN-05 | T-03-PI | Per-parameter Qwen enrichment ‖ concurrency 20; 5-component MCP-Bundles description | unit | `uv run pytest tests/passes/pass_3/test_enrich.py -x` | ❌ W0 | ⬜ pending |
| 03-06-* | 06 | 2 | GEN-05 | — | Filter design selector picks A/B/C deterministically; consistency across `list_objects` tools | unit | `uv run pytest tests/passes/pass_3/test_filter_design.py -x` | ❌ W0 | ⬜ pending |
| 03-07-* | 07 | 2 | GEN-05 | — | Naming normalization rules applied (`user`→`user_id`, `data`→`payload`, ambiguous `id`/`status`/`time` qualified); standard parameter sets for 6 universal tools; smart-ID `pattern` auto-generated from Pass 1 SmartIdSchema | unit | `uv run pytest tests/passes/pass_3/test_naming.py tests/passes/pass_3/test_smart_id.py tests/passes/pass_3/test_standards.py -x` | ❌ W0 | ⬜ pending |
| 03-08-* | 08 | 3 | GEN-05 | T-03-AP | Cross-parameter validation (uniqueness, mutual exclusivity, JSON Schema validity, `additionalProperties: false` enforced); inline Qwen quality gate per tool | unit | `uv run pytest tests/passes/pass_3/test_validation.py tests/passes/pass_3/test_quality_gate.py -x` | ❌ W0 | ⬜ pending |
| 03-09-* | 09 | 3 | GEN-06 | T-03-OW | Pass 4 deterministic rules + verb pattern matching (Appendix B) cover ≥80%; `openWorldHint=true` invariant enforced via Pydantic `Literal[True]`; workflow conservative aggregation (AND/OR/AND) | unit | `uv run pytest tests/passes/pass_4/test_rules.py tests/passes/pass_4/test_verbs.py -x` | ❌ W0 | ⬜ pending |
| 03-10-* | 10 | 3 | GEN-06 | T-03-VP | Selective Qwen judgment for `_needs_llm_review` only (~0–3 tools/server); consistency rules with auto-fix (`readOnly=true → idempotent=true`; `destructive=true → readOnly=false`); deterministic title generation | unit | `uv run pytest tests/passes/pass_4/test_llm_judge.py tests/passes/pass_4/test_consistency.py tests/passes/pass_4/test_titles.py -x` | ❌ W0 | ⬜ pending |
| 03-11-* | 11 | 4 | GEN-04+05+06 | — | E2E pipeline `Stage A → Pass 4` on Stripe + GitHub + Notion fixtures; output `Tool` objects pass JSON-schema validation + consistency checks with zero defaulted annotations | integration | `uv run pytest tests/integration/test_pipeline_e2e.py -m requires_openrouter -x` | ❌ W0 | ⬜ pending |
| 03-11-* | 11 | 4 | GEN-12 (continues) | — | Repeated `pipeline(stripe_spec)` produces ZERO Qwen calls (L1 hit) | integration | `uv run pytest tests/integration/test_l1_warm_pass_2_3_4.py -x` | ❌ W0 | ⬜ pending |
| 03-* | * | * | Pitfall #7 | — | `description_hash` persisted; CLI/Langfuse surfaces "N changed since last gen" | integration | `uv run pytest tests/integration/test_description_diff.py -x` | ❌ W0 | ⬜ pending |
| 03-* | * | * | Pitfall #31 | T-03-OW | Read tools have explicit `readOnlyHint=true` AND `openWorldHint=true` | integration | `uv run pytest tests/integration/test_pass_4_cursor_invariant.py -x` | ❌ W0 | ⬜ pending |
| 03-* | * | * | Pitfall #2 (continues) | — | Smoke test verifies `extra_body` provider-routing forwarding | unit | `uv run pytest tests/test_smoke_qwen.py::test_extra_body_forwarded -m requires_openrouter -x` | ✅ Phase 2 | ⬜ pending |
| 03-37 | (CLI plan) | 3 or 4 | CLI consumer | — | `render_description.ts` pure-fn renders 5-component Description → markdown | unit | `cd apps/cli && bun test tests/test_render_description.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/generation-engine/tests/passes/pass_2/__init__.py` — pytest package marker
- [ ] `apps/generation-engine/tests/passes/pass_2/conftest.py` — Pass 2 fixtures (mocked Qwen via `pytest-httpx`; sample `Pass1Output` from Phase 2 fixtures)
- [ ] `apps/generation-engine/tests/passes/pass_3/__init__.py` + `conftest.py` (sample `Pass2Output` mocked + Phase 2 `Pass1Output` fixtures)
- [ ] `apps/generation-engine/tests/passes/pass_4/__init__.py` + `conftest.py` (sample `Pass3Output` mocked)
- [ ] `apps/generation-engine/tests/integration/test_pipeline_e2e.py` — full Stage A → Pass 4 with Phase 2 fixtures (Stripe + GitHub + Notion)
- [ ] `apps/generation-engine/tests/integration/test_description_diff.py` — Pitfall #7 mitigation
- [ ] `apps/generation-engine/tests/integration/test_pass_4_cursor_invariant.py` — Pitfall #31 IR shape (read tools have `readOnlyHint=true` + `openWorldHint=true`)
- [ ] `apps/generation-engine/tests/integration/test_l1_warm_pass_2_3_4.py` — GEN-12 continuation (zero Qwen calls on warm L1 hit)
- [ ] `apps/cli/tests/test_render_description.test.ts` — pure-fn test of markdown renderer for 5-component Description
- [ ] Framework install: `uv add tiktoken` (cl100k_base encoding for length-budget enforcement); promote `jsonschema` from transitive to direct dep in `apps/generation-engine/pyproject.toml`
- [ ] `pytest-httpx` already present from Phase 2 — no new install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP Inspector loads stub `server.ts` and displays full descriptions + annotations badges | Phase 3 acceptance / D-38 | MCP Inspector is a TUI tool; not scriptable in CI without browser automation | After Wave 4 E2E test passes, run: `cd ./mcpgen-output/stripe-api && npx @modelcontextprotocol/inspector node server.ts`; verify `tools/list` shows 6–12 tools with full descriptions, real `inputSchema`, and read-only/destructive badges |
| Cursor confirmation invariant (Pitfall #31) — actual Cursor desktop behavior on read tools | GEN-06 / Pitfall #31 | Cursor desktop client is third-party; runtime verification requires installing Cursor and registering the stub server | Phase 5 F3 client-mock owns this; Phase 3 only verifies the IR shape (`readOnlyHint=true` + `openWorldHint=true` for every read tool) via `test_pass_4_cursor_invariant.py` |
| Description-diff CLI rendering visual check | Pitfall #7 / D-14 | CLI text output rendering quality is subjective | After two consecutive `npx mcpgen init <stripe-spec>` runs, verify CLI prints "N of M descriptions changed since last generation" with reasonable formatting (no terminal corruption) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (per-task pytest module is the per-commit check)
- [ ] Wave 0 covers all MISSING references (test scaffolding + `tiktoken` install + `jsonschema` promotion)
- [ ] No watch-mode flags (every test runs once, exits with status code)
- [ ] Feedback latency < 180 s (per-task quick-run); < 300 s (per-wave full suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-28
