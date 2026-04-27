# infrastructure/stripe/

## Status (Phase 8 Wave 2)

User has NOT yet configured Stripe. The setup script `setup.ts` exists as canonical
procedure for re-creation. Wave 3+ requires:

1. Stripe account (sandbox = `sk_test_...`)
2. Run `bun run infrastructure/stripe/setup.ts` once with `STRIPE_SECRET_KEY` in env
3. Paste output into `.env.local`

The script is **reference-only** — committed as a typecheck-clean canonical procedure
mirroring `infrastructure/logto/scaffold.ts`. NEVER run in CI; NEVER bake secrets into
the script. The Phase-8 Wave-1–2 test suite runs entirely against a hoisted
`vi.mock('stripe', ...)` (see `apps/api/tests/_mocks/stripe.ts`) — no real keys needed.

## Env-var contract

| Var | Source | Used by |
|-----|--------|---------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (sandbox `sk_test_...` or live `sk_live_...`) | `apps/api` Stripe SDK; `setup.ts` |
| `STRIPE_WEBHOOK_SECRET` | Output of `stripe listen --forward-to ...` (`whsec_...`) — local-dev value differs from prod Dashboard secret | `apps/api/src/routes/v1/stripe-webhook.ts` |
| `STRIPE_PRODUCT_FREE`, `STRIPE_PRODUCT_PRO` | Output of `setup.ts` | `infrastructure/stripe/setup.ts` (re-run idempotency check) |
| `STRIPE_PRICE_PRO` | Output of `setup.ts` | `apps/api/src/routes/v1/billing/checkout.ts` (Wave 3) |
| `STRIPE_METER_EVALS_ID`, `STRIPE_METER_TOOL_CALLS_ID`, `STRIPE_METER_GENERATIONS_ID` | Output of `setup.ts` | `apps/api/src/inngest/functions/stripe-meters-emit.ts` (Wave 2 + Wave 3) |

## Reachability check

```bash
set -a && source .env.local && set +a
curl -s -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/products?limit=1 | jq '.data[0].id // "no products yet"'
# Expected output: "prod_mcpgen_free" or "prod_mcpgen_pro" (after setup.ts run); else "no products yet"
```

## Wave-staged transition (D-10)

- **Wave 1–2 (this Wave):** all tests use hoisted `vi.mock('stripe', ...)`. NO real API calls. CI runs without Stripe credentials.
- **Wave 3+:** user adds `STRIPE_SECRET_KEY=sk_test_...` + `STRIPE_WEBHOOK_SECRET=whsec_...` to `.env.local`; runs `bun run infrastructure/stripe/setup.ts`; runs `stripe listen --forward-to ...` in second terminal during dev.
- **CI:** Wave 3+ integration tests gated by `RUN_STRIPE_INTEGRATION_TESTS=1`.

## Local-dev workflow

```bash
brew install stripe/stripe-cli/stripe          # one-time
stripe login                                    # browser handshake
stripe listen --forward-to http://localhost:8787/api/v1/stripe/webhook
# Capture: > Ready! Your webhook signing secret is whsec_xxx
# Add to .env.local: STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Trigger test events:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```
