// apps/web/src/components/screens/stream/stream.flow.spec.ts
//
// Phase 1 Agent A3 — Playwright flow test. Stream renders progress for a
// known job_id and SSE-driven completion eventually navigates to /preview.
//
// Strategy: rely on `MCPGEN_FRONTEND_MODE=fixtures` (set by playwright.config
// webServer) — the fixture SSE timeline emits ~9 stages × 1.5–3s and ends
// with a `completed` event that the wrapper hook converts into onDone() →
// router.push(/preview). 60s budget per docs/mcpgen-ux-flow.md "60-second
// hero flow".

import { expect, test } from '@playwright/test';

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA1';

test('stream renders the canon log + transitions to /preview on completion', async ({
  page,
}) => {
  await page.goto(`http://localhost:3000/generate/${TEST_JOB_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // Canon log skeleton always renders — visible by step labels.
  await expect(page.getByText('parsed openapi spec')).toBeVisible();
  await expect(page.getByText('finalizing typescript module')).toBeVisible();

  // The cancel CTA wires through to the top bar.
  await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();

  // SSE-driven terminal completion → /preview within the 60s hero-flow budget.
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: 60_000 });
});
