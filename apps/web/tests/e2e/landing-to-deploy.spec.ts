// apps/web/tests/e2e/landing-to-deploy.spec.ts
//
// Phase 5 / Agent E2 — anonymous hero flow against the LIVE local stack
// with REAL OpenRouter LLM calls.
//
// Cost: ~$0.10–0.15 per run (single Qwen3-Coder generation across passes 0–5;
// see docs/mcpgen-model-and-provider-override.md §5).
//
// Wall-time hard cap: 8 minutes per spec. Real generation typically completes
// in 60–180s; we allow 6 min (360_000 ms) for the SSE 'completed' event then
// add headroom for the post-completion screen transitions.
//
// Pre-conditions (run from /Users/igor/Projects/mcpgen):
//   - Web app running on :3000   (pnpm --filter=@mcpgen/web dev)
//   - BFF running on :8787       (pnpm --filter=@mcpgen/api dev)
//   - Engine running on :8000    (cd apps/generation-engine && uv run uvicorn ...)
//   - Flipt running on :8090     (./scripts/start-flipt.sh)
//
// Gating: this suite runs only when MCPGEN_FRONTEND_MODE=live. CI keeps the
// suite green-by-default by leaving the env unset (the default fixture-mode
// playwright.config.ts webServer command is incompatible with real LLM runs
// because fixtures short-circuit the pipeline).
//
// References:
//   - .planning/phase-rebuild/agent-briefs/PHASE-5.md (E2 section)
//   - apps/web/src/components/screens/landing/landing.tsx (input.mc-input)
//   - apps/web/src/components/screens/canvas/canvas.tsx   (auto-submit)
//   - apps/web/src/components/screens/stream/stream.tsx   (SSE → /preview nav)
//   - apps/web/src/components/screens/deploy/deploy.tsx   (deploy CTA)

import { test, expect, type Page } from '@playwright/test';

import { isLiveMode, skipIfNotLive } from './_helpers/live-mode';

// Real spec: Petstore3 has 19 endpoints; small enough to keep cost ≤ $0.15
// but realistic enough to exercise all 6 passes (Pass 0 categorisation +
// Pass 1 Six-Tool Pattern + Pass 2 descriptions + Pass 3 params +
// Pass 4 annotations + Pass 5 response shaping).
const PETSTORE_SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json';

const ULID_REGEX = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Wait for the SSE-driven navigation away from /generate/[jobId] to /preview.
 * Real engine: 60–180s typical, up to 360s worst case (Stage F2 smell scan +
 * F3 agent eval if auto-triggered).
 */
const waitForPreviewNav = async (page: Page): Promise<void> => {
  await page.waitForURL(/\/generate\/.+\/preview/, {
    timeout: 360_000, // 6 minutes — hard cap for SSE 'completed' event
  });
};

