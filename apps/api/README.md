# @mcpgen/api — Hono BFF (control plane)

## Local-dev port map

| Process | Port | Command |
|---------|------|---------|
| Hono BFF (this app) | 8787 | `bun run apps/api/src/index.ts` |
| Inngest dev server  | 8288 | `pnpm --filter @mcpgen/api dev:inngest` |
| stripe-cli forward (Wave 3+) | n/a | `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook` |

## Three-terminal startup (Phase 8 Wave 3+)

```bash
# Terminal 1 — BFF
bun run apps/api/src/index.ts            # localhost:8787

# Terminal 2 — Inngest dev server (auto-discovers functions registered at /api/inngest)
pnpm --filter @mcpgen/api dev:inngest    # localhost:8288

# Terminal 3 (Wave 3+) — Stripe CLI
stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
# Capture: > Ready! Your webhook signing secret is whsec_xxx
# Add to .env.local: STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## Env-var contract

| Var | Phase | Source | Purpose |
|-----|-------|--------|---------|
| `DATABASE_URL` (pooled) | Phase 1 | Neon Console → Pooled connection | BFF + Inngest functions (per RESEARCH §20 Q5) |
| `DATABASE_URL_UNPOOLED` | Phase 1 | Neon Console → Direct connection | Drizzle migrations only |
| `LOGTO_ENDPOINT` | Phase 1 | infrastructure/logto/README.md | Logto JWKS endpoint |
| `LOGTO_BASE_URL` | Phase 1 | infrastructure/logto/README.md | Web app audience for user JWTs |
| `LOGTO_APP_ID` / `LOGTO_APP_SECRET` | Phase 1 | infrastructure/logto/README.md | User-app credentials |
| `LOGTO_M2M_APP_ID` | **Phase 8** | Logto Console → Applications → MCPGen Engine M2M | M2M token issuance |
| `LOGTO_M2M_APP_SECRET` | **Phase 8** | Same dialog. NEVER commit. | M2M token issuance |
| `LOGTO_M2M_RESOURCE_INDICATOR` | **Phase 8** | Logto Console → API Resources | M2M audience |
| `STRIPE_SECRET_KEY` | **Wave 3+** | Stripe Dashboard → Developers → API keys (sandbox) | Stripe SDK |
| `STRIPE_WEBHOOK_SECRET` | **Wave 3+** | Output of `stripe listen` (whsec_xxx) | Webhook signature verify |
| `STRIPE_PRICE_PRO`, `STRIPE_METER_*_ID` | **Wave 3+** | Output of `bun run infrastructure/stripe/setup.ts` | Setup-script output |
| `RESEND_API_KEY` | **Wave 4+** | Resend Console → API Keys | Drift / reconciliation / MAU emails |
| `OPS_EMAIL` | **Wave 4+** | Founder personal email | Recipient for reconciliation + MAU alerts |
| `ENGINE_ENDPOINT` | **Wave 3+** | Default `http://localhost:8000` | BFF → engine M2M calls |
| `SENTRY_DSN` | Phase 9 | Sentry Console | Error tracking (empty in Phases 1–8) |

## DATABASE_URL vs DATABASE_URL_UNPOOLED (RESEARCH §20 Q5)

- All Phase 8 BFF + Inngest queries use `DATABASE_URL` (pooled — Neon's PgBouncer handles ~5K concurrent connections).
- Migrations + `db:test-migrate` use `DATABASE_URL_UNPOOLED` (direct connection; Drizzle DDL prefers it per Phase 1 PHASE-DEVIATIONS rev 2).

## Tests

```bash
pnpm --filter @mcpgen/api test                # all tests
pnpm --filter @mcpgen/api test auth           # auth middleware
pnpm --filter @mcpgen/api test storage        # LocalFsStorageAdapter
RUN_STRIPE_INTEGRATION_TESTS=1 pnpm --filter @mcpgen/api test stripe-webhook   # Wave 3+, real Stripe sandbox
```

## Wave 3 prerequisites (Stripe sandbox)

Wave 3 requires real Stripe sandbox credentials. Before running Wave 3 tests:

1. Sign up for a Stripe sandbox account (https://dashboard.stripe.com — toggle
   "View test data").
2. `brew install stripe/stripe-cli/stripe && stripe login`.
3. Add to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
4. Run `bun run infrastructure/stripe/setup.ts` ONCE to create products + prices
   + meters; paste output into `.env.local`:
   ```
   STRIPE_PRODUCT_FREE=prod_...
   STRIPE_PRODUCT_PRO=prod_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_METER_EVALS_ID=mtr_...
   STRIPE_METER_TOOL_CALLS_ID=mtr_...
   STRIPE_METER_GENERATIONS_ID=mtr_...
   ```
5. In Terminal 3, run
   `stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook`.
   Capture the `whsec_...` and add to `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

See [`infrastructure/stripe/README.md`](../../infrastructure/stripe/README.md)
for the full env-var contract.

## Verifying Wave 3 webhook flow

Trigger a test event from a fourth terminal:

```bash
stripe trigger customer.subscription.created
```

Expected: BFF logs show webhook hit;
```bash
psql "$DATABASE_URL_UNPOOLED" -c \
  "SELECT id, event_type, status FROM subscription_events ORDER BY received_at DESC LIMIT 5;"
```
shows the event with `status='processed'` (or `status='received'` for
synthetic events without `metadata.org_id`).

Replay the same event:
```bash
stripe events resend evt_...
```
Expected: BFF responds 200 with `{received: true, duplicate: true}`. No new
row in `subscription_events`.

## Wave 3 cost-cap smoke test (synthetic)

Without engine running, you can still smoke-test the cost-cap-enforcer by
sending a synthetic Inngest event to the dev server:

```bash
curl -X POST http://localhost:8288/e/synthetic-cost-update \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "generation/cost.updated",
    "data": {
      "jobId": "gen_synth_1",
      "passName": "pass_1",
      "cumulativeCostUsd": 0.75
    }
  }'
