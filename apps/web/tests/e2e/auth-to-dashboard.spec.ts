// apps/web/tests/e2e/auth-to-dashboard.spec.ts
//
// Phase 5 / Agent E2 — Logto sign-in path.
//
// Cost: $0 (no LLM calls).
//
// We do NOT exercise the full Logto OAuth round-trip — that would need a
// staging Logto tenant + real test creds. Instead we verify the redirect
// chain initiated by `/dashboard` reaches Logto's hosted sign-in page
// (HTTP 200) so the application's auth gate is wired correctly.
//
// Pre-conditions: web on :3000 + middleware.ts with /dashboard guard +
// LOGTO_ENDPOINT in apps/web/.env.local.
//
// References:
//   - apps/web/src/middleware.ts (`isProtectedPath('/dashboard')` → redirect)
//   - apps/web/src/app/dashboard/page.tsx (belt-and-suspenders Logto check)
//   - apps/web/src/app/api/auth/logto/sign-in/route.ts (signIn redirect)

import { test, expect } from '@playwright/test';

const LOGTO_ENDPOINT_REGEX = /\.logto\.app|logto-cloud\./;

test.describe('auth → dashboard redirect chain', () => {
  test('/dashboard (anon) → middleware redirect → Logto sign-in page (HTTP 200)', async ({
    page,
  }) => {
    // Hit /dashboard cold. The middleware's isProtectedPath() guard fires the
    // redirect chain:
    //   /dashboard
    //     → 307 → /api/auth/logto/sign-in?redirect_to=/dashboard
    //     → 307 → https://<tenant>.logto.app/oidc/auth?…    (signIn redirects)
    //     → 200 → Logto hosted sign-in page (final landing)
    //
    // Playwright follows redirects automatically. We assert:
    //   1. Final URL is on the Logto domain.
    //   2. Final response is HTTP 200 (the sign-in page rendered).
    const response = await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
    });

    // Some browsers (and Playwright in CI) report `null` for the navigation
    // response when redirected cross-origin; in that case we still verify
    // the URL is on Logto. Both branches are accepted as success.
    if (response !== null) {
      expect(response.status()).toBe(200);
    }

    // Final URL must be a Logto sign-in / OIDC auth page.
    expect(page.url()).toMatch(LOGTO_ENDPOINT_REGEX);

    // Logto's hosted sign-in renders an email/password form. We assert the
    // page is functional (not a network/error page) by checking for ANY
    // visible <input> on the page — Logto Cloud's UI guarantees this.
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10_000 });
  });

  test('/api/auth/logto/sign-in (direct) → Logto OIDC auth (HTTP 200 final)', async ({
    page,
  }) => {
    // Same shape, but exercises the kickoff route directly. Useful when the
    // dashboard page Server Component shell short-circuits the middleware.
    const response = await page.goto('/api/auth/logto/sign-in', {
      waitUntil: 'domcontentloaded',
    });

    if (response !== null) {
      expect(response.status()).toBe(200);
    }
    expect(page.url()).toMatch(LOGTO_ENDPOINT_REGEX);
  });
});
