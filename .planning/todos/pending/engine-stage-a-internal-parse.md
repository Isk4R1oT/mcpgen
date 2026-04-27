# Cross-workstream ask: engine workstream Phase 2 — POST /internal/v1/parse Stage A endpoint

**Filed by:** Phase 8 ops workstream (Plan 04, 2026-04-28)
**Target:** engine workstream Phase 2 acceptance gate
**Q1 from:** `.planning/phases/08-auth-billing/08-RESEARCH.md` §20 Q1
**Contract:** `packages/contracts/src/engine-internal-api.ts` (pinned in Plan 01)

## What

Phase 8 Drift Watcher (`drift-watcher-check-v1`) needs a Stage-A-only parse
endpoint on the engine to compute parsed-IR baselines for drift detection.
Per RESEARCH §13 "HTTP shell-out, NOT TS port" decision: avoid duplicating
the prance[osv] + openapi-spec-validator stack in TypeScript.

Engine workstream MUST expose `POST /internal/v1/parse` per the Zod contract
pinned in `packages/contracts/src/engine-internal-api.ts`:

```python
# apps/generation-engine/src/api/internal_v1_parse.py
@router.post("/internal/v1/parse")
async def parse_only(req: ParseRequest, _ = Depends(verify_m2m_token)):
    raw_ir = await stage_a.parse(req.spec_url or req.spec_content)
    return ParseResponse(
        raw_ir=raw_ir.model_dump(),
        endpoint_count=len(raw_ir.endpoints),
        spec_format="openapi3",
    )
```

## Why

- Single source of truth for Stage A parsing (avoids drift between any TS port
  and the canonical Python source).
- Drift Watcher is a daily cron — no SLA urgency, can tolerate engine deploy
  lag during Phase 2 stabilisation.

## Until then

Phase 8 Drift Watcher (`apps/api/src/inngest/functions/drift-watcher-check.ts`)
is engineered to gracefully no-op when engine returns 502 / 503 OR
`AbortSignal.timeout(10_000)` fires:

```typescript
if (resp.status === 502 || resp.status === 503) {
  return { ok: false, reason: 'engine_unavailable' } as const;
}
// ... and on TimeoutError / AbortError catches, same return shape.
```

The function returns `{ skipped: 'engine_unavailable' }` and Inngest does
**not** retry. Drift detection silently no-ops until engine ships
`/internal/v1/parse`. Acceptable per Q1 daily-cron tolerance.

## Acceptance gate (engine workstream Phase 2)

- `POST /internal/v1/parse` accepts the pinned `ParseRequest` shape (one of
  `spec_url` or `spec_content` set, but not both)
- Returns `ParseResponse` shape with `raw_ir` matching `@mcpgen/ir`'s
  `RawIR` Zod (frozen contract)
- M2M auth required (verifies token audience matches the BFF M2M resource
  indicator `https://api.mcpgen.dev/m2m`)
- Total cost ~$0 (no LLM); deterministic
- Returns 502 / 503 if Stage A parser is unavailable for any reason — Phase 8
  Drift Watcher already treats those as "skip without retry"

## Test verification

When engine ships:
1. Trigger `drift-watcher-v1` from Inngest dev UI against a deployment whose
   `specs.spec_url` points at a real OpenAPI URL.
2. Expect `{ changed: false, baseline: 'seeded' }` on first run (specs.parsed_ir_jsonb was null).
3. Mutate the upstream spec cosmetically (add `description` text) — re-trigger.
4. Expect `{ changed: false }` (cosmetic-strip per Pitfall #34 + D-17).
5. Mutate the upstream spec semantically (add a parameter) — re-trigger.
6. Expect `{ changed: true, summary: '... 1 changed', drift_event_id: <ulid> }`
   AND a `drift_events` row with `status: 'pending'`.
