// apps/web/src/components/screens/auth/auth.test.tsx
//
// Phase 2 / B1 — vitest unit smoke for the AuthScreen.
//
// Covers:
//   - default render mirrors canon seed state (apikey · passthrough);
//   - clicking a type switcher chip flips authType + auto-resets mode;
//   - "continue" persists capture in sessionStorage and pushes the expected
//     /generate URL with auth_mode + auth_type query params;
//   - "back" navigates to /generate;
//   - OAuth provider connect button toasts (flag OFF default).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// Stub next/navigation BEFORE the module under test imports it.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
}));

vi.mock('@/lib/toast', () => ({
  toast: vi.fn(),
}));

import { AuthScreen } from './auth';
import { toast } from '@/lib/toast';

// jsdom in this repo doesn't ship a working `sessionStorage`, so install a
// Map-backed Storage shim per test (mirrors the canvas test pattern).
function installSessionStorageShim(): void {
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
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  installSessionStorageShim();
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  vi.mocked(toast).mockReset();
});

describe('<AuthScreen>', () => {
  it('renders canon seed state (api key · passthrough)', () => {
    // No specUrl + no sample → breadcrumb falls back to the generic
    // "mcp-server-mcp · auth" instead of any canon literal server name.
    const { getByText, getAllByText } = render(<AuthScreen />);
    expect(getByText(/mcp-server-mcp · auth/i)).toBeTruthy();
    // Canon detection card label (singular):
    expect(getByText('API Key')).toBeTruthy();
    // pass-through is the default mode; "most secure" badge confirms it's
    // shown selected. Multiple text occurrences are fine — we only assert
    // existence here.
    expect(getAllByText(/most secure/i).length).toBeGreaterThan(0);
  });

  it('switches auth type via simulate-chips and re-renders detection panel', () => {
    const { getAllByText, getByRole } = render(<AuthScreen />);
    // OAuth chip — canon label "D · oauth ·".
    const chip = getByRole('button', { name: /D · oauth/ });
    fireEvent.click(chip);
    // OAuth-specific copy now visible (SectionLabel + connect button both
    // contain it; assert at least one node is present).
    expect(getAllByText(/connect with Stripe/i).length).toBeGreaterThan(0);
  });

  it('continue button persists capture and navigates to /generate with query params', () => {
    const specUrl = 'https://api.stripe.com/openapi.yaml';
    const { getByRole } = render(<AuthScreen specUrl={specUrl} />);

    fireEvent.click(getByRole('button', { name: /continue · generate/i }));

    // sessionStorage capture is non-empty + parses back to the expected shape.
    const raw = window.sessionStorage.getItem('mcpgen_auth_capture');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(parsed['authType']).toBe('apikey');
    expect(parsed['mode']).toBe('passthrough');

    // Default-flow navigation echoes back specUrl + chosen auth config.
    expect(pushMock).toHaveBeenCalledTimes(1);
    const [target] = pushMock.mock.calls[0] as [string];
    expect(target).toContain('/generate?');
    expect(target).toContain('spec_url=https');
    expect(target).toContain('auth_mode=passthrough');
    expect(target).toContain('auth_type=apikey');
  });

  it('back button navigates to /generate', () => {
    const { getByRole } = render(<AuthScreen />);
    fireEvent.click(getByRole('button', { name: /^back$/i }));
    expect(pushMock).toHaveBeenCalledWith('/generate');
  });

  it('oauth connect button fires toast (flag OFF default)', () => {
    const { getByRole } = render(<AuthScreen sample={{ authType: 'oauth' }} />);
    fireEvent.click(getByRole('button', { name: /connect with Stripe/i }));
    expect(toast).toHaveBeenCalledWith('opening Stripe consent screen…');
  });
});
