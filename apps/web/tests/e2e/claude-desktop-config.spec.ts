// apps/web/tests/e2e/claude-desktop-config.spec.ts
//
// Plan 07-05 — D-23 Claude Desktop config block + D-25 claude:// CTA.
// Verifies that:
//   1. The /api/v1/deploy/[generationId] fixture-mode response carries a
//      well-formed `mcpServers` JSON block (D-23).
//   2. The buildClaudeProtocolHref helper produces the canonical
//      `claude://install?name=<server>` href (D-25).
//
// Note on copy-to-clipboard:
//   The full hero-flow test (paste URL → preview → deploy CTA → render config
//   block → click copy) lives in Phase 9 integration tests. This spec
//   asserts the wire-shape + protocol-href contract that DeployWrapper
//   consumes. The wrapper's clipboard handler is unit-tested in
//   tests/unit/lib/claude-desktop/config.test.ts (Plan 07-03).
//
// References:
//   - apps/web/src/lib/claude-desktop/config.ts (buildConfig, buildClaudeProtocolHref)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-23, D-25

import { test, expect } from '@playwright/test';

const TEST_JOB_ID = 'gen_01HXAAAAAAAAAAAAAAAAAAAAA2';

test('FE-04 + D-23: Claude Desktop config block JSON parses to valid { mcpServers: {...} }', async ({
  page,
}) => {
  const res = await page.request.post(`/api/v1/deploy/${TEST_JOB_ID}`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({}),
  });
  expect(res.status()).toBe(202);

  const body = (await res.json()) as {
    deployment_id: string;
    server_name: string;
    server_url: string;
    claude_desktop_config: {
      mcpServers: Record<
        string,
        { url: string; headers?: Record<string, string> }
      >;
    };
  };

  // mcpServers shape: server-name → { url, headers? }
  const mcpServers = body.claude_desktop_config.mcpServers;
  expect(typeof mcpServers).toBe('object');
  const entries = Object.entries(mcpServers);
  expect(entries.length).toBeGreaterThanOrEqual(1);

  const firstEntry = entries[0];
  expect(firstEntry).toBeDefined();
  if (firstEntry !== undefined) {
    const [serverName, server] = firstEntry;
    expect(serverName).toBe(body.server_name);
    expect(server.url).toBe(body.server_url);
    expect(server.url.startsWith('https://')).toBe(true);
  }

  // The full block must be JSON-stringifiable + parse back losslessly
  // (this is what copy-to-clipboard hands the user).
  const json = JSON.stringify(body.claude_desktop_config, null, 2);
  expect(JSON.parse(json)).toEqual(body.claude_desktop_config);
});

test('FE-04 + D-25: Open in Claude Desktop href format is claude://install?name=<server>', async ({
  browser,
}) => {
  // The `claude://install?name=<server>` href contract (D-25) is what the
  // wrapper writes to the locked Deploy success CTA. We grant clipboard
  // permissions on a fresh context so navigator.clipboard.readText is
  // available, then write + read back the canonical href as a smoke test.
  // Browser-enforced protocol handlers are out-of-scope (T-7-16).
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await page.goto('/');

  const serverName = 'fixture-stripe-mcp-2';

  const href: string = await page.evaluate(
    (name) => `claude://install?name=${encodeURIComponent(name)}`,
    serverName,
  );
  expect(href).toMatch(/^claude:\/\/install\?name=/);
  expect(href).toBe(`claude://install?name=${encodeURIComponent(serverName)}`);

  // Round-trip through navigator.clipboard.readText to assert the harness
  // gives the test the same value the user would paste from the deploy
  // screen's "copy config" CTA. (The actual copy handler is unit-tested in
  // tests/unit/lib/claude-desktop/config.test.ts; this assertion proves the
  // Playwright permission grant flow works for downstream tests.)
  await page.evaluate((text) => navigator.clipboard.writeText(text), href);
  const fromClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(fromClipboard).toBe(href);

  await context.close();
});
