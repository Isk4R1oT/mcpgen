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
import { useCallback, useMemo, type ComponentType, type ReactElement } from 'react';

import type { GenerationSseEvent } from '@mcpgen/contracts';

import type { StreamLogWrapperProps } from '@/lib/jsx-bridge/screens';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';

// The locked StreamLog screen-stream.jsx accepts `events`, `cacheHit`,
// `currentStage` as additional runtime props (M-4 point edit). They flow
// through StreamLogWrapper's `...rest` spread; we type them locally so this
// callsite stays strict-typed without touching the jsx-bridge wrapper.
interface StreamWiringProps extends StreamLogWrapperProps {
  events: GenerationSseEvent[];
  cacheHit: boolean;
  currentStage: string | undefined;
}

const StreamClient = dynamic<StreamWiringProps>(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({
    default: m.StreamLogWrapper as unknown as ComponentType<StreamWiringProps>,
  })),
  { ssr: false },
);

interface Props {
  jobId: string;
}

export default function StreamClientShell({ jobId }: Props): ReactElement {
  const router = useRouter();
  const { events, status } = useGenerationSSE(jobId);

  // The latest event's stage is the canonical "current stage" for the UI.
  // Empty array → no events yet → undefined → screen renders step 0.
  const currentStage = useMemo<string | undefined>(() => {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    const last = events[events.length - 1];
    return last?.stage;
  }, [events, status]);

  // cache_hit is surfaced on event 0 of the cache-replay timeline (engine
  // tags the first event's partial_result with `cache_hit: true`).
  const cacheHit = useMemo<boolean>(() => {
    return events.some((e) => e?.partial_result?.cache_hit === true);
  }, [events]);

  const onDone = useCallback((): void => {
    router.push(`/generate/${encodeURIComponent(jobId)}/preview`);
  }, [router, jobId]);

  const onCancel = useCallback((): void => {
    router.push('/generate');
  }, [router]);

  return (
    <StreamClient
      jobId={jobId}
      events={events}
      cacheHit={cacheHit}
      currentStage={currentStage}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
}
