// packages/contracts/src/db-types.ts
//
// Drizzle ORM `$inferSelect` / `$inferInsert` re-exports for downstream consumers
// (apps/api BFF, apps/dispatch, future engine). The TS source of truth is
// `db-schema.ts`; this file only re-exposes the inferred row + insert types so
// callers can `import { Generation, NewGeneration } from '@mcpgen/contracts'`
// without depending on Drizzle internals.

import type {
  deployments,
  generations,
  organizations,
  pending_callbacks,
  projects,
  specs,
  tools,
  usage_events,
  users,
} from './db-schema.js';

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Spec = typeof specs.$inferSelect;
export type NewSpec = typeof specs.$inferInsert;

export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;

export type PendingCallback = typeof pending_callbacks.$inferSelect;
export type NewPendingCallback = typeof pending_callbacks.$inferInsert;

export type UsageEventRow = typeof usage_events.$inferSelect;
export type NewUsageEventRow = typeof usage_events.$inferInsert;
