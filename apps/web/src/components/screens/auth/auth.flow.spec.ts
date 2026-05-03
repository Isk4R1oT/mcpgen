// apps/web/src/components/screens/auth/auth.flow.spec.ts
//
// Phase 2 / B1 — Playwright user-flow E2E for the BACKEND-AUTH probe screen.
//
// Verifies:
//   1. Type-switcher chips re-render the detection card (apikey → oauth shows
//      "connect with Stripe").
//   2. Continue · generate navigates back to /generate with the chosen
//      auth_mode + auth_type query params.
//   3. Back returns to /generate.

import { expect, test } from '@playwright/test';

test('auth: type-switcher chip flips detection panel', async ({ page }) => {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');

  // Default state shows API Key.
  await expect(page.getByText('API Key', { exact: true })).toBeVisible();

  // Click the OAuth chip ("D · oauth").
  await page.locator('button.mc-chip', { hasText: /D · oauth/i }).click();

  // Detection panel now shows OAuth + the OAuth-only "connect with Stripe"
  // CTA appears in its own card.
  await expect(
    page.locator('button', { hasText: /connect with Stripe/i }).first(),
  ).toBeVisible();
});

test('auth: continue navigates to /generate with auth_mode + auth_type', async ({
  page,
}) => {
  const specUrl = 'https://api.stripe.com/openapi.yaml';
  await page.goto(`/auth?spec_url=${encodeURIComponent(specUrl)}`);
  await page.waitForLoadState('networkidle');

  await page.locator('button', { hasText: /continue · generate/i }).click();

  await page.waitForURL(/\/generate\?/);
  const url = page.url();
  expect(url).toMatch(/auth_mode=passthrough/);
  expect(url).toMatch(/auth_type=apikey/);
  expect(url).toMatch(/spec_url=https/);
});

test('auth: back navigates to /generate', async ({ page }) => {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^back$/i }).click();
  await page.waitForURL(/\/generate(\?|$)/);
  expect(page.url()).toMatch(/\/generate(\?|$)/);
});
