# Phase 9: Observability & Polish - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `--auto` (all gray areas auto-selected, recommended option chosen for each)

<domain>
## Phase Boundary

Phase 9 wires the **observability triad** (Sentry / BetterStack / Langfuse) across all 4 apps with credential-redaction, runs the **5 cross-phase integration audits** (cross-tenant smart-ID fuzz, multi-client smoke, deliberate-leak PII audit, Inngest orphan audit, Neon Scale-tier verification), and closes the **4 BFF carry-forward endpoints** owed to Phase 7's dashboard so the full local E2E flow (paste OpenAPI URL → 60s → deployed MCP server → dashboard shows it) works end-to-end.

**Requirements covered:** CTRL-08 (observability triad).
**Already validated:** CTRL-09 (stable Inngest function IDs registered Phase 8 — Phase 9 only verifies orphan = 0).

**Out of scope (belongs to Phase 10 launch):**
- BetterStack production targets (apps/web Vercel, apps/api CF Workers, apps/dispatch CF Workers, apps/generation-engine Fly, sample tenant Worker) — Phase 9 wires the SDK + audit script with **public** Logto endpoint only; cloud targets land when CF + Fly deploys land in Phase 10.
- Real CF Queue depth alerts — Phases 1–9 use `usage_events_outbox` Postgres table per Phase 8 D-22; Phase 9 alert is on **outbox row count > 10K** instead. Real CF Queue alert is one-line env-var flip in Phase 10.
- GTM-01..03 (Quickstart docs, Privacy/ToS/Pricing, soft launch) — Phase 10.

</domain>

<decisions>
## Implementation Decisions

