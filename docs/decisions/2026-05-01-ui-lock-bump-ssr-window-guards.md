# 2026-05-01 — UI lock bump: SSR window guards in 11 locked JSX files

**Date:** 2026-05-01
**Status:** Accepted (Phase 9.1)
**Decision drivers:** Phase 9.1 CONTEXT D-10 (SSR fix carry-forward), Phase 7 D-03 (visual lock), Phase 7 D-04 (Playwright screenshot-diff), `.pre-commit-hooks/check-ui-locked.sh`, `.github/workflows/scripts/visual-lock-guard.sh`

## Context

The 11 locked JSX files (`apps/web/src/{tokens.jsx, ui.jsx, screen-auth.jsx, screen-canvas.jsx, screen-dashboard.jsx, screen-deploy.jsx, screen-landing.jsx, screen-playground.jsx, screen-preview.jsx, screen-quality.jsx, screen-stream.jsx}`) reference browser-only globals (`window.matchMedia`, `window.localStorage`, `window.addEventListener`, top-level `window.X = ...` exports, etc.) at module top-level. Next.js 15 App Router evaluates these modules in a Node.js SSR context where `window` is undefined → `ReferenceError` at build/render. Local-stack startup on 2026-04-30 surfaced this — the BFF anonymous hero flow cannot be tested end-to-end until the JSX modules SSR cleanly.

Note: `app.jsx` did not require modification — it does not reference `window` at top-level, so the SSR carry-forward affects 11 of 12 files in the locked set.

## Decision

Wrap each top-level `window.X` reference in `if (typeof window !== 'undefined') { ... }` guards. The 11 files are functionally identical at runtime — guards are no-ops in the browser (window defined) and prevent the SSR ReferenceError. NO changes to layout, typography, copy, styling, component composition, or visual output.

Per `check-ui-locked.sh` + `visual-lock-guard.sh` policy (Phase 7 D-03), this technically counts as a visual-lock break, so we pair this ADR with the JSX commit. The CI guard regex `^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-ui-lock-bump.*\.md$` matches this file's name.

## Consequences

### Positive
- Phase 9.1 anonymous flow plans (02–13) can be Vercel-preview tested end-to-end
- Local `pnpm --filter web build` succeeds without ReferenceError
- All Phase 7 acceptance tests (E2E + Playwright screenshot-diff at maxDiffPixelRatio: 0.001) continue to pass — guards are runtime-no-ops in browser

### Negative / Gap
- Sets precedent that "SSR safety" qualifies as visual-lock-bump escape hatch. Future ADRs of similar shape are acceptable IF and ONLY IF they meet the same `git diff` test (zero style/copy/layout changes).
- Playwright screenshot-diff (`apps/web/playwright.visual-lock.config.ts`, maxDiffPixelRatio: 0.001) MUST pass on this commit — this is the third-layer defense per Phase 7 D-04. If diff exceeds 0.1%, this ADR is invalid and the commit is reverted.

## Files modified
- apps/web/src/tokens.jsx
- apps/web/src/ui.jsx
- apps/web/src/screen-auth.jsx
- apps/web/src/screen-canvas.jsx
- apps/web/src/screen-dashboard.jsx
- apps/web/src/screen-deploy.jsx
- apps/web/src/screen-landing.jsx
- apps/web/src/screen-playground.jsx
- apps/web/src/screen-preview.jsx
- apps/web/src/screen-quality.jsx
- apps/web/src/screen-stream.jsx

## References
- `.planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md` D-10
- `.planning/phases/07-frontend-wire-up/07-CONTEXT.md` D-03, D-04
- `.pre-commit-hooks/check-ui-locked.sh`
- `.github/workflows/scripts/visual-lock-guard.sh`
- `.planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md` §7
