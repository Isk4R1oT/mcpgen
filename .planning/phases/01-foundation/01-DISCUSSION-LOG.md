# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 01-foundation
**Mode:** Auto-mode (`--auto`)
**Areas discussed:** All gray areas auto-selected; recommended option chosen for each per `--auto` mode rules.

---

## IR cross-language source-of-truth direction

| Option | Description | Selected |
|--------|-------------|----------|
| TS Zod source → Pydantic codegen | 4/5 consuming surfaces are TS; Zod → JSON Schema → datamodel-codegen produces clean Pydantic 2 | ✓ |
| Pydantic source → TS codegen | Engine-first; less idiomatic TS output; only 1/5 consumers benefit | |
| Hand-maintained both directions | Drifts immediately; rejected | |

**Selection:** TS Zod source. **Rationale:** ARCHITECTURE.md R-A6 + STACK.md §6.4 — recommended path.

---

## Drift Watcher runtime placement

| Option | Description | Selected |
|--------|-------------|----------|
| TS Inngest in Hono BFF (control plane) | Keeps Python engine focused on LLM orchestration; control plane already imports Inngest TS SDK | ✓ |
| Python Inngest in generation engine | Engine has FastAPI app; possible but mixes responsibilities | |
| Standalone Worker | Extra deploy target for solo founder; rejected | |

**Selection:** TS Inngest in BFF. **Rationale:** Single responsibility per app; simplifies cross-app contracts.

---

## MCP TypeScript SDK version pin

| Option | Description | Selected |
|--------|-------------|----------|
| `@modelcontextprotocol/sdk@^1.x` for MVP | Matches all `docs/mcpgen-stage-e-design.md` examples; no template rewrite | ✓ |
| `@modelcontextprotocol/sdk@^2.x` | Better MCP 2025-06-18 alignment but breaking changes (`registerTool`, Standard Schema, package alias rename) — forces rewrite of all 9 tool templates before Phase 4 | |

**Selection:** v1.x. **Rationale:** STACK.md §6.1 recommended path; bump to v2 post-launch as deliberate `chore` PR with golden-API regression.

---

## Pre-commit hook framework

| Option | Description | Selected |
|--------|-------------|----------|
| `pre-commit` (Python) | Cross-language: gitleaks + ruff + eslint + mypy + conventional-pre-commit; one config in `.pre-commit-config.yaml` | ✓ |
| `lefthook` (Go) | Faster startup; adds Go dependency for solo founder | |
| `husky` + `lint-staged` | TS-only; doesn't handle Python engine | |

**Selection:** `pre-commit` (Python). **Rationale:** STACK.md §2.6; cross-language is the deciding factor.

---

## CI provider

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions | Native integrations: Vercel, Cloudflare, Fly.io, Sentry source-map upload, Logto. Free tier covers MVP | ✓ |
| CircleCI | More powerful but adds vendor surface for solo founder | |
| Buildkite | Self-host hybrid; not solo-friendly | |

**Selection:** GitHub Actions. **Rationale:** Solo-friendly ops principle; native integrations.

---

## Engine-fixtures shadow service initial seed

| Option | Description | Selected |
|--------|-------------|----------|
| 5 golden APIs (Stripe + GitHub + Notion + Linear + Slack) | Covers all 3 ICPs + all 3 tool-type mixes (data / action / workflow); reuses F3 golden-task targets | ✓ |
| 1 API (Stripe only) | Faster to ship but blocks runtime/frontend testing of action-heavy + workflow APIs | |
| 10 APIs | More coverage but ~4h per fixture × 10 = scope creep for Phase 1 | |

**Selection:** 5 APIs. **Rationale:** Pays for itself twice (fixtures + F3 baseline); right balance of coverage vs ship-time.

---

## CF Workers for Platforms namespace strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Three namespaces total (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`); same CF account; tenant = script name | Cloudflare-recommended pattern; tags carry tenant_id/plan_tier/spec_hash | ✓ |
| Namespace per tenant | Cloudflare explicitly forbids; pitfall #11 | |
| Separate CF account for sandbox | Cleaner isolation but adds billing complexity for solo founder; same-account separate namespace is sufficient | |

**Selection:** Three namespaces, same account. **Rationale:** Pitfall #11 — CF docs explicitly forbid namespace-per-tenant. Pre-commit fails any PR creating a 4th namespace.

---

## BFF SSE resume semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres = source of truth + SSE `last-event-id` resume + `pending_callbacks` table for delivery failures | Robust against Vercel cold starts (pitfall #20) and BFF transient failures (R-A4) | ✓ |
| WebSocket with sticky sessions | Higher complexity; doesn't auto-reconnect through proxies | |
| SSE only (no resume) | Loses progress on disconnect; bad UX for 60s+ jobs | |

**Selection:** Postgres source-of-truth + SSE resume + `pending_callbacks`. **Rationale:** Pitfall #20 + R-A4.

---

## Idempotency-key shape

| Option | Description | Selected |
|--------|-------------|----------|
| `${operation_prefix}_${ulid}` at all 4 surfaces | Cross-surface collision impossible; ULID is monotonic + URL-safe + 26 chars | ✓ |
| Random UUIDs everywhere | Looser; harder to debug across systems | |
| Per-surface custom format | Inconsistent; adds cognitive overhead | |

**Selection:** Operation-prefixed ULID. **Rationale:** Consistency aids debugging across BFF/Inngest/Stripe/CF logs.

---

## Drizzle migration filename strategy

