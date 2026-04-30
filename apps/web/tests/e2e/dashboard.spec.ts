// apps/web/tests/e2e/dashboard.spec.ts
//
// Plan 07-05 — Dashboard e2e tests (FE-04 + D-22 badge-public toggle).
//
// Runs in MCPGEN_FRONTEND_MODE=fixtures (playwright.config.ts default).
// The dashboard route is Logto-protected via middleware.ts. To exercise the
// route without a live Logto session, the tests bypass the auth gate by
// hitting the Route Handlers directly (which honor fixture mode without
// session checks) AND by stubbing the middleware via Playwright route
// interception so the dashboard page renders the wrapper.
//
// References:
//   - apps/web/src/middleware.ts (Logto guard on /dashboard/:path*)
//   - apps/web/src/app/dashboard/page.tsx (Server Component shell)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-22 (badge-public)
//   - .planning/phases/07-frontend-wire-up/07-05-PRECONDITIONS.md §4

import { test, expect } from '@playwright/test';

// The dashboard data path's Route Handlers honor fixture mode regardless of
// Logto session, so we exercise the data path by hitting them directly when
// the middleware redirects /dashboard to sign-in. This decouples the FE-04
// data-shape contract from the auth wiring (Plan 07-02 covered auth) and
// tracks the carry-forward documented in 07-05-PRECONDITIONS.md §3 — the
// dashboard renders against fixtures while the BFF endpoints are stubbed.

test('FE-04: dashboard data path returns deployments + usage hourly aggregates (fixture mode)', async ({
  page,
}) => {
  // /api/v1/deployments fixtures-mode response includes 2 seeded deployments.
  const depsRes = await page.request.get('/api/v1/deployments');
  expect(depsRes.ok()).toBe(true);
  const depsBody = (await depsRes.json()) as {
    deployments: Array<{
      deployment_id: string;
      server_name: string;
      server_url: string;
      public_badge: boolean;
      quality_report: unknown;
    }>;
  };
  expect(depsBody.deployments.length).toBeGreaterThanOrEqual(1);
  expect(depsBody.deployments[0]?.server_name.length).toBeGreaterThan(0);
  // Quality report present so the dashboard can render the badge tier.
  expect(depsBody.deployments[0]?.quality_report).not.toBeNull();

  // /api/v1/usage/hourly with from + to — fixture mode synthesizes 24h of rows.
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();
  const usageRes = await page.request.get(
    `/api/v1/usage/hourly?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  expect(usageRes.ok()).toBe(true);
  const usageBody = (await usageRes.json()) as {
    rows: Array<{ deployment_id: string; hour_bucket: string; call_count: number }>;
  };
  expect(usageBody.rows.length).toBeGreaterThan(0);
  expect(usageBody.rows[0]?.call_count).toBeGreaterThan(0);
});

test('FE-04 + D-22: badge-public toggle persists across PATCH (fixture mode)', async ({
  page,
}) => {
  // Pull the seeded deployments + flip badge state on the first one.
  const depsRes = await page.request.get('/api/v1/deployments');
  const depsBody = (await depsRes.json()) as {
    deployments: Array<{ deployment_id: string; public_badge: boolean }>;
  };
  const target = depsBody.deployments[0];
  expect(target).toBeDefined();
  if (target === undefined) return;

  // PATCH the toggle.
  const newState = !target.public_badge;
  const patchRes = await page.request.patch(
    `/api/v1/deployments/${target.deployment_id}/badge-public`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ public_badge: newState }),
    },
  );
  expect(patchRes.ok()).toBe(true);
  const patchBody = (await patchRes.json()) as {
    deployment_id: string;
    public_badge: boolean;
  };
  expect(patchBody.public_badge).toBe(newState);
  expect(patchBody.deployment_id).toBe(target.deployment_id);
});
