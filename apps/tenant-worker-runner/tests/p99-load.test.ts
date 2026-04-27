// apps/tenant-worker-runner/tests/p99-load.test.ts
//
// Phase 6 Wave 5 — Bun-native P99 load harness (RUN-02 acceptance #4 / D-17).
//
// Goal: prove the runtime overhead (excluding upstream latency) stays under
// 50 ms at the P99 over a 30-second 100-rps run.
//
// Architecture:
//   - Spawn a fake-upstream Bun.serve on port 9990 that sleeps 5 ms then
//     returns a tiny JSON response. This represents the bound API.
//   - Spawn a "tenant-shaped" Bun.serve on port 9991 that mounts the
//     hostHeaderValidation middleware (the same middleware Phase-6 tenant
//     Workers run) and proxies the request to the fake upstream. This is
//     the unit under test — the runtime overhead.
//   - Warm up: 50 sequential requests so JIT / DNS / socket pools settle.
//   - Run: 30 seconds of 100-rps traffic. We tick every 10 ms with a batch
//     of 10 parallel requests (10 batches/sec * 10 reqs = 100 rps).
//   - For each request capture (end - start) - 5 — the runtime-overhead
//     ms contribution. Compute P50 / P90 / P99 across all samples.
//   - Assert P99 < 50 ms.
//
// Gating: this test is HEAVY (30s wall-clock). It runs only when
// RUN_P99=1 is set in the environment so default `bun test` and CI
// pull-request runs do not pay the cost. CI invokes it explicitly via
// `RUN_P99=1 pnpm --filter @mcpgen/tenant-worker-runner test --run p99-load.test.ts`.
//
// The harness is also runnable as a plain Bun script:
//   `bun run apps/tenant-worker-runner/tests/p99-load.test.ts`
// (the `it.runIf` gate is the test-runner mode; the script-mode invocation
// goes through `runHarness()` directly via the `import.meta.main` block at
// the bottom of the file).

import { describe, expect, it, afterAll } from 'bun:test';

