// apps/web/src/components/screens/canvas/canvas.flow.spec.ts
//
// Phase 1 / A2 — Playwright user-flow E2E for the Canvas screen.
// Verifies the auto-submit path: navigating to /generate?spec_url=... POSTs
// /api/v1/generate (handled by fixture-mode BFF) and redirects to
// /generate/[jobId].

import { expect, test } from '@playwright/test';

test('canvas auto-submits with ?spec_url and redirects to /generate/[jobId]', async ({
  page,
}) => {
  const specUrl = 'https://api.stripe.com/openapi.yaml';
  await page.goto(`/generate?spec_url=${encodeURIComponent(specUrl)}`);

  // Fixture-mode BFF returns a deterministic job_id within a few hundred ms.
  // Allow a generous budget — the redirect happens once the 202 is parsed.
  await page.waitForURL(/\/generate\/[A-Za-z0-9_:-]+(\/|$)/, {
    timeout: 30_000,
  });
  expect(page.url()).toMatch(/\/generate\/[A-Za-z0-9_:-]+/);
});
