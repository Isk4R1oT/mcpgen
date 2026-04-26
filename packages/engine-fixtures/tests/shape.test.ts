// packages/engine-fixtures/tests/shape.test.ts
//
// Shape contract tests for the 5 hand-crafted Pass-5 fixtures.
// Each fixture must:
//   1. parse against `RawIR`
//   2. parse as `z.array(FinalTool)` with 6–15 tools
//   3. include all 6 universal tool names (search/fetch/list_collections/list_objects/upsert/delete)
//   4. parse as `QualityReport` AND meet LAUNCH_CRITERIA thresholds (F2 ≥ 4.0, F3 ≥ 0.7, badge ∈ {verified, premium})
//   5. have `openWorldHint=true` on every tool annotation (Pass 4 architectural invariant)

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import { FinalTool, QualityReport, RawIR } from '@mcpgen/ir';

import { ALL_FIXTURES, type FixtureName } from '../src/index.js';

const FIXTURE_NAMES: ReadonlyArray<FixtureName> = [
  'stripe',
  'github',
  'notion',
  'linear',
  'slack',
];

const UNIVERSAL_TOOLS = [
  'search',
  'fetch',
  'list_collections',
  'list_objects',
  'upsert',
  'delete',
] as const;

const FinalToolArray = z.array(FinalTool);

for (const name of FIXTURE_NAMES) {
  describe(`fixture: ${name}`, () => {
    const fx = ALL_FIXTURES[name];

    it('ir parses against RawIR Zod schema', () => {
      const result = RawIR.safeParse(fx.ir);
      if (!result.success) {
        // surface the first issue clearly so failures are debuggable
        throw new Error(
          `RawIR parse failed for ${name}: ${JSON.stringify(result.error.issues[0])}`,
        );
      }
      expect(result.success).toBe(true);
    });

    it('final-tools parses as z.array(FinalTool) with 6–15 tools', () => {
      const result = FinalToolArray.safeParse(fx.finalTools);
      if (!result.success) {
        throw new Error(
          `FinalTool[] parse failed for ${name}: ${JSON.stringify(result.error.issues[0])}`,
        );
      }
      expect(result.success).toBe(true);
      expect(fx.finalTools.length).toBeGreaterThanOrEqual(6);
      expect(fx.finalTools.length).toBeLessThanOrEqual(15);
    });

    it('contains all 6 universal tools by name', () => {
      const toolNames = new Set(fx.finalTools.map((t) => t.name));
      for (const universal of UNIVERSAL_TOOLS) {
        expect(toolNames.has(universal), `${name}: missing universal tool '${universal}'`).toBe(
          true,
        );
      }
    });

    it('quality-report parses + meets LAUNCH_CRITERIA thresholds', () => {
      const result = QualityReport.safeParse(fx.qualityReport);
      if (!result.success) {
        throw new Error(
          `QualityReport parse failed for ${name}: ${JSON.stringify(result.error.issues[0])}`,
        );
      }
      expect(result.success).toBe(true);
      expect(fx.qualityReport.f1_static.passed).toBe(true);
      expect(fx.qualityReport.f2_smell.overall_average).toBeGreaterThanOrEqual(
        LAUNCH_CRITERIA.F2_SMELL_MIN,
      );
      // F3 may be null per the schema (it's nullable), but in fixtures we always populate it
      expect(fx.qualityReport.f3_agent_eval).not.toBeNull();
      expect(fx.qualityReport.f3_agent_eval?.pass_rate).toBeGreaterThanOrEqual(
        LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN,
      );
      expect(['verified', 'premium']).toContain(fx.qualityReport.quality_badge);
    });

    it('every annotation has openWorldHint=true (Pass 4 invariant)', () => {
      for (const tool of fx.finalTools) {
        expect(tool.annotations.openWorldHint, `${name}/${tool.name}: openWorldHint must be true`).toBe(
          true,
        );
      }
    });
  });
}
