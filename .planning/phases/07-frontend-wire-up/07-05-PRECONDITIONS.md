# Plan 07-05 Preconditions Spike

**Plan:** 07-05 (Wave 3 — dashboard + deploy CTA + Claude Desktop config)
**Recorded:** 2026-04-27
**Author:** Plan 07-05 executor (frontend workstream)

This document records the Task 1 readiness check before Wave 3 wiring. It confirms upstream phase merges, BFF endpoint deltas, and the locked-screen prop shapes the wrappers must respect.

---

## 1. Phase 6 (Runtime Plane) — MERGED

- **Commit:** `e4562ab feat(runtime): ship Phase 6 runtime plane` (also merged into the feature branch via `bccccaf chore(frontend): merge main (Phase 6 runtime) into feature/frontend-integration`).
- **Sign-off:** `.planning/phases/06-runtime-plane/06-PHASE-VERIFICATION.md` confirms 9 REQ IDs closed (RUN-01..07, CLI-02, CLI-03), 9 STRIDE threats mitigated, P99 < 50 ms gate met.
- **Carry-forwards:** 8 (all CF-bound + signed-binary surfaces deferred to Phase 10). Phase 6 currently runs the substitute Bun-native runtime locally; live tenant Workers do not yet emit usage events into a TimescaleDB hypertable — they emit via `bun:sqlite` fallback. The Phase-7 dashboard data path therefore reads from the BFF aggregate endpoint **whose implementation is not yet wired** (see §3 below).

## 2. Phase 8 (Auth + Billing) — MERGED

- **Commit:** `ef75971 feat(ops): ship Phase 8 auth + billing`.
- **Phase 8 endpoints implemented in `apps/api/src/routes/v1/`:**
  - `generate.ts` — `POST /api/v1/generate` (still 501 stub per Plan 07-04 carry-forward; Plan 07-05 does NOT depend on the kickoff body)
  - `jobs/stream.ts` — `GET /api/v1/jobs/:id/stream` (still phase-1 stub)
  - `stripe-webhook.ts` — Stripe webhook ingestion (Phase 8 owns)
  - `billing/checkout.ts` + `billing/portal.ts` — Stripe Checkout + Portal launch
  - `drift.ts` — `GET /deployments/:id/drift-events`, `POST /drift-events/:id/regenerate`, `PATCH /deployments/:id` (CTRL-03 / D-19)

## 3. BFF Endpoint Inventory vs Plan 07-05 Requirements — DELTA RECORDED (carry-forward)

The plan body's `<interfaces>` section assumes Phase 6+8 expose four endpoints. **The current BFF in `apps/api/src/index.ts` does NOT mount any of these.** This is the Wave-3 analogue of Plan 07-04's BFF generate-kickoff gap.

| Plan 07-05 Required Endpoint | Current BFF Status |
|---|---|
| `GET /api/v1/deployments` | NOT IMPLEMENTED. Drift route owns `GET /deployments/:id/drift-events` only. |
| `GET /api/v1/usage/hourly` | NOT IMPLEMENTED. No route under `/usage/*` exists. |
| `POST /api/v1/deploy/:generationId` | NOT IMPLEMENTED. No `/deploy` route exists; `mcpgen deploy` CLI from Phase 6-05 currently spawns a local Bun child process and writes `.mcpgen/state.json` rather than hitting the BFF. |
| `PATCH /api/v1/deployments/:id/badge-public` | NOT IMPLEMENTED. The drift route's PATCH `/deployments/:id` body shape is `DeploymentDriftPatchRequest` (auto-regenerate toggle), NOT `public_badge`. |
| `deployments.public_badge` column | NOT IN db-schema.ts. The `deployments` table currently has no `public_badge` column. |

### Decision: PROCEED with content-agnostic frontend wiring (per CLAUDE.md §10 + Plan 07-04 precedent + parent orchestrator guidance)

Plan 07-04 established the carry-forward pattern when frontend Route Handlers must ship before the BFF endpoints exist:

1. Frontend Route Handlers proxy to `${MCPGEN_BFF_URL}/<endpoint>` and forward the Logto session cookie (T-7-15 mitigation).
2. On BFF unreachable / 404 / 501, return a structured 502 JSON `{ error: 'bff_unreachable', upstream_url, message }` so the dev console makes the gap obvious.
3. Fixture mode is the canonical demo path (Friday cadence) until the BFF closes the gap.
4. Live-mode e2e tests guard with `skipIfNotLive()` so CI is green by default.
5. SUMMARY.md documents the gap as a deferred issue with the BFF route the follow-up phase must implement.

This plan applies the same pattern to all four endpoints. The frontend ships ready for closure; the SUMMARY records the carry-forward.

