# Phase 10: Launch — Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** ~28 surfaces across 14 deliverable groups (D-01..D-22)
**Analogs found:** 24 / 28 (4 net-new with no in-repo analog)

> **Phase 10 is operations + content, not features.** Most "files" here are runbooks, secrets, deploys, and content production — for those, the analog is an existing `docs/runbooks/*.md`, an existing wrangler/fly/next config, or an existing Inngest cron. The 4 net-new surfaces (public-launch posts, demo videos, status page CNAME, founder-runbook check-list) carry forward as content-only — they have no code analog by design.

---

## File Classification

### Wave 1 — Provisioning + critical follow-ups (W7 D1-D2)

| New / Modified surface | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `docs/runbooks/cloud-secrets-provisioning.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/resend-domain-setup.md` + `docs/runbooks/logto-pro-upgrade.md` | exact |
| `docs/runbooks/cf-deploy.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/multi-client-smoke.md` + `infrastructure/cloudflare/README.md` | exact |
| `docs/runbooks/vercel-deploy.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/multi-client-smoke.md` | exact |
| `docs/runbooks/fly-deploy.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/neon-scale-upgrade.md` | exact |
| `apps/api/wrangler.toml` (MODIFY — production env) | config (TOML) | config-export | self (existing `[env.staging]` / `[env.sandbox]` blocks) | exact |
| `apps/dispatch/wrangler.toml` (MODIFY — production env) | config (TOML) | config-export | self (existing 3-env structure) | exact |
| `apps/web/vercel.json` (NEW — optional; or rely on Vercel project UI) | config (JSON) | config-export | none in tree — Vercel project today is auto-detected | partial |
| `apps/api/src/inngest/client.ts` (MODIFY — INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY) | runtime init | startup hook | self (existing local-only init; Phase 10 comment already notes "Phase 10: wires INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY") | exact |
| `infrastructure/cloudflare/scripts/create-namespaces.sh` (UNGUARD — remove `exit 78` block) | one-shot script | batch | self (existing deferred-guard) | exact |
| `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py` + 11 sibling sites — thread `generation_id` | LLM call site | request-response | `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py:171-182` (canonical TODO comment) | exact |
| `apps/generation-engine/src/mcpgen_engine/observability/run_tracing.py` (NO CHANGE — receives real value) | helper (transform) | transform (pure) | self (lines 60-67 docstring already accepts `session_id` as positional kwarg) | exact |
| `infrastructure/neon/migrations/20260501000000_phase10_matview_refresh.sql` (NEW or migration-folder script) | migration / one-shot SQL | batch | `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (idempotent ADD COLUMN) — but for matview the analog is a different shape (REFRESH-then-grant) | role-match |

### Wave 2 — Operations + smoke (W7 D3-D5)

| New / Modified surface | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `docs/runbooks/betterstack-status-page.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/betterstack-setup.md` | exact |
| `docs/runbooks/cost-alerts-setup.md` (NEW) | runbook (manual checklist, 9-vendor click-path) | static | `docs/runbooks/betterstack-setup.md` (multi-step click-path) | exact |
| `apps/web/src/app/(legal)/privacy/page.tsx` (NEW) | route (Next.js App Router) | request-response (static) | `apps/web/src/app/pricing/page.tsx` (current redirect placeholder) + `apps/web/src/app/dashboard/page.tsx` (force-dynamic + Server Component pattern) | role-match |
| `apps/web/src/app/(legal)/terms/page.tsx` (NEW) | route (Next.js App Router) | request-response (static) | same as privacy | role-match |
| `apps/web/src/app/(legal)/pricing/page.tsx` (REPLACE — currently redirects to `?pricing=true`) | route (Next.js App Router) | request-response (static, build-time-imports `LAUNCH_CRITERIA`) | `apps/web/src/app/pricing/page.tsx` (existing redirect stub) — shape inverts to actual content | exact |
| `.husky/pre-commit` OR `.pre-commit-config.yaml` patch (D-22 stash-restore harden) | git hook (pre-commit shell) | event-driven | `.pre-commit-config.yaml` lines 14-107 (existing local hooks) — D-22 attaches a stash-restore guard, not a new hook | role-match |

### Wave 3 — Content + legal + docs (W8)

| New / Modified surface | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `apps/docs/mint.json` (REWRITE — real navigation tree) | config (JSON) | config-export | self (current 1-page placeholder) | exact |
| `apps/docs/{quickstart,cli,api-reference,engine-internals}/*.mdx` (NEW set) | docs (Mintlify MDX) | static | none (current `apps/docs/` is empty placeholder) | net-new |
| `apps/docs/package.json` (MODIFY `build` from echo → `mintlify build`) | build script | config-export | self (line 7 currently `echo "Phase 1: docs build deferred to Phase 10 (GTM-01)"`) | exact |
| `infrastructure/neon/migrations/20260501010000_users_first_contact_at.sql` (NEW) | migration (DDL — single ADD COLUMN) | static | `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (idempotent ADD COLUMN IF NOT EXISTS) | exact |
| `packages/contracts/src/db-schema.ts` (MODIFY — add `users.first_contact_at` column) | schema (Drizzle) | type-only | self (lines 65-73 current `users` table) — D-19 Phase 9 added `deployments.public_badge` via same edit pattern (lines 156-161) | exact |
| `apps/web/src/app/(legal)/_content/quickstart-demo-video.mp4` (NEW — 5 videos) | static asset (video) | static | none in tree (`claude-design-ui/` has UI assets, not video) | net-new |
| `docs/runbooks/pre-launch-checklist.md` (NEW) | runbook (operator checklist) | static | `docs/runbooks/multi-client-smoke.md` (sign-off table pattern) | exact |
| `docs/runbooks/incident-runbook-top5.md` (NEW) | runbook (5 sub-runbooks) | static | `docs/runbooks/migration-conflicts.md` (failure-recovery shape) | role-match |
| `docs/runbooks/backup-verification.md` (NEW) | runbook (manual checklist) | static | `docs/runbooks/neon-scale-upgrade.md` (PITR + screenshot sign-off pattern) | exact |

### Wave 4 — Launch day (W9)

| New / Modified surface | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `docs/launch/soft-launch-invitees.md` (NEW — 20 names + status) | tracking doc | static | none in tree (operational tracking) | net-new |
| `docs/launch/posts/{showhn,producthunt,reddit-ml,reddit-llama,x-thread,linkedin}.md` (NEW × 6) | content (markdown) | static | none in tree (no marketing content shipped before) | net-new |
| `.planning/phases/10-launch/10-DEPLOY-EVIDENCE.md` (NEW — D-03 sign-off) | tracking doc | static | `.planning/phases/09-observability-polish/09-PHASE-VERIFICATION.md` (frontmatter sign-off shape) | role-match |
| `.planning/phases/10-launch/10-PHASE-VERIFICATION.md` (NEW — D-19) | phase verification doc | static | `.planning/phases/09-observability-polish/09-PHASE-VERIFICATION.md` (canonical template — frontmatter + Goal Achievement + Threat Model Coverage + Carry-Forward) | exact |
| `apps/web/src/app/api/users/first-contact/route.ts` (NEW — opt-in CRON receiver) OR Inngest function | route OR Inngest function (cron) | event-driven | `apps/api/src/inngest/functions/logto-mau-watch.ts` (daily cron pattern; INSERT-on-table; alert email) | exact |

---

## Pattern Assignments

### 1. Cloud secrets provisioning (D-02)

**Surface:** `docs/runbooks/cloud-secrets-provisioning.md` (NEW) — orchestrator runbook for the 8-step provisioning order. Per-vendor runbooks already exist (Logto, Resend, BetterStack, Neon Scale).

**Closest analog:** `docs/runbooks/resend-domain-setup.md` (lines 1-30 already shown above). Same shape: References block → Status block → numbered click-path → "Once verified, set `.env.local`" `.env` snippet → sign-off note.

**Pattern to copy** — runbook header + click-path shape:

```markdown
# Runbook: Cloud secrets provisioning (Phase 10 W7 D1)

**References:**
- 10-CONTEXT.md D-02 (provisioning order)
- docs/runbooks/{betterstack-setup,neon-scale-upgrade,logto-pro-upgrade,resend-domain-setup}.md
- packages/contracts/src/inngest-functions.ts (INNGEST_EVENT_KEY consumer)
- .planning/phases/09-observability-polish/09-PHASE-VERIFICATION.md `phase_10_carry_forward.cloud_secrets_provisioning`

## Status
8 secret groups land sequentially. Each step's URL/secret feeds the next; skipping = retroactive secret rotation (unsafe, see git-workflow §forbidden ops).

## Click-path
1. Sentry org + 4 project DSNs + SENTRY_AUTH_TOKEN ...
2. CF account + 3 dispatch namespaces (pre-existing `infrastructure/cloudflare/scripts/create-namespaces.sh` — unguard the `exit 78` block) ...
[...]
```

**Secret list to enumerate (verbatim from CONTEXT D-02 + 09-PHASE-VERIFICATION.md `phase_10_carry_forward.cloud_secrets_provisioning`):** SENTRY_AUTH_TOKEN, CF_API_TOKEN, VERCEL_TOKEN, FLY_API_TOKEN, BETTERSTACK_LOGS_TOKEN, BETTERSTACK_UPTIME_API_KEY, BETTERSTACK_OUTBOX_HEARTBEAT_URL, LOGTO_ADMIN_API_TOKEN, RESEND_API_KEY, STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET (live), 4× SENTRY_PROJECT_*, 4× live SENTRY_DSN.

**Constraint surfaced:** gitleaks already runs at `.pre-commit-config.yaml` line 15-18 — no secret in this list goes into git. The runbook operates entirely on CI provider secret stores (GitHub Actions secrets, Vercel project env, Fly.io machine env, CF Workers `wrangler secret put`, Inngest Cloud env).

---

### 2. Cloud deploys: CF + Vercel + Fly (D-03 step 4)

**Surface:** Three runbooks (`docs/runbooks/cf-deploy.md`, `vercel-deploy.md`, `fly-deploy.md`) + one tracking doc (`.planning/phases/10-launch/10-DEPLOY-EVIDENCE.md`).

**Closest analog for the runbooks:** `docs/runbooks/multi-client-smoke.md` (lines 1-40). Header pattern verbatim — "When to use" → "Pre-requisites" → numbered click-path → sign-off table.

**Closest analog for deploy commands themselves:**

| Target | Existing config | Existing deploy script | Pattern to copy |
|---|---|---|---|
| `apps/api` | `apps/api/wrangler.toml` (lines 1-39) | `apps/api/package.json:10` `"deploy": "wrangler deploy --upload-source-maps"` | wrangler deploy + sourcemaps:upload sequence |
| `apps/dispatch` | `apps/dispatch/wrangler.toml` (lines 1-46) | `apps/dispatch/package.json:9` `"deploy": "wrangler deploy --upload-source-maps"` | identical shape; 3-namespace dispatch_namespaces block already encoded |
| `apps/web` | `apps/web/next.config.js` + `apps/web/sentry.{client,server,edge}.config.ts` | `apps/web/package.json:10` `"build": "next build"` (Vercel auto-detects Next 15) | Vercel project UI + `withSentryConfig(nextConfig, {...})` already in next.config.js — sourcemaps auto-upload during build |
| `apps/generation-engine` | `apps/generation-engine/fly.toml` (lines 1-55) + `Dockerfile` (54 lines) | none yet — `flyctl deploy --dockerfile apps/generation-engine/Dockerfile --build-context $PWD` per Dockerfile header comment | Dockerfile lines 6-15 already document the exact deploy command — runbook just executes it |

**`apps/api` and `apps/dispatch` `[env.production]` block to add — copy from existing `[env.staging]` pattern** (`apps/api/wrangler.toml:28-32`):

```toml
# Existing pattern in apps/api/wrangler.toml lines 28-32:
[env.staging]
name = "mcpgen-api-staging"
[env.staging.vars]
ENVIRONMENT = "staging"

# Phase 10 — add the production sibling (NOT a 4th namespace; production
# IS `mcpgen-prod` which already exists as the default top-level config):
# `apps/api` is single-Worker per env so just promote default → name=mcpgen-api
# AND set `[vars].ENVIRONMENT = "production"`. No extra block needed.
```

**`apps/dispatch/wrangler.toml` for production** — the file already wires the production namespace at the TOP-level (lines 14-17 — `namespace = "mcpgen-prod"`). The default deploy IS the production deploy. CF Workers for Platforms namespace creation already lives in `infrastructure/cloudflare/scripts/create-namespaces.sh`.

**Constraint surfaced (architectural lock):** D-08 from Phase 1 — exactly 3 dispatch namespaces (`mcpgen-prod`, `mcpgen-staging`, `mcpgen-sandbox`). Pre-commit hook `cf-namespace-guard` (`.pre-commit-config.yaml:67-72`) blocks any 4th. CI step in `.github/workflows/main-ci.yml:175-194` re-runs `pre-commit run --all-files` server-side. Phase 10 must NOT introduce a 4th.

**Hyperdrive ID replacement:** Both `apps/api/wrangler.toml:20` and `apps/dispatch/wrangler.toml:21` carry `id = "REPLACE_WITH_HYPERDRIVE_ID"` — Phase 10 W7 runs `wrangler hyperdrive create mcpgen-pg --connection-string $DATABASE_URL` once and substitutes both files via the same git commit.

---

### 3. Mintlify docs deploy (D-04 + GTM-01)

**Surface:** Real Mintlify navigation tree + content pages.

**Closest analog (current state):** `apps/docs/mint.json` (10 lines — single placeholder page) + `apps/docs/package.json` (16 lines — build/lint/test all `echo` placeholders) + `apps/docs/README.md` (16 lines — "Phase 1 placeholder. Phase 10 GTM-01 fills this with real content").

**Pattern to copy — `apps/docs/mint.json` rewrite shape:**

```json
{
  "$schema": "https://mintlify.com/schema.json",
  "name": "MCPGen",
  "logo": { "light": "/logo-light.svg", "dark": "/logo-dark.svg" },
  "colors": { "primary": "#3b82f6" },
  "navigation": [
    { "group": "Get Started", "pages": ["index", "quickstart"] },
    { "group": "CLI", "pages": ["cli/install", "cli/init", "cli/deploy"] },
    { "group": "API Reference", "pages": ["api-reference/generate", "api-reference/sse-events"] },
    { "group": "Engine Internals", "pages": ["engine/six-tool-pattern", "engine/quality-scoring"] }
  ]
}
```

**Pattern to copy — `apps/docs/package.json` build script flip** (`apps/docs/package.json:7`):

```json
// CURRENT line 7:
"build": "echo \"Phase 1: docs build deferred to Phase 10 (GTM-01)\"",
// PHASE 10 replacement:
"build": "mintlify build",
```

**External developer test (D-04 / GTM-01) — sign-off pattern from `docs/runbooks/multi-client-smoke.md`:** Acceptance is a dated Claude Desktop screenshot showing 6 universal tools from a generated server, captured by an external dev who never used MCPGen.

**Constraint surfaced:** No code files in `apps/docs/` exist today other than `mint.json` + `package.json` + `README.md`. Pages live as MDX (`*.mdx`) alongside `mint.json` per Mintlify convention.

---

### 4. Legal pages (D-05 + GTM-02): privacy / terms / pricing

**Surface:** `apps/web/src/app/(legal)/{privacy,terms,pricing}/page.tsx` — Next.js App Router route group.

**Closest analog:**

1. `apps/web/src/app/pricing/page.tsx` (current 20-line redirect stub — Plan 07-03 placeholder) for the **route file shape** (force-dynamic + default export).
2. `apps/web/src/app/dashboard/page.tsx` (lines 1-83) for the **Server Component shape with imports + `export const dynamic = 'force-dynamic'`**.
3. `apps/web/src/app/layout.tsx` (lines 1-71) for the **`@/global.css` + locked-fonts ALREADY-imported once** — legal pages MUST NOT re-import global.css; they only render JSX.

**Pattern to copy — file shape (mirror `apps/web/src/app/pricing/page.tsx:1-19` but flip from redirect to content):**

```typescript
// apps/web/src/app/(legal)/pricing/page.tsx — Phase 10
//
// D-05 + D-06 GTM-02. Replaces Plan 07-03 redirect stub. Pricing copy MUST
// import LAUNCH_CRITERIA constants at build time (NOT hardcode). Closes
// Pitfall #29 (AI lowering thresholds in copy != code).
//
// Visual lock invariants (CONTEXT D-05): MUST NOT touch
// `apps/web/src/styles/*` or `apps/web/src/components/ui/*` — those are
// guarded by `.pre-commit-hooks/check-ui-locked.sh`. Compose existing
// primitives only.

import { LAUNCH_CRITERIA } from '@mcpgen/contracts/launch-criteria';
import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

export default function PricingPage(): ReactElement {
  // Reference LAUNCH_CRITERIA.COST_CAP_FREE_USD / COST_CAP_PRO_USD inline
  return (
    <main>
      <h1>Pricing</h1>
      <p>
        Free includes 1 F3 evaluation per month with a per-generation cost
        cap of ${LAUNCH_CRITERIA.COST_CAP_FREE_USD.toFixed(2)}.
      </p>
      <p>
        Pro at $60/mo includes 5 F3 evaluations with a per-generation cost
        cap of ${LAUNCH_CRITERIA.COST_CAP_PRO_USD.toFixed(2)}.
      </p>
      {/* ... reuse existing locked typography primitives only ... */}
    </main>
  );
}
```

**Constraint — visual lock (CRITICAL):** Pre-commit hook `ui-locked-guard` at `.pre-commit-config.yaml:101-106` blocks ANY edit to `apps/web/src/styles/` or `apps/web/src/components/ui/`. `.pre-commit-hooks/check-ui-locked.sh` enforces. Legal pages add CONTENT only — no new design tokens, no edits to `apps/web/src/global.css`, no new components in `components/ui/`.

**Constraint — contract lock for Pricing page:** `LAUNCH_CRITERIA` constants (`packages/contracts/src/launch-criteria.ts:34-46`) are immutable per the three-layer defense at the top of that file. The pricing page imports `COST_CAP_FREE_USD: 0.50` / `COST_CAP_PRO_USD: 2.00` directly from `@mcpgen/contracts/launch-criteria`. The CI step `launch-criteria-assertion` at `.github/workflows/main-ci.yml:219-239` uses `grep -qF` to assert these constants haven't drifted. Pre-commit hook `launch-criteria-guard` (`.pre-commit-config.yaml:75-79`) requires a paired `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry for any edit. **Phase 10 must NOT change these values; only IMPORT them.**

