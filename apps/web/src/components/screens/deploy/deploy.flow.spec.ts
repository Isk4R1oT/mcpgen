// apps/web/src/components/screens/deploy/deploy.flow.spec.ts
//
// Phase 1 / Agent A5 — Deploy primary user-flow.
//
// Asserts:
//   1. The 4 deployment targets render (cloud / cf / docker / src).
//   2. Clicking "deploy" submits to the BFF (we observe the submit button
//      becomes disabled / re-renders the deploying branch).

import { expect, test } from '@playwright/test';

const FIXTURE_JOB = 'job-fixture-deploy';

test('deploy renders 4 deployment targets + 2 auth modes', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/deploy`);
  await page.waitForLoadState('networkidle');

  const targets = page.locator('[data-target]');
  await expect(targets.first()).toBeVisible();
  await expect(targets).toHaveCount(4);

  const authOptions = page.locator('[data-auth]');
  await expect(authOptions).toHaveCount(2);
});

test('deploy submit transitions to deploying / success branch', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/deploy`);
  await page.waitForLoadState('networkidle');

  const submit = page.getByRole('button', { name: /^deploy$/i }).last();
  await submit.click();

  // After click, EITHER the deploying branch shows, OR the BFF answered
  // immediately and we navigated to ?deployed=1. Both are acceptable.
  await expect
    .poll(
      async () => {
        const url = page.url();
        const text = await page.textContent('body');
        return url.includes('deployed=1') || /shipping it|it's live/i.test(text ?? '');
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});
