// apps/web/src/app/generate/[jobId]/quality/_quality-derive.ts
//
// Pure helpers that map a `QualityReport` (Stage F output) onto the
// display-friendly shapes consumed by the locked screen-quality.jsx.
// Extracted from `_quality-client.tsx` so the derivation logic can be
// unit-tested without rendering the React tree (the locked JSX runs only
// in jsdom + needs the loader.ts side effects, which is heavyweight for
// a derivation-only test).

import type { QualityReport as QualityReportType } from '@mcpgen/ir';

export interface BreakdownRow {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  note: string;
}

export interface ToolRow {
  name: string;
  score: number;
  flags: ReadonlyArray<string>;
}

export interface EvalTaskRow {
  task: string;
  ok: boolean;
  ms: number;
  why?: string;
}

const componentAvg = (qr: QualityReportType, component: string): number | null => {
  let total = 0;
  let count = 0;
  for (const tool of qr.f2_smell.tool_scores) {
    for (const c of tool.components) {
      if (c.component === component) {
        total += c.score;
        count += 1;
      }
    }
  }
  return count > 0 ? total / count : null;
};

export const deriveBreakdown = (
  qr: QualityReportType | undefined,
): ReadonlyArray<BreakdownRow> => {
  if (qr === undefined) return [];
  const f2Avg = qr.f2_smell.overall_average;
  const purpose = componentAvg(qr, 'purpose') ?? f2Avg;
  const guidelines = componentAvg(qr, 'guidelines') ?? f2Avg;
  const limitations = componentAvg(qr, 'limitations') ?? f2Avg;
  const paramDoc = componentAvg(qr, 'parameter_doc') ?? f2Avg;

  const rows: BreakdownRow[] = [
    {
      label: 'description quality',
      value: Number(purpose.toFixed(2)),
      max: 5,
      note: `purpose component avg across ${qr.f2_smell.tool_scores.length} tools`,
    },
    {
      label: 'guidelines coverage',
      value: Number(guidelines.toFixed(2)),
      max: 5,
      note: 'when_to_use / when_not_to_use / how_to_use rubric',
    },
    {
      label: 'limitations completeness',
      value: Number(limitations.toFixed(2)),
      max: 5,
      note: 'side effects, idempotency, failure modes',
    },
    {
      label: 'parameter doc',
      value: Number(paramDoc.toFixed(2)),
      max: 5,
      note: 'per-param what / format / when / example / default',
    },
  ];

  if (qr.f3_agent_eval !== null) {
    const passPct = Math.round(qr.f3_agent_eval.pass_rate * 100);
    const passed = qr.f3_agent_eval.results.filter((r) => r.passed).length;
    const total = qr.f3_agent_eval.results.length;
    rows.push({
      label: 'agent eval pass-rate',
      value: passPct,
      max: 100,
      suffix: '%',
      note: `${passed}/${total} golden tasks passed`,
    });
  }

  return rows;
};

export const deriveTools = (qr: QualityReportType | undefined): ReadonlyArray<ToolRow> => {
  if (qr === undefined) return [];
  return qr.f2_smell.tool_scores.map((t) => {
    const flags: string[] = [];
    for (const c of t.components) {
      if (c.score < 3.0) flags.push(`weak ${c.component.replace(/_/g, ' ')}`);
    }
    return {
      name: t.tool_name,
      score: Number(t.average.toFixed(2)),
      flags,
    };
  });
};

export const deriveEvalTasks = (
  qr: QualityReportType | undefined,
): ReadonlyArray<EvalTaskRow> => {
  if (qr === undefined || qr.f3_agent_eval === null) return [];
  return qr.f3_agent_eval.results.map((r) => {
    const why = r.passed
      ? undefined
      : `task_completion ${r.judge_task_completion}/10 · grounding ${r.judge_grounding}/10`;
    const row: EvalTaskRow = {
      task: r.task_id,
      ok: r.passed,
      ms: r.turns_used * 1500,
    };
    if (why !== undefined) row.why = why;
    return row;
  });
};
