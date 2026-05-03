# Flags Needed (Phase 1+ Backlog)

Surfaced by per-screen agents as they encounter UI surfaces whose backend
isn't ready. Each flag defaults OFF; when OFF the canon UI still renders
and clicks fire a `toast()` stub. Flipping ON requires the backend route to
exist (see SCREEN-BEHAVIORS-CATALOG.md for endpoint mapping).

Format: one bullet per flag, `<key>` (default-state) — behavior + when to flip.

## Phase 1 — Stream screen (Agent A3)

- `ui_stream_ai_repair_perm` (OFF) — recovery CTA "try repair with ai" on the
  spec-fail card. Flip ON when AI re-parse pipeline lands.
- `ui_stream_inline_edit_perm` (OFF) — recovery CTA "edit spec inline".
  Flip ON when inline editor ships.
- `ui_stream_alt_auth_perm` (OFF) — auth-fail recovery "use a different
  scheme". Flip ON when alt-auth flow (oauth2 client_credentials) is wired.
- `ui_stream_skip_auth_perm` (OFF) — auth-fail recovery "skip auth
  (read-only)". Flip ON when read-only generation mode lands.
- `ui_stream_email_notify_perm` (OFF) — "notify me when done" CTA. Flip ON
  when transactional email is wired (Phase 4+).

A3 currently wires every CTA to a `toast()` stub directly (no Flipt eval at
the call site yet). Phase 2 wraps them with `evaluateBooleanFlag` calls and
the toast becomes the OFF-branch fallback per
`docs/mcpgen-feature-flags-contract.md` §4.4.

## Phase 2 — Marketplace + ServerDetail (Agent B4)

- `ui_marketplace_perm` (OFF) — gates the entire `/marketplace` and
  `/marketplace/[serverId]` route segments. When OFF middleware/route
  returns 404. Flip ON once the marketplace BFF endpoints
  (`GET /api/v1/marketplace/servers`, `GET /api/v1/marketplace/servers/:id`)
  exist AND `useMarketplaceServers()` / `useMarketplaceServer()` switch
  from disabled-stub to live mode.
- `ui_marketplace_install_perm` (OFF) — wires the "install" CTA on
  ServerDetail (header button, right-rail "add to claude desktop" /
  "add to cursor"). When OFF the click fires
  `toast('Coming soon — install requires backend wiring')`. Flip ON when
  the dispatch-worker install flow + `POST /api/v1/marketplace/servers/:id/install`
  are live.

## Phase 2 — Auth screen (Agent B1)

- `ui_auth_validate_perm` (OFF) — "test" button on the credential-mode
  block. When OFF the screen flips to the optimistic local-only "verified"
  state and shows the canon disclaimer ("we encrypt at rest with aes-256"
  → "✓ key reached the api · returned 200 in 184ms"). Flip ON when
  `POST /api/v1/preview/:id/auth-probe` is wired (live key reachability
  check against the upstream API).
- `ui_auth_oauth_provider_perm` (OFF) — "connect with {provider}" button
  in the OAuth panel. When OFF the click fires
  `toast('opening {provider} consent screen…')` (canon parity). Flip ON
  when the backend OAuth dance (provider-side authorization → token
  exchange → encrypted vault store) is wired.

B1 currently inlines flag-default-OFF behavior at the call site (no Flipt
eval yet). Phase 3+ wraps with `evaluateBooleanFlag` per
`docs/mcpgen-feature-flags-contract.md` §4.4 — the toast / optimistic
state remains the OFF-branch fallback.

## Phase 3 — Admin Overview (Agent C2-overview)

- `ui_admin_broadcast_perm` (OFF) — "broadcast" CTA in the admin overview
  PageHead right slot. When OFF the click fires
  `toast('admin action: not yet wired')` and does NOT navigate (target
  /admin/broadcast screen is itself flag-gated and the BFF endpoint
  `POST /api/admin/v1/broadcast` is missing). Flip ON once the broadcast
  composer (C4-broadcast) ships AND the BFF endpoint exists.
- `ui_admin_overview_data_perm` (OFF, implicit via stub) — controls the
  four overview BFF GETs (`/api/admin/v1/overview`,
  `/api/admin/v1/audit?limit=6`, `/api/admin/v1/moderation`,
  `/api/admin/v1/regions`). All four route through the disabled-stub
  `useAdminMetrics()` returning `flag_off_or_not_implemented` →
  `demoState='loading'` (KPIs render `…`, list cards render
  `<EmptyState>`). Flip ON once the BFF lands; canon UI then renders
  live data.

