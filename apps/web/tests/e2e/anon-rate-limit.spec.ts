// apps/web/tests/e2e/anon-rate-limit.spec.ts
//
// Phase 09.1 plan 11 — D-02 1/IP/24h anonymous rate-limit regression.
//
// Locks three behaviors at the E2E layer (the unit-level coverage lives in
// apps/api/tests/anon-rate-limit.test.ts; this file pins the same contract
// against the real Hono app + Postgres so a regression in middleware
// composition or route mounting does not slip through):
//
//   1. Overage 429 — second `POST /api/v1/generate` from the same simulated
//      public IP within 24h returns HTTP 429 with body
//      `{ error: 'anon_rate_limit', message: ..., signup_url: '/sign-up' }`.
//   2. Localhost bypass — five sequential POSTs from CF-Connecting-IP=127.0.0.1
//      all return 202 (D-02 founder + CI bypass). Per plan 09.1-05 the
//      bypass list also covers ::1, 10.0.0.0/8, 192.168.0.0/16; we exercise
//      the IPv4 loopback because that is the canonical CI signal.
//   3. UI surfacing — when the BFF returns 429 the landing-page error
//      surface contains "Sign up for 5/month free" (the canonical message
//      shipped by `apps/api/src/middleware/anon-rate-limit.ts` line 144).
//
// Gating:
//   - `RUN_E2E=1` mandatory (Phase 9 OPS-02 nightly pattern).
//   - Tests 1 + 2 hit the BFF directly (page.request) so they do not require
//     `MCPGEN_FRONTEND_MODE=live` to exercise the middleware contract; the
//     web webserver is not in the path. They DO require a running BFF on
//     :8787 (set MCPGEN_BFF_URL env var if non-default).
//   - Test 3 needs the web webserver in fixture mode (default) — it stubs
//     the /api/v1/generate response to 429 and asserts the error UI.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-02 + D-11
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §5
//   - apps/api/src/middleware/anon-rate-limit.ts (response shape)
//   - apps/api/tests/anon-rate-limit.test.ts (analog at unit level)

import { test, expect } from '@playwright/test';

const RUN_E2E = process.env['RUN_E2E'] === '1';
const BFF_URL = process.env['MCPGEN_BFF_URL'] ?? 'http://localhost:8787/api/v1';
const SPEC_URL =
  process.env['MCPGEN_E2E_SPEC_URL'] ??
  'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';

// Helper — submit a generate request directly to the BFF with a forced IP.
// CF-Connecting-IP is the canonical header (apps/api/src/lib/anon-ip-hash.ts
// extractRawIp); x-forwarded-for is the local-dev fallback. We send both so
// the test works in either environment without branching.
async function submitGenerate(
  request: import('@playwright/test').APIRequestContext,
  forcedIp: string,
  cookieHeader?: string,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': forcedIp,
    'x-forwarded-for': forcedIp,
  };
  if (cookieHeader !== undefined) headers['Cookie'] = cookieHeader;

  const res = await request.post(`${BFF_URL}/generate`, {
    headers,
    data: { spec_url: SPEC_URL },
  });
  const status = res.status();
  let body: Record<string, unknown> = {};
  const ct = res.headers()['content-type'] ?? '';
  if (ct.includes('application/json')) {
    body = (await res.json()) as Record<string, unknown>;
  } else {
    body = { _text: await res.text() };
  }
  return { status, body, headers: res.headers() };
}

test.describe('ANON-02: 1/IP/24h anonymous rate limit', () => {
  test.skip(!RUN_E2E, 'requires RUN_E2E=1 (nightly + pre-merge gate)');

  test('overage — second POST /generate from same public IP within 24h returns 429 anon_rate_limit', async ({
    request,
  }) => {
    // Use a unique public IP per test run so the rate-limit log does not
    // pre-poison the gate. RFC 5737 documentation range 203.0.113.0/24 —
    // safe to use as test fixtures.
    const testIp = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;

    const first = await submitGenerate(request, testIp);
    expect(first.status).toBe(202);

    const second = await submitGenerate(request, testIp);
    expect(second.status).toBe(429);
    expect(second.body['error']).toBe('anon_rate_limit');
    expect(second.body['signup_url']).toBe('/sign-up');
    // Message text is product copy — assert presence of the signup nudge.
    expect(String(second.body['message'] ?? '')).toMatch(/sign up/i);
  });

  test('localhost bypass — 5 POSTs from 127.0.0.1 all return 202 (D-02 founder/CI bypass)', async ({
    request,
  }) => {
    for (let i = 0; i < 5; i++) {
      const res = await submitGenerate(request, '127.0.0.1');
      expect(
        res.status,
        `POST #${i + 1} from localhost should bypass anon rate limit`,
      ).toBe(202);
    }
  });

  test('UI surfacing — 429 from BFF renders "Sign up for 5/month free" on landing', async ({
    page,
    context,
  }) => {
    // Stub the BFF response to 429 to exercise the error UI deterministically.
    // The web Route Handler at apps/web/src/app/api/v1/generate/route.ts
    // forwards the status + body verbatim in live mode; in fixture mode it
    // surfaces an internal stub. We intercept at both layers to be robust.
    const ratelimitBody = {
      error: 'anon_rate_limit',
      message:
        'Anonymous tier limited to 1 generation per 24 hours. Sign up for 5/month free.',
      signup_url: '/sign-up',
    };

    await context.route('**/api/v1/generate', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify(ratelimitBody),
      });
    });

    await page.goto('/');
    await page.fill('input.mc-input', SPEC_URL);
    await page.click('button:has-text("make it")');

    // The locked global.css scopes our error div via [role="alert"].mc-mono
    // (Phase 7 plan 02 pattern — see landing-submit.spec.ts test 2). Assert
    // that the "Sign up for 5/month free" copy bubbles up from the BFF
    // rate-limit body into the visible error surface.
    await expect(page.locator('[role="alert"].mc-mono')).toContainText(
      /sign up for 5\/month free/i,
      { timeout: 10_000 },
    );
  });
});
