---
phase: 10-launch
phase_number: "10"
phase_name: Launch
workstream: main
status: discussed
mode: auto
created: 2026-04-30
depends_on:
  - "09-observability-polish"
requirements_covered:
  - GTM-01
  - GTM-02
  - GTM-03
pitfalls_anchored:
  - "#17 (MAU monitoring on Logto)"
  - "#22 (resist mid-launch scope creep — Out-of-Scope is contractual)"
  - "#23 (Friday demo cadence preserved through W10)"
---

# Phase 10 — Launch Context

## Phase Summary

Soft launch W7 (20 invited beta users) → Public launch W9 (Show HN, Product Hunt, Reddit r/MachineLearning + r/LocalLLaMA + X + LinkedIn). All launch criteria from `docs/mcpgen-implementation-plan.md` met. 5 founder W7 runbook actions executed. 4 cloud-secret provisioning groups land. The codebase is feature-complete after Phase 9 — Phase 10 ships **operations + content**, not features.

**Goal (one sentence):** From the user's perspective, paste-OpenAPI-URL → 60s → deployed MCP server with F2≥4.0 + F3≥0.7, validated by an external dev who has never used MCPGen, with pricing/legal/status visible, monitored end-to-end.

**Unit of correctness:** First 100 signups complete the hero flow within 72h of public launch with zero P1 incidents.

## Prior Context Applied

| Source | Constraint imported |
|---|---|
| Phase 9 verifier (`09-PHASE-VERIFICATION.md`) | 5 founder W7 runbook actions + 4 cloud-secret groups + 4 code follow-ups + 12 placeholder `session_id="unknown"` sites enumerated |
| `docs/mcpgen-implementation-plan.md` §6.6 + §11.7 | Soft W7 / Public W9 timing; Definition of Done; pre-launch checklist |
| `docs/mcpgen-gsd-sprint-plan.md` §4 | Workstream = `main`; Phase 10 in `main` worktree (not parallel) |
| `RULES.md` §6 + Pitfall #22 | Out-of-Scope contract is binding — no GraphQL / Postman / Python output / A/B deploys / SSO mid-launch |
| Phase 8 (`08-PHASE-DEVIATIONS.md`) | 8 carry-forwards from billing: R2 provisioning, CF Queue migration, Inngest Cloud signing, Logto Pro pre-buy, real-CF SSE re-spike, Hyperdrive provisioning, Fly.io engine deploy, Resend domain DNS verify |
| Phase 6 verifier | 8 carry-forwards from runtime: real CF Workers/WfP deploys, real CF KV/Queue, real workers-oauth-provider, real Stripe Meters submission, signed CLI binaries, db:test-migrate --incremental, real BetterStack/Sentry DSN, real-CF SSE re-spike |
| Phase 1 deviations rev 2 | Local-compute pivot — every `DEFERRED to Phase 10` marker now lands in this phase |

