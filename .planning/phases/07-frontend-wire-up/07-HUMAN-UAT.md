---
status: partial
phase: 07-frontend-wire-up
source: [07-VERIFICATION.md]
started: 2026-04-30
updated: 2026-04-30
---

## Current Test

[awaiting human testing]

## Tests

### 1. Locked-UI visual regression baseline
expected: Render the 9 locked screens (landing, auth, canvas, stream, playground, preview, quality, deploy, dashboard) via the real Next.js build and visually diff against baseline screenshots captured from `apps/web/src/MCPGen.html` rendered in the prototype harness; ≤0.1% pixel delta required (D-04 acceptance).
why_human: Playwright screenshot-diff test at `apps/web/tests/visual-lock/9-screens.spec.ts` requires human-curated baseline regeneration after font-fallback diffs. Automated grep cannot judge design intent.
result: [pending]

### 2. Logto OAuth flow against real Logto Cloud tenant
expected: Email + GitHub provider sign-in / sign-up / sign-out / callback complete against real Logto Cloud free-tier tenant; `/dashboard/*` middleware redirects unauthenticated users to `/api/auth/logto/sign-in?redirect_to=…`; httpOnly Secure SameSite=Lax cookie set per D-19.
why_human: Requires LOGTO_ENDPOINT / LOGTO_APP_ID / LOGTO_APP_SECRET / LOGTO_BASE_URL / LOGTO_COOKIE_SECRET in `.env.local` (memory confirms creds available). Browser-driven OAuth redirects cannot be exercised offline.
result: [pending]

### 3. Pitfall #20 page-reload mid-generation in live mode
expected: With `MCPGEN_FRONTEND_MODE=live` and `apps/api` running real engine, kill SSE socket at t=5s, reload page, observe event log replay from Postgres + new SSE events resume from correct event_id; navigation to `/preview` lands when stage='completed' fires.
why_human: BFF generation kickoff (POST /api/v1/generate) is documented carry-forward — `apps/api/src/routes/v1/generate.ts` still returns 501 stub. Live-mode test cannot run end-to-end until BFF closes the gap. Fixture-mode equivalent passes.
result: [pending — gated on BFF carry-forward]

### 4. Hero flow ≤60s in live mode against real Stripe/GitHub spec
expected: Paste OpenAPI URL → live engine generation → preview screen rendered with Stage E TypeScript bundle in Shiki code panel + F2/F3 quality badge → mock deploy URL ≤60s wall-clock (FE-03 transparency principle, ROADMAP SC#3).
why_human: Same gating as item 3 — requires real BFF + real engine. `hero-flow-live.spec.ts` skips when `MCPGEN_FRONTEND_MODE !== 'live'`.
result: [pending — gated on BFF carry-forward]

### 5. End-to-end deploy + Claude Desktop config + 409 collision modal
expected: From preview, click 'Deploy' → BFF creates real CF tenant Worker → response includes `claude_desktop_config` + `claude://install` URL → 409 collision response triggers rename modal pre-filled with `suggested_name` (Pitfall #30); copy-to-clipboard button populates clipboard with valid JSON config block.
why_human: BFF endpoints `/deployments`, `/usage/hourly`, `/deploy/[id]`, `/badge-public` NOT YET implemented in `apps/api` (07-05-PRECONDITIONS.md §3); `deployments.public_badge` column missing from db-schema.ts; tenant Worker emit-pipe to TimescaleDB hypertable not live (Phase 6 CF carry-forward).
result: [pending — gated on Phase 6/8 carry-forward]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