**Route group `(legal)` rationale:** Next.js App Router parentheses convention — the directory name is purely organizational, does NOT appear in the URL path. `(legal)/privacy/page.tsx` resolves to `/privacy`. Co-locates the three new files without a URL prefix.

---

### 5. Pricing page wiring to `launch-criteria.ts` (D-05 invariant)

**Surface:** `apps/web/src/app/(legal)/pricing/page.tsx` imports `LAUNCH_CRITERIA`.

**Closest analog (existing consumer of LAUNCH_CRITERIA):** None at runtime today — `LAUNCH_CRITERIA` is currently consumed only by:

1. CI assertion step at `.github/workflows/main-ci.yml:219-239` via `grep -qF` (text-level, not import-level).
2. Pre-commit hook at `.pre-commit-hooks/launch-criteria-paired-decision.sh` (text-level diff guard).
3. Tests in `packages/contracts/tests/launch-criteria.test.ts` (per `01-PATTERNS.md` lineage).
4. Future F1/F2/F3 stage assertions inside `apps/generation-engine/` (deferred; not in repo yet — `LAUNCH_CRITERIA` is currently a TS-only export that has not been mirrored into Pydantic).

**Phase 10 makes the pricing page the FIRST runtime consumer.** Pattern to copy from `apps/web/next.config.js:28` `transpilePackages: ['@mcpgen/contracts', '@mcpgen/ir', '@mcpgen/engine-fixtures']` — the workspace already enables Next's SWC compiler to consume `.ts` directly from `@mcpgen/contracts/src/launch-criteria.ts`.

