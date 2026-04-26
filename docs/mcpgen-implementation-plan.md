# MCPGen — Implementation Plan

> **Format:** GSD (Get Shit Done) — high-level execution contract.
> **Audience:** myself (solo founder), as if I were leading a small team.
> **Granularity:** phases & tracks, not tasks. Tasks live in Linear/GitHub Issues.
> **Update cadence:** end of every week.
> **Status:** v0.1 — pre-execution. Will become source-of-truth once Phase 0 starts.

---

## 0. How to read this document

This is **not** a task list. This is a **contract on phases, dependencies, and parallelization strategy**. Tasks are downstream artifacts derived from this plan.

Every section answers one of three questions:
1. **What** must be true at the end of this phase?
2. **Which** work can happen in parallel and which must serialize?
3. **What** breaks if a phase slips?

If you find yourself reading this and looking for a task — wrong document. Open Linear.

---

## 1. Executive Summary

| | |
|---|---|
| **Goal** | Public beta launch of MCPGen with paid usage-based plans |
| **Timeline** | 9 weeks from Phase 0 kickoff |
| **Soft launch** | Week 7 (closed beta, 20 invited users) |
| **Public launch** | Week 9 (Show HN, Product Hunt, Reddit) |
| **MVP scope** | OpenAPI 3.x → optimized TypeScript MCP server, hosted deploy, usage billing |
| **Non-MVP** | GraphQL, Postman, Python output, A/B deploys, regression testing |
| **Pre-existing assets** | UI/UX design done in Claude Design — needs integration, not creation |
| **Critical path length** | ~6 weeks (IR → codegen → runtime → billing) |
| **Slack** | 3 weeks (parallel work absorbs delays) |

**One-sentence thesis on feasibility:** with the UI already designed and the architecture committed, the critical path is dominated by Generation Engine and Runtime Plane work — both well-scoped problems with no research risk. Reasonable target.

---

## 2. Operating Model

### 2.1 Principles (in priority order)

1. **Ship over perfect.** A working Stripe-MCP-server demo at week 3 beats a polished landing page at week 9 with no demo.
2. **Critical path first, every day.** Each morning ask: "what advances the critical path today?" Do that first. Polish/marketing/docs come after.
3. **Vendors are cheaper than time.** If something is < $50/mo and saves a week — buy it. Time-to-launch dominates everything else pre-revenue.
4. **Lock contracts early.** API contracts, IR schema, DB schema — freeze in week 2. Changes after that are expensive.
5. **No premature optimization.** Single-region deployments, single LLM provider, no caching beyond Anthropic's built-in. Optimize when there's revenue at stake.
6. **Demo-driven development.** Every Friday, end of day: 5-minute self-recorded demo of new capability. If it can't be demoed, it doesn't count as done.

### 2.2 Solo realities (and how parallelization actually works)

I am one person. I cannot literally do two things at once. "Parallel tracks" in this plan means:

- **Async vendor work** runs in parallel (CF deploy taking 5 min, Vercel build taking 3 min — fill that with docs).
- **Cold tasks during hot blockers:** when waiting for an LLM API rate-limit reset, or compile, switch to a parallel track.
- **Batched context-switches:** group all "frontend integration" work into half-days, all "Python engine" into half-days. Don't flit.
- **Front-loadable work:** marketing, docs, landing copy can be drafted any time — used as recovery work after burnout days.

Translation: "parallel" = "independent enough that I can switch context to it when blocked, without redoing work."

### 2.3 Daily / weekly cadence

| Cadence | Activity | Time |
|---|---|---|
| Daily AM | Open this plan + Linear. Identify today's critical-path task. | 10 min |
| Daily PM | Commit, push, check CI green. | 15 min |
| Friday EOD | Update this plan: what's done, what slipped, why. Record a demo. | 60 min |
| Sunday | Plan next week's first 3 tasks. Email/community check. | 30 min |
| Monthly | Architecture review: is anything diverging from the architecture doc? | 2 hr |

### 2.4 What "done" means for this plan

A phase is **done** when:
1. All listed Outputs are merged to `main`.
2. Definition of Done bullets pass.
3. A Friday demo proves the capability end-to-end.
4. Documentation in `/docs` reflects the new state.
5. Decision log is updated with anything that changed.

No exceptions. "90% done" = not done.

---

## 3. Phases Overview

