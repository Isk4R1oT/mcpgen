// apps/web/tests/unit/sentry.client.config.test.ts
//
// Integration test for Plan 07-06 Task 2: verify sentry.client.config.ts wires
// the shared redactSentryEvent helper into Sentry.init's beforeSend, and that
// the wired pipeline produces redacted events end-to-end.

import { describe, expect, it, vi, beforeEach } from 'vitest';

type SentryInitOptions = {
  dsn: string;
  tracesSampleRate: number;
  beforeSend: (event: unknown) => unknown;
};

const initSpy = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (options: SentryInitOptions) => initSpy(options),
}));

describe('sentry.client.config wiring', () => {
  beforeEach(() => {
    initSpy.mockClear();
  });

  it('loads without crashing with empty NEXT_PUBLIC_SENTRY_DSN', async () => {
    delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_SENTRY_DSN;
    vi.resetModules();
    await expect(
      import('../../sentry.client.config'),
    ).resolves.toBeDefined();
  });

  it('Sentry.init is called with a beforeSend that invokes redactSentryEvent', async () => {
    vi.resetModules();
    initSpy.mockClear();
    await import('../../sentry.client.config');

    expect(initSpy).toHaveBeenCalledOnce();
    const options = initSpy.mock.calls[0]?.[0] as SentryInitOptions;
    expect(typeof options.beforeSend).toBe('function');

    const event = {
      request: {
        headers: {
          Authorization: 'Bearer sk_test_AAAAAA',
          Cookie: 'session=01HXAAAAAAAAAAAAAAAAAAAAA0',
          'User-Agent': 'mcpgen-web/0.0.0',
        },
        url: 'https://example.com/spec?key=secret_AAAAA&token=abc&keep=this',
      },
    };
    const redacted = options.beforeSend(event) as typeof event;

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('sk_test_AAAAAA');
    expect(serialized).not.toContain('01HXAAAAAAAAAAAAAAAAAAAAA0');
    expect(serialized).not.toContain('secret_AAAAA');
    expect(serialized).not.toContain('?key=secret');
    expect(serialized).toContain('keep=this');
    expect(serialized).toContain('mcpgen-web/0.0.0');
  });

  it('tracesSampleRate is set to 0.1', async () => {
    vi.resetModules();
    initSpy.mockClear();
    await import('../../sentry.client.config');
    const options = initSpy.mock.calls[0]?.[0] as SentryInitOptions;
    expect(options.tracesSampleRate).toBe(0.1);
  });
});
