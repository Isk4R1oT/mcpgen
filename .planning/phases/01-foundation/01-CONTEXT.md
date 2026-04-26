# Phase 1: Foundation - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Mode:** Auto-mode discussion (recommended option selected for each gray area; rationale logged inline)

<domain>
## Phase Boundary

Empty-but-deployable monorepo with five frozen contracts and the eight cross-phase Phase-1 refinements surfaced in `.planning/research/SUMMARY.md`. Phase 1 unblocks all parallel workstreams (engine, runtime, ops, frontend) by freezing IR + Generation API + Usage Event + DB schema v1 + Tenant Worker SDK and providing engine-fixtures + sandbox CF namespace + Sentry skeleton + Langfuse OTel + pre-commit gates so workstreams can run end-to-end against fixtures before any pass exists.

In scope: scaffolding `apps/` and `packages/` with empty-but-deployable configs; freezing the 5 contracts; setting up Cloudflare prod/staging/sandbox namespaces; wiring Sentry SDK skeletons + Langfuse OTel exporter + pre-commit hooks; spike on Hono streamSSE 30s sub-request limit; Logto Cloud free-tier scaffolding with Pro-upgrade runbook; CI baseline (GitHub Actions); BFF API contract including SSE resume semantics; idempotency keys at all 4 surfaces.

