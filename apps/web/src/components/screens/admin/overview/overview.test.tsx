// apps/web/src/components/screens/admin/overview/overview.test.tsx
//
// Phase 3 / C2-overview — vitest smoke for the Admin Ops Overview.
//
// Covers the canon-critical surfaces that must NOT be silently stripped
// by a refactor:
//   - PageHead title "ops · overview" + sub
//   - 8 KPI tiles total (across two `.adm-kpis` rows)
//   - All KPIs render `…` placeholder while data is loading
//   - Three list cards (recent activity / moderation / edge health) each
//     render an `<EmptyState>` while the disabled-stub is active
//   - "broadcast" admin action fires the toast stub (flag-OFF branch)
//   - "open audit log →" link routes to /admin/audit
//   - "refresh" button calls toast stub
//
// The admin BFF endpoints don't exist yet (`useAdminMetrics` returns the
// `flag_off_or_not_implemented` Result). We mock `useAdminMetrics` to
// match that contract so the test exercises the same path the real
// disabled-stub does today.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { Overview } from './overview';

// next/navigation — Server Component shim under jsdom.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
}));

// Toast stub.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => {
    toastMock(msg, opts);
  },
}));

// Disabled-stub admin metrics — matches what the real hook returns today.
vi.mock('@/lib/api/admin', () => ({
  useAdminMetrics: (): {
    data: { ok: false; status: number; error: string };
    refetch: () => Promise<void>;
  } => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    refetch: async (): Promise<void> => {
      /* no-op */
    },
  }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
});

describe('<Overview>', () => {
  it('renders the canon PageHead title + sub', () => {
    const { container } = render(<Overview />);
    const head = container.querySelector('.adm-page-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.adm-page-title')?.textContent).toBe(
      'ops · overview',
    );
    expect(head?.querySelector('.adm-page-sub')?.textContent).toBe(
      'last 24h · prod · all regions',
    );
  });

  it('renders 8 KPI tiles across two .adm-kpis rows', () => {
    const { container } = render(<Overview />);
    const rows = container.querySelectorAll('.adm-kpis');
    expect(rows.length).toBe(2);
    const tiles = container.querySelectorAll('.adm-kpi');
    expect(tiles.length).toBe(8);
  });

  it('shows the loading placeholder `…` for KPI values when the BFF stub is live', () => {
    const { container } = render(<Overview />);
    const nums = Array.from(container.querySelectorAll('.adm-kpi-num')).map(
      (n) => n.textContent,
    );
    // Every KPI sits on the loading branch (`value={loading ? '…' : '...'}`)
    // because `useAdminMetrics` returns `flag_off_or_not_implemented`.
    expect(nums.every((v) => v === '…')).toBe(true);
  });

  it('renders three EmptyState cards (audit / moderation / regions) when no data', () => {
    const { container } = render(<Overview />);
    const empties = container.querySelectorAll('.adm-empty');
    expect(empties.length).toBe(3);
    expect(empties[0]?.textContent).toContain('no activity in this window');
    expect(empties[1]?.textContent).toContain('no items in queue');
    expect(empties[2]?.textContent).toContain('no region telemetry');
  });

  it('"broadcast" CTA fires the toast stub (flag-OFF branch)', () => {
    const { getByRole } = render(<Overview />);
    const btn = getByRole('button', { name: /broadcast/i });
    fireEvent.click(btn);
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'info' }),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('"refresh" CTA fires the refreshed toast', () => {
    const { getByRole } = render(<Overview />);
    fireEvent.click(getByRole('button', { name: /refresh/i }));
    // Toast wrapper signature is (msg, opts?); opts is undefined here.
    expect(toastMock).toHaveBeenCalledWith('refreshed · 12s ago', undefined);
  });

  it('"open audit log →" link navigates to /admin/audit', () => {
    const { getByText } = render(<Overview />);
    fireEvent.click(getByText(/open audit log/i));
    expect(pushMock).toHaveBeenCalledWith('/admin/audit');
  });

  it('"queue →" link navigates to /admin/marketplace (moderation surface)', () => {
    const { getByText } = render(<Overview />);
    fireEvent.click(getByText(/queue →/i));
    expect(pushMock).toHaveBeenCalledWith('/admin/marketplace');
  });

  it('"regions →" link navigates to /admin/deploys', () => {
    const { getByText } = render(<Overview />);
    fireEvent.click(getByText(/regions →/i));
    expect(pushMock).toHaveBeenCalledWith('/admin/deploys');
  });
});
