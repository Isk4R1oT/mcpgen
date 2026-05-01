---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: "Phase 9.1 plan 01 complete (ed4f8dc): SSR window guards + paired ADR + hook upgrade; SSR build passes; ready to start plan 09.1-02 (BFF auth refactor)"
last_updated: "2026-05-01T10:43:42Z"
last_activity: 2026-05-01 -- Phase 09.1 plan 01 executed
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 110
  completed_plans: 89
  percent: 81
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-26)

**Core value:** Generated MCP servers measurably outperform hand-written ones on agent task success rate — paste an OpenAPI URL → 60 seconds later you have a deployed MCP server that scores ≥4.0 on F2 smell rubric and ≥70% F3 agent task success on golden tasks for that API.
**Current focus:** Phase 09.1 — anonymous-hero-flow

## Current Position

Phase: 09.1 (anonymous-hero-flow) — EXECUTING
Plan: 2 of 13 (next)
Status: Executing Phase 09.1 (1/13 plans complete)
Last activity: 2026-05-01 -- Phase 09.1 plan 01 executed (ed4f8dc): SSR window guards + paired ADR + hook upgrade

Progress: [████████░░] ~81%

## Next

Continue with Phase 10 plans 10-01, 10-02, 10-04..10-14 per `.planning/phases/10-launch/`.
Plan 10-03 unblocks post-launch debugging (Langfuse session correlation) +
post-launch hotfix migrations (`drizzle-kit push` matview block resolved).

## Performance Metrics

**Velocity:**

