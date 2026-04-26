# 004 — Local Bun SSE Spike (Phase-1 acceptance for D-15; CF deferred to Phase 10)

**Date:** 2026-04-26
**Status:** Accepted (Phase 1)
**Decision drivers:** D-15, FND-15, RESEARCH §"Pattern 3", Assumption A1, `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2

## Context

Phase 1 success criterion #7 originally required a Hono `streamSSE` 30-second
sub-request limit spike on real Cloudflare Workers (`mcpgen-sandbox` namespace).
Per `01-PHASE-DEVIATIONS.md` revision 2, all CF compute provisioning is deferred
to Phase 10 — the local-compute / cloud-services hybrid covers Phases 1–9 to
avoid 9+ weeks of account-state drift, billing surprises, and a fake "production"
environment that doesn't actually serve users.

Phase 1 still needs an empirical timing check on the SSE handler shape that
Phase 8 BFF impl will instantiate. We replace the CF-Workers spike with a
**local Bun spike** that runs the exact same `streamSSE` route under Wrangler's
local workerd runtime. This validates the handler emits events at the expected
timing on a Workers-runtime-equivalent, but **does NOT** prove the CF Workers
30-second `fetch()` budget per sub-request — that gap is explicitly tracked as
a Phase-10 release gate (see "Consequences" below).

## Spike result

Deployed `apps/api/src/routes/_spike/sse.ts` (the existing Plan 05 route, no
changes) under `wrangler dev --local --port 8787`, then ran the existing Plan 05
client `bash apps/api/scripts/spike-sse.sh http://localhost:8787/_spike/sse` for
100 seconds.

**Outcome:** PASS. 9 events received over the full 90-second stream window. Last
event (`id=8`) arrived at `t=80s`. Stream closed cleanly at `t=90s` per the
route's `Date.now() - start < 90_000` exit condition. No errors in the wrangler
log; `curl --max-time 100` exited 0.

### Transcript (event lines only, sanitised)

```
Connecting to http://localhost:8787/_spike/sse ...
[t=0s]  event: tick   data: {"t_ms":0,"id":0}      id: 0
[t=10s] event: tick   data: {"t_ms":10002,"id":1}  id: 1
[t=20s] event: tick   data: {"t_ms":20004,"id":2}  id: 2
[t=30s] event: tick   data: {"t_ms":30005,"id":3}  id: 3
[t=40s] event: tick   data: {"t_ms":40006,"id":4}  id: 4
[t=50s] event: tick   data: {"t_ms":50007,"id":5}  id: 5
[t=60s] event: tick   data: {"t_ms":60009,"id":6}  id: 6
[t=70s] event: tick   data: {"t_ms":70012,"id":7}  id: 7
[t=80s] event: tick   data: {"t_ms":80013,"id":8}  id: 8
Stream closed at t=90s
```

Event IDs 0–8 inclusive (9 events total) confirm:

- The handler runs to completion across the full 90s wall-clock window.
- Per-event `t_ms` drift stays within +13ms across 80s — `stream.sleep(10_000)`
  jitter is negligible on workerd.
- The stream terminates on the route's own loop-exit condition, not on a
  runtime-imposed cut.

### Server boot environment

- Runner: `wrangler dev --local --port 8787` (workerd 4.85.0, `compatibility_date 2026-04-24`, `nodejs_compat`)
- Hyperdrive binding: emulated locally via `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` pointing at the Neon dev branch (DATABASE_URL pulled from `.env.local`); the spike route does not touch Hyperdrive but the binding must validate at boot.
- `compatibility_flags = ["nodejs_compat"]`
- The route under test (`apps/api/src/routes/_spike/sse.ts`) is unchanged from Plan 05.

### Raw evidence

`apps/api/scripts/spike-sse.sh` output captured to
`.planning/phases/01-foundation/01-08-SPIKE-RESULT.md` (transcript with curl
progress lines stripped, plus boot context).

## Decision

**Use Hono `streamSSE` for the production SSE channel** (D-15 default path).
Phase 8 BFF implementation proceeds against `apps/api/src/routes/v1/jobs/stream.ts`
(frozen contract surface from Plan 03/05) using the same `streamSSE` pattern.
D-16 (Durable Objects WebSocket fallback) is documented as a contingency, NOT
the default path. We do not preemptively wire it.

This Phase-1 acceptance is via **local workerd**, not real CF Workers. The
real-CF spike is a Phase-10 release gate (see consequences).

## Consequences

### Positive

- Phase 8 BFF impl unblocked: `streamSSE` handler shape proven at the timing
  level we'll observe in normal generation pipeline runs (per-pass updates
  every 5–30s, total ~60–120s).
- `apps/api/src/routes/_spike/sse.ts` and `apps/api/scripts/spike-sse.sh` stay
  in the repo as the canonical re-spike capability for Phase 10.
- Local-only spike costs $0 (no CF deploy, no namespace, no spend).

### Gap (explicit)

**This spike does NOT prove CF Workers 30-second sub-request behavior.** workerd
in `--local` mode does not enforce the production CF runtime's per-`fetch()`
30-second cap. The behaviour MAY differ on real CF Workers in any of these
ways:

- The connection MAY be cut at t=30s by CF runtime even though `streamSSE`
  itself doesn't await a single 30s+ subrequest.
- Mid-stream HTTP/2 frame buffering MAY cause client-visible event delays not
  observed locally.
- `compatibility_flags` differences between workerd local and real CF Workers
  remote MAY surface (compat date 2026-04-24 should be identical, but flag-
  level divergence is documented in `wrangler` issues).

### Phase-10 release gates (added to launch criteria during Phase 10)

The following gates MUST be added to `packages/contracts/src/launch-criteria.ts`
(via paired decision-log entry per T-1-03) before Phase 10 closes:

1. **CF SSE 90s spike re-run on real CF Workers** — `mcpgen-sandbox`
   namespace, `wrangler deploy --name mcpgen-api-spike`, `bash apps/api/scripts/spike-sse.sh https://mcpgen-api-spike.<sandbox-host>.workers.dev/_spike/sse`,
   event at t=80s confirmed received OR D-16 (Inngest + Durable Object
   WebSocket fanout) wired and verified.

2. **Fly Machines auto-suspend cold-start measurement** — first-request P95
   < 8s OR pre-warm strategy documented and configured for the engine.

These two gates are NOT added to `launch-criteria.ts` in Phase 1 because doing
so would create runtime constants that are `false` for all of Phases 2–9 and
either (a) silently allow downstream code to ignore them or (b) hard-fail every
build. Phase 10 owns the gate addition AND the verification in the same
window.

### Re-spike triggers (Phase 10+)

Refresh this spike if any of the following occur:

- `wrangler` major version bump (currently 4.85.0)
- `hono` major version bump (currently 4.x)
- CF Workers `compatibility_date` major shift (currently 2026-04-24)
- CF Workers runtime breaking change announcement that mentions sub-request limits

## References

- `.planning/phases/01-foundation/01-08-SPIKE-RESULT.md` — raw output transcript
- `.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2 — scope-pivot rationale
- `.planning/phases/01-foundation/01-RESEARCH.md` §"Pattern 3" — CF docs argument that "no time limit on individual subrequests" + CPU time != wall time
- `.planning/phases/01-foundation/01-CONTEXT.md` D-15 — 90s spike acceptance
- `apps/api/src/routes/_spike/sse.ts` — the route under test
- `apps/api/scripts/spike-sse.sh` — the client harness
