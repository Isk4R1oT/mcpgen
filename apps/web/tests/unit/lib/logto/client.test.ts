// Vitest unit test — apps/web/src/lib/logto/client.ts (Plan 07-02 Task 1).
//
// Per the Plan 07-02 Rule-3 fix, module evaluation NEVER throws — Phase-1
// D-19 empty-DSN-tolerant pattern (so `next build` works in CI without
// LOGTO_* env vars). Fail-fast moved into opt-in `assertLogtoConfigValid()`.
//
// Covers:
//   1. Dev: returns config with empty strings + warn when LOGTO_* env not set
//   2. Production with missing env: module still loads (build-friendly);
//      assertLogtoConfigValid() throws naming the missing var
//   3. Full env: returns config; assertLogtoConfigValid() does not throw
//
// Each test uses vi.stubEnv + vi.resetModules so the module is freshly
// evaluated against the stubbed env.

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('lib/logto/client.logtoConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('dev: returns config with empty strings + warn when LOGTO_* env not set', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOGTO_ENDPOINT', '');
    vi.stubEnv('LOGTO_APP_ID', '');
    vi.stubEnv('LOGTO_APP_SECRET', '');
    vi.stubEnv('LOGTO_BASE_URL', '');
    vi.stubEnv('LOGTO_COOKIE_SECRET', '');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mod = await import('@/lib/logto/client');

    expect(mod.logtoConfig).toBeDefined();
    expect(mod.logtoConfig.appId).toBe('');
    expect(mod.logtoConfig.appSecret).toBe('');
    expect(mod.logtoConfig.endpoint).toBe('');
    expect(mod.logtoConfig.baseUrl).toBe('');
    // cookieSecret falls back to a build-tolerant placeholder so `next build`
    // doesn't crash when env vars are absent. assertLogtoConfigValid still
    // surfaces the missing var.
    expect(typeof mod.logtoConfig.cookieSecret).toBe('string');
    expect((mod.logtoConfig.cookieSecret ?? '').length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('production missing env: module loads cleanly; assertLogtoConfigValid throws', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOGTO_ENDPOINT', 'https://example.logto.app');
    vi.stubEnv('LOGTO_APP_ID', ''); // missing
    vi.stubEnv('LOGTO_APP_SECRET', 'secret-x');
    vi.stubEnv('LOGTO_BASE_URL', 'https://mcpgen.dev');
    vi.stubEnv('LOGTO_COOKIE_SECRET', 'cookie-secret-32-bytes-base64');

    // Module load itself must not throw (build-time safety).
    const mod = await import('@/lib/logto/client');
    expect(mod.logtoConfig).toBeDefined();
    expect(mod.logtoConfig.appId).toBe('');
    // Opt-in fail-fast guard surfaces the missing var.
    expect(() => mod.assertLogtoConfigValid()).toThrow(/LOGTO_APP_ID/);
  });

  it('production: returns config when all 5 LOGTO_* env vars are set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOGTO_ENDPOINT', 'https://example.logto.app');
    vi.stubEnv('LOGTO_APP_ID', 'app-id-x');
    vi.stubEnv('LOGTO_APP_SECRET', 'app-secret-x');
    vi.stubEnv('LOGTO_BASE_URL', 'https://mcpgen.dev');
    vi.stubEnv('LOGTO_COOKIE_SECRET', 'cookie-secret-32-bytes-base64');

    const mod = await import('@/lib/logto/client');

    expect(mod.logtoConfig.appId).toBe('app-id-x');
    expect(mod.logtoConfig.appSecret).toBe('app-secret-x');
    expect(mod.logtoConfig.endpoint).toBe('https://example.logto.app');
    expect(mod.logtoConfig.baseUrl).toBe('https://mcpgen.dev');
    expect(mod.logtoConfig.cookieSecret).toBe('cookie-secret-32-bytes-base64');
    expect(mod.logtoConfig.cookieSecure).toBe(true);
    // assertLogtoConfigValid does not throw with full env.
    expect(() => mod.assertLogtoConfigValid()).not.toThrow();
  });
});
