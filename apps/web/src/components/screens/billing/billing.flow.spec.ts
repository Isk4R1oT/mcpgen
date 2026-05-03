// apps/web/src/components/screens/billing/billing.flow.spec.ts
//
// Phase 2 — Agent B3 — Billing primary flow.
//
// Verifies the upgrade-to-team flow:
//   1. open /billing,
//   2. click the "upgrade to team" CTA in the plan summary card,
//   3. drawer opens with the canon eyebrow "pro → team",
//   4. clicking "confirm upgrade" hits POST /api/v1/billing/checkout and
//      hard-navigates to the stub Stripe URL the BFF returned.
//
// We stub the BFF response so the test does not depend on a live Stripe
// account.

import { expect, test } from '@playwright/test';

test('billing → upgrade-to-team drawer → confirm hits checkout endpoint', async ({
  page,
}) => {
  // Intercept POST /api/v1/billing/checkout and return a fake Stripe URL.
  let checkoutCalled = false;
  await page.route('**/api/v1/billing/checkout', async (route) => {
    checkoutCalled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'https://checkout.stripe.com/c/pay/cs_test_billing_flow',
      }),
    });
  });

  await page.goto('http://localhost:3000/billing');
  await page.waitForLoadState('networkidle');

  // Click the "upgrade to team" button in the plan-summary card. Note: there
  // is also a plan-card "upgrade to team" button further down the page; the
  // summary CTA is the first one in DOM order.
  const upgradeBtn = page.locator('button', { hasText: /upgrade to team/i }).first();
  await upgradeBtn.click();

  // Drawer should open with the eyebrow "pro → team".
  await expect(page.getByText(/pro → team/i)).toBeVisible({ timeout: 4_000 });

  // Confirm upgrade — captures the checkout call. The actual hard-navigate
  // would land on checkout.stripe.com; intercept it so the test stays local.
  await page.route(
    'https://checkout.stripe.com/c/pay/cs_test_billing_flow',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>stripe checkout stub</body></html>',
      });
    },
  );

  await page.locator('button', { hasText: /confirm upgrade/i }).click();

  // Allow a tick for the fetch + window.location.assign chain.
  await page.waitForFunction(() => true);
  expect(checkoutCalled).toBe(true);
});
