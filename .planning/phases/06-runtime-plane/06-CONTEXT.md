# Phase 6: Runtime Plane - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Workstream:** runtime
**Mode:** Auto-mode discussion (recommended option selected for each gray area; rationale logged inline)

<domain>
## Phase Boundary

Build the local Runtime Plane for MCPGen: a dispatch layer + per-tenant Worker scripts + 3 auth modes + usage event pipeline + `mcpgen deploy` CLI. **Per the local-compute pivot (memory: project_local_compute), Phase 6 ships local-only — CF Workers for Platforms / Workers / Hyperdrive / Queue / KV deploys are deferred to Phase 10.** All components are authored against the same shapes that the Phase-10 CF deploy will use (`wrangler.toml` committed as deploy reference, never executed in Phase 6).

The runtime plane delivers all 9 Phase-6 requirements:
- **RUN-01..07** (dispatch + tenant Workers + 3 auth modes + usage events + Claude Desktop config block) — implemented locally
- **CLI-02..03** (`mcpgen deploy` + Bun-compiled single binary cross-compile to 4 targets)

**In scope (Phase 6):**
- Local **dispatch worker** on `localhost:8789` (Bun + Hono) — auth precheck, rate-limit, tenant lookup with 5-min TTL cache, MCP `protocolVersion` parsing during `initialize`, capability-gating (`outputSchema` omitted for clients <2025-06-18), dispatch to local tenant Worker process.
- Local **tenant Worker scaffold** runtime (`apps/tenant-worker-runner/` or equivalent) — spawns one Bun process per active deployment on `localhost:8790+` (multi-port instead of CF dispatch namespace lookup); `apps/dispatch-sample` continues to be the canonical reference shape; Phase 4-generated tenant Workers drop into the same shape.
- **`@mcpgen/runtime` real implementations** of the 11 frozen interface methods (smart-ID parse/make, 6 universal-tool routes, response shapers, error teaching) — replaces the Phase-1 `createStubRuntime()` factory.
- **Three upstream-credential modes** (these are credentials for wrapped APIs like Stripe / GitHub upstream calls, **NOT Logto user auth — Logto is Phase 8 ops**):
  - **Pass-through (default):** HKDF-derived per-request decryption of `X-Upstream-Auth`, forward to upstream, never persisted, never logged.
  - **Stored (alt):** AES-256-GCM with per-tenant DEK in **local SQLite** KV emulator (Phase-10 swap: real CF KV). Marked "less secure" with explicit opt-in in UI.
  - **OAuth flow on behalf** (for user-delegated APIs like Google / GitHub user-mode): **STUB implementation in Phase 6** that returns a documented "phase-10 deferral" error. Real `@cloudflare/workers-oauth-provider` integration is **Phase 10**.
