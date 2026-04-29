---
phase: 4
slug: generation-engine-shape-codegen-pass-5-stage-e
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `04-RESEARCH.md` §"Validation Architecture" + `04-CONTEXT.md` D-43/D-44 fixture rules + ROADMAP.md Phase 4 success criteria.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (engine)** | pytest 8.x with `requires_openrouter` marker (existing per Phase 2 conftest) |
| **Framework (CLI / generated TS)** | `bun:test` for `apps/cli/`; `tsc --noEmit` is the primary gate for generated tenant Workers |
| **Config file** | `apps/generation-engine/pyproject.toml` (pytest); `apps/cli/bunfig.toml` (Bun); generated dir's `tsconfig.json` for `tsc` |
| **Quick run command** | `cd apps/generation-engine && uv run pytest -m 'not requires_openrouter' -q` (engine unit + non-LLM); `cd apps/cli && bun test` (CLI) |
| **Full suite command** | `pnpm -r test` (root); engine LLM-bearing tests gated behind `requires_openrouter` only run when `OPENROUTER_API_KEY` is set |
| **Generated-Worker validation** | `cd ./mcpgen-output/<spec-slug> && npx tsc --noEmit` (run from Stage E phase 6 + fixture acceptance) |
| **Bundle-size capture** | `cd ./mcpgen-output/<spec-slug> && npx wrangler@4 deploy --dry-run --outdir /tmp/mcpgen-bundle 2>&1 \| grep 'gzip:'` |
| **Estimated runtime** | engine quick: ~10s; engine full (no Qwen): ~30s; engine full + Qwen: ~3–5min; Stripe golden E2E: ~3min cold / ~30s warm |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/generation-engine && uv run pytest -m 'not requires_openrouter' -q` (≤10s feedback latency).
- **After every plan wave:** Run `pnpm -r test` (full TS + Python suite, ≤2min). Wave 4 + Wave 5 also run the Stripe golden E2E.
- **Before `/gsd-verify-work`:** Full suite green AND Stripe + GitHub + Notion fixtures pass `tsc --noEmit` clean AND MCP Inspector manual gate (plan `04-13`) signed off.
- **Max feedback latency:** 30 seconds (per-task quick run).

---

## Per-Task Verification Map

> Built top-down from CONTEXT.md decisions + RESEARCH.md §"Validation Architecture". The planner expands each plan's tasks into rows here as plans land.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-* | 04-01 | 1 | GEN-07 | — | Pass 5 Phase 1 deterministic pagination strategy detection (cursor / offset / page-number / none) per CONTEXT D-08 | unit | `cd apps/generation-engine && uv run pytest tests/passes/pass_5/test_pagination.py -q` | ❌ W0 | ⬜ pending |
| 04-02-* | 04-02 | 1 | GEN-07 | — | Pass 5 Phase 2 deterministic outputSchema extraction per CONTEXT D-26 (Zod 4 native + conservative-format fallback) | unit | `cd apps/generation-engine && uv run pytest tests/passes/pass_5/test_output_schema.py -q` | ❌ W0 | ⬜ pending |
| 04-03-* | 04-03 | 2 | GEN-07 | T-Pitfall-#10 | Pass 5 Phase 3 Qwen field ranking (concurrency 10) + heuristic pre-ranking + 1-retry-then-deterministic-fallback per CONTEXT D-09/D-11 | integration | `cd apps/generation-engine && uv run pytest -m requires_openrouter tests/passes/pass_5/test_field_ranking.py -q` | ❌ W0 | ⬜ pending |
| 04-04-* | 04-04 | 2 | GEN-07 | T-Pitfall-#5 | Pass 5 Phase 4 truncation guidance templates per CONTEXT D-07 — anti-loop wording mandatory ("usually sufficient" or "only paginate if user explicitly requested all"); search NEVER mentions next_cursor | unit | `cd apps/generation-engine && uv run pytest tests/passes/pass_5/test_truncation.py -q` | ❌ W0 | ⬜ pending |
| 04-05-* | 04-05 | 2 | GEN-07 | — | Pass 5 Phase 5 response_format enum gate per CONTEXT D-10 (only when >20 fields AND tool ∈ {fetch, action, specialized}); cross-tool consistency for pagination + cursor/offset names | unit | `cd apps/generation-engine && uv run pytest tests/passes/pass_5/test_response_format.py tests/passes/pass_5/test_validation.py -q` | ❌ W0 | ⬜ pending |
| 04-06-* | 04-06 | 3 | GEN-08 | T-Pitfall-#30 | Stage E scaffold templates (package.json, wrangler.toml, tsconfig, README, .mcpgen.yaml, .gitignore, index.ts, server.ts, config.ts) + IR addition `StageEManifest` Zod type per RESEARCH Open Q1 + IR addition `QualityReport.bundle_size_kb` / `pipeline_versions` per CONTEXT D-42; server.name template `{tenant_short_id}-{spec_slug}` per D-25 | unit | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_scaffold.py -q` | ❌ W0 | ⬜ pending |
| 04-07-* | 04-07 | 3 | GEN-08 | T-Pitfall-#33 | Stage E schemas templates (`inputs.ts`, `outputs.ts` with Zod 4 native + conservative-format fallback per CONTEXT D-26, `routing.ts`); JSON Schema validity + format-stripping verified | unit | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_schemas.py -q` | ❌ W0 | ⬜ pending |
| 04-08-* | 04-08 | 3 | GEN-08 | T-Pitfall-#4, T-Pitfall-#12 | Stage E runtime modules (smart_id, pagination, truncation, upstream, response_shaping, errors, capability per CONTEXT D-24, sentry_redact per CONTEXT D-23); error templates teach next-step per CONTEXT D-32 | unit | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_runtime.py -q` | ❌ W0 | ⬜ pending |
| 04-09-* | 04-09 | 3 | GEN-08 | T-Pitfall-#15 | Stage E auth middleware (3 modes per CONTEXT D-21: passthrough/stored/OAuth) + mandatory `hostHeaderValidation` (or SDK transport `enableDnsRebindingProtection: true`) per CONTEXT D-22; `@cloudflare/workers-oauth-provider` 0.2.x pin verified per RESEARCH Open Q4 | unit | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_auth.py -q` | ❌ W0 | ⬜ pending |
| 04-10-* | 04-10 | 4 | GEN-08 | T-Pitfall-#5 | Stage E per-tool-type handler templates (search / fetch / list_collections / list_objects / upsert / delete / action / workflow / specialized) per CONTEXT D-31; truncation messages match D-07 anti-loop table | unit | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_handlers.py -q` | ❌ W0 | ⬜ pending |
| 04-11-* | 04-11 | 4 | GEN-08 | T-Pitfall-#8 | Stage E phase 6 validation: `tsc --noEmit` + `wrangler deploy --dry-run` bundle-size capture per CONTEXT D-27/D-28; soft warn 800–950KB / hard fail >950KB; hoisted node_modules in `packages/codegen-templates/` per CONTEXT D-39 | integration | `cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_validate.py -q` | ❌ W0 | ⬜ pending |
| 04-12-* | 04-12 | 5 | GEN-07, GEN-08 | T-Pitfall-#7 | E2E pipeline test: `Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4 → Pass 5 → Stage E` on Stripe + GitHub + Notion fixtures; `tsc --noEmit` clean; bundle <950KB; cache-warm second run produces zero Qwen calls per CONTEXT D-36 | integration | `cd apps/generation-engine && uv run pytest -m requires_openrouter tests/integration/test_phase_4_e2e.py -q` | ❌ W0 | ⬜ pending |
| 04-13-* | 04-13 | 5 | GEN-07, GEN-08 | T-Pitfall-#4 | MCP Inspector manual gate per CONTEXT D-30: Stripe MCP loaded into `npx @modelcontextprotocol/inspector`; `fetch` invoked with `X-Upstream-Auth: Bearer ${STRIPE_TEST_KEY}` returns dual `content` + `structuredContent` per MCP 2025-06-18; evidence stored at `.planning/phases/04-…/04-13-INSPECTOR-EVIDENCE.md` | manual | n/a (operator) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Threat refs: T-Pitfall-#N maps to `.planning/research/PITFALLS.md` §#N. Phase 4 owns #4, #5, #8, #12, #15, #28, #30, #33.*

