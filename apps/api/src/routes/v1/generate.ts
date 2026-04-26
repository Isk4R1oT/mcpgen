// apps/api/src/routes/v1/generate.ts
//
// CTRL-01 frozen contract surface. Phase 1: returns 501 with the frozen contract shape.
// Phase 8 implements the real generation kickoff (Inngest job trigger + SSE wiring).
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (HTTP API contract)
//   - packages/contracts/src/idempotency.ts (Idempotency-Key header convention)

import { Hono } from 'hono';
import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

export const generateRoute = new Hono();

generateRoute.post('/', (c) => {
  const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);
  // Phase 1: contract is frozen; impl lands in Phase 8.
  return c.json(
    {
      error: 'not_implemented_phase_8',
      phase: 1,
      requested_idempotency_key: idempotencyKey,
      contract_version: '1.0.0',
    },
    501,
  );
});
