// apps/web/src/components/screens/deploy-success/deploy-success.test.tsx
//
// Phase 1 / Agent A5 — DeploySuccess unit smoke.
//
// Verifies:
//   1. Renders the live MCP URL + Claude Desktop config block.
//   2. Copy buttons call `navigator.clipboard.writeText` and surface a toast.
//   3. Claim CTA hard-navigates to the Logto sign-in URL with a redirect
//      back to /generate/<jobId>/deploy/permanent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import DeploySuccess from './deploy-success';

const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
}));

let writeTextSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextSpy },
    writable: true,
    configurable: true,
  });
  toastSpy.mockClear();
});

afterEach(() => cleanup());

const baseProps = {
  jobId: 'jobabcdef',
  mcpUrl: 'https://stripe-mcp-abcdef.mcpgen.app/mcp',
  sample: { id: 'stripe', name: 'stripe' },
};

describe('<DeploySuccess>', () => {
  it('renders the live URL + Claude Desktop config block', () => {
    const { container } = render(<DeploySuccess {...baseProps} />);
    expect(container.textContent).toMatch(/stripe-mcp-abcdef\.mcpgen\.app\/mcp/);
    const config = container.querySelector('[data-config-block]');
    expect(config).not.toBeNull();
    expect(config?.textContent).toMatch(/"mcpServers"/);
    expect(config?.textContent).toMatch(/STRIPE_KEY/);
  });

  it('copy URL button writes to clipboard + fires toast', async () => {
    const { getAllByRole } = render(<DeploySuccess {...baseProps} />);
    // The first "copy" button is the URL card; copy install / share are
    // separate clickable cards (data-action attributes).
    const copyBtn = getAllByRole('button').find(
      (b) => b.textContent?.toLowerCase() === 'copy',
    );
    expect(copyBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(copyBtn!);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(writeTextSpy).toHaveBeenCalledWith(
      'https://stripe-mcp-abcdef.mcpgen.app/mcp',
    );
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('copied'));
  });

  it('claim CTA hard-navigates to Logto sign-in with redirect_to', () => {
    const assignSpy = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, assign: assignSpy },
      writable: true,
      configurable: true,
    });

    const { getByRole } = render(<DeploySuccess {...baseProps} />);
    fireEvent.click(getByRole('button', { name: /claim permanent/i }));
    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy.mock.calls[0]?.[0]).toBe(
      '/sign-in?redirect_to=' +
        encodeURIComponent('/generate/jobabcdef/deploy/permanent'),
    );

    Object.defineProperty(window, 'location', {
      value: original,
      writable: true,
      configurable: true,
    });
  });
});
