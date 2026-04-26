// apps/api/src/index.ts
//
// Hono BFF entry point — frozen contract surface (CTRL-01).
// Phase 1: 501 stubs for /api/v1/generate + SSE streamSSE stub for /api/v1/jobs/:id/stream.
// Phase 8 lands the real implementations.
//
// References:
//   - docs/mcpgen-architecture.md §5.8 (HTTP API contract)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-09 (SSE Last-Event-ID resume)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-15 (90s SSE spike)

import { Hono } from 'hono';
import { LAUNCH_CRITERIA } from '@mcpgen/contracts';

import { generateRoute } from './routes/v1/generate.js';
import { jobsStreamRoute } from './routes/v1/jobs/stream.js';
import { spikeSseRoute } from './routes/_spike/sse.js';

interface Bindings {
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ status: 'ok' }));

// Diagnostic endpoint — proves frozen launch-criteria constants reach runtime.
// Useful in CI smoke tests + Phase 9 readiness checks.
app.get('/health/launch-criteria', (c) => c.json(LAUNCH_CRITERIA));

app.route('/api/v1/generate', generateRoute);
app.route('/api/v1/jobs', jobsStreamRoute);
app.route('/_spike/sse', spikeSseRoute);

export default app;
