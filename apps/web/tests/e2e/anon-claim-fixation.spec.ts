// apps/web/tests/e2e/anon-claim-fixation.spec.ts
//
// Phase 09.1 plan 11 — T-9.1-claim session-fixation regression at the E2E layer.
//
// Threat scenario (CONTEXT D-04 + RESEARCH §1):
//   An attacker pre-sets `mcpgen_anon_session=<ATTACKER_ULID>` on the victim's
//   browser before the victim ever visits mcpgen. Without mitigation the
//   victim's anon generation rows would be linked to the attacker's session
//   ID; once the attacker logs in (separately) and POSTs /claim_generation
//   with their planted cookie, they would inherit the victim's gens.
//
// Mitigation (plan 09.1-03):
//   GET / detects "cold-start landing" via Referer heuristic (no Referer or
//   off-origin Referer => rotate). On cold-start the BFF re-issues a fresh
//   ULID via Set-Cookie regardless of the planted cookie value. The victim's
//   subsequent POSTs use the fresh ULID; the attacker's planted ULID is
//   never associated with any data.
//
// This file pins the mitigation at the full-stack layer (the unit-level
// regression lives in apps/api/tests/anon-session-fixation.test.ts).
//
// Tests:
//   1. Fixation regression — attacker pre-sets cookie; victim cold-start
//      landing rotates the cookie to a fresh ULID; victim's claim flow
//      writes the victim's NEW session, not the attacker's planted one;
//      attacker context never sees the victim's data.
//   2. Malformed cookie validation — when the cookie value is not a valid
//      26-char Crockford-base32 ULID, GET / re-issues a fresh ULID
//      (defense vs cookie-pollution attempts).
//
// Gating:
//   - `RUN_E2E=1` mandatory (Phase 9 OPS-02 nightly pattern).
//   - Tests use real isolated `browser.newContext()` instances so each
//     side has independent cookie jars (matches a real attacker + victim
//     who use different machines/profiles).
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-04
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §1
//   - apps/api/src/lib/anon-session.ts (ensureAnonSession + isColdStartLanding)
//   - apps/api/tests/anon-session-fixation.test.ts (analog at unit level)
//
// Threat ID T-9.1-claim — referenced inline so a regression search by
// `git grep T-9.1-claim` reaches this file.

import { test, expect } from '@playwright/test';

const RUN_E2E = process.env['RUN_E2E'] === '1';
const ANON_COOKIE_NAME = 'mcpgen_anon_session';
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// 26-char Crockford-base32 ULID — synthetic but format-valid so the
// re-issue gate cannot lazily reject "obviously fake" values; it MUST
// re-issue based on Referer heuristic alone (cold-start landing) per
// plan 09.1-03 task 2.
const ATTACKER_FAKE_ULID = '01HXFAKE000000000000000000';
// Above is 26 chars and matches the alphabet — verify defensively at runtime.

const SPEC_URL =
  process.env['MCPGEN_E2E_SPEC_URL'] ??
  'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';

