// apps/inngest-dev/src/inngest-client.ts
//
// Phase 6 Wave 4 — single Inngest client used by all 4 functions. The
// id 'mcpgen' is the Inngest app ID; function IDs (CTRL-09 stable strings
// ending in -v1) live in each function module.

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'mcpgen' });
