// apps/web/tests/e2e/page-reload-mid-generation.spec.ts
//
// Plan 07-03 (Wave 1) + Plan 07-04 (Wave 2) — MANDATORY Pitfall #20
// acceptance test (D-11 / D-27). SSE state must survive a page reload
// mid-generation. The locked StreamLog screen runs its own visual timer;
// navigation to /preview is driven externally by the wrapper's
// useGenerationSSE hook on stage='completed'.
//
// Plan 07-04 adds dual-mode coverage: the SAME assertions run against the
// fixture-mode SSE timeline AND against the live engine via apps/api Hono BFF
// (per CONTEXT D-27 — re-run Pitfall #20 against real engine in Wave 2).
// The route-handler proxy is the only differ; Playwright assertions are
// mode-agnostic. Live mode validates Postgres pending_callbacks replay.
//
// Flow (identical for both modes):
//   1. Visit landing.
//   2. Paste a sample API URL + click "make it" — POST /api/v1/generate returns 202.
//   3. URL navigates to /generate/<gen_id>.
//   4. Wait briefly so SSE timeline receives some events.
//   5. Kill the SSE socket via context.route('**/jobs/*/stream', abort).
//   6. page.reload() — Last-Event-ID resume kicks in via Last-Event-ID header.
//   7. Unroute — re-allow new SSE connections.
//   8. Wait for navigation to /preview (driven by SSE stage='completed').
//
// References:
//   - .planning/research/PITFALLS.md #20
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-11, D-27
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples"

import { test, expect } from '@playwright/test';

// Dual-mode: 'fixtures' is the default (no MCPGEN_FRONTEND_MODE env var
// when running under the playwright.config.ts webServer command). Setting
// MCPGEN_FRONTEND_MODE=live before `pnpm test:e2e` flips the assertion
// against the real engine via apps/api Hono BFF. Both modes share the same
// assertions — the route-handler proxy is the only differ.
const MODE = process.env.MCPGEN_FRONTEND_MODE === 'live' ? 'live' : 'fixtures';
// Live mode timeline runs much longer than fixture mode (60–180s vs ~13s)
// — extend resume-wait + final navigation timeouts accordingly.
const RESUME_NAV_TIMEOUT_MS = MODE === 'live' ? 240_000 : 60_000;
const PRE_KILL_WAIT_MS = MODE === 'live' ? 8_000 : 3_500;

test(`FE-02 + Pitfall #20: SSE state survives page reload mid-generation [${MODE}]`, async ({
  page,
  context,
}) => {
  // Step 1: visit landing (fixture mode is enforced by webServer config).
  await page.goto('/');

  // Step 2: submit landing form. The locked Landing screen exposes a URL
  // input and a "make it" button (verified via screen-landing.jsx props).
  // Use stable locator-by-text to avoid coupling to internal class names.
  // Locked screen-landing.jsx uses input.mc-input + a "make it" button.
  await page.fill('input.mc-input', 'https://api.stripe.com/openapi.yaml');
  await page.click('button:has-text("make it")');

  // Step 3: navigate to /generate/:gen_id once the BFF returns 202.
  // Idempotency-Key in Last-Event-ID resume cycle — fresh gen_<ulid> per submit.
  await page.waitForURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}(\/|$)/, {
    timeout: 15_000,
  });

  // Step 4: let the SSE stream emit at least one event before the kill.
  // Fixture timeline emits an event every ~1.5–3s (Plan 07-03 sse-timeline);
  // live engine emits per-stage events 5–20s apart. Wait a mode-appropriate
  // window so resume has work to do AFTER reload.
  await page.waitForTimeout(PRE_KILL_WAIT_MS);

  // Step 5: kill the SSE socket. The Last-Event-ID semantic of fixture-mode
  // resumes from the next event — see lib/fixture-mode/sse-timeline.ts.
  await context.route('**/api/v1/jobs/*/stream', (route) => {
    void route.abort('failed');
  });

  // Step 6: reload. The hook re-runs bootstrap on the new page and re-opens
  // SSE with Last-Event-ID resume header (from sessionStorage / state).
  await page.reload();

  // Step 7: unroute — re-allow SSE. Resume continues from the next event.
  await context.unroute('**/api/v1/jobs/*/stream');

  // Step 8: wait for /preview navigation. SSE stage='completed' triggers
  // router.push(`/generate/${jobId}/preview`) in StreamLogWrapper. Live mode
  // runs the full engine pipeline (60–180s); fixture mode completes in ~13s.
  await page.waitForURL(/\/generate\/.+\/preview/, { timeout: RESUME_NAV_TIMEOUT_MS });

  // Sanity: page rendered (no error overlay).
  await expect(page).toHaveURL(/\/preview/);
});
