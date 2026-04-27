// packages/contracts/src/engine-internal-api.ts
//
// Engine ↔ BFF internal HTTP contract (M2M-protected).
// Two endpoints:
//   POST /internal/v1/parse              (BFF → engine; Stage A only, no LLM)
//   POST /internal/v1/cancel-generation  (BFF → engine; mid-pass cancel)
//
// Cross-ws ask (RESEARCH §20 Q1): engine workstream implements against this
// contract when Phase 2 starts. Phase 8 Wave 4 Drift Watcher consumes /parse;
// Phase 8 Wave 3 cost-cap enforcer consumes /cancel-generation.

import { z } from 'zod';

export const ParseRequest = z.object({
  spec_url: z.string().url().optional(),
  spec_content: z.string().optional(),
}).refine(
  (r) => Boolean(r.spec_url) !== Boolean(r.spec_content),
  { message: 'exactly one of spec_url / spec_content must be set' },
);
export type ParseRequest = z.infer<typeof ParseRequest>;

export const ParseResponse = z.object({
  raw_ir: z.record(z.string(), z.unknown()),
  endpoint_count: z.number().int().nonnegative(),
  spec_format: z.literal('openapi3'),
});
export type ParseResponse = z.infer<typeof ParseResponse>;

export const CancelReason = z.enum(['cost_cap_exceeded', 'user_requested', 'timeout']);
export type CancelReason = z.infer<typeof CancelReason>;

export const CancelGenerationRequest = z.object({
  job_id: z.string().min(1),
  reason: CancelReason,
  cap_usd: z.number().nonnegative().optional(),
});
export type CancelGenerationRequest = z.infer<typeof CancelGenerationRequest>;

export const CancelGenerationResponse = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),  // 'job_not_found' | 'already_settled' | etc.
});
export type CancelGenerationResponse = z.infer<typeof CancelGenerationResponse>;
