// apps/web/src/components/screens/admin/audit/audit.test.tsx
//
// Phase 3 / C4-audit — Vitest unit smoke for the admin audit log screen.
//
// Verifies:
//   - Renders canon header + sub.
//   - Renders the canon filter strip (4 inputs).
//   - Renders the events table with the canon fixture data (9 rows).
//   - "view diff" opens the diff modal for events with hasDiff=true.
//   - "view" emits the canon "no diff for this event" toast for events
//     without a diff.
//   - "export · 90d" emits the canon stub toast (BFF endpoint missing).
//   - "webhook config" opens the canon drawer with the canon eyebrow.
//   - "esc" / "close" inside the diff modal dismisses it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import Audit, { type AuditEvent } from './audit';

const toastMock = vi.fn();
const openDrawerMock = vi.fn();

vi.mock('@/lib/toast', () => ({
  toast: (msg: string) => toastMock(msg),
}));
vi.mock('@/lib/drawer', () => ({
  openDrawer: (title: string, body: unknown, opts?: unknown) =>
    openDrawerMock(title, body, opts),
}));

afterEach(() => cleanup());
beforeEach(() => {
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

describe('<Audit>', () => {
  it('renders canon header copy', () => {
    render(<Audit />);
    expect(screen.getByText(/audit log/i)).toBeTruthy();
    expect(
      screen.getByText(/every privileged action/i),
    ).toBeTruthy();
  });

  it('renders the 4-column filter strip', () => {
    render(<Audit />);
    expect(screen.getByLabelText('audit filter kind')).toBeTruthy();
    expect(screen.getByLabelText('audit filter actor')).toBeTruthy();
    expect(screen.getByLabelText('audit filter target')).toBeTruthy();
    expect(screen.getByLabelText('audit filter date')).toBeTruthy();
  });

  it('renders one row per event with the canon counter', () => {
    render(<Audit />);
    expect(screen.getByText(/events · 9 of 14,402/i)).toBeTruthy();
    // Spot-check a couple of canon actions render.
    expect(screen.getByText('user.suspend')).toBeTruthy();
    expect(screen.getByText('killswitch.flip')).toBeTruthy();
  });

  it('opens the diff modal when an event has a diff', () => {
    render(<Audit />);
    // First "view diff" → user.suspend (canon row 1).
    const viewDiff = screen.getAllByText(/view diff/i)[0];
    if (viewDiff === undefined) throw new Error('expected view diff button');
    fireEvent.click(viewDiff);
    // Modal renders the canon "state diff" section label.
    expect(screen.getByText(/state diff/i)).toBeTruthy();
    expect(screen.getByText(/sha256:8a91qp4f…3c2e/)).toBeTruthy();
  });

  it('toasts when a diffless event is opened', () => {
    // Provide a diffless-only fixture so we are guaranteed to click
    // a "view" (not "view diff").
    const events: AuditEvent[] = [
      {
        ts: '2025-10-14 12:55:33',
        actor: 'ali m.',
        ip: '74.125.x.x',
        action: 'user.export.gdpr',
        target: 'u_8s10 · linear',
        fourEyes: false,
        hasDiff: false,
        ticket: 't_878',
      },
    ];
    render(<Audit events={events} />);
    fireEvent.click(screen.getByText(/^view$/i));
    expect(toastMock).toHaveBeenCalledWith('no diff for this event');
  });

  it('emits the export-90d toast stub', () => {
    render(<Audit />);
    fireEvent.click(screen.getByText(/export · 90d/i));
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/exporting 90d audit log/i),
    );
  });

  it('opens the webhook config drawer with the canon eyebrow', () => {
    render(<Audit />);
    fireEvent.click(screen.getByText(/webhook config/i));
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    const call = openDrawerMock.mock.calls[0];
    if (call === undefined) throw new Error('expected drawer call');
    expect(call[0]).toBe('audit webhook config');
    expect(call[2]).toEqual({ eyebrow: 'soc2 · stream every action' });
  });

  it('closes the diff modal when "close" is clicked', () => {
    render(<Audit />);
    const viewDiff = screen.getAllByText(/view diff/i)[0];
    if (viewDiff === undefined) throw new Error('expected view diff button');
    fireEvent.click(viewDiff);
    expect(screen.queryByText(/state diff/i)).not.toBeNull();
    fireEvent.click(screen.getByText(/^close$/i));
    expect(screen.queryByText(/state diff/i)).toBeNull();
  });

  it('emits the export-json toast inside the diff modal', () => {
    render(<Audit />);
    const viewDiff = screen.getAllByText(/view diff/i)[0];
    if (viewDiff === undefined) throw new Error('expected view diff button');
    fireEvent.click(viewDiff);
    fireEvent.click(screen.getByText(/export json/i));
    expect(toastMock).toHaveBeenCalledWith('downloaded as json');
  });
});
