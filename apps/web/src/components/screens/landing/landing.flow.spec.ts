// apps/web/src/components/screens/landing/landing.flow.spec.ts
//
// Phase 1 / Agent A1 — Landing primary-CTA flow.
//
// The hero CTA must:
//   1. Pass the trimmed URL via `?spec_url=` to /generate (canvas screen
//      reads it and auto-submits — that contract is owned by Agent A2).
//   2. URL-encode the value (so '?' / '&' / etc. survive intact).
//
// We DO NOT exercise the BFF here — the canvas page is responsible for
// firing the Idempotency-Key + POST /api/v1/generate flow. This spec
// only verifies the navigation contract.
//
// The web server is already running on :3000 (per Phase-1 brief).

import { expect, test } from '@playwright/test';

test('landing → /generate?spec_url=… (primary CTA routes with encoded URL)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');

  // Block downstream /generate fetches so the canvas auto-submit doesn't
  // bounce us off the page before we can assert the URL — we only care
  // about the route segment.
  await page.route('**/api/v1/generate', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'gen_test', sse_url: 'about:blank' }),
    });
  });

  const specUrl = 'https://petstore3.swagger.io/api/v3/openapi.json';
  await page.locator('.mc-stamp input.mc-input').fill(specUrl);
  await page.locator('button', { hasText: /make it/i }).click();

  await page.waitForURL(/\/generate\?spec_url=/, { timeout: 5_000 });

  const url = new URL(page.url());
  expect(url.pathname).toBe('/generate');
  expect(url.searchParams.get('spec_url')).toBe(specUrl);
});

test('landing → /generate (CTA with empty input routes to /generate without query)', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');

  await page.route('**/api/v1/generate', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'gen_test', sse_url: 'about:blank' }),
    });
  });

  await page.locator('button', { hasText: /make it/i }).click();
  await page.waitForURL(/\/generate(\?|$)/, { timeout: 5_000 });
  const url = new URL(page.url());
  expect(url.pathname).toBe('/generate');
  expect(url.searchParams.get('spec_url')).toBeNull();
});