### A. Observability triad — local-mode posture (auto: optional-cloud, no-op when DSN absent)
- **D-01:** **Sentry, Langfuse, and BetterStack DSNs/keys live in `.env.local` and the integration code MUST no-op gracefully when a DSN is empty/unset.** Phase 9 wires SDK init code with the `if (!process.env.SENTRY_DSN_*) return` guard (and equivalent for Python `sentry_sdk.init(dsn=os.getenv(...))` — `dsn=None` disables the client by design). *Rationale:* per memory file `project_local_compute.md`, Phases 1–9 run all compute locally; cloud SaaS DSNs are nice-to-have during local dev. Forcing every contributor to provision real DSNs to run `pnpm dev` is hostile to the local-first invariant. Phase 10 promotes from optional to **required-in-prod** via a build-time check (`NODE_ENV=production && !SENTRY_DSN_* → fail build`).
- **D-02:** **Confirmed `.env.local` set:** `SENTRY_DSN_API`, `SENTRY_DSN_DISPATCH`, `SENTRY_DSN_ENGINE`, `SENTRY_DSN_WEB`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`, `LANGFUSE_OTLP_ENDPOINT`, `INNGEST_SIGNING_KEY`. **Missing — Phase 9 ships placeholder + runbook only:** `BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_UPTIME_API_KEY` (user provisions from BetterStack dashboard before Phase 10 — runbook documented in `apps/api/README.md`).

### B. Sentry redaction architecture (auto: shared `beforeSend` helper in `@mcpgen/contracts`)
- **D-03:** **Single `redactBeforeSend()` helper in `packages/contracts/src/sentry-redaction.ts`** consumed by every TS Sentry init (apps/web, apps/api, apps/dispatch, generated tenant Workers via Stage E template). Strips header keys (case-insensitive): `Authorization`, `X-Upstream-Auth`, `Cookie`, `Stripe-Account`, `Stripe-Signature`, `X-Webhook-Signature`, plus any header matching `/^x-.*-(auth|token|key|secret)/i`. Strips request body when content-type is `application/yaml`, `text/yaml`, `application/json` AND path contains `/v1/generate` (spec content). Strips `event.extra.spec`, `event.extra.openapi_yaml`, and any string field containing `Bearer `, `sk_live_`, `sk_test_`, `ghp_`. *Rationale:* SoT redaction across all apps; if we miss one variant, all apps inherit the fix from one PR. Per Pitfall #12.
- **D-04:** **Python equivalent `mcpgen_engine.observability.sentry_redaction.redact_before_send`** mirrors D-03 exactly (header set + body redaction). Hooked via `sentry_sdk.init(before_send=...)` in `apps/generation-engine/src/mcpgen_engine/main.py`. Test: a unit test in BOTH languages feeds canonical attack inputs (`{"headers": {"X-Upstream-Auth": "Bearer sk_live_FAKE"}}`) and asserts the output event has them stripped — regression suite for D-03/D-04 changes.
- **D-05:** **Source maps upload is per-runtime, orchestrated by single `pnpm sourcemaps:upload`** at the repo root (Turborepo target). Per-app: apps/web uses `@sentry/nextjs` auto upload (already wired); apps/api + apps/dispatch use `@sentry/cli sourcemaps upload --release ${VERSION}` invoked from `wrangler deploy` post-build hook (skipped when `SENTRY_AUTH_TOKEN` absent — local mode); apps/generation-engine uses `sentry-cli` Python wheel + `--upload-source` flag on PyInstaller bundle (Phase 10 only — local Python runs from source, no source maps needed). Phase 9 wires the **command + skip-when-no-token** logic; actual production upload runs in Phase 10 CI.

### C. Langfuse session_id correlation (auto: PydanticAI run() metadata via Logfire OTel exporter)
- **D-06:** **Every PydanticAI agent call passes `metadata={"session_id": str(generation.id), "stage": "<pass-N>"}` to `agent.run(...)`.** Logfire's OTel-bridge exporter forwards trace attributes to Langfuse with `session_id` as the trace's session attribute (Langfuse's `trace.session_id` field). Path: PydanticAI Logfire span → OTLP → `LANGFUSE_OTLP_ENDPOINT` → Langfuse Cloud. *Rationale:* `session_id` correlation is the success-criteria checkpoint for CTRL-08 §2; doing it at the run() call site is the smallest plumbing change. Engine workstream (Phases 2–5) already initializes Logfire with `send_to_logfire=False` (per CLAUDE.md §9) — Phase 9 only adds `metadata=...` at every `agent.run()` call (≈ 10 sites across passes 0–5 + Stage F2 / F3 judges).
- **D-07:** **Spec content NEVER appears in Langfuse traces.** Logfire scrubbing rule: any span attribute named `spec_yaml`, `spec_url_response_body`, `raw_ir.openapi`, or `prompt.system` containing `>10K chars` is replaced with `<spec redacted, sha256:...>`. IR structure (tool list, parameter shapes, descriptions) is logged in full. Implemented as `logfire.scrub_processor(...)` registered alongside `before_send`.

### D. Cross-tenant smart-ID fuzz (auto: F1 static check + runtime guard, both layers — defense in depth)
- **D-08:** **F1 static check (Phase 5 territory, but extended in Phase 9 fixture):** Stage F1 already runs per generation. Phase 9 adds a fixture-driven cross-tenant fuzz suite at `apps/generation-engine/tests/integration/test_cross_tenant_smart_id_fuzz.py` that: (1) generates 5 server bundles for 5 tenants × 5 specs; (2) extracts the smart-ID regex from each `apps/.../runtime/smart_id.ts`; (3) asserts that **no two regexes match the same identifier** across tenants. Failing case → assertion error with the colliding regex pair. *Rationale:* per Pitfall #1, this is a P0; F1 already runs per generation but doesn't see across-tenant collisions. Cross-tenant fuzz is structurally a Phase 9 integration check.
- **D-09:** **Runtime guard in Dispatch Worker:** `apps/dispatch/src/index.ts` middleware (already present from Phase 6) MUST extract the tenant prefix from any inbound smart ID in the request body (where applicable — `tools/call` arguments may contain IDs) and assert it matches the dispatched script's `tenant_id` tag. Mismatch → 403 with `cross_tenant_id_blocked` error. **Confirmation step:** Phase 9 adds an integration test `apps/dispatch/tests/cross-tenant-id-block.test.ts` that POSTs a `tools/call` with an ID prefixed with another tenant's slug → asserts 403. *Rationale:* per Pitfall #1, Stage E template already mints `{tenant_short_id}-{spec_slug}` per Phase 4; Phase 9's job is the integration test that proves it works end-to-end.

### E. Multi-client smoke (auto: extend Phase 5 F3 mock-clients + manual runbook for the 3 real clients)
- **D-10:** **Automated half — extend Phase 5's F3 mock_clients** to include a **2024-11 protocol mock client** that DROPS `outputSchema` from `tools/list` requests and asserts the server still responds (per Pitfall #4). This catches "older Cursor build rejects unknown field." Test fixture: `apps/generation-engine/tests/integration/test_multi_protocol_client.py`. *Rationale:* Phase 5 already shipped 3 mock clients; adding a 4th (2024 protocol) is a fixture-only change.
- **D-11:** **Manual half — runbook `docs/runbooks/multi-client-smoke.md`** with 3 sections (Cursor / Claude Desktop / ChatGPT Deep Research), each with: (a) install the client locally; (b) point it at the 5 popular APIs (Stripe, GitHub, Notion, Linear, Slack) deployed via `mcpgen init` (LOCAL — no cloud deploy in Phase 9); (c) run 1 golden task per API; (d) screenshot the success state. Acceptance: 5 golden tasks × 3 clients = 15 successful runs; failures filed as Phase 10 launch blockers. Operator-only (founder runs this once before Phase 10 launch). Phase 9 ships the runbook; W7 of sprint plan executes it.

### F. PII deliberate-leak audit (auto: pytest CI gate + one-off W7 verification)
- **D-12:** **pytest CI gate `apps/generation-engine/tests/security/test_pii_redaction.py` and equivalent vitest `apps/api/tests/security/sentry-redaction.test.ts`.** Test inputs: 6 canonical leak vectors — `Authorization: Bearer sk_live_FAKE_LEAK_XYZ`, `X-Upstream-Auth: ghp_FAKE_LEAK_XYZ`, `Cookie: session=FAKE_LEAK_COOKIE`, request body containing `sk_live_FAKE_LEAK_XYZ`, error message containing `Bearer FAKE_LEAK_TOKEN`, OpenAPI YAML body. Each test forces a Sentry-captured exception via the `redactBeforeSend` helper (D-03/D-04) and asserts NO leak vector appears in the resulting `event` object. *Rationale:* CI gate prevents future regression; one-off W7 verification (Phase 10) confirms cloud-side filtering works against real Sentry instances.
- **D-13:** **One-off W7 audit script `scripts/observability/leak-audit.ts`:** sends a generation request with sentinel values to local Sentry (or staging Sentry once provisioned in Phase 10), waits 60s, queries Sentry events API for `Bearer ` / `sk_live_` / `ghp_` / sentinel string. Asserts zero hits. Phase 9 ships the script with **mocked Sentry events API** (so the test works locally); Phase 10 swaps in the real Sentry org + project IDs. Same script wired to `pnpm leak-audit` for ad-hoc operator use.

### G. Inngest orphan audit (auto: assertion test + one-off audit script)
- **D-14:** **Assertion test `apps/api/tests/inngest/test_orphan_audit.test.ts`:** statically scans every `inngest.createFunction({ id: ... })` invocation in `apps/api/src/inngest/functions/*.ts` (already 7 — confirmed in scout) and asserts the `id` is in `INNGEST_FUNCTION_IDS` from `packages/contracts/src/inngest-functions.ts`. Failing case: function created with id NOT in the registry → CI fails. *Rationale:* CTRL-09 is "stable IDs registered" (Phase 8 ✓); Phase 9's job is the orphan-prevention guarantee. Pure-static, runs in <1s, no Inngest API needed.
- **D-15:** **One-off live audit script `scripts/observability/inngest-orphan-audit.ts`:** queries Inngest CLI dev server (`inngest-cli list` equivalent — uses `/api/inngest` endpoint) and compares running function IDs vs. registered set. Reports orphans. Per memory: Inngest runs locally via `npx inngest-cli@latest dev`, so this is local-friendly. Run weekly post-launch (Phase 10 ops cadence).

### H. Neon Scale-tier verification (auto: synthetic load test — pgbench + pgvector — local-only, runbook for prod)
- **D-16:** **Local synthetic load test `apps/api/tests/load/test_neon_oom_replication.test.ts`:** uses `pg-promise` to fire concurrent (1) `tsvector` full-text query, (2) pgvector ANN query, (3) TimescaleDB hypertable insert + autovacuum trigger, against the LOCAL Postgres instance (`docker-compose.yml`'s `postgres-16` service with `pgvector` + `timescaledb` extensions). Acceptance: zero `connection terminated unexpectedly` errors over 10-min sustained load. *Rationale:* per Pitfall #19, this is a P1; local Postgres has unlimited memory (host machine), so this test exercises the SQL workload rather than the actual Neon-tier OOM. Real Neon Scale-tier verification is Phase 10 (post-Neon-Scale-upgrade smoke).
- **D-17:** **Neon Scale-tier upgrade is a Phase 10 calendar action**, not Phase 9 implementation. Phase 9 ships `docs/runbooks/neon-scale-upgrade.md` (Pitfall #19 step-by-step: snapshot dev branch → upgrade compute tier → set `autovacuum_work_mem=256MB` and `timescaledb.max_background_workers=2` → re-run synthetic load test on real Neon). User executes the runbook at W7 of sprint plan.

### I. Frontend BFF carry-forward endpoints (auto: implement now in Phase 9 — closes Phase 7 dashboard gap)
- **D-18:** **Implement 4 BFF endpoints owed to Phase 7 dashboard** (currently 501 stubs proxied through frontend Route Handlers per `07-05-SUMMARY.md` carry-forward note):
  1. `GET /api/v1/deployments` — lists deployments for the authenticated org (Logto JWT → org_id → query `deployments JOIN generations` for the org). Returns `{deployments: Deployment[]}` matching frontend fixture shape (deployment_id, generation_id, server_name, server_url, auth_mode, deployed_at, quality_report, public_badge).
  2. `GET /api/v1/usage/hourly?from=...&to=...` — TimescaleDB hourly aggregate of `usage_events` for the authenticated org (existing `usage_hourly` continuous aggregate from Phase 1 D-13). Returns `{hours: UsageHour[]}`.
  3. `GET /api/v1/deploy/[generationId]` — single-generation deploy status + quality_report + Claude Desktop config snippet. Returns `{deployment, claude_desktop_config}`. Backed by `deployments` row (or 404).
  4. `POST /api/v1/deployments/[id]/badge-public` — toggles `deployments.public_badge boolean default false`. Body: `{public: boolean}`. Auth: org-owns-deployment check. Returns updated row.
  *Rationale:* Phase 7's dashboard renders against fixtures locally; without these BFF endpoints, `pnpm dev` against `MCPGEN_FRONTEND_MODE=live` returns 502 `bff_unreachable` and the dashboard is empty. Closing them in Phase 9 makes the local E2E paste-URL → 60s → deploy → dashboard flow actually work — which is the success criterion for "Phase 9 closes Phase 7 carry-forwards."
- **D-19:** **Drizzle migration `20260430000000_phase9_badge_public.sql`** adds `deployments.public_badge boolean not null default false` (the column doesn't yet exist per Phase 6/8 schema). Single column, atomic migration. *Rationale:* timestamp prefix avoids collision with Phase 6/8 migrations (Pitfall #18 lesson learned 3× during prior merges).

### J. SLO documentation refresh (auto: revise + commit)
- **D-20:** **Revise `docs/mcpgen-architecture.md` §6 P99 budget statement** from "P99 < 50ms over upstream" to **"P99 warm < 50ms over upstream; P99 amortized (including amortized cold-start over 5-min keep-warm cron) < 100ms over upstream"** per Pitfall #14 prevention. Phase 9 ships the doc edit + a Stage E template addition (`globalThis.__mcpgen_zod_schemas` cache so Zod schema build runs once per Worker instance, not per request). *Rationale:* Pitfall #14 is P1; doc edit is 5-min change; template addition prevents the metric oscillation surfaced under traffic.

### K. Outbox depth alert (replaces CF Queue depth alert per Phase 8 D-22)
- **D-21:** **BetterStack alert (or local fallback `scripts/observability/outbox-depth-monitor.ts`):** monitors `usage_events_outbox` row count where `sent_at IS NULL`. Threshold: alert when count > 10K (matches CTRL-08 success criterion §3 "CF Queue depth alert fires above 10K messages" — same intent, different transport per local-compute pivot). Phase 9 wires the BetterStack heartbeat URL config + a fallback `pnpm outbox:monitor` cron-able script that prints the count and emits Resend email if exceeded. *Rationale:* per Phase 8 D-22, CF Queue is Phase 10; outbox is the local equivalent. Same threshold preserves the alert spec verbatim.

### Claude's Discretion
- Exact Drizzle migration column types, idx names, defaults — planner picks per existing patterns in `infrastructure/neon/migrations/*`.
- BFF endpoint pagination defaults (limit/offset) for `/usage/hourly` — planner picks per Pass 3 standard parameter set in CLAUDE.md §13.
- Sentry release / environment naming convention — planner picks per `@sentry/cli` defaults.
- Logfire span names for redaction processor — planner picks per Logfire convention.
- Specific test file structure (table-driven vs per-vector test) for D-12 — planner picks per existing vitest patterns in `apps/api/tests/`.

### Folded Todos
None — no pending todos matched Phase 9 scope at runtime.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase 9 success criteria + scope
- `.planning/ROADMAP.md` §"Phase 9: Observability & Polish" — Goal + 4 numbered success criteria + Pitfalls mitigated list
- `.planning/REQUIREMENTS.md` §"Control Plane / Backend (ops workstream)" CTRL-08 — observability triad
- `.planning/REQUIREMENTS.md` §"Control Plane / Backend (ops workstream)" CTRL-09 — orphan audit (Phase 8 already validated stable IDs)

### Pitfalls Phase 9 mitigates (must read each before designing the corresponding decision)
- `.planning/research/PITFALLS.md` §"#1 Smart-ID Server-Prefix Collision Across Tenants" — informs D-08, D-09
- `.planning/research/PITFALLS.md` §"#4 outputSchema Breaking Older MCP Clients" — informs D-10
- `.planning/research/PITFALLS.md` §"#12 Pass-through Credentials Leaking into Sentry/Langfuse/Tail Logs" — informs D-03, D-04, D-12, D-13
- `.planning/research/PITFALLS.md` §"#14 Cold Start Tax on First Tool Call" — informs D-20
- `.planning/research/PITFALLS.md` §"#19 pgvector + TimescaleDB Mutual OOM on Neon" — informs D-16, D-17
- `.planning/research/PITFALLS.md` §"#21 Inngest Function Versioning Across Drift Watcher + Reconciler" — informs D-14, D-15
- `.planning/research/PITFALLS.md` §"#33 Zod Schema Coercion Quirks with MCP outputSchema" — informs multi-client smoke (multi-protocol mock)

### Architecture + observability source-of-truth
- `docs/mcpgen-architecture.md` §11 (Observability & Privacy) — Langfuse v4 OTel-bridge pattern, Sentry beforeSend redaction, what's logged vs not
- `docs/mcpgen-architecture.md` §6 (Runtime SLO budget) — REVISED in this phase via D-20
- `docs/mcpgen-architecture.md` §10.2 (Stripe Meters reconciliation, billing-vs-quota asymmetry) — already Phase 8 territory; Phase 9 adds the orphan + drift assertion gates

### Prior phase carry-forwards
- `.planning/phases/07-frontend-wire-up/07-05-SUMMARY.md` — Carry-forward note: BFF endpoints `/deployments`, `/usage/hourly`, `/deploy/*`, `/badge-public` not yet implemented in apps/api (informs D-18, D-19)
- `.planning/phases/07-frontend-wire-up/07-CONTEXT.md` D-15 — frontend Route Handlers expect Cookie forwarding to BFF (informs D-18 auth)
- `.planning/phases/08-auth-billing/08-CONTEXT.md` D-22 — outbox replaces CF Queue Phases 1–9 (informs D-21)
- `.planning/phases/08-auth-billing/08-CONTEXT.md` D-27 — Inngest function ID register at `packages/contracts/src/inngest-functions.ts` (informs D-14)

### Cross-cutting rules
- `RULES.md` — global non-negotiables (no logging spec content, no `--no-verify`, etc.)
- `CLAUDE.md` §9 (Observability & Privacy) — Logfire `send_to_logfire=False`, OTel → Langfuse Cloud, redaction list verbatim
- `docs/mcpgen-git-workflow-rules.md` — Conventional Commits, atomic commits, squash merge

### Local-compute mode (memory)
- Memory `project_local_compute.md` — Phases 1–9 run all compute locally; CF + Fly deferred to Phase 10. Drives D-01, D-05, D-13, D-16, D-17, D-21.

### Live registry / contracts (read to verify orphan audit + endpoint shapes)
- `packages/contracts/src/inngest-functions.ts` — 7 stable function IDs (D-14 set-equality target)
- `apps/api/src/inngest/functions/*.ts` — 7 createFunction invocations (D-14 scan target)
- `apps/web/src/app/api/v1/deployments/route.ts` — frontend proxy expecting BFF endpoint shape (D-18 contract)
- `apps/web/src/app/api/v1/usage/hourly/route.ts` — frontend proxy expecting hourly aggregate shape (D-18 contract)
- `apps/web/src/app/api/v1/deploy/[generationId]/route.ts` — frontend proxy (D-18 contract)
- `apps/web/src/app/api/v1/deployments/[deploymentId]/badge-public/route.ts` — frontend proxy (D-18 contract)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@sentry/nextjs@^10.50` (apps/web), `@sentry/cloudflare@^10.50` (apps/api, apps/dispatch), `sentry-sdk[fastapi]>=2.16` (apps/generation-engine) — already declared. Phase 9 only adds `init()` calls + `beforeSend` hooks; no version bumps.
- `logfire>=1.0` + `opentelemetry-sdk>=1.27` already in `apps/generation-engine/pyproject.toml` — D-06/D-07 wires the existing Logfire/OTel layer to Langfuse via OTLP. No new deps.
- `INNGEST_FUNCTION_IDS` const in `packages/contracts/src/inngest-functions.ts` — single SoT for D-14 orphan audit (set-equality pure-static test).
- Phase 1 `usage_hourly` continuous aggregate (TimescaleDB) — D-18 `/usage/hourly` endpoint reads it directly; no new aggregate needed.
- Phase 6 dispatch worker middleware (`apps/dispatch/src/index.ts`) — extends with cross-tenant ID guard for D-09; existing middleware pattern reused.
- Phase 5 F3 mock_clients infrastructure — extends with 4th 2024-protocol mock for D-10; no new harness needed.

### Established Patterns
- **Drizzle migrations:** timestamp-prefix YYYYMMDDHHMMSS per Phase 1 D-12 + Pitfall #18 (collision lessons). D-19 follows.
- **Optional cloud SDKs:** Phases 1–8 already gate cloud calls behind `if (env.X) {…}`. Phase 9 maintains pattern for D-01.
- **Test naming:** `apps/<app>/tests/security/*` and `apps/<app>/tests/integration/*` exist from Phase 5/6/8. D-12, D-08, D-09, D-14 follow the pattern.
- **Inngest function pattern:** every function in `apps/api/src/inngest/functions/*.ts` uses `inngest.createFunction({ id: INNGEST_FUNCTION_IDS.X, ... }, ...)` — D-14 scan can be a simple AST grep.
- **Storage adapter interface:** `StorageAdapter` from Phase 8 (`packages/contracts/src/storage.ts`) — D-13 leak audit's mocked-Sentry pattern follows this (interface + Phase 9 mock impl + Phase 10 real impl).

### Integration Points
- Apps/api Hono router (`apps/api/src/index.ts`) — D-18 mounts 4 new route files under `apps/api/src/routes/v1/{deployments,usage,deploy}.ts` + extends `apps/api/src/routes/v1/billing/` or new `deployments-badge.ts`.
- Apps/dispatch middleware (`apps/dispatch/src/middleware/`) — D-09 extends.
- Engine `agent.run()` call sites (passes/pass_0/agent.py..passes/pass_5/agent.py + Stage F2 / F3 judges) — D-06 inserts `metadata={"session_id": …}` at every site.
- Stage E template (`packages/codegen-templates/templates/runtime/sentry-init.ts.j2`) — D-03 helper imported from contracts; per-tenant Worker init calls it.
- `.env.local` (gitignored) — D-02 enumerates which DSNs are set vs missing.

</code_context>

<specifics>
## Specific Ideas

- **Single redaction helper** in `packages/contracts/src/sentry-redaction.ts` (D-03) for SoT; mirrored Python helper at `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` (D-04). One PR-able location for any redaction-list expansion (e.g., new auth-header variant detected post-launch).
- **Deliberate-leak sentinel string** suggested: `MCPGEN_LEAK_CANARY_2026Q2` — unambiguous, never legitimate, easy to grep in operator tools.
- **outbox monitoring fallback** (D-21) is a `pnpm` script that can be cron'd locally via `crontab` or `launchd` for the 1-2 weeks between Phase 9 and Phase 10 BetterStack provisioning.
- **Multi-client smoke runbook** (D-11) is the closest analog to F3 agent eval but with REAL clients; 5 APIs × 3 clients = 15 manual runs ≈ 60 min one-time operator work.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
None at runtime.

### Phase 10 (Launch) — explicit deferrals
- BetterStack DSN provisioning + production targets (apps/web, apps/api, apps/dispatch, apps/generation-engine, sample tenant Worker) — Phase 9 ships the SDK wiring + runbook only.
- CF Queue depth alert (replaced by outbox depth alert in Phase 9 D-21) — flip to CF Queue alert when CF deploy lands in Phase 10.
- Real Neon Scale-tier compute upgrade — Phase 9 ships runbook only; user executes at W7.
- Real-Sentry leak audit (D-13) — Phase 9 mocks the events API; Phase 10 swaps in the real Sentry org.
- Production source-maps upload to Sentry (D-05) — wired but skipped without `SENTRY_AUTH_TOKEN`; Phase 10 CI provisions the token.
- Logto Cloud Pro pre-buy (Pitfall #17) — calendar action W7, not Phase 9 implementation.

### Post-launch — explicit non-goals
- Custom Sentry HTML email templates — Logto/Sentry defaults sufficient for v1.
- Embedded Stripe Elements — hosted Checkout sufficient (Phase 8 D-06).
- GraphQL/Postman parser, multi-region runtime, A/B deploys, Team plan / SSO, auto-regenerate on drift — out-of-scope per `RULES.md` §6 / `PROJECT.md` "Out of Scope".

</deferred>

---

*Phase: 09-observability-polish*
*Context gathered: 2026-04-30*
*Mode: --auto (all 11 gray areas auto-resolved with recommended option per area)*
