// apps/web/src/lib/api/jobs.ts
//
// Foundation Agent F-BFFClients — typed clients + TanStack Query hooks for
// the public job-status endpoints under /api/v1/jobs.
//
// Endpoints covered:
//   GET /api/v1/jobs/:id                          — JSON status snapshot
//   GET /api/v1/jobs/:id/artifacts/:name          — engine artifact JSON
//
// The SSE stream at /api/v1/jobs/:id/stream is intentionally NOT a TanStack
// Query — streaming is handled by the existing `useGenerationSSE` hook which
// owns its own EventSource lifecycle. This module is for the polling /
// snapshot side of the same endpoint family.
//
// Schema policy: the BFF's status payload is wider than the frozen contract
// (it embeds engine-derived `final_tools`, `quality_report`, `endpoint_count`,
// `spec_name`). We define a permissive Zod schema here that covers the public
// shape consumed by the preview / dashboard screens; engine-internal fields
// like `final_tools` stay `z.unknown()` so additive changes do not break.
//
// References:
//   - apps/api/src/routes/v1/jobs/anon-stream.ts (BFF route)
//   - apps/web/src/lib/api/client.ts (existing fetchJobStatus baseline)

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { request, type Result } from './client-base.js';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const JobStatusSchema = z.object({
  job_id: z.string().optional(),
  status: z.string(),
  owned_via_cookie: z.boolean().optional(),
  last_known_event_id: z.string().nullable().optional(),
  // BUG-010 fix — when status is 'failed' the BFF surfaces the engine
  // error so the UI can render a real message instead of leaving the
  // user on a perpetual loading spinner. See
  // apps/api/src/routes/v1/jobs/anon-stream.ts:184 for the producer.
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
  // Engine-shaped partial result. Loose by design — Phase 5+ adds fields.
  partial_result: z
    .object({
      final_tools: z.unknown().optional(),
      quality_report: z.unknown().optional(),
      endpoint_count: z.number().int().nonnegative().optional(),
      spec_name: z.string().nullable().optional(),
      // BFF surfaces these from Stage A / Pass 0 artefacts so the locked
      // Preview screen can render real data (no canon literals like
      // "lumen-payments" or "transactions(24)").
      spec_format: z.string().nullable().optional(),
      // Pre-conversion format string when Stage A normalized a legacy spec
      // ("swagger-2.0" / "swagger-1.x" / "postman-2.x"); null/absent for
      // native OpenAPI 3.x input.
      original_format: z.string().nullable().optional(),
      auth_modes: z.array(z.string()).optional(),
      composite_candidates: z.array(z.unknown()).optional(),
      dropped_endpoints: z.array(z.unknown()).optional(),
      target_complexity: z.string().nullable().optional(),
      // Deterministic sample prompts synthesized from Pass-2 descriptions
      // (BFF /jobs/:id enriches partial_result). Drives the playground
      // chip-row; absent on older generations → chip-row hides.
      sample_prompts: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  // Older /jobs/:id stub returns `events` array; keep it optional so the
  // schema accepts both shapes.
  events: z.array(z.unknown()).optional(),
});
export type JobStatus = z.infer<typeof JobStatusSchema>;

// Engine artifacts are free-form per artifact name (raw_ir / pass_0 / pass_1
// / pass_2 / pass_3 / pass_4 / pass_5_output / quality_report). We return
// `unknown` and let the consumer narrow.
export const JobArtifactSchema = z.unknown();

// ─── Functions ─────────────────────────────────────────────────────────────

const JOB_PATH = (jobId: string): string =>
  `/api/v1/jobs/${encodeURIComponent(jobId)}`;
const ARTIFACT_PATH = (jobId: string, name: string): string =>
  `/api/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`;

export async function fetchJob(jobId: string): Promise<Result<JobStatus>> {
  return request<JobStatus>({
    method: 'GET',
    path: JOB_PATH(jobId),
    schema: JobStatusSchema,
  });
}

export async function fetchJobArtifact(
  jobId: string,
  name: string,
): Promise<Result<unknown>> {
  return request<unknown>({
    method: 'GET',
    path: ARTIFACT_PATH(jobId, name),
    schema: JobArtifactSchema,
  });
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

interface UseJobOpts {
  // Defaults: enabled when jobId is non-empty.
  enabled?: boolean;
  // Polling interval in ms. Default off — SSE stream owns the live path.
  refetchIntervalMs?: number;
}

export function useJob(
  jobId: string | null | undefined,
  opts?: UseJobOpts,
): UseQueryResult<Result<JobStatus>, Error> {
  const enabled = (opts?.enabled ?? true) && Boolean(jobId);
  const interval = opts?.refetchIntervalMs ?? false;
  return useQuery<Result<JobStatus>, Error>({
    queryKey: ['job', jobId],
    queryFn: () => {
      if (!jobId) {
        return Promise.resolve({
          ok: false as const,
          status: 0,
          error: 'missing_job_id',
        });
      }
      return fetchJob(jobId);
    },
    enabled,
    // BUG-012 fix — stop polling once the job reaches a terminal status.
    // The prior config polled forever after `completed` (observed 150+
    // requests in <2 min on the canvas screen), which would translate to
    // a non-trivial cost in production. TanStack Query treats a function
    // returning `false` as "stop polling" while still letting the cache
    // serve the latest snapshot.
    refetchInterval: (query) => {
      if (interval === false) return false;
      const data = query.state.data;
      if (data !== undefined && data.ok) {
        const s = data.data.status;
        if (s === 'completed' || s === 'failed' || s === 'cancelled') {
          return false;
        }
      }
      return interval;
    },
    staleTime: 10_000,
  });
}

interface UseJobArtifactOpts {
  /** When false, skip the network fetch entirely. Useful when an upstream
   *  source already contains the same payload (e.g. job-status's
   *  `partial_result.final_tools` mirrors the `final-tools` artifact). */
  enabled?: boolean;
}

export function useJobArtifact(
  jobId: string | null | undefined,
  name: string | null | undefined,
  opts?: UseJobArtifactOpts,
): UseQueryResult<Result<unknown>, Error> {
  const enabled = Boolean(jobId) && Boolean(name) && (opts?.enabled ?? true);
  return useQuery<Result<unknown>, Error>({
    queryKey: ['job-artifact', jobId, name],
    queryFn: () => {
      if (!jobId || !name) {
        return Promise.resolve({
          ok: false as const,
          status: 0,
          error: 'missing_args',
        });
      }
      return fetchJobArtifact(jobId, name);
    },
    enabled,
    // Artifacts are immutable once written by the engine — long staleTime is fine.
    staleTime: 5 * 60_000,
  });
}
