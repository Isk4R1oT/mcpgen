// apps/cli/tests/sse_consumer_f1_f2_f3.test.ts
//
// Plan 05-09 Task 2 — SSE event handlers for F1/F2/F3/retry_planned/
// validation_complete events. Wraps the engine SSE event payloads emitted
// by Plan 05-08's `_run_stage_f` (`pipeline.py::_serialize_f1/f2/f3`).
//
// References:
// - 05-CONTEXT.md D-31 (SSE event sequence) + D-38 (CLI flow) +
//   D-30 (validation_complete payload includes quality_report)
// - apps/generation-engine/src/mcpgen_engine/pipeline.py serializers
// - 05-09-PLAN.md Task 2 (behavior matrix)

import { describe, expect, test } from 'bun:test';

import type { GenerationSseEvent } from '@mcpgen/contracts';

import {
  handleStageFEvent,
  type StageFRendererState,
} from '../src/init/sse_consumer.js';

// ───────────────────────────────────────────────────────── helpers ────

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

function event(
  stage: GenerationSseEvent['stage'],
  status: GenerationSseEvent['status'],
  partial: Record<string, unknown> | null,
): GenerationSseEvent {
  return {
    job_id: 'gen_01HV2X38SK0E0E0E0E0E0E0E0E',
    event_id: '01HV2X38SK0E0E0E0E0E0E0E0E',
    stage,
    status,
    partial_result: partial === null ? undefined : partial,
  };
}

function freshState(): StageFRendererState {
  return { f1StartedAt: null, f2StartedAt: null, f3StartedAt: null };
}

// ─────────────────────────────────────────────────────────────── tests ───

describe('Stage F SSE events — F1', () => {
  test('Test 1: F1:started prints running-checks message', () => {
    const state = freshState();
    const { lines } = captureLogs(() =>
      handleStageFEvent(event('F1', 'started', null), state),
    );
    expect(lines.join('\n')).toMatch(/F1.*running.*checks/i);
  });

  test('Test 2: F1:completed with passed=true renders pass count', () => {
    const state = freshState();
    handleStageFEvent(event('F1', 'started', null), state);
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F1', 'completed', {
          f1_result: {
            passed: true,
            checks_run: 11,
            subprocess_checks_pending: false,
          },
        }),
        state,
      ),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/F1/);
    expect(joined).toMatch(/11\/11|11 checks|11 of 11/);
  });

  test('F1:completed with passed=false renders fail mark', () => {
    const state = freshState();
    handleStageFEvent(event('F1', 'started', null), state);
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F1', 'completed', {
          f1_result: {
            passed: false,
            checks_run: 11,
            subprocess_checks_pending: false,
            first_failure: {
              check_name: 'ts_compile',
              error: 'TS2304',
              retry_target: 'stage_e',
            },
          },
        }),
        state,
      ),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/F1/);
    expect(joined).toMatch(/✗|fail/i);
  });
});

describe('Stage F SSE events — F2', () => {
  test('Test 3: F2:started prints evaluations message', () => {
    const state = freshState();
    const { lines } = captureLogs(() =>
      handleStageFEvent(event('F2', 'started', null), state),
    );
    expect(lines.join('\n')).toMatch(/F2/);
  });

  test('Test 4: F2:completed renders overall + sigma', () => {
    const state = freshState();
    handleStageFEvent(event('F2', 'started', null), state);
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F2', 'completed', {
          f2_result: {
            passed: true,
            overall_score: 4.31,
            sigma: 0.52,
            low_confidence_run: false,
            tool_count: 9,
          },
        }),
        state,
      ),
    );
    const joined = lines.join('\n');
    expect(joined).toContain('4.31');
    expect(joined).toContain('0.52');
  });

  test('F2:completed flags low_confidence_run when sigma < 0.4', () => {
    const state = freshState();
    handleStageFEvent(event('F2', 'started', null), state);
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F2', 'completed', {
          f2_result: {
            passed: true,
            overall_score: 4.0,
            sigma: 0.3,
            low_confidence_run: true,
            tool_count: 9,
          },
        }),
        state,
      ),
    );
    expect(lines.join('\n')).toMatch(/low.confidence|low_confidence/i);
  });
});

describe('Stage F SSE events — F3', () => {
  test('F3:started prints golden-task message', () => {
    const state = freshState();
    const { lines } = captureLogs(() =>
      handleStageFEvent(event('F3', 'started', null), state),
    );
    expect(lines.join('\n')).toMatch(/F3/);
  });

  test('F3:completed renders pass-rate', () => {
    const state = freshState();
    handleStageFEvent(event('F3', 'started', null), state);
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F3', 'completed', {
          f3_result: {
            passed: true,
            pass_rate: 0.8,
            results_count: 10,
            mock_clients_passed: true,
          },
        }),
        state,
      ),
    );
    expect(lines.join('\n')).toMatch(/F3/);
    expect(lines.join('\n')).toMatch(/0\.8|80%|8\/10/);
  });
});

describe('Stage F SSE events — retry_planned', () => {
  test('Test 5: retry_planned event renders retry-round message', () => {
    const state = freshState();
    // The engine emits retry_planned as status=error on the failing stage,
    // OR as a dedicated stage:retry_planned event. We accept either.
    const { lines } = captureLogs(() =>
      handleStageFEvent(
        event('F2', 'error', {
          retry_planned: true,
          round: 2,
          retry_target: 'pass_2',
          reason: 'Purpose<3 on charges_create',
        }),
        state,
      ),
    );
    const joined = lines.join('\n');
    expect(joined).toMatch(/retry|Retry/);
    expect(joined).toContain('pass_2');
  });
});

describe('Stage F SSE events — validation_complete', () => {
  test('Test 6: validation_complete returns the embedded quality_report', () => {
    const state = freshState();
    const qr = {
      spec_hash: 'a'.repeat(64),
      f1_static: {
        passed: true,
        ts_compile_errors: [],
        json_schema_errors: [],
        mcp_compliance_errors: [],
        secret_scan_findings: [],
        bundle_bytes: 421888,
      },
      f2_smell: { tool_scores: [], overall_average: 4.3, passed: true },
      f3_agent_eval: { results: [], pass_rate: 0.8, passed: true },
      overall_score: 4.2,
      quality_badge: 'verified',
    };
    const result = handleStageFEvent(
      event('validation_complete', 'completed', {
        phase: 'validation_complete',
        quality_report: qr,
      }),
      state,
    );
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('validation_complete');
    if (result?.kind === 'validation_complete') {
      expect(result.qualityReport.quality_badge).toBe('verified');
      expect(result.qualityReport.overall_score).toBe(4.2);
    }
  });

  test('non-Stage-F events return null', () => {
    const state = freshState();
    const result = handleStageFEvent(
      event('A', 'completed', { endpoint_count: '42' }),
      state,
    );
    expect(result).toBeNull();
  });
});
