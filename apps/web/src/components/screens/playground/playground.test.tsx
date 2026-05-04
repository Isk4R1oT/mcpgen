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

// Stub the artefact hook — varies `data` per artifact name. Tests can swap
// in shapes for `final-tools` / `sample-prompts` independently. Default:
// undefined (artifact not yet populated).
const artifactByName = new Map<string, unknown>();
const useJobArtifactSpy = vi.fn((_jobId: string, name: string) => ({
  data: artifactByName.get(name),
}));
const useJobSpy = vi.fn(() => ({ data: undefined }));
vi.mock('@/lib/api/jobs', () => ({
  useJob: (...args: unknown[]) => useJobSpy(...(args as [])),
  useJobArtifact: (jobId: string, name: string) => useJobArtifactSpy(jobId, name),
}));

afterEach(() => {
  cleanup();
  artifactByName.clear();
  useJobArtifactSpy.mockClear();
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
    const { getByLabelText } = renderPlayground();
    const select = getByLabelText('tool') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Fallback tool name from playground.tsx (FALLBACK_TOOL).
    expect(select.options.length).toBeGreaterThanOrEqual(1);
    expect(select.options[0]?.value).toBe('list_charges');
  });

  it('populates dropdown from useJobArtifact final-tools', async () => {
    artifactByName.set('final-tools', {
      ok: true,
      data: {
        final_tools: [
          { name: 'search' },
          { name: 'fetch' },
          { name: 'list_objects' },
        ],
      },
    });

    const { getByLabelText } = renderPlayground();
    const select = getByLabelText('tool') as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['search', 'fetch', 'list_objects']);
  });

  it('hides the try-a-prompt chip-row when sample-prompts artifact is absent', () => {
    const { queryByText } = renderPlayground();
    // "try a prompt" SectionLabel should not render when artifact is empty.
    expect(queryByText(/try a prompt/i)).toBeNull();
  });

  it('renders sample prompts as chips when artifact is populated', () => {
    artifactByName.set('sample-prompts', {
      ok: true,
      data: { prompts: ['forecast for Oslo', 'list active stations'] },
    });

    const { getByText } = renderPlayground();
    expect(getByText(/try a prompt/i)).not.toBeNull();
    expect(getByText('▸ forecast for Oslo')).not.toBeNull();
    expect(getByText('▸ list active stations')).not.toBeNull();
  });

  it('does not render the canon naive-cost block (× 3.9 magic constant)', () => {
    artifactByName.set('final-tools', {
      ok: true,
      data: { final_tools: [{ name: 'search' }] },
    });

    const { queryByText } = renderPlayground();
    expect(queryByText(/same on naive/i)).toBeNull();
    expect(queryByText(/saved this session/i)).toBeNull();
    expect(queryByText(/would cost/i)).toBeNull();
  });

  it('renders structural metrics card with tools-loaded count', () => {
    artifactByName.set('final-tools', {
      ok: true,
      data: { final_tools: [{ name: 'search' }, { name: 'fetch' }] },
    });

    const { getByText } = renderPlayground();
    expect(getByText(/server structure/i)).not.toBeNull();
    expect(getByText(/tools loaded/i)).not.toBeNull();
  });

  it('starts with empty history (no SEED_HISTORY canon fixture)', () => {
    const { queryByText } = renderPlayground();
    // None of the canon SEED rows should leak into a fresh playground.
    expect(queryByText(/list active plans/i)).toBeNull();
    expect(queryByText(/find rio@example.com/i)).toBeNull();
    expect(queryByText(/order_lifecycle/i)).toBeNull();
    expect(queryByText(/refund w\/ audit trail/i)).toBeNull();
  });

  it('renders the canon "trace failed" branch when run-tool stub is disabled', async () => {
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