```
Week:        1     2     3     4     5     6     7     8     9
            ─┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─
Phase 0:    ▓▓▓▓▓                                              Foundation
Phase 1:          ▓▓▓▓▓▓▓▓▓▓▓                                   Core Generation
Phase 2:                      ▓▓▓▓▓▓▓▓▓▓▓                       LLM Optimization
Phase 3:                                  ▓▓▓▓▓▓▓▓▓▓▓           Runtime & Deploy
Phase 4:                                              ▓▓▓▓▓▓    Billing & Polish
Phase 5:                                                    ▓▓  Launch
            ─┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─

Tracks running in parallel inside each phase ↓
```

| Phase | Weeks | Theme | Critical output |
|---|---|---|---|
| **0. Foundation** | W1 | Accounts, monorepo, CI, contracts | Empty-but-deployable apps in all environments |
| **1. Core Generation** | W2–3 | Spec → IR → naive codegen | `npx mcpgen init <stripe-url>` produces working (un-optimized) MCP server |
| **2. LLM Optimization** | W4–5 | 6 optimization passes + playground | Same input produces 50%+ token reduction; playground shows it |
| **3. Runtime & Deploy** | W6–7 | Tenant Workers + dispatch + usage events | One-click deploy → MCP server live → tool calls metered |
| **4. Billing & Polish** | W7–8 | Stripe Meters + pricing + landing | Test user can subscribe and exceed quota; gets billed |
| **5. Launch** | W9 | Beta → public | Public launch + first 100 signups |

Note: Phase 4 starts in parallel with end of Phase 3. See §5 for parallelization detail.

---

## 4. Parallel Tracks

Five tracks run across the 9 weeks. Different phases activate/deactivate different tracks.

```
                     ┌───────────────────────────────────────────────┐
   Track A:          │  Backend (Generation Engine — Python/FastAPI) │
   Generation        └───────────────────────────────────────────────┘
                     ┌───────────────────────────────────────────────┐
   Track B:          │  Frontend (Next.js + Claude Design integration)│
   Frontend          └───────────────────────────────────────────────┘
                     ┌───────────────────────────────────────────────┐
   Track C:          │  Runtime Plane (CF Workers / Dispatch / SDK)  │
   Runtime           └───────────────────────────────────────────────┘
                     ┌───────────────────────────────────────────────┐
   Track D:          │  Ops / Infra (DB, auth, billing, monitoring)  │
   Ops               └───────────────────────────────────────────────┘
                     ┌───────────────────────────────────────────────┐
   Track E:          │  Content (docs, landing, demos, GTM material) │
   Content           └───────────────────────────────────────────────┘
```

### 4.1 Track activation matrix

| Track | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 |
|---|---|---|---|---|---|---|---|---|---|
| A — Generation | ▓ | ▓▓ | ▓▓ | ▓▓▓ | ▓▓▓ | ▓ | · | · | · |
| B — Frontend | ▓ | ▓▓ | ▓▓ | ▓▓ | ▓▓ | ▓▓ | ▓▓ | ▓ | · |
| C — Runtime | ▓ | · | ▓ | · | · | ▓▓▓ | ▓▓▓ | ▓ | · |
| D — Ops | ▓▓ | ▓▓ | ▓ | · | · | ▓ | ▓▓ | ▓▓ | ▓ |
| E — Content | ▓ | ▓ | · | · | · | ▓ | ▓▓ | ▓▓ | ▓▓▓ |

`▓` = light/maintenance · `▓▓` = active dev · `▓▓▓` = primary focus

### 4.2 Track dependencies (what blocks what)

```
                                                        
   ┌─── Track D (Ops) ────────┐                         
   │ Auth, DB schema, secrets │                         
   └────────┬─────────────────┘                         
            │ unblocks                                   
            ▼                                            
   ┌─── Track A (Generation) ──┐  contract  ┌─ Track B (Frontend) ──┐
   │ IR → Codegen → Optimizer  │◄──────────►│ Generation flow UI    │
   └────────┬──────────────────┘            └────────────────────────┘
            │ produces                                   ▲
            │ artifacts                                  │
            ▼                                            │
   ┌─── Track C (Runtime) ─────┐                         │
   │ Tenant template, dispatch │                         │
   │ deploy API, usage events  │                         │
   └────────┬──────────────────┘                         │
            │ produces                                   │
            │ deployment URLs + metrics                  │
            ▼                                            │
   ┌─── Track D (continued) ───┐                         │
   │ Stripe Meters, billing UI │─────────────────────────┘
   └───────────────────────────┘                         
                                                        
   Track E (Content) — runs alongside, no hard dependencies
```

