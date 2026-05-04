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

import { redirect } from 'next/navigation';
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

// Per canon `claude-design-reference/canon/screen-auth.jsx` lines 3-33 the
// AUTH_TYPES registry only defines apikey/basic/oauth/hmac — there is no
// "none" entry by design. Per `docs/decisions/2026-05-03-auth-mode-none.md`
// when auth_modes=['none'] the spec is unauthenticated and the generated
// worker emits a no-op middleware. Together: the AUTH screen MUST be skipped
// entirely for unauth specs, not rendered with a wrong "API Key" fallback
// (which is what AuthScreen falls back to without an authType prop).
function isUnauthenticatedSpec(authModes: unknown): boolean {
  if (!Array.isArray(authModes)) return false;
  const modes = authModes.filter((m): m is string => typeof m === 'string');
  if (modes.length === 0) return false; // empty == still detecting; don't skip prematurely
  return modes.every((m) => m === 'none');
}

// True when Pass 0 hasn't surfaced auth_modes yet (undefined OR empty array).
// In that race window the AUTH screen has no signal to render — bouncing the
// user back to /preview is safer than rendering AuthScreen with a guessed
// fallback ('apikey' is what the canon component defaults to, which is wrong
// for OAuth-only or unauth specs).
function isAuthStillDetecting(authModes: unknown): boolean {
  if (authModes === undefined || authModes === null) return true;
  if (!Array.isArray(authModes)) return true;
  return authModes.length === 0;
}

export default async function AuthPage({ params, searchParams }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  const sp = (await searchParams) ?? {};
  const origin =
    process.env['MCPGEN_PUBLIC_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}`;
  const job = await fetchJobStatusServerSide(jobId, origin);

  const authModesRaw = job?.partial_result?.auth_modes;

  // Race-window guard: user clicked "continue" on PREVIEW before Pass 0
  // finished detecting auth (~10-15s). Bounce back to /preview so the user
  // waits there instead of seeing a guessed "API Key" fallback that may not
  // match the actual spec. The PREVIEW screen disables its own continue
  // button until detection completes, but a direct URL navigation or a
  // stale tab can still land here mid-detection.
  if (isAuthStillDetecting(authModesRaw)) {
    redirect(`/generate/${jobId}/preview`);
  }

  // Skip the AUTH screen entirely when Pass 0 detected zero auth schemes.
  // Canon-correct flow for no-auth specs: paste -> review -> stream (skip
  // step 02 of 04, jump straight to step 03). `redirect()` throws so this
  // never returns; the AuthScreen component below is unreachable on this
  // branch.
  if (isUnauthenticatedSpec(authModesRaw)) {
    redirect(`/generate/${jobId}`);
  }

  const specName =
    typeof job?.partial_result?.spec_name === 'string'
      ? (job.partial_result.spec_name as string)
      : undefined;
  const detectedAuth = detectAuthType(authModesRaw);
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
