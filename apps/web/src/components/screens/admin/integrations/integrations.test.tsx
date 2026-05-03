// apps/web/src/components/screens/admin/integrations/integrations.test.tsx
//
// Phase 3 / C3-integrations — Vitest smoke test.
//
// Covers:
//   - Default oauth tab renders the canon table headers + count "· 6".
//   - Switching tabs swaps the visible Card content.
//   - "+ add provider" CTA opens the canon-shaped drawer.
//   - Rotating a stale (>90d) OAuth provider opens the modal; rotating a
//     fresh provider fires the toast stub directly.
//   - Reveal-secret button fires `toast(..., { kind: 'warn' })`.
//   - "rotate now" on stale secret fires the rotation toast.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { IntegrationsScreen } from './integrations';

// Capture toast / drawer side effects.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastMock(msg, opts),
}));

const openDrawerMock = vi.fn(
  (_title: string, _body: ReactElement, _opts?: unknown): void => {
    // intentional no-op — assertions run against the spy args.
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
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

function renderScreen(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntegrationsScreen />
    </QueryClientProvider>,
  );
}

describe('<IntegrationsScreen>', () => {
  it('renders the page title + sub-copy from canon', () => {
    const { container } = renderScreen();
    const title = container.querySelector('.adm-page-title');
    expect(title?.textContent).toBe('integrations');
    const sub = container.querySelector('.adm-page-sub');
    expect(sub?.textContent).toContain('rotate quarterly');
  });

  it('shows the oauth tab by default with 6 canon-mock providers', () => {
    renderScreen();
    // Section label includes total count.
    expect(screen.getByText(/oauth providers · 6/i)).toBeTruthy();
    // Canon mock provider names appear (catalog fixture).
    expect(screen.getByText('github')).toBeTruthy();
    expect(screen.getByText('google')).toBeTruthy();
    expect(screen.getByText('slack')).toBeTruthy();
  });

  it('switches to the webhooks tab and renders the canon webhook rows', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /webhooks/i }));
    expect(screen.getByText(/outgoing webhooks · 9/i)).toBeTruthy();
    expect(
      screen.getByText(/api\.acme\.com\/webhooks\/billing/i),
    ).toBeTruthy();
  });

  it('switches to the secrets tab and renders the kms note', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /secrets/i }));
    expect(screen.getByText(/secrets · 14/i)).toBeTruthy();
    expect(screen.getByText(/kms · aws-east-1/i)).toBeTruthy();
    expect(screen.getByText('STRIPE_SECRET_KEY')).toBeTruthy();
  });

  it('shows the preview-only EmptyState for smtp + dns tabs', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /smtp/i }));
    expect(screen.getByText(/smtp — preview only/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /dns/i }));
    expect(screen.getByText(/dns — preview only/i)).toBeTruthy();
  });

  it('opens the add-provider drawer when CTA clicked', () => {
    renderScreen();
    const cta = screen.getByRole('button', { name: /\+ add provider/i });
    fireEvent.click(cta);
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    const [title, , opts] = openDrawerMock.mock.calls[0] ?? [];
    expect(title).toBe('add oauth provider');
    expect((opts as { eyebrow?: string } | undefined)?.eyebrow).toBe(
      'oauth 2.0',
    );
  });

  it('rotating a fresh oauth provider fires the toast stub', () => {
    renderScreen();
    // Find the github row (fresh — 14d) and click its rotate button.
    // <Table> wraps each cell in a <div>; the row is the immediate parent
    // of that cell div.
    const githubCell = screen.getByText('github');
    const row = githubCell.parentElement;
    expect(row).toBeTruthy();
    if (row === null) return;
    const rotateBtn = within(row).getByRole('button', { name: /rotate/i });
    fireEvent.click(rotateBtn);
    expect(toastMock).toHaveBeenCalledWith(
      'github oauth rotated · 24h overlap',
      undefined,
    );
  });

  it('rotating a stale oauth provider opens the modal (no toast)', () => {
    renderScreen();
    // slack row is the canon-stale one (91 days ago).
    const slackCell = screen.getByText('slack');
    const row = slackCell.parentElement;
    expect(row).toBeTruthy();
    if (row === null) return;
    const rotateBtn = within(row).getByRole('button', { name: /rotate/i });
    fireEvent.click(rotateBtn);
    // Modal mounted.
    expect(
      screen.getByRole('dialog', { name: /rotate · slack oauth secret/i }),
    ).toBeTruthy();
    // Toast not yet fired.
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('reveal-secret fires warn-kind toast', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /secrets/i }));
    const revealBtns = screen.getAllByRole('button', { name: /^reveal$/i });
    expect(revealBtns.length).toBeGreaterThan(0);
    fireEvent.click(revealBtns[0]!);
    expect(toastMock).toHaveBeenCalledWith(
      'reveal logged · reason required',
      { kind: 'warn' },
    );
  });

  it('rotate-now on stale secret fires rotation toast', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /secrets/i }));
    const rotateNowBtn = screen.getByRole('button', { name: /rotate now/i });
    fireEvent.click(rotateNowBtn);
    expect(toastMock).toHaveBeenCalledWith(
      'rotation queued · old key valid 24h',
      undefined,
    );
  });

  it('webhook edit fires per-row toast copy', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /webhooks/i }));
    // The URL is wrapped in a <span class="mc-mono">, the cell wrapper is
    // span.parentElement, and the row is one level above that.
    const acmeUrl = screen.getByText(
      /api\.acme\.com\/webhooks\/billing/i,
    );
    const row = acmeUrl.parentElement?.parentElement;
    expect(row).toBeTruthy();
    if (row === null || row === undefined) return;
    const editBtn = within(row).getByRole('button', { name: /edit/i });
    fireEvent.click(editBtn);
    expect(toastMock).toHaveBeenCalledWith(
      'opening acme billing webhook · 7 retries pending',
      undefined,
    );
  });
});
