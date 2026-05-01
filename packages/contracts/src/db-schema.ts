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
  type AnyPgColumn,
  bigserial,
  boolean,
  customType,
  date,
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
  stripe_customer_id: text('stripe_customer_id').unique(), // Phase 8: tightened to UNIQUE
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // ─── Phase 8 additions ───────────────────────────────────────────
  subscription_status: text('subscription_status'), // null | active | past_due | canceled | etc.
  quota_period_start: timestamp('quota_period_start', { withTimezone: true }).notNull().defaultNow(),
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
    // ─── Phase 8 additions ───────────────────────────────────────────
    parsed_ir_jsonb: jsonb('parsed_ir_jsonb'), // cached Stage A IR for drift compare
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
  // ─── Phase 8 additions ───────────────────────────────────────────
  // CHECK constraint (triggered_by IN ('user', 'drift_auto', 'drift_manual')) lives in migration SQL.
  cumulative_cost_usd: numeric('cumulative_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  triggered_by: text('triggered_by').notNull().default('user'),
  // ─── Phase 9.1 additions (OQ-2 / D-05 cache attribution) ─────────
  // Self-FK. Set when this generation row was served from L1 cache (D-05).
  // NULL for original generations. Cache-source lookup query in Plan 09.1-06
  // filters `WHERE cached_from_generation_id IS NULL` to skip cache pointers.
  // Migration: 20260501010000_phase09_1_anon_flow.sql.
  cached_from_generation_id: uuid('cached_from_generation_id').references(
    (): AnyPgColumn => generations.id,
    { onDelete: 'set null' },
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Deployments (architecture §7.1 — deployments)
//
// `cf_worker_name` is the script name in the dispatch namespace. The
// `dispatch_namespace` column distinguishes prod / staging / sandbox per D-08
// (only 3 namespaces total; never per-tenant).
// Phase 6 adds local_port (nullable integer) — set for local Bun child-process deploys, NULL for Phase-10 CF deploys (RUN-01 / RESEARCH §"Open Question #1")
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
  local_port: integer('local_port'), // Phase 6: local-compute port (null for Phase-10 CF deploys)
  // ─── Phase 8 additions ───────────────────────────────────────────
  auto_regenerate_on_drift: boolean('auto_regenerate_on_drift').notNull().default(false),
  // ─── Phase 9 additions (D-19 / CTRL-08) ─────────────────────────
  // Public quality badge opt-in toggle; default false is privacy-safe per Phase 7
  // dashboard UI. Wave 2 BFF endpoint POST /api/v1/deployments/[id]/badge-public
  // toggles this column. Migration: 20260430000000_phase9_badge_public.sql.
  public_badge: boolean('public_badge').notNull().default(false),
  // ─── Phase 9.1 additions (D-09 / D-03 anon ephemeral support) ───
  // anon_session_id links an ephemeral anon deployment back to the
  // anonymous_generations row that created it. NULL for permanent (post-claim
  // or paid). expires_at is set to created_at + 24h for anon deploys; NULL
  // for permanent. The anon-tenant-expiry cron (Plan 09.1-10) hard-deletes
  // rows where expires_at < NOW(). Partial index `deploy_expires_idx`
  // (declared in SQL only) makes this an index scan.
  // Migration: 20260501010000_phase09_1_anon_flow.sql.
  anon_session_id: text('anon_session_id').references(
    (): AnyPgColumn => anonymous_generations.anon_session_id,
    { onDelete: 'set null' },
  ),
  expires_at: timestamp('expires_at', { withTimezone: true }),
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
// Phase 6 adds idempotency_key (NOT NULL) + UNIQUE(deployment_id, idempotency_key, time) — closes contract-vs-DB drift surfaced in 06-RESEARCH §"Open Question #6" (FROZEN UsageEvent Zod schema declares idempotency_key but the migrated DB did not store it). Per OPS-02 cross-workstream test ownership, this is a chore(contracts):-class change with paired docs/decisions/005 entry.
// `time` is required in the unique index because `usage_events` is a TimescaleDB
// hypertable partitioned on `time`; TimescaleDB enforces (TS103, hard DDL constraint)
// that every UNIQUE index on a hypertable contain the partitioning column. The dedup
// semantic is preserved because `idempotency_key` already encodes the minute-bucket
// timestamp (Phase-1 D-11 shape `${deployment_id}_${minute_bucket_iso}_${tool_name}`),
// so two events with the same (deployment_id, idempotency_key) share the same `time`
// bucket and adding `time` to the unique index does not change collision behaviour.
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
    idempotency_key: text('idempotency_key').notNull(),
  },
  (t) => ({
    timeIdx: index('usage_events_time_idx').on(t.time),
    deploymentTimeIdx: index('usage_events_deployment_time_idx').on(t.deployment_id, t.time),
    deploymentIdemUnique: uniqueIndex('usage_events_dep_idem_unique').on(
      t.deployment_id,
      t.idempotency_key,
      t.time,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Billing
//
// Stripe webhook event log; idempotency via UNIQUE on stripe_event_id.
// CHECK (status IN ('received', 'processed', 'error')) added in migration SQL.
// ─────────────────────────────────────────────────────────────────────────────
export const subscription_events = pgTable(
  'subscription_events',
  {
    id: text('id').primaryKey(), // ULID
    organization_id: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    event_type: text('event_type').notNull(),
    stripe_event_id: text('stripe_event_id').notNull().unique(),
    payload: jsonb('payload').notNull(),
    received_at: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
    status: text('status').notNull().default('received'),
    error_message: text('error_message'),
  },
  (t) => ({
    orgReceivedIdx: index('subscription_events_org_received_idx').on(t.organization_id, t.received_at),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Drift Watcher
//
// CHECK (status IN ('pending', 'reviewing', 'regenerating', 'resolved', 'dismissed'))
// lives in migration SQL.
// ─────────────────────────────────────────────────────────────────────────────
export const drift_events = pgTable(
  'drift_events',
  {
    id: text('id').primaryKey(), // ULID
    deployment_id: uuid('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
    detected_at: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    diff_json: jsonb('diff_json').notNull(),
    status: text('status').notNull().default('pending'),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by_generation_id: uuid('resolved_by_generation_id').references(() => generations.id, { onDelete: 'set null' }),
  },
  (t) => ({
    deploymentDetectedIdx: index('drift_events_deployment_detected_idx').on(t.deployment_id, t.detected_at),
  }),
);

// drift_email_log — one row per (tenant, ISO-week) for weekly digest dedup.
export const drift_email_log = pgTable(
  'drift_email_log',
  {
    tenant_id: uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    week_start: date('week_start').notNull(), // ISO week starting Monday 00:00 UTC
    sent_at: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    drift_event_count: integer('drift_event_count').notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenant_id, t.week_start] }) }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Usage outbox + reconciliation
// ─────────────────────────────────────────────────────────────────────────────
export const usage_events_outbox = pgTable('usage_events_outbox', {
  id: text('id').primaryKey(), // ULID
  deployment_id: uuid('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  event_payload: jsonb('event_payload').notNull(),
  idempotency_key: text('idempotency_key').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sent_at: timestamp('sent_at', { withTimezone: true }),
});

export const reconciliation_log = pgTable(
  'reconciliation_log',
  {
    id: text('id').primaryKey(), // ULID
    reconciliation_date: date('reconciliation_date').notNull(),
    event_type: text('event_type').notNull(),
    tenant_id: uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    timescale_count: integer('timescale_count').notNull(),
    stripe_count: integer('stripe_count').notNull(),
    drift_pct: numeric('drift_pct', { precision: 6, scale: 3 }).notNull(),
    alerted: boolean('alerted').notNull().default(false),
    run_at: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: uniqueIndex('reconciliation_log_unique').on(t.reconciliation_date, t.event_type, t.tenant_id) }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Logto MAU sample
// ─────────────────────────────────────────────────────────────────────────────
export const mau_log = pgTable('mau_log', {
  sample_date: date('sample_date').primaryKey(),
  mau_count: integer('mau_count').notNull(),
  alerted: boolean('alerted').notNull().default(false),
  sampled_at: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.1 — Anonymous hero flow (D-09 / D-11 / OQ-2)
//
// Three new tables + two column extensions (above on `generations` and
// `deployments`). All powered by migration
// `20260501010000_phase09_1_anon_flow.sql`. Partial indexes
// (`anon_gen_unclaimed_idx`, `deploy_expires_idx`, `gen_cached_from_idx`)
// and the TimescaleDB `create_hypertable()` call live in SQL only — Drizzle
// Kit does not emit those natively (mirrors the `usage_events` hypertable
// pattern in `infrastructure/neon/migrations/20260427000000_init_schema.sql`).
// ─────────────────────────────────────────────────────────────────────────────

// One row per anonymous session. `anon_session_id` is a ULID set in the
// `mcpgen_anon_session` HttpOnly cookie (D-04). `claimed_by_org_id` is set
// by POST /api/v1/claim_generation when a user signs up. Partial index
// `anon_gen_unclaimed_idx` (SQL-only) powers the 7d unclaimed cleanup cron.
export const anonymous_generations = pgTable(
  'anonymous_generations',
  {
    anon_session_id: text('anon_session_id').primaryKey(),
    generation_id: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    ip_hash: text('ip_hash').notNull(), // sha256(daily_salt + raw_ip) per D-11
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    claimed_at: timestamp('claimed_at', { withTimezone: true }),
    claimed_by_org_id: uuid('claimed_by_org_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    sessionIdx: index('anon_gen_session_idx').on(t.anon_session_id),
  }),
);

// TimescaleDB hypertable for IP rate-limit log. BIGSERIAL because no global
// uniqueness needed and high insert rate. `create_hypertable('anon_generation_log',
// 'created_at', chunk_time_interval => INTERVAL '1 day')` runs in migration SQL
// (per RESEARCH §"Pitfall #4": 1-day chunks for tight 30d retention via
// drop_chunks). Btree index on (ip_hash, created_at DESC) powers the
// `WHERE ip_hash = $1 AND created_at >= NOW() - INTERVAL '24h'` query.
export const anon_generation_log = pgTable(
  'anon_generation_log',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull(),
    ip_hash: text('ip_hash').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ipTimeIdx: index('anon_log_ip_time_idx').on(t.ip_hash, t.created_at.desc()),
  }),
);

// Daily-rotating salt store (D-11). Keys: 'daily_salt_current',
// 'daily_salt_previous'. The first daily_salt_current row is seeded by the
// migration via `encode(gen_random_bytes(32), 'hex')`; the anon-salt-rotate
// cron (Plan 09.1-10) promotes current→previous and writes a fresh current
// row at 00:00 UTC daily. Future phases may add more keys (webhook signing,
// session signing, etc.) — single-table KV avoids one table per secret kind.
export const app_secrets = pgTable('app_secrets', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  rotates_at: timestamp('rotates_at', { withTimezone: true }),
});
