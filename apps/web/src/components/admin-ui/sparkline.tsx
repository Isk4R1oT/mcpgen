// apps/web/src/components/admin-ui/sparkline.tsx
//
// Phase 3 / C1 — admin `<Sparkline>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`Sparkline`) + admin.css (`.adm-spark`, `.adm-mini-spark`).
//
// Renders a polyline SVG sparkline (no axes, no labels). Used inside KPI
// tiles. `kind` accepts '' | 'up' | 'down' to choose stroke color.

import type { JSX } from 'react';

export type SparklineKind = '' | 'up' | 'down';

export interface SparklineProps {
  values?: number[];
  width?: number;
  height?: number;
  kind?: SparklineKind;
  className?: string;
}

export function Sparkline({
  values = [],
  width = 64,
  height = 18,
  kind = '',
  className = '',
}: SparklineProps): JSX.Element | null {
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const r = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / r) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const cls = ['adm-spark', className].filter(Boolean).join(' ');
  return (
    <svg className={cls} width={width} height={height}>
      <polyline points={pts} className={`adm-mini-spark ${kind}`} />
    </svg>
  );
}
