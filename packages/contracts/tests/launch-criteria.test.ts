// LAUNCH_CRITERIA value tests + cross-doc consistency check (T-1-03).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LAUNCH_CRITERIA } from '../src/launch-criteria.js';

describe('LAUNCH_CRITERIA constants (D-13 / Pitfall #29)', () => {
  it('F2_SMELL_MIN === 4.0', () => {
    expect(LAUNCH_CRITERIA.F2_SMELL_MIN).toBe(4.0);
  });

  it('F3_AGENT_PASS_RATE_MIN === 0.7', () => {
    expect(LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN).toBe(0.7);
  });

  it('BUNDLE_SIZE.PASS_KB === 800', () => {
    expect(LAUNCH_CRITERIA.BUNDLE_SIZE.PASS_KB).toBe(800);
  });

  it('BUNDLE_SIZE.WARN_KB === 950', () => {
    expect(LAUNCH_CRITERIA.BUNDLE_SIZE.WARN_KB).toBe(950);
  });

  it('BUNDLE_SIZE.FAIL_KB_EXCLUSIVE === 950', () => {
    expect(LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE).toBe(950);
  });

  it('COVERAGE_PCT_MIN === 100', () => {
    expect(LAUNCH_CRITERIA.COVERAGE_PCT_MIN).toBe(100);
  });

  it('values are readonly at the type level (`as const` assertion)', () => {
    // TS would error at compile-time on a mutation. Round-trip the value to
    // ensure the runtime object is also defensively shape-stable.
    const snapshot = JSON.stringify(LAUNCH_CRITERIA);
    expect(snapshot).toContain('"F2_SMELL_MIN":4');
    expect(snapshot).toContain('"F3_AGENT_PASS_RATE_MIN":0.7');
    expect(snapshot).toContain('"PASS_KB":800');
    expect(snapshot).toContain('"WARN_KB":950');
    expect(snapshot).toContain('"FAIL_KB_EXCLUSIVE":950');
    expect(snapshot).toContain('"COVERAGE_PCT_MIN":100');
  });
});

describe('Cross-doc consistency vs source-of-truth docs', () => {
  // The CI `launch-criteria-assertion` job in main-ci.yml asserts the same.
  // Doing it here too means a regression breaks the test before it reaches CI.
  //
  // Threshold sources:
  //   - docs/mcpgen-stage-f-design.md  — canonical Stage F validation spec
  //   - CLAUDE.md                       — operating reference; quotes the spec
  //
  // The implementation plan §10 documents "must-have" launch criteria gates
  // (e.g. "F3 success rate ≥ 70%"), while the literal numeric thresholds live
  // in the Stage F design + CLAUDE.md. Both must match this file.
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(HERE, '..', '..', '..');
  const STAGE_F_DOC = join(REPO_ROOT, 'docs', 'mcpgen-stage-f-design.md');
  const CLAUDE_DOC = join(REPO_ROOT, 'CLAUDE.md');

  it('canonical docs are readable from the test runtime', () => {
    expect(() => readFileSync(STAGE_F_DOC, 'utf8')).not.toThrow();
    expect(() => readFileSync(CLAUDE_DOC, 'utf8')).not.toThrow();
  });

  it('Stage F design doc states F2 score ≥ 4.0', () => {
    const text = readFileSync(STAGE_F_DOC, 'utf8');
    // Literal in the doc: "score ≥ 4.0", "F2 ≥ 4.0", "Threshold ≥ 4.0".
    expect(/(?:score|F2|threshold)\s*≥\s*4\.0/i.test(text)).toBe(true);
  });

  it('Stage F design doc states F3 pass rate ≥ 0.7', () => {
    const text = readFileSync(STAGE_F_DOC, 'utf8');
    // Literal in the doc: "pass rate ≥ 0.7" or "pass_rate >= 0.7".
    expect(/pass[_\s]rate\s*(?:≥|>=)\s*0\.7/i.test(text)).toBe(true);
  });

  it('CLAUDE.md cites the same F2 ≥ 4.0 threshold', () => {
    const text = readFileSync(CLAUDE_DOC, 'utf8');
    // Literal in CLAUDE.md: "threshold ≥4.0" (no space) and "Threshold ≥ **4.0**".
    expect(/threshold\s*≥\s*\*?\*?4\.0/i.test(text)).toBe(true);
  });

  it('CLAUDE.md cites the same F3 ≥ 0.7 pass rate', () => {
    const text = readFileSync(CLAUDE_DOC, 'utf8');
    // Literal in CLAUDE.md: "pass rate ≥0.7".
    expect(/pass\s*rate\s*≥\s*0\.7/i.test(text)).toBe(true);
  });
});