- **Usage event pipeline (local-compute):** tenant Worker → `ctx.waitUntil(send_to_inngest_dev(...))` → **local Inngest dev server** (`npx inngest-cli@latest dev`) → Inngest function writes to Postgres TimescaleDB `usage_events` hypertable. Idempotent `usage_event_id` UUID + UNIQUE `(tenant_id, tool_call_id)` for dedup; local SQLite KV fallback bucket on send failure (Phase-10 swap: real CF Queue + CF KV). Daily reconciliation cron via Inngest function `usage-reconciler-v1` ships as a skeleton in Phase 6 — actual Stripe Meters submission + drift alerts are **Phase 8 (CTRL-06/07)**.
- **`mcpgen deploy`** CLI subcommand (Phase-1 stub → real impl): registers a generated bundle into Postgres `deployments`, spawns local Bun process on next-free port 8790+, returns `localhost:879N` URL + one-click Claude Desktop config block with collision detection.
- **CLI Bun-compile binary** matrix: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64` published to npm tarball + GitHub release artifacts (CI workflow matures from Phase-1 single-target build).
- **DNS-rebinding mitigation:** `hostHeaderValidation` middleware mandatory on dispatch + every tenant Worker (Hono middleware in `@mcpgen/runtime`).
- **Sentry redaction:** `beforeSend` helper in `@mcpgen/runtime` scrubs `Authorization`, `X-Upstream-Auth`, `Cookie`, and spec-declared auth headers; auto-wired by Stage E codegen and apps/dispatch-sample.
- **P99 over upstream <50ms** local load-test harness (k6 or Bun-native script); warm-keep cron skeleton (Inngest dev) for parity with Phase-10 production cold-start mitigation.
- **Cross-tenant smart-ID fuzz protection:** dispatch refuses to forward a request whose smart-ID prefix doesn't match the addressed tenant Worker (pitfall #1 runtime side; F1 fixture covers it in Phase 5).

**Out of scope (deferred to Phase 10 launch readiness or other phases):**
- Real CF Workers for Platforms deploys (`wrangler deploy` against `mcpgen-prod` / `mcpgen-staging` / `mcpgen-sandbox` namespaces) — Phase 10 (per local-compute memory + 01-PHASE-DEVIATIONS.md rev 2).
- Real CF Hyperdrive provisioning — Phase 10 (Phase 6 connects to Neon directly).
- Real CF KV / CF Queue / CF Durable Objects bindings — Phase 6 emulates locally; Phase 10 swaps to bindings.
- Real Stripe Meters submission — Phase 8 (CTRL-06).
- Logto Pro-tier upgrade staging dry-run — Phase 10 (free-tier scaffolding done in Phase 1).
- Drift Watcher Inngest cron — Phase 8 (CTRL-03).
- Production-grade BetterStack uptime + Sentry DSN fill — Phase 9 (CTRL-08).
- F3 mock client harness for runtime acceptance — Phase 5 owns the mock clients (Cursor / Claude Desktop / ChatGPT Deep Research); Phase 6 only consumes them as smoke tests.
- Quota enforcement + cost cap — Phase 8 (CTRL-06/07).

</domain>

<decisions>
## Implementation Decisions

### Dispatch architecture & tenant routing (RUN-01)

- **D-01:** **Local dispatch is Bun + Hono on `localhost:8789`** (per local-compute port map). Single binary mirrors the prod CF Worker shape; Phase-10 swap is `wrangler deploy --name dispatch` against the existing `apps/dispatch/wrangler.toml`. Hono routes are framework-identical between local and CF (Hono targets both runtimes).
  *Why recommended (auto):* the only architecture that lets Phase 4 codegen ship the SAME tenant Worker shape from Phase 6 onwards — no rewrite at Phase-10 launch. Postgres-as-source-of-truth tenant registry mirrors prod CF KV cache pattern (5-min TTL); cache layer is `unstorage` driver (memory) in dev, swappable to `unstorage` driver (cloudflare-kv-binding) in Phase 10.

- **D-02:** **Tenant lookup source of truth = Postgres `deployments` table; in-memory cache (5-min TTL).** Dispatch resolves `script_name = {tenant_short_id}-{spec_slug}` from request (Host header for prod, path prefix `/t/{script_name}/...` for local-multi-port routing) → cache hit OR Postgres lookup → in-memory routing table maps `script_name → localhost:879N` for active deployments.
  *Why recommended (auto):* matches RUN-01 ("CF KV cache 5-min TTL") with a local-equivalent that has the SAME contract. Pitfall #11 (no per-tenant namespace) is structurally enforced — only one routing table exists per environment.

- **D-03:** **Cross-tenant smart-ID fuzz protection: dispatch validates that the smart-ID prefix in any forwarded request body matches the addressed tenant.** Mismatch → 403 with `{ error: "smart_id_tenant_mismatch", ... }`. Same regex compiled from Pass 1 `SmartIdSchema` is shared with F1 fuzz fixture (pitfall #1).
  *Why recommended (auto):* this is the runtime half of pitfall #1 (the F1 static check is the build-time half); without it, a malicious client with valid auth on tenant A could fetch a smart-ID from tenant B's namespace. Cheap to implement at dispatch (parses `id` from JSON-RPC params before forwarding).

### Tenant Worker local runtime model (RUN-02)

- **D-04:** **Each active tenant deployment runs as a separate Bun child process on `localhost:8790+` (multi-port).** Process supervisor lives in `apps/tenant-worker-runner/` (Bun); reads `deployments` table on boot, spawns one process per active deployment, restarts on crash, exposes `/admin/spawn` + `/admin/kill` endpoints used by `mcpgen deploy`. Each tenant Bun process is a thin wrapper around the Phase-4-generated Worker code with `wrangler dev --local` parity (uses `@cloudflare/workers-types` shims via Bun-native fetch when not on CF).
  *Why recommended (auto):* matches prod CF Workers tenant-process isolation locally — each tenant Worker has its own boot/cold-start, its own crash blast-radius, its own port. Phase 10 swap is "stop spawning Bun processes; deploy via `wrangler deploy --dispatch-namespace mcpgen-prod` instead" — no application-code changes. Alternative (single in-process router with mounted sub-routes per tenant) would NOT validate cross-tenant isolation and would hide cold-start behaviour that pitfall #14 specifically targets.

- **D-05:** **`apps/dispatch-sample` (Phase 1 hand-coded Stripe sample) is the canonical reference; Phase-6 Wave 2 fully wires it through the new dispatch + auth + usage pipeline.** Subsequent generated tenant Workers drop into the same shape. Three sample tools (`customers_search`, `charges_fetch`, `subscriptions_list`) are kept; their Phase-1 `createStubRuntime()` is replaced with the real `@mcpgen/runtime` factory.
  *Why recommended (auto):* roadmap success criterion #2 explicitly requires "a hand-deployed sample tenant Worker is live by end of Phase-6 Wave 2 — proves dispatch + auth + usage pipeline without waiting on engine completion". Reusing apps/dispatch-sample saves a phase day.

### `@mcpgen/runtime` real implementations (RUN-02 + Stage-E consumer)

- **D-06:** **Phase 6 replaces `createStubRuntime()` (which throws on every method) with real implementations of all 11 frozen `@mcpgen/runtime` methods:** `parseSmartId / makeSmartId / routeSearch / routeFetch / routeListCollections / routeListObjects / routeUpsert / routeDelete / shapeResponse / applyFieldFilter / handleUpstreamError`. Same `index.ts` surface — only the implementation files change. CI runs `pnpm typecheck` against the FROZEN `Runtime` interface to detect any signature drift.
  *Why recommended (auto):* the interface was deliberately frozen in Phase 1 (FND-06 + D-04) so Phase 6 is implementation-only — zero re-negotiation of the contract with downstream Phase-4 codegen templates.

- **D-07:** **Smart-ID runtime (`parseSmartId / makeSmartId`) lives in `@mcpgen/runtime` and is consumed by BOTH tenant Workers AND the dispatch worker** (dispatch uses it for cross-tenant fuzz protection per D-03). Single source of truth, no copy-paste between codebases.
  *Why recommended (auto):* mathematical certainty that dispatch and tenant agree on smart-ID format — the highest-stakes invariant in the runtime plane (tenant cross-contamination is a P0 security failure).

### Three upstream-credential modes (RUN-03 / RUN-04 / RUN-05)

> **Scope clarification:** these are credentials for the **wrapped upstream APIs** (Stripe, GitHub, Notion, etc.) that tenant Workers call. They are NOT user-auth for MCPGen's own UI / control plane — Logto user auth lives in Phase 8 (`ops` workstream, CTRL-02). Phase 6 does not depend on Logto.

- **D-08:** **Pass-through is the default and ships first.** `@mcpgen/runtime` middleware decrypts `X-Upstream-Auth` per request via HKDF-derived key (key material from per-tenant secret stored in env-time-only var on Bun process spawn; never persisted), forwards to upstream, **never logs the credential**. Outbound chokepoint scrubs the credential from any log destination (Sentry beforeSend in D-16 catches the residual case). No request body or response body is logged.
  *Why recommended (auto):* matches RUN-03 + pitfall #12 + privacy-LOCKED constraint. Solo-friendly liability surface (we never hold upstream secrets). Tested via apps/dispatch-sample with a fake Stripe upstream.

- **D-09:** **Stored credentials use AES-256-GCM with per-tenant DEK in a local SQLite store** (Phase-10 swap: real CF KV via the same `KV_NAMESPACE` binding name used in `apps/dispatch/wrangler.toml`). UI marks the mode "less secure" with explicit opt-in checkbox (UI is locked; Phase 7 wires the checkbox state). Per-tenant DEK is wrapped under a master key from `RUNTIME_KEK` env var (same env var used in Phase 10 for the prod CF KV master key).
  *Why recommended (auto):* RUN-04 mandates AES-256-GCM + per-tenant DEK; SQLite is the simplest local equivalent and is already on the locked stack via Bun's built-in `bun:sqlite`. The accessor is wrapped behind a small KV interface (`get / put / delete`) so the Phase-10 swap to CF KV is one binding change, not a refactor. The "less secure" marker is an architectural decision (per architecture §6.4) — we're not designing a more-secure stored mode in Phase 6.

- **D-10:** **OAuth flow on behalf — STUB implementation in Phase 6** (for user-delegated upstream APIs like Google / GitHub user-mode). The stub returns a documented `{ error: "oauth_mode_phase_10_deferral", message: "OAuth on-behalf flow ships in Phase 10 with @cloudflare/workers-oauth-provider", deferred_to_phase: 10 }` payload when a tenant Worker is configured with `auth_mode = "oauth"`. The **real `@cloudflare/workers-oauth-provider` integration is Phase 10** (it is CF-Workers-specific; running it under local Bun adds risk we don't need pre-launch). State-validation, PKCE, and token refresh are all owned by the provider library at that point.
  *Why recommended (auto):* RUN-05 lists OAuth 2.1 as required, but the provider library is CF-Workers-coupled and the user-delegated APIs that need it (Google, GitHub user-mode) are not on the launch-criteria critical path (top-5 / top-10 APIs in Stage F use API-key / Bearer auth — pass-through covers them). Stubbing keeps the Phase-6 surface honest while saving 1–2 phase days for higher-priority work. Auth-mode dispatch (D-08/D-09 vs D-10) is wired end-to-end so Phase 10 only swaps the body of the OAuth handler.

### MCP `initialize` capability gating (RUN-01 + pitfall #4)

- **D-11:** **Dispatch is the MCP protocol negotiator; tenant Workers are protocol-version-naive.** Dispatch parses the JSON-RPC `initialize` request, captures client `protocolVersion`, persists it in a per-session map (in-memory keyed by `Mcp-Session-Id` header per MCP spec), and rewrites tenant Worker responses on the way out: for clients with `protocolVersion < "2025-06-18"`, dispatch strips `outputSchema` from every `tools/list` response and drops `structuredContent` from `tools/call` responses.
  *Why recommended (auto):* keeps tenant Workers simple — they always emit MCP 2025-06-18 shape, dispatch downgrades for legacy clients. Single rewrite point = single test surface = fewer places for the gating bug to hide. Mock clients from Phase 5 (Cursor / Claude Desktop / ChatGPT Deep Research) cover all three relevant `protocolVersion` values.

### Usage event pipeline — local-compute simplified (RUN-06)

- **D-12:** **Tenant Worker → `ctx.waitUntil(send_to_inngest_dev(...))` → local Inngest dev server (`npx inngest-cli@latest dev`) → Inngest function writes to Postgres TimescaleDB `usage_events` hypertable.** Schema and key shape from `packages/contracts/src/usage-event.ts` (FND-04, frozen). Idempotency via `usage_event_id` UUID generated client-side + UNIQUE `(tenant_id, tool_call_id)` constraint at the DB layer (pitfall #13). On Inngest-send failure, tenant Worker falls back to a **local SQLite** bucket (`apps/tenant-worker-runner/usage-fallback.sqlite`); a 5-min Inngest dev cron drains the fallback bucket back into the main pipeline. **Stripe Meters submission, CF Queue, and CF KV paths are deferred** — CF Queue is the Phase-10 prod swap (`ctx.waitUntil(env.USAGE_QUEUE.send(...))` will replace `send_to_inngest_dev`); Stripe Meters submission lands in Phase 8. The daily Inngest reconciliation function `usage-reconciler-v1` ships in Phase 6 as a **skeleton** that reads TimescaleDB hourly aggregates and logs the would-be Stripe payload; Phase 8 (CTRL-06/07) wires the real Stripe Meters API call + the >0.5%-drift alert.
  *Why recommended (auto):* honours RUN-06 (idempotency + dedup + reconciliation) without Phase-6 needing to depend on CF Queue or Stripe Meters (both deferred). Matches the local-compute principle: real cloud SaaS (Neon TimescaleDB) is in use; the Cloudflare-specific transport (Queue) is emulated by local Inngest dev so the swap at Phase 10 is `Inngest dev URL → CF Queue binding`, no schema change. Inngest function IDs are stable strings (`usage-reconciler-v1`, `warm-keep-active-tenants-v1`) per CTRL-09 — Phase 9 audits orphans.

### `mcpgen deploy` semantics + binary build matrix (CLI-02 / CLI-03)

- **D-13:** **`mcpgen deploy <bundle-dir>` (default = local) registers the bundle in Postgres `deployments`, spawns local Bun child process on next-free port 8790+ via `apps/tenant-worker-runner/` admin endpoint, returns `localhost:879N` URL + Claude Desktop config block with collision detection (per pitfall #30 — checks existing entries by name + URL before adding).** A `--cf` / `--remote` flag is reserved but emits a Phase-10 deferral banner with the same exit-78 deferral guard pattern used in `infrastructure/cloudflare/scripts/create-namespaces.sh` (Phase-1 Plan 01-07).
  *Why recommended (auto):* matches CLI-02 ("returns a live URL") for local with structural parity to Phase-10 CF deploys. Collision detection + one-click block is RUN-07.

- **D-14:** **CLI Bun-compile binary matrix ships in Phase 6 for all 4 targets** (`bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`); CI matrix runs `bun build --compile --target=$T` per OS-on-OS where possible (cross-compile is supported in Bun 1.x). Published as: npm package (single `mcpgen` binary chosen at install time via `optionalDependencies` per OS) **+** GitHub release artifacts (4 binaries attached per release tag).
  *Why recommended (auto):* CLI-03 + Phase-1 Plan 01-08 already validated all 4 targets compile. Phase 6 hardens the publish path. Bun's `--compile` is the locked stack choice — no alternative needed.

### Cross-cutting security (DNS rebinding + Sentry redaction)

- **D-15:** **`hostHeaderValidation` Hono middleware mandatory on dispatch + every tenant Worker.** Allowed hosts list configured via `ALLOWED_HOSTS` env var (default in dev: `localhost,127.0.0.1`; default in Phase 10: `*.mcpgen.dev,mcpgen.dev`). Pitfall #15. Stage E codegen template injects this middleware into every generated `apps/tenant-worker-runner/`-bootable bundle.
  *Why recommended (auto):* cheapest possible mitigation for a known DNS-rebinding attack vector against MCP servers (private network access from a malicious public domain). Not optional.

- **D-16:** **Sentry `beforeSend` redaction lives in `@mcpgen/runtime`** and scrubs `Authorization`, `X-Upstream-Auth`, `Cookie`, plus all spec-declared auth headers (read from the spec's `securitySchemes` at codegen time, injected into the redactor as a static list). Phase 6 ships the helper; Phase 1 already wired empty-DSN Sentry SDK in every app (FND-10), so the helper is plugged into the existing init. **No spec content, no upstream response bodies, no upstream credentials** ever reach Sentry — privacy-LOCKED constraint.
  *Why recommended (auto):* paths #12 + privacy hard rule from architecture §11. Centralising the redactor in `@mcpgen/runtime` (vs. duplicating per app) means one audit point. Phase 9 deliberate-leak PII audit verifies this end-to-end.

### P99 latency target & warm-keep strategy (RUN-02 + pitfall #14)

- **D-17:** **P99 < 50ms over upstream measured locally via Bun-native load-test harness** (`apps/tenant-worker-runner/tests/p99-load.ts`); fakes upstream with a fixed-latency stub server so we measure runtime overhead only. Acceptance: P99 over a 30-second 100-rps load run is <50ms. Real CF P99 validation is a Phase-10 launch-gate.
  *Why recommended (auto):* matches RUN-02 acceptance criterion. Bun-native is faster to write than k6 and stays in the locked stack. Real CF measurement requires deploys — deferred per local-compute.

- **D-18:** **Warm-keep cron skeleton ships in Phase 6 as Inngest dev function `warm-keep-active-tenants-v1`** (every 5 min; reads active deployments from Postgres; pings `/health` on each tenant Worker port); structurally identical to the Phase-10 prod cron. Cold-start tax mitigation pattern (`globalThis` init for high-cost setup) is documented in the Stage E template comments and re-asserted in Phase-6 PATTERNS.md.
  *Why recommended (auto):* RUN-02 + pitfall #14. Local Bun has near-zero cold start so the cron is a parity scaffold, not a measured-impact mitigation in Phase 6.

### Claude's Discretion

The planner has flexibility on these (no user veto needed):

- Exact wave breakdown for the 9 requirements (suggest: Wave 1 = dispatch + apps/dispatch-sample wired through; Wave 2 = 3 auth modes; Wave 3 = usage pipeline + reconciliation stub; Wave 4 = `mcpgen deploy` + binary matrix; Wave 5 = P99 + warm-keep + smart-ID fuzz).
- Specific port numbers for individual tenant Workers (the convention is 8790+, the exact assignment algorithm — sequential / hash / pool — is a planner call; sequential is fine).
- Whether `apps/tenant-worker-runner/` is a new app or a folder inside `apps/dispatch/` (planner reads the existing dispatch scaffold and decides).
- KV emulator concrete library: `unstorage` (recommended; matches Phase-10 `cloudflare-kv-binding` swap) vs. raw SQLite. Planner picks; either is acceptable.
- Inngest dev runner location (`apps/dispatch/inngest/` vs. `apps/api/inngest/` vs. dedicated `apps/inngest-dev/`) — local-compute principle says use Inngest dev, planner picks where.
- Which Bun cross-compile is verified on which CI runner — Bun docs say all 4 targets work from any host as of Bun 1.1+; planner double-checks.
- Whether the local SQLite KV fallback bucket lives in `apps/tenant-worker-runner/` (per-runner) or per-tenant (per-deployment) — failure-isolation argument either way; planner picks.
- Naming of the in-memory routing-table cache key (`script_name` vs. `cf_worker_name` — schema field is `cf_worker_name` per FND-08 + DB schema, but the dispatch internal name is overrideable).
- Whether `mcpgen deploy --cf` is wired in Phase 6 (with the deferral banner) or completely absent until Phase 10 — recommended: wire the flag with the banner so the surface is committed.

### Folded Todos

*None — no pending todos in `.planning/todos/pending/` at Phase-6 start.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning Phase 6.**

### Source of truth for the entire project (always-applicable)
- `RULES.md` — hard non-negotiable rules across product/engine/architecture/security/operating/scope.
- `CLAUDE.md` §3 (locked stack), §4 (architectural pillars), §6 (Runtime Plane mental model), §7 (repo structure), §11 (observability + privacy), §12 (workflow rules 4 / 14 / 15), §13 (glossary terms: Tenant, Pass-through credentials, Stored credentials, Dispatch Worker).
- `docs/mcpgen-git-workflow-rules.md` — Conventional Commits, atomic commits, NEVER `--no-verify`, pre-commit hook contract; applies to every Phase-6 commit.
- `docs/mcpgen-model-and-provider-override.md` — single LLM model + provider; Phase 6 has NO LLM calls (runtime is deterministic), but the override applies to any tooling work that incidentally triggers an LLM.
- `docs/mcpgen-gsd-sprint-plan.md` §3 (workstream allocation — Phase 6 = `runtime` ws), §4.6 (Phase-6 plan breakdown), §5 (cross-workstream coordination + contract change protocol), Anti-pattern: "running multiple ws without `--ws`".

### Source of truth for what Phase 6 must deliver
- `.planning/PROJECT.md` Constraints (pass-through default, privacy-LOCKED, MCP protocol target 2025-06-18 + 2025-03-26 annotations). Note: the Logto MAU constraint listed in PROJECT.md applies to Phase 8 (`ops`), not Phase 6.
- `.planning/REQUIREMENTS.md` RUN-01..07 + CLI-02 + CLI-03 — 9 requirements with severity tags.
- `.planning/ROADMAP.md` Phase 6 entry — 5 success criteria with quantitative gates.
- `.planning/research/PITFALLS.md` §"Pitfall-to-Phase Mapping" Phase 6 row + #4 (capability gating), #6 (per-endpoint auth), #11 (single namespace per environment), #12 (credential scrub on every log destination), #13 (CF Queue backpressure → KV fallback + idempotent dedup), #14 (cold-start tax + warm-keep cron + globalThis init), #15 (DNS rebinding `hostHeaderValidation`), #21 (Inngest function ID stability — `usage-reconciler-v1` / `warm-keep-active-tenants-v1`), #30 (Claude Desktop config block collision detection).
- `.planning/research/ARCHITECTURE.md` Refinement #1 (apps/dispatch-sample as canonical reference shape that Phase-4 codegen targets) + Cross-Cutting Concerns + R-A4 (SSE callback resume) + R-A7 (`pending_callbacks` table — Phase-6 KV fallback bucket is the same pattern for usage events).

### Source of truth for runtime architecture
- `docs/mcpgen-architecture.md` §6 (Runtime Plane — Workers for Platforms architecture, tenant Worker structure, tenant isolation, auth model, pass-through credentials), §7 (data model — `deployments` and `tools` tables Phase 6 reads + writes), §10 (Stripe Meters dimensions — Phase-6 stub references), §11 (logging redaction — beforeSend), §14 (security surface — AES-256-GCM per-tenant DEK + KV master key wrap pattern).
- `docs/mcpgen-stage-e-design.md` §2 (file tree — Phase-6 tenant Worker layout matches), §3.3 (runtime/infra templates — what `@mcpgen/runtime` must export), §4 (per-tool-type handler implementation — runtime route methods reach into these), §5 (3 auth modes), §6 (smart-ID runtime), §7 (pagination/truncation runtime), §8 (error handling templates that teach the agent next steps), §11 (output shape).

### Source of truth for the 5 frozen contracts Phase 6 consumes
- `packages/ir/` (TS Zod source → Pydantic codegen) — `Tool`, `ToolDescription`, `ToolAnnotations`, `ResponseConfig`, `RoutingRule`, `WorkflowDef`, `SmartIdSchema`, `FinalTool`. Phase 6 reads `RoutingRule` and `SmartIdSchema` at runtime.
- `packages/contracts/src/generation-api.ts` — Generation API + SSE event envelope. Phase 6 doesn't add to this; apps/dispatch-sample's response shape must match the contract.
- `packages/contracts/src/usage-event.ts` — single usage event schema. **FROZEN in Phase 1.** Phase 6 wire-site (tenant Worker emit + BFF receive + Postgres row + future Stripe dimension keys) MUST conform; any drift = `chore(contracts):` PR per cross-workstream test ownership policy (OPS-02).
- `packages/contracts/src/launch-criteria.ts` — F2/F3 thresholds + bundle-size limits. Phase 6 doesn't touch these (they're for engine), but pre-commit hook still enforces the paired `docs/decisions/` rule.
- `packages/runtime-sdk/src/index.ts` — **FROZEN `Runtime` interface (FND-06).** Phase 6 fills the bodies; signatures are immutable.
- `infrastructure/neon/migrations/20260427000000_init_schema.sql` — `deployments`, `usage_events`, `tools` tables Phase 6 reads/writes.

### Source of truth for security surface
- `docs/mcpgen-architecture.md` §11 (logging redaction list) + §14 (secret management — `RUNTIME_KEK` env var + per-tenant DEK wrap pattern).
- `RULES.md` Security section — pass-through default, never log spec content / upstream responses / upstream credentials, AES-256-GCM only, OAuth state validation enforced by provider.
- Pitfall #12 (credential scrub on every log destination) + #15 (DNS rebinding mitigation via `hostHeaderValidation`).

### Source of truth for local-compute deferrals
- `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2 (CF dispatch namespace creation + real-CF SSE re-spike + Logto Pro-tier staging dry-run all DEFERRED to Phase 10).
- Auto-memory: `project_local_compute.md` — local port map (8789 dispatch, 8790+ tenants); cloud SaaS in `.env.local` IS in use (Neon, Logto Cloud, OpenRouter, Langfuse self-hosted); CF/Fly artifacts authored but not deployed.
- `infrastructure/cloudflare/scripts/create-namespaces.sh` — exit-78 deferral guard pattern Phase-6 `mcpgen deploy --cf` reuses.

