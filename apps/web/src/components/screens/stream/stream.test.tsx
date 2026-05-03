// apps/web/src/components/screens/stream/stream.test.tsx
//
// Phase 1 Agent A3 — Stream screen unit smoke.
//
// Verifies:
//   1. Renders the canon log skeleton (7 step labels) on first paint.
//   2. spec-fail error mode surfaces "spec failed to parse" recovery card.
//   3. auth-fail error mode surfaces "auth probe returned 401" recovery card.
//   4. Recovery CTA `try repair with ai` invokes toast (flag-OFF default).
//   5. Cancel button is wired (clicking does not throw — uses internal handler).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StreamLog } from './stream';
import { useErrorMode } from '@/stores/error-mode';

// Stub next/navigation router push so the test environment doesn't blow up.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: ReturnType<typeof vi.fn> } => ({ push: pushMock }),
}));

// Stub the SSE consumer so we don't open EventSource in jsdom.
vi.mock('@/lib/sse/use-generation-sse', () => ({
  useGenerationSSE: (): { events: never[]; status: 'streaming' } => ({
    events: [],
    status: 'streaming',
  }),
}));

// Stub useJob so the breadcrumb derivation has a clean "no data yet" path
// without us pulling in TanStack Query in this unit test.
vi.mock('@/lib/api/jobs', () => ({
  useJob: (): { data: undefined } => ({ data: undefined }),
}));

// Spy on toast so we can assert the recovery CTAs hit the canon stub.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => {
    toastMock(msg, opts);
  },
}));

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';

describe('<StreamLog>', () => {
  beforeEach(() => {
    pushMock.mockReset();
    toastMock.mockReset();
    useErrorMode.setState({ mode: 'none' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the canon 7-step log skeleton', () => {
    render(<StreamLog jobId={TEST_JOB_ID} />);
    expect(screen.getByText('parsed openapi spec')).toBeTruthy();
    expect(screen.getByText('detected auth strategy')).toBeTruthy();
    expect(screen.getByText('pruned deprecated paths')).toBeTruthy();
    expect(screen.getByText('compressing descriptions')).toBeTruthy();
    expect(screen.getByText('clustering similar endpoints')).toBeTruthy();
    expect(screen.getByText('generating composite tools')).toBeTruthy();
    expect(screen.getByText('finalizing typescript module')).toBeTruthy();
  });

  it('renders the cancel button in the top bar', () => {
    render(<StreamLog jobId={TEST_JOB_ID} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('renders "did you know" tip when not errored', () => {
    render(<StreamLog jobId={TEST_JOB_ID} />);
    expect(screen.getByText(/did you know\?/i)).toBeTruthy();
  });

  it('shows spec-fail recovery card when errorMode = spec-fail', async () => {
    useErrorMode.setState({ mode: 'spec-fail' });
    render(<StreamLog jobId={TEST_JOB_ID} />);
    // The animation loop sets `errored=true` after the first step's rAF
    // ticks complete (~800ms canon dur). jsdom's rAF runs ~16ms/frame.
    // waitFor polls for up to 3s — generous slack so flake is impossible.
    await waitFor(
      () => {
        expect(screen.getByText('spec failed to parse')).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(
      screen.getByRole('button', { name: /try repair with ai/i }),
    ).toBeTruthy();
  });

  it('shows auth-fail recovery card when errorMode = auth-fail', async () => {
    useErrorMode.setState({ mode: 'auth-fail' });
    render(<StreamLog jobId={TEST_JOB_ID} />);
    await waitFor(
      () => {
        expect(screen.getByText('auth probe returned 401')).toBeTruthy();
      },
      { timeout: 4000 },
    );
    expect(
      screen.getByRole('button', { name: /re-enter credential/i }),
    ).toBeTruthy();
  });

  it('clicking "try repair with ai" toasts the canon message (flag-OFF)', async () => {
    useErrorMode.setState({ mode: 'spec-fail' });
    render(<StreamLog jobId={TEST_JOB_ID} />);
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: /try repair with ai/i }),
        ).toBeTruthy();
      },
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByRole('button', { name: /try repair with ai/i }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/ai re-parsing spec/i),
      expect.anything(),
    );
  });

  it('clicking "notify me when done" toasts the canon message', () => {
    render(<StreamLog jobId={TEST_JOB_ID} />);
    fireEvent.click(
      screen.getByRole('button', { name: /notify me when done/i }),
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/we'll email/i),
      expect.anything(),
    );
  });

  it('uses the supplied sample.name in the breadcrumb when provided', () => {
    render(<StreamLog jobId={TEST_JOB_ID} sample={{ name: 'stripe' }} />);
    expect(screen.getByText(/generating stripe-mcp/i)).toBeTruthy();
  });

  it('falls back to a generic mcp-server slug when no sample/specUrl', () => {
    render(<StreamLog jobId={TEST_JOB_ID} />);
    expect(screen.getByText(/generating mcp-server-mcp/i)).toBeTruthy();
  });

  it('derives the breadcrumb name from specUrl hostname when provided', () => {
    render(
      <StreamLog
        jobId={TEST_JOB_ID}
        specUrl="https://petstore3.swagger.io/api/v3/openapi.json"
      />,
    );
    expect(screen.getByText(/generating petstore3-mcp/i)).toBeTruthy();
  });
});
