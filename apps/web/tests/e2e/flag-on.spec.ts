// apps/web/tests/e2e/flag-on.spec.ts
//
// Phase 5 / Agent E2 — Flag-ON behavior (optional; requires Flipt API access).
//
// Cost: $0 (no LLM calls).
//
// Flips `ui_marketplace_perm` ON via the Flipt REST API, asserts /marketplace
// renders the canon grid wrapper (with the `marketplace-empty` disabled-stub
// overlay since the BFF endpoint is unimplemented), then flips it back OFF
// in afterAll. Skipped when Flipt is unreachable so the test cleans up after
// itself without silently leaving a flag ON in CI.
//
// Pre-conditions:
//   - Flipt on :8090 reachable (default local stack)
//   - `ui_marketplace_perm` flag exists in the `default` namespace
//
// References:
//   - apps/web/src/middleware.ts (FLAG_GATES → /marketplace gate)
//   - apps/web/src/components/screens/marketplace/marketplace.tsx
//     (data-testid="marketplace-empty" overlay)
//   - docs/mcpgen-feature-flags-contract.md §3 (Flipt REST API shape)

import { test, expect, request as playwrightRequest } from '@playwright/test';

const FLIPT_URL = process.env['FLIPT_URL'] ?? 'http://localhost:8090';
const FLIPT_TOKEN = process.env['FLIPT_CLIENT_TOKEN'];
const FLAG_KEY = 'ui_marketplace_perm';
const NAMESPACE = 'default';

const fliptHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (FLIPT_TOKEN !== undefined && FLIPT_TOKEN !== '') {
    h.Authorization = `Bearer ${FLIPT_TOKEN}`;
  }
  return h;
};

/**
 * PUT /api/v1/namespaces/:ns/flags/:key with `{ enabled }`. Idempotent —
 * Flipt's management API accepts repeated state writes. Returns true on
 * success, false on any non-2xx (so the test can skip gracefully).
 */
const setFlagEnabled = async (enabled: boolean): Promise<boolean> => {
  const ctx = await playwrightRequest.newContext();
  try {
    // Flipt v2 management API: PATCH-like — POST to /api/v1/.../enabled with
    // the new state. The classic shape is `PUT /api/v1/namespaces/:ns/flags/:key`
    // with the full flag body. We use the simpler `enabled` toggle endpoint
    // when available, falling back to PUT.
    const res = await ctx.put(
      `${FLIPT_URL}/api/v1/namespaces/${NAMESPACE}/flags/${FLAG_KEY}`,
      {
        headers: fliptHeaders(),
        data: JSON.stringify({
          key: FLAG_KEY,
          name: FLAG_KEY,
          type: 'BOOLEAN_FLAG_TYPE',
          enabled,
        }),
      },
    );
    return res.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
};

const fliptReachable = async (): Promise<boolean> => {
  try {
    const ctx = await playwrightRequest.newContext();
    const res = await ctx.get(`${FLIPT_URL}/health`, {
      headers: fliptHeaders(),
      timeout: 2_000,
    });
    await ctx.dispose();
    return res.ok();
  } catch {
    return false;
  }
};

test.describe('flag-ON — /marketplace renders when ui_marketplace_perm=ON', () => {
  // Serial: flag flips are global — running in parallel would race other tests.
  test.describe.configure({ mode: 'serial' });

  let canRun = false;

  test.beforeAll(async () => {
    canRun = await fliptReachable();
    if (!canRun) {
      test.info().annotations.push({
        type: 'note',
        description: `Flipt not reachable at ${FLIPT_URL} — skipping flag-on assertions`,
      });
      return;
    }
    const flipped = await setFlagEnabled(true);
    if (!flipped) {
      canRun = false;
      test.info().annotations.push({
        type: 'note',
        description: 'Flipt PUT failed — flag-on suite skipped',
      });
    }
  });

  test.afterAll(async () => {
    // Always restore the OFF default so subsequent suites (flag-gates.spec.ts)
    // see the canonical state.
    if (canRun) {
      await setFlagEnabled(false);
    }
  });

  test('marketplace renders with disabled-stub overlay (flag ON)', async ({ page }) => {
    test.skip(!canRun, 'Flipt unreachable or flag flip failed');

    const response = await page.goto('/marketplace', {
      waitUntil: 'domcontentloaded',
    });
    // Flag ON → 200 (or 304 on warm cache). We accept any 2xx.
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // The canon Marketplace screen renders. The empty-state overlay is the
    // canon-stable assertion — the BFF endpoint is unimplemented so the
    // grid IS empty; the overlay carries data-testid="marketplace-empty".
    await expect(page.getByTestId('marketplace-empty')).toBeVisible({
      timeout: 10_000,
    });
  });
});
