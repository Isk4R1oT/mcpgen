# M-7 — Visual-Lock Snapshot Refresh (Manual Step)

## Status: NOT REGENERATED IN AGENT CONTEXT — manual run required

After M-3 + M-4 the canonical UI replaced all 9 screens. The 3 existing
baselines in `apps/web/tests/visual-lock/__screenshots__/` (`landing.png`,
`sign-in.png`, `sign-up.png` — Apr 30 13:42) are STALE. The other 6
baselines (canvas, stream, preview, quality, playground, deploy, dashboard)
were never captured (Plans 07-03/04/05 left them as TODO).

## Why agent could not run it

1. **Default `testDir` excludes visual-lock.** `apps/web/playwright.config.ts`
   pins `testDir: 'tests/e2e'`. The visual-lock specs at
   `apps/web/tests/visual-lock/9-screens.spec.ts` are not picked up by
   `pnpm playwright test` without an explicit override.
2. **Snapshot path template is custom.** Existing baselines live flat in
   `__screenshots__/` (not Playwright's default
   `9-screens.spec.ts-snapshots/<test-id>/...`). The
   `snapshotPathTemplate` config that produced this layout is NOT in the
   current `playwright.config.ts` — capturing new snapshots without it
   will write them to a different path and the locks will silently
   diverge from the committed baselines.
3. **Webserver needs production build + fixtures.** The config's
   `webServer.command` is
   `MCPGEN_FRONTEND_MODE=fixtures pnpm --filter=@mcpgen/web start`
   (i.e. requires a prior `pnpm build`). Heavy + slow + has not been
   verified end-to-end with M-3/M-4 fixture wiring in this branch.
4. **Context budget.** Agent context was at 78% when M-7 started; running
   a full prod build + 9 snapshot captures + visual triage would not fit.

## Manual command to run (after fixture wiring is verified)

```bash
# 1. Verify (or add) snapshotPathTemplate so screenshots land flat in
#    apps/web/tests/visual-lock/__screenshots__/<name>.png. Without this,
#    Playwright will write to 9-screens.spec.ts-snapshots/ instead.
#    Add to apps/web/playwright.config.ts under `expect`:
#      toHaveScreenshot: { ..., snapshotPathTemplate:
#        '{testDir}/visual-lock/__screenshots__/{arg}{ext}' }

# 2. Build web app for the prod webServer.
pnpm --filter=@mcpgen/web build

# 3. Regen all 9 fixture-mode baselines (skips live-mode by default).
cd apps/web && pnpm playwright test \
  --config=playwright.config.ts \
  tests/visual-lock/9-screens.spec.ts \
  --update-snapshots

# 4. Glance at __screenshots__/*.png — confirm each matches the canonical
#    zip render (no white-screen, no console-error overlay, fonts loaded,
#    nav present, route-specific structure visible).

# 5. Commit:
git add apps/web/tests/visual-lock/__screenshots__/
git add apps/web/playwright.config.ts   # if snapshotPathTemplate added
git commit -m "test(web): refresh visual-lock snapshots to canonical UI (M-7)"
```

## Expected output (9 files)

- `landing.png`        — canonical hero + URL paste card
- `sign-in.png`        — Logto sign-in screen wrapper
- `sign-up.png`        — Logto sign-up screen wrapper
- `canvas.png`         — `/generate` empty canvas (URL input + generate CTA)
- `stream.png`         — `/generate/<job>` SSE timeline mid-stream
- `playground.png`     — `/generate/<job>/playground` tool tester
- `preview.png`        — `/generate/<job>/preview` bento layout
- `quality.png`        — `/generate/<job>/quality` quality report
- `deploy.png`         — `/generate/<job>/deploy` deploy form
- `dashboard.png`      — `/dashboard` (Logto-protected; locked render
                         only — middleware redirect to sign-in is the
                         expected flow when not authenticated; capture
                         depends on fixture-mode auth bypass)

(That is 10 files counting dashboard; the spec describes 9 fixture-mode
screens; dashboard is `Plan 07-05`.)

## Risks for M-8 verification

1. **Dashboard snapshot may capture sign-in redirect** instead of the
   locked dashboard render if fixture-mode does not bypass Logto. M-8
   should pre-verify that `MCPGEN_FRONTEND_MODE=fixtures` short-circuits
   middleware auth or that a fixture session cookie is seeded.
2. **Stream/playground baselines are time-sensitive** (`waitForTimeout(500)`
   then capture). Animated SSE progress may produce flaky snapshots —
   M-8 should run regen 2x and compare to confirm determinism.
3. **`quality` and `dashboard` use `networkidle` / `domcontentloaded` +
   timeout** — on slow CI runners initial frame may differ. Consider
   awaiting a specific selector instead of timeout in a follow-up.
4. **No `snapshotPathTemplate` currently in config** — confirm before
   regen; otherwise new baselines will be written to a different path
   and the existing 3 will appear stale forever.
5. **Live-mode baselines** (`*-live.png`) are ALL missing and only run
   when `MCPGEN_FRONTEND_MODE=live`. Out of M-7 scope; capture in a
   later phase once the local engine is wired.

## Follow-up

- Owner: M-8 verification phase
- Blocker: confirm fixture-mode SSE timeline determinism + middleware
  bypass before regen
- ETA: < 30 min once webServer boots cleanly in fixtures mode
