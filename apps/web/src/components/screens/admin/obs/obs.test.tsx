// apps/web/src/components/screens/admin/obs/obs.test.tsx
//
// Phase 3 / C4-obs — vitest smoke for the Admin Observability screen.
//
// Covers the canon-critical surfaces that must NOT be silently stripped
// by a refactor:
//   - PageHead title "observability" + sub
//   - "live" chip + "env: prod" + "open in datadog" buttons in right slot
//   - 4 KPI cards (errors / p95 / p99 / saturated regions) — canon hardcodes
//     numbers, so we assert literal values are present
//   - 4 tab items (errors / latency / traces / sessions); the errors tab
//     is selected by default and renders a Table of 5 canon error groups
//   - Switching to non-errors tab renders the canon EmptyState "<tab> — preview only"
//   - "silence" button per row fires the toast stub (flag-OFF branch)
//   - "open in datadog" fires the canon-copy toast
//   - "env: prod" CTA opens the filter drawer
//
// `useAdminMetrics` is mocked to match the disabled-stub today
// (`flag_off_or_not_implemented`).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { ObservabilityScreen } from './obs';

// next/navigation — Server Component shim under jsdom.
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: vi.fn(),
  }),
}));

// Toast stub.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => {
    toastMock(msg, opts);
  },
}));

// Drawer stub.
const openDrawerMock = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (
    title: string,
    body: unknown,
    opts?: unknown,
  ): void => {
    openDrawerMock(title, body, opts);
  },
}));

// Disabled-stub admin metrics — matches what the real hook returns today.
vi.mock('@/lib/api/admin', () => ({
  useAdminMetrics: (): {
    data: { ok: false; status: number; error: string };
    refetch: () => Promise<void>;
  } => ({
    data: { ok: false, status: 0, error: 'flag_off_or_not_implemented' },
    refetch: async (): Promise<void> => {
      /* no-op */
    },
  }),
}));

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  openDrawerMock.mockReset();
});

describe('<ObservabilityScreen>', () => {
  it('renders the canon PageHead title + sub', () => {
    const { container } = render(<ObservabilityScreen />);
    const head = container.querySelector('.adm-page-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.adm-page-title')?.textContent).toBe(
      'observability',
    );
    expect(head?.querySelector('.adm-page-sub')?.textContent).toBe(
      'errors, latency, traces. last 24h.',
    );
  });

  it('renders the "live" chip and the two right-side buttons', () => {
    const { container, getByRole } = render(<ObservabilityScreen />);
    expect(container.querySelector('.mc-chip')?.textContent).toBe('live');
    expect(getByRole('button', { name: /env: prod/i })).not.toBeNull();
    expect(getByRole('button', { name: /open in datadog/i })).not.toBeNull();
  });

  it('renders 4 KPI cards with canon-literal values', () => {
    const { container } = render(<ObservabilityScreen />);
    // Canon ships hardcoded values — we assert the text, not loading `…`.
    const labels = Array.from(
      container.querySelectorAll('.adm-kpi-label'),
    ).map((n) => n.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        'errors · 24h',
        'p95 · global',
        'p99 · global',
        'saturated regions',
      ]),
    );
    const nums = Array.from(container.querySelectorAll('.adm-kpi-num')).map(
      (n) => n.textContent,
    );
    expect(nums).toEqual(['4,210', '742 ms', '1.8 s', '1']);
  });

  it('renders the 4-tab strip with errors selected by default', () => {
    const { container } = render(<ObservabilityScreen />);
    const tabs = container.querySelectorAll('.adm-tabs .adm-tab');
    expect(tabs.length).toBe(4);
    const labels = Array.from(tabs).map((t) => t.textContent?.trim());
    expect(labels).toEqual(['errors', 'latency', 'traces', 'sessions']);
    const selected = container.querySelector('.adm-tab.sel');
    expect(selected?.textContent?.trim()).toBe('errors');
  });

  it('renders the canon top-error-groups table with 5 rows on the errors tab', () => {
    const { container } = render(<ObservabilityScreen />);
    const html = container.innerHTML;
    expect(html).toContain('top error groups');
    expect(html).toContain('grouped by stack hash');
    // 5 canon error rows.
    expect(html).toContain('UpstreamTimeoutError');
    expect(html).toContain('SchemaValidationError');
    expect(html).toContain('RateLimitExceeded');
    expect(html).toContain('OauthTokenRevoked');
    expect(html).toContain('DatabaseConnectionError');
    // Per-row "silence" buttons (one per group).
    const silenceButtons = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.textContent?.trim().toLowerCase() === 'silence');
    expect(silenceButtons.length).toBe(5);
  });

  it('switching to "latency" tab renders the canon "preview only" empty state', () => {
    const { container } = render(<ObservabilityScreen />);
    const latencyTab = Array.from(
      container.querySelectorAll('.adm-tab'),
    ).find((t) => t.textContent?.trim() === 'latency');
    expect(latencyTab).toBeDefined();
    fireEvent.click(latencyTab!);
    const empty = container.querySelector('.adm-empty');
    expect(empty?.textContent).toContain('latency — preview only');
    // Errors table is gone now.
    expect(container.innerHTML).not.toContain('top error groups');
  });

  it('"silence" CTA fires the canon-copy toast (flag-OFF branch)', () => {
    const { container } = render(<ObservabilityScreen />);
    const silenceButtons = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.textContent?.trim().toLowerCase() === 'silence');
    fireEvent.click(silenceButtons[0]!);
    expect(toastMock).toHaveBeenCalledWith(
      'UpstreamTimeoutError silenced · 24h',
      undefined,
    );
  });

  it('"open in datadog" fires the canon-copy toast', () => {
    const { getByRole } = render(<ObservabilityScreen />);
    fireEvent.click(getByRole('button', { name: /open in datadog/i }));
    expect(toastMock).toHaveBeenCalledWith(
      'opening datadog · mcpgen-prod dashboard',
      undefined,
    );
  });

  it('"env: prod" opens the filter drawer with the canon eyebrow', () => {
    const { getByRole } = render(<ObservabilityScreen />);
    fireEvent.click(getByRole('button', { name: /env: prod/i }));
    expect(openDrawerMock).toHaveBeenCalledTimes(1);
    expect(openDrawerMock.mock.calls[0]?.[0]).toBe('observability filters');
    expect(openDrawerMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ eyebrow: 'narrow scope' }),
    );
  });

  it('first error row count gets the canon --accent style', () => {
    const { container } = render(<ObservabilityScreen />);
    // The accent count is the first row "1,841" with inline color.
    const accentCount = Array.from(
      container.querySelectorAll<HTMLElement>('span.mc-mono'),
    ).find((el) => el.textContent === '1,841');
    expect(accentCount).toBeDefined();
    // jsdom serializes color as the CSS `var()` token verbatim.
    expect(accentCount?.style.color).toContain('--accent');
  });

  it('renders the Btn ghost row "env: prod" inside the canon .row container', () => {
    const { container } = render(<ObservabilityScreen />);
    const head = container.querySelector('.adm-page-head');
    const right = head?.querySelector('.row');
    expect(right).not.toBeNull();
    // .row hosts: live chip + 2 buttons.
    const insideRight = within(right as HTMLElement);
    expect(insideRight.getByText('live')).not.toBeNull();
    expect(insideRight.getByRole('button', { name: /env: prod/i })).not.toBeNull();
    expect(
      insideRight.getByRole('button', { name: /open in datadog/i }),
    ).not.toBeNull();
  });
});
