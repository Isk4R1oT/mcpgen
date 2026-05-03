# Phase 4 — Flag wiring + OLD code purge

Read `SHARED-BRIEF.md` first. **Most important phase — this is where we enforce the user principle "all features survive in code, gated by flags".**

## D1 — Flag audit (1 agent, sequential first)

**Mission:** enumerate every "backend not ready" surface across the new TSX implementation. Produce the master list of flags.

**Sources:**
- `.planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md` — already proposes ~22 flags. Refine.
- `.planning/phase-rebuild/FLAGS-NEEDED.md` — agents from Phase 1–3 added entries here.
- `apps/api/src/routes/v1/*` — confirm which BFF routes actually exist.

**Output:** `.planning/phase-rebuild/PHASE-4-FLAG-MASTER.md` — single source of truth with one row per flag:

| Flag key | Type | Default | Surfaces gated | Behavior when OFF | Backend dependency |
|---|---|---|---|---|---|
| `ui_admin_panel_perm` | `_perm` | OFF | `/admin/*` (entire namespace) | middleware → 404 | admin BFF endpoints (50+) |
| `ui_marketplace_perm` | `_perm` | OFF | `/marketplace/*` | middleware → 404 | marketplace BFF endpoints |
| `ui_marketplace_install_perm` | `_perm` | OFF | "Install" CTA on ServerDetail | toast("coming soon"); button visually disabled | install BFF endpoint |
| `ui_billing_active_perm` | `_perm` | OFF | `/billing/*` | middleware → 404 | Stripe checkout/portal |
| `ui_tweaks_panel_perm` | `_perm` | OFF | dev tweaks-panel + ErrorModeSwitch | not mounted | none (dev-only) |
| `ui_playground_run_tool_perm` | `_perm` | OFF | "Run tool" button on Playground | renders trace-failed state | run-tool BFF endpoint |
| `ui_dashboard_drift_regenerate_perm` | `_perm` | OFF | drift "regenerate" CTA | toast | drift-regenerate endpoint |
| ... | ... | ... | ... | ... | ... |

**After producing the master list:** push every flag to Flipt via `packages/feature-flags/scripts/bootstrap.mjs` so they exist in the runtime. All `_perm` flags default OFF.

## D2 — Disabled-state UX (3 parallel agents)

For every flag in the master list, ensure the rendered UI when flag is OFF matches the canon design:
- D2-actions: in-screen action buttons (install, run-tool, drift-regenerate, plan-upgrade, etc.) — gated by their `_perm` flag client-side or server-side.
- D2-routes: middleware-level gates for entire route segments (`/admin`, `/marketplace`, `/billing`).
- D2-stubs: BFF clients return `flag_off_or_not_implemented` consistently; screen renders canon empty / loading / disabled state.

Test: with all flags OFF (default), every screen still renders without errors; every CTA is either visually disabled (per canon disabled state) or trips a friendly `toast()` on click.

Test: flip ANY ONE `_perm` flag to ON in Flipt → that one feature lights up, but no other features change. Document in `PHASE-4-FLAG-MASTER.md` as test cases.

## D3 — OLD code purge (1 sequential agent, AFTER D1+D2 verified green)

**Delete the entire old jsx-bridge / shim system.** Run the dev server immediately after each deletion to confirm nothing breaks. Atomic commits per group.

### Deletion list (commit-by-commit):

#### Commit 1: delete legacy canon JSX siblings
```
apps/web/src/screen-*.jsx          (all 13 main canon JSX files — bytes-identical to claude-design-reference/canon/, redundant)
apps/web/src/app.jsx
apps/web/src/ui.jsx
apps/web/src/tokens.jsx
apps/web/src/i18n.jsx
apps/web/src/tweaks-panel.jsx
apps/web/src/ux-glue.jsx
apps/web/src/global.css            (singular, legacy — Phase 0 globals.css supersedes)
apps/web/src/admin/                (entire folder — 18 admin canon files, will be reimplemented as TSX in Phase 3)
```

