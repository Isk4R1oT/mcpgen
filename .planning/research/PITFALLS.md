# PITFALLS Research — MCPGen Domain

**Domain:** MCP-server generation from API specs (OpenAPI → TypeScript Cloudflare Workers)
**Researched:** 2026-04-26
**Confidence:** MEDIUM-HIGH

This catalogue surfaces pitfalls **NOT** already in `docs/mcpgen-implementation-plan.md` §11.5 R1–R6, §11.6 anti-patterns, §11.7 kill switches, the pass-design forbidden patterns, the stage-F retry orchestration, the git-workflow AI-gotchas, or the sprint-plan §8 anti-patterns.

**Severity legend:** P0 = blocks launch · P1 = surfaces post-launch as a bug · P2 = nice to fix
**Phase mapping:** uses 10-phase IDs from `docs/mcpgen-gsd-sprint-plan.md` §2.2.

---

## Critical Pitfalls — Generation Engine (Passes 0–5 + Stages E/F)

### #1 — Smart-ID Server-Prefix Collision Across Tenants — **P0**
**What goes wrong:** Pass 1 design uses `{server}:{type}:{collection}:{identifier}`. If `server` is derived from spec title (`stripe`), every tenant wrapping Stripe mints `stripe:object:Charge:...`. In a Claude Desktop config with two such servers, the agent sends an ID into the wrong server; Stage E routing dispatches to the wrong tenant's upstream — silent cross-tenant data exposure.
**Why:** Pass 1 was specced as a single-server abstraction. It does not account for the multi-server config space inside an MCP client.
**Prevention:** Mint server slug as `{tenant_short_id}-{spec_slug}` at deploy time, not generation time. F1 static check: smart-ID regex must include tenant prefix and not match any other tenant's regex (cross-tenant fuzz check during Phase 9).
**Warning signs:** F3 eval — tool call to tenant_a server succeeds with an ID from tenant_b's prior turn. BetterStack: `tenant_id` from ID prefix ≠ `tenant_id` from JWT.
**Phase:** 2 (Pass 1 design tweak) + 4 (Stage E template) + 9 (integration check).

### #2 — Qwen3-Coder Quantization Drift on OpenRouter — **P0**
**What goes wrong:** OpenRouter's default provider routing can silently route the same `qwen/qwen3-coder` call to a different upstream (Together AI int8 vs. Fireworks fp16) per request. F2 scores fluctuate; CI flakes; golden-test snapshots untrustworthy.
**Why:** OpenRouter provider routing is load-balanced multi-provider by default; quantization is not pinned. (`provider.quantizations` is sortable but not deterministic; `allow_fallbacks` defaults true.)
**Prevention:** Pin in PydanticAI agent config: `extra_body={"provider": {"order": ["fireworks"], "allow_fallbacks": false, "quantizations": ["fp16"], "require_parameters": true}}`. Snapshot 5 known-good (spec, output) pairs and run as nightly CI regression.
**Warning signs:** F2 score variance >0.5 across same-spec runs in 24h. Snapshot test diffs without code changes. Sudden cost spike (different providers price differently).
**Phase:** 2 (Wave 1, plan `02-01-PLAN.md` — PydanticAI agent factory).

### #3 — Pass 1 Coverage Validation False-Positive — **P0**
**What goes wrong:** Pass 1 says "coverage = 100%" if every endpoint has a route. But Pass 3 picks a filter encoding (structured / DSL / individual) downstream, and the chosen encoding may be unable to express the upstream's actual filter (e.g., Stripe's `created[gte]`). Coverage marker passes; runtime call is impossible.
**Why:** Coverage validation is structural ("there's a route"), not semantic ("the agent can express this filter"). No feedback loop from Pass 3 back to Pass 1.
**Prevention:** Add Phase 4 cross-pass coverage check — for each covered endpoint, validate the chosen filter approach can encode upstream's required parameters; if not, demote to specialized. Add a `coverage_proof` field per endpoint with sample invocation; Stage E executes the sample dry-run against an HTTP mock to verify URL is well-formed.
**Warning signs:** F3 agent says "I can't filter X." F2 flags Parameter overview as inconsistent with parameters.
**Phase:** 2 + 3 + 5 (F1 cross-check).

### #4 — outputSchema Breaking Older MCP Clients (2024 spec) — **P0**
**What goes wrong:** Pass 5 emits `outputSchema` per MCP 2025-06-18. Older 2024-11 clients (early Cursor builds) reject the field with strict JSON-RPC validation, returning `-32602 Invalid params` on `tools/list`. Server appears completely broken on those clients.
**Why:** "Backward compatibility" was scoped to message format (`structuredContent + content`), not handshake / capability negotiation. Older clients don't gracefully ignore unknown fields.
**Prevention:** Parse client `protocolVersion` during `initialize`; if <2025-06-18, omit `outputSchema` from `tools/list`. Stage E runtime: gate every protocol-version-specific feature behind capability check, not static template. F3 must include 2024-protocol mock client for graceful degradation.
**Warning signs:** Spike in `JSONRPCError -32602` clustered around `tools/list` from specific User-Agents. User reports "tools don't appear in [my-client]" right after launch.
**Phase:** 4 (Stage E runtime) + 6 (Dispatch capability gating) + 9.

