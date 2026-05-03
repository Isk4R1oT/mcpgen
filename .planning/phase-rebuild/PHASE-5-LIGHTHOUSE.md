# Phase 5 — E3 Lighthouse Audit

**Date:** 2026-05-03
**Stack:** `apps/web` Next.js 15 production build (`pnpm build && pnpm start`), `MCPGEN_FRONTEND_MODE=fixtures`, served on `localhost:3000`.
**Lighthouse:** `lighthouse@12` (npx), Chrome `--headless=new`.
**Profile:** desktop, 1280×800, `cpuSlowdownMultiplier=1`, `--only-categories=performance`.
**Methodology:** 3 runs per URL, median by performance score. INP cannot be measured in lab — only field metrics include INP, so we substitute Total Blocking Time (TBT) which is Lighthouse's lab proxy and is included in the budget per the brief.

## Budgets (from brief / `docs/mcpgen-architecture.md`)

| Metric          | Budget        |
|-----------------|---------------|
| Performance     | ≥ 0.90        |
| LCP             | ≤ 2500 ms     |
| CLS             | ≤ 0.10        |
| INP (lab proxy: TBT) | ≤ 200 ms |
| TBT             | ≤ 200 ms      |

`PASS` = within budget · `WARN` = within Lighthouse "needs improvement" band · `FAIL` = below the documented budget.

---

## Summary

| Page                                                  | Perf  | LCP (ms) | CLS    | TBT (ms) | Overall |
|-------------------------------------------------------|-------|----------|--------|----------|---------|
| `/` (landing)                                         | 0.73  | 6639     | 0.000  | 0        | **FAIL** |
| `/generate` (canvas)                                  | 0.73  | 7547     | 0.000  | 0        | **FAIL** |
| `/generate/<jobId>/preview` (preview, fixture mode)   | 0.73  | 7667     | 0.000  | 0        | **FAIL** |
| `/sign-in` (Logto sign-in stand-in for `/dashboard`)  | 0.74  | 6502     | 0.000  | 0        | **FAIL** |

**Tally:** 0 PASS / 0 WARN / 4 FAIL.

The cause is uniform across all 4 routes and is **not application logic** — it is the production server. `next start` does not gzip/brotli responses by default. CLS and TBT are excellent (0); the entire performance gap is concentrated in LCP, driven by ~580–700 KiB of uncompressed JS bundles + ~400–500 KiB unused JS shipped to the client.

---

## Per-page detail

### `/` — Landing

- URL: `http://localhost:3000/`
- Median run: 2 (of 3); run perf scores 0.73 / 0.74 / 0.73 — variance ±0.01.

| Metric        | Value     | Budget       | Status |
|---------------|-----------|--------------|--------|
| Performance   | **0.73**  | ≥ 0.90       | FAIL   |
| LCP           | **6639 ms** | ≤ 2500 ms  | FAIL   |
| CLS           | 0.000     | ≤ 0.10       | PASS   |
| TBT (≈INP)    | 0 ms      | ≤ 200 ms     | PASS   |
| FCP           | 1056 ms   | (info)       | —      |
| Speed Index   | 1056 ms   | (info)       | —      |
| TTI           | 6639 ms   | (info)       | —      |

LCP element: hero `<div class="mc-display-xl">` containing the tagline "any API. production MCP. in sixty seconds." (text node, no image dependency).
Server response time: 21 ms (excellent).

**Top opportunities (median run):**

1. **Enable text compression** — score 0, est. savings **3000 ms / 583 KiB**. Server isn't sending `Content-Encoding: gzip|br`.
2. **Reduce unused JavaScript** — score 0, est. savings **2100 ms / 396 KiB**.
3. **Avoid serving legacy JavaScript to modern browsers** — score 0, est. savings **150 ms / 43 KiB**.
4. **Eliminate render-blocking resources** — score 0, est. savings **140 ms**.

### `/generate` — Canvas (preview-mode entry)

- URL: `http://localhost:3000/generate`
- Median run: 2; run perf scores 0.73 / 0.73 / 0.73 — variance 0.

| Metric        | Value      | Budget      | Status |
|---------------|------------|-------------|--------|
| Performance   | **0.73**   | ≥ 0.90      | FAIL   |
| LCP           | **7547 ms** | ≤ 2500 ms  | FAIL   |
| CLS           | 0.000      | ≤ 0.10      | PASS   |
| TBT (≈INP)    | 0 ms       | ≤ 200 ms    | PASS   |
| FCP           | 1058 ms    | (info)      | —      |
| Speed Index   | 1058 ms    | (info)      | —      |
| TTI           | 7547 ms    | (info)      | —      |

**Top opportunities:**

1. **Enable text compression** — savings **3750 ms / 698 KiB**.
2. **Reduce unused JavaScript** — savings **2550 ms / 494 KiB**.
3. **Avoid legacy JavaScript** — savings **150 ms / 43 KiB**.
4. **Eliminate render-blocking resources** — score 0.5 (already partly addressed; 0 ms remaining headroom).

### `/generate/<jobId>/preview` — Preview

- URL: `http://localhost:3000/generate/lh-preview-test/preview` (fixture-mode jobId; `GET /api/v1/jobs/:id` returns the bootstrap `streaming` payload, then SSE).
- Median run: 1; run perf scores 0.73 / 0.73 / 0.73 — variance 0.

| Metric        | Value      | Budget      | Status |
|---------------|------------|-------------|--------|
| Performance   | **0.73**   | ≥ 0.90      | FAIL   |
| LCP           | **7667 ms** | ≤ 2500 ms  | FAIL   |
| CLS           | 0.000248   | ≤ 0.10      | PASS   |
| TBT (≈INP)    | 0 ms       | ≤ 200 ms    | PASS   |
| FCP           | 1058 ms    | (info)      | —      |
| Speed Index   | 1167 ms    | (info)      | —      |
| TTI           | 7667 ms    | (info)      | —      |

