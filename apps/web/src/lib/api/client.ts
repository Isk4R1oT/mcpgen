// apps/web/src/lib/api/client.ts
//
// Plan 07-02 — FE-01 typed fetch client against `@mcpgen/contracts`. Attaches
// the `Idempotency-Key: gen_${ulid}` header on `POST /api/v1/generate` and
// rotates the localStorage key after a successful 202 response.
//
// CLAUDE.md: "External API calls: retries with warnings, then raise the last
// error". This module does NOT retry — the caller (LandingWrapper) decides
// whether the user should retry or surface the error. Per CLAUDE.md scope
// rule: silent retries hide root causes; we expose status/code to the caller.
//
// References:
//   - packages/contracts/src/idempotency.ts (IDEMPOTENCY_KEY_HEADER)
//   - packages/contracts/src/generation-api.ts (GenerationApiRequest/Response)
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md FE-01

import {
  GenerationApiRequest as GenerationApiRequestSchema,
  GenerationApiResponse,
  IDEMPOTENCY_KEY_HEADER,
  type GenerationApiResponse as GenerationApiResponseType,
} from '@mcpgen/contracts';
import type { z } from 'zod';

import {
  getOrCreateIdempotencyKey,
  rotateIdempotencyKey,
} from '../idempotency-key.js';
import { mapGenerationError } from './error-mapper.js';

// `z.input` (NOT `z.infer`) so callers can omit fields with Zod defaults
// (Phase-5 strictly-additive `f3_enabled` defaults to false on the wire).
// Phase 5 D-35 adds f3_enabled / sandbox_credentials / user_golden_tasks as
// optional-with-defaults; clients pre-Phase-5 always sent the same shape.
type GenerationApiRequestInput = z.input<typeof GenerationApiRequestSchema>;

interface SubmitGenerationInput {
  specUrl: string;
  specHash: string;
  request: GenerationApiRequestInput;
}

type SubmitGenerationResult =
  | { ok: true; data: GenerationApiResponseType }
  | { ok: false; status: number; code: string; message: string; raw: unknown };

interface ErrorBody {
  error?: string;
  code?: string;
  message?: string;
}

const GENERATE_PATH = '/api/v1/generate';

export const submitGeneration = async ({
  specUrl,
  specHash,
  request,
}: SubmitGenerationInput): Promise<SubmitGenerationResult> => {
  const idempotencyKey = getOrCreateIdempotencyKey(specUrl, specHash);

  const response = await fetch(GENERATE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  if (response.status === 202) {
    const json: unknown = await response.json();
    const parsed = GenerationApiResponse.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        status: response.status,
        code: 'internal_error',
        message: 'BFF returned 202 but the response shape did not match the contract.',
        raw: json,
      };
    }
    rotateIdempotencyKey(specUrl, specHash);
    return { ok: true, data: parsed.data };
  }

  // 4xx / 5xx (including Phase-1 BFF 501 stub) — parse error body, map to a
  // user-readable message, return non-throwing structured result.
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = await response.text().catch(() => null);
  }
  const errorBody = (raw ?? {}) as ErrorBody;
  const errorCode = errorBody.code ?? errorBody.error ?? 'internal_error';
  const mapped = mapGenerationError({ status: response.status, code: errorCode });
  return {
    ok: false,
    status: response.status,
    code: mapped.code,
    message: mapped.userMessage,
    raw,
  };
};

// Plan 07-03 — fetchJobStatus implementation. Returns the status bootstrap
// shape expected by useGenerationSSE: { status, last_known_event_id, events }.
// Used by both the SSE hook and the preview/quality Server Component shells
// (server-side prefetch of completed-job partial_result).

import type { GenerationSseEvent } from '@mcpgen/contracts';

export interface JobStatusResponse {
  job_id: string;
  status: 'streaming' | 'completed' | 'failed' | string;
  last_known_event_id: string | null;
  events: GenerationSseEvent[];
  partial_result?: {
    final_tools?: unknown;
    quality_report?: unknown;
  };
}

export const fetchJobStatus = async (jobId: string): Promise<JobStatusResponse> => {
  const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    throw new Error(`fetchJobStatus: BFF returned ${res.status}`);
  }
  return (await res.json()) as JobStatusResponse;
};

// Plan 07-05 — submitDeploy thin wrapper around `dashboard-client.deploy()` so
// the api/client surface stays the single client-side entry point. The full
// typed surface (DeployResult discriminated union, DeployOptions) lives in
// dashboard-client; this re-export exists only so callers that already import
// from `@/lib/api/client` (LandingWrapper / DeployWrapper) don't need to learn
// about a second module name.

export {
  deploy as submitDeploy,
  type DeployOptions,
  type DeployResponse,
  type DeployResult,
  type Deployment,
  type UsageHourlyRow,
} from './dashboard-client.js';
