// tests/runtime/sentry-redaction.test.ts
//
// Phase 6 Wave 3 (D-16 / pitfall #12) — cross-app integration: feed deliberate-leak
// fixture strings into a synthetic Sentry event, run the redactor built from
// `@mcpgen/runtime/observability`, assert no fixture string survives in the
// JSON-serialised redacted event.

import { describe, expect, it } from 'vitest';

import { buildBeforeSend } from '@mcpgen/runtime/observability';

import { DELIBERATE_LEAK_FIXTURES } from './fixtures/deliberate-leak.js';

describe('Sentry beforeSend redactor — deliberate-leak audit', () => {
  it('zero fixture strings remain after redaction across headers/data/extra', () => {
    const beforeSend = buildBeforeSend();
    const event = {
      request: {
        headers: {
          Authorization: DELIBERATE_LEAK_FIXTURES.bearer_token,
          'X-Upstream-Auth': DELIBERATE_LEAK_FIXTURES.x_upstream_auth,
          Cookie: DELIBERATE_LEAK_FIXTURES.cookie,
          'Content-Type': 'application/json',
        },
        data: {
          token: DELIBERATE_LEAK_FIXTURES.stripe_live,
          pat: DELIBERATE_LEAK_FIXTURES.github_pat,
        },
      },
      extra: {
        Cookie: DELIBERATE_LEAK_FIXTURES.cookie,
        Authorization: DELIBERATE_LEAK_FIXTURES.bearer_token,
      },
    };
    const out = beforeSend(event);
    const serialised = JSON.stringify(out);
    for (const fixture of Object.values(DELIBERATE_LEAK_FIXTURES)) {
      expect(serialised).not.toContain(fixture);
    }
  });
});
