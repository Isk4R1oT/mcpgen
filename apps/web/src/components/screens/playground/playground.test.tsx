// apps/web/src/components/screens/playground/playground.test.tsx
//
// Phase 1 / Agent A5 — Playground unit smoke.
//
// Verifies:
//   1. Tool dropdown renders fallback when artefacts haven't arrived.
//   2. Tool dropdown populates from `useJobArtifact(jobId, 'final-tools')`.
//   3. Sending a prompt while the run-tool stub is disabled (default OFF)
//      renders canon's "trace failed" branch (the agent message body has
//      `data-trace-failed="true"`).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Playground from './playground';

// Stub `next/navigation` so the screen renders without an App Router context.
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (p: string) => void } => ({ push: vi.fn() }),
}));

// Stub the playground BFF stub so we can flip "ENABLED" per test.
vi.mock('@/lib/api/playground', () => ({
  runPlaygroundTool: vi.fn(async () => ({
    ok: false,
    status: 0,
    error: 'flag_off_or_not_implemented',
  })),
}));

// Stub the artefact hook — vary `data` per test via `mockReturnValue`.
const useJobArtifactSpy = vi.fn();
const useJobSpy = vi.fn(() => ({ data: undefined }));
vi.mock('@/lib/api/jobs', () => ({
  useJob: (...args: unknown[]) => useJobSpy(...(args as [])),
  useJobArtifact: (...args: unknown[]) => useJobArtifactSpy(...args),
}));

afterEach(() => {
  cleanup();
  useJobArtifactSpy.mockReset();
});

function renderPlayground(props: { jobId?: string } = {}): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Playground jobId={props.jobId ?? 'job-123'} />
    </QueryClientProvider>,
  );
}

describe('<Playground>', () => {
  it('renders tool dropdown with fallback when no artefacts available', () => {
    useJobArtifactSpy.mockReturnValue({ data: undefined });

    const { getByLabelText } = renderPlayground();
    const select = getByLabelText('tool') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Canon fallback tool name from playground.tsx.
    expect(select.options.length).toBeGreaterThanOrEqual(1);
    expect(select.options[0]?.value).toBe('list_charges');
  });

  it('populates dropdown from useJobArtifact final-tools', async () => {
    useJobArtifactSpy.mockReturnValue({
      data: {
        ok: true,
        data: {
          final_tools: [
            { name: 'search' },
            { name: 'fetch' },
            { name: 'list_objects' },
          ],
        },
      },
    });

    const { getByLabelText } = renderPlayground();
    const select = getByLabelText('tool') as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['search', 'fetch', 'list_objects']);
  });

  it('renders the canon "trace failed" branch when run-tool stub is disabled', async () => {
    useJobArtifactSpy.mockReturnValue({ data: undefined });

    const { container, getByPlaceholderText, getByRole } = renderPlayground();
    const input = getByPlaceholderText('type message…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test prompt' } });

    await act(async () => {
      fireEvent.click(getByRole('button', { name: /send/i }));
      // Pump pending promises (the async send() awaits the stub).
      await new Promise((r) => setTimeout(r, 0));
    });

    // The pending agent message inserts on a 400ms timer; advance it.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    // After the stub returns flag_off_or_not_implemented, the agent message
    // is updated to the failed/done branch.
    await waitFor(() => {
      const failed = container.querySelector('[data-trace-failed="true"]');
      expect(failed).not.toBeNull();
      expect(failed?.textContent).toMatch(/not yet available/i);
    });
  });
});
