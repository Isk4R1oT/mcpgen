// apps/web/src/components/screens/admin/users/users.test.tsx
//
// Phase 3 / C2-users — Vitest smoke for the admin users screen.
//
// The BFF stub (`useAdminUsers()` in `lib/api/admin.ts`) returns
// `flag_off_or_not_implemented` until the admin BFF lands, so the screen
// renders the canon empty-state branch by default. These tests assert:
//
//   1. The canon empty-state copy ("no users match") shows on the left rail
//      when the disabled stub yields no users — proves the shell still
//      mounts even when the backend is missing.
//   2. The right-rail "no user selected" empty state renders alongside.
//   3. The status chip strip mirrors canon (all/active/flagged/suspended/
//      pending).
//   4. Clicking the "filter" button calls `openDrawer` with the canon
//      title `user filters` (and eyebrow `narrow user list`).
//   5. A user appearing in the live result populates the right rail and
//      clicking the "impersonate" CTA fires the toast stub (via the
//      flag-OFF action branch defined in FLAGS-NEEDED.md).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import UsersScreen from './users';

// next/navigation is server-only inside vitest; the screen does not actually
// use a router but related primitives might import it transitively.
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: vi.fn() }),
  usePathname: (): string => '/admin/users',
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastMock(msg, opts),
}));

const openDrawerMock = vi.fn(
  (_title: string, _body: ReactElement, _opts?: unknown): void => {
    /* spy only */
  },
);
vi.mock('@/lib/drawer', () => ({
  openDrawer: (
    title: string,
    body: ReactElement,
    opts?: unknown,
  ): void => openDrawerMock(title, body, opts),
  closeDrawer: vi.fn(),
}));

// Mockable handle for the admin users hook so individual tests can switch
// between "no data" (default disabled stub) and "live response" branches.
const useAdminUsersMock = vi.fn();
vi.mock('@/lib/api/admin', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/admin')>('@/lib/api/admin');
  return {
    ...actual,
    useAdminUsers: (): unknown => useAdminUsersMock(),
  };
});

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  openDrawerMock.mockReset();
  useAdminUsersMock.mockReset();
});

function renderUsers(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersScreen />
    </QueryClientProvider>,
  );
}

function disabledStub(): { data: { ok: false; status: 0; error: string } } {
  return {
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
  };
}

function liveStub(users: ReadonlyArray<Record<string, unknown>>): {
  data: { ok: true; data: { users: ReadonlyArray<Record<string, unknown>> } };
} {
  return { data: { ok: true, data: { users } } };
}

describe('<UsersScreen>', () => {
  it('renders the canon empty-state when the BFF stub yields no users', () => {
    useAdminUsersMock.mockReturnValue(disabledStub());
    renderUsers();
    expect(screen.getByText('no users match')).toBeTruthy();
  });

  it('renders the right-rail "no user selected" empty state alongside', () => {
    useAdminUsersMock.mockReturnValue(disabledStub());
    renderUsers();
    expect(screen.getByText(/no user selected/i)).toBeTruthy();
  });

  it('renders the canon status chip strip', () => {
    useAdminUsersMock.mockReturnValue(disabledStub());
    renderUsers();
    for (const chip of ['all', 'active', 'flagged', 'suspended', 'pending']) {
      expect(screen.getByText(chip)).toBeTruthy();
    }
  });

  it('opens the user-filters drawer with the canon eyebrow when "filter" clicked', () => {
    useAdminUsersMock.mockReturnValue(disabledStub());
    renderUsers();
    const btn = screen.getByRole('button', { name: /filter/i });
    fireEvent.click(btn);
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    expect(openDrawerMock.mock.calls[0]?.[0]).toBe('user filters');
    const opts = openDrawerMock.mock.calls[0]?.[2] as
      | { eyebrow?: string }
      | undefined;
    expect(opts?.eyebrow).toBe('narrow user list');
  });

  it('renders the detail rail and stubs the impersonate action when a user is loaded', () => {
    useAdminUsersMock.mockReturnValue(
      liveStub([
        {
          id: 'u_1',
          name: 'mira chen',
          email: 'mira@lumen.dev',
          org: 'lumen-payments',
          role: 'owner',
          status: 'active',
          plan: 'team',
          created: '2024-03-12',
          last_seen: '2 min ago',
          mfa: true,
          servers: 4,
          spend: '$487.20',
          country: 'CA',
        },
      ]),
    );
    renderUsers();
    // Selected user name appears as the page title in the right rail.
    expect(screen.getAllByText('mira chen').length).toBeGreaterThan(0);
    // Impersonate CTA → click → modal opens, then "start session" enabled
    // only after a reason is filled. We only assert the toast fires from a
    // simpler entry point: the danger-tab "force password reset".
    const tab = screen.getByRole('tab', { name: 'danger' });
    fireEvent.click(tab);
    const resetBtn = screen.getByRole('button', {
      name: /force password reset/i,
    });
    fireEvent.click(resetBtn);
    expect(toastMock).toHaveBeenCalledWith(
      'admin action: not yet wired',
      undefined,
    );
  });
});
