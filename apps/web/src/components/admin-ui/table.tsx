// apps/web/src/components/admin-ui/table.tsx
//
// Phase 3 / C1 — admin `<Table>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`Table`).
//
// Canon `Table` is intentionally minimal — a CSS-grid-based mono-font
// table with optional headers and a `cols` override (defaults to
// `headers.length` or first row length). Cells are rendered verbatim
// (any ReactNode) and the LAST cell is right-aligned when its header
// is empty (canon convention for "actions" / numeric columns).
//
// Used by C2/C3/C4 admin screens that show small inline tables; bigger
// list/detail surfaces use `.adm-trow`/`.adm-thead` directly (see canon
// admin-users / admin-servers).

import type { CSSProperties, JSX, ReactNode } from 'react';

export interface TableProps {
  /** Header cells. When omitted no header row is rendered. */
  headers?: ReactNode[];
  /** Body rows — each row is an array of cells aligned 1:1 with headers. */
  rows?: ReactNode[][];
  /**
   * Override column count. Defaults to `headers.length` or, when no headers,
   * the first row's length. Each column gets `1fr`.
   */
  cols?: number;
  className?: string;
}

const SHELL_STYLE: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 4,
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
};

const HEAD_STYLE: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: '10px 14px',
  background: 'var(--surface-soft)',
  borderBottom: '1px solid var(--border)',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  color: 'var(--text-muted)',
};

const ROW_STYLE: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: '10px 14px',
  alignItems: 'center',
};

export function Table({
  headers = [],
  rows = [],
  cols,
  className = '',
}: TableProps): JSX.Element {
  const colCount =
    cols ??
    (headers.length > 0 ? headers.length : rows[0] !== undefined ? rows[0].length : 0);
  const grid = Array(colCount).fill('1fr').join(' ');
  const cls = ['adm-table-grid', className].filter(Boolean).join(' ');

  return (
    <div className={cls} style={SHELL_STYLE}>
      {headers.length > 0 ? (
        <div style={{ ...HEAD_STYLE, gridTemplateColumns: grid }}>
          {headers.map((h, i) => {
            const lastEmpty =
              i === headers.length - 1 && (h === '' || h === undefined || h === null);
            return (
              <div key={i} style={{ textAlign: lastEmpty ? 'right' : 'left' }}>
                {h}
              </div>
            );
          })}
        </div>
      ) : null}
      {rows.map((r, ri) => (
        <div
          key={ri}
          style={{
            ...ROW_STYLE,
            gridTemplateColumns: grid,
            borderBottom: ri < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          {r.map((c, ci) => {
            const lastEmptyHeader =
              ci === r.length - 1 &&
              (headers[ci] === '' ||
                headers[ci] === undefined ||
                headers[ci] === null);
            return (
              <div
                key={ci}
                style={{
                  textAlign: lastEmptyHeader ? 'right' : 'left',
                  minWidth: 0,
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
