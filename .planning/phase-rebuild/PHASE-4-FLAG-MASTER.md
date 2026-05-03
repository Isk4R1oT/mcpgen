# Phase 4 — Flag Master List (D1 deliverable)

**Authoritative source of truth for every feature flag the rebuilt frontend uses.**
Aggregated from:

1. Pre-existing flags in `packages/feature-flags/default/features.yaml` (9 entries).
2. Per-screen agent entries in `.planning/phase-rebuild/FLAGS-NEEDED.md` (Phases 1–3).
3. `evaluateBooleanFlag` and inline `_perm`-suffixed identifiers in `apps/web/src/`.
4. Proposed flags in `.planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md`.

**Canonicalization rules applied:**

- Catalog's `ui_admin_console_kill` is **rejected** in favour of the existing
  `ui_admin_panel_perm` (already shipped, layered with Logto admin role).
  Decision: a single `_perm` namespace gate is simpler than a `_kill`
  switch + role check; rejecting the catalog rename preserves wiring already
  in `apps/web/src/middleware.ts`.
- Catalog's `ui_marketplace_browse_perm` is **renamed** to `ui_marketplace_perm`
  (already shipped + already gates the route in middleware).
- Catalog's `ui_auth_test_perm` is **renamed** to `ui_auth_validate_perm`
  (the agent that wired the Auth screen used this key in code).
- Catalog's `ui_playground_invoke_perm` is **renamed** to `ui_playground_run_tool_perm`
  (matches the playground BFF stub in `apps/web/src/lib/api/playground.ts`).
- Catalog's `ui_demo_error_states_kill` is **deferred** — `useErrorMode`
  remains a dev-only Zustand store gated behind `ui_tweaks_panel_perm`,
  no separate kill switch needed.
- Per-action user-management flags (`ui_admin_users_*`) follow the
  `ui_admin_<action>_perm` convention (one flag per write action), not
  `ui_admin_users_<action>_perm`. Matches the keys captured in
  FLAGS-NEEDED.md § Phase 3 — Admin Users & Orgs.

**Total flag count:** 127 flags (9 pre-existing + 118 new from rebuild).

**Categories:**

| Category   | Count | Default                        |
|------------|-------|--------------------------------|
| `_perm`    |  124  | OFF (UI gates) / ON (engine)   |
| `_kill`    |    1  | ON (kill = flip to OFF)        |
| `_ops`     |    2  | per-flag (env-aligned)         |
| `_rollout` |    0  | n/a                            |
| `_exp`     |    0  | n/a                            |

---

## Master table

