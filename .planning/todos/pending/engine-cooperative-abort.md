---
title: "chore(engine): support mid-pass cancel via cooperative abort"
workstream: engine
priority: phase-5-acceptance-gate
cross_ws_origin: 08-auth-billing Wave 3 (cost-cap-enforcer cancel contract)
filed_at: 2026-04-26
filed_by: ops (Phase 8 Plan 03)
---

# Engine: support mid-pass cancel via cooperative abort

## Context

Phase 8 Wave 3 ships the BFF half of cost-cap enforcement (D-13):

- `apps/api/src/inngest/functions/cost-cap-enforcer.ts` calls
  `POST ${ENGINE_ENDPOINT}/internal/v1/cancel-generation` with M2M Bearer
  whenever `cumulative_cost_usd > cap` (free $0.50 / pro $2.00 from
  `LAUNCH_CRITERIA.COST_CAP_{FREE,PRO}_USD`).

The contract is pinned in `packages/contracts/src/engine-internal-api.ts`
(`CancelGenerationRequest` Zod schema, Wave 1 deliverable):

```ts
export const CancelGenerationRequest = z.object({
  job_id: z.string().min(1),
  reason: CancelReason,             // 'cost_cap_exceeded' | 'user_requested' | 'timeout'
  cap_usd: z.number().nonnegative().optional(),
});
```

## What the engine must support

The engine's `/internal/v1/cancel-generation` handler MUST honor cancel
signals **mid-pass** — not after the current pass completes. Per Phase 8
CONTEXT.md "Specifics" → "Cost-cap kill":

> Cost-cap kill is "in-flight cancel," not "post-hoc reject" — engine MUST
> honor the cancel signal mid-pass; otherwise the user is billed for already-
> spent tokens beyond the cap.

### Implementation suggestion

Cooperative abort via `asyncio.CancelledError` or an async context with
cancellation tokens propagated into PydanticAI calls. Each pass should:

1. Register a per-`job_id` cancellation token at the orchestrator boundary.
2. Poll the token between sub-tasks (e.g. between Pass-2 per-tool LLM calls).
3. On cancellation: write a partial QualityReport to DB, persist
   `generations.status='cancelled'` (or surface the existing `'cost_capped'`
   set by the BFF), and return.

The BFF already sets `generations.status='cost_capped'` immediately after the
cancel call returns 200; the engine's job is to STOP spending LLM tokens, not
to set the row.

## Acceptance gate (Phase 5)

Add a Phase 5 verification check to `08-RESEARCH.md §20 Q2` and the engine
Phase plan:

> "Engine cancel signal aborts current pass within 5s of receipt."

Verification: integration test that
1. Submits a generation via `POST /api/v1/generate`.
2. After Pass-1 completes (≈$0.30 spent), POSTs to the engine's
   `/internal/v1/cancel-generation` endpoint with `reason='cost_cap_exceeded'`.
3. Asserts `cumulative_cost_usd` does not exceed the cap by more than
   $0.10 (one tool's worth of pass-2 work, since Pass-2 is per-tool parallel).

## Soft-cap behavior until cooperative abort lands

Until the engine ships cooperative abort, the cost cap acts as a **soft cap**:
- BFF detects threshold cross and calls cancel.
- Engine's current pass completes anyway (no abort signal honored).
- Typical overage: <$0.10 per generation (one extra pass of work).
- Acceptable for MVP since 30-pass-completion overage is bounded; documented
  in `docs/decisions/2026-04-26-cost-cap-thresholds.md` "Why $2.00 (Pro)" +
  the consequences section.

## References

- `.planning/phases/08-auth-billing/08-RESEARCH.md` §20 Q2
- `.planning/phases/08-auth-billing/08-CONTEXT.md` "Specifics" → "Cost-cap kill"
- `packages/contracts/src/engine-internal-api.ts` (Wave 1 contract pin)
- `apps/api/src/inngest/functions/cost-cap-enforcer.ts` (Wave 3 BFF half)
- `docs/decisions/2026-04-26-cost-cap-thresholds.md` (Wave 3 D-13 paired-decision)
