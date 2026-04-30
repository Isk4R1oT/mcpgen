# MCPGen

## What This Is

**MCPGen** is a generator of production-ready MCP servers from any API spec (OpenAPI / GraphQL / Postman). It applies the full set of Anthropic best practices (Six-Tool Pattern, paper rubric description components, MCP tool annotations, response shaping) and validates each generated server with a real agent before deploy. Open-source CLI + managed cloud (Cloudflare Workers for Platforms runtime).

For three ICPs: (A) the solo dev wrapping a third-party API for personal use, (B) the API provider exposing their REST surface to MCP clients, and (C) the internal tools engineer wrapping company services.

## Core Value

**Generated MCP servers measurably outperform hand-written ones on agent task success rate** — because we are the only generator that runs paper-rubric smell scans (F2) and agent-based golden-task evaluation (F3) on every generation, and applies build-time architectural constraints (Six-Tool consolidation, smart IDs, output schemas, truncation guidance) that 97.1% of existing MCP servers get wrong.

If everything else fails, this must work: **paste an OpenAPI URL → 60 seconds later you have a deployed MCP server that scores ≥4.0 on F2 smell rubric and ≥70% F3 agent task success on golden tasks for that API.**

## Requirements

### Validated

- [x] **GEN-09** — Stage F1 static validation (8 cheap deterministic + 3 subprocess checks; failure → upstream-pass retry mapping). Validated in Phase 5: Generation Engine — Validation (Stage F).
- [x] **GEN-10** — Stage F2 smell scan via single Qwen3-Coder (5-shuffle × 3-temp = 15 calls/tool; σ ≥ 0.4 discrimination; 6-component rubric; threshold ≥ 4.0 wired to LAUNCH_CRITERIA). Validated in Phase 5.
- [x] **GEN-11** — Stage F3 agent eval (Sonnet 4.7 test agent + Qwen LLM judge, two-tier evaluator, 3 mock clients, 5 sandbox adapters, 30 hand-authored golden tasks, retry FSM with cascade L2 invalidation). Validated in Phase 5 (mocked tier; real-LLM calibration drain operator-deferred per `05-HUMAN-UAT.md`).

### Active

<!-- v1 (MVP) requirements. All hypotheses until shipped + validated through ICP usage. -->

**Generation Engine (engine workstream)**

- [ ] **GEN-01**: Stage A parses OpenAPI 3.x spec into deterministic Universal IR (RawIR + dependency graph)
- [ ] **GEN-02**: Pass 0 (Tool Inventory & Naming) filters endpoints, names tools `{resource}_{action}`, detects auth subsystem, supports chunked approach for >200 endpoints, enforces tiered caps (≤30 / 31–50 / 51–80 / >80 hard fail)
- [ ] **GEN-03**: Pass 1 (Six-Tool Pattern) consolidates ~50 plans into 6–12 final tools (search/fetch/list_collections/list_objects/upsert/delete + actions/workflows/specialized) with smart IDs and 100% endpoint coverage validation
- [ ] **GEN-04**: Pass 2 (Description Authoring) produces 5-of-6 paper-rubric description components per tool with type-specific length budgets, inline Haiku quality gate, forbidden-pattern regex, examples ONLY from spec
- [ ] **GEN-05**: Pass 3 (Parameter Specification) produces production-ready JSON Schema with 5-component MCP-Bundles parameter descriptions, naming normalization, smart-ID patterns, filter-design selection (structured/DSL/individual)
- [ ] **GEN-06**: Pass 4 (Annotations Inference) emits 4 MCP boolean hints + title for every tool, deterministic 80%, `openWorldHint=true` invariant, conservative aggregation for workflow tools
- [ ] **GEN-07**: Pass 5 (Response Shaping) emits MCP 2025-06-18 outputSchema, pagination strategy, field filtering, truncation thresholds with teaching guidance
- [ ] **GEN-08**: Stage E (Codegen) produces a complete TypeScript Cloudflare Worker project (~25–30 files) via 100% deterministic Jinja2 templates with `tsc --noEmit` validation built in
- [x] **GEN-09**: Stage F1 (Static validation) runs tsc + ajv + ESLint + bundle size + MCP protocol compliance + secret scan and maps each failed check to a specific upstream-pass retry — validated Phase 5
- [x] **GEN-10**: Stage F2 (Smell scan) runs single Qwen3-Coder with 5-shuffle prompt averaging + temperature variance per Model Override doc; threshold ≥ 4.0 on 6-component rubric; per-component failures trigger targeted retries (max 2 rounds) — validated Phase 5
- [x] **GEN-11**: Stage F3 (Agent eval) runs real Sonnet 4.7 agent against golden tasks for top-10 APIs (real sandbox) and mocked env for the rest; two-tier evaluator; pass criterion ≥0.7 server pass rate — validated Phase 5 (mocked tier; real-LLM calibration deferred to operator)
- [ ] **GEN-12**: 4-layer caching (L1 spec sha + L2 pass-input hash + L3 tool hash + L4 Anthropic prompt cache) — repeated generation of the same spec costs $0 LLM
- [ ] **GEN-13**: All LLM calls go through PydanticAI + OpenRouter `OpenAIProvider` using `qwen/qwen3-coder` (Stage F3 test agent is the documented exception — Sonnet 4.7)

