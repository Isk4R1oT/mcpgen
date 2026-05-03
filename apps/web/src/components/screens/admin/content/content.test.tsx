// apps/web/src/components/screens/admin/content/content.test.tsx
//
// Phase 3 / C4-content — Content screen unit smoke.
//
// Verifies:
//   1. Default state renders the docs tab + canon doc rows.
//   2. Switching to email tab swaps the body to template list + preview.
//   3. Listings / in-app / status-page tabs render the canon
//      "preview only" empty state.
//   4. Action buttons fire toast() stubs (flag-gated default OFF behavior
//      per PHASE-3 brief).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Content } from './content';

// Stub the admin metrics hook so it returns the disabled-stub Result shape.
vi.mock('@/lib/api/admin', () => ({
  useAdminMetrics: () => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    refetch: vi.fn(),
  }),
}));

// Spy on toast so we can assert action wiring.
const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]): void => {
    toastSpy(...args);
  },
}));

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
});

function renderContent(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Content />
    </QueryClientProvider>,
  );
}

describe('<Content>', () => {
  it('renders docs tab by default with canon header + table rows', () => {
    const { container } = renderContent();

    // Page head
    expect(container.querySelector('.adm-page-title')?.textContent).toBe('content');

    // Tab strip exists with all 5 canon tabs.
    const tabs = container.querySelectorAll('.adm-tab');
    expect(tabs.length).toBe(5);
    const tabLabels = Array.from(tabs).map((t) => t.textContent);
    expect(tabLabels).toEqual([
      'docs',
      'listings',
      'email',
      'in-app',
      'status page',
    ]);

    // The selected tab is "docs".
    const selected = container.querySelector('.adm-tab.sel');
    expect(selected?.textContent).toBe('docs');

    // Docs table renders the 5 canon doc paths.
    const html = container.innerHTML;
    expect(html).toContain('/docs/quickstart');
    expect(html).toContain('/docs/auth/oauth');
    expect(html).toContain('/docs/billing/usage');
    expect(html).toContain('/docs/spec-drift');
    expect(html).toContain('/docs/runbooks/incident');
  });

  it('switches to email tab and renders templates + preview', () => {
    const { container } = renderContent();
    const emailTab = Array.from(container.querySelectorAll('.adm-tab')).find(
      (t) => t.textContent === 'email',
    );
    expect(emailTab).not.toBeUndefined();
    fireEvent.click(emailTab!);

    // Preview heading reflects the default selected template (payment-failed).
    expect(container.innerHTML).toContain('preview · payment-failed');
    // Template list shows all 6 canon names.
    expect(container.innerHTML).toContain('account-suspended');
    expect(container.innerHTML).toContain('payment-failed');
    expect(container.innerHTML).toContain('welcome-pro');

    // The preview body contains canon variable placeholders.
    expect(container.innerHTML).toContain('{{first_name}}');
    expect(container.innerHTML).toContain('{{card_last4}}');
  });

  it('renders empty state for listings / in-app / status-page tabs', () => {
    const { container } = renderContent();

    for (const label of ['listings', 'in-app', 'status page']) {
      const tab = Array.from(container.querySelectorAll('.adm-tab')).find(
        (t) => t.textContent === label,
      );
      expect(tab, `missing tab ${label}`).not.toBeUndefined();
      fireEvent.click(tab!);
      const empty = container.querySelector('.adm-empty');
      expect(empty?.textContent).toContain(`${label} — preview only`);
    }
  });

  it('fires toast on header actions (history + new) — default OFF flag stub', () => {
    const { container } = renderContent();
    const buttons = within(container).getAllByRole('button');

    const historyBtn = buttons.find((b) => b.textContent?.toLowerCase() === 'history');
    const newBtn = buttons.find((b) => b.textContent?.toLowerCase() === '+ new');
    expect(historyBtn).not.toBeUndefined();
    expect(newBtn).not.toBeUndefined();

    fireEvent.click(historyBtn!);
    fireEvent.click(newBtn!);
    expect(toastSpy).toHaveBeenCalledTimes(2);
    expect(toastSpy.mock.calls[0]?.[0]).toMatch(/admin action: not yet wired/);
    expect(toastSpy.mock.calls[1]?.[0]).toMatch(/new docs draft created/);
  });

  it('fires toast on email-tab actions (edit / send test / preview edit)', () => {
    const { container } = renderContent();
    const emailTab = Array.from(container.querySelectorAll('.adm-tab')).find(
      (t) => t.textContent === 'email',
    );
    fireEvent.click(emailTab!);

    const buttons = within(container).getAllByRole('button');
    const sendTest = buttons.find((b) => b.textContent === 'send test');
    const previewEdit = buttons.find(
      (b) =>
        b.textContent === 'edit' && b.classList.contains('mc-btn-ink'),
    );
    const listEdit = buttons.find(
      (b) =>
        b.textContent === 'edit' && !b.classList.contains('mc-btn-ink'),
    );

    expect(sendTest).not.toBeUndefined();
    expect(previewEdit).not.toBeUndefined();
    expect(listEdit).not.toBeUndefined();

    fireEvent.click(sendTest!);
    fireEvent.click(previewEdit!);
    fireEvent.click(listEdit!);
    expect(toastSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(
      toastSpy.mock.calls.some((call) =>
        String(call[0]).includes('test sent to'),
      ),
    ).toBe(true);
    expect(
      toastSpy.mock.calls.some((call) =>
        String(call[0]).includes('opening payment-failed in editor'),
      ),
    ).toBe(true);
    expect(
      toastSpy.mock.calls.some((call) =>
        String(call[0]).includes('editor'),
      ),
    ).toBe(true);
  });
});
