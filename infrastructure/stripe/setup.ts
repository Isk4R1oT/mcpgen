// infrastructure/stripe/setup.ts
//
// REFERENCE ONLY — idempotent Stripe setup for products / prices / meters.
// Committed to repo + run manually by user (NEVER in CI; Wave 3 prerequisite per D-10).
//
// Run with: `bun run infrastructure/stripe/setup.ts` (or `pnpm tsx ...`).
//
// What this script does (idempotent — safe to re-run):
//   1. Reads STRIPE_SECRET_KEY from process.env.
//   2. ensureProduct calls stripe.products.retrieve('prod_mcpgen_pro') by stable ID;
//      creates with the same id if missing.
//   3. ensureProduct calls stripe.products.retrieve('prod_mcpgen_free'); creates if missing.
//   4. Creates Stripe Meters (mcpgen_evals, mcpgen_tool_calls, mcpgen_generations) if missing.
//   5. Prints created IDs to stdout for user to copy into .env.local.
//      NEVER prints secrets.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-07
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-07 (full impl)
//   - https://docs.stripe.com/billing/subscriptions
//   - https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage

import Stripe from 'stripe';

interface SetupEnv {
  readonly stripeSecretKey: string;
}

function readEnv(): SetupEnv {
  const value = process.env['STRIPE_SECRET_KEY'];
  if (!value) {
    throw new Error('STRIPE_SECRET_KEY must be set in .env.local');
  }
  return { stripeSecretKey: value };
}

async function ensureProduct(
  stripe: Stripe,
  id: string,
  name: string,
  description: string,
  metadata: Record<string, string>,
): Promise<Stripe.Product> {
  try {
    return await stripe.products.retrieve(id);
  } catch (err) {
    if ((err as { code?: string }).code === 'resource_missing') {
      return stripe.products.create({ id, name, description, metadata });
    }
    throw err;
  }
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  amountCents: number,
  currency: string,
  interval: 'month' | 'year',
  lookupKey: string,
): Promise<Stripe.Price> {
  // Stripe prices are immutable; look up by `lookup_keys` to dedupe across runs.
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0 && existing.data[0]) {
    return existing.data[0];
  }
  return stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency,
    recurring: { interval },
    lookup_key: lookupKey,
  });
}

async function ensureMeter(
  stripe: Stripe,
  eventName: string,
  displayName: string,
): Promise<Stripe.Billing.Meter> {
  // Idempotency: list existing meters, match by event_name.
  const meters = await stripe.billing.meters.list({ status: 'active', limit: 100 });
  const existing = meters.data.find((m) => m.event_name === eventName);
  if (existing) {
    return existing;
  }
  return stripe.billing.meters.create({
    display_name: displayName,
    event_name: eventName,
    default_aggregation: { formula: 'count' },
    customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    value_settings: { event_payload_key: 'value' },
  });
}

async function main(): Promise<void> {
  const env = readEnv();
  const stripe = new Stripe(env.stripeSecretKey);

  const free = await ensureProduct(
    stripe,
    'prod_mcpgen_free',
    'MCPGen Free',
    'Free plan: 1 F3 eval/mo + cost cap $0.50/generation',
    { tier: 'free' },
  );
  const pro = await ensureProduct(
    stripe,
    'prod_mcpgen_pro',
    'MCPGen Pro',
    'Pro plan: 5 F3 evals/mo + cost cap $2.00/generation',
    { tier: 'pro' },
  );
  const proPrice = await ensurePrice(stripe, pro.id, 6000, 'usd', 'month', 'mcpgen_pro_monthly_v1');

  const meterEvals = await ensureMeter(stripe, 'mcpgen_evals', 'MCPGen F3 Evals');
  const meterToolCalls = await ensureMeter(stripe, 'mcpgen_tool_calls', 'MCPGen Tool Calls');
  const meterGenerations = await ensureMeter(stripe, 'mcpgen_generations', 'MCPGen Generations');

  // Print IDs for .env.local — NEVER print secrets.
  console.log('# Add to .env.local:');
  console.log(`STRIPE_PRODUCT_FREE=${free.id}`);
  console.log(`STRIPE_PRODUCT_PRO=${pro.id}`);
  console.log(`STRIPE_PRICE_PRO=${proPrice.id}`);
  console.log(`STRIPE_METER_EVALS_ID=${meterEvals.id}`);
  console.log(`STRIPE_METER_TOOL_CALLS_ID=${meterToolCalls.id}`);
  console.log(`STRIPE_METER_GENERATIONS_ID=${meterGenerations.id}`);
}

// Top-level await would force `--module=node18`; an explicit IIFE keeps the
// script compatible with the workspace's `module: ESNext` + `moduleResolution: Bundler` config.
void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
