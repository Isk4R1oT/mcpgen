// packages/contracts/src/idempotency.ts
//
// FND-14 / D-11: Idempotency keys at all 4 surfaces use a `${operation}_${ulid}`
// shape (with one exception — Stripe Meters dedup uses a composite key shape).
// The operation prefix makes cross-surface collisions impossible.
//
// 4 surfaces:
//   1. BFF `Idempotency-Key` header        →  gen_${ULID}
//   2. Inngest job dedup key (same as BFF) →  gen_${ULID}
//   3. Stripe Meters event dedup key       →  ${deployment_id}_${minute_bucket}_${tool_name}
//   4. CF dispatch tenant Worker name      →  deploy_${UUID}
//
// References:
//   - .planning/phases/01-foundation/01-CONTEXT.md D-11 (idempotency-key shape)
//   - .planning/phases/01-foundation/01-PATTERNS.md "Idempotency-key shape"
//   - docs/mcpgen-architecture.md §10.2 (Stripe Meters dedup window: 24h)

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Header conventions (BFF API surface)
// ─────────────────────────────────────────────────────────────────────────────
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key' as const;
export const LAST_EVENT_ID_HEADER = 'Last-Event-ID' as const; // D-09 SSE resume

// ─────────────────────────────────────────────────────────────────────────────
// ULID — 26 characters, Crockford's base32 alphabet (no I, L, O, U).
// Reference: https://github.com/ulid/spec
// ─────────────────────────────────────────────────────────────────────────────
export const ULID_INNER_REGEX = '[0-9A-HJKMNP-TV-Z]{26}';
export const ULID_REGEX = new RegExp(`^${ULID_INNER_REGEX}$`);

// ─────────────────────────────────────────────────────────────────────────────
// Per-surface key regexes
// ─────────────────────────────────────────────────────────────────────────────
// Surface 1+2: BFF `Idempotency-Key` header & Inngest job dedup key
export const GEN_ID_REGEX = new RegExp(`^gen_${ULID_INNER_REGEX}$`);

// Surface 4: CF dispatch tenant Worker name = `deploy_${uuid}`. UUIDs are 36
// chars hex+hyphen — we accept any RFC 4122 v1–v8 because Cloudflare doesn't
// constrain the variant byte.
export const DEPLOY_ID_REGEX =
  /^deploy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Surface 3: Stripe Meters dedup key. Composite shape per D-11:
//   `${deployment_id}_${minute_bucket_iso}_${tool_name}`
//   - deployment_id: UUID (36 chars hex+hyphen)
//   - minute_bucket_iso: `YYYY-MM-DDTHH:MM` (16 chars; minute granularity bucket)
//   - tool_name: matches FinalTool.name regex
export const STRIPE_METERS_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_[a-z][a-z0-9_]{0,63}$/;

// Tool name regex — single source of truth across the contracts package.
// MUST match FinalTool.name regex in @mcpgen/ir/src/types.ts (TOOL_NAME_REGEX).
// Tested by tests/usage-event.test.ts via reflection on the IR Zod schema.
export const TOOL_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas (consume the regexes above)
// ─────────────────────────────────────────────────────────────────────────────
export const UlidSchema = z.string().regex(ULID_REGEX);
export type Ulid = z.infer<typeof UlidSchema>;

export const GenIdSchema = z.string().regex(GEN_ID_REGEX);
export type GenId = z.infer<typeof GenIdSchema>;

export const DeployIdSchema = z.string().regex(DEPLOY_ID_REGEX);
export type DeployId = z.infer<typeof DeployIdSchema>;

export const StripeMetersKeySchema = z.string().regex(STRIPE_METERS_KEY_REGEX);
export type StripeMetersKey = z.infer<typeof StripeMetersKeySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validators (cheap booleans for hot paths — Workers, runtime SDKs)
// ─────────────────────────────────────────────────────────────────────────────
export function validateIdempotencyKey(key: string): boolean {
  return GEN_ID_REGEX.test(key);
}

export function validateStripeMetersKey(key: string): boolean {
  return STRIPE_METERS_KEY_REGEX.test(key);
}

export function validateCfWorkerName(name: string): boolean {
  return DEPLOY_ID_REGEX.test(name);
}

export function validateUlid(s: string): boolean {
  return ULID_REGEX.test(s);
}