### Authoritative response shapes used by frontend (forward-compat with future BFF)

Defined locally in `apps/web/src/lib/api/dashboard-client.ts` (with TODO note pointing at `packages/contracts` for post-Phase-9 promotion):

```ts
// GET /api/v1/deployments → { deployments: Deployment[] }
type Deployment = {
  deployment_id: string;            // uuid (db-schema.ts deployments.id)
  generation_id: string;            // uuid
  server_name: string;              // db-schema.ts deployments.cf_worker_name
  server_url: string;               // db-schema.ts deployments.url
  auth_mode: 'passthrough' | 'stored' | 'oauth';
  deployed_at: string;              // ISO datetime (db-schema.ts deployments.created_at)
  quality_report: QualityReport | null;
  public_badge: boolean;            // forward-compat; false until BFF + db migration land
};

// GET /api/v1/usage/hourly?deployment_id=...&from=...&to=... → { rows: UsageHourlyRow[] }
// Mirrors the architecture §7.2 TimescaleDB continuous aggregate column shape
// (per packages/contracts/src/usage-event.ts comments).
type UsageHourlyRow = {
  deployment_id: string;
  hour_bucket: string;              // ISO datetime (Timescale time_bucket('1 hour', time))
  call_count: number;
  total_latency_ms: number;
  total_cost_usd: number;           // null in Phase-6 substitute runtime; non-null after Stripe Meters wires
  error_count: number;
};

// POST /api/v1/deploy/:generationId → 202 OR 409
// 202 → { deployment_id, server_name, server_url, claude_desktop_config: { mcpServers: ... } }
// 409 → { error: 'server_name_collision', existing_name, suggested_name } — D-24 + Pitfall #30

// PATCH /api/v1/deployments/:deploymentId/badge-public → 200 { public_badge: boolean }
```

These shapes are documented as the BFF contract Plan 07-05 wires against. A follow-up phase (Phase 9 integration OR a Phase 8 amendment) closes the BFF + adds the `public_badge` column migration.

---

## 4. Locked Screen Prop Shapes (DO NOT EDIT — read-only verification)

### `apps/web/src/screen-dashboard.jsx`

```jsx
function Dashboard({ onBack, onPlay, sample })
```

- **Props consumed:** `onBack` (callback — TopBar logo click), `onPlay` (callback — playground button click), `sample: LockedSample` (for header crumb + name + ID stub).
- **Internal state:** the screen self-manages `driftOpen` / `driftDismissed` / `diffTab` / `autoRegen` / `rotateOpen`. None of these are exposed as props.
- **No data props:** the dashboard JSX hardcodes its own demo content (SPEC_DIFF, stat numbers, tool list, activity log). **The locked screen has NO prop slots for `deployments[]`, `usage[]`, or per-deployment quality badges.** This is a constraint, not a bug.
- **Implication:** Plan 07-05 must respect the locked content. The wrapper renders the locked screen as-is and exposes the dashboard data via a sibling section below the locked screen — the same `<CodeBlock>` pattern Plan 07-04 used for the preview screen's Stage E source. FE-05 anti-drift is preserved by using ONLY locked CSS-vars in the sibling container.

### `apps/web/src/screen-deploy.jsx`

```jsx
function Deploy({ onDeployed, onBack, sample })
function DeploySuccess({ onDashboard, sample })
```

