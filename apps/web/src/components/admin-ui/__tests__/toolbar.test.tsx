// apps/web/src/components/admin-ui/__tests__/toolbar.test.tsx
//
// Phase 3 / C1 — `<Toolbar>` is a layout-only flex row with left/right
// slots.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Toolbar } from '../toolbar';

afterEach(() => cleanup());

describe('<Toolbar>', () => {
  it('renders adm-toolbar wrapper', () => {
    const { container } = render(<Toolbar />);
    const root = container.querySelector('.adm-toolbar');
    expect(root).not.toBeNull();
    expect(root?.className).toContain('row');
  });

  it('renders left + right slots when supplied', () => {
    const { container } = render(
      <Toolbar
        left={<span data-testid="l">l</span>}
        right={<span data-testid="r">r</span>}
      />,
    );
    expect(container.querySelector('[data-testid="l"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="r"]')).not.toBeNull();
  });

  it('omits empty slots', () => {
    const { container } = render(<Toolbar left={<span data-testid="l">l</span>} />);
    expect(container.querySelector('[data-testid="l"]')).not.toBeNull();
    // Only one inner div (left only).
    const inner = container.querySelector('.adm-toolbar')?.querySelectorAll(':scope > div');
    expect(inner?.length).toBe(1);
  });
});