**Runtime Plane (runtime workstream)**

- [ ] **RUN-01**: Dispatch Worker on CF Workers for Platforms performs auth precheck, rate-limit, tenant lookup, and dispatches to tenant Worker
- [ ] **RUN-02**: Generated tenant Workers use `@modelcontextprotocol/sdk` + `@mcpgen/runtime` SDK and stay within P99 < 50ms over upstream API latency
- [ ] **RUN-03**: Pass-through credential mode is default — tenant Worker never persists upstream API keys; client passes them in `X-Upstream-Auth`
- [ ] **RUN-04**: Stored credential mode (AES-256-GCM with per-tenant DEK in CF KV) is supported and clearly marked as “less secure”
- [ ] **RUN-05**: OAuth 2.1 mode for user-delegated APIs uses `@cloudflare/workers-oauth-provider` and Logto-managed tokens
- [ ] **RUN-06**: Each tool call emits a usage event → CF Queue → Inngest → TimescaleDB hypertable + Stripe Meters API; no log contains spec text, upstream responses, or upstream credentials
- [ ] **RUN-07**: One-click Claude Desktop config block (or fallback copy-paste) is generated for each deployed server

**Control Plane / Backend (ops workstream)**

- [ ] **CTRL-01**: Hono BFF on CF Workers exposes `POST /api/v1/generate` (job submission) and SSE callback channel per stage
- [ ] **CTRL-02**: Auth uses Logto Cloud free tier (email + GitHub providers; no Google/Twitter/Apple in MVP)
- [ ] **CTRL-03**: Drift Watcher (Inngest cron, daily) hashes upstream specs, surfaces diff in UI, supports manual review / one-click regenerate / auto-regenerate toggle
- [ ] **CTRL-04**: Drizzle migrations cover the data model (organizations → users → projects → specs → generations → deployments → tools with pgvector embedding) on Neon Postgres 16 + TimescaleDB + pgvector
- [ ] **CTRL-05**: R2 holds three buckets (`mcpgen-specs`, `mcpgen-artifacts` 30-day TTL, `mcpgen-public-cache`) with no PII or credentials persisted
- [ ] **CTRL-06**: Stripe Billing + Meters API supports Free (1 F3 eval/mo), Pro (5/mo included), Pay-as-you-go ($0.50/eval), with per-generation cost cap ($0.50 free / $2.00 pro) enforced server-side
- [ ] **CTRL-07**: Quota enforcement blocks free-tier overage and bills Pro overage; cost cap exceeded → hard fail with partial result + bill
- [ ] **CTRL-08**: Sentry (TS + Python with source maps), BetterStack (logs + uptime), Langfuse v4 (LLM tracing via OTel) wired across all components

**CLI (engine/runtime workstream)**

- [ ] **CLI-01**: `npx mcpgen init <openapi-url>` produces a working local MCP server file in <60 seconds (no signup required)
- [ ] **CLI-02**: `mcpgen deploy` pushes the generated server to CF Workers for Platforms tenant namespace and returns a live URL
- [ ] **CLI-03**: CLI ships as a Bun-compiled single binary on npm + GitHub releases

**Frontend (frontend workstream — UI is LOCKED in `claude-design-ui/MCP-Gen.zip`)**

- [ ] **FE-01**: Landing page (already designed) wired to live `/api/v1/generate` job submission
- [ ] **FE-02**: Generation playground consumes SSE callbacks per stage and renders progress + per-pass artifacts
- [ ] **FE-03**: Preview screen shows generated tool list, descriptions, parameters, annotations, response config; full code is visible at every step (transparency principle)
- [ ] **FE-04**: One-click deploy from preview; dashboard shows deployed servers, usage events, costs, F2/F3 quality badge (premium/verified/standard/needs_review)
- [ ] **FE-05**: Frontend phase = wire-up only; visual / layout / typography / copy must NOT be modified