### Source of truth for prior CONTEXT decisions that flow into Phase 6
- `.planning/phases/01-foundation/01-CONTEXT.md`:
  - **D-04** (MCP SDK pin `@modelcontextprotocol/sdk@^1.x`) — Phase 6 tenant Workers + dispatch + apps/dispatch-sample stay on v1 unless a deliberate `chore: bump mcp-sdk to v2` PR runs first.
  - **D-08** (3-namespace strategy: never per-tenant) — Phase 6's local-compute equivalent is the single Postgres `deployments` table; pre-commit hook still rejects a fourth dispatch namespace creation.
  - **D-09** (Postgres = source of truth, SSE = UX hint) — same pattern applies to Phase 6 usage events: TimescaleDB hypertable = source of truth, Stripe Meters = billing eventual.
  - **D-11** (Idempotency-Key shape `${operation}_${ulid}`) — Phase 6 usage event POST uses `usg_${usage_event_id}` as the BFF idempotency key.
  - **D-13** (launch-criteria runtime constants) — Phase 6 imports `MAX_BUNDLE_KB` etc. unchanged.
  - **D-19** (Sentry source-map upload per app) — Phase 6 wave includes verifying `apps/dispatch` + `apps/tenant-worker-runner` + apps/dispatch-sample upload source maps in CI.
  - **D-21** (cross-workstream test ownership) — Phase 6 owns `tests/runtime/*`; cross-ws failures escalate to MAIN as `chore(contracts):` PR.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`packages/runtime-sdk/src/index.ts`** — frozen `Runtime` interface + `createStubRuntime()` factory throwing `notImpl` errors. Phase 6 keeps the surface identical and replaces the throw-bodies with real implementations. Import statement, type names, and 11-method signature list are immutable.