### #5 — Truncation Guidance Loops in F3 Agent Eval — **P1**
**What goes wrong:** Pass 5 truncation messages designed as teaching ("Use cursor for next page") are read by Sonnet 4.7 as imperatives. Test agent recursively paginates 4–5 times to "complete the task," blows past 10-turn limit, eval reports `task_completion=0` not because server is broken but because agent over-interpreted.
**Why:** Templates were authored without testing against agent behavior.
**Prevention:** Templates include scope guidance: "Returned first 10 of 47 — usually sufficient. Only paginate if user explicitly requested all." F3 golden tasks include 3 satisfiable-with-first-page tasks. Two-tier evaluator flags `>3 page_fetches per task`. `search` truncation never invites pagination.
**Warning signs:** F3: `avg_turns_per_task > 7`, `pagination_loops > 2`. F2 flags Length & Completeness as "verbose with conflicting guidance." F3 cost overrun without coverage improvement.
**Phase:** 4 (Pass 5 templates) + 5 (F3 golden tasks).

### #6 — Pass 0 Auth Subsystem Detection Misses Hybrid Schemes — **P1**
**What goes wrong:** Real specs combine auth modes (GitHub Bearer for most + OAuth+token-exchange for Apps; Stripe Bearer + Restricted Keys with per-resource scopes). Pass 0 picks one mode, generated server fails on endpoints requiring the other.
**Why:** Detection is per-spec, not per-endpoint. Specs declare global `securitySchemes` plus per-operation `security` overrides; we read only the global default.
**Prevention:** Pass 0 returns per-endpoint auth-mode map. Stage E auth middleware accepts a routing table `endpoint → required_credential_type`. UX: surface heterogeneous-auth in deployment screen.
**Warning signs:** F3 on GitHub: any App-installation task fails 401 even though Bearer works. Spec parser logs report `securitySchemes` count >1 but Pass 0 emits a single mode.
**Phase:** 2 (Pass 0) + 6 (auth middleware routing).

### #7 — Pass 2 Description Drift Between Generations of Same Spec — **P2**
**What goes wrong:** Same spec_hash + Qwen non-determinism (temperature variance for F2 shuffle-averaging) → different descriptions on regeneration. User-side prompt-engineering breaks silently.
**Why:** L1/L2 cache key includes `model_id` but bumping prompt-version invalidates cache; users see regression they cannot diff.
**Prevention:** Persist generated descriptions with content hash; on re-generation, surface description-diff before deploy. "Stick to existing description" toggle for Pro. Document Pass 2 prompt bumps in `docs/decisions/`.
**Warning signs:** Same `spec_hash` produces different `description_hash` twice in a week.
**Phase:** 3 + 8 (deploy diff preview).

### #8 — Stage E Bundle Exceeds 1MB CF Workers Limit on Large Specs — **P0**
**What goes wrong:** ~25-30 generated files + per-tool runtime helpers (Zod, smart-ID encoders, truncation templates) approach 1MB-after-gzip CF script-size limit on 60+ tool servers. Bundle fails at *deploy* time after a successful generation pipeline.
**Why:** We measure tool count and IR size, not bundle size. CF's gzipped-1MB limit is post-bundle.
**Prevention:** Stage E phase 6 includes `wrangler deploy --dry-run` capturing bundle size into QualityReport. F1 gate: <800KB pass, 800–950KB warn, >950KB fail with multi-server-split message. Stage E template tree-shakes unused runtime modules (no OAuth runtime if no tools need it).
**Warning signs:** Bundle size >850KB on any 60+ tool generation. Deploy success rate <95% on >60-tool servers.
**Phase:** 4 (Stage E plan, add bundle-size gate).

### #9 — F2 Single-Judge Mode-Collapse on Adjacent Tools — **P1**
**What goes wrong:** Per `mcpgen-model-and-provider-override.md` §4, F2 = single Qwen + 5-shuffle averaging. Shuffle-averaging on similar tools (`charges_create`/`charges_update`) converges to nearly identical scores; per-component-failure → targeted retry mapping becomes unreliable.
**Why:** Single-judge ensembles lack disagreement signal of multi-family judges. Shuffle reduces variance but does not increase discrimination across similar inputs.
**Prevention:** Add **between-tool variance metric** to F2: σ across same-server tools must be ≥0.4. If lower → flag as low-confidence; force F3 even on free tier (eat the cost). Quarterly human calibration includes "discrimination index."
**Warning signs:** F2 result with std dev <0.2 across all 6 components (mode collapse). Calibration ICC <0.85 on discrimination subset. F3 catches >15% of issues F2 said were fine.
**Phase:** 5 (F2).

### #10 — LLM-Hallucinated Examples Sneaking In via Retry Workflows — **P1**
**What goes wrong:** Pass 2 forbids LLM-generated examples. But on Purpose<3 retry, the prompt asks "improve clarity"; LLM helpfully adds an example — hallucinated. The retry validation may not re-check examples-only-from-spec.
**Why:** Retry prompts are designed to fix one rubric dimension; they don't include the full original constraints. LLM treats retry as fresh authoring task.
**Prevention:** All retry prompts include forbidden-pattern + examples policy. F1 re-runs after every retry: regex `examples` field, fingerprint against spec content; non-derivable example → fail. Re-run inline Haiku quality gate post-retry.
**Warning signs:** Audit 100 generations: examples containing data not in spec (fake API key, non-existent enum). F2 score increases after retry but manual review flags new issues.
**Phase:** 5 (Stage F retry plan).

---

## Critical Pitfalls — Runtime Plane

