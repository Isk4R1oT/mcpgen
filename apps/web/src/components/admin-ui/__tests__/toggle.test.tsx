// apps/web/src/components/admin-ui/__tests__/toggle.test.tsx
//
// Phase 3 / C1 — `<Toggle>` mirrors canon admin-ui.jsx `Toggle`:
// renders `adm-toggle` (+ `.on` when on=true), fires onChange(!on) on click,
// and exposes a switch role for accessibility.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Toggle } from '../toggle';

afterEach(() => cleanup());

describe('<Toggle>', () => {
  it('renders off state without .on', () => {
    const { container } = render(<Toggle on={false} />);
    const root = container.querySelector('.adm-toggle');
    expect(root?.classList.contains('on')).toBe(false);
    expect(root?.getAttribute('aria-checked')).toBe('false');
  });

  it('renders on state with .on', () => {
    const { container } = render(<Toggle on />);
    const root = container.querySelector('.adm-toggle');
    expect(root?.classList.contains('on')).toBe(true);
    expect(root?.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange(!on) on click', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle on={false} onChange={onChange} />);
    fireEvent.click(container.querySelector('.adm-toggle')!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders trailing label when provided', () => {
    const { container } = render(<Toggle on label="auto-refresh" />);
    expect(container.textContent).toContain('auto-refresh');
  });
});