- **`packages/runtime-sdk/src/types.ts`** — `SmartId`, `RouteSearchOpts`, `RouteFetchOpts`, `ListCollectionsOpts`, `ListObjectsOpts`, `UpsertOpts`, `DeleteOpts`, `FieldFilteringConfig`, `ErrorTeachingContext`. Phase 6 implementations consume these without redefining.
- **`apps/dispatch/src/index.ts`** — Hono scaffold with `/health` route + 404-stub `app.all('*')`. Phase 6 replaces the 404 handler with the real router (cache lookup, smart-ID fuzz, capability gating, dispatch). Bindings interface (`DISPATCH_NAMESPACE`, `HYPERDRIVE`, `SENTRY_DSN`, `ENVIRONMENT`) is the prod CF shape — local-compute uses an `unstorage` driver via the same binding name.
- **`apps/dispatch-sample/src/index.ts`** — hand-coded Stripe sample with 3 tools (`customers_search`, `charges_fetch`, `subscriptions_list`) + auth middleware + per-request `WebStandardStreamableHTTPServerTransport`. Phase 6 wires this through the new dispatch + auth + usage pipeline as the canonical reference shape Phase-4 codegen will mimic.
- **`apps/cli/src/index.ts`** — Commander.js skeleton with `--help`, `--version`, and stub `init` / `deploy` actions. Phase 6 replaces the `deploy` stub with the real impl + adds `--cf` deferral flag.
- **`apps/cli/build.ts`** — Bun cross-compile loop for 4 targets. Phase-1 acceptance only verified compilation locally; Phase 6 wraps it in CI matrix + npm `optionalDependencies` selector + GitHub release upload.
- **`infrastructure/cloudflare/scripts/create-namespaces.sh`** — exit-78 deferral guard pattern that `mcpgen deploy --cf` mirrors verbatim.
- **`packages/contracts/src/usage-event.ts`** — frozen UsageEvent shape Phase 6 emits + reads. Don't edit; conform.
- **`infrastructure/neon/migrations/20260427000000_init_schema.sql`** — `deployments` table (already includes `cf_worker_name`, `auth_mode`, `tenant_id`, `spec_id`, `created_at`) + `usage_events` hypertable. Phase 6 reads `deployments` for tenant lookup and writes `usage_events` rows.

