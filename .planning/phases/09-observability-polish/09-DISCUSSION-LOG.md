# Phase 9: Observability & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 09-observability-polish
**Mode:** `--auto` (all gray areas auto-resolved with recommended option)
**Areas discussed:** A. Local-mode posture · B. Sentry redaction · C. Langfuse session_id · D. Cross-tenant smart-ID fuzz · E. Multi-client smoke · F. PII leak audit · G. Inngest orphan audit · H. Neon Scale-tier verification · I. BFF carry-forward endpoints · J. SLO doc refresh · K. Outbox depth alert

---

## A. Local-mode posture (Sentry/Langfuse/BetterStack DSN handling)

| Option | Description | Selected |
|--------|-------------|----------|
| Required-cloud | Force every contributor to provision real DSNs to run `pnpm dev`. | |
| **Optional-cloud** | **DSNs from `.env.local` when present; SDKs no-op when absent. Phase 10 promotes to required-in-prod via build-time check.** | ✓ |
| Mock-only | Use mock SDK in dev; real cloud only at Phase 10. | |

**Auto-selected:** Optional-cloud — matches local-compute mode (memory `project_local_compute.md`); aligns with Phase 1–8 pattern of `if (env.X) {…}` cloud guards. → D-01, D-02

---

## B. Sentry redaction architecture (where to put the beforeSend hook)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-app inline | Each app's Sentry init defines its own beforeSend redaction list. | |
| **Shared helper in `@mcpgen/contracts`** | **Single `redactBeforeSend()` helper consumed by all 4 TS apps + Stage E generated tenant Workers; mirrored Python helper for engine.** | ✓ |
| OTel processor | Use OpenTelemetry processor for redaction (cross-stack). | |

**Auto-selected:** Shared helper — single source of truth; one PR-able location for redaction-list expansion. → D-03, D-04

---

## C. Source maps upload pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Per-runtime CI step | Each app's CI pipeline uploads its own source maps. | |
| **Single `pnpm sourcemaps:upload` orchestrator** | **Turborepo target invokes per-app commands; each skips when SENTRY_AUTH_TOKEN absent.** | ✓ |
| Manual operator step | Operator runs sentry-cli per-app on demand. | |

**Auto-selected:** Single orchestrator — local-friendly skip, Phase 10 CI wires the token in one place. → D-05

---

## D. Langfuse session_id correlation (where to inject)

| Option | Description | Selected |
|--------|-------------|----------|
| **PydanticAI run() metadata via Logfire OTel** | **Pass `metadata={"session_id": str(generation.id)}` at every `agent.run()` site; Logfire OTel exporter forwards to Langfuse.** | ✓ |
| OTel resource attribute | Set as service-level resource attribute (one place, less granular). | |
| Manual span instrumentation | Wrap agent.run() in custom span. | |

**Auto-selected:** PydanticAI metadata — minimal plumbing, matches PydanticAI/Logfire canonical pattern, satisfies CTRL-08 §2 verbatim. → D-06, D-07

---

## E. Cross-tenant smart-ID fuzz layer

| Option | Description | Selected |
|--------|-------------|----------|
| F1 static check only | Stage F1 fixture extends to cross-tenant case. | |
| Runtime guard only | Dispatch Worker rejects mismatched IDs at request time. | |
| **Both layers (defense in depth)** | **F1 static fuzz (5 tenants × 5 specs) + runtime guard in Dispatch Worker + integration test.** | ✓ |

**Auto-selected:** Both — Pitfall #1 is P0 (silent cross-tenant data exposure); two independent layers prevent correlated bypass. → D-08, D-09

---

## F. Multi-client smoke (Cursor / Claude Desktop / ChatGPT Deep Research)