C2-overview wires both gates inline at the call site (toast for the
broadcast CTA, disabled-stub Result for the data hook). No
`evaluateBooleanFlag` calls yet — Phase 3 admin work wraps them once
the Flipt rules for the new flag keys are bootstrapped.

## Phase 3 — Admin Broadcast (Agent C4-broadcast)

- `ui_admin_broadcast_save_draft_perm` (OFF) — "save draft" header CTA.
  Toast stub `'draft saved · ali · just now'`. Flip ON when
  `POST /api/admin/v1/broadcast/drafts` exists.
- `ui_admin_broadcast_history_perm` (OFF) — "history" header CTA. Opens
  drawer with the canon-seeded last-30-days list. Flip ON when
  `GET /api/admin/v1/broadcast/history` exists; drawer body switches
  from canon seed to live `useAdminBroadcastHistory()` data.
- `ui_admin_broadcast_send_perm` (OFF) — "request approval" header CTA
  + modal footer "request approval" submit. Currently opens the canon
  approval modal and toast-confirms; flip ON when
  `POST /api/admin/v1/broadcast/send` (2-approver flow) exists.
- `ui_admin_broadcast_segment_perm` (OFF) — custom-audience SQL
  "dry-run · count" CTA. Toast stub
  `'dry-run: 1,402 recipients match'`. Flip ON when
  `POST /api/admin/v1/broadcast/audiences/dry-run` exists.
- `ui_admin_broadcast_spam_check_perm` (OFF) — "spam-score" CTA in
  channel card. Toast stub `'spam score: 2.1/10 · deliverable'`. Flip
  ON when `POST /api/admin/v1/broadcast/spam-check` exists.
- `ui_admin_broadcast_test_send_perm` (OFF) — "send test to me" CTA.
  Toast stub `'test sent to ali@mcpgen.dev'`. Flip ON when the
  transactional-email path is wired (Phase 4+).

C4-broadcast wires every CTA inline at the call site (toast fallback
for write actions, canon seed for the audiences list and history
drawer body). The audiences list is the disabled-stub fallback for the
missing `GET /api/admin/v1/broadcast/audiences` endpoint — when that
ships, the canon seed gets replaced with `useAdminBroadcastAudiences()`
behind the same flag.

## Phase 3 — Admin Data catalog (Agent C2-data)

- `ui_admin_data_refresh_perm` (OFF) — header "refresh" CTA on
  `/admin/data`. When OFF the click fires
  `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/v1/admin/metrics/refresh` (or query-invalidation surface)
  lands and the disabled-stub `useAdminMetrics()` switches to live
  mode.
- `ui_admin_data_export_perm` (OFF) — "export catalog" header CTA AND
  per-row "export" action on every collection row. When OFF the click
  fires `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/v1/admin/data/export` (CSV/NDJSON dump + signed download
  URL) is wired.
- `ui_admin_data_view_perm` (OFF) — per-row "view" action that should
  open a per-collection detail drawer. Rows are sourced from canon
  `admin-data.jsx` mock collections (users / servers / moderation /
  regions / deploys / billing / llm models / rate pools / flags /
  tickets / audit / integrations / secrets / content / errors). When
  OFF the click fires `toast('admin action: not yet wired')`. Flip ON
  when the per-collection detail panel +
  `GET /api/v1/admin/data/:collection` exist.
- `ui_admin_data_schema_perm` (OFF) — "schema →" section link on the
  collections card. Same OFF-branch behaviour. Flip ON when the schema
  inspector surface lands (Phase 4+).

C2-data inlines flag-default-OFF behavior at the call site (no Flipt
eval yet — same approach as C2-overview / C4-broadcast). All four CTAs
share the same `toast('admin action: not yet wired', { kind: 'info' })`
fallback so the canon UI continues to render fully without backend
support. Live counts render the canon `<EmptyState>` while
`useAdminMetrics()` returns `flag_off_or_not_implemented`.

## Phase 3 — Admin LLM Ops (Agent C3-llm)

- `ui_admin_llm_run_eval_perm` (OFF) — header "run eval" CTA on
  `/admin/llm`. When OFF the click fires
  `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/admin/v1/llm/evals/run` is wired (queues an eval suite
  against the active routing config).
