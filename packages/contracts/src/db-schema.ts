// packages/contracts/src/db-schema.ts
//
// FND-08 — 5th frozen contract: Drizzle ORM schema (TypeScript source of truth).
//
// Source of truth: this file. Drizzle Kit (`pnpm --filter @mcpgen/contracts drizzle-kit:generate`)
// emits the SQL migration into `infrastructure/neon/migrations/<timestamp>_<name>.sql`.
//
// References:
//   - docs/mcpgen-architecture.md §7.1 (PostgreSQL schemas) + §7.2 (TimescaleDB hypertables)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-08 (CF dispatch namespaces — `dispatch_namespace`
//     column distinguishes prod/staging/sandbox; never per-tenant)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-09 (pending_callbacks composite PK on
//     (job_id, event_id) for SSE callback resume backing store)
//   - .planning/phases/01-foundation/01-CONTEXT.md D-12 / docs/decisions/001 (timestamp prefix
//     native YYYYMMDDHHMMSS format)
//
// Edit this file → run `pnpm --filter @mcpgen/contracts drizzle-kit:generate` → commit BOTH the
// schema change AND the new migration file (NEW timestamp prefix; NEVER edit a committed
// migration file in place).

import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────────────────────
// pgvector custom type (architecture §7.1 — `tools.embedding`).
//
// pgvector exposes a SQL `vector(N)` type that Drizzle does not include
// out-of-the-box. customType lets us declare the SQL type and the wire-format
// conversion (`[1.0,2.0,...]` <-> number[]).
// ─────────────────────────────────────────────────────────────────────────────
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(1536)',
  toDriver: (value: number[]): string => `[${value.join(',')}]`,
  fromDriver: (value: string): number[] => JSON.parse(value) as number[],
});

// ─────────────────────────────────────────────────────────────────────────────
// Identity (architecture §7.1 — organizations, users)
// ─────────────────────────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  logto_org_id: text('logto_org_id').notNull().unique(),
  name: text('name').notNull(),
  plan_tier: text('plan_tier').notNull().default('free'), // free | pro | team | enterprise
  stripe_customer_id: text('stripe_customer_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  logto_user_id: text('logto_user_id').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects + Specs (architecture §7.1 — projects, specs)
// ─────────────────────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const specs = pgTable(
  'specs',
  {
    id: uuid('id').primaryKey(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    content_hash: text('content_hash').notNull(), // sha256 of normalized spec
    format: text('format').notNull(), // openapi3 | (future: graphql, postman)
    spec_url: text('spec_url'),
    r2_key: text('r2_key'), // points at mcpgen-specs/<hash>
    endpoint_count: integer('endpoint_count').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectIdHashIdx: uniqueIndex('specs_project_hash_idx').on(t.project_id, t.content_hash),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Generations (architecture §7.1 — v2 with quality_report + eval columns)
// ─────────────────────────────────────────────────────────────────────────────
export const generations = pgTable('generations', {
  id: uuid('id').primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  spec_id: uuid('spec_id')
    .notNull()
    .references(() => specs.id),
  status: text('status').notNull(), // queued | running | completed | failed
  current_stage: text('current_stage'), // A | B | C | D | E | F1 | F2 | F3
  options: jsonb('options').notNull(),
  ir: jsonb('ir'),
  quality_report: jsonb('quality_report'),
  quality_score: numeric('quality_score', { precision: 3, scale: 2 }),
  is_publishable: boolean('is_publishable'),
  llm_cost_usd: numeric('llm_cost_usd', { precision: 10, scale: 6 }),
  llm_cost_breakdown: jsonb('llm_cost_breakdown'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Deployments (architecture §7.1 — deployments)
//
// `cf_worker_name` is the script name in the dispatch namespace. The
// `dispatch_namespace` column distinguishes prod / staging / sandbox per D-08
// (only 3 namespaces total; never per-tenant).
// ─────────────────────────────────────────────────────────────────────────────
export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey(),
  generation_id: uuid('generation_id')
    .notNull()
    .references(() => generations.id),
  cf_worker_name: text('cf_worker_name').notNull().unique(), // {tenant_short_id}-{spec_slug}
  dispatch_namespace: text('dispatch_namespace').notNull(), // mcpgen-prod | -staging | -sandbox
  url: text('url').notNull(),
  auth_mode: text('auth_mode').notNull(), // passthrough | stored | oauth
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tools (architecture §7.1 — denormalized per generation; pgvector for retrieval)
// ─────────────────────────────────────────────────────────────────────────────
export const tools = pgTable(
  'tools',
  {
    id: uuid('id').primaryKey(),
    generation_id: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tool_type: text('tool_type').notNull(), // universal | action | workflow | specialized
    description: jsonb('description').notNull(),
    input_schema: jsonb('input_schema').notNull(),
    output_schema: jsonb('output_schema').notNull(),
    annotations: jsonb('annotations').notNull(),
    response_config: jsonb('response_config').notNull(),
    embedding: vector('embedding'),
  },
  (t) => ({
    generationNameIdx: uniqueIndex('tools_generation_name_idx').on(t.generation_id, t.name),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// D-09: SSE callback resume backing store
//
// Composite primary key on (job_id, event_id). When the engine fails to deliver
// an SSE event to the BFF callback URL, it inserts a row here; an Inngest cron
// drains stuck callbacks every 5 minutes (3 retries with exponential backoff).
// Stores metadata only — full payload is re-derived from L2 cache on retry per
// RESEARCH §"Open Question 2".
// ─────────────────────────────────────────────────────────────────────────────
export const pending_callbacks = pgTable(
  'pending_callbacks',
  {
    job_id: text('job_id').notNull(),
    event_id: text('event_id').notNull(),
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    attempted_count: integer('attempted_count').notNull().default(0),
    last_attempt_at: timestamp('last_attempt_at', { withTimezone: true }),
    next_retry_at: timestamp('next_retry_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.job_id, t.event_id] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// usage_events — TimescaleDB hypertable (architecture §7.2)
//
// Drizzle declares the table; the `SELECT create_hypertable('usage_events', 'time')`
// call lives in the migration SQL itself (Drizzle does not emit TimescaleDB
// extension DDL natively).
// ─────────────────────────────────────────────────────────────────────────────
export const usage_events = pgTable(
  'usage_events',
  {
    time: timestamp('time', { withTimezone: true }).notNull(),
    deployment_id: uuid('deployment_id').notNull(),
    tool_name: text('tool_name').notNull(),
    tokens_in: integer('tokens_in'),
    tokens_out: integer('tokens_out'),
    upstream_latency_ms: integer('upstream_latency_ms'),
    worker_cpu_ms: integer('worker_cpu_ms'),
    status: text('status').notNull(), // ok | error | rate_limited
    client_type: text('client_type'), // claude_desktop | cursor | cline | custom
    error_class: text('error_class'),
  },
  (t) => ({
    timeIdx: index('usage_events_time_idx').on(t.time),
    deploymentTimeIdx: index('usage_events_deployment_time_idx').on(t.deployment_id, t.time),
  }),
);
