// apps/inngest-dev/src/index.ts
//
// Phase 6 Wave 4 (per CTRL-09) — Bun + Inngest serve handler. 4 stable-id
// functions registered. Phase-10 swap: same functions registered against
// Inngest Cloud (not the dev server); stable IDs mean zero rename = zero
// orphans.
//
// INFO-3 / 06-PATTERNS.md line 1004: pinned to `inngest/bun` — single
// import path, no `inngest/hono` fallback hedge.

import { Hono } from 'hono';
import { serve } from 'inngest/bun';

import { hostHeaderValidation } from '@mcpgen/runtime';

import { usageEventsIngest } from './functions/usage-events-ingest.js';
import { usageFallbackDrain } from './functions/usage-fallback-drain.js';
import { usageReconciler } from './functions/usage-reconciler.js';
import { warmKeepActiveTenants } from './functions/warm-keep-active-tenants.js';
import { inngest } from './inngest-client.js';

const app = new Hono();
const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim());

app.get('/health', (c) => c.json({ status: 'ok', service: 'inngest-dev' }));
app.use('/api/inngest', hostHeaderValidation(allowedHosts));

const handler = serve({
  client: inngest,
  functions: [
    usageEventsIngest,
    usageFallbackDrain,
    usageReconciler,
    warmKeepActiveTenants,
  ],
});
app.all('/api/inngest', (c) => handler(c.req.raw));

export default { port: 3030, fetch: app.fetch };
