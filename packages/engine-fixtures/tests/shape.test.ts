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
import { FinalTool, Pass0Output, Pass1Output, QualityReport, RawIR } from '@mcpgen/ir';

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

// ─────────────────────────────────────────────────────────────────────────────
// Pass0Output + Pass1Output shape validation (Plan 02-03 — fixtures-as-contract).
// Invariants enforced:
//   1. Pass0Output / Pass1Output Zod parse succeeds
//   2. coverage_pct === 100 (Phase 1 launch criterion COVERAGE_PCT_MIN)
//   3. all 6 universal tool names always present (D-29)
//   4. tool count in [6, 15] (D-35)
//   5. smart-ID schema-level format `<spec-slug>:{type}:{collection}:{identifier}`
//      with no leading `{tenant_short_id}-` (D-31 — tenant prefix is prepended at
//      deploy time by Phase 6, NOT at Phase 2 schema authoring)
//   6. every coverage_proof.sample_invocation.url parses via `new URL(...)`
//      (Pitfall #3 — URL round-trip)
// OpenAI compliance for `search` / `fetch` (D-30) is enforced at the
// FinalTool layer (Phase 3 ships description+inputSchema), not at Pass1Output
// (which only carries name/type/source_endpoints — see ToolTaxonomyEntry).
// ─────────────────────────────────────────────────────────────────────────────

const SMART_ID_FORMAT_RE = /^[a-z0-9-]+:\{type\}:\{collection\}:\{identifier\}$/;

for (const name of FIXTURE_NAMES) {
  describe(`fixture: ${name} — Pass0Output + Pass1Output`, () => {
    const fx = ALL_FIXTURES[name];

    it('pass-0-output.json parses against Pass0Output Zod schema', () => {
      const result = Pass0Output.safeParse(fx.pass0Output);
      if (!result.success) {
        throw new Error(
          `Pass0Output parse failed for ${name}: ${JSON.stringify(result.error.issues[0])}`,
        );
      }
      expect(result.success).toBe(true);
    });

    it('pass-1-output.json parses against Pass1Output Zod schema', () => {
      const result = Pass1Output.safeParse(fx.pass1Output);
      if (!result.success) {
        throw new Error(
          `Pass1Output parse failed for ${name}: ${JSON.stringify(result.error.issues[0])}`,
        );
      }
      expect(result.success).toBe(true);
    });

    it('coverage_pct === 100 (launch criterion)', () => {
      expect(fx.pass1Output.coverage_pct).toBe(100);
    });

    it('all 6 universal tools always present (D-29)', () => {
      const toolNames = new Set(fx.pass1Output.tools.map((t) => t.name));
      for (const universal of UNIVERSAL_TOOLS) {
        expect(
          toolNames.has(universal),
          `${name}: pass-1-output missing universal tool '${universal}'`,
        ).toBe(true);
      }
    });

    it('total tool count in [6, 15] (D-35 — 6-12 typical, 13-15 acceptable)', () => {
      expect(fx.pass1Output.tools.length).toBeGreaterThanOrEqual(6);
      expect(fx.pass1Output.tools.length).toBeLessThanOrEqual(15);
    });

    it('smart-ID format is schema-level only — no tenant prefix (D-31)', () => {
      expect(fx.pass1Output.routing.smart_id.format).toMatch(SMART_ID_FORMAT_RE);
      // Guard against accidental {tenant_short_id}- prefix leakage.
      expect(fx.pass1Output.routing.smart_id.format.startsWith('{tenant_short_id}-')).toBe(false);
    });

    it('every coverage_proof.sample_invocation.url round-trips via new URL() (Pitfall #3)', () => {
      for (const proof of fx.pass1Output.coverage_proof) {
        expect(() => new URL(proof.sample_invocation.url), proof.endpoint_id).not.toThrow();
      }
    });

    it('all Pass-0 tool_plans use {resource}_{action} snake_case (D-17)', () => {
      const re = /^[a-z][a-z0-9_]{0,63}$/;
      for (const plan of fx.pass0Output.tool_plans) {
        expect(plan.name, `${name}: tool_plan name '${plan.name}' must match D-17 regex`).toMatch(
          re,
        );
      }
    });
  });
}

// GitHub-specific Pitfall E hybrid-auth invariant — at least one endpoint must
// emit ≥ 2 AuthRequirement entries (Bearer PAT + GitHub App OAuth).
describe('fixture: github — Pitfall E hybrid auth', () => {
  it('at least one endpoint has ≥ 2 auth_requirements entries', () => {
    const hybridCount = Object.values(ALL_FIXTURES.github.pass0Output.auth_requirements).filter(
      (entries) => entries.length >= 2,
    ).length;
    expect(hybridCount).toBeGreaterThanOrEqual(1);
  });
});
