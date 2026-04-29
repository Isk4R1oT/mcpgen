---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 9
subsystem: codegen
tags: [stage-e, auth, jinja2, oauth, aes-256-gcm, dns-rebinding, mcp]

# Dependency graph
requires:
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: |
      Plan 04-05 (FinalTool aggregation), Plan 04-06 (Stage E Phase 1 scaffold —
      `package.json` with `^0.2.2` oauth-provider pin, `wrangler.toml` KV
      bindings, `server.ts` with StreamableHTTPServerTransport + ALLOWED_HOSTS,
      `config.ts` exporting ALLOWED_HOSTS).
provides:
  - "select_auth_mode(pass_0_output) deterministic mapper (Phase 2 D-22 verbatim)"
  - "render_auth_files(auth_mode, pass_0_output) emitter — exactly 2 files per run"
  - "auth_middleware.ts.j2 with passthrough/stored/oauth conditional branches"
  - "auth_credentials.ts.j2 with AES-256-GCM helpers (stored mode) + token type (oauth)"
  - "Paired oauth-provider pin decision-log (RESEARCH Open Q4 closure)"
  - "Belt-and-suspenders DNS-rebinding mitigation (Pitfall #15) layered on SDK transport"
affects: [04-10 (per-tool handlers reference auth context), 04-11 (validate Phase 6 includes 2 new files in tsc), 04-12 (E2E renders all 3 auth modes against fixtures), 06 (Phase 6 wires real Logto + TENANT_DEK_KV deploy-time DEK)]

# Tech tracking
tech-stack:
  added: []  # No new deps — plan 04-06 already pinned @cloudflare/workers-oauth-provider ^0.2.2
  patterns:
    - "3-mode conditional Jinja2 templates (one branch per auth_mode value)"
    - "Two-file emitter per Stage E phase (orchestrator + per-template render loop)"
    - "Determinism: render context is auth_mode-only so render_inputs_hash is stable"
    - "Belt-and-suspenders defense: middleware imports ALLOWED_HOSTS even though SDK transport enforces"

key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py
    - packages/codegen-templates/templates/auth_middleware.ts.j2
    - packages/codegen-templates/templates/auth_credentials.ts.j2
    - docs/decisions/2026-04-28-oauth-provider-pin.md
    - apps/generation-engine/tests/stages/stage_e/test_auth.py
    - apps/generation-engine/tests/stages/stage_e/test_dns_rebinding.py
    - apps/generation-engine/tests/stages/stage_e/test_oauth_pin.py
  modified: []  # Plan 04-09 owns ZERO modifications outside `tests/` and `src/.../stage_e/auth.py`.

key-decisions:
  - "Pin verified at ^0.2.2 — caret semver gates auto-bumps (won't resolve 0.4.x)"
  - "OAuth wins over stored when both schemes present — worker handles harder case"
  - "Render context is `{auth_mode}` only — minimal surface = stable render_inputs_hash"
  - "Used existing helper name `_hash_render_inputs` (plan snippet had `_render_inputs_hash` — Rule 3 deviation)"

patterns-established:
  - "Per-mode Jinja2 conditional: `{% if auth_mode == \"X\" %} ... {% elif ... %} ... {% endif %}`"
  - "Belt-and-suspenders security: import ALLOWED_HOSTS in middleware even though server.ts owns the enforcement"
  - "Paired decision-log for every pre-1.0 dep pin (per Phase 1 D-13)"
  - "Manual `npm pack` API surface inspection before pinning pre-1.0 deps"

requirements-completed: [GEN-08]

# Metrics
duration: ~75min
completed: 2026-04-28
---

# Phase 04 Plan 9: Stage E Phase 4 (Auth Middleware + Credentials) Summary

**3-mode auth emitter (passthrough/stored/oauth) with deterministic mode selection, AES-256-GCM credential helpers, and DNS-rebinding belt-and-suspenders defense atop the SDK transport mitigation.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-04-28T20:08Z
- **Completed:** 2026-04-28T21:23Z
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 0 (plan strictly verifies — does NOT edit `packages/codegen-templates/package.json`)

## Accomplishments

