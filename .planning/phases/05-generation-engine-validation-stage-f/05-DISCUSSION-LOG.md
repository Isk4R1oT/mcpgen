# Phase 5: Generation Engine — Validation (Stage F) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered and the rationale for the auto-mode selections.

**Date:** 2026-04-29
**Phase:** 05-generation-engine-validation-stage-f
**Mode:** `--auto` (Claude picked recommended option for each gray area; user can override by editing CONTEXT.md before plan-phase)
**Areas discussed:** F1 implementation surface · F2 single-judge mitigation · F3 test-agent harness + sandbox vs mocked · Mock client harness · Retry orchestration architecture · QualityReport assembly · Engine HTTP API extension · Fixture validation · CLI surface · Cost & quota gating

---

## F1 Static Validation — Implementation Surface

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Single F1 module with all 11 checks inline** | One `f1_static.py` file with sequential check functions | |
| **B. F1 orchestrator + per-category check modules under `f1_checks/`** | One module per category (ts_compile, json_schema, mcp_compliance, secret_scan, etc.) — split for testability | ✓ |
| **C. Per-check separate plans (one plan per check)** | 11 separate plan files | |

**Auto-selected:** B — matches Phase 2/3/4 module-layout pattern (per-pass `passes/pass_N/` with sibling helper modules); each check is independently testable; addition of a new check (e.g., post-launch hardening) is a single file. C overshoots granularity (11 plans is too many for a single phase wave). A bunches everything in one file — harder to test in isolation.

**Rationale logged in D-04 + D-05.**

---

## F1 — Check Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Cheapest deterministic first (bundle_size → template_artifacts → smart_id_fuzz → ...) → tsc + gitleaks last** | Abort early on hard failures; minimize wasted CPU | ✓ |
| **B. Most-likely-to-fail first** | Heuristic ordering by historical failure rate | |
| **C. Alphabetical** | Deterministic but uninformative | |

**Auto-selected:** A — minimizes wasted work when a deterministic check fails before expensive subprocesses run. B requires production data to calibrate; not available pre-launch. C is unfounded.

**Rationale logged in D-05.**

---

## F2 — Single-Judge Mitigation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| **A. 5-shuffle × 3-temperature = 15 evaluations per tool + σ ≥ 0.4 metric** | Per Override doc §4 + Pitfall #9 | ✓ |
| **B. 3-shuffle × 2-temperature = 6 evaluations** | Cheaper but less stable | |
| **C. Self-critique loop (1 initial + 1 critique = 2 calls/tool)** | Override doc §4.2 technique 3 | |
| **D. Multi-model (Qwen + Haiku second opinion)** | Override doc §4.4; reverts to multi-judge | |

