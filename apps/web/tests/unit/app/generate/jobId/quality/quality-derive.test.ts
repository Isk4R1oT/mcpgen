// apps/web/tests/unit/app/generate/jobId/quality/quality-derive.test.ts
//
// M-4 Agent 2 — unit tests for QualityReport → screen-quality prop
// derivation. Verifies the F2/F3 → breakdown/tools/evalTasks mapping.

import { describe, expect, it } from 'vitest';

import { stripe } from '@mcpgen/engine-fixtures';
import type { QualityReport } from '@mcpgen/ir';

import {
  deriveBreakdown,
  deriveEvalTasks,
  deriveTools,
} from '@/app/generate/[jobId]/quality/_quality-derive';

const baseQR = (overrides: Partial<QualityReport> = {}): QualityReport =>
  ({
    spec_hash: 'a'.repeat(64),
    f1_static: {
      passed: true,
      ts_compile_errors: [],
      json_schema_errors: [],
      mcp_compliance_errors: [],
      secret_scan_findings: [],
      bundle_bytes: 100_000,
    },
    f2_smell: {
      tool_scores: [
        {
          tool_name: 'list_charges',
          components: [
            { component: 'purpose', score: 4.5 },
            { component: 'guidelines', score: 4.2 },
            { component: 'limitations', score: 4.8 },
            { component: 'parameter_doc', score: 4.0 },
          ],
          average: 4.3,
        },
        {
          tool_name: 'create_charge',
          components: [
            { component: 'purpose', score: 3.8 },
            { component: 'guidelines', score: 3.5 },
            { component: 'limitations', score: 4.0 },
            { component: 'parameter_doc', score: 2.5 }, // low — flagged
          ],
          average: 3.45,
        },
      ],
      overall_average: 3.9,
      passed: false,
    },
    f3_agent_eval: {
      results: [
        {
          task_id: 'refund_recent_charge',
          passed: true,
          judge_task_completion: 9,
          judge_grounding: 8,
          turns_used: 3,
        },
        {
          task_id: 'list_failed_payments',
          passed: false,
          judge_task_completion: 4,
          judge_grounding: 5,
          turns_used: 7,
        },
      ],
      pass_rate: 0.5,
      passed: false,
    },
    overall_score: 3.9,
    quality_badge: 'standard',
    retry_history: [],
    f3_test_agent_id: null,
    f2_low_confidence_run: false,
    golden_task_set_origin: 'hand_authored',
    sandbox_environment: 'real',
    warnings: [],
    generation_time_seconds: null,
    total_cost_usd: null,
    ...overrides,
  }) as QualityReport;

describe('deriveBreakdown', () => {
  it('returns empty when no qualityReport', () => {
    expect(deriveBreakdown(undefined)).toEqual([]);
  });

  it('computes per-component averages from F2 tool_scores', () => {
    const rows = deriveBreakdown(baseQR());
    const purpose = rows.find((r) => r.label === 'description quality');
    // (4.5 + 3.8) / 2 = 4.15
    expect(purpose?.value).toBeCloseTo(4.15, 2);
    const paramDoc = rows.find((r) => r.label === 'parameter doc');
    // (4.0 + 2.5) / 2 = 3.25
    expect(paramDoc?.value).toBeCloseTo(3.25, 2);
  });

  it('appends agent eval pass-rate row when F3 ran', () => {
    const rows = deriveBreakdown(baseQR());
    const f3 = rows.find((r) => r.label === 'agent eval pass-rate');
    expect(f3?.value).toBe(50);
    expect(f3?.suffix).toBe('%');
    expect(f3?.note).toContain('1/2');
  });

  it('omits agent eval row when F3 is null (free tier)', () => {
    const rows = deriveBreakdown(baseQR({ f3_agent_eval: null }));
    expect(rows.find((r) => r.label === 'agent eval pass-rate')).toBeUndefined();
  });

  it('does not return hardcoded literal labels from old screen', () => {
    const rows = deriveBreakdown(baseQR());
    // Old hardcoded literals — should NOT appear in dynamic data.
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain('annotations coverage');
    expect(labels).not.toContain('composite tools');
    expect(labels).not.toContain('param naming');
  });
});

describe('deriveTools', () => {
  it('returns empty when no qualityReport', () => {
    expect(deriveTools(undefined)).toEqual([]);
  });

  it('flags components below 3.0', () => {
    const tools = deriveTools(baseQR());
    const create = tools.find((t) => t.name === 'create_charge');
    expect(create?.flags).toContain('weak parameter doc');
    const listC = tools.find((t) => t.name === 'list_charges');
    expect(listC?.flags).toEqual([]);
  });

  it('rounds tool average to 2 decimals', () => {
    const tools = deriveTools(baseQR());
    expect(tools[0]?.score).toBe(4.3);
    expect(tools[1]?.score).toBe(3.45);
  });

  it('works on a real engine fixture', () => {
    const tools = deriveTools(stripe.qualityReport);
    expect(tools.length).toBe(stripe.qualityReport.f2_smell.tool_scores.length);
    for (const t of tools) {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(t.score).toBeLessThanOrEqual(5);
    }
  });
});

describe('deriveEvalTasks', () => {
  it('returns empty when no F3', () => {
    expect(deriveEvalTasks(baseQR({ f3_agent_eval: null }))).toEqual([]);
    expect(deriveEvalTasks(undefined)).toEqual([]);
  });

  it('maps F3 results to display rows with pass/fail status', () => {
    const tasks = deriveEvalTasks(baseQR());
    expect(tasks.length).toBe(2);
    const pass = tasks.find((t) => t.task === 'refund_recent_charge');
    expect(pass?.ok).toBe(true);
    expect(pass?.why).toBeUndefined();
    const fail = tasks.find((t) => t.task === 'list_failed_payments');
    expect(fail?.ok).toBe(false);
    expect(fail?.why).toContain('task_completion 4/10');
  });

  it('does not return hardcoded "refund last week\'s charge" mock', () => {
    const tasks = deriveEvalTasks(baseQR());
    for (const t of tasks) {
      expect(t.task).not.toContain("last week's charge");
      expect(t.task).not.toContain('alice@x.io');
    }
  });
});
