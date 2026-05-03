// apps/web/src/app/generate/[jobId]/_stream-client.tsx
//
// M-4 Agent 1 (FLOW) — Wires the /generate/[jobId] stream screen to live SSE.
//
// Boots the SSE consumer hook and forwards `events`, `cacheHit`, `currentStage`
// to the locked StreamLog screen via StreamLogWrapper. On terminal completion
// the screen's own `onDone` callback fires and we navigate to /preview; on
// cancel we drop back to the canvas.

'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type ReactElement } from 'react';

import { useGenerationSSE } from '@/lib/sse/use-generation-sse';

// The new canon StreamLog signature dropped the `events`, `cacheHit`,
// `currentStage` real-data slots — canon now uses internal hardcoded
// timeline animation. We keep the SSE consumption logic below so the
// terminal `onDone` / `onCancel` transitions still react to live engine
// status; future wiring will reintroduce a wired StreamLog variant.
const StreamClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.StreamLogWrapper })),
  { ssr: false },
);

interface Props {
  jobId: string;
}

export default function StreamClientShell({ jobId }: Props): ReactElement {
  const router = useRouter();
  const { events, status } = useGenerationSSE(jobId);

  // Derivations retained for future re-wire — see comment block above.
  const currentStage = useMemo<string | undefined>(() => {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    const last = events[events.length - 1];
    return last?.stage;
  }, [events, status]);
  const cacheHit = useMemo<boolean>(() => {
    return events.some((e) => e?.partial_result?.cache_hit === true);
  }, [events]);
  void currentStage;
  void cacheHit;

  const onDone = useCallback((): void => {
    router.push(`/generate/${encodeURIComponent(jobId)}/preview`);
  }, [router, jobId]);

  const onCancel = useCallback((): void => {
    router.push('/generate');
  }, [router]);

  return <StreamClient jobId={jobId} onDone={onDone} onCancel={onCancel} />;
}
