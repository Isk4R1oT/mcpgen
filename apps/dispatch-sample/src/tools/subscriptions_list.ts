// apps/dispatch-sample/src/tools/subscriptions_list.ts
//
// Hand-coded sample stub for the universal `list_objects` tool over Stripe subscriptions.

import type { Runtime } from '@mcpgen/runtime';

export async function subscriptionsListHandler(
  _runtime: Runtime,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return {
    content: [
      { type: 'text', text: '(sample stub) listed Stripe subscriptions' },
    ],
  };
}
