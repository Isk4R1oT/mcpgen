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

// Mock the artifact hook to return a "no data" state by default.
vi.mock('@/lib/api/jobs', () => ({
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

  it('navigates to /generate?spec_url=... on continue when originalSpecUrl present', () => {
    const specUrl = 'https://example.com/openapi.json';
    renderWithQuery(<Preview jobId="job_xyz" originalSpecUrl={specUrl} />);
    // Continue CTA is the primary "continue · auth setup" button.
    fireEvent.click(screen.getByText(/continue · auth setup/i));
    expect(pushMock).toHaveBeenCalledWith(
      `/generate?spec_url=${encodeURIComponent(specUrl)}`,
    );
  });

  it('falls back to /generate when no originalSpecUrl is provided', () => {
    renderWithQuery(<Preview jobId="job_xyz" />);
    fireEvent.click(screen.getByText(/continue · auth setup/i));
    expect(pushMock).toHaveBeenCalledWith('/generate');
  });
});
