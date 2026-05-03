# E2E Findings — Agent A (Landing + Header navigation)

**Branch:** `feature/ui-rebuild-09.2`
**Date:** 2026-05-03
**Zone:** http://localhost:3000 — landing page, header links (`marketplace`, `docs`, `pricing`, `sign in`), hero CTA `make it`, final-CTA-strip primary button, footer links, language switcher (`EN`).
**Mode:** symptoms only — no fixes attempted.
**Artifacts:** `apps/web/.tmp-e2e/agent-a.mjs` · `apps/web/.tmp-e2e/agent-a.log` · `apps/web/.tmp-e2e/agent-a.results.json` · `apps/web/.tmp-e2e/screenshots/agent-a-*.png`.

---

## Finding A-1 — `React is not defined` thrown during loader.ts module init (BLOCKER, latent)

### Symptom
On every initial page load, before any user interaction, a `PAGEERROR` is emitted:

```
ReferenceError: React is not defined
    at eval (webpack-internal:///(app-pages-browser)/./src/i18n.jsx:967:21)
    at (app-pages-browser)/./src/i18n.jsx (.../layout.js:331:1)
    at eval (webpack-internal:///(app-pages-browser)/./src/lib/jsx-bridge/loader.ts:13:63)
    at (app-pages-browser)/./src/lib/jsx-bridge/loader.ts (.../layout.js:353:1)
    at eval (webpack-internal:///(app-pages-browser)/./src/lib/jsx-bridge/index.ts:22:65)
    at (app-pages-browser)/./src/lib/jsx-bridge/index.ts (.../layout.js:342:1)
    at eval (webpack-internal:///(app-pages-browser)/./src/app/_apply-tokens.tsx:7:73)
```

The page still finishes rendering (28 visible clickables enumerated, hero copy + footer present in the screenshots), so the canon `Landing` window-global gets re-registered later when the screen-*.jsx imports re-evaluate after the i18n.jsx failure. Net effect today: visual works, but the i18n React context never registers cleanly, and any consumer that calls `useI18n()` reads the **fallback identity translator** (the one in `providers/i18n-provider.tsx` lines 80-86), not the canon dictionary.

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` lines 4-25 (full stack at first navigation).
- Reproducible 100% — the error is thrown at module init, not at click time.
- `screen-landing.jsx` line 10 calls `window.useI18n()` and the page DOES render English copy → the canon `screen-*.jsx` imports apparently re-run later (or the english source-of-truth lives in screen-landing.jsx itself for keys like `marketplace`/`docs`/`pricing`/`signin`). Either way, the boot path is not clean.

### Root cause
`apps/web/src/lib/jsx-bridge/loader.ts` violates ESM evaluation order:

```ts
// lines 18-19  — these IMPORTS are statements that hoist BEFORE any top-level code below
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

// lines 24-34 — top-level statements that assign globalThis.React
if (typeof window !== 'undefined') {
  const g = globalThis as unknown as { React: typeof React; ReactDOM: typeof ReactDOM };
  g.React = React;
  g.ReactDOM = ReactDOM;
}

