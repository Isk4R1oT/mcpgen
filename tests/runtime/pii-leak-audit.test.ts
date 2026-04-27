// tests/runtime/pii-leak-audit.test.ts
//
// Phase 6 Wave 3 (pitfall #12 / D-16) — comprehensive deliberate-leak audit.
// For each fixture string, build a synthetic Sentry event with that string
// in headers + breadcrumbs + extra, run the redactor, assert the fixture
// is fully scrubbed from the post-redactor JSON-serialised event.

import { describe, expect, it } from 'vitest';

import { buildBeforeSend } from '@mcpgen/runtime/observability';

import { DELIBERATE_LEAK_FIXTURES } from './fixtures/deliberate-leak.js';

describe('PII leak audit — every deliberate-leak fixture is scrubbed', () => {
  for (const [label, fixture] of Object.entries(DELIBERATE_LEAK_FIXTURES)) {
    it(`fixture '${label}' is absent from post-redactor event`, () => {
      const beforeSend = buildBeforeSend();
      const event = {
        request: {
          headers: {
            Authorization: fixture,
            'X-Upstream-Auth': fixture,
            Cookie: fixture,
          },
          data: { leaked: fixture },
        },
        breadcrumbs: [
          {
            data: {
              Authorization: fixture,
              'X-Upstream-Auth': fixture,
              Cookie: fixture,
            },
          },
        ],
        extra: {
          Authorization: fixture,
          'X-Upstream-Auth': fixture,
          Cookie: fixture,
        },
      };
      const out = beforeSend(event);
      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain(fixture);
    });
  }
});
