// Vitest unit test for lib/jsx-bridge/loader. Runs in jsdom env (Task 6
// vitest.config.ts). Two tests: TWEAK_DEFAULTS literal shape + applyTokens
// behavior with mocked window.MCPTokens.

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('lib/jsx-bridge/loader', () => {
  beforeEach(() => {
    // Reset mocks between tests so each test gets a fresh MCPTokens stub.
    vi.resetModules();
    delete (globalThis as { MCPTokens?: unknown }).MCPTokens;
  });

  it('TWEAK_DEFAULTS object matches app.jsx EDITMODE-BEGIN literal', async () => {
    // Stub MCPTokens BEFORE importing the loader so its side-effect imports
    // (tokens.jsx, ui.jsx, screen-*.jsx) don't blow up under jsdom.
    (globalThis as { MCPTokens?: unknown }).MCPTokens = {
      makeCssVars: vi.fn().mockReturnValue({}),
    };

    // Stub the chain of locked-JSX side-effect imports as no-ops via Vite alias.
    vi.doMock('@/tokens', () => ({}));
    vi.doMock('@/ui', () => ({}));
    vi.doMock('@/screen-landing', () => ({}));
    vi.doMock('@/screen-auth', () => ({}));
    vi.doMock('@/screen-canvas', () => ({}));
    vi.doMock('@/screen-stream', () => ({}));
    vi.doMock('@/screen-playground', () => ({}));
    vi.doMock('@/screen-preview', () => ({}));
    vi.doMock('@/screen-quality', () => ({}));
    vi.doMock('@/screen-deploy', () => ({}));
    vi.doMock('@/screen-dashboard', () => ({}));

    const { TWEAK_DEFAULTS } = await import('@/lib/jsx-bridge/loader');

    expect(TWEAK_DEFAULTS).toBeDefined();
    expect(TWEAK_DEFAULTS).toMatchObject({
      palette: 'A',
      fonts: 'pp',
      borders: 'soft',
      shadows: 'block',
      case: 'lower',
      density: 'compact',
      bg: 'paper',
    });
    // At least 4 keys present (acceptance criterion).
    expect(Object.keys(TWEAK_DEFAULTS).length).toBeGreaterThanOrEqual(4);
  });

  it('applyTokens calls window.MCPTokens.makeCssVars and returns CSS-var map', async () => {
    const expectedVars = { '--paper': '#fff', '--ink': '#000' };
    const makeCssVarsSpy = vi.fn().mockReturnValue(expectedVars);

    (globalThis as { MCPTokens?: { makeCssVars: typeof makeCssVarsSpy } }).MCPTokens = {
      makeCssVars: makeCssVarsSpy,
    };

    vi.doMock('@/tokens', () => ({}));
    vi.doMock('@/ui', () => ({}));
    vi.doMock('@/screen-landing', () => ({}));
    vi.doMock('@/screen-auth', () => ({}));
    vi.doMock('@/screen-canvas', () => ({}));
    vi.doMock('@/screen-stream', () => ({}));
    vi.doMock('@/screen-playground', () => ({}));
    vi.doMock('@/screen-preview', () => ({}));
    vi.doMock('@/screen-quality', () => ({}));
    vi.doMock('@/screen-deploy', () => ({}));
    vi.doMock('@/screen-dashboard', () => ({}));

    const { applyTokens, TWEAK_DEFAULTS } = await import('@/lib/jsx-bridge/loader');

    const result = applyTokens();

    expect(result).toEqual(expectedVars);
    expect(makeCssVarsSpy).toHaveBeenCalledTimes(1);
    expect(makeCssVarsSpy).toHaveBeenCalledWith(TWEAK_DEFAULTS);
  });
});
