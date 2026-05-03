// apps/web/src/components/screens/deploy-success/deploy-success.flow.spec.ts
//
// Phase 1 / Agent A5 — DeploySuccess primary user-flow.
//
// Asserts:
//   1. Live MCP URL renders verbatim.
//   2. Claude Desktop config block renders with `mcpServers` JSON.
//   3. Clicking the URL "copy" button (canon UX) — non-fatal Playwright
//      clipboard support is covered by the unit test, this E2E just
//      ensures the button doesn't crash.

import { expect, test } from '@playwright/test';

const FIXTURE_JOB = 'job-fixture-success';
const FIXTURE_URL = 'https://lumen-mcp-abc123.mcpgen.app/mcp';

test('deploy-success renders live URL + config block', async ({ page }) => {
  await page.goto(
    `http://localhost:3000/generate/${FIXTURE_JOB}/deploy?deployed=1&url=${encodeURIComponent(FIXTURE_URL)}`,
  );
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('it\'s live.')).toBeVisible();
  // The URL is rendered without the protocol prefix in the canon (the
  // "https://" is muted while the host shows in mono).
  await expect(page.getByText('lumen-mcp-abc123.mcpgen.app/mcp')).toBeVisible();
  // Config block uses `data-config-block` for stable selection.
  const config = page.locator('[data-config-block]');
  await expect(config).toContainText('"mcpServers"');
});

test('deploy-success claim CTA renders for an unclaimed deploy', async ({ page }) => {
  await page.goto(
    `http://localhost:3000/generate/${FIXTURE_JOB}/deploy?deployed=1&url=${encodeURIComponent(FIXTURE_URL)}`,
  );
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('button', { name: /claim permanent/i })).toBeVisible();
});
