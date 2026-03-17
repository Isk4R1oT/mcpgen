// ---------------------------------------------------------------------------
// SWR hooks for polling backend status
// ---------------------------------------------------------------------------

import useSWR from "swr";
import { api, JobStatusResponse, SandboxStatusResponse } from "./api";
import { useAppStore } from "./store";

// ---------------------------------------------------------------------------
// useJobStatus — polls /jobs/{id}/status every 2s while generating
// ---------------------------------------------------------------------------

const ACTIVE_JOB_STATUSES = new Set([
  "pending",
  "configured",
  "parsing",
  "analyzing",
  "generating",
  "validating",
  "packaging",
]);

function jobStatusFetcher(jobId: string): Promise<JobStatusResponse> {
  return api.jobs.status(jobId);
}

export function useJobStatus(jobId: string | null) {
  const phase = useAppStore((s) => s.phase);
  const isGenerating = phase === "generating";

  return useSWR<JobStatusResponse>(
    jobId && isGenerating ? ["job-status", jobId] : null,
    ([, id]: [string, string]) => jobStatusFetcher(id),
    {
      refreshInterval: (data) => {
        if (!data) return 2000;
        return ACTIVE_JOB_STATUSES.has(data.status) ? 2000 : 0;
      },
      revalidateOnFocus: false,
    },
  );
}

// ---------------------------------------------------------------------------
// useSandboxStatus — polls sandbox status every 3s while sandbox is active
// ---------------------------------------------------------------------------

function sandboxStatusFetcher(jobId: string): Promise<SandboxStatusResponse> {
  return api.sandbox.status(jobId);
}

export function useSandboxStatus(jobId: string | null) {
  const phase = useAppStore((s) => s.phase);
  const isSandboxPhase = phase === "sandbox";

  return useSWR<SandboxStatusResponse>(
    jobId && isSandboxPhase ? ["sandbox-status", jobId] : null,
    ([, id]: [string, string]) => sandboxStatusFetcher(id),
    {
      refreshInterval: 3000,
      revalidateOnFocus: false,
    },
  );
}
