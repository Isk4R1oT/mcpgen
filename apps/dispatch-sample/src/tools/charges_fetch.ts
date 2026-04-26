// apps/dispatch-sample/src/tools/charges_fetch.ts
//
// Hand-coded sample stub for the universal `fetch` tool over Stripe charges.

import type { Runtime } from '@mcpgen/runtime';

export async function chargesFetchHandler(
  args: { id: string },
  _runtime: Runtime,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return {
    content: [
      { type: 'text', text: `(sample stub) fetched Stripe charge ${args.id}` },
    ],
  };
}