### 4.3 Critical contract surfaces

These must be agreed (with myself, in writing) before tracks can split:

| Contract | When locked | Owner | Affects |
|---|---|---|---|
| **IR schema** (Pydantic + TS types) | end of W1 | Track A | A, B, C |
| **Generation API** (`POST /generate` request/response) | end of W1 | Track A & D | A, B, D |
| **DB schema v1** | end of W1 | Track D | A, B, C, D |
| **Tenant Worker SDK API** | end of W3 | Track C | A (codegen targets it) |
| **Usage event schema** | end of W5 | Track C & D | C, D |

**Rule: lock contracts on Sunday, share schema files in `packages/contracts`. Breaking changes require a weekly review.**

---

## 5. Critical Path Analysis

The **critical path** is the longest sequence of dependent work. Slips here delay the whole launch.

### 5.1 Critical path nodes

```
W1                W2-3              W4-5             W6-7           W8       W9
                                                                              
[Foundations] ──► [IR + parser  ] ──► [Optim    ] ──► [Tenant    ] ──► [Bill] ─► [Launch]
                  [+ naive code ]     [passes   ]     [Worker SDK]
                  [   gen       ]     [+ valid- ]     [+ dispatch]
                                      [ ation   ]     [+ deploy  ]
                                                      [+ usage ev]
                                                                              
~5 days           ~10 days            ~10 days        ~10 days       ~5 days   ~5 days
                                                                              
                                                                              Total: ~45 days = 9 weeks
```

### 5.2 What's NOT on the critical path (do later if running hot)

- Frontend polish beyond functional
- Documentation site (one-pager is enough at launch)
- GraphQL / Postman support
- Python output for generated servers
- Custom domains for tenant Workers
- Team plan SSO (only Free + Pro at launch)
- API drift detection auto-regenerate (manual button is fine for v1)
- Most of the marketing site (lean on Claude Design assets)

### 5.3 Slip mitigation rules

| If slipping by | Action |
|---|---|
| 2 days | Cut one nice-to-have from current phase. |
| 5 days | Cut from launch scope (move to v1.1). |
| 10+ days | Re-evaluate launch date. Don't ship broken. |

---

## 6. Phase Details

### 6.1 Phase 0 — Foundation (W1)

**Goal:** Every component has an "empty but deployable" version. CI is green. All accounts exist. Contracts are written.

**Active tracks:** D (primary), A & B (skeletons), E (very light)

**Outputs:**
- Monorepo with `apps/{web,api,dispatch,generation-engine,cli}` — each scaffolded, hello-world, deployed
- All third-party accounts created and access keys in 1Password / .env templates
- DB schema v1 written (Drizzle migrations) and applied to dev Neon branch
- IR schema written and shared as `packages/contracts/ir.ts` + auto-generated Python types
- CI/CD pipelines green for every app
- Domain bought, DNS pointing, SSL working
- Logto Cloud configured with one user (me)
- Sentry, Langfuse, BetterStack receiving sample events from at least one app

**Definition of Done:**
- [ ] `pnpm dev` brings up entire local stack
- [ ] `git push main` triggers deploy to staging URLs that resolve and serve 200
- [ ] I can sign in to web app via Logto and see an authenticated empty page
- [ ] DB has all tables; `select 1` works through Drizzle
- [ ] Architecture doc reviewed; any decisions changed have entries in decision log

**Parallel opportunities:** While CI deployments grind, draft landing copy (Track E). While Logto setup pages load, write IR schema (Track A).

**Risk:** Underestimating account/setup time. Allocate full week. Don't compress to 3 days.

---

### 6.2 Phase 1 — Core Generation (W2–W3)

**Goal:** End-to-end naïve generation works. Submit OpenAPI URL → get a downloadable, working (un-optimized) MCP server.

**Active tracks:** A (primary), B (active), D (light), E (light)

**Outputs:**

Track A:
- OpenAPI 3.x parser → IR (using `prance`)
- Jinja2 templates for TypeScript MCP server (one file: `server.ts` + `package.json`)
- Naïve codegen pass: every endpoint becomes one tool, descriptions copied verbatim
- `POST /api/v1/generate` endpoint (sync for MVP, async added in Phase 2)
- Validator: `tsc --noEmit` on generated output, fail loudly

