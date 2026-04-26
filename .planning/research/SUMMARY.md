# Project Research Summary — MCPGen

**Project:** MCPGen
**Domain:** MCP-server generator (OpenAPI 3.x → TypeScript Cloudflare Workers via Python LLM-orchestrated codegen)
**Researched:** 2026-04-26
**Confidence:** HIGH for locked decisions verified against `docs/`; MEDIUM for new ecosystem dependencies and pitfalls surfaced during research; LOW for live competitor parity (web tools were unavailable during the FEATURES run — flagged in §Sources).

---

## Executive Summary

MCPGen is unusually well-specified before research: 9 detail-design docs in `docs/` lock most stack, pipeline, contract, and engine-pass decisions, and a 10-phase parallel sprint plan (`docs/mcpgen-gsd-sprint-plan.md`) is already in place. The four research files therefore did not redesign the system — they (a) **verified** locked decisions against current ecosystem reality (Context7), (b) **surfaced 8 Phase-1 refinements** the docs miss, and (c) **catalogued 34 pitfalls** that aren't already in `mcpgen-implementation-plan.md` §11.5–§11.7. The roadmap should fold the 8 refinements into Phase 1 contracts and treat the P0 pitfalls as launch-criteria gates.

Execute the 10-phase plan as written, with no resequencing: Phase 1 Foundation → Phases 2–5 Engine (sequential, ~3.5 weeks) ‖ Phase 6 Runtime ‖ Phase 7 Frontend (UI locked, wire-up only) ‖ Phase 8 Auth/Billing → Phase 9 Observability integration → Phase 10 Launch. Five contracts (`packages/ir`, `packages/contracts/generation-api`, `packages/contracts/usage-event`, DB schema v1, runtime SDK interface stub) must freeze at the end of Phase 1; everything downstream depends on them. The model and provider override (`qwen/qwen3-coder` via OpenRouter through PydanticAI's `OpenAIProvider`) is the single source of truth for all LLM decisions and must be enforced as a CI invariant.

The two highest-impact risk clusters are **multi-tenant isolation correctness** (Smart-ID prefix collision #1, single-namespace-per-environment in CF Workers for Platforms #11, pass-through credential redaction #12) and **MCP ecosystem drift** (TypeScript SDK v1 vs v2 picks, `outputSchema` graceful degradation for older clients #4, Cursor's `openWorldHint` confirmation behavior #31, ChatGPT Deep Research signature compliance #32). Both need launch-criteria-grade enforcement (fixture-based F1 checks, runtime capability negotiation, cross-tenant fuzz testing in Phase 9).

---

## Key Findings

### Recommended Stack

The stack is **LOCKED** by `docs/mcpgen-architecture.md` §4 and `docs/mcpgen-model-and-provider-override.md`. STACK.md primarily verified versions and surfaced implicit dependencies.

**Core technologies (locked):**
- **Frontend:** Next.js 15 + Tailwind 4 + shadcn 3 on Vercel — UI shipped pre-built in `claude-design-ui/MCP-Gen.zip`; wire-up only.
- **Control Plane:** Hono 4 on Bun → CF Workers; async-job + SSE-callback (not WebSocket).
- **Generation Engine:** Python 3.12 + FastAPI 0.128 + PydanticAI on Fly.io Machines; single LLM `qwen/qwen3-coder` via OpenRouter `OpenAIProvider`. **LiteLLM removed.**
- **Tenant Workers:** TypeScript + `@modelcontextprotocol/sdk` + `@mcpgen/runtime` on CF Workers for Platforms — Native MCP, NOT Code Mode.
- **Data:** Neon Postgres 16 + pgvector + TimescaleDB; R2 (3 buckets); CF KV.
- **Ops:** Logto Cloud (free → Pro pre-W7), Inngest, Stripe Billing + Meters, Langfuse v4 via OTel + Logfire, Sentry, BetterStack, Resend.
- **Build:** Turborepo 2 + pnpm 9; Python `uv` + `ruff` + `mypy --strict` + `pytest`; CLI as Bun-compiled binary.

**New/implicit deps surfaced (not in docs):** `prance[osv]`, `pydantic-settings`, `tenacity`, `structlog`, `aioboto3`, `gitleaks` binary, `psycopg[binary,pool]`, `@tanstack/react-query`, `eventsource-parser`, `zod` v4 (with MCP SDK v2) or v3 (v1).

**Open drift requiring a Key Decision before Phase 2:** `@modelcontextprotocol/sdk` v1 vs v2 (breaking `registerTool` signature, Standard Schema requirement, package alias). STACK §6.1 recommends v1 for MVP; lock at end of Phase 1.

### Expected Features

The v1 feature surface in PROJECT.md is correct as-is. FEATURES.md proposes **no removals**, but recommends 8 small **additions** the docs imply but don't enumerate.

**Must have (already in PROJECT.md):** Paste-URL → 60s working server (no signup); one-click Claude Desktop config; auth mode selection (none/API key/pass-through/OAuth) with pass-through default; email + GitHub auth only; hosted deploy + dashboard + drift detection; F1 + F2 ≥4.0 + F3 ≥0.7.

**Should have (locked in design docs):** Six-Tool Pattern + smart IDs + 100% coverage validation; 4 MCP annotations always set with `openWorldHint=true` invariant; `outputSchema` (MCP 2025-06-18) + truncation guidance teaching templates; quality badge with opt-in public mode; 4-layer caching.

**Add to PROJECT.md (FEATURES.md surfaces — recommended P1):**
1. MCP Inspector compatibility check in F1.
2. `.mcpgen.yaml` project config in generated repo.
3. `mcpgen sync` + `mcpgen regenerate` CLI subcommands.
4. Privacy mode (CLI-only, no spec upload) for ICP-C.
5. Generation playground (in-browser tool execution against live deployment).
6. Markdown / PDF export of Quality Report.
7. Resumable generation via job ID URL.
8. OpenAI compliance fixture for `search`/`fetch` signatures in F1 (Pitfall #32).

**Defer v1.x:** tool-level "regenerate this one", inline edit description, `mcpgen logs --tail`, status badge SVG, generation versioning + rollback, custom domains.

**Defer v2+:** GraphQL/Postman/AsyncAPI parsers, Python/Rust/Go runtimes, A/B deploys, SSO/Team/RBAC, multi-region, Code Mode, examples generation from execution traces.

### Architecture Approach

The 4-plane architecture is **verified correct**. ARCHITECTURE.md introduces no new components and reorders no phases.

**Major components (workstream ownership):** Web App (frontend) · CLI (engine + runtime) · BFF / Gateway (ops + main) · Generation Engine (engine) · Dispatch Worker (runtime) · Tenant Worker (runtime SDK + engine codegen) · Usage Pipeline (runtime + ops) · Data Plane (Neon + R2 + KV + Langfuse).

**Eight Phase-1 refinements (must fold into roadmap):**
1. Sample tenant Worker scaffold so Phase 6 unblocks without engine completion.
2. Empty-DSN Sentry SDK init in all 4 apps + CI source map upload step.
3. Langfuse OTel exporter init in engine scaffold (no DSN; traces from Phase 2 day 1).
4. `mcpgen-sandbox` CF namespace + token (F3 isolation from production).
5. Lock IR source-of-truth direction — recommend TS Zod → Pydantic codegen.
6. DB schema v1 includes `pending_callbacks` table for SSE callback retry.
7. Idempotency keys at all 4 surfaces (POST /generate, Inngest job, Stripe Meters event, CF dispatch deploy).
8. Phase 8 Stripe Meters can start in Wave 1–2 against synthetic test events.

**Five contracts that MUST freeze at end of Phase 1:**

| # | Contract | Location |
|---|----------|----------|
| 1 | IR schema (TS Zod source → Pydantic codegen) | `packages/ir/` |
| 2 | Generation API (request/SSE event/error codes/idempotency) | `packages/contracts/src/generation-api.ts` |
| 3 | DB schema v1 (Drizzle migrations) | `infrastructure/neon/migrations/0001_init.sql` |
| 4 | Tenant Worker SDK API (interface stub) | `packages/runtime-sdk/src/index.ts` |
| 5 | Usage event schema (Timescale columns + Stripe Meters dimensions) | `packages/contracts/src/usage-event.ts` |

### Critical Pitfalls (top 5 P0 — every phase researcher must read)

1. **#11 — CF Workers for Platforms namespace-per-tenant is forbidden.** Single dispatch namespace per environment (`mcpgen-prod`, `mcpgen-staging`); tenant identity = script name. Lock at Phase 1.
2. **#1 — Smart-ID server-prefix collision across tenants.** Mint server slug as `{tenant_short_id}-{spec_slug}` at deploy time; F1 cross-tenant fuzz check.
3. **#2 — OpenRouter quantization drift.** Pin in PydanticAI: `extra_body={"provider": {"order": [...], "allow_fallbacks": false, "quantizations": ["fp16"], "require_parameters": true}}`.
4. **#12 — Pass-through credentials leaking into Sentry/Langfuse.** Stage E template MUST install Sentry `beforeSend` redaction for `X-Upstream-Auth`, `Authorization`, `Cookie`, plus all spec-declared auth headers; Phase 9 PII audit with deliberate leak test.
5. **#15 / #4 — DNS rebinding + `outputSchema` breaking 2024-spec clients.** Stage E installs `hostHeaderValidation`; dispatch parses client `protocolVersion` during `initialize` and gates `outputSchema` behind capability negotiation.

**Other notable P0/P1:** #29 (lowering F2/F3 thresholds — encode launch criteria as runtime constants in `packages/contracts/launch-criteria.ts`); #27 (PydanticAI/OpenRouter SDK hallucinated API — Day-1 smoke test mandatory); #8 (Stage E bundle >1MB — `wrangler deploy --dry-run` size gate in F1); #31 (Cursor confirms read-only tools when `openWorldHint=true` — relies on `readOnlyHint=true` precedence; F3 must include Cursor mock); #17 (Logto 5K MAU lock — pre-buy Pro at W7); #20 (SSE lost on Vercel cold start — Postgres = source of truth, `last-event-id` resume); #18 (Drizzle migration filename collisions — timestamp prefix from day 1).

---

## Implications for Roadmap

The 10-phase structure is verified correct. Adopt as-is with the 8 Phase-1 refinements folded in.

### Phase 1: Foundation
**Rationale:** 5 contracts + 8 refinements block all parallel work.
**Delivers:** empty-but-deployable monorepo; frozen contracts; Sentry/Langfuse skeleton; sandbox CF namespace; `packages/engine-fixtures/` shadow service; pre-commit hooks.
**Avoids:** P0 #11, #18, #29; P1 #19, #20, #24, #26.

### Phase 2: Engine Architect (Pass 0 + Pass 1)
**Rationale:** First LLM phase; Day-1 smoke test mandatory.
**Delivers:** Pass 0 inventory with chunked approach + tiered caps; Pass 1 Six-Tool Pattern with 100% coverage validation + tenant-prefixed smart-ID schema.
**Avoids:** #1, #2, #3, #6, #27, #28.

### Phase 3: Engine Author (Pass 2 + Pass 3 + Pass 4)
**Rationale:** Pass 2 + Pass 3 parallel; Pass 4 last (verb-pattern edge cases need parameter info).
**Delivers:** 5-of-6 paper rubric description components per type-specific budgets; production-ready JSON Schema with 5-component MCP-Bundles; 4 MCP annotations with `openWorldHint=true` invariant.
**Avoids:** #7, #10, #31.

### Phase 4: Engine Shape & Codegen (Pass 5 + Stage E)
**Rationale:** Pass 5 needs all earlier passes; Stage E is 100% deterministic Jinja2.
**Delivers:** outputSchema + pagination + field filtering + truncation guidance; ~25–30 generated TS files via Jinja2 with `tsc --noEmit` + `wrangler deploy --dry-run` size validation; auth middleware + DNS-rebinding host validation + Sentry beforeSend redaction baked into every Worker.
**Avoids:** #4, #5, #8, #12, #15, #30, #33.

### Phase 5: Engine Validation (Stage F: F1 + F2 + F3)
**Rationale:** F2 doesn't strictly depend on Stage E but pipeline runs E→F2 for retry simplicity; F3 needs sandbox tenant Worker (gate with Phase 6).
**Delivers:** F1 static + bundle-size + OpenAI compliance fixture + cross-tenant smart-ID fuzz; F2 smell scan with between-tool σ ≥0.4 discrimination metric; F3 with two-tier evaluator + Cursor/Claude Desktop/ChatGPT mocks; targeted retry orchestration max 2 rounds.
**Avoids:** #9, #10, #31, #32.

### Phase 6: Runtime Plane
**Rationale:** Can start parallel with Phase 2 (consumes Phase-1 contracts, not engine output; built against hand-written sample Worker).
**Delivers:** Dispatch Worker; `@mcpgen/runtime` SDK; 3 auth modes; usage event pipeline with KV fallback bucket + reconciler.
**Avoids:** #4, #6, #11, #12, #13, #14.

### Phase 7: Frontend Wire-Up (UI LOCKED)
**Rationale:** Wave 1 (landing) needs only Phase 1; Wave 2 (generation/preview) ideally after Phase 5; Wave 3 (dashboard) ideally after Phase 6.
**Delivers:** Wired flow consuming SSE; **no visual changes**.
**Avoids:** #20, #30.

### Phase 8: Auth + Billing
**Rationale:** Logto + Stripe Meters; can start Wave 1–2 against synthetic events.
**Delivers:** Logto email + GitHub; Stripe products/prices/webhooks; quota enforcement (Timescale = quota truth, Stripe = billing eventual); cost cap; Drift Watcher with IR-diff.
**Avoids:** #13, #16, #17, #34.

### Phase 9: Observability & Polish
**Rationale:** Integration phase — Sentry DSN fill + source map upload (skeleton from Phase 1), Langfuse correlation, BetterStack alerts, multi-client smoke.
**Delivers:** End-to-end observability; PII audit clean; multi-client compatibility verified.
**Avoids:** #1, #4, #12, #19, #21, #33.

### Phase 10: Launch
**Rationale:** Soft launch W7 → public W9.
**Delivers:** Quickstart docs validated by external dev; pricing page; launch artifacts.
**Avoids:** #17, #22, #23.

### Phase Ordering Rationale

- **Phase 1 blocks all** because 5 contracts are consumed by every subsequent phase.
- **Phases 2–5 sequential within engine** (each pass consumes prior); Stage = retry boundary.
- **Phases 6, 7, 8 run parallel** with engine workstream because they consume Phase-1 contracts, not engine output.
- **Phase 9 is integration**, not parallel.
- **The 8 Phase-1 refinements defend cross-phase invariants** (sandbox isolation, source-map readability, IR source-of-truth, idempotency).

### Research Flags

**Phases needing deeper research** (`/gsd-research-phase`):
- **Phase 2:** PydanticAI v1.x signature freshness vs training-data drift; OpenRouter `extra_body.provider` schema; Day-1 smoke test specifics. Pitfall #27 makes this critical. Use Context7.
- **Phase 4:** `@modelcontextprotocol/sdk` v1 vs v2 final pick + Zod 3/4 alignment + MCP 2025-06-18 capability negotiation + Hono streamSSE on CF Workers under 30s sub-request limit.
- **Phase 5:** F2 between-tool discrimination metric design + golden-task curation for top-10 APIs + Cursor/Claude Desktop/ChatGPT Deep Research mock client implementations.
- **Phase 6:** CF WfP script-name conventions for tenancy (NOT namespace) + CF Queue backpressure with KV fallback + `@cloudflare/workers-oauth-provider` PKCE flow with Logto.
- **Phase 8:** Stripe Meters API rate-limit batching at 100 req/sec; TimescaleDB-vs-Stripe reconciliation cron; Logto self-host migration runbook.
- **Phase 9:** Multi-client smoke test harness; cross-tenant fuzz framework; deliberate-leak PII audit methodology.

**Phases with standard patterns (skip research):**
- **Phase 1:** Stack locked; Drizzle/Turborepo/wrangler scaffolding well-documented.
- **Phase 3:** Pass 2/3/4 fully spec'd; "MUST re-read" Pass docs at session start (mitigates #28 context drift).
- **Phase 7:** UI locked; no design research needed. Plan must include "page reload mid-generation" test (#20) and one-click config collision detection (#30).
- **Phase 10:** Standard GTM; operational pitfalls (#22, #23) are discipline issues.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Locked items verified via Context7; MEDIUM only on MCP SDK v1 vs v2 final pick |
| Features | HIGH for primary docs; LOW for live competitor parity (FEATURES §6 had no web tools — re-verify before W9 GTM) |
| Architecture | HIGH | 4-plane verified; 8 Phase-1 refinements derived from Cloudflare WfP docs + real-world MCP experience |
| Pitfalls | MEDIUM-HIGH | 34 pitfalls cross-checked via Context7 (CF WfP namespace, MCP TS SDK DNS rebinding, OpenRouter routing, Inngest orphans); F2 between-tool discrimination metric is inference, needs quarterly human calibration |

**Overall confidence:** HIGH for executing the 10-phase plan; MEDIUM for the 8 Phase-1 refinements (recommended additions, not yet validated by execution).

### Gaps to Address

- `@modelcontextprotocol/sdk` v1 vs v2 final pick (decide end of Phase 1 via Key Decision in PROJECT.md).
- IR source-of-truth direction — recommend TS Zod → Pydantic codegen; lock at Phase 1.
- F2 between-tool discrimination metric (σ ≥0.4) — needs first-quarter human calibration with golden specs.
- OpenAI Deep Research compliance fixture — build at Phase 5 in F1.
- Cursor confirmation behavior under `openWorldHint=true` + `readOnlyHint=true` — empirically verify with current Cursor build at Phase 5 F3 mock-client design.
- Live competitor feature parity matrix — re-run before W9 GTM with web access.
- Hono `streamSSE` 30s sub-request limit on CF Workers — 30-min spike at Phase 1 before contract freeze.
- Logto Cloud free → Pro migration — pre-buy Pro at W7 to avoid 5K MAU lock during viral spike.

---

## Sources

### Primary (HIGH — locked source-of-truth)
- `.planning/PROJECT.md` · `CLAUDE.md` · `RULES.md`
- `docs/mcpgen-architecture.md`
- `docs/mcpgen-generation-engine-v2.md`
- `docs/mcpgen-pass-{0,1,2,3,4,5}-design.md`
- `docs/mcpgen-stage-e-design.md` · `docs/mcpgen-stage-f-design.md`
- `docs/mcpgen-model-and-provider-override.md`
- `docs/mcpgen-git-workflow-rules.md`
- `docs/mcpgen-gsd-sprint-plan.md`
- `docs/mcpgen-implementation-plan.md` · `docs/mcpgen-ux-flow.md`

### Primary (HIGH — Context7 verified, current as of 2026-04)
- Vercel/Next.js, Hono.dev, FastAPI, Pydantic, Logfire
- MCP TypeScript SDK (v1.x and v2.x both exist; v2 is breaking — drift in STACK §6.1)
- MCP Python SDK, Zod, Ajv, Cloudflare workers-oauth-provider, Wrangler
- Drizzle, Bun, Commander, Inngest, Stripe Node SDK
- Langfuse Python, Sentry Python + JS
- Jinja2, openapi-spec-validator, prance, pgvector, TimescaleDB, gitleaks, OpenAPI Specification, shadcn/ui

### Secondary (MEDIUM — paper-backed)
- arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!" — paper rubric (97.1% smell)
- arXiv 2508.20453 "MCP-Bench" — F3 methodology
- Anthropic engineering blog "Writing effective tools for agents"
- MCP blog 2026-03-16 "Tool Annotations as Risk Vocabulary"
- MCP spec 2025-03-26 (annotations) + 2025-06-18 (`outputSchema`)

### Tertiary (LOW — needs validation before W9 GTM)
- Live competitor feature surfaces in FEATURES.md §6 (`openapi-mcp-server`, Stainless MCP, Cloudflare `mcp-server-cloudflare`, Anthropic Console MCP) — reconstructed from training data through January 2026; web tools were unavailable during research run.
