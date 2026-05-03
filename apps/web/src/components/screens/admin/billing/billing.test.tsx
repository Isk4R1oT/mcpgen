// apps/web/src/components/screens/admin/billing/billing.test.tsx
//
// Phase 3 / C3-billing — vitest smoke for the Admin Billing & Plans screen.
//
// Covers the canon-critical surfaces that must NOT be silently stripped
// by a refactor:
//   - Page header: title "billing & plans" + sub copy.
//   - 4 KPI tiles in `.adm-grid` (mrr / failed payments / refunds / credits).
//   - All KPIs render `…` placeholder while the BFF stub is active.
//   - Tabs strip lists 5 ids (invoices/refunds/dunning/plans/tax).
//   - "invoices" tab → recent-invoices card with EmptyState (BFF off).
//   - Switching to "dunning" → 6 hardcoded steps render.
//   - Switching to "plans" or "tax" → "preview only" empty state.
//   - "issue credit" CTA opens the drawer (mock asserts call).
//   - "export csv" CTA fires the canon toast.
//
// The admin BFF endpoints don't exist yet (`useAdminInvoices` and
// `useAdminBillingKpis` return `flag_off_or_not_implemented`). We mock both
// hooks to match that contract so the test exercises the same path the
// real disabled-stub does today.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// Mock toast + drawer modules BEFORE importing the screen.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => {
    toastMock(msg, opts);
  },
}));

const openDrawerMock = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (title: string, body: unknown, opts?: unknown): void => {
    openDrawerMock(title, body, opts);
  },
}));

// Disabled-stub admin hooks — match what the real hooks return today.
vi.mock('@/lib/api/admin', () => ({
  useAdminInvoices: (): {
    data: { ok: false; status: number; error: string };
    refetch: () => Promise<void>;
  } => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    refetch: async (): Promise<void> => {
      /* no-op */
    },
  }),
  useAdminBillingKpis: (): {
    data: { ok: false; status: number; error: string };
    refetch: () => Promise<void>;
  } => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    refetch: async (): Promise<void> => {
      /* no-op */
    },
  }),
}));

import { Billing } from './billing';

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

describe('<Billing>', () => {
  it('renders the canon page title + sub copy', () => {
    const { container } = render(<Billing />);
    const title = container.querySelector('.adm-page-title');
    const sub = container.querySelector('.adm-page-sub');
    expect(title?.textContent).toBe('billing & plans');
    expect(sub?.textContent).toContain(
      'invoices, refunds, credits, dunning',
    );
  });

  it('renders 4 KPI cards in .adm-grid (mrr / failed / refunds / credits)', () => {
    const { container } = render(<Billing />);
    const grid = container.querySelector('.adm-grid');
    expect(grid).not.toBeNull();
    const kpiNums = grid?.querySelectorAll('.adm-kpi-num');
    expect(kpiNums?.length).toBe(4);
    // BFF stub → every KPI sits on the loading branch.
    Array.from(kpiNums ?? []).forEach((n) => {
      expect(n.textContent).toBe('…');
    });
    const labels = Array.from(
      grid?.querySelectorAll('.adm-kpi-label') ?? [],
    ).map((n) => n.textContent);
    expect(labels).toEqual([
      'mrr',
      'failed payments · 24h',
      'refunds · 30d',
      'credits · outstanding',
    ]);
  });

  it('renders the 5-tab strip (invoices/refunds/dunning/plans/tax)', () => {
    const { container } = render(<Billing />);
    const tabs = Array.from(container.querySelectorAll('.adm-tabs .adm-tab'));
    expect(tabs.length).toBe(5);
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'invoices',
      'refunds',
      'dunning',
      'plans',
      'tax',
    ]);
  });

  it('default tab "invoices" → renders recent-invoices Card with EmptyState (BFF off)', () => {
    const { container, getByText } = render(<Billing />);
    expect(getByText(/recent invoices/i)).toBeTruthy();
    const empty = container.querySelector('.adm-empty');
    expect(empty).not.toBeNull();
    // Loading branch (kpi stub returns ok=false → loading=true).
    expect(empty?.textContent).toContain('loading invoices');
  });

  it('switching to "dunning" tab → 6 hardcoded steps render', () => {
    const { container, getByText } = render(<Billing />);
    fireEvent.click(getByText('dunning'));
    expect(getByText(/dunning sequence/i)).toBeTruthy();
    // Day labels — canon copy.
    expect(getByText('day 0')).toBeTruthy();
    expect(getByText('day 30')).toBeTruthy();
    // Six "edit copy" buttons — one per step.
    const editButtons = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.textContent?.includes('edit copy'));
    expect(editButtons.length).toBe(6);
  });

  it('switching to "plans" tab → "preview only" empty state', () => {
    const { getByText, container } = render(<Billing />);
    fireEvent.click(getByText('plans'));
    expect(container.querySelector('.adm-empty')?.textContent).toContain(
      'plans — preview only',
    );
  });

  it('switching to "tax" tab → "preview only" empty state', () => {
    const { getByText, container } = render(<Billing />);
    fireEvent.click(getByText('tax'));
    expect(container.querySelector('.adm-empty')?.textContent).toContain(
      'tax — preview only',
    );
  });

  it('"issue credit" CTA opens the drawer', () => {
    const { getByRole } = render(<Billing />);
    fireEvent.click(getByRole('button', { name: /issue credit/i }));
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    const [title, , opts] = openDrawerMock.mock.calls[0] as [
      string,
      unknown,
      { eyebrow?: string },
    ];
    expect(title).toBe('issue credit');
    expect(opts?.eyebrow).toBe('one-time account credit');
  });

  it('"export csv" CTA fires the canon toast', () => {
    const { getByRole } = render(<Billing />);
    fireEvent.click(getByRole('button', { name: /export csv/i }));
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0]?.[0]).toBe(
      'exporting billing csv · audit row queued',
    );
  });

  it('"edit copy" on dunning row fires flag-OFF toast stub', () => {
    const { getByText, container } = render(<Billing />);
    fireEvent.click(getByText('dunning'));
    const editButtons = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.textContent?.includes('edit copy'));
    expect(editButtons.length).toBe(6);
    fireEvent.click(editButtons[0] as HTMLElement);
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'info' }),
    );
  });
});