Track B:
- Generation flow page (paste URL, click Generate, see result)
- Tools list view (no playground yet)
- Download ZIP button
- Connection to Logto auth working

Track C: minimal — just a placeholder `dispatch` Worker

Track D:
- DB writes for `specs`, `generations` tables working
- R2 upload of generated artifacts
- Inngest function scaffolding (used in Phase 2)

Track E:
- Draft landing page hero copy
- 5 target API specs identified for "presets" (Stripe, GitHub, Notion, Linear, Slack)

**Definition of Done:**
- [ ] I can paste `api.stripe.com/openapi.json` into the web app, click Generate, and within 30 sec download a ZIP
- [ ] The ZIP, after `npm install && npm start`, exposes a working MCP server
- [ ] I can connect Claude Desktop to this local server and call a Stripe tool successfully (with my Stripe test key)
- [ ] CLI `npx mcpgen init <url>` produces the same artifact locally
- [ ] All three of the above are in a recorded demo video

**Hard contracts locked at end of W2:**
- IR schema (frozen — changes require migration)
- DB schema v1 (frozen)
- Generate API contract (frozen)

**Parallel opportunities:**
- Track B can build UI against mocked API responses while Track A is implementing real backend
- Track D can write all DB migrations and seed scripts in parallel
- Track E can draft documentation against the IR schema once locked

**Risk:** Stripe's OpenAPI spec is huge (350+ endpoints). If naïve generation produces a 2MB Worker that won't deploy — that's a Phase 1 blocker, not a Phase 3 surprise. Test early.

---

### 6.3 Phase 2 — LLM Optimization (W4–W5)

**Goal:** The same input now produces 50%+ token reduction. Optimization is visible, explainable, and measured. Playground proves it works in a real agent.

**Active tracks:** A (primary), B (active), D (very light)

**Outputs:**

Track A — the heart of the product:
- PydanticAI agents for each of the 6 passes:
  1. Description compression
  2. Endpoint clustering (composite tools)
  3. Parameter pruning
  4. Response shaping (jq filters)
  5. Pagination strategy
  6. Auth strategy
- Pass orchestration with retries, fallback chain (Anthropic → OpenAI via LiteLLM)
- Optimization report generation (before/after token counts per tool)
- Anthropic prompt caching configured for system prompts (reduce LLM costs by 50–90%)
- Async generation flow: enqueue Inngest job, stream progress via SSE
- Langfuse v4 OTel instrumentation working — every pass traced

Track B:
- Real-time progress UI (per-pass progress, partial results)
- Optimization report view (the "savings" visualization)
- Playground v1: chat interface with live trace, side-by-side token comparison
- Tools view shows token cost per tool

Track D:
- Inngest functions deployed and connected
- Anthropic API key vault and rate-limit tracking

**Definition of Done:**
- [ ] Same Stripe spec from Phase 1 now produces a server with ≥50% fewer tool-description tokens
- [ ] Optimization report shows breakdown per pass with concrete numbers
- [ ] Playground: I can ask "get my last 5 charges" against the optimized server, see the agent call the right tool, and see the trace match expected behavior
- [ ] Failed LLM calls retry and eventually succeed or fail gracefully (not silently)
- [ ] Generation cost (LLM) per Stripe-spec run is tracked and ≤ $0.50

**Parallel opportunities:**
- Each pass is independently developable — could be implemented in any order. Easiest first (description compression) to validate the framework, then hardest (endpoint clustering).
- Frontend playground UI development is independent of which passes are completed first
- Anthropic prompt caching setup parallel to first pass implementation

**Risk:** Optimization passes might produce broken descriptions / wrong tools. **Mitigation:** add an automated eval at end of Phase 2 — a small set of "golden inputs" with expected outputs, run on every change. Track Track-A regression like Track-A.

**Cost watch:** This phase burns the most LLM money. Set hard daily cap at $20/day during dev. Use cached responses aggressively in tests.

---

### 6.4 Phase 3 — Runtime & Deploy (W6–W7)

**Goal:** A user can deploy their generated server to our cloud, get a URL, connect Claude Desktop, and we capture every tool call as a usage event.

**Active tracks:** C (primary), B (active), D (active), A (light)

**Outputs:**

