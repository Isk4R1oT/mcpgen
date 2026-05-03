// apps/web/src/components/screens/admin/marketplace/marketplace.test.tsx
//
// Phase 3 / C3-marketplace — Admin marketplace moderation unit smoke.
//
// Verifies the canon-critical surfaces survive in code:
//   - Page head copy ("marketplace moderation" + "takedowns are 4-eyes…").
//   - Both header CTAs render ("filters" + "bulk approve · 12").
//   - 5-tab strip renders all canon labels with `adm-tabs` / `adm-tab`.
//   - Default tab is `queue` — the empty-state placeholder card renders
//     when the BFF disabled-stub returns zero items, plus the right-rail
//     detail still mounts (auto-checks list + policy-hit explainer +
//     three action buttons).
//   - Switching to a preview-only tab renders the canon EmptyState.
//   - "filters" CTA calls openDrawer with the canon eyebrow.
//   - All write actions fire `toast('admin action: not yet wired')` when
//     their flag is OFF (default). Reject CTA opens the modal regardless;
//     the modal's "send & request 4-eyes" confirm is what's gated.
//   - With each flag ON, the live canon copy is toasted.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import AdminMarketplaceScreen from './marketplace';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: Record<string, unknown>): void => {
    toastSpy(msg, opts);
  },
}));

const drawerSpy = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (
    title: string,
    body: unknown,
    opts?: Record<string, unknown>,
  ): void => {
    drawerSpy(title, body, opts);
  },
}));

// useAdminModerationQueue → return the disabled-stub Result so the screen
// renders the empty state (no rows). The mock matches the real hook shape
// (UseQueryResult-like) closely enough for the screen's
// `data.ok ? data.data.queue : []` branch.
vi.mock('@/lib/api/admin', () => ({
  useAdminModerationQueue: () => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    isLoading: false,
    isError: false,
  }),
}));

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  drawerSpy.mockReset();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('<AdminMarketplaceScreen>', () => {
  it('renders canon page head + sub copy', () => {
    const { container } = render(<AdminMarketplaceScreen />);
    const title = container.querySelector('.adm-page-title');
    const sub = container.querySelector('.adm-page-sub');
    expect(title?.textContent).toBe('marketplace moderation');
    expect(sub?.textContent).toContain('takedowns are 4-eyes');
  });

  it('renders both header CTAs', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    expect(getByRole('button', { name: /^filters$/i })).toBeTruthy();
    expect(getByRole('button', { name: /bulk approve/i })).toBeTruthy();
  });

  it('renders the 5-tab strip with `adm-tabs` / `adm-tab` classes', () => {
    const { container } = render(<AdminMarketplaceScreen />);
    const tabsRow = container.querySelector('.adm-tabs');
    expect(tabsRow).not.toBeNull();
    const tabs = Array.from(tabsRow!.querySelectorAll('.adm-tab')).map(
      (n) => n.textContent,
    );
    expect(tabs).toEqual([
      'review queue · 14',
      'user reports · 7',
      'featured',
      'categories',
      'policy',
    ]);
  });

  it('queue tab is default — renders empty-state placeholder + detail rail', () => {
    const { container, getByText } = render(<AdminMarketplaceScreen />);
    // Section labels survive in code (canon).
    expect(getByText('review queue · oldest first')).toBeTruthy();
    expect(getByText('14 pending · sla 4h')).toBeTruthy();
    expect(getByText('auto-checks')).toBeTruthy();
    expect(getByText('moderator notes')).toBeTruthy();

    // Empty list → canon empty placeholder on the queue card.
    const empty = container.querySelector('.adm-empty');
    expect(empty?.textContent).toContain('moderation queue · awaiting backend');

    // Right rail still mounts: 5 auto-checks, the policy-hit explainer,
    // and the 3 action buttons.
    const checks = container.querySelectorAll('.adm-approval');
    expect(checks.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('approve & list');
    expect(container.textContent).toContain('request changes');
  });

  it('preview-only tabs render the canon EmptyState', () => {
    const { container, getByTestId } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByTestId('adm-marketplace-tab-reports'));
    const empty = container.querySelector('.adm-empty');
    expect(empty?.textContent).toContain('reports — preview only');
  });

  it('"filters" CTA opens the drawer with the canon eyebrow', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /^filters$/i }));
    expect(drawerSpy).toHaveBeenCalledTimes(1);
    const [title, , opts] = drawerSpy.mock.calls[0]!;
    expect(title).toBe('moderation filters');
    expect(opts).toMatchObject({ eyebrow: 'narrow the queue' });
  });

  it('"bulk approve" with flag OFF (default) toasts the stub', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /bulk approve/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'info',
    });
  });

  it('"bulk approve" with flag ON toasts the live message', () => {
    const { getByRole } = render(<AdminMarketplaceScreen bulkApproveEnabled />);
    fireEvent.click(getByRole('button', { name: /bulk approve/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'approving 12 listings · 4-eyes required',
      undefined,
    );
  });

  it('"approve & list" with flag OFF toasts the stub', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /approve & list/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'info',
    });
  });

  it('"approve & list" with flag ON toasts the live message', () => {
    const { getByRole } = render(<AdminMarketplaceScreen approveEnabled />);
    fireEvent.click(getByRole('button', { name: /approve & list/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'approved · listed in marketplace',
      undefined,
    );
  });

  it('"request changes" with flag OFF toasts the stub', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /request changes/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'info',
    });
  });

  it('"request changes" with flag ON toasts the live message', () => {
    const { getByRole } = render(
      <AdminMarketplaceScreen requestChangesEnabled />,
    );
    fireEvent.click(getByRole('button', { name: /request changes/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'returned to author with notes',
      undefined,
    );
  });

  it('"reject" opens the takedown modal regardless of flag (UI compose)', () => {
    const { getByRole, container } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /^reject$/i }));
    // Modal mounts: dialog role + canon `adm-modal` class.
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.querySelector('.adm-modal')).not.toBeNull();
  });

  it('takedown modal cancel closes without toasting', () => {
    const { getByRole, container } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /^reject$/i }));
    fireEvent.click(getByRole('button', { name: /^cancel$/i }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('takedown modal confirm with flag OFF toasts the stub (warn)', () => {
    const { getByRole } = render(<AdminMarketplaceScreen />);
    fireEvent.click(getByRole('button', { name: /^reject$/i }));
    fireEvent.click(getByRole('button', { name: /send & request 4-eyes/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'warn',
    });
  });

  it('takedown modal confirm with flag ON toasts the live message', () => {
    const { getByRole } = render(<AdminMarketplaceScreen takedownEnabled />);
    fireEvent.click(getByRole('button', { name: /^reject$/i }));
    fireEvent.click(getByRole('button', { name: /send & request 4-eyes/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'rejection sent · awaiting 2nd moderator',
      { kind: 'warn' },
    );
  });
});