| Option | Description | Selected |
|--------|-------------|----------|
| Manual runbook only | Operator clicks through 3 clients × 5 APIs × 1 task = 15 manual runs at W7. | |
| Automated only | Build harness for all 3 real clients (heavy lift; brittle). | |
| **Hybrid: automated 2024-protocol mock + manual real-client runbook** | **F3 mock_clients gets 4th 2024-protocol client (catches Pitfall #4 automatically); 3 real clients run manually at W7 per runbook.** | ✓ |

**Auto-selected:** Hybrid — 2024-protocol regression is the highest-value automation (Pitfall #4 is P0); real-client UX issues need a human eye anyway. → D-10, D-11

---

## G. PII deliberate-leak audit strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One-off W7 script only | Script runs at W7 against real Sentry; no CI gate. | |
| CI gate only | pytest/vitest unit test with mocked Sentry events. | |
| **CI gate + one-off W7 verification** | **CI prevents regression; W7 script verifies cloud-side filtering works against real Sentry.** | ✓ |

**Auto-selected:** Both — CI prevents future regression at zero ongoing cost; W7 catches Sentry-side filtering misconfiguration only real Sentry exposes. → D-12, D-13

---

## H. Inngest orphan audit

| Option | Description | Selected |
|--------|-------------|----------|
| Live-only API audit | Script queries Inngest API and reports orphans on demand. | |
| **Static assertion test + one-off live audit script** | **Static test (CI) prevents new orphans; live script for ad-hoc post-launch checks.** | ✓ |
| Live + automated cron | Cron runs the audit weekly. | |

**Auto-selected:** Static + live — static test runs in <1s, prevents new orphans on every PR; live script handles legacy / external-modification cases (Pitfall #21 prevention). → D-14, D-15

---

## I. Neon Scale-tier verification

| Option | Description | Selected |
|--------|-------------|----------|
| Skip until Phase 10 | Pitfall #19 verification deferred to launch. | |
| **Local synthetic load test + Phase 10 runbook** | **Synthetic load against local Postgres in Phase 9; real-Neon runbook executed at W7.** | ✓ |
| Real-Neon load only | Skip local test; only verify against real Neon at W7. | |

**Auto-selected:** Synthetic + runbook — local test catches SQL workload regressions; real-Neon test catches tier-specific OOM. → D-16, D-17

---

## J. Frontend BFF carry-forward endpoints

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 10 | Dashboard stays empty in local mode until launch prep. | |
| **Implement now in Phase 9** | **Closes Phase 7's `bff_unreachable` 502 gap; enables full local E2E flow (paste-URL → 60s → deploy → dashboard).** | ✓ |
| Implement skeletons only | 200 with empty data; defer real impl. | |

**Auto-selected:** Implement now — Phase 9 explicitly owns "cross-phase integration"; without these endpoints the dashboard is non-functional locally and W7 soft-launch demo fails. → D-18, D-19

---

## K. SLO documentation refresh (Pitfall #14)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip — too granular | Pitfall #14 doc fix deferred indefinitely. | |
| **Doc edit + Stage E template addition** | **Revise architecture.md §6 P99 statement + add `globalThis` Zod schema cache to Stage E template.** | ✓ |
| Doc edit only | Revise wording; skip template change. | |

**Auto-selected:** Doc edit + template — both are cheap (5 min + 1 template line); template change actually reduces cold-start tax. → D-20

---

## L. Outbox depth alert (replaces CF Queue depth alert per Phase 8 D-22)

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for Phase 10 (CF Queue) | No equivalent alert in Phases 1–9. | |
| **BetterStack heartbeat + local fallback script** | **`pnpm outbox:monitor` cron-able script + BetterStack heartbeat URL config (no-op without DSN).** | ✓ |

**Auto-selected:** Both — preserves CTRL-08 §3 alert-threshold spec verbatim (>10K) using local-compute equivalent. → D-21

---

## Claude's Discretion

Areas where the planner has flexibility (not gray-areas, just non-load-bearing details):
- Drizzle migration column types / idx names / defaults — follow existing patterns
- BFF endpoint pagination defaults (limit/offset) — Pass 3 standard parameter set
- Sentry release / environment naming — `@sentry/cli` defaults
- Logfire span names for redaction processor — Logfire convention
- Test file structure (table-driven vs per-vector) — existing vitest patterns

## Deferred Ideas

See `09-CONTEXT.md` `<deferred>` section. Phase 10 carries: real BetterStack production targets, CF Queue depth alert flip, real Neon upgrade, real-Sentry leak audit, source-maps token, Logto Pro pre-buy.

---

*Auto mode: all 12 gray areas resolved in single pass with recommended-option default per `discuss-phase.md` §discuss_areas auto-mode rules.*