Track C — primary work:
- `@mcpgen/runtime` SDK package (used by generated tenant Workers)
- Tenant Worker template (what the codegen actually outputs)
- Dispatch Worker: subdomain → tenant routing, auth check, rate limit
- Workers for Platforms namespace setup
- Deploy API: `POST /deployments` → uploads Worker via CF API → returns URL + key
- Pass-through credentials encryption flow
- Usage events: `ctx.waitUntil()` → CF Queue → Inngest worker → TimescaleDB
- Per-tenant config: stored credentials option (encrypted in CF KV)

Track B:
- Deploy modal (auth mode, server name, target)
- Post-deploy success page (config snippets for Claude Desktop, Cursor, etc.)
- Dashboard v1: tool calls, token savings, latency, error rate
- API drift indicator (read-only — full alert pipeline in Phase 4)

Track D:
- Inngest worker for usage event ingestion
- TimescaleDB hypertable + continuous aggregates working
- BetterStack ingesting structured logs from tenant Workers

Track A:
- Codegen now outputs Worker-compatible code (uses `@mcpgen/runtime` SDK)
- Smoke-test phase added to validator: actually deploy generated code to a staging Worker namespace and call `tools/list`

**Definition of Done:**
- [ ] Click "Deploy" → 5 sec later → live MCP server URL
- [ ] Connect Claude Desktop with one-click config copy → working tool calls
- [ ] Dashboard shows real-time tool call count, latency, errors
- [ ] Three concurrent tenants each see only their own data (isolation verified)
- [ ] Pass-through credential mode: I can route via our Worker without our backend ever seeing the Stripe key (verified by checking logs)
- [ ] P99 latency overhead vs direct Stripe call is < 100ms

**Parallel opportunities:**
- Tenant Worker template can be developed against fake codegen output (Track C parallel to Track A)
- Frontend dashboard can use seeded fake data until real events flow
- Drift indicator UI can be built before drift detection backend is wired

**Risk:** CF Workers for Platforms quotas and pricing surprises. **Mitigation:** verify dispatch namespace limits at Phase 3 start before depending on them. Have a "single multi-tenant Worker" fallback design ready.

**Risk:** One-click Claude Desktop install (`claude://` deeplink) might not exist or work as expected. **Mitigation:** verify in W5 (during Phase 2). Fallback is `.mcpb` package or copy-paste config.

---

### 6.5 Phase 4 — Billing & Polish (W7–W8)

**Goal:** A paying user can subscribe, exceed quota, and be billed correctly. Pricing is on the website. Free tier blocks at quota. Pro tier overage works.

**Active tracks:** D (primary), B (active), E (active), C (light)

**Outputs:**

Track D:
- Stripe Customer/Subscription creation tied to org
- Stripe Meters: `mcpgen_tool_calls`, `mcpgen_optimization_runs` defined and receiving events
- Quota enforcement in Dispatch Worker (free tier blocks; paid tier allows overage)
- Stripe Customer Portal embed for self-service
- Email pipeline (Resend) for: signup, deploy success, quota warning, drift alert, payment events

Track B:
- Pricing page (using Claude Design)
- Checkout flow (Stripe Checkout or Embedded)
- Usage display in dashboard with quota progress bar + projected end-of-month cost
- Settings page (org, billing, team members deferred)

Track E:
- Landing page final copy + hero demo
- Docs site (Mintlify or just MDX in Next.js): Quickstart, OpenAPI guide, MCP setup, FAQ
- Demo videos: 30-sec hero loop, 2-min deep dive, 5-min full walkthrough
- 5 pre-cached popular API generations ready for the lander demos

Track C: light maintenance, fix issues found during Phase 3 dogfooding

**Definition of Done:**
- [ ] Test user signs up → free → uses → hits quota → blocked
- [ ] Test user upgrades to Pro via Stripe Checkout → overage allowed → receives correct invoice at month end (test mode)
- [ ] Pricing page is up and matches reality
- [ ] Quickstart doc walks a fresh dev from zero to deployed MCP in < 5 minutes
- [ ] Hero video on landing is 30 seconds and shows the actual product

**Parallel opportunities:**
- Stripe setup is largely vendor-config; UI work can run independently
- Content production (videos, docs) can happen on burnout/recovery days

---

### 6.6 Phase 5 — Launch (W9)

**Goal:** Public launch. First wave of users. Monitor for fires.

**Active tracks:** E (primary), D (monitoring), all others on bug-fix-only

