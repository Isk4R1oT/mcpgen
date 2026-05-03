// apps/web/src/components/screens/preview/preview.flow.spec.ts
//
// Phase 1 — Agent A4 — Preview flow E2E.
//
// Verifies the primary navigation paths: continue → /generate?spec_url=...
// (refine spec) and discard → /generate/[jobId] (back to stream/canvas).

import { expect, test } from '@playwright/test';

const FIXTURE_JOB_ID = 'job_fixture_preview';
const SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json';

test('preview → continue · auth setup navigates to refine flow when spec_url is present', async ({
  page,
}) => {
  await page.goto(
    `http://localhost:3000/generate/${FIXTURE_JOB_ID}/preview?spec_url=${encodeURIComponent(
      SPEC_URL,
    )}`,
  );
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /continue · auth setup/i }).first().click();
  await page.waitForURL(/\/generate\?spec_url=/);
  expect(page.url()).toMatch(/spec_url=https/);
});

test('preview → discard navigates back to /generate/[jobId]', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB_ID}/preview`);
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^discard$/i }).first().click();
  await page.waitForURL(new RegExp(`/generate/${FIXTURE_JOB_ID}$`));
  expect(page.url()).toMatch(new RegExp(`/generate/${FIXTURE_JOB_ID}$`));
});
