// apps/web/src/components/screens/dashboard-list/dashboard-list.test.tsx
//
// Phase 2 / Agent B2 — vitest unit smoke for the multi-server DashboardList.
//
// Covers:
// - Renders the canon empty state when the BFF returns no deployments.
// - Renders populated grid + filter chips when deployments are returned.
// - Notifications button opens the canon notifications drawer.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardList } from './dashboard-list';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
  usePathname: (): string => '/dashboard',
}));

const openDrawerMock = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (...args: unknown[]): void => {
    openDrawerMock(...args);
  },
}));

// Drive the dashboard summary hook deterministically per test.
type SummaryResult = {
  ok: true;
  data: {
    deployments: Array<{
      deployment_id: string;
      server_name: string;
      tenant_subdomain: string;
      deployed_at: string;
      status: string;
      public_badge: boolean;
    }>;
    drift_by_deployment: Record<string, { drift_events: Array<unknown> }>;
  };
};

const summaryRef: { current: SummaryResult } = {
  current: {
    ok: true,
    data: { deployments: [], drift_by_deployment: {} },
  },
};

vi.mock('@/lib/api/dashboard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/dashboard')>(
    '@/lib/api/dashboard',
  );
  return {
    ...actual,
    useDashboardSummary: (): { data: SummaryResult } => ({
      data: summaryRef.current,
    }),
  };
});

// next-intl LangSwitcher uses these — keep them minimal.
vi.mock('@/components/lang-switcher', () => ({
  default: () => <span data-testid="lang-switcher-stub" />,
}));

const messages = {
  yourServers: 'your servers',
  servers: 'servers',
  live: 'live',
  publicLbl: 'public',
  tools: 'tools',
  newServer: 'new server',
  browseMarket: 'browse marketplace',
  callsLast7: 'calls · last 7d',
  tokensSavedMo: 'tokens saved · month',
  plan: 'plan',
  incidents: 'incidents · open',
  manage: 'manage',
  all: 'all',
  needAttn: 'needs attention',
  filter: 'filter…',
  grid: 'grid',
  table: 'table',
  marketplace: 'marketplace',
  billing: 'billing',
  welcomeTitle: 'welcome, {name}.',
  welcomeSub: 'no servers yet.',
  startPaste: 'paste a spec',
  startPasteSub: 'openapi…',
  startFork: 'fork from marketplace',
  startForkSub: 'browse 280+ public servers',
  startSample: 'try with a sample',
  startSampleSub: 'load a fake api',
  onboardingTitle: 'first 3 things',
  onbEta: 'about 4 minutes',
  onb1: 'create your first server',
  onb2: 'connect a tool',
  onb3: 'invite a teammate',
  skipTour: 'skip tour',
  renews: 'renews',
};

function renderWithProviders(node: React.ReactNode): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  summaryRef.current = {
    ok: true,
    data: { deployments: [], drift_by_deployment: {} },
  };
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  openDrawerMock.mockReset();
});

describe('<DashboardList>', () => {
  it('renders the empty/first-run state when no deployments are returned', () => {
    const { getByText } = renderWithProviders(<DashboardList />);
    // No userClaims -> name falls back to 'there'.
    expect(getByText(/welcome, there/i)).toBeTruthy();
    expect(getByText(/paste a spec/i)).toBeTruthy();
  });

  it('renders the populated grid + totals strip when deployments arrive', () => {
    summaryRef.current = {
      ok: true,
      data: {
        deployments: [
          {
            deployment_id: 'dep_a',
            server_name: 'lumen-payments-mcp',
            tenant_subdomain: 'lumen-a.mcpgen.app',
            deployed_at: '2024-01-01T00:00:00Z',
            status: 'live',
            public_badge: false,
          },
          {
            deployment_id: 'dep_b',
            server_name: 'helio-commerce-mcp',
            tenant_subdomain: 'helio-b.mcpgen.app',
            deployed_at: '2024-01-02T00:00:00Z',
            status: 'live',
            public_badge: true,
          },
        ],
        drift_by_deployment: {},
      },
    };
    const { getByText, getAllByText } = renderWithProviders(<DashboardList />);
    expect(getByText(/your servers/i)).toBeTruthy();
    expect(getAllByText(/lumen-payments-mcp/).length).toBeGreaterThan(0);
    expect(getAllByText(/helio-commerce-mcp/).length).toBeGreaterThan(0);
    // Filter chips render with counts.
    expect(getByText(/all · 2/)).toBeTruthy();
  });

  it('opens the notifications drawer when bell is clicked', () => {
    summaryRef.current = {
      ok: true,
      data: {
        deployments: [
          {
            deployment_id: 'dep_a',
            server_name: 'lumen-payments-mcp',
            tenant_subdomain: 'lumen-a.mcpgen.app',
            deployed_at: '2024-01-01T00:00:00Z',
            status: 'live',
            public_badge: false,
          },
        ],
        drift_by_deployment: {},
      },
    };
    const { getByLabelText } = renderWithProviders(<DashboardList />);
    fireEvent.click(getByLabelText(/notifications/i));
    expect(openDrawerMock).toHaveBeenCalled();
    expect(openDrawerMock.mock.calls[0]?.[0]).toBe('notifications');
  });
});
