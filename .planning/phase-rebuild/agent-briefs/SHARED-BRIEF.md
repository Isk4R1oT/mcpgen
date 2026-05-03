# Phase 1+ Shared Agent Brief

**Read this once.** Every screen-implementation agent (A1–A5, B1–B4, C1–C4) follows this brief. Per-screen agent prompts add only the screen-specific details on top.

## Mission shape

You implement ONE screen as a production TSX module in `apps/web/src/components/screens/<screen>/`, wire it into the App Router at `apps/web/src/app/<route>/page.tsx`, and verify it pixel-matches the canon baseline screenshot at four viewports. You DO NOT modify canon files, Phase 0 foundation files, or screens owned by other agents.

## Sources you read (READ-ONLY)

| Path | Purpose |
|---|---|
| `claude-design-reference/canon/<screen-file>.jsx` | Visual + behavior spec for your screen — the pixel-perfect target. |
| `claude-design-reference/canon/ui.jsx` | Reference for canon primitive APIs (already implemented in `apps/web/src/components/ui/`). |
| `claude-design-reference/canon/i18n.jsx` lines 13–466 | Original locale strings (already migrated to `apps/web/messages/{en,ru,...}.json`). |
| `claude-design-reference/canon/app.jsx` | Cross-screen state: `useErrorMode`, `MCPGEN_ERROR_BUS` (already migrated to `apps/web/src/stores/error-mode.ts`). |
| `claude-design-reference/canon/ux-glue.jsx` | Toast / drawer hosts + `mcpToast`/`mcpDrawer` API (already migrated to `apps/web/src/lib/{toast,drawer}.ts(x)`). |
| `claude-design-reference/visual-baseline/<screen>-{375,768,1280,1920}.png` | Ground truth for pixel-match. Your Playwright snapshot tests compare against these. |
| `.planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md` | The full catalog of behaviors / hooks / endpoints / drawer types / flags per screen. Find your screen's section. |
| `.planning/phase-rebuild/MASTER-PLAN.md` | Overall phase plan. |
| `apps/web/src/components/ui/index.ts` | Phase 0 primitives barrel — import `Btn`, `TopBar`, `Icon`, `Badge`, `Card`, `Input`, `Stamp`, `SectionLabel`, `Switch` from here. |
| `apps/web/src/lib/api/*` | Typed BFF clients + TanStack Query hooks. Use `useGenerate`, `useJob`, `useDeployments`, etc. instead of `fetch`. |
| `apps/web/src/lib/{toast,drawer}.ts(x)` | `toast(msg, opts)` and `openDrawer(title, body, opts)` — replace canon `window.mcpToast`/`window.mcpDrawer`. |
| `apps/web/src/stores/error-mode.ts` | Zustand `useErrorMode()` — replace canon `window.useErrorMode()`. |
| `apps/web/src/lib/sse/use-generation-sse.ts` | Typed SSE consumer for `/api/v1/jobs/[jobId]/stream`. |

## Outputs you write

```
apps/web/src/components/screens/<screen>/
├── <screen>.tsx               # primary screen component (Client Component if interactive)
├── <screen>.test.tsx          # vitest unit smoke (renders, key props honored)
├── <screen>.snapshot.spec.ts  # Playwright visual snapshot at 375/768/1280/1920
└── <screen>.flow.spec.ts      # Playwright user-flow E2E (primary action works)

apps/web/src/app/<route>/page.tsx   # Server Component shell that imports the screen
apps/web/src/app/<route>/_<route>-client.tsx   # ONLY if route needs client-side props prep
```

## Implementation rules

1. **100% pixel parity with canon.** Trace canon JSX carefully; preserve every layout, spacing, color, font, animation, error branch. When unsure, the canon is right.
2. **Replace `window.*` globals** with the migrated equivalents:
   - `window.useI18n()` → `useTranslations()` from `next-intl` (or `useLocale()` for the bare lang).
   - `window.useErrorMode()` → `useErrorMode()` from `@/stores/error-mode`.
   - `window.mcpToast(msg, opts)` → `toast(msg, opts)` from `@/lib/toast`.
   - `window.mcpDrawer(title, body, opts)` → `openDrawer(title, body, opts)` from `@/lib/drawer`.
