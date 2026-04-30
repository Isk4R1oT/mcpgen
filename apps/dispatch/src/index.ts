// apps/dispatch/src/index.ts
//
// Phase 6 — real Bun + Hono dispatch. Replaces the Phase-1 404 stub.
// 6 middleware in order: hostHeaderValidation -> auth -> rateLimit ->
// tenantLookup -> capabilityGate -> smartIdFuzz, then forward to localhost:879N.
//
// Per CONTEXT D-01, D-02, D-03, D-11, D-15.
// References:
//   - docs/mcpgen-architecture.md §6.1 (Dispatch Worker)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-08 (3-namespace strategy)

import { Hono } from 'hono';

import { sentryOptionsFor, withSentry } from './instrumentation.js';
import { authMiddleware } from './middleware/auth.js';
import { capabilityGate } from './middleware/capabilityGate.js';
import { hostHeaderValidation } from './middleware/hostHeaderValidation.js';
import { rateLimit } from './middleware/rateLimit.js';
import { smartIdFuzz } from './middleware/smartIdFuzz.js';
import { tenantLookup } from './middleware/tenantLookup.js';
import { forwardToTenant } from './routing/forward.js';

interface Bindings {
  DISPATCH_NAMESPACE: DispatchNamespace;
  HYPERDRIVE: Hyperdrive;
  SENTRY_DSN?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Bindings }>();
const allowedHosts = (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim());

// Mount host-header validation FIRST so DNS-rebinding attacks cannot reach
// even /health (per plan §threat_model T-6-15). The auth/rateLimit stack only
// applies to /t/* tenant routes — /health needs only the host check.
app.use('*', hostHeaderValidation(allowedHosts));      // D-15 / pitfall #15

app.get('/health', (c) => c.json({ status: 'ok', service: 'dispatch' }));

app.use('/t/*', authMiddleware);                       // Wave 1 stub; Phase 8 wires real Logto JWT
app.use('/t/*', rateLimit);                            // Wave 1 in-memory bucket
app.use('/t/*', tenantLookup);                         // D-02 5-min TTL cache + Postgres fallback
app.use('/t/*', capabilityGate);                       // D-11 protocolVersion negotiator
app.use('/t/*', smartIdFuzz);                          // D-03 / pitfall #1 cross-tenant fuzz
app.all('/t/:name/*', forwardToTenant);                // multi-port proxy
app.all('*', (c) => c.json({ error: 'not_a_tenant_path', path: c.req.path }, 404));

// Phase 9 (Pitfall #3 / D-03): wire Sentry init via the shared helper.
// `@sentry/cloudflare` `withSentry` expects an `ExportedHandler` ({fetch}),
// not Bun's `{port, fetch}` shape — so we wrap an inner handler and attach
// `port` to the wrapped result so Bun still picks up the port-export hint.
// Empty `SENTRY_DSN` → SDK no-op (preserved from apps/api/src/instrumentation.ts).
const sentryWrappedHandler = withSentry(
  (env: Bindings) => sentryOptionsFor(env),
  { fetch: app.fetch } satisfies ExportedHandler<Bindings>,
);

// Bun (Phase 6):
export default { port: 8789, fetch: sentryWrappedHandler.fetch };
// Phase 10 (CF Workers — same source, different export form):
// export default sentryWrappedHandler;
