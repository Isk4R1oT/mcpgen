// apps/web/tests/unit/lib/sentry/redact.test.ts
//
// Vitest unit tests for the shared Sentry beforeSend redaction helper.
// Covers Plan 07-06 Task 1 acceptance: header redaction (case-insensitive),
// query-param scrubbing (?key= / ?token=), malformed URL handling, and the
// round-trip credential-leak probe per CONTEXT D-30 + Pitfall #12 (P0).

import { describe, expect, it, vi } from 'vitest';
import {
  redactSentryEvent,
  REDACTED_HEADERS,
  REDACTED_QUERY_PARAMS,
  REDACTION_VALUE,
} from '@/lib/sentry/redact';

describe('redactSentryEvent', () => {
  describe('headers', () => {
    it('redacts Authorization header to [REDACTED] (preserves capitalization)', () => {
      const event = {
        request: {
          headers: { Authorization: 'Bearer sk_test_AAAAAA', 'X-Other': 'safe' },
        },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.headers?.Authorization).toBe(REDACTION_VALUE);
      expect(result.request?.headers?.['X-Other']).toBe('safe');
    });

    it('redacts authorization header (lowercase) — case-insensitive match', () => {
      const event = {
        request: { headers: { authorization: 'Bearer sk_test_AAAAAA' } },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.headers?.authorization).toBe(REDACTION_VALUE);
    });

    it('redacts X-Upstream-Auth header', () => {
      const event = {
        request: { headers: { 'X-Upstream-Auth': 'Bearer upstream_AAAAAA' } },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.headers?.['X-Upstream-Auth']).toBe(REDACTION_VALUE);
    });

    it('redacts Cookie header', () => {
      const event = {
        request: { headers: { Cookie: 'session=01HXAAAAAAAAAAAAAAAAAAAAA0' } },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.headers?.Cookie).toBe(REDACTION_VALUE);
    });

    it('redacts mixed-case x-uPpercase-Auth via case-insensitive match', () => {
      const event = {
        request: { headers: { 'x-upstream-auth': 'Bearer xyz' } },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.headers?.['x-upstream-auth']).toBe(REDACTION_VALUE);
    });
  });

  describe('url query params', () => {
    it('strips ?key= query param value to [REDACTED]', () => {
      const event = {
        request: { url: 'https://example.com/openapi.json?key=sk_live_AAAAAA' },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.url).toContain(`key=${encodeURIComponent(REDACTION_VALUE)}`);
      expect(result.request?.url).not.toContain('sk_live_AAAAAA');
    });

    it('strips ?token= query param value to [REDACTED]', () => {
      const event = {
        request: { url: 'https://example.com/spec?token=abc123' },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.url).toContain(`token=${encodeURIComponent(REDACTION_VALUE)}`);
      expect(result.request?.url).not.toContain('abc123');
    });

    it('strips both ?key= and ?token= when both present', () => {
      const event = {
        request: { url: 'https://example.com/spec?key=k_AAAA&token=t_BBBB' },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.url).not.toContain('k_AAAA');
      expect(result.request?.url).not.toContain('t_BBBB');
      expect(result.request?.url?.match(/REDACTED/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('preserves other query params (e.g., ?spec_url=...) untouched', () => {
      const event = {
        request: {
          url: 'https://example.com/api?spec_url=https%3A%2F%2Fstripe.com%2Fopenapi.json&page=2',
        },
      };
      const result = redactSentryEvent(event);
      expect(result.request?.url).toContain('spec_url=https');
      expect(result.request?.url).toContain('page=2');
    });

    it('leaves url unchanged when no redacted query params present', () => {
      const event = {
        request: { url: 'https://example.com/dashboard?page=1&sort=desc' },
      };
      const before = event.request.url;
      const result = redactSentryEvent(event);
      expect(result.request?.url).toBe(before);
    });

    it('handles malformed URL gracefully (does not throw)', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const event = { request: { url: 'not://a:valid:url:::malformed' } };
      expect(() => redactSentryEvent(event)).not.toThrow();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('returns event unchanged when no request property', () => {
      // SentryEventLike has only an optional `request` field; events without
      // request context (e.g. setTimeout-thrown errors) are common.
      const event: { message: string } & { request?: never } = {
        message: 'standalone error event',
      };
      const result = redactSentryEvent(event);
      expect(result).toBe(event);
      expect(result.message).toBe('standalone error event');
    });

    it('handles event with request but no headers and no url', () => {
      const event = { request: {} };
      const result = redactSentryEvent(event);
      expect(result.request).toBeDefined();
    });

    it('round-trip: Authorization Bearer + Cookie + url with key+token leaks no credentials', () => {
      const event = {
        request: {
          headers: {
            Authorization: 'Bearer sk_test_AAAAAA',
            Cookie: 'session=xyz_secret',
            'User-Agent': 'mcpgen-web/0.0.0',
          },
          url: 'https://example.com/spec?key=secret&token=abc&keep=this',
        },
      };
      const result = redactSentryEvent(event);
      const serialized = JSON.stringify(result);

      // No leaked credentials anywhere in the serialized event
      expect(serialized).not.toContain('sk_test_AAAAAA');
      expect(serialized).not.toContain('xyz_secret');
      expect(serialized).not.toContain('?key=secret');
      expect(serialized).not.toContain('token=abc');

      // Safe fields preserved
      expect(serialized).toContain('mcpgen-web/0.0.0');
      expect(serialized).toContain('keep=this');

      // Redaction marker present multiple times (3 fields redacted)
      const redactionCount = serialized.match(/REDACTED/g)?.length ?? 0;
      expect(redactionCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('exported constants', () => {
    it('REDACTED_HEADERS contains the expected list', () => {
      expect(REDACTED_HEADERS).toEqual(['Authorization', 'X-Upstream-Auth', 'Cookie']);
    });

    it('REDACTED_QUERY_PARAMS contains the expected list', () => {
      expect(REDACTED_QUERY_PARAMS).toEqual(['key', 'token']);
    });

    it('REDACTION_VALUE is the [REDACTED] literal', () => {
      expect(REDACTION_VALUE).toBe('[REDACTED]');
    });
  });
});