---

## Wave 0 Requirements

- [ ] `apps/generation-engine/tests/passes/pass_5/__init__.py` — package marker
- [ ] `apps/generation-engine/tests/passes/pass_5/conftest.py` — shared Pass 5 fixtures (`spec_with_cursor_pagination`, `spec_with_offset_pagination`, `spec_no_pagination`, `spec_with_oauth`, `spec_with_aws_signature`)
- [ ] `apps/generation-engine/tests/passes/pass_5/test_pagination.py` — Wave 0 stub (skip-only) covering Pass 5 Phase 1 deterministic pagination detection
- [ ] `apps/generation-engine/tests/passes/pass_5/test_output_schema.py` — Wave 0 stub (skip-only) covering Pass 5 Phase 2 deterministic outputSchema extraction
- [ ] `apps/generation-engine/tests/passes/pass_5/test_field_ranking.py` — Wave 0 stub (skip-only, `@pytest.mark.requires_openrouter`) covering Pass 5 Phase 3 Qwen field ranking
- [ ] `apps/generation-engine/tests/passes/pass_5/test_truncation.py` — Wave 0 stub (skip-only) covering Pass 5 Phase 4 truncation guidance templates + anti-loop wording assertions
- [ ] `apps/generation-engine/tests/passes/pass_5/test_response_format.py` — Wave 0 stub (skip-only) covering Pass 5 Phase 5 response_format enum gate
- [ ] `apps/generation-engine/tests/passes/pass_5/test_validation.py` — Wave 0 stub (skip-only) covering Pass 5 cross-tool consistency
- [ ] `apps/generation-engine/tests/stages/__init__.py` + `apps/generation-engine/tests/stages/stage_e/__init__.py` — package markers
- [ ] `apps/generation-engine/tests/stages/stage_e/conftest.py` — shared Stage E fixtures (`final_tools_stripe`, `final_tools_github`, `final_tools_oauth_server`, `final_tools_aws_sigv4`)
- [ ] `apps/generation-engine/tests/stages/stage_e/test_scaffold.py` — Wave 0 stub (skip-only) covering Stage E phase 1 + IR additions
- [ ] `apps/generation-engine/tests/stages/stage_e/test_schemas.py` — Wave 0 stub (skip-only) covering Stage E phase 2 + Zod conservative-format fallback
- [ ] `apps/generation-engine/tests/stages/stage_e/test_runtime.py` — Wave 0 stub (skip-only) covering Stage E phase 3 + capability + sentry_redact
- [ ] `apps/generation-engine/tests/stages/stage_e/test_auth.py` — Wave 0 stub (skip-only) covering Stage E phase 4 + 3 auth modes + DNS-rebinding mitigation
- [ ] `apps/generation-engine/tests/stages/stage_e/test_handlers.py` — Wave 0 stub (skip-only) covering Stage E phase 5 + per-tool-type templates
- [ ] `apps/generation-engine/tests/stages/stage_e/test_validate.py` — Wave 0 stub (skip-only) covering Stage E phase 6 + tsc + wrangler dry-run
- [ ] `apps/generation-engine/tests/integration/test_phase_4_e2e.py` — Wave 0 stub (skip-only) covering full pipeline + cache-warm second run
- [ ] `packages/engine-fixtures/{stripe,github,notion,linear,slack}/pass-5-output.json` — Wave 0 placeholder (one-line `{}` json) replaced with hand-tuned fixture in plan 04-12
- [ ] `packages/engine-fixtures/{stripe,github,notion,linear,slack}/stage-e-output/MANIFEST.json` — Wave 0 placeholder replaced with hand-tuned fixture in plan 04-12
- [ ] `packages/codegen-templates/templates/.gitkeep` (Phase 1 created the package; Phase 4 fills `templates/*.j2`)
- [ ] `packages/codegen-templates/package.json` — pinned devDependencies for hoisted node_modules per CONTEXT D-27/D-39: `typescript@^5.9` + `wrangler@^4` + `@modelcontextprotocol/sdk@^1.x` + `@cloudflare/workers-oauth-provider@~0.2` + `zod@^4` + `@sentry/cloudflare@^10` + `@cloudflare/workers-types@^4`
- [ ] `apps/cli/src/init/write_stage_e_output.ts` — Wave 0 stub replacing retired `render_stub.ts` per CONTEXT D-37/D-38
- [ ] `apps/cli/src/init/render_stub.ts` removed in plan 04-12 (atomic with write_stage_e_output.ts taking over)

