// apps/api/src/routes/internal/v1/sse-callback.ts
//
// CTRL-06 / D-13: M2M-protected engine→BFF SSE callback ingestion.
//
// What it does:
//   1. Persist the callback envelope to pending_callbacks for SSE replay
//      (D-09 Phase 1 carry-forward — clients use Last-Event-ID to resume).
//   2. If event.partial_result.type === 'cost_update', emit Inngest event
//      'generation/cost.updated' → triggers cost-cap-enforcer-v1 (D-13).
//
// Security:
//   - Mounted under internalApp sub-app with `requireM2M` guard (T-8-07
//     mitigation: only valid M2M JWT can spoof cost-update events).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-13
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §12

import { Hono } from 'hono';
import { ulid } from 'ulid';
import { db } from '../../../db.js';
import { pending_callbacks } from '@mcpgen/contracts/db-schema';
import { inngest } from '../../../inngest/client.js';
import type { AuthContext } from '../../../middleware/auth.js';

interface SsePartialResult {
  type?: string;
  pass_name?: string;
  pass_cost_usd?: number;
  cumulative_cost_usd?: number;
}

interface SseEvent {
  job_id: string;
  event_id?: string;
  stage: string;
  status: string;
  partial_result?: SsePartialResult;
}

interface SseCallbackBody {
  event: SseEvent;
}

export const sseCallbackRoute = new Hono<{ Variables: { auth: AuthContext } }>();

sseCallbackRoute.post('/', async (c) => {
  // requireM2M middleware applied at sub-app mount (apps/api/src/index.ts).
  const body = await c.req.json<SseCallbackBody>();
  const event = body.event;

  // Persist for SSE replay (Phase 1 D-09 contract).
  await db
    .insert(pending_callbacks)
    .values({
      job_id: event.job_id,
      event_id: event.event_id ?? ulid(),
      stage: event.stage,
      status: event.status,
      attempted_count: 0,
    })
    .onConflictDoNothing();

  // Cost-update events trigger the enforcer (D-13).
  if (
    event.partial_result?.type === 'cost_update' &&
    typeof event.partial_result.cumulative_cost_usd === 'number'
  ) {
    await inngest.send({
      name: 'generation/cost.updated',
      data: {
        jobId: event.job_id,
        passName: event.partial_result.pass_name ?? 'unknown',
        cumulativeCostUsd: event.partial_result.cumulative_cost_usd,
      },
    });
  }

  return c.json({ ok: true });
});
