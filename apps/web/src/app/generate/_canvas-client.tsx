// apps/web/src/app/generate/_canvas-client.tsx
//
// M-4 Agent 1 (FLOW) — Wires the /generate canvas to the real BFF.
//
// The /generate route is the paste-URL-and-go entry. Until a job_id exists we
// reuse the locked Landing screen (same form, same visual lock baseline). On
// submit we POST /api/v1/generate via the typed client + idempotency-key, then
// router.push to /generate/[jobId]/stream where the SSE timeline takes over.

'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import type { LandingProps } from '@/lib/jsx-bridge';
import { submitGeneration } from '@/lib/api/client';

// Locked Landing form is rendered via the dynamic-imported wrapper to keep
// loader.ts side effects out of SSR (window references in canon JSX).
const LandingClient = dynamic<LandingProps>(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.LandingWrapper })),
  { ssr: false },
);

// FNV-1a 32-bit hash → hex. Used as a stable spec_hash for the idempotency
// key bucket so retries on the SAME URL reuse the same key. Lightweight; no
// crypto dependency required client-side.
function hashSpecUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface CanvasClientShellProps {
  /** Reserved for future "recent generations" prefetch. Pass null when the
   *  BFF endpoint is not yet implemented (current state). */
  recentGenerations: unknown;
}

export default function CanvasClientShell({
  recentGenerations: _recent,
}: CanvasClientShellProps): ReactElement {
  const router = useRouter();
  const [urlText, setUrlText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMakeIt = useCallback(async (): Promise<void> => {
    const trimmed = urlText.trim();
    if (trimmed === '') {
      setError('paste a spec url first');
      return;
    }
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      setError('that does not look like a valid url');
      return;
    }
    setError(null);
    setLoading(true);
    const result = await submitGeneration({
      specUrl: url.toString(),
      specHash: hashSpecUrl(url.toString()),
      request: { spec_url: url.toString() },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/generate/${encodeURIComponent(result.data.job_id)}`);
  }, [router, urlText]);

  // The locked Landing screen reads `loading` / `error` via the toast bus
  // (window.mcpToast). Surface failures there so the visual lock stays exact.
  useEffect(() => {
    if (error === null) return;
    const w = window as Window & { mcpToast?: (msg: string) => void };
    if (typeof w.mcpToast === 'function') w.mcpToast(error);
    setError(null);
  }, [error]);

  const noop = useCallback((): void => undefined, []);

  return (
    <LandingClient
      urlText={urlText}
      setUrlText={setUrlText}
      onMakeIt={loading ? noop : onMakeIt}
      onSelectSample={noop}
      onPricing={noop}
      onMarketplace={noop}
      onSignIn={noop}
    />
  );
}
