// apps/web/src/components/admin-ui/__tests__/sparkline.test.tsx
//
// Phase 3 / C1 — `<Sparkline>` returns null on empty values, otherwise
// emits an `<svg class="adm-spark">` with a `<polyline class="adm-mini-spark {kind}">`.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Sparkline } from '../sparkline';

afterEach(() => cleanup());

describe('<Sparkline>', () => {
  it('returns nothing when values is empty', () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders svg + polyline with the supplied kind', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4]} kind="up" />);
    const svg = container.querySelector('svg.adm-spark');
    expect(svg).not.toBeNull();
    const poly = svg?.querySelector('polyline.adm-mini-spark');
    expect(poly).not.toBeNull();
    expect(poly?.classList.contains('up')).toBe(true);
    // Each point pair should be present.
    expect(poly?.getAttribute('points')?.split(' ')).toHaveLength(4);
  });

  it('respects width and height props', () => {
    const { container } = render(<Sparkline values={[1, 2]} width={120} height={40} />);
    const svg = container.querySelector('svg.adm-spark');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(svg?.getAttribute('height')).toBe('40');
  });
});
