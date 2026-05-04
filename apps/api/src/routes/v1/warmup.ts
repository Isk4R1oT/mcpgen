// apps/api/src/routes/v1/warmup.ts
//
// Anon-allowed BFF route that proxies the engine's POST /api/v1/warmup
// endpoint. The web app fires this fire-and-forget when the user lands
// on /generate (paste form) so the OpenRouter prefix cache is populated
// before they click "make it" 5-30s later.
//
// Why anon-allowed: warmup is a latency optimization for ALL users
// including unauthenticated ones running the anon hero flow. The engine
// itself runs the keep-warm loop on a 4-min interval anyway, so this
// endpoint is mostly a "nudge" that snaps the schedule forward when a
// real user is about to generate — it doesn't unlock any privileged
// state.
//
// Why thin proxy and not local cache: warmup state lives entirely in
// the engine's in-process keep-warm task and the upstream provider's
// prefix cache. The BFF has nothing useful to cache here.

import { Hono } from 'hono';

interface Bindings {
  ENGINE_ENDPOINT?: string;
}

export const warmupRoute = new Hono<{ Bindings: Bindings }>();

interface EngineWarmupResponse {
  readonly targets?: ReadonlyArray<{
    readonly name: string;
    readonly elapsed_ms: number;
    readonly prompt_tokens: number | null;
    readonly cached_tokens: number | null;
    readonly error: string | null;
  }>;
  readonly summary?: {
    readonly target_count: number;
    readonly error_count: number;
    readonly cached_tokens_total: number;
    readonly prompt_tokens_total: number;
  };
}

warmupRoute.post('/', async (c) => {
  const engineEndpoint = c.env.ENGINE_ENDPOINT ?? 'http://localhost:8000';

  // Short timeout — warmup parallel-fires 6 minimal LLM calls. ~10s p95
  // when the upstream provider is healthy. If the engine is slow to
  // respond it's fine to bail; the next user request will warm the
  // cache anyway.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);

  try {
    const res = await fetch(`${engineEndpoint}/api/v1/warmup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return c.json(
        {
          ok: false,
          error: 'engine_warmup_failed',
          status: res.status,
        },
        502,
      );
    }

    const body = (await res.json()) as EngineWarmupResponse;
    return c.json(
      {
        ok: true,
        summary: body.summary ?? null,
        targets: body.targets ?? [],
      },
      200,
    );
  } catch (err) {
    clearTimeout(timer);
    return c.json(
      {
        ok: false,
        error: 'engine_unreachable',
        error_message: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  }
});
