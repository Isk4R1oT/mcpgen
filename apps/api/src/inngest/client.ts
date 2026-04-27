// apps/api/src/inngest/client.ts
//
// CTRL-09 prep / D-21: Inngest TS SDK client.
// Phases 1–9: local dev server only (npx inngest-cli@latest dev).
// Phase 10: wires INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for Inngest Cloud.

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'mcpgen-api',
  // No INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY in Phases 1–9 (local dev mode).
});
