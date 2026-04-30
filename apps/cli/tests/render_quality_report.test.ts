// apps/cli/tests/render_quality_report.test.ts
//
// Plan 05-09 Task 2 — terminal rendering of QualityReport summary.
//
// References:
// - 05-CONTEXT.md D-38 (CLI flow + summary box format) + D-39 (--strict
//   exit code; thresholds source from LAUNCH_CRITERIA — Pitfall #29)
// - 05-09-PLAN.md Task 2 (behavior matrix)

import { describe, expect, test } from 'bun:test';

import type { QualityReport } from '@mcpgen/ir';

import { renderQualityReport } from '../src/init/render_quality_report.js';

// ─────────────────────────────────────────────────────────── helpers ───
//
// `console.log` capture so we can assert ANSI sequences + textual content
// without coupling to a particular ANSI library implementation. The capture
// stores the raw lines (with escape codes) so colour assertions work.

function captureLogs<T>(
  fn: () => T,
): { lines: string[]; result: T } {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]): void => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  try {
    const result = fn();
    return { lines, result };
  } finally {
    console.log = original;
  }
}

function baseReport(): QualityReport {
  return {
    spec_hash: 'a'.repeat(64),
    f1_static: {
      passed: true,
      ts_compile_errors: [],
      json_schema_errors: [],
      mcp_compliance_errors: [],
      secret_scan_findings: [],
      bundle_bytes: 412 * 1024,
    },
    f2_smell: {
      tool_scores: [],
      overall_average: 4.31,
      passed: true,
    },
    f3_agent_eval: {
      results: [],
      pass_rate: 0.8,
      passed: true,
    },
    overall_score: 4.2,
    quality_badge: 'verified',
    bundle_size_kb: 412,
    pipeline_versions: null,
    retry_history: [],
    f3_test_agent_id: null,
    f2_low_confidence_run: false,
    golden_task_set_origin: 'hand_authored',
    sandbox_environment: 'real',
    warnings: [],
    generation_time_seconds: 124.5,
    total_cost_usd: 0.18,
  };
}

// ─────────────────────────────────────────────────────────────── tests ───

describe('renderQualityReport — badge rendering', () => {
  test('Test 1: badge=verified renders VERIFIED uppercase', () => {
    const qr = baseReport();
    const { lines, result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('VERIFIED');
  });

  test('Test 2: badge=premium renders PREMIUM uppercase', () => {
    const qr = baseReport();
    qr.quality_badge = 'premium';
    qr.overall_score = 4.7;
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(lines.join('\n')).toContain('PREMIUM');
  });

  test('renders STANDARD for badge=standard', () => {
    const qr = baseReport();
    qr.quality_badge = 'standard';
    qr.overall_score = 3.5;
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(lines.join('\n')).toContain('STANDARD');
  });

  test('Test 3: badge=needs_review renders NEEDS_REVIEW + warnings list', () => {
    const qr = baseReport();
    qr.quality_badge = 'needs_review';
    qr.f1_static.passed = false;
    qr.f2_smell.overall_average = 3.0;
    qr.warnings = ['Pass 2 retry exhausted', 'F1 ts_compile failed'];
    qr.overall_score = 2.4;
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    const joined = lines.join('\n');
    expect(joined).toContain('NEEDS_REVIEW');
    expect(joined).toContain('Pass 2 retry exhausted');
    expect(joined).toContain('F1 ts_compile failed');
  });
});

describe('renderQualityReport — summary content (D-38)', () => {
  test('Test 4: shows F1 pass status, F2 score, bundle size', () => {
    const qr = baseReport();
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/F1[:\s]/);
    expect(joined).toMatch(/F2[:\s]/);
    expect(joined).toContain('4.31');
    expect(joined).toContain('412'); // bundle KB
  });

  test('shows F3 pass-rate when f3_agent_eval is present', () => {
    const qr = baseReport();
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(lines.join('\n')).toContain('0.80');
  });

  test('renders em-dash placeholder when F3 is absent', () => {
    const qr = baseReport();
    qr.f3_agent_eval = null;
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(lines.join('\n')).toMatch(/F3[:\s].*[—-]/);
  });

  test('shows separator line above and below the summary', () => {
    const qr = baseReport();
    const { lines } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    // At least two separator-like lines (sequences of the same char).
    const sepLines = lines.filter((l) =>
      /^[━─=]{10,}$/.test(l.replace(/\[[^m]*m/g, '')),
    );
    expect(sepLines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('renderQualityReport — --strict exit codes (D-39)', () => {
  test('Test 5: --strict + F1 fail returns exit code 1', () => {
    const qr = baseReport();
    qr.f1_static.passed = false;
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: true }),
    );
    expect(code).toBe(1);
  });

  test('--strict + F2 below LAUNCH_CRITERIA returns exit code 1', () => {
    const qr = baseReport();
    qr.f2_smell.overall_average = 3.5; // < 4.0 LAUNCH_CRITERIA.F2_SMELL_MIN
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: true }),
    );
    expect(code).toBe(1);
  });

  test('--strict + F3 below LAUNCH_CRITERIA returns exit code 1', () => {
    const qr = baseReport();
    if (qr.f3_agent_eval !== null) {
      qr.f3_agent_eval.pass_rate = 0.5; // < 0.7 LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN
    }
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: true }),
    );
    expect(code).toBe(1);
  });

  test('--strict but all gates pass returns exit code 0', () => {
    const qr = baseReport();
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: true }),
    );
    expect(code).toBe(0);
  });

  test('non-strict + F1 fail still returns exit code 0', () => {
    const qr = baseReport();
    qr.f1_static.passed = false;
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: false }),
    );
    expect(code).toBe(0);
  });

  test('--strict + F3 absent does not fail solely on F3', () => {
    const qr = baseReport();
    qr.f3_agent_eval = null;
    const { result: code } = captureLogs(() =>
      renderQualityReport(qr, { strict: true }),
    );
    expect(code).toBe(0);
  });
});
