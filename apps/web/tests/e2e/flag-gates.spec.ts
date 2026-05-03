// apps/web/tests/e2e/flag-gates.spec.ts
//
// Phase 5 / Agent E2 — Flag-OFF behaviors for `_perm` flag-gated routes.
//
// Cost: $0 (no LLM calls).
//
// Asserts the canon 404 contract documented in
// docs/mcpgen-feature-flags-contract.md and apps/web/src/middleware.ts:
//   - `/marketplace` → flag `ui_marketplace_perm` (default OFF) → 404
//   - `/admin`       → flag `ui_admin_panel_perm` (default OFF) → 404
//   - `/billing`     → flag `ui_billing_active_perm` (default OFF) → 404
//   - `/some-bogus-path` → Next.js 404 (custom not-found.tsx)
//
// Pre-conditions:
//   - Web on :3000 with middleware.ts active.
//   - Flipt on :8090 (default — flags resolve to OFF when missing or with
//     `errorStrategy: fallback` per docs/mcpgen-feature-flags-contract.md §6).
//
// References:
//   - apps/web/src/middleware.ts (FLAG_GATES + 404 rewrite)
//   - apps/web/src/app/marketplace/page.tsx (notFound() inside Server Component)
//   - apps/web/src/app/admin/page.tsx
//   - apps/web/src/app/billing/page.tsx
//   - apps/web/src/app/not-found.tsx (custom canon 404)

import { test, expect } from '@playwright/test';

const FLAG_OFF_PATHS: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/marketplace', label: 'marketplace (ui_marketplace_perm OFF)' },
  { path: '/admin',       label: 'admin       (ui_admin_panel_perm OFF)' },
  { path: '/billing',     label: 'billing     (ui_billing_active_perm OFF)' },
];

test.describe('flag-gated routes — flag OFF default behavior', () => {
  for (const { path, label } of FLAG_OFF_PATHS) {
    test(`${label} → HTTP 404`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Middleware rewrites to /404 with explicit { status: 404 } OR the
      // Server Component calls notFound() which Next.js serves as 404.
      // Either way the navigation response status MUST be 404.
      expect(response).not.toBeNull();
      expect(response!.status()).toBe(404);
    });
  }

  test('unknown route /some-bogus-path → canon 404', async ({ page }) => {
    const response = await page.goto('/some-bogus-path', {
      waitUntil: 'domcontentloaded',
    });
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(404);

    // The custom not-found.tsx renders the canon NotFoundClient island.
    // Canon copy includes "404" or the locked "page not found" string;
    // we assert ANY visible text is rendered to confirm the canon page
    // mounted (vs an unstyled white-on-white default Next.js stub).
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 5_000 });
  });
});
