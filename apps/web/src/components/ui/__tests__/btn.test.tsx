// apps/web/src/components/ui/__tests__/btn.test.tsx
//
// F-UIKit — `<Btn>` renders the canon `mc-btn mc-btn-{kind} mc-btn-{size}` class
// set, surfaces the `mc-btn-full` modifier, embeds left/right `<Icon>` SVGs at
// size 13, and forwards arbitrary HTMLButton props.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Btn } from '../btn';

afterEach(() => cleanup());

describe('<Btn>', () => {
  it('renders default kind=ghost size=md', () => {
    const { getByRole } = render(<Btn>click</Btn>);
    const btn = getByRole('button');
    expect(btn.className).toContain('mc-btn');
    expect(btn.className).toContain('mc-btn-ghost');
    expect(btn.className).toContain('mc-btn-md');
    // Children wrapped in <span> per canon.
    expect(btn.querySelector('span')?.textContent).toBe('click');
    // Default type is button (not submit).
    expect((btn as HTMLButtonElement).type).toBe('button');
  });

  it.each([
    ['primary', 'sm'],
    ['ink', 'md'],
    ['ghost', 'lg'],
    ['soft', 'sm'],
    ['danger', 'md'],
    ['link', 'sm'],
  ] as const)('emits canon classes for kind=%s size=%s', (kind, size) => {
    const { getByRole } = render(
      <Btn kind={kind} size={size}>
        x
      </Btn>,
    );
    const btn = getByRole('button');
    expect(btn.className).toContain(`mc-btn-${kind}`);
    expect(btn.className).toContain(`mc-btn-${size}`);
  });

  it('applies mc-btn-full when full=true', () => {
    const { getByRole } = render(<Btn full>x</Btn>);
    expect(getByRole('button').className).toContain('mc-btn-full');
  });

  it('omits mc-btn-full when full=false', () => {
    const { getByRole } = render(<Btn>x</Btn>);
    expect(getByRole('button').className).not.toContain('mc-btn-full');
  });

  it('renders left icon at size 13', () => {
    const { getByRole } = render(<Btn icon="arrow-r">go</Btn>);
    const svg = getByRole('button').querySelector('svg[data-icon="arrow-r"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('13');
  });

  it('renders right icon when iconR is provided', () => {
    const { getByRole } = render(<Btn iconR="arrow-r">next</Btn>);
    const svg = getByRole('button').querySelector('svg[data-icon="arrow-r"]');
    expect(svg).not.toBeNull();
  });

  it('forwards onClick + disabled', () => {
    const onClick = vi.fn();
    const { getByRole, rerender } = render(
      <Btn onClick={onClick}>click</Btn>,
    );
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Btn onClick={onClick} disabled>
        click
      </Btn>,
    );
    fireEvent.click(getByRole('button'));
    // Disabled <button> blocks the click event in JSDOM.
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('appends user-supplied className', () => {
    const { getByRole } = render(<Btn className="extra">x</Btn>);
    const cls = getByRole('button').className;
    expect(cls).toContain('mc-btn');
    expect(cls).toContain('extra');
  });
});
