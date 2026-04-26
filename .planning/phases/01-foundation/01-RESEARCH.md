# Phase 1: Foundation — Research

**Researched:** 2026-04-26
**Domain:** Greenfield monorepo scaffolding (TS + Python polyglot, multi-app + multi-package, contract-freeze phase)
**Confidence:** HIGH for locked stack and Phase-1 refinements; MEDIUM for cross-language IR codegen tool choice and Hono streamSSE on CF Workers (resolved via D-15 spike); LOW only for items we explicitly defer to spikes during execution.

---

## Summary

Phase 1 is **scaffolding-only** and has the highest blocking power of any phase: 21 locked decisions (D-01..D-21), 19 requirements (FND-01..15, CTRL-01, OPS-01..03), 5 contracts to freeze, 8 cross-cutting refinements, 8 critical pitfalls to defuse. None of it is novel research — every locked decision is verified against `docs/`, ecosystem reality (Context7), or current registry state. The risk surface is **execution discipline**, not technical unknowns.

The two tightest unknowns from upstream research (`@modelcontextprotocol/sdk` v1 vs v2; Hono `streamSSE` 30s sub-request limit) were resolved by upstream context: D-04 pins `^1.x` for MVP; D-15 mandates a 30-min spike at end of Wave 1 with D-16 specifying the Durable Objects fallback. The spike is **the** sequencing constraint — every other contract can freeze before or alongside it.

**Primary recommendation:** Execute Phase 1 in 4 waves. Wave 0: install validation framework + write fixture files (per nyquist_validation policy). Wave 1: monorepo skeleton + tool installs + Cloudflare/Neon/Logto account scaffolding + IR codegen pipeline. Wave 2: 5 contracts authored + Hono streamSSE spike (D-15) + DB schema + sample tenant Worker. Wave 3: pre-commit + CI + Sentry + Langfuse + engine-fixtures + Day-1 Qwen smoke test + freeze contracts. Each wave ends in a `chore(foundation):` squash-merge to main; no long-lived branch.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cross-language IR contract**
- **D-01:** TS Zod is the source of truth for IR; Pydantic models are generated from Zod schemas via codegen.
- **D-02:** Codegen runs in CI on every PR that touches `packages/ir/`; if generated files are stale, CI fails. Engine startup also re-validates Pydantic types against the latest IR schema.

**Drift Watcher runtime placement**
- **D-03:** Drift Watcher lives in the Hono BFF (TypeScript Inngest SDK), not the Python engine.

**MCP TypeScript SDK version pin**
- **D-04:** Pin `@modelcontextprotocol/sdk@^1.x` for MVP in `packages/codegen-templates/package.json.j2` AND `packages/runtime-sdk/package.json`.

**Pre-commit hook framework**
- **D-05:** `pre-commit` (Python) framework orchestrates gitleaks + ruff + eslint + mypy + conventional-pre-commit across the entire monorepo.

**CI provider**
- **D-06:** GitHub Actions. Workflows live in `.github/workflows/` per workstream (`engine-ci.yml`, `runtime-ci.yml`, `frontend-ci.yml`, `ops-ci.yml`, `main-ci.yml` aggregator).

**Engine-fixtures shadow service initial seed**
- **D-07:** Phase 1 ships static fixtures for 5 golden APIs (Stripe + GitHub + Notion + Linear + Slack) — `{IR, FinalTool[], QualityReport}` JSON in `packages/engine-fixtures/{stripe,github,notion,linear,slack}/`.

**CF Workers for Platforms environment / namespace strategy**
- **D-08:** Three namespaces total — `mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox` — never per-tenant. Tenancy is per-script: `{tenant_short_id}-{spec_slug}` script name; `tenant_id`, `plan_tier`, `spec_hash` carried on script tags (max 8/script). `mcpgen-sandbox` lives in the same Cloudflare account as prod/staging. Pre-commit hook fails any PR that creates a fourth dispatch namespace.

**BFF SSE resume semantics**
- **D-09:** Postgres `generation.status` is the source of truth; SSE is a UX progress hint that supports `last-event-id` resume. Engine writes per-stage events to a `pending_callbacks` table on callback delivery failure (3 retries with exponential backoff); Inngest cron drains stuck callbacks every 5 min.
- **D-10:** SSE event envelope in `packages/contracts/src/generation-api.ts`: `{ job_id: string, event_id: string, stage: 'A'|'B'|'C'|'D'|'E'|'F1'|'F2'|'F3'|'completed'|'failed', status: 'started'|'completed'|'error', partial_result?: object, error?: { code: string, message: string, retry_after_seconds?: number } }`. `event_id` is monotonic ULID per generation; clients send `Last-Event-ID` header on reconnect.

**Idempotency-key conventions**
- **D-11:** All 4 surfaces use `${operation}_${ulid}`:
  - `POST /api/v1/generate`: client-supplied `Idempotency-Key` header, fallback to BFF-generated `gen_${ulid}` (becomes `generation.id`).
  - Inngest job trigger: `gen_${ulid}` (Inngest dedupes natively).
  - Stripe Meters event: `${deployment_id}_${minute_bucket_iso}_${tool_name}` (Stripe dedupes within rolling 24h).
  - CF dispatch deploy: `deploy_${deployment.id}` becomes `cf_worker_name`; deploys are upserts.

**Drizzle migration filename strategy**
- **D-12:** Timestamp prefix `YYYYMMDD_HHMMSS_<descriptive_name>.sql` from day 1; never numeric sequence. CI runs `drizzle-kit check` on every PR. First migration: `20260427_000000_init_schema.sql`.

**Launch-criteria enforcement**
- **D-13:** Launch-criteria thresholds (F2 ≥ 4.0, F3 ≥ 0.7, bundle <800KB pass / 800–950KB warn / >950KB fail) are runtime constants in `packages/contracts/launch-criteria.ts`. Pre-commit hook checks: any PR touching `launch-criteria.ts` MUST also include a paired `docs/decisions/<date>-<slug>.md` entry.

**Logto upgrade plan**
- **D-14:** Logto Cloud free tier in Phase 1; Pro tier ($60/mo, 50K MAU) pre-bought at end of W7 before soft launch. Self-host migration runbook documented and dry-run on staging by end of W8.

**Hono streamSSE 30s sub-request spike**
- **D-15:** 30-min spike at end of Phase 1 Wave 1 verifies a 90-second SSE stream from BFF on CF Workers. Acceptance: SSE event delivered at t=85s reaches the client.
- **D-16:** Fallback if spike fails: events written to Inngest with frontend subscribed to a separate `/api/v1/jobs/${id}/stream` endpoint backed by CF Durable Objects WebSocket fanout.

**Postgres connection pooling**
- **D-17:** Cloudflare Hyperdrive in front of Neon Postgres for the BFF + dispatch worker. Engine connects to Neon directly (Fly Machines have no edge constraint).

**Neon compute tier**
- **D-18:** Neon dev tier (free) for Phase 1 development and CI; Scale-tier compute (≥4 vCPU, 8GB) provisioned by end of W8 before soft launch (~$220/mo).

**Sentry source-map upload**
- **D-19:** Each app handles its own source-map upload in its CI workflow (Vercel auto-uploads via `@sentry/nextjs`; CF Workers via `wrangler deploy --upload-source-maps`; Fly Machines via `sentry-sdk[fastapi]` with `SENTRY_RELEASE` env). Phase 1 wires SDK init in every app with empty DSN; Phase 9 fills DSN per environment.

**Conventional Commits enforcement layer**
- **D-20:** Both pre-commit AND CI validate commit messages.

**Cross-workstream test ownership policy**
- **D-21:** Failing tests are owned by the workstream that owns the file the test exercises. `tests/engine/*` → engine ws. Cross-workstream test failures escalate to MAIN as a `chore(contracts):` PR. Daily sync ritual MUST run before any session starts work.

### Claude's Discretion

- Specific Drizzle table column names + indexes (code review during Phase 1 plan).
- Wrangler.toml `worker_routes` pattern for prod / staging / sandbox.
- GitHub Actions matrix shapes per workstream.
- Specific OTLP endpoint URL for Langfuse Cloud (read from Langfuse dashboard during Phase 1).
- Whether `pre-commit autoupdate` runs on schedule or manually.

### Deferred Ideas (OUT OF SCOPE)

- Self-host Logto migration (deferred to t+3mo).
- Self-host Langfuse (deferred to t+3mo / 5M LLM events).
- Rust-based pre-commit (lefthook) — only if Python pre-commit startup latency becomes a documented friction point.
- Multi-region Fly Machines + Neon EU — single-region for MVP.
- CF Pages migration from Vercel — t+6mo.
- Dependabot for `@modelcontextprotocol/sdk` major version — explicitly disabled.
- Per-environment secrets vault (Doppler / Infisical / 1Password).
- Build-system swap (Nx / Moon).
- Generating any tenant Workers (Phase 4).
- Deploying any tenant Workers (Phase 6).
- UI changes beyond unzipping `claude-design-ui/MCP-Gen.zip` into `apps/web/src/`.
- Stripe products/prices configuration (Phase 8).
- Drift Watcher implementation (Phase 8).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Monorepo scaffolded with Turborepo 2 + pnpm 9 (`apps/web`, `apps/api`, `apps/dispatch`, `apps/generation-engine`, `apps/cli`, `apps/docs`) | §"Standard Stack" + §"Monorepo Layout"; Turborepo `2.9.6`, pnpm `10.30.2` confirmed via `npm view` |
| FND-02 | `packages/ir/` defines IR schema with TS Zod source of truth + Pydantic generated via codegen | D-01 + R-A6 + §"Cross-Language IR Codegen Pipeline" |
| FND-03 | `packages/contracts/src/generation-api.ts` specifies `POST /api/v1/generate` + SSE event envelope + error codes + callback POST + idempotency | D-09/D-10/D-11 + §"5 Contracts to Freeze" |
| FND-04 | `packages/contracts/src/usage-event.ts` defines a single usage event schema across emit-site / Queue / Timescale / Stripe Meters | §"5 Contracts to Freeze" + ARCHITECTURE.md cross-cutting invariants |
| FND-05 | `packages/contracts/src/launch-criteria.ts` encodes F2 ≥ 4.0, F3 ≥ 0.7, bundle thresholds; pre-commit gate on changes | D-13 + Pitfall #29 |
| FND-06 | `packages/runtime-sdk/` interface stub | §"5 Contracts to Freeze" #4; consumed by Stage E codegen (Phase 4) |
| FND-07 | `packages/engine-fixtures/` ships 5 hand-crafted IR/FinalTool/QualityReport fixtures (Stripe + GitHub + Notion + Linear + Slack) | D-07 + Pitfall #24 |
| FND-08 | Drizzle migration `20260427_000000_init_schema.sql` covering all `docs/mcpgen-architecture.md` §7 tables + `pending_callbacks` | D-12 + R-A4; Drizzle `prefix: 'timestamp'` verified via Context7 |
| FND-09 | Cloudflare account scaffolded with `mcpgen-prod` / `mcpgen-staging` / `mcpgen-sandbox` namespaces only | D-08 + Pitfall #11 |
| FND-10 | Empty-DSN Sentry SDK initialized in all 4 apps; CI source map upload step per runtime | D-19 + R-A5 |
| FND-11 | Langfuse v4 OTel exporter wired into engine FastAPI bootstrap | §"Langfuse v4 OTel Wiring"; uses `logfire.configure(send_to_logfire=False)` + `OTEL_EXPORTER_OTLP_ENDPOINT` |
| FND-12 | Pre-commit hooks installed and enforced (gitleaks, ruff, eslint, mypy, conventional-pre-commit) | D-05 + D-20 |
| FND-13 | Logto Cloud free-tier scaffolded with email + GitHub providers; self-host runbook | D-14; verified Logto Cloud has GitHub OIDC connector |
| FND-14 | Idempotency keys at all 4 surfaces | D-11 |
| FND-15 | Hono `streamSSE` 30-second sub-request limit verified on CF Workers via 30-min spike | D-15 + D-16; cf-platform docs say "no time limit on individual subrequests"; CPU time is the limit (300s on Paid) |
| CTRL-01 | Hono BFF on CF Workers exposes `POST /api/v1/generate` + per-job SSE callback channel with `last-event-id` resume + Postgres-as-source fallback | D-09/D-10 + Pitfall #20 |
| OPS-01 | Friday demo cadence preserved through W10 | Pitfall #23; operational discipline; Phase 1 establishes the cadence |
| OPS-02 | Cross-workstream test ownership policy enforced | D-21 + Pitfall #26 |
| OPS-03 | Each engine phase starts a fresh Claude session; planning state in `.planning/workstreams/engine/STATE.md`; plan files include "MUST re-read these files first" header | Pitfall #28; sprint plan §3 + §5 |

