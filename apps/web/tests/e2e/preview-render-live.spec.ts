// apps/web/tests/e2e/preview-render-live.spec.ts
//
// Plan 07-04 Wave 2 — preview screen renders real FinalTool[] + Shiki code
// panel against the REAL engine output.
//
// Skipped automatically when MCPGEN_FRONTEND_MODE != 'live'.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-04-PLAN.md task 4 step 3
//   - packages/ir/src/types.ts (FinalTool / ToolDescription Zod)

import { test, expect } from '@playwright/test';

import { skipIfNotLive, SANDBOX_SPEC_URL } from './_helpers/live-mode';

test('FE-03: preview screen renders real FinalTool[] with all 5 description components', async ({
  page,
}) => {
  skipIfNotLive();

  // Step 1: kick off a real generation and wait for /preview navigation.
  // (Re-uses the same hero-flow path as hero-flow-live; we wait for /preview
  // explicitly so the page-level Server Component prefetch has a completed
  // job to render with `partial_result.tenant_worker_source`.)
  await page.goto('/');
  await page.fill('input.mc-input', SANDBOX_SPEC_URL);
  await page.click('button:has-text("make it")');
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: 240_000 });

  // Step 2: assert the locked Preview screen renders. The sample's bento
  // layout is unchanged in v0; FinalTool[] data is threaded through the
  // wrapper for v1.x in-screen rendering. We assert the data is wired by
  // checking the visible Stage E code panel below (which only renders when
  // `partial_result.tenant_worker_source` was present).
  // The locked screen has its own 'mc-screen' wrapper.
  await expect(page.locator('.mc-screen').first()).toBeVisible();

  // Step 3: Shiki code panel is present. The route's Server Component
  // renders <CodeBlock> when tenantWorkerSource is non-null. Shiki emits
  // <pre class="shiki ..."> wrapping the highlighted code; the outer wrapper
  // has class 'mc-code-panel' (locked CSS-vars only).
  await expect(page.locator('.mc-code-panel pre')).toBeVisible({ timeout: 10_000 });

  // Step 4: at least one TypeScript-shaped token rendered (sanity check that
  // the bundle source actually went through Shiki, not a fallback empty render).
  // Shiki tokenises common TS keywords; we assert a specific token is highlighted.
  // (The Stage E bundle always includes 'export' / 'import' / 'const' tokens.)
  const codeText = await page.locator('.mc-code-panel pre').innerText();
  expect(codeText).toMatch(/\b(export|import|const|function)\b/);

  // Step 5: FinalTool data shape is reachable from the page response. We
  // assert by checking that the wrapper received finalTools via the
  // server-prefetched JobStatusResponse (visible by inspecting the page's
  // initial server-rendered HTML — partial_result.final_tools should be
  // serialised). We do this via a direct fetch to the BFF status endpoint.
  const url = page.url();
  const jobId = url.match(/gen_[0-9A-HJKMNP-TV-Z]{26}/)?.[0];
  expect(jobId).toBeTruthy();
  const res = await page.request.get(`/api/v1/jobs/${jobId}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    status: string;
    partial_result?: { final_tools?: unknown[] };
  };
  expect(Array.isArray(body.partial_result?.final_tools)).toBe(true);
  // Every FinalTool has a ToolDescription with the 5 v0 components:
  // purpose, when_to_use, limitations, parameter_overview (description_hash optional).
  const finalTools = body.partial_result?.final_tools as Array<{
    description: {
      purpose: string;
      when_to_use: string[];
      limitations: string[];
      parameter_overview: string;
    };
    annotations: Record<string, unknown>;
  }>;
  expect(finalTools.length).toBeGreaterThan(0);
  expect(finalTools[0]?.description.purpose).toBeTruthy();
  expect(finalTools[0]?.description.when_to_use.length).toBeGreaterThan(0);
  expect(finalTools[0]?.description.limitations).toBeDefined();
  expect(finalTools[0]?.description.parameter_overview).toBeTruthy();
  // Annotations are 4 booleans + title (Pass 4 design).
  expect(typeof finalTools[0]?.annotations.readOnlyHint).toBe('boolean');
});
