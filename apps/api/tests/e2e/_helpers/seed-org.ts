// apps/api/tests/e2e/_helpers/seed-org.ts
//
// Phase 8 Wave 5 — E2E helper: provisions a real test organization with the
// full FK chain required by the synthetic-outbox seeder (organizations →
// projects → specs → generations → deployments). Creates a real Stripe
// Customer in the sandbox so the Checkout / webhook path can exercise the
// real flow.
//
// FK chain rationale (T-8-23 mitigation): usage_events_outbox.deployment_id
// has a NOT NULL FK to deployments.id; deployments.generation_id has a NOT
// NULL FK to generations.id; generations.project_id / generations.spec_id
// have NOT NULL FKs back to projects / specs. seedTestOrg therefore creates
// the entire chain so seedSyntheticOutbox can INSERT rows keyed on
// SYNTHETIC_DEPLOYMENT_ID without violating FK constraints. cleanupTestOrg
// deletes the organization row; CASCADE drops the rest.
//
// The synthetic deployment id (SYNTHETIC_DEPLOYMENT_ID from
// @mcpgen/contracts/billing-types) is INSERTED by this helper so the
// synthetic outbox seeder + the cost-cap-enforcer "billable cost-cap usage
// event" can both resolve their FKs against the same well-known UUID.
//
// User JWT: read from process.env.E2E_USER_JWT (pre-generated via
// `tsx scripts/issue-test-jwt.ts <org_id>`); falls back to a synthetic
// placeholder for unit-only use. Real Logto verification happens against
// the sandbox JWKS in the running BFF (Terminal 1).
//
// References:
//   - .planning/phases/08-auth-billing/08-05-PLAN.md Task 1
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §16 Wave 5
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-25
//   - packages/contracts/src/billing-types.ts (SYNTHETIC_DEPLOYMENT_ID)
//   - packages/contracts/src/db-schema.ts (FK chain reference)

import Stripe from 'stripe';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/db.js';
import {
  organizations,
  projects,
  specs,
  generations,
  deployments,
} from '@mcpgen/contracts/db-schema';
import { SYNTHETIC_DEPLOYMENT_ID } from '@mcpgen/contracts/billing-types';

export interface TestOrg {
  readonly id: string;
  readonly userJwt: string;
  readonly stripeCustomerId: string;
  readonly projectId: string;
  readonly specId: string;
  readonly generationId: string;
  readonly deploymentId: string; // === SYNTHETIC_DEPLOYMENT_ID (FK target for outbox rows)
}

// Build a deterministic, well-formed UUID v4 prefixed with zeroes so it is
// trivially recognizable as test data (T-8-21 mitigation). Last 12 hex digits
// derived from the current timestamp so concurrent runs don't collide.
function makeTestOrgId(): string {
  const ts = Date.now().toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${ts}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `seedTestOrg: required env var ${name} is not set; see apps/api/README.md Wave 5 section`,
    );
  }
  return value;
}

export async function seedTestOrg(): Promise<TestOrg> {
  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  const orgId = makeTestOrgId();

  // 1. Create real Stripe Customer in sandbox (idempotent: each test run gets
  // its own customer; cleanupTestOrg deletes it).
  const customer = await stripe.customers.create({
    email: `e2e-${orgId.slice(-12)}@mcpgen.test`,
    metadata: { test_org_id: orgId, e2e: 'true' },
  });

  // 2. Insert org + project + spec + generation + deployment chain.
  const projectId = ulid();
  const specId = ulid();
  const generationId = ulid();
  const deploymentId = SYNTHETIC_DEPLOYMENT_ID;

  await db.insert(organizations).values({
    id: orgId,
    logto_org_id: `e2e-org-${orgId.slice(-12)}`,
    name: `e2e-test-${orgId.slice(-12)}`,
    plan_tier: 'free',
    stripe_customer_id: customer.id,
  });

  await db.insert(projects).values({
    id: projectId,
    org_id: orgId,
    name: 'e2e-test-project',
  });

  await db.insert(specs).values({
    id: specId,
    project_id: projectId,
    content_hash: `e2e-hash-${orgId.slice(-12)}`,
    format: 'openapi3',
    endpoint_count: 0,
  });

  await db.insert(generations).values({
    id: generationId,
    project_id: projectId,
    spec_id: specId,
    status: 'completed',
    options: {},
  });

  // The synthetic deployment is keyed on SYNTHETIC_DEPLOYMENT_ID so both the
  // seeder (PHASE_6_AVAILABLE=0 path) and the cost-cap-enforcer billable
  // event (Plan 03 Task 3) resolve their FKs against the same row. If
  // another concurrent test already inserted it, swallow the UNIQUE
  // violation — the row is shared across runs by design.
  try {
    await db.insert(deployments).values({
      id: deploymentId,
      generation_id: generationId,
      cf_worker_name: `e2e-worker-${orgId.slice(-12)}`,
      dispatch_namespace: 'mcpgen-sandbox',
      url: `http://localhost:8790/${orgId.slice(-12)}`,
      auth_mode: 'passthrough',
    });
  } catch (err) {
    if (!String(err).toLowerCase().includes('unique')
      && !String(err).toLowerCase().includes('duplicate')) {
      throw err;
    }
  }

  const userJwt = process.env.E2E_USER_JWT ?? 'pre-generated-test-jwt-required';

  return {
    id: orgId,
    userJwt,
    stripeCustomerId: customer.id,
    projectId,
    specId,
    generationId,
    deploymentId,
  };
}

export async function cleanupTestOrg(orgId: string): Promise<void> {
  // Delete real Stripe Customer (best-effort — sandbox isolated from live).
  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (org?.stripe_customer_id) {
    try {
      await stripe.customers.del(org.stripe_customer_id);
    } catch {
      // Ignore — sandbox cleanup is best-effort.
    }
  }
  // CASCADE drops projects → specs → generations → deployments. We do NOT
  // delete the synthetic deployment row (it is shared across runs by design;
  // see the SYNTHETIC_DEPLOYMENT_ID UNIQUE comment above).
  await db.delete(organizations).where(eq(organizations.id, orgId));
}