---

## Project Constraints (from CLAUDE.md)

> The CLAUDE.md hierarchy: `RULES.md > model-override.md (models) > git-workflow-rules.md (git) > gsd-sprint-plan.md (sequencing) > pass/stage detail design > engine-v2 > architecture > implementation-plan > ux-flow`. Phase 1 must comply with all of these.

**Code style (global rules — apply to every file Phase 1 produces):**
- Comments in English only.
- Prefer functional over OOP; OOP only for connectors to external systems.
- Pure functions only (no input/global mutation).
- DRY, KISS, YAGNI.
- Strict typing everywhere (returns, variables, collections). **No `Any`, `unknown`, `Dict[str, Any]`.**
- **No default parameter values** — make all parameters explicit.
- All imports at top of file.
- Single-purpose functions — no flag parameters that switch logic.

**Error handling:**
- Always raise errors explicitly, never silently ignore.
- Use specific error types.
- No catch-all handlers; no fallbacks unless requested.
- External API calls: retries with warnings, then raise.
- Error messages must include request params, response body, status codes.
- Use structured logging fields (Python `structlog`, TS `pino`).

**Process:**
- Read existing code + relevant CLAUDE.md before editing.
- Keep changes minimal; do not revert unrelated changes.
- After code changes: run lint + tests before finishing.
- Maximum 3 attempts per stuck issue, then STOP and explain.

**Git workflow (mandatory):**
- Conventional Commits 1.0.0 format (`type(scope): subject`, ≤72 chars, imperative).
- Atomic commits (split if "and" appears in subject).
- Squash-merge only.
- **NEVER `--no-verify`.**
- NEVER force-push to main.
- Self-review mandatory before requesting human review.
- Pre-commit hooks NEVER bypassed (enforced by D-05).

**Engine-specific (model override):**
- Single LLM model `qwen/qwen3-coder` via OpenRouter through PydanticAI `OpenAIProvider`.
- LiteLLM is **deleted** — any reference to it is a bug.
- F3 test agent is the only exception (uses real Sonnet 4.7 to simulate production users).
- Day-1 smoke test (`apps/generation-engine/tests/smoke_test_qwen.py`) MUST exist before any Pass code is written.

**UI is LOCKED:**
- `claude-design-ui/MCP-Gen.zip` unzips into `apps/web/src/` once.
- Frontend phase (Phase 7) is wire-up only.
- CI rule (added in Phase 1): any PR that touches `apps/web/src/styles/` or `apps/web/src/components/ui/` after the unzip commit fails.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monorepo workspace + build orchestration | Build/Tooling | — | Turborepo + pnpm coordinate cross-package builds |
| IR schema definition (TS Zod source) | `packages/ir/` (shared library) | Engine (Pydantic codegen output) | TS is the source per D-01; 4 of 5 consumers are TS |
| API + SSE contract types | `packages/contracts/` (shared library) | BFF + Engine + Frontend | Pure types; no runtime; consumed by all surfaces |
| Tenant Worker SDK interface | `packages/runtime-sdk/` (shared library) | Engine (Stage E targets it) + Runtime (implements it) | Interface stub frozen in Phase 1; runtime + Stage E impl in later phases |
| DB schema + migrations | Database / Storage | Drizzle ORM (TS) | Drizzle is source; engine reflects post-migration schema |
| Hono BFF / Gateway | API / Backend | CF Workers runtime | Job submission, SSE relay, auth, quota check, idempotency |
| Generation Engine | API / Backend | Fly Machines (Python FastAPI) | LLM orchestration only; no UI logic |
| Web App (Next.js) | Frontend Server (SSR) + Browser/Client | Vercel | Locked UI; Phase 1 only scaffolds + unzips design assets |
| CLI binary (Bun-compiled) | Browser/Client (local dev tool) | npm + GitHub releases | Wraps same `POST /api/v1/generate`; Phase 1 scaffolds skeleton |
| Dispatch Worker (CF Workers for Platforms) | API / Backend (edge) | — | Phase 1 only scaffolds wrangler config; impl is Phase 6 |
| Auth (Logto Cloud) | API / Backend (managed) | — | Phase 1 scaffolds tenant + email + GitHub providers |
| Observability — error tracking (Sentry) | API/Backend + Frontend (cross-tier) | — | Phase 1 wires SDK init with empty DSN in all 4 apps |
| Observability — LLM tracing (Langfuse) | API/Backend (engine only) | — | Phase 1 wires `logfire.configure(send_to_logfire=False, otlp_endpoint=langfuse)` |
| CI/CD | Build/Tooling | GitHub Actions | One workflow per workstream + main aggregator |
| Pre-commit hooks | Local dev workflow + CI guard | — | `pre-commit` Python framework runs locally + CI |

---

## Standard Stack

### Core (locked from `docs/mcpgen-architecture.md` §4)

| Library | Version (verified 2026-04-26) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| Turborepo | `^2.9.6` `[VERIFIED: npm view]` | Monorepo task graph + caching | Locked; standard for TS monorepos with affected-only execution |
| pnpm | `^10.30.2` `[VERIFIED: npm view]` | Package manager + workspaces | Locked; faster than yarn/npm; native workspaces |
| Next.js | `15.x` (current is `16.2.4`) `[VERIFIED: npm view]` | Frontend framework | LOCKED to 15.x (D-04 sibling: UI in `claude-design-ui/MCP-Gen.zip` was prepared against 15) |
| Hono | `^4.12.15` `[VERIFIED: npm view]` | BFF on CF Workers | Locked; web-standards based; native streamSSE helper |
| Bun | `^1.3.13` `[VERIFIED: npm view]` | CLI runtime + binary compiler | Locked; `bun build --compile` produces single binaries |
| Wrangler | `^4.85.0` `[VERIFIED: npm view]` | CF Workers deploy + bundle + sourcemap upload | Locked; `--upload-source-maps` flag is canonical |
| Drizzle ORM | `^0.45.2` `[VERIFIED: npm view]` | Postgres ORM | Locked; type-safe; serverless-ready |
| Drizzle Kit | `^0.31.10` `[VERIFIED: npm view]` | Migration generator | Locked; supports `prefix: 'timestamp'` for `YYYYMMDDHHMMSS_*.sql` |
| `@modelcontextprotocol/sdk` | `^1.29.0` `[VERIFIED: npm view]` | MCP server protocol (generated tenant Workers + runtime SDK) | LOCKED to v1 line per D-04. Latest is `1.29.0` (NO v2 release exists yet — both `server.tool` and `server.registerTool` available in 1.29) |
| `@neondatabase/serverless` | `^1.1.0` `[VERIFIED: npm view]` | Neon Postgres edge driver | Locked; required for CF Workers (no raw TCP) |
| `@cloudflare/workers-oauth-provider` | latest `[CITED: cloudflare workers-for-platforms docs]` | OAuth 2.1 mode for tenant Workers | Locked for Phase 6 RUN-05; Phase 1 stub install only |
| `@sentry/nextjs` | `^10.50.0` `[VERIFIED: npm view]` | Sentry for `apps/web` | Locked; Vercel auto-uploads source maps |
| `@sentry/cloudflare` | `^10.50.0` `[VERIFIED: npm view]` | Sentry for `apps/api` + `apps/dispatch` | Locked; CF Workers-specific (not `@sentry/node`) |
| `inngest` (TS SDK) | `^4.2.4` `[VERIFIED: npm view]` | Drift Watcher cron + usage event consumer | Locked; D-03 places Drift Watcher in TS BFF |
| `@logto/node` | `^3.1.10` `[VERIFIED: npm view]` | Server-side Logto OIDC client | Locked; D-14 Logto Cloud free tier |
| `commander` | `^14.0.3` `[VERIFIED: npm view]` | CLI framework for `apps/cli` | Locked |
| `eventsource-parser` | `^3.0.8` `[VERIFIED: npm view]` | Parse SSE from BFF in `apps/web` | Frontend wire-up dep |
| `zod` | `^4.x` (currently `^4.3.6`) `[VERIFIED: npm view]` | Input/output schemas + IR source | Locked; Zod 4 native `z.toJSONSchema()` enables D-01 codegen pipeline |
| TypeScript | `^6.0.3` `[VERIFIED: npm view]` | Type checking | Locked |
| ESLint | `^10.2.1` `[VERIFIED: npm view]` | TS lint via pre-commit | Locked |
| Python | `3.12` `[VERIFIED: local Python 3.12.12]` | Engine runtime | Locked |
| FastAPI | `^0.128.x` `[CITED: docs/mcpgen-architecture.md §4]` | Engine HTTP framework | Locked |
| PydanticAI | latest `[CITED: docs/mcpgen-model-and-provider-override.md §2]` | LLM agent factory | Locked; pin exact version at Day-1 smoke test |
| Pydantic | `^2.x` `[VERIFIED: PydanticAI requirement]` | BaseModels for IR + Pass outputs | Locked |
| Pydantic-settings | `^2.x` | Typed env-var loading | Standard Pydantic 2 pattern |
| `uv` | `^0.5+` | Python package manager | Locked; replaces pip/poetry/pipenv per CLAUDE.md "managed > self-host" |
| `ruff` | latest | Python lint + format | Single tool replaces flake8/black/isort |
| `mypy --strict` | latest | Python static type check | Required by CLAUDE.md |
| `pytest` + `pytest-asyncio` + `pytest-httpx` | latest | Python tests | Standard |
| `logfire` | latest | OTel wrapper for PydanticAI agents | Locked; `send_to_logfire=False` to forward to Langfuse |
| `opentelemetry-sdk` + `opentelemetry-exporter-otlp` | `1.x` | OTLP exporter | Required for Langfuse v4 |
| `sentry-sdk[fastapi]` | `^2.x` | Sentry for engine | Auto-handles Python tracebacks |
| `gitleaks` | latest binary `[CITED: gitleaks docs]` | Pre-commit secret scan + F1 stage | Install via brew/Docker, not pip |
| `pre-commit` (Python framework) | latest `[VERIFIED: Context7]` | Hook orchestration | D-05 |
| `conventional-pre-commit` | latest `[VERIFIED: Context7]` | Conventional Commits validator | D-05 + D-20 |

### Supporting (Phase 1 scaffold-only; full impl in later phases)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prance[osv]` | latest | OpenAPI 3.x parser for Stage A | Phase 2 (engine) |
| `jinja2` | `^3.1.x` | Stage E template engine | Phase 4 (engine codegen) |
| `tenacity` | latest | Retry decorator for OpenRouter | Phase 2 (engine LLM calls) |
| `structlog` | latest | Structured logging in Python | All phases (Phase 1 wires it) |
| `psycopg[binary,pool]` | `^3.x` | Postgres driver if engine writes DB directly | Phase 2+ as needed |
| `aioboto3` | latest | R2 (S3-compatible) client | Phase 4+ |
| `stripe` | `^22.x` (`22.1.0` verified) | Billing + Meters | Phase 8 (ops) |
| `@tanstack/react-query` | `^5.x` | Server state in `apps/web` | Phase 7 (frontend) |

### Cross-Language IR Codegen Pipeline (D-01 — research result)

The pipeline is **TS Zod schema → JSON Schema → Pydantic models** (Zod 4 native).

