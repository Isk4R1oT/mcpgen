// apps/web/src/components/ui/__tests__/switch-button.test.tsx
//
// F-UIKit — `<SwitchButton>` renders a role="switch" button with canon
// `adm-toggle` class set; flips `on` modifier + `aria-checked` based on state;
// fires onChange(next) on click; respects disabled.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Switch, SwitchButton } from '../switch-button';

afterEach(() => cleanup());

describe('<SwitchButton>', () => {
  it('renders adm-toggle without `on` when checked=false', () => {
    const { getByRole } = render(<SwitchButton checked={false} onChange={() => undefined} />);
    const btn = getByRole('switch');
    expect(btn.className).toContain('adm-toggle');
    expect(btn.className).not.toContain(' on');
    expect(btn.getAttribute('aria-checked')).toBe('false');
  });

  it('adds `on` modifier when checked=true', () => {
    const { getByRole } = render(<SwitchButton checked onChange={() => undefined} />);
    const btn = getByRole('switch');
    expect(btn.className).toContain('on');
    expect(btn.getAttribute('aria-checked')).toBe('true');
  });

  it('renders track + knob children', () => {
    const { container } = render(<SwitchButton checked onChange={() => undefined} />);
    expect(container.querySelector('.adm-toggle .track')).not.toBeNull();
    expect(container.querySelector('.adm-toggle .track .knob')).not.toBeNull();
  });

  it('renders label when provided', () => {
    const { getByRole } = render(
      <SwitchButton checked={false} onChange={() => undefined} label="dark mode" />,
    );
    const btn = getByRole('switch');
    expect(btn.textContent).toContain('dark mode');
  });

  it('fires onChange(next=true) when toggled from false', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<SwitchButton checked={false} onChange={onChange} />);
    fireEvent.click(getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SwitchButton checked={false} onChange={onChange} disabled />,
    );
    fireEvent.click(getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Switch alias matches SwitchButton', () => {
    expect(Switch).toBe(SwitchButton);
  });
});
