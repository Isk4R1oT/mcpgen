// apps/api/src/lib/job-partial-state.ts
//
// In-memory accumulator for engine SSE events keyed by jobId. Solves the
// "canon /auth and /preview screens show fallback values until full
// pipeline completes" problem: engine emits per-pass partial_result via
// SSE, but BFF /jobs/:id reads from engine's L1 artifact cache which is
// only populated AFTER Stage F. Without this accumulator the user sees
// "DETECTED type A · API Key" + "mcpgen-generated-server" placeholders
// for ~100s while the engine grinds through Pass 1-5 + Stage E/F.
//
// How it's populated: the BFF's fire-and-forget SSE drain in
// routes/v1/generate.ts (added 2026-05-04) consumes the engine stream
// to keep the pipeline running. We extend that drain here to PARSE
// each event and merge the partial_result fields into a per-jobId
// state record.
//
// How it's read: routes/v1/jobs/anon-stream.ts checks the map FIRST
// when the engine /artifacts endpoint returns 404 (i.e. pipeline not
// yet complete). If we have accumulated state for this job, we return
// it as a partial_result so /preview and /auth can render real data
// the moment Pass 0 completes (~5-15s after POST).
//
// Lifecycle / leak protection: entries are evicted 30 minutes after
// last write — long enough to cover any single generation run, short
// enough that a forgotten jobId can't grow the map indefinitely.
//
// Production note: workerd locally is single-process so the Map lives
// for the lifetime of the worker. CF Workers in prod scale across
// isolates and don't share memory — Phase 10 must move this to a
// Durable Object or Hyperdrive table. Marked with a TODO at the
// bottom.

export interface JobPartialState {
  spec_name?: string;
  spec_format?: string;
  auth_modes?: ReadonlyArray<string>;
  endpoint_count?: number;
  tool_plan_count?: number;
  final_tool_count?: number;
  dropped_endpoints?: ReadonlyArray<unknown>;
  composite_candidates?: ReadonlyArray<unknown>;
  target_complexity?: string;
  terminal?: boolean;
  error_code?: string;
  updated_at: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough for any one run.
const MAX_ENTRIES = 1000; // sanity cap; stale-eviction normally keeps it lower.

const STATE = new Map<string, JobPartialState>();

/**
 * Read accumulated partial state for a job. Returns null if no events
 * have landed yet (or the entry was evicted).
 */
export function getPartialState(jobId: string): JobPartialState | null {
  evictExpired();
  return STATE.get(jobId) ?? null;
}

/**
 * Merge new fields into a job's accumulated state. Always updates the
 * `updated_at` timestamp. Idempotent on repeated identical merges.
 */
export function mergePartialState(
  jobId: string,
  patch: Omit<Partial<JobPartialState>, 'updated_at'>,
): void {
  evictExpired();
  if (STATE.size >= MAX_ENTRIES && !STATE.has(jobId)) {
    // Hard cap reached and this is a NEW job — evict the oldest first.
    const oldest = [...STATE.entries()].sort(
      (a, b) => a[1].updated_at - b[1].updated_at,
    )[0];
    if (oldest !== undefined) STATE.delete(oldest[0]);
  }
  const current = STATE.get(jobId) ?? { updated_at: Date.now() };
  STATE.set(jobId, { ...current, ...patch, updated_at: Date.now() });
}

/**
 * Parse one decoded SSE chunk (raw text from the engine /stream body)
 * and merge any partial_result fields it carries. The chunk MAY contain
 * multiple SSE events; we split by `\n\n` per the SSE protocol.
 */
export function ingestSseChunk(jobId: string, text: string): void {
  // Each SSE event is delimited by a blank line. We split conservatively
  // — incomplete trailing events are ignored on this call and re-tried
  // on the next chunk (the caller buffers).
  const events = text.split('\n\n').filter((e) => e.trim().length > 0);
  for (const evt of events) {
    const dataLine = evt
      .split('\n')
      .find((l) => l.startsWith('data:'));
    if (dataLine === undefined) continue;
    const json = dataLine.slice(5).trim();
    if (json === '' || json === '[DONE]') continue;
    try {
      const payload = JSON.parse(json) as {
        partial_result?: Record<string, unknown>;
        stage?: string;
        status?: string;
        error?: { code?: string } | null;
      };
      const pr = payload.partial_result ?? {};
      const patch: Omit<Partial<JobPartialState>, 'updated_at'> = {};
      // Stage A complete carries endpoint_count + spec_format on raw_ir.
      if (typeof pr['endpoint_count'] === 'number') {
        patch.endpoint_count = pr['endpoint_count'] as number;
      }
      if (typeof pr['endpoint_count'] === 'string') {
        // engine sometimes emits it as string for SSE compactness
        const n = parseInt(pr['endpoint_count'] as string, 10);
        if (!Number.isNaN(n)) patch.endpoint_count = n;
      }
      if (typeof pr['spec_format'] === 'string') {
        patch.spec_format = pr['spec_format'] as string;
      }
      if (typeof pr['spec_name'] === 'string') {
        patch.spec_name = pr['spec_name'] as string;
      }
      if (Array.isArray(pr['auth_modes'])) {
        patch.auth_modes = (pr['auth_modes'] as unknown[]).filter(
          (m): m is string => typeof m === 'string',
        );
      }
      if (typeof pr['tool_plan_count'] === 'number') {
        patch.tool_plan_count = pr['tool_plan_count'] as number;
      }
      if (typeof pr['tool_plan_count'] === 'string') {
        const n = parseInt(pr['tool_plan_count'] as string, 10);
        if (!Number.isNaN(n)) patch.tool_plan_count = n;
      }
      if (typeof pr['final_tool_count'] === 'number') {
        patch.final_tool_count = pr['final_tool_count'] as number;
      }
      if (typeof pr['final_tool_count'] === 'string') {
        const n = parseInt(pr['final_tool_count'] as string, 10);
        if (!Number.isNaN(n)) patch.final_tool_count = n;
      }
      if (Array.isArray(pr['dropped_endpoints'])) {
        patch.dropped_endpoints = pr['dropped_endpoints'] as ReadonlyArray<unknown>;
      }
      if (Array.isArray(pr['composite_candidates'])) {
        patch.composite_candidates = pr['composite_candidates'] as ReadonlyArray<unknown>;
      }
      if (typeof pr['target_complexity'] === 'string') {
        patch.target_complexity = pr['target_complexity'] as string;
      }
      if (payload.status === 'completed' && payload.stage === 'F') {
        patch.terminal = true;
      }
      if (payload.status === 'failed' || payload.error !== undefined && payload.error !== null) {
        patch.terminal = true;
        if (payload.error?.code !== undefined) {
          patch.error_code = payload.error.code;
        }
      }
      if (Object.keys(patch).length > 0) {
        mergePartialState(jobId, patch);
      }
    } catch {
      // Malformed event — engine emits valid JSON but be forgiving of
      // chunked deliveries that split mid-JSON. Buffer is the caller's
      // responsibility; we just skip unparseable events.
    }
  }
}

/**
 * Drop entries older than TTL_MS. Called from every read/write so the
 * map stays bounded without a background sweeper task.
 */
function evictExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [jobId, state] of STATE) {
    if (state.updated_at < cutoff) STATE.delete(jobId);
  }
}

// TODO(phase-10): replace this in-memory Map with a Durable Object
// (Cloudflare-native, zero-config single-writer scope per jobId) or a
// Hyperdrive-fronted Postgres table. The Map only works in single-
// isolate workerd dev; production CF Workers scale across isolates and
// requests for the same jobId may land on different ones.