- Phase 4 of Stage E ships its 2 emitted files (`src/auth/middleware.ts` + `src/auth/credentials.ts`) for all 3 auth modes (passthrough/stored/oauth).
- `select_auth_mode(pass_0_output)` deterministic mapper applies Phase 2 D-22 verbatim — `oauth2 → oauth`, `aws_signature → stored`, default `passthrough`.
- AES-256-GCM helpers (`encryptCredential` / `decryptCredential`) using `crypto.subtle` + 12-byte IV land in `auth_credentials.ts` (stored mode); Phase 6 will wire the actual TENANT_DEK_KV at deploy time.
- OAuth variant constructs `OAuthProvider` from `@cloudflare/workers-oauth-provider@^0.2.2` using `apiRoute` + `apiHandler` (single-handler form required by 0.2.x).
- Pitfall #15 belt-and-suspenders: every middleware variant imports `ALLOWED_HOSTS` so a future regression in `StreamableHTTPServerTransport.enableDnsRebindingProtection` still fails closed.
- RESEARCH Open Q4 closed: `^0.2.2` pin verified via `npm pack` API-shape inspection; paired decision-log filed at `docs/decisions/2026-04-28-oauth-provider-pin.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: oauth-provider pin verification + paired decision-log + Wave 0 test files** — `d162288` (test)
2. **Task 2: `auth.py` orchestrator + 2 Jinja2 templates** — `daf4407` (feat)

_Note: Per the executor protocol for this run, the orchestrator does NOT update `STATE.md` / `ROADMAP.md` / file a "docs(04-09): complete plan" commit — that's the parent agent's responsibility on merge._

## Files Created/Modified

### Created

- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py` — Stage E Phase 4 orchestrator. Exports `AuthMode`, `select_auth_mode`, `render_auth_files`.
- `packages/codegen-templates/templates/auth_middleware.ts.j2` — 3-mode conditional middleware. Imports `ALLOWED_HOSTS` from `../config.js` regardless of mode (belt-and-suspenders).
- `packages/codegen-templates/templates/auth_credentials.ts.j2` — 3-mode conditional credentials. Stored mode emits AES-256-GCM helpers via `crypto.subtle` + 12-byte IV.
- `docs/decisions/2026-04-28-oauth-provider-pin.md` — RESEARCH Open Q4 closure: verified `^0.2.2` pin, documented npm-pack API surface inspection, recorded latest-on-npm drift (`0.4.0`) + caret-semver gating, defined Phase 6 upgrade procedure + dep risk table.
- `apps/generation-engine/tests/stages/stage_e/test_auth.py` (20 tests) — covers `select_auth_mode` (8 tests) + `render_auth_files` (12 tests).
- `apps/generation-engine/tests/stages/stage_e/test_dns_rebinding.py` (6 tests) — re-asserts plan 04-06's DNS-rebinding wiring AND verifies plan 04-09's belt-and-suspenders import.
- `apps/generation-engine/tests/stages/stage_e/test_oauth_pin.py` (5 tests) — package.json pin pattern + decision-log existence + verified-version mention.

### Verified (NOT modified — VERIFICATION-ONLY per WARNING 3 fix)

- `packages/codegen-templates/package.json` — grep `"@cloudflare/workers-oauth-provider"\s*:\s*"[~^]?0\.2\.[0-9]+"` matches existing entry `"^0.2.2"` from Plan 04-06 Task 1.

## Decisions Made