- `ui_admin_llm_propose_route_perm` (OFF) — header "propose route
  change" CTA + the "submit for review" CTA inside the resulting
  drawer. When OFF the header click toasts the stub and never opens
  the drawer; with ON the drawer opens (route / model / justification
  form) and submission posts to
  `POST /api/admin/v1/llm/routes/proposals` (2 approvers required).
- `ui_admin_llm_approve_route_perm` (OFF) — approve / request changes /
  reject buttons on the "proposed change · pending review" Card.
  When OFF every click toasts the stub. Flip ON only when the
  `/api/admin/v1/llm/routes/proposals/:id/{approve,changes,reject}`
  trio is wired; the rejection branch keeps the canon `kind: 'warn'`
  toast variant.

C3-llm route page evaluates these three flags server-side via
`evaluateBooleanFlag` and passes the resulting booleans to
`<LlmScreen>` as props (`runEvalEnabled` / `proposeRouteEnabled` /
`approveRouteEnabled`), so the client never re-evaluates flags. The
toast stubs are a deliberate canon-preservation choice — every CTA
remains visible and clickable in the UI even with the BFF dark.

## Phase 3 — Admin login (Agent C4-login)

- `ui_admin_login_perm` (OFF) — gates the actual sign-in BFF chain (Logto
  Okta SSO redirect, MFA verify endpoint, session-start endpoint). When
  OFF, the `<Login />` SSO/MFA/success flow remains a UI mock — clicking
  "continue with okta" / "passkey" advances to the MFA stage after a
  280ms canon timeout, the dev-mock 6-digit code (`123456`) is accepted,
  and the success screen redirects to `/admin`. Flip ON when the BFF
  endpoints (`/api/auth/logto/sign-in`, `POST /api/admin/v1/auth/mfa`,
  `POST /api/admin/v1/auth/session`) are wired. Until then the route is
  also blanket-gated by `ui_admin_panel_perm` (default OFF) → 404.

## Phase 3 — Admin Flags (Agent C3-flags)

- `ui_admin_flag_edit_perm` (OFF) — gates ALL write actions on the admin
  flags screen: edit-modal "save", "promote to 25%", "freeze", "kill",
  the "create flag" button in the new-flag drawer, and the per-stage
  chips in that drawer. When OFF every action fires
  `toast('admin action: not yet wired')` (warn-tone for "kill"). Flip ON
  when the BFF endpoints land:
    - `GET /api/admin/v1/flags` (list — currently hardcoded canon mock)
    - `PATCH /api/admin/v1/flags/:id` (toggle / save edit)
    - `POST /api/admin/v1/flags` (create)
    - `POST /api/admin/v1/flags/:id/{promote,freeze,kill}` (experiment ops)

The screen evaluates the flag server-side in `app/admin/flags/page.tsx`
and passes a deterministic boolean prop into the client component, so
the canon UI renders identically regardless of the gate state — only
the button click side-effect changes.

## Phase 3 — Admin Servers (Agent C2-servers)

- `ui_admin_server_republish_perm` (OFF) — header CTA "force re-publish"
  on the servers detail rail. When OFF the click fires
  `toast('re-deploy queued · {name}')` (canon-parity copy). Flip ON when
  `POST /api/admin/v1/servers/:id/redeploy` is wired.
- `ui_admin_server_rollback_perm` (OFF) — header CTA "rollback" → opens
  the version-pick modal. The modal's "rollback" confirm button currently
  fires `toast('rolling back {name} to v1.4.1')`. Flip ON when
  `POST /api/admin/v1/servers/:id/rollback` is wired (4-eyes review
  recommended; admin-billing § 4-eyes pattern).
- `ui_admin_server_takedown_perm` (OFF) — header CTA "takedown". When OFF
  fires `toast('takedown queued · {name}')`. Flip ON when
  `POST /api/admin/v1/servers/:id/takedown` is wired (mandatory 4-eyes —
  same as marketplace takedown).
- `ui_admin_server_drift_regenerate_perm` (OFF) — drift-tab "force
  regenerate" CTA. When OFF fires
  `toast('force-regenerating {name} from new spec…')`. Flip ON when
  `POST /api/admin/v1/servers/:id/drift/regenerate` is wired.
