// apps/web/src/components/screens/admin/broadcast/broadcast.flow.spec.ts
//
// Phase 3 / C4-broadcast — Playwright user-flow E2E for the
// `/admin/broadcast` route.
//
// Two scenarios:
// 1. Default (`ui_admin_panel_perm=OFF`) → route returns 404. The admin
//    surface is invisible to end users until the flag flips.
// 2. Flag ON + admin role + fixture mode → opening "request approval"
//    surfaces the approval modal heading. This branch only runs when
//    the harness is configured for admin fixtures; otherwise it is
//    skipped so the suite doesn't flake against an unauthenticated
//    dev server.

import { expect, test } from '@playwright/test';

test('admin broadcast hidden when ui_admin_panel_perm=OFF (default)', async ({
  page,
}) => {
  const response = await page.goto('/admin/broadcast', {
    waitUntil: 'commit',
  });
  if (response === null) {
    // No response (e.g. proxy intercepted) — at least confirm we did not
    // land on the broadcast composer heading.
    expect(page.url()).not.toMatch(/\/admin\/broadcast$/);
    return;
  }
  // With the flag OFF the page should 404 (notFound()) OR the
  // unauthenticated path redirects to /admin/login. Either is acceptable
  // and confirms the surface is not exposed.
  const status = response.status();
  if (status === 404) {
    expect(status).toBe(404);
    return;
  }
  // Otherwise we expect a redirect into the admin login flow.
  expect(page.url()).toMatch(/\/admin\/login|logto|sign-in/i);
});

test('admin broadcast → request approval opens modal (flag on, admin role)', async ({
  page,
}) => {
  // Skip unless an env hint indicates fixture-mode admin auth is present.
  // The harness sets MCPGEN_FRONTEND_MODE=fixtures + a fixture admin
  // session for visual lock; outside that we skip rather than flake.
  if (process.env.MCPGEN_FRONTEND_MODE !== 'fixtures') {
    test.skip(
      true,
      'admin flow E2E requires MCPGEN_FRONTEND_MODE=fixtures + admin session',
    );
    return;
  }

  const response = await page.goto('/admin/broadcast', {
    waitUntil: 'networkidle',
  });
  if (response !== null && response.status() === 404) {
    test.skip(true, 'ui_admin_panel_perm=OFF in this env');
    return;
  }

  // Header CTA → opens the approval modal (canon `mc-modal-veil`).
  await page
    .locator('button', { hasText: /^request approval$/i })
    .first()
    .click();
  await expect(
    page.locator('text=/request approval to send/i').first(),
  ).toBeVisible();
  await expect(
    page.locator('text=/pick 2nd approver/i').first(),
  ).toBeVisible();
});
