// apps/web/src/components/admin-ui/kpi.tsx
//
// Phase 3 / C1 — admin `<KPI>` tile primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx (`KPI`)
// + admin.css (`.adm-kpi`, `.adm-kpi-label`, `.adm-kpi-num`,
// `.adm-kpi-delta.up/down`, `.adm-kpi-spark`).
//
// One tile in a `.adm-kpis` grid. Always rendered as a child of a 4-col
// `.adm-kpis` container (the parent supplies the grid).

import type { JSX, ReactNode } from 'react';

import { Sparkline, type SparklineKind } from './sparkline';

export type KpiDeltaKind = '' | 'up' | 'down';

export interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaKind?: KpiDeltaKind;
  spark?: number[];
  sparkKind?: SparklineKind;
  className?: string;
}

export function KPI({
  label,
  value,
  delta,
  deltaKind = '',
  spark,
  sparkKind = '',
  className = '',
}: KpiProps): JSX.Element {
  const cls = ['adm-kpi', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-num">{value}</div>
      {delta !== undefined && delta !== null ? (
        <div className={`adm-kpi-delta ${deltaKind}`.trim()}>{delta}</div>
      ) : null}
      {spark !== undefined && spark.length > 0 ? (
        <div className="adm-kpi-spark">
          <Sparkline values={spark} kind={sparkKind} />
        </div>
      ) : null}
    </div>
  );
}
