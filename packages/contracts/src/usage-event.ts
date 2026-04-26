// packages/contracts/src/usage-event.ts
//
// Frozen contract #3: usage event shape.
//
// Emitted by every tenant Worker per upstream call. Flows through:
//   tenant Worker -> CF Queue -> Inngest consumer -> TimescaleDB hypertable
//                                                 -> Stripe Meters POST
//
// Single source of truth: every emit-site, every Queue consumer, every Timescale
// insert, and every Stripe Meters POST MUST validate against this Zod schema.
// Drift here breaks billing.
//
// References:
//   - docs/mcpgen-architecture.md §7.2 (TimescaleDB hypertable column shape)
//   - docs/mcpgen-architecture.md §10.2 (Stripe Meters dimensions)
//   - docs/mcpgen-architecture.md §6 (tenant Worker emit semantics)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-11 (idempotency-key shape)
//   - .planning/phases/01-foundation/01-PATTERNS.md "usage-event.ts"

import { z } from 'zod';

import { STRIPE_METERS_KEY_REGEX, TOOL_NAME_REGEX } from './idempotency.js';

// ─────────────────────────────────────────────────────────────────────────────
// UsageEvent — the canonical row shape (mirrors usage_events Timescale columns)
// ─────────────────────────────────────────────────────────────────────────────
export const UsageEventStatus = z.enum(['ok', 'error', 'rate_limited']);
export type UsageEventStatus = z.infer<typeof UsageEventStatus>;

export const UsageEventClientType = z.enum(['claude_desktop', 'cursor', 'cline', 'custom']);
export type UsageEventClientType = z.infer<typeof UsageEventClientType>;

export const UsageEvent = z.object({
  // Stripe Meters dedup key (rolling 24h window).
  // Shape: ${deployment_id}_${minute_bucket_iso}_${tool_name}
  // Single source of truth: ./idempotency.ts STRIPE_METERS_KEY_REGEX.
  idempotency_key: z.string().regex(STRIPE_METERS_KEY_REGEX),
  time: z.string().datetime(),
  deployment_id: z.string().uuid(),
  // tool_name MUST match FinalTool.name regex (TOOL_NAME_REGEX). Asserted by
  // tests/usage-event.test.ts via reflection on the IR Zod schema.
  tool_name: z.string().regex(TOOL_NAME_REGEX),
  tokens_in: z.number().int().nonnegative().nullable(),
  tokens_out: z.number().int().nonnegative().nullable(),
  upstream_latency_ms: z.number().int().nonnegative().nullable(),
  worker_cpu_ms: z.number().int().nonnegative().nullable(),
  status: UsageEventStatus,
  client_type: UsageEventClientType.nullable(),
  error_class: z.string().nullable(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;

// ─────────────────────────────────────────────────────────────────────────────
// Queue payload — wraps UsageEvent on the CF Queue -> Inngest leg.
// ─────────────────────────────────────────────────────────────────────────────
export const UsageEventQueuePayload = z.object({
  event: UsageEvent,
  attempt: z.number().int().nonnegative(),
  enqueued_at: z.string().datetime(),
});
export type UsageEventQueuePayload = z.infer<typeof UsageEventQueuePayload>;

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Meters dimensions (per architecture §10.2). The dedup key is `idempotency_key`.
// Each dimension corresponds to a separately-billable Stripe Meter.
// ─────────────────────────────────────────────────────────────────────────────
export const StripeMetersDimension = z.enum([
  'tool_calls',
  'tokens_in',
  'tokens_out',
  'upstream_latency_ms',
  'worker_cpu_ms',
]);
export type StripeMetersDimension = z.infer<typeof StripeMetersDimension>;