1. **Pin verified at `^0.2.2`** despite npm registry showing `0.4.0` as latest. Caret semver on a pre-1.0 dep restricts to `0.2.x` only — the pin will NOT silently bump. Phase 6 owns the re-verification gate when wiring real Logto.
2. **OAuth wins over stored when both schemes appear in a hybrid spec.** A spec mixing oauth2 + aws_signature endpoints forces the worker to handle the harder case; defaulting to `oauth` means every endpoint is supported.
3. **Render context is `{auth_mode}` only.** Minimal context = stable `render_inputs_hash` across cold/warm runs (GEN-12 contract). `pass_0_output` is held in the signature for future per-mode enrichment but currently unused beyond mode selection.
4. **Belt-and-suspenders pattern.** Every middleware variant imports `ALLOWED_HOSTS` even though the SDK transport in `server.ts.j2` (plan 04-06) owns the enforcement. The two surfaces are independent — a future regression in either still fails closed.
5. **OAuth uses `apiRoute` + `apiHandler` (single-handler form).** `npm pack` inspection of `0.2.2` `dist/oauth-provider.d.ts` revealed `apiHandler` requires `apiRoute` (not just `apiHandler` alone, as the design doc snippet implied). Phase 4 emits `apiRoute: "/api/"` placeholder; Phase 6 refines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Helper-name mismatch with `scaffold.py`**
- **Found during:** Task 2 (rendering the auth.py snippet from the plan)
- **Issue:** Plan snippet imported `_render_inputs_hash` from `scaffold`. The actual helper exported by `scaffold.py` is `_hash_render_inputs` (line 74). Without the correction the import would fail at module-load time and the orchestrator wouldn't run.
- **Fix:** Used the correct existing name `_hash_render_inputs`. No new helper introduced — this is the same single source of truth from Plan 04-06.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py`
- **Verification:** `mypy` clean; 31 auth tests green; identical render hash across cold/warm runs.
- **Committed in:** `daf4407` (Task 2 commit)

**2. [Rule 1 — Bug] OAuth `apiHandler` requires `apiRoute` in 0.2.x**
- **Found during:** Task 2 (`npm pack` inspection of `0.2.2` `dist/oauth-provider.d.ts`)
- **Issue:** Plan snippet for the OAuth variant of `auth_middleware.ts.j2` instantiated `OAuthProvider` with `{ apiHandler, defaultHandler, authorizeEndpoint, tokenEndpoint, registerEndpoint }`. The actual 0.2.x type definition states `apiHandler` requires `apiRoute` and uses `clientRegistrationEndpoint` (not `registerEndpoint`). Without the correction the rendered TS would fail `tsc --noEmit` in Plan 04-11.
- **Fix:** Emit `apiRoute: "/api/"` + `apiHandler: { fetch: ... }` + `clientRegistrationEndpoint: "/oauth/register"`.
- **Files modified:** `packages/codegen-templates/templates/auth_middleware.ts.j2`
- **Verification:** Decision-log records the verified ctor signature; tests assert `OAuthProvider` is instantiated.
- **Committed in:** `daf4407` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes essential for the templates to compile / import correctly. No scope creep.

## Issues Encountered

- Background pytest commands timed out repeatedly (system under heavy parallel load with multiple worktree pytest sessions running concurrently). Resolved by running synchronous targeted scopes that complete in <1s each: `tests/stages/stage_e/` (77 tests, 0.30s) covers all plan 04-09 surface plus existing scaffold/template-loader tests; `tests/stages/stage_e/test_auth.py tests/stages/stage_e/test_dns_rebinding.py tests/stages/stage_e/test_oauth_pin.py` (31 tests, 0.57s) is the plan-acceptance smoke. mypy + ruff also pass.

## OAuth-Provider Drift Findings (RESEARCH Open Q4)

| Item | Value |
|------|-------|
| Latest on npm at verification (2026-04-28) | `0.4.0` |
| Pin in `packages/codegen-templates/package.json` | `^0.2.2` |
| Caret-semver behavior | Restricts to `0.2.x` only — will NOT auto-bump to `0.3.x` / `0.4.x` |
| API drift detected? | No — the `OAuthProvider` ctor + `OAuthProviderOptions` shape we depend on (`apiRoute`, `apiHandler`, `defaultHandler`, `authorizeEndpoint`, `tokenEndpoint`, `clientRegistrationEndpoint`) is documented in `0.2.2` `dist/oauth-provider.d.ts`. |
| Bumping pin requires | Paired `docs/decisions/<date>-oauth-provider-pin.md` superseding 2026-04-28 doc + `auth_middleware.ts.j2` audit + Stage E fixture re-render + `tsc --noEmit` re-check. |
| Phase 6 ownership | Re-verification gate before wiring real Logto. |

**No `BLOCKED-OAUTH-DEP-MISSING` flag** (grep matched). **No `BLOCKED-OAUTH-API-DRIFT` flag** (npm-pack inspection confirmed our usage matches `0.2.2` shape). Both gates pass.

## User Setup Required

None — Phase 4 emits structural template surface only. Phase 6 wires the actual Logto tenant + `TENANT_DEK_KV` deploy-time DEK provisioning + initial credential encryption.

## Next Phase Readiness

- Stage E Phases 1–4 complete (scaffold + schemas + runtime + auth). Plan 04-10 (Phase 5 — per-tool handlers) and Plan 04-11 (Phase 6 — `tsc --noEmit` + `wrangler deploy --dry-run`) can now consume the auth surface.
- Plan 04-12 (E2E fixtures) can render all 3 auth modes against Stripe (passthrough), GitHub (oauth), and a hypothetical AWS-API-Gateway fixture (stored).
- Phase 6 (deployment) owns the actual KV-binding wiring — Phase 4 emits the placeholder template surface that Phase 6 fills.

## Self-Check: PASSED

- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py` — FOUND
- `packages/codegen-templates/templates/auth_middleware.ts.j2` — FOUND
- `packages/codegen-templates/templates/auth_credentials.ts.j2` — FOUND
- `docs/decisions/2026-04-28-oauth-provider-pin.md` — FOUND
- `apps/generation-engine/tests/stages/stage_e/test_auth.py` — FOUND (20 tests collected)
- `apps/generation-engine/tests/stages/stage_e/test_dns_rebinding.py` — FOUND (6 tests collected)
- `apps/generation-engine/tests/stages/stage_e/test_oauth_pin.py` — FOUND (5 tests collected)
- Commit `d162288` — FOUND in `git log`
- Commit `daf4407` — FOUND in `git log`
- 31 auth-related tests green (`pytest tests/stages/stage_e/test_auth.py tests/stages/stage_e/test_dns_rebinding.py tests/stages/stage_e/test_oauth_pin.py`)
- 77 tests green for entire `tests/stages/stage_e/` suite
- `mypy src/mcpgen_engine/stages/stage_e/` clean
- `ruff check src/mcpgen_engine/stages/stage_e/` clean
- Manual passthrough no-persist render check: PASSED (no `KV.put` / `localStorage` / `sessionStorage` / `caches.put`)
- Manual DNS-rebinding wiring check: PASSED (`enableDnsRebindingProtection: true` present in rendered server.ts)

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Plan: 9*
*Completed: 2026-04-28*