**GTM / Launch (content workstream)**

- [ ] **GTM-01**: Quickstart docs (Mintlify or Docusaurus) tested by an external developer end-to-end
- [ ] **GTM-02**: Privacy + ToS + Pricing page published; pricing matches code-enforced quotas
- [ ] **GTM-03**: Soft launch (W7 of sprint plan) → 20 invited users; public launch (W9) → Show HN, Product Hunt, Reddit r/MachineLearning + r/LocalLLaMA

### Out of Scope

<!-- Explicit v1 exclusions with reasoning. Re-adding requires entry in PROJECT.md Key Decisions. -->

- **GraphQL / Postman / AsyncAPI input formats** — IR is format-agnostic by design but only the OpenAPI 3.x parser ships in MVP. Reason: keep critical path narrow; add via parser plugin post-launch.
- **Python / Rust / Go output runtimes** — TypeScript Cloudflare Workers only in MVP. Reason: codegen templates are deterministic and cheap to add per runtime, but each adds testing surface; demand-driven.
- **Multi-region runtime** — single-region (Cloudflare global edge is implicitly multi-region for routing, but artifact storage / Postgres / Fly Machines are single region). Reason: solo-friendly ops principle.
- **A/B deploys, regression testing across spec versions, custom domains** — defer. Reason: not on critical path to first 100 paying users.
- **SSO / Team plan / RBAC** — Logto Cloud free tier covers email + GitHub; team features defer to t+3mo. Reason: solo-dev / solo-org ICP comes first.
- **Auto-regenerate on drift** — drift detection ships in MVP, but auto-regenerate is opt-in toggle only; default is surface diff + one-click. Reason: silently regenerating live servers is a destructive action.
- **`search_tools` runtime meta-tool / runtime progressive disclosure** — explicitly forbidden by engine v2. Reason: build-time decisions over runtime hopes (engine principle 4).
- **LLM-generated examples without real execution traces** — Pass 2 design forbids this; examples are `null` if spec doesn't provide them. Reason: hallucination prevention; v1.1 sandbox feature.
- **LLM in Stage A / E / F1** — these stages are 100% deterministic. Reason: cost, latency, reproducibility.
- **Public quality badge by default** — opt-in only. Reason: avoid public ranking pressure on early-stage generations.
- **LiteLLM** — replaced by direct OpenRouter via `OpenAIProvider`. Reason: per Model Override doc, single Qwen3-Coder is the only model in the pipeline.
- **Multi-family judge ensemble for F2 (Sonnet + GPT-5 + Gemini)** — replaced by single Qwen3-Coder × 5-shuffle averaging. Reason: per Model Override doc; ~10x cost reduction at acceptable quality drop.
- **Sketch / Spike phases** — design + research already locked in `docs/`. Reason: 9 detail-design docs eliminate the need.
- **Code-mode tool execution** — Native MCP tools only on CF Workers. Reason: Six-Tool Pattern already delivers Code-mode-level token efficiency at the structural level.
- **UI redesign / visual changes / new components in `apps/web`** — UI is shipped from `claude-design-ui/MCP-Gen.zip`. Reason: design is locked; frontend phase is wire-up only.
- **Mocking the database in integration tests** — per global rules. Reason: prior project incident pattern; integration tests must hit a real Neon dev branch.

## Context

**Pre-existing context — this project is unusually well-specified.** Before `/gsd-new-project` ran, the following sources of truth were already authored and live in `docs/`:

- `docs/mcpgen-architecture.md` — system-level architecture
- `docs/mcpgen-generation-engine-v2.md` — engine pipeline (6 LLM passes × 3 stages + 3 deterministic stages + agent-eval stage)
- `docs/mcpgen-pass-{0,1,2,3,4,5}-design.md` — six pass-level detail designs
- `docs/mcpgen-stage-{e,f}-design.md` — codegen + validation detail designs
- `docs/mcpgen-model-and-provider-override.md` — single-model override (`qwen/qwen3-coder` via OpenRouter)
- `docs/mcpgen-git-workflow-rules.md` — branching, commits, PRs, recovery, AI-agent-specific gotchas
- `docs/mcpgen-gsd-sprint-plan.md` — 10-phase parallel multi-terminal execution plan with workstream layout
- `docs/mcpgen-implementation-plan.md` — kept as context for launch criteria, kill switches, anti-patterns
- `docs/mcpgen-ux-flow.md` — UX/copy principles (visual is locked)
- `RULES.md` — hard non-negotiable rules (single TL;DR for all docs)
- `claude-design-ui/MCP-Gen.zip` — locked Claude Design site mock
- `CLAUDE.md` — operational map across all of the above

