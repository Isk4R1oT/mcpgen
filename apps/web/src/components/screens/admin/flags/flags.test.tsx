// apps/web/src/components/screens/admin/flags/flags.test.tsx
//
// Phase 3 / C3-flags — `<FlagsScreen>` unit smoke.
//
// Verifies:
//   - Renders canon page header strings ("feature flags & experiments",
//     "staged rollouts, kill switches per feature, a/b tests.").
//   - All 5 canon flag rows render with their ids in mc-mono captions.
//   - Stage Pills carry the canon kind classes (ok / info / warn / blank).
//   - "Active experiment" KPIs render the canon control / variant numbers.
//   - Clicking "edit" on a row opens the canon `mc-modal-veil` modal with
//     `edit · <flag name>` heading.
//   - Clicking "kill" toasts a warn-tone stub message via `@/lib/toast`.
//
// Toast and drawer are spied via vi.mock so the test asserts on call args
// without mounting the global hosts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastSpy(msg, opts),
}));

const openDrawerSpy = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (title: string, body: unknown, opts?: unknown): void =>
    openDrawerSpy(title, body, opts),
}));

import { FlagsScreen } from '../flags/flags';

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  openDrawerSpy.mockReset();
});

describe('<FlagsScreen>', () => {
  it('renders canon page header copy', () => {
    const { container } = render(<FlagsScreen />);
    expect(container.querySelector('.adm-page-title')?.textContent).toContain(
      'feature flags',
    );
    expect(container.querySelector('.adm-page-sub')?.textContent).toContain(
      'staged rollouts',
    );
  });

  it('lists all 5 canon flags with their ids', () => {
    const { container } = render(<FlagsScreen />);
    const ids = [
      'fl_drift_v2',
      'fl_mp_featured',
      'fl_haiku_router',
      'fl_billing_v3',
      'fl_admin_panel',
    ];
    for (const id of ids) {
      expect(container.textContent).toContain(id);
    }
  });

  it('renders stage Pills with canon kinds (ok / info / warn / blank)', () => {
    const { container } = render(<FlagsScreen />);
    const pills = container.querySelectorAll('.adm-pill');
    // 5 row pills + 1 active-experiment pill ("canary 5%").
    expect(pills.length).toBe(6);
    // 'ok' pills: fl_mp_featured + fl_admin_panel (both stage="on") = 2.
    expect(container.querySelectorAll('.adm-pill.ok').length).toBe(2);
    // 'info' pills: fl_haiku_router (experiment) + canary 5% header = 2.
    expect(container.querySelectorAll('.adm-pill.info').length).toBe(2);
    // 'warn' pill: fl_drift_v2 (rolling out) = 1.
    expect(container.querySelectorAll('.adm-pill.warn').length).toBe(1);
  });

  it('renders the active experiment KPI grid', () => {
    const { container } = render(<FlagsScreen />);
    const text = container.textContent ?? '';
    expect(text).toContain('cheap-route haiku-4');
    expect(text).toContain('92.1%');
    expect(text).toContain('93.7%');
    expect(text).toContain('−14%');
    expect(text).toContain('−38%');
  });

  it('opens the edit modal when an edit button is clicked', () => {
    const { container } = render(<FlagsScreen />);
    expect(container.querySelector('.mc-modal-veil')).toBeNull();
    // The first "edit" row button corresponds to the first canon flag.
    const editButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.mc-btn'),
    ).filter((b) => b.textContent?.trim().toLowerCase() === 'edit');
    expect(editButtons.length).toBe(5);
    fireEvent.click(editButtons[0]!);
    const veil = container.querySelector('.mc-modal-veil');
    expect(veil).not.toBeNull();
    // Modal heading: `edit · <flag name>`.
    expect(veil?.querySelector('.mc-h3')?.textContent).toContain('edit');
    expect(veil?.querySelector('.mc-h3')?.textContent).toContain(
      'spec-drift detector v2',
    );
  });

  it('toasts the warn-tone stub when "kill" is clicked (default editEnabled OFF)', () => {
    const { container } = render(<FlagsScreen />);
    const killBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.mc-btn'),
    ).find((b) => b.textContent?.trim().toLowerCase() === 'kill');
    expect(killBtn).not.toBeUndefined();
    fireEvent.click(killBtn!);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'warn' }),
    );
  });

  it('opens the canon drawer when "new flag" is clicked', () => {
    const { container } = render(<FlagsScreen />);
    const newBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.mc-btn'),
    ).find((b) => b.textContent?.trim().toLowerCase() === 'new flag');
    expect(newBtn).not.toBeUndefined();
    fireEvent.click(newBtn!);
    expect(openDrawerSpy).toHaveBeenCalledTimes(1);
    expect(openDrawerSpy.mock.calls[0]![0]).toBe('new feature flag');
    expect(openDrawerSpy.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ eyebrow: 'staged rollout' }),
    );
  });

  it('toasts the wired warn confirm when editEnabled=true', () => {
    const { container } = render(<FlagsScreen editEnabled={true} />);
    const killBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.mc-btn'),
    ).find((b) => b.textContent?.trim().toLowerCase() === 'kill');
    fireEvent.click(killBtn!);
    expect(toastSpy).toHaveBeenCalledWith(
      'confirm: type the flag name to kill',
      expect.objectContaining({ kind: 'warn' }),
    );
  });
});