### Established Patterns

- **`createStubRuntime()` throws documented Phase-1 errors** instead of returning sentinels (Plan 01-03 D-decision). Phase 6 replaces all throws with real bodies; the runtime test verifies no method still throws after Phase 6.
- **Idempotency-Key shape `${operation}_${ulid}`** (Phase 1 D-11) — Phase 6 follows for usage events: `usg_${ulid}` as BFF dedup key + `usage_event_id` UUID as Postgres dedup key.
- **TS Zod = source of truth, Pydantic generated** — Phase 6 doesn't touch IR but consumes generated `RoutingRule` and `SmartIdSchema` types unchanged.
- **`packages/ir/` codegen output is committed to git** (Phase 1 specifics) — Phase 6 likewise commits any newly generated artifacts (e.g., the OpenAPI client for `/api/v1/usage-events` if a generated client is used).
- **Drizzle migration filenames `YYYYMMDDHHMMSS_<descriptive>.sql`** — Phase 6 only adds migrations if absolutely necessary (the existing schema covers Phase 6 fully); if added, follow the timestamp convention.
- **Per-workstream CI workflow** (`runtime-ci.yml` is the entry-point marker; real work in `main-ci.yml` conditional jobs) — Phase 6 work goes through `runtime-ci.yml` triggers, with conditional jobs in `main-ci.yml` doing the typecheck + lint + test.
- **Empty-DSN Sentry init in every app** (FND-10) — Phase 6 plugs `beforeSend` redaction helper into the existing init; doesn't re-bootstrap Sentry.
- **MCP SDK v1 pinned to `^1.29.0`** (Phase 1 D-04) — apps/dispatch-sample, dispatch, tenant-worker-runner, and any Phase-6 imports of MCP SDK stay on v1.

