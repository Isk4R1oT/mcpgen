# Roadmap: MCPGen

## Overview

MCPGen ships in 10 phases over ~6 calendar weeks via 4–5 parallel workstreams (`main` / `engine` / `runtime` / `ops` / `frontend`) per `docs/mcpgen-gsd-sprint-plan.md`. Phase 1 freezes the 5 contracts that every downstream phase depends on (IR, Generation API, DB schema v1, runtime SDK stub, usage event schema) and lands the 8 cross-phase Phase-1 refinements surfaced in `.planning/research/ARCHITECTURE.md` §"Eight Phase-1 refinements". Phases 2–5 build the Generation Engine pipeline sequentially in the `engine` workstream (Architect → Author → Shape+Codegen → Validation). Phases 6, 7, and 8 run in parallel against the Phase-1 contracts (Runtime, Frontend wire-up against the locked UI in `claude-design-ui/MCP-Gen.zip`, Auth+Billing). Phase 9 integrates observability and runs cross-tenant + multi-client smoke tests. Phase 10 ships soft (W7, 20 invited) → public (W9). The unit of correctness is `paste-OpenAPI-URL → 60s → deployed MCP server with F2 ≥ 4.0 and F3 ≥ 0.7`.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo, 5 frozen contracts, 8 Phase-1 refinements, sandbox CF namespace, fixtures shadow service (completed 2026-04-26)
- [x] **Phase 2: Generation Engine — Architect (Pass 0+1)** - Stage A parser + Pass 0 inventory + Pass 1 Six-Tool consolidation with tenant-prefixed smart IDs (completed 2026-04-28)
- [x] **Phase 3: Generation Engine — Author (Pass 2+3+4)** - Description authoring, parameter specification, annotations inference (completed 2026-04-28)
- [x] **Phase 4: Generation Engine — Shape & Codegen (Pass 5 + Stage E)** - Response shaping + ~25–30-file deterministic Jinja2 codegen with bundle-size + DNS-rebinding gates (completed 2026-04-29; all 4 deviations drained per 04-13-INSPECTOR-EVIDENCE.md re-run #3)
- [x] **Phase 5: Generation Engine — Validation (Stage F)** - F1 static + F2 smell scan (Qwen 5-shuffle) + F3 agent eval against golden tasks (completed 2026-04-29)
- [x] **Phase 6: Runtime Plane** - Dispatch Worker + tenant Workers + 3 auth modes + usage event pipeline with KV fallback (completed 2026-04-27 — runtime workstream)
- [ ] **Phase 7: Frontend Wire-Up** - Wire locked Claude-Design UI to Generation API + SSE + dashboard (NO visual changes)
- [x] **Phase 8: Auth + Billing** - Logto (email + GitHub) + Stripe Meters + quotas + cost cap + Drift Watcher with IR-diff (completed 2026-04-27 — ops workstream)
- [ ] **Phase 9: Observability & Polish** - Sentry/Langfuse/BetterStack integrated + cross-tenant fuzz + multi-client smoke + Inngest orphan audit
- [ ] **Phase 10: Launch** - Quickstart docs validated externally + Privacy/ToS/Pricing + soft launch W7 → public W9

## Phase Details

### Phase 1: Foundation
**Workstream**: `main`
**Goal**: Empty-but-deployable monorepo with 5 frozen contracts, 8 Phase-1 refinements, and pre-commit/CI discipline that block AI-fix-by-lowering-threshold and migration-prefix collisions.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11, FND-12, FND-13, FND-14, FND-15, CTRL-01, OPS-01, OPS-02, OPS-03
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #11 (CF namespace-per-tenant forbidden), #17 (Logto MAU lock plan), #18 (Drizzle timestamp prefix), #19 (Neon Scale-tier ack), #20 (SSE resume semantics in API contract), #24 (engine-fixtures shadow service), #26 (cross-workstream test ownership), #29 (launch-criteria as runtime constants — blocks AI threshold-lowering)
**Success Criteria** (what must be TRUE):
  1. `pnpm install && pnpm build && pnpm typecheck` succeeds across `apps/web`, `apps/api`, `apps/dispatch`, `apps/generation-engine`, `apps/cli`, `apps/docs` from a fresh clone
  2. The 5 contracts are committed and import-resolved across both languages: `packages/ir/` (TS Zod source → Pydantic codegen), `packages/contracts/src/generation-api.ts`, `packages/contracts/src/usage-event.ts`, `packages/contracts/src/launch-criteria.ts` (F2≥4.0, F3≥0.7 as runtime constants), `infrastructure/neon/migrations/0001_init.sql` (with `pending_callbacks` table), and `packages/runtime-sdk/src/index.ts` (interface stub)
  3. Three CF dispatch namespaces exist (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`) — never per-tenant; pre-commit rejects PRs that try to create a fourth (deferred to Phase 10 per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2; Phase 1 ships the canonical creation script with an exit-78 deferral guard)
  4. Empty-DSN Sentry SDK initialised in all 4 apps; CI uploads source maps per runtime; Langfuse OTel exporter wired into engine FastAPI bootstrap (`logfire.configure(send_to_logfire=False, otlp_endpoint=...)`) so traces are emitted from Phase 2 day 1
  5. `packages/engine-fixtures/` ships static IR / FinalTool / QualityReport fixtures; runtime/frontend/ops workstreams can run E2E against fixtures before any engine pass exists
  6. Pre-commit hooks (gitleaks, ruff, eslint, mypy, conventional-pre-commit) installed and CI-enforced; pre-commit hook FAILS any change to `packages/contracts/launch-criteria.ts` without a paired `docs/decisions/` entry
  7. Hono `streamSSE` 30-second sub-request limit on CF Workers verified via 30-min spike before contracts freeze; resume semantics (`last-event-id`, Postgres-as-source-of-truth fallback) are in the API contract
  8. Idempotency keys specified at all 4 surfaces (`POST /api/v1/generate`, Inngest job triggers, Stripe Meters event creation, CF dispatch namespace deploys); Drizzle migrations use `YYYYMMDD_HHMMSS_` prefix; Logto Cloud free tier scaffolded with email + GitHub providers and the Pro-upgrade runbook documented (Pro-tier staging dry-run deferred to Phase 10 per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2 — staging requires the deferred CF deploy)
**Plans**: 8 plans
Plans:
- [x] 01-01-PLAN.md — Repo skeleton + tooling foundation (pnpm/Turborepo/tsconfig/shared-config) [Wave 1] ✓ 2026-04-26
- [x] 01-02-PLAN.md — Pre-commit hooks + GitHub Actions CI + 4 local guard scripts + decision-log scaffolding [Wave 2] ✓ 2026-04-26
- [x] 01-03-PLAN.md — 4 frozen contracts: IR (Zod source + Pydantic codegen) + generation-api + usage-event + launch-criteria + idempotency + runtime-sdk interface stub [Wave 3] ✓ 2026-04-26
- [x] 01-04-PLAN.md — DB schema migration (Drizzle) + Neon dev DB push [BLOCKING] [Wave 4] ✓ 2026-04-26 — Tasks 1–3 committed (db-schema.ts + migration SQL + drizzle.config.ts + SCALING.md + db:test-migrate script); Task 4 [BLOCKING] schema-push to Neon dev branch via direct connection (no Hyperdrive — CF migration deferred to Phase 10 per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md`); 9 tables + pgvector 0.8.0 + TimescaleDB 2.17.1 hypertable confirmed live — see `.planning/phases/01-foundation/01-04-SCHEMA-PUSH-EVIDENCE.md`
- [x] 01-05-PLAN.md — 6 empty-but-deployable apps: web (locked UI) + api (Hono BFF + SSE spike scaffold) + dispatch + dispatch-sample (canonical Stripe sample) + cli (Bun matrix) + docs [Wave 5] ✓ 2026-04-26
- [x] 01-06-PLAN.md — Engine FastAPI + uv + Sentry + Langfuse OTel + Day-1 Qwen smoke test + Dockerfile + fly.toml [Wave 5] ✓ 2026-04-26
- [x] 01-07-PLAN.md — 5 hand-crafted engine fixtures + Logto README/scaffold (reference-only — user manually configured) + 4 operational runbooks (Friday demo cadence, fresh-session header, Logto Pro upgrade, Drizzle migration conflicts) + CF namespace creation script with Phase-10 deferral guard [Wave 6] ✓ 2026-04-26 — complete (modified scope per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2): CF dispatch namespace creation + Pro-tier staging dry-run deferred to Phase 10; Logto manual setup credentialed via `.env.local`; 25/25 fixture shape tests pass
- [x] 01-08-PLAN.md — Local Bun SSE spike (replaces real-CF spike, deferred to Phase 10 per `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` rev 2) + fresh-clone E2E smoke + Phase-1 verification doc + phase-level SUMMARY [Wave 7] ✓ 2026-04-26 — complete (modified scope): 9 SSE events received over 90s with last id=8 at t=80s; fresh-clone E2E green across 7 commands (after Rule-1 fix `1de0589` committing CLAUDE.md + RULES.md + docs/mcpgen-*.md + claude-design-ui/ to git); 01-PHASE-VERIFICATION.md cross-references all 8 SC + 19 REQ-IDs + 9 threats + 8 pitfalls + Phase-10 7-item carry-forward; 01-SUMMARY.md (phase-level) authored with locked rationale string + per-plan completion table + local port map. Hyperdrive provisioning + real-CF SSE re-spike + Logto Pro-tier staging dry-run all DEFERRED to Phase 10. Phase-1 awaits verifier-agent run before phase row toggles.

### Phase 2: Generation Engine — Architect (Pass 0+1)
**Workstream**: `engine`
**Goal**: Stage A parses OpenAPI 3.x deterministically; Pass 0 names tools `{resource}_{action}` with per-endpoint auth detection and tiered caps; Pass 1 consolidates ~50 plans into 6–12 final tools using the Six-Tool Pattern with tenant-prefixed smart IDs and 100% endpoint coverage proof. CLI `npx mcpgen init` works locally without signup.
**Depends on**: Phase 1
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-12, GEN-13, CLI-01
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #1 (smart-ID server-prefix collision — mint as `{tenant_short_id}-{spec_slug}`), #2 (OpenRouter quantization drift — `extra_body.provider` pinning), #3 (Pass 1 coverage false-positive — `coverage_proof` field per endpoint), #6 (Pass 0 per-endpoint auth, not global `securitySchemes`), #27 (PydanticAI/OpenRouter SDK hallucinated API — Day-1 smoke test mandatory before any other Pass 0 work), #28 (fresh Claude session per phase; "MUST re-read these files first" header in plan files)
**Success Criteria** (what must be TRUE):
  1. Day-1 smoke test (`apps/generation-engine/tests/smoke_test_qwen.py`) passes on every engine PR — verifies `qwen/qwen3-coder` via PydanticAI `OpenAIProvider(base_url=https://openrouter.ai/api/v1)` with structured outputs (function calling), with provider routing pinned (`extra_body={"provider": {"order":[...], "allow_fallbacks": false, "quantizations": ["fp16"], "require_parameters": true}}`)
  2. Pass 0 on the Stripe golden spec (~470 endpoints) emits ≤ 50 tool plans in `{resource}_{action}` snake_case, returns a per-endpoint auth-mode map (not just global `securitySchemes`), supports the chunked path for >200 endpoints, and hard-fails specs with >80 tools with a multi-server-split message
  3. Pass 1 on the same spec produces 6–12 final tools (Six-Tool universal + actions/workflows/specialized), 100% endpoint coverage with a `coverage_proof` field per endpoint that round-trips to a valid upstream URL, and OpenAI-compliant `search(query: string)` / `fetch(id: string)` exact signatures
  4. Smart IDs minted at deploy time as `{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}` — different tenants wrapping the same upstream produce non-overlapping ID regexes (verified by a fixture test in this phase)
  5. L1 spec-sha + L2 pass-input-hash + L3 tool-hash caching makes a second generation of the same spec cost $0 in LLM tokens
  6. `npx mcpgen init <stripe-openapi-url>` produces a working local MCP server file in <60 seconds with no signup required
**Phase Status**: ✅ COMPLETE (signed off 2026-04-28 — see `.planning/phases/02-generation-engine-architect-pass-0-1/02-PHASE-VERIFICATION.md`)
**Plans**: 9 plans
Plans:
- [x] 02-01-PLAN.md — Agent factory + sampling + extra_body provider pin + Day-1 smoke test extension [Wave 1]
- [x] 02-02-PLAN.md — Stage A OpenAPI parser (prance + openapi-spec-validator) + dependency graph derivation [Wave 1]
- [x] 02-03-PLAN.md — IR additive types + 5 fixture pass-0/pass-1 hand-tuned outputs (Stripe/GitHub/Notion/Linear/Slack) [Wave 1]
- [x] 02-04-PLAN.md — Wave 0 test scaffolding (pytest + bun test infrastructure) [Wave 1]
- [x] 02-05-PLAN.md — Pass 0 deterministic stages: filter + auth_detect + validation [Wave 2]
- [x] 02-06-PLAN.md — Pass 0 LLM stage: prompts (XML sandbox) + llm + chunked + orchestrator [Wave 2]
- [x] 02-07-PLAN.md — Pass 1 Six-Tool Pattern: classify + schema_synth + routing + coverage + smart-ID non-overlap [Wave 3]
- [x] 02-08-PLAN.md — L1+L2+L3 cache + pipeline orchestrator + POST /api/v1/generate SSE endpoint [Wave 4]
- [x] 02-09-PLAN.md — CLI mcpgen init: auto-spawn + SSE consumer + render stub + perf budget + manual MCP Desktop verification gate [Wave 4]

### Phase 3: Generation Engine — Author (Pass 2+3+4)
**Workstream**: `engine`
**Goal**: Production-grade per-tool descriptions (5-of-6 paper rubric components), production-ready JSON Schema with rich per-parameter docs, and 4 MCP boolean annotations + title with `openWorldHint=true` invariant always set explicitly so Cursor's `readOnlyHint=true` skips confirmation for read tools.
**Depends on**: Phase 2
**Requirements**: GEN-04, GEN-05, GEN-06
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #7 (description drift between regenerations — surface description-diff before deploy), #10 (LLM-hallucinated examples sneaking in via retry — retry prompts re-include forbidden-pattern + examples-from-spec policy and re-run regex check after retry), #31 (Cursor confirmation invariant — every read tool gets `readOnlyHint=true` AND `openWorldHint=true` explicitly)
**Success Criteria** (what must be TRUE):
  1. Pass 2 on the Phase-2 golden output emits 5-of-6 paper rubric description components per tool (Purpose / Guidelines incl. `when_not_to_use` / Limitations / Parameter overview / Length & Completeness meta) within type-specific length budgets (universal 200–400, action 100–200, workflow 150–300, specialized 80–150 tokens); inline Haiku quality gate passes ≥3 on the abbreviated 4-component rubric; `examples = null` for any tool whose spec lacks them and forbidden-pattern regex catches marketing language even after a retry
  2. Pass 3 emits production-ready JSON Schema for every tool: 5-component MCP-Bundles parameter descriptions (what / format / when / example / default), naming normalization rules applied (`user → user_id`, `data → payload`, ambiguous `id`/`status`/`time` qualified), smart-ID `pattern` auto-generated from Pass 1 `SmartIdSchema`, and a deterministic filter-design selection (structured object / DSL / individual) consistent across all tools in one server
  3. Pass 4 emits all 4 MCP boolean hints + title for every tool with `openWorldHint=true` invariant always explicitly set; tool-type rules (Pass 1) + verb pattern matching cover ≥80% deterministically; workflow tools use conservative aggregation (worst-case across sub-operations: `readOnly`=AND, `destructive`=OR, `idempotent`=AND); consistency rules enforced (`readOnly=true → idempotent=true` auto-fix; `destructive=true → readOnly=false` auto-fix)
  4. End-to-end `Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4` runs on Stripe + GitHub + Notion golden specs; output `FinalTool` objects pass JSON-schema validation and consistency checks with zero defaulted annotations
**Plans**: 12 plans
Plans:
- [x] 03-01-PLAN.md — Foundation: deps + IR additive description_hash + sampling profiles + cache key prompt_version + test scaffolding [Wave 1]
- [x] 03-02-PLAN.md — Pass 2 prompt templates per tool type (4 system prompts) + spec sandbox + retry-prompt builder + classify [Wave 1]
- [x] 03-03-PLAN.md — Pass 2 length budgets (tiktoken) + forbidden patterns regex catalogue + validation phase + render_description_markdown [Wave 1]
- [x] 03-04-PLAN.md — Pass 2 authoring (4 Agent singletons + Sem 10 + 2-tier retry) + inline quality gate (single Qwen judge, 4-component rubric) + diff helper + run() orchestrator [Wave 1]
- [x] 03-05-PLAN.md — Pass 3 deterministic extract phase (ParameterSpec + extract_params with universal hardcoded sigs + smart-ID/filter detection) [Wave 2]
- [x] 03-06-PLAN.md — Pass 3 LLM enrichment (per-param Sem 20 pipeline-scoped + 2-tier retry + deterministic fallback after exhaustion) [Wave 2]
- [x] 03-07-PLAN.md — Pass 3 filter design selection (FilterStrategy enum + D-18 decision tree + emit_filter_schema for A/B/C) [Wave 2]
- [x] 03-08-PLAN.md — Pass 3 naming normalization + smart-ID pattern builder + standard parameter sets for 6 universal tools (D-21 + Pitfall #32 frozen) [Wave 2]
- [x] 03-09-PLAN.md — Pass 3 cross-parameter validation (Pass3Error + 5 validators inc. additionalProperties + OpenAI compliance) + inline quality gate + run() orchestrator [Wave 3]
- [x] 03-10-PLAN.md — Pass 4 deterministic rules (D-28 tool-type table + D-30 workflow aggregation) + verb pattern matching (D-29 Appendix B) + title generation (D-31) [Wave 3]
- [x] 03-11-PLAN.md — Pass 4 selective Qwen judgment (medium-confidence verbs only, Sem 5, conservative fallback) + consistency validation with auto-fix + IR assembly with openWorldHint=true (D-27) + run() orchestrator [Wave 3]
- [x] 03-12-PLAN.md — pipeline.py extension (chain Pass 2/3/4 + Stage C SSE events + L1 expansion) + CLI render_description.ts + render_stub.ts extension (5-arg) + 4 integration tests + 9 hand-tuned fixture JSONs (Stripe/GitHub/Notion × Pass 2/3/4) [Wave 4]

### Phase 4: Generation Engine — Shape & Codegen (Pass 5 + Stage E)
**Workstream**: `engine`
**Goal**: Pass 5 produces MCP-2025-06-18 `outputSchema` + pagination + field filtering + truncation guidance that doesn't loop the agent; Stage E generates a complete TypeScript Cloudflare Worker project (~25–30 files) via 100% deterministic Jinja2 templates that compiles with `tsc --noEmit` and stays under the CF Workers 1MB gzipped script-size limit.
**Depends on**: Phase 3
**Requirements**: GEN-07, GEN-08
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #4 (outputSchema breaking 2024-spec clients — capability negotiation in dispatch + Stage E runtime), #5 (truncation-guidance loops in F3 — templates include scope guidance like "first 10 of 47 — usually sufficient"), #8 (bundle exceeds 1MB — `wrangler deploy --dry-run` size capture, F1 gate <800KB pass / 800–950KB warn / >950KB fail), #12 (pass-through credentials leaking into Sentry — Sentry `beforeSend` redaction baked into every Worker for `X-Upstream-Auth` / `Authorization` / `Cookie` / spec-declared auth headers), #15 (DNS rebinding — `hostHeaderValidation` middleware mandatory in every Worker), #30 (server name uniqueness via `{tenant}-{spec_slug}`), #33 (Zod-to-JSON-Schema coercion quirks — Zod 4 native `z.toJSONSchema()` plus conservative-format fallback)
**Success Criteria** (what must be TRUE):
  1. Pass 5 emits non-null `outputSchema` for every tool (MCP 2025-06-18); pagination strategy auto-detected (cursor preferred, then offset, then page-number); field filtering split into always-include / opt-in via `properties` / always-exclude; per-tool-type truncation thresholds (search 10K / list 15K / fetch 20K / action 5K / workflow 15K) with teaching-template guidance that bounds pagination expectations (never invites endless `next_cursor` loops)
  2. Stage E produces ~25–30 TypeScript files for any Pass-5 output: scaffold (`package.json`, `wrangler.toml`, `tsconfig.json`), `schemas/` (Zod inputs + outputs + routing), `runtime/` (smart_id, pagination, truncation, upstream, response_shaping, errors), `auth/middleware.ts` (3 modes: passthrough/stored/OAuth via `@cloudflare/workers-oauth-provider`), per-tool-type handlers, and `tests/smoke.ts`
  3. Every generated Worker passes `tsc --noEmit`, installs `hostHeaderValidation` middleware (DNS rebinding), and installs Sentry `beforeSend` redaction for `X-Upstream-Auth`, `Authorization`, `Cookie`, and every auth header declared in the source spec
  4. `wrangler deploy --dry-run` bundle size is captured into QualityReport for every generation; bundles >950KB hard-fail with a multi-server-split suggestion; the generated repo includes a `.mcpgen.yaml` project config and is MCP Inspector compatible
  5. Generated Stripe MCP can be invoked manually via `npx @modelcontextprotocol/inspector` and returns dual `content` + `structuredContent` per MCP 2025-06-18
**Plans**: 13 plans
Plans:
- [x] 04-01-PLAN.md — Pass 5 Phase 1 deterministic pagination strategy detection (cursor/offset/page-number/none precedence per D-08) [Wave 1] ✓ 2026-04-28
- [x] 04-02-PLAN.md — Pass 5 Phase 2 deterministic outputSchema extraction + per-universal-tool envelope branches + metadata wrapper [Wave 1] ✓ 2026-04-28
- [x] 04-03-PLAN.md — Pass 5 Phase 3 Qwen field-importance ranking ‖ Sem 10 + heuristic pre-ranking + 1-retry-then-deterministic fallback (D-09/D-11) [Wave 2] ✓ 2026-04-28
- [x] 04-04-PLAN.md — Pass 5 Phase 4 truncation guidance templates (D-07 frozen table + Pitfall #5 anti-loop wording + search-no-cursor invariant) [Wave 2] ✓ 2026-04-28
- [x] 04-05-PLAN.md — Pass 5 Phase 5 response_format enum gate (D-10) + cross-tool consistency validators + final assembly + run() orchestrator [Wave 2] ✓ 2026-04-28
- [x] 04-06-PLAN.md — Stage E scaffold templates (9 project-level Jinja2) + IR additive bumps (StageEManifest + bundle_size_kb + pipeline_versions) + codegen-templates package skeleton [Wave 3] ✓ 2026-04-28
- [x] 04-07-PLAN.md — Stage E schemas templates (inputs.ts + outputs.ts dual-export + routing.ts) + Pitfall #33 conservative-format fallback [Wave 3] ✓ 2026-04-28
- [x] 04-08-PLAN.md — Stage E runtime modules (smart_id + pagination + truncation + upstream + response_shaping + errors + capability + sentry_redact) + Pitfall #4 + #12 mitigations [Wave 3] ✓ 2026-04-28
- [x] 04-09-PLAN.md — Stage E auth middleware (3 modes per D-21: passthrough/stored/OAuth) + Pitfall #15 DNS rebinding via SDK transport + workers-oauth-provider 0.2.x pin verification [Wave 3] ✓ 2026-04-28
- [x] 04-10-PLAN.md — Stage E per-tool-type handler templates (9 tool_*.ts.j2 + tools_index.ts.j2) per D-31 + MCP SDK v1 5-arg form + Pitfall #5 search-no-cursor at handler level [Wave 4] ✓ 2026-04-28
- [x] 04-11-PLAN.md — Stage E Phase 6 validation (tsc --noEmit + wrangler deploy --dry-run bundle-size capture per D-27/D-28) + run() orchestrator chaining 6 phases + node_modules pre-warm [Wave 4] ✓ 2026-04-29
- [x] 04-12-PLAN.md — pipeline.py extension (Stage D + E SSE events + L1 expansion per D-33/D-34) + cache template_version (D-35) + new GET /output endpoint (D-47) + CLI write_stage_e_output.ts replacing render_stub.ts + 4 integration tests + 10 hand-tuned fixtures (5×pass-5-output.json + 5×stage-e-output/MANIFEST.json) [Wave 5] ✓ 2026-04-29
- [x] 04-13-PLAN.md — Manual MCP Inspector verification gate per D-30 (Stripe MCP returns dual content+structuredContent against test-mode credentials; capability/bundle/DNS/Sentry spot-checks) [Wave 5] ✅ 2026-04-29 PASSED (initial gate found D-1+D-2+D-3 → drained by Plan 04-14; re-run #2 found D-4 → drained by Plan 04-15; re-run #3 confirmed all 4 deviations drained — outputSchema 9/9 in tools/list — see 04-PHASE-DEVIATIONS.md + 04-13-INSPECTOR-EVIDENCE.md re-run #3)
- [x] 04-14-PLAN.md — Template-fix follow-up draining D-1+D-2+D-3 (registerAllTools call + stateless transport + dev_local build mode) + Wave-0 paired handshake test against real wrangler dev [Wave 6] ✓ 2026-04-29
- [x] 04-15-PLAN.md — Template-fix follow-up draining D-4 (SDK v1 5-arg server.tool() → McpServer.registerTool config-object form) + json_schema_to_zod Jinja2 filter Rule-1 auto-fix + Wave-0 outputSchema handshake test against real wrangler dev + amend CONTEXT D-04 invariant + new ADR docs/decisions/2026-04-29-stage-e-registertool-migration.md [Wave 7] ✓ 2026-04-29
### Phase 5: Generation Engine — Validation (Stage F)
**Workstream**: `engine`
**Goal**: F1 static validation maps every failure to a specific upstream-pass retry; F2 smell scan via single Qwen3-Coder with 5-shuffle prompt averaging + temperature variance reaches the launch-criterion threshold ≥4.0 with between-tool σ ≥0.4 discrimination; F3 agent eval drives a real Sonnet 4.7 agent against golden tasks for top-10 APIs in real sandbox with mocked clients (Cursor / Claude Desktop / ChatGPT Deep Research) and reaches ≥0.7 server pass rate.
**Depends on**: Phase 4
**Requirements**: GEN-09, GEN-10, GEN-11
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #9 (F2 single-judge mode-collapse — between-tool variance metric σ ≥0.4 forces F3 even on free tier when violated), #10 (post-retry hallucination — F1 re-runs after every retry, regex `examples` against spec content), #31 (Cursor mock client in F3 — verifies read-only tools don't prompt for confirmation under `openWorldHint=true` + `readOnlyHint=true`), #32 (ChatGPT Deep Research compliance regression — F1 hardcodes canonical `search`/`fetch` parameter sets and diff-fails on drift)
**Success Criteria** (what must be TRUE):
  1. F1 static (tsc + ajv + ESLint + bundle-size gate <800KB pass / 800–950KB warn / >950KB fail + MCP protocol compliance + gitleaks secret scan + smart-ID regex compile + cross-tenant smart-ID fuzz check + routing completeness + auth middleware presence + OpenAI compliance fixture for `search`/`fetch` exact signatures) runs in <10 seconds on every generation, fails closed, and maps each failed check to a specific upstream-pass retry per `docs/mcpgen-stage-f-design.md` Appendix A
  2. F2 smell scan via single Qwen3-Coder × 5-shuffle prompt averaging × temperature variance (T=0.0/0.2/0.5) = 15 evaluations per tool produces a per-tool 6-component rubric score; threshold for pass = ≥4.0 (imported from `packages/contracts/launch-criteria.ts`); between-tool σ ≥0.4 discrimination metric flags low-confidence runs and force-triggers F3 even on free tier; per-component failures trigger targeted upstream-pass retries (max 2 rounds, cached prior-pass outputs reused)
  3. F3 agent eval drives a real Sonnet 4.7 agent against golden tasks (≥10 per server) for top-10 APIs (Stripe, GitHub, Notion, Linear, Slack, Calendar, etc.) in real sandbox; for the rest in a mocked environment; two-tier evaluator (rule-based + LLM judge per MCP-Bench arXiv 2508.20453); mock client harness covers Cursor (read-only confirmation skip), Claude Desktop, and ChatGPT Deep Research signature compliance; pass criterion = ≥0.7 server pass rate (imported from `packages/contracts/launch-criteria.ts`)
  4. End-to-end `Stage A → Pass 0–5 → Stage E → F1 → F2 → F3` produces a Quality Badge (premium ≥0.85 / verified ≥0.7 / standard / needs_review) for any input spec; Stripe + GitHub + Notion + Linear + Slack reach `verified` at minimum on a fresh run
**Plans**: 10 plans
Plans:
- [x] 05-01-PLAN.md — Foundation: IR additive types (QualityReport + GoldenTask + RetryRound) + Phase 5 sampling profiles (F2_JUDGE_T0X + F3_JUDGE + F3_TEST_AGENT) + Anthropic SDK + Sonnet test_agent module + Day-1 Sonnet smoke test + 2 new pytest markers [Wave 1] ✓ 2026-04-29
- [x] 05-02-PLAN.md — Canonical fixtures (search/fetch/mcp-schema) + gitleaks install (Dockerfile + package.json) + paired-decision pre-commit hook (Pitfalls #32, #33) [Wave 1] ✓ 2026-04-29
- [x] 05-03-PLAN.md — F1 cheap deterministic checks (8 modules: bundle_size + template_artifacts + smart_id_fuzz + mcp_compliance + routing_completeness + auth_middleware + openai_compliance + examples_provenance) + failure_patterns.py decision matrix [Wave 2] ✓ 2026-04-29
- [x] 05-04-PLAN.md — F1 subprocess checks (gitleaks + jsonschema dual-validation + tsc --noEmit) + full F1 orchestrator + fail-closed contract test [Wave 3] ✓ 2026-04-29
- [x] 05-05-PLAN.md — F2 smell scan (rubric + 5-shuffle × 3-temperature = 15 calls/tool + numpy σ ≥ 0.4 discrimination + LAUNCH_CRITERIA threshold + L2 cache key extension + D-16 untrusted-spec sanitization) [Wave 3] ✓ 2026-04-29
- [x] 05-06-PLAN.md — F3 server runner (wrangler dev --local + process-group cleanup + port retry + DNS-bypass scoping) + Sonnet test_agent harness (stop_reason loop + tenacity retry) + 5 sandbox adapters [Wave 4] ✓ 2026-04-30
- [x] 05-07-PLAN.md — F3 mock clients (Cursor + Claude Desktop older + ChatGPT Deep Research) + GoldenTask loader + mock_upstream synthesizer (~80 LoC) + two-tier evaluator (rule_based + Qwen LLM judge) + run_f3 orchestrator [Wave 4] ✓ 2026-04-30
- [x] 05-08-PLAN.md — Retry orchestrator FSM (max 2 rounds + cost cap + wall-clock guard) + cascade L2 invalidation (D-26) + QualityReport composite formula (D-28) + pipeline integration (F1 → F2 → F3) + new SSE events + GET /quality-report endpoint + strictly-additive POST request body [Wave 5] ✓ 2026-04-30
- [x] 05-09-PLAN.md — CLI flags (--f3 / --sandbox-creds / --strict) + render_quality_report + extended SSE consumer + 30 hand-authored golden tasks (Stripe/GitHub/Notion × 10) + 5 fixture quality-report.json scaffolds + Linear/Slack mock_upstream adapters + visual review checkpoint [Wave 6] ✓ 2026-04-30
- [x] 05-10-PLAN.md — Parametrized 5-fixture E2E test (mocked + real-LLM tiers) + real-LLM verification gate (3× pipeline run per fixture for D-42 calibration) + Phase 5 verification doc cross-referencing all 4 SC + 3 REQ + 4 owned pitfalls [Wave 7] ✓ 2026-04-30

### Phase 6: Runtime Plane
**Workstream**: `runtime`
**Goal**: Dispatch Worker on the single CF dispatch namespace per environment routes to per-tenant Worker scripts (NOT per-tenant namespaces), parses client `protocolVersion` for capability gating, supports 3 auth modes (pass-through default / stored AES-256-GCM / OAuth 2.1 PKCE), and emits usage events via `ctx.waitUntil(queue.send(...))` with a KV fallback bucket and a 5-min reconciliation cron. CLI `mcpgen deploy` ships a generated server to a tenant Worker script and ships as Bun-compiled binary on npm + GitHub releases.
**Depends on**: Phase 1 (consumes `packages/runtime-sdk/` stub + usage event schema; can run in parallel with Phases 2–5 against the hand-deployed sample tenant Worker)
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06, RUN-07, CLI-02, CLI-03
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #4 (capability gating — dispatch parses client `protocolVersion` during `initialize` and omits `outputSchema` for clients <2025-06-18), #6 (auth middleware accepts a per-endpoint routing table from Pass 0 output), #11 (single namespace per environment; tenant identity = script name + tags), #12 (outbound-Worker chokepoint scrubs credentials from any logging destination), #13 (CF Queue backpressure → KV fallback bucket + idempotent `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` for dedup + daily reconciliation), #14 (cold-start tax mitigation: warm-keep cron every 5 min for active tenants; high-cost init in `globalThis`)
**Success Criteria** (what must be TRUE):
  1. Dispatch Worker performs auth precheck (CF KV cache 5-min TTL), rate-limit, tenant lookup, parses client `protocolVersion` during `initialize`, capability-gates `outputSchema` (omits for <2025-06-18 clients), and dispatches to the correct tenant Worker script in the single environment namespace; >2 dispatch namespaces total fails CI
  2. A hand-deployed sample tenant Worker (Stripe, 3 tools) is live by end of Phase-6 Wave 2 — proves dispatch + auth + usage pipeline without waiting on engine completion; subsequent generated tenant Workers drop into the same shape
  3. Pass-through credentials (default) decrypt `X-Upstream-Auth` per request via HKDF-derived key, never persist; stored credentials (alt) use AES-256-GCM with per-tenant DEK in CF KV and require explicit user opt-in checkbox marked "less secure"; OAuth 2.1 mode wires `@cloudflare/workers-oauth-provider` with PKCE and Logto-managed tokens
  4. P99 over upstream stays <50ms on warm starts for the sample tenant Worker; cold starts are amortized via warm-keep cron every 5 min for active tenants; usage events emit via `ctx.waitUntil(queue.send(...))` with a KV fallback bucket on send failure; daily reconciliation job aligns TimescaleDB hypertable counts with Stripe Meters within 0.5%
  5. `mcpgen deploy` ships a generated server to CF Workers for Platforms (script-name = `{tenant}-{spec_slug}`) and returns a live URL; one-click Claude Desktop config block is generated with collision detection against existing config entries; CLI ships as Bun-compiled single binary on npm + GitHub releases for `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`
**Plans**: TBD

### Phase 7: Frontend Wire-Up
**Workstream**: `frontend`
**Goal**: Wire the locked Claude-Design UI (`claude-design-ui/MCP-Gen.zip`) to live `POST /api/v1/generate` + SSE callbacks + dashboard endpoints with NO visual / layout / typography / copy changes. Acceptance criterion enforced per plan: `git diff apps/web/src/styles/ apps/web/src/components/ui/` shows ZERO changes.
**Depends on**: Phase 1 contracts (Wave 1: landing/pricing/auth) → Phase 5 engine (Wave 2: generation/preview/quality) → Phase 6 runtime (Wave 3: dashboard)
**Requirements**: FE-01, FE-02, FE-03, FE-04, FE-05
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #20 (SSE stream disconnect on Vercel cold start — Postgres state as source of truth, `last-event-id` resume, "page reload mid-generation" test mandatory in plan), #30 (one-click Claude Desktop config collision detection in preview/deploy screen)
**Success Criteria** (what must be TRUE):
  1. Locked UI from `claude-design-ui/MCP-Gen.zip` ships unchanged into `apps/web/src/`; CI fails any PR that touches `apps/web/src/styles/` or `apps/web/src/components/ui/`
  2. Landing page submits to `/api/v1/generate` with `Idempotency-Key` header; generation playground consumes SSE callbacks per stage and survives a page reload mid-generation by reading `generation.status` from Postgres and resuming SSE from `last-event-id`
  3. Preview screen renders generated tool list, full descriptions, parameters, annotations, response config, and full code at every step (transparency principle); one-click deploy from preview produces a live tenant Worker URL with collision-checked Claude Desktop config block
  4. Dashboard shows deployed servers, usage events from TimescaleDB hourly aggregates, costs, and the F2/F3 quality badge (premium / verified / standard / needs_review)
**Plans**: TBD
**UI hint**: yes

### Phase 8: Auth + Billing
**Workstream**: `ops`
**Goal**: Logto Cloud (email + GitHub) handles user auth with the Pro-upgrade pre-bought at W7; Stripe Billing + Meters API supports Free (1 F3 eval/mo) / Pro (5/mo included) / Pay-as-you-go ($0.50/eval) with per-generation cost cap ($0.50 free / $2.00 pro) enforced server-side; quota enforcement uses TimescaleDB hourly aggregates as quota truth (real-time) with Stripe Meters as billing eventual; Drift Watcher (Inngest cron, daily) compares parsed IR (not raw spec content hash) and surfaces semantic diff with rate-limited drift email.
**Depends on**: Phase 1 (contracts + DB schema). Phase-8 Wave 1–2 can start parallel with Phases 2–5 against synthetic test events; end-to-end real-event validation depends on Phase 6 (usage events).
**Requirements**: CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, CTRL-07
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #13 (idempotent `usage_event_id` + UNIQUE `(tenant_id, tool_call_id)` + daily Stripe Meters reconciliation), #16 (Stripe Meters lag UX — TimescaleDB = quota truth, Stripe = billing eventual; daily reconciliation alerts on >2% drift), #17 (Logto Pro pre-bought at W7 to avoid 5K MAU lock during viral spike), #34 (drift detection uses parsed IR diff with cosmetic-changes-ignored + per-recipient rate limit max 1 drift email/week)
**Success Criteria** (what must be TRUE):
  1. Email + GitHub login via Logto Cloud works in production; no Google/Twitter/Apple providers are wired in MVP; Logto Cloud Pro is pre-bought before W7 and the self-host migration runbook has been tested on staging
  2. Drizzle migrations cover the full data model on Neon Postgres 16 + TimescaleDB + pgvector with Scale-tier compute (≥4 vCPU, 8GB) for production: organizations → users → projects → specs → generations → deployments → tools (with pgvector embedding); R2 holds three buckets (`mcpgen-specs`, `mcpgen-artifacts` 30-day TTL, `mcpgen-public-cache`) with no PII or credentials persisted
  3. Stripe products + prices + webhook handler wire Free / Pro / PAYG; per-generation cost cap is enforced server-side (engine + BFF + Stripe quota); cost cap exceeded → hard fail with partial result + bill, never silent overrun; quota enforcement uses TimescaleDB hourly aggregates as real-time quota truth with daily Stripe Meters reconciliation alerting on >2% drift
  4. Drift Watcher Inngest cron (daily 02:00 UTC) compares parsed IR (not raw spec content hash) and surfaces semantic diff (added / removed / changed endpoints / parameters) in the UI with manual-review / one-click-regenerate / auto-regenerate-toggle (auto = opt-in only); Resend per-recipient email rate-limit max 1 drift email/week
**Plans**: TBD

### Phase 9: Observability & Polish
**Workstream**: `main`
**Goal**: Sentry (TS + Python with source maps), BetterStack (logs + uptime + CF Queue depth alerts), Langfuse v4 (LLM tracing via OTel) wired across all components with `beforeSend` redaction for auth headers and spec content. Cross-phase integration checks include cross-tenant smart-ID fuzz, multi-client smoke (Cursor / Claude Desktop / ChatGPT Deep Research), Inngest orphan audit, deliberate-leak PII audit, and Neon Scale-tier upgrade verification. Inngest function IDs are stable strings.
**Depends on**: Phases 2–8 merged
**Requirements**: CTRL-08, CTRL-09
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #1 (cross-tenant smart-ID fuzz test in F1 fixture), #4 (multi-version client smoke), #12 (deliberate-leak PII audit), #19 (Neon Scale-tier compute upgrade verification under load), #21 (Inngest function orphan audit; stable function IDs `drift-watcher-v1` / `usage-reconciler-v1`), #33 (multi-client smoke test against Claude Desktop, Cursor, ChatGPT Deep Research)
**Success Criteria** (what must be TRUE):
  1. Sentry DSNs filled in all 4 apps with source maps uploaded per runtime; `beforeSend` strips `Authorization`, `X-Upstream-Auth`, `Cookie`, and spec content; deliberate-leak PII audit returns zero hits for `Bearer `, `sk_live_`, `ghp_` across Sentry events and BetterStack logs over the audit window
  2. Langfuse v4 captures every LLM call with `session_id = generation.id`; trace → cost → quality_score correlation is visible in the Langfuse UI; spec sections are redacted from trace metadata (only IR structure is logged)
  3. BetterStack uptime checks cover `apps/web`, `apps/api`, `apps/dispatch`, `apps/generation-engine`, sample tenant Worker, and Logto endpoint; CF Queue depth alert fires above 10K messages; Neon connection-refusal alert fires on autovacuum spikes
  4. Inngest function IDs are stable strings (`drift-watcher-v1`, `usage-reconciler-v1`); orphan audit reports zero orphans; cross-tenant smart-ID fuzz test in F1 fixture proves dispatched tenant Worker rejects IDs whose prefix doesn't match its tenant; multi-client smoke (Cursor / Claude Desktop / ChatGPT Deep Research) passes for the 5 popular APIs
**Plans**: TBD

### Phase 10: Launch
**Workstream**: `main`
**Goal**: Soft launch W7 (20 invited beta users, gather feedback, fix P0 issues) → public launch W9 (Show HN, Product Hunt, Reddit r/MachineLearning + r/LocalLLaMA). All launch criteria from `docs/mcpgen-implementation-plan.md` §11.7 met. Kill switches enforced: F3 success rate <70%, F2 average <4.0, P1 security finding, deploy success rate <95%, founder unslept 5+ days each delays launch one week.
**Depends on**: Phase 9
**Requirements**: GTM-01, GTM-02, GTM-03
**Pitfalls mitigated** (per `.planning/research/PITFALLS.md` §Pitfall-to-Phase Mapping): #17 (MAU monitoring on Logto with weekly graph from Logto Admin API), #22 (resist "just add GraphQL" mid-launch trap — Out-of-Scope is contractual), #23 (Friday demo cadence preserved through W10 — pre-recorded clips throughout the week, Friday is editing only)
**Success Criteria** (what must be TRUE):
  1. Quickstart docs (Mintlify or Docusaurus) are tested end-to-end by an external developer who has never used MCPGen; they reach a deployed MCP server without operator help
  2. Privacy + ToS + Pricing page is published; pricing matches code-enforced quotas exactly (Free 1 F3/mo, Pro 5/mo, PAYG $0.50/eval, cost cap $0.50/$2.00)
  3. Soft launch W7: 20 invited users complete the paste-URL → 60s → deployed MCP server flow with F2 ≥4.0 and F3 ≥0.7 on top-5 APIs; P0 issues fixed before public launch
  4. Public launch W9: Show HN + Product Hunt + Reddit posts go live the same day; Logto MAU monitoring active; first 100 signups are recorded; demo videos for the 5 popular APIs published
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
Phases 6, 7, 8 can run in parallel with Phases 2–5 (each consumes Phase-1 contracts only) per `docs/mcpgen-gsd-sprint-plan.md`.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 9/8 | Complete    | 2026-04-26 |
| 2. Generation Engine — Architect (Pass 0+1) | 0/TBD | Not started | - |
| 3. Generation Engine — Author (Pass 2+3+4) | 0/12 | Not started | - |
| 4. Generation Engine — Shape & Codegen (Pass 5 + Stage E) | 0/13 | Not started | - |
| 5. Generation Engine — Validation (Stage F) | 11/10 | Complete    | 2026-04-29 |
| 6. Runtime Plane | 0/TBD | Not started | - |
| 7. Frontend Wire-Up | 0/TBD | Not started | - |
| 8. Auth + Billing | 0/TBD | Not started | - |
| 9. Observability & Polish | 0/TBD | Not started | - |
| 10. Launch | 0/TBD | Not started | - |

---

*Roadmap created: 2026-04-26*
*Source of truth for sequencing: `docs/mcpgen-gsd-sprint-plan.md` (per CLAUDE.md §12 rule 4)*
