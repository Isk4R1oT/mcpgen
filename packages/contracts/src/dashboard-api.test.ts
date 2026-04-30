// packages/contracts/src/dashboard-api.test.ts
//
// Plan 09-03 — vitest unit tests for the dashboard wire-shape contract that
// previously lived locally in apps/web/src/lib/api/dashboard-client.ts.
// Validates the 4 happy-path schemas (Deployment / DeploymentsListResponse /
// BadgePublicRequest) plus a type-guard regression vector.
//
// Cross-package consumption: apps/api/src/routes/v1/deployments.ts uses
// BadgePublicRequestSchema for zValidator; apps/web/src/lib/api/dashboard-
// client.ts re-exports DeploymentSchema + UsageHourlyRowSchema verbatim so
// the existing 11 dashboard-client tests still pass post-promotion.

import { describe, it, expect } from 'vitest';

import {
  DeploymentSchema,
  DeploymentsListResponseSchema,
  BadgePublicRequestSchema,
  UsageHourlyRowSchema,
  UsageHourlyResponseSchema,
} from './dashboard-api.js';

const VALID_DEPLOYMENT = {
  deployment_id: '11111111-1111-4111-8111-111111111111',
  generation_id: '22222222-2222-4222-8222-222222222222',
  server_name: 'fixture-stripe-mcp',
  server_url: 'https://fixture-stripe-mcp.mcpgen.dev',
  auth_mode: 'passthrough' as const,
  deployed_at: '2026-04-15T12:00:00.000Z',
  quality_report: null,
  public_badge: false,
};

describe('DeploymentSchema', () => {
  it('parses a minimal valid deployment', () => {
    const parsed = DeploymentSchema.parse(VALID_DEPLOYMENT);
    expect(parsed.server_name).toBe('fixture-stripe-mcp');
    expect(parsed.public_badge).toBe(false);
  });

  it('rejects when public_badge is a string (type guard)', () => {
    expect(() =>
      DeploymentSchema.parse({ ...VALID_DEPLOYMENT, public_badge: 'true' }),
    ).toThrow();
  });

  it('rejects missing required field server_name', () => {
    const { server_name: _drop, ...rest } = VALID_DEPLOYMENT;
    expect(() => DeploymentSchema.parse(rest)).toThrow();
  });
});

describe('DeploymentsListResponseSchema', () => {
  it('parses an empty list', () => {
    const parsed = DeploymentsListResponseSchema.parse({ deployments: [] });
    expect(parsed.deployments).toHaveLength(0);
  });

  it('parses a populated list', () => {
    const parsed = DeploymentsListResponseSchema.parse({
      deployments: [VALID_DEPLOYMENT],
    });
    expect(parsed.deployments).toHaveLength(1);
  });
});

describe('BadgePublicRequestSchema', () => {
  it('parses { public_badge: true }', () => {
    const parsed = BadgePublicRequestSchema.parse({ public_badge: true });
    expect(parsed.public_badge).toBe(true);
  });

  it('parses { public_badge: false }', () => {
    const parsed = BadgePublicRequestSchema.parse({ public_badge: false });
    expect(parsed.public_badge).toBe(false);
  });

  it('rejects when public_badge is a string (type guard)', () => {
    expect(() => BadgePublicRequestSchema.parse({ public_badge: 'true' })).toThrow();
  });

  it('rejects missing public_badge field', () => {
    expect(() => BadgePublicRequestSchema.parse({})).toThrow();
  });
});

describe('UsageHourlyRowSchema + UsageHourlyResponseSchema', () => {
  it('parses a valid hourly row', () => {
    const parsed = UsageHourlyRowSchema.parse({
      deployment_id: '11111111-1111-4111-8111-111111111111',
      hour_bucket: '2026-04-15T12:00:00.000Z',
      call_count: 42,
      total_latency_ms: 1234,
      total_cost_usd: 0.5,
      error_count: 1,
    });
    expect(parsed.call_count).toBe(42);
  });

  it('parses an empty rows response', () => {
    const parsed = UsageHourlyResponseSchema.parse({ rows: [] });
    expect(parsed.rows).toHaveLength(0);
  });
});