### Integration Points

- **`@mcpgen/runtime`** is consumed by `apps/dispatch-sample`, future Phase-4 generated tenant Workers, AND Phase-6 dispatch (for smart-ID parsing). Single source of truth across the runtime plane.
- **`@mcpgen/contracts`** (`generation-api`, `usage-event`, `idempotency`, `launch-criteria`) — Phase 6 imports `usage-event` shape, the `TOOL_NAME_REGEX` constant, and `Idempotency-Key` header conventions. Doesn't write to it.
- **`@mcpgen/ir`** — Phase 6 consumes `ResponseConfig`, `RoutingRule`, `SmartIdSchema`, `FinalTool` types in runtime route implementations.
- **Local Inngest dev (`npx inngest-cli@latest dev`)** — Phase 6's primary usage-event transport (replaces CF Queue locally). Hosts `usage-reconciler-v1` (skeleton — logs would-be Stripe payload) + `warm-keep-active-tenants-v1` (every-5-min ping) + the usage-fallback drain function. Inngest function IDs MUST be stable strings per CTRL-09 (Phase 9 audits orphans). Phase-10 swap: tenant Worker emits `ctx.waitUntil(env.USAGE_QUEUE.send(...))` against the real CF Queue binding instead of the Inngest dev URL — Inngest functions remain (they're vendor-portable).
- **Postgres `deployments` table** — Phase 6 dispatch reads (for tenant lookup with 5-min cache) + Phase-6 `mcpgen deploy` writes (registers a new deployment with `cf_worker_name = {tenant_short_id}-{spec_slug}` + `local_port` field for Phase-6 routing; `local_port` is null for Phase-10 CF deploys).
- **Postgres `usage_events` hypertable** — Phase 6 Inngest function writes; Phase 8 Stripe submission cron reads.
- **Local SQLite (`bun:sqlite`)** — backs both the AES-256-GCM stored-credentials store (D-09) and the usage-event fallback bucket (D-12). Two distinct SQLite files; planner picks the locations.
- **`apps/cli/`** — Phase 6 turns the stub `deploy` action into the real implementation that talks to the local `apps/tenant-worker-runner/` admin endpoint over HTTP.

