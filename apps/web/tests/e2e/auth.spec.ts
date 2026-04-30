// apps/web/tests/e2e/auth.spec.ts — Plan 07-02 FE-01 e2e.
//
// Asserts /sign-in + /sign-up render the locked AuthScreen and the wrapper
// kicks off the Logto flow by navigating to /api/auth/logto/{sign-in|sign-up}.
// We do NOT exercise the full Logto OAuth round-trip in this test — that
// requires real Logto Cloud creds; Phase 9 wires the smoke test against a
// staging tenant. Here we only assert the kickoff link path.
//
// Reference: .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-17 / D-19.

import { test, expect } from '@playwright/test';

test('FE-01: /sign-in renders locked AuthScreen and Logto kickoff hits /api/auth/logto/sign-in', async ({
  page,
}) => {
  // Stub /api/auth/logto/sign-in to fulfil with 307 → / so the test doesn't
  // need real Logto Cloud creds. We capture the request to assert the path.
  const requests: string[] = [];
  await page.route('**/api/auth/logto/sign-in*', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 307,
      headers: { Location: '/' },
      body: '',
    });
  });

  await page.goto('/sign-in');

  // The locked screen-auth.jsx has a "continue · generate" CTA in the right
  // pane. The wrapper rebinds onContinue to the Logto kickoff. Click it.
  await page.click('button:has-text("continue")');

  await expect.poll(() => requests.length, { timeout: 5_000 }).toBeGreaterThan(0);
  expect(requests[0]).toMatch(/\/api\/auth\/logto\/sign-in/);
  expect(requests[0]).toContain('redirect_to=');
});

test('FE-01: /sign-up renders the same AuthScreen with mode=sign-up and hits /api/auth/logto/sign-up', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/auth/logto/sign-up*', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 307,
      headers: { Location: '/' },
      body: '',
    });
  });

  await page.goto('/sign-up');

  await page.click('button:has-text("continue")');

  await expect.poll(() => requests.length, { timeout: 5_000 }).toBeGreaterThan(0);
  expect(requests[0]).toMatch(/\/api\/auth\/logto\/sign-up/);
});
