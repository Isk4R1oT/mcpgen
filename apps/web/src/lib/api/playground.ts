// apps/web/src/lib/api/playground.ts
//
// Playground BFF client — Phase 11.
//
// Replaces the original `flag_off_or_not_implemented` stub (Phase 1 / A5)
// with the live SSE-streaming agent invocation against the BFF route mounted
// at `/api/v1/playground`. The BFF in turn proxies a streaming engine
// endpoint (`/api/v1/playground/sessions/:job/invoke`) and persists each
// finished run into `playground_runs`.
//
// Event schema (mirrors the engine's hand-rolled SSE shape):
//   - agent_start    { turn }
//   - tool_call      { request_id, name, args }
//   - tool_result    { request_id, lat_ms, ok, content }
//   - agent_message  { text, stop_reason }
//   - done           { status, total_in_tk, total_out_tk, total_lat_ms,
//                      agent_reply, failure_reason, traces[] }
//   - engine_error / engine_unreachable (BFF-level surface for upstream
//     errors — terminal, no `done` will follow).

import { z } from 'zod';

import {
  notImplementedResult,
  request,
  type Result,
} from './client-base.js';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const PlaygroundTraceSchema = z.object({
  n: z.number().int().nonnegative(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  in: z.number().int().nonnegative().optional(),
  out: z.number().int().nonnegative().optional(),
  lat: z.number().int().nonnegative(),
  ok: z.boolean().optional(),
});
export type PlaygroundTrace = z.infer<typeof PlaygroundTraceSchema>;

export const PlaygroundDoneSchema = z.object({
  status: z.string(),
  failure_reason: z.string().nullable().optional(),
  total_in_tk: z.number().int().nonnegative(),
  total_out_tk: z.number().int().nonnegative(),
  total_lat_ms: z.number().int().nonnegative(),
  agent_reply: z.string().nullable().optional(),
  traces: z.array(PlaygroundTraceSchema),
});
export type PlaygroundDone = z.infer<typeof PlaygroundDoneSchema>;

export const PlaygroundRunRowSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  pinned_tool: z.string().nullable().optional(),
  agent_reply: z.string().nullable().optional(),
  trace: z.array(PlaygroundTraceSchema),
  total_in_tk: z.number(),
  total_out_tk: z.number(),
  total_lat_ms: z.number(),
  status: z.string(),
  failure_reason: z.string().nullable().optional(),
  created_at: z.string().or(z.date()).nullable().optional(),
  saved_as_test: z.boolean().optional(),
});
export type PlaygroundRunRow = z.infer<typeof PlaygroundRunRowSchema>;

export const PlaygroundRunsListSchema = z.object({
  runs: z.array(PlaygroundRunRowSchema),
});

// ─── Live event union (UI consumer) ────────────────────────────────────────

export type PlaygroundEvent =
  | { type: 'agent_start'; turn: number }
  | { type: 'tool_call'; request_id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; request_id: string; lat_ms: number; ok: boolean; content: string }
  | { type: 'agent_message'; text: string; stop_reason: string }
  | { type: 'done'; payload: PlaygroundDone }
  | { type: 'error'; reason: string };

export interface PlaygroundInvokeArgs {
  readonly jobId: string;
  readonly prompt: string;
  readonly pinnedTool?: string | null;
  readonly onEvent?: (evt: PlaygroundEvent) => void;
  readonly signal?: AbortSignal;
}

// ─── Functions ─────────────────────────────────────────────────────────────

/**
 * Run a streaming playground invocation against the BFF. Awaits the
 * terminal `done` event and returns its payload. While the stream is
 * open, every event is forwarded to `args.onEvent` so the UI can update
 * the live trace rail incrementally.
 *
 * Returns:
 *   - `{ ok: true, data }` once the engine emits `done`
 *   - `{ ok: false, error }` on engine_unreachable / engine_error / abort
 *   - `notImplementedResult()` on 404 (route not mounted in this env yet)
 */