**Outputs:**
- Soft launch: 20 invited users (week 7 actually, validates Phase 4)
- Public launch posts:
  - Show HN
  - Product Hunt
  - r/ClaudeAI, r/cursor, r/LocalLLaMA, r/programming
  - X / Twitter thread
  - LinkedIn post
- Post-launch monitoring: BetterStack dashboards, Sentry alerts on, on-call mode
- First-100-users CS flow: personal email follow-up to every signup

**Definition of Done:**
- [ ] Public on Show HN front page-attempt with substantive comments engaged
- [ ] First paying customer
- [ ] No P1 incidents in 72h post-launch
- [ ] Architecture doc and runbooks updated with anything found in launch firefighting

**Pre-launch checklist (W8 end):**
- [ ] Status page live
- [ ] Incident runbook for top-5 likely failures
- [ ] Customer support inbox routed (Plain or just email)
- [ ] Backups verified (Neon point-in-time, R2 immutable)
- [ ] Cost alerts at 50%/75%/100% of budget on every vendor

---

## 7. Milestones & Demos

Demo-driven development means every milestone is provable in a 5-minute video.

| # | Milestone | Date | Demo content |
|---|---|---|---|
| M1 | Foundation deployed | end W1 | "All apps deploy from `git push`. Show empty pages on real URLs." |
| M2 | Naive generation works | end W3 | "Stripe URL → ZIP download → run locally → Claude Desktop calls a tool." |
| M3 | Optimized generation works | end W5 | "Same Stripe URL → 75% fewer tokens. Playground shows agent succeeding." |
| M4 | Hosted deploy works | end W7 | "One-click deploy → live URL → connect Claude → dashboard shows real-time calls." |
| M5 | Paid tier works | end W8 | "Test user upgrades to Pro, exceeds free, gets correctly billed." |
| M6 | Public launch | end W9 | The launch posts themselves. |

**Rule: if the Friday demo can't be recorded, the week is not complete. Slip the milestone, do not slip the demo.**

---

## 8. Risk Register