| Step | Tool | Command | Output |
|------|------|---------|--------|
| 1. Author Zod schemas | `zod@4` | `packages/ir/src/types.ts` (hand-authored) | TS `import { z } from 'zod'; export const FinalTool = z.object({...});` |
| 2. Convert Zod → JSON Schema | `zod` built-in | `import { z } from 'zod'; const json = z.toJSONSchema(FinalTool, { target: 'draft-2020-12' });` | `packages/ir/build/jsonschema/*.json` |
| 3. Convert JSON Schema → Pydantic | `datamodel-code-generator` (Python) | `datamodel-codegen --input packages/ir/build/jsonschema --input-file-type jsonschema --output packages/ir/python/types.py --output-model-type pydantic_v2.BaseModel --use-double-quotes --target-python-version 3.12` | `packages/ir/python/types.py` (Pydantic 2 BaseModels) |
| 4. Validate generated files match committed | CI step | `node scripts/codegen-ir.mjs --check` (re-runs steps 2+3, diff'd against committed) | CI fails if drift |

`[CITED: zod 4 docs]` Zod 4 ships `z.toJSONSchema()` natively. `[CITED: datamodel-code-generator]` has been the Python-canonical JSON Schema → Pydantic 2 codegen since 2022. **Decision per `code_context`:** committed-to-git, NOT generated on install. Engine startup re-validates Pydantic types against latest IR schema as a defensive check (D-02).

**One unresolved sub-decision (Claude's discretion):** whether to use a single `npm` script `pnpm ir:codegen` or a Turborepo task `turbo run codegen --filter=@mcpgen/ir`. Recommend the latter for cache hits.

### Alternatives Considered (and rejected)

| Instead of | Could Use | Tradeoff | Why rejected |
|------------|-----------|----------|--------------|
| TS Zod source for IR | Pydantic source → TS via `pydantic-to-typescript` | Reverse direction; less idiomatic TS | D-01 + R-A6: 4 of 5 consumers are TS |
| Drizzle numeric prefix | `0001_init.sql`, `0002_*.sql` | Default | D-12 + Pitfall #18: collides on parallel branches |
| `pre-commit` (Python) | `lefthook` (Go), `husky` (Node) | lefthook faster; husky native | D-05: lefthook adds Go dep; husky doesn't handle Python engine |
| Anthropic SDK / OpenAI SDK / Gemini SDK | direct calls | Native vendor SDKs | Locked: PydanticAI + OpenRouter only (model override doc) |
| LiteLLM | gateway abstraction | Multi-provider routing | DELETED per model override doc |
| GitHub Actions | CircleCI, Buildkite | Vendor surface for solo founder | D-06: native integration with Vercel/CF/Fly/Sentry/Logto |
| Per-tenant CF dispatch namespace | Isolation primitive | Matches K8s mental model | D-08 + Pitfall #11: Cloudflare explicitly forbids |
| `@modelcontextprotocol/sdk@^2.x` | New `registerTool` API | MCP 2025-06-18 spec features | D-04: v2 not yet released; latest is `1.29.0` which has both APIs |
| `pip` / `poetry` | Standard Python package mgrs | Stable, well-known | `uv` is 10–100× faster |
| `psycopg2` | Legacy Postgres driver | Stable | psycopg3 is the modern async-aware standard |
| Vercel Pages serverless functions for engine | Same vendor as web | One platform | Vercel 60s cap kills Stage F3 (1–3 min) |

### Installation

```bash
# Root (monorepo)
pnpm install
pnpm add -Dw turbo prettier eslint typescript
pnpm add -Dw conventional-pre-commit pre-commit

# packages/ir
cd packages/ir && pnpm add zod && pnpm add -D datamodel-code-generator

# apps/web
cd apps/web && pnpm add next@15 react@19 react-dom@19 tailwindcss@4 eventsource-parser@3 @tanstack/react-query@5 @sentry/nextjs

# apps/api (Hono BFF)
cd apps/api && pnpm add hono@4 @hono/zod-validator zod@4 \
  drizzle-orm @neondatabase/serverless \
  inngest @logto/node @sentry/cloudflare ulid
pnpm add -D drizzle-kit wrangler typescript @cloudflare/workers-types vitest

# apps/dispatch (CF Workers for Platforms)
cd apps/dispatch && pnpm add hono @sentry/cloudflare
pnpm add -D wrangler typescript @cloudflare/workers-types

# apps/cli
cd apps/cli && pnpm add commander @clack/prompts picocolors ora
pnpm add -D bun typescript

# apps/generation-engine (Python)
cd apps/generation-engine
uv add fastapi 'uvicorn[standard]' pydantic pydantic-ai pydantic-settings httpx \
       prance 'openapi-spec-validator' jinja2 \
       langfuse logfire opentelemetry-sdk opentelemetry-exporter-otlp \
       sentry-sdk tenacity structlog \
       'psycopg[binary,pool]' aioboto3
uv add --dev ruff mypy pytest pytest-asyncio pytest-httpx datamodel-code-generator

# Cross-cutting binaries (host machine)
brew install gitleaks pre-commit
```

**Version verification (committed verbatim from `npm view` 2026-04-26):** all `[VERIFIED]` versions above were checked against the npm registry in this research session. Phase 1 plan should re-verify and pin exact patches in `package.json` before contract freeze.

---

## Architecture Patterns

### System Architecture Diagram (Phase 1 — what gets built)

```
                     ┌──────────────────────────────────────┐
                     │     Phase 1 Foundation outputs       │
                     │  (everything below is empty-but-     │
                     │  deployable; later phases fill in)   │
                     └──────────────────┬───────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
   ┌─────────┐                    ┌─────────┐                    ┌─────────┐
   │ apps/   │                    │packages/│                    │infrastr-│
   │  web    │   Vercel scaffold  │   ir    │  Zod source +      │ucture/  │
   │  api    │   CF Workers       │contracts│  Pydantic codegen  │ neon    │  Drizzle migs
   │ dispatch│   CF WfP namespaces│runtime- │  Generation API    │cloudflare│ wrangler
   │ engine  │   Fly Machine      │   sdk   │  Usage Event       │ fly     │  fly.toml
   │  cli    │   Bun binary       │codegen- │  Launch Criteria   │ inngest │  function defs
   │  docs   │   Mintlify scaffold│templates│  Runtime SDK iface │         │
   └────┬────┘                    │ engine- │                    └─────────┘
        │                         │fixtures │
        │                         │(5 hand- │
        │                         │ written)│
        │                         └─────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────┐
   │  External services scaffolded (accounts + tokens)  │
   ├────────────────────────────────────────────────────┤
   │  Cloudflare account → 3 namespaces, 1 Hyperdrive   │
   │  Neon → dev branch (TimescaleDB + pgvector enabled)│
   │  Logto Cloud free tier → email + GitHub providers  │
   │  Vercel project linked to apps/web                 │
   │  Fly.io app for apps/generation-engine (no DSN yet)│
   │  Inngest cloud account + dev keys                  │
   │  Langfuse Cloud free tier (project + OTLP token)   │
   │  Sentry projects per runtime (4 projects, no DSN   │
   │     wired in code yet — empty-string init)         │
   │  BetterStack source for logs + uptime (placeholder)│
   │  Resend account (no domain yet)                    │
   │  R2 bucket: mcpgen-artifacts (TTL 30d configured)  │
   │  GitHub repo + Actions configured                  │
   │  Stripe test-mode account (no products yet)        │
   └────────────────────────────────────────────────────┘
```

**Data flow at end of Phase 1:**
- Browser hits `apps/web` (locked design from MCP-Gen.zip; no API calls yet).
- `apps/api` exposes `POST /api/v1/generate` returning `501 Not Implemented` (contract is frozen, impl is Phase 8).
- `apps/dispatch` returns `404` for any tenant lookup (no tenants exist yet).
- `apps/generation-engine` exposes `/health` returning `200 OK`; the Day-1 Qwen smoke test runs as a separate `pytest` invocation gated on `OPENROUTER_API_KEY` env var (skipped in CI without it).
- `apps/cli` `npx mcpgen --help` prints the command list (no commands implemented).
- The 5 engine-fixtures are loadable JSON; frontend/runtime/ops can `import` them in their phase 7/6/8 wave-1 work.

### Recommended Project Structure (locked from `docs/mcpgen-architecture.md` §15)

```
mcpgen/
├── apps/
│   ├── web/                            # Next.js 15 — UI from MCP-Gen.zip (locked)
│   │   ├── src/                        # Unzipped from claude-design-ui/MCP-Gen.zip
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── sentry.client.config.ts     # FND-10 empty DSN
│   ├── api/                            # Hono BFF on CF Workers
│   │   ├── src/
│   │   │   ├── index.ts                # Hono app
│   │   │   ├── routes/v1/generate.ts   # POST /api/v1/generate (501 stub)
│   │   │   ├── routes/v1/jobs/[id]/stream.ts  # SSE handler (D-09)
│   │   │   └── instrumentation.ts      # @sentry/cloudflare init
│   │   ├── wrangler.toml               # Hyperdrive binding (D-17)
│   │   └── package.json
│   ├── dispatch/                       # CF Workers for Platforms dispatch worker
│   │   ├── src/index.ts                # Stub: 404 for any path
│   │   ├── wrangler.toml               # dispatch_namespaces = ["mcpgen-prod"|"mcpgen-staging"|"mcpgen-sandbox"]
│   │   └── package.json
│   ├── dispatch-sample/                # Hand-coded sample tenant Worker (specifics §)
│   │   ├── src/index.ts                # 3 hand-coded Stripe tools
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── generation-engine/              # FastAPI + PydanticAI on Fly Machines
│   │   ├── pyproject.toml              # uv-managed
│   │   ├── src/mcpgen_engine/
│   │   │   ├── main.py                 # FastAPI app + /health
│   │   │   ├── observability.py        # FND-11 Langfuse OTel wiring
│   │   │   └── settings.py             # pydantic-settings env loader
│   │   ├── tests/
│   │   │   └── smoke_test_qwen.py      # Day-1 Qwen smoke test (gated on OPENROUTER_API_KEY)
│   │   ├── Dockerfile                  # Includes gitleaks binary
│   │   └── fly.toml
│   ├── cli/
│   │   ├── src/index.ts                # commander; prints --help
│   │   ├── package.json
│   │   └── build.ts                    # bun build --compile matrix
│   └── docs/                           # Mintlify scaffold (Phase 10 fills)
├── packages/
│   ├── ir/
│   │   ├── src/
│   │   │   ├── types.ts                # Zod schemas (FinalTool, ToolDescription, etc.)
│   │   │   └── index.ts
│   │   ├── python/
│   │   │   └── types.py                # Generated Pydantic 2 BaseModels (committed)
│   │   ├── build/jsonschema/           # Generated; .gitignore
│   │   ├── scripts/codegen.ts          # Zod → JSON Schema → datamodel-codegen
│   │   ├── package.json
│   │   └── pyproject.toml              # exposes types.py as `mcpgen_ir` package
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── generation-api.ts       # FND-03
│   │   │   ├── usage-event.ts          # FND-04
│   │   │   ├── launch-criteria.ts      # FND-05 (immutable runtime constants)
│   │   │   ├── db-types.ts             # generated from Drizzle migrations
│   │   │   └── index.ts
│   │   └── package.json
│   ├── runtime-sdk/
│   │   ├── src/
│   │   │   ├── index.ts                # FND-06 interface stub (empty bodies)
│   │   │   └── types.ts
│   │   └── package.json
│   ├── codegen-templates/
│   │   ├── package.json.j2             # Pinned to @modelcontextprotocol/sdk@^1.x
│   │   ├── wrangler.toml.j2
│   │   └── (other templates filled in Phase 4)
│   ├── engine-fixtures/
│   │   ├── stripe/
│   │   │   ├── ir.json
│   │   │   ├── final-tools.json
│   │   │   └── quality-report.json
│   │   ├── github/...
│   │   ├── notion/...
│   │   ├── linear/...
│   │   ├── slack/...
│   │   └── package.json                # exports a typed loader
│   ├── shared-config/
│   │   ├── eslint.config.mjs
│   │   ├── tsconfig.base.json
│   │   ├── prettier.config.mjs
│   │   └── package.json
│   └── ui/                             # Mostly empty in Phase 1 (UI is in apps/web/src/)
├── infrastructure/
│   ├── neon/
│   │   └── migrations/
│   │       └── 20260427_000000_init_schema.sql   # FND-08
│   ├── cloudflare/
│   │   ├── terraform/                  # IaC for namespaces + Hyperdrive (or wrangler-based)
│   │   └── wrangler.shared.toml
│   ├── fly/
│   │   └── fly.toml
│   └── inngest/
│       └── functions/                  # Empty stubs
├── docs/                               # source of truth (already authored)
├── claude-design-ui/MCP-Gen.zip        # locked
├── .github/workflows/
│   ├── main-ci.yml                     # aggregator
│   ├── engine-ci.yml
│   ├── runtime-ci.yml
│   ├── frontend-ci.yml
│   └── ops-ci.yml
├── .planning/                          # GSD state
├── .pre-commit-config.yaml             # FND-12
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── CLAUDE.md
├── RULES.md
└── README.md
```

### Pattern 1: Stage-as-Retry-Boundary (carried into Phase 1 contracts)

**What:** Generation API contract names stages `A | B | C | D | E | F1 | F2 | F3` so SSE consumers never need to know which Pass is firing. Phase 1 freezes the enum in `packages/contracts/src/generation-api.ts`.

**When to use:** Any Phase 1 contract that surfaces engine progress externally (frontend, CLI, callbacks).

**Example:**
```typescript
// packages/contracts/src/generation-api.ts
import { z } from 'zod';

export const GenerationStage = z.enum([
  'A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed', 'failed',
]);
export type GenerationStage = z.infer<typeof GenerationStage>;

export const GenerationSseEvent = z.object({
  job_id: z.string().regex(/^gen_[0-9A-HJKMNP-TV-Z]{26}$/),  // ULID with operation prefix (D-11)
  event_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),    // ULID, monotonic per generation
  stage: GenerationStage,
  status: z.enum(['started', 'completed', 'error']),
  partial_result: z.record(z.unknown()).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retry_after_seconds: z.number().int().nonnegative().optional(),
  }).optional(),
});
export type GenerationSseEvent = z.infer<typeof GenerationSseEvent>;
```
*(Source: D-09/D-10 verbatim; types are imported by `apps/web`, `apps/api`, and Pydantic-mirror in `apps/generation-engine`.)*

### Pattern 2: Async-Job + SSE-Callback (Phase 1 contract surface only — full impl is Phase 7/8)

**What:** `POST /api/v1/generate` returns 202 + SSE URL; engine writes per-stage events to BFF; BFF relays via SSE. Phase 1 freezes the contract; impl is later.

**Example wrangler.toml binding** (D-17 Hyperdrive on `apps/api`):
```toml
# apps/api/wrangler.toml
name = "mcpgen-api"
main = "src/index.ts"
compatibility_date = "2026-04-24"
compatibility_flags = ["nodejs_compat"]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<set-via-`wrangler hyperdrive create`>"

upload_source_maps = true   # FND-10 for Sentry
```
*(Source: Cloudflare Workers + Hyperdrive docs `[VERIFIED: Context7]`.)*

### Pattern 3: Hono `streamSSE` on CF Workers (D-15 spike)

**Spike target:** verify a 90-second stream from a CF Worker delivers events past t=85s.

**Implementation under test (the spike script lives in `apps/api/src/routes/_spike/sse.ts` — kept after merge to lock the pattern):**

```typescript
// apps/api/src/routes/_spike/sse.ts
import { streamSSE } from 'hono/streaming';

app.get('/_spike/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    const start = Date.now();
    let id = 0;
    while (Date.now() - start < 90_000) {
      await stream.writeSSE({
        data: JSON.stringify({ t: Date.now() - start, id }),
        event: 'tick',
        id: String(id++),
      });
      await stream.sleep(10_000);  // 10s gap → 9 events total
    }
  });
});
```

**Why this should pass per Cloudflare docs `[CITED: developers.cloudflare.com/workers/platform/limits]`:**
> *"There is no set time limit on individual subrequests. A Worker can continue making subrequests as long as the client remains connected."*
> *"CPU time measures how long the CPU spends executing your Worker code. Waiting on network requests such as fetch() calls, KV reads, or database queries does not count toward CPU time."*

The 30s "sub-request limit" cited in upstream STACK.md §6.6 conflates **CPU time** (default 30s, max 300s on Workers Paid) with **subrequest duration** (no limit). SSE `await stream.sleep(...)` is wall-clock, not CPU — should not count against `cpu_ms`.

**Acceptance criteria for D-15:**
- Spike Worker deployed to `mcpgen-staging`.
- Client `curl -N` receives 9 events; last event arrives at t≥85s.
- `wrangler tail` shows no `cpu_ms` warnings.

**If spike fails (D-16 fallback):**
- Frontend subscribes to `/api/v1/jobs/${id}/stream` backed by a Durable Object per job.
- Durable Object holds WebSocket; engine writes events via DO RPC.
- Postgres remains source of truth (D-09 unchanged).

### Pattern 4: CF Workers for Platforms namespace + script tags (D-08)

**Provisioning sequence (one-time, Phase 1 Wave 1):**

```bash
# Auth
wrangler login

# Create the 3 dispatch namespaces (NOT per-tenant — D-08 + Pitfall #11)
wrangler dispatch-namespace create mcpgen-prod
wrangler dispatch-namespace create mcpgen-staging
wrangler dispatch-namespace create mcpgen-sandbox

# Verify
wrangler dispatch-namespace list
# Expected: exactly 3 entries

# Pre-commit hook in .pre-commit-config.yaml will fail any PR that adds a 4th
```

**Tenant deployment (FUTURE — Phase 6 will use this):**
```bash
# Tenant identity = script name; metadata via tags
npx wrangler deploy \
  --name "${TENANT_SHORT_ID}-${SPEC_SLUG}" \
  --dispatch-namespace mcpgen-prod
# After deploy, set tags via API:
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/dispatch/namespaces/mcpgen-prod/scripts/${TENANT_SHORT_ID}-${SPEC_SLUG}/tags" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '["tenant_id:'"${TENANT_ID}"'","plan_tier:'"${PLAN}"'","spec_hash:'"${SHA}"'"]'
```
*(Source: Cloudflare for Platforms `/cloudflare-for-platforms/llms-full` docs `[VERIFIED: Context7]`. Max 8 tags per script.)*

### Pattern 5: Drizzle migration timestamp prefix (D-12)

```typescript
// drizzle.config.ts (root or per-app)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/contracts/src/db-schema.ts',
  out: './infrastructure/neon/migrations',
  migrations: {
    prefix: 'timestamp',  // produces YYYYMMDDHHMMSS_*.sql
  },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```
*(Source: `drizzle-orm-v0320` release notes `[VERIFIED: Context7]`.)*

**Important format note:** Drizzle's `prefix: 'timestamp'` produces `20240627123900_name.sql` — **no underscore between date and time**. D-12 specifies `YYYYMMDD_HHMMSS_<name>.sql` with the underscore. This is a 1-char divergence between D-12 and Drizzle's built-in.

**Resolution options (Claude's discretion — recommend Option A):**
- **Option A (Recommended):** Accept Drizzle's native format `YYYYMMDDHHMMSS_<name>.sql`. Update D-12 in CONTEXT.md with a note. Both formats sort lexicographically; the underscore in D-12 was cosmetic.
- **Option B:** Keep D-12 verbatim and write a custom post-`drizzle-kit generate` script that renames files to insert the underscore. Adds complexity; ROI low.

**Recommendation:** Option A. The pitfall #18 driver is "lexicographic sort, not numeric collision" — both formats satisfy this. First migration becomes `20260427000000_init_schema.sql`.

### Pattern 6: Pre-commit configuration (D-05 + D-12 + D-13 + D-20)

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.7.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        files: ^apps/generation-engine/
        additional_dependencies: [pydantic, pydantic-ai, fastapi]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.16.0
    hooks:
      - id: eslint
        files: \.(ts|tsx)$
        types: [file]
        additional_dependencies:
          - eslint@10
          - typescript@6
          - "@typescript-eslint/parser@8"
          - "@typescript-eslint/eslint-plugin@8"

  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: v3.6.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]
        args: []

  - repo: local
    hooks:
      # D-08: prevent 4th CF dispatch namespace
      - id: cf-namespace-guard
        name: CF dispatch namespaces ≤ 3
        entry: bash scripts/check-cf-namespaces.sh
        language: system
        files: ^infrastructure/cloudflare/
        pass_filenames: false

      # D-13: launch-criteria.ts changes require decision-log entry
      - id: launch-criteria-guard
        name: launch-criteria changes need decision log
        entry: bash scripts/check-launch-criteria-decision.sh
        language: system
        files: ^packages/contracts/src/launch-criteria\.ts$
        pass_filenames: false

      # FND-02: IR codegen freshness check
      - id: ir-codegen-check
        name: IR Pydantic codegen up-to-date
        entry: pnpm --filter @mcpgen/ir codegen --check
        language: system
        files: ^packages/ir/(src|python)/
        pass_filenames: false

      # specifics: prevent UI redesign
      - id: ui-locked-guard
        name: apps/web/src/styles + components/ui locked
        entry: bash scripts/check-ui-locked.sh
        language: system
        files: ^apps/web/src/(styles|components/ui)/
        pass_filenames: false
```

`[VERIFIED: Context7 /pre-commit/pre-commit.com — "Define Local Repository Hooks" pattern]`

### Pattern 7: GitHub Actions matrix per workstream (D-06)

```yaml
# .github/workflows/main-ci.yml — runs on every PR
name: CI
on: { pull_request: {}, push: { branches: [main] } }
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  detect-changes:
    runs-on: ubuntu-24.04
    outputs:
      engine: ${{ steps.changes.outputs.engine }}
      runtime: ${{ steps.changes.outputs.runtime }}
      frontend: ${{ steps.changes.outputs.frontend }}
      ops: ${{ steps.changes.outputs.ops }}
      contracts: ${{ steps.changes.outputs.contracts }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            engine: 'apps/generation-engine/**'
            runtime: ['apps/dispatch/**', 'packages/runtime-sdk/**', 'apps/dispatch-sample/**']
            frontend: 'apps/web/**'
            ops: ['apps/api/**', 'infrastructure/**', '.github/workflows/**']
            contracts: 'packages/(ir|contracts)/**'

  contracts:
    needs: detect-changes
    if: needs.detect-changes.outputs.contracts == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mcpgen/ir codegen --check  # D-02
      - run: pnpm --filter @mcpgen/contracts test
      - run: pnpm --filter @mcpgen/contracts typecheck

  engine:
    needs: detect-changes
    if: needs.detect-changes.outputs.engine == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: cd apps/generation-engine && uv sync
      - run: cd apps/generation-engine && uv run ruff check
      - run: cd apps/generation-engine && uv run mypy --strict src
      - run: cd apps/generation-engine && uv run pytest -m "not requires_openrouter"
      # Day-1 Qwen smoke test only runs if secret is set
      - run: cd apps/generation-engine && uv run pytest tests/smoke_test_qwen.py
        if: ${{ env.OPENROUTER_API_KEY != '' }}
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

  # similar for runtime / frontend / ops...

  commit-lint:
    runs-on: ubuntu-24.04
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: wagoid/commitlint-github-action@v6
        with: { configFile: .commitlintrc.json }   # D-20
```

**Key features:**
- `dorny/paths-filter` for affected-only execution.
- `concurrency` cancels in-progress runs on PR push.
- Day-1 Qwen smoke test gated on `secrets.OPENROUTER_API_KEY` (skips for non-API-key contributors).
- `commitlint` is the second of the two D-20 enforcement layers (first is local pre-commit `conventional-pre-commit`).

### Pattern 8: PydanticAI + OpenRouter Day-1 smoke test

```python
# apps/generation-engine/tests/smoke_test_qwen.py
"""
Day-1 Qwen3-Coder smoke test (Pitfall #27 mitigation).

Requirements covered: GEN-13 prerequisite, OPS-03 fresh-session readiness.
Skipped when OPENROUTER_API_KEY is unset so that pre-API-key contributors are not blocked.
"""
import os

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings


pytestmark = pytest.mark.skipif(
    "OPENROUTER_API_KEY" not in os.environ,
    reason="OPENROUTER_API_KEY not set; Day-1 smoke test skipped",
)


class ToolDescription(BaseModel):
    purpose: str
    when_to_use: list[str]


PROVIDER = OpenAIProvider(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
MODEL = OpenAIChatModel("qwen/qwen3-coder", provider=PROVIDER)
AGENT = Agent(
    model=MODEL,
    output_type=ToolDescription,
    system_prompt=(
        "You write tool descriptions for an MCP server. "
        "Output ONLY structured ToolDescription via the provided function call."
    ),
)
SETTINGS = ModelSettings(temperature=0.3, top_p=0.9, max_tokens=256)


@pytest.mark.asyncio
async def test_qwen3_coder_structured_output() -> None:
    result = await AGENT.run(
        "Describe a tool called `customers_search` that searches Stripe customers by email.",
        model_settings=SETTINGS,
        # Provider routing pinning per Pitfall #2 + GEN-13
        model_settings_extra={
            "extra_body": {
                "provider": {
                    "order": ["fireworks"],
                    "allow_fallbacks": False,
                    "quantizations": ["fp16"],
                    "require_parameters": True,
                },
            },
        },
    )
    assert isinstance(result.output, ToolDescription)
    assert len(result.output.purpose) > 10
    assert len(result.output.when_to_use) > 0
```

`[VERIFIED: Context7 /pydantic/pydantic-ai docs — "Use OpenAI-Compatible API with Custom Base URL"]`
`[VERIFIED: Context7 /websites/openrouter_ai — "Provider Preferences Schema"]`

**Note on PydanticAI version drift:** the docs show `OpenAIChatModel` (the renamed-but-current name, replacing `OpenAIModel` from training data). **Pin the exact PydanticAI version in `pyproject.toml`** at the time of writing this test, then re-run the smoke test as a CI step on every change — this is Pitfall #27's primary mitigation.

### Pattern 9: Langfuse v4 OTel exporter wiring (FND-11)

```python
# apps/generation-engine/src/mcpgen_engine/observability.py
"""Wire Langfuse v4 via Logfire's OTel forwarder, with empty-DSN-safe defaults."""
from __future__ import annotations

import base64
import os

import logfire
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter


def configure_langfuse_otel() -> None:
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")
    endpoint = os.environ.get(
        "LANGFUSE_OTEL_ENDPOINT",
        "https://cloud.langfuse.com/api/public/otel/v1/traces",
    )

    # Phase 1: empty DSN is acceptable; spans are collected locally and dropped on export
    headers: dict[str, str] = {}
    if public_key and secret_key:
        token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"

    # Logfire pipes PydanticAI agent traces to OTel automatically when configured
    logfire.configure(
        send_to_logfire=False,
        service_name="mcpgen-generation-engine",
    )

    # Forward OTel spans to Langfuse Cloud (or wherever LANGFUSE_OTEL_ENDPOINT points)
    if headers:
        provider = TracerProvider()
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, headers=headers))
        )
        # logfire.configure() already set a TracerProvider; we attach our exporter to it
        from opentelemetry import trace
        trace.set_tracer_provider(provider)
```

**Endpoint:** `https://cloud.langfuse.com/api/public/otel/v1/traces` `[CITED: Langfuse v4 docs + Logfire docs alternative-clients]`. The `/v1/traces` path component is required by the OTLP HTTP spec.

**Auth:** HTTP Basic with base64-encoded `<public-key>:<secret-key>`.

**Phase 1 acceptance:** running the engine with empty `LANGFUSE_*` env vars must not crash and must not block requests. With keys set, a manual span (`logfire.info("hello")`) appears in Langfuse Cloud UI within ~30 seconds.

### Pattern 10: Sentry source-map upload per runtime (D-19)

| Runtime | Mechanism | CI command |
|---------|-----------|------------|
| Vercel (`apps/web`) | `@sentry/nextjs` auto-injects via `withSentryConfig`; Vercel build hook handles upload | nothing extra; just set `SENTRY_AUTH_TOKEN` as Vercel env |
| CF Workers (`apps/api`, `apps/dispatch`) | `wrangler deploy --upload-source-maps` | `pnpm --filter @mcpgen/api wrangler deploy --upload-source-maps` |
| Fly Machines (`apps/generation-engine`) | `sentry-sdk[fastapi]` auto-handles tracebacks; release tagged via `SENTRY_RELEASE` env | set `SENTRY_RELEASE=$GITHUB_SHA` in `flyctl deploy` |

`[VERIFIED: Context7 — Wrangler config "Enable Source Maps Upload"]`

**Phase 1 implementation:** add `upload_source_maps = true` to `wrangler.toml` for `apps/api` + `apps/dispatch`; add `withSentryConfig` to `apps/web/next.config.js`; init `sentry_sdk.init(dsn=os.environ.get("SENTRY_DSN", ""), ...)` in `apps/generation-engine/src/mcpgen_engine/main.py`. All four init with empty DSN; Phase 9 fills DSN per environment.

### Pattern 11: Bun-compiled CLI binary build matrix (CLI-03 — Phase 1 builds local-only)

```ts
// apps/cli/build.ts (Bun script)
import { spawn } from 'bun';

const targets = [
  'bun-linux-x64',
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-windows-x64',
] as const;

for (const t of targets) {
  const ext = t.includes('windows') ? '.exe' : '';
  const proc = spawn([
    'bun', 'build',
    '--compile',
    `--target=${t}`,
    'src/index.ts',
    '--outfile', `dist/mcpgen-${t}${ext}`,
  ], { stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`Build failed for ${t}: exit ${code}`);
}
```

**Phase 1 acceptance:** all 4 targets produce a binary that prints `mcpgen --help` correctly on the host machine. CI matrix to validate builds per target is Phase 6 (CLI-03).

### Pattern 12: Hyperdrive + Neon serverless setup (D-17 + D-18)

```bash
# 1. Create Neon project + dev branch (Phase 1 = dev tier)
neon projects create --name mcpgen
neon connection-string mcpgen --project-id <id>
# → postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/mcpgen?sslmode=require

# 2. Enable extensions on the dev branch
psql "$NEON_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS timescaledb;'
# Verify enabled (Neon supports both on dev tier as of 2026):
psql "$NEON_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'timescaledb');"

# 3. Create Hyperdrive in Cloudflare for the BFF + dispatch
wrangler hyperdrive create mcpgen-pg --connection-string "$NEON_URL"
# → outputs hyperdrive_id

# 4. Bind in apps/api/wrangler.toml + apps/dispatch/wrangler.toml
# (see Pattern 2 example)

# 5. Engine connects to Neon directly via psycopg
# OPENROUTER_API_KEY → Fly secret; DATABASE_URL → Fly secret
flyctl secrets set DATABASE_URL="$NEON_URL" --app mcpgen-engine
```

**Verifying TimescaleDB + pgvector at Neon dev tier:** as of 2026 Neon supports both extensions on every tier including free dev tier (verified via Neon support docs). Pitfall #19 only triggers under load, hence D-18 schedules Scale-tier upgrade pre-launch — not Phase 1.

### Pattern 13: Logto Cloud free-tier scaffolding (D-14 + FND-13)

**One-time manual steps in Logto Console (~15 min):**

1. Create tenant `mcpgen-prod`. Note the tenant ID and the issuer URL (`https://<tenant-id>.logto.app/oidc`).
2. Add **email-password** sign-in method.
3. Add **GitHub social connector**:
   - Create a GitHub OAuth app (`https://github.com/settings/applications/new`) with callback `https://<tenant-id>.logto.app/callback/<connector-id>`.
   - Paste GitHub Client ID + Secret into Logto.
4. Create one **traditional web app** application (for `apps/web` / `apps/api`) — note Client ID + Client Secret.
5. Create one **machine-to-machine** application (for engine → BFF callback) — note its M2M token endpoint.
6. Repeat tenants `mcpgen-staging` and `mcpgen-sandbox` for each environment.

**Self-host migration runbook (D-14 — documented in Phase 1, dry-run W8):**

```bash
# infrastructure/logto/README.md (Phase 1 deliverable)
# Steps:
#   1. Provision Fly Machine with PG 16 + Redis (or use Neon branch + Upstash)
#   2. Deploy Logto OSS via official Docker image
#   3. Export tenant config from Logto Cloud Admin API
#   4. Import into self-hosted instance
#   5. Update LOGTO_ISSUER env var across all apps; rotate secrets
```

`[VERIFIED: Context7 /websites/logto_io — Logto Cloud + GitHub OIDC connector confirmed]`

### Anti-Patterns to Avoid

- **Skip `packages/contracts` "for speed":** Phase 1 sets up `packages/contracts` with TSC project references even if it's just one file. Discipline > velocity.
- **Treat SSE as transactional:** SSE is a UX progress hint; Postgres is source of truth (D-09).
- **Storing upstream credentials "for convenience":** pass-through default; stored mode requires UI checkbox (Phase 6).
- **Logging spec content "for debugging":** Log only `content_hash + endpoint_count + structural_diff_summary`. Hard rule from `mcpgen-architecture.md` §11.
- **Running F3 against production tenant namespace:** D-08 dedicates `mcpgen-sandbox` for F3.
- **Letting Drizzle and SQLAlchemy/asyncpg diverge:** Drizzle is source. CI step generates JSON schema from migrations; engine reflects post-migration schema (Phase 2+).
- **"Fix" failing F2/F3 thresholds by lowering them:** D-13 + Pitfall #29 — pre-commit hook on `launch-criteria.ts` requires paired decision-log entry.
- **Per-tenant CF dispatch namespace:** D-08 + Pitfall #11. Pre-commit hook `cf-namespace-guard` enforces.
- **Bypass pre-commit (`--no-verify`):** NEVER. Explicit CLAUDE.md + git workflow rules mandate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-language schema sharing TS↔Python | A custom JSON schema converter | Zod 4 `z.toJSONSchema()` + `datamodel-code-generator` | Two well-maintained tools cover this end-to-end; custom converter rots fast |
| Pre-commit hook orchestration | Bash + git hooks manually | `pre-commit` Python framework | D-05; cross-language; declarative config |
| Conventional Commits validation | Regex in a hook | `conventional-pre-commit` + `commitlint-github-action` | Tested by hundreds of projects; edge cases handled |
| Postgres connection pooling on CF Workers | A custom proxy | Cloudflare Hyperdrive | D-17; native CF integration; raw TCP not available in Workers |
| Source-map upload to Sentry | A custom upload script | `wrangler deploy --upload-source-maps`, `@sentry/nextjs`, `sentry-sdk[fastapi]` | Each runtime has its own canonical mechanism (D-19) |
| OTel → Langfuse exporter | A custom HTTP exporter | `opentelemetry-exporter-otlp` + Logfire `send_to_logfire=False` | Langfuse v4 ships an OTLP-compatible endpoint |
| OAuth/OIDC for users | A custom auth server | Logto Cloud (free tier → self-host) | D-14; managed > self-host until t+3mo |
| ULID generation | A custom encoder | `ulid` (TS) + `python-ulid` (Python) | Spec-compliant, sortable; D-11 keys depend on it |
| Migration filename strategy | A custom shell script | Drizzle Kit `prefix: 'timestamp'` | D-12; native; ecosystem standard |
| MCP protocol implementation | Hand-roll JSON-RPC | `@modelcontextprotocol/sdk@^1.x` | D-04; spec changes faster than we can keep up |
| OpenRouter provider routing | Custom retry+routing logic | OpenRouter `extra_body.provider` schema with `order/quantizations/allow_fallbacks/require_parameters` | Pitfall #2; API-side feature; can't reproduce |
| Long-lived SSE on edge | A WebSocket reverse proxy | Hono `streamSSE` (D-15) → Durable Objects fallback (D-16) | CF docs explicitly say SSE works for arbitrarily-long streams as long as CPU time stays bounded |
| Cross-tenant namespace isolation in CF | Per-tenant namespace + custom router | Single namespace per env + script-tag tenant identity | D-08 + Pitfall #11; CF-explicit pattern |

**Key insight:** Phase 1 has zero novel-code surface. Every pattern is locked or has a canonical ecosystem implementation. The challenge is **integration discipline + contract precision**, not invention.

---

## Common Pitfalls

> Pitfalls #11, #17, #18, #19, #20, #24, #26, #29 are mapped to Phase 1 by upstream PITFALLS.md. Each is folded below with Phase-1-specific concrete prevention.

### Pitfall #11 — CF Workers for Platforms namespace-per-tenant — P0

**What goes wrong:** Instinct to create one CF dispatch namespace per tenant. Cloudflare explicitly forbids this.

**Why it happens:** "Namespace = tenant" is the K8s mental model.

**Phase-1 prevention:** D-08 — three namespaces total (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`). Pre-commit hook `cf-namespace-guard` (Pattern 6) parses `infrastructure/cloudflare/` and any `wrangler.toml` for namespace creations; fails if count > 3. Phase 1 deliverable: the hook script + CI assertion in `main-ci.yml` that runs `wrangler dispatch-namespace list | wc -l` against the three known names.

**Warning signs:** any Phase 1 commit attempting to add `wrangler dispatch-namespace create` for a 4th name. Code review prompt: "did you read CONTEXT.md D-08?"

### Pitfall #17 — Logto Cloud free tier MAU lock at launch — P0 at launch

**What goes wrong:** Free tier caps at 5K MAU. Viral W9 spike can hit cap → "0 signups" for hours.

**Phase-1 prevention:** Phase 1 deliverables:
1. Logto Cloud free tier scaffolded (FND-13).
2. Self-host runbook documented in `infrastructure/logto/README.md` (D-14).
3. Calendar entry "buy Logto Pro" set for end of W7 (Phase 8 plan must verify).
4. BetterStack uptime check configured against Logto endpoint (Phase 9 wires it; Phase 1 records the URL).

**Warning signs:** Logto Admin API MAU > 4K rising, no Pro subscription. Phase 1 + 8 + 10 cross-check.

### Pitfall #18 — Drizzle migration filename collisions on parallel branches — P1

**What goes wrong:** Engine ws creates `0005_x.sql`; Ops ws creates `0005_y.sql` in parallel; merge collision.

**Phase-1 prevention:** D-12 — `prefix: 'timestamp'` in `drizzle.config.ts` (Pattern 5). First migration is `20260427000000_init_schema.sql`. CI step (`drizzle-kit check`) runs on every PR.

**Warning signs:** any PR attempting to commit a numeric-prefix migration. Pre-commit hook `ir-codegen-check` only catches IR drift; migration prefix is enforced by `drizzle-kit check` exit code.

### Pitfall #19 — pgvector + TimescaleDB OOM on Neon dev tier — P1

**What goes wrong:** On dev tier (1 vCPU, 2GB), tsvector + pgvector + hypertable + autovacuum can OOM during load.

**Phase-1 prevention:** D-18 — dev tier is acceptable for Phase 1 development and CI; Scale-tier (≥4 vCPU, 8GB) provisioned by end of W8 before soft launch (~$220/mo). Phase 1 deliverable: documented `infrastructure/neon/SCALING.md` runbook + calendar entry "upgrade Neon" for W8.

**Warning signs:** in Phase 1 — `connection terminated unexpectedly` from Neon clients during integration tests. Phase 1 acceptance: Drizzle migration applies cleanly + TimescaleDB hypertable creation succeeds + pgvector extension verified.

### Pitfall #20 — SSE stream disconnect on Vercel cold start — P1

**What goes wrong:** Frontend SSE drops on Vercel cold-start re-render mid-generation; user loses progress.

**Phase-1 prevention:** D-09/D-10 — Postgres `generation.status` is source of truth. SSE event envelope (Pattern 1) includes `event_id` (ULID) so clients can resume via `Last-Event-ID` header. Phase 1 contract MUST specify resume semantics in `packages/contracts/src/generation-api.ts`. Phase 7 plan must include "page reload mid-generation" test.

**Warning signs:** during Hono spike (D-15), simulate disconnect-and-reconnect — verify the BFF can replay events from `pending_callbacks` table given a `Last-Event-ID`.

### Pitfall #24 — Engine workstream bottlenecks all other workstreams — P1

**What goes wrong:** Engine slips → Frontend/Runtime/Ops idle.

**Phase-1 prevention:** D-07 — `packages/engine-fixtures/` ships 5 hand-crafted IR/FinalTool/QualityReport fixtures by end of Phase 1. Frontend/Runtime/Ops integrate against fixtures. Engine upgrades fixtures in lockstep as real output ships.

**Warning signs:** Frontend ws ships nothing by end of W3; Runtime ws builds 500+ LoC of "mock generated server" diverging from real templates.

**Specifics from CONTEXT.md:** the 5 fixture sets must be **hand-tuned to look exactly like real Pass 5 output, not LLM-generated**. ~4 hours each by reading each upstream API's spec and authoring the IR + FinalTool + QualityReport manually. (CONTEXT.md `<specifics>` section.)

### Pitfall #26 — Parallel sessions both fixing the same failing test — P1

**Phase-1 prevention:** D-21 — failing tests owned by ws that owns the file. Cross-ws failures escalate to MAIN as `chore(contracts):` PR. Phase 1 deliverables:
1. `docs/decisions/000-test-ownership-policy.md` documenting the policy.
2. `OPS-02` referenced in plan files for every workstream.
3. Daily sync ritual in `docs/mcpgen-gsd-sprint-plan.md` §5.1.

**Warning signs:** 2 PRs touching same test file from different ws branches.

### Pitfall #29 — AI-generated "fix" that disables a failing validation — P0

**What goes wrong:** AI agent lowers F2 threshold from `< 4.0` to `< 3.5` to make tests pass.

**Phase-1 prevention:** D-13 — `packages/contracts/launch-criteria.ts` ships F2 ≥ 4.0 + F3 ≥ 0.7 + bundle thresholds as runtime constants. Pre-commit hook `launch-criteria-guard` (Pattern 6) fails any change without paired `docs/decisions/<date>-<slug>.md`. CI assertion (`main-ci.yml`): values in `launch-criteria.ts` MUST match those quoted in `docs/mcpgen-implementation-plan.md` §11.7. Plan-checker reviews any PR that touches the file.

**Warning signs:** PR comment "lowered threshold to make tests pass" — REJECT immediately.

---

## Code Examples

(All major patterns in §"Architecture Patterns" already include verified code samples. Below are 3 extras that touched on Claude's discretion areas.)

### Stripe-sample tenant Worker stub (CONTEXT.md `<specifics>` — `apps/dispatch-sample/`)

```typescript
// apps/dispatch-sample/src/index.ts
// Hand-coded sample tenant Worker — Phase 6 dispatches against this.
// Purpose: validate runtime SDK shape + dispatch + auth + usage pipeline before engine produces real Workers.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface Env {
  USAGE_QUEUE: Queue<unknown>;
}

const server = new McpServer({ name: 'sample-stripe', version: '0.0.1' });

server.tool(
  'customers_search',
  'Search Stripe customers by email or name (sample stub for Phase 1).',
  { query: z.string() },
  async ({ query }, ctx) => {
    return { content: [{ type: 'text', text: `(stub) searched for "${query}"` }] };
  },
);

server.tool('charges_fetch', 'Fetch a Stripe charge by ID (stub).', { id: z.string() },
  async ({ id }) => ({ content: [{ type: 'text', text: `(stub) fetched charge ${id}` }] }));

server.tool('subscriptions_list', 'List Stripe subscriptions (stub).', {},
  async () => ({ content: [{ type: 'text', text: '(stub) listed' }] }));

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return server.fetch(req, env, ctx);
  },
};
```

*(Source: `@modelcontextprotocol/sdk@1.29.0` v1 API per D-04; Stage E codegen will produce richer per-tool handlers in Phase 4.)*

### `packages/ir/src/types.ts` — Zod IR source skeleton

```typescript
// packages/ir/src/types.ts
// Source of truth for IR (D-01). Pydantic models in packages/ir/python/types.py are generated from this.
import { z } from 'zod';