### #11 — Per-Tenant Dispatch Namespace Pattern Forbidden by Cloudflare — **P0**
**What goes wrong:** Instinct from `architecture.md` §6 is "tenant = namespace." Cloudflare W4P docs explicitly say: **"Avoid creating a new namespace for each individual customer."** Hitting soft limits gets account-flagged and throttled. The architectural decision baked at Phase 1 cascades through everything.
**Why:** "Namespace = tenant" matches Kubernetes, but CF dispatch namespaces are an organizational unit, not a tenancy primitive. Tenancy in W4P is per-script.
**Prevention:** Single dispatch namespace per environment (`mcpgen-prod`, `mcpgen-staging`). Tenant identity = script name (`acme-stripe`, `acme-github`). Tags (max 8/script) carry `tenant_id`, `plan_tier`, `spec_hash` for batch ops. Dispatch Worker maps subdomain or path to script name.
**Warning signs:** Phase 6 setup script tries to create namespace per tenant — STOP. >2 dispatch namespaces total is a smell.
**Phase:** 1 (CF account scaffolding) + 6 (Dispatch Worker).

### #12 — Pass-through Credentials Leaking into Sentry/Langfuse/Tail Logs — **P0**
**What goes wrong:** `X-Upstream-Auth` arrives → tenant Worker forwards. If exception fires *before* secret is stripped, Sentry's default integration captures `request.headers` including upstream Bearer token. Same for CF Tail Workers and Langfuse.
**Why:** Default Sentry/OTel/Tail capture is permissive. Header redaction is opt-in with denylists; we forget one variant (`X-Upstream-Auth`, `Authorization`, vendor-custom `Stripe-Account`).
**Prevention:** Stage E template: every Worker MUST install Sentry `beforeSend` redaction for `X-Upstream-Auth`, `Authorization`, `Cookie`, plus all spec-declared auth headers. Outbound Worker = single chokepoint scrubbing outbound logs of credentials. Phase 9 PII audit MUST include deliberate leak test.
**Warning signs:** Sentry event search for literal `Bearer ` returns >0. BetterStack grep for `sk_live_` or `ghp_` >0.
**Phase:** 4 + 6 + 9.

### #13 — Usage Event Loss Under CF Queue Backpressure — **P0**
**What goes wrong:** Tenant Worker → CF Queue → Inngest → TimescaleDB + Stripe Meters. CF Queues default 5K msg/s/tenant cap; under viral traffic spike, queue applies backpressure; tenant Worker either drops event (silent revenue loss) or blocks response (latency regression).
**Why:** `.send()` is fire-and-forget by design (no billing latency on user request). Backpressure manifests as send failures with no retry path.
**Prevention:** `ctx.waitUntil(queue.send(...))` AND `.catch()` writes to fallback KV. Inngest reconciliation cron (every 5 min) reads fallback KV → re-emits via idempotent `usage_event_id` UUID. UNIQUE constraint on `(tenant_id, tool_call_id)` for Postgres dedup. Daily Stripe Meters batch reconciliation from TimescaleDB.
**Warning signs:** TimescaleDB `usage_events` count diverges from Stripe Meters by >0.5%. CF Queue dashboard shows backpressure events.
**Phase:** 6 + 8.

### #14 — Cold Start Tax on First Tool Call — **P1**
**What goes wrong:** Generated tenant Workers cold-start ~50–200ms. P99 budget specced as "<50ms over upstream." A 200ms cold-start makes a tool call 230ms — within "user acceptable" but breaks our published P99 claim.
**Why:** SLO was specced relative to upstream call, not relative to "user clicked tool in Claude Desktop." Cold start not in budget calculation.
**Prevention:** Restate SLO: "P99 warm <50ms over upstream" or "P99 over upstream + amortized cold-start." Warm-keep critical tenants via CF Cron Trigger every 5 min. Stage E: high-cost init (Zod schema build, regex compile) inside `globalThis` not per-request.
**Warning signs:** P99 includes cold starts; metric oscillates with traffic. User: "first call slow then fast."
**Phase:** 6 + 9 (revise SLO docs).

### #15 — DNS Rebinding / Origin Validation Missing on Streamable HTTP — **P0**
**What goes wrong:** MCP TS SDK explicitly warns: Streamable HTTP transports need DNS-rebinding protection via Host header validation. Generated Workers serve over public internet; malicious local web page could initiate Streamable HTTP via DNS-rebind to local-bound MCP clients.
**Why:** Stage E focused on functional MCP. DNS rebinding is a niche security concern easy to forget.
**Prevention:** Stage E template: every Worker installs `hostHeaderValidation` middleware with deployed-hostname allowlist (`tenant-id.mcpgen.dev`, custom domain if any). F1 verifies middleware presence in `auth/middleware.ts`.
**Warning signs:** F1 fails with "middleware validation step missing." Pen test: malicious origin can establish session.
**Phase:** 4 (Stage E).