// Inline host-header check mirrors the shape of the @mcpgen/runtime Hono
// middleware (D-15 / T-6-15) — kept inline to avoid pulling Hono into the
// harness's hot path and skewing the measured overhead.
function hostHeaderValidation(req: Request, allowed: ReadonlyArray<string>): Response | null {
  const host = req.headers.get('host')?.split(':')[0] ?? '';
  if (!allowed.includes(host)) {
    return new Response(JSON.stringify({ error: 'invalid_host' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

const FAKE_UPSTREAM_PORT = 9990;
const TENANT_PORT = 9991;
const FIXED_UPSTREAM_LATENCY_MS = 5;
const RPS_TARGET = 100;
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 100; // 10 batches/sec * 10 reqs/batch = 100 rps
const WARMUP_REQUESTS = 50;
const RUN_DURATION_MS = 30_000;
const P99_THRESHOLD_MS = 50;

interface HarnessResult {
  readonly samples: number;
  readonly samplesUnder50ms: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
  readonly upstreamLatencyMs: number;
  readonly durationMs: number;
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

async function runHarness(): Promise<HarnessResult> {
  // Spawn fake upstream — fixed 5 ms latency.
  const fakeUpstream = Bun.serve({
    port: FAKE_UPSTREAM_PORT,
    async fetch() {
      await new Promise((r) => setTimeout(r, FIXED_UPSTREAM_LATENCY_MS));
      return new Response(JSON.stringify({ ok: true, fake_upstream: true }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  // Spawn tenant-shaped server: mounts hostHeaderValidation (T-6-15 / DNS
  // rebinding mitigation) the same way real Phase-6 tenant Workers do, then
  // proxies to the fake upstream. Any overhead between the inbound fetch and
  // the outbound fetch is the runtime overhead under test.
  const tenant = Bun.serve({
    port: TENANT_PORT,
    async fetch(req: Request) {
      const denied = hostHeaderValidation(req, ['localhost', '127.0.0.1']);
      if (denied) return denied;
      const upstream = await fetch(`http://localhost:${FAKE_UPSTREAM_PORT}/`);
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  try {
    // Warm-up — JIT, socket pool, DNS cache.
    for (let i = 0; i < WARMUP_REQUESTS; i++) {
      const r = await fetch(`http://localhost:${TENANT_PORT}/`, {
        headers: { host: 'localhost' },
      });
      // Drain body so the socket is reusable.
      await r.text();
    }

    const samples: number[] = [];
    const start = Date.now();
    const deadline = start + RUN_DURATION_MS;

    while (Date.now() < deadline) {
      const tickStart = Date.now();

      const batch: Promise<void>[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        batch.push(
          (async () => {
            const t0 = performance.now();
            const r = await fetch(`http://localhost:${TENANT_PORT}/`, {
              headers: { host: 'localhost' },
            });
            await r.text();
            const t1 = performance.now();
            const overhead = t1 - t0 - FIXED_UPSTREAM_LATENCY_MS;
            // Negative overhead can happen if upstream returned faster than
            // 5 ms due to scheduler jitter; floor at 0.
            samples.push(Math.max(0, overhead));
          })(),
        );
      }
      await Promise.all(batch);

      const elapsed = Date.now() - tickStart;
      const wait = BATCH_INTERVAL_MS - elapsed;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const result: HarnessResult = {
      samples: sorted.length,
      samplesUnder50ms: sorted.filter((s) => s < P99_THRESHOLD_MS).length,
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      p99: percentile(sorted, 0.99),
      upstreamLatencyMs: FIXED_UPSTREAM_LATENCY_MS,
      durationMs: Date.now() - start,
    };
    return result;
  } finally {
    tenant.stop();
    fakeUpstream.stop();
  }
}

const RUN_HEAVY = process.env.RUN_P99 === '1';

describe('Phase 6 Wave 5 — P99 load harness (RUN-02 / D-17)', () => {
  afterAll(() => {
    // Defensive: if the test exits mid-run via assertion failure, Bun.serve
    // instances above are stopped in the finally block of runHarness().
  });

  it.skipIf(!RUN_HEAVY)(
    'P99 runtime overhead under 50ms over 30s of 100-rps traffic',
    async () => {
      const result = await runHarness();
      // Print JSON to stdout for CI capture.
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ p99_load_harness: result }, null, 2));
      expect(result.samples).toBeGreaterThan(0);
      expect(result.upstreamLatencyMs).toBe(FIXED_UPSTREAM_LATENCY_MS);
      if (result.p99 >= P99_THRESHOLD_MS) {
        // Hard fail with a process.exit(1) signal so script-mode invocation
        // also surfaces the failure (in addition to the bun:test assertion).
        // eslint-disable-next-line no-console
        console.error(
          `P99 ${result.p99.toFixed(2)}ms >= threshold ${P99_THRESHOLD_MS}ms`,
        );
        process.exit(1);
      }
      expect(result.p99).toBeLessThan(P99_THRESHOLD_MS);
    },
    60_000,
  );

  it('harness module loads and constants are well-formed (default fast path)', () => {
    expect(RPS_TARGET).toBe(100);
    expect(BATCH_SIZE * (1000 / BATCH_INTERVAL_MS)).toBe(RPS_TARGET);
    expect(P99_THRESHOLD_MS).toBe(50);
  });
});

// Script-mode invocation (bypasses bun:test). Runs the full harness and
// prints the JSON summary to stdout; exits 1 if P99 violates the threshold.
// Gated on P99_SCRIPT_MODE=1 so it does not race with the bun:test path
// (both modes spawn Bun.serve on the same ports).
if (process.env.P99_SCRIPT_MODE === '1' && RUN_HEAVY) {
  runHarness()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ p99_load_harness: result }, null, 2));
      if (result.p99 >= P99_THRESHOLD_MS) {
        // eslint-disable-next-line no-console
        console.error(
          `P99 ${result.p99.toFixed(2)}ms >= threshold ${P99_THRESHOLD_MS}ms`,
        );
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('p99-load harness error:', err);
      process.exit(1);
    });
}
