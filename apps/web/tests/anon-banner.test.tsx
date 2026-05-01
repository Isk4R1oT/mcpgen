// apps/web/tests/anon-banner.test.tsx
//
// Plan 09.1-07 — render-time behavior of the 4 anon-state components.
// Mocks `useAnonState` so each test pins a single (loading, isAnonymous)
// state and asserts the corresponding render.
//
// References:
//   - apps/web/src/components/anon-banner.tsx
//   - apps/web/src/components/anon-deploy-cta.tsx
//   - apps/web/src/components/anon-cache-hit-badge.tsx
//   - apps/web/src/components/anon-signup-cta.tsx

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createElement } from 'react';

// Module-level state used by the mocked hook — flipped per test.
let __anonState: { isAnonymous: boolean; loading: boolean } = {
  isAnonymous: true,
  loading: false,
};

vi.mock('@/lib/anon-state', () => ({
  useAnonState: (): { isAnonymous: boolean; loading: boolean } => __anonState,
  ANON_PROBE_PATH: '/api/v1/dashboard/list',
}));

// Re-import AFTER vi.mock so the components see the mocked hook.
const importComponents = async (): Promise<{
  AnonBanner: typeof import('../src/components/anon-banner').AnonBanner;
  AnonDeployCta: typeof import('../src/components/anon-deploy-cta').AnonDeployCta;
  AnonCacheHitBadge: typeof import('../src/components/anon-cache-hit-badge').AnonCacheHitBadge;
  AnonSignupCta: typeof import('../src/components/anon-signup-cta').AnonSignupCta;
}> => {
  const banner = await import('../src/components/anon-banner');
  const cta = await import('../src/components/anon-deploy-cta');
  const cache = await import('../src/components/anon-cache-hit-badge');
  const signup = await import('../src/components/anon-signup-cta');
  return {
    AnonBanner: banner.AnonBanner,
    AnonDeployCta: cta.AnonDeployCta,
    AnonCacheHitBadge: cache.AnonCacheHitBadge,
    AnonSignupCta: signup.AnonSignupCta,
  };
};

describe('AnonBanner', () => {
  beforeEach(() => {
    __anonState = { isAnonymous: true, loading: false };
  });
  afterEach(() => cleanup());

  it('test 1: renders text containing "anonymous tier" when isAnonymous=true', async () => {
    __anonState = { isAnonymous: true, loading: false };
    const { AnonBanner } = await importComponents();
    const { getByTestId } = render(createElement(AnonBanner));
    const banner = getByTestId('anon-banner');
    expect(banner.textContent).toContain('anonymous tier');
    expect(banner.textContent).toContain('sign up');
  });

  it('test 2: renders nothing when isAnonymous=false', async () => {
    __anonState = { isAnonymous: false, loading: false };
    const { AnonBanner } = await importComponents();
    const { container } = render(createElement(AnonBanner));
    expect(container.querySelector('[data-testid="anon-banner"]')).toBeNull();
  });

  it('test 3: renders nothing when loading=true', async () => {
    __anonState = { isAnonymous: true, loading: true };
    const { AnonBanner } = await importComponents();
    const { container } = render(createElement(AnonBanner));
    expect(container.querySelector('[data-testid="anon-banner"]')).toBeNull();
  });
});

describe('AnonDeployCta', () => {
  beforeEach(() => {
    __anonState = { isAnonymous: true, loading: false };
  });
  afterEach(() => cleanup());

  it('test 4: renders "Deploy to free 24h URL" when isAnonymous=true', async () => {
    __anonState = { isAnonymous: true, loading: false };
    const { AnonDeployCta } = await importComponents();
    const { getByTestId } = render(createElement(AnonDeployCta, { generationId: 'gen-1' }));
    const cta = getByTestId('anon-deploy-cta');
    expect(cta.getAttribute('data-mode')).toBe('ephemeral');
    expect(cta.textContent).toContain('Deploy to free 24h URL');
  });

  it('test 5: renders "Deploy to MCPGen Cloud" when isAnonymous=false', async () => {
    __anonState = { isAnonymous: false, loading: false };
    const { AnonDeployCta } = await importComponents();
    const { getByTestId } = render(createElement(AnonDeployCta, { generationId: 'gen-1' }));
    const cta = getByTestId('anon-deploy-cta');
    expect(cta.getAttribute('data-mode')).toBe('permanent');
    expect(cta.textContent).toContain('Deploy to MCPGen Cloud');
  });
});

describe('AnonCacheHitBadge', () => {
  afterEach(() => cleanup());

  it('test 6: renders nothing when cacheHit prop absent', async () => {
    const { AnonCacheHitBadge } = await importComponents();
    const { container } = render(createElement(AnonCacheHitBadge, {}));
    expect(container.querySelector('[data-testid="cache-hit-badge"]')).toBeNull();
  });

  it('test 6b: renders nothing when cacheHit is null', async () => {
    const { AnonCacheHitBadge } = await importComponents();
    const { container } = render(createElement(AnonCacheHitBadge, { cacheHit: null }));
    expect(container.querySelector('[data-testid="cache-hit-badge"]')).toBeNull();
  });

  it('test 7: renders text containing the formatted quality score', async () => {
    const { AnonCacheHitBadge } = await importComponents();
    const { getByTestId } = render(
      createElement(AnonCacheHitBadge, {
        cacheHit: {
          original_quality: 4.6,
          served_from: '2026-04-29T00:00:00.000Z',
        },
      }),
    );
    const badge = getByTestId('cache-hit-badge');
    expect(badge.textContent).toContain('4.6');
    expect(badge.textContent).toContain('cache');
    expect(badge.textContent).toContain('verified');
  });
});

describe('AnonSignupCta', () => {
  beforeEach(() => {
    __anonState = { isAnonymous: true, loading: false };
  });
  afterEach(() => cleanup());

  it('test 8: renders signup prompt when isAnonymous=true', async () => {
    __anonState = { isAnonymous: true, loading: false };
    const { AnonSignupCta } = await importComponents();
    const { getByTestId } = render(createElement(AnonSignupCta));
    const cta = getByTestId('signup-cta');
    expect(cta.textContent).toContain('Sign up free');
  });

  it('test 9: renders nothing when isAnonymous=false', async () => {
    __anonState = { isAnonymous: false, loading: false };
    const { AnonSignupCta } = await importComponents();
    const { container } = render(createElement(AnonSignupCta));
    expect(container.querySelector('[data-testid="signup-cta"]')).toBeNull();
  });
});
