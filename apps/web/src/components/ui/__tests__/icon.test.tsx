// apps/web/src/components/ui/__tests__/icon.test.tsx
//
// F-UIKit — `<Icon>` renders the canon SVGs (1.25 stroke, square cap, miter
// join), exposes `data-icon={name}`, and resizes via the `size` prop.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Icon, type IconName } from '../icon';

afterEach(() => cleanup());

const NAMES: IconName[] = [
  'arrow-r',
  'arrow-l',
  'check',
  'x',
  'plus',
  'spark',
  'cmd',
  'cloud',
  'doc',
  'box',
  'src',
  'play',
  'share',
  'caret-r',
  'caret-d',
  'bolt',
  'dot',
  'lock',
  'undo',
  'copy',
  'search',
  'warn',
  'bell',
];

describe('<Icon>', () => {
  it.each(NAMES)('renders SVG for %s', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector(`svg[data-icon="${name}"]`);
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('14');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('honors size prop', () => {
    const { container } = render(<Icon name="check" size={24} />);
    const svg = container.querySelector('svg[data-icon="check"]');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it('uses square stroke + currentColor + 1.25 stroke-width by default', () => {
    const { container } = render(<Icon name="arrow-r" />);
    const svg = container.querySelector('svg[data-icon="arrow-r"]');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('1.25');
    expect(svg?.getAttribute('stroke-linecap')).toBe('square');
  });

  it('renders dot variant with stroke-width=0 + filled circle', () => {
    const { container } = render(<Icon name="dot" />);
    const svg = container.querySelector('svg[data-icon="dot"]');
    expect(svg?.getAttribute('stroke-width')).toBe('0');
    expect(svg?.querySelector('circle')).not.toBeNull();
  });

  it('returns null for unknown name (typed-out escape hatch)', () => {
    // Cast through `unknown` to bypass TS — runtime safety check.
    const { container } = render(<Icon name={'nope' as unknown as IconName} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
