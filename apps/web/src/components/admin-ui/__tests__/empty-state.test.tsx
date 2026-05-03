// apps/web/src/components/admin-ui/__tests__/empty-state.test.tsx
//
// Phase 3 / C1 — `<EmptyState>` mirrors canon admin-ui.jsx `EmptyState`.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { EmptyState } from '../empty-state';

afterEach(() => cleanup());

describe('<EmptyState>', () => {
  it('renders adm-empty wrapper + title', () => {
    const { container } = render(<EmptyState title="no activity" />);
    const root = container.querySelector('.adm-empty');
    expect(root).not.toBeNull();
    expect(root?.textContent).toContain('no activity');
  });

  it('renders sub + action when supplied', () => {
    const { container } = render(
      <EmptyState
        title="t"
        sub="adjust filters"
        action={<button data-testid="reset">reset</button>}
      />,
    );
    expect(container.textContent).toContain('adjust filters');
    expect(container.querySelector('[data-testid="reset"]')).not.toBeNull();
  });
});
