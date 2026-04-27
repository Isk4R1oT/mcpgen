---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 8 (Auth + Billing) complete: 5 plans / 5 waves / 32 commits / 119+11 tests / live Neon migration pushed; --no-transition gate stops chain here"
last_updated: "2026-04-27T19:47:37.087Z"
last_activity: 2026-04-27 -- Phase 8 execution started
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 13
  completed_plans: 15
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-26)

**Core value:** Generated MCP servers measurably outperform hand-written ones on agent task success rate — paste an OpenAPI URL → 60 seconds later you have a deployed MCP server that scores ≥4.0 on F2 smell rubric and ≥70% F3 agent task success on golden tasks for that API.
**Current focus:** Phase 8 — Auth + Billing

## Current Position

Phase: 8 (Auth + Billing) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 8
Last activity: 2026-04-27 -- Phase 8 execution started

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 9 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 10min | 3 tasks | 19 files |
| Phase 01 P02 | 13min | 3 tasks | 17 files |
| Phase 01 P03 | 26min | 3 tasks tasks | 32 files files |
| Phase 01 P04 | 22min + ~5min Task 4 | 4 tasks | 13 files + 1 evidence |
| Phase 01 P01-05 | 15min | 3 tasks | 39 files |
| Phase 01 P06 | 13min | 3 tasks | 19 files |
| Phase 01 P07 | 16min | 3 tasks | 36 files |
| Phase 01-foundation P08 | 25 | 4 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Single LLM model `qwen/qwen3-coder` via OpenRouter for entire generation pipeline; F3 test agent stays on Sonnet 4.7 (production-agent simulation)
- GSD config: `mode=yolo`, `granularity=fine` (10 phases), `parallelization=true`, `model_profile=inherit`
- UI shipped from `claude-design-ui/MCP-Gen.zip` unchanged into `apps/web/src/`; Frontend phase = wire-up only
- Pass-through credentials default; stored credentials marked "less secure" with explicit opt-in
- F2 smell threshold ≥4.0 and F3 agent eval ≥0.7 encoded as runtime constants in `packages/contracts/launch-criteria.ts` (blocks AI-fix-by-lowering-threshold per pitfall #29)
- Plan 01-01: pinned turbo@2.9.6 / typescript@6.0.3 / eslint@10.2.1 / vitest@1.6.0 verbatim from RESEARCH.md Standard Stack
- Plan 01-01: dual tsconfig pattern in shared-config (tsconfig.base.json export shim + tsconfig.json runtime entry) — convention for every downstream package
- Plan 01-01: .prettierignore excludes pre-existing out-of-scope files (docs/, CLAUDE.md, RULES.md, claude-design-ui/, .planning/, pnpm-lock.yaml) per CLAUDE.md scope rules
- Plan 01-02: pre-commit eslint hook switched from `mirrors-eslint v10.2.1` to a `repo: local` `pnpm -r --if-present lint` workspace hook because the mirror's isolated node_env can't see workspace tsconfigs needed for `@typescript-eslint/no-unsafe-assignment` typed-linting (errors on already-committed `packages/shared-config/index.ts`); workspace ESLint stays pinned at `^10.2.1` via `packages/shared-config/devDependencies`
- Plan 01-02: per-workstream CI workflow files (`engine-ci.yml` / `runtime-ci.yml` / `frontend-ci.yml` / `ops-ci.yml`) exist as thin entry-point markers; real work runs in `main-ci.yml` conditional jobs (`docs/decisions/002`)
- Plan 01-02: accept Drizzle native `YYYYMMDDHHMMSS_<name>.sql` migration filename format; first migration `20260427000000_init_schema.sql` (`docs/decisions/001`)
- Plan 01-02: cross-workstream test ownership policy — failing tests owned by the workstream that owns the file under test; cross-cutting failures escalate to `main` as `chore(contracts):` PR (`docs/decisions/000`)
- Plan 01-02: `launch-criteria-assertion` CI step uses `grep -qF` (fixed-string) on `F2_SMELL_MIN: 4.0` / `F3_AGENT_PASS_RATE_MIN: 0.7` / `PASS_KB: 800` / `WARN_KB: 950` to avoid regex-escape ambiguity
- Plan 01-03: combined Zod schemas into a single JSON Schema document with $defs (instead of one file per type) — datamodel-code-generator's modular-references path produces an output directory, not a single file, breaking the engine's expected mcpgen_ir.types module shape
- Plan 01-03: --disable-timestamp flag mandatory on datamodel-code-generator output for deterministic byte-diffs in --check mode (without it, every regen injects fresh timestamp header)
- Plan 01-03: cross-package tool_name regex single-source-of-truth pattern — TOOL_NAME_REGEX defined in @mcpgen/contracts/idempotency.ts; @mcpgen/ir/types.ts re-exports same constant; runtime test introspects FinalTool.name via Zod 4 _zod.def.checks to verify live regex matches
- Plan 01-03: cross-doc launch-criteria consistency test points at docs/mcpgen-stage-f-design.md + CLAUDE.md (the canonical sources of F2 ≥ 4.0 / F3 ≥ 0.7) instead of docs/mcpgen-implementation-plan.md §11.7 (which has §10 launch-criteria as qualitative gates only)
- Plan 01-03: createStubRuntime() factory throws documented Phase-1 errors instead of returning sentinel values — silent stubs lead to misleading partial behaviour; explicit throws force replacement before Phase 6 (RUN-01..05)
- Plan 01-03: codegen tests gated by RUN_CODEGEN_TESTS=1 env var — local devs without datamodel-code-generator can still run pnpm test; CI sets the env var
- Plan 01-03: DEPLOY_ID_REGEX accepts any RFC 4122 UUID v1-v8 (relaxed variant byte) — strict v4 would reject legitimate Cloudflare-generated dispatch worker names
- Plan 01-04: drizzle-kit `out`/`schema` paths resolved relative to caller CWD (not config-file location); config written from `packages/contracts/` perspective with explicit NOTE comment to prevent future regression
- Plan 01-04: First migration filename `20260427000000_init_schema.sql` is FROZEN per FND-08; renamed Drizzle's auto-generated `20260426131532_init_schema.sql` and aligned journal+snapshot tags. Subsequent migrations adopt Drizzle's CURRENT timestamp natively per docs/decisions/001
- Plan 01-04: Manual SQL augmentation inside the Phase-1 migration (CREATE EXTENSION at top, create_hypertable at bottom) with explicit comment markers warning future readers NOT to regenerate the file in place — documented schema-change workflow in `infrastructure/neon/README.md`
- Plan 01-04: pgvector `vector(1536)` dimension chosen (matches OpenAI text-embedding-3-small) instead of architecture §7.1's `VECTOR(1024)`; architecture.md to be reconciled in a future doc-only commit
- Plan 01-04: `DATABASE_URL ?? ''` fallback in drizzle.config.ts so `drizzle-kit generate` and `drizzle-kit check` work without env (they only read schema source); `push` and `migrate` fail naturally on bad URL — keeps CI-stage `check` runnable without a live DB
- Plan 01-05: @sentry/cloudflare 10.x exports withSentry(envCallback, handler) instead of Sentry.init() — apps/api/src/instrumentation.ts adapted to expose sentryOptionsFor(env) helper + re-export withSentry; PATTERNS.md aspirational shape was wrong
- Plan 01-05: McpServer has no built-in fetch method; canonical CF Workers pattern (Phase 4 codegen target) is per-request WebStandardStreamableHTTPServerTransport instantiation + server.connect(transport) + transport.handleRequest(req)
- Plan 01-05: apps/web Phase-1 build/lint/typecheck/test scripts are no-ops because locked UI ships as raw JSX without app/ or pages/ dir; Phase 7 wires the JSX into Next.js app/ structure and re-enables real scripts
- Plan 01-05: test ULIDs use predictable repeating-A pattern (01HXAAAAAAAAAAAAAAAAAAAAA0/2/3) instead of high-entropy random ULIDs to avoid gitleaks generic-api-key false positives
- Plan 01-05: apps/dispatch + apps/dispatch-sample use vitest --run --passWithNoTests so workspace pnpm -r test passes for stub apps; apps/api owns the CTRL-01 contract tests (4 passing)
- Plan 01-06: pydantic-ai 0.2.20 exports OpenAIModel (not OpenAIChatModel — that's the 0.5+ API); MODEL singleton in llm/client.py uses the resolved version with bump-friendly comment
- Plan 01-06: pytest filterwarnings=error scoped allowlist for upstream pydantic-ai 0.2.x deprecations from opentelemetry-sdk 1.39+ (Logger/LoggerProvider/ProxyLoggerProvider via typing_extensions) — single message-pattern ignore that disappears when pydantic-ai is bumped
- Plan 01-06: conftest _sandbox_env autouse fixture sets OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER (NOT None fallback); fail-fast contract verified by delenv after importlib.reload inside the relevant test
- Plan 01-06: Dockerfile build context is REPO ROOT (not apps/generation-engine/) because mcpgen-ir workspace dep lives at packages/ir/; sed-rewrites [tool.uv.sources] path-source URI before uv sync
- Plan 01-06: removed .python-version from .gitignore so apps/generation-engine/.python-version=3.12 carries on fresh clones (uv reads it; pyenv-compatible tools too)
- Plan 01-07: deferred CF dispatch namespace creation to Phase 10 via in-script exit-78 deferral guard (canonical procedure shipped in Phase 1, blocked from accidental execution); Logto scaffold.ts shipped REFERENCE ONLY (user manually configured prod tenant); fixture QualityReport shape follows actual @mcpgen/ir Zod schema (f1_static/f2_smell.overall_average/f3_agent_eval.pass_rate), NOT the prose interface sketch in plan-frontmatter
- Plan 01-08: local-Bun SSE spike via wrangler dev --local on port 8787 PASSED — 9 events received, last id=8 at t=80s, stream closes at t=90s; real-CF re-spike is a Phase-10 release gate
- Plan 01-08: Phase-10 launch-criteria gate constants (real-CF SSE spike + Fly cold-start) NOT added to launch-criteria.ts in Phase 1 — adding them now would create false-valued constants gating every Phase 2-9 build; Phase 10 owns the addition + verification together (paired decision per T-1-03)
- Plan 01-08: Rule-1 fix committed CLAUDE.md + RULES.md + 11× docs/mcpgen-*.md + claude-design-ui/ to git (commit 1de0589) — these were authored before any phase started but never landed in git, so packages/contracts/tests/launch-criteria.test.ts ENOENT'd on fresh clone breaking Phase-1 success criterion #1
- Plan 01-08: phase-level 01-SUMMARY.md introduced as a distinct artifact from per-plan 01-NN-SUMMARY.md — phase-level holds scope rationale string + per-plan completion table + local port map + Phase-10 carry-forward; per-plan holds task commits + deviations

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- `@modelcontextprotocol/sdk` v1 vs v2 final pick — decide end of Phase 1 via Key Decision in PROJECT.md (per `.planning/research/STACK.md` §6.1)
- IR cross-language source-of-truth direction — recommend TS Zod → Pydantic codegen; lock at Phase 1 (per `.planning/research/ARCHITECTURE.md` R-A6)
- Hono `streamSSE` 30-second sub-request limit on CF Workers — 30-min spike before contract freeze (per `.planning/research/STACK.md` §6.6)
- ~~**Plan 01-04 Task 4 [BLOCKING] — schema push to Neon dev DB pending DATABASE_URL.**~~ RESOLVED 2026-04-26: pushed via direct connection (no Hyperdrive — CF deferral per 01-PHASE-DEVIATIONS.md); 9 tables + pgvector 0.8.0 + TimescaleDB 2.17.1 hypertable confirmed live; evidence in `.planning/phases/01-foundation/01-04-SCHEMA-PUSH-EVIDENCE.md`.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — initial roadmap)* | | | |

## Session Continuity

Last session: --stopped-at
Stopped at: Phase 8 (Auth + Billing) complete: 5 plans / 5 waves / 32 commits / 119+11 tests / live Neon migration pushed; --no-transition gate stops chain here
Resume file: --resume-file

**Planned Phase:** 8 (Auth + Billing) — 5 plans — 2026-04-27T07:11:57.367Z
