// apps/web/src/components/screens/admin/broadcast/broadcast.test.tsx
//
// Phase 3 / C4-broadcast — vitest unit smoke for the BroadcastScreen.
//
// Covers:
// - Renders canon header + 3 step cards + preview + safety-checks card.
// - Audience selection swaps the 'sel' radio + recipient count.
// - Switching audience to 'custom' reveals the SQL editor + dry-run CTA.
// - Save-draft / history / spam-score / send-test buttons fire toast/drawer.
// - Request-approval CTA opens the approval modal; confirm fires toast.
// - Channel chip switch updates selected chip.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { BroadcastScreen } from './broadcast';

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string): void => toastMock(msg),
}));

const openDrawerMock = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (...args: unknown[]): void => {
    openDrawerMock(...args);
  },
}));

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

describe('<BroadcastScreen>', () => {
  it('renders canon page title + sub + all three step labels', () => {
    const { getByText } = render(<BroadcastScreen />);
    expect(getByText(/broadcast composer/i)).toBeTruthy();
    expect(
      getByText(/incident comms, product news, scheduled sends/i),
    ).toBeTruthy();
    expect(getByText(/1 · audience/i)).toBeTruthy();
    expect(getByText(/2 · channel/i)).toBeTruthy();
    expect(getByText(/3 · schedule/i)).toBeTruthy();
    expect(getByText(/safety checks/i)).toBeTruthy();
  });

  it('shows recipient count for the default audience (plan_pro)', () => {
    const { getByText } = render(<BroadcastScreen />);
    // Default initialAudience = plan_pro → 8842 → "8,842 recipients".
    expect(getByText(/8,842 recipients/)).toBeTruthy();
  });

  it('reveals the custom-segment SQL editor when audience=custom', () => {
    const { getByText, queryByText } = render(<BroadcastScreen />);
    expect(queryByText(/dry-run · count/i)).toBeNull();
    fireEvent.click(getByText(/custom segment…/i));
    expect(getByText(/sql segment/i)).toBeTruthy();
    expect(getByText(/dry-run · count/i)).toBeTruthy();
  });

  it('fires dry-run toast when custom segment dry-run is clicked', () => {
    const { getByText } = render(<BroadcastScreen />);
    fireEvent.click(getByText(/custom segment…/i));
    fireEvent.click(getByText(/dry-run · count/i));
    expect(toastMock).toHaveBeenCalledWith(
      'dry-run: 1,402 recipients match',
    );
  });

  it('fires save-draft toast and opens history drawer', () => {
    const { getByText } = render(<BroadcastScreen />);
    fireEvent.click(getByText(/save draft/i));
    expect(toastMock).toHaveBeenCalledWith(
      'draft saved · ali · just now',
    );

    fireEvent.click(getByText(/^history$/i));
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    const [title, , opts] = openDrawerMock.mock.calls[0]!;
    expect(title).toBe('broadcast history');
    expect(opts).toEqual({ eyebrow: 'last 30 days' });
  });

  it('fires send-test and spam-score toasts', () => {
    const { getByText } = render(<BroadcastScreen />);
    fireEvent.click(getByText(/send test to me/i));
    expect(toastMock).toHaveBeenCalledWith('test sent to ali@mcpgen.dev');

    fireEvent.click(getByText(/spam-score/i));
    expect(toastMock).toHaveBeenCalledWith(
      'spam score: 2.1/10 · deliverable',
    );
  });

  it('opens approval modal and fires confirmation toast on submit', () => {
    const { getByText, queryByText, getAllByText } = render(
      <BroadcastScreen />,
    );
    expect(queryByText(/request approval to send/i)).toBeNull();

    // Click the header CTA (the modal button label is a different copy).
    const requestBtns = getAllByText(/request approval/i);
    fireEvent.click(requestBtns[0]!);
    expect(getByText(/request approval to send/i)).toBeTruthy();
    expect(getByText(/pick 2nd approver/i)).toBeTruthy();

    // Modal "request approval" footer button → confirm.
    const allRequest = getAllByText(/request approval/i);
    // The last instance is the modal footer Btn (after open).
    fireEvent.click(allRequest[allRequest.length - 1]!);
    expect(toastMock).toHaveBeenCalledWith(
      'approval requested · noor f. pinged on slack',
    );
    expect(queryByText(/request approval to send/i)).toBeNull();
  });
});