**Risk surfaced:** If the import shape `import { LAUNCH_CRITERIA } from '@mcpgen/contracts/launch-criteria'` doesn't resolve due to subpath export missing, fallback is `import { LAUNCH_CRITERIA } from '@mcpgen/contracts'` (root barrel). Verify in `packages/contracts/package.json` `exports` field — Plan 09-01 already established this pattern via `@mcpgen/contracts/sentry-redaction` (per `09-PATTERNS.md` line 56).

---

### 6. `generation_id` threading code follow-up (D-06 item 1)

**Surface:** 12 call sites in `apps/generation-engine/src/mcpgen_engine/passes/**` + `stages/stage_f/**`.

**Canonical TODO marker (already in tree):** `apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py:171-182`:

```python
# TODO(09-05): thread generation_id through pass_0.run signature.
# session_id="unknown" is a placeholder; Plan 09-05 acceptance
# criterion accepts this for ≥4 of 11 call sites where threading
# is invasive. Wrapper still provides Logfire span correlation
# by stage tag, just no per-generation grouping.
result = await run_with_tracing(
    PASS_0_AGENT,
    user_prompt,
    session_id="unknown",
    stage="pass-0",
    model_settings=PASS_0_SETTINGS,
)
```

**12 call sites** (enumerated in 09-PHASE-VERIFICATION.md `anti_patterns_found` table):

