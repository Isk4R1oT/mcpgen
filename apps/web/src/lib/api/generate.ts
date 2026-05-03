// apps/web/src/lib/api/generate.ts
//
// Foundation Agent F-BFFClients — typed client for POST /api/v1/generate.
// Replaces the bespoke fetch-and-parse implementation in `client.ts` with the
// shared `request()` wrapper from `client-base.ts`.
//
// Idempotency-Key is mandatory on this endpoint — see contract D-12 in
// .planning/phases/07-frontend-wire-up/07-CONTEXT.md. We delegate persistence
// to `apps/web/src/lib/idempotency-key.ts` (localStorage-backed `gen_${ulid}`).
//
// References:
//   - apps/api/src/routes/v1/generate.ts (BFF route)
//   - packages/contracts/src/generation-api.ts (frozen request/response shape)

import {
  GenerationApiRequest as GenerationApiRequestSchema,
  GenerationApiResponse as GenerationApiResponseSchema,
  type GenerationApiRequest as GenerationApiRequestType,
  type GenerationApiResponse as GenerationApiResponseType,
} from '@mcpgen/contracts';
import type { z } from 'zod';

import {
  getOrCreateIdempotencyKey,
  rotateIdempotencyKey,
} from '../idempotency-key.js';
import { request, type Result } from './client-base.js';

// `z.input` (NOT `z.infer`) so callers can omit fields with Zod defaults
// (Phase-5 strictly-additive `f3_enabled` defaults to false on the wire).
type GenerationApiRequestInput = z.input<typeof GenerationApiRequestSchema>;

export interface SubmitGenerationArgs {
  // Used as the localStorage key for Idempotency-Key persistence — distinct
  // (specUrl, specHash) tuples each get their own key so resubmitting after a
  // hash change mints a fresh ULID.
  specUrl: string;
  specHash: string;
  // The full request body. Defaults to `{ spec_url: specUrl }` when omitted —
  // the common case for the canvas hero flow.
  request?: GenerationApiRequestInput;
}

export type SubmitGenerationResult = Result<GenerationApiResponseType>;

const GENERATE_PATH = '/api/v1/generate';

export async function submitGeneration(
  args: SubmitGenerationArgs,
): Promise<SubmitGenerationResult> {
  const idempotencyKey = getOrCreateIdempotencyKey(args.specUrl, args.specHash);

  const body: GenerationApiRequestInput =
    args.request ?? { spec_url: args.specUrl };

  // Validate request body against the contract before hitting the wire — this
  // surfaces shape errors at the call site rather than as a 400 from the BFF.
  const reqParsed = GenerationApiRequestSchema.safeParse(body);
  if (!reqParsed.success) {
    return {
      ok: false,
      status: 0,
      error: 'invalid_request',
      raw: reqParsed.error.flatten(),
    };
  }

  const result = await request<GenerationApiResponseType>({
    method: 'POST',
    path: GENERATE_PATH,
    body,
    schema: GenerationApiResponseSchema,
    options: { idempotencyKey },
    // Per contract: POST /generate returns 202 Accepted on success.
    successStatuses: [200, 202],
  });

  if (result.ok) {
    rotateIdempotencyKey(args.specUrl, args.specHash);
  }
  return result;
}

export type { GenerationApiRequestType, GenerationApiResponseType };
