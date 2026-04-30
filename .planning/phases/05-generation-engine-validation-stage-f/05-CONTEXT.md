# Phase 5: Generation Engine — Validation (Stage F) - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Workstream:** `engine` (single-terminal — `.planning/workstreams/` not active per Phases 2/3/4; phase-local state under `.planning/phases/05-…/`).
**Mode:** Auto-mode discussion (`--auto`); recommended option selected for each gray area, rationale logged inline. User-driven constraints flowing in later (manual edit before plan-phase) supersede auto-selections.

<domain>
## Phase Boundary

Final LLM-bearing phase of the Generation Engine. Delivers **Stage F (Validation)** — the three-tier quality gate that runs after Stage E and produces the user-visible Quality Badge:

- **F1 (Static Validation)** — deterministic, $0, < 10s, ALWAYS runs. `tsc --noEmit` + `ajv` (JSON-Schema validator) + ESLint + bundle-size gate (< 800KB pass / 800–950KB warn / > 950KB fail per `packages/contracts/launch-criteria.ts`) + MCP protocol compliance (4 annotations + `openWorldHint=true` invariant + `mcp_protocol_version` pinned) + `gitleaks` secret scan + smart-ID regex compile + cross-tenant smart-ID fuzz check (Pitfall #1) + routing completeness vs Pass 1 routing table + auth middleware presence + **OpenAI compliance fixture for `search`/`fetch` exact signatures (Pitfall #32)**. Each failed check maps deterministically to a specific upstream-pass retry per `docs/mcpgen-stage-f-design.md` Appendix A. **Fail-closed:** F1 failure blocks F2/F3.
- **F2 (Smell Scan)** — single Qwen3-Coder × **5-shuffle prompt averaging** × **3-temperature variance** (T = 0.0 / 0.2 / 0.5) = **15 evaluations per tool** per `docs/mcpgen-model-and-provider-override.md` §4. Cost ~$0.20–0.50 / 20–30s. 6-component paper rubric (Purpose / Guidelines / Limitations / Parameter Explanation / Length & Completeness / Examples — Examples expected to score 1–2 in v0, NOT a pass blocker). Threshold for pass = `LAUNCH_CRITERIA.F2_SMELL_MIN` (≥ 4.0, imported, NEVER hardcoded). **Between-tool σ ≥ 0.4 discrimination metric (Pitfall #9 mitigation)** — flags low-confidence runs and force-triggers F3 even on free tier. Per-component failures trigger targeted upstream-pass retries (max 2 rounds, cached prior-pass outputs reused).
- **F3 (Agent Eval)** — real **Sonnet 4.7 test agent** (the documented exception to the Qwen3-Coder override per `docs/mcpgen-model-and-provider-override.md` §0 — F3 simulates production agent behavior, NOT generation pipeline) drives ≥ 10 golden tasks per server. **Hybrid environment** (Stage F design §5.2): real sandbox for top 10 APIs (Stripe test mode, GitHub test orgs, Notion test workspace, Linear test, Slack test, Calendar test, etc.), mocked upstream for the rest. **Two-tier evaluator** (rule-based + LLM judge) per MCP-Bench arXiv 2508.20453. **Mock client harness** covers Cursor (Pitfall #31 — read-only confirmation skip), Claude Desktop (Pitfall #4 — capability negotiation for older protocol), and ChatGPT Deep Research (Pitfall #32 — `search(query: string)` / `fetch(id: string)` signature compliance). Pass criterion = `LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN` (≥ 0.7). Cost ~$1–3 / 1–3 min. **Opt-in by default; auto-triggered if F2 < 4.0 or F2 between-tool σ < 0.4.**
- **Targeted retry orchestration** — F failure → specific upstream pass retry, max 2 retry rounds per generation, cached prior-pass outputs (L2) reused (~5x cheaper than full regen per Stage F design §8.2). After exhausted retries → terminal failure (degraded deploy with warnings in QualityReport).
- **QualityReport** — composite 0–5 score + Quality Badge (`premium` ≥ 0.85 F3 / `verified` ≥ 0.7 F3 / `standard` / `needs_review`) per `packages/ir/python/types.py::QualityBadge` (Phase 1 frozen).

End-to-end:
```
Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4 → Pass 5 → Stage E    (Phases 2/3/4 — DONE)
                                                                       ↓
                                                       FinalTool[] + StageEManifest
                                                                       ↓
                                                            ┌──────────┴──────────┐
                                                            │  F1: Static (always)│  Phase 5
                                                            └──────────┬──────────┘
                                                                       ↓ pass
                                                            ┌──────────┴──────────┐
                                                            │  F2: Smell (always) │
                                                            │  Qwen × 5 × 3 = 15  │
                                                            │  σ ≥ 0.4 metric     │
                                                            └──────────┬──────────┘
                                                                       ↓ ≥ 4.0 OR σ < 0.4 OR opt-in
                                                            ┌──────────┴──────────┐
                                                            │  F3: Agent Eval     │
                                                            │  Sonnet 4.7 + tasks │
                                                            │  Hybrid sandbox     │
                                                            │  Mock-client harness│
                                                            └──────────┬──────────┘
                                                                       ↓
                                                            ┌──────────┴──────────┐
                                                            │  Quality Report     │
                                                            │  + Badge            │
                                                            │  + Retry Triggers   │
                                                            └──────────┬──────────┘
                                                                       ↓
                                                              SSE: F1 / F2 / F3 events
                                                              partial_result.phase
                                                              = "validation_complete"
```

**In scope:**
- **F1 Static** per `docs/mcpgen-stage-f-design.md` §3 + Phase 5 success criterion #1: orchestrate `tsc --noEmit` + `ajv` (JSON-Schema validator on inputSchema/outputSchema for every tool) + `ESLint` (already configured in Stage E template `package.json`) + bundle-size capture from Stage E output (re-uses `wrangler deploy --dry-run` output; F1 imposes the **hard gate** ≤ `LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE` from `packages/contracts/launch-criteria.ts` — Phase 4 D-28 emits the value, Phase 5 hard-blocks at > 950 KB) + MCP protocol compliance (4 boolean annotations explicit per Pass 4 invariant; `openWorldHint = true` always; `mcp_protocol_version` = `"2025-06-18"`; `tools/list` JSON serializable; smart-ID `pattern` regex compiles) + gitleaks secret scan (no `sk_live_`, `ghp_`, AWS keys, generic high-entropy strings in generated code) + smart-ID **cross-tenant fuzz check** (synthesize 2 tenants from same spec; verify dispatched server rejects IDs whose `tenant_short_id` prefix doesn't match — Pitfall #1) + routing completeness vs Pass 1 `Routing.collections` (every collection has at least one route, every smart ID format auto-generated by Pass 3 D-21 maps to a Pass 1 routing rule) + auth middleware presence (`hostHeaderValidation` middleware appears before any other auth check per Pitfall #15) + **OpenAI compliance fixture (Pitfall #32)** — hardcoded canonical `search(query: string)` and `fetch(id: string)` schemas; **diff-fail** the build if Pass 1 / Pass 3 ever drift (this prevents future Pass 1 "improvements" from breaking ChatGPT Deep Research). Each failed check tied to a specific upstream-pass retry per Stage F design §3.3 + Appendix A.
- **F2 Smell scan** per `docs/mcpgen-stage-f-design.md` §4 + Phase 5 success criterion #2 + `docs/mcpgen-model-and-provider-override.md` §4: **single Qwen3-Coder judge** × 5-shuffle prompt averaging × 3-temperature variance (T = 0.0 / 0.2 / 0.5) = 15 LLM calls per tool. Per-tool 6-component rubric scoring (1–5 each, integers per design Appendix B). Aggregation: per-tool average across 15 evaluations; per-server overall = mean of per-tool averages. Pass condition: overall ≥ `LAUNCH_CRITERIA.F2_SMELL_MIN`. **Between-tool σ ≥ 0.4 discrimination metric** (mode-collapse detection, Pitfall #9): if `np.std([t.average for t in tool_scores]) < 0.4` → flag `low_confidence_run = true` and force-trigger F3. **Per-component failures → targeted retries:** Purpose < 3 → Pass 2 / Guidelines < 3 → Pass 2 / Limitations < 3 → Pass 2 / Parameter Explanation < 3 → Pass 3 / Length issues → Pass 2 / Examples < 3 → expected (deferred to v1.1 — DO NOT retry per Stage F design §4.5).
- **F3 Agent Eval** per `docs/mcpgen-stage-f-design.md` §5 + Phase 5 success criterion #3: real **Sonnet 4.7 test agent** (documented exception to Qwen3-Coder per Override doc — `claude-sonnet-4-6-20250929` since Anthropic SDK; **NOT** to be confused with the engine's Qwen3-Coder), spawns generated tenant Worker via `wrangler dev --local` subprocess (port-forwarded; ephemeral; killed at task end), invokes ≥ 10 golden tasks per server. **Two-tier evaluator** per MCP-Bench arXiv 2508.20453: Tier 1 rule-based (tool validity / schema compliance / runtime success / dependency order / iteration efficiency) + Tier 2 LLM judge (task completion ≥ 7 / tool usage / planning / grounding ≥ 6, per design §5.5 — judge is **Qwen3-Coder per Override doc**; the Sonnet exception is for the test AGENT, not the judge). Per-task pass criterion: `rule_based.all() AND judge.task_completion ≥ 7 AND judge.grounding ≥ 6`. Per-server pass criterion: `pass_rate ≥ LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN`. Hybrid environment: top-10 APIs in **real sandbox** (operator-managed test-mode credentials in `.env.local`); rest in **mocked** environment via Python-side spec-derived mock-response generator (`packages/engine-fixtures/<spec>/mock_upstream.py` — auto-generated from spec examples + parameter analysis).
- **Mock client harness** per Phase 5 success criterion #3 + Pitfalls #4/#31/#32: minimum 3 simulated MCP clients run against every F3 generation:
  1. **Cursor mock** — verifies read-only tools (`search`, `fetch`, `list_*`) do NOT prompt for confirmation under `openWorldHint = true + readOnlyHint = true` (Pitfall #31). Test asserts: zero `agent paused for confirmation` events on read tools.
  2. **Claude Desktop mock (older)** — sends `protocolVersion = "2024-11-05"` during initialize; verifies `tools/list` response omits `outputSchema` field for older clients per Phase 4 D-24 capability negotiation (Pitfall #4); verifies `tools/call` returns `content` only (no `structuredContent`).
  3. **ChatGPT Deep Research mock** — verifies `search` tool inputSchema = exactly `{type: "object", properties: {query: {type: "string"}}, required: ["query"], additionalProperties: false}`; same shape for `fetch` with `id: string` only. Diff-fails if any drift (Pitfall #32). This is **also** F1's hardcoded fixture — duplicated at F3 level to catch runtime drift (e.g., handler reads extra params).
- **Targeted retry orchestration** per `docs/mcpgen-stage-f-design.md` §8: when F-tier failures map to specific upstream passes (per Appendix A failure-pattern table), `pipeline.py` skips preceding passes (their outputs cached at L2 from Phase 2/3/4), re-runs only the targeted pass with retry-feedback context, cascades subsequent passes (e.g., if Pass 2 retried, Pass 3+4+5+Stage E must re-run from cache or freshly), then re-runs Stage F. **Maximum 2 retry rounds per generation.** After 2 rounds → terminal failure (degraded deploy: server still produced, warnings recorded in `QualityReport`, `quality_badge = needs_review`). Retry decision matrix logged in SSE event `F2:retry_planned` / `F3:retry_planned` so frontend can surface progress. **L2 cache invalidation on retry** — only the targeted pass + downstream passes invalidated; predecessor pass outputs re-used directly (~5x cheaper than full regen per design §8.2).
- **Hallucination prevention on retry (Pitfall #10):** every Pass 2 retry-prompt re-includes the forbidden-pattern catalogue + examples-only-from-spec policy. F1's `examples` field check re-runs after every Pass 2 retry: regex-extract `examples` arrays from `Pass2Output`, fingerprint each example against the source spec content (substring match against `RawIR.endpoints[*].request_body.examples` / `responses[*].schema.examples`), non-derivable example → fail with `EXAMPLES_HALLUCINATED`. Inline Haiku-gate-equivalent (single Qwen judge with abbreviated 4-component rubric per Phase 3 D-04) re-runs after every Pass 2 retry.
- **Pipeline orchestrator** (`apps/generation-engine/src/mcpgen_engine/pipeline.py`) extended to chain F1 → F2 → F3 → terminal `validation_complete` after the existing `shape_codegen_complete` from Phase 4. New SSE events per Phase 2 D-47 / Phase 3 D-44 / Phase 4 D-33 staged-delivery model:
  ```
  F1:started → F1:completed     # always emitted; partial_result.f1_result = F1Static
  F2:started → F2:completed     # always emitted; partial_result.f2_result = F2Smell + low_confidence_flag
  F2:retry_planned (optional)   # emits per-tool retry triggers if any
  F3:started → F3:completed     # emitted iff F3 enabled OR auto-triggered; partial_result.f3_result = F3AgentEvalReport
  F3:retry_planned (optional)
  validation_complete           # terminal status; partial_result.quality_report = QualityReport
  ```
  Backward compatibility: `shape_codegen_complete` continues as a sub-status during the run; the terminal `partial_result.phase` becomes `validation_complete` for Phase 5 successful completion.
- **Cost & quota gates** — F3 cost ($1–3 with Sonnet) is the dominant unit-cost. Phase 5 wires the **runtime cost cap** check (`packages/contracts/launch-criteria.ts` continues to be the single source of truth — F2/F3 thresholds imported, NEVER hardcoded). Quota enforcement is **deferred to Phase 8** (Stripe Meters + TimescaleDB hourly aggregates); Phase 5 ships a **stub quota check** that reads `MCPGEN_F3_FREE_BUDGET_PER_GENERATION` env var (default `1` = always allow) — Phase 8 replaces with Stripe lookup. **Cost cap exceeded** → hard fail with partial result (F1+F2 always; F3 partial if started) + bill (Phase 8 attaches Stripe charge).
- **Engine HTTP API extension** — `POST /api/v1/generate` request body gains optional `f3_enabled: bool` (default `false`; auto-set to `true` when F2 fails or σ < 0.4) + `sandbox_credentials: dict | None` (operator-managed credentials for top-10 sandbox APIs; never persisted; passed as request-scoped to F3 subprocess). New strictly-additive endpoint: `GET /api/v1/generate/{job_id}/quality-report` — returns the full `QualityReport` after `validation_complete`. F1/F2/F3 SSE events flow over the existing SSE channel (no new channel).
- **CLI** (`apps/cli/src/init/`) — extends `write_stage_e_output.ts` from Phase 4 D-37 with progress display for F1/F2/F3 stages (terminal output: `F1: ✓ 18/18 checks` / `F2: 4.3 / 5.0 (overall) — running F3...` / `F3: 8/10 tasks pass — Quality: verified`). New flag `--f3` opts into agent eval (default off in CLI; engine still auto-triggers if F2 < 4.0 or σ < 0.4). New flag `--sandbox-creds <path>` for operator-supplied test credentials (read from a YAML or `.env`-style file, NEVER from arg directly to avoid shell-history leak). CLI shows the final `QualityReport` summary + retry-triggered warnings if any.
- **Validation against the 5 fixtures in `packages/engine-fixtures/{stripe,github,notion,linear,slack}/`** — each fixture gains a hand-tuned `quality-report.json` reference (the file already exists from Phase 1 as a placeholder; Phase 5 fills it with realistic F1/F2/F3 expectations). Phase 5 acceptance: end-to-end run on Stripe + GitHub + Notion produces `Pass5Output` ≥ Phase 4's reference + `QualityReport` matching the structural shape (F1 passes; F2 overall ≥ 4.0; F3 pass rate ≥ 0.7 against hand-tuned golden tasks). Linear + Slack are looser targets (F2 ≥ 3.5; F3 ≥ 0.5; both reach `verified` minimum on a fresh run is the **launch criterion**, not the Phase 5 gate).
- **Pitfall mitigations Phase 5 owns** (per ROADMAP.md Phase 5 entry): #9 (F2 single-judge mode-collapse — between-tool σ ≥ 0.4 discrimination metric), #10 (post-retry hallucination — F1 re-runs after every retry, regex `examples` against spec content), #31 (Cursor mock client in F3 verifies read-only tools don't prompt for confirmation), #32 (ChatGPT Deep Research compliance regression — F1 hardcodes canonical `search`/`fetch` parameter sets and diff-fails on drift).

**Out of scope (later phases):**
- **Tenant Worker dispatch + 3 auth-mode runtime end-to-end + smart-ID `{tenant_short_id}-` prefix substitution at deploy time + capability-routed dispatch + KV fallback bucket + 5-min reconciliation cron** — Phase 6. Phase 5 F3 spawns the generated server via `wrangler dev --local` subprocess, NOT via the dispatch Worker.
- **Frontend wire-up of F1/F2/F3 progress + Quality Badge display + per-tool score breakdown in the preview screen** — Phase 7 (UI is locked from `claude-design-ui/MCP-Gen.zip`).
- **Stripe Meters + billing + quota enforcement + cost cap (real)** — Phase 8. Phase 5 ships an env-var stub quota check; Phase 8 replaces with Stripe lookup.
- **Drift Watcher full implementation** — Phase 8. Phase 5 does NOT trigger regen on spec drift; Phase 8 owns the daily cron.
- **Sentry DSN filling + Langfuse dashboards + BetterStack uptime monitoring of generated tenant Workers** — Phase 9. Phase 5 emits Langfuse traces with empty DSN.
- **Cross-tenant fuzz testing in production** + **multi-client smoke against real Claude Desktop / Cursor / ChatGPT** + **Inngest orphan audit** — Phase 9. Phase 5 ships the **mock client harness** (synthetic clients in test code); Phase 9 runs the **real client smoke** against deployed servers.
- **Quarterly judge calibration with human evaluators** — operational concern post-launch (per Stage F design §4.7). Phase 5 ships the calibration scaffolding (a `packages/engine-fixtures/calibration/` directory with 30 hand-scored tools placeholder); the actual quarterly run is post-launch.
- **Multi-provider OpenRouter routing for F2** (broaden `provider.order` from `["atlas-cloud"]` to a list when F2 σ < 0.4 too often) — DEFERRED. Phase 5 ships the **single-provider** F2 + the σ ≥ 0.4 discrimination metric; if production data shows the metric forces F3 too often, Phase 8/9 evaluates the fallback.
- **F3 user-supplied golden tasks (Pro feature)** — Phase 5 ships the JSON schema for `GoldenTask` + an example file; the Pro plan + Stripe gating is Phase 8.
- **Real Cloudflare Workers deploy of generated tenant Workers** (`mcpgen deploy` CLI command + Phase 6 dispatch Worker substitution of `{tenant_short_id}-` prefix) — Phase 6.
- **Real OAuth handshake exercised end-to-end** — Phase 6 + Phase 8.
- **Multi-region Fly.io deployment of engine + Anthropic API key vault for F3 test agent** — Phase 10. Phase 5 reads `ANTHROPIC_API_KEY` from `.env.local`.
- **Code-mode tool execution** — explicitly out of MVP per `.planning/PROJECT.md`.
- **Multi-runtime codegen (Node.js / Deno / Vercel Edge)** — explicitly post-launch. Phase 5 validates CF Workers output only.
- **Continuous validation post-deploy** (re-run Stage F on schedule against deployed servers) — explicitly out of MVP per Stage F design §13. Phase 5 = pre-deploy quality gate only.
- **Cross-tool description coherence checks** (e.g., Pass 2 description for `upsert` references the same collection terminology used in `list_objects`) — would be a Phase 5 F2 sub-check; **DEFERRED** as a v1.1 enhancement (cost: extra LLM calls; benefit: marginal). Phase 5 F2 stays per-tool.

</domain>

<decisions>
## Implementation Decisions

### Sampling profile & agent factory (extension of Phases 2/3/4)

- **D-01:** **Reuse `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py::make_agent`** as the SOLE model construction site for F2. Same `_PROVIDER_ROUTING` (`atlas-cloud` / `fp8` / `allow_fallbacks=False`) is reused for every F2 LLM call. Pitfall #2 mitigation continues; smoke test (`test_smoke_qwen.py`) gates every Phase 5 PR. **Forbidden:** constructing `OpenAIModel` / `OpenAIProvider` anywhere outside `llm/client.py`. Auto-selected — Phase 2 D-04/D-05 contract intact.

- **D-02:** **F3 test agent uses real Sonnet 4.7 via Anthropic SDK** — the documented exception per `docs/mcpgen-model-and-provider-override.md` §0 + §7.3 + Phase 1 D-13. Implementation: a NEW module `apps/generation-engine/src/mcpgen_engine/llm/test_agent.py` constructs a separate Anthropic client (NOT through `make_agent` / OpenRouter) reading `ANTHROPIC_API_KEY` from env; explicit code-comment cites Override doc § 7.3 ("F3 test agent simulates production agent behavior, not generation pipeline"). Model id: `claude-sonnet-4-6-20250929` (or latest stable Sonnet 4.x at Phase 5 start). **F3 LLM judge stays on Qwen3-Coder via `make_agent`** — only the test AGENT is Sonnet; the JUDGE evaluating its trajectory is Qwen3-Coder per Override doc §0. Auto-selected — matches Override doc §7.3 explicitly.

- **D-03:** **Three new sampling profiles in `llm/sampling.py`**:
  - `F2_JUDGE_SETTINGS` — `temperature=0.0 / 0.2 / 0.5` (varied per shuffle iteration), `top_p=0.9`, `max_tokens=2048`, `extra_body=_PROVIDER_ROUTING`. The F2 implementation iterates over the 3 temperatures × 5 shuffles = 15 calls per tool. Three concrete settings shipped (`F2_JUDGE_SETTINGS_T00` / `F2_JUDGE_SETTINGS_T02` / `F2_JUDGE_SETTINGS_T05`) so the cache key is deterministic per shuffle slot.
  - `F3_JUDGE_SETTINGS` — `temperature=0.0`, `top_p=1.0`, `max_tokens=1024`, `extra_body=_PROVIDER_ROUTING`. Single judge call per task per metric (task_completion / tool_usage / planning / grounding); deterministic to maximize reproducibility of the LLM-judge tier.
  - `F3_TEST_AGENT_SETTINGS` — `temperature=0.7`, `top_p=1.0`, `max_tokens=4096`. **Anthropic-side settings** (NOT OpenRouter — uses a separate `anthropic.Anthropic` client). Higher temperature simulates real-user agent behavior (creativity in tool selection). Auto-selected — temperature matches Stage F design §5.4 + Override doc §3 sampling profiles.

### F1 Static Validation

- **D-04:** **Module layout under `apps/generation-engine/src/mcpgen_engine/stages/stage_f/`** mirrors Phase 2/3/4 D-04/D-19 patterns:
  ```
  stages/stage_f/
    __init__.py             # entry point: async def run(stage_e_output, raw_ir, pass_*_output, f3_enabled, sandbox_credentials) -> StageFOutput
    f1_static.py            # F1 orchestrator: invokes 11 deterministic checks
    f1_checks/              # one module per category — split for testability
      ts_compile.py         # invokes `npx tsc --noEmit`
      json_schema.py        # invokes `ajv` (Python-side via `jsonschema` lib for inputSchema/outputSchema)
      mcp_compliance.py     # 4-annotation invariant + openWorldHint=true + protocolVersion + tools/list serializability
      smart_id_fuzz.py      # cross-tenant smart-ID fuzz (synthesize 2 tenants; check ID-prefix isolation)
      routing_completeness.py
      auth_middleware.py    # grep-style check for hostHeaderValidation in middleware.ts
      secret_scan.py        # invokes `gitleaks` subprocess
      bundle_size.py        # imports captured wrangler dry-run KB from Stage E manifest; gates on FAIL_KB_EXCLUSIVE
      template_artifacts.py # AST check: no `{{` or `}}` left in any *.ts file
      openai_compliance.py  # canonical search/fetch fixture diff (Pitfall #32)
      examples_provenance.py # post-Pass-2-retry hallucination check (Pitfall #10)
    f2_smell.py             # F2 orchestrator: 5-shuffle × 3-temperature = 15 LLM calls per tool + σ metric
    f3_agent_eval.py        # F3 orchestrator: real Sonnet agent + golden tasks + 2-tier evaluator
    rubric.py               # 6-component rubric + scoring schemas + 5-shuffle prompt builder
    judge_prompts.py        # F2 judge system prompt + F3 judge system prompt (Qwen-side)
    test_agent_harness.py   # F3 test-agent loop with Sonnet (max 20 turns; trajectory recorder)
    server_runner.py        # F3 spawn `wrangler dev --local` subprocess; port-forward; cleanup
    mock_clients.py         # Cursor / Claude Desktop / ChatGPT Deep Research mock clients
    sandbox/                # real-API sandbox adapters
      stripe.py
      github.py
      notion.py
      linear.py
      slack.py
    mock_upstream.py        # spec-derived mock-response generator (for non-top-10 APIs)
    golden_tasks.py         # GoldenTask model + per-fixture loader
    retry_orchestrator.py   # F-failure → upstream-pass-retry decision matrix + max-2-rounds enforcement
    quality_report.py       # composite score + badge thresholds + serialization
    failure_patterns.py     # Stage F design Appendix A — failure pattern → retry pass mapping
  ```
  Auto-selected — file-list mirrors Pass 2/3/4 + Stage E patterns exactly. Planner has flexibility on internal sub-module boundaries (per Phase 2 D-50 Claude's discretion clause).

- **D-05:** **F1 = 11 deterministic checks** (each in a sibling module under `f1_checks/`), run sequentially in this order (cheapest first; abort early on hard failures):
  1. **bundle_size** — read `StageEManifest.bundle_size_kb`; if > 950 → hard fail `BUNDLE_SIZE_HARD` + suggested split. ($0, < 0.1s)
  2. **template_artifacts** — `grep -E "\{\{|\}\}" src/**/*.ts`; any hit → `STAGE_E_TEMPLATE_LEAKED` retry Stage E. ($0, < 0.5s)
  3. **smart_id_fuzz** — synthesize 2 synthetic tenants (`tenant_a-{spec}` / `tenant_b-{spec}`); call `runtime/smart_id.ts::parseSmartId` with cross-tenant IDs; expect rejection. ($0, < 1s)
  4. **mcp_compliance** — load `final-tools.json`; assert all 4 annotation booleans set per tool; assert `openWorldHint = true` invariant; assert `mcp_protocol_version = "2025-06-18"` in `.mcpgen.yaml`; assert `tools/list` JSON-serializable. ($0, < 1s)
  5. **routing_completeness** — load `pass-1-output.json` `Routing.collections` + `Routing.action_routes` + `Routing.workflow_routes`; assert every entry maps to at least one upstream endpoint in `RawIR.endpoints`. ($0, < 1s)
  6. **auth_middleware** — open `src/auth/middleware.ts`; regex match `hostHeaderValidation` BEFORE any other auth call. ($0, < 0.1s)
  7. **openai_compliance** — load canonical `search_signature.json` + `fetch_signature.json` from `packages/engine-fixtures/_canonical/` (Phase 5 hand-creates); diff against `final-tools.json` `search` + `fetch` `inputSchema`; any drift → `OPENAI_COMPLIANCE_DRIFT` retry Pass 1 OR Pass 3 depending on which field drifted. ($0, < 0.5s)
  8. **examples_provenance** — extract `examples` arrays from every `Pass2Output.tools[*].description.examples`; substring-match each against `RawIR.endpoints[*].request_body.examples` ∪ `responses[*].schema.examples`; any non-derivable → `EXAMPLES_HALLUCINATED` retry Pass 2. ($0, < 1s)
  9. **secret_scan** — `gitleaks detect --source ./mcpgen-output/<spec-slug>/ --no-git --redact`; any hit → `SECRETS_LEAKED` hard fail (do NOT retry — operator must intervene). ($0, ~2s)
  10. **json_schema** — for each tool, validate `inputSchema` + `outputSchema` against MCP's official JSON Schema validator (use `jsonschema` Python lib with the MCP schema bundle pinned in `packages/engine-fixtures/_canonical/mcp-schema.json`); any error → `JSON_SCHEMA_INVALID` retry Pass 3 / Pass 5. ($0, ~1s)
  11. **ts_compile** — `cd ./mcpgen-output/<spec-slug> && npx tsc --noEmit -p tsconfig.json` (re-uses Phase 4 D-27 pre-warmed `node_modules`); first-50 errors captured for retry context; any error → `TS_COMPILE_FAILED` retry Stage E. ($0, ~3–5s)
  Auto-selected — order minimizes wasted work: cheapest deterministic checks first, expensive subprocess (`gitleaks`, `tsc`) last.

- **D-06:** **F1 check → upstream-pass retry mapping** (frozen — `failure_patterns.py` const dict):
  | Failed F1 check | Retry target | Rationale |
  |---|---|---|
  | `BUNDLE_SIZE_HARD` (> 950 KB) | (terminal, no retry — surface `MULTI_SERVER_SPLIT_REQUIRED`) | A 1MB bundle isn't fixable by re-running a pass; user must split spec |
  | `STAGE_E_TEMPLATE_LEAKED` | Stage E | Jinja template bug — retry codegen |
  | `SMART_ID_CROSS_TENANT_LEAK` | Pass 1 + Stage E | Smart-ID schema or runtime parser bug |
  | `MCP_COMPLIANCE_FAIL` (annotations) | Pass 4 | Missing or wrong annotation |
  | `MCP_COMPLIANCE_FAIL` (protocol version) | Stage E | Template bug |
  | `ROUTING_INCOMPLETE` | Pass 1 | Routing table omits an endpoint |
  | `AUTH_MIDDLEWARE_MISSING` | Stage E | Template bug |
  | `OPENAI_COMPLIANCE_DRIFT` (search/fetch input) | Pass 1 | Schema synth re-introduced extra params |
  | `OPENAI_COMPLIANCE_DRIFT` (parameter rename) | Pass 3 | Parameter spec drift |
  | `EXAMPLES_HALLUCINATED` | Pass 2 | LLM made up examples |
  | `SECRETS_LEAKED` | (terminal, no retry — surface to operator) | Operator-side leak |
  | `JSON_SCHEMA_INVALID` (input) | Pass 3 | Bad input schema |
  | `JSON_SCHEMA_INVALID` (output) | Pass 5 | Bad output schema |
  | `TS_COMPILE_FAILED` | Stage E | Template bug |
  Auto-selected — extends Stage F design §3.3 + Appendix A.

- **D-07:** **F1 fail-closed semantics:** F1 failure (after retry exhaustion) blocks F2 + F3 from running. Reason: F2 needs valid descriptions/schemas to score; F3 needs a server that compiles + has working auth. F1 → F2 → F3 is a strict serial gate. SSE event `F1:completed` includes `passed: bool`; if `false`, pipeline emits `validation_complete` directly with `quality_badge = needs_review` + retry triggers. Auto-selected — matches Stage F design §3.3 + §6 pipeline diagram.

- **D-08:** **Bundle-size hard gate is `LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE` (= 950 KB)** — imported from `packages/contracts/launch-criteria.ts`, NEVER hardcoded. Phase 4 D-28 captures the value (warn at 800–950, hard fail at > 950); Phase 5 F1 simply imports the threshold and applies the gate. Pre-commit hook `launch-criteria-paired-decision.sh` (Phase 1 D-13) prevents accidental modification. Auto-selected — Phase 1 D-13 invariant.

### F2 Smell Scan

- **D-09:** **F2 = 15 LLM calls per tool** (5 shuffles × 3 temperatures). Concrete iteration:
  ```
  for shuffle_idx in range(5):
    shuffled_prompt = shuffle_rubric_components(tool, seed=shuffle_idx)
    for temp_setting in [F2_JUDGE_SETTINGS_T00, F2_JUDGE_SETTINGS_T02, F2_JUDGE_SETTINGS_T05]:
      score = await judge_agent.run(shuffled_prompt, model_settings=temp_setting)
      scores.append(score.output)
  ```
  Aggregation: per-component average across 15 evaluations. Per-tool average = mean of 6-component averages. Per-server overall = mean of per-tool averages. Concurrency: tools evaluated in parallel via `asyncio.Semaphore(10)` (matches Phase 2/3/4 patterns). Total wall clock target: ~20–30s for 10-tool server. Auto-selected — matches Override doc §4 + Stage F design §4.4.

- **D-10:** **6-component rubric scoring schema** in `rubric.py`:
  ```python
  class RubricScore(BaseModel):
      purpose: conint(ge=1, le=5)
      guidelines: conint(ge=1, le=5)
      limitations: conint(ge=1, le=5)
      parameter_explanation: conint(ge=1, le=5)
      length_completeness: conint(ge=1, le=5)
      examples: conint(ge=1, le=5)
      reasoning: str  # judge's brief reasoning per component (for Langfuse trace + debug)
  ```
  Component definitions match Stage F design §4.1 verbatim. Examples expected to score 1–2 in v0 — `examples` < 3 does NOT trigger retry per Stage F design §4.5 (deferred to v1.1). Auto-selected — paper rubric (arXiv 2602.14878).

- **D-11:** **F2 prompt shuffling implementation** in `rubric.py::shuffle_rubric_components`: deterministic shuffle of the rubric component-order in the prompt body using `random.Random(shuffle_idx).shuffle(components)`. Component definitions stay same; only their order in the system prompt changes. Position bias mitigation per MCP-Bench. Test: shuffle seeds 0..4 produce 5 distinct orderings. Auto-selected — Override doc §4.2 technique 1.

- **D-12:** **Between-tool σ ≥ 0.4 discrimination metric (Pitfall #9):** after computing per-tool averages, compute `np.std([t.average for t in tool_scores])`. If `< 0.4` → set `low_confidence_run = true` in `F2Smell.flags`. **When `low_confidence_run` is true AND `f3_enabled` was false → auto-enable F3** (force-trigger; eat the cost; mitigates mode-collapse). Surface in `QualityReport.warnings` if F3 still passes: `"F2 between-tool σ low (<0.4) — quality assessment may be unreliable. F3 was force-triggered to confirm."` Auto-selected — Pitfall #9 mitigation.

- **D-13:** **Per-component → upstream-pass retry mapping** (frozen — `failure_patterns.py`):
  | Failed component (per-tool avg < 3) | Retry target | Affected scope |
  |---|---|---|
  | Purpose < 3 | Pass 2 | The specific tool only |
  | Guidelines < 3 | Pass 2 | The specific tool only |
  | Limitations < 3 | Pass 2 | The specific tool only |
  | Parameter Explanation < 3 | Pass 3 | The specific tool only |
  | Length & Completeness < 3 | Pass 2 (re-targeting length budget) | The specific tool only |
  | Examples < 3 | NO retry — deferred to v1.1 | — |
  Per-tool retries are batched in a single pass invocation (Pass 2 / Pass 3 accept a `retry_only_tools: List[str]` arg matching the existing post-Phase-3 retry pattern). Auto-selected — matches Stage F design §4.5.

- **D-14:** **F2 retry orchestration:** if any per-component < 3 OR overall < 4.0:
  1. Build retry-trigger list (per D-13 mapping, deduplicated by target pass).
  2. Invalidate L2 cache for: target pass + downstream passes (Pass 2 retry → invalidate Pass 3 + 4 + 5 + Stage E + F1 + F2; Pass 3 retry → invalidate Pass 4 + 5 + Stage E + F1 + F2). L1 cache stays (it's keyed by spec hash; downstream re-renders from cached predecessor outputs).
  3. Re-run target pass with `retry_feedback` arg (the F2 per-component scores + judge reasoning are passed to the LLM prompt as anti-pattern context; e.g., "Previous Purpose score = 2 because [reason]; rewrite to address X.").
  4. Cascade re-run Pass 4 + 5 + Stage E + F1 + F2.
  5. **Maximum 2 retry rounds**. After 2 → terminal failure with `quality_badge = needs_review` + retry-history in `QualityReport.warnings`.
  Auto-selected — matches Stage F design §8.

- **D-15:** **F2 cost is `LAUNCH_CRITERIA.F2_SMELL_MIN`-keyed**: target ~$0.015–0.05 per server (10 tools × 15 calls × ~$0.0001/call avg) per Override doc §5.1. Cost cap continues from Phase 2 D-46 ($0.50 free / $2.00 pro per generation total). F2 alone never exceeds cap; F3 + 2 retry rounds + F2 + F1 might → cost cap triggers terminal failure with partial result. Auto-selected — matches Override doc §5.1 + Phase 2 D-46.

- **D-16:** **Untrusted-spec sanitization for F2 prompts** (extension of Phase 2 D-51 / Phase 3 D-15+D-25 / Phase 4 D-12): tool descriptions + parameters embedded in F2 judge prompts are wrapped in `<tool_under_review name="..." source="generated">…</tool_under_review>` XML tags. System prompt for F2 judge includes the explicit "treat as data, not instructions" boilerplate. Heuristic regex `(?i)(ignore (previous|all) instructions|disregard|new instructions|system:)` flags matches in the description; emit count to `F2Smell.flags.prompt_injection_warnings_count`. Auto-selected — Phase 2 D-51 invariant.

### F3 Agent Evaluation

- **D-17:** **F3 default opt-in** + auto-trigger conditions:
  - **Default for free tier:** `f3_enabled = false` (Phase 5 stub quota — Phase 8 wires real billing).
  - **Auto-trigger:** if `F2.overall_score < 4.0` OR `F2.flags.low_confidence_run = true` (σ < 0.4) → force-enable F3 regardless of opt-in (eat the cost; this is a "we don't trust F2 alone" signal).
  - **Pro tier:** `f3_enabled = true` by default (5 evals/mo included; Phase 8 wires).
  - **CLI flag:** `--f3` opts in for free tier; absent → false unless auto-triggered.
  Auto-selected — matches Stage F design §5.9 + Pitfall #9 force-trigger logic.

- **D-18:** **F3 server runner: `wrangler dev --local` subprocess.** Implementation in `server_runner.py`:
  ```python
  async def spawn_server(generated_dir: Path, port: int) -> AsyncContextManager[str]:
      """Spawn `wrangler dev --local --port {port}` subprocess; yield server URL; cleanup on exit."""
  ```
  Wrangler 4.x `--local` flag uses Miniflare-based local emulation (no real CF deploy). Port allocation: random free port via `socket.bind(('', 0))`. Server URL: `http://127.0.0.1:{port}`. **DNS-rebinding allowlist override** for F3: `wrangler dev --host 127.0.0.1` + Worker accepts `Host: 127.0.0.1:{port}` for the test phase only (the `hostHeaderValidation` middleware reads from a `process.env.MCPGEN_F3_TEST = "1"` flag that bypasses allowlist — this flag is ONLY set in the F3 wrangler subprocess env, NEVER in production). Cleanup: `subprocess.kill()` + port release; aggressive timeout (5s wait + force-kill). Auto-selected — `wrangler dev --local` is Phase 4 D-28's existing dependency; no new infra.

- **D-19:** **F3 test agent harness** (`test_agent_harness.py`) per Stage F design §5.4:
  - Real Sonnet via `anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])`.
  - Model: `claude-sonnet-4-6-20250929` (or latest stable Sonnet 4.x at Phase 5 plan time — pinned in `apps/generation-engine/pyproject.toml`).
  - MCP transport: HTTP via the spawned `wrangler dev` server URL.
  - Max iterations per task: 20 (matches Stage F design §5.4 + MCP-Bench norms).
  - Trajectory recorder: full request/response JSON + timing + tool-call detail; persisted to `.planning/phases/05-…/05-F3-EVIDENCE/<spec_slug>-<task_id>.json` for debug reproducibility.
  - Concurrency: tasks run in parallel via `asyncio.Semaphore(3)` per server (Sonnet API rate limits + cost control). 10 tasks × 3 concurrency = ~3-min wall clock per server.
  Auto-selected — matches Stage F design §5.4 + cost target $1–3/server.

- **D-20:** **Two-tier evaluator** per Stage F design §5.5:
  - **Tier 1 (rule-based)** in `f3_agent_eval.py::rule_based_eval`: tool validity (every called tool exists in `final-tools.json`); schema compliance (every tool call's args validate against the tool's `inputSchema` per `jsonschema` Python lib); runtime success (no unexpected `isError: true` responses; expected errors per `task.expected_errors` are OK); dependency order (calls match `task.expected_sequence` if specified — partial-match heuristic accepts agent's own ordering as long as required predecessors precede their consumers); efficiency (`iterations <= task.max_iterations * 1.5`).
  - **Tier 2 (LLM judge)** in `f3_agent_eval.py::llm_judge_eval`: per-task call to Qwen3-Coder judge (NOT Sonnet — only the test AGENT is Sonnet) with prompt embedding `task.prompt + task.expected_outcome + trajectory + final_answer`; judge outputs `{task_completion (1–10), tool_usage (1–10), planning (1–10), grounding (1–10), reasoning: str}`. **Per-task pass criterion:** `rule_based.all() AND judge.task_completion ≥ 7 AND judge.grounding ≥ 6`. Auto-selected — matches Stage F design §5.5 + §5.6.

- **D-21:** **Mock client harness** (`mock_clients.py`) — 3 simulated MCP clients applied AT THE GENERATED SERVER LEVEL (NOT during the agent loop; before/after the agent run, as parallel verifications):
  - **`CursorMockClient`** — sends `protocolVersion = "2025-06-18"` during initialize; calls `tools/list`; for every tool with `readOnlyHint = true`, asserts the response did NOT include any `confirmation_required` flag in client-side metadata. Specifically tests Pitfall #31: ALL annotations explicitly set, `readOnlyHint = true` for read tools — Cursor skips confirmation. Pass criterion: zero `confirmation_required` flags on read-tool calls.
  - **`ClaudeDesktopOlderMockClient`** — sends `protocolVersion = "2024-11-05"` during initialize; asserts `tools/list` response OMITS `outputSchema` field for every tool (Pitfall #4 — Phase 4 D-24 capability gate); calls each tool once, asserts `tools/call` response has `content` array but NO `structuredContent` field. Pass criterion: every tool's response shape is backward-compatible.
  - **`ChatGPTDeepResearchMockClient`** — verifies exact-shape compliance for `search` and `fetch` tools (Pitfall #32). Loads canonical fixtures from `packages/engine-fixtures/_canonical/{search,fetch}_signature.json`; deep-equals against `tools/list` response for `search` and `fetch` entries. Any drift → mock-client failure → recorded in `QualityReport.warnings` + retry trigger to Pass 1 OR Pass 3.
  Mock clients run **once per F3 invocation** before the agent harness (~3s total — they're cheap socket calls, no LLM). Failures here are P0 — they block deploy regardless of F3 agent pass rate. Auto-selected — Pitfalls #4/#31/#32 mitigation + Phase 5 success criterion #3.

- **D-22:** **Hybrid F3 environment** per Stage F design §5.2:
  - **Real sandbox for top 10 APIs** — initial set: Stripe (test mode key), GitHub (test org PAT), Notion (test workspace integration token), Linear (test workspace API key), Slack (test workspace bot token), Calendar (Google test calendar service account), HubSpot (developer test portal API key), Salesforce (developer org session ID), Plaid (sandbox key), Twilio (test SID/token). Credentials managed by operator in `.env.local`; passed to F3 via `sandbox_credentials: dict | None` request field; **NEVER persisted, NEVER logged, NEVER committed** (gitleaks gate enforces).
  - **Mocked upstream for the rest** — Python-side spec-derived mock-response generator in `mock_upstream.py`. Generates realistic-looking responses by walking `RawIR.endpoints[*].responses[200].schema` and `examples`; deterministic seed per task ID for reproducibility. Limitations disclaimed in QualityReport: `"Validated against mocked upstream — production behavior may vary. Top-10 sandboxed APIs (Stripe / GitHub / Notion / Linear / Slack / Calendar / ...): real sandbox testing in progress."`
  - **Phase 5 ships the sandbox layer for Stripe + GitHub + Notion** (the 3 fixtures with hand-tuned `quality-report.json` references). Linear + Slack get mocked-upstream treatment in Phase 5; Phase 9 onboards them to real sandbox if ICP traction warrants.
  Auto-selected — matches Stage F design §5.2 hybrid decision + Phase 5 success criterion #3 + scope-cut pragmatism (only the 3 demo fixtures get full sandbox treatment in MVP).

- **D-23:** **Golden tasks per fixture** (`packages/engine-fixtures/<spec>/golden_tasks.json`):
  - Hand-authored ≥ 10 tasks per fixture; cover the 10 task categories from Stage F design §5.3 (simple read / simple write / multi-step read / filter usage / pagination handling / error recovery / workflow / cross-tool reasoning / edge case / authentication).
  - `GoldenTask` schema (Pydantic): `{task_id, prompt, expected_outcome, expected_sequence (optional), expected_errors (optional), max_iterations (default 10)}`. Schema lives in `packages/ir/src/types.ts` Zod source → CI codegen → `packages/ir/python/types.py` (strictly-additive).
  - Phase 5 hand-authors Stripe + GitHub + Notion golden tasks (3 fixtures × 10 tasks = 30 tasks; ~30 min/task ≈ 15 hours of hand-tune work — comfortable for a Phase 5 wave). Linear + Slack + the rest auto-generated by Pass 0 LLM (cheap; lower fidelity; flagged as auto-generated in QualityReport).
  Auto-selected — matches Stage F design §5.3 generation strategy.

### Retry orchestration

- **D-24:** **Retry orchestrator architecture** (`retry_orchestrator.py`) — finite-state machine with explicit transitions:
  ```
  States:
    initial → f1_running → f1_done → f2_running → f2_done → f3_running → f3_done → validation_complete
                  ↘ retry_planned → upstream_pass_running → cascade → f1_running (round 2)
                                                                          ↘ retry_planned → ... → terminal_failure (round 3)
  ```
  Transitions logged to SSE + Langfuse for traceability. State persisted to a `retry_state.json` artifact in `./mcpgen-output/<spec-slug>/.mcpgen/` for debug. **Round counter incremented after each F-stage completion; max 2 rounds.** Auto-selected — explicit FSM is the cleanest solution for "max-2-rounds + cascading invalidation"; alternatives (recursive function calls, reactive streams) are harder to reason about under failure.

- **D-25:** **Retry decision matrix** (`failure_patterns.py`) — combines D-06 (F1 → pass) + D-13 (F2 component → pass) + Stage F design §5.7 + Appendix A (F3 patterns → pass):
  | F3 failure pattern | Indicator | Retry target |
  |---|---|---|
  | `agent_confuses_two_tools` | `judge.tool_usage < 5` AND multiple tools in same task | Pass 2 |
  | `agent_passes_wrong_format` | `rule_based.schema_compliance = false` | Pass 3 |
  | `agent_hits_destructive_without_confirmation` | Mock-Cursor flag OR `judge.task_completion = 0` on action | Pass 4 |
  | `agent_loops_after_truncation` | `iteration_count > max * 1.5` AND truncation in trajectory | Pass 5 |
  | `agent_hallucinates_data` | `judge.grounding < 5` | Pass 5 + Stage E |
  | `agent_fails_auth` | All tool calls return 401/403 | Stage E |
  | `agent_skips_required_step` | `dependency_order = false` | Pass 2 |
  Failure pattern detection is heuristic (exact match on the indicators above); ambiguous failures default to Pass 2 (descriptions are the most common root cause). Auto-selected — matches Stage F design Appendix A verbatim.

- **D-26:** **Cascade invalidation rules** for L2 cache:
  - **Pass 0 retry** → invalidate Pass 1 + Pass 2 + Pass 3 + Pass 4 + Pass 5 + Stage E + Stage F1 + Stage F2 (everything downstream).
  - **Pass 1 retry** → invalidate Pass 2 + Pass 3 + Pass 4 + Pass 5 + Stage E + Stage F1 + Stage F2.
  - **Pass 2 retry** → invalidate Pass 3 (only if param descriptions reference renamed terms — cheap to always invalidate) + Pass 4 + Pass 5 + Stage E + Stage F1 + Stage F2.
  - **Pass 3 retry** → invalidate Pass 4 + Pass 5 + Stage E + Stage F1 + Stage F2.
  - **Pass 4 retry** → invalidate Pass 5 + Stage E + Stage F1 + Stage F2.
  - **Pass 5 retry** → invalidate Stage E + Stage F1 + Stage F2.
  - **Stage E retry** → invalidate Stage F1 + Stage F2 (Pass outputs unchanged, just re-codegen).
  L1 spec-hash cache stays — only L2 pass-output cache invalidated. Auto-selected — strict downstream invalidation; conservative (over-invalidate slightly rather than under-invalidate and serve stale).

- **D-27:** **Retry budget enforcement** in `retry_orchestrator.py::can_retry`:
  - `round_counter ≤ 2` per generation (incremented after each F-stage round completes; round 1 = first run; round 2 = first retry; round 3 = second retry / terminal).
  - Cost guard: cumulative LLM cost across all rounds ≤ `LAUNCH_CRITERIA` cost cap (free $0.50 / pro $2.00). If retry would push over → skip retry, surface `RETRY_BUDGET_EXHAUSTED_COST` warning.
  - Time guard: cumulative wall clock ≤ 10 minutes per generation (free) / 30 minutes (pro). Past that → terminal failure.
  After exhausted: `QualityReport` shows full retry history + `quality_badge = needs_review`. Generated server still produced (degraded mode). Auto-selected — matches Stage F design §8.3.

### QualityReport assembly

- **D-28:** **Composite quality score formula** in `quality_report.py::compute_overall`:
  ```
  if F1 fails:  overall = 0.0; badge = needs_review
  else if F2 fails (overall < 4.0) AND no F3:  overall = 2.5; badge = needs_review
  else if F2 passes AND no F3 (opt-out, σ ≥ 0.4):  overall = 0.5 * F2.overall_score / 5 + 0.5; badge = standard or verified
  else (F1 + F2 + F3 all run):
    overall = (
      0.10 * (1.0 if F1.passed else 0.0) +
      0.40 * (F2.overall_score / 5) +
      0.50 * (F3.pass_rate)
    )
    badge = (
      premium       if F1.passed and F2 ≥ 4.5 and F3.pass_rate ≥ 0.85
      else verified if F1.passed and F2 ≥ 4.0 and F3.pass_rate ≥ 0.7
      else standard if F1.passed and F2 ≥ 3.5 and (no F3 OR F3 ≥ 0.5)
      else needs_review
    )
  ```
  Stored in `QualityReport.overall_score` (0–5 range — multiply formula × 5 before storing) and `QualityReport.quality_badge` (Phase 1 enum). Auto-selected — matches Stage F design §9.2 thresholds verbatim.

- **D-29:** **QualityReport additive IR fields:** `QualityReport` already shipped in `packages/ir/python/types.py` (Phase 1 D-02). Phase 5 ADDS strictly-additive fields:
  ```python
  class QualityReport(BaseModel):  # additive only
      ...
      retry_history: List[RetryRound]                  # NEW: per-round target pass + outcome + cost
      f3_test_agent_id: Optional[str] = None           # NEW: Sonnet model ID + revision
      f2_low_confidence_run: bool = False              # NEW: σ < 0.4 metric
      golden_task_set_origin: Literal["hand_authored", "auto_generated"] = "hand_authored"
      sandbox_environment: Literal["real", "mocked", "hybrid"] = "real"
      warnings: List[str] = Field(default_factory=list)
      generation_time_seconds: Optional[float] = None
      total_cost_usd: Optional[float] = None
  ```
  Bumped via `packages/ir/src/types.ts` Zod source → CI codegen → `packages/ir/python/types.py`. All fields nullable / default-provided; pre-Phase-5 generations leave them unset. Auto-selected — strictly-additive, no breaking change to Phase 1/2/3/4 consumers.

- **D-30:** **QualityReport SSE event payload:** terminal `validation_complete` SSE event includes `partial_result.quality_report = QualityReport.model_dump()`. New strictly-additive endpoint `GET /api/v1/generate/{job_id}/quality-report` returns the same payload — useful for clients that miss the SSE stream (browser refresh mid-generation, Pitfall #20). Frontend (Phase 7) reads from BOTH the SSE stream AND the GET endpoint as fallback per the SSE-resume semantics from Phase 1 D-07 + Phase 7 expected behavior. Auto-selected — extends Phase 4 D-47 GET /output endpoint pattern.

### Pipeline orchestration & SSE events

- **D-31:** **`pipeline.py::run_pipeline` extended** to chain F1 → F2 → F3 (conditional) after the Phase 4 `shape_codegen_complete` terminal. New status sequence (additive on Phase 4 D-33):
  ```
  A:started → A:completed
  B:started → B:completed (pass_0)
  B:started → B:completed (pass_1)
  C:started → C:completed (pass_2)
  C:started → C:completed (pass_3)
  C:started → C:completed (pass_4)
  D:started → D:completed (pass_5)
  E:started → E:completed (stage_e)            (sub-status: shape_codegen_complete)
  F1:started → F1:completed                     NEW
  F2:started → F2:completed                     NEW
  F2:retry_planned (optional)                   NEW
  F3:started → F3:completed                     NEW (conditional — emitted iff F3 enabled OR auto-triggered)
  F3:retry_planned (optional)                   NEW
  validation_complete:completed                 NEW (terminal — partial_result.phase = "validation_complete")
  ```
  `shape_codegen_complete` continues to be emitted as a sub-status. The terminal `partial_result.phase` becomes `validation_complete` for Phase 5 successful completion. Pipeline.py's `GenerationStage` literal already includes `"F1", "F2", "F3"` from Phase 1 — Phase 5 fills them in. Auto-selected — matches `pipeline.py` existing literal.

- **D-32:** **L2 cache key extension** for F2: key = `f2 + f2_version + sha256(pass_2_output + pass_3_output) + model_id + sampling_profile_hash + prompt_version + 5_shuffle_3_temperature_marker`. F1 has NO L2 cache entry (it's deterministic + cheap; re-running is faster than cache lookup). F3 has NO L2 cache entry (it's stochastic; results aren't reproducible by spec hash — only re-runnable with same seed, and even then Sonnet is non-deterministic). The `prompt_version` lever from Phase 3 D-35 + Phase 4 D-35 continues. Auto-selected — matches Stage F design §6.

- **D-33:** **GEN-12 second-run contract continues** — repeated `pipeline(stripe_spec)` in same process produces ZERO Qwen calls IF F3 was opted out (L1 hit on Pass 0–5 + Stage E + F1; F2 reads L2 cache). F3 cannot be cached (stochastic Sonnet output). Phase 5 integration test extends Phase 4's GEN-12 test to assert F1+F2 are bit-identical between cold + warm runs (when F3 is off); F3 results may differ run-to-run (acceptable). Auto-selected — required to maintain GEN-12 acceptance.

### Engine HTTP API surface (Phase 5 subset of contract)

- **D-34:** **Phase 5 implements `POST /api/v1/generate` Stages A + Pass 0–5 + Stage E + Stage F (F1 + F2 + F3 conditional).** All SSE events flow over the existing Phase 1 SSE channel; new event types `F1:started/completed`, `F2:started/completed/retry_planned`, `F3:started/completed/retry_planned`, `validation_complete:completed`. Auto-selected — extends Phase 4 D-46.

- **D-35:** **`POST /api/v1/generate` request body** gains optional fields:
  ```typescript
  {
    spec_url: string;
    spec_content?: string;
    target_complexity?: "minimal" | "standard" | "comprehensive";
    auth_mode?: "passthrough" | "stored" | "oauth";
    f3_enabled?: boolean;                         // Phase 5 NEW; default false
    sandbox_credentials?: Record<string, string>; // Phase 5 NEW; never persisted
    user_golden_tasks?: GoldenTask[];             // Phase 5 NEW; Pro feature; default empty
  }
  ```
  Validated by `packages/contracts/src/generation-api.ts` Zod schema (strictly-additive change; pre-Phase-5 clients work unchanged). Auto-selected — matches Stage F design §7.1.

- **D-36:** **Engine HTTP API gains a new endpoint `GET /api/v1/generate/{job_id}/quality-report`** — returns the full `QualityReport` JSON after `validation_complete` status. Pre-condition: job in `validation_complete` OR `failed` status. Used by CLI + frontend for fallback/refresh per Pitfall #20 SSE-resume semantics. Auto-selected — strictly-additive endpoint.

- **D-37:** **No GitHub OAuth / signup / billing in this engine endpoint.** Phase 5 engine is anonymous on localhost. Phase 6 wires Logto. Phase 8 wires Stripe. CLI continues to send a generated `X-Idempotency-Key` per call (Phase 2 D-48). Auto-selected — Phase 2 D-48 invariant.

### CLI behavior change

- **D-38:** **CLI shows F1/F2/F3 progress + final QualityReport** in `apps/cli/src/init/write_stage_e_output.ts` (extended) + new `apps/cli/src/init/render_quality_report.ts`. Terminal output flow:
  ```
  ✓ Stage A — parsed (1.2s)
  ✓ Pass 0 — 11 tools (4.7s)
  ✓ Pass 1 — 9 tools / 100% coverage (8.1s)
  ✓ Pass 2 — descriptions (12.4s)
  ✓ Pass 3 — input schemas (9.8s)
  ✓ Pass 4 — annotations (3.2s)
  ✓ Pass 5 — output schemas + truncation (15.6s)
  ✓ Stage E — 28 files / 412 KB (8.9s)
  ⏺ F1 — running 11 checks...
  ✓ F1 — 11/11 passed (4.5s)
  ⏺ F2 — running 5×3 = 15 evaluations × 9 tools = 135 calls...
  ✓ F2 — 4.31 / 5.00 (overall) — σ = 0.52 (good discrimination) (28s)
  ⏺ F3 — running 10 golden tasks (Sonnet 4.7) ...                  ← only if --f3 OR auto-triggered
  ✓ F3 — 8/10 tasks passed (88s)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Quality: VERIFIED  (overall: 4.20 / 5.00)
   F1: pass · F2: 4.31 · F3: 0.80 · Bundle: 412 KB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
  Auto-selected — matches Stage F design §9 + UX best-practice (visible per-step progress).

- **D-39:** **CLI flags added:**
  - `--f3` — opt into F3 agent eval (default off; engine still auto-triggers if F2 < 4.0 or σ < 0.4).
  - `--sandbox-creds <path>` — path to a YAML file with sandbox credentials for top-10 APIs (e.g., `stripe.test_key`, `github.test_pat`). Read by CLI; sent in request body `sandbox_credentials`. Path NEVER logged. File expected in `~/.mcpgen/sandbox-creds.yaml` by default.
  - `--strict` — exit with non-zero code if F1 fails OR F2 < 4.0 OR F3 < 0.7 (CI-friendly).
  Auto-selected — practical CLI ergonomics + CI integration.

- **D-40:** **CLI output directory layout (Phase 5):** unchanged top-level path (`./mcpgen-output/<spec-slug>/`); now contains the FULL Phase-4 25–30-file Stage E output PLUS `quality-report.json` + retry-history artifacts:
  ```
  ./mcpgen-output/<spec-slug>/
    ├── (all Phase 4 files)
    ├── quality-report.json                # Phase 5 NEW (replaces Phase 4 stub)
    ├── .mcpgen/
    │   ├── retry_state.json              # Phase 5 NEW — FSM state for debug
    │   ├── f1_results.json               # Phase 5 NEW — per-check details
    │   ├── f2_per_tool_scores.json       # Phase 5 NEW — 15-evaluation full detail
    │   └── f3_trajectories/              # Phase 5 NEW — per-task agent trajectories
  ```
  Auto-selected — extends Phase 4 D-40 layout.

### Validation against Phase-1/2/3/4 fixtures

- **D-41:** **Phase 5 acceptance test = full pipeline run against all 5 fixtures.** For each of `{stripe, github, notion, linear, slack}/`:
  1. Read `<fixture>/SOURCE.md` → fetch the OpenAPI spec (or use cached spec from Phase 2/3/4).
  2. Run `pipeline(spec, f3_enabled=true)` via the engine HTTP API; reach `validation_complete`.
  3. Compare `F1Static` to `<fixture>/quality-report.json::f1_static` — exact match (deterministic).
  4. Compare `F2Smell` to `<fixture>/quality-report.json::f2_smell` — **structural** match: per-tool component counts present; overall_score within ±0.5 of reference; per-tool average within ±1.0 of reference (Qwen LLM non-determinism per Pitfall #7 — wider tolerance than Pass 2 D-41 ±0.3 since F2 is rubric-based).
  5. Compare `F3AgentEvalReport` to `<fixture>/quality-report.json::f3_agent_eval` — pass_rate within ±0.2 of reference (Sonnet non-determinism + sandbox-state variance).
  6. **Stripe + GitHub + Notion fixtures must reach `quality_badge = verified` minimum on a fresh run** (the launch criterion).
  7. Linear + Slack are looser targets (`quality_badge = standard` minimum acceptable).
  8. Snapshot diff failures: F1 (deterministic) → block on diff (any diff is a regression); F2 (LLM-text) → CI comment + soft-fail (acceptable variance); F3 (stochastic) → CI comment + soft-fail; pass_rate hard-fail at < `F3_AGENT_PASS_RATE_MIN` only.
  Auto-selected — extends Phase 2/3/4 fixture-validation pattern.

- **D-42:** **Hand-tuned `quality-report.json` reference in each fixture** added in Phase 5 — Phase 1 shipped a placeholder; Phase 5 fills with realistic F1/F2/F3 expectations after the first complete pipeline run. Hand-author by running the pipeline 3× per fixture, recording the actual F2/F3 ranges, and codifying tolerance bounds in the reference. ~3 hours per fixture (less hand-authoring than Phase 4 because the pipeline does most of the work). Auto-selected — matches Phase 4 D-44 pattern.

- **D-43:** **Hand-authored golden tasks in `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json`** (3 fixtures × 10 tasks = 30 tasks). Each task references real spec endpoints; uses real test-mode credentials (Stripe sandbox / GitHub test org / Notion test workspace). Linear + Slack get auto-generated tasks via Pass 0 LLM (cheaper but lower fidelity). The auto-generated set is flagged in `QualityReport.golden_task_set_origin = "auto_generated"`. Auto-selected — pragmatic scope cut (3 hand-tuned, 2 auto-generated per Phase 5 Plans budget).

### Cost & wall-clock budget

- **D-44:** **Per-server cost target (Phase 5 portion):**
  - F1: $0 LLM cost; ~5–10s wall clock (dominated by `tsc --noEmit` + `gitleaks` subprocess).
  - F2: ~$0.015–0.05 per server (10 tools × 15 calls × ~$0.0001 avg) per Override doc §5.1; ~20–30s parallelized.
  - F3 (when enabled): ~$1–3 per server (Sonnet 4.7 test agent ≈ $1; Qwen judge ≈ $0.10; sandbox API calls free); 1–3 min wall clock.
  - **Total Phase 5 (no F3):** ~$0.02–0.05 per server, ~30s wall clock.
  - **Total Phase 5 (with F3):** ~$1.02–3.05 per server, 1–3 min wall clock.
  - Cumulative end-to-end (Phase 2 + 3 + 4 + 5, no F3): ~$0.12–0.18 per server with cold caches; ~$0 with L1 hit.
  - Cumulative end-to-end (with F3): ~$1.12–3.18 per server.
  - Within `LAUNCH_CRITERIA` cost cap ($0.50 free / $2.00 pro per generation) — F3 with 2 retry rounds may exceed Pro cap; cost guard (D-27) terminates early.
  Auto-selected — matches Override doc §5.1 + Stage F design §11 cost tables.

### Pitfalls explicitly mitigated in Phase 5

- **D-45:** **#9 (F2 single-judge mode-collapse):** D-12 — between-tool σ ≥ 0.4 discrimination metric; σ < 0.4 force-triggers F3 even on free tier. Quarterly human calibration (post-launch) includes "discrimination index."
- **D-46:** **#10 (LLM-hallucinated examples sneaking in via retry):** D-05 + D-14 — F1 `examples_provenance` check substring-matches every example against spec content; re-runs after every Pass 2 retry; non-derivable example → `EXAMPLES_HALLUCINATED` retry Pass 2 with explicit forbidden-pattern + examples-only-from-spec re-injection in retry prompt.
- **D-47:** **#31 (Cursor read-only confirmation prompts):** D-21 — `CursorMockClient` in F3 mock client harness verifies `readOnlyHint = true` tools don't trigger `confirmation_required`. Quickstart docs (Phase 10) document Cursor user-side toggle.
- **D-48:** **#32 (ChatGPT Deep Research compatibility):** D-05 + D-21 — F1 `openai_compliance` check diff-fails on `search`/`fetch` schema drift; `ChatGPTDeepResearchMockClient` in F3 verifies runtime compliance. Canonical fixtures in `packages/engine-fixtures/_canonical/{search,fetch}_signature.json` (Phase 5 hand-creates).
- **D-49:** **#1 (smart-ID server-prefix collision across tenants):** D-05 — F1 `smart_id_fuzz` synthesizes 2 tenants from same spec; verifies dispatched server rejects cross-tenant IDs. Extends Phase 2 D-31 schema-level validation with runtime cross-tenant fuzz.
- **D-50:** **#4 (outputSchema breaking older clients):** D-21 — `ClaudeDesktopOlderMockClient` verifies capability negotiation per Phase 4 D-24. Runtime gate is in Stage E; F3 mock-client harness validates it works.
- **D-51:** **#15 (DNS rebinding):** D-05 + D-18 — F1 `auth_middleware` check verifies `hostHeaderValidation` is FIRST middleware; F3 `wrangler dev` subprocess uses `MCPGEN_F3_TEST=1` flag to bypass allowlist for the test phase only (production servers bind allowlist normally).
- **D-52:** **#28 (long-session context drift):** every plan file under `.planning/phases/05-…/` will start with **"MUST re-read these files first"** header listing canonical refs (per Phase 2 D-61 / Phase 3 D-49 / Phase 4 D-56). Plan files are written by the planner; Phase 5 plans pre-commit hook enforces the header.
- **D-53:** **#2 (OpenRouter quantization drift):** continues from Phase 2/3/4 — same `_PROVIDER_ROUTING` + smoke test gate + nightly snapshot regression. Phase 5 PRs run the same gate. F2 judge calls inherit the contract.
- **D-54:** **#33 (Zod schema coercion):** Phase 4 D-26 ships dual schemas; Phase 5 F1 `json_schema` check validates BOTH against MCP's official validator. Conservative-format fallback served to older clients per D-21 mock test.

### Folded Todos

*None — `gsd-sdk query todo.match-phase 5` not invoked at write time; Phase 5 has no inherited todos from prior phases per Phase 4 D-… check pattern.*

### Claude's Discretion

The planner has flexibility on:
- Whether `f1_checks/` modules are individual files or a single multi-class file (recommended: one file per category for testability).
- Whether `gitleaks` is invoked via subprocess or via Python wrapper library (`detect-secrets`, etc.) — subprocess simpler; Python wrapper avoids fork cost.
- Whether the retry FSM (`retry_orchestrator.py`) is implemented via explicit state variable + match-statement OR a state-machine library (`transitions`). Explicit is simpler for 8 states.
- Whether F3 server runner spawns ONE `wrangler dev` subprocess for all 10 tasks (faster; shared port; single startup cost) OR per-task subprocess (cleaner isolation; slower). Recommended: shared subprocess.
- Whether mock clients are implemented as thin Python classes calling the spawned server via HTTP OR as full TS code that runs in the F3 subprocess. Recommended: Python (avoids extra TS subprocess complexity).
- Sub-module file boundaries within `stage_f/` (the file-list in D-04 is a recommendation, not a contract).
- Whether `tsc --noEmit` + `ajv` + `eslint` run sequentially or in parallel — sequential is simpler; parallel saves ~2s but adds complexity.
- Specific `tenacity` retry decorator config for F2 LLM calls (backoff factor, jitter) — same defaults as Phase 2/3/4 (`1s/2s/4s` exponential).
- Whether `mock_upstream.py` is a Python lib OR a thin wrapper around a third-party tool (WireMock, mountebank, MSW). Recommended: Python lib (zero new infra; deterministic per task seed).
- Whether F3 trajectory recording uses Langfuse session_id keying OR a flat-file artifact. Recommended: BOTH (Langfuse for traces; flat file for offline debug).
- Whether the canonical `search_signature.json` / `fetch_signature.json` are hand-authored OR auto-extracted from a Pass-1 reference output. Recommended: hand-authored (Pitfall #32 prevention requires immutable references).
- Whether `golden_tasks.json` is JSON-Schema-validated at fixture load OR Pydantic-parsed at engine startup. Recommended: Pydantic (reuses existing IR pattern).
- Whether the F3 retry budget (max 2 rounds) shares a budget with F2 retries OR has separate counters. Recommended: shared (the 2-round cap is per-generation, not per-stage).
- Whether the Sonnet test-agent rate-limit handling uses Anthropic's built-in retry OR `tenacity` Python-side. Recommended: Anthropic SDK has built-in retry; `tenacity` adds defense-in-depth.
- Whether QualityReport SSE event payload includes the FULL `QualityReport.model_dump()` OR a summary-only version (to avoid SSE event-size bloat). Recommended: full dump (frontend already handles SSE event-size; QualityReport ~50KB max).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning Phase 5.**

### Source-of-truth conflict resolution order
- `RULES.md` — hard non-negotiable rules.
- `docs/mcpgen-model-and-provider-override.md` §0–4 — beats every other doc on LLM model / provider / sampling / `extra_body`. Stage F design's "3 multi-family judges (Sonnet/GPT-5/Gemini)" mentions are **stale and overridden** — replaced by single Qwen3-Coder × 5-shuffle × 3-temperature.
- `docs/mcpgen-model-and-provider-override.md` §7.3 — F3 test agent stays on real Sonnet 4.7 (the **only** documented exception to the Qwen3-Coder override).
- `docs/mcpgen-git-workflow-rules.md` — Conventional Commits, atomic commits, NEVER `--no-verify`, pre-commit hooks.
- `docs/mcpgen-gsd-sprint-plan.md` §4.5 (Phase 5 plan breakdown).
- `docs/mcpgen-stage-f-design.md` (whole doc) — Stage F detailed design, beats v2 summary; **but model decisions overridden by Override doc** (single Qwen, not 3 multi-family).
- `docs/mcpgen-generation-engine-v2.md` — pipeline overview.
- `docs/mcpgen-architecture.md` — system context.
- `docs/mcpgen-implementation-plan.md` §11.7 — launch criteria + kill switches + scope cuts.

### Source of truth for Stage F (validation tiers, retry orchestration, golden tasks, mock clients)
- `docs/mcpgen-stage-f-design.md` (whole doc) — three-tier validation (F1 static + F2 smell + F3 agent), 6-component rubric (paper rubric arXiv 2602.14878), targeted retry orchestration with max-2-rounds, hybrid F3 environment, two-tier evaluator (rule-based + LLM judge per MCP-Bench arXiv 2508.20453), Quality Badge thresholds, failure-pattern → retry-pass mapping (Appendix A).
- `docs/mcpgen-model-and-provider-override.md` §4 — F2 single-judge replacement (5-shuffle × 3-temperature × discrimination metric).
- `docs/mcpgen-model-and-provider-override.md` §7.3 — F3 test-agent exception (Sonnet 4.7).
- `.planning/research/PITFALLS.md` #9 (F2 mode-collapse — between-tool σ ≥ 0.4 mandatory), #10 (post-retry hallucination — F1 `examples_provenance` re-runs after every Pass 2 retry).
- `.planning/research/PITFALLS.md` #31 (Cursor confirmation prompts — F3 mock client mandatory), #32 (ChatGPT Deep Research compliance — F1 hardcoded `search`/`fetch` fixture).

### Source of truth for LLM model + provider routing (Phase 5 unchanged from Phase 2/3/4 + F3 test-agent exception)
- `docs/mcpgen-model-and-provider-override.md` §0–4 (model + provider + `extra_body` + sampling profiles) + §5.1 (recalculated F2/F3 costs) + §7.3 (F3 test-agent Sonnet exception) + §8 (Day-1 smoke test).
- `docs/decisions/2026-04-28-quantization-pin-fp8-together.md` — full provider-pin debugging history.

### Source of truth for caching (Phase 5 extends Phase 2/3/4 cache layer)
- `docs/mcpgen-generation-engine-v2.md` §5.9 (4-layer caching).
- `RULES.md` §"Cost transparency by design" + §"Caching is first-class".
- `apps/generation-engine/src/mcpgen_engine/cache/` — existing L1/L2/L3 facades from Phase 2; Phase 5 adds F2 L2 cache key with `prompt_version + 5_shuffle_3_temperature_marker`; F1 has NO L2 entry; F3 has NO L2 entry.

### Source of truth for what Phase 5 must deliver
- `.planning/PROJECT.md` (Constraints + Key Decisions sections + Out of Scope: F2 multi-judge ensemble / continuous post-deploy validation).
- `.planning/REQUIREMENTS.md` rows GEN-09, GEN-10, GEN-11.
- `.planning/ROADMAP.md` Phase 5 entry — 4 success criteria are the contract.
- `.planning/phases/01-foundation/01-CONTEXT.md` — frozen contracts (D-13 launch-criteria.ts thresholds — F2 ≥ 4.0, F3 ≥ 0.7, BUNDLE_SIZE 800/950).
- `.planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md` — frozen contracts (D-04/D-05 extra_body provider routing, D-31 schema-level smart ID, D-37 cache layers, D-47 SSE staged delivery, D-49 module layout, D-51 untrusted-spec sanitization, D-54 fixture validation pattern).
- `.planning/phases/03-generation-engine-author-pass-2-3-4/03-CONTEXT.md` — frozen contracts (D-02 sampling profiles infra, D-04 inline quality gate Qwen judge with abbreviated rubric, D-15 untrusted-spec extension, D-33 SSE event sequence + GenerationStage literal, D-35 L2 cache key with prompt_version, D-37 CLI render_stub extension).
- `.planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-CONTEXT.md` — frozen contracts (D-24 capability negotiation runtime, D-26 dual Zod-derived + conservative-format outputSchema, D-28 wrangler dry-run bundle-size capture into QualityReport.bundle_size_kb, D-33 Stage E SSE events, D-39 pre-warmed node_modules for tsc, D-42 strictly-additive QualityReport fields).
- `.planning/research/SUMMARY.md` §"Phase 5: Generation Engine — Validation".
- `.planning/research/PITFALLS.md` #9, #10, #31, #32 in detail (P0 + P1 mitigations Phase 5 owns) + #1, #4, #15, #28, #33 (extends Phase 4 mitigations into runtime validation).
- `.planning/research/STACK.md` §1 (locked stack — Cloudflare Workers + `@modelcontextprotocol/sdk@^1.x` + Anthropic SDK for F3 test agent + `wrangler` 4.x + `gitleaks`), §6 (drift to verify).
- `.planning/research/ARCHITECTURE.md` §"Build Order with Dependency Rationale" Phase 5 row.

### Source of truth for fixtures (test surface)
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/SOURCE.md` — upstream OpenAPI URLs.
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/{ir,pass-0-output,pass-1-output,pass-2-output,pass-3-output,pass-4-output,pass-5-output,final-tools,quality-report}.json` — Phase 1+2+3+4 hand-tuned reference output. Phase 5 fills `quality-report.json` with realistic F1/F2/F3 expectations.
- `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json` — **NEW Phase 5 hand-authored** ≥ 10 tasks per fixture (Stripe + GitHub + Notion only). Linear + Slack get auto-generated tasks.
- `packages/engine-fixtures/_canonical/{search,fetch}_signature.json` — **NEW Phase 5** hand-authored canonical OpenAI-compliance fixtures (Pitfall #32).
- `packages/engine-fixtures/_canonical/mcp-schema.json` — **NEW Phase 5** pinned MCP official JSON Schema bundle for `ajv` validation.
- `packages/engine-fixtures/<spec>/mock_upstream.py` — **NEW Phase 5** spec-derived mock-response generator (for non-top-10 APIs).

### Source of truth for IR schema (consumed by Phase 5 outputs)
- `packages/ir/python/types.py` — Pydantic types: `F1Static`, `F2Smell`, `F3AgentEvalReport`, `QualityReport`, `QualityBadge`, `Result` (already shipped Phase 1; Phase 5 USES it). **Strictly-additive change in Phase 5:** `QualityReport.retry_history`, `QualityReport.f3_test_agent_id`, `QualityReport.f2_low_confidence_run`, `QualityReport.golden_task_set_origin`, `QualityReport.sandbox_environment`, `QualityReport.warnings`, `QualityReport.generation_time_seconds`, `QualityReport.total_cost_usd` per D-29. Plus `GoldenTask`, `RetryRound` new types.
- `packages/ir/src/types.ts` — Zod source of truth (committed Phase 1; codegen runs in CI on changes — D-29 bump goes through this path).

### Source of truth for engine HTTP API
- `packages/contracts/src/generation-api.ts` — endpoint shape, SSE event envelope (frozen Phase 1, `GenerationStage` literal already includes `"F1", "F2", "F3"`; Phase 5 adds `GET /api/v1/generate/{job_id}/quality-report` per D-36 + extends `POST /api/v1/generate` request body with `f3_enabled` + `sandbox_credentials` + `user_golden_tasks` per D-35 — strictly-additive).
- `packages/contracts/src/launch-criteria.ts` — IMMUTABLE runtime constants: `F2_SMELL_MIN = 4.0`, `F3_AGENT_PASS_RATE_MIN = 0.7`, `BUNDLE_SIZE.{PASS_KB, WARN_KB, FAIL_KB_EXCLUSIVE}`, `COVERAGE_PCT_MIN = 100`. Pre-commit hook + CI assertion + paired-decision-doc enforcement (Phase 1 D-13 + Pitfall #29).

### Source of truth for codegen templates (consumed by F1 + F3)
- `packages/codegen-templates/templates/` — Jinja2 templates from Phase 4. F1 reads generated TS files; does NOT modify templates (Phase 4 owns template fixes via retry trigger).
- `packages/codegen-templates/package.json` — pinned `typescript@^5.6` + `wrangler@^4` + `@modelcontextprotocol/sdk@^1.x` + `zod@^4` + `ajv@^8` + `gitleaks` (CLI binary, not Python lib) (devDependencies).

### Source of truth for CLI surface
- `apps/cli/src/init/` — Phase 4's `write_stage_e_output.ts` retired; Phase 5 extends with `render_quality_report.ts` per D-38.
- `apps/cli/package.json` — pinned deps; Phase 5 adds NO new deps (existing `eventsource-parser` handles SSE; existing fetch handles new GET endpoint).

### Source of truth for security surface
- `docs/mcpgen-architecture.md` §11 (logging redaction policy — F2 prompts + F3 trajectories MUST NOT log spec content / upstream credentials).
- `docs/mcpgen-architecture.md` §14 (secret management — `ANTHROPIC_API_KEY` + sandbox creds in `.env.local`; never logged).
- Phase 2 D-51/D-52/D-53 — untrusted-spec sanitization continues for F2 prompts.
- Pitfalls #1 / #4 / #12 / #15 / #28 / #31 / #32 / #33 — Phase 5 implements the validation mitigations directly (F1 fuzz / F1 mock clients / F3 mock client harness / F1 OpenAI-compliance fixture).

### Source of truth for sprint sequencing (Phase 5 plans within phase)
- `docs/mcpgen-gsd-sprint-plan.md` §4.5 — Phase 5 plan breakdown across waves (~6–8 plans). Recommended waves:
  - Wave 1 (parallel): F1 static checks (8 modules) + IR additive types bump.
  - Wave 2 (parallel): F2 rubric + 5-shuffle + 3-temperature implementation + σ-discrimination metric + retry-trigger mapping.
  - Wave 3 (parallel): F3 server runner + F3 test-agent harness + F3 LLM judge + golden tasks (Stripe + GitHub + Notion hand-authored).
  - Wave 4: Mock client harness (Cursor + Claude Desktop older + ChatGPT Deep Research) + retry orchestrator FSM.
  - Wave 5: Pipeline integration + SSE events + CLI render quality report + new GET /quality-report endpoint.
  - Wave 6: E2E pipeline test (full Stage A → F3) on 5 fixtures + hand-tune `quality-report.json` references.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (already shipped Phase 1 + 2 + 3 + 4)

- **`apps/generation-engine/src/mcpgen_engine/llm/client.py`** — `MODEL` singleton (Qwen3-Coder via OpenRouter through PydanticAI `OpenAIProvider`). **Single source of truth.** Phase 5 imports nothing new for F2; **F3 test agent uses a separate `anthropic.Anthropic` client** in a NEW module `llm/test_agent.py` (per D-02).
- **`apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py`** — `make_agent[T: BaseModel](*, output_type, system_prompt) -> Agent[None, T]`. Phase 5 calls `make_agent(output_type=RubricScore, system_prompt=F2_JUDGE_PROMPT)` for F2; `make_agent(output_type=F3JudgeScore, system_prompt=F3_JUDGE_PROMPT)` for F3 LLM judge.
- **`apps/generation-engine/src/mcpgen_engine/llm/sampling.py`** — `PASS_0/1/2/3/4/5_SETTINGS` + `INLINE_GATE_SETTINGS` already defined. Phase 5 extends with `F2_JUDGE_SETTINGS_T00/T02/T05` + `F3_JUDGE_SETTINGS` + `F3_TEST_AGENT_SETTINGS` (Anthropic-side; not OpenRouter) per D-03.
- **`apps/generation-engine/src/mcpgen_engine/pipeline.py`** — `run_pipeline` async generator with frozen Phase-1 SSE envelope. `GenerationStage` literal already includes `"F1", "F2", "F3", "completed", "failed"` — Phase 5 fills in F1/F2/F3 events per D-31. `pipeline.py` already has `Phase 5 F1 retry orchestration consumes these per` comments (line 36, 145, 173) referring to Stage E error codes — Phase 5 reads them.
- **`apps/generation-engine/src/mcpgen_engine/cache/`** — `l1.py`, `l2.py`, `l3.py`, `keys.py` already shipped. Phase 5 adds F2 L2 cache key marker per D-32; F1/F3 have NO L2 entry.
- **`apps/generation-engine/src/mcpgen_engine/passes/pass_*/`** + **`stages/stage_a.py`** + **`stages/stage_e/`** — Phase 2/3/4 reference implementations. Phase 5 mirrors structure for `stages/stage_f/` per D-04. Pattern: single `async def run()` entry point + sibling helper modules + cross-validate.
- **`apps/generation-engine/tests/test_smoke_qwen.py`** — Day-1 smoke test (PR gate). Phase 5 PRs run the same gate; **a new smoke test for Sonnet (`test_smoke_sonnet.py`) is added** to verify the F3 test agent path before Phase 5 lands the harness (verifies `claude-sonnet-4-6-20250929` reachable via Anthropic SDK + structured output works).
- **`apps/generation-engine/tests/conftest.py`** — `_sandbox_env` + `requires_openrouter` marker — used by Phase 5 fixture tests; **a new `requires_anthropic` marker** is added for F3 test-agent tests.
- **`packages/ir/python/types.py`** — `F1Static`, `F2Smell`, `F3AgentEvalReport`, `QualityReport`, `QualityBadge`, `Result` already defined (Phase 1). Phase 5 extends `QualityReport` with strictly-additive fields per D-29; adds `GoldenTask` + `RetryRound` types.
- **`packages/engine-fixtures/{stripe,github,notion,linear,slack}/`** — 9 files per fixture (post-Phase-4). Phase 5 adds `quality-report.json` (filled with realistic F1/F2/F3 expectations), `golden_tasks.json` (Stripe + GitHub + Notion hand-authored), `mock_upstream.py` (Linear + Slack auto-generated; Stripe + GitHub + Notion as fallback when sandbox creds missing). Plus a NEW `_canonical/` directory with `search_signature.json` + `fetch_signature.json` + `mcp-schema.json`.
- **`packages/codegen-templates/`** (Phase 4 filled) — F1 reads generated TS files via subprocess (`tsc`, `gitleaks`); does NOT modify templates. Phase 5 ADDS `gitleaks` binary to `package.json` `devDependencies` (or via `pre-commit` hook on macos-arm64; pinned per Phase 1 D-13 OAuth-provider pin pattern).
- **`packages/contracts/src/launch-criteria.ts`** (Phase 1 frozen) — `LAUNCH_CRITERIA.F2_SMELL_MIN`, `LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN`, `LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE` imported into F1 + F2 + F3 modules. Pre-commit hook ensures no hardcoded thresholds.
- **`packages/contracts/src/generation-api.ts`** (Phase 1 frozen) — engine SSE envelope; Phase 5 fills F1/F2/F3 events; adds `GET /api/v1/generate/{job_id}/quality-report` strictly-additive endpoint per D-36.

### Established patterns from Phase 2 + 3 + 4

- **TS Zod is IR source of truth; Python Pydantic generated via codegen.** Strictly-additive IR changes (per D-29) go through `packages/ir/src/types.ts` → CI codegen → `packages/ir/python/types.py`.
- **Conventional Commits, atomic commits, pre-commit hooks mandatory.** Same Phase 2/3/4 toolchain.
- **`MODEL` singleton + `make_agent` factory + per-pass `*_SETTINGS`** — Phase 5 reuses identically for F2; **F3 test agent is the documented exception** (uses raw `anthropic.Anthropic` client per D-02).
- **`_PROVIDER_ROUTING` + `extra_body` at agent factory level** — Phase 5 reuses identical dict for F2; ANY change requires a paired `docs/decisions/` entry.
- **Untrusted-spec sanitization via `<...>` XML wrappers** — applies to F2 judge prompts (D-16). F1/F3 don't pass spec text to LLMs (F1 is deterministic; F3 only sees test-agent task prompts + tool responses, which are user-authored or sandbox responses).
- **SSE event sequence per stage** — Phase 5 emits F1+F2+F3 events without breaking the wire contract.
- **Per-stage module layout: `stages/stage_X/` with single async `run()` entry point + sibling helper modules** — Phase 5 mirrors for `stages/stage_f/`.
- **L2 cache key embeds `pass_name + pass_version + sha256(input) + model_id + sampling_profile_hash + prompt_version`** — Phase 5 extends with F2 `5_shuffle_3_temperature_marker`. F1/F3 have NO L2 entry (deterministic resolution OR stochastic-by-design).
- **Fixture-based acceptance: structural equivalence for LLM-text outputs; exact match for deterministic outputs.** Phase 5 — F1 exact match (deterministic); F2 structural match within ±0.5 overall / ±1.0 per-tool; F3 within ±0.2 pass-rate.
- **Pre-warmed `node_modules` (Phase 4 D-39)** — F1 reuses Phase 4's pre-warmed `packages/codegen-templates/node_modules/` for `tsc --noEmit` + adds `ajv` + `gitleaks` binaries.
- **Launch-criteria.ts is sacrosanct** — Phase 1 D-13 + Pitfall #29 + pre-commit hook + paired-decision-doc requirement. Phase 5 imports thresholds; NEVER hardcodes.

### Integration points

- **`packages/contracts/src/generation-api.ts`** — engine SSE envelope; Phase 5 fills F1+F2+F3 events; adds `GET /api/v1/generate/{job_id}/quality-report` strictly-additive endpoint per D-36; extends request body with `f3_enabled` + `sandbox_credentials` + `user_golden_tasks` per D-35.
- **`packages/contracts/src/launch-criteria.ts`** — F2_SMELL_MIN, F3_AGENT_PASS_RATE_MIN, BUNDLE_SIZE imported at runtime by F1 + F2.
- **`packages/engine-fixtures/`** — Phase 5 outputs validated against; Phase 5 hand-tunes `quality-report.json` + `golden_tasks.json` (Stripe/GitHub/Notion).
- **`packages/codegen-templates/`** — Phase 5 reads generated TS via subprocess (`tsc`, `eslint`, `gitleaks`); does NOT modify templates (template fixes go through Phase 4 retry).
- **`packages/runtime-sdk/`** — generated tenant Workers import from this; Phase 5 spawns generated Workers via `wrangler dev --local`; runtime-sdk methods exercised by F3 test agent.
- **`@modelcontextprotocol/sdk@^1.x`** — Phase 5 F3 spawned Worker uses `server.registerTool()` per Phase 4 D-31 amendment (post 04-15 plan); F3 mock clients use the SDK's client-side transport for capability negotiation testing.
- **`@cloudflare/workers-oauth-provider`** — Phase 5 F3 doesn't exercise OAuth (Phase 6 owns); Phase 5 only validates middleware presence in F1.
- **`wrangler` 4.x** — Phase 5 spawns `wrangler dev --local --port {N}` subprocess per F3 invocation; the same `wrangler` binary already pinned by Phase 4 D-39.
- **Anthropic SDK (Python)** — Phase 5 NEW dep: `anthropic>=0.30.0` for F3 test agent. Pinned in `apps/generation-engine/pyproject.toml`. Read `ANTHROPIC_API_KEY` from `.env.local` (NEVER committed; gitleaks gate enforces).
- **`gitleaks`** — Phase 5 NEW binary dep: `gitleaks>=8.x`. Installed via `brew install gitleaks` on macos-arm64; pinned in `packages/codegen-templates/package.json` for CI (uses `gitleaks/action`).
- **`jsonschema`** (Python) — Phase 5 NEW dep for F1 input/output schema validation. Pinned in `apps/generation-engine/pyproject.toml`.
- **`ajv`** (Node) — Phase 5 alternative for F1 schema validation (in `packages/codegen-templates/package.json`); planner choice between Python `jsonschema` lib OR Node `ajv` subprocess. Recommended: Python `jsonschema` (avoids extra subprocess cost).
- **Langfuse OTel exporter** — F2 + F3 LLM calls produce traces with `pass_name=stage_f / step=f2|f3` + `tool_name|task_id` + token usage + cost. F3 test-agent calls (Sonnet) ALSO emit Langfuse traces (separate Anthropic client; same OTel exporter).
- **Phase 6 + Phase 7** consume the `QualityReport` assembled here. Phase 6 dispatch Worker reads `quality_badge` for filtering; Phase 7 frontend reads via SSE + GET endpoint and renders the badge in the preview screen.

</code_context>

<specifics>
## Specific Ideas

- **Phase 5 is the LAST engine phase before Phase 6 (Runtime) and Phase 7 (Frontend) start consuming Engine output for real.** Stage F output (`QualityReport`) becomes the user-visible quality signal. If F2/F3 thresholds are misset or the quality signal is unreliable, the entire "MCP-quality" claim collapses. Plan must treat the launch-criteria thresholds as sacrosanct.

- **F3 is the most expensive single operation in the entire pipeline.** $1–3 per server (Sonnet 4.7) is ~10× any other pass cost. Phase 5 must wire the cost guard rigorously: free-tier cap ($0.50) is exceeded by even ONE F3 run, so free tier MUST opt-in (default off) and Pro tier defaults on (5 evals/mo included). The auto-trigger (F2 < 4.0 OR σ < 0.4) overrides opt-out — eat the cost rather than ship an uncalibrated quality signal.

- **The "single Qwen + 5-shuffle × 3-temperature" decision (Override doc §4) is the single largest cost-quality trade-off in the project.** ~10× cheaper than 3 multi-family judges; ~75–80% human agreement vs 86.67% (Override doc §4.3). The σ ≥ 0.4 discrimination metric (Pitfall #9) is the safety net — if mode collapse happens, F3 force-triggers even on free tier. **DO NOT remove the σ check** — it's the only thing keeping the F2 single-judge approach from being silently broken on similar tools.

- **F3 test agent stays on real Sonnet 4.7 — this is the ONLY documented exception to the Qwen3-Coder override.** Override doc §7.3 is explicit: F3 simulates production agent behavior; testing with the production model (Sonnet/Claude Desktop/Cursor) is the whole point. **DO NOT change F3 test agent to Qwen** — it would invalidate F3's predictive value. The F3 LLM JUDGE (evaluating the agent's trajectory) IS Qwen — these are two different roles.

- **OpenAI compliance for `search`/`fetch` is a separately-pinned invariant (Pitfall #32).** Pass 1 emits the canonical schemas; F1 has a hardcoded fixture that diff-fails on drift. The fixture lives in `packages/engine-fixtures/_canonical/` (NEW directory). Future Pass 1 "improvements" that add e.g. `limit: int` to `search` will fail F1 with a clear error message: "search input schema drifted from OpenAI spec — ChatGPT Deep Research will silently reject server."

- **Cursor confirmation prompts (Pitfall #31) are a P0 UX bug.** `openWorldHint=true` is invariant per Pass 4; without `readOnlyHint=true` on read tools, every search/fetch prompts "approve?" Phase 5 mock client (D-21) verifies this; F3 catches it pre-deploy. **DO NOT skip the Cursor mock client** — the entire Six-Tool Pattern's read-heavy flow becomes a confirm-fest in Cursor without it.

- **Targeted retries are the difference between a smart pipeline and a dumb one.** The retry orchestrator (D-24) cascades exactly the necessary downstream invalidation (D-26) — Pass 2 retry doesn't redo Pass 0/1; Stage E retry doesn't redo any pass. This is ~5× cheaper than full regen per Stage F design §8.2. The max-2-rounds cap (D-27) prevents runaway loops.

- **The `wrangler dev --local` subprocess is the single largest infra change in Phase 5.** F3 spawns a Miniflare-emulated Worker per generation; port-forward + cleanup is brittle. Plan budget should account for at least 1 plan dedicated to robust subprocess management (port collisions, cleanup on crash, F3-mode flag for `hostHeaderValidation` bypass). **Reuse Phase 4 D-39 pre-warmed `node_modules`** — it makes the spawn ~5s instead of ~30s.

- **Gitleaks is a P0 security gate.** A leaked Stripe `sk_live_` or GitHub PAT in generated code is a trust-killer. F1 secret_scan (D-05 step 9) blocks deploy on any hit; "no retry" semantics (operator must intervene). **DO NOT make secret_scan retry-able** — the hit means an operator-supplied credential made it into generated code, not a template bug.

- **The 3-fixture handcrafting decision (D-23 + D-43) is a deliberate scope cut.** Stripe + GitHub + Notion get full hand-authored golden tasks (~10 each = 30 tasks × 30min = ~15h work). Linear + Slack get auto-generated tasks (cheap; lower fidelity). The ROADMAP success criterion #4 is "Stripe + GitHub + Notion + Linear + Slack reach `verified` minimum on a fresh run" — Phase 5 must achieve this with the asymmetric fixture investment.

- **Phase 5 fixture references (`quality-report.json`) are calibrated per fixture.** Phase 5 plan must run the pipeline 3× per fixture, record the actual F2/F3 ranges, and codify ±0.5 / ±0.2 tolerance bounds in the reference. ~3 hours per fixture × 5 = 15h calibration work.

- **F1 is fast; F2 is medium; F3 is slow.** Plan budget: F1 < 10s; F2 ~20–30s; F3 ~1–3 min. The CLI progress display (D-38) shows users where they are. Soft target: full pipeline (Stage A → F3) in < 5 minutes for 10-tool server with cold cache.

- **The QualityReport composite formula (D-28) gates the public Quality Badge.** Phase 7 frontend renders the badge in the preview; Phase 10 launch criterion is "Stripe + GitHub + Notion + Linear + Slack reach `verified` minimum." The formula weighting (10% F1 binary + 40% F2 + 50% F3) prioritizes agent eval — the most predictive of real-world success per Stage F design §5.1.

- **The retry FSM artifact (`retry_state.json`) is for debug, not for users.** Live in `.mcpgen/` (gitignored in generated repos). Useful for support tickets ("here's exactly what was retried and why"). Don't surface in the QualityReport directly — too noisy.

- **Mock clients run BEFORE the F3 agent harness, not during.** D-21: ~3s of socket calls verifying Cursor / Claude Desktop / ChatGPT Deep Research compliance — cheap, parallel, useful. The F3 agent harness is the expensive part; mock clients catch P0 client-compatibility issues without burning Sonnet tokens.

- **Phase 5 introduces zero new product-level features.** The generated server is functionally identical to a hand-written MCP server wrapping the same OpenAPI spec. Phase 5 just tells you HOW GOOD the generated server is. The Quality Badge IS the product differentiation — without F2/F3, MCPGen is "yet another generator." **The Quality Badge IS the moat.**

</specifics>

<deferred>
## Deferred Ideas

- **Real Cloudflare Workers deploy of generated tenant Workers** (`mcpgen deploy` CLI command + Phase 6 dispatch Worker substitution of `{tenant_short_id}-` prefix) — Phase 6.
- **Real OAuth handshake exercised end-to-end (Logto + `@cloudflare/workers-oauth-provider`)** — Phase 6 + Phase 8.
- **Tenant Worker dispatch + 3 auth-mode runtime end-to-end + smart-ID `{tenant_short_id}-` prefix substitution at deploy time + capability-routed dispatch** — Phase 6.
- **Stripe Meters + billing + quota enforcement + cost cap (real)** — Phase 8. Phase 5 ships an env-var stub quota check.
- **Drift Watcher full implementation (daily Inngest cron + diff UI + auto-regenerate)** — Phase 8.
- **Frontend wire-up of F1/F2/F3 progress + Quality Badge display + per-tool score breakdown in preview** — Phase 7 (UI is locked from `claude-design-ui/MCP-Gen.zip`).
- **Sentry DSN filling + Langfuse dashboards + BetterStack uptime monitoring of generated tenant Workers** — Phase 9.
- **Cross-tenant fuzz testing in production** + **multi-client smoke against real Claude Desktop / Cursor / ChatGPT Deep Research** + **Inngest orphan audit** + **PII deliberate-leak audit** — Phase 9. Phase 5 ships the **mock client harness**; Phase 9 runs the **real client smoke** against deployed servers.
- **Quarterly judge calibration with human evaluators** — operational concern post-launch (per Stage F design §4.7 + Override doc §4.2 technique 4). Phase 5 ships scaffolding (`packages/engine-fixtures/calibration/` directory placeholder); the actual quarterly run is post-launch.
- **Multi-provider OpenRouter routing for F2** (broaden `provider.order` from `["atlas-cloud"]` to a list when σ < 0.4 too often) — Phase 8/9 if production data shows the metric forces F3 too often.
- **F3 user-supplied golden tasks (Pro feature)** — Phase 5 ships the JSON schema for `GoldenTask` + an example file; the Pro plan + Stripe gating is Phase 8.
- **Self-critique loop for F2** (Override doc §4.2 technique 3 — model critiques its own first answer) — DEFERRED. Phase 5 ships only the 5-shuffle × 3-temperature; if quality drops, Phase 8/9 evaluates self-critique.
- **F2 dual-model (Qwen + Haiku second opinion)** (Override doc §4.4) — DEFERRED. Phase 5 ships single-model only; multi-model F2 is the explicit Phase 8/9 fallback if needed.
- **Continuous validation post-deploy** (re-run Stage F on schedule against deployed servers) — explicitly out of MVP per Stage F design §13.
- **Cross-tool description coherence checks** (e.g., Pass 2 description for `upsert` references the same collection terminology used in `list_objects`) — DEFERRED to v1.1 F2 sub-check.
- **Multi-runtime codegen (Node.js / Deno / Vercel Edge)** — explicitly post-launch.
- **GraphQL / Postman / AsyncAPI input formats** — explicitly out of MVP per `docs/mcpgen-implementation-plan.md`.
- **Component 6 (Examples) sandbox-derived from real execution traces** — v1.1 sandbox feature, post-MVP. Phase 5 F2 expects examples to score 1–2; not a retry trigger.
- **Custom domains for tenant Workers** — explicitly out of MVP.
- **Auto-regenerate on drift** — explicitly out of MVP per `.planning/PROJECT.md`. Drift Watcher (Phase 8) surfaces diff + one-click; auto is opt-in toggle only.
- **MCP TS SDK v2 migration** — deliberate post-launch refactor PR with golden-API regression. Phase 5 stays on v1 per Phase 1 D-04 + Phase 4 D-31 amendment.
- **Top-10 sandbox onboarding for Linear + Slack** — Phase 9 if ICP traction warrants.

### Reviewed Todos (not folded)
*None — `gsd-sdk query todo.match-phase 5` not invoked at write time; Phase 5 has no inherited todos from prior phases.*

</deferred>

---

*Phase: 05-generation-engine-validation-stage-f*
*Context gathered: 2026-04-29*