3. **Use canon `mc-*` classes** from globals.css for canon-styled elements. Use Tailwind utilities only when they map cleanly to canon vars.
4. **All canon UI surfaces survive in code.** If your screen has a CTA whose backend isn't ready (e.g. "install" button on marketplace, drift "regenerate" button on dashboard), render the canon UI exactly. Wire the action behind a `_perm` flag eval. Flag OFF → either visibly disable + tooltip "Coming soon" OR run a friendly `toast()`. Decide per the catalog. **NEVER strip the UI.**
5. **Real data only on production paths.** No mock arrays. Use the typed BFF client. If the BFF endpoint doesn't exist yet → use the disabled-state stub from `lib/api/*` which returns `{ ok: false, error: 'flag_off_or_not_implemented' }` and render the canon's loading / empty / disabled state.
6. **Server vs Client split.** `app/<route>/page.tsx` is a Server Component. The screen body is a Client Component (canon screens use hooks). The page server-fetches what it can (initial data, claims) and passes via props; the client takes over for interactions.
7. **No `'use client'` in `app/<route>/page.tsx`** unless absolutely necessary. The interactive screen body has it.
8. **Type-safe everything.** No `any`. No `unknown` without a Zod parse first.
9. **Routes' flag gates** for the whole route segment (e.g. `/admin`, `/billing/*`, `/marketplace/*`) live in `apps/web/src/middleware.ts` and were set up in Phase 0; you don't add new gates there. You add per-action flag gates inside your component.
10. **Do not modify canon, Phase 0 outputs, or other screens.** Each screen agent has strict file ownership.

## Visual snapshot test pattern

```ts
// apps/web/src/components/screens/<screen>/<screen>.snapshot.spec.ts
import {expect, test} from '@playwright/test';

const VIEWPORTS = [{w:375,name:'mobile'},{w:768,name:'tablet'},{w:1280,name:'desktop'},{w:1920,name:'wide'}];
for (const {w,name} of VIEWPORTS) {
  test(`<screen> @ ${name} matches canon baseline`, async ({page,browserName}) => {
    await page.setViewportSize({width: w, height: 900});
    await page.goto('http://localhost:3000/<route>');
    await page.waitForLoadState('networkidle');
    expect(await page.screenshot({fullPage: true})).toMatchSnapshot({
      name: `<screen>-${w}.png`,
      maxDiffPixelRatio: 0.005, // <0.5% diff allowed
    });
  });
}
```

## Flow test pattern

```ts
// <screen>.flow.spec.ts — example for landing → generate
import {expect, test} from '@playwright/test';
test('landing → generate primary CTA', async ({page}) => {
  await page.goto('http://localhost:3000/');
  await page.locator('.mc-stamp input').fill('https://petstore3.swagger.io/api/v3/openapi.json');
  await page.locator('button', {hasText: /make it|сгенерировать/i}).click();
  await page.waitForURL(/\/generate/);
  expect(page.url()).toMatch(/\/generate(\?|$)/);
});
```

## Anti-patterns (banned)

- ❌ Importing canon `.jsx` files at runtime (the old `lib/jsx-bridge` path is being dismantled — Phase 4 deletes it).
- ❌ Inline mock data arrays. Use BFF clients (real or disabled-stub).
- ❌ Re-implementing primitives. Use `apps/web/src/components/ui/`.
- ❌ Modifying primitives or globals.css to "fit" a screen. Surface a complaint in the deliverable instead.
- ❌ Skipping visual snapshot test or flow test.
- ❌ Re-implementing already-typed SSE / fetch flows. Use existing hooks.
- ❌ Multi-screen agents. One agent owns one screen (or one tightly-coupled pair like Preview+Quality).
- ❌ "Quick simplification of canon" — the design IS the spec.
- ❌ Side-effect canon imports anywhere new.
- ❌ Modifying `apps/web/src/screen-*.jsx`, `app.jsx`, `ui.jsx`, `tokens.jsx`, `i18n.jsx`, `tweaks-panel.jsx`, `ux-glue.jsx`, `global.css`, `admin/*` — these are the OLD jsx-bridge system being deleted in Phase 4. DO NOT TOUCH.

## Deliverable format

End your run with:
1. List of files written/modified (paths only).
2. Confirmation that `pnpm tsc --noEmit` exits 0.
3. Confirmation that `pnpm vitest run src/components/screens/<screen>` is green.
4. Confirmation that `pnpm playwright test src/components/screens/<screen>` is green at all 4 viewports.
5. Five-line summary of what you implemented.
6. Any blockers — e.g. backend endpoint missing that you couldn't stub gracefully, primitive missing from UI kit, etc.

If a backend endpoint doesn't exist and the screen can't render meaningful content with the disabled-stub, document it and add a flag entry to `.planning/phase-rebuild/FLAGS-NEEDED.md` (create the file if it doesn't exist; one bullet per flag with proposed key + behavior).

Hard cap per agent: 90 minutes wall time.
