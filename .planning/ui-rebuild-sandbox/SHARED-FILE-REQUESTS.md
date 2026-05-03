# Shared-File Change Requests

Single writer = orchestrator. Per `docs/mcpgen-frontend-rebuild-contract.md`
§6.5.5, agents that need changes inside another agent's file authority
queue requests here; orchestrator batches and applies them.

Each entry follows this template:
```
## REQ-NNN — <one-line summary>
- **Requested by:** <Agent>
- **Authority:** <owning agent / module>
- **Purpose:** <why>
- **Status:** OPEN | APPLIED | REJECTED
```

---

## REQ-001 — `apps/api/src/routes/v1/run-tool.ts` (NEW endpoint)

- **Requested by:** M-4 Agent 3 (ACTIONS — playground wiring)
- **Authority:** apps/api owner (orchestrator / runtime workstream)
- **Purpose:** Wire the locked Playground screen's tool-execution callback
  to a real BFF endpoint so the agent dropdown + trace panel render real
  metrics instead of the canon `list_charges` placeholder.
- **Endpoint shape:**
  ```
  POST /api/v1/jobs/:jobId/run-tool
  Body:    { tool_name: string, args: Record<string, unknown> }
  Returns: { result?: unknown, text?: string, tokens?: number, latency_ms?: number }
  ```
- **Frontend contract (already in place):**
  - `apps/web/src/lib/jsx-bridge/index.ts` exports `PlaygroundRunArgs` +
    `PlaygroundRunResult` types matching the shape above.
  - `apps/web/src/app/generate/[jobId]/playground/_playground-client.tsx`
    POSTs to this URL via `fetch`; on 404 the wrapper surfaces a friendly
    "endpoint not yet available" rejection and the locked screen renders
    its failed-trace branch deterministically.
- **Phase:** Tracked as Phase M-5 deliverable per the rebuild contract
  §6 sequencing (after M-4 wraps the screens, M-5 backfills missing
  endpoints + rolls feature flags).
- **Reference:** `.planning/ui-rebuild-sandbox/INTEGRATION-MAP.md` §2.6
  (currently lists run-tool as MISSING).
- **Status:** OPEN — no apps/api implementation; frontend wraps gracefully
  via 404-detection.

---

## REQ-002 — Mount `<TweaksPanel />` behind `ui_tweaks_panel_perm`

- **Requested by:** M-4 Agent 5 (GATED)
- **Authority:** Agent 4-entry / orchestrator (apps/web/src/app/layout.tsx)
- **Purpose:** Per `mcpgen-frontend-rebuild-contract.md` §5.1 the tweaks
  panel is dev-tooling and must be invisible to end users.
- **Status:** OPEN — orchestrator (M-5 phase) will apply the conditional
  mount; current state is "panel never mounts" which is safe.
- **Suggested patch sketch:**
  ```tsx
  // apps/web/src/app/layout.tsx — inside RootLayout, after <ApplyTokens />
  import { evaluateBooleanFlag } from '@/lib/flags';
  const tweaksEnabled = await evaluateBooleanFlag(
    'ui_tweaks_panel_perm',
    'anonymous',
    {},
    false,
  );
  {tweaksEnabled ? <TweaksPanelClientShell /> : null}
  ```
- **Notes:**
  - Locked `TweaksPanel` registers on `window.TweaksPanel` via
    `tweaks-panel.jsx` — it is NOT auto-imported anywhere today, so the
    "invisible to end users" property already holds. This request is
    defensive against future inadvertent unconditional mount.
  - Skip-mount path: when flag is `false`, render NO node at all — do
    NOT render an invisible placeholder.
