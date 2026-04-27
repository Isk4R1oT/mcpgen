// apps/tenant-worker-runner/src/index.ts
//
// Phase 6 Wave 2 supervisor entry — Bun + Hono on localhost:8788.
// Spawns one Bun child process per active deployment on localhost:8790+.
// Crash-restart with bounded loop budget (5 in 60s) per supervisor.ts.
//
// Admin endpoints (called by mcpgen deploy CLI):
//   POST /admin/spawn  — register a new bundle, allocate next-free port 8790+
//   POST /admin/kill   — stop a managed process
//   GET  /admin/list   — list currently managed processes
//
// References:
//   - .planning/phases/06-runtime-plane/06-CONTEXT.md D-04 (Bun child-process model)
//   - .planning/phases/06-runtime-plane/06-CONTEXT.md D-13 (mcpgen deploy semantics)
//   - .planning/phases/06-runtime-plane/06-RESEARCH.md §"Don't Hand-Roll" (Bun.spawn)

import { Hono } from 'hono';

import { hostHeaderValidation } from '@mcpgen/runtime';

import { killHandler } from './admin/kill.js';
import { listHandler } from './admin/list.js';
import { spawnHandler } from './admin/spawn.js';

const app = new Hono();
const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim());

// Host-header validation FIRST (D-15 / pitfall #15) — DNS-rebinding mitigation
// applies to /health and admin endpoints alike. localhost-only bind in dev;
// Phase 9 wires admin bearer auth on top.
app.use('*', hostHeaderValidation(allowedHosts));

app.get('/health', (c) => c.json({ status: 'ok', service: 'tenant-worker-runner' }));

app.post('/admin/spawn', spawnHandler);
app.post('/admin/kill', killHandler);
app.get('/admin/list', listHandler);

app.all('*', (c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// Bun (Phase 6):
export default { port: 8788, fetch: app.fetch };
// Phase 10 (CF Workers — same source, different export form):
// export default app;
