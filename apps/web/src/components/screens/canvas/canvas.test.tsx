// apps/web/src/components/screens/canvas/canvas.test.tsx
//
// Phase 1 / A2 — vitest unit smoke for the Canvas screen.
// Covers: renders without props, dismiss-summary persists to localStorage,
// auto-submit fires on `specUrl` and redirects on 202.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { Canvas, type CanvasProps } from './canvas';

function renderCanvas(props: CanvasProps = {}): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = (children: ReactElement): ReactElement => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(wrapper(<Canvas {...props} />));
}

// jsdom in this repo doesn't ship a working `localStorage` (it's a no-op stub),
// so install a Map-backed Storage shim per test (matching the pattern already
// in use under `tests/unit/lib/idempotency-key.test.ts`).
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

// next/navigation is shimmed at module-graph level so the component can call
// `useRouter()` inside jsdom. Each test inspects the recorded `push` calls.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
}));

// Sonner imports `next/navigation` indirectly; isolating the toast stub here
// keeps the unit test free of UI side effects from the real toast layer.
vi.mock('@/lib/toast', () => ({
  toast: vi.fn(),
}));

// submitGeneration is the only network surface — stub per test.
vi.mock('@/lib/api/generate', () => ({
  submitGeneration: vi.fn(),
}));

import { submitGeneration } from '@/lib/api/generate';
import { toast } from '@/lib/toast';

beforeEach(() => {
  installLocalStorageShim();
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  vi.mocked(submitGeneration).mockReset();
  vi.mocked(toast).mockReset();
});

describe('<Canvas>', () => {
  it('renders the canon TopBar with breadcrumb + empty tools list', () => {
    const { getByText, getAllByText } = renderCanvas();
    // Breadcrumb tail uses the default sample name.
    // No spec URL + no real job → derived name falls back to generic slug.
    expect(getByText(/mcp-server-mcp · draft/i)).toBeTruthy();
    // No jobId / no real data → tools count is 0; canvas no longer ships
    // canon's TOOL_DATA literal.
    expect(getAllByText(/tools · 0/i).length).toBeGreaterThan(0);
  });

  it('persists summary dismissal in localStorage', () => {
    const { getByLabelText, queryByText } = renderCanvas();
    // First-visit summary card is visible.
    expect(queryByText(/here's what we made/i)).not.toBeNull();
    fireEvent.click(getByLabelText('dismiss'));
    // Re-grab the live localStorage reference — jsdom may swap it between
    // render passes when toast/sonner-style portals run.
    expect(window.localStorage.getItem('mcpgen_canvas_summary_seen')).toBe('1');
  });

  it('skips summary card when localStorage flag is set', () => {
    window.localStorage.setItem('mcpgen_canvas_summary_seen', '1');
    const { queryByText } = renderCanvas();
    expect(queryByText(/here's what we made/i)).toBeNull();
  });

  it('auto-submits and redirects when specUrl is provided (202)', async () => {
    vi.mocked(submitGeneration).mockResolvedValueOnce({
      ok: true,
      data: {
        job_id: 'gen_01HJ12345678ABCDEFGHJKMNPQ',
        sse_url: 'http://localhost:8787/api/v1/jobs/gen_01HJ12345678ABCDEFGHJKMNPQ/stream',
      },
    });

    renderCanvas({ specUrl: 'https://example.com/openapi.json' });

    await waitFor(() => {
      expect(submitGeneration).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/generate/gen_01HJ12345678ABCDEFGHJKMNPQ',
      );
    });
  });

  it('toasts when auto-submit fails', async () => {
    vi.mocked(submitGeneration).mockResolvedValueOnce({
      ok: false,
      status: 502,
      error: 'engine is busy, please retry',
      raw: null,
    });

    renderCanvas({ specUrl: 'https://example.com/openapi.json' });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('engine is busy, please retry', {
        kind: 'error',
      });
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('toasts on invalid specUrl without calling submitGeneration', async () => {
    renderCanvas({ specUrl: 'not-a-url' });

    await waitFor(() => {
      expect(toast).toHaveBeenCalled();
    });
    expect(submitGeneration).not.toHaveBeenCalled();
  });
});
