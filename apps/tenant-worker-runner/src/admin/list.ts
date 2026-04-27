// apps/tenant-worker-runner/src/admin/list.ts
//
// GET /admin/list — returns the list of currently supervised tenant processes.

import type { Context } from 'hono';

import { listManaged } from '../supervisor.js';

export function listHandler(c: Context): Response {
  return c.json({ managed: listManaged() });
}