```
apps/generation-engine/src/mcpgen_engine/passes/pass_0/llm.py:179
apps/generation-engine/src/mcpgen_engine/passes/pass_1/schema_synth.py:260
apps/generation-engine/src/mcpgen_engine/passes/pass_1/schema_synth.py:297
apps/generation-engine/src/mcpgen_engine/passes/pass_2/authoring.py:154
apps/generation-engine/src/mcpgen_engine/passes/pass_2/quality_gate.py:143
apps/generation-engine/src/mcpgen_engine/passes/pass_3/enrich.py:173
apps/generation-engine/src/mcpgen_engine/passes/pass_3/quality_gate.py:171
apps/generation-engine/src/mcpgen_engine/passes/pass_4/llm_judge.py:122
apps/generation-engine/src/mcpgen_engine/passes/pass_5/field_ranking.py:204
apps/generation-engine/src/mcpgen_engine/stages/stage_f/f2_smell.py:160
apps/generation-engine/src/mcpgen_engine/stages/stage_f/f3_agent_eval.py:292
```

**Receiver — already accepts the value** (`run_tracing.py:35-79`):

```python
async def run_with_tracing(
    agent: Agent[Any, Any],
    prompt: str,
    *,
    session_id: str,        # <-- already takes the value
    stage: str,
    model_settings: Any,
) -> AgentRunResult[Any]:
    span_ctx = logfire.span("agent.run")
    with span_ctx as active_span:
        active_span.set_attribute("langfuse.session.id", session_id)
        active_span.set_attribute("langfuse.tags", [stage])
        return await agent.run(prompt, model_settings=model_settings)
```

