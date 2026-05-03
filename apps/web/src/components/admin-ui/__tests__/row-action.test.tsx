// apps/web/src/components/admin-ui/__tests__/row-action.test.tsx
//
// Phase 3 / C1 — `<RowAction>` is a thin wrapper around `<Btn kind="ghost"
// size="sm">`. Verify class composition + click forwarding.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { RowAction } from '../row-action';

afterEach(() => cleanup());

describe('<RowAction>', () => {
  it('emits the canon ghost+sm Btn classes', () => {
    const { getByRole } = render(<RowAction>impersonate</RowAction>);
    const btn = getByRole('button');
    expect(btn.className).toContain('mc-btn-ghost');
    expect(btn.className).toContain('mc-btn-sm');
  });

  it('fires onAction on click', () => {
    const onAction = vi.fn();
    const { getByRole } = render(<RowAction onAction={onAction}>x</RowAction>);
    fireEvent.click(getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('respects disabled prop', () => {
    const { getByRole } = render(<RowAction disabled>x</RowAction>);
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
