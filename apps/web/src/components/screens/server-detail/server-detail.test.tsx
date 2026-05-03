// apps/web/src/components/screens/server-detail/server-detail.test.tsx
//
// Phase 2 / Agent B4 — ServerDetail unit smoke.
//
// Verifies:
//   1. With the BFF stub disabled, the "coming soon" overlay renders as the
//      sole content (no fake server name surfaces).
//   2. The disabled-stub banner has data-testid='marketplace-server-stub'.
//   3. The serverId is shown verbatim in the empty-state copy so the user
//      knows which detail page is dark.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
  it('shows the disabled-stub overlay when BFF returns flag_off_or_not_implemented', () => {
    const { getByTestId } = renderDetail();
    const stub = getByTestId('marketplace-server-stub');
    expect(stub.textContent?.toLowerCase()).toContain('coming soon');
  });

  it('does NOT surface a fake server name in stub mode', () => {
    const { container } = renderDetail();
    // The previous canon literal fallback ("stripe-mcp") must never appear
    // when the BFF is dark — empty state owns the whole surface.
    expect(container.textContent ?? '').not.toContain('stripe-mcp');
  });

  it('echoes the serverId in the empty-state copy', () => {
    const { container } = renderDetail({ serverId: 'some-server-id' });
    expect(container.textContent ?? '').toContain('some-server-id');
  });

  it('renders the "marketplace / coming soon" breadcrumb in stub mode', () => {
    const { container } = renderDetail();
    expect(container.textContent ?? '').toContain('marketplace / coming soon');
  });
});
