// apps/web/src/components/screens/quality/quality.test.tsx
//
// Phase 1 — Agent A4 — Vitest smoke for the Quality Report screen.
//
// Verifies:
//   - Renders canon header + zero-score gauge when artifact absent (loading state).
//   - Renders rate-limited recovery banner when error mode is set.
//   - "back to canvas" navigates to /generate/:jobId/preview.
//   - "looks good · deploy" navigates to /generate/:jobId/playground.
//   - "re-run eval" emits a stub toast (BFF endpoint not ready).

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Quality from './quality';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string) => toastMock(msg),
}));
vi.mock('@/lib/drawer', () => ({
  openDrawer: vi.fn(),
}));

// Mock artifact hook → loading / no data.
vi.mock('@/lib/api/jobs', () => ({
  useJobArtifact: () => ({
    data: { ok: false, status: 0, error: 'pending' },
    isLoading: true,
  }),
}));

// Mock useErrorMode store. We export a controllable mode setter for tests.
const errorModeRef = { current: 'none' as 'none' | 'rate-limit' };
vi.mock('@/stores/error-mode', () => ({
  useErrorMode: <T,>(selector: (s: { mode: string }) => T): T =>
    selector({ mode: errorModeRef.current }),
}));

afterEach(() => cleanup());
beforeEach(() => {
  pushMock.mockReset();
  toastMock.mockReset();
  errorModeRef.current = 'none';
});

function renderWithQuery(ui: React.ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('<Quality>', () => {
  it('renders canon header + zero-score gauge with no artifact data', () => {
    renderWithQuery(<Quality jobId="job_456" />);
    expect(screen.getByText(/step 04 · quality report/i)).toBeTruthy();
    expect(screen.getByText(/we graded the server/i)).toBeTruthy();
    // Zero-score still renders the gauge digit "0.0".
    expect(screen.getByText(/0\.0/)).toBeTruthy();
  });

  it('renders rate-limit banner when errorMode === "rate-limit"', () => {
    errorModeRef.current = 'rate-limit';
    renderWithQuery(<Quality jobId="job_456" />);
    expect(screen.getByText(/agent eval skipped/i)).toBeTruthy();
    expect(screen.getByText(/use your own anthropic key/i)).toBeTruthy();
  });

  it('navigates to preview on back', () => {
    renderWithQuery(<Quality jobId="job_zzz" />);
    fireEvent.click(screen.getByText(/back to canvas/i));
    expect(pushMock).toHaveBeenCalledWith('/generate/job_zzz/preview');
  });

  it('navigates to playground on continue', () => {
    renderWithQuery(<Quality jobId="job_zzz" />);
    fireEvent.click(screen.getByText(/looks good · deploy/i));
    expect(pushMock).toHaveBeenCalledWith('/generate/job_zzz/playground');
  });

  it('emits a stub toast when "re-run eval" is clicked', () => {
    renderWithQuery(<Quality jobId="job_zzz" />);
    fireEvent.click(screen.getByText(/re-run eval/i));
    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/rerunning eval suite/i));
  });
});