> **Not in Phase 6's integration surface:** Logto Cloud (Phase 8 ops, CTRL-02), Stripe Billing/Meters (Phase 8 ops, CTRL-06/07), Drift Watcher (Phase 8 ops, CTRL-03), `@cloudflare/workers-oauth-provider` (Phase 10), real CF Queue / CF KV / CF Workers for Platforms bindings (Phase 10).

</code_context>

<specifics>
## Specific Ideas

- **`apps/dispatch-sample` (3 hand-coded Stripe tools) is the runtime golden test target.** End-to-end smoke: `mcpgen deploy apps/dispatch-sample` → spawns Bun process on `localhost:8790` → register in `deployments` → dispatch routes `localhost:8789/t/sample-stripe/...` → tenant Worker handles MCP `initialize` + `tools/list` + `tools/call` → emits usage event via Inngest dev → Inngest function writes to TimescaleDB → reconciler skeleton logs would-be Stripe payload. **All five Phase-6 success criteria measurable on this single E2E flow.**

- **`globalThis` cold-start tax mitigation pattern** must be re-asserted in `06-PATTERNS.md` even though the local Bun runtime has near-zero cold start. Reason: Phase 4 codegen consumes the runtime SDK at codegen time, and the templates already embed the pattern; documenting it keeps the codegen + runtime invariants aligned. (Per architecture §6 + Stage E §3.3.)

