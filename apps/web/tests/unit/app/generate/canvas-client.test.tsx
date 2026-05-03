// apps/web/tests/unit/app/generate/canvas-client.test.tsx — M-4 Agent 1.
//
// Wires the /generate canvas client to POST /api/v1/generate. We mock
// `next/dynamic` to render the wrapped child synchronously and `next/navigation`
// to assert router.push fires with the returned job_id.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { GEN_ID_REGEX, IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushMock }),
}));

// next/dynamic — synchronous render that just hands the props through to a
// minimal stand-in for the locked Landing screen. We expose a "make it" button
// + url input so the test can drive the form without loading the canon JSX.
vi.mock('next/dynamic', () => ({
  default: <P,>(_loader: () => Promise<unknown>) => {
    return function StubLanding(props: P): React.ReactElement {
      const p = props as unknown as {
        urlText: string;
        setUrlText: (s: string) => void;
        onMakeIt: () => void;
      };
      return (
        <form
          onSubmit={(e: React.FormEvent): void => {
            e.preventDefault();
            p.onMakeIt();
          }}
        >
          <input
            data-testid="url-input"
            value={p.urlText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => p.setUrlText(e.target.value)}
          />
          <button type="submit">make it</button>
        </form>
      );
    };
  },
}));

// localStorage shim (jsdom 26 + Vitest 1.x — same pattern as client.test.ts).
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length(): number { return store.size; },
    clear(): void { store.clear(); },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(i: number): string | null { return Array.from(store.keys())[i] ?? null; },
    removeItem(key: string): void { store.delete(key); },
    setItem(key: string, value: string): void { store.set(key, value); },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim, writable: true, configurable: true,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('app/generate/_canvas-client', () => {
  beforeEach(() => {
    pushMock.mockReset();
    installLocalStorageShim();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('POSTs /api/v1/generate with idempotency-key + navigates on 202', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(202, {
          job_id: 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1',
          sse_url: 'https://example.com/sse',
        }),
      );

    const { default: CanvasClientShell } = await import(
      '@/app/generate/_canvas-client'
    );
    const utils = render(<CanvasClientShell recentGenerations={null} />);

    fireEvent.change(utils.getByTestId('url-input'), {
      target: { value: 'https://example.com/openapi.json' },
    });
    fireEvent.click(utils.getByText('make it'));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    const [path, init] = callArgs as [string, RequestInit];
    expect(path).toBe('/api/v1/generate');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(GEN_ID_REGEX.test(headers[IDEMPOTENCY_KEY_HEADER] ?? '')).toBe(true);

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith(
      '/generate/gen_01HXAAAAAAAAAAAAAAAAAAAAA1',
    );
  });

  it('does not navigate when URL is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const toastMock = vi.fn();
    (window as unknown as { mcpToast?: (s: string) => void }).mcpToast = toastMock;

    const { default: CanvasClientShell } = await import(
      '@/app/generate/_canvas-client'
    );
    const utils = render(<CanvasClientShell recentGenerations={null} />);

    fireEvent.click(utils.getByText('make it'));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    delete (window as unknown as { mcpToast?: unknown }).mcpToast;
  });
});
