// apps/web/src/components/admin-ui/page-head.tsx
//
// Phase 3 / C1 — admin `<PageHead>` primitive.
//
// Source of truth: claude-design-reference/canon/admin/admin-ui.jsx
// (`PageHead`) + admin.css (`.adm-page-head`, `.adm-page-title`,
// `.adm-page-sub`).
//
// Top-of-screen title block: serif italic display title, mono subtitle,
// and optional right-aligned actions slot. Each admin page renders one.
// Actions are commonly an array of <Btn> elements (canon usage).

import type { JSX, ReactNode } from 'react';

export interface PageHeadProps {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function PageHead({
  title,
  sub,
  right,
  className = '',
}: PageHeadProps): JSX.Element {
  const cls = ['adm-page-head', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div>
        <h1 className="adm-page-title">{title}</h1>
        {sub !== undefined && sub !== null ? (
          <div className="adm-page-sub">{sub}</div>
        ) : null}
      </div>
      {right !== undefined && right !== null ? (
        <div className="row" style={{ gap: 8 }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}
