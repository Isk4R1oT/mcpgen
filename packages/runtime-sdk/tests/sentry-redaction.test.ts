// packages/runtime-sdk/tests/sentry-redaction.test.ts
//
// Phase 6 Wave 3 (D-16) — Sentry beforeSend redactor unit test.

import { describe, expect, it } from 'vitest';

import { buildBeforeSend } from '../src/runtime/sentry-redaction.js';

describe('buildBeforeSend', () => {
  it('redacts default denylist headers + extra denylist entries; leaves Content-Type alone', () => {
    const beforeSend = buildBeforeSend(['Stripe-Account']);
    const event = {
      request: {
        headers: {
          Authorization: 'Bearer secret',
          'X-Upstream-Auth': 'stripeblob',
          Cookie: 'sess=x',
          'Stripe-Account': 'acct_123',
          'Content-Type': 'application/json',
        },
      },
    };
    const out = beforeSend(event);
    expect(out.request.headers.Authorization).toBe('[REDACTED]');
    expect(out.request.headers['X-Upstream-Auth']).toBe('[REDACTED]');
    expect(out.request.headers.Cookie).toBe('[REDACTED]');
    expect(out.request.headers['Stripe-Account']).toBe('[REDACTED]');
    expect(out.request.headers['Content-Type']).toBe('application/json');
  });

  it('redaction is case-insensitive (authorization vs Authorization)', () => {
    const beforeSend = buildBeforeSend();
    const event = {
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sess=x',
        },
      },
    };
    const out = beforeSend(event);
    expect(out.request.headers.authorization).toBe('[REDACTED]');
    expect(out.request.headers.cookie).toBe('[REDACTED]');
  });

  it('redacts request.data wholesale and breadcrumb/extra denylist keys', () => {
    const beforeSend = buildBeforeSend();
    const event = {
      request: {
        headers: { Authorization: 'Bearer x' },
        data: { Authorization: 'leaks-here' },
      },
      breadcrumbs: [
        { data: { Authorization: 'inside-bc', 'Content-Type': 'json' } },
      ],
      extra: { Cookie: 'leak', other: 'safe' },
    };
    const out = beforeSend(event);
    expect(out.request.data).toBe('[REDACTED]');
    expect(out.breadcrumbs[0]!.data!.Authorization).toBe('[REDACTED]');
    expect(out.breadcrumbs[0]!.data!['Content-Type']).toBe('json');
    expect(out.extra.Cookie).toBe('[REDACTED]');
    expect(out.extra.other).toBe('safe');
  });
});