- `ui_admin_server_drift_pin_perm` (OFF) — drift-tab "pin to old spec"
  CTA. When OFF fires `toast('pinned {name} to old spec · drift
  suppressed')`. Flip ON when `POST /api/admin/v1/servers/:id/pin` is
  wired.
- `ui_admin_server_notify_owner_perm` (OFF) — drift-tab "notify owner"
  CTA. When OFF fires `toast('owner {ownerId} notified by email')`.
  Flip ON when the transactional-email path lands (Resend integration).

C2-servers currently inlines flag-default-OFF behavior at every CTA call
site (no Flipt eval yet) following the Phase 1/2 pattern. Phase 3+ wraps
each with `evaluateBooleanFlag` per
`docs/mcpgen-feature-flags-contract.md` §4.4. The runbook drawer trigger
(view runbook) and the rollback modal "cancel" button never need flags —
they are read-only / dismiss-only.

## Phase 3 — Admin Observability (Agent C4-obs)

- `ui_admin_obs_silence_perm` (OFF) — gates the per-row "silence" mutation
  on the `top error groups` table. When OFF the click fires
  `toast('<error_type> silenced · 24h')` (canon parity copy) and does NOT
  hit the BFF. Flip ON when `POST /api/admin/v1/obs/errors/:id/silence`
  is wired (per SCREEN-BEHAVIORS-CATALOG.md § admin-obs).
- `ui_admin_obs_oncall_perm` (OFF) — placeholder for a future "page
  on-call" admin action (not in current canon; reserved per PHASE-3 brief
  generic action list). When OFF surfaces
  `toast('admin action: not yet wired')`.
- `ui_admin_obs_replay_traces_perm` (OFF) — placeholder for a future
  "replay traces" admin action (not in current canon; reserved per
  PHASE-3 brief generic action list). When OFF surfaces
  `toast('admin action: not yet wired')`.
- `ui_admin_obs_external_links_perm` (OFF) — gates the "open in datadog"
  CTA. When OFF, surfaces canon-copy toast
  `'opening datadog · mcpgen-prod dashboard'`. Flip ON once the deep-link
  generator endpoint exists (or simply allow direct external nav).

C4-obs currently inlines flag-default-OFF behavior at the call site (no
Flipt eval yet) following the Phase 1/2/3 pattern. Phase 3+ wraps with
`evaluateBooleanFlag` per `docs/mcpgen-feature-flags-contract.md` §4.4 —
the toast remains the OFF-branch fallback. The errors-tab table is the
only data surface today; the latency / traces / sessions tabs are canon
"preview only" placeholders awaiting their respective BFF endpoints.

## Phase 3 — Admin Support inbox (Agent C4-support)

- `ui_admin_support_assign_perm` (OFF) — header "assign…" CTA. When OFF
  fires `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/admin/v1/support/tickets/:id/assign` is wired.
- `ui_admin_support_snooze_perm` (OFF) — header "snooze" CTA. When OFF
  fires `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/admin/v1/support/tickets/:id/snooze` is wired.
- `ui_admin_support_resolve_perm` (OFF) — header "resolve" CTA. When OFF
  fires `toast('admin action: not yet wired')`. Flip ON when
  `POST /api/admin/v1/support/tickets/:id/resolve` is wired.
- `ui_admin_support_reply_perm` (OFF) — reply card "send reply" + "reply
  & snooze" CTAs. When OFF fires `toast('admin action: not yet wired')`.
  Flip ON when `POST /api/admin/v1/support/tickets/:id/replies` is wired.
- `ui_admin_support_internal_perm` (OFF) — reply card "internal note"
  toggle. When OFF fires `toast('admin action: not yet wired')`. Flip ON
  when `POST /api/admin/v1/support/tickets/:id/notes` is wired.
- `ui_admin_support_attach_perm` (OFF) — reply card "attach" CTA. When
  OFF fires `toast('admin action: not yet wired')`. Flip ON when the
  attachment upload path is wired (likely R2-backed signed-URL flow).

C4-support currently threads a `flags: Partial<ActionFlags>` prop through
the component (default OFF), and the route at
`apps/web/src/app/admin/support/page.tsx` does not yet call
`evaluateBooleanFlag` for these per-action keys. Phase 3+ replaces the
prop wiring with server-side `evaluateBooleanFlag` calls and forwards the
resolved booleans to the screen, matching the §4.4 pattern in
`docs/mcpgen-feature-flags-contract.md`.

