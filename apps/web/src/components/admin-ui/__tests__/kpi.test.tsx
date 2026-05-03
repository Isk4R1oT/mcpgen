// apps/web/src/components/admin-ui/__tests__/kpi.test.tsx
//
// Phase 3 / C1 — `<KPI>` mirrors canon admin-ui.jsx `KPI`:
// `.adm-kpi` outer + label/num + optional delta with `.up`/`.down`
// modifier + optional sparkline.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { KPI } from '../kpi';

afterEach(() => cleanup());

describe('<KPI>', () => {
  it('renders label + value', () => {
    const { container } = render(<KPI label="active orgs" value="1,204" />);
    const card = container.querySelector('.adm-kpi');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.adm-kpi-label')?.textContent).toBe('active orgs');
    expect(card?.querySelector('.adm-kpi-num')?.textContent).toBe('1,204');
  });

  it('renders delta with up/down kind', () => {
    const { container } = render(
      <KPI label="x" value="1" delta="+8.4% mom" deltaKind="up" />,
    );
    const delta = container.querySelector('.adm-kpi-delta');
    expect(delta?.className).toContain('up');
    expect(delta?.textContent).toBe('+8.4% mom');
  });

  it('renders sparkline when spark is provided', () => {
    const { container } = render(
      <KPI label="x" value="1" spark={[1, 2, 3]} sparkKind="up" />,
    );
    const spark = container.querySelector('.adm-kpi-spark svg');
    expect(spark).not.toBeNull();
  });

  it('omits delta + sparkline when not supplied', () => {
    const { container } = render(<KPI label="x" value="1" />);
    expect(container.querySelector('.adm-kpi-delta')).toBeNull();
    expect(container.querySelector('.adm-kpi-spark')).toBeNull();
  });
});
