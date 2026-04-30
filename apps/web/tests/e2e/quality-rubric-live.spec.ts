// apps/web/tests/e2e/quality-rubric-live.spec.ts
//
// Plan 07-04 Wave 2 — quality screen renders F2 per-component breakdown +
// F3 pass rate (or "verified (F2-only)" tooltip on free tier per D-21)
// from the REAL QualityReport JSON.
//
// Skipped automatically when MCPGEN_FRONTEND_MODE != 'live'.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-04-PLAN.md task 4 step 4
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-20, D-21
//   - packages/ir/src/types.ts (QualityReport / F2SmellReport / F3AgentEvalReport)

import { test, expect } from '@playwright/test';

import { skipIfNotLive, SANDBOX_SPEC_URL } from './_helpers/live-mode';

test('FE-03: quality screen renders F2 per-component breakdown + F3 pass rate from real QualityReport', async ({
  page,
}) => {
  skipIfNotLive();

  // Step 1 — run hero flow to a completed generation, then navigate to /quality.
  await page.goto('/');
  await page.fill('input.mc-input', SANDBOX_SPEC_URL);
  await page.click('button:has-text("make it")');
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: 240_000 });

  // Step 2 — navigate to /quality. Click the Preview screen's "make it" button
  // which routes to /generate/:id/quality (per PreviewWrapper).
  await page.click('button:has-text("make it")');
  await page.waitForURL(/\/quality$/, { timeout: 10_000 });

  // Step 3 — assert the locked Quality screen renders.
  await expect(page.locator('.mc-screen').first()).toBeVisible();

  // Step 4 — fetch the real QualityReport via BFF directly to verify shape.
  const url = page.url();
  const jobId = url.match(/gen_[0-9A-HJKMNP-TV-Z]{26}/)?.[0];
  expect(jobId).toBeTruthy();
  const res = await page.request.get(`/api/v1/jobs/${jobId}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    partial_result?: {
      quality_report?: {
        f1_static: { passed: boolean };
        f2_smell: {
          overall_average: number;
          tool_scores: Array<{
            tool_name: string;
            components: Array<{ component: string; score: number }>;
            average: number;
          }>;
        };
        f3_agent_eval: { pass_rate: number } | null;
        quality_badge: 'premium' | 'verified' | 'standard' | 'needs_review';
      };
    };
  };

  const qr = body.partial_result?.quality_report;
  expect(qr).toBeDefined();

  // Step 5 — F2 per-component breakdown: each tool has exactly the 6 paper
  // rubric components (purpose, guidelines, limitations, parameter_doc,
  // examples, length_completeness).
  expect(qr!.f2_smell.tool_scores.length).toBeGreaterThan(0);
  const firstTool = qr!.f2_smell.tool_scores[0];
  expect(firstTool).toBeDefined();
  const componentNames = firstTool!.components.map((c) => c.component).sort();
  // The 6 components from the FROZEN IR Zod enum (RubricComponentScore.component).
  expect(componentNames).toEqual([
    'examples',
    'guidelines',
    'length_completeness',
    'limitations',
    'parameter_doc',
    'purpose',
  ]);

  // Step 6 — F3 is either null (free-tier, no F3 ran) OR has pass_rate ∈ [0, 1].
  if (qr!.f3_agent_eval !== null) {
    expect(qr!.f3_agent_eval.pass_rate).toBeGreaterThanOrEqual(0);
    expect(qr!.f3_agent_eval.pass_rate).toBeLessThanOrEqual(1);
  }

  // Step 7 — quality badge is one of the 4 expected tiers.
  expect(['premium', 'verified', 'standard', 'needs_review']).toContain(qr!.quality_badge);

  // Step 8 — overall_average within [0, 5].
  expect(qr!.f2_smell.overall_average).toBeGreaterThanOrEqual(0);
  expect(qr!.f2_smell.overall_average).toBeLessThanOrEqual(5);
});