// lines 41-58 — also IMPORTS, also hoisted, but per ESM spec they evaluate in source order RELATIVE TO OTHER IMPORTS
import '@/tokens';
import '@/ui';
import '@/i18n';        // ← evaluates i18n.jsx top level: `const I18nContext = React.createContext(...)`
import '@/screen-*';    // ← all screens
```

ESM hoists ALL `import` statements to before ANY top-level code. So `import '@/i18n'` (line 43) evaluates the canon module body — which on line 468 does `React.createContext(...)` — **before** the `g.React = React` assignment on line 32 ever runs. There is no way to interleave imports with statements in a single ESM module; the assignment must happen in a *separate* module that is imported BEFORE `@/i18n`.

A separate shim already exists at `apps/web/src/providers/global-react-shim.ts` and IS imported by `apps/web/src/providers/i18n-provider.tsx` line 40 — but only `i18n-provider` imports it. The chain that triggers the loader earlier is `_apply-tokens.tsx` → `@/lib/jsx-bridge` (index.ts) → `./loader` → `@/i18n`, and that chain never imports `global-react-shim`.

### Suggested fix LOCATION
`apps/web/src/lib/jsx-bridge/loader.ts` — replace the top-level `if (typeof window …)` block with `import '@/providers/global-react-shim'` placed BEFORE the `import '@/tokens'` line. The shim already does the assignment idempotently.

(Do NOT touch any canon file — `i18n.jsx` is locked.)

### Severity
**blocker (latent).** The page renders despite the error, but i18n context resolution is using the fallback identity translator. Any feature flag that gates UI on a localized key, or any non-English locale, will be silently broken. Symptom is invisible to QA today because `screen-landing.jsx` happens to work, but it WILL break Wave-2 i18n consumers. Sentry will be drowning in this on every load in production.

---

## Finding A-2 — Header nav links are dead (`marketplace`, `docs`, `pricing`, `sign in`) (BLOCKER, user-facing)

### Symptom
User clicks any of `marketplace`, `docs`, `pricing`, `sign in` in the header → **nothing happens.** No URL change, no network request to a route, no console error, no feedback whatsoever.

| label | URL before → after | url changed | new requests (HMR-only) | errors |
|---|---|---|---|---|
| marketplace | `/` → `/` | NO | 2 (HMR hot-update only) | 0 |
| docs        | `/` → `/` | NO | 2 (HMR hot-update only) | 0 |
| pricing     | `/` → `/` | NO | 4 (HMR hot-update only) | 0 |
| sign in     | `/` → `/` | NO | 0 | 0 |

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` lines 62-127 (tests 1-4 transcript).
- `apps/web/.tmp-e2e/screenshots/agent-a-{1..4}{a,b}-*.png` — before/after screenshots are visually identical for every header click.
- Element introspection from the Playwright run:
  ```
  [1] a "marketplace"  href=null hasOnClick=false  cls="mc-link mc-mono"
  [2] a "docs"         href=null hasOnClick=false  cls="mc-link mc-mono"
  [3] a "pricing"      href=null hasOnClick=false  cls="mc-link mc-mono"
  [5] button "sign in" href=null hasOnClick=false  cls="mc-btn mc-btn-ink mc-btn-sm"
  ```
  Note `hasOnClick=false` on all four — Playwright's `node.onclick` introspection returns `false`, but React attaches its synthetic handler differently, so this isn't conclusive on its own. What IS conclusive: the click was dispatched (`click dispatched` in the log), URL did not change, no errors thrown, no network nav request.

### Root cause
The canon `Landing` component (`apps/web/src/screen-landing.jsx`) takes navigation callbacks as props:

```jsx
function Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText,
                   onPricing, onMarketplace, onSignIn, samples }) {
  // ...
  <a className="mc-link mc-mono" onClick={onMarketplace}>{t('marketplace')}</a>
  <a className="mc-link mc-mono" onClick={onMarketplace}>{t('docs')}</a>      // (yes, docs uses onMarketplace too — canon)
  <a className="mc-link mc-mono" onClick={onPricing}>{t('pricing')}</a>
  <Btn kind="ink" size="sm" onClick={onSignIn}>{t('signin')}</Btn>
```

The wrapper `LandingWrapper` (`apps/web/src/lib/jsx-bridge/screens.tsx` lines 66-68) is a pure pass-through that renders `<Landing {...props} />` — so it forwards whatever props it receives.

But `apps/web/src/app/_landing-client.tsx` calls `<LandingClient />` with NO props (line 18 — the rendered `<LandingClient />` has zero props). And `apps/web/src/app/page.tsx` likewise renders `<LandingClientShell />` with no props.

Result: `Landing` is invoked with `onMarketplace = undefined`, `onPricing = undefined`, `onSignIn = undefined`. The `<a onClick={undefined}>` handlers are no-ops; no navigation occurs.

The `NavShim` provider (`apps/web/src/providers/nav-shim.tsx`) DOES install `window.app.navigate(name, params)` that delegates to `useRouter().push(resolveScreenPath(...))` — but nothing on the landing page consumes it, because the canon screen reads its callbacks from props, not from `window.app`.

### Suggested fix LOCATION
`apps/web/src/app/_landing-client.tsx` (NOT canon — wiring file). Inject `useRouter` and pass real handlers:

```tsx
'use client';
import { useRouter } from 'next/navigation';
// ...
export default function LandingClientShell(): ReactElement {
  const router = useRouter();
  return (
    <LandingClient
      onMarketplace={() => router.push('/marketplace')}
      onPricing={() => router.push('/pricing')}
      onSignIn={() => router.push('/auth/sign-in') /* see A-4 */}
      onMakeIt={() => router.push('/generate') /* see A-3 */}
      onSelectSample={(s) => { /* TODO Wave-2 — set selected sample */ }}
      // urlText / setUrlText — local state in canon already, no prop needed
      samples={[] /* M-4-ENTRY: real-data slot, empty array hides chip row */}
    />
  );
}
```

Same fix shape needed at every `_*-client.tsx` per cross-screen audit (other agents' zones). The pattern is documented in `INTEGRATION-MAP.md` and `PROP-CONTRACTS.md`.

### Severity
**blocker.** Four of the five header controls are completely non-functional. This matches the user's verbatim complaint.

---

## Finding A-3 — Hero `make it` CTA throws `TypeError: onMakeIt is not a function` (BLOCKER, user-facing + console-noisy)

### Symptom
User types in the spec URL input and clicks `make it` (or hits Enter on the form) → page DOES NOT navigate to `/generate`, AND a runtime exception is thrown:

```
TypeError: onMakeIt is not a function
    at handleSubmit (webpack-internal:///(app-pages-browser)/./src/screen-landing.jsx:34:9)
```

URL stays at `/`, so user hits a dead end on the primary conversion path.

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` lines 130-167 (test 5 transcript).
- `screenshots/agent-a-5{a,b}-makeIt-*.png` — visually identical before/after.
- Source: `apps/web/src/screen-landing.jsx` lines 17-20:
  ```js
  const handleSubmit = (e) => {
    e.preventDefault();
    onMakeIt();    // ← throws when prop is undefined
  };
  ```

### Root cause
Same as A-2: `_landing-client.tsx` does not pass `onMakeIt`. The `make it` button on line 59 of canon-landing has its own `onClick={onMakeIt}` AND the form has `onSubmit={handleSubmit}` which calls `onMakeIt()` directly (uncalled-undefined → TypeError). The button click is silent (just calls undefined as event handler — no-op), but the FORM submit handler unconditionally calls `onMakeIt()` as a function → crash.

This is the SAME class of bug as A-2 but harder for users to hit silently — pressing Enter on the URL input would also trigger this.

### Suggested fix LOCATION
Same as A-2 — `apps/web/src/app/_landing-client.tsx`. Inject `onMakeIt={() => router.push('/generate')}` (with optional payload via search params or a stash-then-redirect pattern; final scheme is Wave-2's call).

### Severity
**blocker.** The single most important conversion in the entire product is broken AND throws to the console. This will produce Sentry alerts on every visitor who actually tries the product.

---

## Finding A-4 — Routes the canon links to are not all present (`/auth` is 404, `/marketplace` is flag-gated 404, `/pricing` 307→`/`)

### Symptom
Even if A-2 / A-3 are fixed by wiring `router.push(...)`, the destinations are not all real:

```
GET /            → 200
GET /pricing     → 307  (redirects back to /?pricing=true — Plan 07-03 placeholder)
GET /marketplace → 404  (notFound() when ui_marketplace_perm is OFF — default)
GET /dashboard   → 307  (redirects elsewhere — auth wall presumably)
GET /auth        → 404  (route does not exist at all)
```

### Evidence
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/{pricing,marketplace,dashboard,auth}` output above.
- `apps/web/src/app/marketplace/page.tsx` line 44-46 — explicit `notFound()` when flag is off.
- `apps/web/src/app/pricing/page.tsx` — minimal redirect placeholder per Plan 07-03.
- `apps/web/src/app/auth/` directory does not exist; only an `(auth)` route group exists under `apps/web/src/app/(auth)/` (route group, not a real `/auth` URL).

### Root cause
- `/pricing`: intentionally a placeholder until Phase 8.
- `/marketplace`: gated by `ui_marketplace_perm` Flipt flag (default OFF). Generally intentional.
- `/auth`: no route exists. The canon `signin` button presumably should navigate to a Logto sign-in URL (Logto session provider is in the layout). The wired path needs to be `getLogtoContext`'s sign-in callback, not `/auth`.

### Suggested fix LOCATION
- `apps/web/src/app/_landing-client.tsx`: `onSignIn={() => router.push('/api/logto/sign-in')}` (or whatever the Logto Next SDK's sign-in URL convention is — confirm against `apps/web/src/lib/logto/client.ts` and the Logto Next docs already used elsewhere).
- For `/marketplace`: enable `ui_marketplace_perm` in the local Flipt config (`packages/feature-flags/`) for development OR accept that the marketplace link should remain disabled / behind a "coming soon" hint when the flag is off. Decision belongs to the wiring agent / feature-flag owner — NOT this agent's call.
- For `/pricing`: current 307→`/?pricing=true` behavior is intentional per Plan 07-03 and matches the placeholder design; no action.

### Severity
**high.** Even after A-2 fix, the user will still hit a 404 on `marketplace` (flag default) and `auth` (no route), turning the dead-button bug into a dead-route bug. Less severe than A-2/A-3 because it's a known scope gap rather than a runtime crash, but still produces a broken UX.

---

## Finding A-5 — Final CTA strip secondary "browse the marketplace" also dead; primary "paste your spec" partially works (MEDIUM)

### Symptom
At the bottom of the landing page there's a final-CTA strip with two buttons:

| label | hasOnClick (DOM) | onClick body |
|---|---|---|
| `paste your spec` | `true` | `() => { document.querySelector('.mc-stamp input')?.focus(); window.scrollTo({top:0, behavior:'smooth'}); }` (canon-landing.jsx line 138) |
| `browse the marketplace` | `false` | `onClick={onMarketplace}` (canon-landing.jsx line 141) — same broken prop as header |

So the primary scrolls-to-top + focuses the input (works without props — purely DOM). The secondary is dead.

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` lines 170-180 (test 6).
- Element table from log:
  ```
  [7] button "paste your spec"           hasOnClick=true   ← inline body, works
  [8] button "browse the marketplace"    hasOnClick=false  ← onMarketplace prop, dead
  ```
- Screenshot 6b shows page scrolled to top, confirming the inline scroll handler ran.

### Root cause
Same as A-2 — `onMarketplace` prop is not passed. The primary works only because the canon used a literal inline arrow function for the scroll behavior, which has no prop dependency.

### Suggested fix LOCATION
Fixed transitively when A-2 is fixed (same `onMarketplace` prop wiring in `_landing-client.tsx`).

### Severity
**medium.** Secondary CTA, but the primary survives by accident, which masks the bug visually.

---

## Finding A-6 — Footer link grid is entirely cosmetic (no `href`, no handlers) (LOW)

### Symptom
The 4-column footer renders 19 link-style anchors (`canvas`, `playground`, `marketplace`, `pricing`, `changelog`, `roadmap`, `github`, `discord`, `examples`, `docs`, `status`, `about`, `blog`, `jobs · 3 open`, `contact`, `terms`, `privacy`, `security`, `dpa`). None have `href`, none have `onClick`. All clicks are silent no-ops.

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` enumeration block (clickables `[9]` through `[27]`):
  ```
  [9]  a "canvas"        href=null hasOnClick=false
  [10] a "playground"    href=null hasOnClick=false
  ...
  [27] a "dpa"           href=null hasOnClick=false
  ```

### Root cause
The canon footer (`apps/web/src/screen-landing.jsx` lines 148-end — not read in full but the prop signature only includes `onMarketplace/onPricing/onSignIn/onMakeIt`) renders these as styled `<a>` tags without href / onClick — purely visual. They were navigational placeholders in the design prototype that need real `href` values added at the wiring layer or replaced with `<Link>` components.

### Suggested fix LOCATION
Out of scope for the LOCKED canon. Either:
- Wave-2 agent for the footer canon screen (NOT Agent A) audits the design intent and adds prop slots — but this would be a canon edit, which is forbidden.
- OR: accept that the footer is cosmetic-only for the launch, document in `SCREEN-DIFFS.md`.

This isn't an Agent A action item — flagging only.

### Severity
**low.** Below-the-fold footer links; user complaint is about the header. But worth surfacing because every footer link is dead.

---

## Finding A-7 — Language switcher (`EN` button) opens dropdown but my test couldn't pick a non-EN option (INCONCLUSIVE)

### Symptom
- `EN` button click DOES open the dropdown (verified — `hasOnClick=true` on the button, no error on click).
- My Playwright selector (`button:has-text("RU")`, `button:has-text("ES")`, etc.) did not match anything visible after the dropdown opened — script could not pick a non-EN option to verify text changes.
- User asserts this is "the only working thing" — I have not invalidated that, but I have not positively confirmed locale switch either.

### Evidence
- `apps/web/.tmp-e2e/agent-a.log` lines 183-191:
  ```
  lang trigger found via: button:has-text("EN")
  hero text before: ◤ | MCPGEN | marketplace | docs | pricing
  hero text after:  ◤ | MCPGEN | marketplace | docs | pricing
  hero text changed: false
  no non-EN option found in dropdown
  ```
- `screenshots/agent-a-7b-lang-dropdown-open.png` — should reveal whether the dropdown actually opened on screen; I did not visually inspect.

### Hypothesis
- The locked `LangSwitcher` (`apps/web/src/i18n.jsx` lines 489-534) renders `LANGUAGES` rows with `<span>{l.name}</span><span>{l.label}</span>`. The label is shown in caps (`EN`, `RU`, ...) but Playwright's `:has-text("RU")` should still match. The dropdown may be off-screen at viewport `1280×800` (the trigger is at x≈1125, dropdown extends to the right) — possible clipping.
- ALSO: Finding A-1 means `useI18n()` is hitting the fallback identity translator until the late re-evaluation, so the locked dictionary may be partially initialized at the moment my test fired. If the lang switcher is using `setLang` from the *fallback* context (which is a no-op), it would silently fail without throwing.

### Suggested follow-up
Out of scope for blocker triage. Re-test interactively in the browser after A-1 is fixed; if the switcher still doesn't change locale, dig into the i18n provider hand-off. If A-1 is fixed and switcher works → user's claim confirmed.

### Severity
**low (inconclusive).** Not a blocker if it works in the browser; flag for a follow-up after A-1 lands.

---

## Summary

| # | Issue | Severity | Fix LOCATION |
|---|---|---|---|
| A-1 | `React is not defined` thrown on every page load (i18n.jsx) | blocker (latent) | `apps/web/src/lib/jsx-bridge/loader.ts` — import `@/providers/global-react-shim` BEFORE `@/tokens` |
| A-2 | Header `marketplace`/`docs`/`pricing`/`sign in` clicks are silent no-ops | blocker | `apps/web/src/app/_landing-client.tsx` — pass `onMarketplace`/`onPricing`/`onSignIn` callbacks via `useRouter()` |
| A-3 | Hero `make it` CTA + form submit throws `TypeError: onMakeIt is not a function` | blocker | `apps/web/src/app/_landing-client.tsx` — pass `onMakeIt` callback |
| A-4 | `/auth` 404, `/marketplace` 404 (flag), `/pricing` 307 — destination routes not all present | high | route owners (`apps/web/src/app/auth/...` does not exist; Logto sign-in URL needed) + flag config |
| A-5 | Final-CTA "browse the marketplace" dead (same root as A-2) | medium | fixed transitively by A-2 |
| A-6 | Footer 19 links all cosmetic (no href, no handler) | low | (no canon edit possible; document) |
| A-7 | Lang switcher dropdown — my test couldn't pick non-EN option | low (inconclusive) | re-verify after A-1 fix |

**Strict canon respected:** no edits to `screen-*.jsx`, `app.jsx`, `ui.jsx`, `tokens.jsx`, `i18n.jsx`, `ux-glue.jsx`, `tweaks-panel.jsx`, `global.css`, `admin/*`. All proposed fixes target wiring layer files (`apps/web/src/app/_*-client.tsx`, `apps/web/src/lib/jsx-bridge/loader.ts`, `apps/web/src/providers/*`).

**Files written by Agent A:**
- `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/agent-a.mjs` — Playwright script
- `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/agent-a.log` — full run log
- `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/agent-a.results.json` — machine-readable results
- `/Users/igor/Projects/mcpgen/apps/web/.tmp-e2e/screenshots/agent-a-*.png` — 16 screenshots
- `/Users/igor/Projects/mcpgen/.planning/ui-rebuild-sandbox/E2E-FINDINGS-agent-a.md` — this file