- Total plans completed: 26
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 9 | - | - |
| 5 | 11 | - | - |
| 07 | 6 | - | - |

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
| Phase 02 P01 | 25min | 4 tasks | 5 files |
| Phase 02 P02 | 30min | 2 tasks tasks | 5 files files |
| Phase 02 P03 | 9 | 3 tasks | 18 files |
| Phase 02 P04 | 12min | 2 tasks tasks | 20 files files |
| Phase 02 P05 | ~50min | 3 tasks | 7 files |
| Phase 02 P06 | 36min | 3 tasks | 9 files |
| Phase 02 P07 | 95min | 2 tasks tasks | 12 files files |
| Phase 02-generation-engine-architect-pass-0-1 P08 | 150 | 2 tasks | 8 files |
| Phase 02-generation-engine-architect-pass-0-1 P09 | 17min | 5 tasks | 18 files |
| Phase 04 P14 | ~180min | 3 tasks | 15 files |
| Phase 04 P15 | 90 | 3 tasks | 17 files |
| Phase 09 P01 | 33min | 3 tasks tasks | 10 created + 9 modified files |
| Phase 09 P02 | 18min | 3 tasks | 7 files |
| Phase 09 P03 | 9min | 3 tasks tasks | 11 files (6 created, 5 modified) files |
| Phase 09 P04 | 13min | 2 tasks tasks | 7 files (5 created, 2 modified) files |
| Phase 09 P06 | 3min | 1 task tasks | 1 file (created) files |
| Phase 09-observability-polish P07 | 12min | 1 task (TDD) tasks | 8 files (3 created, 5 modified) files |
| Phase 09 P05 | 50min | 3 tasks | 19 files |
| Phase 09 P10 | 5min | 2 tasks tasks | 7 files (6 created, 1 modified) files |
| Phase 09-observability-polish P08 | 7min | 2 tasks tasks | 2 files (created) files |
| Phase 09-observability-polish P09 | 25min | 2 tasks tasks | 3 files (2 created + 1 summary) files |
| Phase 09 P11 | 23min | 3 tasks tasks | 9 created + 3 modified files files |
| Phase 09.1 P01 | 3min | 4 tasks | 14 files (11 JSX guarded + 1 ADR + 1 hook upgraded + 1 hook unit test) |

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
- Plan 02-01: PEP 695 type-parameter form (def make_agent[T: BaseModel](...)) used in agent_factory.py instead of T = TypeVar("T", bound=BaseModel) — pre-commit ruff hook auto-fixes UP047 and strips noqa as unused; PEP 695 is semantically identical and project-canonical for Python 3.12+
- Plan 02-01: conftest.py primes OPENROUTER_API_KEY=sk-or-test-PLACEHOLDER at MODULE scope (not just via _sandbox_env autouse fixture) — test modules now import mcpgen_engine.llm.agent_factory at top level which transitively constructs the MODEL singleton at import time; per-test fixture runs too late
- Plan 02-01: _PROVIDER_ROUTING annotated dict[str, dict[str, object]] (not bare dict) — mypy disallow_any_generics rejects untyped dict; object preserves heterogeneous values (list[str] / bool / list[str] / bool) without leaking Any
- Plan 02-02: Stage A — RawIR.dependency_graph kept as Phase-1 FROZEN Dict[str, List[str]] adjacency map (NOT edge-list with resource label as plan body suggested) — zero IR mutation; resource label discarded after correlation
- Plan 02-02: bare 'id'/'uuid' field names DROPPED from dep-graph harvest — only namespaced IDs (charge_id, customer_uuid) and bare resource hints used as path params (charge, customer, len > 2) emit edges; prevents quadratic blowup at Stripe scale
- Plan 02-02: Endpoint.extensions field NOT added (FROZEN IR has extra='forbid'); Pitfall E GitHub x-extensions consumed by Pass 0 directly from resolved-dict surface, not via RawIR.endpoints
- Plan 02-03: extended IR additively with SampleInvocation + CoverageProof + per-endpoint auth_requirements (Dict shape) + prompt_injection_warnings + Pass1Output.coverage_proof; paired decision doc records justification (zero existing consumers; D-21 + Pitfall E require Dict shape)
- Plan 02-03: 10 hand-authored fixture JSONs (Stripe/GitHub/Notion/Linear/Slack × pass-0/pass-1) ship as fixtures-as-contract truth target; smart-ID format ships SCHEMA-LEVEL only at Phase 2 (no tenant prefix per D-31)
- Plan 02-04: chose pure bun:test over vitest for CLI tests (per VALIDATION.md 'Framework (CLI): bun test') — no vitest.config.ts or bunfig.toml needed; Bun 1.3.5 picks up tests/**/*.test.ts by default
- Plan 02-04: widened apps/cli/tsconfig.json include to add 'tests/**/*' so pnpm typecheck strictness gate covers test files (mirrors engine ruff src=['src','tests'])
- Plan 02-04: Wave-0 stubs import only the test framework (pytest / bun:test); no try/except ImportError or pytest.importorskip — every test always skips, so omitting code-under-test imports keeps mypy --strict clean
- Pass 0 deterministic stages (filter/auth_detect/validation) ship with sidecar Mapping parameters for vendor extensions and operation-level security since the frozen IR Endpoint model has no extensions/security fields — Plan 02-06 will populate from raw spec dict in the orchestrator.
- UserOptions, Pass0LlmOutput, CapsEnforcementResult Pydantic models live engine-locally rather than in mcpgen_ir.types because the Plan 02-03 IR codegen only authored the final Pass0Output shape — Plan 02-06 promotes them to public IR if the LLM contract finalizes them.
- Catch BOTH pydantic.ValidationError AND pydantic_ai.UnexpectedModelBehavior in Pass 0 LLM validation-retry loop — PydanticAI's tool-call validation surfaces as the latter once max_result_retries exhausts
- Pass 0 degraded fallback ceiling at 80 kept endpoints — beyond that the fallback would itself trigger MULTI_SERVER_SPLIT_REQUIRED, so re-raise instead
- Module-level PASS_0_AGENT singleton via make_agent — sampling/extra_body propagation at .run() time via model_settings=PASS_0_SETTINGS
- Chunked Phase 2 (cross-cluster composite hints) is best-effort: failures degrade to empty hints rather than poison the chunked pipeline
- Plan 02-07 — split __init__.py across Task 1 (minimal re-export skeleton) + Task 2 (full LLM-bearing run() orchestrator) to avoid circular import on schema_synth.py at Task 1 commit
- Plan 02-07 — coverage_pct(raw_ir=...) excludes Pass 0 source_endpoints absent from raw_ir.endpoints; coverage_proof de-duplicates by endpoint_id
- Plan 02-07 — Pass 1 retry loop on coverage gap re-fires only synthesize_universal_tools (extras unchanged across retries)
- Plan 02-07 — spec_title threaded through pass_1.run(...) as a separate argument (RawIR has no info.title field)
- Filesystem L1/L2/L3 cache w/ engine_version-embedded sha256 keys + 30-day mtime TTL + atomic tempfile-rename writes; KISS-duplicated layers (refactor when Phase 6 R2 lands)
- Stable SSE error codes are stage-stable (STAGE_A_FAILED / PASS_0_FAILED / PASS_1_FAILED / INTERNAL_ERROR), with stage-specific subcode in error.message — keeps the CLI/frontend routing surface narrow
- L1 store uses model_dump(by_alias=True) so SecuritySchemes.in_ round-trips losslessly through model_validate (caught during T-2-D1 implementation)
- Hand-rolled SSE wire generator (no sse-starlette dep) — 12-line generator, exact frozen-Phase-1 contract fidelity
- Plan 02-09: drove MCP Inspector E2E via direct stdio JSON-RPC handshake (initialize → notifications/initialized → tools/list) — more reliable in CI than spawning the GUI Inspector binary; faster (no fresh npm install per test)
- Plan 02-09: added @modelcontextprotocol/sdk + zod as direct deps of @mcpgen/cli so generated server.ts can resolve them via apps/cli/node_modules symlinked into test tmpdir (avoids costly per-test npm install in inspector E2E)
- Plan 02-09: GET /api/v1/generate/{job_id}/artifacts re-derives spec_hash by re-running deterministic Stage A on stored job parameters and reads L1 directly — keeps engine in-memory _JOB_TABLE small. Phase 6+ migrates to Postgres generations.artifacts JSONB
- Plan 02-09: notion/linear/slack live-fetch skipped in 5-fixture parametrized E2E — those fixtures' upstream spec_url values point to GraphQL / REST docs portals (not raw OpenAPI 3.x JSON which D-12 requires); structural-equivalence assertion turns on automatically when Phase 4+ adds GraphQL ingestion
- Plan 02-09: init.perf cold-cache budget asserts <90_000ms (D-46 soft cap, hard CI fail threshold) — the 60s M1 target is recorded manually in 02-PHASE-VERIFICATION.md since CI macos-arm64 is approximate hardware
- D-3 assertion checks TS string literals only — comments are intentional
- MCP handshake test requires Host + Accept + Bearer + SSE parsing
- dev_local=False default at CLI flag, contracts, and scaffold parameter layers
- McpServer.registerTool(name, config, cb) is canonical SDK v1 (1.6+) form for outputSchema-bearing tools — deprecated 5-arg server.tool() silently drops outputSchema
- json_schema_to_zod Jinja2 filter converts Pass 5 JSON Schema dicts to Zod TypeScript expressions — SDK AnySchema requires Zod types, not plain JSON objects
- Plan 09-01: thin-shim apps/web/src/lib/sentry/redact.ts preserves Phase 7 plan 07-06's 17 vitest unit tests via backward-compat aliases (REDACTED_HEADERS array shape) while delegating implementation to shared @mcpgen/contracts/sentry-redaction.redactBeforeSend
- Plan 09-01: apps/dispatch wraps {fetch: app.fetch} ExportedHandler via withSentry, then re-attaches port to wrapped handler — Bun's {port,fetch} shape is not an ExportedHandler but withSentry accepts ExportedHandler only; compose dance preserves both Bun port-export and Sentry CF Workers wrapper contract
- Plan 09-01: Stage E template sentry_redact.ts.j2 inlines denylist (Option a) with 'Phase 9 D-03 convergence' pinning comment — tenant Workers ship as stand-alone bundles without @mcpgen/contracts workspace dep
- Plan 09-01: cross-app test isolation — apps/dispatch sentry assertions moved to apps/dispatch/tests/instrumentation.test.ts because TS rootDir constraints reject cross-app imports from apps/api/tests
- Plan 09-01: sentryOptionsFor return type explicit CloudflareOptions across apps/api + apps/dispatch — lets withSentry callback typing compose via Sentry structural typing (ErrorEvent extends SentryEventLike)
- Plan 09-02: hand-authored FROZEN-prefix migration 20260430000000_phase9_badge_public.sql with idempotent ADD COLUMN IF NOT EXISTS pattern (Phase 8 precedent); inline T-9-mig-01 mitigation repaired Phase 8 snapshot 20260428000002 prevId from 36509bbb (init) to 12c6731a (idempotency_key) per journal idx-2 chain order — drizzle-kit:check now exits 0
- Plan 09-02: drizzle-kit push tripped on Phase 8 usage_hourly matview WITH NO DATA (deferred); applied ALTER TABLE directly via @neondatabase/serverless HTTP driver — surgical, scoped, verified via information_schema query
- Plan 09-03: BFF endpoint method/body MUST match frontend Route Handler proxy — PATCH /badge-public + body { public_badge: boolean }, NOT POST + { public }; the frontend tests + 14 dashboard-client tests assert the proxy contract verbatim and changing it would 502 dashboard live mode
- Plan 09-03: selective barrel re-export from packages/contracts/src/index.ts excludes wire-shape Deployment to avoid TS2308 collision with the Drizzle InferSelectModel Deployment in db-types.ts; wire-shape consumers deep-import @mcpgen/contracts/dashboard-api for the wire type alias
- Plan 09-03: deploymentBelongsToOrg extracted to apps/api/src/lib/auth-helpers.ts (verbatim move from drift.ts:48-62) so deployment-list / badge-public / future deploy-status routes share the canonical 4-table JOIN IDOR predicate; drift.ts now imports rather than defines
- Plan 09-04: BFF /deploy/:generationId is POST not GET — frontend Route Handler proxy uses POST with optional override_name body and Idempotency-Key header; following Plan 09-03 frontend-proxy-wins precedent
- Plan 09-04: /usage/hourly aggregates raw usage_events with date_trunc('hour', e.time) instead of querying the usage_hourly matview because the matview lacks upstream_latency_ms / cost; single statement produces every wire-shape field; total_cost_usd stays NULL until Stripe Meters wires Phase 10
- Plan 09-04: /usage/hourly does NOT implement pagination — UsageHourlyResponseSchema exposes only { rows: [...] }; frontend Route Handler does not pass limit/offset; honoring contract truth (Plan 09-03 deviation pattern)
- Plan 09-04: generationBelongsToOrg sister helper added to auth-helpers.ts for routes keyed by generation_id (3-table JOIN generations → projects → org_id); same false-on-either-condition contract as deploymentBelongsToOrg so 404-not-403 defense in depth holds
- Plan 09-04: buildClaudeDesktopConfig pure helper at apps/api/src/lib/claude-desktop-config.ts emits X-Upstream-Auth literal placeholder string only for passthrough mode (T-9-bff-auth-08; never serializes real upstream key per RUN-03 pass-through invariant); stored / oauth modes emit no headers
- Plan 09-06: anti-hardcode regex /id:\s*['"][a-z][a-z0-9-]*-v\d+['"]/ chosen over broader literal patterns — rejects only id-versioned literals so legitimate string ids in other contexts (event names, log messages) pass; T-9-orphan-01 mitigation
- Plan 09-06: TypeScript noUncheckedIndexedAccess required Record<string, string | undefined> cast + explicit toBeDefined() guard before set-add; clearer test failure message than relying on Set.add(undefined) coercion
- Plan 09-07: skip-when-no-token guard at top of scripts/sourcemaps/upload-all.sh — exits 0 immediately when SENTRY_AUTH_TOKEN is empty/unset, preserves D-01 local-mode invariant across all 4 app upload paths
- Plan 09-07: SENTRY_AUTH_TOKEN documented as CI-only in .env.example with explicit T-9-sourcemaps-01 callout (developer-machine compromise = prod source-map write access); Phase 10 CI provisions
- Plan 09-07: DRY_RUN env var gates per-app sentry-cli invocation in orchestrator instead of process-substitution mocking — keeps tests fast, deterministic, and human-runnable
- Plan 09-07: turbo.json sourcemaps:upload registered with cache=false (network side effects) and dependsOn ^build (per-app dist/ must exist)
- Plan 09-05: Wave 0 spike empirically proved Logfire scrubs langfuse.session.id with literal '[Scrubbed due to session]' marker by default — wrapper + scrub callback BOTH mandatory; either alone fails silently. Documented in test_run_tracing_spike.py SPIKE RESULT comment.
- Plan 09-05: Logfire scrubber is pattern-driven — callbacks only fire when path/value matches a regex. Added SPEC_CONTENT_PATTERNS (spec_yaml/raw_ir.openapi/prompt.system/system_prompt) to ScrubbingOptions.extra_patterns so the scrubber visits spec keys (none match Logfire's built-in patterns).
- Plan 09-05: session_id='unknown' placeholder + TODO(09-05) at all 11 agent.run call sites is acceptable per plan acceptance criterion (≥6 of 10 required). Threading generation_id through pass orchestrator signatures deferred to follow-up; wrapper + scrub callback are the D-06+D-07 milestone.
- Plan 09-05: conftest-level logfire silent-config (metrics=False + NoOpMeterProvider) required because pytest filterwarnings=error promotes LogfireNotConfiguredWarning AND logfire 1.3.2 + opentelemetry-sdk 1.41 have a _ProxyCounter.add arity mismatch when metrics enabled.
- Plan 09-10: SentryEventsAdapter mock-now-real-later substitution mirrors Phase 8 D-23 StorageAdapter pattern; same shape (interface + Phase-9 mock + Phase-10 real impl + env flag SENTRY_EVENTS_ADAPTER=mock|real swap) makes Phase 10 carry-forward a single-file change
- Plan 09-10: leak-audit script CLI surface intentionally narrow (--mode mock|real only); test seeding via env-fixture path SENTRY_EVENTS_MOCK_FIXTURE_PATH keeps gitleaks-safe (sentinels live only in tmp test fixtures) and avoids polluting operator-facing flags
- Plan 09-10: 4 distinct exit codes (0 PASS / 1 FAIL leak-found / 2 unexpected error / 3 mode-real-not-implemented) lets operator scripts dispatch on failure mode; --mode real returns 3 cleanly distinguishes Phase-10-pending from leak-found
- Plan 09-08: chose deterministic regex set algebra over Stage E codegen iteration for the 5x5 cross-tenant smart-ID fuzz — same correctness guarantee, 25x cheaper, LLM/network-free, runs in <1s; collision-injection self-test proves the harness catches future Stage E template regressions
- Plan 09-08: dispatch Test 5 (mixed-tenant array-of-IDs) committed as a real it(...) instead of the plan's it.todo fallback — Phase 6 smartIdFuzz already inspects array values via recursive collectSmartIdCandidates; threat T-9-cross-tenant-04 disposition upgraded from accept to mitigate
- Plan 09-09: in-process Python port of capabilityGate.ts mirrors TS byte-for-byte (lex string compare on protocolVersion, deepcopy + pop for outputSchema strip); real-dispatch coverage stays in F3
- Plan 09-09: @pytest.mark.integration NOT used because pyproject.toml strict-markers + integration marker unregistered — file location tests/integration/ is the operative marker
- Plan 09-09: ChatGPT Deep Research multi-client smoke runbook requires cloudflared/ngrok tunneling because OpenAI Connectors need publicly reachable URLs (the only one of 3 clients that cannot point at localhost directly)
- Plan 09-11: outbox depth monitor refactored library + thin-script split (apps/api/src/lib/outbox-depth-monitor.ts + scripts/observability/outbox-depth-monitor.ts) — vite couldn't resolve cross-rootDir .js imports; direct vitest function import is ~3s vs 125s child-process exec timing out at 60s
- Plan 09-11: test-only env-var injection pattern (OUTBOX_MONITOR_FILTER_DEPLOYMENT_ID / THRESHOLD_OVERRIDE / ALERT_LOG_PATH) keeps production CLI behavior unchanged while allowing fast deterministic tests with small row counts (10 vs 10000)
- Plan 09-11: tests/load/** opt-in pattern via apps/api/vitest.load.config.ts (testTimeout 600_000) + default vitest.config.ts exclude — RUN_LOAD_TESTS=1 + DATABASE_URL gated; pnpm test stays fast, pnpm test:load runs Neon OOM repro
- Plan 09-11: outbox depth dedup table deferred — drift_email_log-style PK dedup mentioned in plan would require Drizzle migration (Rule 4 architectural); default sender logs to stderr when RESEND_API_KEY/OPS_EMAIL unset (D-01 invariant); BetterStack runbook step 4 escalation policy 5-min delay handles cadence
- Plan 09-11: D-20 architecture §6 P99 SLO statement now explicit warm vs amortized split (warm < 50ms / amortized < 100ms with 5-min keep-warm cron) per Pitfall #14
- Plan 09.1-01: app.jsx not modified (1-of-12 difference from plan frontmatter `files_modified`) — already SSR-safe (no top-level window references); actual scope = 11 JSX files matching plan acceptance regex `^\s*1[01]\s*$`
- Plan 09.1-01: `.pre-commit-hooks/check-ui-locked.sh` upgrade copies `PAIRED_ADR_PATTERN` regex byte-for-byte from `.github/workflows/scripts/visual-lock-guard.sh:19` instead of inventing new escape-hatch — eliminates local-vs-CI asymmetry (any commit accepted by local hook will also pass CI)
- Plan 09.1-01: `.pre-commit-hooks/check-ui-locked.test.sh` runs each scenario in isolated `mktemp -d` + `git init` temp repos to keep live `git diff --cached` state untouched; 3 cases (no-locked / locked+ADR / locked-no-ADR) collectively prove (a) no-op for non-locked, (b) ADR escape hatch works, (c) regex not weakened (T-9.1-01-05 mitigation)

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

Last session: 2026-05-01T10:43:42Z
Stopped at: Phase 9.1 plan 01 complete (ed4f8dc): SSR window guards in 11 locked JSX + paired UI-lock-bump ADR + check-ui-locked.sh upgraded with paired-ADR escape hatch + new check-ui-locked.test.sh; pnpm --filter web build exits 0 (10/10 SSR pages); next plan 09.1-02 (BFF auth refactor: per-route policy via Hono sub-app)
Resume file: None

**Planned Phase:** 10 (Launch) — 14 plans — 2026-04-30T16:14:39Z