*Wave 0 closes once every test file above exists with at least one `@pytest.skip` or `bun test.skip` placeholder so the framework discovers the file but every test always skips. This pattern matches Phase 2 D-50 / Phase 3 D-04.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP Inspector E2E with Stripe test-mode key | GEN-07, GEN-08 (success criterion #5) | Inspector binary not designed for headless CI; first-time end-to-end smoke is high-signal but operator-driven; Stripe test-mode credentials never logged | (1) Run `pipeline(stripe.openapi.json)` via engine HTTP API. (2) `cd ./mcpgen-output/stripe && npm install && npx @modelcontextprotocol/inspector`. (3) Verify `tools/list` shows 6–12 tools with full descriptions / inputSchemas / annotations / outputSchemas. (4) Set `X-Upstream-Auth: Bearer ${STRIPE_TEST_KEY}`, invoke `fetch` with a known smart ID (`stripe:object:Charge:ch_3*` from Stripe sandbox). (5) Verify response has both `content` (text) AND `structuredContent` (object). (6) Capture screenshot/transcript to `.planning/phases/04-…/04-13-INSPECTOR-EVIDENCE.md`. |
| `@cloudflare/workers-oauth-provider` 0.2.x API stability check | GEN-08 (auth mode #3) | Pre-1.0 dep; API may change between research and execution day | `cd packages/codegen-templates && npm pack @cloudflare/workers-oauth-provider@~0.2` → unzip → inspect `index.d.ts` against research §10.6 expected exports (`OAuthProvider`, `OAuthClientConfig`, `OAuthHandler` or equivalent). If the API shape diverges from the research-recorded shape, plan 04-09 stops and flags `BLOCKED-OAUTH-API-DRIFT` for human review. |
| Capability-gating against a real `<2025-06-18` mock client | GEN-08 (Pitfall #4) | F3 (Phase 5) covers automated; Phase 4 manual gate sanity-checks the runtime helper before F3 lands | Hand-craft a `tests/integration/test_capability_gate.py` invocation with `protocolVersion: "2024-11-05"`; assert `tools/list` response strips `outputSchema` from every tool; assert `tools/call` response has `content` only (no `structuredContent`). |

*All other Phase 4 behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual gate `04-13` is the sole exception, paired with automated E2E `04-12`)
- [ ] Wave 0 covers all MISSING references (every test file in the per-task map exists as a skip-only stub before Wave 1)
- [ ] No watch-mode flags (`pytest -q`, `bun test`, `tsc --noEmit` are all single-shot)
- [ ] Feedback latency < 30s for per-task quick run (engine non-LLM unit tests)
- [ ] `nyquist_compliant: true` set in frontmatter once all rows in the per-task map flip to ✅
- [ ] Stripe + GitHub + Notion fixtures pass `tsc --noEmit` clean (zero warnings — design contract per CONTEXT D-43.5)
- [ ] Bundle size < 950KB on every fixture (D-28); soft-warn between 800–950KB logged in `QualityReport.warnings`
- [ ] Cache-warm second run on Stripe produces ZERO Qwen calls per CONTEXT D-36 / GEN-12 invariant
- [ ] MCP Inspector evidence file `04-13-INSPECTOR-EVIDENCE.md` committed before phase verification

**Approval:** pending
