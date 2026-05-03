// apps/web/src/components/admin-ui/__tests__/filter-bar.test.tsx
//
// Phase 3 / C1 — `<FilterBar>` is a layout-only wrapper. Verify it
// renders the search/actions/chips slots when supplied and omits them
// otherwise.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { FilterBar } from '../filter-bar';

afterEach(() => cleanup());

describe('<FilterBar>', () => {
  it('renders adm-filter-bar wrapper', () => {
    const { container } = render(<FilterBar />);
    expect(container.querySelector('.adm-filter-bar')).not.toBeNull();
  });

  it('renders search + actions + chips when supplied', () => {
    const { container } = render(
      <FilterBar
        search={<input data-testid="s" />}
        actions={<button data-testid="a">filter</button>}
        chips={<span data-testid="c">all</span>}
      />,
    );
    expect(container.querySelector('[data-testid="s"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });

  it('omits chip rail when chips is missing', () => {
    const { container } = render(<FilterBar search={<input />} />);
    // Outer wrapper has at most one inner div (the search row).
    const wrapper = container.querySelector('.adm-filter-bar');
    const innerDivs = wrapper?.querySelectorAll(':scope > div');
    expect(innerDivs?.length).toBe(1);
  });
});
