// apps/web/tests/unit/lib/quality-badge.test.ts
//
// Plan 07-03 — vitest tests for the QualityReport → BadgeTier mapper.
// Verifies threshold imports from @mcpgen/contracts/launch-criteria (no
// hardcoded 4.0 / 0.7) per CONTEXT D-20.

import { describe, expect, it } from 'vitest';

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';

import { badgeLabel, badgeTier } from '@/lib/quality-badge';

const baseQR = (overrides: {
  f1Passed?: boolean;
  f2Avg?: number;
  f3Pass?: number | null;
}): QualityReport =>
  ({
    spec_hash: 'a'.repeat(64),
    f1_static: {
      passed: overrides.f1Passed ?? true,
      ts_compile_errors: [],
      json_schema_errors: [],
      mcp_compliance_errors: [],
      secret_scan_findings: [],
      bundle_bytes: 100_000,
    },
    f2_smell: {
      tool_scores: [],
      overall_average: overrides.f2Avg ?? 4.0,
      passed: (overrides.f2Avg ?? 4.0) >= 4.0,
    },
    f3_agent_eval:
      overrides.f3Pass === undefined || overrides.f3Pass === null
        ? null
        : { results: [], pass_rate: overrides.f3Pass, passed: overrides.f3Pass >= 0.7 },
    overall_score: 4.0,
    quality_badge: 'verified',
    // Phase 5 D-29 strictly-additive fields with defaults applied — needed
    // for `as QualityReport` cast after Phase-5 IR merge.
    retry_history: [],
    f3_test_agent_id: null,
    f2_low_confidence_run: false,
    golden_task_set_origin: 'hand_authored',
    sandbox_environment: 'real',
    warnings: [],
    generation_time_seconds: null,
    total_cost_usd: null,
  }) as QualityReport;

describe('badgeTier', () => {
  it('F1 fail → needs_review (overrides any F2/F3 score)', () => {
    expect(badgeTier(baseQR({ f1Passed: false, f2Avg: 4.9, f3Pass: 0.95 }))).toBe('needs_review');
  });

  it('F2=4.6 + F3=0.9 → premium', () => {
    expect(badgeTier(baseQR({ f2Avg: 4.6, f3Pass: 0.9 }))).toBe('premium');
  });

  it('F2=4.0 + F3 null (free tier) → verified', () => {
    expect(badgeTier(baseQR({ f2Avg: 4.0, f3Pass: null }))).toBe('verified');
  });

  it('F2=4.2 + F3=0.85 → verified (not premium because F2<4.5)', () => {
    expect(badgeTier(baseQR({ f2Avg: 4.2, f3Pass: 0.85 }))).toBe('verified');
  });

  it('F2=3.5 + F3=0.5 → standard', () => {
    expect(badgeTier(baseQR({ f2Avg: 3.5, f3Pass: 0.5 }))).toBe('standard');
  });

  it('F2=2.0 → needs_review', () => {
    expect(badgeTier(baseQR({ f2Avg: 2.0, f3Pass: 0.9 }))).toBe('needs_review');
  });

  it('uses LAUNCH_CRITERIA thresholds (F2_SMELL_MIN, F3_AGENT_PASS_RATE_MIN)', () => {
    // Sanity assertion: a value just at the launch-criteria minimum still
    // yields verified, proving we are reading the constant.
    expect(LAUNCH_CRITERIA.F2_SMELL_MIN).toBe(4.0);
    expect(LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN).toBe(0.7);
    expect(
      badgeTier(
        baseQR({
          f2Avg: LAUNCH_CRITERIA.F2_SMELL_MIN,
          f3Pass: LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN,
        }),
      ),
    ).toBe('verified');
  });
});

describe('badgeLabel', () => {
  it('verified + F3 null → "verified (F2-only)" (D-21)', () => {
    expect(badgeLabel(baseQR({ f2Avg: 4.0, f3Pass: null }))).toBe('verified (F2-only)');
  });

  it('verified + F3 set → "verified"', () => {
    expect(badgeLabel(baseQR({ f2Avg: 4.0, f3Pass: 0.85 }))).toBe('verified');
  });

  it('premium → "premium" (no special label)', () => {
    expect(badgeLabel(baseQR({ f2Avg: 4.6, f3Pass: 0.9 }))).toBe('premium');
  });
});