## Phase 3 — Admin Users & Orgs (Agent C2-users)

All admin BFF endpoints for the users surface are missing (see
`SCREEN-BEHAVIORS-CATALOG.md` § admin-users), so the screen renders the
canon empty-state branch by default. Each action button + the filter
drawer chips fire `toast('admin action: not yet wired')` until the
matching `_perm` flag flips ON. Flag keys are scoped per-action so we
can roll out impersonate / suspend / refund / GDPR independently:

- `ui_admin_impersonate_perm` (OFF) — "impersonate" CTA in the user
  detail header. When ON, opens the impersonate modal and posts to
  `POST /api/admin/v1/users/:id/impersonate` (4-eyes required). When
  OFF the modal still renders for visual parity but "start session"
  fires the toast stub.
- `ui_admin_suspend_perm` (OFF) — "suspend" / "unsuspend" CTA in the
  user detail header. When ON, posts to
  `POST /api/admin/v1/users/:id/suspend`. When OFF the modal renders
  and "confirm suspend" fires the toast stub.
- `ui_admin_refund_perm` (OFF) — refund affordance reachable from the
  user → billing cross-link (and from admin-billing). When OFF clicks
  fire the toast stub. Flip ON when
  `POST /api/admin/v1/billing/invoices/:id/refund` is wired.
- `ui_admin_password_reset_perm` (OFF) — danger-zone "force password
  reset" button. When ON, posts to
  `POST /api/admin/v1/users/:id/password-reset`.
- `ui_admin_revoke_sessions_perm` (OFF) — danger-zone "revoke all
  sessions" + per-row "revoke" link in the recent-sessions card. When
  ON, posts to `POST /api/admin/v1/users/:id/revoke-sessions`.
- `ui_admin_rotate_keys_perm` (OFF) — danger-zone "rotate all api keys"
  button. When ON, posts to `POST /api/admin/v1/users/:id/rotate-keys`.
- `ui_admin_gdpr_export_perm` (OFF) — "export all data" + "view
  previous exports" buttons in the GDPR card. When ON, posts to
  `POST /api/admin/v1/users/:id/gdpr-export`.
- `ui_admin_account_delete_perm` (OFF) — danger-zone "delete account
  (gdpr)" button. When ON, opens the 4-eyes confirmation flow (canon
  shows `confirm: type the email to delete · 4-eyes required`) and
  posts to `POST /api/admin/v1/users/:id/delete`.

C2-users currently inlines flag-default-OFF behavior at the call site
(a single `fireAdminActionStub()` helper per the C2-users brief). Phase
3 follow-up wraps each call site with `evaluateBooleanFlag` so the
`_perm` toggle becomes load-bearing; until then the toast stub is the
OFF-branch fallback per `docs/mcpgen-feature-flags-contract.md` §4.4.

## Phase 3 — Admin Billing & Plans (Agent C3-billing)

All billing BFF endpoints are missing (see `SCREEN-BEHAVIORS-CATALOG.md`
§ admin-billing). Each mutation CTA fires
`toast('admin action: not yet wired')` until the matching `_perm` flag
flips ON; flag keys are scoped per-action so refunds, retries, credits
and dunning edits roll out independently:

- `ui_admin_billing_refund_perm` (OFF) — submit button on the refund
  modal (opened from the per-row "refund" action in the recent-invoices
  table). When OFF, the modal opens for visual parity (read-only is
  cheap); clicking "refund $X" fires the toast stub and dismisses the
  modal. Flip ON when
  `POST /api/admin/v1/billing/invoices/:id/refund` is wired (Stripe
  refund + audit row + 4-eyes for amounts > $500 — canon copy
  "refunds > $500 require 4-eyes").
- `ui_admin_billing_retry_perm` (OFF) — per-row "retry" button on the
  recent-invoices table. When OFF, fires the toast stub. Flip ON when
  `POST /api/admin/v1/billing/invoices/:id/retry` is wired (Stripe
  re-attempt + dunning sequence advance).
- `ui_admin_billing_credit_perm` (OFF) — submit button inside the
  "issue credit" drawer (opened by the header CTA; opening the drawer
  itself is read-only and does NOT carry a flag). When OFF, fires the
  toast stub. Flip ON when `POST /api/admin/v1/billing/credits` is
  wired (account credit + audit row).
