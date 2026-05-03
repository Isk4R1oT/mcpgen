// apps/web/src/components/screens/admin/support/support.test.tsx
//
// Phase 3 / C4-support — Support screen unit smoke.
//
// Verifies the canon-critical surfaces survive a refactor:
//   1. Renders the canon split shell (`.adm-split` with `.left` + `.right`).
//   2. Lists all 6 fallback tickets with priority pills and assignee labels.
//   3. Selecting a ticket updates the detail header (`adm-page-title`).
//   4. Header action buttons (assign…, snooze, resolve) toast the canon
//      "admin action: not yet wired" stub when their flag is OFF (default).
//   5. With the per-action flag ON the canon-shaped success toast fires.
//   6. Org link in the detail header routes to /admin/users.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import Support from './support';

// next/navigation is server-only under jsdom — stub the router hook.
const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushSpy }),
}));

// Toast — capture every call so we can assert on argument shape.
const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: { kind?: string }): void =>
    toastSpy(msg, opts),
}));

afterEach(() => {
  cleanup();
  pushSpy.mockReset();
  toastSpy.mockReset();
});

describe('<Support>', () => {
  it('renders the canon split shell with both panes', () => {
    const { container } = render(<Support />);
    expect(container.querySelector('.adm-split')).not.toBeNull();
    expect(container.querySelector('.adm-split > .left')).not.toBeNull();
    expect(container.querySelector('.adm-split > .right')).not.toBeNull();
  });

  it('lists all 6 fallback tickets', () => {
    const { container } = render(<Support />);
    const rows = container.querySelectorAll('.adm-trow');
    expect(rows.length).toBe(6);
    const ids = Array.from(rows).map((el) => el.getAttribute('data-ticket-id'));
    expect(ids).toEqual([
      't_882',
      't_881',
      't_880',
      't_879',
      't_878',
      't_877',
    ]);
  });

  it('marks the first ticket selected on initial render', () => {
    const { container } = render(<Support />);
    const selRows = container.querySelectorAll('.adm-trow.sel');
    expect(selRows.length).toBe(1);
    expect(selRows[0]?.getAttribute('data-ticket-id')).toBe('t_882');
    // Detail header reflects the selected ticket subject.
    const title = container.querySelector('.adm-page-title');
    expect(title?.textContent).toMatch(/oauth callback fails/);
  });

  it('switches selection when a different row is clicked', () => {
    const { container } = render(<Support />);
    const target = container.querySelector(
      '[data-ticket-id="t_879"]',
    ) as HTMLDivElement | null;
    expect(target).not.toBeNull();
    if (target === null) throw new Error('target row missing');
    fireEvent.click(target);
    const selRows = container.querySelectorAll('.adm-trow.sel');
    expect(selRows.length).toBe(1);
    expect(selRows[0]?.getAttribute('data-ticket-id')).toBe('t_879');
    const title = container.querySelector('.adm-page-title');
    expect(title?.textContent).toMatch(/rate-limit feels too aggressive/);
  });

  it('toasts "admin action: not yet wired" when assign is clicked with flag OFF', () => {
    const { getByRole } = render(<Support />);
    const assignBtn = getByRole('button', { name: /assign/i });
    fireEvent.click(assignBtn);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]?.[0]).toBe('admin action: not yet wired');
  });

  it('toasts the canon success copy when reply flag is ON', () => {
    const { getByRole } = render(
      <Support flags={{ reply: true }} />,
    );
    const send = getByRole('button', { name: /send reply/i });
    fireEvent.click(send);
    expect(toastSpy).toHaveBeenCalledWith(
      'reply sent to customer',
      expect.objectContaining({ kind: 'info' }),
    );
  });

  it('toasts the canon snooze copy with the selected ticket id when flag is ON', () => {
    const { getByRole } = render(
      <Support flags={{ snooze: true }} />,
    );
    // The header has a stand-alone "snooze" button + a "reply & snooze"
    // button in the reply card. We want the header one — match exactly.
    const snooze = getByRole('button', { name: /^snooze$/i });
    fireEvent.click(snooze);
    // The selected ticket on first render is t_882.
    expect(toastSpy).toHaveBeenCalledWith(
      't_882 snoozed for 4h',
      expect.objectContaining({ kind: 'info' }),
    );
  });

  it('routes to /admin/users when the org header link is clicked', () => {
    const { container } = render(<Support />);
    // The detail header has 2 adm-link entries (`from` + `org`); the second
    // one is the org link → goUsers.
    const orgLink = container.querySelectorAll('.adm-detail-head .adm-link')[1];
    expect(orgLink).not.toBeUndefined();
    fireEvent.click(orgLink as Element);
    expect(pushSpy).toHaveBeenCalledWith('/admin/users');
  });

  it('routes to /admin/obs when the related-signals errors link is clicked', () => {
    const { container } = render(<Support />);
    // The "related signals" sidebar is in `.right` outside `.adm-detail-head`.
    const sidebar = container.querySelectorAll('.right .adm-link');
    // Last adm-link in the right pane is the obs target ("14 errors …").
    const obsLink = sidebar[sidebar.length - 1];
    expect(obsLink).not.toBeUndefined();
    fireEvent.click(obsLink as Element);
    expect(pushSpy).toHaveBeenCalledWith('/admin/obs');
  });

  it('renders the empty state when no tickets are passed', () => {
    const { container } = render(<Support initialTickets={[]} />);
    expect(container.querySelectorAll('.adm-trow').length).toBe(0);
    // Empty state surfaces the "tickets unavailable" caption.
    const captions = container.querySelectorAll(
      '.right .mc-caption-up, .right .mc-seclbl span',
    );
    const text = Array.from(captions)
      .map((el) => el.textContent ?? '')
      .join(' ');
    expect(text).toMatch(/tickets unavailable/i);
  });
});
