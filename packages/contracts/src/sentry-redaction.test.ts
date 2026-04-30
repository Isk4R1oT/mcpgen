// packages/contracts/src/sentry-redaction.test.ts
//
// CTRL-08 / D-03 / D-12 — vitest unit tests for shared `redactBeforeSend`.
// Covers 6 canonical leak vectors via shared cross-language fixture
// (`tests/fixtures/leak-vectors.json`) consumed in parallel by pytest in
// apps/generation-engine.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  redactBeforeSend,
  REDACTED_HEADERS,
  REDACTED_QUERY_PARAMS,
  VARIABLE_AUTH_HEADER_RE,
  SENSITIVE_STRING_PATTERNS,
  REDACTION_VALUE,
} from './sentry-redaction.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/contracts/src/ → repo root is 3 levels up.
const REPO_ROOT = resolve(HERE, '../../..');
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/leak-vectors.json');

interface LeakVector {
  name: string;
  input_event: Record<string, unknown>;
  expected_no_match: string[];
}

interface LeakVectorFile {
  vectors: LeakVector[];
}

describe('redactBeforeSend', () => {
  it('Test 1: strips Authorization Bearer header', () => {
    const event = {
      request: { headers: { Authorization: 'Bearer sk_test_AAAAAAAAAAAAAAAA' } },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.headers?.Authorization).toBe(REDACTION_VALUE);
  });

  it('Test 2: case-insensitive header match — `authorization` (lowercase) also stripped', () => {
    const event = {
      request: { headers: { authorization: 'Bearer xyz' } },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.headers?.authorization).toBe(REDACTION_VALUE);
  });

  it('Test 3: variable auth header regex strips X-Custom-Token / X-Service-Auth / X-Whatever-Secret', () => {
    const event = {
      request: {
        headers: {
          'X-Custom-Token': 'tok_xyz',
          'X-Service-Auth': 'auth_xyz',
          'X-Whatever-Secret': 'sec_xyz',
          'X-Safe-Header': 'keep-me',
        },
      },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.headers?.['X-Custom-Token']).toBe(REDACTION_VALUE);
    expect(out.request?.headers?.['X-Service-Auth']).toBe(REDACTION_VALUE);
    expect(out.request?.headers?.['X-Whatever-Secret']).toBe(REDACTION_VALUE);
    expect(out.request?.headers?.['X-Safe-Header']).toBe('keep-me');
  });

  it('Test 4: spec body redacted when request.url contains /v1/generate AND request.data is object', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/generate',
        data: { spec: 'openapi: 3.0.0\nfoo: bar' },
      },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.data).toBe('[REDACTED:spec]');
  });

  it('Test 4b: spec body redacted when request.data is a string on /v1/generate', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/generate',
        data: 'openapi: 3.0.0',
      },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.data).toBe('[REDACTED:spec]');
  });

  it('Test 5: event.extra.spec / openapi_yaml / raw_ir redacted', () => {
    const event = {
      extra: {
        spec: 'openapi: 3.0.0',
        openapi_yaml: 'paths: {}',
        raw_ir: '{}',
        keep_me: 'safe',
      },
    };
    const out = redactBeforeSend(event);
    expect(out.extra?.spec).toBe('[REDACTED:spec]');
    expect(out.extra?.openapi_yaml).toBe('[REDACTED:spec]');
    expect(out.extra?.raw_ir).toBe('[REDACTED:spec]');
    expect(out.extra?.keep_me).toBe('safe');
  });

  it('Test 6: event.message containing Bearer FAKE_LEAK_TOKEN — token replaced', () => {
    const event = { message: 'Bearer FAKE_LEAK_TOKEN expired' };
    const out = redactBeforeSend(event);
    expect(out.message).not.toContain('FAKE_LEAK_TOKEN');
    expect(out.message).toContain(REDACTION_VALUE);
  });

  it('Test 7: event.message containing sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA — key replaced', () => {
    // Suffix MUST be pure alphanumeric to match /sk_live_[A-Za-z0-9]{16,}/.
    const event = { message: 'leaked sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA in stack' };
    const out = redactBeforeSend(event);
    expect(out.message).not.toContain('sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA');
    expect(out.message).toContain(REDACTION_VALUE);
  });

  it('Test 8: event.message containing ghp_FAKELEAKXYZAAAAAAAAAAAAAAAA — token replaced', () => {
    const event = { message: 'leaked ghp_FAKELEAKXYZAAAAAAAAAAAAAAAA in error' };
    const out = redactBeforeSend(event);
    expect(out.message).not.toContain('ghp_FAKELEAKXYZAAAAAAAAAAAAAAAA');
    expect(out.message).toContain(REDACTION_VALUE);
  });

  it('Test 9: malformed URL does NOT throw', () => {
    const event = { request: { url: 'not://a:valid:url:::malformed' } };
    expect(() => redactBeforeSend(event)).not.toThrow();
  });

  it('Test 10: empty event ({}) does NOT throw and returns same event', () => {
    const event = {};
    const out = redactBeforeSend(event);
    expect(out).toEqual({});
  });

  it('URL query params: ?key= / ?token= / ?secret= / ?auth= scrubbed', () => {
    const event = {
      request: {
        url: 'https://example.com/spec?key=k_AAAA&token=t_BBBB&secret=s_CCCC&auth=a_DDDD&keep=this',
      },
    };
    const out = redactBeforeSend(event);
    expect(out.request?.url).not.toContain('k_AAAA');
    expect(out.request?.url).not.toContain('t_BBBB');
    expect(out.request?.url).not.toContain('s_CCCC');
    expect(out.request?.url).not.toContain('a_DDDD');
    expect(out.request?.url).toContain('keep=this');
  });

  it('JWT pattern in message: scrubbed', () => {
    const event = {
      message:
        'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U is invalid',
    };
    const out = redactBeforeSend(event);
    expect(out.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out.message).toContain(REDACTION_VALUE);
  });

  describe('table-driven cross-language fixture', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    const file = JSON.parse(raw) as LeakVectorFile;

    for (const vector of file.vectors) {
      it(`vector "${vector.name}" — no leak strings remain in serialized output`, () => {
        // Deep clone so mutation does not poison sibling tests.
        const inputCopy = JSON.parse(JSON.stringify(vector.input_event)) as Record<
          string,
          unknown
        >;
        const out = redactBeforeSend(inputCopy);
        const serialized = JSON.stringify(out);
        for (const leak of vector.expected_no_match) {
          expect(
            serialized,
            `vector ${vector.name} — leaked string "${leak}" still present in: ${serialized}`,
          ).not.toContain(leak);
        }
      });
    }
  });

  describe('exported constants', () => {
    it('REDACTED_HEADERS contains all 7 entries', () => {
      expect(REDACTED_HEADERS.has('authorization')).toBe(true);
      expect(REDACTED_HEADERS.has('x-upstream-auth')).toBe(true);
      expect(REDACTED_HEADERS.has('cookie')).toBe(true);
      expect(REDACTED_HEADERS.has('set-cookie')).toBe(true);
      expect(REDACTED_HEADERS.has('stripe-account')).toBe(true);
      expect(REDACTED_HEADERS.has('stripe-signature')).toBe(true);
      expect(REDACTED_HEADERS.has('x-webhook-signature')).toBe(true);
      expect(REDACTED_HEADERS.size).toBe(7);
    });

    it('REDACTED_QUERY_PARAMS contains the expected list', () => {
      expect(REDACTED_QUERY_PARAMS).toEqual(['key', 'token', 'secret', 'auth']);
    });

    it('VARIABLE_AUTH_HEADER_RE matches expected variants', () => {
      expect(VARIABLE_AUTH_HEADER_RE.test('x-custom-token')).toBe(true);
      expect(VARIABLE_AUTH_HEADER_RE.test('x-service-auth')).toBe(true);
      expect(VARIABLE_AUTH_HEADER_RE.test('x-whatever-secret')).toBe(true);
      expect(VARIABLE_AUTH_HEADER_RE.test('x-data-key')).toBe(true);
      expect(VARIABLE_AUTH_HEADER_RE.test('x-safe-header')).toBe(false);
    });

    it('SENSITIVE_STRING_PATTERNS has 5 patterns', () => {
      expect(SENSITIVE_STRING_PATTERNS.length).toBe(5);
    });

    it('REDACTION_VALUE is the [REDACTED] literal', () => {
      expect(REDACTION_VALUE).toBe('[REDACTED]');
    });
  });
});
