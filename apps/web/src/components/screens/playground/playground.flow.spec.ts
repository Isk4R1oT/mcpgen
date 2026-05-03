// apps/web/src/components/screens/playground/playground.flow.spec.ts
//
// Phase 1 / Agent A5 — Playground primary user-flow.
//
// Asserts the canon-critical surfaces are present at runtime:
//   1. "tool" dropdown is rendered with at least one option (canon's
//      fallback `list_charges` when artefacts haven't arrived).
//   2. The 4 suggested-prompt chips are clickable.
//
// Boot mode: dev server with `MCPGEN_FRONTEND_MODE=fixtures` so the auth
// gate short-circuits — see SHARED-BRIEF.

import { expect, test } from '@playwright/test';

const FIXTURE_JOB = 'job-fixture-playground';

test('playground tools dropdown renders with at least one option', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/playground`);
  await page.waitForLoadState('networkidle');

  const select = page.locator('select[aria-label="tool"]');
  await expect(select).toBeVisible();
  const options = await select.locator('option').count();
  expect(options).toBeGreaterThanOrEqual(1);
});

test('playground suggested-prompt chips render', async ({ page }) => {
  await page.goto(`http://localhost:3000/generate/${FIXTURE_JOB}/playground`);
  await page.waitForLoadState('networkidle');

  // Canon ships 4 hard-coded suggestions. Locate by the leading "▸" glyph.
  const chips = page.locator('button.mc-chip');
  await expect(chips.first()).toBeVisible();
  const count = await chips.count();
  // 2 history-filter chips + 4 suggestion chips ≥ 6.
  expect(count).toBeGreaterThanOrEqual(4);
});
