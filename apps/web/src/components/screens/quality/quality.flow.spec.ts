// apps/web/src/components/screens/quality/quality.flow.spec.ts
//
// Phase 1 — Agent A4 — Quality flow E2E.
//
// Verifies primary navigation: continue → /generate/[jobId]/playground
// and back → /generate/[jobId]/preview.

import { expect, test } from '@playwright/test';

const FIXTURE_JOB_ID = 'job_fixture_quality';

test('quality → looks good · deploy navigates to /playground (via auth redirect)', async ({
  page,
}) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB_ID}/quality`);
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /looks good · deploy/i }).first().click();
  // /playground is auth-gated by middleware (D-01). Anon users get a 307 to
  // Logto sign-in. The flow test asserts navigation was attempted to
  // /playground OR the redirect was issued — either is "navigation success".
  await page.waitForURL(/playground|logto\.app|sign-in/, { timeout: 15_000 });
  const url = page.url();
  expect(
    url.includes('/playground') ||
      url.includes('logto.app') ||
      url.includes('/sign-in'),
  ).toBe(true);
});

test('quality → back to canvas navigates to /preview', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB_ID}/quality`);
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /back to canvas/i }).first().click();
  await page.waitForURL(new RegExp(`/generate/${FIXTURE_JOB_ID}/preview$`));
  expect(page.url()).toMatch(new RegExp(`/generate/${FIXTURE_JOB_ID}/preview$`));
});
