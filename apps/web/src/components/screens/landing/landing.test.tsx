// apps/web/src/components/screens/landing/landing.test.tsx
//
// Phase 1 / Agent A1 — Landing screen unit smoke.
//
// Renders the screen against the locked global.css class contract and
// verifies the canon-critical surfaces are present so a refactor can't
// silently strip them:
//   - hero copy uses the canon `mc-display-xl` class
//   - the URL input uses `mc-input mc-mono` (Playwright e2e relies on it)
//   - the primary CTA renders the localized "make it" label
//   - sign-in button routes to /sign-in (canon embedded auth screen)
//
// Translation provider: messages are loaded from
// `apps/web/messages/en.json` so we exercise real strings (catches stale
// or removed i18n keys at unit-test time).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import enMessages from '../../../../messages/en.json';
import Landing from './landing';

// next/navigation is a server-only module in jest/vitest; mock the hook the
// component reaches for. We don't assert on push() in this smoke (the flow
// spec covers the navigation contract); we just need it to be a function.
const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushSpy }),
}));

// LangSwitcher imports next-intl `usePathname` from `@/i18n/navigation`
// which under jsdom would talk to the App Router shim; stub it to avoid
// pulling that machinery into a unit test.
vi.mock('@/i18n/navigation', () => ({
  useRouter: (): { push: (p: string) => void; replace: (p: string) => void } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: (): string => '/',
}));

afterEach(() => {
  cleanup();
  pushSpy.mockReset();
});

function renderLanding(): ReturnType<typeof render> {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Landing />
    </NextIntlClientProvider>,
  );
}

describe('<Landing>', () => {
  it('renders hero with canon mc-display-xl class', () => {
    const { container } = renderLanding();
    const hero = container.querySelector('.mc-display-xl');
    expect(hero).not.toBeNull();
    // Canon hero strings are present (locale: en).
    expect(hero?.textContent).toContain('any API.');
    expect(hero?.textContent).toContain('production MCP.');
  });

  it('renders the canon mc-stamp URL input with mc-input mc-mono', () => {
    const { container } = renderLanding();
    const input = container.querySelector<HTMLInputElement>('.mc-stamp input.mc-input.mc-mono');
    expect(input).not.toBeNull();
    expect(input?.placeholder.toLowerCase()).toContain('openapi');
  });

  it('renders the primary "make it" CTA button', () => {
    const { getByRole } = renderLanding();
    const cta = getByRole('button', { name: /make it/i });
    expect(cta.className).toContain('mc-btn-primary');
    expect(cta.className).toContain('mc-btn-lg');
  });

  it('typing in the URL input updates its value', () => {
    const { container } = renderLanding();
    const input = container.querySelector<HTMLInputElement>('.mc-stamp input');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: 'https://api.example.com/openapi.json' } });
    expect(input!.value).toBe('https://api.example.com/openapi.json');
  });

  it('sign-in button routes to /sign-in (canon embedded auth screen)', () => {
    const { getByRole } = renderLanding();
    fireEvent.click(getByRole('button', { name: /sign in/i }));
    expect(pushSpy).toHaveBeenCalledWith('/sign-in');
  });

  it('"make it" with empty input still routes to /generate (no spec_url)', () => {
    const { getByRole } = renderLanding();
    fireEvent.click(getByRole('button', { name: /make it/i }));
    expect(pushSpy).toHaveBeenCalledWith('/generate');
  });

  it('"make it" with a URL routes to /generate?spec_url=...', () => {
    const { container, getByRole } = renderLanding();
    const input = container.querySelector<HTMLInputElement>('.mc-stamp input');
    fireEvent.change(input!, { target: { value: 'https://api.stripe.com/openapi.yaml' } });
    fireEvent.click(getByRole('button', { name: /make it/i }));
    expect(pushSpy).toHaveBeenCalledWith(
      '/generate?spec_url=https%3A%2F%2Fapi.stripe.com%2Fopenapi.yaml',
    );
  });
});
