// apps/web/src/components/admin-ui/__tests__/page-head.test.tsx
//
// Phase 3 / C1 — `<PageHead>` mirrors canon `.adm-page-head` /
// `.adm-page-title` / `.adm-page-sub` and renders the optional right
// slot inside a `.row` flex container.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { PageHead } from '../page-head';

afterEach(() => cleanup());

describe('<PageHead>', () => {
  it('renders title + sub', () => {
    const { container } = render(<PageHead title="ops · overview" sub="last 24h · prod" />);
    const head = container.querySelector('.adm-page-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.adm-page-title')?.textContent).toBe('ops · overview');
    expect(head?.querySelector('.adm-page-sub')?.textContent).toBe('last 24h · prod');
  });

  it('omits sub when not supplied', () => {
    const { container } = render(<PageHead title="t" />);
    expect(container.querySelector('.adm-page-sub')).toBeNull();
  });

  it('renders right slot inside .row container', () => {
    const { container } = render(
      <PageHead title="t" right={<button data-testid="r">refresh</button>} />,
    );
    const row = container.querySelector('.row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('[data-testid="r"]')).not.toBeNull();
  });
});