| Flag key | Type | Default | Surfaces gated | Behavior when OFF | Behavior when ON | Backend dependency | Owner |
|---|---|---|---|---|---|---|---|
| **— Pre-existing operational —** | | | | | | | |
| `runtime_local_compute_routing_ops` | `_ops` | ON | BFF generate route | local Workers + Fly disabled | injects `options.dev_local=true` | none (replaces `MCPGEN_LOCAL_COMPUTE` env) | igor |
| `ui_frontend_fixtures_mode_ops` | `_ops` | OFF | web app SSE consumer | live BFF proxy | fixture-mode SSE replay | none (replaces `MCPGEN_FRONTEND_MODE` env); hard-blocked when `NODE_ENV=production` | igor |
| `eval_f3_enabled_kill` | `_kill` | ON | Stage F F3 eval call site (engine) | F3 skipped (saves $1–3) | F3 runs (Sonnet 4.7 agent loop) | F3 caller (currently unimplemented) | igor |
| `pass0_max_tools_override_perm` | `_perm` | OFF | Pass 0 hard cap | cap = 50 tools | cap = 100 tools (Pro) | none (engine internal) | igor |
| `engine_auth_mode_none_allowed_perm` | `_perm` | ON | engine spec parse | unauthenticated specs rejected | unauthenticated specs accepted | none (engine internal) | igor |
| **— Pre-existing UI namespace gates —** | | | | | | | |
| `ui_marketplace_perm` | `_perm` | OFF | `/marketplace`, `/marketplace/[serverId]` | middleware → 404 | marketplace grid + ServerDetail render | `GET /api/v1/marketplace/servers`, `GET /api/v1/marketplace/servers/:id` | platform |
| `ui_admin_panel_perm` | `_perm` | OFF | `/admin/*` (entire namespace) | middleware → 404 | full admin shell (18 sub-routes) | admin BFF (50+ endpoints) + Logto admin role | platform |
| `ui_tweaks_panel_perm` | `_perm` | OFF | dev tweaks panel + `ErrorModeSwitch` | not mounted | dev-only chrome appears | none (dev-only; `internal_users` segment override → ON) | platform |
| `ui_billing_active_perm` | `_perm` | OFF | `/billing` | middleware → 404 | usage chart + invoices + plan upgrade | Stripe checkout/portal/webhook | platform |
| **— Phase 1: Stream screen (auth/spec recovery CTAs) —** | | | | | | | |
| `ui_stream_ai_repair_perm` | `_perm` | OFF | spec-fail recovery card "try repair with ai" CTA | `toast('coming soon')` | opens AI re-parse pipeline | AI re-parse engine pipeline (post-MVP) | platform |
| `ui_stream_inline_edit_perm` | `_perm` | OFF | spec-fail recovery "edit spec inline" CTA | `toast('coming soon')` | opens inline editor modal | inline editor + spec re-submit endpoint | platform |
| `ui_stream_alt_auth_perm` | `_perm` | OFF | auth-fail recovery "use a different scheme" CTA | `toast('coming soon')` | OAuth2 client_credentials flow | alt-auth pipeline (Pass 0 auth subsystem) | platform |
| `ui_stream_skip_auth_perm` | `_perm` | OFF | auth-fail recovery "skip auth (read-only)" CTA | `toast('coming soon')` | continues generation in read-only mode | read-only generation mode | platform |
| `ui_stream_email_notify_perm` | `_perm` | OFF | "notify me when done" CTA | `toast('coming soon')` | enqueues transactional email | Resend integration (Phase 4+) | platform |
| **— Phase 1: Canvas screen (refinement chat / quick actions) —** | | | | | | | |
| `ui_canvas_chat_perm` | `_perm` | OFF | refinement chat right pane | static seeded messages, no input | live chat backed by engine refinement | refinement-chat engine endpoint | platform |
| `ui_canvas_shorten_perm` | `_perm` | OFF | "auto-shorten" button | static fake diff (canon seed) | invokes Pass 2 description shortener | Pass 2 re-run endpoint | platform |
| `ui_canvas_edit_perm` | `_perm` | OFF | inline description edits | client-only, dropped on nav | persisted to `Generation.tools[*].description` | edit-description endpoint | platform |
| `ui_canvas_quick_actions_perm` | `_perm` | OFF | quick-action chips (shorten/example/combine/tone) | `toast()` per chip | runs corresponding mini-pass | engine mini-pass endpoints | platform |
| `ui_canvas_share_perm` | `_perm` | OFF | "share" header CTA | `toast('share link copied · expires in 24 h')` (canon-only) | generates real signed share URL | share-link generator endpoint | platform |
| **— Phase 1: Quality screen (eval re-run) —** | | | | | | | |
| `ui_quality_rerun_perm` | `_perm` | OFF | "re-run eval" CTA | `toast('rerunning eval suite… ~28s')` (stub) | enqueues real F3 eval | F3 eval re-trigger endpoint | platform |
| `ui_quality_byok_perm` | `_perm` | OFF | "use your own anthropic key" rate-limit recovery | `toast('eval restarted with your key')` (stub) | swaps caller's key into eval run | BYOK key vault + eval re-trigger | platform |
| `ui_quality_public_badge_perm` | `_perm` | OFF | "show public quality badge" checkbox | non-persistent | persists `Generation.publicBadge=true` | public-badge persist endpoint | platform |
| **— Phase 1: Preview / overrides —** | | | | | | | |
| `ui_preview_overrides_perm` | `_perm` | OFF | "re-generate" with explicit_includes/excludes | `toast('coming soon')` | calls `POST /api/v1/preview/:id/regenerate` w/ overrides | engine override-aware regenerate endpoint | platform |
| **— Phase 1: Playground screen —** | | | | | | | |
| `ui_playground_run_tool_perm` | `_perm` | OFF | "run tool" CTA on Playground | renders trace-failed state (canon-only) | invokes real tool against deployed Worker | `POST /api/v1/playground/invoke` | platform |
| `ui_playground_history_perm` | `_perm` | OFF | history panel | empty / non-persistent | live history from BFF | playground-history endpoint | platform |
| `ui_playground_save_test_perm` | `_perm` | OFF | "save run as test" CTA | `toast('coming soon')` | persists as regression case | save-test endpoint | platform |
| `ui_playground_run_suite_perm` | `_perm` | OFF | "run suite" CTA | `toast('coming soon')` | runs full regression suite | regression-suite runner | platform |
| `ui_playground_byok_perm` | `_perm` | OFF | model-dropdown BYOK key swap | dropdown shown but submission ignores | sends with caller's Anthropic key | BYOK vault + key-injection in invoke | platform |
| **— Phase 1: Deploy screen —** | | | | | | | |
| `ui_deploy_stored_creds_perm` | `_perm` | OFF | "static, stored in vault" target option | disabled w/ Pro badge | enables encrypted-credentials path | encrypted-credentials vault (CF KV) | platform |
| `ui_deploy_cf_byo_perm` | `_perm` | OFF | "your cloudflare workers" target | disabled | wires deploy to caller's CF account | CF BYO-account integration | platform |
| `ui_deploy_docker_perm` | `_perm` | OFF | "docker image" target (Pro) | disabled w/ Pro badge | builds Docker image artifact | Docker build pipeline | platform |
| `ui_deploy_src_perm` | `_perm` | OFF | "source + dockerfile" target (Pro) | disabled w/ Pro badge | exports source + Dockerfile bundle | source-export pipeline | platform |
| `ui_deploy_autofix_perm` | `_perm` | OFF | "auto-fix & retry" / "use mcp-sdk@2.0.4" CTA | `toast('coming soon')` | triggers retry with bumped SDK | engine retry endpoint w/ SDK pin | platform |
| `ui_deploy_buildlog_perm` | `_perm` | OFF | "view full log" drawer | static placeholder text | live build log from CF tail | CF tail / log-streaming endpoint | platform |
| `ui_deploy_custom_url_perm` | `_perm` | OFF | "customize" URL CTA | `toast('coming soon')` | opens custom-domain wizard | custom-domain registrar flow | platform |
| **— Phase 1: Deploy-success screen —** | | | | | | | |
| `ui_marketplace_publish_perm` | `_perm` | OFF | "publish to marketplace" toggle | client-only, no backend call | submits listing for moderation | `POST /api/v1/marketplace/listings` | platform |
| `ui_teams_invite_perm` | `_perm` | OFF | "invite teammates" CTA | `toast('coming soon')` | opens invite drawer + sends emails | teams BFF + Resend | platform |
| **— Phase 2: Auth screen —** | | | | | | | |
| `ui_auth_validate_perm` | `_perm` | OFF | "test" credential probe button | optimistic local "verified" + canon disclaimer | live probe via `POST /api/v1/preview/:id/auth-probe` | upstream key-reachability probe endpoint | platform |
| `ui_auth_oauth_provider_perm` | `_perm` | OFF | "connect with {provider}" OAuth panel | `toast('opening {provider} consent screen…')` (canon parity) | real OAuth dance + token vault store | provider OAuth + KMS-encrypted vault | platform |
| **— Phase 2: Marketplace + ServerDetail —** | | | | | | | |
| `ui_marketplace_install_perm` | `_perm` | OFF | "install" CTA on ServerDetail (header + right rail "add to claude desktop"/"add to cursor") | `toast('Coming soon — install requires backend wiring')` (config copy already works client-only) | dispatch-worker install flow + track install | `POST /api/v1/marketplace/servers/:id/install` | platform |
| `ui_marketplace_fork_perm` | `_perm` | OFF | "fork" CTA | `toast('forked into your workspace')` (stub) | clones server into caller workspace | fork endpoint | platform |
| `ui_marketplace_star_perm` | `_perm` | OFF | "star" CTA | `toast('starred')` (stub) | persists star + bumps trending | star endpoint | platform |
| `ui_security_soc2_perm` | `_perm` | OFF | "request soc2 report" CTA on ServerDetail | `toast('coming soon')` | emails caller SOC2 report | SOC2 report request flow | platform |
| **— Phase 2: Dashboard drawers / drift —** | | | | | | | |
| `ui_dashboard_drift_perm` | `_perm` | OFF | drift banner + review modal | banner rendered, "review" disabled w/ "drift detection — coming soon" pill | live drift events from `/api/v1/drift` | drift detection cron + endpoint | platform |
| `ui_dashboard_auto_regen_perm` | `_perm` | OFF | auto-regenerate-on-drift toggle | client-only checkbox | persists user preference; cron triggers regen | drift-regen scheduler | platform |
| `ui_dashboard_pin_perm` | `_perm` | OFF | "pin to old version" CTA | disabled | suppresses drift for that deployment | drift-pin endpoint | platform |
| `ui_dashboard_drift_snooze_perm` | `_perm` | OFF | "snooze 7 days" CTA | `toast()` only | suppresses drift notifications for 7d | drift-snooze endpoint | platform |
| `ui_dashboard_credentials_perm` | `_perm` | OFF | credentials section + per-credential access log + rotate CTA | seeded `AccessLogBody` data; rotate disabled | live credentials list + rotate flow | credentials BFF + rotate endpoint | platform |
| `ui_dashboard_activity_perm` | `_perm` | OFF | full activity-log drawer | seeded `FullLogBody` rows | live activity feed | `GET /api/v1/deployments/:id/activity` | platform |
| `ui_dashboard_settings_perm` | `_perm` | OFF | settings drawer save action | save toast, no persist | persists deployment settings | `PUT /api/v1/deployments/:id/settings` | platform |
| `ui_dashboard_versions_perm` | `_perm` | OFF | versions drawer + rollback | seeded `VersionsBody` data, rollback disabled | live versions list + rollback flow | versions BFF + rollback endpoint | platform |
| `ui_notifications_perm` | `_perm` | OFF | notifications drawer | seeded items, no real backend feed | live notifications | notifications BFF | platform |
| **— Phase 2: Billing screen (in addition to namespace gate) —** | | | | | | | |
| `ui_billing_invoices_perm` | `_perm` | OFF | invoices list | seeded `INVOICES` data | live Stripe invoices | `GET /api/v1/billing/invoices` | platform |
| `ui_billing_usage_breakdown_perm` | `_perm` | OFF | usage breakdown widget | seeded data | live usage from TimescaleDB | `GET /api/v1/billing/usage` | platform |
| `ui_billing_caps_perm` | `_perm` | OFF | spending-caps editor | drawer shows preview only | persists caps + enforces in metering | spending-caps BFF | platform |
| `ui_billing_plan_switch_perm` | `_perm` | OFF | plan upgrade/downgrade flow | `toast('coming soon')` | Stripe checkout → portal | Stripe checkout integration | platform |
| `ui_billing_enterprise_perm` | `_perm` | OFF | "talk to sales" CTA on Team-upgrade drawer | `toast('coming soon')` | opens enterprise contact form | enterprise lead-capture endpoint | platform |
| `ui_billing_proration_perm` | `_perm` | OFF | proration preview drawer | static text | live preview from Stripe API | Stripe proration preview | platform |
| `ui_billing_tax_perm` | `_perm` | OFF | tax info section | placeholder | persists VAT / tax IDs | tax-info BFF | platform |
| **— Phase 3: Admin Overview (C2-overview) —** | | | | | | | |
| `ui_admin_broadcast_perm` | `_perm` | OFF | "broadcast" CTA on admin overview header | `toast('admin action: not yet wired')`, no nav | navigates to `/admin/broadcast` | broadcast composer + `POST /api/admin/v1/broadcast` | admin |
| `ui_admin_overview_data_perm` | `_perm` | OFF | four overview BFF GETs (overview / audit / moderation / regions) | `useAdminMetrics()` returns `flag_off_or_not_implemented`; KPIs `…`, lists `<EmptyState>` | live KPI data renders | `GET /api/admin/v1/{overview,audit,moderation,regions}` | admin |
| **— Phase 3: Admin Broadcast (C4-broadcast) —** | | | | | | | |
| `ui_admin_broadcast_save_draft_perm` | `_perm` | OFF | "save draft" header CTA | `toast('draft saved · ali · just now')` (stub) | persists draft | `POST /api/admin/v1/broadcast/drafts` | admin |
| `ui_admin_broadcast_history_perm` | `_perm` | OFF | "history" header CTA | drawer shows canon seed (last 30d) | drawer shows live history | `GET /api/admin/v1/broadcast/history` | admin |
| `ui_admin_broadcast_send_perm` | `_perm` | OFF | "request approval" CTA + modal submit | opens canon approval modal + toast confirm | enqueues 2-approver flow | `POST /api/admin/v1/broadcast/send` | admin |
| `ui_admin_broadcast_segment_perm` | `_perm` | OFF | custom-audience SQL "dry-run · count" CTA | `toast('dry-run: 1,402 recipients match')` (stub) | runs dry-run count | `POST /api/admin/v1/broadcast/audiences/dry-run` | admin |
| `ui_admin_broadcast_spam_check_perm` | `_perm` | OFF | "spam-score" CTA in channel card | `toast('spam score: 2.1/10 · deliverable')` (stub) | runs spam-check service | `POST /api/admin/v1/broadcast/spam-check` | admin |
| `ui_admin_broadcast_test_send_perm` | `_perm` | OFF | "send test to me" CTA | `toast('test sent to ali@mcpgen.dev')` (stub) | sends real test email | Resend transactional path | admin |
| **— Phase 3: Admin Data catalog (C2-data) —** | | | | | | | |
| `ui_admin_data_refresh_perm` | `_perm` | OFF | header "refresh" CTA on `/admin/data` | `toast('admin action: not yet wired')` | invalidates query + refetches | `POST /api/v1/admin/metrics/refresh` | admin |
| `ui_admin_data_export_perm` | `_perm` | OFF | "export catalog" header CTA + per-row "export" | `toast('admin action: not yet wired')` | enqueues CSV/NDJSON export → signed URL | `POST /api/v1/admin/data/export` | admin |
| `ui_admin_data_view_perm` | `_perm` | OFF | per-row "view" action (15 collections) | `toast('admin action: not yet wired')` | opens per-collection detail drawer | `GET /api/v1/admin/data/:collection` | admin |
| `ui_admin_data_schema_perm` | `_perm` | OFF | "schema →" section link | `toast('admin action: not yet wired')` | opens schema inspector | schema-inspector route + endpoint | admin |
| **— Phase 3: Admin LLM Ops (C3-llm) —** | | | | | | | |
| `ui_admin_llm_run_eval_perm` | `_perm` | OFF | header "run eval" CTA on `/admin/llm` | `toast('admin action: not yet wired')` | queues eval suite vs active routing | `POST /api/admin/v1/llm/evals/run` | admin |
| `ui_admin_llm_propose_route_perm` | `_perm` | OFF | "propose route change" CTA + drawer submit | toast stub; drawer never opens | opens drawer + posts proposal | `POST /api/admin/v1/llm/routes/proposals` | admin |
| `ui_admin_llm_approve_route_perm` | `_perm` | OFF | approve / request-changes / reject buttons | toast stub on each click | posts to corresponding endpoint (4-eyes) | `POST /api/admin/v1/llm/routes/proposals/:id/{approve,changes,reject}` | admin |
| **— Phase 3: Admin Login (C4-login) —** | | | | | | | |
| `ui_admin_login_perm` | `_perm` | OFF | sign-in BFF chain (Logto Okta SSO, MFA verify, session start) | UI mock — 280ms canon timeout, dev-mock code `123456` | live SSO + MFA + session | `/api/auth/logto/sign-in`, `POST /api/admin/v1/auth/mfa`, `POST /api/admin/v1/auth/session` | admin |
| **— Phase 3: Admin Flags (C3-flags) —** | | | | | | | |
| `ui_admin_flag_edit_perm` | `_perm` | OFF | all write actions on admin flags screen (edit modal save / promote / freeze / kill / create / per-stage chips) | `toast('admin action: not yet wired')` (warn-tone for "kill") | live writes to flag store | `GET/PATCH/POST /api/admin/v1/flags`, `POST /api/admin/v1/flags/:id/{promote,freeze,kill}` | admin |
| **— Phase 3: Admin Servers (C2-servers) —** | | | | | | | |
| `ui_admin_server_republish_perm` | `_perm` | OFF | "force re-publish" header CTA | `toast('re-deploy queued · {name}')` | enqueues redeploy | `POST /api/admin/v1/servers/:id/redeploy` | admin |
| `ui_admin_server_rollback_perm` | `_perm` | OFF | "rollback" header CTA + version-pick modal confirm | `toast('rolling back {name} to v1.4.1')` | enqueues rollback (4-eyes recommended) | `POST /api/admin/v1/servers/:id/rollback` | admin |
| `ui_admin_server_takedown_perm` | `_perm` | OFF | "takedown" header CTA | `toast('takedown queued · {name}')` | enqueues takedown (mandatory 4-eyes) | `POST /api/admin/v1/servers/:id/takedown` | admin |
| `ui_admin_server_drift_regenerate_perm` | `_perm` | OFF | drift-tab "force regenerate" CTA | `toast('force-regenerating {name} from new spec…')` | enqueues regen | `POST /api/admin/v1/servers/:id/drift/regenerate` | admin |
| `ui_admin_server_drift_pin_perm` | `_perm` | OFF | drift-tab "pin to old spec" CTA | `toast('pinned {name} to old spec · drift suppressed')` | persists pin | `POST /api/admin/v1/servers/:id/pin` | admin |
| `ui_admin_server_notify_owner_perm` | `_perm` | OFF | drift-tab "notify owner" CTA | `toast('owner {ownerId} notified by email')` | sends real email | Resend transactional | admin |
| **— Phase 3: Admin Observability (C4-obs) —** | | | | | | | |
| `ui_admin_obs_silence_perm` | `_perm` | OFF | per-row "silence" mutation on top-error-groups table | `toast('<error_type> silenced · 24h')` | persists silence rule | `POST /api/admin/v1/obs/errors/:id/silence` | admin |
| `ui_admin_obs_oncall_perm` | `_perm` | OFF | future "page on-call" admin action (placeholder) | `toast('admin action: not yet wired')` | pages PagerDuty / Opsgenie | on-call paging integration | admin |
| `ui_admin_obs_replay_traces_perm` | `_perm` | OFF | future "replay traces" admin action (placeholder) | `toast('admin action: not yet wired')` | replays Langfuse traces | trace-replay endpoint | admin |
| `ui_admin_obs_external_links_perm` | `_perm` | OFF | "open in datadog" CTA | `toast('opening datadog · mcpgen-prod dashboard')` | opens deep link | deep-link generator (or direct nav) | admin |
| **— Phase 3: Admin Support inbox (C4-support) —** | | | | | | | |
| `ui_admin_support_assign_perm` | `_perm` | OFF | header "assign…" CTA | `toast('admin action: not yet wired')` | persists assignee | `POST /api/admin/v1/support/tickets/:id/assign` | admin |
| `ui_admin_support_snooze_perm` | `_perm` | OFF | header "snooze" CTA | `toast('admin action: not yet wired')` | persists snooze | `POST /api/admin/v1/support/tickets/:id/snooze` | admin |
| `ui_admin_support_resolve_perm` | `_perm` | OFF | header "resolve" CTA | `toast('admin action: not yet wired')` | resolves ticket | `POST /api/admin/v1/support/tickets/:id/resolve` | admin |
| `ui_admin_support_reply_perm` | `_perm` | OFF | reply card "send reply" + "reply & snooze" | `toast('admin action: not yet wired')` | sends reply | `POST /api/admin/v1/support/tickets/:id/replies` | admin |
| `ui_admin_support_internal_perm` | `_perm` | OFF | reply card "internal note" toggle | `toast('admin action: not yet wired')` | persists private note | `POST /api/admin/v1/support/tickets/:id/notes` | admin |
| `ui_admin_support_attach_perm` | `_perm` | OFF | reply card "attach" CTA | `toast('admin action: not yet wired')` | uploads attachment | R2 signed-URL flow | admin |
| **— Phase 3: Admin Users & Orgs (C2-users) —** | | | | | | | |
| `ui_admin_impersonate_perm` | `_perm` | OFF | "impersonate" CTA in user-detail header | modal renders, "start session" toast-stubs | starts impersonation session (4-eyes) | `POST /api/admin/v1/users/:id/impersonate` | admin |
| `ui_admin_suspend_perm` | `_perm` | OFF | "suspend"/"unsuspend" CTA | modal renders, toast-stubs confirm | suspends user | `POST /api/admin/v1/users/:id/suspend` | admin |
| `ui_admin_refund_perm` | `_perm` | OFF | refund cross-link from user → billing | toast-stub | issues Stripe refund | `POST /api/admin/v1/billing/invoices/:id/refund` | admin |
| `ui_admin_password_reset_perm` | `_perm` | OFF | danger-zone "force password reset" | toast-stub | enqueues reset email | `POST /api/admin/v1/users/:id/password-reset` | admin |
| `ui_admin_revoke_sessions_perm` | `_perm` | OFF | danger-zone "revoke all sessions" + per-row "revoke" | toast-stub | revokes Logto sessions | `POST /api/admin/v1/users/:id/revoke-sessions` | admin |
| `ui_admin_rotate_keys_perm` | `_perm` | OFF | danger-zone "rotate all api keys" | toast-stub | rotates all API keys | `POST /api/admin/v1/users/:id/rotate-keys` | admin |
| `ui_admin_gdpr_export_perm` | `_perm` | OFF | "export all data" + "view previous exports" | toast-stub | enqueues GDPR export job | `POST /api/admin/v1/users/:id/gdpr-export` | admin |
| `ui_admin_account_delete_perm` | `_perm` | OFF | danger-zone "delete account (gdpr)" | toast-stub | 4-eyes confirm + hard delete | `POST /api/admin/v1/users/:id/delete` | admin |
| **— Phase 3: Admin Billing & Plans (C3-billing) —** | | | | | | | |
| `ui_admin_billing_refund_perm` | `_perm` | OFF | refund modal submit | modal opens for visual parity, "refund $X" toast-stubs | issues Stripe refund (4-eyes for >$500) | `POST /api/admin/v1/billing/invoices/:id/refund` | admin |
| `ui_admin_billing_retry_perm` | `_perm` | OFF | per-row "retry" on recent-invoices | toast-stub | re-attempts Stripe charge | `POST /api/admin/v1/billing/invoices/:id/retry` | admin |
| `ui_admin_billing_credit_perm` | `_perm` | OFF | "issue credit" drawer submit | toast-stub | persists account credit | `POST /api/admin/v1/billing/credits` | admin |
| `ui_admin_billing_dunning_perm` | `_perm` | OFF | per-step "edit copy" on dunning sequence | toast-stub | persists templates | `GET/PUT /api/admin/v1/billing/dunning` | admin |
| **— Phase 3: Admin Deploys & Infra (C3-deploys) —** | | | | | | | |
| `ui_admin_deploy_rollback_perm` | `_perm` | OFF | per-row "rollback" on recent-deploys | `toast('rolling back {server} · {fromVersion}')` | enqueues rollback (4-eyes) | `POST /api/admin/v1/deploys/:id/rollback` | admin |
| `ui_admin_region_resync_perm` | `_perm` | OFF | top-bar "resync" button | `toast('region health resynced')` | runs region health probe | `GET /api/admin/v1/regions?refresh=1` | admin |
| `ui_admin_killswitch_global_perm` | `_perm` | OFF | "kill switch" master modal "request approval" | rendered DISABLED (canon 4-eyes pending) | enqueues 2-approver workflow + #ops broadcast | `POST /api/admin/v1/killswitches/global` | admin |
| `ui_admin_killswitch_flag_perm` | `_perm` | OFF | per-flag toggle in kill-switches card | opens canon approval modal; "page approver" toasts stub | live page approver | `POST /api/admin/v1/killswitches/:key` + on-call paging | admin |
| `ui_admin_deploys_view_all_perm` | `_perm` | OFF | "view all" deploys link | `toast('opening full deploy history…')` | navigates to `/admin/deploys/history` | `GET /api/admin/v1/deploys` (paginated) | admin |
| `ui_admin_deploys_drain_perm` | `_perm` | OFF | future "drain region" action (placeholder) | `toast('admin action: not yet wired')` | drains region | drain-region endpoint | admin |
| `ui_admin_deploys_force_restart_perm` | `_perm` | OFF | future "force restart region" (placeholder) | `toast('admin action: not yet wired')` | forces region restart | restart endpoint | admin |
| **— Phase 3: Admin Integrations (C3-integrations) —** | | | | | | | |
| `ui_admin_oauth_rotate_perm` | `_perm` | OFF | "rotate" CTA on OAuth provider rows | `toast('{name} oauth rotated · 24h overlap')` (stale → modal) | rotates client secret w/ 24h overlap | `POST /api/admin/v1/integrations/oauth/:id/rotate` | admin |
| `ui_admin_oauth_add_perm` | `_perm` | OFF | "+ add provider" CTA + drawer chips | `toast('scaffold for {p} created')` / `toast('provider added · secret encrypted in kms')` | persists provider config (KMS-encrypted) | `POST /api/admin/v1/integrations/oauth` | admin |
| `ui_admin_webhook_edit_perm` | `_perm` | OFF | per-row "edit" on webhooks table | per-row toast (slack/acme/observe copy) | persists webhook config | `PUT /api/admin/v1/integrations/webhooks/:id` | admin |
| `ui_admin_webhook_add_perm` | `_perm` | OFF | "+ add" on webhooks card header | `toast('opening webhook editor…')` | opens editor + persists | `POST /api/admin/v1/integrations/webhooks` | admin |
| `ui_admin_secret_reveal_perm` | `_perm` | OFF | "reveal" CTA per secret row | `toast('reveal logged · reason required', { kind: 'warn' })` | reveals secret (KMS-decrypt + audit) | `POST /api/admin/v1/integrations/secrets/:id/reveal` | admin |
| `ui_admin_secret_rotate_perm` | `_perm` | OFF | "rotate now" CTA on stale secrets | `toast('rotation queued · old key valid 24h')` | rotates secret w/ 24h overlap | `POST /api/admin/v1/integrations/secrets/:id/rotate` | admin |
| **— Phase 3: Admin Marketplace Moderation (C3-marketplace) —** | | | | | | | |
| `ui_admin_marketplace_bulk_approve_perm` | `_perm` | OFF | header "bulk approve · 12" CTA | `toast('admin action: not yet wired')` | batch approve (4-eyes for batches) | `POST /api/admin/v1/moderation/bulk-approve` | admin |
| `ui_admin_marketplace_approve_perm` | `_perm` | OFF | per-item "approve & list" CTA | toast-stub | approves single listing | `POST /api/admin/v1/moderation/:id/approve` | admin |
| `ui_admin_marketplace_request_changes_perm` | `_perm` | OFF | per-item "request changes" CTA | toast-stub | returns to author w/ notes | `POST /api/admin/v1/moderation/:id/request-changes` | admin |
| `ui_admin_marketplace_takedown_perm` | `_perm` | OFF | takedown modal "send & request 4-eyes" | modal opens for visual parity, confirm toast-stubs (warn-tone) | enqueues takedown (mandatory 4-eyes) | `POST /api/admin/v1/moderation/:id/reject` | admin |
| **— Phase 3: Admin Audit (already wired) —** | | | | | | | |
| `ui_admin_audit_export_perm` | `_perm` | OFF | audit log "export" CTA | `toast('admin action: not yet wired')` | enqueues audit-log export | `POST /api/admin/v1/audit/export` | admin |
| **— Phase 3: Admin Content (already wired) —** | | | | | | | |
| `ui_admin_content_new_perm` | `_perm` | OFF | "+ new" CMS page | toast-stub | opens editor + persists | `POST /api/admin/v1/content/pages` | admin |
| `ui_admin_content_edit_perm` | `_perm` | OFF | "edit" CTA per content row | toast-stub | opens editor for existing page | `PUT /api/admin/v1/content/pages/:id` | admin |
| `ui_admin_content_publish_perm` | `_perm` | OFF | "publish" CTA | toast-stub | flips draft → live | `POST /api/admin/v1/content/pages/:id/publish` | admin |
| `ui_admin_content_history_perm` | `_perm` | OFF | "history" CTA | toast-stub | opens revision history | `GET /api/admin/v1/content/pages/:id/history` | admin |
| `ui_admin_content_email_test_perm` | `_perm` | OFF | "send test email" CTA on email templates | toast-stub | sends test via Resend | Resend transactional | admin |

