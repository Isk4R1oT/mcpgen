// apps/dispatch-sample/src/tools/customers_search.ts
//
// Hand-coded sample stub for the universal `search` tool over Stripe customers.
// Phase 4 codegen MUST emit a tool handler with this exact shape.

import type { Runtime } from '@mcpgen/runtime';

export async function customersSearchHandler(
  args: { query: string },
  _runtime: Runtime,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return {
    content: [
      {
        type: 'text',
        text: `(sample stub) searched Stripe customers for "${args.query}"`,
      },
    ],
  };
}
