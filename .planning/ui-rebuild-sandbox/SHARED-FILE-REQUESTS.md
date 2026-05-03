# SHARED FILE REQUESTS — M-4 cross-agent edit queue

Per `docs/mcpgen-frontend-rebuild-contract.md` §6.5.5 — agents that need
changes to files outside their authority queue requests here. The
orchestrator (Igor) batches and applies them.

Each entry follows this template:

```
## Request from <Agent N>
File: <repo-relative path>
Change: <one-sentence imperative>
Reason: <link to contract section / brief>
Snippet: <minimal code patch or pseudo-diff>
```

---

## Request from Agent 5

**File:** `apps/web/src/app/layout.tsx`

**Change:** Conditionally mount the locked `<TweaksPanel />` (from
`apps/web/src/tweaks-panel.jsx`) inside the body, gated behind the
`ui_tweaks_panel_perm` feature flag (default OFF, internal_users
segment → ON via M-5 Flipt rule).

**Reason:** Per `mcpgen-frontend-rebuild-contract.md` §5.1 the tweaks
panel is dev-tooling for design-token tweaking and must be invisible
to end users. Agent 5 owns the flag definition (already added to
`packages/feature-flags/{default,staging,production}/features.yaml` +
`_manifest/flags.yaml`) but the layout is Agent 4-entry's authority,
so the mount call cannot be added directly from Agent 5's worktree
(`feature/m4-gated`).

**Notes for orchestrator:**

- The locked `TweaksPanel` registers itself on `window.TweaksPanel`
  via `tweaks-panel.jsx` — it is NOT auto-imported anywhere today, so
  there is currently zero render-time presence. This request is
  defensive: add the mount before any agent decides to lazy-mount it
  unconditionally.
- Because the flag is `_perm` (long-lived) the eval should happen
  server-side in `RootLayout` via `evaluateBooleanFlag` from
  `@/lib/flags`. Recommended placement: a child island under
  `<NavShim>` so it inherits the same render boundary as the rest of
  the locked screen plumbing.
- Skip-mount path: when the flag returns `false`, render no node at
  all — do NOT render an invisible placeholder.

**Suggested patch sketch (entry agent will adapt):**

```tsx
// apps/web/src/app/layout.tsx — inside RootLayout, after <ApplyTokens />
import { evaluateBooleanFlag } from '@/lib/flags';

// (inside the async server component — RootLayout would need to become async)
const tweaksEnabled = await evaluateBooleanFlag(
  'ui_tweaks_panel_perm',
  /* anonymous at layout level — segment match resolves on email_domain */ 'anonymous',
  {},
  false,
);

// then inside JSX:
{tweaksEnabled ? <TweaksPanelClientShell /> : null}
```

The `TweaksPanelClientShell` is a thin `'use client'` shell that
imports `tweaks-panel.jsx` via the existing jsx-bridge loader pattern
— Agent 4-infra can adapt the mount as they see fit; the only
contract is "behind the flag, default OFF."