export async function runPlaygroundTool(
  args: PlaygroundInvokeArgs,
): Promise<Result<PlaygroundDone>> {
  const url = `/api/v1/playground/${encodeURIComponent(args.jobId)}/invoke`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: args.prompt,
        ...(args.pinnedTool !== undefined && args.pinnedTool !== null
          ? { pinned_tool: args.pinnedTool }
          : {}),
      }),
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'network_error',
    };
  }
  if (resp.status === 404) {
    return notImplementedResult<PlaygroundDone>();
  }
  if (!resp.ok || resp.body === null) {
    let bodyText = '';
    try {
      bodyText = await resp.text();
    } catch {
      bodyText = '';
    }
    return {
      ok: false,
      status: resp.status,
      error: bodyText.length > 0 ? bodyText : `http_${resp.status}`,
    };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: PlaygroundDone | null = null;
  let terminalError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const sep = buffer.indexOf('\n\n');
      if (sep === -1) break;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data === '') continue;
      try {
        const parsed: unknown = JSON.parse(data);
        const dispatched = dispatchPlaygroundEvent(event, parsed);
        if (dispatched !== null && args.onEvent) {
          args.onEvent(dispatched);
        }
        if (event === 'done') {
          const r = PlaygroundDoneSchema.safeParse(parsed);
          if (r.success) donePayload = r.data;
        } else if (event === 'engine_unreachable' || event === 'engine_error') {
          terminalError =
            typeof (parsed as { error?: unknown }).error === 'string'
              ? (parsed as { error: string }).error
              : event;
        }
      } catch {
        // Ignore unparseable frames — engine guarantees JSON in `data`.
      }
    }
  }

  if (terminalError !== null) {
    return { ok: false, status: 502, error: terminalError };
  }
  if (donePayload === null) {
    return { ok: false, status: 0, error: 'stream_closed_without_done' };
  }
  return { ok: true, data: donePayload };
}

function dispatchPlaygroundEvent(event: string, raw: unknown): PlaygroundEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  switch (event) {
    case 'agent_start':
      return {
        type: 'agent_start',
        turn: typeof obj['turn'] === 'number' ? obj['turn'] : 0,
      };
    case 'tool_call':
      return {
        type: 'tool_call',
        request_id: String(obj['request_id'] ?? ''),
        name: String(obj['name'] ?? ''),
        args: typeof obj['args'] === 'object' && obj['args'] !== null
          ? (obj['args'] as Record<string, unknown>)
          : {},
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        request_id: String(obj['request_id'] ?? ''),
        lat_ms: typeof obj['lat_ms'] === 'number' ? obj['lat_ms'] : 0,
        ok: obj['ok'] === true,
        content: String(obj['content'] ?? ''),
      };
    case 'agent_message':
      return {
        type: 'agent_message',
        text: String(obj['text'] ?? ''),
        stop_reason: String(obj['stop_reason'] ?? ''),
      };
    case 'done':
      // The PlaygroundDoneSchema validation happens in the calling loop;
      // here we just shape an event for onEvent. The full validated
      // payload is set on the closure variable at the call site.
      return {
        type: 'done',
        payload: raw as PlaygroundDone,
      };
    case 'engine_unreachable':
    case 'engine_error':
      return {
        type: 'error',
        reason:
          typeof obj['error'] === 'string'
            ? (obj['error'] as string)
            : event,
      };
    default:
      return null;
  }
}

// ─── History ───────────────────────────────────────────────────────────────

export async function listPlaygroundRuns(
  jobId: string,
): Promise<Result<{ readonly runs: ReadonlyArray<PlaygroundRunRow> }>> {
  return request<{ readonly runs: ReadonlyArray<PlaygroundRunRow> }>({
    method: 'GET',
    path: `/api/v1/playground/${encodeURIComponent(jobId)}/runs`,
    schema: PlaygroundRunsListSchema,
  });
}

export async function deletePlaygroundSession(
  jobId: string,
): Promise<Result<{ job_id: string; found: boolean }>> {
  return request<{ job_id: string; found: boolean }>({
    method: 'DELETE',
    path: `/api/v1/playground/sessions/${encodeURIComponent(jobId)}`,
    schema: z.object({ job_id: z.string(), found: z.boolean() }),
  });
}