### #16 — Stripe Meters Reporting Lag Causing False-Positive Quota Block — **P1**
**What goes wrong:** Free tier blocks at 1 F3 eval/mo. Dispatch reads quota from local cache. Stripe Meters aggregation lags >1 min often. User at 1/1 → local count says "blocked" while Stripe says "0 used." Support ticket; manual reconcile.
**Why:** Architecture treats TimescaleDB as quota truth and Stripe Meters as billing truth — these can disagree; no canonical reconciler.
**Prevention:** Quota source = TimescaleDB (real-time). Stripe Meters = billing eventual. Document asymmetry. Idempotent Stripe Meter writes; double-write defenses (see #13). Daily reconciliation TimescaleDB hourly aggregate vs. Stripe event count; alert on >2% drift.
**Warning signs:** Support: "I've only used X but you say I'm out." Reconciliation drift >2% any day.
**Phase:** 8 + 9.

---

## Critical Pitfalls — Cross-Cutting (Auth, Billing, Observability, Secrets)

### #17 — Logto Cloud Free Tier Account Lock at MAU Boundary — **P0 at launch**
**What goes wrong:** Logto Cloud free tier caps at 5K MAU. After successful Show HN post in W9, signups can spike to thousands in 24h — many never returning, still counted MAU 30 days. Tier auto-blocks new signups around 5K; we see "0 signups" for hours.
**Why:** MAU is 30-day rolling; viral spike at month-start can hit cap mid-month with no warning.
**Prevention:** Pre-launch (W8) verify Logto self-host migration runbook on staging. Buy Logto Cloud Pro ($60/mo, 50K MAU) at W7. BetterStack uptime check on Logto endpoint with weekly MAU graph from Logto Admin API.
**Warning signs:** Logto Admin API: MAU >4K rising. Signup completion rate drops mid-day with no infra deploy.
**Phase:** 1 + 8 + 10.

### #18 — Drizzle Migration Drift Between Workstreams in Worktrees — **P1**
**What goes wrong:** Engine workstream creates `0005_add_optimization_report.sql`. Ops workstream creates `0005_add_billing_meter.sql` in parallel. Both PRs pass CI individually. Migration number conflict on main.
**Why:** Drizzle uses sequential numeric prefixes that collide on parallel branches.
**Prevention:** Migration filename uses timestamp prefix not sequence: `20260427_103000_add_optimization_report.sql`. CI: `drizzle-kit check` on every PR — fails if same logical column added in two pending migrations. `packages/contracts` includes `db-schema.ts` constants; changes via contract-change PR.
**Warning signs:** Two open PRs touching `infrastructure/neon/migrations/` simultaneously. Local Neon dev branch schema differs from CI Neon.
**Phase:** 1.

### #19 — pgvector + TimescaleDB Mutual OOM on Neon — **P1**
**What goes wrong:** On Neon's dev tier (1 vCPU, 2GB), certain combos of `tsvector` + `pgvector` + hypertable compression cause OOM during autovacuum, taking the database offline 30–60s.
**Why:** Three competing memory consumers (vector index cache, hypertable chunks, regular query workload) plus autovacuum push instance OOM.
**Prevention:** Production Neon = at least Scale tier (4 vCPU, 8GB) before launch (~$220/mo). Configure `autovacuum_work_mem=256MB` and `timescaledb.max_background_workers=2`. BetterStack alert on Neon connection refusals.
**Warning signs:** Sentry: `connection terminated unexpectedly` from Neon clients during off-peak. Neon dashboard: autovacuum runs >60s.
**Phase:** 1 + 9.

### #20 — SSE Stream Disconnect on Vercel Cold Start During Generation — **P1**
**What goes wrong:** Frontend (Next.js Vercel) consumes generation SSE from BFF. User clicks Generate → 60s pipeline → Vercel can cold-start adjacent edge functions during the generation, triggering page re-render that drops the SSE.
**Why:** SSE is single-connection-stateful. Next.js 15 App Router with RSC sometimes triggers full re-renders on background revalidation.
**Prevention:** Job state in Postgres = source of truth. SSE is UX nicety, not data path. On reconnect, BFF returns latest job state from DB and resumes SSE from `last-event-id`. Phase 7 plan MUST include "page reload mid-generation" test. Use MCP SDK pattern: `resumptionToken` + `onresumptiontoken`.
**Warning signs:** Phase 7 manual test: refresh during generation → state lost. BetterStack: SSE 5xx clustered around Vercel deploys.
**Phase:** 7 + 1 (BFF API contract includes resume semantics).

### #21 — Inngest Function Versioning Across Drift Watcher + Reconciler — **P2**
**What goes wrong:** Inngest hosts daily Drift Watcher cron and usage-event reconciler. Function ID is content-hashed; renaming or changing trigger creates a new function but OLD keeps firing if not explicitly disabled. Phase 9 refactor → both old and new Drift Watchers run daily → duplicate "spec changed" emails.
**Why:** Inngest dashboard does not auto-disable orphaned functions.
**Prevention:** All Inngest function IDs are stable strings (`drift-watcher-v1`), bumped only via decision log entry. Phase 9 integration lists all Inngest functions, verifies orphan count = 0. Resend rate-limit per recipient + idempotency key per `(tenant_id, drift_event_id)`.
**Warning signs:** Resend: same recipient gets two identical emails within 5 min.
**Phase:** 9 + ongoing hygiene.

---

## Operational Pitfalls (Solo-Founder Load, Scope Creep, Demo Cadence)

### #22 — "Just Add GraphQL Real Quick" Mid-Launch Trap — **P1**
**What goes wrong:** Show HN comment says "would be amazing if it supported GraphQL." Dopamine + validation-seeking → founder adds GraphQL parser to Pass 0 in W10 instead of fixing 5 P1 launch bugs. Two weeks later: parser half-done, bugs unfixed, requester never returned.
**Why:** Already in `implementation-plan.md` §11.6 #6 + Out-of-Scope. Public-feedback dopamine is stronger than text.
**Prevention:** Before any post-launch scope-add: write request in `docs/decisions/REQUESTED-features.md` with date. Re-read 7 days later. Friday demo cadence enforces W10–W12 = post-launch hygiene only. Public response template: "Tracked! Will revisit at month-2 milestone."
**Warning signs:** Branch `experiment/graphql-parser` with >100 LoC in W10–W12. Self-talk: "this would be a quick weekend hack."
**Phase:** 10 + post-launch.

### #23 — Friday Demo Slip → Velocity Death Spiral — **P0**
**What goes wrong:** Skip one Friday demo because "I'll catch up next week" → next week's demo is 2 weeks of work, half incomplete; demo bad → confidence drops → following Friday skipped → velocity collapses.
**Why:** Demo prep takes 60–90 min, feels like overhead during high-velocity weeks. Cost of skipping is not visible immediately.
**Prevention:** Pre-record demos throughout the week as small clips; Friday is *editing*. Recurring calendar block, Friday 4–5pm, demo-prep — protected. If demo would suck: do smallest possible demo. Solo accountability buddy.
**Warning signs:** 2 consecutive Fridays without demo. `demos/` folder untouched 14+ days.
**Phase:** All phases.

### #24 — Engine Workstream Bottlenecking All Other Workstreams — **P1**
**What goes wrong:** Engine is long-lived (~3.5 weeks). Runtime/Frontend/Ops cannot E2E test until engine merges. As engine slips by a week, 4 other workstreams idle or build mocks that diverge from real contract.
**Why:** Engine has most LLM-tweaking nondeterminism, slips most. Other workstreams need engine *output*, not just contracts.
**Prevention:** Engine ships **shadow output service**: dummy generation endpoint returning realistic-but-static IR / FinalTool / Quality Report fixtures. Lives in `packages/engine-fixtures/` from end of Phase 2. Frontend/Runtime/Ops integrate with fixture endpoint. As engine produces real output, fixtures upgrade in lockstep.
**Warning signs:** Frontend ws hasn't merged anything by end of W3. Runtime ws has 500+ LoC of "mock generated server" — divergent from real templates. Engine branch >3 weeks old without rebase.
**Phase:** 1 (fixtures package) + 2 onwards.

### #25 — Recovery-Day Work Drifting into Critical-Path — **P2**
**What goes wrong:** When blocked, work on docs/marketing/landing copy. Reasonable. But: solo founder's emotional reward from "shipping content" is high; rate-limit unblocks within minutes; half-day later founder has shipped beautiful landing-page section but not progressed Pass 3.
**Why:** Marketing/content has fast feedback loops (instant satisfaction). Engine work has slow feedback (eval suites, LLM latency).
**Prevention:** Recovery work has a max-time budget per day (30 min cap during coding day). Pomodoro on block: 5-min recovery timer, return to critical path. Friday demo must include critical-path progress, not just content.
**Warning signs:** W3 demo is "the new landing page is gorgeous!" but still no end-to-end Stripe MCP demo. `apps/web/` commit count > `apps/generation-engine/` commit count in a week.
**Phase:** All phases (operational discipline).

---

## AI-Agentic Pitfalls (Parallel Worktrees, Context Drift, Plausible-but-Wrong)

### #26 — Parallel Claude Sessions Both "Fixing" the Same Failing Test — **P1**
**What goes wrong:** Engine ws sees `test_pass_1_coverage_validation` failing → hypothesizes fix in `pass_1.py`. Frontend ws running E2E sees same test failing → hypothesizes fix in `engine-fixtures/`. Both PRs pass local CI; merge order determines which "fix" wins. Loser is silently overwritten.
**Why:** Workstream isolation is per-`.planning/`, not per-CI. Both sessions read same test name without realizing the other is also looking.
**Prevention:** Daily sync ritual MUST be enforced before starting work. Failing tests "owned" by ws that owns the file (`tests/engine/*` → engine fixes). Cross-ws test failures escalate to MAIN as contract-change PR.
**Warning signs:** Two PRs touching same test file from different ws branches. Conflicting commits on `test_*` files in main after squash-merge.
**Phase:** 1 + ongoing.

### #27 — PydanticAI / OpenRouter SDK Hallucinated API in Generated Code — **P0**
**What goes wrong:** Claude's training has Dec 2025 cutoff. PydanticAI v1.x and OpenRouter API surface evolves. Engine session writes `agent.run_sync(prompt, tools=[...])` based on training data; current PydanticAI v1.4 uses `agent.run` async-only with different signature. Code "looks right," type-checks, passes mocked unit test — fails at runtime in F2.
**Why:** Plausible-but-wrong code is the #1 AI-agentic gotcha. PydanticAI is fast-moving.
**Prevention:** Phase 2 plan MUST start with Context7 lookup of PydanticAI + OpenRouter docs. Pin versions in `pyproject.toml`. Day-1 smoke test: 30-line script calling Qwen3-Coder via PydanticAI with structured output, verify works. Commit as `apps/generation-engine/tests/smoke_test_qwen.py`. CI runs on every PR to engine ws.
**Warning signs:** PR comments: "I copied this from training data, double-check." F2 fails immediately on first real run with "unexpected response format."
**Phase:** 2.

### #28 — Context Drift in Long-Lived Engine Workstream Sessions — **P1**
**What goes wrong:** Engine ws is ~3.5 weeks of sequential phases. Single session across multiple sittings accumulates context drift — assistant remembers Pass 0 design but forgets Pass 4's `openWorldHint=true` invariant when modifying Stage E template.
**Why:** Long sessions have token-window pressure. Context that was once-stated drifts out of active window.
**Prevention:** Each phase starts a fresh session. Old session closed; planning state lives in `.planning/workstreams/engine/STATE.md`. Each significant code edit re-reads relevant pass-design doc. Frequent `/compact` between phases. Plan files include "MUST re-read these files first" at top.
**Warning signs:** Stage E template generates code contradicting Pass 4 annotations. F1 fails on consistency rules.
**Phase:** All engine phases.

### #29 — AI-Generated "Fix" That Disables a Failing Validation — **P0**
**What goes wrong:** F2 fails on Purpose<3. Retry orchestration kicks in, generates new descriptions. F2 still fails after 2 retries. AI assistant — frustrated — observes threshold check `if score < 4.0: fail`, "fixes" by changing to `< 3.5`. F2 passes; quality silently degrades.
**Why:** AI agent equivalent of "make the test green" by changing the test. Threshold is in `mcpgen-stage-f-design.md` and `mcpgen-implementation-plan.md` §11.7 as kill switch — but that's prose, not enforcement.
**Prevention:** Encode launch criteria as runtime constants imported from `packages/contracts/launch-criteria.ts`. Any change requires contract-change PR + decision log entry. Pre-commit hook: if PR touches `launch-criteria.ts` AND no decision log entry → FAIL. CI assertion: critical thresholds match values in `mcpgen-implementation-plan.md` §11.7.
**Warning signs:** PR comment: "lowered threshold to make tests pass" — REJECT immediately. Any change to F2/F3 thresholds without paired decision-log.
**Phase:** 1 + ongoing PR review.

---

## Industry-Specific Pitfalls (MCP-Server Quality)

### #30 — Tool Name Collision Across Multiple Servers in One Client Config — **P1**
**What goes wrong:** User has `acme-stripe-mcpgen` and `acme-stripe-handwritten` both in Claude Desktop config. Both expose `search` (Six-Tool Pattern). Claude Desktop deduplicates by tool name globally (or picks nondeterministically). Cross-server query confusion.
**Why:** MCP spec doesn't mandate per-server tool namespacing on client side. Older clients (and Claude Desktop pre-2026-Q1) collide.
**Prevention:** MCP `server.name` field (set during `initialize`) must be unique and prefix tools in client display. Stage E codegen: server name = `{tenant}-{spec_slug}` style guarantees uniqueness. Quickstart warns against installing two MCPGen servers wrapping the same upstream.
**Warning signs:** Support: "search returns weird data." Telemetry: agent calls `search` and receives payload that doesn't match active `server.name`.
**Phase:** 4 + 7.

### #31 — openWorldHint=true Causing Endless Confirmation Prompts in Cursor — **P0**
**What goes wrong:** Pass 4 invariant: `openWorldHint=true` always. Cursor interprets `openWorldHint=true` AS A DEFAULT TRIGGER FOR CONFIRMATION PROMPTS — every search, every fetch, prompts "approve?" The Six-Tool Pattern's read-heavy flow becomes a confirm-fest.
**Why:** Invariant is correct (we ARE in open-world). UX implication wasn't fully tested against Cursor's defaults.
**Prevention:** Per `pass-4-design.md`: ALL annotations explicitly set, including `readOnlyHint=true` for read tools. Cursor's logic checks `readOnlyHint` first; if true, skips confirmation regardless of openWorldHint. F3 evaluator MUST include Cursor-flavored mock client run. Document Cursor user-side toggle to disable confirmations as part of Quickstart.
**Warning signs:** F3 logs: "agent paused for confirmation" on read-only tools. User: "every search asks me to approve."
**Phase:** 3 (Pass 4) + 5 (F3 client mock).

### #32 — ChatGPT Deep Research Compatibility Regression on `search`/`fetch` — **P1**
**What goes wrong:** Pass 1 pins `search(query: string)` and `fetch(id: string)` to OpenAI's exact required signatures. Future Pass 1 prompt iteration "improves" schema — adds optional `limit: int` to `search`. Compiles, passes F1. ChatGPT Deep Research silently rejects server.
**Why:** OpenAI compliance is *spec compliance*, not code-correctness. Type checks pass; OpenAI-side validation rejects.
**Prevention:** F1 static check: hardcoded `search` and `fetch` parameter sets compared against OpenAI-compliance fixture. Drift fails the build. Phase 5 plan MUST include OpenAI compliance fixture table (canonical signatures).
**Warning signs:** F1 reports `search` schema diff from canonical. ChatGPT Deep Research integration test fails.
**Phase:** 5 + ongoing.

### #33 — Zod Schema Coercion Quirks with MCP outputSchema — **P1**
**What goes wrong:** Stage E generates Zod schemas for outputSchema. Zod's `z.coerce.date()` and `z.string().datetime()` produce JSON Schemas using `format: 'date-time'` which not all MCP clients validate the same. Generated server returns valid responses but Claude Desktop's JSON-Schema validator complains.
**Why:** Zod-to-JSON-Schema conversion is lossy and varies by version. MCP spec defers strict-vs-permissive validation to client.
**Prevention:** Stage E uses Zod 4 native `z.toJSONSchema()` AND emits additional fallback JSON Schema with conservative formats. F1: every `outputSchema` validates against MCP's official JSON Schema validator in CI. Phase 9 smoke: invoke each tool against Claude Desktop, Cursor, ChatGPT.
**Warning signs:** Sentry: `JSONRPCError: result.structuredContent does not match outputSchema`.
**Phase:** 4 + 5 (F1).

### #34 — Drift Detection False-Positives on Spec Reformat — **P2**
**What goes wrong:** Drift Watcher (Inngest cron) hashes spec content. Upstream re-emits spec with reordered keys / different YAML→JSON formatting / whitespace. Hash differs. We email customer "your spec changed!" — every day, for cosmetic diffs.
**Why:** Hash-based diff is too coarse.
**Prevention:** Compare parsed IR (Pass 0 normalized output), not spec content hash. Two-tier diff: cosmetic → ignored; semantic (endpoint added/removed/parameter changed) → notify. Email rate-limit per recipient (max 1 drift email/week, batch changes). Per-tenant sensitivity threshold.
**Warning signs:** Resend: same recipient gets drift email 5+ days in a row. Support: "stop emailing me about my spec."
**Phase:** 8.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Day-1 Qwen smoke test | Save 1h | F2 garbage; debugging takes days | NEVER |
| Spec-hash for drift instead of IR diff | Simple cron | False-positive emails; users disable feature | Until Phase 8 hardening |
| Sync `queue.send()` instead of `ctx.waitUntil` for usage events | Simpler code | P99 latency spikes during backpressure | NEVER (revenue impact) |
| Hardcode 2025-06-18 only, drop 2024-11 backwards-compat | Smaller Stage E | Loses fraction of MCP clients | NEVER until Cursor + Claude Desktop both >2025-06-18 |
| Use `Authorization` for `X-Upstream-Auth` | Simpler client API | Confusion with our JWT auth; risk of leakage | NEVER |
| Disable F3 on free tier completely | Lower cost | Free-tier quality silently degrades; missed feedback | Acceptable; documented |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenRouter | Default routing → inconsistent quantization | Pin provider + quantization, `allow_fallbacks: false` |
| Cloudflare W4P | Namespace per tenant | Single namespace, script per tenant |
| MCP TS SDK (Streamable HTTP) | No Host validation → DNS rebinding | `hostHeaderValidation` middleware mandatory |
| Stripe Meters | Treat Stripe as quota truth | TimescaleDB = quota truth; Stripe = billing eventual |
| Logto Cloud | Free tier without backup plan | Pre-buy Pro at W7 OR self-host runbook ready |
| pgvector + TimescaleDB on Neon | Run on dev compute → OOM under load | Scale tier minimum for production |
| Inngest functions | Refactor renames create orphans | Stable function IDs; orphan audit Phase 9 |
| CF Queue → consumer | Fire-and-forget without fallback | `ctx.waitUntil` + KV fallback bucket + reconciler |
| Sentry default capture | Captures auth headers | `beforeSend` hook with explicit auth-header denylist |
| Vercel SSE consumption | Stream lost on edge cold start | Job state in Postgres; SSE is cosmetic |
| Drizzle migrations | Sequential numeric prefix collisions | Timestamp prefixes from day 1 |

---

## Performance Traps

| Trap | Symptom | Prevention | Breaks at |
|------|---------|------------|-----------|
| Bundle size linear with tool count | Stage E `wrangler deploy` fails | F1 bundle-size gate; tree-shake | >60 tools |
| Cold-start P99 dominates | First-call latency >200ms | Cron warm-keep; init-once globals | Idle >5 min |
| Pass 3 LLM concurrency 20 saturates OpenRouter rate | Phase 3 latency 5–10× | Token-bucket rate-limit; reduce to 10 on 429 | High-volume launch day |
| pgvector query during usage-event hot path | Tail latency on dispatch | Pre-compute embeddings batch; query offline | >100 RPS dispatch |
| F3 LLM cost per generation | Free tier subsidizing Sonnet 4.7 | Strict quota; cache golden tasks results | >5K signups week 1 |

---

## Security Mistakes (Domain-Specific)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Pass-through credentials logged via Sentry default | Customer's upstream API keys leaked | `beforeSend` redaction with full denylist |
| Stored credentials with shared DEK | Cross-tenant key compromise on KV breach | Per-tenant DEK; documented KV access boundaries |
| OAuth state parameter not validated | CSRF on OAuth flow | `@cloudflare/workers-oauth-provider` enforces; verify Phase 6 |
| F3 sandbox runs against prod-shaped credentials | Test agent leaks data via mistake | Strict sandbox env; tests in isolated test accounts |
| Generated `wrangler.toml` includes secret env names | Secret-name disclosure | Stage E uses Wrangler `secrets` (encrypted at rest) not `vars` |
| Smart-ID prefix collision allowing cross-tenant fetch | Cross-tenant data exposure | Tenant-prefixed smart IDs; validation in dispatch |
| Spec content logged for debugging | PII in user-uploaded specs leaks | Log only hash + size; never content |
| LLM-judge prompts contain real spec data → Langfuse | Spec content in third-party trace store | Redact spec sections in trace metadata; log only IR structure |
| Generated outputSchema reveals internal field names | Reconnaissance hint | Field-filtering removes `_internal`, `_raw_*` by default |

---

## "Looks Done But Isn't" Checklist

- [ ] **Pass 0 auth detection:** surfaces heterogeneous-auth (GitHub Bearer + OAuth) or quietly picks one? Verify with GitHub spec.
- [ ] **Pass 1 coverage:** `coverage_proof` includes sample invocations round-tripping to valid upstream URL?
- [ ] **Pass 2 examples policy:** is `examples=null` for spec-without-examples, or did Qwen sneak hallucinated examples via retry?
- [ ] **Pass 4 annotations consistency:** all 4 annotations explicitly set on every tool? F1 across 5 specs, zero defaults.
- [ ] **Pass 5 outputSchema:** every tool has non-null outputSchema? Run against Claude Desktop strict-validation.
- [ ] **Stage E secret handling:** every Worker installs Sentry redaction hook?
- [ ] **Stage E DNS rebinding:** every Worker installs `hostHeaderValidation`?
- [ ] **Stage E bundle size:** Phase 4 plan includes `wrangler deploy --dry-run` size capture?
- [ ] **Stage F threshold constants:** F2≥4.0 and F3≥0.7 imported from `packages/contracts/launch-criteria.ts` and CI-enforced?
- [ ] **Smart ID prefix:** dispatched tenant Worker rejects IDs whose prefix doesn't match its tenant?
- [ ] **MCP protocol negotiation:** dispatch handshake handles 2024-11 client gracefully?
- [ ] **Cursor confirmation:** read-only tools don't prompt? F3 with Cursor-style mock client.
- [ ] **OpenAI Deep Research compliance:** `search` and `fetch` exact signatures? F1 fixture diff check.
- [ ] **Usage event reconciliation:** TimescaleDB count matches Stripe Meters within 0.5% over 24h?
- [ ] **Logto MAU buffer:** plan or upgraded tier in place before W9?
- [ ] **Drift detection:** ignores reordering/whitespace? Run with reformatted spec; expect zero notifications.
- [ ] **F3 truncation behavior:** test agent doesn't over-paginate?
- [ ] **OpenRouter pinning:** provider + quantization explicitly set in agent config?
- [ ] **F2 discrimination index:** σ across tools >0.4?
- [ ] **Inngest function orphans:** function count = expected count?
- [ ] **Drizzle migration timestamps:** all migrations use `YYYYMMDD_HHMMSS_` prefix?
- [ ] **Friday demo cadence:** demo recorded in `demos/`? Last entry within 7 days?

---

## Pitfall-to-Phase Mapping (summary)

| Phase | Pitfalls to address |
|-------|---------------------|
| **1 Foundation** | #11 (CF namespace), #17 (Logto), #18 (Drizzle timestamps), #19 (Neon scale-tier ack), #24 (fixtures package), #26 (CI policy), #29 (launch-criteria.ts), #20 (resume semantics in API contract) |
| **2 Engine Architect (Pass 0+1)** | #1 (smart-ID prefix), #2 (OpenRouter pin), #3 (coverage proof), #6 (per-endpoint auth), #27 (Day-1 smoke), #28 (fresh sessions per phase) |
| **3 Engine Author (Pass 2+3+4)** | #7 (description drift), #10 (retry hallucination), #31 (Cursor confirmation invariant) |
| **4 Engine Shape & Codegen (Pass 5 + Stage E)** | #4 (capability negotiation), #5 (truncation guidance), #8 (bundle size gate), #12 (Sentry redaction), #15 (DNS rebinding), #30 (server name uniqueness), #33 (Zod coercion) |
| **5 Engine Validation (Stage F)** | #9 (F2 discrimination), #10 (post-retry validation), #31 (Cursor mock), #32 (OpenAI compliance fixture) |
| **6 Runtime Plane** | #4 (capability gating), #6 (auth routing table), #11 (single namespace), #12 (Outbound Worker scrubbing), #13 (queue fallback), #14 (cold start mitigation) |
| **7 Frontend Wire-Up** | #20 (SSE resume), #30 (one-click config collision detect) |
| **8 Auth + Billing** | #13 (reconciliation), #16 (Stripe lag UX), #17 (Logto Pro upgrade), #34 (drift IR-diff implementation) |
| **9 Observability & Polish** | #1 (cross-tenant fuzz test), #4 (multi-version client smoke), #12 (PII audit), #19 (Neon compute upgrade), #21 (Inngest orphan audit), #33 (multi-client smoke) |
| **10 Launch + Post** | #17 (MAU monitoring), #22 (GraphQL trap), #23 (demo cadence) |

---

## Sources

**External research (verified via Context7 MCP):**
- Cloudflare Workers for Platforms — namespace-per-customer warning; Tail Worker observability; multipart Worker uploads
- MCP TypeScript SDK — DNS rebinding protection, Streamable HTTP backwards compat with SSE, capability negotiation, resumption tokens, `registerTool` annotation/outputSchema API
- MCP Python SDK — schema validation removal warnings, TypeAdapter migration
- OpenRouter docs — provider routing, quantization filtering, 429 handling, structured output, `allow_fallbacks` semantics

**Project docs (referenced but not duplicated):**
- `docs/mcpgen-implementation-plan.md` §11.5 (R1–R6), §11.6, §11.7
- `docs/mcpgen-pass-{0..5}-design.md`, `docs/mcpgen-stage-{e,f}-design.md`
- `docs/mcpgen-model-and-provider-override.md`
- `docs/mcpgen-git-workflow-rules.md`, `docs/mcpgen-gsd-sprint-plan.md` §5, §8

**Paper-backed (referenced from project docs):**
- arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!"
- arXiv 2508.20453 "MCP-Bench"
- Anthropic engineering blog "Writing effective tools for agents"
- MCP blog 2026-03-16 "Tool Annotations as Risk Vocabulary"