export const ToolAnnotations = z.object({
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
  openWorldHint: z.literal(true),  // architectural invariant per Pass 4 design
});

export const ToolDescription = z.object({
  purpose: z.string().min(20),
  when_to_use: z.array(z.string()).min(1),
  when_not_to_use: z.array(z.string()).optional(),
  how_to_use: z.string().optional(),
  limitations: z.array(z.string()),
  parameter_overview: z.string().min(50).max(400),
});

export const ResponseConfig = z.object({
  pagination: z.object({
    style: z.enum(['cursor', 'offset', 'page-number', 'none']),
    default_limit: z.number().int().positive(),
    max_limit: z.number().int().positive(),
  }).nullable(),
  field_filtering: z.object({
    always_include: z.array(z.string()),
    opt_in: z.array(z.string()),
    always_exclude: z.array(z.string()),
  }).nullable(),
  truncation: z.object({
    threshold_tokens: z.number().int().positive(),
    guidance_template: z.string(),
  }),
  has_response_format_param: z.boolean(),
});

export const SmartIdSchema = z.object({
  format: z.string(),  // e.g., "{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}"
  types: z.array(z.string()),
  collections: z.array(z.string()),
});

export const FinalTool = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum(['universal', 'action', 'workflow', 'specialized']),
  description: ToolDescription,
  inputSchema: z.record(z.unknown()),    // JSON Schema object
  outputSchema: z.record(z.unknown()),   // JSON Schema object
  annotations: ToolAnnotations,
  response_config: ResponseConfig,
  source_endpoints: z.array(z.string()),
});

