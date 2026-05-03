// apps/web/src/components/screens/dashboard/dashboard.test.tsx
//
// Phase 2 / Agent B2 — vitest unit smoke for the single-server Dashboard.
//
// Covers:
// - Renders canon TopBar breadcrumb + display heading using deployment data.
// - Drift banner appears when `useDriftEvents` returns at least one event.
// - "review changes" button opens the inline drift modal.
// - Logs button opens the activity drawer via `openDrawer`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Dashboard } from './dashboard';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
}));

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

// Drive the deployments hook deterministically per test.
const deploymentsRef = {
  current: {
    ok: true as const,
    data: {
      deployments: [
        {
          deployment_id: 'dep_test_123',
          server_name: 'lumen-payments',
          tenant_subdomain: 'lumen-test.mcpgen.app',
          deployed_at: '2024-01-01T00:00:00Z',
          status: 'live',
          public_badge: false,
        },
      ],
    },
  },
};
const driftRef = {
  current: {
    ok: true as const,
    data: { drift_events: [] as Array<{ id: string; deployment_id: string; status: string }> },
  },
};

vi.mock('@/lib/api/deployments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/deployments')>(
    '@/lib/api/deployments',
  );
  return {
    ...actual,
    useDeployments: (): { data: typeof deploymentsRef.current } => ({
      data: deploymentsRef.current,
    }),
    useDriftEvents: (): { data: typeof driftRef.current } => ({
      data: driftRef.current,
    }),
  };
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

beforeEach(() => {
  driftRef.current = {
    ok: true as const,
    data: { drift_events: [] },
  };
});

function renderWithQuery(node: React.ReactNode): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('<Dashboard>', () => {
  it('renders canon breadcrumb + display name from deployment', () => {
    const { getAllByText } = renderWithQuery(
      <Dashboard deploymentId="dep_test_123" />,
    );
    // Breadcrumb in TopBar uses `${name}-mcp`.
    expect(getAllByText(/lumen-payments-mcp/).length).toBeGreaterThan(0);
    // Display heading shows the bare server name.
    expect(getAllByText(/lumen-payments/).length).toBeGreaterThan(0);
  });

  it('hides drift banner when drift_events is empty', () => {
    const { queryByText } = renderWithQuery(
      <Dashboard deploymentId="dep_test_123" />,
    );
    // The banner copy "api spec changed 2 days ago" only renders when
    // at least one drift event is returned.
    expect(queryByText(/api spec changed/i)).toBeNull();
  });

  it('shows drift banner + opens drift modal on "review changes"', () => {
    driftRef.current = {
      ok: true as const,
      data: {
        drift_events: [
          { id: 'drift_1', deployment_id: 'dep_test_123', status: 'open' },
        ],
      },
    };
    const { getByText, queryByTestId } = renderWithQuery(
      <Dashboard deploymentId="dep_test_123" />,
    );
    expect(getByText(/api spec changed 2 days ago/i)).toBeTruthy();
    fireEvent.click(getByText(/review changes/i));
    expect(queryByTestId('drift-modal')).not.toBeNull();
  });

  it('opens activity log drawer when "logs" is clicked', () => {
    const { getByText } = renderWithQuery(
      <Dashboard deploymentId="dep_test_123" />,
    );
    fireEvent.click(getByText(/^logs$/i));
    expect(openDrawerMock).toHaveBeenCalled();
    const firstArg = openDrawerMock.mock.calls[0]?.[0];
    expect(firstArg).toMatch(/activity log/i);
  });
});
