// apps/web/tests/unit/lib/sse/use-generation-sse.test.ts
//
// Plan 07-03 — vitest tests for the useGenerationSSE hook. Focus on the
// observable behavior the hook contracts:
//   1. bootstrap polls /api/v1/jobs/:id and uses prior events from response
//   2. terminal status from bootstrap → no SSE opened (Pitfall #4)
//   3. SSE open includes Last-Event-ID header from bootstrap
//   4. terminal SSE event sets terminal status (Pitfall #4 mid-stream)
//   5. invalid SSE events are dropped
//
// We mock fetch and synthesize a `body: ReadableStream<Uint8Array>` that the
// hook pipes through TextDecoderStream + EventSourceParserStream. SSE wire
// format is `id: …\nevent: message\ndata: …\n\n`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useGenerationSSE } from '@/lib/sse/use-generation-sse';
import { LAST_EVENT_ID_HEADER } from '@/lib/sse/last-event-id';

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';
const TEST_EVENT_ID_1 = '01HXAAAAAAAAAAAAAAAAAAAAA1';
const TEST_EVENT_ID_2 = '01HXAAAAAAAAAAAAAAAAAAAAA2';

const sseFrame = (id: string, payload: Record<string, unknown>): string =>
  `id: ${id}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`;

const sseStreamFrom = (frames: ReadonlyArray<string>): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const sseResponse = (frames: ReadonlyArray<string>): Response =>
  new Response(sseStreamFrom(frames), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGenerationSSE', () => {
  it('terminal bootstrap status → does NOT open SSE (Pitfall #4)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'completed',
        last_known_event_id: TEST_EVENT_ID_1,
        events: [],
      }),
    );

    const { result } = renderHook(() => useGenerationSSE(TEST_JOB_ID));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain(`/api/v1/jobs/${TEST_JOB_ID}`);
    expect(fetchSpy.mock.calls[0]?.[0]).not.toContain('/stream');
  });

  it('sends Last-Event-ID header from bootstrap when opening SSE', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        status: 'streaming',
        last_known_event_id: 'AB-LAST',
        events: [],
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseFrame(TEST_EVENT_ID_1, {
          job_id: TEST_JOB_ID,
          event_id: TEST_EVENT_ID_1,
          stage: 'completed',
          status: 'completed',
        }),
      ]),
    );

    const { result } = renderHook(() => useGenerationSSE(TEST_JOB_ID));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const sseCall = fetchSpy.mock.calls[1];
    expect(sseCall?.[0]).toContain('/stream');
    const sseInit = sseCall?.[1] as { headers?: Record<string, string> } | undefined;
    expect(sseInit?.headers?.[LAST_EVENT_ID_HEADER]).toBe('AB-LAST');
  });

  it('sets terminal status on stage="completed" event and stops reading', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ status: 'streaming', last_known_event_id: null, events: [] }),
    );
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseFrame(TEST_EVENT_ID_1, {
          job_id: TEST_JOB_ID,
          event_id: TEST_EVENT_ID_1,
          stage: 'A',
          status: 'started',
        }),
        sseFrame(TEST_EVENT_ID_2, {
          job_id: TEST_JOB_ID,
          event_id: TEST_EVENT_ID_2,
          stage: 'completed',
          status: 'completed',
        }),
      ]),
    );

    const { result } = renderHook(() => useGenerationSSE(TEST_JOB_ID));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });
    expect(result.current.events.length).toBe(2);
    expect(result.current.events[1]?.stage).toBe('completed');
    // 1 status fetch + 1 SSE open. No reconnect after terminal.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('drops invalid SSE events that fail GenerationSseEvent.safeParse', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ status: 'streaming', last_known_event_id: null, events: [] }),
    );
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        // missing required fields → should be dropped
        sseFrame(TEST_EVENT_ID_1, { not: 'a real event' }),
        sseFrame(TEST_EVENT_ID_2, {
          job_id: TEST_JOB_ID,
          event_id: TEST_EVENT_ID_2,
          stage: 'completed',
          status: 'completed',
        }),
      ]),
    );

    const { result } = renderHook(() => useGenerationSSE(TEST_JOB_ID));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });
    // Only the valid event is kept.
    expect(result.current.events.length).toBe(1);
    expect(result.current.events[0]?.event_id).toBe(TEST_EVENT_ID_2);
  });

  it('sets failed status when bootstrap fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('upstream error', { status: 500 }),
    );

    const { result } = renderHook(() => useGenerationSSE(TEST_JOB_ID));

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
