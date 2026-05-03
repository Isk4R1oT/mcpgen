// apps/web/src/components/screens/server-detail/server-detail.test.tsx
//
// Phase 2 / Agent B4 — ServerDetail unit smoke.
//
// Verifies:
//   1. Page header renders the canon mc-display-l server name.
//   2. With the BFF stub disabled, the "coming soon" banner renders
//      (data-testid='marketplace-server-stub').
//   3. Tabs render (readme / tools / changelog / issues / security) and
//      switching to "tools" reveals the tool list rows.
//   4. Install button (default `installEnabled=false`) toasts "Coming
//      soon" instead of attempting the (missing) backend install call.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ServerDetail from './server-detail';

vi.mock('next/navigation', () => ({
  useRouter: (): { push: (p: string) => void } => ({ push: vi.fn() }),
}));

const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string): void => toastSpy(msg),
}));

vi.mock('@/lib/drawer', () => ({
  openDrawer: vi.fn(),
}));

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
});

function renderDetail(props: {
  serverId?: string;
  installEnabled?: boolean;
} = {}): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ServerDetail
        serverId={props.serverId ?? 'stripe-official'}
        installEnabled={props.installEnabled ?? false}
      />
    </QueryClientProvider>,
  );
}

describe('<ServerDetail>', () => {
  it('renders the server name in the canon mc-display-l header', () => {
    const { container } = renderDetail();
    const name = container.querySelector('.mc-display-l');
    expect(name).not.toBeNull();
    // Canon stub fallback name (until BFF lands).
    expect(name?.textContent).toContain('stripe-mcp');
  });

  it('shows the disabled-stub banner when BFF returns flag_off_or_not_implemented', () => {
    const { getByTestId } = renderDetail();
    const stub = getByTestId('marketplace-server-stub');
    expect(stub.textContent?.toLowerCase()).toContain('coming soon');
  });

  it('renders all 5 tabs (readme / tools / changelog / issues / security)', () => {
    const { container } = renderDetail();
    const tabs = container.querySelectorAll('.mc-tabs .mc-tab');
    expect(tabs.length).toBe(5);
    const labels = Array.from(tabs).map((t) => (t.textContent ?? '').toLowerCase());
    expect(labels.some((l) => l.includes('readme'))).toBe(true);
    expect(labels.some((l) => l.includes('tools'))).toBe(true);
    expect(labels.some((l) => l.includes('changelog'))).toBe(true);
    expect(labels.some((l) => l.includes('issues'))).toBe(true);
    expect(labels.some((l) => l.includes('security'))).toBe(true);
  });

  it('clicking the "tools" tab reveals the canon tool list rows', () => {
    const { container, getAllByRole } = renderDetail();
    const toolsTab = getAllByRole('button').find(
      (b) => (b.textContent ?? '').toLowerCase().includes('tools'),
    );
    expect(toolsTab).toBeDefined();
    fireEvent.click(toolsTab!);
    // Tool rows render `create_charge` (canon stub).
    const html = container.innerHTML;
    expect(html).toContain('create_charge');
    expect(html).toContain('refund_charge');
  });

  it('install button toasts "Coming soon" when installEnabled=false', () => {
    const { getAllByRole } = renderDetail({ installEnabled: false });
    const installBtns = getAllByRole('button').filter(
      (b) => (b.textContent ?? '').toLowerCase().trim() === 'install',
    );
    // Header right-side install + main action install — at least one match.
    expect(installBtns.length).toBeGreaterThan(0);
    fireEvent.click(installBtns[0]!);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('Coming soon'),
    );
  });
});