**Why this matters for `.planning/`:** ROADMAP phases must align with `docs/mcpgen-gsd-sprint-plan.md` 10-phase structure. REQUIREMENTS map 1:1 to design docs. Research (`.planning/research/`) should not redo what `docs/` already specifies — instead it surfaces ecosystem context (libraries, gotchas, recent best-practice shifts) that `docs/` doesn't cover.

**The market thesis (paper-backed):** arXiv 2602.14878 ("MCP Tool Descriptions Are Smelly!") finds 97.1% of existing MCP servers have ≥1 rubric smell, and 84.3% have Opaque Parameters specifically. Anthropic's "Writing effective tools for agents" engineering blog explicitly recommends NOT optimizing for description length and instead being explicit (sometimes hundreds of tokens for complex tools). MCP spec 2025-03-26 introduced 4 tool annotations whose defaults are dangerous (`destructiveHint: true`, `openWorldHint: true` by default → confirmation prompts in Cursor). MCP-Bench (arXiv 2508.20453) provides the agent-eval methodology used in F3.

**Why now:** ChatGPT Deep Research integration and Claude Desktop / Cursor mainstream adoption make MCP a real distribution channel. Hand-written MCP servers are still the norm; tooling is nascent. The Six-Tool Pattern reached industry consensus only in October 2025 (Anthropic + OpenAI + MCP Bundles).

**Solo-founder operating reality:** YOLO mode, fine granularity, parallel workstreams, inherit-model agents (single Qwen for the engine, current session model for planning agents). Demo-driven Friday cadence per implementation plan §11.

## Constraints

