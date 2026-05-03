// apps/web/src/components/admin-ui/__tests__/kbd.test.tsx
//
// Phase 3 / C1 — `<Kbd>` emits a `kbd.mc-kbd` element.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Kbd } from '../kbd';

afterEach(() => cleanup());

describe('<Kbd>', () => {
  it('renders <kbd class="mc-kbd">', () => {
    const { container } = render(<Kbd>⌘</Kbd>);
    const kbd = container.querySelector('kbd.mc-kbd');
    expect(kbd).not.toBeNull();
    expect(kbd?.textContent).toBe('⌘');
  });

  it('appends user className', () => {
    const { container } = render(<Kbd className="extra">K</Kbd>);
    const kbd = container.querySelector('kbd');
    expect(kbd?.className).toContain('mc-kbd');
    expect(kbd?.className).toContain('extra');
  });
});
