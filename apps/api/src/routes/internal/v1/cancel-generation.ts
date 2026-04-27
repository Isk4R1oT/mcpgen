// apps/api/src/routes/internal/v1/cancel-generation.ts
//
// M2M-protected endpoint that the engine calls when self-aborting (cost-cap
// ack from the OUTBOUND BFF→engine cancel call in cost-cap-enforcer.ts).
//
// Security:
//   - Mounted under internalApp sub-app with `requireM2M` guard (T-8-08
//     mitigation: user JWTs cannot trigger generation cancellation).
//   - Body validated against CancelGenerationRequest Zod schema from
//     packages/contracts/src/engine-internal-api.ts (Wave 1 contract pin).
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-13
//   - packages/contracts/src/engine-internal-api.ts (Wave 1 Zod schemas)

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db.js';
import { generations } from '@mcpgen/contracts/db-schema';
import { CancelGenerationRequest } from '@mcpgen/contracts';
import type { AuthContext } from '../../../middleware/auth.js';

export const cancelGenerationRoute = new Hono<{ Variables: { auth: AuthContext } }>();

cancelGenerationRoute.post('/', async (c) => {
  // requireM2M middleware applied at sub-app mount (apps/api/src/index.ts).
  const parsed = CancelGenerationRequest.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  }

  const updated = await db
    .update(generations)
    .set({ status: 'cancelled' })
    .where(eq(generations.id, parsed.data.job_id))
    .returning({ id: generations.id });

  if (updated.length === 0) {
    return c.json({ ok: false, reason: 'job_not_found' });
  }
  return c.json({ ok: true });
});