**Pattern — orchestrator signature edit shape:** Each `pass_N/run` orchestrator already takes a `RawIR` or `ToolTaxonomy` etc. — it must add a leading `generation_id: str` parameter and forward to the internal LLM helper. Caller chain (top-down):

```
GenerationOrchestrator (apps/generation-engine/src/mcpgen_engine/main.py)
  → pass_0.run(spec_ir, generation_id=gen.id)
    → pass_0.llm._invoke(..., generation_id=...)
      → run_with_tracing(..., session_id=generation_id, ...)
```

The 12 sites change the constant `"unknown"` → `generation_id` — the only invasive part is threading the parameter down through the orchestrator call. Each orchestrator file is a one-line signature edit; each call site is a one-line value substitution.

**Constraint:** Backward compat NOT a concern (internal Python API). Tests in `apps/generation-engine/tests/observability/test_run_tracing*.py` already accept `session_id` as a parametrized input — passing `"gen_01HXYZ..."` instead of `"unknown"` requires no test edits.

---

### 7. `usage_hourly` matview refresh (D-06 item 2)

**Surface:** Either (a) a one-off REFRESH command run W7 D2 to populate the `WITH NO DATA` matview, or (b) a migration that includes a REFRESH in its body.

**Background — current state:**

- `infrastructure/neon/migrations/20260428000002_phase8_billing_drift.sql:115-137` creates the matview `WITH NO DATA`:
  ```sql
  CREATE MATERIALIZED VIEW "usage_hourly" AS
  SELECT time_bucket('1 hour', "time") AS bucket, "deployment_id",
    count(*) AS event_count,
    sum(coalesce("tokens_in", 0))::bigint AS tokens_in_total,
    sum(coalesce("tokens_out", 0))::bigint AS tokens_out_total,
    sum(case when "status" = 'error' then 1 else 0 end)::int AS error_count
  FROM "usage_events"
  GROUP BY bucket, "deployment_id"
  WITH NO DATA;
  CREATE UNIQUE INDEX "usage_hourly_pk" ON "usage_hourly"(bucket, "deployment_id");
  ```
- The Inngest cron `stripeMetersEmit` (`apps/api/src/inngest/functions/stripe-meters-emit.ts:74-76`) ALREADY has the REFRESH:
  ```typescript
  await step.run('refresh-usage-hourly', async () => {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY usage_hourly`);
  });
  ```

**The actual problem (per 09-PHASE-VERIFICATION.md `phase_10_carry_forward.code_followups` line 4):** The matview was created `WITH NO DATA` and `drizzle-kit push` rejects pushing on top of an unpopulated matview. The fix is a single one-shot `REFRESH MATERIALIZED VIEW usage_hourly` (NOT `CONCURRENTLY` — first refresh requires non-concurrent because the matview has no rows yet to refresh against).

**Closest analog (one-shot SQL via Drizzle):** None as a migration file. Two viable patterns:

1. **Inline migration body** — a new migration `infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql` whose body is just `REFRESH MATERIALIZED VIEW usage_hourly;`. Analog shape: the `phase8_billing_drift.sql` file IS DDL; its `--> statement-breakpoint` separator pattern (e.g. line 137) carries here.
2. **One-shot script outside migration system** — invoke from a runbook step. Less canonical because Drizzle migrations track the schema state.

**Recommended pattern (migration approach):**

```sql
-- infrastructure/neon/migrations/20260501000000_phase10_initial_matview_refresh.sql
--
-- Phase 10 D-06 item 2: matview was created WITH NO DATA in
-- 20260428000002_phase8_billing_drift.sql:135. drizzle-kit push fails
-- against an unpopulated matview. The first REFRESH must be non-concurrent
-- because there are no existing rows; subsequent refreshes by the
-- Inngest cron `stripeMetersEmit` use REFRESH ... CONCURRENTLY.
REFRESH MATERIALIZED VIEW "usage_hourly";
--> statement-breakpoint
```

**Constraint:** Phase 10 must NOT alter the matview schema. The Phase 8 deviation (`08-PHASE-DEVIATIONS.md` Wave 1 deviation #1) explains Neon TimescaleDB Apache rejects `WITH (timescaledb.continuous)` — the regular MATERIALIZED VIEW + Inngest-driven REFRESH IS the design. Phase 10 only populates the empty matview once.

---

### 8. Pre-commit stash-restore harden (D-22)

**Surface:** Either `.husky/pre-commit` (shell script) or a tweak to `.pre-commit-config.yaml`. **`.husky/` does NOT exist in tree** — the repo uses `pre-commit` (Python framework) directly per `.pre-commit-config.yaml`.

**Closest analog (the actual stash-race):** The `09-PHASE-VERIFICATION.md` lines 134-153 capture the race in detail:

```yaml
parallel_execution_observations:
  stash_race_attribution_mismatch:
    affected_commits:
      - sha: "7051c5b"
        title_claimed: "docs(09-08): complete cross-tenant smart-ID defense-in-depth plan"
        actual_files_committed:
          - ".planning/ROADMAP.md"
          - ".planning/STATE.md"
          - ".planning/phases/09-observability-polish/09-09-SUMMARY.md (sibling plan!)"
        analysis: "Pre-commit stash/restore cycle interleaved with parallel plan 09-09's
                   untracked SUMMARY, causing the 7051c5b 'docs(09-08)' metadata commit to
                   actually contain plan 09-09's SUMMARY file."