- **Tech stack — LOCKED:** Next.js 15 + Tailwind + shadcn (web/Vercel), Hono + Bun (control plane / CF Workers), Python 3.12 + FastAPI + PydanticAI (engine / Fly Machines auto-suspend), TypeScript + `@modelcontextprotocol/sdk` (generated tenant Workers / CF Workers for Platforms), PostgreSQL 16 + pgvector + TimescaleDB on Neon, R2, Logto, Inngest, Stripe Billing + Meters, Langfuse v4, Sentry, BetterStack, Resend. Source: `docs/mcpgen-architecture.md` §4. **Reason:** changes here are vendor migrations, not implementation work — frozen for MVP.
- **LLM model — LOCKED to single override:** `qwen/qwen3-coder` via OpenRouter `OpenAIProvider` for ALL generation passes (0–5) and F2 smell scan. Stage F3 test agent is the documented exception (real Sonnet 4.7 because it simulates production users). Source: `docs/mcpgen-model-and-provider-override.md`. **Reason:** ~10–20× cheaper per generation ($0.10–0.13 vs $1–3); single source of truth eliminates ambiguity across 10+ docs.
- **UI — LOCKED:** `claude-design-ui/MCP-Gen.zip` ships unchanged into `apps/web/src/`. Frontend phase = wire-up only. **Reason:** design is finished; rebuilding wastes weeks.
- **Privacy — LOCKED:** never log spec content, upstream API responses, or upstream credentials. OK to log: generation metadata, tool names, IR structure, performance metrics, error traces. Source: `docs/mcpgen-architecture.md` §11. **Reason:** trust + GDPR + ICP-A (solo dev) baseline expectation.
- **Pass-through credentials are default; stored credentials are clearly marked “less secure”.** Source: `docs/mcpgen-architecture.md` §6 + RULES.md. **Reason:** we are an HTTP translator — holding upstream secrets is a liability we don't need.
- **Hard caps on tool count after Pass 0 (≤30 ok / 31–50 forces Pass 1 / 51–80 aggressive merge / >80 hard fail with multi-server split suggestion). Pro override raises to 100.** Source: `docs/mcpgen-pass-0-design.md`. **Reason:** agents degrade past ~50 tools (Anthropic data); we won't ship a server we know is broken.
- **Coverage 100% mandatory in Pass 1 (no endpoint dropped silently between Pass 0 and Pass 1 final tools).** Source: `docs/mcpgen-pass-1-design.md`. **Reason:** "MCP-quality" claim falls apart if functionality is silently lost.
- **Generation cost cap: $0.50 free / $2.00 Pro.** Exceeding → hard fail with partial result + bill. Source: `docs/mcpgen-architecture.md` §10. **Reason:** unit economics protection.
- **F2 smell-scan threshold ≥ 4.0 (NOT ≥3); F3 agent-eval pass rate ≥ 0.7.** Source: `docs/mcpgen-stage-f-design.md`. **Reason:** these are the launch-criterion gates; below them we don't ship.
- **MCP protocol target: 2025-06-18 outputSchema standard + 2025-03-26 tool annotations.** **Reason:** required by mainstream clients (Claude Desktop, Cursor, ChatGPT Deep Research).
- **Git workflow — LOCKED:** trunk-based, short-lived `feature/*`/`fix/*`/`refactor/*`/`docs/*`/`chore/*`/`test/*`/`experiment/*` branches; Conventional Commits 1.0.0 mandatory; atomic commits (split if "and" appears in subject); squash-merge only; pre-commit hooks (gitleaks + lint + typecheck) NEVER bypassed; force-push to main forbidden. Source: `docs/mcpgen-git-workflow-rules.md`. **Reason:** AI-agentic workflow has known gotchas (plausible-but-wrong code, phantom file refs, context drift); these rules mitigate.
- **Workstream isolation — LOCKED:** `git worktree add` + `--ws <name>` flag / `GSD_WORKSTREAM=<name>` env var per terminal. Source: `docs/mcpgen-gsd-sprint-plan.md`. **Reason:** 4–5 parallel Claude instances in single repo without isolation = collision.
- **Timeline:** ~6 weeks from Phase 1 to public launch via 10-phase parallel sprint plan. Source: `docs/mcpgen-gsd-sprint-plan.md`. **Reason:** demo-driven Friday cadence; missing this = solo burnout (R2 in implementation plan).
- **Solo-founder reality — LOCKED:** managed services > self-host where price difference < 30% of revenue (`docs/mcpgen-architecture.md` principle 7); time > $20/mo of infra savings.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single LLM model `qwen/qwen3-coder` via OpenRouter for entire generation pipeline | ~10–20× cheaper than Sonnet/Haiku/Opus mix; PydanticAI works with OpenAI-compatible providers; F3 test agent stays on real Sonnet 4.7 because it simulates production agent behavior | — Pending (Day-1 smoke test required per Override doc §X) |
| GSD granularity = `fine` (8–12 phases) | Matches the 10-phase structure already designed in `docs/mcpgen-gsd-sprint-plan.md` | — Pending |
| GSD execution = `parallel` | Matches workstream layout (engine / runtime / ops / frontend / main) with git worktrees per terminal | — Pending |
| GSD model_profile = `inherit` | Single source of truth across the pipeline; planning-agent model can swap independently from generation-engine model | — Pending |
| Native MCP tools (NOT Code Mode) for generated servers | Six-Tool Pattern delivers Code-Mode-level token efficiency at the structural level without runtime code execution risk | — Pending |
| F2 smell-scan replaces multi-family judge ensemble (Sonnet + GPT-5 + Gemini) with single Qwen3-Coder × 5-shuffle prompt averaging + temperature variance | ~10× cost reduction; quality target ~75–80% human agreement vs 86.67% multi-family — acceptable for a build-time gate | — Pending (quarterly calibration with human evaluators required) |
| UI shipped from `claude-design-ui/MCP-Gen.zip` unchanged | Design is finished; rebuilding the visual layer would burn 1–2 weeks of solo time without ICP value | — Pending |
| Pass-through credentials as default; stored credentials marked “less secure” | Reduces liability surface; matches ICP-A (solo dev) trust baseline | — Pending |
| Drift detection in MVP, auto-regenerate opt-in only | Silent regeneration of live tenant Workers is a destructive action; default = surface diff + one-click | — Pending |
| F3 agent eval is opt-in for free tier (1/mo) and 5/mo included for Pro | Eval cost ($1–3) is the dominant unit-cost; quota balances "MCP-quality" claim with sustainable margin | — Pending |
| Hard cap >80 tools = hard fail with multi-server split suggestion (not a degraded best-effort) | Agents demonstrably degrade past ~50 tools; shipping a known-broken server damages the "MCP-quality" claim | — Pending |
| `openWorldHint = true` invariant in Pass 4 | We wrap external REST APIs by definition; there is no closed-world case in MCPGen's surface area | — Pending |
| Examples ONLY from spec in Pass 2; LLM-hallucinated examples forbidden until v1.1 | Hallucinated examples are the most common smell in existing MCP servers; spec-only is safe | — Pending |
| Single-region (Fly Machines + Neon Postgres in one region) | Solo-friendly ops; CF Workers global edge handles request routing for runtime plane | — Pending |
| Soft launch W7 (20 invited) → public launch W9 (Show HN + PH + Reddit) | Demo-driven Friday cadence; soft launch surfaces breakage before public launch | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-26 after initialization*
