---
phase: 10-launch
phase_number: "10"
phase_name: Launch
workstream: main
researched: 2026-04-30
domain: cloud-vendor-ops + GTM-launch
confidence: HIGH (vendor commands & pricing) / MEDIUM (KYC + Stripe meter copy mechanics)
---

# Phase 10 — Launch Research

**Domain:** Vendor provisioning and deploy commands for the W7 founder runbook (CONTEXT D-02, D-03), plus GTM channel best practices for W9 public launch (D-07) and a small engineering hardening item carry-forward (D-22).

**Phase requirement coverage:** GTM-01 (Quickstart docs externally validated), GTM-02 (Privacy/ToS/Pricing), GTM-03 (soft W7 → public W9).

**Primary recommendation:** All ten sections below ship as-cited commands and runbooks. Three pricing facts in CONTEXT must be updated by the planner before W7 execution: Logto Pro is **$24/mo** (not $99 — D-11 ceiling table is overestimated), Mintlify Pro is **$250/mo** (not "negligible" — Hobby tier is sufficient for v1), and Neon Scale is **fully usage-based** (not flat $250/mo — autoscale-driven, $250 is a *budget cap* not a SKU).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim, D-01..D-22)

- **D-01** sprint cadence W7 soft (20 invited) → W8 prep → W9 public. Five kill switches: F3 < 70%, F2 < 4.0, P1 security, deploy success < 95%, founder unslept 5+ days.
- **D-02** cloud-secrets provisioning order: Sentry → CF dispatch namespaces → Vercel → Fly.io → BetterStack → Logto Pro pre-buy → Resend domain → Stripe live keys.
- **D-03** five founder W7 manual runbook actions (Sentry org + DSNs, Logto Pro pre-buy, Neon Scale, cloud deploys, BetterStack, multi-client smoke, real-Sentry leak audit).
- **D-04** Quickstart docs platform = **Mintlify** (already scaffolded). External-developer test = launch slip if it fails.
- **D-05** Legal pages at `apps/web/src/app/(legal)/{privacy,terms,pricing}/page.tsx`. Pricing imports from `@mcpgen/contracts/launch-criteria`.
- **D-06** Code follow-ups: thread `generation_id` (W8) + `usage_hourly` matview refresh (W7 D2). Defer outbox dedup + `/usage/hourly` pagination to v1.1.
- **D-07** All five public-launch channels go live W9 Tuesday morning Pacific. Pre-recorded demos for 5 popular APIs.
- **D-08** 20 invitees split 5+5+5+5 (personal / waitlist / MCP-adjacent / API-provider DX leads).
- **D-09** Status page at `status.mcpgen.dev` via BetterStack OOTB.
- **D-10** Customer support: `support@mcpgen.dev` Resend forward to founder, manual onboarding emails.
- **D-11** Cost alerts at 50/75/100% per vendor. Total ceiling $720/mo claimed.
- **D-12** Backup verification: Neon PITR + R2 immutable + Stripe CSV export.
- **D-13** Daily Inngest cron pulls Logto MAU, alerts at 80/95% of cap.
- **D-14** Friday demo cadence W7-W9 with pre-recorded clips.
- **D-15** Out-of-Scope contract — 12 items rejected on sight during W7-W9.
- **D-16** All `launch-criteria.ts` constants must be SATISFIED in production before W9.
- **D-17** Pre-launch checklist (W8 D5) — 12 items.
- **D-18** Founder on-call mode 72h post-launch.
- **D-19** W10 retrospective writes 10-PHASE-VERIFICATION.md.
- **D-20** Founder-burnout failsafe (8h sleep on W7 D5 / W8 D5 / W9 D1).
- **D-21** Only the founder approves launch-day decisions.
- **D-22** Phase 10 ships pre-commit stash-restore hardening (small chore) before W9.

### Claude's Discretion

- Exact wave allocation of 14 plans within the 4 waves outlined in CONTEXT.
- Sentry org provisioning: org-scoped vs. user-scoped tokens (research recommends org-scoped — see §2).
- Pre-commit stash hardening tool choice (research recommends `hk` — see §10).

### Deferred Ideas (OUT OF SCOPE — D-15 contract)