After this commit: dev server should still boot because no production TSX imports any of these (they were only consumed by `lib/jsx-bridge/loader.ts` which we delete next).

#### Commit 2: delete jsx-bridge system
```
apps/web/src/lib/jsx-bridge/       (entire folder — loader, screens.tsx wrappers, index.ts barrel, types.d.ts)
```

#### Commit 3: delete provider shims
```
apps/web/src/providers/global-react-shim.ts
apps/web/src/providers/error-mode-shim.ts
apps/web/src/providers/i18n-provider.tsx     (replaced by NextIntlClientProvider in layout.tsx)
apps/web/src/providers/nav-shim.tsx          (canon-only)
```

Update `apps/web/src/app/layout.tsx`: remove imports of these. Keep `LogtoSessionProvider`, `QueryProvider`, `Toaster`, `DrawerHost`, `ErrorModeSwitch`, `TweaksPanelClientShell`. (`I18nProvider` removal: confirmed `NextIntlClientProvider` is the new system.)

#### Commit 4: delete webpack JSX brace loader (no longer needed)
```
apps/web/scripts/jsx-brace-escape-loader.cjs
```
Edit `apps/web/next.config.js`: remove the `config.module.rules.push({...jsx-brace-escape-loader...})` block.

#### Commit 5: delete `_*-client.tsx` route shims
For each route under `apps/web/src/app/`, delete the legacy `_*-client.tsx` shim if a new screen component supersedes it. Update `page.tsx` to import the new `components/screens/<screen>/<screen>.tsx` directly.

```
apps/web/src/app/_landing-client.tsx        (Phase 1 A1 replaces)
apps/web/src/app/generate/_canvas-client.tsx (Phase 1 A2 replaces)
apps/web/src/app/generate/[jobId]/_stream-client.tsx (Phase 1 A3 replaces)
apps/web/src/app/generate/[jobId]/preview/_preview-client.tsx (Phase 1 A4)
apps/web/src/app/generate/[jobId]/quality/_quality-client.tsx (Phase 1 A4)
apps/web/src/app/generate/[jobId]/playground/_playground-client.tsx (Phase 1 A5)
apps/web/src/app/generate/[jobId]/deploy/_deploy-client.tsx (Phase 1 A5)
apps/web/src/app/dashboard/_dashboard-client.tsx (Phase 2 B2)
apps/web/src/app/marketplace/_marketplace-client.tsx (Phase 2 B4)
apps/web/src/app/_apply-tokens.tsx          (canon token applier — replaced by static globals.css)
apps/web/src/components/tweaks-panel-client-shell.tsx (canon-only — replaced by new tweaks panel TSX)
apps/web/src/components/canon-screen-loader.tsx (if still exists)
```

#### Commit 6: cleanup of stale BFF clients superseded by Phase 0 F-BFFClients
```
apps/web/src/lib/api/client.ts              (replaced by client-base.ts + generate.ts)
apps/web/src/lib/api/dashboard-client.ts    (replaced by dashboard.ts)
```
Verify no remaining importers, update if any.

#### Commit 7: tsconfig path cleanup
Remove `@/screen-*`, `@/app`, `@/ui`, `@/tokens`, `@/i18n`, `@/global.css`, `@/ux-glue`, `@/tweaks-panel`, `@/admin` aliases from `tsconfig.json` `paths` (they no longer resolve to anything).

### After D3:

- `cd apps/web && pnpm tsc --noEmit` — exit 0
- `cd apps/web && pnpm vitest run` — all tests pass
- `cd apps/web && pnpm playwright test` — all snapshot + flow tests pass at all 4 viewports
- Boot dev server, smoke-test landing → /generate → stream → preview → quality → playground → deploy. All green.
- Final check: NO files under `apps/web/src/` reference canon `.jsx` siblings, `window.useI18n`, `window.mcpToast`, `window.useErrorMode`, `window.MCPTokens`, or any other canon-only globals. Use `rg` to verify zero matches.

Hard cap: D1 60min, D2 90min total, D3 120min.