Prioritized by likelihood × impact.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | LLM optimization passes produce wrong/broken outputs | High | High | Golden eval set in W4, regression test on every change |
| R2 | Solo burnout around W5–W6 (most intense phase) | High | High | Force one weekend off after Phase 2; W6 starts with reduced ambition if needed |
| R3 | CF Workers for Platforms pricing/limits surprise | Medium | High | Verify in W3 dispatch worker setup; design single-Worker fallback |
| R4 | Anthropic rate limits during dev (esp. Phase 2) | Medium | Medium | LiteLLM fallback to OpenAI from day 1; cache test fixtures locally |
| R5 | Generated code fails on edge cases (huge specs) | Medium | Medium | Test with 5 real specs in W2; `max_tools` limit enforced in W3 |
| R6 | One-click Claude Desktop install doesn't work as expected | Medium | Medium | Verify in W5; fallback to `.mcpb` or copy-paste |
| R7 | Stripe Meters API quirks (it's relatively new) | Medium | Medium | Spike Stripe integration in W6 (early), not W7 |
| R8 | Logto Cloud quirks at scale or auth bugs | Low | High | Have Auth.js + custom OAuth as backup plan documented |
| R9 | Pricing too high (no signups) or too low (no profit) | Medium | Medium | Launch with conservative prices, A/B in week 4 post-launch |
| R10 | Spec parser fails on real-world OpenAPI variations | Medium | Low | Test with 10+ real specs across W2–W3 |

**Re-review weekly. Add new risks as they surface. Don't keep dead risks.**

---

## 9. Decision Log Template

Living file at `docs/decisions/`. One Markdown file per decision, named `NNNN-short-title.md`.

```markdown
# 0007: Use Logto Cloud free tier on launch instead of self-host

**Date:** 2026-MM-DD
**Status:** Accepted
**Context:** Need OAuth 2.1 server. Self-host requires ops time we don't have pre-launch.
**Decision:** Logto Cloud free tier (≤ 5K MAU). Migrate to self-host at month 3 if needed.
**Consequences:** $0/mo until 5K MAU. Vendor risk if Logto Cloud has incident. M2M tokens add a hop in latency.
**Alternatives considered:** Auth.js (slabее OAuth server), Clerk (worse OAuth 2.1), self-host Logto from day 1 (too much ops).
```

**Rule:** every architectural change + every vendor swap + every scope cut → decision file. Future-me will thank present-me.

---

## 10. Launch Criteria

### 10.1 Must-have (block launch if not done)

- [ ] Generate from OpenAPI URL works end-to-end (5 popular APIs tested manually)
- [ ] Optimization passes deliver ≥ 50% token reduction on average
- [ ] Hosted deploy works for any successfully generated server
- [ ] Pass-through credentials proven secure (we never log/store user upstream keys)
- [ ] Free / Pro tier checkout works in production (not test mode)
- [ ] Quota enforcement works (free hits 100% → blocked; Pro overflows → billed)
- [ ] Sentry capturing errors; BetterStack alerting on uptime
- [ ] One-click Claude Desktop config (or clear copy-paste fallback)
- [ ] Privacy policy + ToS published
- [ ] Pricing page matches reality
- [ ] Quickstart doc tested by an external dev

### 10.2 Nice-to-have (launch without)

- Cursor/Cline-specific install buttons (copy-paste is fine)
- API drift email alerts (in-app indicator is enough at launch)
- Custom domains for tenant servers
- CLI Homebrew tap
- Self-serve API key rotation
- Team plan / SSO

### 10.3 Kill switches

If any of these are true at end of W8, **delay launch by 1 week**:

- Optimization quality is poor (< 30% token reduction or visible mistakes in golden evals)
- A P1 security issue surfaced during Phase 4 dogfooding
- Hosted deploy success rate < 95% across 20 test runs
- I haven't slept properly in 5+ days

Don't ship a leak. Don't ship a buggy thing on no sleep.

---

## 11. What's Explicitly NOT in MVP (and when to revisit)

| Feature | Revisit at | Rationale for cutting |
|---|---|---|
| GraphQL input | t+2 mo | OpenAPI covers > 70% of target users |
| Postman input | t+3 mo | Niche, can convert manually |
| Python output | t+2 mo | TS Workers give us margin |
| Rust output | t+12 mo | Cool but not asked for |
| A/B deploys | t+2 mo | Not enough traffic to matter |
| Regression testing in CI | t+3 mo | v2 feature, separate value prop |
| Auto-regenerate on drift | t+2 mo | Manual is fine for MVP |
| SSO / Team plan | t+3 mo | Not in first 100 customers |
| Custom domains for tenant | t+2 mo | Subdomain enough at launch |
| Self-host of MCPGen itself | t+6 mo | Marketing-only ask, not real demand |

**Discipline rule:** scope creep is the #1 reason solo projects miss launch. If a request comes mid-Phase, write it on this list and move on. Decide post-launch.

---

## 12. Post-Launch Rhythm (W10+)

Brief note for present-me:

- Week 10: bug-fix only, customer interviews. No new features.
- Week 11: pick one item from §11 based on what users actually asked for. Not what's on this list.
- Week 12: first real metric review. Are we on track for $5K MRR by month 3?

Update this plan with a new Phase 6+ before W10 starts.

---

## Appendix A — Tracking artifacts

| Artifact | Tool | Purpose |
|---|---|---|
| This plan | Git (`docs/implementation-plan.md`) | Strategic contract |
| Tasks | Linear | Daily execution |
| Issues / bugs | GitHub Issues | Tied to code |
| Decisions | Git (`docs/decisions/`) | Why we did what we did |
| Demos | Loom or local MP4 in `demos/` | Friday EOD weekly |
| Costs | Spreadsheet (or Numbers) | Updated weekly |
| Calendar | Whatever I use now | Time-block deep work |

## Appendix B — Anti-patterns to actively resist

1. **"Let me just refactor this real quick before adding the feature."** No. Add the feature. Refactor at end of phase.
2. **"This vendor is $20 cheaper, let me switch."** No. Vendor switching is hours of work for $20. Stay.
3. **"I should learn this new framework first."** No. Use what we picked. Architecture doc is the contract.
4. **"Let me make the docs perfect."** No. Docs are good when they exist. Polish post-launch.
5. **"I should add OAuth login by Google + GitHub + Twitter + Apple."** No. One. Email + GitHub. Done.
6. **"This needs more abstraction."** Probably no. Wait until 3rd duplication.
7. **"Let me build a feature flag system."** No. `if (env.SOMETHING)` is fine for MVP.

---

**Last updated:** 2026-MM-DD by me.
**Next review:** Friday EOD W1.