**Non-asks already locked (do NOT re-decide):**
- Stack frozen (CLAUDE.md §3) — no swaps
- Pricing tiers locked in `packages/contracts/src/launch-criteria.ts` — Free 1 F3/mo, Pro $60/mo includes 5 F3, PAYG $0.50/eval, cost cap $0.50/$2.00
- F2 ≥ 4.0 + F3 ≥ 0.7 thresholds locked as runtime constants (Pitfall #29 — blocks AI threshold-lowering)
- UI visually locked (`apps/web/src/styles` + `components/ui` — only legal/pricing content text added)

---

## Decisions (D-01 … D-22)

### D-01 — Sprint cadence (locked)

**Decision:** W7 = soft launch (20 invited) → W8 = public-launch prep + content production → W9 = public launch day.

**Rationale:** Two-week buffer between soft and public catches P0/P1 issues from the 20 beta users before scale exposure. Matches `mcpgen-implementation-plan.md` §6.6.

**Kill switches** (any one delays launch by 1 week, per ROADMAP):
- F3 success rate < 70% on top-5 APIs
- F2 smell average < 4.0
- P1 security finding (auth bypass, cross-tenant leak, credential exposure)
- Deploy success rate < 95% across the 20 beta users
- Founder unslept 5+ days

### D-02 — Cloud secrets provisioning order (locked)

**Decision:** Provision in this strict order to avoid downstream blockers:

1. **Sentry org + projects** (apps/web, apps/api, apps/dispatch, apps/generation-engine) — needed for source-map upload during deploys
2. **CF account + dispatch namespaces** (`mcpgen-prod`, `mcpgen-staging`) — apps/api + apps/dispatch deploys
3. **Vercel project** (apps/web) — Next.js deploy
4. **Fly.io org + machine** (apps/generation-engine) — Python engine deploy
5. **BetterStack** — needs production URLs from steps 2–4 to register uptime checks
6. **Logto Cloud Pro pre-buy** — Pitfall #17 (proactive — must NOT wait for MAU spike)
7. **Resend domain DNS** — needs production sender domain
8. **Real Stripe live keys** — flip from test mode last (after end-to-end test mode validation)

**Rationale:** Each downstream depends on prior step's URL/secret. Skipping = retroactive secret rotation (unsafe, per `mcpgen-git-workflow-rules.md`).

**Secrets that must NEVER be committed** (Pitfall already enforced via gitleaks):
- `SENTRY_AUTH_TOKEN`
- `CF_API_TOKEN`
- `VERCEL_TOKEN`
- `FLY_API_TOKEN`
- `BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_UPTIME_API_KEY`, `BETTERSTACK_OUTBOX_HEARTBEAT_URL`
- `LOGTO_ADMIN_API_TOKEN` (for MAU monitoring)
- `RESEND_API_KEY` (production)
- `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live)

### D-03 — 5 founder W7 manual runbook actions (locked)

**Decision:** Execute in this order during W7 (all runbooks already shipped):

| # | Day | Action | Runbook | Sign-off evidence |
|---|---|---|---|---|
| 1 | W7 D1 | Sentry org + 4 project DSNs + SENTRY_AUTH_TOKEN | (provisioning + Sentry UI) | Screenshot of 4 DSNs in CI secrets |
| 2 | W7 D1 | Logto Pro pre-buy (Pitfall #17) | (Logto admin) | Stripe receipt screenshot + Logto Pro tier visible |
| 3 | W7 D2 | Neon Scale-tier upgrade | `docs/runbooks/neon-scale-upgrade.md` | 10-min sustained load with zero connection-terminated errors |
| 4 | W7 D2-3 | Cloud deploys (CF + Vercel + Fly) | (per-app README + wrangler/vercel/fly CLI) | Live URLs in `.planning/phases/10-launch/10-DEPLOY-EVIDENCE.md` |
| 5 | W7 D3 | BetterStack uptime + heartbeat + status page | `docs/runbooks/betterstack-setup.md` | 6 uptime checks green + heartbeat firing + escalation policy active |
| 6 | W7 D4-5 | Multi-client smoke (5 APIs × 3 real clients = 15 runs) | `docs/runbooks/multi-client-smoke.md` | 15-run sign-off table filled |
| 7 | W7 D5 | Real-Sentry leak audit (`pnpm leak-audit --mode real`) | (single-file swap MockSentryEventsAdapter → RealSentryEventsAdapter) | `pnpm leak-audit --mode real` returns zero hits + sentinel canary triggered + redacted in Sentry UI |

**Rationale:** Sequential because step N+1 depends on outputs of step N (e.g. multi-client smoke needs production deploys; real-Sentry leak audit needs Sentry org + smoke-generated traffic).

### D-04 — Quickstart docs platform (locked)

**Decision:** **Mintlify** (already scaffolded at `apps/docs/` in Phase 1 plan 01-05). Not Docusaurus.

**Rationale:** Mintlify ships 95% of what we need (search, code blocks with syntax highlighting, `/api` reference auto-generation, custom domain, dark mode) with zero config. Switching to Docusaurus would cost 2-3 days of theming for no user-visible benefit. Pitfall #22 — resist scope creep mid-launch.

**External developer test (GTM-01):** A developer who has never used MCPGen completes Quickstart from scratch (no operator help) and reaches a deployed MCP server callable from Claude Desktop. Recruit one developer from Discord pre-launch list at start of W8. Sign-off: dated screenshot of their Claude Desktop showing 6 universal tools from a generated server. **Failure of this test = launch slip.**

### D-05 — Legal pages location (locked)

**Decision:** `apps/web/src/app/(legal)/{privacy,terms,pricing}/page.tsx` — Next.js App Router route group.

**Rationale:** Legal pages are CONTENT (text), not visual changes. The visual lock on `apps/web/src/styles` + `components/ui` does NOT block legal page creation since they reuse existing primitives (Container, Heading, Section). No new design tokens.

**Pricing page invariant:** Pricing copy must reference values from `@mcpgen/contracts/launch-criteria` (imported at build time, NOT hardcoded strings). Closes Pitfall #29 (AI lowering thresholds in copy ≠ code) AND keeps pricing page in sync with code-enforced quotas (GTM-02 acceptance criterion).

### D-06 — Code follow-ups before public launch (locked scope)

**Decision:** Fix exactly **2** of the 4 deferred items from Phase 9. Defer the other 2 to v1.1.

| # | Item | W7? | W9? | v1.1? | Rationale |
|---|---|---|---|---|---|
| 1 | Thread `generation_id` through pass orchestrator → replace 12 `session_id="unknown"` placeholders | ✅ W8 | | | Langfuse traces useless for debugging real customer issues if session_id is "unknown". ~4 hours work. Required for post-launch incident response |
| 2 | `usage_hourly` matview refresh (currently blocks `drizzle-kit push`) | ✅ W7 D2 | | | Blocks any future schema migration. Must fix before public launch since post-launch hotfixes WILL need migrations |
| 3 | Outbox depth alert dedup table | | | ✅ defer | Only matters if Resend rate-limit incident occurs. BetterStack escalation policy with 5-min cadence already deduplicates at notification layer |
| 4 | Pagination on `/usage/hourly` | | | ✅ defer | Dashboard does not surface long-time-window views in v1; only matters if a customer requests it |

**Rationale:** Pitfall #22 — keep scope tight. Items 3+4 add code without user-visible benefit at launch.

### D-07 — Public launch channels + posts (locked)

**Decision:** All five channels go live the **same day** (W9 Tuesday morning Pacific time):

| Channel | Format | Owner | Pre-write deadline |
|---|---|---|---|
| Show HN | "MCPGen — generate MCP servers from any OpenAPI URL in 60s, validated by agent" + linked demo video | Founder | W8 D5 |
| Product Hunt | Header tagline matches landing copy; 5 rotating screenshots; 60s demo video; founder comment with origin story | Founder | W8 D5 (Product Hunt loads at 12:01 PT W9) |
| Reddit r/MachineLearning | Technical post leading with the F2/F3 quality scoring methodology + paper rubric (engineering audience) | Founder | W8 D5 |
| Reddit r/LocalLLaMA | Practical post leading with "ChatGPT Deep Research compliance" + Six-Tool Pattern (LLM-tools audience) | Founder | W8 D5 |
| X / Twitter | 8-tweet thread with the demo + cost comparison vs hand-written MCP servers | Founder | W8 D5 |
| LinkedIn | Single-post launch announcement linking to landing | Founder | W8 D5 |

**Rationale:** Same-day saturation maximizes the algorithmic boost from cross-platform engagement. Sequential posts would dilute the launch moment.

**Pre-recorded demo videos** (per Pitfall #23 + GTM-03): 5 videos × 60s each, one per popular API (Stripe, GitHub, Notion, Linear, Slack), recorded W7 + edited W8 (Friday is editing only).

### D-08 — Soft launch invite list (locked)

**Decision:** 20 invitees breakdown:
- 5 from founder personal network (devs who can give honest critical feedback)
- 5 from Discord/Twitter pre-launch waitlist (early adopters, tolerate rough edges)
- 5 from MCP-adjacent communities (Anthropic Discord, MCP GitHub discussions, Claude Code users)
- 5 API-provider DX leads (cold outreach with specific value pitch — "your API → instant MCP server")

**Onboarding flow:** Personal email from founder with Loom video walkthrough + Discord invite for direct feedback. Each invitee gets `MCPGEN_BETA_USER` flag in Postgres for analytics segmentation.

**Rationale:** Mixed cohort surfaces different failure modes (personal network = catches UX issues, waitlist = catches feature gaps, MCP community = catches protocol-edge cases, API providers = catches enterprise-API quirks).

### D-09 — Status page (locked)

**Decision:** BetterStack status page at `status.mcpgen.dev`. Public. Auto-populated from the 6 uptime checks + heartbeat already provisioned in `docs/runbooks/betterstack-setup.md`.

**Rationale:** No build/maintain — BetterStack ships this OOTB. CNAME → done.

### D-10 — Customer support flow (locked)

**Decision:** v1 = `support@mcpgen.dev` Resend forward to founder personal email. v1.1 = upgrade to Plain or Help Scout if volume > 20 tickets/week post-launch.

**Rationale:** Pitfall #22 — don't over-engineer support before there are users to support.

**First-100-user CS flow:** Personal email follow-up to every signup within 24h with onboarding tips. Track in `users.first_contact_at` column (single migration).

### D-11 — Cost alerts (locked)

**Decision:** Set alerts at **50% / 75% / 100%** of monthly budget on every paid vendor:

| Vendor | Monthly budget cap | Alert mechanism |
|---|---|---|
| Neon (Scale tier) | $250 | Neon billing alerts to ops email |
| Cloudflare (Workers + WfP) | $50 | CF dashboard cost alerts |
| Vercel (Pro) | $20 | Vercel billing alerts |
| Fly.io (engine machine) | $30 | Fly.io billing alerts |
| Logto (Pro tier) | $99 | Logto admin billing alerts |
| OpenRouter | $200 | OpenRouter usage limits API |
| Sentry | $26 | Sentry billing alerts |
| BetterStack | $25 | BetterStack billing alerts |
| Resend | $20 | Resend billing alerts |
| **TOTAL ceiling** | **$720/mo** | All to ops email |

**Rationale:** $720/mo allows comfortable beta cushion. 50% alert lets founder act before 75% is hit; 100% triggers emergency review.

### D-12 — Backup verification (locked)

**Decision:** Pre-launch checklist (W8 D5) verifies:
- Neon point-in-time recovery: take snapshot, restore to staging branch, verify schema + 1 row from `organizations` matches
- R2 immutable bucket policy on `mcpgen-specs/` and `mcpgen-artifacts/` (object lock enabled)
- Stripe customer data: backup via Stripe Dashboard CSV export weekly to R2

### D-13 — MAU monitoring (Pitfall #17)

**Decision:** Daily Inngest cron pulls Logto Admin API `users` count, writes to `mau_log` table (Phase 8 plan 04 already migrated). Alert thresholds:
- 80% of free tier limit (4000 MAU on free; 4000 if Pro pre-bought) → ops email
- 95% → ops email + Slack/Discord webhook

**Rationale:** Logto Pro pre-buy already locked in D-02 — alert is belt-and-suspenders for the case where pre-buy expires or pricing changes mid-launch.

### D-14 — Friday demo cadence (Pitfall #23)

**Decision:** W7, W8, W9 each must produce a Friday demo video. Pre-recording happens Mon-Thu; Friday is **editing only**. If the week's milestone doesn't allow a 5-min demo, that week is not complete (slip).

**W7 Friday demo:** "20 beta users use MCPGen end-to-end."
**W8 Friday demo:** "Public launch readiness walkthrough" (status page + monitoring + content scheduled).
**W9 Friday demo:** Retrospective on launch metrics (signups, deploys, F3 pass rate, cost per generation).

### D-15 — Out-of-Scope contract (Pitfall #22)

**Decision:** During W7-W9 the following requests are **automatically rejected** without further discussion (deferred to v1.1):

- GraphQL spec parser
- Postman collection parser
- Python output target (TypeScript only at launch)
- A/B deploys
- Regression testing (compare current vs prior generation)
- Custom domains for tenant Workers
- SSO / Team plan tier
- Auto-regenerate on drift (drift detection ships, auto-regen is opt-in via flag only)
- F3 examples generation from real execution traces (deferred per Phase 5 SUMMARY)
- Multi-region deploys

**Enforcement:** if any of these surface as "we should add it before launch", treat as a launch-delay risk and redirect to roadmap backlog instead.

### D-16 — Launch criteria gating (`launch-criteria.ts`)

**Decision:** All `launch-criteria.ts` constants must be SATISFIED in production before W9 public launch. CI check `launch-criteria-assertion` (already shipped in Phase 1 plan 01-02) runs on every PR; W7 manual checklist verifies live values. Specifically:
- `F2_SMELL_MIN: 4.0` → live measurement on top-5 APIs ≥ 4.0
- `F3_AGENT_PASS_RATE_MIN: 0.7` → live measurement on top-5 APIs ≥ 0.7
- `PASS_KB: 800`, `WARN_KB: 950` → all bundles ≤ 800 KB; warn-only between 800-950 KB

If a measurement fails, that's a kill switch (D-01) — do NOT lower the threshold.

### D-17 — Pre-launch checklist anchor

**Decision:** Pre-launch checklist (executed W8 D5) includes:
- [ ] Status page live at `status.mcpgen.dev`
- [ ] Incident runbook for top-5 likely failures: (a) engine OOM, (b) CF rate limit hit, (c) Stripe webhook failure, (d) Neon connection-terminated, (e) Logto auth outage
- [ ] Customer support inbox `support@mcpgen.dev` routed and tested with synthetic ticket
- [ ] Backups verified (Neon PITR, R2 immutable, Stripe CSV export) per D-12
- [ ] Cost alerts at 50%/75%/100% on every vendor per D-11
- [ ] Logto Pro tier active (D-02 step 6)
- [ ] All 4 SDK Sentry DSNs live in production
- [ ] BetterStack uptime checks green for ≥ 24h
- [ ] Demo videos for 5 APIs published to Mintlify docs + Twitter media library
- [ ] Multi-client smoke 15-run sign-off table filled (D-03 step 6)
- [ ] Real-Sentry leak audit zero-hits (D-03 step 7)
- [ ] Quickstart external developer test passed (D-04)

### D-18 — Public-launch monitoring intensity

**Decision:** Founder on-call mode 72h post-launch (W9 Tue 9am PT through Fri 9am PT):
- Sentry alerts → push notification on phone
- BetterStack downtime alerts → SMS + push
- `outbox-depth-monitor` cron → email if depth > 100
- HN/PH/Reddit comment monitoring every 2h during PT business hours
- New signups CS email follow-up within 24h (D-10)

After 72h: alerts drop to email-only unless P1.

### D-19 — Launch retrospective + Phase 11 trigger

**Decision:** W10 retrospective writes `.planning/phases/10-launch/10-PHASE-VERIFICATION.md` capturing:
- First 100 signup metrics (cohort source, conversion, F3 pass rate)
- Top 3 issues surfaced during 72h on-call
- v1.1 backlog priorities derived from beta feedback + D-15 deferrals
- Recommendation for milestone v1.1 cadence

**Rationale:** GSD framework requires phase verification doc — this is also the natural "next milestone planning" trigger.

### D-20 — Founder-burnout failsafe (D-01 kill switch operationalized)

**Decision:** Founder commits to:
- Hard 8h sleep minimum nights of W7 D5, W8 D5, W9 D1 (launch-eve)
- One full off-day after soft launch (W7 Sat) and after public launch (W9 Sat)
- If 5+ consecutive days < 6h sleep → automatic 1-week launch slip (D-01 kill switch)

**Rationale:** R2 from Risk Register (`mcpgen-implementation-plan.md` §8). Solo burnout is the single highest-likelihood × highest-impact risk. Pre-committed slip rule prevents heroics from breaking the launch.

### D-21 — Launch-day decision authority

**Decision:** Only the founder approves launch-day decisions (deploys, content publishing, kill-switch trips). No autonomous AI agent action on production secrets/deploys during W9 (manual confirmation gate per CLAUDE.md "executing actions with care").

**Rationale:** Launch day is one-way-door territory. Agent assistance acceptable for content drafting, monitoring summaries, code follow-ups; but every production push or kill-switch decision is human-in-loop.

### D-22 — Phase-9 stash-race retro (carry-forward)

**Decision:** Phase 10 plan-set will include a small chore to harden `.husky/pre-commit` stash-restore semantics for the case where parallel git operations happen on the same working tree (per `09-PHASE-VERIFICATION.md` parallel_execution_observations). Won't block launch — but ships before W9 to prevent attribution mistakes during W9 hotfix flurry.

---

## Plan Targets (TBD by `/gsd-plan-phase 10`)

The plan-phase agent will divide D-01..D-22 into ~8-12 PLAN.md files across ~3 waves:

**Wave 1 (W7 D1-D2 — provisioning + critical follow-ups):**
- 10-01: Cloud secrets provisioning (D-02 steps 1-7) + Sentry org + Logto Pro pre-buy
- 10-02: Production deploys (CF + Vercel + Fly) (D-03 step 4)
- 10-03: Code follow-ups — `generation_id` threading + matview refresh (D-06)
- 10-04: Neon Scale-tier upgrade (D-03 step 3)

**Wave 2 (W7 D3-D5 — operations + smoke):**
- 10-05: BetterStack + status page + cost alerts (D-03 step 5 + D-09 + D-11)
- 10-06: Multi-client smoke 15-run + real-Sentry leak audit (D-03 steps 6-7)
- 10-07: Pre-commit stash-restore hardening (D-22)

**Wave 3 (W8 — content + legal + docs):**
- 10-08: Quickstart docs + external dev test (D-04 + GTM-01)
- 10-09: Privacy/ToS/Pricing pages (D-05 + D-06 + GTM-02)
- 10-10: Demo videos for 5 APIs + content production (D-14)
- 10-11: Pre-launch checklist + incident runbooks + backup verification (D-17 + D-12)

**Wave 4 (W9 — launch day):**
- 10-12: Soft-launch onboarding + invitee list (D-08)
- 10-13: Public launch posts + on-call mode (D-07 + D-18)
- 10-14: Phase-10 verification doc + v1.1 backlog (D-19)

---

## Out of Scope (per D-15)

Each item below is **rejected on sight** during W7-W9 if proposed:

| Item | Defer to | Reason |
|---|---|---|
| GraphQL spec parser | v1.1 | Not in MVP per `mcpgen-implementation-plan.md` §11 |
| Postman parser | v1.1 | Same |
| Python output target | v1.1 | TypeScript only at launch |
| A/B deploys | v1.1 | Adds deploy complexity for no user-visible benefit at v1 |
| Regression testing across generations | v1.1 | Requires snapshot store per generation |
| Custom domains for tenant Workers | v1.1 | CF KV cost; adds tenant config UI burden |
| SSO / Team plan | v1.1 | Logto Pro features sufficient for individual users |
| Auto-regenerate on drift (default-on) | v1.1 | Drift detection ships; auto-regen opt-in via flag only |
| F3 examples generation from real traces | v1.1 sandbox feature | Per Phase 2 design |
| Multi-region engine deploys | v1.2 | Single Fly machine sufficient at < 10K MAU |
| Outbox dedup table | post-launch incident-driven | D-06 item 3 |
| `/usage/hourly` pagination | post-launch dashboard need-driven | D-06 item 4 |

---

## Open Questions

**None blocking** — all decisions auto-resolved.

Track during execution:
- OQ-1: Does `mcpgen-prod` CF dispatch namespace need a paid CF plan? (verify in 10-01 — may surface a cost surprise)
- OQ-2: Does Stripe live mode require additional KYC beyond what test mode showed? (verify in 10-01 D-02 step 8)
- OQ-3: Does Mintlify free tier handle our expected docs traffic, or do we need their Pro? (verify in 10-08; cost negligible either way)

---

## Next Steps

1. Run `/gsd-plan-phase 10` (planner agent will derive ~14 plans across 4 waves above)
2. Plans verifier-loop happens automatically per phase config (`workflow.plan_self_check: true`)
3. Begin W7 execution against Wave 1 once plans land
4. Founder confirms availability for the 5 manual W7 actions (D-03)

---

*CONTEXT created with `/gsd-discuss-phase 10 --auto` on 2026-04-30. All gray areas resolved with auto-defaults; founder may amend any D-XX before plan-phase runs.*
