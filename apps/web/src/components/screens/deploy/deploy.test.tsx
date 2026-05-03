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

// Captured mocked mutation result type — union covering ok and err shapes
// so individual tests can mockImplementationOnce a failure result.
type MockDeployResult =
  | {
      ok: true;
      data: {
        deployment_id: string;
        server_name: string;
        server_url: string;
      };
    }
  | { ok: false; status: number; error: string; raw?: unknown };

// Capture the mocked mutation function so tests can assert on it.
const mutateAsyncSpy = vi.fn(
  async (): Promise<MockDeployResult> => ({
    ok: true,
    data: {
      deployment_id: '00000000-0000-0000-0000-000000000000',
      server_name: 'lumen-mcp-abc123',
      server_url: 'https://lumen-mcp-abc123.mcpgen.app/mcp',
    },
  }),
);

vi.mock('@/lib/api/deployments', () => ({
  useDeployEphemeral: () => ({
    mutateAsync: mutateAsyncSpy,
    isPending: false,
  }),
}));

// Stub useJob so the screen renders without a network round-trip; default to
// "no data" so the breadcrumb falls back to the deriveServerNameFromSpecUrl
// chain.
vi.mock('@/lib/api/jobs', () => ({
  useJob: () => ({ data: undefined }),
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

    // willFail branch fires after a 1.8s setTimeout.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1900));
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/deploy failed/i);
      expect(container.textContent).toMatch(/likely cause/i);
      expect(container.textContent).toMatch(/what happened/i);
    });
    // Canon DEMO strings must NOT leak into the failure UI.
    expect(container.textContent).not.toMatch(/mcp-sdk@2\.1/);
    expect(container.textContent).not.toMatch(/mcp-sdk@2\.0\.4/);
    expect(container.textContent).not.toMatch(/cdg, sfo, sin/);
    expect(container.textContent).not.toMatch(/v1\.1\.7 rollback/i);
    expect(container.textContent).not.toMatch(/auto-fix & retry/i);
    expect(container.textContent).not.toMatch(/0 \/ 3 regions healthy/i);
    expect(container.textContent).not.toMatch(/edge rejected the bundle/i);
    // The mutation should NOT fire when willFail short-circuits.
    expect(mutateAsyncSpy).not.toHaveBeenCalled();
  });

  it('surfaces real BFF error code (no_anon_session) when mutation fails', async () => {
    mutateAsyncSpy.mockImplementationOnce(
      async (): Promise<MockDeployResult> => ({
        ok: false,
        status: 401,
        error: 'no_anon_session',
      }),
    );
    const { getByRole, container } = renderDeploy();
    fireEvent.click(getByRole('button', { name: /^deploy$/i }));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/anon session missing/i);
      expect(container.textContent).toMatch(/no_anon_session/);
      expect(container.textContent).toMatch(/refresh the page/i);
    });
    // Still no canon DEMO strings.
    expect(container.textContent).not.toMatch(/mcp-sdk@2\.1/);
  });
});
