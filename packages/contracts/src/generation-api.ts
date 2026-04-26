// packages/contracts/src/generation-api.ts
//
// Frozen contract #2: Generation API + SSE event envelope.
//
// HTTP shape: `POST /api/v1/generate` returns `202 Accepted` with a `job_id` and
// `sse_url`. The client opens an SSE connection to `sse_url` and receives a
// stream of `GenerationSseEvent` payloads tagged by `stage` (one of A/B/C/D/E
// /F1/F2/F3/completed/failed).
//
// SSE resume semantics (D-09 / D-10 / Pitfall #20):
//   - Every event carries a monotonic 26-char ULID `event_id` per generation.
//   - Clients send `Last-Event-ID` on reconnect to resume from the last seen event.
//   - On callback delivery failure (engine -> BFF), the engine writes events to
//     the `pending_callbacks` table (Plan 04 schema). The BFF replays missed
//     events on reconnect by reading rows where `event_id > Last-Event-ID`.
//   - Hono `streamSSE` on CF Workers has a 30-second sub-request limit
//     (BLOCKER in STATE.md); the BFF re-uses pending_callbacks to serve as the
//     authoritative event log so clients can re-attach repeatedly without loss.
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (HTTP API contract + SSE callback shape)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-09 (SSE resume) + D-10 (event_id ULID)
//   - .planning/phases/01-foundation/01-PATTERNS.md "SSE envelope pattern"

import { z } from 'zod';

import {
  GEN_ID_REGEX,
  GenIdSchema,
  IDEMPOTENCY_KEY_HEADER,
  LAST_EVENT_ID_HEADER,
  ULID_REGEX,
  UlidSchema,
  validateIdempotencyKey,
} from './idempotency.js';

// Re-export header conventions so consumers import from one place.
export { IDEMPOTENCY_KEY_HEADER, LAST_EVENT_ID_HEADER };

// ─────────────────────────────────────────────────────────────────────────────
// SSE event envelope (engine -> BFF -> client)
// ─────────────────────────────────────────────────────────────────────────────
export const GenerationStage = z.enum([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F1',
  'F2',
  'F3',
  'completed',
  'failed',
]);
export type GenerationStage = z.infer<typeof GenerationStage>;

export const GenerationSseError = z.object({
  code: z.string(),
  message: z.string(),
  retry_after_seconds: z.number().int().nonnegative().optional(),
});
export type GenerationSseError = z.infer<typeof GenerationSseError>;

export const GenerationSseEvent = z.object({
  job_id: z.string().regex(GEN_ID_REGEX),
  event_id: z.string().regex(ULID_REGEX), // 26-char ULID, monotonic per job_id
  stage: GenerationStage,
  status: z.enum(['started', 'completed', 'error']),
  partial_result: z.record(z.string(), z.unknown()).optional(),
  error: GenerationSseError.optional(),
});
export type GenerationSseEvent = z.infer<typeof GenerationSseEvent>;

// Tagged variant for the engine -> BFF callback POST (CF Workers) — server-side
// only; clients see the same event without the direction tag.
export const EngineCallbackEnvelope = z.object({
  direction: z.literal('engine_to_bff'),
  event: GenerationSseEvent,
});
export type EngineCallbackEnvelope = z.infer<typeof EngineCallbackEnvelope>;

// ─────────────────────────────────────────────────────────────────────────────
// `POST /api/v1/generate` request/response
// ─────────────────────────────────────────────────────────────────────────────
export const TargetComplexity = z.enum(['minimal', 'standard', 'comprehensive']);
export type TargetComplexity = z.infer<typeof TargetComplexity>;

export const GenerationOptions = z.object({
  target_complexity: TargetComplexity.default('standard'),
  // `explicit_includes` per Pass 0 design User Override Flow (re-include
  // dropped endpoints that have `can_user_override=true`).
  explicit_includes: z.array(z.string()).optional(),
  // Pro override: lift Pass 0 cap from 50 to 100 tools (D-08 / Pass 0 §"User Override Flow").
  max_tools_override: z.number().int().min(50).max(100).optional(),
});
export type GenerationOptions = z.infer<typeof GenerationOptions>;

export const GenerationApiRequest = z
  .object({
    spec_url: z.string().url().optional(),
    spec_content: z.string().optional(),
    options: GenerationOptions.optional(),
  })
  .refine(
    (req) => Boolean(req.spec_url) !== Boolean(req.spec_content),
    'Exactly one of spec_url or spec_content must be provided.',
  );
export type GenerationApiRequest = z.infer<typeof GenerationApiRequest>;

export const GenerationApiResponse = z.object({
  job_id: GenIdSchema,
  sse_url: z.string().url(),
});
export type GenerationApiResponse = z.infer<typeof GenerationApiResponse>;

// Header-value Zod (validates an inbound `Idempotency-Key` header). The 4
// surfaces share the same ULID alphabet but differ on prefix; here we only
// accept the BFF prefix `gen_`.
export const IdempotencyKeyHeaderValue = z.string().regex(GEN_ID_REGEX);
export type IdempotencyKeyHeaderValue = z.infer<typeof IdempotencyKeyHeaderValue>;

// ─────────────────────────────────────────────────────────────────────────────
// Error code enum (returned in `error.code` field of GenerationSseEvent +
// HTTP 4xx response bodies). Stable across versions.
// ─────────────────────────────────────────────────────────────────────────────
export const GenerationErrorCode = z.enum([
  'invalid_spec',
  'spec_too_large',
  'spec_endpoint_count_too_large',
  'rate_limited',
  'cost_cap_exceeded',
  'idempotency_key_replay',
  'internal_error',
]);
export type GenerationErrorCode = z.infer<typeof GenerationErrorCode>;

// ─────────────────────────────────────────────────────────────────────────────
// Convenience re-exports for consumers that import only this module
// ─────────────────────────────────────────────────────────────────────────────
export { GenIdSchema, ULID_REGEX, UlidSchema, validateIdempotencyKey };