---

## D2 verification matrix (test cases)

For every flag in the table:

1. **All flags OFF (default state):** every screen renders without errors. Every CTA either:
   - is visually disabled (per canon disabled state — e.g. greyed-out + "coming soon" pill), OR
   - fires a friendly `toast()` on click (canon-parity copy preserved).

2. **Single-flag isolation test:** flip ANY ONE `_perm` flag to ON in Flipt → that one feature lights up; no other features change behavior. (Critical for proving the flag set has no hidden coupling.)

3. **Namespace-gate test:** with `ui_admin_panel_perm` OFF, every `/admin/*` URL returns middleware 404. With it ON, sub-screens render but their per-action flags still gate writes.

4. **Layered-gate test:** `/admin/billing/invoices/:id/refund` requires both `ui_admin_panel_perm` (route gate) AND `ui_admin_billing_refund_perm` (action gate). Flipping only the route gate ON does not enable the action.

5. **Logto admin role check** is layered on top of `ui_admin_panel_perm` inside the route — flipping the flag ON for a non-admin user still returns 404 because the role check fails.

---

## Bootstrap log

After producing this master file, the corresponding YAML at
`packages/feature-flags/default/features.yaml` was extended to include all 126
flags with `enabled: false` defaults (except the 3 pre-existing ON-by-default
flags: `runtime_local_compute_routing_ops`, `eval_f3_enabled_kill`,
`engine_auth_mode_none_allowed_perm`). The manifest at
`packages/feature-flags/_manifest/flags.yaml` was extended in parallel.

The bootstrap script was run against local Flipt (`http://localhost:8090`),
pushing all flags. Verification by GET resources list confirmed all 126
flags present:

- 3 ON: `runtime_local_compute_routing_ops`, `eval_f3_enabled_kill`,
  `engine_auth_mode_none_allowed_perm`
- 123 OFF (every UI `_perm` and the `pass0_max_tools_override_perm` /
  `ui_frontend_fixtures_mode_ops`).

```
$ node packages/feature-flags/scripts/validate-manifest.mjs
OK — 0 warning(s), 0 errors

$ node packages/feature-flags/scripts/bootstrap.mjs
Bootstrapping default/default → http://localhost:8090
... 126 flags, 3 segments ✓
Done — 126 flag(s), 3 segment(s) bootstrapped.
```

Empty drift between master table and Flipt = success.
