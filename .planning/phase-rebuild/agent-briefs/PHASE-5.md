# Phase 5 — Visual Lock + E2E + Final Sign-off

Read `SHARED-BRIEF.md` first.

## Goals

1. **Visual lock CI gate.** Playwright snapshot tests for every public + authed (flag-on) screen at 4 viewports. Pixel diff > 0.5% blocks merge.
2. **E2E flow tests.** Each user journey from landing through deploy works end-to-end with real OpenRouter LLM (~$0.10–0.15 per run; budget ~$5 for full suite cost).
3. **Lighthouse audit.** Core Web Vitals on production build at 1280 viewport. Targets per docs: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms.
4. **Final delete sweep.** Anything labeled `// old`, `// shim`, `// wave-2`, `// TODO wire` not already covered by a flag → either fix or document.

## Sub-agents

### E1 — Snapshot CI gate (1 agent)

- Create `apps/web/playwright.snapshot.config.ts` (extends base config, snaps only).
- Update CI workflow `.github/workflows/visual-lock.yml` to:
  - Boot the full local stack (web + BFF + engine + Flipt).
  - Run snapshot tests against all screens at 4 viewports.
  - Compare against `claude-design-reference/visual-baseline/` ground-truth screenshots.
  - Fail if any screen exceeds 0.5% pixel diff.
  - Upload diff artifacts on failure.
- Per-screen: write `apps/web/src/components/screens/<screen>/<screen>.snapshot.spec.ts` if not done by Phase 1+ agents (most should have already; this fills gaps).

### E2 — E2E flow tests (1 agent)

- Per-journey test files at `apps/web/tests/e2e/`:
  - `landing-to-deploy.spec.ts` (anon hero flow, real Petstore3 OpenAPI, real LLM)
  - `auth-to-dashboard.spec.ts` (Logto sign-in via test account, dashboard renders)
  - `marketplace-flag-off.spec.ts` (flag OFF → 404 canon)
  - `marketplace-flag-on.spec.ts` (flag ON → grid renders with disabled-stub data)
  - `billing-flag-off.spec.ts` (flag OFF → 404)
  - `admin-flag-off.spec.ts` (flag OFF → 404)
  - `admin-flag-on.spec.ts` (flag ON → admin login → dashboard)
- Each test: assert HTTP status, presence of canon copy, screenshot stability.
- Run with `pnpm playwright test apps/web/tests/e2e --workers=1` (serial; LLM rate-limited).

### E3 — Lighthouse audit (1 agent)

- Run `npx lighthouse http://localhost:3000 --output=json` for landing, canvas, preview, dashboard.
- Compare against budgets in `docs/mcpgen-architecture.md` performance section.
- Output: `.planning/phase-rebuild/PHASE-5-LIGHTHOUSE.md` with per-page scores + remediation list if any below budget.

### E4 — Final delete sweep + handoff (me, last)

- `rg -n "// old|// shim|// wave-2|// TODO wire|// removed|// jsx-bridge"` across `apps/web/src/` → zero hits or each one has a flag covering it.
- `rg -n "from '@/screen-|@/app|@/ui|@/tokens|@/i18n|@/ux-glue|@/tweaks-panel|@/admin"` across `apps/web/src/` — zero hits (Phase 4 deleted those aliases).
- `rg -n "window\\.(useI18n|useErrorMode|mcpToast|mcpDrawer|MCPTokens|MCPGEN_ERROR_BUS|app\\.navigate)"` across `apps/web/src/` — zero hits.
- Update `claude-design-reference/PROVENANCE.md` snapshot date.
- Update `MEMORY.md` to mark the rebuild complete and note the new architecture canon.
- Update `docs/mcpgen-frontend-rebuild-contract.md` — final state document.
- Final commit: "chore(rebuild): MCPGen(3) canon migration complete; all phases done; legacy jsx-bridge purged".

## Final acceptance criteria (the ship gate)

1. ✅ All 32 canon screens implemented in TSX
2. ✅ All `_perm` flags registered in Flipt; default OFF for backend-not-ready
3. ✅ Flipping each `_perm` flag ON exposes the corresponding feature without code changes
4. ✅ All Playwright snapshot tests pass at 4 viewports (< 0.5% pixel diff)
5. ✅ All E2E flow tests pass (anon hero flow + auth flow + flag toggle behaviors)
6. ✅ Lighthouse Core Web Vitals within budget on landing/canvas/preview/dashboard
7. ✅ NO references to canon `.jsx` files, window-shim globals, or `_*-client.tsx` shims in `apps/web/src/`
8. ✅ `pnpm tsc --noEmit` exits 0
9. ✅ Dev server + production build both boot clean
10. ✅ `claude-design-reference/canon/` SHA-256 manifest still matches user's `Downloads/MCPGen(3)/`

After all 10 boxes ✓ — rebuild ships. Old jsx-bridge era is over.