**Auto-selected:** A — explicitly recommended in `docs/mcpgen-model-and-provider-override.md` §4.2; the σ ≥ 0.4 discrimination metric (Pitfall #9) is the specific safety net for single-judge mode-collapse on similar tools. B is not enough variance reduction. C/D are deferred fallbacks (Phase 8/9 if production data shows insufficient discrimination).

**Rationale logged in D-09 + D-12.**

---

## F2 — Per-Component → Retry Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Per-component < 3 → specific upstream pass retry per Stage F design §4.5** | Granular targeting | ✓ |
| **B. Overall < 4.0 → blanket Pass 2 retry** | Simpler; less targeted | |
| **C. Per-component < 3.5 (more lenient threshold)** | More retries; higher cost | |

**Auto-selected:** A — matches Stage F design §4.5 verbatim; granular targeting is what makes "5× cheaper than full regen" possible per design §8.2. B causes over-retrying on Pass 3-only failures. C inflates cost without improving outcomes (per-component < 3 is the empirical "broken description" boundary).

**Rationale logged in D-13 + D-14.**

---

## F3 — Test Agent Model

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Real Sonnet 4.7 via Anthropic SDK (the documented Override-doc exception)** | Override doc §7.3 + Stage F design §5.1 | ✓ |
| **B. Qwen3-Coder via OpenRouter (uniform with generation pipeline)** | Cheaper, uniform, but invalidates F3's predictive value | |
| **C. GPT-5 cross-check** | Stage F design mentions; Override doc retired | |

**Auto-selected:** A — Override doc §7.3 is explicit that F3 test agent is the documented exception (simulates production agent behavior; testing with the production model is the whole point). B would invalidate F3's predictive value: Sonnet is what real users run; Qwen is what we generate with. They're two different roles. C was retired by Override doc.

**Important nuance:** F3 LLM JUDGE (evaluating the agent's trajectory) IS Qwen3-Coder. Only the test AGENT is Sonnet.

**Rationale logged in D-02 + D-19 + specifics paragraph 4.**

---

## F3 — Server Spawning Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| **A. `wrangler dev --local` subprocess (Miniflare-emulated)** | Phase 4 D-39 already pinned wrangler 4.x | ✓ |
| **B. Real CF Workers deploy to a sandbox namespace** | More realistic; requires Phase 6 dispatch | |
| **C. Direct invocation of compiled Worker JS in Python (via QuickJS)** | No subprocess; smaller perf footprint; brittle | |
| **D. MCP Inspector in headless mode** | Phase 4's manual gate uses it; not designed for automation | |

**Auto-selected:** A — `wrangler dev --local` is already pinned by Phase 4 D-39; Miniflare's Worker emulation is faithful enough for F3's purposes; subprocess management is the only new infra (handled in `server_runner.py`). B requires Phase 6 to be live, which it isn't. C is brittle (QuickJS doesn't fully implement the Workers Runtime API). D is interactive-only.

**Rationale logged in D-18 + specifics paragraph 7.**

---

## F3 — Real vs Mocked Upstream

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Hybrid (real for top 10 APIs; mocked for rest)** | Per Stage F design §5.2 | ✓ |
| **B. All real (live sandboxes for every fixture)** | Most realistic; expensive sandbox management | |
| **C. All mocked (Python-side spec-derived mock-response generator)** | Cheapest; least realistic | |

**Auto-selected:** A — explicitly the design recommendation; balances realism (top APIs catch real upstream issues) with cost (long-tail APIs use mocks). Phase 5 specifically delivers Stripe + GitHub + Notion in real sandbox; Linear + Slack in mocked (a pragmatic scope cut to fit Phase 5 plan budget).

**Rationale logged in D-22 + D-43.**

---

## F3 — Golden Task Authorship

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Hand-author Stripe + GitHub + Notion (3 fixtures × 10 tasks); auto-generate Linear + Slack** | Pragmatic scope cut | ✓ |
| **B. Hand-author all 5 fixtures (50 tasks total)** | Highest fidelity; ~25 hours hand-tune | |
| **C. Auto-generate all 5 fixtures via Pass 0 LLM** | Cheapest; lowest fidelity | |

**Auto-selected:** A — matches the asymmetric fixture investment Phase 5 success criterion #4 implies (Stripe/GitHub/Notion are the launch-demo APIs; Linear/Slack are launch-confirmation APIs). B inflates Phase 5 plan budget by 10+ hours without proportionate ICP value. C produces low-fidelity tasks that won't catch real F3 issues.

**Rationale logged in D-23 + D-43.**

---

## Mock Client Harness — Composition

| Option | Description | Selected |
|--------|-------------|----------|
| **A. 3 mock clients: Cursor + Claude Desktop older + ChatGPT Deep Research** | Per Pitfalls #4/#31/#32 + ROADMAP success criterion #3 | ✓ |
| **B. Cursor only** | Insufficient for #4 + #32 | |
| **C. Real Claude Desktop + Cursor + ChatGPT in CI** | Defers to Phase 9 multi-client smoke | |

**Auto-selected:** A — exact mapping to ROADMAP Phase 5 success criterion #3 + Pitfalls #4/#31/#32. Mock clients run as Python classes calling the spawned server via HTTP — cheap (~3s total), parallel, and sufficient to catch P0 client compatibility issues before F3 burns Sonnet tokens. B undercovers two P0/P1 pitfalls. C is Phase 9 scope.

**Rationale logged in D-21 + specifics paragraph 14.**

---

## Retry Orchestration — Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Explicit FSM (`retry_orchestrator.py`) with 8 states + match statement + persisted `retry_state.json`** | Explicit; debug-friendly | ✓ |
| **B. Recursive function calls (no explicit state machine)** | Compact; harder to reason about | |
| **C. State-machine library (`transitions`)** | Less code; another dep | |
| **D. Reactive streams (RxPy)** | Overkill for 8-state FSM | |

**Auto-selected:** A — for 8 states with cascading invalidation rules (D-26) and a max-2-rounds cap, an explicit FSM is the simplest correct approach. The persisted `retry_state.json` artifact is invaluable for debugging support tickets ("here's exactly what was retried and why"). B doesn't capture the round counter cleanly. C/D are over-engineering.

**Rationale logged in D-24.**

---

## Retry Orchestration — Cascade Invalidation Rules

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Strict downstream invalidation (Pass N retry → invalidate Pass N+1, N+2, ..., F1, F2)** | Conservative; over-invalidates slightly | ✓ |
| **B. Surgical invalidation (only invalidate downstream passes that read the changed field)** | Cheaper but error-prone | |
| **C. Full cache flush on any retry** | Wasteful | |

**Auto-selected:** A — over-invalidate slightly rather than under-invalidate and serve stale data. B requires per-pass dependency tracking that's brittle to maintain. C wastes Pass 0/1 work that's still valid.

**Rationale logged in D-26.**

---

## Retry Budget Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Round counter + cost guard + time guard (3 dimensions)** | Per Stage F design §8.3 | ✓ |
| **B. Round counter only** | Simpler; cost-cap unenforced | |
| **C. Cost-only enforcement** | Could allow infinite retries if each is cheap | |

**Auto-selected:** A — defense-in-depth for the cost cap + wall-clock budget. The 2-round cap alone could allow ~10× cost overrun if each retry is full pipeline; the cost guard ensures `LAUNCH_CRITERIA` cap isn't exceeded.

**Rationale logged in D-27.**

---

## QualityReport — Composite Score Formula

| Option | Description | Selected |
|--------|-------------|----------|
| **A. 10% F1 binary + 40% F2 + 50% F3** | Per Stage F design §9 + agent-eval-prioritization | ✓ |
| **B. 33% F1 + 33% F2 + 34% F3** | Equal weighting | |
| **C. 5% F1 + 25% F2 + 70% F3** | F3-heavy | |
| **D. F2 only when F3 absent; F3 only when F3 present** | Simpler but loses F1 signal | |

**Auto-selected:** A — agent-eval (F3) is the most predictive of real-world success per Stage F design §5.1 (MCP-Bench finding); F2 is a smell scan (correlated but not equivalent); F1 is a binary gate (passes or doesn't matter for badge). Weighting reflects this hierarchy. B treats binary check as equivalent to graded LLM judge, which is wrong. C overweights stochastic agent-eval. D loses the F1 signal entirely.

**Rationale logged in D-28.**

---

## Engine HTTP API — F3 Opt-In Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| **A. `f3_enabled: bool` request body field; auto-trigger on F2 < 4.0 OR σ < 0.4** | Per Stage F design §5.9 | ✓ |
| **B. F3 always on; quota check inline** | Simpler but blows free tier | |
| **C. F3 always off; explicit only via opt-in** | No auto-trigger safety net | |

**Auto-selected:** A — matches Stage F design §5.9 + Pitfall #9 force-trigger logic. The auto-trigger is the safety net for F2 mode-collapse; without it, Pitfall #9 would be unmitigated. B explodes free-tier cost; C ships uncalibrated F2 results.

**Rationale logged in D-17 + D-35.**

---

## CLI — F1/F2/F3 Progress Display

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Per-stage progress lines + final QualityReport summary box** | Visual hierarchy; matches Stage F design §9 | ✓ |
| **B. Single-line progress with percentage** | Compact but less informative | |
| **C. Streaming JSON only (no formatted output)** | Machine-readable; user-unfriendly | |

**Auto-selected:** A — per UX best practice (visible per-step progress); matches Stage F design §9 visual layout. B hides the per-tier breakdown that's the entire point of the badge. C is fine as a fallback (`--json` flag); not the default.

**Rationale logged in D-38.**

---

## CLI — New Flags

| Option | Description | Selected |
|--------|-------------|----------|
| **A. `--f3` + `--sandbox-creds <path>` + `--strict`** | Practical CI + dev ergonomics | ✓ |
| **B. `--f3` only** | Insufficient for CI use | |
| **C. Many flags (--f1-only, --skip-mock-clients, --golden-tasks <path>, ...)** | Surface area too wide | |

**Auto-selected:** A — minimum viable set for both interactive use and CI integration. The `--strict` flag is essential for CI (exit non-zero on quality threshold failure). B doesn't cover CI need or sandbox cred handling. C inflates surface area without proportionate value.

**Rationale logged in D-39.**

---

## Fixture Validation — Tolerance Bounds

| Option | Description | Selected |
|--------|-------------|----------|
| **A. F1 exact match (deterministic) / F2 ±0.5 overall ±1.0 per-tool / F3 ±0.2 pass_rate** | Wider tolerance for stochastic stages | ✓ |
| **B. All tolerances ±0.3 (matches Pass 2 D-41)** | Too tight for F2 rubric scoring | |
| **C. Block on any diff (ignore stochasticity)** | False-positive CI failures | |

**Auto-selected:** A — F2 rubric scoring is wider-variance than Pass 2 description text (graded-vs-text); F3 is even more stochastic (Sonnet + sandbox state). Tolerances calibrated to Stage F design §11 cost/latency expected variance. B causes false-positive CI failures from normal LLM variance. C is the same problem amplified.

**Rationale logged in D-41.**

---

## Cost & Quota Gating

| Option | Description | Selected |
|--------|-------------|----------|
| **A. Env-var stub quota check (`MCPGEN_F3_FREE_BUDGET_PER_GENERATION`); Phase 8 wires Stripe** | Pragmatic Phase 5 scope | ✓ |
| **B. Wire Stripe Meters lookup directly in Phase 5** | Couples Phase 5 to Phase 8 | |
| **C. No quota check; rely on cost cap only** | Permits free-tier abuse | |

**Auto-selected:** A — keeps Phase 5 dependencies minimal (Phase 8 is the billing/quota phase per ROADMAP). The env-var stub is a clean handoff: Phase 8 replaces the function body with a Stripe lookup, no other Phase 5 code changes. B couples phases that should stay decoupled. C is exploitable.

**Rationale logged in D-29 sandbox_environment field + scope cut to Phase 8.**

---

## Claude's Discretion Items

The planner has flexibility on (logged in CONTEXT.md `### Claude's Discretion`):
- Whether `f1_checks/` modules are individual files or a single multi-class file
- Whether `gitleaks` is invoked via subprocess or Python wrapper library
- Whether the retry FSM is implemented via explicit state variable + match-statement OR a state-machine library
- Whether F3 server runner spawns ONE `wrangler dev` subprocess for all 10 tasks OR per-task subprocess
- Whether mock clients are implemented as Python classes OR full TS code in F3 subprocess
- Sub-module file boundaries within `stage_f/`
- Whether `tsc --noEmit` + `ajv` + `eslint` run sequentially or in parallel
- Specific `tenacity` retry decorator config for F2 LLM calls
- Whether `mock_upstream.py` is a Python lib OR a third-party tool wrapper (WireMock, MSW)
- Whether F3 trajectory recording uses Langfuse session_id keying OR flat-file artifact
- Whether canonical `search_signature.json` / `fetch_signature.json` are hand-authored OR auto-extracted from Pass-1 reference
- Whether `golden_tasks.json` is JSON-Schema-validated at load OR Pydantic-parsed at engine startup
- Whether F3 retry budget shares with F2 OR has separate counter
- Whether Sonnet test-agent rate-limit handling uses Anthropic SDK retry OR `tenacity`
- Whether QualityReport SSE event payload is full dump OR summary-only

---

## Deferred Ideas

Tracked in CONTEXT.md `<deferred>` section. Highlights:
- Real CF Workers deploy → Phase 6
- Stripe Meters / billing / real cost cap → Phase 8
- Drift Watcher full implementation → Phase 8
- Frontend wire-up (UI locked) → Phase 7
- Quarterly judge calibration → post-launch
- Multi-provider OpenRouter routing for F2 → Phase 8/9 fallback
- F3 user-supplied golden tasks (Pro feature) → Phase 8 gating
- Self-critique loop for F2 → Phase 8/9 fallback
- F2 dual-model (Qwen + Haiku second opinion) → Phase 8/9 fallback
- Continuous post-deploy validation → out of MVP
- Cross-tool description coherence → v1.1 F2 sub-check
- Top-10 sandbox onboarding for Linear + Slack → Phase 9

---

*All decisions captured per Stage F design + Override doc + Pitfalls; no scope creep introduced.*