test.describe('T-9.1-claim: session-fixation regression', () => {
  test.skip(!RUN_E2E, 'requires RUN_E2E=1 (nightly + pre-merge gate)');

  test.beforeAll(() => {
    // Defensive — guard against accidental edits that break the ULID format
    // assumption (the test would silently degrade if the planted value is
    // already invalid because GET / would re-issue for malformed-cookie
    // reasons rather than the cold-start-landing reason).
    expect(ATTACKER_FAKE_ULID).toMatch(ULID_REGEX);
    expect(ATTACKER_FAKE_ULID.length).toBe(26);
  });

  test('fixation regression — attacker-planted cookie does NOT survive victim cold-start landing', async ({
    browser,
    baseURL,
  }) => {
    // ── Step 1: attacker sets up their own context. Their cookie jar gets
    // the planted ATTACKER_FAKE_ULID (this represents the attacker having
    // created a valid anon session on their own machine; they will later
    // try to claim victim's gens with this same value).
    const attackerContext = await browser.newContext();
    const origin = baseURL ?? 'http://localhost:3000';
    const url = new URL(origin);
    await attackerContext.addCookies([
      {
        name: ANON_COOKIE_NAME,
        value: ATTACKER_FAKE_ULID,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: url.hostname,
      },
    ]);

    // ── Step 2: simulate the social-engineering vector — attacker tricks
    // the victim's browser into adopting the same cookie. Real-world this
    // would be e.g. a subdomain-set cookie or an XSS injection; for the
    // E2E we model it directly via context.addCookies on the victim side.
    const victimContext = await browser.newContext();
    await victimContext.addCookies([
      {
        name: ANON_COOKIE_NAME,
        value: ATTACKER_FAKE_ULID,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: url.hostname,
      },
    ]);

    // Sanity: both contexts currently hold the planted value.
    const attackerCookiesPre = await attackerContext.cookies();
    const victimCookiesPre = await victimContext.cookies();
    expect(
      attackerCookiesPre.find((c) => c.name === ANON_COOKIE_NAME)?.value,
    ).toBe(ATTACKER_FAKE_ULID);
    expect(victimCookiesPre.find((c) => c.name === ANON_COOKIE_NAME)?.value).toBe(
      ATTACKER_FAKE_ULID,
    );

    // ── Step 3: victim does a cold-start landing visit (no Referer, or
    // off-origin Referer). Playwright's `page.goto` fires GET / with no
    // Referer by default — the BFF GET / handler runs ensureAnonSession
    // with `forceReissue: isColdStartLanding(c) === true` and rotates.
    const victimPage = await victimContext.newPage();
    await victimPage.goto('/');

    // ── Step 4: assert the victim's cookie is NOT the attacker's planted ULID.
    const victimCookiesPost = await victimContext.cookies();
    const victimCookiePost = victimCookiesPost.find(
      (c) => c.name === ANON_COOKIE_NAME,
    );
    expect(victimCookiePost).toBeDefined();
    expect(victimCookiePost!.value).not.toBe(ATTACKER_FAKE_ULID);
    expect(victimCookiePost!.value).toMatch(ULID_REGEX);
    expect(victimCookiePost!.httpOnly).toBe(true);

    // ── Step 5: victim runs an anon generation. The /generate POST carries
    // the FRESH cookie (per fetch credentials='include' default same-origin),
    // not the attacker's planted ULID. The anonymous_generations row gets
    // anon_session_id = victim's fresh ULID.
    await victimPage.fill('input.mc-input', SPEC_URL);
    await victimPage.click('button:has-text("make it")');
    await victimPage.waitForURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}/, {
      timeout: 30_000,
    });

    // Capture the cookie used for the POST (Playwright's request capture is
    // the cleanest way to assert this without log scraping).
    const cookiesAfterGen = await victimContext.cookies();
    const cookieAfterGen = cookiesAfterGen.find(
      (c) => c.name === ANON_COOKIE_NAME,
    );
    expect(cookieAfterGen!.value).not.toBe(ATTACKER_FAKE_ULID);

    // ── Step 6: attacker tries to claim with their planted cookie. They
    // need a valid Logto JWT to clear authMiddleware (claim is a protected
    // route). Without one they cannot even reach the claim handler — so
    // even if the cookie path were vulnerable, the auth gate stops them.
    // We exercise the no-JWT branch here because it is the realistic
    // attacker scenario (they don't have victim's Logto session).
    const attackerPage = await attackerContext.newPage();
    const attackerClaimResp = await attackerPage.request.post(
      '/api/v1/claim_generation',
      {
        headers: {
          // Deliberately omit Authorization — modeling an attacker who has
          // the planted cookie but no Logto JWT.
          'Content-Type': 'application/json',
          Origin: origin,
        },
      },
    );
    expect(attackerClaimResp.status()).toBe(401);

    // ── Step 7: attacker's planted ULID was never bound to any data
    // (because the victim's cold-start rotated to a different ULID before
    // any /generate POST). Even if the attacker eventually obtains a Logto
    // JWT they will only claim their OWN (zero) anonymous_generations rows.
    // We can't directly assert the DB state from the test process; the
    // unit-level regression test (apps/api/tests/anon-session-fixation.test.ts
    // and apps/api/tests/integration/claim-flow-e2e.test.ts) covers that.
    // The E2E layer's contribution is proving the cookie rotation
    // happens before the first writable POST — Steps 4 + 5 above.

    await attackerContext.close();
    await victimContext.close();
  });

  test('malformed cookie validation — invalid value triggers re-issue with valid ULID', async ({
    browser,
    baseURL,
  }) => {
    // RESEARCH §1 / plan 09.1-03 task 2 (cookie shape test 5): a malformed
    // cookie value (not a 26-char Crockford-base32 ULID) is treated as
    // missing and a fresh value is minted. Defends against
    // (a) cookie-pollution attempts where the attacker injects a
    //     prototype-pollution-shaped value,
    // (b) bit-flip corruption from caching proxies,
    // (c) value rotation from a separate browser session.
    const ctx = await browser.newContext();
    const origin = baseURL ?? 'http://localhost:3000';
    const url = new URL(origin);

    await ctx.addCookies([
      {
        name: ANON_COOKIE_NAME,
        value: 'BADBADBAD', // intentionally not 26 chars and not the ULID alphabet
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: url.hostname,
      },
    ]);

    const page = await ctx.newPage();
    await page.goto('/');

    // Cookie has been re-issued via Set-Cookie on the GET / response.
    const cookiesPost = await ctx.cookies();
    const cookiePost = cookiesPost.find((c) => c.name === ANON_COOKIE_NAME);
    expect(cookiePost).toBeDefined();
    expect(cookiePost!.value).not.toBe('BADBADBAD');
    expect(cookiePost!.value).toMatch(ULID_REGEX);

    await ctx.close();
  });
});