export type FinalTool = z.infer<typeof FinalTool>;
// ... QualityReport, RoutingRule, WorkflowDef, etc.
```

### `packages/contracts/src/launch-criteria.ts` — D-13 runtime constants

```typescript
// packages/contracts/src/launch-criteria.ts
// IMMUTABLE without a paired docs/decisions/<date>-<slug>.md entry (D-13 + Pitfall #29).
// Pre-commit hook `launch-criteria-guard` enforces.
// CI assertion: values must match docs/mcpgen-implementation-plan.md §11.7.

export const LAUNCH_CRITERIA = {
  F2_SMELL_MIN: 4.0,        // mcpgen-implementation-plan.md §11.7
  F3_AGENT_PASS_RATE_MIN: 0.7,
  BUNDLE_SIZE: {
    PASS_KB: 800,
    WARN_KB: 950,
    FAIL_KB_EXCLUSIVE: 950,  // > 950 KB = fail
  },
  COVERAGE_PCT_MIN: 100,
} as const;

export type LaunchCriteria = typeof LAUNCH_CRITERIA;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 1 |
|--------------|------------------|--------------|-------------------|
| Pydantic-source IR + `pydantic-to-typescript` | TS Zod source + `z.toJSONSchema()` + `datamodel-code-generator` | D-01 + Zod 4 release | FND-02 codegen pipeline |
| Drizzle numeric prefix migrations | `prefix: 'timestamp'` (added in drizzle-kit 0.32) | drizzle-kit 0.32+ | D-12 + Pattern 5 |
| Pydantic model `model_name: str` defaults | Strict Pydantic 2 BaseModel + pydantic-settings | Pydantic 2 release | CLAUDE.md "no default parameter values" |
| LiteLLM gateway for multi-model routing | PydanticAI `OpenAIProvider(base_url=openrouter)` direct | model override doc | Engine scaffold pattern |
| MCP TS SDK `server.tool(name, desc, schema, handler)` (v1) | `server.registerTool(name, { config }, handler)` (v1.x and v2) | MCP TS SDK 1.x adds `registerTool` alongside legacy `tool` | D-04: stay on `^1.x`; both APIs available |
| `pip` / `poetry` / `pipenv` | `uv` (10–100× faster) | uv stable in 2024 | Engine scaffold |
| `flake8` + `black` + `isort` | `ruff` (one tool) | ruff stable in 2024 | Engine scaffold |
| `psycopg2` | `psycopg` (psycopg3) with `[binary,pool]` | psycopg3 stable | Engine scaffold |
| `chai` / `mocha` / `jest` | `vitest` | vitest 1.0+ | TS test scaffold |
| Custom OAuth implementations | `@cloudflare/workers-oauth-provider` | Cloudflare ships 2025 | Phase 6 (but install in Phase 1 stub) |