```

**Root cause:** `pre-commit` framework's default `--allow-stash-restore` behavior pops untracked files back into the working tree before the commit hook completes. When two `git commit` invocations interleave on the same working tree (parallel plan executions), the stash-pop of plan A's untracked files lands while plan B's `git commit` is still composing the commit's tree.

**Closest analog for the fix shape:** `.pre-commit-config.yaml:48-55` — the existing `eslint` local hook with `language: system + entry: pnpm -r --if-present lint`. D-22 hook will follow the same `repo: local` shape but as a `pre-commit` hook (not `commit-msg`):

```yaml
# .pre-commit-config.yaml addition (Phase 10 D-22):
- repo: local
  hooks:
    - id: stash-isolation-guard
      name: stash-isolation guard (D-22)
      entry: bash .pre-commit-hooks/stash-isolation-guard.sh
      language: system
      pass_filenames: false
      stages: [pre-commit]
```

**Pattern for the guard script** — follows `.pre-commit-hooks/no-fourth-namespace.sh` shape (1.4KB shell script). The guard uses `flock` or a per-PID stash file under `.git/mcpgen-stash-$$/` to namespace the stash by process ID, eliminating cross-plan interference.

**Constraint:** D-22 does NOT block launch (per CONTEXT D-22). Ships before W9 to prevent attribution mistakes during W9 hotfix flurry. Carry-forward, not blocker.

---

### 9. MAU monitoring cron (D-13)

**Surface:** Already exists in tree — `apps/api/src/inngest/functions/logto-mau-watch.ts` (97 lines, full impl).

**Phase 10 work:** Provision `LOGTO_ENDPOINT`, `LOGTO_M2M_APP_ID`, `LOGTO_M2M_APP_SECRET`, `RESEND_API_KEY`, `OPS_EMAIL` in production env (D-02 step 6 + step 7). The function IS the pattern.

**Closest analog (the cron shape):** `apps/api/src/inngest/functions/logto-mau-watch.ts:42-96` — daily 04:00 UTC cron, `step.run('read-logto-mau', ...)`, INSERT into `mau_log` with idempotency on `sample_date PRIMARY KEY` (PG error code `23505` second-run no-op), threshold-gated alert. **Phase 10 just turns this on by setting the secrets.**

**`mau_log` table** — `packages/contracts/src/db-schema.ts:344-349`:

```typescript
export const mau_log = pgTable('mau_log', {
  sample_date: date('sample_date').primaryKey(),
  mau_count: integer('mau_count').notNull(),
  alerted: boolean('alerted').notNull().default(false),
  sampled_at: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Constraint:** D-22 from Phase 8 already shipped the migration. Phase 10 adds NO new code here — only secret provisioning + Inngest Cloud signing-key wiring (already noted in `apps/api/src/inngest/client.ts:5` "Phase 10: wires INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for Inngest Cloud").

---

### 10. Status page CNAME (D-09)

**Surface:** No code change. DNS-only configuration: CNAME `status.mcpgen.dev` → BetterStack status page subdomain.

**Closest analog:** `docs/runbooks/resend-domain-setup.md:18-25` — the only existing DNS-touching runbook in tree (Cloudflare DNS-only NOT proxied for SPF/DKIM/DMARC):

```markdown
4. Add records to Cloudflare DNS for `mcpgen.dev` (DNS-only, **NOT** proxied).
5. Wait 1–60 minutes for DNS propagation; click "Verify" in Resend Console.
```

**Pattern to copy — `docs/runbooks/betterstack-status-page.md` (NEW):**

```markdown
# Runbook: BetterStack public status page

**References:**
- 10-CONTEXT.md D-09 (status.mcpgen.dev)
- docs/runbooks/betterstack-setup.md (uptime checks already provisioned)
- docs/runbooks/resend-domain-setup.md (Cloudflare DNS pattern)

## Click-path
1. BetterStack Console → Status pages → Create new
2. Attach the 6 uptime monitors from `docs/runbooks/betterstack-setup.md`
3. Custom domain → `status.mcpgen.dev`
4. BetterStack issues a CNAME target like `xxxx.betteruptime.com`
5. Cloudflare DNS for `mcpgen.dev` → CNAME `status` → `xxxx.betteruptime.com` (DNS-only, NOT proxied)
6. Wait DNS propagation; verify status page resolves
```

**Constraint:** Cloudflare DNS-only for the CNAME (not proxied) — same constraint as Resend SPF/DKIM/DMARC.

---

### 11. Demo video production (D-07 + D-14)

**Surface:** 5 × 60s pre-recorded videos (one per popular API: Stripe, GitHub, Notion, Linear, Slack) for landing/PH/Mintlify/Twitter.

**Closest analog:** **None in tree.** No video assets exist in `apps/web/src/uploads/` (which is the web's static-uploads directory — currently empty per `ls apps/web/src/uploads/`) or anywhere in the repo. `claude-design-ui/` carries the UI mockup ZIP, not video.

**Hosting target:**

1. Mintlify supports MDX `<video>` embedding inline — assets co-located with the doc page.
2. Twitter/X media library handles its own upload.
3. Vercel asset pipeline serves `apps/web/public/*` directly.

**Pattern (recommendation):** Co-locate the videos at `apps/docs/_assets/demos/{stripe,github,notion,linear,slack}.mp4` (where Mintlify can pick them up via relative path) AND at `apps/web/public/demos/*.mp4` (where Vercel serves them statically for the landing page). NO existing structure for either path — net-new directories.

**Constraint:** Friday demo cadence runbook (`docs/runbooks/friday-demo-cadence.md`) already establishes the 5-min EOD cadence — videos can be recorded across W7 demo + W8 polish without slipping cadence. Pre-recording lands Mon-Thu W7-W8, editing only on Friday.

---

### 12. Soft-launch invitee tracking (D-08)

**Surface — code:** `users.first_contact_at` column (single migration + Drizzle schema edit).

**Closest analog (migration shape):** `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (Phase 9 added `deployments.public_badge` via idempotent ADD COLUMN IF NOT EXISTS). Same shape:

```sql
-- infrastructure/neon/migrations/20260501010000_phase10_users_first_contact_at.sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_contact_at" timestamp with time zone;
```

**Closest analog (Drizzle schema edit):** `packages/contracts/src/db-schema.ts:65-73` (current `users` table — D-19 Phase 9 added `deployments.public_badge` at lines 156-161 via the same edit pattern):

```typescript
// CURRENT users table — packages/contracts/src/db-schema.ts:65-73:
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  logto_user_id: text('logto_user_id').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// PHASE 10 D-08 addition:
export const users = pgTable('users', {
  // ... existing columns ...
  // ─── Phase 10 additions (D-08 / D-10) ─────────────────────────
  first_contact_at: timestamp('first_contact_at', { withTimezone: true }), // nullable; set when founder sends 24h follow-up email per D-10
});
```

**Surface — operational:** `docs/launch/soft-launch-invitees.md` (NEW tracking doc — 20 names + status). No code analog; pure markdown table per CONTEXT D-08 cohort breakdown (5 personal / 5 waitlist / 5 MCP-adjacent / 5 API-provider DX leads).

**Surface — `MCPGEN_BETA_USER` flag** (per CONTEXT D-08): Easiest is a column on `users` table OR an entry in `organizations.plan_tier` enum extension. Cheaper: just JOIN against the `soft-launch-invitees.md` email list at analytics-query time (no schema change). Defer the column to v1.1 if uptake reveals need.

**Constraint:** D-08 sticks to a single migration (per CONTEXT D-10 last paragraph: "Track in `users.first_contact_at` column (single migration)"). Do NOT add multiple new columns; defer `MCPGEN_BETA_USER` flag analytics to runtime JOIN.

---

### 13. Public-launch posts (D-07)

**Surface:** 6 markdown files at `docs/launch/posts/{showhn,producthunt,reddit-ml,reddit-llama,x-thread,linkedin}.md`.

**Closest analog:** **None in tree.** No marketing content has shipped before. Net-new content.

**Pattern (none — flag as "no existing pattern, fresh content"):**

- Each file is plain markdown with the post text + meta (audience, channel, schedule).
- Pre-write deadline W8 D5 per CONTEXT D-07 table.
- Founder owns content per D-21 (no autonomous AI agent action on production secrets/deploys during W9).

**Constraint:** D-21 — "every production push or kill-switch decision is human-in-loop". AI agent assistance acceptable for content drafting only.

---

### 14. Phase verification doc (D-19)

**Surface:** `.planning/phases/10-launch/10-PHASE-VERIFICATION.md`.

**Closest analog (canonical template):** `.planning/phases/09-observability-polish/09-PHASE-VERIFICATION.md` (385 lines).

**Pattern to copy — frontmatter shape (lines 1-163):**

```yaml
---
phase: 10-launch
verified: <ISO-8601 timestamp>
status: <draft | human_needed | satisfied>
score: <N/M success criteria fully verified>
overrides_applied: 0
re_verification: null

must_haves:
  truths:
    - "SC #1: ..."
gaps: []
deferred:
  - truth: "..."
    addressed_in: "v1.1"
    evidence: "..."
human_verification:
  - test: "..."
    expected: "..."
    why_human: "..."
requirements:
  GTM-01: { status: SATISFIED, plans: [10-08], evidence: "..." }
  GTM-02: { status: SATISFIED, plans: [10-09], evidence: "..." }
  GTM-03: { status: SATISFIED, plans: [10-10, 10-13], evidence: "..." }
phase_10_carry_forward:
  v1_1_backlog:
    - "..."
threat_mitigations: {}  # Phase 10 is operations, not new threat surface
test_results:
  contracts: "<pass count>"
  apps_api: "..."
  ...
---
```

**Body sections to include** (mirror `09-PHASE-VERIFICATION.md`):

1. Goal Achievement — Observable Truths (per success criterion)
2. Requirements Coverage table
3. Anti-Patterns Found
4. Threat Model Coverage Summary (largely empty for Phase 10)
5. Phase-X+1 Carry-Forward (here: v1.1 backlog per D-19)
6. Inter-Plan Parallel-Execution Observations
7. Human Verification Required (founder runbook actions executed)
8. Gaps Summary

**Constraint:** GSD framework requires phase verification doc as the natural "next milestone planning" trigger (CONTEXT D-19). v1.1 backlog priorities derive from beta feedback + D-15 deferrals (the 12-item Out-of-Scope contract).

---

## Shared Patterns

### Runbook header shape (applied to ALL new runbooks)

**Source:** `docs/runbooks/multi-client-smoke.md:1-30` and `docs/runbooks/resend-domain-setup.md:1-22`.

```markdown
# Runbook: <Title>

**References:**
- 10-CONTEXT.md D-XX (<decision>)
- <related runbooks>
- <code consumers>

## When to use / Status
<one paragraph>

## Pre-requisites
1. ...

## Click-path
1. ...
2. ...

## Sign-off
- [ ] <evidence — screenshot / .env entry / table row>
```

**Apply to:** ALL 9 new Wave-1/Wave-2/Wave-3 runbooks (cloud-secrets-provisioning, cf-deploy, vercel-deploy, fly-deploy, betterstack-status-page, cost-alerts-setup, pre-launch-checklist, incident-runbook-top5, backup-verification).

---

### Inngest cron function shape (applied to any new daily cron)

**Source:** `apps/api/src/inngest/functions/logto-mau-watch.ts` (full file, 97 lines) — daily cron, `step.run` segments, idempotent INSERT with PG `23505` recovery, threshold-gated alert email via `resend-client`.

```typescript
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';
import { inngest } from '../client.js';

export const myDailyCron = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.MY_FUNCTION_V1,  // MUST be in INNGEST_FUNCTION_IDS register
    triggers: [{ cron: '0 4 * * *' }],         // Phase 9 orphan audit fails if ID is hardcoded
  },
  async ({ step }) => {
    const value = await step.run('read-x', async () => { /* ... */ });
    await step.run('persist-y', async () => { /* idempotent INSERT */ });
    if (alertCondition) {
      await step.run('send-alert', async () => { /* resend-client */ });
    }
    return { value, alerted: alertCondition };
  },
);
```

**Apply to:** any net-new daily cron in Phase 10 (currently none planned — D-13 reuses existing `logtoMauWatch`). If Phase 10 adds a "first-100-user-cs-followup" cron, this is the shape; alternative is a Web route handler triggered by a Vercel cron config.

---

### Visual lock (applied to ALL `apps/web/` edits)

**Source:** `.pre-commit-hooks/check-ui-locked.sh` (referenced in `.pre-commit-config.yaml:101-106`).

**Locked paths (CANNOT edit):**
- `apps/web/src/styles/*`
- `apps/web/src/components/ui/*`

**Free paths (CAN edit for content):**
- `apps/web/src/app/(legal)/{privacy,terms,pricing}/page.tsx` (route content)
- `apps/web/src/app/api/**` (Route Handlers; Phase 9 added 4 BFF carry-forward)
- `apps/web/src/lib/*` (logic helpers; Phase 9 added `lib/sentry/redact.ts`)
- `apps/web/public/*` (static assets — demo videos go here)

**Apply to:** Wave 2 legal pages (D-05 — privacy/terms/pricing), Wave 3 demo video assets (`apps/web/public/demos/*.mp4`).

---

### Contract lock (applied to ALL pricing-related code)

**Source:** `packages/contracts/src/launch-criteria.ts:34-46` + three-layer defense at lines 7-32.

**Three-layer enforcement:**
1. Pre-commit hook `launch-criteria-guard` (`.pre-commit-config.yaml:75-79`) — requires paired `docs/decisions/<YYYY-MM-DD>-<slug>.md`.
2. CI step `launch-criteria-assertion` (`.github/workflows/main-ci.yml:219-239`) — `grep -qF` text-level invariant.
3. `as const` literal types — TS infers narrow types preventing accidental mutation at consumers.

**Apply to:** Wave 2 pricing page (D-05 — `LAUNCH_CRITERIA.COST_CAP_FREE_USD` and `COST_CAP_PRO_USD` referenced verbatim from the constants file, NOT hardcoded).

**Closes:** Pitfall #29 (AI lowering thresholds in copy ≠ code).

---

### Migration shape (applied to any DDL edit)

**Source:** `infrastructure/neon/migrations/20260430000000_phase9_badge_public.sql` (Phase 9 lineage). Idempotent `ADD COLUMN IF NOT EXISTS`, FROZEN-prefix timestamp filename, paired Drizzle schema edit, snapshot + journal updated by `pnpm --filter @mcpgen/contracts drizzle-kit:generate`.

**Apply to:** Wave 1 matview refresh migration (D-06 item 2), Wave 3 `users.first_contact_at` migration (D-08 + D-10).

**Constraint:** NEVER edit a committed migration file in place. Always new timestamp-prefix migration. Pre-commit hook `ir-codegen-check` (`.pre-commit-config.yaml:93-98`) does NOT cover this — but `apps/api drizzle-kit:check` step at `.github/workflows/main-ci.yml:173` catches schema/migration drift via Drizzle's snapshot prevId chain.

---

## No Analog Found (net-new — flag for planner)

| File | Role | Reason |
|---|---|---|
| `docs/launch/posts/{showhn,producthunt,reddit-ml,reddit-llama,x-thread,linkedin}.md` (× 6) | content (markdown) | First marketing posts; no prior pattern in tree |
| `docs/launch/soft-launch-invitees.md` | tracking doc | First operational tracking doc; format is just markdown table |
| `apps/web/public/demos/{stripe,github,notion,linear,slack}.mp4` (× 5) | static asset (video) | No video assets in tree before |
| `apps/docs/_assets/demos/*.mp4` (× 5) | static asset (video) | Same as above; co-located for Mintlify embedding |

For these surfaces the planner uses RESEARCH.md content guidelines + GTM principles from CLAUDE.md §10 ("60-second hero flow", "Show, don't tell", "Trust through transparency") rather than a code analog.

---

## Metadata

**Analog search scope:** `apps/`, `packages/contracts/src/`, `infrastructure/neon/migrations/`, `infrastructure/cloudflare/`, `.github/workflows/`, `.pre-commit-config.yaml`, `.pre-commit-hooks/`, `docs/runbooks/`, `docs/decisions/`, `apps/api/src/inngest/`, `apps/generation-engine/src/mcpgen_engine/observability/`, `apps/generation-engine/src/mcpgen_engine/passes/`, `.planning/phases/01-foundation/01-PATTERNS.md`, `.planning/phases/09-observability-polish/09-PATTERNS.md`, `.planning/phases/09-observability-polish/09-PHASE-VERIFICATION.md`.

**Files scanned:** ~60 (sampled — exhaustive list in CONTEXT D-XX cross-references).

**Pattern extraction date:** 2026-04-30

**Cross-locks surfaced (planner must respect):**
1. **Visual lock** — `apps/web/src/{styles,components/ui}/*` blocked by `.pre-commit-hooks/check-ui-locked.sh`
2. **Contract lock** — `packages/contracts/src/launch-criteria.ts` blocked by `.pre-commit-hooks/launch-criteria-paired-decision.sh` + CI grep assertion
3. **CF namespace cap** — exactly 3 dispatch namespaces blocked by `.pre-commit-hooks/no-fourth-namespace.sh`
4. **Out-of-Scope contract (D-15)** — 12 items rejected on sight during W7-W9
5. **Founder-only launch authority (D-21)** — no autonomous agent action on production secrets/deploys during W9
