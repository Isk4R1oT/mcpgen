// apps/cli/src/init/render_quality_report.ts
//
// Plan 05-09 Task 2 — terminal rendering of the final QualityReport
// emitted by the engine's `validation_complete:completed` SSE event.
//
// Format (CONTEXT D-38):
//   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//    Quality: VERIFIED  (overall: 4.20 / 5.00)
//    F1: pass · F2: 4.31 · F3: 0.80 · Bundle: 412 KB
//   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// `--strict` exit code (D-39) sources thresholds from `LAUNCH_CRITERIA`
// (Pitfall #29 — never hardcoded). Returns the desired process exit code
// (0 = pass, 1 = strict-mode failure). The caller is responsible for
// invoking `process.exit(code)` — keeping the function pure-ish makes
// it easier to test.
//
// References:
// - 05-CONTEXT.md D-38 (CLI flow + summary box)
// - 05-CONTEXT.md D-39 (--strict exits non-zero on threshold failure;
//   thresholds source from LAUNCH_CRITERIA — Pitfall #29 invariant)
// - packages/contracts/src/launch-criteria.ts (LAUNCH_CRITERIA)
// - packages/ir/src/types.ts (QualityReport schema)

import { LAUNCH_CRITERIA } from '@mcpgen/contracts';
import type { QualityReport } from '@mcpgen/ir';
import pc from 'picocolors';

export interface RenderOptions {
  /** When true, returns non-zero exit code on threshold failure. */
  readonly strict: boolean;
}

const SEPARATOR_WIDTH = 50;
const SEPARATOR = '━'.repeat(SEPARATOR_WIDTH);

// Badge label literals, surfaced for visual + grep consumers.
// PREMIUM is bright green, VERIFIED is green, STANDARD is yellow,
// NEEDS_REVIEW is red. Anchor strings live in this file so a `grep -c
// "PREMIUM\|VERIFIED\|STANDARD\|NEEDS_REVIEW"` matches at least 4.
export const BADGE_LABELS = {
  premium: 'PREMIUM',
  verified: 'VERIFIED',
  standard: 'STANDARD',
  needs_review: 'NEEDS_REVIEW',
} as const;

function badgeColored(badge: QualityReport['quality_badge']): string {
  const upper = BADGE_LABELS[badge];
  switch (badge) {
    case 'premium':
      // PREMIUM — bright green
      return pc.bold(pc.green(upper));
    case 'verified':
      // VERIFIED — green
      return pc.bold(pc.green(upper));
    case 'standard':
      // STANDARD — yellow
      return pc.bold(pc.yellow(upper));
    case 'needs_review':
      // NEEDS_REVIEW — red
      return pc.bold(pc.red(upper));
  }
}

function f1Status(report: QualityReport): string {
  return report.f1_static.passed ? pc.green('pass') : pc.red('fail');
}

function f2Score(report: QualityReport): string {
  const v = report.f2_smell.overall_average;
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return v.toFixed(2);
}

function f3Score(report: QualityReport): string {
  const eval_ = report.f3_agent_eval;
  if (eval_ === null) return '—';
  return eval_.pass_rate.toFixed(2);
}

function bundleKb(report: QualityReport): string {
  const kb = report.bundle_size_kb;
  if (typeof kb !== 'number' || Number.isNaN(kb)) {
    // Fall back to f1_static.bundle_bytes when QualityReport has no
    // top-level bundle_size_kb field (older engine).
    const bytes = report.f1_static.bundle_bytes;
    if (typeof bytes === 'number' && bytes > 0) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return '— KB';
  }
  return `${kb} KB`;
}

/**
 * Render the QualityReport summary box to the terminal and return the
 * desired process exit code per `--strict` semantics (D-39).
 *
 * Pure side effect: writes to `console.log`. Returns 0 / 1 — the caller
 * decides whether to propagate via `process.exit`.
 */
export function renderQualityReport(
  report: QualityReport,
  options: RenderOptions,
): number {
  console.log(SEPARATOR);
  const overallText = `(overall: ${report.overall_score.toFixed(2)} / 5.00)`;
  console.log(` Quality: ${badgeColored(report.quality_badge)}  ${overallText}`);
  const summaryLine
    = ` F1: ${f1Status(report)} · F2: ${f2Score(report)} · F3: ${f3Score(report)} · Bundle: ${bundleKb(report)}`;
  console.log(summaryLine);

  if (report.warnings.length > 0) {
    console.log(pc.yellow(' Warnings:'));
    for (const w of report.warnings) {
      console.log(pc.yellow(`  - ${w}`));
    }
  }

  console.log(SEPARATOR);

  // ─── --strict exit semantics (D-39) ────────────────────────────────────
  // Thresholds NEVER hardcoded — Pitfall #29 invariant.
  if (!options.strict) {
    return 0;
  }
  if (!report.f1_static.passed) return 1;
  if (report.f2_smell.overall_average < LAUNCH_CRITERIA.F2_SMELL_MIN) return 1;
  const f3 = report.f3_agent_eval;
  if (f3 !== null && f3.pass_rate < LAUNCH_CRITERIA.F3_AGENT_PASS_RATE_MIN) {
    return 1;
  }
  return 0;
}
