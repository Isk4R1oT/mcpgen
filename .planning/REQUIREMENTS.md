# Requirements: MCPGen

**Defined:** 2026-04-26
**Core Value:** Generated MCP servers measurably outperform hand-written ones on agent task success rate — paste an OpenAPI URL → 60 seconds later you have a deployed MCP server that scores ≥4.0 on F2 smell rubric and ≥70% F3 agent task success on golden tasks for that API.

> **Reading order:** This file is the source of truth for v1 scope. PROJECT.md gives narrative context; ROADMAP.md maps each REQ-ID to a phase. Pitfall mitigations from `.planning/research/PITFALLS.md` are folded into individual requirements where appropriate (marked with `[P0]` / `[P1]` for severity).

---

## v1 Requirements

### Foundation (FND) — Phase 1 contracts and scaffolding

- [x] **FND-01
**: Monorepo scaffolded with Turborepo + pnpm 9 (`apps/web`, `apps/api`, `apps/dispatch`, `apps/generation-engine`, `apps/cli`, `apps/docs` directories with empty-but-deployable scaffolds)
- [ ] **FND-02**: `packages/ir/` defines IR schema with TS Zod as source of truth and Pydantic generated via codegen — covers `Tool`, `ToolDescription`, `ToolAnnotations`, `ResponseConfig`, `RoutingRule`, `WorkflowDef`, `SmartIdSchema`, `FinalTool` [P1: prevents drift between TS frontend/runtime and Python engine]
- [ ] **FND-03**: `packages/contracts/src/generation-api.ts` specifies `POST /api/v1/generate` request shape, SSE event envelope, error code enum, callback POST shape, and `Idempotency-Key` header convention
- [ ] **FND-04**: `packages/contracts/src/usage-event.ts` defines a single usage event schema consumed at the tenant Worker emit-site, the CF Queue payload, the TimescaleDB row, and the Stripe Meters dimension keys [P0: prevents silent billing drift]
- [ ] **FND-05**: `packages/contracts/src/launch-criteria.ts` encodes F2 ≥ 4.0 and F3 ≥ 0.7 thresholds + bundle-size limits as runtime constants; pre-commit hook fails any change without paired `docs/decisions/` entry [P0: blocks #29 AI-fix-by-lowering-threshold]
- [ ] **FND-06**: `packages/runtime-sdk/` ships interface stub for the Tenant Worker SDK API (route helpers, upstream call, usage event emit, auth context shape)
- [ ] **FND-07**: `packages/engine-fixtures/` ships realistic-but-static IR / FinalTool / QualityReport fixtures so frontend / runtime / ops can integrate end-to-end before the engine produces real output [P1: unblocks parallel workstreams]
- [ ] **FND-08**: Drizzle migrations create `0001_init.sql` covering all tables in `docs/mcpgen-architecture.md` §7.1 plus the `pending_callbacks` table for SSE callback retry; migration filename uses `YYYYMMDD_HHMMSS_` prefix [P1: prevents collisions]
- [ ] **FND-09**: Cloudflare account scaffolded with single dispatch namespace per environment (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`) — never a namespace per tenant [P0: pitfall #11]
- [ ] **FND-10**: Empty-DSN Sentry SDK initialized in `apps/web`, `apps/api`, `apps/dispatch`, `apps/generation-engine`; CI step uploads source maps for each runtime
- [ ] **FND-11**: Langfuse v4 OTel exporter wired into the engine FastAPI bootstrap (`logfire.configure(send_to_logfire=False, otlp_endpoint=...)`) so traces appear from Phase 2 day 1
- [x] **FND-12**: Pre-commit hooks installed and enforced (gitleaks, ruff, eslint, mypy, conventional-pre-commit); never bypassed
- [ ] **FND-13**: Logto Cloud free-tier scaffolded with email + GitHub providers; runbook for self-host migration documented and tested on staging by W7
- [ ] **FND-14**: Idempotency keys specified at all four surfaces (`POST /api/v1/generate`, Inngest job triggers, Stripe Meters event creation, CF dispatch namespace deploys)
- [ ] **FND-15**: Hono `streamSSE` 30-second sub-request limit verified on CF Workers via 30-min spike before contract freeze

### Generation Engine (GEN) — Phases 2–5

- [ ] **GEN-01**: Stage A parses OpenAPI 3.x specs (using `prance[osv]` + `openapi-spec-validator`) into a deterministic `RawIR` plus dependency graph; no LLM
- [ ] **GEN-02**: Pass 0 (Tool Inventory & Naming) filters endpoints, names tools `{resource}_{action}`, detects auth subsystem **per endpoint** (not just global `securitySchemes`) [P1: pitfall #6], supports chunked approach for >200 endpoints, and enforces tiered caps (≤30 / 31–50 / 51–80 / >80 hard fail with multi-server split suggestion)
- [ ] **GEN-03**: Pass 1 (Six-Tool Pattern) consolidates ~50 plans into 6–12 final tools (`search`, `fetch`, `list_collections`, `list_objects`, `upsert`, `delete` + actions/workflows/specialized) with smart IDs prefixed by tenant short-id (`{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}`) and 100% endpoint coverage validation including a `coverage_proof` field per endpoint [P0: pitfall #1, #3]
- [ ] **GEN-04**: Pass 2 (Description Authoring) emits 5-of-6 paper-rubric description components per tool with type-specific length budgets (universal 200–400, action 100–200, workflow 150–300, specialized 80–150 tokens); inline Haiku quality gate; forbidden-pattern regex; examples ONLY from spec; retry prompts re-run forbidden-pattern check after each retry [P1: pitfall #10]
- [ ] **GEN-05**: Pass 3 (Parameter Specification) produces production-ready JSON Schema with 5-component MCP-Bundles parameter descriptions, naming normalization rules, smart-ID patterns auto-generated from Pass 1 SmartIdSchema, and filter-design selection (structured object / DSL / individual)
- [ ] **GEN-06**: Pass 4 (Annotations Inference) emits 4 MCP boolean hints + title for every tool with `openWorldHint=true` invariant always set explicitly; tool-type rules + verb pattern matching cover 80% deterministically; conservative aggregation for workflow tools
- [ ] **GEN-07**: Pass 5 (Response Shaping) emits MCP 2025-06-18 `outputSchema`, pagination strategy (cursor preferred), field filtering (always-include / opt-in via `properties` / always-exclude), per-tool-type truncation thresholds with teaching guidance templates that explicitly bound pagination expectations [P1: pitfall #5]
- [ ] **GEN-08**: Stage E (Codegen) produces a complete TypeScript Cloudflare Worker project (~25–30 files) via 100% deterministic Jinja2 templates, including `tsc --noEmit` validation, `wrangler deploy --dry-run` bundle-size capture, `hostHeaderValidation` middleware, Sentry `beforeSend` redaction for `X-Upstream-Auth` / `Authorization` / `Cookie` / spec-declared auth headers, MCP Inspector compatibility, and `.mcpgen.yaml` project config in the generated repo [P0: pitfalls #8, #12, #15]
- [ ] **GEN-09**: Stage F1 (Static validation) runs tsc + ajv + ESLint + bundle-size gate (<800KB pass / 800–950KB warn / >950KB fail) + MCP protocol compliance + secret scan (gitleaks) + smart-ID regex compile + routing completeness + auth middleware presence + cross-tenant smart-ID fuzz check + OpenAI compliance fixture for `search` / `fetch` exact signatures, and maps each failed check to a specific upstream-pass retry [P0: pitfalls #1, #8, #32]
- [ ] **GEN-10**: Stage F2 (Smell scan) runs single Qwen3-Coder with 5-shuffle prompt averaging + temperature variance (T=0.0/0.2/0.5) per Model Override doc; threshold ≥ 4.0 on 6-component rubric; **between-tool σ ≥ 0.4 discrimination metric** flagged when violated [P1: pitfall #9]; per-component failures trigger targeted retries (max 2 rounds)
- [ ] **GEN-11**: Stage F3 (Agent eval) runs real Sonnet 4.7 agent against golden tasks for top-10 APIs in real sandbox + mocked env for the rest; two-tier evaluator (rule-based + LLM judge); pass criterion ≥ 0.7 server pass rate; mock client harness covers Cursor (`readOnlyHint=true` confirmation skip), Claude Desktop, and ChatGPT Deep Research signature compliance [P0: pitfalls #31, #32]
- [ ] **GEN-12**: 4-layer caching (L1 spec sha + L2 pass-input hash + L3 tool hash + L4 Anthropic prompt cache) — repeated generation of the same spec costs $0 LLM
- [ ] **GEN-13**: All LLM calls go through PydanticAI + OpenRouter `OpenAIProvider` using `qwen/qwen3-coder` with provider routing pinned (`extra_body={"provider": {"order": [...], "allow_fallbacks": false, "quantizations": ["fp16"], "require_parameters": true}}`) [P0: pitfall #2]; Stage F3 test agent is the documented exception (Sonnet 4.7); Day-1 smoke test (`apps/generation-engine/tests/smoke_test_qwen.py`) runs on every engine PR [P0: pitfall #27]

### Runtime Plane (RUN) — Phase 6

- [ ] **RUN-01**: Dispatch Worker on CF Workers for Platforms (single shared namespace) performs auth precheck, rate-limit, tenant lookup (CF KV cache 5-min TTL), client `protocolVersion` parsing during `initialize`, and capability-gated dispatch (omit `outputSchema` for clients <2025-06-18) [P0: pitfall #4]
- [ ] **RUN-02**: Generated tenant Workers use `@modelcontextprotocol/sdk` + `@mcpgen/runtime` SDK and stay within P99 < 50ms over upstream API latency on warm starts; warm-keep cron every 5 min for active tenants [P1: pitfall #14]
- [ ] **RUN-03**: Pass-through credential mode is default — tenant Worker decrypts `X-Upstream-Auth` per request via HKDF-derived key, forwards to upstream, never persists; outbound chokepoint scrubs credentials from any logging destination [P0: pitfall #12]
- [ ] **RUN-04**: Stored credential mode (AES-256-GCM with per-tenant DEK in CF KV) is supported, marked "less secure" in UI, and requires explicit user opt-in checkbox
- [ ] **RUN-05**: OAuth 2.1 mode for user-delegated APIs uses `@cloudflare/workers-oauth-provider` with PKCE; tokens managed via Logto
- [ ] **RUN-06**: Each tool call emits a usage event via `ctx.waitUntil(queue.send(...))` with KV fallback bucket on send failure; CF Queue → Inngest → TimescaleDB hypertable + Stripe Meters API; `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` for dedup; daily reconciliation job [P0: pitfall #13]
- [ ] **RUN-07**: One-click Claude Desktop config block (or fallback copy-paste) is generated for each deployed server, with collision detection against existing config entries [P1: pitfall #30]

### Control Plane / Backend (CTRL) — Phases 1, 8, 9

- [ ] **CTRL-01**: Hono BFF on CF Workers exposes `POST /api/v1/generate` (job submission, returns 202 + SSE URL) and a per-job SSE callback channel that supports `last-event-id` resume + Postgres-as-source-of-truth fallback when SSE drops [P1: pitfall #20]
- [ ] **CTRL-02**: Auth uses Logto Cloud (free tier scaffolded; Pro pre-bought at W7) with email + GitHub providers; no Google/Twitter/Apple in MVP [P0: pitfall #17]
- [ ] **CTRL-03**: Drift Watcher (Inngest cron, daily) compares **parsed IR**, not raw spec content hash; surfaces semantic diff (added/removed/changed endpoints/parameters) in UI with manual review / one-click regenerate / auto-regenerate toggle; per-recipient email rate-limit (max 1 drift email/week) [P2: pitfall #34]
- [ ] **CTRL-04**: Drizzle migrations cover the data model (organizations → users → projects → specs → generations → deployments → tools with pgvector embedding) on Neon Postgres 16 + TimescaleDB + pgvector; Scale-tier compute (≥4 vCPU, 8GB) for production [P1: pitfall #19]
- [ ] **CTRL-05**: R2 holds three buckets (`mcpgen-specs`, `mcpgen-artifacts` 30-day TTL, `mcpgen-public-cache`) with no PII or credentials persisted; never log spec content
- [ ] **CTRL-06**: Stripe Billing + Meters API supports Free (1 F3 eval/mo), Pro (5/mo included), Pay-as-you-go ($0.50/eval), with per-generation cost cap ($0.50 free / $2.00 pro) enforced server-side
- [ ] **CTRL-07**: Quota enforcement uses TimescaleDB hourly aggregates as quota truth (real-time) and Stripe Meters as billing eventual; daily reconciliation alerts on >2% drift; cost cap exceeded → hard fail with partial result + bill [P1: pitfall #16]
- [ ] **CTRL-08**: Sentry (TS + Python with source maps), BetterStack (logs + uptime + CF Queue depth alert), Langfuse v4 (LLM tracing via OTel) wired across all components; Sentry `beforeSend` strips auth headers and spec content
- [ ] **CTRL-09**: Inngest function IDs are stable strings (`drift-watcher-v1`, `usage-reconciler-v1`); orphan audit in Phase 9 [P2: pitfall #21]

### CLI (CLI) — Phases 2, 6

- [ ] **CLI-01**: `npx mcpgen init <openapi-url>` produces a working local MCP server file in <60 seconds (no signup required)
- [ ] **CLI-02**: `mcpgen deploy` pushes the generated server to CF Workers for Platforms tenant namespace and returns a live URL
- [ ] **CLI-03**: CLI ships as a Bun-compiled single binary on npm + GitHub releases (targets: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`)

### Frontend (FE) — Phase 7 (UI is LOCKED in `claude-design-ui/MCP-Gen.zip`)

- [ ] **FE-01**: Landing page (already designed) wired to live `/api/v1/generate` job submission with `Idempotency-Key` header
- [ ] **FE-02**: Generation playground consumes SSE callbacks per stage, recovers from disconnect via Postgres state read + `last-event-id` resume [P1: pitfall #20]
- [ ] **FE-03**: Preview screen shows generated tool list, descriptions, parameters, annotations, response config, full code visible at every step (transparency principle)
- [ ] **FE-04**: One-click deploy from preview; dashboard shows deployed servers, usage events, costs, F2/F3 quality badge (premium/verified/standard/needs_review)
- [ ] **FE-05**: Frontend phase = wire-up only; visual / layout / typography / copy must NOT be modified — `claude-design-ui/MCP-Gen.zip` ships unchanged into `apps/web/src/`

### GTM / Launch (GTM) — Phase 10

- [ ] **GTM-01**: Quickstart docs (Mintlify or Docusaurus) tested by an external developer end-to-end
- [ ] **GTM-02**: Privacy + ToS + Pricing page published; pricing matches code-enforced quotas
- [ ] **GTM-03**: Soft launch (W7 of sprint plan) → 20 invited users; public launch (W9) → Show HN, Product Hunt, Reddit r/MachineLearning + r/LocalLLaMA

### Operational discipline (OPS) — Phase 1 (applies across all phases)

> OPS-* are cross-phase operational disciplines. They are anchored to Phase 1 for scaffolding (CI policy, plan-file conventions, Friday demo cadence ritual) but enforced continuously through every subsequent phase.

- [ ] **OPS-01**: Friday demo cadence preserved through W10; pre-recorded clips throughout the week, Friday is editing only [P0: pitfall #23 — velocity death spiral]
- [x] **OPS-02
**: Cross-workstream test ownership policy enforced — failing tests "owned" by the workstream that owns the file; cross-ws failures escalate to MAIN as contract-change PR [P1: pitfall #26]
- [x] **OPS-03
**: Each engine phase starts a fresh Claude session; planning state lives in `.planning/workstreams/engine/STATE.md`; plan files include "MUST re-read these files first" header [P1: pitfall #28]

---

## v2 Requirements

### v1.x — small additions surfaced in research, deferred for capacity

- **CLI-04**: `mcpgen sync` and `mcpgen regenerate` CLI subcommands for parity with Drift Watcher
- **CLI-05**: Privacy mode (CLI-only, no spec upload) for ICP-C internal-tools engineer (FEATURES.md surfaces this as an ICP-C requirement; `mcpgen-ux-flow.md` §9 mentions it as an edge case)
- **FE-06**: In-browser generation playground that executes tools against the live deployment (FEATURES.md flags this as ux-flow §3 "the most important screen"; MVP ships static preview + "Try in Claude Desktop" CTA)
- **FE-07**: Markdown / PDF export of Quality Report (sales artifact for ICP-B API providers)
- **CTRL-10**: Resumable generation via job-ID URL — already supported by SSE pattern, needs explicit UI affordance
- **GEN-14**: Tool-level "regenerate this one" — modify a single tool description / parameters without re-running entire pipeline
- **GEN-15**: Inline edit description in preview screen with diff against generated version
- **CTRL-11**: `mcpgen logs --tail` — stream tenant Worker logs to CLI

### v2 — larger scope, post-launch

- **GEN-16**: GraphQL parser as second input format
- **GEN-17**: Postman collection parser as third input format
- **GEN-18**: AsyncAPI parser as fourth input format
- **GEN-19**: Python output runtime (codegen for Python MCP servers)
- **GEN-20**: Rust output runtime
- **GEN-21**: Go output runtime
- **CTRL-12**: A/B deploys + canary releases
- **CTRL-13**: Custom domain support for tenant Workers
- **AUTH-01**: SSO via SAML / Workspace IdP for Team plan
- **AUTH-02**: RBAC with project-level roles
- **OPS-04**: Multi-region deploy (Fly Machines + Neon EU + R2 EU)
- **GEN-22**: Generation versioning + rollback (revert deployment to prior generation)
- **GEN-23**: Examples generation from real execution traces (hallucination-free; v1.1+ sandbox feature)
- **CTRL-14**: Status badge SVG endpoint per deployment

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| `search_tools` runtime meta-tool / runtime progressive disclosure | Engine principle 4 (build-time decisions over runtime hopes); explicitly forbidden in `docs/mcpgen-generation-engine-v2.md` |
| LLM-generated examples without real execution traces | Pass 2 design forbids; hallucination prevention; defer to v1.1 sandbox feature |
| LLM in Stage A / E / F1 | These stages are 100% deterministic; cost, latency, reproducibility |
| Public quality badge by default | Opt-in only; avoid public ranking pressure on early-stage generations |
| LiteLLM | Replaced by direct OpenRouter via `OpenAIProvider`; single Qwen3-Coder is the only model in the pipeline |
| Multi-family judge ensemble for F2 | Replaced by single Qwen3-Coder × 5-shuffle averaging per Model Override doc |
| Sketch / Spike phases in GSD workflow | Design + research already locked across 9 detail-design docs in `docs/` |
| Code-mode tool execution | Native MCP tools only on CF Workers; Six-Tool Pattern delivers Code-mode-level token efficiency at structural level |
| UI redesign / visual changes / new components in `apps/web` | UI is shipped from `claude-design-ui/MCP-Gen.zip`; design is locked; frontend phase is wire-up only |
| Mocking the database in integration tests | Per global rules; prior project incident pattern; integration tests must hit a real Neon dev branch |
| OAuth login Google / Twitter / Apple | Email + GitHub only in MVP per implementation-plan §11.6 anti-pattern #5 |
| Refactor before feature in any phase | Anti-pattern #1 — feature first, refactor at phase end |
| Vendor swap to save <30% of revenue cost | Anti-pattern #2 + solo-friendly ops principle 7 — time > infra savings |
| Custom feature-flag system for MVP | Anti-pattern #7 — `if (env.SOMETHING)` is sufficient |
| Stage E template auto-update of `@modelcontextprotocol/sdk` major version | Auto-bumped majors silently break previously-deployed tenant Workers; bump via deliberate `chore: bump mcp-sdk` PR with regression run on golden APIs |
| Per-tenant CF dispatch namespace | Cloudflare W4P explicitly warns against; namespace = environment, not tenant |
| Logging spec content / upstream API responses / upstream credentials | Hard rule from `docs/mcpgen-architecture.md` §11; privacy-LOCKED constraint |
| Auto-regenerate on drift by default | Silent regeneration of live tenant Workers is a destructive action; default = surface diff + one-click; auto-regenerate is opt-in toggle for Pro |

---

## Traceability

Every v1 REQ-ID maps to exactly one phase. Phase IDs follow `docs/mcpgen-gsd-sprint-plan.md` 10-phase structure. OPS-* are anchored to Phase 1 for scaffolding but apply continuously across all subsequent phases per the OPS section above.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| FND-05 | Phase 1 | Pending |
| FND-06 | Phase 1 | Pending |
| FND-07 | Phase 1 | Pending |
| FND-08 | Phase 1 | Pending |
| FND-09 | Phase 1 | Pending |
| FND-10 | Phase 1 | Pending |
| FND-11 | Phase 1 | Pending |
| FND-12 | Phase 1 | Complete (01-02) |
| FND-13 | Phase 1 | Pending |
| FND-14 | Phase 1 | Pending |
| FND-15 | Phase 1 | Pending |
| GEN-01 | Phase 2 | Pending |
| GEN-02 | Phase 2 | Pending |
| GEN-03 | Phase 2 | Pending |
| GEN-04 | Phase 3 | Pending |
| GEN-05 | Phase 3 | Pending |
| GEN-06 | Phase 3 | Pending |
| GEN-07 | Phase 4 | Pending |
| GEN-08 | Phase 4 | Pending |
| GEN-09 | Phase 5 | Pending |
| GEN-10 | Phase 5 | Pending |
| GEN-11 | Phase 5 | Pending |
| GEN-12 | Phase 2 | Pending |
| GEN-13 | Phase 2 | Pending |
| RUN-01 | Phase 6 | Pending |
| RUN-02 | Phase 6 | Pending |
| RUN-03 | Phase 6 | Pending |
| RUN-04 | Phase 6 | Pending |
| RUN-05 | Phase 6 | Pending |
| RUN-06 | Phase 6 | Pending |
| RUN-07 | Phase 6 | Pending |
| CTRL-01 | Phase 1 | Pending |
| CTRL-02 | Phase 8 | Pending |
| CTRL-03 | Phase 8 | Pending |
| CTRL-04 | Phase 8 | Pending |
| CTRL-05 | Phase 8 | Pending |
| CTRL-06 | Phase 8 | Pending |
| CTRL-07 | Phase 8 | Pending |
| CTRL-08 | Phase 9 | Pending |
| CTRL-09 | Phase 9 | Pending |
| CLI-01 | Phase 2 | Pending |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 6 | Pending |
| FE-01 | Phase 7 | Pending |
| FE-02 | Phase 7 | Pending |
| FE-03 | Phase 7 | Pending |
| FE-04 | Phase 7 | Pending |
| FE-05 | Phase 7 | Pending |
| GTM-01 | Phase 10 | Pending |
| GTM-02 | Phase 10 | Pending |
| GTM-03 | Phase 10 | Pending |
| OPS-01 | Phase 1 (cross-phase) | Pending |
| OPS-02 | Phase 1 (cross-phase) | Complete (01-01, 01-02) |
| OPS-03 | Phase 1 (cross-phase) | Complete (01-01, 01-02) |

**Coverage:**
- v1 requirements: 58 total (FND-15, GEN-13, RUN-7, CTRL-9, CLI-3, FE-5, GTM-3, OPS-3)
- Mapped to phases: 58
- Unmapped: 0 ✓

**Per-phase requirement counts:**

| Phase | Count | Requirement IDs |
|-------|-------|-----------------|
| Phase 1: Foundation | 19 | FND-01..15, CTRL-01, OPS-01..03 |
| Phase 2: Engine Architect (Pass 0+1) | 6 | GEN-01, GEN-02, GEN-03, GEN-12, GEN-13, CLI-01 |
| Phase 3: Engine Author (Pass 2+3+4) | 3 | GEN-04, GEN-05, GEN-06 |
| Phase 4: Engine Shape & Codegen (Pass 5 + Stage E) | 2 | GEN-07, GEN-08 |
| Phase 5: Engine Validation (Stage F) | 3 | GEN-09, GEN-10, GEN-11 |
| Phase 6: Runtime Plane | 9 | RUN-01..07, CLI-02, CLI-03 |
| Phase 7: Frontend Wire-Up | 5 | FE-01..05 |
| Phase 8: Auth + Billing | 6 | CTRL-02..07 |
| Phase 9: Observability & Polish | 2 | CTRL-08, CTRL-09 |
| Phase 10: Launch | 3 | GTM-01..03 |
| **Total** | **58** | (no orphans, no duplicates) |

> Note: a counting correction was applied during traceability — the prior summary stated 49 v1 requirements, but the actual sum across categories is FND-15 + GEN-13 + RUN-7 + CTRL-9 + CLI-3 + FE-5 + GTM-3 + OPS-3 = **58**. The mapping is complete.

---

*Requirements defined: 2026-04-26*
*Last updated: 2026-04-26 — traceability filled by `gsd-roadmapper`*
