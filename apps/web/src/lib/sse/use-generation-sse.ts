// apps/web/src/lib/sse/use-generation-sse.ts
//
// Plan 07-03 — SSE consumer hook for generation jobs.
//
// Boot sequence (D-10):
//   1. Poll GET /api/v1/jobs/:id for status + last_known_event_id + prior events.
//   2. If terminal (completed/failed), set status and DO NOT open SSE.
//   3. Otherwise open SSE GET /api/v1/jobs/:id/stream with Last-Event-ID header.
//   4. Parse via eventsource-parser@3 EventSourceParserStream + zod-validate
//      each event via GenerationSseEvent.safeParse — invalid events are dropped.
//   5. On disconnect: 3 retries with exponential backoff (1s/2s/4s); after
//      exhaustion, fall back to polling /api/v1/jobs/:id every 2s until terminal.
//
// Pitfall #4 (terminal stop): on stage === 'completed' | 'failed', set status
// + return. The hook NEVER reconnects after a terminal event.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 2" (verbatim)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-09, D-10
//   - .planning/research/PITFALLS.md #4 (terminal-stop guard)
//   - packages/contracts/src/generation-api.ts (GenerationSseEvent, LAST_EVENT_ID_HEADER)

'use client';

import { useEffect, useRef, useState } from 'react';
import { EventSourceParserStream } from 'eventsource-parser/stream';

import {
  GenerationSseEvent,
  type GenerationSseEvent as TGenerationSseEvent,
} from '@mcpgen/contracts';

import { buildSseHeaders } from './last-event-id';

export type SseStatus =
  | 'connecting'
  | 'streaming'
  | 'reconnecting'
  | 'completed'
  | 'failed';

interface JobStatusResponse {
  status: 'streaming' | 'completed' | 'failed' | string;
  last_known_event_id: string | null;
  events?: TGenerationSseEvent[];
}

const MAX_RETRIES = 3;
const POLL_INTERVAL_MS = 2000;

const isTerminal = (s: string): s is 'completed' | 'failed' =>
  s === 'completed' || s === 'failed';

export function useGenerationSSE(jobId: string): {
  events: TGenerationSseEvent[];
  status: SseStatus;
} {
  const [events, setEvents] = useState<TGenerationSseEvent[]>([]);
  const [status, setStatus] = useState<SseStatus>('connecting');
  const abortRef = useRef<AbortController | null>(null);
  const retriesRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    retriesRef.current = 0;

    const appendEvent = (e: TGenerationSseEvent): void => {
      setEvents((prev) => [...prev, e]);
    };

    const poll = async (): Promise<void> => {
      while (!cancelled) {
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled) return;
        let res: Response;
        try {
          res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
        } catch {
          continue;
        }
        if (!res.ok) continue;
        const job = (await res.json()) as JobStatusResponse;
        if (Array.isArray(job.events) && job.events.length > 0) {
          setEvents(job.events);
        }
        if (isTerminal(job.status)) {
          setStatus(job.status);
          return;
        }
      }
    };

    const connect = async (lastEventId: string | null): Promise<void> => {
      if (cancelled) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus(retriesRef.current === 0 ? 'connecting' : 'reconnecting');

      try {
        const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/stream`, {
          headers: buildSseHeaders(lastEventId),
          signal: ac.signal,
        });
        if (!res.ok || res.body === null) {
          throw new Error(`SSE failed: ${res.status}`);
        }
        setStatus('streaming');

        const stream = res.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream());
        const reader = stream.getReader();
        let lastSeenId: string | null = lastEventId;

        // Read loop. NOTE: Pitfall #4 terminal-stop — when an event with
        // stage === 'completed' || parsed.stage === 'failed' arrives, we set
        // status + return without reconnecting.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) return;
          // POST-09.1 fix: engine tags events with `event: A/B/C/D/E/F1/F2/F3/completed/failed`.
          // Do NOT filter by event field — it's the same value as `payload.stage`.
          // Only skip frames with no data (heartbeats / comments).
          if (value.data === undefined || value.data === '') continue;

          let payload: unknown;
          try {
            payload = JSON.parse(value.data);
          } catch {
            continue;
          }
          const parseResult = GenerationSseEvent.safeParse(payload);
          if (!parseResult.success) continue;
          const parsed = parseResult.data;
          appendEvent(parsed);
          lastSeenId = parsed.event_id;
          // POST-09.1 fix: engine emits `stage="validation_complete"` as the
          // terminal success marker (apps/generation-engine/.../pipeline.py:596).
          // Treat it as the canonical "completed" for the frontend so the
          // wrapper navigates to /preview when the pipeline finishes.
          if (
            parsed.stage === 'completed' ||
            parsed.stage === 'failed' ||
            parsed.stage === 'validation_complete'
          ) {
            setStatus(parsed.stage === 'failed' ? 'failed' : 'completed');
            return;
          }
        }

        // Stream closed without terminal event — backoff + reconnect.
        if (cancelled) return;
        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current += 1;
          const backoffMs = 2 ** (retriesRef.current - 1) * 1000;
          await new Promise<void>((r) => setTimeout(r, backoffMs));
          if (cancelled) return;
          await connect(lastSeenId);
          return;
        }
        setStatus('reconnecting');
        await poll();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current += 1;
          const backoffMs = 2 ** (retriesRef.current - 1) * 1000;
          await new Promise<void>((r) => setTimeout(r, backoffMs));
          if (cancelled) return;
          await connect(lastEventId);
          return;
        }
        setStatus('reconnecting');
        await poll();
      }
    };

    const bootstrap = async (): Promise<void> => {
      let res: Response;
      try {
        res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
      } catch {
        setStatus('failed');
        return;
      }
      if (!res.ok) {
        setStatus('failed');
        return;
      }
      const job = (await res.json()) as JobStatusResponse;
      if (Array.isArray(job.events)) setEvents(job.events);
      if (isTerminal(job.status)) {
        setStatus(job.status);
        return;
      }
      await connect(job.last_known_event_id);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [jobId]);

  return { events, status };
}
