// packages/engine-fixtures/src/index.ts
//
// Typed loader for the 5 hand-crafted Pass-5 fixture sets.
// Implements FND-07; defends Pitfall #24 (engine slip cannot block parallel
// workstreams).
//
// JSON imports use the `with { type: 'json' }` import attribute (TS 6 default).
// Each fixture is exported as a frozen `EngineFixture` const, plus aggregated
// in `ALL_FIXTURES` for iteration.

import type { FinalTool, Pass0Output, Pass1Output, QualityReport, RawIR } from '@mcpgen/ir';

import githubFinalTools from '../github/final-tools.json' with { type: 'json' };
import githubIr from '../github/ir.json' with { type: 'json' };
import githubPass0Output from '../github/pass-0-output.json' with { type: 'json' };
import githubPass1Output from '../github/pass-1-output.json' with { type: 'json' };
import githubQualityReport from '../github/quality-report.json' with { type: 'json' };
import linearFinalTools from '../linear/final-tools.json' with { type: 'json' };
import linearIr from '../linear/ir.json' with { type: 'json' };
import linearPass0Output from '../linear/pass-0-output.json' with { type: 'json' };
import linearPass1Output from '../linear/pass-1-output.json' with { type: 'json' };
import linearQualityReport from '../linear/quality-report.json' with { type: 'json' };
import notionFinalTools from '../notion/final-tools.json' with { type: 'json' };
import notionIr from '../notion/ir.json' with { type: 'json' };
import notionPass0Output from '../notion/pass-0-output.json' with { type: 'json' };
import notionPass1Output from '../notion/pass-1-output.json' with { type: 'json' };
import notionQualityReport from '../notion/quality-report.json' with { type: 'json' };
import slackFinalTools from '../slack/final-tools.json' with { type: 'json' };
import slackIr from '../slack/ir.json' with { type: 'json' };
import slackPass0Output from '../slack/pass-0-output.json' with { type: 'json' };
import slackPass1Output from '../slack/pass-1-output.json' with { type: 'json' };
import slackQualityReport from '../slack/quality-report.json' with { type: 'json' };
import stripeFinalTools from '../stripe/final-tools.json' with { type: 'json' };
import stripeIr from '../stripe/ir.json' with { type: 'json' };
import stripePass0Output from '../stripe/pass-0-output.json' with { type: 'json' };
import stripePass1Output from '../stripe/pass-1-output.json' with { type: 'json' };
import stripeQualityReport from '../stripe/quality-report.json' with { type: 'json' };

export interface EngineFixture {
  readonly ir: RawIR;
  readonly finalTools: ReadonlyArray<FinalTool>;
  readonly qualityReport: QualityReport;
  readonly pass0Output: Pass0Output;
  readonly pass1Output: Pass1Output;
}

// Per-API exports — typed via the frozen Zod inferred types from @mcpgen/ir.
// The `as` cast asserts the JSON shape; the shape is enforced at runtime by
// `tests/shape.test.ts` (parses each fixture against the Zod schema).
export const stripe: EngineFixture = {
  ir: stripeIr as unknown as RawIR,
  finalTools: stripeFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: stripeQualityReport as unknown as QualityReport,
  pass0Output: stripePass0Output as unknown as Pass0Output,
  pass1Output: stripePass1Output as unknown as Pass1Output,
};

export const github: EngineFixture = {
  ir: githubIr as unknown as RawIR,
  finalTools: githubFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: githubQualityReport as unknown as QualityReport,
  pass0Output: githubPass0Output as unknown as Pass0Output,
  pass1Output: githubPass1Output as unknown as Pass1Output,
};

export const notion: EngineFixture = {
  ir: notionIr as unknown as RawIR,
  finalTools: notionFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: notionQualityReport as unknown as QualityReport,
  pass0Output: notionPass0Output as unknown as Pass0Output,
  pass1Output: notionPass1Output as unknown as Pass1Output,
};

export const linear: EngineFixture = {
  ir: linearIr as unknown as RawIR,
  finalTools: linearFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: linearQualityReport as unknown as QualityReport,
  pass0Output: linearPass0Output as unknown as Pass0Output,
  pass1Output: linearPass1Output as unknown as Pass1Output,
};

export const slack: EngineFixture = {
  ir: slackIr as unknown as RawIR,
  finalTools: slackFinalTools as unknown as ReadonlyArray<FinalTool>,
  qualityReport: slackQualityReport as unknown as QualityReport,
  pass0Output: slackPass0Output as unknown as Pass0Output,
  pass1Output: slackPass1Output as unknown as Pass1Output,
};

export const ALL_FIXTURES = { stripe, github, notion, linear, slack } as const;
export type FixtureName = keyof typeof ALL_FIXTURES;
