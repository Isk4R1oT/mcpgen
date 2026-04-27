// apps/tenant-worker-runner/src/admin/spawn.ts
//
// POST /admin/spawn — body: { scriptName, bundlePath, tenantId?, authMode?, generationId? }
// Allocates port, spawns Bun process, optionally upserts a deployments row.
//
// Per D-13: mcpgen deploy CLI calls this endpoint to register a new bundle.

import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { ulid } from 'ulid';

import { deployments } from '@mcpgen/contracts';

import { db } from '../db.js';
import { allocatePort, releasePort } from '../port-allocator.js';
import { isManaged, startManaged } from '../supervisor.js';

interface SpawnBody {
  readonly scriptName?: string;
  readonly bundlePath?: string;
  readonly tenantId?: string;
  readonly authMode?: 'passthrough' | 'stored' | 'oauth';
  readonly generationId?: string;
}

export async function spawnHandler(c: Context): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as SpawnBody;
  if (!body.scriptName || !body.bundlePath) {
    return c.json({ error: 'missing_required', expected: ['scriptName', 'bundlePath'] }, 400);
  }
  if (isManaged(body.scriptName)) {
    return c.json({ error: 'already_managed', scriptName: body.scriptName }, 409);
  }

  const port = allocatePort();
  const tenantId = body.tenantId ?? body.scriptName;
  const authMode = body.authMode ?? 'passthrough';

  let pid: number;
  try {
    const result = startManaged({
      scriptName: body.scriptName,
      port,
      tenantId,
      authMode,
      bundlePath: body.bundlePath,
    });
    pid = result.pid;
  } catch (err) {
    releasePort(port);
    return c.json({ error: 'spawn_failed', detail: String(err) }, 500);
  }

  // Upsert into deployments only if a generationId is supplied — Wave 5
  // mcpgen deploy provides it. Tests can omit it and just verify the spawn.
  if (body.generationId) {
    try {
      const existing = await db
        .select()
        .from(deployments)
        .where(eq(deployments.cf_worker_name, body.scriptName))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(deployments).values({
          id: ulid() as unknown as string,
          generation_id: body.generationId,
          cf_worker_name: body.scriptName,
          dispatch_namespace: 'mcpgen-sandbox',
          url: `http://localhost:${port}`,
          auth_mode: authMode,
          local_port: port,
        });
      } else {
        await db
          .update(deployments)
          .set({
            local_port: port,
            url: `http://localhost:${port}`,
            auth_mode: authMode,
          })
          .where(eq(deployments.cf_worker_name, body.scriptName));
      }
    } catch (err) {
      // The process is already running — we surface the DB error but do not
      // kill the child; the caller can retry the deployments upsert.
      return c.json(
        {
          pid,
          port,
          scriptName: body.scriptName,
          url: `http://localhost:${port}`,
          warning: 'deployments_upsert_failed',
          detail: String(err),
        },
        201,
      );
    }
  }

  return c.json(
    {
      pid,
      port,
      scriptName: body.scriptName,
      url: `http://localhost:${port}`,
    },
    201,
  );
}