- **Deploy props:** `onDeployed` (callback — deploy CTA), `onBack`, `sample`.
- **Internal state:** `opt` (deployment target), `auth` (credentials forwarding mode), `deploying` (in-progress shimmer state).
- **The deploy CTA self-fires:** the locked `go()` handler does `setDeploying(true); setTimeout(() => onDeployed(), 1800)`. No collision branching, no `override_name` plumbing, no error rendering. **The locked screen has no slot for the rename modal or for surfacing a 409 collision response.**
- **DeploySuccess props:** `onDashboard` (callback — dashboard navigation), `sample`. The locked screen renders the URL + Claude Desktop config block from a HARDCODED template using `sample?.id`. **There is no prop for `serverName`, `serverUrl`, or `claudeDesktopConfig`.**
- **`config` JSON template is hardcoded** in `screen-deploy.jsx` line 100-109 using `${sample?.id || 'lumen'}`. Plan 07-04 already verified this — it cannot be replaced via props without modifying the locked file (forbidden).
- **Implication for Plan 07-05:**
  - The deploy CTA flow ships in two parts:
    1. The locked `<Deploy>` screen still renders with its built-in `onDeployed` simulation (visual lock).
    2. The `DeployWrapper` adds a sibling section ABOVE the locked screen (via the wrapper's return) that surfaces the REAL deploy state (server name, URL, Claude Desktop JSON, claude:// CTA, 409 rename modal). The sibling section uses ONLY locked CSS-vars (FE-05).
    3. The 409 rename modal uses the existing `mc-modal-veil` + `mc-modal` CSS classes from `global.css` (already used by `screen-dashboard.jsx`'s spec-diff modal and rotate-credential modal — inline modals, NOT a primitive).
  - The wrapper does not modify the locked CTA wiring. When the user clicks the locked deploy button, the wrapper's `onDeployed` callback fires `submitDeploy()` against the BFF and surfaces results in the sibling section.

### `apps/web/src/ui.jsx` Modal Primitive

**No `Modal` export exists in `ui.jsx`.**

```bash
$ grep -n "function Modal\|export.*Modal" apps/web/src/ui.jsx
# (no matches)
```

`ui.jsx` exports: `TopBar`, `Btn`, `Badge`, `Kbd`, `BlockBar`, `Card`, `SectionLabel`, `CountUp`. Modals are inlined per-screen using the `mc-modal-veil` + `mc-modal` + `mc-modal-head` + `mc-modal-body` + `mc-modal-foot` CSS classes from `global.css`.

**Decision:** Plan 07-05 renders the rename modal as inline JSX in `DeployWrapper` using the same CSS classes (`<div className="mc-modal-veil"><div className="mc-modal">…</div></div>`). This pattern is already used by `screen-dashboard.jsx` (spec-diff modal + rotate-credential modal) and `screen-deploy.jsx` siblings, so it is the locked-design vocabulary. **No new visual elements are introduced — only existing CSS classes are reused.** This is the same anti-drift discipline Plan 07-04 used for the Shiki CodeBlock wrapper.

The plan body's text "the locked design has a generic modal primitive in `ui.jsx` — reused, not redrawn" (CONTEXT D-24) must be reconciled: the *modal CSS vocabulary* is locked, but there is no JS primitive. Plan 07-05 reuses the CSS vocabulary, which honors the spirit of D-24 (no new visual elements).

---

## 5. Sample Tenant Worker + Usage Event Confirmation (Phase 6)

Per `06-PHASE-VERIFICATION.md` §"Phase-10 Carry-Forwards", Phase 6 ships the substitute Bun-native runtime: tenant Workers run as local child processes, usage events flow through `usage-emit` (bun:sqlite fallback) into the local Postgres `usage_events` hypertable. The Phase-6 acceptance E2E (`phase-6-acceptance.e2e.test.ts`) drives a sample Stripe deployment + emits usage events.

For Plan 07-05's purposes:
- The wire shape is set: deployments insert + usage_events emit in Phase 6 ✓.
- The TimescaleDB continuous aggregate `usage_hourly` is part of the architecture §7.2 contract — Phase 9 observability owns the actual hypertable + continuous-aggregate creation (not yet performed).
- Plan 07-05 wires against the documented aggregate shape; the BFF endpoint that materializes it is the carry-forward.

This satisfies the "at least one usage event recorded" precondition in the plan body — the wire path exists end-to-end in Phase 6's local-compute substitute, and Plan 07-05 ships the frontend half of the loop.

---

## 6. Decisions / Adjustments

1. **PROCEED with content-agnostic wiring** for all four BFF endpoints. Pattern: live → fetch BFF + structured 502 fallback; fixtures → synthesize from `@mcpgen/engine-fixtures`. Mirror Plan 07-04 precedent.
2. **Document carry-forward in SUMMARY.md** under "Deferred Issues": BFF needs four routes implemented + `deployments.public_badge` column migration. Owner: Phase 9 integration OR Phase 8 amendment.
3. **DashboardWrapper renders the locked screen as-is** (sample-driven) and surfaces real deployment data in a sibling section below — the same anti-drift pattern Plan 07-04 used for Stage E preview. Locked screen prop slots are insufficient for the real data; sibling-section pattern is the only FE-05-safe path.
4. **DeployWrapper renders the 409 rename modal inline** using the existing `mc-modal-veil` / `mc-modal` CSS classes (no `ui.jsx` primitive exists; the CSS vocabulary is the locked-design surface). Plan-body text "Modal primitive callable from this screen" reinterpreted as "the CSS vocabulary of `mc-modal-*` classes is the locked primitive".
5. **Sibling-section above locked Deploy** surfaces real deploy state (server name, URL, Claude Desktop JSON, claude:// CTA) without modifying the locked screen's built-in success simulation. The sibling is rendered conditionally only after a real deploy response has landed.

---

*Plan 07-05 Preconditions Spike — completed 2026-04-27*
