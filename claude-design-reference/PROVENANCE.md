# Canon Reference — Provenance & Read-Only Declaration

## Source of truth

**Origin:** `/Users/igor/Downloads/MCPGen(3)/` (user's downloaded export from Claude Design)

**Linked design URLs (for posterity, may require Anthropic auth):**
- https://api.anthropic.com/v1/design/h/-MrNXjoKs9EX4anPHoWGeQ
- https://api.anthropic.com/v1/design/h/crRBtxo42sY8a6Wf0flW-Q

**Snapshot date:** 2026-05-03 — frozen via SHA-256 manifest at `CHECKSUMS.txt`.

---

## Read-only contract (the I-1 invariant)

The contents of `claude-design-reference/canon/` are **immutable** and represent the **single source of truth** for this project's UI/UX. They MUST NOT be modified by any contributor (human or AI) for any reason. They are reference-only.

Every pixel, every interaction state, every error branch, every copy string in this folder is the final, locked specification. The implementation in `apps/web/src/` exists to render this specification with real data — no visual deviations, no UX shortcuts, no "let's simplify".

**Why this is sacred** (per user, 2026-05-03): the design is god-tier, hand-tuned, and reproducing it 1:1 in production is the entire frontend phase. Any deviation = bug.

---

## What lives here (browsable for implementers, do not edit)

```
claude-design-reference/
├── PROVENANCE.md              # this file
├── CHECKSUMS.txt              # SHA-256 manifest — CI must enforce no drift
├── canon/                     # exact mirror of /Users/igor/Downloads/MCPGen(3)/
│   ├── MCPGen.html            # main app HTML harness (canon entry)
│   ├── admin.html             # admin app HTML harness
│   ├── admin.css              # admin-specific styles
│   ├── global.css             # shared base CSS
│   ├── tokens.jsx             # design tokens (palettes, fonts, scale, shadows)
│   ├── ui.jsx                 # primitive components (Btn, TopBar, Icon, Badge, Card, …)
│   ├── i18n.jsx               # i18n provider + en/ru dictionary + LangSwitcher
│   ├── ux-glue.jsx            # toast/drawer infrastructure + ErrorDemoSwitch
│   ├── tweaks-panel.jsx       # dev-only tweak panel (palette/font swap)
│   ├── app.jsx                # screen router for HTML preview + useErrorMode hook
│   ├── screen-landing.jsx     # public — landing screen
│   ├── screen-auth.jsx        # auth — sign-in/sign-up entry
│   ├── screen-canvas.jsx      # post-paste analysis canvas
│   ├── screen-stream.jsx      # generation pipeline progress + error branches
│   ├── screen-preview.jsx     # final IR preview
│   ├── screen-quality.jsx     # F1/F2/F3 scores
│   ├── screen-playground.jsx  # tool-execution playground
│   ├── screen-deploy.jsx      # Deploy + DeploySuccess (success has MCP url + Claude config)
│   ├── screen-dashboard.jsx   # single-server dashboard
│   ├── screen-dashboard-list.jsx  # multi-server list
│   ├── screen-billing.jsx     # billing/usage/invoices/plan upgrade
│   ├── screen-marketplace.jsx # marketplace browse
│   ├── screen-server-detail.jsx  # marketplace single-server detail
│   └── admin/                 # 18 admin sub-screens (admin-overview/users/servers/…)
│       ├── admin-app.jsx
│       ├── admin-login.jsx
│       ├── admin-ui.jsx       # admin-specific primitives
│       └── …
└── visual-baseline/           # populated by Phase 0 visual-baseline agent
    ├── landing-1280.png       # canonical viewport screenshots
    └── …
```

---

## How to use this folder

### As an implementer (human or AI agent)
1. Read the canon `screen-X.jsx` to understand both the visual layout (JSX tree + inline styles) and the behavior (event handlers, useState, effects, window globals).
2. Implement in `apps/web/src/components/screens/X/` as production TSX using the project stack (Next.js 15 App Router, Tailwind 4, shadcn primitives, next-intl, TanStack Query, Zustand).
3. Replace `window.mcpToast(...)` with `toast(...)` (sonner), `window.mcpDrawer(...)` with `openDrawer(...)` (vaul), `window.useI18n()` with next-intl's `useTranslations()`, `window.useErrorMode()` with the Zustand store at `apps/web/src/stores/error-mode.ts`.
4. Verify pixel match against `visual-baseline/` via Playwright snapshot tests.

### As a reviewer
- Diff the rendered new screen against `visual-baseline/<screen>-<viewport>.png`. Anything > ~0.5% pixel diff = block.
- Flag any text or behavior that drifts from canon.

---

## Update protocol

When the user delivers a new design version:
1. Verify the new source (e.g., `/Users/igor/Downloads/MCPGen(4)/`) and confirm it supersedes this snapshot.
2. Replace `canon/` contents in full (`rm -rf canon/* && cp -R <new>/. canon/`).
3. Regenerate `CHECKSUMS.txt`.
4. Update this file's "Snapshot date" + bump a section "Migration N → N+1" listing what changed.
5. Re-baseline `visual-baseline/`.
6. Run a delta scan in `apps/web/src/components/screens/` to flag screens that need re-implementation.

**No partial updates. No mixing versions.** One snapshot = one truth.

---

## Anti-patterns (banned)

- ❌ Editing any file under `claude-design-reference/canon/`.
- ❌ Importing canon `.jsx` directly into the app at runtime (we tried; SWC rejects, window-shim hell). Canon is read at design-time by humans/agents, not at bundle-time.
- ❌ Stripping unimplemented backend surfaces from new TSX implementations. Per user 2026-05-03: every canon UI surface MUST render in production code; backend-not-ready features are gated by `_perm` flags (default OFF), never deleted.
- ❌ "Simplifying" canon for MVP — the design is the MVP.
