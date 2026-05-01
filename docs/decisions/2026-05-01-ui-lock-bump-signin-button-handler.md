# 2026-05-01 — UI lock bump: wire sign-in button handler in screen-landing.jsx

**Date:** 2026-05-01
**Status:** Accepted (Phase 9.1 follow-up)
**Decision drivers:** Phase 9.1 anonymous-flow live testing 2026-05-01 surfaced that the `sign in` button in `apps/web/src/screen-landing.jsx` line 31 was rendered as a bare `<Btn>` with no `onClick` / `href` — clicking it did nothing. Logto routes (`/api/auth/logto/sign-in` per `apps/web/src/app/api/auth/logto/sign-in/route.ts`) were wired in Phase 7 plan 02 but never plumbed to the landing chrome. Phase 7 D-03 visual-lock policy + `.pre-commit-hooks/check-ui-locked.sh`.

## Context

The locked file `apps/web/src/screen-landing.jsx` (line 31) renders the top-right `sign in` button. Without an `href` or click handler it cannot navigate anywhere. The Logto sign-in flow already exists at `/api/auth/logto/sign-in` (Phase 7) but the landing chrome never used it. This is a behavior gap, not a visual gap — the button looks identical, but the missing wire was blocking the most obvious entry point to authenticated flow during live testing.

## Decision

Wrap the existing `<Btn kind="ink" size="sm">sign in</Btn>` in an `<a href="/api/auth/logto/sign-in">` with `style={{ textDecoration: 'none' }}` so:

1. The Btn renders identically (anchor underline suppressed via inline style; Btn's own visual treatment unchanged).
2. Clicking navigates to the existing Logto sign-in route, which redirects to Logto's hosted UI per `apps/web/src/app/api/auth/logto/sign-in/route.ts`.
3. No layout, typography, copy, or spacing change.

NO other locked-file edits in this commit.

## Consequences

### Positive
- The single most obvious "I want to sign up" entry point on the landing page now works end-to-end.
- The Logto sign-in screen has a "Create account" link, so this same anchor doubles as the sign-up entry per Phase 7 plan 02 design (sign-up route is `/api/auth/logto/sign-up`, same `signIn()` server-action invocation with `firstScreen: 'register'`).

### Negative / Gap
- Sets precedent that "wiring previously-rendered-but-dead UI to existing backend routes" qualifies as a visual-lock-bump escape hatch. Future ADRs of this shape are acceptable IF and ONLY IF: (a) the visual treatment is unchanged (verifiable via Playwright screenshot-diff at maxDiffPixelRatio 0.001), and (b) the wired-to route already exists in `apps/web/src/app/api/`.
- Playwright screenshot-diff (`apps/web/playwright.visual-lock.config.ts`, maxDiffPixelRatio 0.001) MUST pass on this commit.

## Files modified

- `apps/web/src/screen-landing.jsx` (line 31 only — wraps the existing `<Btn>` in an `<a>`)

## References

- `.planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md` D-04 (claim-flow expects authenticated entry from landing)
- `.planning/phases/07-frontend-wire-up/07-CONTEXT.md` D-03 (visual lock), D-04 (Playwright screenshot-diff)
- `apps/web/src/app/api/auth/logto/sign-in/route.ts` (existing Logto entry route)
- `apps/web/src/app/api/auth/logto/sign-up/route.ts` (existing Logto sign-up entry route)