**Top opportunities:**

1. **Enable text compression** — savings **3760 ms / 694 KiB**.
2. **Reduce unused JavaScript** — savings **2400 ms / 481 KiB**.
3. **Avoid legacy JavaScript** — savings **150 ms / 43 KiB**.

### `/sign-in` — Logto sign-in stand-in for `/dashboard`

- URL: `http://localhost:3000/sign-in`
- Per the brief: anon hits to `/dashboard` 307-redirect to Logto Cloud (external host); auditing the Logto-hosted page is out-of-scope, so the local `/sign-in` route was used as the closest in-stack proxy.
- Median run: 1 (of 3 — perf 0.74 / 0.66 / 0.74; the 0.66 is a single-run cold-start tail; medians use the middle value).

| Metric        | Value      | Budget      | Status |
|---------------|------------|-------------|--------|
| Performance   | **0.74**   | ≥ 0.90      | FAIL   |
| LCP           | **6502 ms** | ≤ 2500 ms  | FAIL   |
| CLS           | 0.000      | ≤ 0.10      | PASS   |
| TBT (≈INP)    | 0 ms       | ≤ 200 ms    | PASS   |
| FCP           | 1057 ms    | (info)      | —      |
| Speed Index   | 1057 ms    | (info)      | —      |
| TTI           | 6502 ms    | (info)      | —      |

**Top opportunities:**

1. **Enable text compression** — savings **2850 ms / 567 KiB**.
2. **Reduce unused JavaScript** — savings **2100 ms / 402 KiB**.
3. **Avoid legacy JavaScript** — savings **150 ms / 43 KiB**.
4. **Eliminate render-blocking resources** — savings **143 ms / 140 ms**.

---

## Remediation plan (consolidated)

The four pages share an identical failure profile. Remediation is mostly stack-level, not page-level:

1. **Enable text compression in front of the production runtime.** This is the largest single win (~3 s LCP savings, ~580–700 KiB per page). Two paths, in order of preference:
   - **Production:** terminate behind Cloudflare (the planned tenant runtime is CF Workers; the control-plane Next app should also be on Vercel or behind CF). Both auto-apply Brotli.
   - **Local audit / staging behind `next start`:** add a reverse proxy (e.g. Caddy) or run `pnpm dlx serve -s .next/static` for static assets — `next start` ships uncompressed by design and Lighthouse will continue to flag local builds. Re-run lighthouse against the proxied port to get a representative CWV reading.
2. **Reduce unused JavaScript (~400–500 KiB).** Median bundles ship 396–494 KiB of code that never executes on the route. Suspects to verify with `next build --profile` + `@next/bundle-analyzer`:
   - Check whether `shiki`, `vaul`, `sonner`, `@sentry/nextjs` are pulled into the landing chunk transitively. If so, dynamic-`import()` them only inside the components that need them (Shiki belongs only on `/generate/<id>/preview`, `vaul`/`sonner` only on screens with drawers/toasts).
   - Audit the `chunks/4757-*.js` shared chunk (124 KiB) — anything route-specific in there should be code-split.
3. **Avoid legacy JavaScript (~43 KiB, 150 ms).** Confirm `next.config.js` `transpilePackages`/Browserslist target excludes ES5 polyfills for evergreen browsers. Easy ~150 ms LCP win.
4. **Eliminate render-blocking resources (~140 ms).** Current score 0 on landing/sign-in. Likely the global stylesheet is render-blocking. Consider `next/font` for Inter (already in use?) and inline critical CSS via `<style>` tags from a route-level `app/layout.tsx` `<head>` if not already done.
5. **Validate with a CDN-served run before declaring this an app-level FAIL.** Once items (1–4) are in place — or as soon as a Vercel preview deploy is available — re-run E3 against the deploy URL. Expected outcome based on the savings stack: ~6.6 s → ~3.6 s after compression alone, ~1.5–2 s after bundle trimming, putting all 4 pages at PASS or low-WARN.

### What is already healthy

- **CLS = 0** across all 4 pages — no layout shift risk; font/image dimensions are reserved correctly.
- **TBT = 0** across all 4 pages — main thread is essentially idle after parse; no long tasks. INP in the field will almost certainly stay under 200 ms.
- **Server response time = 21 ms** — Next dev server / SSR is not the bottleneck.
- **FCP / Speed Index ≈ 1.05 s** — first paint is on-budget; only LCP is delayed, and it tracks 1:1 with bundle parse time.

---

## Notes / caveats

- **INP cannot be measured by Lighthouse lab runs.** Lighthouse only emits `experimental-interaction-to-next-paint` when there are scripted interactions during the run; with no interactions, the audit is null. TBT is the canonical lab proxy and is in budget on every page. The brief lists both; we report TBT and flag INP as "field-only".
- **Dashboard route audited via `/sign-in`** because the production app 307-redirects unauthenticated `/dashboard` requests to Logto Cloud (`t3qfgh.logto.app`). Auditing an external-vendor page is not actionable for this team. The local `/sign-in` route was used as the closest in-stack proxy. If Phase 5 wants a true authed-dashboard CWV reading, a follow-up audit should run with a stored Logto session cookie.
- **Variance was low** (≤ 0.01 perf score across runs except sign-in run 2 = 0.66, where the median absorbs the outlier). The numbers here are stable enough to commit to.
- **Raw artifacts:** `/Users/igor/Projects/mcpgen/.tmp/lighthouse-{landing,generate,preview,signin}-run{1,2,3}.json`, summary at `/Users/igor/Projects/mcpgen/.tmp/lighthouse-summary.json`.