Out of scope (will be later phases): writing any LLM passes (Phase 2+); generating any tenant Workers (Phase 4); deploying any tenant Workers (Phase 6); any UI changes beyond extracting `claude-design-ui/MCP-Gen.zip` into `apps/web/src/`; Stripe products/prices configuration (Phase 8); Drift Watcher implementation (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Cross-language IR contract
- **D-01:** **TS Zod is the source of truth for IR; Pydantic models are generated from Zod schemas via codegen.** *Rationale:* 4 of 5 consuming surfaces are TypeScript (frontend, runtime, Stage E codegen templates, control plane); only the Python engine reads Pydantic. Zod → JSON Schema → datamodel-codegen produces clean Pydantic 2 BaseModels. Reverse direction (Pydantic → TS) is also possible but produces less idiomatic TS. (Per `.planning/research/STACK.md` §6.4 + `.planning/research/ARCHITECTURE.md` §R-A6.)
- **D-02:** Codegen runs in CI on every PR that touches `packages/ir/`; if generated files are stale, CI fails. Engine startup also re-validates Pydantic types against the latest IR schema as a defensive check.

### Drift Watcher runtime placement
- **D-03:** **Drift Watcher lives in the Hono BFF (TypeScript Inngest SDK), not the Python engine.** *Rationale:* control plane already imports Inngest TS SDK for usage event consumption; keeping Python engine focused on LLM orchestration only. Drift Watcher needs spec-fetching + IR-diff (not LLM); doing it in TS keeps `apps/generation-engine/` single-purpose. (Per ARCHITECTURE.md component table.)

### MCP TypeScript SDK version pin (open Key Decision in PROJECT.md — resolved here)
- **D-04:** **Pin `@modelcontextprotocol/sdk@^1.x` for MVP** in `packages/codegen-templates/package.json.j2` AND `packages/runtime-sdk/package.json`. *Rationale:* `docs/mcpgen-stage-e-design.md` examples are written against v1 syntax (`server.tool(name, description, schema, handler)`). v2 is breaking (`registerTool`, Standard Schema, package alias rename) and would force a one-time rewrite of all 9 Stage-E `tool_*.ts.j2` templates before Phase 4 starts. Bump to v2 post-launch as a deliberate `chore: bump mcp-sdk to v2` PR with golden-API regression. (Per STACK.md §6.1 — recommended path.)

### Pre-commit hook framework
- **D-05:** **`pre-commit` (Python) framework** orchestrates gitleaks + ruff + eslint + mypy + conventional-pre-commit across the entire monorepo. *Rationale:* Cross-language support out of the box; one config in `.pre-commit-config.yaml`; matches `docs/mcpgen-git-workflow-rules.md` mandate. lefthook is faster but adds a Go dependency for a solo founder. husky/lint-staged would not handle the Python engine. (Per STACK.md §2.6.)

### CI provider
- **D-06:** **GitHub Actions.** *Rationale:* Solo-friendly; native integration with Vercel + Cloudflare + Fly.io + Sentry source map upload + Logto. Free tier covers MVP volume. CircleCI / Buildkite are alternatives but add vendor surface for solo founder ops. Workflows live in `.github/workflows/` per workstream (`engine-ci.yml`, `runtime-ci.yml`, `frontend-ci.yml`, `ops-ci.yml`, `main-ci.yml` aggregator).

### Engine-fixtures shadow service initial seed
- **D-07:** **Phase 1 ships static fixtures for 5 golden APIs** (Stripe + GitHub + Notion + Linear + Slack) covering all three ICPs and all three tool-type mixes (data-heavy / action-heavy / workflow-heavy). *Rationale:* Phase 6 (runtime), Phase 7 (frontend), Phase 8 (ops) need realistic non-trivial fixtures to integrate against; these 5 are the F3 golden-task targets anyway and pay for themselves twice (fixtures + F3 baseline). Each fixture = `{IR, FinalTool[], QualityReport}` JSON. Stored as `packages/engine-fixtures/{stripe,github,notion,linear,slack}/`.

### CF Workers for Platforms environment / namespace strategy
- **D-08:** **Three namespaces total — `mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox` — never per-tenant** (Pitfall #11 — Cloudflare explicitly forbids namespace-per-tenant). Tenancy is per-script: tenant identity = `{tenant_short_id}-{spec_slug}` script name; `tenant_id`, `plan_tier`, `spec_hash` carried on script tags (max 8/script). `mcpgen-sandbox` lives in the same Cloudflare account as prod/staging (separate account is cheaper-than-it-sounds since CF account boundaries don't fully isolate billing for solo founder). Pre-commit hook fails any PR that creates a fourth dispatch namespace.

### BFF SSE resume semantics
- **D-09:** **Postgres `generation.status` is the source of truth; SSE is a UX progress hint that supports `last-event-id` resume.** On disconnect/refresh, frontend fetches current `generation` row from BFF, then re-subscribes to SSE. Engine writes per-stage events to a `pending_callbacks` table on callback delivery failure (3 retries with exponential backoff); Inngest cron drains stuck callbacks every 5 min. (Per ARCHITECTURE.md R-A4 + R-A7.)
- **D-10:** SSE event envelope in `packages/contracts/src/generation-api.ts`: `{ job_id: string, event_id: string, stage: 'A'|'B'|'C'|'D'|'E'|'F1'|'F2'|'F3'|'completed'|'failed', status: 'started'|'completed'|'error', partial_result?: object, error?: { code: string, message: string, retry_after_seconds?: number } }`. `event_id` is monotonic ULID per generation; clients send `Last-Event-ID` header on reconnect.

### Idempotency-key conventions
- **D-11:** **All 4 surfaces use the same shape: `${operation}_${ulid}`** with the operation prefix making collisions across surfaces impossible.
  - `POST /api/v1/generate`: client-supplied `Idempotency-Key` header, fallback to BFF-generated `gen_${ulid}` (becomes `generation.id`).
  - Inngest job trigger: `gen_${ulid}` (same as generation.id; Inngest dedupes natively).
  - Stripe Meters event: `${deployment_id}_${minute_bucket_iso}_${tool_name}` per pitfall #13 — Stripe dedupes within rolling 24h.
  - CF dispatch deploy: `deploy_${deployment.id}` becomes `cf_worker_name`; deploys are upserts.

### Drizzle migration filename strategy
- **D-12:** **Timestamp prefix `YYYYMMDD_HHMMSS_<descriptive_name>.sql`** from day 1; never numeric sequence. *Rationale:* Pitfall #18 — parallel workstreams in worktrees would collide on numeric sequences. CI runs `drizzle-kit check` on every PR. First migration: `20260427_000000_init_schema.sql`.

### `packages/contracts/launch-criteria.ts` enforcement
- **D-13:** **Launch-criteria thresholds (F2 ≥ 4.0, F3 ≥ 0.7, bundle <800KB pass / 800–950KB warn / >950KB fail) are runtime constants** imported across engine + BFF + CI. Pre-commit hook checks: any PR touching `launch-criteria.ts` MUST also include a paired `docs/decisions/<date>-<slug>.md` entry. *Rationale:* Pitfall #29 (AI-fix-by-lowering-threshold) is the most insidious failure mode for an AI-agentic workflow.

### Logto upgrade plan
- **D-14:** **Logto Cloud free tier in Phase 1; Pro tier ($60/mo, 50K MAU) pre-bought at end of W7 before soft launch.** Self-host migration runbook documented and dry-run on staging by end of W8. *Rationale:* Pitfall #17 — viral spike at public W9 launch can saturate 5K MAU within hours.

### Hono streamSSE 30s sub-request spike
- **D-15:** **30-min spike at end of Phase 1 Wave 1 verifies a 90-second SSE stream from BFF on CF Workers** does not hit the 30s sub-request limit. Acceptance: SSE event delivered at t=85s reaches the client.
- **D-16:** **Fallback if spike fails:** events written to Inngest with frontend subscribed to a separate `/api/v1/jobs/${id}/stream` endpoint backed by CF Durable Objects WebSocket fanout. This is a contingency, not the default path. (Per STACK.md §6.6.)

### Postgres connection pooling
- **D-17:** **Cloudflare Hyperdrive in front of Neon Postgres** for the BFF + dispatch worker. Engine connects to Neon directly (Fly Machines have no edge constraint). *Rationale:* CF Workers cannot do raw TCP; without Hyperdrive, the only path is `@neondatabase/serverless` HTTP proxy, which has higher per-query latency and worse connection efficiency at scale. (Per ARCHITECTURE.md scaling priorities §3.)

### Neon compute tier
- **D-18:** **Neon dev tier (free) for Phase 1 development and CI; Scale-tier compute (≥4 vCPU, 8GB) provisioned by end of W8 before soft launch.** Cost: ~$220/mo. *Rationale:* Pitfall #19 — pgvector + TimescaleDB + autovacuum on dev tier OOMs under load. Production cannot launch on dev tier.

### Sentry source-map upload
- **D-19:** **Each app handles its own source-map upload in its CI workflow** (Vercel auto-uploads via `@sentry/nextjs`; CF Workers via `wrangler deploy --upload-source-maps`; Fly Machines via `sentry-sdk[fastapi]` with `SENTRY_RELEASE` env). Phase 1 wires the SDK init in every app with empty DSN; Phase 9 fills DSN per environment.

### Conventional Commits enforcement layer
- **D-20:** **Both pre-commit AND CI** validate commit messages. *Rationale:* pre-commit catches 99% locally; CI is the trust boundary. Cost is one extra `commitlint` action per PR.

### Cross-workstream test ownership policy
- **D-21:** **Failing tests are owned by the workstream that owns the file the test exercises.** `tests/engine/*` → engine ws. Cross-workstream test failures escalate to MAIN as a `chore(contracts):` PR. Daily sync ritual (per `docs/mcpgen-gsd-sprint-plan.md` §5.1) MUST run before any session starts work to surface conflicts. (Per pitfall #26.)

### Claude's Discretion
- Specific Drizzle table column names + indexes (see `docs/mcpgen-architecture.md` §7 — code review during Phase 1 plan).
- Wrangler.toml worker_routes pattern for prod / staging / sandbox.
- GitHub Actions matrix shapes per workstream.
- Specific OTLP endpoint URL for Langfuse Cloud (read from Langfuse dashboard during Phase 1).
- Whether `pre-commit autoupdate` runs on schedule or manually (low-stakes).

### Folded Todos
*None — no pending todos at project start.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning Phase 1.**

### Source of truth for the entire project
- `RULES.md` — hard non-negotiable rules across product/engine/architecture/security/operating/scope.
- `CLAUDE.md` — operational map across all `docs/` (sections 3, 4, 7, 8, 11, 12 most relevant for Phase 1).

### Source of truth for stack and architecture (Phase 1's scope)
- `docs/mcpgen-architecture.md` §3 (high-level architecture), §4 (locked stack), §6 (runtime plane), §7 (data model — feeds DB schema v1), §11 (observability), §14 (security), §15 (repo structure).
- `docs/mcpgen-model-and-provider-override.md` §0–2 (locked LLM model + provider; **overrides any model reference in any other doc**), §8 (Day-1 smoke test).
- `docs/mcpgen-git-workflow-rules.md` (Conventional Commits, atomic commits, NEVER `--no-verify`, pre-commit hook contract).
- `docs/mcpgen-gsd-sprint-plan.md` §2 (10-phase structure — Phase 1 row), §3 (workstream allocation), §4.1 (Foundation phase plan breakdown), §5 (cross-workstream coordination + contract change protocol).

### Source of truth for what Phase 1 must deliver
- `.planning/PROJECT.md` (Constraints + Key Decisions sections).
- `.planning/REQUIREMENTS.md` (FND-01..15, CTRL-01, OPS-01..03 — 19 requirements assigned to Phase 1).
- `.planning/ROADMAP.md` Phase 1 entry (8 success criteria).
- `.planning/research/SUMMARY.md` §"Implications for Roadmap" Phase 1 + §"Eight Phase-1 refinements".
- `.planning/research/STACK.md` §1 (locked stack), §2 (implicit deps), §3 (installation snippets), §6 (drift to verify), §7 (version compatibility).
- `.planning/research/ARCHITECTURE.md` §"Build Order with Dependency Rationale", §"Contracts to Freeze in Phase 1", §"Cross-Cutting Concerns", §"Risks vs. Locked Architecture" R-A1..R-A8.
- `.planning/research/PITFALLS.md` §"Pitfall-to-Phase Mapping" Phase 1 row + #11, #17, #18, #19, #20, #24, #26, #29 in detail.

### Source of truth for engine-fixtures shape (consumed by frontend/runtime/ops)
- `docs/mcpgen-generation-engine-v2.md` §5.2 (Universal IR shape — fixtures must match).
- `docs/mcpgen-pass-1-design.md` §"Six-Tool Pattern" + §"Smart IDs" (`FinalTool` shape after Pass 1).
- `docs/mcpgen-pass-5-design.md` §"FinalTool" output shape (final shape after Pass 5).
- `docs/mcpgen-stage-f-design.md` §"Quality Report" + §"Quality Badges" (QualityReport shape).

### Source of truth for the 5 contracts to freeze
- IR schema source: `packages/ir/` (TS Zod) — derived from `docs/mcpgen-generation-engine-v2.md` §5.2.
- Generation API: `packages/contracts/src/generation-api.ts` — derived from `docs/mcpgen-architecture.md` §5.8.
- Usage event schema: `packages/contracts/src/usage-event.ts` — derived from `docs/mcpgen-architecture.md` §6 (runtime emit) + §10 (Stripe Meters dimensions).
- DB schema v1: `infrastructure/neon/migrations/20260427_000000_init_schema.sql` — derived from `docs/mcpgen-architecture.md` §7.
- Tenant Worker SDK API: `packages/runtime-sdk/src/index.ts` — derived from `docs/mcpgen-stage-e-design.md` §"Stage E template inventory" + §"Auth modes".

### Source of truth for security surface (Phase 1 must wire foundations)
- `docs/mcpgen-architecture.md` §11 (logging redaction), §14 (secret management).
- Pitfall #12 (Sentry beforeSend redaction — Phase 4 implements; Phase 1 must specify the contract).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`claude-design-ui/MCP-Gen.zip`** — locked frontend design; Phase 1 unzips into `apps/web/src/`. NO visual / layout / typography changes allowed.
- **`docs/`** — 9 detail-design docs already authored; Phase 1 must NOT regenerate or contradict any of them.

### Established Patterns
- **None — greenfield project.** Phase 1 establishes the patterns the rest of the project follows. The discipline introduced in Phase 1 (file naming, contract location, idempotency-key shape, migration prefix, commit format) becomes the baseline.

### Integration Points
- **`packages/ir/` is consumed by every workstream** via TS imports (frontend, runtime, codegen templates) and Pydantic codegen output (engine).
- **`packages/contracts/`** is consumed by BFF (request/response types), engine (callback shape), runtime (usage event emit), frontend (SSE event envelope).
- **`packages/runtime-sdk/`** is consumed by Stage E codegen templates (engine) at codegen time and by tenant Workers at runtime.
- **`packages/engine-fixtures/`** is consumed by frontend/runtime/ops workstreams during parallel development before Phase 5 (engine) completes.

</code_context>

<specifics>
## Specific Ideas

- **Day-1 smoke test for the engine workstream is mandatory** before any Pass 0 code is written: `apps/generation-engine/tests/smoke_test_qwen.py` — 30-line script that calls `qwen/qwen3-coder` via PydanticAI `OpenAIProvider(base_url=https://openrouter.ai/api/v1)` with structured output (function calling). CI runs it on every PR to engine ws. Phase 1 must scaffold this test file (with `pytest.skip` when `OPENROUTER_API_KEY` is absent, so it does not block pre-API-key contributors).

- **Engine-fixtures fidelity bar:** the 5 fixture sets must be hand-tuned to look exactly like real Pass 5 output, not LLM-generated. Hand-write them by reading each upstream API's spec and authoring the IR + FinalTool + QualityReport manually. ~4 hours each. Pays for itself: parallel workstreams cannot build against fake-looking fixtures.

- **`packages/ir/` codegen output is committed to git, not generated on install.** *Rationale:* keeps Python engine startup fast, avoids cross-machine codegen drift, makes IR diffs visible in PR review.

- **Sample tenant Worker** (Stripe with 3 hand-coded tools — `customers_search`, `charges_fetch`, `subscriptions_list`) lives at `apps/dispatch-sample/` and is hand-coded in Phase 1. Phase 6 dispatches against it. Phase 4 generates real tenant Workers in the same shape. This is per ARCHITECTURE.md refinement #1.

- **No specific UI work in Phase 1** beyond unzipping `claude-design-ui/MCP-Gen.zip` into `apps/web/src/`. CI rule: any PR that touches `apps/web/src/styles/` or `apps/web/src/components/ui/` after the unzip commit fails.

</specifics>

<deferred>
## Deferred Ideas

- **Self-host Logto migration** — runbook tested in Phase 1, but actual migration deferred to t+3mo per `docs/mcpgen-architecture.md` §19.
- **Self-host Langfuse** — same pattern, defer to t+3mo / 5M LLM events.
- **Rust-based pre-commit (lefthook)** — only if Python `pre-commit` startup latency becomes a documented friction point in the AI-agentic worktree workflow.
- **Multi-region Fly Machines + Neon EU** — single-region for MVP; revisit at 1k+ active users.
- **CF Pages migration from Vercel** — t+6mo or when consolidation pays off.
- **Dependabot for `@modelcontextprotocol/sdk` major version** — explicitly disabled in Phase 1 because auto-bumped majors silently break previously-deployed tenant Workers; bumps are deliberate `chore: bump mcp-sdk to vN` PRs with full golden-API regression.
- **Per-environment secrets vault** (Doppler / Infisical / 1Password) — using CF Workers Secrets + Fly.io Secrets directly in Phase 1; revisit if multi-machine dev secret sharing becomes painful.
- **Build-system swap (Nx / Moon)** — Turborepo + pnpm is locked; Nx affected-graph is more powerful but adds tooling surface.

### Reviewed Todos (not folded)
*None — no pending todos at project start.*

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-26*
