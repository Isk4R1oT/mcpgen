// apps/web/src/components/screens/marketplace/marketplace.test.tsx
//
// Phase 2 / Agent B4 — Marketplace screen unit smoke.
//
// Verifies:
//   1. Hero title renders with canon `mc-display-l`.
//   2. Search input uses the canon `mc-stamp` + `mc-input mc-mono` chain.
//   3. Sidebar categories render (canon `mc-tool-item` rows).
//   4. Sort chip row renders (popular / most installed / recently updated).
//   5. With the BFF disabled-stub returning zero servers, the empty grid
//      shows the canon "coming soon" overlay (data-testid).
//   6. Typing in the search input updates state.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import enMessages from '../../../../messages/en.json';
import Marketplace from './marketplace';

// next/navigation is server-only under jsdom — stub it.
const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (p: string) => void } => ({ push: pushSpy }),
}));

// LangSwitcher's i18n navigation hook.
vi.mock('@/i18n/navigation', () => ({
  useRouter: (): { push: (p: string) => void; replace: (p: string) => void } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: (): string => '/marketplace',
}));

afterEach(() => {
  cleanup();
  pushSpy.mockReset();
});

function renderMarketplace(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Marketplace />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('<Marketplace>', () => {
  it('renders hero title with canon mc-display-l', () => {
    const { container } = renderMarketplace();
    const hero = container.querySelector('.mc-display-l');
    expect(hero).not.toBeNull();
    // Canon hero copy from messages/en.json `marketplaceTitle`.
    expect(hero?.textContent?.toLowerCase()).toContain('marketplace');
  });

  it('renders search input with canon mc-stamp + mc-input mc-mono', () => {
    const { container } = renderMarketplace();
    const input = container.querySelector<HTMLInputElement>(
      '.mc-stamp input.mc-input.mc-mono',
    );
    expect(input).not.toBeNull();
    expect(input?.placeholder.toLowerCase()).toContain('search');
  });

  it('renders the canon sidebar categories list', () => {
    const { container } = renderMarketplace();
    const items = container.querySelectorAll('.mc-tool-item');
    // Canon ships 8 categories.
    expect(items.length).toBeGreaterThanOrEqual(8);
  });

  it('renders sort chip row with popular / installs / recent', () => {
    const { getAllByRole } = renderMarketplace();
    const buttons = getAllByRole('button');
    const labels = buttons.map((b) => b.textContent?.toLowerCase() ?? '');
    expect(labels.some((l) => l.includes('popular'))).toBe(true);
    expect(labels.some((l) => l.includes('installed'))).toBe(true);
    expect(labels.some((l) => l.includes('recently'))).toBe(true);
  });

  it('with BFF stub disabled, empty grid shows the "coming soon" overlay', () => {
    const { getByTestId } = renderMarketplace();
    const empty = getByTestId('marketplace-empty');
    expect(empty.textContent?.toLowerCase()).toContain('coming soon');
  });

  it('typing in the search input updates its value', () => {
    const { container } = renderMarketplace();
    const input = container.querySelector<HTMLInputElement>('.mc-stamp input');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: 'stripe' } });
    expect(input!.value).toBe('stripe');
  });
});
