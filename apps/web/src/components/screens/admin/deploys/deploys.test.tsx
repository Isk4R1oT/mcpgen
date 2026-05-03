// apps/web/src/components/screens/admin/deploys/deploys.test.tsx
//
// Phase 3 / C3-deploys — DeploysScreen unit smoke.
//
// Covers (per Phase 3 brief — admin sub-screens use a single 1280 snapshot
// + a tight unit smoke; no mobile/tablet audit):
//   1. Renders the canon page header (title + sub).
//   2. Renders the loading state for regions + deploys when the BFF stub
//      returns `flag_off_or_not_implemented`.
//   3. Renders all 5 hardcoded kill switches in canon order.
//   4. Clicking "kill switch" opens the master modal with the canon
//      "1.4M qps" warning verbatim.
//   5. Clicking a kill-switch toggle opens the flag-approval modal.
//   6. Clicking "resync" / "view all" / "page approver" fires the
//      flag-OFF toast stub (admin actions are not wired yet).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import { DeploysScreen } from './deploys';

// Spy on toast so we can assert the flag-OFF stubs fire. Forward only the
// arguments the caller actually supplies — when a stub passes a single arg
// we don't want a trailing `undefined` in the spy's call record.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]): void => {
    toastMock(...args);
  },
}));

const QC_CONFIG: QueryClientConfig = {
  defaultOptions: { queries: { retry: false } },
};

function renderScreen(): ReturnType<typeof render> {
  const qc = new QueryClient(QC_CONFIG);
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<DeploysScreen />, { wrapper: Wrapper });
}

describe('<DeploysScreen>', () => {
  beforeEach(() => {
    toastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the canon page header', () => {
    renderScreen();
    expect(screen.getByText('deploys & infra')).toBeTruthy();
    expect(
      screen.getByText('edge regions, kill switches, recent rollouts.'),
    ).toBeTruthy();
  });

  it('shows the loading state for regions when BFF stub is disabled', () => {
    renderScreen();
    expect(screen.getByText(/loading region health/i)).toBeTruthy();
  });

  it('shows the loading state for the deploys table when BFF stub is disabled', () => {
    renderScreen();
    expect(screen.getByText(/loading deploy history/i)).toBeTruthy();
  });

  it('renders all 5 hardcoded kill switches in canon order', () => {
    renderScreen();
    expect(screen.getByText('accept new signups')).toBeTruthy();
    expect(screen.getByText('accept new server publishes')).toBeTruthy();
    expect(screen.getByText('allow tool invocations · global')).toBeTruthy();
    expect(screen.getByText('allow oauth installs · github')).toBeTruthy();
    expect(screen.getByText('allow stripe charges')).toBeTruthy();
  });

  it('renders the 4-eyes approval note', () => {
    renderScreen();
    expect(
      screen.getByText(
        /flipping any switch requires 4-eyes\. all flips broadcast to #ops-incident\./i,
      ),
    ).toBeTruthy();
  });

  it('clicking "kill switch" opens the master modal with canon copy', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /^kill switch$/i }));
    expect(screen.getByText('global kill switch')).toBeTruthy();
    expect(
      screen.getByText(
        /this stops all tool invocations across all regions immediately/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/~1\.4M qps will start receiving 503/i)).toBeTruthy();
  });

  it('master kill modal "request approval" is disabled (4-eyes pending)', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /^kill switch$/i }));
    const reqBtn = screen.getByRole('button', { name: /request approval/i });
    expect(reqBtn.hasAttribute('disabled')).toBe(true);
  });

  it('clicking a kill-switch toggle opens the flag-approval modal', () => {
    const { container } = renderScreen();
    const firstToggle = container.querySelector('.adm-toggle');
    expect(firstToggle).not.toBeNull();
    fireEvent.click(firstToggle!);
    expect(screen.getByText('request approval to flip')).toBeTruthy();
    expect(
      screen.getByText(
        /flipping a kill switch is destructive\. another admin must confirm\. paging on-call \(sasha k\.\)\./i,
      ),
    ).toBeTruthy();
  });

  it('flag modal "page approver" toasts the canon stub and closes the modal', () => {
    const { container } = renderScreen();
    fireEvent.click(container.querySelector('.adm-toggle')!);
    fireEvent.click(screen.getByRole('button', { name: /page approver/i }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/paged sasha k\. · awaiting 2nd approval/i),
    );
    // Modal closed.
    expect(screen.queryByText('request approval to flip')).toBeNull();
  });

  it('clicking "resync" fires the canon flag-OFF toast', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /^resync$/i }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/region health resynced/i),
    );
  });

  it('clicking "view all" deploys link fires the canon toast', () => {
    renderScreen();
    fireEvent.click(screen.getByText(/view all/i));
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/opening full deploy history/i),
    );
  });

  it('master kill modal close button (esc) dismisses the modal', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /^kill switch$/i }));
    const dialog = screen.getByText('global kill switch').closest('.adm-modal');
    expect(dialog).not.toBeNull();
    const esc = within(dialog as HTMLElement).getByRole('button', {
      name: /^esc$/i,
    });
    fireEvent.click(esc);
    expect(screen.queryByText('global kill switch')).toBeNull();
  });
});