- `ui_admin_billing_dunning_perm` (OFF) — per-step "edit copy" button
  on the dunning sequence card. When OFF, fires the toast stub. Flip
  ON when `GET/PUT /api/admin/v1/billing/dunning` is wired (template
  store + preview).

C3-billing inlines flag-default-OFF behavior at the call site (no Flipt
eval yet — same approach as C2-users / C2-overview). The "export csv"
header CTA is read-only (no flag) and fires a friendly toast directly
(`'exporting billing csv · audit row queued'`). The whole
`/admin/billing` route is additionally gated by the namespace-level
`ui_admin_panel_perm` (default OFF) per PHASE-3 brief.

## Phase 3 — Admin Deploys & Infra (Agent C3-deploys)

- `ui_admin_deploy_rollback_perm` (OFF) — per-row "rollback" button on the
  recent-deploys table. When OFF the click fires
  `toast('rolling back {server} · {fromVersion}')` (canon parity, no real
  rollback). Flip ON when `POST /api/admin/v1/deploys/:id/rollback` is
  wired AND a 4-eyes confirmation flow ships.
- `ui_admin_region_resync_perm` (OFF) — top-bar "resync" button. When OFF
  the click fires `toast('region health resynced')` (no real probe).
  Flip ON when `GET /api/admin/v1/regions?refresh=1` (or equivalent) is
  live.
- `ui_admin_killswitch_global_perm` (OFF) — "kill switch" master modal
  CTA "request approval". Currently rendered DISABLED inside the modal
  (matches canon 4-eyes pending state). Flip ON when
  `POST /api/admin/v1/killswitches/global` exists with a real two-approver
  workflow + #ops-incident broadcast.
- `ui_admin_killswitch_flag_perm` (OFF) — per-flag toggle in the kill
  switches card. When OFF flipping a toggle opens the canon flag-approval
  modal; clicking "page approver" fires
  `toast('paged sasha k. · awaiting 2nd approval')`. Flip ON when
  `POST /api/admin/v1/killswitches/:key` is wired AND on-call paging is
  integrated.
- `ui_admin_deploys_view_all_perm` (OFF) — "view all" link on the recent
  deploys card. When OFF the click fires
  `toast('opening full deploy history…')`. Flip ON when the full
  `/admin/deploys/history` route lands (paginated table behind
  `GET /api/admin/v1/deploys`).
- `ui_admin_deploys_drain_perm` (OFF) — placeholder for a future "drain
  region" action (not in current canon; reserved per PHASE-3 brief generic
  action list). When OFF surfaces `toast('admin action: not yet wired')`.
- `ui_admin_deploys_force_restart_perm` (OFF) — placeholder for a future
  "force restart region" action (not in current canon; reserved per
  PHASE-3 brief generic action list). When OFF surfaces
  `toast('admin action: not yet wired')`.

C3-deploys currently inlines flag-default-OFF behavior at every CTA call
site (toast stub, no `evaluateBooleanFlag` yet) following the Phase 1/2/3
pattern. Phase 3+ wraps with `evaluateBooleanFlag` per
`docs/mcpgen-feature-flags-contract.md` §4.4 — the toast remains the
OFF-branch fallback. The `ui_admin_panel_perm` flag (set up in Phase 0)
still gates the entire `/admin/*` route segment at the layer above; these
per-action flags layer on top of it.

## Phase 3 — Admin Integrations (Agent C3-integrations)

- `ui_admin_oauth_rotate_perm` (OFF) — "rotate" CTA on each OAuth provider
  row. When OFF: fresh providers fire `toast('{name} oauth rotated · 24h
  overlap')`; stale providers (>90d) open the canon rotate modal which on
  confirm fires `toast('rotation queued · old secret valid 24h')`. Flip
  ON when `POST /api/admin/v1/integrations/oauth/:id/rotate` is wired.
- `ui_admin_oauth_add_perm` (OFF) — "+ add provider" CTA in the page
  header (also the chips inside the provider drawer). When OFF the
  drawer body buttons fire `toast('scaffold for {p} created')` /
  `toast('provider added · secret encrypted in kms')`. Flip ON when
  `POST /api/admin/v1/integrations/oauth` is live.
