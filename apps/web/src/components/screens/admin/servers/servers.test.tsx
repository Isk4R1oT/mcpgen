// apps/web/src/components/screens/admin/servers/servers.test.tsx
//
// Phase 3 / C2-servers — vitest unit smoke for the admin servers screen.
//
// Covers:
// - Renders the canon loading state when the BFF stub returns
//   `flag_off_or_not_implemented` (default — admin servers BFF missing).
// - Renders the left-rail rows + right-rail detail when seeded with
//   fixture data (mocked `useAdminServers`).
// - Header CTA `takedown` fires `toast()` (canon stub copy).
// - `rollback` opens the version-pick modal; cancel dismisses it without
//   calling toast.
// - The drift tab surfaces the "force regenerate" / "pin to old spec" /
//   "notify owner" actions and each fires a canon-parity toast.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ServersScreen } from './servers';
import type { AdminServerSummary } from '@/lib/api/admin';

// ── Mocks ──────────────────────────────────────────────────────────────────

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

interface ServersStub {
  ok: boolean;
  data?: { servers: ReadonlyArray<AdminServerSummary> };
  error?: string;
  status?: number;
}

const serversRef: { current: ServersStub } = {
  current: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
};

vi.mock('@/lib/api/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/admin')>(
    '@/lib/api/admin',
  );
  return {
    ...actual,
    useAdminServers: (): { data: ServersStub } => ({
      data: serversRef.current,
    }),
  };
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const FIXTURE_SERVER: AdminServerSummary = {
  id: 's_test_drift',
  name: 'hartline-orders',
  org: 'hartline',
  ownerId: 'u_2a91',
  tools: 14,
  status: 'live',
  version: '3.1.0',
  region: 'apac',
  deploys: 88,
  p95: '142ms',
  errorRate: '0.12%',
  invocations24: '8,124',
  drift: true,
  listed: true,
  featured: false,
  flags: 0,
};

const FIXTURE_SERVER_INCIDENT: AdminServerSummary = {
  id: 's_test_inc',
  name: 'klipo-clip-tools',
  org: 'klipo',
  ownerId: 'u_7f88',
  tools: 9,
  status: 'incident',
  version: '1.4.2',
  region: 'us',
  deploys: 22,
  p95: '912ms',
  errorRate: '8.2%',
  invocations24: '1,204',
  drift: false,
  listed: true,
  featured: false,
  flags: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function renderWithQuery(node: ReactNode): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

beforeEach(() => {
  serversRef.current = {
    ok: false,
    status: 0,
    error: 'flag_off_or_not_implemented',
  };
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('<ServersScreen>', () => {
  it('renders canon loading state when BFF stub returns not-implemented', () => {
    const { getByText } = renderWithQuery(<ServersScreen />);
    expect(getByText(/no servers/i)).toBeTruthy();
    expect(getByText(/select a server/i)).toBeTruthy();
  });

  it('renders detail rail when seeded with a fixture server', () => {
    serversRef.current = {
      ok: true,
      data: { servers: [FIXTURE_SERVER] },
    };
    const { getAllByText, getByText } = renderWithQuery(<ServersScreen />);
    // Display title + breadcrumb metadata both render the server name.
    expect(getAllByText(/hartline-orders/).length).toBeGreaterThan(0);
    // KPI numbers render verbatim.
    expect(getByText('8,124')).toBeTruthy();
    expect(getByText('142ms')).toBeTruthy();
  });

  it('takedown CTA fires the canon-parity toast', () => {
    serversRef.current = {
      ok: true,
      data: { servers: [FIXTURE_SERVER] },
    };
    const { getByText } = renderWithQuery(<ServersScreen />);
    fireEvent.click(getByText(/^takedown$/i));
    expect(toastMock).toHaveBeenCalledWith(
      'takedown queued · hartline-orders',
    );
  });

  it('rollback button opens the version-pick modal; cancel dismisses', () => {
    serversRef.current = {
      ok: true,
      data: { servers: [FIXTURE_SERVER] },
    };
    const { getByText, queryByText } = renderWithQuery(<ServersScreen />);
    fireEvent.click(getByText(/^rollback$/i));
    expect(getByText(/pick a version/i)).toBeTruthy();
    fireEvent.click(getByText(/^cancel$/i));
    expect(queryByText(/pick a version/i)).toBeNull();
    // Cancel must NOT fire the rollback toast.
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/rolling back/),
    );
  });

  it('drift-tab actions fire canon-parity toasts', () => {
    serversRef.current = {
      ok: true,
      data: { servers: [FIXTURE_SERVER] },
    };
    const { getAllByText, getByText } = renderWithQuery(<ServersScreen />);
    // "drift" appears as a left-rail Pill AND as a tab — pick the tab.
    const tab = getAllByText(/^drift$/i).find((el) =>
      el.className.includes('adm-tab'),
    );
    if (tab === undefined) {
      throw new Error('drift tab not rendered');
    }
    fireEvent.click(tab);
    fireEvent.click(getByText(/^force regenerate$/i));
    expect(toastMock).toHaveBeenCalledWith(
      'force-regenerating hartline-orders from new spec…',
    );
    fireEvent.click(getByText(/^pin to old spec$/i));
    expect(toastMock).toHaveBeenCalledWith(
      'pinned hartline-orders to old spec · drift suppressed',
    );
    fireEvent.click(getByText(/^notify owner$/i));
    expect(toastMock).toHaveBeenCalledWith(
      'owner u_2a91 notified by email',
    );
  });

  it('opens the runbook drawer for an ongoing incident server', () => {
    serversRef.current = {
      ok: true,
      data: { servers: [FIXTURE_SERVER_INCIDENT] },
    };
    const { getByText } = renderWithQuery(<ServersScreen />);
    fireEvent.click(getByText(/view runbook/i));
    expect(openDrawerMock).toHaveBeenCalled();
    const firstArg = openDrawerMock.mock.calls[0]?.[0];
    expect(firstArg).toMatch(/runbook · upstream timeout/i);
  });
});
