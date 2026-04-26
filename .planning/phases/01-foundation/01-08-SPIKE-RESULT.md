---
phase: 01-foundation
plan: 08
task: 1 (modified scope)
type: spike-evidence
status: PASS
date_run: 2026-04-26T15:29:06Z
---

# SSE Spike Raw Result — Plan 01-08 (Modified Scope: Local Bun)

**Plan 08's original Task 2 deployed the spike to `mcpgen-sandbox` on real CF Workers
and ran the 90s acceptance test against that URL.** Per
[`01-PHASE-DEVIATIONS.md`](./01-PHASE-DEVIATIONS.md) revision 2 (CF migration deferred
to Phase 10), the spike runs locally instead. This file is the raw evidence for the
local Bun spike.

The CF-Workers spike is a **Phase-10 release gate** documented in
[`docs/decisions/004-local-bun-sse-spike.md`](../../../docs/decisions/004-local-bun-sse-spike.md)
under "Phase-10 release gates".

## Run details

| Field | Value |
| ----- | ----- |
| Date run (UTC) | `2026-04-26T15:29:06Z` |
| Stream duration | 90 seconds (server-side loop exit) |
| Client timeout | 100 seconds (`curl --max-time 100`) |
| Server runner | `wrangler dev --local --port 8787` |
| Wrangler version | 4.85.0 |
| Hyperdrive binding | emulated via `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (Neon dev branch DATABASE_URL); not exercised by spike route |
| compatibility_date | 2026-04-24 |
| compatibility_flags | `["nodejs_compat"]` |
| Route under test | `apps/api/src/routes/_spike/sse.ts` (unchanged from Plan 05) |
| Client | `apps/api/scripts/spike-sse.sh` (unchanged from Plan 05) |
| Server URL | `http://localhost:8787/_spike/sse` |
| Health endpoint pre-check | `GET /health` returned `{"status":"ok"}` |
| Spike client exit code | `0` |
| Total wall-clock duration | 90s (matches server's `Date.now() - start < 90_000` exit) |

## Acceptance criteria (per Plan 08 + objective)

| Criterion | Result |
| --------- | ------ |
| Server starts on `localhost:8787` | PASS |
| Client confirms event at `t≥80s` | PASS — event `id=8` received at `t=80s` (route emits 9 events at 10s intervals → last is at exactly t=80s) |
| Stream NOT terminated by runtime before `t=85s` | PASS — stream stays open until route's own loop-exit at t=90s |
| `spike-sse.sh` exits `0` | PASS |

## Captured event stream

Each line below is a delivered SSE frame received by `curl -N`. The `[t=Xs]`
prefix is the elapsed wall-clock time on the client at receipt.

```
[t=0s]  event: tick
[t=0s]  data: {"t_ms":0,"id":0}
[t=0s]  id: 0
[t=0s]  (blank — SSE record terminator)

[t=10s] event: tick
[t=10s] data: {"t_ms":10002,"id":1}
[t=10s] id: 1
[t=10s] (blank)

[t=20s] event: tick
[t=20s] data: {"t_ms":20004,"id":2}
[t=20s] id: 2
[t=20s] (blank)

[t=30s] event: tick
[t=30s] data: {"t_ms":30005,"id":3}
[t=30s] id: 3
[t=30s] (blank)

[t=40s] event: tick
[t=40s] data: {"t_ms":40006,"id":4}
[t=40s] id: 4
[t=40s] (blank)

[t=50s] event: tick
[t=50s] data: {"t_ms":50007,"id":5}
[t=50s] id: 5
[t=50s] (blank)

[t=60s] event: tick
[t=60s] data: {"t_ms":60009,"id":6}
[t=60s] id: 6
[t=60s] (blank)

[t=70s] event: tick
[t=70s] data: {"t_ms":70012,"id":7}
[t=70s] id: 7
[t=70s] (blank)

[t=80s] event: tick
[t=80s] data: {"t_ms":80013,"id":8}
[t=80s] id: 8
[t=80s] (blank)

Stream closed at t=90s
```

## Timing summary

| Event ID | Server-emitted `t_ms` | Client-received `t (s)` | Drift (ms vs ideal 10000ms gaps) |
| -------- | --------------------- | ----------------------- | -------------------------------- |
| 0 | 0      | 0  | — |
| 1 | 10002  | 10 | +2 |
| 2 | 20004  | 20 | +4 |
| 3 | 30005  | 30 | +5 |
| 4 | 40006  | 40 | +6 |
| 5 | 50007  | 50 | +7 |
| 6 | 60009  | 60 | +9 |
| 7 | 70012  | 70 | +12 |
| 8 | 80013  | 80 | +13 |

Cumulative `stream.sleep(10_000)` drift: +13ms over 80s — within expected
event-loop scheduling jitter on workerd.

## Server boot log (relevant lines)

```
 ⛅️ wrangler 4.85.0
───────────────────
Found a non-empty CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE variable for binding. Hyperdrive will connect to this database during local development.
Your Worker has access to the following bindings:
Binding                                           Resource                  Mode
env.HYPERDRIVE (REPLACE_WITH_HYPERDRIVE_ID)       Hyperdrive Config         local
env.ENVIRONMENT ("development")                   Environment Variable      local

⎔ Starting local server...
[wrangler:info] Ready on http://localhost:8787
```

No errors during the 90-second run.

## Confirmation

> **9 events received at 10s intervals; final event id=8 at t=80s; stream closed cleanly at t=90s on server-side loop exit.**

This satisfies **Phase-1 success criterion #7 (downgraded to local-Bun acceptance per
PHASE-DEVIATIONS.md revision 2)** for the SSE handler shape that Phase 8 BFF impl
will instantiate.

It does **NOT** satisfy the original ROADMAP §Phase-1 #7 ("Hono `streamSSE` 30-second
sub-request limit verified on real CF Workers") — that gate is moved to Phase 10
per the deviation doc, with explicit launch-criteria additions tracked in
[`docs/decisions/004-local-bun-sse-spike.md`](../../../docs/decisions/004-local-bun-sse-spike.md)
under "Phase-10 release gates".

## Pointers

- Decision record: [`docs/decisions/004-local-bun-sse-spike.md`](../../../docs/decisions/004-local-bun-sse-spike.md)
- Scope-pivot rationale: [`./01-PHASE-DEVIATIONS.md`](./01-PHASE-DEVIATIONS.md) revision 2
- Spike route: [`apps/api/src/routes/_spike/sse.ts`](../../../apps/api/src/routes/_spike/sse.ts)
- Client script: [`apps/api/scripts/spike-sse.sh`](../../../apps/api/scripts/spike-sse.sh)
- Phase-1 verification cross-reference: [`./01-PHASE-VERIFICATION.md`](./01-PHASE-VERIFICATION.md) row #7
