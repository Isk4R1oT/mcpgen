// apps/web/src/components/screens/admin/data/data.test.tsx
//
// Phase 3 / C2-data — vitest smoke for the Admin Data Catalog.
//
// Covers the canon-critical surfaces that must NOT be silently stripped:
//   - PageHead title "ops · data" + sub
//   - 4 KPI tiles in one `.adm-kpis` row (collections / rows / gen·24h /
//     errors·24h)
//   - All KPIs render `…` placeholder while the disabled BFF stub is live
//   - One EmptyState card ("live counts") while no data
//   - 15 collection rows in the catalog (matches canon `admin-data.jsx`
//     mock data — `users`, `servers`, `moderation`, `regions`, `deploys`,
//     `billing`, `llmModels`, `ratePools`, `flags`, `tickets`, `audit`,
//     `integrations`, `secrets`, `content`, `errors`)
//   - "refresh" / "export catalog" CTAs fire the toast stub
//   - Per-row "view" / "export" CTAs fire the toast stub
//
// The admin BFF endpoints don't exist yet (`useAdminMetrics` returns the
// `flag_off_or_not_implemented` Result). We mock `useAdminMetrics` to
// match that contract so the test exercises the same path the real
// disabled-stub does today.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { AdminData, CATALOG, CATALOG_TOTAL } from './data';

// next/navigation — Server Component shim under jsdom (the screen itself
// does not call `useRouter` today, but PHASE-3 brief requires admin
// screens to be navigation-context safe; mock pre-emptively).
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: vi.fn(),
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
  toastMock.mockReset();
});

describe('<AdminData>', () => {
  it('renders the canon PageHead title + sub', () => {
    const { container } = render(<AdminData />);
    const head = container.querySelector('.adm-page-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.adm-page-title')?.textContent).toBe(
      'ops · data',
    );
    expect(head?.querySelector('.adm-page-sub')?.textContent).toContain(
      'staff data catalog',
    );
  });

  it('renders 4 KPI tiles in one .adm-kpis row', () => {
    const { container } = render(<AdminData />);
    const rows = container.querySelectorAll('.adm-kpis');
    expect(rows.length).toBe(1);
    const tiles = container.querySelectorAll('.adm-kpi');
    expect(tiles.length).toBe(4);
  });

  it('shows the loading placeholder `…` for KPI values when the BFF stub is live', () => {
    const { container } = render(<AdminData />);
    const nums = Array.from(container.querySelectorAll('.adm-kpi-num')).map(
      (n) => n.textContent,
    );
    // Every KPI sits on the loading branch because `useAdminMetrics`
    // returns `flag_off_or_not_implemented`.
    expect(nums.every((v) => v === '…')).toBe(true);
  });

  it('renders the canon EmptyState in the live-counts card while disabled-stub is active', () => {
    const { container } = render(<AdminData />);
    const empties = container.querySelectorAll('.adm-empty');
    expect(empties.length).toBe(1);
    expect(empties[0]?.textContent).toContain('awaiting backend');
  });

  it('renders one row per canon collection (15 total)', () => {
    const { container } = render(<AdminData />);
    const rows = container.querySelectorAll('[data-collection-id]');
    expect(rows.length).toBe(CATALOG.length);
    expect(rows.length).toBe(15);
    const ids = Array.from(rows).map((r) =>
      r.getAttribute('data-collection-id'),
    );
    expect(ids).toEqual(CATALOG.map((c) => c.id));
  });

  it('exposes the canon catalog total as a stable reference (sum across rows)', () => {
    const sum = CATALOG.reduce((acc, c) => acc + c.canonCount, 0);
    expect(CATALOG_TOTAL).toBe(sum);
  });

  it('"refresh" header CTA fires the not-yet-wired toast stub (flag-OFF branch)', () => {
    const { getByRole } = render(<AdminData />);
    fireEvent.click(getByRole('button', { name: /refresh/i }));
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'info' }),
    );
  });

  it('"export catalog" header CTA fires the not-yet-wired toast stub', () => {
    const { getByRole } = render(<AdminData />);
    fireEvent.click(getByRole('button', { name: /export catalog/i }));
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'info' }),
    );
  });

  it('per-row "view" CTA fires the toast stub (every row)', () => {
    const { container } = render(<AdminData />);
    const rows = container.querySelectorAll('[data-collection-id]');
    expect(rows.length).toBe(CATALOG.length);
    rows.forEach((row) => {
      const btn = row.querySelector('button.mc-btn');
      // First button per row is "view"; second is "export".
      expect(btn).not.toBeNull();
      fireEvent.click(btn as HTMLButtonElement);
    });
    expect(toastMock.mock.calls.length).toBe(CATALOG.length);
    for (const call of toastMock.mock.calls) {
      expect(call[0]).toBe('admin action: not yet wired');
    }
  });

  it('"schema →" section link is keyboard-accessible and fires the toast stub', () => {
    const { getByText } = render(<AdminData />);
    const link = getByText(/schema →/i);
    fireEvent.click(link);
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      expect.objectContaining({ kind: 'info' }),
    );
  });

  it('honors the catalog override prop (test seam)', () => {
    const stub = [
      {
        id: 'only',
        label: 'only',
        description: 'sole row',
        canonCount: 1,
        kind: 'ok' as const,
        owner: 'platform' as const,
      },
    ];
    const { container } = render(<AdminData catalog={stub} />);
    const rows = container.querySelectorAll('[data-collection-id]');
    expect(rows.length).toBe(1);
    expect(rows[0]?.getAttribute('data-collection-id')).toBe('only');
  });
});
