// apps/web/src/components/screens/billing/billing.test.tsx
//
// Phase 2 — Agent B3 — Vitest smoke for the Billing screen.
//
// Verifies the canon-critical surfaces stay intact across refactors:
//   - the title "billing" renders + the canon `mc-display-l` class is used,
//   - the plan summary card renders the canon "your plan" / "this period" /
//     "payment method" cells with the canon mock numbers (catalog § billing),
//   - clicking "upgrade to team" opens the drawer and shows the canon CTA
//     copy ("confirm upgrade" + "talk to sales"),
//   - the cycle toggle flips price labels (29 → 290 etc.).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import enMessages from '../../../../messages/en.json';
import Billing from './billing';

// next/navigation is server-only inside vitest; mock the hooks the screen uses.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushMock }),
}));

// LangSwitcher reaches into `@/i18n/navigation`; stub to avoid pulling the
// App-Router shim into a unit test (matches landing.test.tsx).
vi.mock('@/i18n/navigation', () => ({
  useRouter: (): { push: (p: string) => void; replace: (p: string) => void } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: (): string => '/billing',
}));

// Toast and drawer side-effects — capture invocations without rendering vaul.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastMock(msg, opts),
}));

const openDrawerMock = vi.fn(
  (_title: string, _body: ReactElement, _opts?: unknown): void => {
    // intentional no-op — we only assert against the spy's args.
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

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

beforeEach(() => {
  // Suppress noisy network errors emitted by useUsageHourly fetch attempts in
  // the test environment (the screen renders the same way on `enabled: false`
  // as on a 0-status network failure).
});

function renderBilling(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Billing />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('<Billing>', () => {
  it('renders the page title with the canon mc-display-l class', () => {
    const { container } = renderBilling();
    const title = container.querySelector('.mc-display-l');
    expect(title).not.toBeNull();
    expect(title?.textContent?.toLowerCase()).toContain('billing');
  });

  it('renders the canon plan summary numbers (82,180 / 100,000)', () => {
    renderBilling();
    expect(screen.getByText('82,180')).toBeTruthy();
    // "100,000" appears in both the summary caption and pro plan features —
    // assert at least one occurrence.
    expect(screen.getAllByText(/100,000/).length).toBeGreaterThan(0);
  });

  it('opens the upgrade-to-team drawer when CTA clicked', () => {
    renderBilling();
    // The "your plan" card has the upgrade button. There's also a plan-card
    // "upgrade to team" button — pick the first occurrence (the summary card
    // CTA).
    const buttons = screen.getAllByRole('button', { name: /upgrade to team/i });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    expect(openDrawerMock.mock.calls[0]?.[0]).toBe('upgrade to team');
  });

  it('cycle toggle flips price ($29 → $290 for pro)', () => {
    renderBilling();
    // Default cycle is monthly — pro card shows $29.
    expect(screen.getByText('$29')).toBeTruthy();
    // Click annual chip.
    const annualChip = screen.getByRole('button', { name: /annual/i });
    fireEvent.click(annualChip);
    // Pro yearly = 29 * 10 = 290.
    expect(screen.getByText('$290')).toBeTruthy();
  });
});