**Deprecated/outdated:**
- LiteLLM in the engine pipeline — DELETED per model override doc.
- Multi-family judge ensemble for F2 — REPLACED by single Qwen × 5-shuffle averaging per model override doc.
- `pydantic-to-typescript` for IR sharing — REPLACED by D-01 (TS source).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hono `streamSSE` works for 90s on CF Workers without hitting any time limit | Pattern 3 + D-15 | If wrong, D-16 fallback (Durable Objects) kicks in. CF docs `[CITED]` strongly support the claim, but only the spike validates it. |
| A2 | Neon dev tier supports both pgvector AND TimescaleDB extensions in 2026 | Pattern 12 | Inferred from Neon's 2024+ docs; if either is gated to a paid tier, Phase 1 must upgrade earlier. **Verify by running `CREATE EXTENSION` during Phase 1 Wave 1.** |
| A3 | `@modelcontextprotocol/sdk@1.29.0` exposes both legacy `server.tool()` and new `server.registerTool()` | Pattern 12 + D-04 | Migration docs `[VERIFIED: Context7]` show both. If `tool()` is removed, Stage E templates need rewrite earlier than planned. |
| A4 | Logto Cloud free tier currently includes both email and GitHub OIDC connectors | Pattern 13 | Inferred from current Logto docs `[VERIFIED: Context7]`; SaaS pricing can change. Verify during Phase 1 scaffolding. |
| A5 | `datamodel-code-generator` produces clean Pydantic 2 from JSON Schema in 2026 | Pattern §"Cross-Language IR Codegen" | Tool has been stable since 2022; LOW risk. |
| A6 | OpenRouter `extra_body.provider` schema accepts the exact keys `order/quantizations/allow_fallbacks/require_parameters` | Pattern 8 + GEN-13 | `[VERIFIED: Context7 /websites/openrouter_ai]` — schema confirmed. |
| A7 | Drizzle `prefix: 'timestamp'` produces `YYYYMMDDHHMMSS_<name>.sql` (no underscore) — minor divergence from D-12's `YYYYMMDD_HHMMSS_` | Pattern 5 | LOW risk; lexicographic sort works either way. Recommend Option A in Pattern 5. |
| A8 | Wrangler 4.x supports `--upload-source-maps` AND `upload_source_maps = true` in toml | Pattern 10 + D-19 | `[VERIFIED: Context7 /websites/developers_cloudflare_workers]` |
| A9 | Bun 1.3.x cross-compile to all 4 targets (linux-x64, darwin-arm64, darwin-x64, windows-x64) works on macOS host | Pattern 11 + CLI-03 | Bun 1.2+ has supported all 4 targets; verify by building all 4 in Phase 1 wave 1. |
| A10 | `pre-commit` framework's mirror repos for `mypy` / `eslint` are current as of 2026 | Pattern 6 | LOW risk; long-stable mirrors. Run `pre-commit autoupdate` quarterly per Claude's Discretion item. |
| A11 | Neon supports `CREATE EXTENSION timescaledb` on dev tier (some hosts gate it to paid) | Pattern 12 + Pitfall #19 | Verify in Phase 1 Wave 1; if blocked, escalate to scale tier earlier (revises D-18 ETA). |

