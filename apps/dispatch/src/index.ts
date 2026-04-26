// apps/dispatch/src/index.ts
//
// CF Workers for Platforms dispatch worker. Phase 1: 404 stub for any tenant
// lookup (no tenants exist yet). Phase 6 implements real routing:
//   1. Resolve tenant Worker name from request (host / path / header)
//   2. Forward via env.DISPATCH_NAMESPACE.get(tenantWorkerName).fetch(req)
//   3. Return response with usage_event tagged on the way out
//
// References:
//   - docs/mcpgen-architecture.md §6.1 (Dispatch Worker)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-08 (3-namespace strategy)

import { Hono } from 'hono';

interface Bindings {
  DISPATCH_NAMESPACE: DispatchNamespace;
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'dispatch' }));

// Phase 1 stub — every other path returns 404 because no tenant Workers
// have been deployed yet. Phase 6 replaces this with the real router.
app.all('*', (c) => c.json({ error: 'not_implemented_phase_6', path: c.req.path }, 404));

export default app;