GraphQL parser · Postman parser · Python output target · A/B deploys · regression testing across generations · custom domains for tenant Workers · SSO / Team plan · auto-regenerate-on-drift default-on · F3 examples generation from real traces · multi-region deploys · outbox dedup table (post-launch incident-driven) · `/usage/hourly` pagination (post-launch dashboard need-driven).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| GTM-01 | Quickstart docs (Mintlify) tested by external developer end-to-end | §6 Mintlify deploy + custom domain commands; Hobby tier is sufficient |
| GTM-02 | Privacy + ToS + Pricing page published; pricing matches code-enforced quotas | (legal pages live in apps/web App Router; D-05 already locks the path. No vendor research needed.) |
| GTM-03 | Soft launch (W7) → public launch (W9) Show HN + Product Hunt + Reddit + X + LinkedIn | §9 launch-day best practices (HN/PH timing + anti-flag rules) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No `--no-verify`** on any git operation (CLAUDE.md §12 rule 3 + git-workflow-rules §"Forbidden ops"). Pre-commit hardening MUST preserve hook execution.
- **Conventional Commits 1.0.0 mandatory**, atomic commits, squash-merge only.
- **Stack frozen** (CLAUDE.md §3) — no vendor swaps. The recommendations below are within-vendor configuration only.
- **Privacy LOCKED** — never log spec content / upstream API responses / upstream credentials. Sentry source-maps upload sends *symbol files only*, not runtime payloads — safe.
- **UI LOCKED** — `apps/web` ships `claude-design-ui/MCP-Gen.zip` unchanged; legal pages reuse existing primitives.
- **CF dispatch namespaces are environment-scoped, never per-tenant** (Pitfall #11). Production = `mcpgen-prod`; staging = `mcpgen-staging`. The Phase-1 deferral guard at `infrastructure/cloudflare/scripts/create-namespaces.sh` activates here.

---

## Section 1 — Vendor deploy patterns

### 1.1 Cloudflare Workers (apps/api + apps/dispatch via wrangler)

**Authentication:** `CF_API_TOKEN` env var. Token created at https://dash.cloudflare.com/profile/api-tokens with **"Edit Cloudflare Workers"** template; restrict to `mcpgen-prod` zone if a custom domain is configured. The token is a secret — provision via CI secret store (D-02 list — already declared).

**Per-app deploy commands** (run from each app directory):

```bash
# apps/api (Hono BFF on CF Workers)
cd apps/api
pnpm build                              # produces dist/ bundle
npx wrangler deploy --env production    # reads wrangler.toml [env.production]

# apps/dispatch (Workers for Platforms dispatch worker)
cd apps/dispatch
pnpm build
npx wrangler deploy --env production
```

**`wrangler.toml` source-maps requirement** (Sentry upstream):

```toml
upload_source_maps = true   # generates .js.map alongside dist/
```

This is **off by default** in 2026 wrangler — must be explicitly set per [Sentry CF docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/sourcemaps/uploading/wrangler/) [VERIFIED]. Already wired in the orchestrator at `scripts/sourcemaps/upload-all.sh` (Phase 9 09-07).

### 1.2 Cloudflare Workers for Platforms namespaces

**Create the two production-grade namespaces** (CONTEXT D-02 step 2; the staging namespace was already deferred from Phase 1 per `01-PHASE-DEVIATIONS.md` rev 2):

```bash
# Run ONCE per environment — idempotent: re-creating an existing namespace returns the existing one
npx wrangler dispatch-namespace create mcpgen-prod
npx wrangler dispatch-namespace create mcpgen-staging

# Verify
npx wrangler dispatch-namespace list
```

[VERIFIED: developers.cloudflare.com/workers/wrangler/commands/workers-for-platforms]

**Deploying a tenant Worker into the namespace** (used by `mcpgen deploy --cf` per Phase 6 carry-forward #1):

```bash
npx wrangler deploy --dispatch-namespace mcpgen-prod --name tenant-${tenant_short_id}
```

**OQ-1 resolution** (CONTEXT open question — does `mcpgen-prod` require a paid CF plan?): **Workers for Platforms requires the Workers Paid plan** ($5/month base) plus per-namespace usage; the dispatch namespace itself is free to create but tenant Worker invocations bill against the paid plan. Budget: $50/mo for CF (D-11) covers ~10M tenant requests/mo at $0.30/M after the 10M free included. [VERIFIED via [Cloudflare Workers pricing](https://www.cloudflare.com/plans/developer-platform/)] — confirm at execution time.

**Caveats:**
- Phase-1 dormant pre-commit hook `no-fourth-namespace` activates here. Removing the `exit 78` deferral guard from `infrastructure/cloudflare/scripts/create-namespaces.sh` is the first commit.
- Tenant-namespace upload limit is 10MB compressed per script. F1 bundle-size gate (≤800KB pass / 800-950KB warn / >950KB fail) keeps us well clear.
- `wrangler dispatch-namespace delete` requires *all user Workers in the namespace are deleted first* — consequence: never delete `mcpgen-prod` post-launch without first migrating tenants.

### 1.3 Vercel (apps/web Next.js 15 App Router)

**Authentication:** `VERCEL_TOKEN` env var (org-scoped or personal). Created at https://vercel.com/account/tokens. CI store secret name already declared in D-02.

**One-time project link** (run once on the founder's machine OR via CI bootstrap):

```bash
cd apps/web
npx vercel link --yes --project mcpgen-web
# This writes .vercel/project.json (NOT in git — already gitignored)
```

**Production deploy commands** (the canonical recipe per [Vercel CLI docs](https://vercel.com/docs/cli/deploy)):

```bash
# Approach A — build remotely (simplest, default)
cd apps/web
npx vercel --prod --token "$VERCEL_TOKEN" --yes

# Approach B — build locally + ship pre-built (faster CI; recommended for our pipeline)
cd apps/web
npx vercel build --prod
npx vercel deploy --prebuilt --prod --archive=tgz --token "$VERCEL_TOKEN"
```

[VERIFIED: vercel.com/docs/cli/deploy]

**Recommended: Approach B** for our turborepo because it keeps the build cache local and avoids re-uploading `node_modules`. The `--archive=tgz` flag is critical for monorepo builds with thousands of files (avoids Vercel's [files limit](https://vercel.com/docs/limits#files)). Pre-built deploys do **not** receive Vercel System Environment Variables at build time — Skew Protection requires a custom deployment ID for Next.js apps using `--prebuilt`.

**Sentry source-maps for apps/web:** auto-uploaded via `@sentry/nextjs` `withSentryConfig` wrapper — no manual step. The orchestrator at `scripts/sourcemaps/upload-all.sh` already documents this (`apps/web auto-uploads via @sentry/nextjs withSentryConfig — no manual step`).

**Custom domain for apps/web:** `app.mcpgen.dev` via Vercel dashboard → Project → Settings → Domains → Add. CNAME at Cloudflare DNS (DNS-only, NOT proxied — Vercel terminates TLS).

### 1.4 Fly.io (apps/generation-engine FastAPI + Python 3.12 + uv lock)

**Authentication:** `FLY_API_TOKEN` env var. Created via `fly auth token` (founder-only) OR `fly tokens create deploy` for org-scoped CI tokens.

**One-time machine creation:**

```bash
cd apps/generation-engine
fly launch --name mcpgen-engine --region sjc --no-deploy
# Generates fly.toml + Dockerfile (multi-stage). DO NOT accept defaults — see fly.toml below.
```

**Recommended `fly.toml`** (auto-suspend per CLAUDE.md §3 "Fly.io Machines auto-suspend"):

```toml
app = "mcpgen-engine"
primary_region = "sjc"

[build]
dockerfile = "Dockerfile"

[http_service]
internal_port = 8000
force_https = true
auto_stop_machines = "suspend"     # 2026 default is "stop"; we override to "suspend" for fast resume
auto_start_machines = true
min_machines_running = 0           # zero-cost when idle
processes = ["app"]

[[vm]]
cpu_kind = "shared"
cpus = 1
memory_mb = 2048                    # FastAPI + PydanticAI + httpx; 2GB headroom
```

[VERIFIED: fly.io/docs/launch/autostop-autostart + fly.io/docs/reference/configuration]

**Deploy commands:**

```bash
cd apps/generation-engine
fly deploy --app mcpgen-engine --remote-only      # CI-friendly; --remote-only uses Fly builder (no local Docker)
```

**`Dockerfile` recommendation** (based on [uv FastAPI integration](https://docs.astral.sh/uv/guides/integration/fastapi/)):

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.12-bookworm AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache --no-dev
COPY . .

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "mcpgen_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

[CITED: docs.astral.sh/uv/guides/integration/fastapi]

**Caveats:**
- Default machine spec is `shared-cpu-1x` + 1GB; Fly docs note "most apps need about 1GB of RAM" but PydanticAI + httpx + the engine packages run hot — bump to **2GB** ([VERIFIED: fly.io/docs/python/frameworks/fastapi]).
- Auto-suspend known issue: machines may stick in `stopped` state instead of `suspended` after deploy — manual `fly machine restart` or `fly scale count 1` recovers ([CITED: community.fly.io/t/machine-in-stopped-state-instead-of-suspended-after-deploy]). Add to launch-day runbook.
- Health check at `/health` is required for the BetterStack uptime monitor (already in the betterstack-setup runbook).
- Sentry Python source maps are deferred — Phase 9 09-07 sourcemap script explicitly notes "Python source maps deferred to Phase 10 (local Python runs from source — no PyInstaller bundle yet)". For Fly + uv, source files ARE accessible at runtime, so Sentry symbolicates Python tracebacks server-side. Action: **drop the Python sourcemaps Phase-10-specific TODO** — not required when running from source.

---

## Section 2 — Sentry setup

### 2.1 Org + 4 projects creation

Manual click-path (Sentry has no CLI for org/project create):

1. Sign up at https://sentry.io (Team plan: $26/mo per CONTEXT D-11 — verified at https://sentry.io/pricing/, Team tier is **$26/mo** for 50k errors/month [VERIFIED]).
2. Create organization `mcpgen` (slug = `mcpgen`).
3. Create 4 projects (Settings → Projects → Create Project):

   | Project | Platform | Project ID env var |
   |---|---|---|
   | `mcpgen-web` | `javascript-nextjs` | `SENTRY_PROJECT_WEB` |
   | `mcpgen-api` | `javascript-cloudflare` | `SENTRY_PROJECT_API` |
   | `mcpgen-dispatch` | `javascript-cloudflare` | `SENTRY_PROJECT_DISPATCH` |
   | `mcpgen-engine` | `python-fastapi` | `SENTRY_PROJECT_ENGINE` |

4. Each project surfaces a DSN (`https://<key>@<org>.ingest.sentry.io/<project_id>`). Copy 4 DSNs into CI secret store as `SENTRY_DSN_WEB` etc.

### 2.2 SENTRY_AUTH_TOKEN — org-scoped (NOT user-scoped)

**Critical:** create an **Organization Auth Token** for source-maps upload (not a user-scoped Personal Access Token).

- Path: Sentry → **Settings → Developer Settings → Organization Tokens → Create New Token**
- Auto-scoped for: **Source Map Upload + Release Creation** (the two scopes Sentry CLI needs)
- **Visible once** — copy immediately, then store as `SENTRY_AUTH_TOKEN` in GitHub Actions secret store
- **NEVER add to `.env.local`** — already enforced by the orchestrator at `scripts/sourcemaps/upload-all.sh` line 24-26

[VERIFIED: docs.sentry.io/account/auth-tokens]

**Why org-scoped:** user-scoped Personal Access Tokens require `Project: Read & Write` + `Release: Admin` permissions and are tied to a user account that can be revoked. Org tokens persist across user offboarding and are explicitly designed for CI per Sentry docs.

### 2.3 Wiring source-maps upload — flip from skip-when-no-token to real

The orchestrator at `scripts/sourcemaps/upload-all.sh` already ships with the skip guard (Phase 9 plan 09-07). Flipping to real upload mode requires only:

1. **Provision in CI secret store:**
   ```
   SENTRY_AUTH_TOKEN     = (from §2.2 above)
   SENTRY_ORG            = mcpgen
   SENTRY_PROJECT_WEB    = mcpgen-web
   SENTRY_PROJECT_API    = mcpgen-api
   SENTRY_PROJECT_DISPATCH = mcpgen-dispatch
   SENTRY_PROJECT_ENGINE = mcpgen-engine
   ```

2. **Wire after deploy** in CI workflow (e.g. `.github/workflows/deploy-prod.yml`):
   ```yaml
   - name: Deploy apps/api to Cloudflare Workers
     run: cd apps/api && npx wrangler deploy --env production
     env:
       CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
   - name: Upload source maps to Sentry
     run: pnpm sourcemaps:upload
     env:
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
       SENTRY_RELEASE: ${{ github.sha }}
   ```

3. **Verify** by triggering a synthetic exception in apps/api and checking that Sentry shows the original TypeScript file + line number when `View Source` is clicked.

**Per-project sentry-cli configuration in each app's deploy script:**
- `apps/api/package.json` already has `sourcemaps:upload` invoking `npx @sentry/cli sourcemaps upload` per the upload-all.sh orchestrator.
- `apps/web` is auto-uploaded via `@sentry/nextjs withSentryConfig` — no manual step.
- `apps/dispatch` mirrors `apps/api` pattern.

[VERIFIED: docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli]

### 2.4 Real-Sentry leak audit swap (D-03 step 7)

The single-file swap from `MockSentryEventsAdapter` → `RealSentryEventsAdapter` is:

```typescript
// apps/api/src/lib/sentry-events-adapter.ts
// New file (~50 LoC) implementing the same interface against Sentry Events API:
// GET https://sentry.io/api/0/organizations/{org}/events/?query=...
//   Authorization: Bearer ${SENTRY_AUTH_TOKEN}
```

The `pnpm leak-audit --mode real` flag is already wired (Phase 9 09-10 ships `--mode real returns exit 3 'not-yet-implemented'`). Acceptance: zero hits for `Bearer ` / `sk_live_` / `ghp_` / `MCPGEN_LEAK_CANARY_2026Q2` after deliberate-leak request fires the sentinel via apps/api in production.

---

## Section 3 — Logto Pro upgrade flow

### 3.1 Current 2026 pricing (CRITICAL CORRECTION TO CONTEXT D-11)

**The CONTEXT D-11 cost ceiling table lists Logto Pro at $99/mo. This is incorrect for 2026.**

**Authoritative current pricing** (verified at https://logto.io/pricing, last updated October 2025):

| Tier | Base price | MAU included | Tokens included | Overage |
|---|---|---|---|---|
| Free | $0 | **50,000** | 50,000 | none (hard cap) |
| Pro | **$24/mo** | **50,000** | 50,000 | $0.08 per 100 extra tokens |

[VERIFIED: blog.logto.io/pricing-sep-2025 + logto.io/pricing]

**Pricing-model evolution timeline** (relevant to runbook accuracy):
- Pre-Dec 2023: $60/mo for 50K MAU (*the figure in `docs/runbooks/logto-pro-upgrade.md` and CONTEXT — STALE*)
- Dec 2023 — Sep 2025: $16/mo unlimited MAU + 1M tokens (v2 pricing)
- **Oct 2025 — present: $24/mo + 50K MAU + 50K tokens** (current — refresh tokens stopped counting)

[VERIFIED: blog.logto.io/pricing-sep-2025]

### 3.2 Why pre-buy is still required (Pitfall #17 logic preserved)

The free tier 50K MAU cap is high enough that a viral W9 launch (Show HN front page + Product Hunt #1) is unlikely to exceed it within 24 hours — but **the alert + auto-throttle on Logto Free is hard, no-overage**, so a sudden spike still results in 0-signups outage. Pre-buying Pro:
- Lifts the throttle ceiling (Pro has no MAU hard cap, only token overage)
- Provides 5 days of payment-failure recovery time before launch
- Costs **$24** (one Stripe charge) — not $60, and not $99

**Action:** update `docs/runbooks/logto-pro-upgrade.md` (the runbook's "$60/mo for 50K MAU" claim and CONTEXT D-11's $99 ceiling) as part of plan 10-01. Total monthly ceiling drops from $720 to ~$645.

### 3.3 Verifying Pro tier is active

Logto admin API doesn't expose a `tier` field directly. Three verification methods:

1. **Tenant Settings → Plan in Logto Console** shows "Pro" badge with monthly cost. Screenshot for sign-off.
2. **Stripe receipt** in the email tied to the Logto account within 5 minutes of upgrade (per `docs/runbooks/logto-pro-upgrade.md`).
3. **Token quota indirect check** — the `mau_log` table (Phase 8 plan 04 already migrated) consumed via `logto-mau-watch-v1` Inngest cron compares against a hard-coded 50K threshold; if Pro is active, the alert never fires under launch traffic.

### 3.4 Migration concerns when upgrading mid-flight

**Sessions remain valid across Pro upgrade.** Logto plan upgrades do NOT rotate tokens (verified in `docs/runbooks/logto-pro-upgrade.md` step "Test on staging"). Risk surface:
- Stripe webhook for Logto subscription start is async — Logto Pro features may take 1-5 minutes to enable; do NOT pre-buy on W7 D5 morning, do it W7 D2 with calm window.
- Plan downgrade is supported (Free → Pro → Free); MAU cap re-applies on next billing cycle.
- **Beta features (MFA, SSO, Organizations) are no-cost** under Pro [VERIFIED: blog.logto.io/pricing-sep-2025] — relevant if v1.1 adds Team plan.

---

## Section 4 — BetterStack provisioning (API-first)

### 4.1 Authentication

BetterStack Uptime API uses Bearer token authentication. Tokens are **team-scoped** (NOT user-scoped):

- Path: BetterStack → **API tokens → Team-based tokens** → select team `mcpgen` → create new token in **Uptime API tokens**
- Store as `BETTERSTACK_UPTIME_API_KEY` (already declared in CONTEXT D-02)

[VERIFIED: betterstack.com/docs/uptime/api/getting-started-with-uptime-api]

### 4.2 Provisioning via API (preferred over UI for reproducibility)

**Heartbeat monitor** (CONTEXT D-09 + outbox-depth-monitor cron):

```bash
curl --request POST \
  --url https://uptime.betterstack.com/api/v2/heartbeats \
  --header "Authorization: Bearer $BETTERSTACK_UPTIME_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "outbox-depth-monitor",
    "period": 3600,
    "grace": 600
  }'
# Response: { "data": { "id": "...", "attributes": { "url": "https://uptime.betterstack.com/api/v1/heartbeat/<TOKEN>" } } }
```

Capture the response `attributes.url` and store as `BETTERSTACK_OUTBOX_HEARTBEAT_URL`.

[VERIFIED: betterstack.com/docs/uptime/api/create-a-hearbeat]

**6 uptime checks** (one per public surface, per the runbook table):

```bash
TARGETS=(
  "https://app.mcpgen.dev|apps/web (Vercel)"
  "https://api.mcpgen.dev/health|apps/api (CF Workers)"
  "https://dispatch.mcpgen.dev/health|apps/dispatch (CF Workers)"
  "https://engine.mcpgen.dev/health|apps/generation-engine (Fly)"
  "https://t.mcpgen.dev/sample/health|Sample tenant Worker"
  "https://logto.mcpgen.dev/oidc/.well-known/openid-configuration|Logto endpoint"
)
for entry in "${TARGETS[@]}"; do
  IFS='|' read -r url name <<< "$entry"
  curl --request POST \
    --url https://uptime.betterstack.com/api/v2/monitors \
    --header "Authorization: Bearer $BETTERSTACK_UPTIME_API_KEY" \
    --header 'Content-Type: application/json' \
    --data "{
      \"monitor_type\": \"status\",
      \"url\": \"$url\",
      \"pronounceable_name\": \"$name\",
      \"check_frequency\": 60,
      \"request_timeout\": 30,
      \"recovery_period\": 60,
      \"verify_ssl\": true,
      \"regions\": [\"us\", \"eu\"]
    }"
done
```

[VERIFIED: betterstack.com/docs/uptime/api/create-a-new-monitor]

### 4.3 Status page custom domain (D-09)

**CNAME target:** `statuspage.betteruptime.com` [VERIFIED: betterstack.com/docs/uptime/custom-subdomain]

**Cloudflare DNS record** (DNS-only, NOT proxied — BetterStack terminates TLS):

```
status   CNAME   statuspage.betteruptime.com   (DNS only)
```

DNS propagation up to 72 hours. Add this record W7 D2 (with the Vercel/Fly DNS records).

In BetterStack Console: **Status pages → mcpgen → Settings → Custom domain** → enter `status.mcpgen.dev` → Save.

### 4.4 Escalation policy

API-first creation NOT supported in BetterStack v2 API for escalation policies (only UI). Manual click-path remains as in `docs/runbooks/betterstack-setup.md` step 4. No changes since the runbook was authored 2026-04-30.

### 4.5 Free-tier sufficient for v1

BetterStack Free covers **10 monitors + 10 heartbeats + 1 status page with 3-min checks** [VERIFIED: betterstack.com/uptime]. We need 6 monitors + 1 heartbeat → free tier suffices through soft launch. Upgrade to Team ($25/mo per CONTEXT D-11) only if 60s checks (vs 3-min on free) are required for SLA evidence.

---

## Section 5 — Neon Scale-tier

### 5.1 CRITICAL CORRECTION TO CONTEXT D-11 — Neon is fully usage-based

**The CONTEXT D-11 cost table lists "Neon (Scale tier) $250 monthly budget cap". This is a budget *target*, not a SKU. Neon Scale 2026 pricing is fully usage-based:**

| Component | Scale tier price |
|---|---|
| Compute | **$0.222 per CU-hour** (via autoscale) |
| Storage | **$0.35/GB-month** |
| Snapshots | $0.09/GB-month (effective May 1, 2026 — verify at execution) |
| Egress | First 100GB/mo free, then $0.10/GB |
| Branches | First 25 free, then $1.50/branch-month |
| PITR | Up to **30 days** retention window |
| Minimum monthly spend | $5 (invoices < $0.50 not collected) |

[VERIFIED: neon.com/pricing + neon.com/blog/major-compute-price-reduction-on-neon]

**Estimated $250/mo budget headroom:**

- Compute @ 4 CU sustained 12h/day × 30 days = 1440 CU-hours × $0.222 = **$320/mo** ⚠ ALREADY OVER $250
- Compute @ 2 CU sustained (more realistic post-launch idle) = 720 CU-hours × $0.222 = **$160/mo**
- Plus storage + PITR retention + branches → likely $180-220/mo at expected v1 traffic

**Recommendation for the planner:** the $250/mo D-11 cap is plausible at v1 traffic with Scale autoscale max set to 4 CU and idle scale-to-zero enabled. Set Neon billing alert at $200 (80%) and $250 (100%) — NOT 50%/75%/100% as D-11 suggests across all vendors uniformly.

### 5.2 Upgrade path from dev to Scale

The runbook `docs/runbooks/neon-scale-upgrade.md` is current and accurate. **No changes since author date 2026-04-29.** Click-path:

1. Console → Branches → main → **Create snapshot** (recovery anchor; name `pre-scale-upgrade-YYYY-MM-DD`)
2. Settings → Compute → Plan: **Scale**, vCPU ≥ 4, Memory ≥ 8GB → Save (60-120s spin-up)
3. Apply Pitfall #19 SQL knobs:
   ```sql
   ALTER SYSTEM SET autovacuum_work_mem = '256MB';
   ALTER SYSTEM SET timescaledb.max_background_workers = 2;
   SELECT pg_reload_conf();
   ```
4. Re-run `RUN_LOAD_TESTS=1 NEON_OOM_RUN_DURATION_MS=600000 pnpm --filter @mcpgen/api test:load`
5. Verify zero `connection terminated` errors in 10-min run
6. Screenshot Neon Console showing `Compute: Scale` + green test output → paste into 10-PHASE-VERIFICATION.md

### 5.3 PITR verification command

Per CONTEXT D-12 + `docs/runbooks/neon-scale-upgrade.md`:

```bash
# Verify PITR by restoring to a staging branch
neon branches create --project-id $NEON_PROJECT --name pitr-verify-$(date -u +%Y%m%dT%H%M) \
  --parent-timestamp "$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"

# Connect to the new branch and verify schema + 1 row
psql "$(neon connection-string --project-id $NEON_PROJECT --branch-id <new-branch-id>)" <<SQL
\d organizations
SELECT id, name FROM organizations LIMIT 1;
SQL

# Cleanup
neon branches delete --project-id $NEON_PROJECT --branch-id <new-branch-id>
```

[CITED: neon.com/docs/manage/branches] — verify `neon` CLI version at execution; the API surface has been stable since 2024.

### 5.4 Scale autoscale knobs

Set in Neon Console → Settings → Compute:
- `min_cu = 0.25` (cheapest) — scale-to-zero after 5 min idle (default)
- `max_cu = 4` (caps the spend explosion) — should be enough for v1; raise if F2/F3 throughput at peak exceeds limit

Scale-to-zero behavior: dev/test branches automatically suspend after 5 min idle [VERIFIED: neon.com/docs/introduction/cost-optimization]. Production main branch should set `min_cu = 0.5` to reduce cold-start pain (waitUntil + 2-3s cold start can cause ChatGPT Deep Research timeouts).

---

## Section 6 — Mintlify

### 6.1 Current 2026 pricing

| Tier | Cost | Custom domain | Dashboard members | AI features |
|---|---|---|---|---|
| Hobby (Free) | **$0** | ✅ included | 1 member | 250 AI credits ($0.25 overage) |
| Pro | **$250/mo** | ✅ + preview deploys + password protection | 5 members ($20/each extra) | Assistant + Writing agents |

[VERIFIED: mintlify.com/pricing]

**OQ-3 resolution** (does Mintlify free tier handle our docs traffic?): **YES.** Hobby includes custom domain (the rare-locked-by-paid-plans feature) — full platform, web editor, MCP server hooks, custom components. Mintlify Pro is **$250/mo**, NOT "negligible" — only worth it if Team plan + AI agents are needed. **Recommendation: stay on Hobby for v1.**

### 6.2 Deploy flow

**Existing scaffold** (Phase 1 plan 01-05):
- `apps/docs/mint.json` — Mintlify config
- `apps/docs/package.json` — `mintlify dev` script
- `apps/docs/node_modules/mintlify` — dev runtime

**Deploy mechanics:** Mintlify uses **GitHub App integration** — push to repo → Mintlify auto-deploys. No CLI deploy command needed.

```bash
# Local preview
pnpm --filter @mcpgen/docs dev   # mintlify dev → http://localhost:3000

# Production deploy is automatic on push to main (via the Mintlify GitHub App)
```

**Setup flow** (run once at start of W8):
1. Sign up at https://mintlify.com (use the founder's GitHub login; tier = Hobby)
2. Mintlify Console → **Add Documentation → Connect GitHub repo** → select `mcpgen/mcpgen` and `apps/docs/` subdir
3. Mintlify auto-builds on push to `main` branch
4. Custom domain at Mintlify Console → Settings → Custom Domain → enter `docs.mcpgen.dev`
5. Cloudflare DNS: `docs CNAME mintlify.com` (DNS-only, NOT proxied — Mintlify terminates TLS)

### 6.3 OpenAPI auto-reference

Mintlify supports OpenAPI 3.0/3.1 in JSON or YAML. To document our `apps/api` `POST /api/v1/generate` BFF endpoint:

```json
// apps/docs/mint.json
{
  "openapi": ["api/openapi.yaml"],   // or URL to live spec
  "navigation": [
    { "group": "Quickstart", "pages": ["index", "quickstart"] },
    { "group": "API Reference", "pages": ["api/generate", "api/deploy"] }
  ]
}
```

Auto-reference pages are generated from the OpenAPI spec — Mintlify renders an interactive playground per endpoint. Caveat: only **internal** `$ref` resolution — external `$ref` to remote URLs is NOT supported, so the OpenAPI doc must be self-contained [VERIFIED: mintlify.com/docs/api-playground/openapi-setup].

### 6.4 Caveats for v1

- Mintlify renders MDX. The Quickstart page (GTM-01 acceptance) needs to live as `apps/docs/quickstart.mdx` and embed the demo video.
- **GTM-01 external developer test** is the gating criterion (D-04). Recruit at start of W8; the developer should reach a deployed MCP server callable from Claude Desktop without operator help.
- Search is included free — uses Algolia under the hood for Hobby tier.

---

## Section 7 — Stripe live-mode flip

### 7.1 KYC requirements (OQ-2 resolution)

**Yes, Stripe live mode requires additional KYC beyond what test mode showed.** Test mode skips all identity verification; live mode requires full collection of:

- **Business**: legal name, EIN/Tax ID (US), address, MCC code (Software / Internet Services = 5734)
- **Beneficial owners** (if entity): identity verification (ID upload, often selfie verification) for any individual owning ≥25%
- **Bank account**: ACH-debitable account for payouts
- **Statement descriptor**: 5-22 char string customers see on credit card bills (e.g., "MCPGEN")

[VERIFIED: support.stripe.com/questions/know-your-customer-kyc-requirements-for-connected-accounts]

**Timing:** typical sole-proprietor activation is 5-30 minutes if all docs are ready. Some jurisdictions trigger 1-2 day manual review. **Action:** start KYC flow W7 D1 (parallel to Sentry/Logto) — not W7 D5 — to avoid launch slip.

### 7.2 Promote test products + prices to live mode

**Per-product UI flow** [VERIFIED: docs.stripe.com/products-prices/manage-prices]:

1. Stripe Dashboard → **Products → [Product] → Copy to live mode** (top-right button)
2. Prices associated with the product copy automatically
3. **One-time copy only** — subsequent edits to the test product do NOT propagate to live

For our 3 products + 1 price + 3 meters (`STRIPE_PRODUCT_FREE`, `STRIPE_PRODUCT_PRO`, `STRIPE_PRICE_PRO`, `STRIPE_METER_EVALS_ID`, `STRIPE_METER_TOOL_CALLS_ID`, `STRIPE_METER_GENERATIONS_ID`):

```bash
# Run the existing setup script in LIVE mode (re-creates from spec, idempotent)
STRIPE_SECRET_KEY=sk_live_... bun run infrastructure/stripe/setup.ts
# Capture output → paste into .env.local under STRIPE_*_LIVE keys
```

**Critical: Meters are NOT copied via "Copy to live mode"** — meters are billing primitives separate from products and require recreation in live mode. The `setup.ts` script handles this idempotently by checking for existing meters by name before creating.

### 7.3 Webhook endpoint live URL change

**Test mode webhook** is currently the local `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` ngrok-style relay (per `docs/runbooks/stripe-local-dev.md`).

**Live mode webhook** must point to the production CF Worker URL:

1. Stripe Dashboard → toggle to **Live mode** (top-right)
2. **Developers → Webhooks → Add endpoint**
3. URL: `https://api.mcpgen.dev/api/v1/stripe/webhook`
4. Events to send: same as test mode (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`)
5. Signing secret: a new `whsec_...` is generated — **different from test mode secret**. Store as `STRIPE_WEBHOOK_SECRET` (live) in CI secret store.

[VERIFIED: docs.stripe.com/webhooks]

### 7.4 Verifying live tier is active

```bash
# Reachability check (live)
curl -s -u "$STRIPE_SECRET_KEY_LIVE:" https://api.stripe.com/v1/products?limit=3 | jq '.data[] | {id, name}'

# Verify webhook endpoint registered
curl -s -u "$STRIPE_SECRET_KEY_LIVE:" https://api.stripe.com/v1/webhook_endpoints | jq '.data[] | {url, status, enabled_events: .enabled_events | length}'

# Trigger a synthetic test event (Dashboard → Developers → Webhooks → [endpoint] → Send test webhook)
# Verify in apps/api Sentry that event was received + signature verified
```

---

## Section 8 — Resend domain DNS

### 8.1 Production sender domain setup

`docs/runbooks/resend-domain-setup.md` is current and accurate. **No changes since author date 2026-04-28** other than to confirm:

**DNS records to add at Cloudflare** (DNS-only, NOT proxied — Resend terminates TLS for sending):

| Type | Name | Value | Notes |
|---|---|---|---|
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF — AWS SES is Resend's upstream |
| CNAME | `resend._domainkey` | `resend._domainkey.amazonses.com` | DKIM key 1 |
| CNAME | `resend2._domainkey` | `resend2._domainkey.amazonses.com` | DKIM key 2 (rotation) |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | Bounce/complaint handling |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@mcpgen.dev` | DMARC reporting (start with `p=none` then tighten) |

[VERIFIED: dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records + resend.com/docs/knowledge-base/cloudflare]

**Critical caveats:**
- Records go on the **`send` subdomain** (not the root domain) — this isolates transactional email from MX records that might point at another provider
- Cloudflare proxy MUST be **disabled (DNS only)** for these records — proxy rewrites the records and breaks verification
- DNS propagation up to 24 hours; usually 1-60 minutes via Cloudflare

### 8.2 Verifying domain status

```bash
# Resend API
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains | jq '.data[] | {name, status, region}'
# Expected for verified: "status": "verified"
# Statuses: "not_started" → "pending" → "verified" (or "failure")

# Independent DNS check
dig +short send.mcpgen.dev TXT       # should show SPF
dig +short resend._domainkey.mcpgen.dev CNAME   # should show amazonses target
dig +short _dmarc.mcpgen.dev TXT     # should show DMARC policy
```

### 8.3 Production env vars

After verification, in CI secret store:

```bash
RESEND_API_KEY=re_<token>             # production scoped key
DRIFT_FROM_EMAIL=MCPGen Drift Watcher <drift@mcpgen.dev>
OPS_FROM_EMAIL=MCPGen Ops Alert <ops@mcpgen.dev>
```

W7 smoke-test all 3 send paths (`sendDriftEmail`, `sendReconciliationAlert`, `sendMauAlert`) per the runbook. Total emit rate well below Resend free-tier 2 req/s.

### 8.4 Free-tier sufficient

Resend Free includes **3000 emails/month + 100 emails/day + 1 verified domain**. At v1 traffic (drift ~1/wk/tenant + reconciliation alerts rare + MAU alert ~1/year + onboarding emails ~1/signup) we won't approach the cap. Upgrade to **Pro $20/mo for 50K emails** only if v1.1 transactional volume increases.

---

## Section 9 — Show HN / Product Hunt launch best practices (light)

### 9.1 Show HN guidelines (official + verified)

[VERIFIED: news.ycombinator.com/showhn.html]

**Allowed:** working software others can run + try; functional landing page IF the product is demonstrably usable from it.

**Forbidden:**
- Generic landing pages with no try-it-yourself path
- Sign-up walls (lower the barrier — demo without signup is mandatory)
- Asking friends to upvote ("instant turnoff")
- Fundraisers, version-update announcements (`Foo 1.3.1 is out` style)

**Title format:** `Show HN: <product> — <one-line value prop without superlatives>`. Match CONTEXT D-07: "Show HN: MCPGen — generate MCP servers from any OpenAPI URL in 60s, validated by agent". ✅ no `best/fastest/first/biggest` superlatives. ✅ explicit value prop.

### 9.2 Product Hunt guidelines

[VERIFIED: producthunt.com/launch + reviewsell.com/blog/product-hunt-launch-upvotes-2026]

**Timing:** 12:01am Pacific Tuesday-Thursday is the canonical launch window. **W9 Tuesday morning Pacific** matches. Avoid weekends and Mondays (low engagement).

**First 6 hours determine ranking** — products with 50+ upvotes in first 6h have best chance at #1. Founder must be online for first 4h.

**Anti-flag rules:**
- DO NOT ask for upvotes directly (auto-flag) — ask people to "visit and leave honest feedback"
- New (zero-history) Product Hunt accounts upvoting count for ~1/6 of an established account's vote
- Reply to every comment within 5-10 min during first 6h

**Engagement matters more than raw votes:** "700 upvotes + 80 quality comments" outperforms "1000 upvotes + 12 comments".

### 9.3 Reddit r/MachineLearning + r/LocalLLaMA timing

Same Tuesday morning Pacific. r/MachineLearning has a stricter quality bar — lead with the F2/F3 quality scoring methodology + paper rubric per CONTEXT D-07 (engineering audience). r/LocalLLaMA is more practical — lead with "ChatGPT Deep Research compliance + Six-Tool Pattern" (LLM-tools audience).

**Pitfall:** r/MachineLearning auto-removes posts that lack a paper or arxiv link. Solution: post leads with `arXiv:2602.14878` (the smell paper) and our F2/F3 implementation as a paper-validated tool.

### 9.4 X / Twitter + LinkedIn

X: 8-tweet thread per CONTEXT D-07. First tweet must hook in 280 chars; thread structure: `(1) hook (2) demo gif (3) the problem (4) the approach (5) why now (6) cost (7) what's next (8) link + ask for feedback`.

LinkedIn: single post linking to landing. Founder voice; explicit ask: "If you've ever wrapped an API as an MCP server, I'd love your honest critique."

### 9.5 Demo video specifics (D-07 + D-14)

5 videos × 60s each, one per popular API (Stripe, GitHub, Notion, Linear, Slack). Pre-record W7 + edit W8. Embed in:
- Mintlify Quickstart (apps/docs/quickstart.mdx)
- Twitter media library (used by all 8 thread tweets in rotation)
- Product Hunt media gallery
- LinkedIn post

---

## Section 10 — Pre-commit stash-restore hardening (D-22)

### 10.1 The observed failure (Phase 9 commit `7051c5b`)

Three Wave-3 plans (09-08, 09-09, 09-11) ran simultaneously on the same working tree. The pre-commit framework's stash/restore cycle interleaved with parallel agents' staging operations: commit `7051c5b` titled `docs(09-08): ...` actually committed plan 09-09's SUMMARY file; commit `847b078` ~45s later landed the rightful 09-08 SUMMARY. Correctness damage: zero. Attribution damage: misleading git log.

### 10.2 Root cause: this project uses Python pre-commit (NOT husky)

**Important correction to CONTEXT D-22 wording.** D-22 references `.husky/pre-commit` but this project uses [pre-commit/pre-commit](https://github.com/pre-commit/pre-commit) (Python framework). The hook config is at `/.pre-commit-config.yaml` and installation is via `pre-commit install --hook-type pre-commit --hook-type commit-msg` (already wired in root `package.json` `prepare` script).

The Python pre-commit framework has documented stash-race bugs:
- [pre-commit/pre-commit#1880](https://github.com/pre-commit/pre-commit/issues/1880) — "Parallel execution ran into 'patch does not apply'"
- [pre-commit/pre-commit#2473](https://github.com/pre-commit/pre-commit/issues/2473) — "Stashed changes lost after `git add` while pre-commit was running"
- [pre-commit/pre-commit#2127](https://github.com/pre-commit/pre-commit/issues/2127) — "pre-commit fails to restore unstaged files"

**Mechanism of failure:** when two `git commit` invocations land within the same patch-stash window, pre-commit's intermediate stash patches conflict. The first invocation's stash gets restored over the second's working tree because pre-commit re-applies the patch (`git stash pop`) after hook completion without checking that the working tree state has changed.

### 10.3 Tool comparison for parallel-safe pre-commit

| Tool | File-level locking | Stash isolation | Three-way merge | Parallel-safe |
|---|---|---|---|---|
| husky + lint-staged | ❌ | ⚠ basic stash, no merge | ❌ | ❌ |
| lefthook | ❌ | ❌ does NOT stash unstaged | ❌ | ❌ (silent loss) |
| pre-commit (Python, current) | ❌ | ⚠ basic patch, restore-after-hook | ❌ | ❌ (this is the bug) |
| **hk** (jdx) | ✅ read/write per file | ✅ snapshot + isolate staged | ✅ three-way merge | ✅ |

[VERIFIED: hk.jdx.dev/why-hk.html + dev.to/recca0120/ditch-husky-speed-up-git-hooks-with-lefthook]

### 10.4 Recommendation: keep pre-commit; add wrapper guard (do NOT migrate tool)

**The CONTEXT D-22 ask is "small chore" + "won't block launch". Migrating from pre-commit (Python) to hk (Rust) would touch `.pre-commit-config.yaml` + every CI workflow + every contributor's local install. That violates the "small chore" framing.**

**Recommended fix (small):** add a serialization wrapper that prevents the parallel-stash race entirely. The pattern is:

```bash
# scripts/git-hooks/serialized-precommit-wrapper.sh
#!/usr/bin/env bash
# Acquire a flock-based lock before invoking pre-commit hooks.
# Eliminates the parallel-stash race observed in Phase 9 commit 7051c5b
# without changing the underlying pre-commit framework.
set -euo pipefail
LOCK_FILE="$(git rev-parse --git-dir)/precommit.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[precommit] Another git operation is holding the working-tree lock. Waiting..."
  flock 9
fi
# Now we hold the lock; run the actual pre-commit framework
exec pre-commit run --hook-stage pre-commit --color=always
```

Wire it in `.git/hooks/pre-commit` (or via the `prepare` script in `package.json` to make it idempotent for cloners).

**Why this works:** `flock(2)` provides POSIX advisory file locking. Two `git commit` invocations running in parallel will queue at the lock acquire; the second waits for the first's stash/restore cycle to fully complete before its own pre-commit fires. Net effect: serial execution of pre-commit hooks across parallel git operations on the same working tree, while keeping the rest of git (build, status, log) fully concurrent.

**Tradeoff:** parallel commits become slower (each commit waits its turn through the lock). At v1 scale (a single founder + multiple Claude agents committing), parallelism is rarely needed for the *git commit* step itself — agents can build/test in parallel and only serialize at the commit boundary. This matches D-22's "small chore" framing.

### 10.5 Alternative if migration is later desired (v1.1+)

When (post-launch) parallelism + speed both matter, migrate to `hk` per [hk.jdx.dev](https://hk.jdx.dev/):
- Three-way merge stash isolation (preserves unstaged work even if hook modifies files)
- Read/write locks per file (no race condition between two parallel linters touching the same file)
- ~10x faster than husky on large repos (Rust-native)
- Parallel execution up to `HK_JOBS`

This is a v1.1 backlog item per D-15 spirit (don't add features mid-launch).

### 10.6 Plan-target for 10-07

The "small chore" ships as plan 10-07 per CONTEXT plan-target outline (Wave 2). One-task plan:
1. Author `scripts/git-hooks/serialized-precommit-wrapper.sh` (~25 lines)
2. Update root `package.json` `prepare` script to install via `git config core.hooksPath` to `scripts/git-hooks/`
3. Add a regression test under `tests/scripts/test-precommit-serialization.sh` that spawns two parallel `git commit` invocations and asserts both succeed (with deterministic ordering by lock acquisition)

**Acceptance:** running 4 parallel agents committing distinct files produces 4 distinct commits with no stash-race attribution mismatch.

---

## Architectural Responsibility Map

This phase is operations + GTM, not code. The "tier" responsibility maps to vendor surfaces:

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Frontend deploy | Vercel (CDN/Static) | — | apps/web is locked-design Next.js; Vercel auto-detects |
| API + Dispatch deploy | CF Workers (Edge) | — | Hono + dispatch worker; CF Workers for Platforms namespace `mcpgen-prod` |
| Engine deploy | Fly.io Machines (Backend Compute) | — | FastAPI + uv + Python 3.12; auto-suspend per CLAUDE.md §3 |
| Database | Neon (Database/Storage) | — | Existing Phase 1 wiring; Scale-tier upgrade is a config change |
| Object storage | R2 (CDN/Static) | — | Carry-forward from Phase 8 deviation 1 |
| Identity | Logto Cloud (External Service) | — | Pro upgrade is a Stripe-checkout flow, not code |
| Email | Resend (External Service) | — | Domain DNS records → CF DNS |
| Observability | Sentry / BetterStack / Langfuse (External Services) | — | Token provisioning + UI/API setup |
| Billing | Stripe (External Service) | — | Live-mode flip + KYC + webhook URL change |
| Docs | Mintlify (CDN/Static) | — | GitHub App auto-deploy; Hobby tier sufficient |
| Pre-commit hardening | Local Git Hook (Tooling) | — | flock-based serialization wrapper |

All capabilities are external services configured via CLI / API / dashboard click-paths. No code changes in this phase except: legal pages content (D-05), `generation_id` threading (D-06 item 1), `usage_hourly` matview refresh (D-06 item 2), pre-commit wrapper script (D-22).

---

## Standard Stack

### Core (already-locked vendors — see CLAUDE.md §3)

| Service | Cost (v1 expected) | Free tier sufficient? | 2026 verified pricing |
|---|---|---|---|
| Cloudflare Workers + WfP | ~$5-50/mo | Workers Paid required ($5/mo base) | $5/mo + $0.30/M req over 10M [VERIFIED] |
| Vercel | ~$20/mo (Pro) | Hobby OK pre-launch; Pro for prod custom domain | $20/mo Pro [VERIFIED] |
| Fly.io | ~$10-30/mo | Free 3 shared-CPU machines for trial; pay-as-you-go after | shared-cpu-1x ~$1.94/mo running, less with auto-suspend [VERIFIED via fly.io/docs/about/pricing] |
| Neon | $5-250/mo (usage-based) | Free covers dev; Scale required for production | $0.222/CU-hour + $0.35/GB-month [VERIFIED] |
| **Logto Cloud Pro** | **$24/mo** (NOT $99) | Free 50K MAU sufficient if no viral spike risk | $24/mo + $0.08/100 token overage [VERIFIED] |
| Sentry Team | $26/mo | Dev plan covers 5K errors; Team for 50K | $26/mo Team [VERIFIED via sentry.io/pricing] |
| BetterStack | $0-25/mo | Free covers 10 monitors + 10 heartbeats | Free OK; Team $25/mo for 60s checks [VERIFIED] |
| Resend | $0-20/mo | Free 3K emails/mo + 1 domain | Free OK at v1 [VERIFIED] |
| OpenRouter | $100-200/mo | Pay-per-use; no tier | Per Override doc [VERIFIED] |
| **Mintlify** | **$0** (NOT $250+) | Hobby tier covers all v1 needs | Hobby free; Pro $250/mo [VERIFIED] |
| Stripe | 2.9% + $0.30/charge | No fixed cost | [VERIFIED via stripe.com/pricing] |

**REVISED total monthly ceiling:** ~$295-411/mo (vs CONTEXT D-11's $720/mo claim — overestimated by ~$300/mo). Driven primarily by Logto Pro correction ($24 vs $99 = -$75) and Mintlify staying on Hobby ($0 vs assumed Pro = -$250).

### Supporting

| Tool | Version pin | Used for |
|---|---|---|
| `wrangler` | latest (auto-updated by `npx`) | CF Workers deploy + dispatch namespace mgmt |
| `vercel` CLI | latest | Vercel deploy |
| `flyctl` | latest | Fly.io machine deploy |
| `@sentry/cli` | latest | Source-maps upload (apps/api + apps/dispatch) |
| `pre-commit` (Python) | already-installed via root `package.json` `prepare` | Hook orchestration |
| `flock` | POSIX standard (macOS + Linux) | Pre-commit serialization wrapper |
| `dig` | POSIX standard | DNS verification (Resend domain) |
| `curl` + `jq` | POSIX standard | Stripe + BetterStack + Resend API calls |

---

## Architecture Patterns

### Pattern 1: Idempotent Provisioning Scripts

All vendor setup runs are **idempotent** — re-running them is a no-op. The existing pattern at `infrastructure/stripe/setup.ts` (Phase 8) and `infrastructure/cloudflare/scripts/create-namespaces.sh` (Phase 1) is canonical:

```bash
# Pseudo-pattern for idempotent vendor setup
if vendor_resource_exists "$NAME"; then
  echo "[provisioning] $NAME already exists — skipping"
else
  vendor_resource_create "$NAME"
fi
```

This allows re-walking any runbook step if mid-execution interruption occurs.

### Pattern 2: Skip-when-no-token Guards

Already-shipped pattern at `scripts/sourcemaps/upload-all.sh` for Phase 9: when an env var is unset, the script exits 0 with a skip message rather than failing. Phase 10 commands inherit this pattern. **Never use a fail-loud default that would break dev environments lacking production secrets.**

### Pattern 3: Cloudflare DNS Records — proxy-disabled for vendor TLS

Three vendors require DNS-only (NOT proxied) records: Resend (send.mcpgen.dev), BetterStack (status.mcpgen.dev), Vercel (app.mcpgen.dev), Mintlify (docs.mcpgen.dev). Each uses its own TLS termination. The Phase-1 Cloudflare scaffolding (FND-09) needs to surface this as a launch-day checklist item.

### Anti-Patterns to Avoid

- **Lowering F2/F3 thresholds to ship.** Pitfall #29 / D-16 — these are kill switches.
- **Adding GraphQL / Postman / Python output / SSO / Team plan during W7-W9.** D-15 contract — auto-reject without further discussion.
- **Force-pushing main during launch hotfixes.** docs/mcpgen-git-workflow-rules.md forbidden ops — cherry-pick into a branch and squash-merge instead.
- **Skipping the external-developer Quickstart test.** D-04 — failure of this test = launch slip.
- **Running `git commit` from 4 parallel agents without the serialization wrapper.** Phase 9 stash-race repeats — D-22 fix is the prevention.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Status page | Custom Hugo/Astro status site | BetterStack OOTB at status.mcpgen.dev | D-09; zero maintenance; auto-populated from monitors |
| Customer portal | Custom dashboard | Stripe Customer Portal (manual flow per `docs/runbooks/manual-customer-portal.md`) | D-10 deviation 5; v1.1 self-service |
| MAU tracking | Custom log scrape | Logto Admin API + `mau_log` table | D-13; Phase 8 plan 04 already migrated |
| Source maps debugging | Custom symbol server | Sentry source-maps upload | §2.3 |
| Email auth records | Hand-rolled DKIM signing | Resend SES-backed sending | §8 |
| Pre-commit serialization | Custom commit queue | `flock` POSIX advisory lock wrapper | §10.4 |
| Launch metrics dashboard | Custom analytics | Stripe + Logto + TimescaleDB tools we already ship | D-19 retro; first 100 signup metrics |

**Key insight:** Phase 10 is the phase to *not write code*. Every avoided line of code is a line that doesn't introduce launch-day risk. Use the vendor's CLI/API/UI even when scripting feels faster.

---

## Code Examples

Verified patterns from this phase's research:

### Provisioning all 6 BetterStack uptime checks

```bash
#!/usr/bin/env bash
# Run once during W7 D3
set -euo pipefail
: "${BETTERSTACK_UPTIME_API_KEY:?Set this env var first}"

TARGETS=(
  "https://app.mcpgen.dev|apps-web"
  "https://api.mcpgen.dev/health|apps-api"
  "https://dispatch.mcpgen.dev/health|apps-dispatch"
  "https://engine.mcpgen.dev/health|apps-engine"
  "https://t.mcpgen.dev/sample/health|sample-tenant"
  "https://logto.mcpgen.dev/oidc/.well-known/openid-configuration|logto"
)

for entry in "${TARGETS[@]}"; do
  IFS='|' read -r url name <<< "$entry"
  curl --silent --fail --request POST \
    --url https://uptime.betterstack.com/api/v2/monitors \
    --header "Authorization: Bearer $BETTERSTACK_UPTIME_API_KEY" \
    --header 'Content-Type: application/json' \
    --data "{
      \"monitor_type\": \"status\",
      \"url\": \"$url\",
      \"pronounceable_name\": \"$name\",
      \"check_frequency\": 60,
      \"verify_ssl\": true,
      \"regions\": [\"us\", \"eu\"]
    }" | jq -r '.data | "Created monitor \(.id) for \(.attributes.url)"'
done
```

### CI workflow snippet for production deploy + source-maps

```yaml
# .github/workflows/deploy-prod.yml
name: deploy-prod
on:
  push:
    branches: [main]
jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mcpgen/api build
      - name: Deploy to Cloudflare Workers
        run: pnpm --filter @mcpgen/api wrangler deploy --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      - name: Upload source maps to Sentry
        run: pnpm sourcemaps:upload
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: mcpgen
          SENTRY_RELEASE: ${{ github.sha }}
```

### Pre-commit serialization wrapper (D-22 plan 10-07)

```bash
#!/usr/bin/env bash
# scripts/git-hooks/serialized-precommit-wrapper.sh
# Eliminates Phase 9 stash-race attribution bug observed in commit 7051c5b.
set -euo pipefail
LOCK_FILE="$(git rev-parse --git-dir)/precommit.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9 2>/dev/null; then
  echo "[precommit] Another git operation holds the working-tree lock. Waiting..."
  flock 9
fi
exec pre-commit run --hook-stage pre-commit --color=always
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Logto $60/mo for 50K MAU | $24/mo + 50K MAU + 50K tokens | Oct 2025 | -$75/mo from CONTEXT ceiling |
| Multi-region Vercel deploys | Single region + edge functions | Standard since 2024 | Solo-friendly ops |
| Custom status pages | BetterStack / Statuspage / Atlassian Statuspage OOTB | Standard since 2022 | Zero maintenance |
| User-scoped Sentry tokens | Org-scoped Sentry auth tokens | 2024 | Designed for CI; survives user offboarding |
| husky + lint-staged | hk (parallel-safe) | 2025-2026 | Three-way merge stash isolation |
| `auto_stop_machines = "stop"` Fly default | `"suspend"` for fast resume | 2025 | Resume in < 1s vs 5-10s for stop+start |

**Deprecated/outdated:**
- Logto v1 MAU-based pricing (`docs/runbooks/logto-pro-upgrade.md` references "$60/mo for 50K MAU" — STALE; update to $24/mo)
- husky alone (no longer parallel-safe; ecosystem has moved to lefthook → hk)
- LiteLLM (Override doc replacement)
- `wrangler` CLI before v3 (`upload_source_maps` was a different syntax)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | CF Workers Paid plan ($5/mo) is sufficient for tenant request volume at v1 | §1.2 | Cost overrun ≥$50/mo if 10M+ requests/mo materialize from Show HN spike |
| A2 | Neon Scale tier at 4 max-CU autoscale fits within $250/mo D-11 cap | §5.1 | Cost overrun if peak generation throughput exceeds 4 CU sustained |
| A3 | Stripe live-mode KYC completes within 30 min for sole-proprietor in US jurisdiction | §7.1 | Launch slip if jurisdiction triggers manual review; mitigation = start W7 D1 |
| A4 | Mintlify Hobby tier handles W9 traffic (Show HN front-page burst potentially 50K page views/day) | §6.1 | Soft rate-limiting OR forced upgrade to Pro $250/mo; verify by checking Mintlify support before W9 |
| A5 | `flock`-based serialization is sufficient for D-22 (no need to migrate to hk for v1) | §10.4 | If 4+ concurrent agents become standard, the lock contention may cause noticeable commit delays. Acceptable v1 tradeoff. |
| A6 | Resend free tier (3K emails/mo) handles W9 onboarding email volume (D-10 personal email per signup) | §8.4 | Forced upgrade to Pro $20/mo if first-100-signup founder emails exceed 100/day |
| A7 | Logto Free 50K MAU is sufficient cushion for soft launch W7 (20 invitees) | §3.2 | Zero risk at W7 (20 << 50K); pre-buy Pro for W9 spike anyway per Pitfall #17 |
| A8 | Cloudflare DNS proxy-disabled (DNS-only) is the correct setting for Vercel/Resend/BetterStack/Mintlify CNAME records | §1.3, §4.3, §6.2, §8.1 | Verification failure if CF proxy is enabled — first-time setup pitfall, double-check at execution |

**8 assumed claims.** All are operational defaults with low blast radius (cost surprises, not security issues). The planner should surface these as questions to founder for confirmation pre-W7.

---

## Open Questions

1. **Does the founder's Stripe account already have KYC complete from prior projects?**
   - What we know: §7.1 KYC takes 5-30 min for new accounts; longer if jurisdiction triggers manual review.
   - What's unclear: whether the Stripe account at `infrastructure/stripe/setup.ts` is already-KYC'd or fresh.
   - Recommendation: founder verifies W7 D1 morning before kicking off plan 10-01.

2. **Does the `CF_API_TOKEN` provisioned for Phase 1 have `Edit Workers for Platforms` scope, or only `Edit Workers`?**
   - What we know: WfP namespace operations require the broader scope.
   - What's unclear: Phase 1 token scope (CONTEXT D-02 step 2 implies it should — verify).
   - Recommendation: 10-01 first task verifies `npx wrangler dispatch-namespace list` returns 200 (not 403) before proceeding.

3. **Is the Mintlify GitHub App pre-installed on the `mcpgen/mcpgen` repo?**
   - What we know: Phase 1 plan 01-05 scaffolded Mintlify locally; no evidence of GitHub App install.
   - What's unclear: who installs it (founder via mintlify.com → Add Documentation flow).
   - Recommendation: included as a single-task in plan 10-08 (Quickstart docs).

---

## Environment Availability

| Dependency | Required By | Available locally? | Version | Fallback |
|---|---|---|---|---|
| `wrangler` | §1.1, §1.2 | ✓ via `npx wrangler` (already in `apps/api/node_modules`) | 4.x latest | — |
| `vercel` CLI | §1.3 | ✓ via `npx vercel` | latest | — |
| `flyctl` | §1.4 | ⚠ may need install: `brew install flyctl` (macOS) or `curl -L https://fly.io/install.sh \| sh` | latest | none — required for Fly.io deploy |
| `@sentry/cli` | §2.3 | ✓ via `npx @sentry/cli` (`scripts/sourcemaps/upload-all.sh` already invokes it) | latest | — |
| `flock` | §10.4 | ✓ POSIX standard on macOS + Linux | — | — |
| `dig` | §8.2 | ✓ POSIX standard | — | — |
| `psql` | §5.3 (PITR verify) | ✓ already required by Phase 8 | 16+ | — |
| `neon` CLI | §5.3 | ⚠ may need install: `npm install -g neonctl` | latest | Neon Console UI for branch ops |
| `pre-commit` (Python) | §10 | ✓ already wired via `package.json` prepare script | latest | — |

**Missing dependencies:** `flyctl` and `neonctl` — install during plan 10-01 first task (additive; no fallback needed for `flyctl` because Fly.io deploy is required).

**No code-only blockers** — all CLI tools are reproducibly installable on the founder's macOS machine.

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | vitest 1.6 (apps/api), pytest (apps/generation-engine) |
| Config file | `apps/api/vitest.config.ts`, `apps/generation-engine/pyproject.toml` |
| Quick run command | `pnpm --filter @mcpgen/api test -- --run` |
| Full suite command | `pnpm test && pnpm typecheck` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| GTM-01 | Quickstart MDX renders on Mintlify; OpenAPI playground works | manual-only | (external developer test per D-04) | ⬜ Wave 3 |
| GTM-02 | Privacy/ToS/Pricing pages render on apps/web | unit | `pnpm --filter @mcpgen/web test src/app/(legal)` | ❌ Wave 0 (new tests) |
| GTM-02 | Pricing page imports from `@mcpgen/contracts/launch-criteria` (NOT hardcoded) | static AST check | `pnpm --filter @mcpgen/web test pricing-imports.test.ts` | ❌ Wave 0 |
| GTM-03 | Public-launch posts go live W9 — verified by HN/PH/Reddit URLs in `10-PHASE-VERIFICATION.md` | manual-only | (founder fills sign-off table per D-19) | ⬜ Wave 4 |
| D-22 | Pre-commit serialization wrapper prevents stash-race | integration | `bash tests/scripts/test-precommit-serialization.sh` | ❌ Wave 2 (new test) |
| D-06 item 1 | All 12 `session_id="unknown"` placeholders threaded with `generation_id` | regression | `cd apps/generation-engine && uv run pytest tests/observability/test_session_id_threaded.py` | ❌ Wave 1 (new test) |
| D-06 item 2 | `usage_hourly` matview refresh unblocks `drizzle-kit push` | integration | `pnpm --filter @mcpgen/api db:test-migrate --incremental` | ✓ exists, just needs new migration |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mcpgen/<workspace> test -- --run`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work` + 5 manual W7 sign-offs (D-03)

### Wave 0 Gaps
- [ ] `apps/web/src/app/(legal)/__tests__/pricing-imports.test.ts` — covers GTM-02 contract-import invariant
- [ ] `apps/web/src/app/(legal)/__tests__/legal-pages.test.tsx` — render smoke for Privacy + Terms + Pricing
- [ ] `tests/scripts/test-precommit-serialization.sh` — covers D-22 (parallel commit determinism)
- [ ] `apps/generation-engine/tests/observability/test_session_id_threaded.py` — covers D-06 item 1 (12-site grep + assertion)
- [ ] `infrastructure/neon/migrations/<NEW>_refresh_usage_hourly_matview.sql` — covers D-06 item 2 (matview refresh, drizzle-kit unblocker)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | Logto Cloud Pro (§3); session tokens unchanged across upgrade |
| V3 Session Management | yes | Logto OIDC handles session lifecycle |
| V4 Access Control | yes | CI secret store scoping (org-scoped Sentry token, team-scoped BetterStack token, project-scoped CF + Vercel + Fly tokens) |
| V5 Input Validation | yes | Webhook signature verification (Stripe, BetterStack heartbeats) — already wired Phase 8 |
| V6 Cryptography | yes | TLS via vendor (Cloudflare, Vercel, Fly, Mintlify, BetterStack — never roll our own) |
| V7 Error Handling and Logging | yes | Sentry redaction wired Phase 9; org-scoped token grants source-maps + release scopes only |
| V13 API and Web Service | yes | All vendor APIs use Bearer auth via env-var-loaded tokens; never embed in code |
| V14 Configuration | yes | DNS records DNS-only (not proxied) where vendor terminates TLS — verifies via dig |

### Known Threat Patterns for launch ops

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Hard-coded API token in deploy script | Information disclosure | gitleaks pre-commit hook (already enforced) + `.env.example` annotation `# CI-only — never commit` |
| Token leaked via Sentry source-maps upload | Information disclosure | source-maps contain only symbol mappings, not runtime values; Sentry org token has minimal scope (Source Map Upload + Release Creation) |
| Mid-deploy partial failure leaves system in inconsistent state | Denial of service | Each `wrangler deploy` / `vercel deploy` / `fly deploy` is atomic per-app; rollback = re-deploy prior commit |
| KYC documents leaked to LLM agent during launch prep | Information disclosure | Founder executes Stripe KYC manually in browser; agent never sees passports, EIN docs, etc. (D-21 launch-day decision authority) |
| Multi-vendor outage during launch (cross-vendor correlated failure) | Denial of service | Single-region single-vendor design (CLAUDE.md §10) — accept that any single vendor outage = downtime; status page communicates |
| Logto MAU spike → free-tier hard cap → 0 signups | Denial of service | Pre-buy Logto Pro W7 (D-02 step 6) lifts cap before W9 traffic |
| Webhook signature secret rotation mid-launch | Tampering | Stripe live-mode `whsec_...` is generated at endpoint creation and stable; rotate only via Dashboard (audited); never in code |

---

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers for Platforms commands](https://developers.cloudflare.com/workers/wrangler/commands/workers-for-platforms/) — §1.2 dispatch namespace commands
- [Vercel CLI deploy](https://vercel.com/docs/cli/deploy) — §1.3 vercel deploy --prebuilt --archive=tgz
- [Fly.io FastAPI guide](https://fly.io/docs/python/frameworks/fastapi/) — §1.4 fly launch + deploy
- [Fly.io autostop/autostart](https://fly.io/docs/launch/autostop-autostart/) — §1.4 auto_stop_machines suspend
- [uv FastAPI integration](https://docs.astral.sh/uv/guides/integration/fastapi/) — §1.4 Dockerfile multi-stage
- [Sentry auth tokens](https://docs.sentry.io/account/auth-tokens/) — §2.2 org-scoped tokens
- [Sentry CLI sourcemaps](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/) — §2.3 upload commands
- [Sentry CF Workers + wrangler](https://docs.sentry.io/platforms/javascript/guides/cloudflare/sourcemaps/uploading/wrangler/) — §1.1 upload_source_maps
- [Logto pricing](https://logto.io/pricing) — §3.1 current $24/mo Pro
- [Logto pricing Sep 2025 update](https://blog.logto.io/pricing-sep-2025) — §3.1 pricing-model timeline
- [BetterStack uptime API getting started](https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/) — §4.1 bearer auth
- [BetterStack create monitor API](https://betterstack.com/docs/uptime/api/create-a-new-monitor/) — §4.2
- [BetterStack create heartbeat API](https://betterstack.com/docs/uptime/api/create-a-hearbeat/) — §4.2
- [BetterStack custom subdomain](https://betterstack.com/docs/uptime/custom-subdomain/) — §4.3 statuspage.betteruptime.com CNAME
- [Neon pricing](https://neon.com/pricing) — §5.1 usage-based Scale
- [Neon cost optimization](https://neon.com/docs/introduction/cost-optimization) — §5.4 scale-to-zero
- [Mintlify pricing](https://www.mintlify.com/pricing) — §6.1 Hobby vs Pro
- [Mintlify OpenAPI setup](https://www.mintlify.com/docs/api-playground/openapi-setup) — §6.3
- [Stripe Manage prices "Copy to live mode"](https://docs.stripe.com/products-prices/manage-prices) — §7.2
- [Stripe webhooks](https://docs.stripe.com/webhooks) — §7.3
- [Stripe KYC requirements](https://support.stripe.com/questions/know-your-customer-(kyc)-requirements-for-connected-accounts) — §7.1
- [Show HN guidelines](https://news.ycombinator.com/showhn.html) — §9.1
- [Resend Cloudflare DNS guide](https://resend.com/docs/knowledge-base/cloudflare) — §8.1
- [Resend SPF/DKIM/DMARC walkthrough](https://dmarcdkim.com/setup/how-to-setup-resend-spf-dkim-and-dmarc-records) — §8.1 record values
- [hk parallel-safe git hooks](https://hk.jdx.dev/why-hk.html) — §10.3
- [pre-commit issue #1880 (parallel patch fail)](https://github.com/pre-commit/pre-commit/issues/1880) — §10.2
- [pre-commit issue #2473 (stash lost on parallel git add)](https://github.com/pre-commit/pre-commit/issues/2473) — §10.2

### Secondary (MEDIUM confidence)
- [Vercel pre-built deploy guide](https://www.buildwithmatija.com/blog/prebuilt-deploy-to-vercel-nextjs) — §1.3 monorepo --prebuilt pattern
- [Product Hunt 2026 algorithm guide](https://www.reviewsell.com/blog/product-hunt-launch-upvotes-2026/) — §9.2
- [Lefthook vs husky 2026](https://www.edopedia.com/blog/lefthook-vs-husky/) — §10.3 race condition comparison
- [Cloudflare Workers pricing](https://www.cloudflare.com/plans/developer-platform/) — §1.2 Workers Paid plan + WfP
- [Sentry CF workers integration](https://docs.sentry.io/platforms/javascript/guides/cloudflare/) — §1.1 upload_source_maps wrangler

### Tertiary (LOW confidence — flag for verification at execution time)
- Vercel Pro $20/mo — verified at signup time; Vercel may bundle differently for Hobby + custom domain
- Sentry Team $26/mo — verified at signup time; may differ post-2025
- Stripe KYC sub-30-min completion time — anecdotal; jurisdiction-dependent
- Cloudflare WfP namespace cost ($0 to create, billed via Workers Paid plan) — verify at creation time

---

## Metadata

**Confidence breakdown:**
- Vendor commands (CF / Vercel / Fly / Sentry / BetterStack / Resend / Stripe / Mintlify): HIGH — all verified against official docs
- Vendor pricing: HIGH for Logto/Neon/Mintlify (corrected via primary source); MEDIUM for Vercel/Sentry/CF (need execution-time verify)
- KYC + Stripe meter copy mechanics: MEDIUM — Stripe docs explicitly mention products/prices but are silent on meters; recommended approach is the existing `infrastructure/stripe/setup.ts` idempotent pattern
- Show HN / PH / Reddit best practices: HIGH — official guidelines + 2026-current launch playbooks
- Pre-commit hardening: HIGH — verified via official issues + tool comparison docs

**Research date:** 2026-04-30

**Valid until:** 2026-06-30 (30 days for stable vendor docs; 7 days for pricing pages — Logto pricing has changed twice in past 24 months, so re-verify pricing at execution time)