**11 assumptions; all verifiable via concrete commands during Phase 1 Wave 1. None are blocking; A1, A2, A11 are the highest-priority verifications.**

---

## Open Questions (RESOLVED)

1. **Drizzle prefix format divergence (D-12 says `YYYYMMDD_HHMMSS_`, Drizzle native is `YYYYMMDDHHMMSS_`).**
   - What we know: Drizzle has `prefix: 'timestamp'` natively; format is `YYYYMMDDHHMMSS`.
   - What's unclear: should we accept Drizzle's native format or write a rename script?
   - RESOLVED: **Option A — accept native format**. Update CONTEXT.md D-12 to note: "Drizzle native `YYYYMMDDHHMMSS_<name>.sql` accepted as semantically equivalent." First migration: `20260427000000_init_schema.sql`.

2. **SSE resume backing store (`pending_callbacks` table) — exact column types?**
   - What we know: D-09 + R-A4 require it; columns sketched in CONTEXT.md.
   - What's unclear: do callbacks store full event payload (potentially MB on partial_result) or only metadata?
   - RESOLVED: store metadata only (`job_id, event_id, stage, status, attempted_count, last_attempt_at, next_retry_at`). Full payload re-derived from L2 cache during retry. Decision goes in Phase 1 plan as part of FND-08.

3. **Logto M2M token issuance for engine → BFF callbacks — same tenant or separate M2M-only tenant?**
   - What we know: Logto Cloud supports M2M apps within a tenant.
   - What's unclear: separate tenant for M2M only is operationally cleaner but doubles Logto Cloud SaaS billing later.
   - RESOLVED: single tenant per environment; M2M app within `mcpgen-prod` / `mcpgen-staging` / `mcpgen-sandbox`. Document in `infrastructure/logto/README.md`.

4. **Sample tenant Worker (`apps/dispatch-sample/`) — same monorepo or separate package?**
   - What we know: CONTEXT.md `<specifics>` says it lives at `apps/dispatch-sample/`.
   - What's unclear: it imports `@modelcontextprotocol/sdk` directly rather than going through `@mcpgen/runtime`; does this validate the SDK contract or only the dispatch routing?
   - RESOLVED: keep at `apps/dispatch-sample/`; **must** import `@mcpgen/runtime` (the interface stub from FND-06) — that's the whole point of having a sample. Phase 6 swaps the stub for real impl.

5. **Day-1 smoke test pinning — exact PydanticAI version?**
   - What we know: Pitfall #27 says pin in `pyproject.toml`.
   - What's unclear: which patch version of `pydantic-ai` is current and stable on 2026-04-26?
   - RESOLVED: at Phase 1 execution time, run `uv add pydantic-ai` once, capture the resolved version, pin exactly. Re-verify the smoke test passes before locking.

6. **GitHub Actions matrix vs. monolithic workflow — which is faster for solo founder ops?**
   - What we know: D-06 prescribes `engine-ci.yml` / `runtime-ci.yml` / `frontend-ci.yml` / `ops-ci.yml` / `main-ci.yml` aggregator.
   - What's unclear: vs. one workflow with `paths-filter` + matrix — both produce the same affected-only build behavior.
   - RESOLVED: single `main-ci.yml` with `dorny/paths-filter` and conditional jobs (Pattern 7). Easier to maintain; one PR check status to monitor; same outcomes. Diverges slightly from D-06 wording — flag in plan as a refinement.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Turborepo, pnpm, all TS apps | ✓ | v25.2.1 | — |
| pnpm | Workspaces | ✓ | 10.30.2 | — |
| Bun | CLI binary build, runtime | ✓ | 1.3.5 | — |
| Python 3.12 | Engine | ✓ | 3.12.12 | — |
| `uv` | Python package mgmt | ✓ | (installed) | — |
| Docker | Local Neon / engine container | ✓ | (installed) | — |
| `gh` (GitHub CLI) | CI debugging, PR creation | ✓ | (installed) | — |
| `wrangler` | CF Workers deploy | ✗ (not on PATH) | — | `pnpm add -g wrangler@4` or `pnpm dlx wrangler` |
| `gitleaks` | Pre-commit secret scan + F1 | ✗ | — | `brew install gitleaks` |
| `pre-commit` | Hook orchestration | ✗ | — | `brew install pre-commit` or `uv tool install pre-commit` |
| `flyctl` | Engine deploy | ✗ | — | `brew install flyctl` (Phase 1 wave 1) |
| `turbo` | Monorepo task graph (CLI) | ✗ | — | invoked via `pnpm turbo` after `pnpm install` |
| Cloudflare account | All CF resources | ❓ unverified | — | Sign up; provision API token |
| Neon account | Postgres | ❓ unverified | — | Sign up; create project |
| Logto Cloud account | Auth scaffolding | ❓ unverified | — | Sign up; create 3 tenants |
| Vercel account | `apps/web` host | ❓ unverified | — | Sign up; link to GitHub |
| Fly.io account | `apps/generation-engine` host | ❓ unverified | — | Sign up; create app |
| Inngest account | Cron + queue consumer | ❓ unverified | — | Sign up; get keys |
| Langfuse Cloud account | LLM tracing | ❓ unverified | — | Sign up; create project; capture OTLP keys |
| Sentry account | Error tracking | ❓ unverified | — | Sign up; create 4 projects |
| BetterStack account | Logs + uptime | ❓ unverified | — | Sign up |
| Resend account | Email | ❓ unverified | — | Sign up |
| Stripe test-mode account | Billing dev | ❓ unverified | — | Sign up; capture test keys |
| OpenRouter account + API key | Day-1 Qwen smoke test | ❓ unverified | — | Sign up; get API key |

**Missing dependencies with no fallback:** none — all SaaS sign-ups are part of Phase 1 ops scaffolding. The 4 missing local CLIs (`wrangler`, `gitleaks`, `pre-commit`, `flyctl`) install via `brew`/`uv` in <5 minutes total.

**Missing dependencies with fallback:** `wrangler` and `flyctl` can be invoked via `pnpm dlx` / `npx` for CI-only runs without global install.

