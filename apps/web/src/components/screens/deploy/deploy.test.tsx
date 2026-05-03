// apps/web/src/components/screens/deploy/deploy.test.tsx
//
// Phase 1 / Agent A5 — Deploy unit smoke.
//
// Verifies:
//   1. Form renders 4 deployment targets + 2 auth modes.
//   2. Submitting calls `useDeployEphemeral().mutateAsync` with `{generationId}`.
//   3. Failure (errorMode='deploy-fail') flips into canon's "edge rejected
//      the bundle." card stack.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Deploy from './deploy';
import { useErrorMode } from '@/stores/error-mode';

// Capture the mocked mutation function so tests can assert on it.
const mutateAsyncSpy = vi.fn(async () => ({
  ok: true as const,
  data: {
    deployment_id: '00000000-0000-0000-0000-000000000000',
    server_name: 'lumen-mcp-abc123',
    server_url: 'https://lumen-mcp-abc123.mcpgen.app/mcp',
  },
}));

vi.mock('@/lib/api/deployments', () => ({
  useDeployEphemeral: () => ({
    mutateAsync: mutateAsyncSpy,
    isPending: false,
  }),
}));

beforeEach(() => {
  // Reset Zustand error mode store between tests.
  useErrorMode.setState({ mode: 'none' });
  mutateAsyncSpy.mockClear();
});

afterEach(() => cleanup());

function renderDeploy(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Deploy jobId="job-123" />
    </QueryClientProvider>,
  );
}

describe('<Deploy>', () => {
  it('renders 4 deployment targets and 2 auth options', () => {
    const { container } = renderDeploy();
    const targets = container.querySelectorAll('[data-target]');
    expect(targets.length).toBe(4);
    const targetIds = Array.from(targets).map((t) => t.getAttribute('data-target'));
    expect(targetIds).toEqual(['cloud', 'cf', 'docker', 'src']);

    const authOptions = container.querySelectorAll('[data-auth]');
    expect(authOptions.length).toBe(2);
  });

  it('submitting calls useDeployEphemeral with the jobId', async () => {
    const { getByRole } = renderDeploy();
    const submit = getByRole('button', { name: /^deploy$/i });
    await act(async () => {
      fireEvent.click(submit);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
    expect(mutateAsyncSpy).toHaveBeenCalledWith({ generationId: 'job-123' });
  });

  it('flips into the failure card stack when errorMode === "deploy-fail"', async () => {
    useErrorMode.setState({ mode: 'deploy-fail' });
    const { getByRole, container } = renderDeploy();
    fireEvent.click(getByRole('button', { name: /^deploy$/i }));

    // Canon failure branch fires after a 1.8s setTimeout.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1900));
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/edge rejected the bundle/i);
      expect(container.textContent).toMatch(/likely cause/i);
    });
    // The mutation should NOT fire when willFail short-circuits.
    expect(mutateAsyncSpy).not.toHaveBeenCalled();
  });
});
