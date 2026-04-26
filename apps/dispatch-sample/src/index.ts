// apps/dispatch-sample/src/index.ts
//
// Hand-coded sample tenant Worker — Phase 6 dispatches against this; Phase 4
// codegen MUST emit identical shape.
//
// References:
//   - docs/mcpgen-stage-e-design.md §2 (file tree)
//   - docs/mcpgen-stage-e-design.md §5.1 (passthrough auth)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-04 (MCP SDK v1 pin)
//   - .planning/phases/01-foundation/01-RESEARCH.md Open Question 4 (sample MUST go through @mcpgen/runtime)
//
// Three hand-coded tools per CONTEXT specifics: customers_search, charges_fetch,
// subscriptions_list. Phase 1 = stubs; the runtime emits "(sample stub) ..."
// strings via @mcpgen/runtime stub factory.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import type { Runtime } from '@mcpgen/runtime';
import { createStubRuntime } from '@mcpgen/runtime';

import { authMiddleware } from './auth/middleware.js';
import { chargesFetchHandler } from './tools/charges_fetch.js';
import { customersSearchHandler } from './tools/customers_search.js';
import { subscriptionsListHandler } from './tools/subscriptions_list.js';

interface Env {
  USAGE_QUEUE: Queue<unknown>;
  SENTRY_DSN?: string;
}

const server = new McpServer({ name: 'sample-stripe', version: '0.0.1' });
const runtime: Runtime = createStubRuntime();

server.tool(
  'customers_search',
  'Search Stripe customers by email or name (sample stub for Phase 1).',
  { query: z.string() },
  async ({ query }) => customersSearchHandler({ query }, runtime),
);

server.tool(
  'charges_fetch',
  'Fetch a Stripe charge by ID (sample stub for Phase 1).',
  { id: z.string() },
  async ({ id }) => chargesFetchHandler({ id }, runtime),
);

server.tool(
  'subscriptions_list',
  'List Stripe subscriptions (sample stub for Phase 1).',
  {},
  async () => subscriptionsListHandler(runtime),
);

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const authError = await authMiddleware(req, env);
    if (authError) return authError;

    // Phase 1: a fresh stateless transport per request — Phase 6 may pool /
    // reuse transports per session per RUN-04 (stateful MCP sessions).
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);
    return transport.handleRequest(req);
  },
};