| Option | Description | Selected |
|--------|-------------|----------|
| `YYYYMMDD_HHMMSS_<name>.sql` (timestamp prefix) | Parallel workstreams cannot collide; CI `drizzle-kit check` enforces | ✓ |
| `0001_init.sql` (sequential numeric) | Pitfall #18 — collisions on parallel branches | |

**Selection:** Timestamp prefix. **Rationale:** Pitfall #18 mandate.

---

## `launch-criteria.ts` enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime constants imported across engine + BFF + CI; pre-commit hook fails any change without paired decision-log entry | Pitfall #29 — blocks AI-fix-by-lowering-threshold | ✓ |
| Constants in env vars | Easy to override silently; rejected | |
| Hardcoded inline | Drifts across files; rejected | |

**Selection:** Runtime constants + decision-log gate. **Rationale:** Pitfall #29 is the most insidious AI-agentic failure mode.

---

## Logto Cloud upgrade timing

| Option | Description | Selected |
|--------|-------------|----------|
| Free tier in Phase 1; Pro ($60/mo) pre-bought at end of W7 | Avoids 5K MAU lock during W9 viral spike | ✓ |
| Self-host from day 1 | Adds ops surface; solo founder principle violated | |
| Free tier through launch | Catastrophic if W9 spike hits 5K MAU within hours | |

**Selection:** Free → Pro pre-buy at W7. **Rationale:** Pitfall #17.

---

## Hono streamSSE 30s sub-request spike

| Option | Description | Selected |
|--------|-------------|----------|
| 30-min spike at end of Phase 1 Wave 1 (90-second SSE on CF Workers; verify 85s event reaches client); Durable Objects fallback if it fails | Cheap to verify; clear go/no-go signal before contracts freeze | ✓ |
| Skip spike, assume it works | Pitfall risk; if it fails at Phase 5, blocks frontend integration | |
| Build full Durable Objects path upfront | Premature optimization | |

**Selection:** Spike + DO fallback. **Rationale:** STACK.md §6.6.

---

## Postgres connection pooling for CF Workers

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Hyperdrive in front of Neon | Better latency + connection efficiency; required at Neon Launch tier ~100 connection cap | ✓ |
| Direct `@neondatabase/serverless` HTTP proxy | Higher per-query latency; worse efficiency | |
| Connection pooling in Worker memory | Doesn't survive Worker isolate boundaries | |

**Selection:** Hyperdrive. **Rationale:** ARCHITECTURE.md scaling priorities; engine connects directly (Fly Machines have no edge constraint).

---

## Neon compute tier

| Option | Description | Selected |
|--------|-------------|----------|
| Dev tier (free) for Phase 1; Scale-tier (≥4 vCPU, 8GB) provisioned by W8 before launch | Pitfall #19 — pgvector + TimescaleDB + autovacuum OOMs on dev under load | ✓ |
| Dev tier through launch | Catastrophic; 30–60s outages during launch spike | |
| Scale-tier from day 1 | Pays $220/mo unnecessarily during pre-launch | |

**Selection:** Dev → Scale at W8. **Rationale:** Pitfall #19.

---

## Sentry source-map upload mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Per-app in CI: `@sentry/nextjs` (Vercel auto), `wrangler --upload-source-maps` (CF), `sentry-sdk[fastapi]` (Fly) with `SENTRY_RELEASE` | Each runtime uses its native tooling; no shared upload mechanism | ✓ |
| Centralized `sentry-cli releases` step | Adds another step to fail | |
| Skip source-maps until production ready | Phase 5 errors would be unreadable; pitfall #R-A5 | |

**Selection:** Per-app native CI integration. **Rationale:** R-A5 + STACK §2 — Phase 1 wires SDK with empty DSN; Phase 9 fills DSN.

---

## Conventional Commits enforcement layer

| Option | Description | Selected |
|--------|-------------|----------|
| Both pre-commit AND CI (`commitlint` action) | Defense in depth; catches 99% locally + trust boundary in CI | ✓ |
| Pre-commit only | Bypassable on bad days | |
| CI only | Catches too late; bad commits already in shared branches | |

**Selection:** Both. **Rationale:** `docs/mcpgen-git-workflow-rules.md` mandate.

---

## Cross-workstream test ownership policy

| Option | Description | Selected |
|--------|-------------|----------|
| File-owner workstream owns the test; cross-ws failures escalate to MAIN as `chore(contracts):` PR; daily sync ritual mandatory | Pitfall #26 — prevents two ws "fixing" the same test | ✓ |
| Last-touched workstream owns | Ambiguous; promotes finger-pointing | |
| MAIN owns all cross-ws tests | Bottlenecks main ws | |

**Selection:** File-owner ownership + escalation protocol. **Rationale:** Pitfall #26.

---

## Claude's Discretion (no question — flagged as defer-to-implementation)

- Specific Drizzle table column names + indexes (review during Phase 1 plan).
- Wrangler.toml worker_routes patterns.
- GitHub Actions matrix shapes.
- Specific Langfuse OTLP endpoint URL (read from dashboard).
- `pre-commit autoupdate` schedule.

## Deferred Ideas (auto-flagged for future phases / out of MVP)

- Self-host Logto migration (t+3mo).
- Self-host Langfuse (t+3mo / 5M LLM events).
- `lefthook` swap (only if pre-commit becomes a documented friction).
- Multi-region Fly + Neon EU (1k+ active users).
- CF Pages migration from Vercel (t+6mo).
- Dependabot for `@modelcontextprotocol/sdk` (explicitly disabled).
- Per-env secrets vault (Doppler / Infisical / 1Password).
- Build-system swap (Nx / Moon).