- **Cross-tenant smart-ID fuzz test** lives in **two** places: F1 fixture (Phase 5 — static) and dispatch runtime check (Phase 6 — dynamic). Same regex, two consumers, single Pass-1 source. Document this dual-test pattern in `06-PATTERNS.md`.

- **One-click Claude Desktop config block** has a critical UX detail: it's pasteable into `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or platform-equivalent. Collision detection (pitfall #30) must check both the `mcpServers.{name}` slot AND the URL — duplicates of either silently break Claude Desktop's dispatch.

- **OAuth-mode stub shape matters** — the Phase-6 stub MUST return a structured `{ error: "oauth_mode_phase_10_deferral", deferred_to_phase: 10 }` payload so Phase 7 frontend wire-up can detect it and show the right UI ("OAuth mode ships in Phase 10"). Throwing a generic 500 hides the deferral and breaks the FE-04 Quality Badge surface.

- **Bun cross-compile from a single CI runner is supported in Bun 1.1+** — Plan 01-08 verified all 4 targets compile locally. CI matrix only needs to verify each binary `--help` runs on the target OS (run `bun-darwin-arm64` on macOS-arm runner, etc.); the compilation itself can happen on linux-x64 and produce all 4 binaries in one job.

- **`apps/tenant-worker-runner/`** as a new app is the most likely Phase-6 outcome (vs. folding into `apps/dispatch/`) — separation lets dispatch focus on routing + auth + capability gating, and the runner focus on process lifecycle + admin endpoints. Planner final call.

- **Local Inngest dev (`npx inngest-cli@latest dev`) is the canonical local transport** — replaces what would otherwise be CF Queue. Same Inngest functions are vendor-portable to Phase 10 (only the send-side switches from `send_to_inngest_dev(...)` to `env.USAGE_QUEUE.send(...)`). Document the swap pattern in `06-PATTERNS.md`.

</specifics>

<deferred>
## Deferred Ideas

Surfaced during analysis; explicitly out of scope for Phase 6:

- **Real CF Workers for Platforms deploys** (`wrangler deploy --dispatch-namespace mcpgen-prod`) — Phase 10. The scripted deferral guard (`infrastructure/cloudflare/scripts/create-namespaces.sh` exit-78) is reused by `mcpgen deploy --cf` so the surface is committed. **No CF dispatch namespace is created in Phase 6** (per Phase-1 DEVIATIONS rev 2).
- **Real CF Hyperdrive provisioning** — Phase 10. Phase 6 connects to Neon directly via `DATABASE_URL_UNPOOLED` for migrations and `DATABASE_URL` for runtime queries.
- **Real CF KV / CF Queue / CF Durable Objects bindings** — Phase 10. Phase 6 emulates via local SQLite (stored credentials + usage-fallback) and local Inngest dev (replaces CF Queue).
- **Real `@cloudflare/workers-oauth-provider` integration (RUN-05 OAuth on-behalf flow)** — Phase 10. Phase 6 ships an auth-mode dispatch path that returns a structured stub error for `auth_mode = "oauth"`.
- **Real CF Workers SSE 30-second sub-request validation** — Phase 10 (Phase 1 local-Bun spike result `01-08-SPIKE-RESULT.md` is the substitute; production CF re-spike is a launch gate per `01-PHASE-DEVIATIONS.md` rev 2).
- **Real Stripe Meters submission** — Phase 8 (CTRL-06). Phase 6 ships the reconciler stub that logs the would-be payload.
- **Drift Watcher Inngest cron** — Phase 8 (CTRL-03).
- **Quota enforcement + per-generation cost cap** — Phase 8 (CTRL-06/07). Phase 6's usage events are the truth-source quota will read from.
- **Stripe Meters daily reconciliation alerts (>2% drift)** — Phase 8 (CTRL-07). Phase 6 ships the reconciliation function with the calculation; Phase 8 wires the alerting.
- **Production-grade BetterStack uptime + Sentry DSN fill + CF Queue depth alert** — Phase 9 (CTRL-08).
- **F3 mock client harness for runtime acceptance** (Cursor / Claude Desktop / ChatGPT Deep Research) — Phase 5 owns the harness. Phase 6 only consumes them as runtime smoke tests.
- **Privacy mode CLI (no spec upload)** — v1.x backlog (CLI-05). Out of MVP.
- **`mcpgen logs --tail` streaming tenant Worker logs to CLI** — v1.x backlog (CTRL-11). Out of MVP.
- **Runtime auto-bump of `@modelcontextprotocol/sdk` major version** — explicitly forbidden until a deliberate `chore: bump mcp-sdk to v2` PR with golden-API regression (Phase 1 D-04 + PROJECT.md "Out of Scope").
- **Multi-region runtime** — out of scope (locked constraint from PROJECT.md). Single-region for MVP.
- **A/B deploys / canary releases / custom domains** — v2 backlog (CTRL-12, CTRL-13).

### Reviewed Todos (not folded)

*None — `.planning/todos/pending/` is empty at Phase-6 start.*

</deferred>

---

*Phase: 06-runtime-plane*
*Workstream: runtime*
*Context gathered: 2026-04-26*
