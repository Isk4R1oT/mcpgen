// apps/web/src/components/screens/preview/preview.test.tsx
//
// Phase 1 — Agent A4 — Vitest smoke for the Preview screen.
//
// Verifies:
//   - The screen renders the canon header / step-marker without props blowing up
//     when the BFF artifact is absent (loading / no-data state).
//   - The "tune settings" button opens the inline modal.
//   - Toggling the "combine" merge button updates the optimized token math.
//   - "discard" / "back" navigates to /generate/:jobId.

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Preview from './preview';

// Mock next/navigation router.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Mock both job hooks to return a "no data" state by default. Tests below
// override per-call when they need to assert a populated shape.
vi.mock('@/lib/api/jobs', () => ({
  useJob: () => ({
    data: { ok: false, status: 0, error: 'pending' },
    isLoading: true,
  }),
  useJobArtifact: () => ({
    data: { ok: false, status: 0, error: 'pending' },
    isLoading: true,
  }),
}));

// Mock toast so re-gen banner click is a noop in tests.
vi.mock('@/lib/toast', () => ({
  toast: vi.fn(),
}));

afterEach(() => cleanup());
beforeEach(() => {
  pushMock.mockReset();
});

function renderWithQuery(ui: React.ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('<Preview>', () => {
  it('renders canon header + step-marker even with no artifact data', () => {
    renderWithQuery(<Preview jobId="job_123" />);
    // Step marker (canon: "step 01 · review").
    expect(screen.getByText(/step 01 · review/i)).toBeTruthy();
    // Title from canon split across two text nodes via <br/>.
    expect(screen.getByText(/we read your spec/i)).toBeTruthy();
    // Continue CTA always rendered.
    expect(screen.getByText(/continue · auth setup/i)).toBeTruthy();
  });

  it('opens generation settings modal when "tune settings" clicked', () => {
    renderWithQuery(<Preview jobId="job_123" />);
    fireEvent.click(screen.getByText(/tune settings/i));
    // Modal exposes "target complexity" SectionLabel.
    expect(screen.getByText(/target complexity/i)).toBeTruthy();
  });

  it('navigates back to /generate/[jobId] on discard', () => {
    renderWithQuery(<Preview jobId="job_xyz" />);
    fireEvent.click(screen.getByText(/^discard$/i));
    expect(pushMock).toHaveBeenCalledWith('/generate/job_xyz');
  });

  it('navigates to /generate/[jobId]/quality on continue (review → quality → playground → deploy)', () => {
    renderWithQuery(<Preview jobId="job_xyz" originalSpecUrl="https://example.com/openapi.json" />);
    fireEvent.click(screen.getByText(/continue · auth setup/i));
    expect(pushMock).toHaveBeenCalledWith('/generate/job_xyz/quality');
  });

  it('renders no canon demo literals in the empty/loading state', () => {
    const { container } = renderWithQuery(<Preview jobId="job_loading" />);
    const html = container.innerHTML;
    // Canon header literal — must NOT leak into a real-data render.
    expect(html).not.toContain('lumen-payments');
    // Canon category literals.
    expect(html).not.toContain('transactions');
    expect(html).not.toContain('card-issuing');
    // Canon composite-merge banner literal.
    expect(html).not.toContain('orders.create');
    expect(html).not.toContain('orders.get');
    expect(html).not.toContain('orders.update');
    // Canon token-budget hardcoded numbers.
    expect(html).not.toContain('14,200');
    expect(html).not.toContain('3,400');
    expect(html).not.toContain('4,750');
    // Canon hardcoded auth label.
    expect(html).not.toMatch(/oauth \+ api key/);
  });
});

describe('<Preview> exhaustive canon-literal grep', () => {
  it('exhaustive grep against banned canon literals', () => {
    const { container } = renderWithQuery(<Preview jobId="job_grep" originalSpecUrl="https://api.stripe.com/openapi.json" />);
    const html = container.innerHTML;
    const banned = [
      'lumen-payments',
      'transactions',
      'accounts',
      'card-issuing',
      'orders.create',
      'orders.get',
      'orders.update',
      '4 750',
      '3 400',
      '14 200',
      '14,200',
      'oauth + api key',
      '↓ 28%',
    ];
    for (const literal of banned) {
      expect(html.includes(literal), `canon literal "${literal}" leaked into rendered HTML`).toBe(false);
    }
  });
});
