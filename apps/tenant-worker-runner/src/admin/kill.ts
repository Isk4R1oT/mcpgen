// apps/tenant-worker-runner/src/admin/kill.ts
//
// POST /admin/kill — body: { scriptName }
// Stops the supervised Bun process; nullifies deployments.local_port so
// dispatch's tenant lookup returns 404 for the now-offline tenant.

import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { deployments } from '@mcpgen/contracts';

import { db } from '../db.js';
import { stopManaged } from '../supervisor.js';

interface KillBody {
  readonly scriptName?: string;
}

export async function killHandler(c: Context): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as KillBody;
  if (!body.scriptName) {
    return c.json({ error: 'missing_script_name' }, 400);
  }
  const ok = stopManaged(body.scriptName);
  if (!ok) {
    return c.json({ error: 'not_managed', scriptName: body.scriptName }, 404);
  }
  // Best-effort DB update — failure here does not block the kill response.
  try {
    await db
      .update(deployments)
      .set({ local_port: null })
      .where(eq(deployments.cf_worker_name, body.scriptName));
  } catch {
    // Tests that mock the DB or run without DATABASE_URL still get a clean
    // kill confirmation. The deployment row will reconcile on next admin call.
  }
  return c.json({ killed: true, scriptName: body.scriptName });
}