**Acceptance for FND scaffolding:** Phase 1 Wave 1 plan must include a "tool install + account provisioning checklist" runbook (~30 min total).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TS) | `vitest` 1.x |
| Framework (Python) | `pytest` 8.x + `pytest-asyncio` + `pytest-httpx` |
| Config file (TS, per app) | `vitest.config.ts` |
| Config file (Python) | `apps/generation-engine/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command (per package, dev) | `pnpm --filter @mcpgen/<pkg> test` / `cd apps/generation-engine && uv run pytest -q` |
| Full suite command | `pnpm test` (Turborepo orchestrates all `test` scripts) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | Monorepo `pnpm install` succeeds; `pnpm turbo run build` succeeds | smoke | `pnpm install --frozen-lockfile && pnpm turbo run build` | ❌ Wave 0 |
| FND-02 | IR codegen produces non-empty Pydantic; Pydantic re-validates Zod fixture | unit | `pnpm --filter @mcpgen/ir test` | ❌ Wave 0 |
| FND-02 | IR codegen freshness check fails when `types.ts` changes without re-codegen | integration | `pnpm --filter @mcpgen/ir codegen --check` | ❌ Wave 0 |
| FND-03 | `GenerationSseEvent` schema validates a known-good event; rejects malformed | unit | `pnpm --filter @mcpgen/contracts test -- generation-api.test.ts` | ❌ Wave 0 |
| FND-04 | Usage event schema round-trips through emit-site fixture | unit | `pnpm --filter @mcpgen/contracts test -- usage-event.test.ts` | ❌ Wave 0 |
| FND-05 | Launch criteria values match `mcpgen-implementation-plan.md` §11.7 quoted values | regression | `pnpm --filter @mcpgen/contracts test -- launch-criteria.test.ts` | ❌ Wave 0 |
| FND-06 | Runtime SDK interface compiles with `tsc --noEmit` | smoke | `pnpm --filter @mcpgen/runtime-sdk typecheck` | ❌ Wave 0 |
| FND-07 | Each of 5 engine fixtures parses against IR Zod schema | unit | `pnpm --filter @mcpgen/engine-fixtures test` | ❌ Wave 0 |
| FND-08 | `drizzle-kit migrate` applies cleanly on a fresh Postgres test container | integration | `pnpm --filter @mcpgen/api db:test-migrate` | ❌ Wave 0 |
| FND-09 | CF dispatch namespace count = 3 (asserted from `wrangler dispatch-namespace list`) | integration (manual + CI) | `bash scripts/check-cf-namespaces.sh` | ❌ Wave 0 |
| FND-10 | Each app's `sentry.init` runs without crashing on empty DSN | smoke | per-app vitest/pytest entry-point test | ❌ Wave 0 |
| FND-11 | Engine `configure_langfuse_otel()` runs without crashing on empty Langfuse env | smoke | `cd apps/generation-engine && uv run pytest -k observability` | ❌ Wave 0 |
| FND-12 | Pre-commit runs all hooks on a clean checkout in <30s | smoke | `pre-commit run --all-files` | ❌ Wave 0 |
| FND-13 | Logto runbook + smoke OAuth flow against staging tenant succeeds | manual (one-time) | manual checklist | manual-only |
| FND-14 | Idempotency-key validators accept ULID, reject non-ULID at all 4 surfaces | unit | `pnpm --filter @mcpgen/contracts test -- idempotency.test.ts` | ❌ Wave 0 |
| FND-15 | Hono streamSSE 90s spike: t=85s event delivered | integration (one-shot) | `apps/api/scripts/spike-sse.sh` (curl -N against deployed staging) | ❌ Wave 0 |
| CTRL-01 | `POST /api/v1/generate` returns 202 + `Idempotency-Key` echo; SSE endpoint accepts `Last-Event-ID` | integration | `pnpm --filter @mcpgen/api test:integration` | ❌ Wave 0 |
| OPS-01 | Friday demo recorded in `demos/` with date in last 7 days (operational, not unit-testable) | manual | weekly `ls -lt demos/ \| head -1` | manual-only |
| OPS-02 | Cross-workstream test ownership policy documented in `docs/decisions/` | doc check | `test -f docs/decisions/000-test-ownership-policy.md` | ❌ Wave 0 |
| OPS-03 | Plan files include "MUST re-read these files first" header | doc check | grep over `.planning/phases/*/PLAN-*.md` | ❌ Wave 0 (template) |

### Sampling Rate

- **Per task commit:** `pnpm test` for the affected package (~15s).
- **Per wave merge:** `pnpm turbo run test` (full suite, cached) + `pre-commit run --all-files`.
- **Phase gate:** full suite green + Hono spike (D-15) succeeded + all 5 engine-fixtures parse + Day-1 smoke test passes locally with API key + manual checklist (FND-13, OPS-01, OPS-02, OPS-03) signed off.

### Wave 0 Gaps

- [ ] `vitest.config.ts` per TS package (`packages/ir`, `packages/contracts`, `packages/runtime-sdk`, `packages/engine-fixtures`, `apps/api`, `apps/web`, `apps/cli`, `apps/dispatch`).
- [ ] `apps/generation-engine/pyproject.toml` `[tool.pytest.ini_options]` block + `tests/conftest.py`.
- [ ] `apps/generation-engine/tests/smoke_test_qwen.py` (Day-1 smoke test).
- [ ] `packages/ir/tests/codegen.test.ts` (round-trip fixture test).
- [ ] `packages/contracts/tests/{generation-api,usage-event,launch-criteria,idempotency}.test.ts`.
- [ ] `packages/engine-fixtures/tests/parse.test.ts` (loop over 5 fixtures, validate against IR Zod).
- [ ] `apps/api/scripts/spike-sse.sh` + `apps/api/src/routes/_spike/sse.ts` (D-15).
- [ ] `scripts/check-cf-namespaces.sh` + `scripts/check-launch-criteria-decision.sh` + `scripts/check-ui-locked.sh` (pre-commit local hooks).
- [ ] Framework installs: `pnpm add -Dw vitest @vitest/coverage-v8` + `cd apps/generation-engine && uv add --dev pytest pytest-asyncio pytest-httpx`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Logto Cloud OIDC (D-14); GitHub + email providers; M2M tokens for engine→BFF |
| V3 Session Management | yes (Phase 8 fills) | Logto-issued JWTs; CF Worker introspection cache 5-min TTL |
| V4 Access Control | yes | Tenant isolation via CF script-tag tenant identity (D-08); per-tenant CF KV DEKs (Phase 6) |
| V5 Input Validation | yes | Zod (`@hono/zod-validator`) on all `apps/api` endpoints; Pydantic on engine; ajv for spec validation |
| V6 Cryptography | yes (foundational) | Pass-through credentials = HKDF-derived symmetric key (Phase 6); stored credentials = AES-256-GCM with per-tenant DEK (Phase 6); KEK in CF Workers Secret |
| V7 Error Handling and Logging | yes | structlog (Python) + pino (TS); Sentry beforeSend redaction (Phase 4 codegen + Phase 1 BFF init); never log spec content / upstream API responses / upstream credentials |
| V9 Communications | yes | TLS everywhere; Cloudflare-managed certs |
| V10 Malicious Code | yes | gitleaks pre-commit + F1; ESLint security rules; Sentry release tracking |
| V14 Configuration | yes | CF Workers Secrets (env-scoped); Fly.io Secrets; no secrets in code/git |

### Known Threat Patterns for {TS+Python polyglot monorepo on CF Workers + Vercel + Fly Machines + Neon}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pass-through credentials leaking into Sentry/Langfuse logs | Information Disclosure | Pass through D-19 wires Sentry SDK init in all 4 apps; Phase 4 codegen adds `beforeSend` redaction for `X-Upstream-Auth`, `Authorization`, `Cookie`, spec-declared auth headers (Pitfall #12) — Phase 1 specifies the contract |
| Spec content logging | Information Disclosure | Hard rule from `mcpgen-architecture.md` §11; only `content_hash + endpoint_count + structural_diff_summary` may be logged |
| Smart-ID prefix collision across tenants → cross-tenant data | Information Disclosure | Phase 1 contract: smart-ID format `{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}`; Phase 5 F1 cross-tenant fuzz check |
| DNS rebinding on Streamable HTTP MCP tenant Workers | Spoofing | Phase 4 codegen adds `hostHeaderValidation` middleware — Phase 1 specifies the contract |
| Drizzle migration adds destructive change without review | Tampering | Drizzle Kit `--check` in CI (FND-08); pre-commit + branch protection on main |
| Conventional Commits bypass | Tampering | D-20: pre-commit (`conventional-pre-commit`) + CI (`commitlint-github-action`) double layer |
| AI-generated launch-criteria threshold lowering | Tampering | D-13 + Pattern 6 `launch-criteria-guard` pre-commit hook (Pitfall #29) |
| CF dispatch namespace explosion (per-tenant) | Repudiation | D-08 + Pattern 6 `cf-namespace-guard` pre-commit hook (Pitfall #11) |
| Idempotency-key replay attack on `POST /api/v1/generate` | Repudiation | D-11 ULID-prefixed keys; BFF rejects non-ULID; Inngest dedupes job triggers |
| Logto MAU lock during viral launch | Denial of Service | D-14: pre-buy Pro at W7; self-host runbook tested W8 (Pitfall #17) |
| pgvector + TimescaleDB OOM on Neon dev tier | Denial of Service | D-18: Scale-tier upgrade at W8 (Pitfall #19) |
| Secret commit (CF API token, OpenRouter key, Stripe live key) | Information Disclosure | gitleaks pre-commit + CI; secrets via CF Workers Secrets / Fly.io Secrets / GitHub Actions Secrets only |

---

## Sources

### Primary (HIGH confidence — locked)

- `/Users/igor/Projects/mcpgen/CLAUDE.md` (operational map)
- `/Users/igor/Projects/mcpgen/RULES.md` (hard rules)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-architecture.md` §3, §4, §6, §7, §11, §14, §15
- `/Users/igor/Projects/mcpgen/docs/mcpgen-model-and-provider-override.md` §0–8
- `/Users/igor/Projects/mcpgen/docs/mcpgen-git-workflow-rules.md`
- `/Users/igor/Projects/mcpgen/docs/mcpgen-gsd-sprint-plan.md` §2, §3, §4.1, §5
- `/Users/igor/Projects/mcpgen/.planning/REQUIREMENTS.md` (FND-01..15, CTRL-01, OPS-01..03)
- `/Users/igor/Projects/mcpgen/.planning/PROJECT.md`
- `/Users/igor/Projects/mcpgen/.planning/STATE.md`
- `/Users/igor/Projects/mcpgen/.planning/phases/01-foundation/01-CONTEXT.md` (D-01..D-21)
- `/Users/igor/Projects/mcpgen/.planning/research/SUMMARY.md`
- `/Users/igor/Projects/mcpgen/.planning/research/STACK.md`
- `/Users/igor/Projects/mcpgen/.planning/research/ARCHITECTURE.md` (R-A1..R-A8)
- `/Users/igor/Projects/mcpgen/.planning/research/PITFALLS.md` (#11, #17, #18, #19, #20, #24, #26, #29)

### Primary (HIGH confidence — Context7 verified 2026-04-26)

- `/websites/hono_dev` — `streamSSE` helper API confirmed.
- `/websites/developers_cloudflare_workers` — "no time limit on individual subrequests" + `cpu_ms` config + Hyperdrive bindings + `upload_source_maps`.
- `/websites/developers_cloudflare_cloudflare-for-platforms` — dispatch namespace + script tags (max 8) + multipart upload pattern.
- `/drizzle-team/drizzle-orm-docs` — `prefix: 'timestamp'` config (since drizzle-kit 0.32).
- `/modelcontextprotocol/typescript-sdk` — `registerTool` v2 API confirmed; v1.x retains `server.tool()` per migration docs.
- `/pydantic/pydantic-ai` — `OpenAIProvider(base_url=...)` + `OpenAIChatModel` confirmed.
- `/websites/openrouter_ai` — Provider Preferences Schema (`order`, `quantizations`, `allow_fallbacks`, `require_parameters`).
- `/pydantic/logfire` — `send_to_logfire=False` + `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` pattern.
- `/langfuse/langfuse-python` — Langfuse v4 OTel-native; integration patterns.
- `/pre-commit/pre-commit.com` — `.pre-commit-config.yaml` + local repo hooks.
- `/websites/logto_io` — Logto Cloud OIDC + GitHub connector confirmed.
- `npm view` (current versions): `@modelcontextprotocol/sdk@1.29.0`, `wrangler@4.85.0`, `next@16.2.4` (we pin 15.x), `bun@1.3.13`, `@neondatabase/serverless@1.1.0`, `turbo@2.9.6`, `pnpm@10.30.2`, `@sentry/cloudflare@10.50.0`, `@sentry/nextjs@10.50.0`, `stripe@22.1.0`, `@logto/node@3.1.10`, `inngest@4.2.4`, `eventsource-parser@3.0.8`, `commander@14.0.3`, `eslint@10.2.1`, `typescript@6.0.3`, `drizzle-kit@0.31.10`, `drizzle-orm@0.45.2`, `hono@4.12.15`, `zod@4.3.6`.

### Secondary (MEDIUM confidence — reasoned from official docs)

- Hono `streamSSE` long-lived behavior on CF Workers (verified pattern; D-15 spike validates empirically).
- Bun cross-compile matrix on macOS host (verified 1.2+ supports all 4 targets; CLI-03 builds matrix in CI).
- Neon dev tier supports both pgvector + TimescaleDB (verified for 2024+; double-check during Phase 1 Wave 1).

### Tertiary (LOW confidence — needs validation during Phase 1)

- Exact PydanticAI patch version stable on 2026-04-26 (verify via `uv add pydantic-ai`).
- Logto Cloud free-tier MAU exact threshold (cited as 5K; verify in Logto Console).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every locked dep verified via `npm view` + Context7.
- Architecture (5 contracts to freeze): HIGH — locked by ARCHITECTURE.md + CONTEXT.md.
- Pitfalls Phase-1 mapping: HIGH — pre-mapped by upstream PITFALLS.md.
- Cross-language IR codegen pipeline: HIGH — Zod 4 + datamodel-code-generator are well-established.
- Hono streamSSE 90s on CF Workers: MEDIUM-HIGH — CF docs strongly support; D-15 spike validates.
- Drizzle prefix format divergence (D-12 vs native): LOW operational impact (Open Question 1).

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days for stable stack); re-verify drift items before any major version bumps.