- `ui_admin_webhook_edit_perm` (OFF) — per-row "edit" CTA on the webhooks
  table. When OFF fires the canon per-row toast (slack/acme/observe
  copy). Flip ON when `PUT /api/admin/v1/integrations/webhooks/:id` is
  wired.
- `ui_admin_webhook_add_perm` (OFF) — "+ add" CTA on the webhooks card
  header. When OFF fires `toast('opening webhook editor…')`. Flip ON
  when `POST /api/admin/v1/integrations/webhooks` lands.
- `ui_admin_secret_reveal_perm` (OFF) — "reveal" CTA per secret row. When
  OFF fires `toast('reveal logged · reason required', { kind: 'warn' })`.
  Flip ON when `POST /api/admin/v1/integrations/secrets/:id/reveal` is
  live (KMS-backed, logged with reason).
- `ui_admin_secret_rotate_perm` (OFF) — "rotate now" CTA on stale secret
  rows. When OFF fires `toast('rotation queued · old key valid 24h')`.
  Flip ON when `POST /api/admin/v1/integrations/secrets/:id/rotate`
  lands.

C3-integrations currently inlines OFF-branch behavior at the call site
(no Flipt eval yet, matching A3/B1/C3-billing). Phase-3 follow-up wraps
each call site with `evaluateBooleanFlag` per
`mcpgen-feature-flags-contract.md` §4.4. The whole `/admin/integrations`
route is additionally gated by the namespace-level `ui_admin_panel_perm`
(default OFF) per PHASE-3 brief.

## Phase 3 — Admin Marketplace Moderation (Agent C3-marketplace)

All marketplace moderation BFF endpoints are missing (see
`SCREEN-BEHAVIORS-CATALOG.md` § admin-marketplace). The queue listing
itself is sourced via the disabled-stub `useAdminModerationQueue()`,
which returns `flag_off_or_not_implemented` until the BFF lands; the
canon UI then renders the empty-state placeholder card on the queue
table while the right-rail review panel still mounts (auto-checks +
policy-hit explainer + 3 action buttons + moderator-notes textarea).
The 4 mutation CTAs are independently flag-gated so we can roll out
approve / request-changes / takedown / bulk-approve separately:

- `ui_admin_marketplace_bulk_approve_perm` (OFF) — header "bulk approve
  · 12" CTA. When OFF, fires `toast('admin action: not yet wired')`.
  Flip ON when `POST /api/admin/v1/moderation/bulk-approve` is wired
  (4-eyes required for batch approvals per canon copy
  "approving 12 listings · 4-eyes required").
- `ui_admin_marketplace_approve_perm` (OFF) — per-item "approve & list"
  CTA on the detail rail. When OFF fires the toast stub. Flip ON when
  `POST /api/admin/v1/moderation/:id/approve` is wired (single-listing
  approval; lists in marketplace immediately).
- `ui_admin_marketplace_request_changes_perm` (OFF) — per-item "request
  changes" CTA. When OFF fires the toast stub. Flip ON when
  `POST /api/admin/v1/moderation/:id/request-changes` is wired (returns
  the listing to the author with moderator notes).
- `ui_admin_marketplace_takedown_perm` (OFF) — gates the takedown
  modal's "send & request 4-eyes" confirm. The "reject" CTA itself
  always opens the modal so the moderator can compose the reason +
  message (read-only UI is cheap; canon parity preserved). Confirm
  with flag OFF fires `toast('admin action: not yet wired',
  { kind: 'warn' })`. Flip ON when
  `POST /api/admin/v1/moderation/:id/reject` is wired (mandatory 4-eyes
  per canon "requires 2 moderators · ali (you) + 1 more").

C3-marketplace route page evaluates these four flags server-side via
`evaluateBooleanFlag` and passes the resulting booleans to
`<AdminMarketplaceScreen>` as props (`bulkApproveEnabled` /
`approveEnabled` / `requestChangesEnabled` / `takedownEnabled`), so the
client never re-evaluates flags. The toast stubs are a deliberate
canon-preservation choice — every CTA remains visible and clickable
even with the BFF dark. The four secondary tabs
(`reports`/`featured`/`categories`/`policy`) render the canon
"preview only" `<EmptyState>` until their respective backends ship.
The whole `/admin/marketplace` route is additionally gated by the
namespace-level `ui_admin_panel_perm` (default OFF) per PHASE-3 brief.