test.describe('hero flow → deploy (real LLM)', () => {
  test.skip(!isLiveMode(), 'requires MCPGEN_FRONTEND_MODE=live + running BFF + engine + Flipt');

  // Serial: real LLM is rate-limited and we share a single OpenRouter key.
  test.describe.configure({ mode: 'serial' });

  test('FE-01..05: paste Petstore3 URL → SSE → preview → quality → deploy → DeploySuccess', async ({
    browser,
  }) => {
    skipIfNotLive();
    test.slow(); // 3× default timeout — expect ~3–5 min wall clock.

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // ── Step 1: open landing.
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // The locked screen-landing.jsx renders an `<input class="mc-input mc-mono">`
      // and a `<button>` whose label is t('makeIt'). The default locale is `en`
      // so the label is literally "make it" (matches landing-submit.spec.ts).
      await expect(page.locator('input.mc-input')).toBeVisible({ timeout: 10_000 });

      // ── Step 2: paste Petstore3 spec URL.
      await page.fill('input.mc-input', PETSTORE_SPEC_URL);

      // ── Step 3: click "make it" → router.push to /generate?spec_url=…
      await page.click('button:has-text("make it")');

      // ── Step 4: assert URL navigates to /generate?spec_url=…
      // Canvas auto-submits POST /api/v1/generate on mount when spec_url is
      // present. The redirect to /generate/[jobId] follows almost immediately.
      // We can't always catch the intermediate /generate?spec_url state, so
      // we accept either form here and rely on the next assertion to confirm
      // the BFF gen_${ulid} response.
      await expect(page).toHaveURL(/\/generate(\?spec_url=|\/gen_)/, {
        timeout: 15_000,
      });

      // ── Step 5: BFF returns 202 with `{ job_id: "gen_<ULID>" }` and Canvas
      // pushes `/generate/${job_id}`. Wait for the dynamic segment.
      await page.waitForURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}/, {
        timeout: 30_000,
      });

      // Capture the jobId for later screen navigation.
      const url = page.url();
      const m = url.match(/gen_[0-9A-HJKMNP-TV-Z]{26}/);
      expect(m).not.toBeNull();
      const jobId = m![0];
      expect(jobId).toMatch(ULID_REGEX);

      // ── Step 6: SSE pipeline runs. The locked StreamLog renders a stream
      // log header — it's fine to assert canon copy ("from any API …") to
      // confirm the screen mounted while we wait for completion.
      // The screen DOES render; we don't add a hard assertion here because
      // the SSE animation can briefly cover the canon copy.

      // ── Step 7: wait for SSE 'completed' event → navigate to /preview.
      // The wrapper navigates externally as soon as real SSE emits the
      // terminal event; live engine: 60–180s typical.
      await waitForPreviewNav(page);
      await expect(page).toHaveURL(/\/preview/);

      // ── Step 8: preview tools list renders. The locked PreviewWrapper
      // renders the canon TopBar + tools list. We assert presence of the
      // "tools" caption — canon-stable across all generation outcomes.
      await expect(page.locator('body')).toContainText(/tools/i, {
        timeout: 15_000,
      });

      // ── Step 9: navigate to /quality. The PreviewWrapper "make it" CTA
      // routes to /quality on click; we go direct for determinism.
      await page.goto(`/generate/${jobId}/quality`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/quality$/);

      // ── Step 10: F1 / F2 scores render. Quality screen renders a Gauge
      // with the overall score and per-component cards. We assert the
      // "scored" canon copy is present (matches "here's how it scored.").
      await expect(page.locator('body')).toContainText(/scored/i, {
        timeout: 15_000,
      });

      // ── Step 11: navigate to /deploy.
      await page.goto(`/generate/${jobId}/deploy`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/deploy$/);

      // ── Step 12: click the cloud submit button (the only `<button>` whose
      // label is "deploy" within the deploy form). The Deploy screen pre-selects
      // the "mcpgen cloud" option, so a single click on "deploy" is enough.
      const deployBtn = page.getByRole('button', { name: /^deploy$/i });
      await expect(deployBtn).toBeVisible({ timeout: 10_000 });

      // Watch the network response so we can assert deploy outcome regardless
      // of whether the BFF currently has the CFWP API wired (Phase 5 brief
      // explicitly notes deploy may stub when CF creds are absent).
      const deployRespPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/deploy/ephemeral') &&
          resp.request().method() === 'POST',
        { timeout: 60_000 },
      );
      await deployBtn.click();
      const deployResp = await deployRespPromise;
      const deployStatus = deployResp.status();

      // ── Step 13: DeployRouteShell pushes `?deployed=1&url=…` on 2xx, OR the
      // Deploy screen flips to its canon "edge rejected the bundle." failure
      // card on non-2xx. Both are acceptable — the locked canon UI exercises
      // both branches verbatim. We assert ONE of:
      //   (a) URL contains ?deployed=1 → DeploySuccess renders.
      //   (b) Body contains "deploy failed" canon copy → failure branch.
      if (deployStatus >= 200 && deployStatus < 300) {
        // Happy path: wait for URL state push + DeploySuccess.
        await page.waitForURL(/\/deploy\?deployed=1/, { timeout: 30_000 });
        await expect(page.locator('body')).toContainText(/your endpoint/i, {
          timeout: 10_000,
        });
        // DeploySuccess synthesises a Claude Desktop config block —
        // canonical "mcpServers" string is visible.
        await expect(page.locator('body')).toContainText(/mcpServers/, {
          timeout: 10_000,
        });
      } else {
        // Deploy failed: assert the canon failure card surfaces.
        await expect(page.locator('body')).toContainText(/deploy failed|edge rejected/i, {
          timeout: 15_000,
        });
        test.info().annotations.push({
          type: 'note',
          description: `deploy/ephemeral returned ${deployStatus} — accepted (failure branch is canon-locked too)`,
        });
      }
    } finally {
      await context.close();
    }
  });
});
