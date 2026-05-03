// apps/web/src/components/admin-ui/__tests__/table.test.tsx
//
// Phase 3 / C1 — `<Table>` mirrors canon admin-ui.jsx `Table` (CSS-grid
// based mono-font table). Verifies header + row cell counts and that the
// last cell with empty header gets right-aligned.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Table } from '../table';

afterEach(() => cleanup());

describe('<Table>', () => {
  it('renders headers + rows with correct cell counts', () => {
    const { container } = render(
      <Table
        headers={['user', 'plan', 'status', '']}
        rows={[
          ['mira@lumen.dev', 'pro', 'active', '⋯'],
          ['priya@nw.co', 'free', 'flagged', '⋯'],
        ]}
      />,
    );
    const root = container.querySelector('.adm-table-grid');
    expect(root).not.toBeNull();
    // 1 header row + 2 data rows = 3 total grid rows.
    const gridRows = root?.children;
    expect(gridRows?.length).toBe(3);
  });

  it('renders without headers when headers is empty', () => {
    const { container } = render(<Table rows={[['a', 'b'], ['c', 'd']]} />);
    const root = container.querySelector('.adm-table-grid');
    // No header row, just 2 body rows.
    expect(root?.children.length).toBe(2);
  });

  it('renders empty when no rows + no headers', () => {
    const { container } = render(<Table />);
    const root = container.querySelector('.adm-table-grid');
    expect(root).not.toBeNull();
    expect(root?.children.length).toBe(0);
  });

  it('right-aligns the last cell when its header is empty', () => {
    const { container } = render(
      <Table headers={['a', '']} rows={[['x', 'y']]} />,
    );
    const cells = container
      .querySelector('.adm-table-grid')
      ?.children[1]?.querySelectorAll(':scope > div');
    expect(cells?.length).toBe(2);
    const last = cells?.[1] as HTMLElement | undefined;
    expect(last?.style.textAlign).toBe('right');
  });
});
