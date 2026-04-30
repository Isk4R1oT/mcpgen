// apps/web/tests/e2e/landing-submit.spec.ts — Plan 07-02 FE-01 e2e.
//
// Validates the landing form wires Idempotency-Key + submitGeneration +
// router.push end-to-end. Plan 07-03 will replace the page.route() mock
// with the real fixture-mode handler; until then we stub it here so the
// suite runs against any backend (BFF 501-stub or absent).
//
// Reference: .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-12 + D-26.

import { test, expect } from '@playwright/test';

const ULID_HEADER_REGEX = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/;

test('FE-01: landing form submits with Idempotency-Key header matching gen_${ulid}', async ({
  page,
  context,
}) => {
  const seenKeys: string[] = [];

  await context.route('**/api/v1/generate', async (route) => {
    const headers = route.request().headers();
    const idempKey = headers['idempotency-key'] ?? headers['Idempotency-Key'] ?? '';
    seenKeys.push(idempKey);
    expect(idempKey).toMatch(ULID_HEADER_REGEX);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: idempKey,
        sse_url: 'http://localhost:8787/api/v1/jobs/' + idempKey + '/stream',
      }),
    });
  });

  await page.goto('/');

  // The locked screen-landing.jsx uses an `<input>` with class
  // `mc-input mc-mono` and a placeholder containing "OpenAPI".
  await page.fill(
    'input.mc-input',
    'https://api.stripe.com/openapi.yaml',
  );
  await page.click('button:has-text("make it")');

  await expect(page).toHaveURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}/, {
    timeout: 10_000,
  });

  // At least one outbound POST happened with a valid header.
  expect(seenKeys.length).toBeGreaterThan(0);
  expect(seenKeys[0]).toMatch(ULID_HEADER_REGEX);
});

test('FE-01: invalid URL shows error message via locked global.css styling', async ({
  page,
}) => {
  await page.goto('/');
  await page.fill('input.mc-input', 'not-a-url');
  await page.click('button:has-text("make it")');
  // Scope the alert assertion to OUR error div (class mc-mono inside role=alert)
  // — Next.js injects its own [role="alert"] route-announcer node which would
  // collide with a top-level locator otherwise.
  await expect(
    page.locator('[role="alert"].mc-mono'),
  ).toContainText(/please|invalid|valid url/i);
});

test('FE-01: Idempotency-Key persists in localStorage and is reused on retry', async ({
  page,
  context,
}) => {
  let callCount = 0;
  const observedKeys: string[] = [];

  await context.route('**/api/v1/generate', async (route) => {
    callCount += 1;
    const headers = route.request().headers();
    const idempKey = headers['idempotency-key'] ?? headers['Idempotency-Key'] ?? '';
    observedKeys.push(idempKey);
    if (callCount === 1) {
      // First call: 500 — client should NOT rotate the key, so retry sends same.
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error' }),
      });
    } else {
      // Second call: 202 with same key.
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: idempKey,
          sse_url: 'http://localhost:8787/api/v1/jobs/' + idempKey + '/stream',
        }),
      });
    }
  });

  await page.goto('/');
  await page.fill('input.mc-input', 'https://api.example.com/openapi.json');
  await page.click('button:has-text("make it")');

  // Wait for first failed attempt to surface error (scoped to our mc-mono
  // alert div — Next.js' own route-announcer also uses [role="alert"]).
  await expect(page.locator('[role="alert"].mc-mono')).toBeVisible({
    timeout: 10_000,
  });

  // Retry — click "make it" again with the same URL.
  await page.click('button:has-text("make it")');

  await expect(page).toHaveURL(/\/generate\/gen_[0-9A-HJKMNP-TV-Z]{26}/, {
    timeout: 10_000,
  });

  // Both calls used the same Idempotency-Key (localStorage persistence).
  expect(observedKeys.length).toBeGreaterThanOrEqual(2);
  expect(observedKeys[0]).toBe(observedKeys[1]);
  expect(observedKeys[0]).toMatch(ULID_HEADER_REGEX);
});
