// apps/web/src/app/generate/[jobId]/auth/page.tsx
//
// Canon STEP 02 · AUTHENTICATION route. Inserted between /preview (review)
// and the stream UI per canon screen-auth.jsx — the user picks credential
// mode (pass-through vs stored) and confirms the detected auth strategy
// from Pass 0. The engine has been running since the POST that created
// the job, so by the time the user lands here Pass 0 has emitted the
// detected auth type into `partial_result.auth_modes`.
//
// Flow:
//   /generate (paste)
//     -> POST /api/v1/generate (engine kickoff)
//     -> /generate/[jobId]/preview (review)
//     -> /generate/[jobId]/auth (THIS PAGE)
//     -> /generate/[jobId] (stream)
//     -> /generate/[jobId]/canvas (post-gen tools editor)
//
// The chosen auth_mode/auth_type lives in sessionStorage (persisted by
// AuthScreen.persistCapture) and is read at deploy time to wire the
// tenant Worker — no server-side state needed for this step.

import type { ReactElement } from 'react';

import { AuthScreen } from '@/components/screens/auth/auth';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ spec_url?: string }>;
}

interface JobStatusShape {
  status: string;
  partial_result?: {
    spec_name?: unknown;
    auth_modes?: unknown;
  };
}

const fetchJobStatusServerSide = async (
  jobId: string,
  origin: string,
): Promise<JobStatusShape | null> => {
  try {
    const res = await fetch(`${origin}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as JobStatusShape;
  } catch {
    return null;
  }
};

function detectAuthType(authModes: unknown): 'apikey' | 'basic' | 'oauth' | 'hmac' | undefined {
  if (!Array.isArray(authModes)) return undefined;
  const modes = authModes.filter((m): m is string => typeof m === 'string');
  if (modes.includes('oauth2') || modes.includes('oauth')) return 'oauth';
  if (modes.includes('hmac')) return 'hmac';
  if (modes.includes('basic')) return 'basic';
  if (modes.includes('apikey') || modes.includes('api_key') || modes.includes('bearer')) {
    return 'apikey';
  }
  return undefined;
}

export default async function AuthPage({ params, searchParams }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const sp = (await searchParams) ?? {};
  const origin =
    process.env['MCPGEN_PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);

  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;
  const detectedAuth = detectAuthType(job?.partial_result?.auth_modes);
  const originalSpecUrl =
    typeof sp.spec_url === 'string' && sp.spec_url.length > 0 ? sp.spec_url : undefined;

  return (
    <AuthScreen
      jobId={jobId}
      {...(specName !== undefined ? { sample: { name: specName, ...(detectedAuth ? { authType: detectedAuth } : {}) } } : {})}
      {...(originalSpecUrl !== undefined ? { specUrl: originalSpecUrl } : {})}
    />
  );
}
