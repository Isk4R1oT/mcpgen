// apps/api/src/inngest/functions/index.ts
//
// Phase 9 orphan audit (CTRL-09) relies on this list matching INNGEST_FUNCTION_IDS register.
// Waves 2–4 push functions onto this array as they land:
//   Wave 2: stripeMetersEmit
//   Wave 3: costCapEnforcer, quotaPeriodRollover
//   Wave 4: driftWatcher, driftWatcherCheck, usageReconciler, logtoMauWatch
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-21, D-27
//   - packages/contracts/src/inngest-functions.ts (stable ID register)

import type { Inngest } from 'inngest';
import { stripeMetersEmit } from './stripe-meters-emit.js';
import { quotaPeriodRollover } from './quota-period-rollover.js';
import { costCapEnforcer } from './cost-cap-enforcer.js';
import { driftWatcher } from './drift-watcher.js';
import { driftWatcherCheck } from './drift-watcher-check.js';
import { usageReconciler } from './usage-reconciler.js';
import { logtoMauWatch } from './logto-mau-watch.js';

type InngestFunction = ReturnType<Inngest['createFunction']>;

export const functions: ReadonlyArray<InngestFunction> = [
  stripeMetersEmit,
  quotaPeriodRollover,
  costCapEnforcer,
  driftWatcher,
  driftWatcherCheck,
  usageReconciler,
  logtoMauWatch,
];
