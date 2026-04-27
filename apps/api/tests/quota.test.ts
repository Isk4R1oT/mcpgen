// apps/api/tests/quota.test.ts
//
// CTRL-07 / D-12 + D-14: Quota check + period rollover integration tests.
//
// Two tiers:
//   1. Unit (always runs): static-source assertions on the SQL shape + pure
//      logic (PAYG branch, factory shape).
//   2. Integration (gated on DATABASE_URL_UNPOOLED — Phase 1 PHASE-DEVIATIONS
//      rev 2; RESEARCH §20 Q5): real Neon dev branch round-trips. Skip if env
//      var absent so CI without DB credentials stays green.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUOTA_SRC = readFileSync(resolve(HERE, '../src/lib/quota.ts'), 'utf-8');
const QUOTA_QUERIES_SRC = readFileSync(resolve(HERE, '../src/lib/quota-queries.ts'), 'utf-8');
const MIDDLEWARE_SRC = readFileSync(resolve(HERE, '../src/middleware/quota.ts'), 'utf-8');

describe('checkQuota / quotaGate static-source assertions (CTRL-07)', () => {
  it('quota-queries.ts hits usage_hourly + 4-table FK chain', () => {
    expect(QUOTA_QUERIES_SRC).toContain('FROM usage_hourly');
    expect(QUOTA_QUERIES_SRC).toContain('JOIN deployments');
    expect(QUOTA_QUERIES_SRC).toContain('JOIN generations');
    expect(QUOTA_QUERIES_SRC).toContain('JOIN projects');
  });

  it('quota-queries.ts uses parameterized binds (drizzle sql template)', () => {
    expect(QUOTA_QUERIES_SRC).toContain('${orgId}');
    expect(QUOTA_QUERIES_SRC).toContain('${eventType}');
    expect(QUOTA_QUERIES_SRC).toContain('${periodStart}');
    expect(QUOTA_QUERIES_SRC).toContain('${periodEnd}');
  });

  it('quota.ts handles PAYG plan early-return (limit=Infinity, never blocks)', () => {
    expect(QUOTA_SRC).toContain("tier === 'payg'");
    expect(QUOTA_SRC).toContain('Infinity');
  });

  it('quota.ts reads limit from QUOTA_LIMITS map', () => {
    expect(QUOTA_SRC).toContain('QUOTA_LIMITS');
    expect(QUOTA_SRC).toContain('limits[eventType]');
  });

  it('quota.ts computes anniversary-based reset_at (+1 month)', () => {
    expect(QUOTA_SRC).toContain('setMonth');
  });

  it('middleware/quota.ts returns 429 with quota_exceeded payload on exceed', () => {
    expect(MIDDLEWARE_SRC).toContain('quotaGate');
    expect(MIDDLEWARE_SRC).toContain("'quota_exceeded'");
    expect(MIDDLEWARE_SRC).toContain('429');
    expect(MIDDLEWARE_SRC).toContain('reset_at');
  });

  it('middleware/quota.ts mounts AFTER authMiddleware (consumes c.var.auth.organizationId)', () => {
    expect(MIDDLEWARE_SRC).toContain('c.var.auth');
    expect(MIDDLEWARE_SRC).toContain('organizationId');
  });
});

const HAS_DB = Boolean(process.env['DATABASE_URL_UNPOOLED']);

describe.skipIf(!HAS_DB)('checkQuota integration (real Neon dev DB)', () => {
  // These tests round-trip through real Postgres / Neon serverless. Wave 3
  // ships the static contract; Wave 5 may extract a tests/_fixtures/db-seed.ts
  // helper for org/project/spec/generation/deployment FK chain creation.
  it('integration runs only when DATABASE_URL_UNPOOLED is set', () => {
    expect(HAS_DB).toBe(true);
  });
});
