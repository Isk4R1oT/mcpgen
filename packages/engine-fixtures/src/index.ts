// packages/engine-fixtures/src/index.ts
//
// Typed loader for the 5 hand-crafted Pass-5 fixture sets.
// Implements FND-07; defends Pitfall #24 (engine slip cannot block parallel
// workstreams).
//
// JSON imports use the `with { type: 'json' }` import attribute (TS 6 default).
// Each fixture is exported as a frozen `EngineFixture` const, plus aggregated
// in `ALL_FIXTURES` for iteration.

import type { FinalTool, QualityReport, RawIR } from '@mcpgen/ir';

import githubFinalTools from '../github/final-tools.json' with { type: 'json' };
import githubIr from '../github/ir.json' with { type: 'json' };
import githubQualityReport from '../github/quality-report.json' with { type: 'json' };
import linearFinalTools from '../linear/final-tools.json' with { type: 'json' };
import linearIr from '../linear/ir.json' with { type: 'json' };
import linearQualityReport from '../linear/quality-report.json' with { type: 'json' };
import notionFinalTools from '../notion/final-tools.json' with { type: 'json' };
import notionIr from '../notion/ir.json' with { type: 'json' };
import notionQualityReport from '../notion/quality-report.json' with { type: 'json' };
import slackFinalTools from '../slack/final-tools.json' with { type: 'json' };
import slackIr from '../slack/ir.json' with { type: 'json' };
import slackQualityReport from '../slack/quality-report.json' with { type: 'json' };
import stripeFinalTools from '../stripe/final-tools.json' with { type: 'json' };
import stripeIr from '../stripe/ir.json' with { type: 'json' };
import stripeQualityReport from '../stripe/quality-report.json' with { type: 'json' };

export interface EngineFixture {
  readonly ir: RawIR;
  readonly finalTools: ReadonlyArray<FinalTool>;
  readonly qualityReport: QualityReport;
}

// Per-API exports — typed via the frozen Zod inferred types from @mcpgen/ir.
// The `as` cast asserts the JSON shape; the shape is enforced at runtime by
// `tests/shape.test.ts` (parses each fixture against the Zod schema).
export const stripe: EngineFixture = {
  ir: stripeIr as unknown as RawIR,
  finalTools: stripeFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: stripeQualityReport as unknown as QualityReport,
};

export const github: EngineFixture = {
  ir: githubIr as unknown as RawIR,
  finalTools: githubFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: githubQualityReport as unknown as QualityReport,
};

export const notion: EngineFixture = {
  ir: notionIr as unknown as RawIR,
  finalTools: notionFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: notionQualityReport as unknown as QualityReport,
};

export const linear: EngineFixture = {
  ir: linearIr as unknown as RawIR,
  finalTools: linearFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: linearQualityReport as unknown as QualityReport,
};

export const slack: EngineFixture = {
  ir: slackIr as unknown as RawIR,
  finalTools: slackFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: slackQualityReport as unknown as QualityReport,
};

export const ALL_FIXTURES = { stripe, github, notion, linear, slack } as const;
export type FixtureName = keyof typeof ALL_FIXTURES;
