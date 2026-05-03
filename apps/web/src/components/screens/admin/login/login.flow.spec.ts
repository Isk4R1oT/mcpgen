// apps/web/src/components/screens/admin/login/login.flow.spec.ts
//
// Phase 3 / C4-login — Playwright user-flow E2E.
//
// Verifies the canon SSO → MFA → success → /admin redirect:
//   1. Default render shows the SSO stage with the staff badge + Okta CTA.
//   2. Clicking "continue with okta" advances to the MFA stage.
//   3. Entering the dev-mock 6-digit code (`123456`) and submitting
//      transitions to the success stage and routes to `/admin`.

import { expect, test } from '@playwright/test';

test('admin-login: SSO stage renders with staff badge + Okta CTA', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByText('staff only · not a customer area'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /sign in to ops/i })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /continue with okta/i }),
  ).toBeVisible();
});

test('admin-login: SSO advances to MFA after clicking continue with okta', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /continue with okta/i }).click();
  // Canon delays the stage flip by 280ms.
  await expect(
    page.getByRole('heading', { name: /second factor/i }),
  ).toBeVisible();
});

test('admin-login: full SSO → MFA → success flow redirects to /admin', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /continue with okta/i }).click();
  await expect(
    page.getByRole('heading', { name: /second factor/i }),
  ).toBeVisible();

  // Type the dev-mock 6-digit code.
  await page.getByLabel(/authenticator code/i).fill('123456');
  await page.getByRole('button', { name: /start session/i }).click();

  // Success card appears, then the screen redirects to /admin.
  await expect(
    page.getByRole('heading', { name: /session opened/i }),
  ).toBeVisible();
  await page.waitForURL(/\/admin(\/?$|\?)/, { timeout: 5000 });
  expect(page.url()).toMatch(/\/admin(\/?$|\?)/);
});