```

Expected: cost-cap-enforcer fires (`cumulativeCostUsd 0.75 > Free cap 0.50`);
attempts to call `${ENGINE_ENDPOINT}/internal/v1/cancel-generation` (will fail
with engine-not-running error — expected); generation row marked
`status='cost_capped'`; `usage_events_outbox` gets a `generation_cost_capped`
row keyed on `${jobId}_cost_capped`.

For end-to-end: also start the engine (Phase 5) and have it stream a synthetic
SSE callback (cost-update partial-result) to
`POST http://localhost:8787/internal/v1/sse-callback` with an M2M Bearer token.

## Wave 5 — End-to-end acceptance (Phase 8 closure)

The Wave 5 E2E test (`apps/api/tests/e2e/billing-flow.test.ts`) exercises the
full billing flow against the real Stripe sandbox + the real Neon dev branch
+ the real Logto user pool. Two runtime modes selected via `PHASE_6_AVAILABLE`:

| Mode | When | What |
|------|------|------|
| `PHASE_6_AVAILABLE=0` (default) | Pre-Phase-6 ship | Synthetic outbox seeded by `apps/api/scripts/seed-synthetic-usage.ts` (`seedSyntheticOutbox` named export); verifies BFF half end-to-end |
| `PHASE_6_AVAILABLE=1` | Post-Phase-6 ship | Real dispatch + tenant Worker writes to `usage_events_outbox`; verifies the full pipeline |

### Inngest dev-server admin endpoint (W4)

Step 5 of the E2E test invokes `stripe-meters-emit-v1` via an explicit POST
to the Inngest dev-server admin endpoint
`POST http://localhost:8288/v1/runs` (replaces a long blocking
`setTimeout` that previously waited for the next 1-minute cron tick). If the
admin endpoint is not available in your Inngest CLI version, the test falls
back to sending a manual-trigger event via
`POST http://localhost:8288/e/test-key`.

### Run command (4 terminals)

```bash
# Terminal 1 — BFF
bun run apps/api/src/index.ts                                   # localhost:8787

# Terminal 2 — Inngest dev server (auto-discovers /api/inngest)
npx inngest-cli@latest dev -u http://localhost:8787/api/inngest # localhost:8288

# Terminal 3 — stripe-cli forwarder (Wave 3 prerequisite)
stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook

# Terminal 4 — run the E2E suite
RUN_E2E_BILLING_TESTS=1 \
PHASE_6_AVAILABLE=0 \
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET \
STRIPE_PRICE_PRO=$STRIPE_PRICE_PRO \
RESEND_API_KEY=$RESEND_API_KEY \
OPS_EMAIL=$OPS_EMAIL \
LOGTO_ENDPOINT=$LOGTO_ENDPOINT \
LOGTO_BASE_URL=$LOGTO_BASE_URL \
LOGTO_M2M_RESOURCE_INDICATOR=$LOGTO_M2M_RESOURCE_INDICATOR \
E2E_USER_JWT=$E2E_USER_JWT \
pnpm --filter @mcpgen/api test e2e/billing-flow
```

### Expected outcomes

- All 6 steps PASS when env vars are valid + 4 terminals are running.
- Step 3 (POST /api/v1/generate) may return 501 if the generate endpoint is
  still a Phase-1 stub — recorded as a Phase-8-known-gap, not a regression.
  See [`.planning/phases/08-auth-billing/08-PHASE-DEVIATIONS.md`](../../.planning/phases/08-auth-billing/08-PHASE-DEVIATIONS.md)
  Deviation 2.
- Without `RUN_E2E_BILLING_TESTS=1`, the test silently SKIPs (CI default).
- `STRIPE_CLI_AVAILABLE=0` forces the helper to synthesize a signed webhook
  POST instead of shelling out to `stripe trigger`; the BFF webhook handler
  must be reachable on `http://localhost:8787` (or override via
  `E2E_WEBHOOK_URL`).

### Post-Phase-6 re-verification

Once the runtime workstream Phase 6 ships, ops workstream re-runs:

```bash
RUN_E2E_BILLING_TESTS=1 PHASE_6_AVAILABLE=1 pnpm --filter @mcpgen/api test e2e/billing-flow
```

All 6 steps must PASS with the real-dispatch path. Phase 8 acceptance is
then fully closed (the deferred-gate checkbox in `08-SUMMARY.md` flips to
`[x]`).
