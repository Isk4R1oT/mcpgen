// apps/web/src/lib/api/warmup.ts
//
// Fire-and-forget LLM cache warmup. Hits the BFF /api/v1/warmup proxy
// which fans out to the engine's six pass-specific system prompts.
//
// Usage pattern: call once per page from a `useEffect` on mount when
// the user is on a screen that PRECEDES generation (landing,
// /generate paste form). Don't await — the warmup takes ~1.5–2 s in
// parallel and returns immediately on the engine, so the user never
// notices the round-trip. By the time they click "make it" 5–30 s
// later the upstream provider's prefix cache has the system prompts
// hot.
//
// Idempotency / safety:
//   - The endpoint is anon-allowed (no session needed).
//   - The engine itself runs a 4-min keep-warm loop; this client call
//     is just a "nudge" that snaps the schedule forward when a real
//     user is about to generate.
//   - We swallow all errors; warmup is purely a latency optimization
//     and must never surface an error to the user.

const WARMUP_ENDPOINT = '/api/v1/warmup';
const TIMEOUT_MS = 15_000;

let inflight: Promise<void> | null = null;
let lastFiredAt = 0;
const REFIRE_GAP_MS = 30_000; // don't spam the engine — once per 30 s is enough

/**
 * Fire warmup fire-and-forget. Multiple simultaneous calls share one
 * in-flight request, and successive calls within `REFIRE_GAP_MS` are
 * dropped (engine already has the cache hot from the prior call).
 *
 * Returns the Promise so a caller can await it for telemetry, but
 * production code should NOT await — let it run in the background.
 */
export function fireWarmup(): Promise<void> {
  const now = Date.now();
  if (inflight !== null) return inflight;
  if (now - lastFiredAt < REFIRE_GAP_MS) return Promise.resolve();
  lastFiredAt = now;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  inflight = (async (): Promise<void> => {
    try {
      const bffBase = (typeof window !== 'undefined' ? window.location.origin : '') ?? '';
      await fetch(`${bffBase}${WARMUP_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: ac.signal,
        // Do not propagate cookies; warmup is anonymous and we don't
        // want to consume an anon-session slot for a non-generation hit.
        credentials: 'omit',
      });
    } catch {
      // Swallow — warmup is best-effort. The next user request will
      // either hit a partially-warm cache (still better than cold) or
      // a fully-cold one (same as before this code existed).
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();

  return inflight;
}
