---
phase: 09-observability-polish
plan: 01
subsystem: observability
tags: [sentry, redaction, pii, beforeSend, cross-language, gitleaks]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "apps/api/src/instrumentation.ts (Phase 1 D-19 sentryOptionsFor + withSentry pattern), apps/generation-engine/src/mcpgen_engine/main.py (_sentry_before_send Phase 1 stub)"
  - phase: 06-runtime
    provides: "apps/dispatch/src/index.ts (Bun + Hono dispatch with SENTRY_DSN binding but no Sentry init — Pitfall #3)"
  - phase: 07-frontend-wire-up
    provides: "apps/web/src/lib/sentry/redact.ts (Plan 07-06 17 vitest unit tests + ?key=/?token= scrubbing surface)"
  - phase: 08-auth-billing
    provides: "Phase 8 inline STRIPE_SK_RE / JWT_RE redactString in apps/api/src/instrumentation.ts (T-8-15)"
provides:
  - "Single source of truth `redactBeforeSend` (TS) / `redact_before_send` (Py) for Sentry beforeSend redaction across 4 SDKs + Stage E template"
  - "Cross-language equivalence test fixture at `tests/fixtures/leak-vectors.json`"
  - "apps/dispatch Sentry init wired (Pitfall #3 closed)"
  - "apps/web/src/lib/sentry/redact.ts converted to thin re-export shim preserving Phase 7 plan 07-06's 17 vitest unit tests"
  - "Stage E template `sentry_redact.ts.j2` denylist converged with shared helper (7 universal headers + variable-auth regex + sensitive-string patterns)"
  - "`.gitleaks.toml` allowlist for Sentry-redaction fixture (Pitfall #7)"
affects: [09-02-langfuse-correlation, 09-04-multi-protocol-mock, 09-05-pii-leak-audit, 10-launch (real Sentry source-maps upload)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-language redaction: TS `@mcpgen/contracts/sentry-redaction` ↔ Py `mcpgen_engine.observability.sentry_redaction` enforced by shared JSON fixture (vitest + pytest both consume `tests/fixtures/leak-vectors.json`)"
    - "Thin re-export shim pattern (apps/web/src/lib/sentry/redact.ts): preserves backward-compat constants/types AND delegates implementation to shared helper — minimal blast radius for upstream tests"
    - "Stage E template denylist convergence comment: explicit `Phase 9 D-03 convergence` header pinning template denylist to `@mcpgen/contracts/sentry-redaction` (template cannot import shared helper because tenant Workers ship without workspace dep)"
    - "Bun + withSentry composition: wrap `{fetch: app.fetch}` ExportedHandler via `withSentry(...)` THEN re-attach `port` to the wrapped handler — satisfies both Bun port-export and Sentry CF Workers wrapper contract"
    - "Type-without-Sentry-import shared helper (`SentryEventLike` / `SentryEventRequest`): structural subset of Sentry's `ErrorEvent` so the helper loads from empty-DSN bootstrap paths without pulling Sentry runtime types"

key-files:
  created:
    - "packages/contracts/src/sentry-redaction.ts (102 lines — shared TS redactBeforeSend + 7-entry header denylist + VARIABLE_AUTH_HEADER_RE + 5 SENSITIVE_STRING_PATTERNS)"
    - "packages/contracts/src/sentry-redaction.test.ts (220 lines — 24 vitest tests: 16 unit + 6 cross-language fixture vectors + 5 constants)"
    - "tests/fixtures/leak-vectors.json (REPO ROOT — 6 canonical leak vectors consumed by vitest AND pytest)"
    - "apps/generation-engine/src/mcpgen_engine/observability/__init__.py (re-exports configure_langfuse_otel + redact_before_send for backward compat)"
    - "apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py (Python equivalent of TS helper, mirrors 5-step contract verbatim)"
    - "apps/generation-engine/tests/observability/__init__.py + test_sentry_redaction.py (16 pytest tests)"
    - "apps/generation-engine/tests/security/__init__.py + test_pii_redaction.py (6 parametrized vectors — D-12 CI security gate)"
    - "apps/dispatch/src/instrumentation.ts (NEW — closes Pitfall #3)"
    - "apps/dispatch/tests/instrumentation.test.ts (13 vitest tests — proves Pitfall #3 closed + 6 leak-vector regression suite + D-01 invariants)"
    - "apps/api/tests/security/sentry-redaction.test.ts (8 vitest tests — apps/api leak-vector regression)"
  modified:
    - "packages/contracts/src/index.ts (re-exports sentry-redaction module)"
    - "packages/contracts/package.json (`./sentry-redaction` exports entry)"
    - "apps/generation-engine/src/mcpgen_engine/observability.py → renamed to observability/langfuse_otel.py (package conversion)"
    - "apps/generation-engine/src/mcpgen_engine/main.py (removed inline `_sentry_before_send`; imports `redact_before_send` from package; switched to absolute imports)"
    - "apps/generation-engine/tests/test_main.py (updated to import shared helper)"
    - "apps/api/src/instrumentation.ts (removed STRIPE_SK_RE/STRIPE_CUS_RE/JWT_RE inline regexes; uses shared helper; typed as CloudflareOptions return)"
    - "apps/dispatch/src/index.ts (wired `withSentry((env) => sentryOptionsFor(env), {fetch: app.fetch})` — Pitfall #3 closed)"
    - "apps/web/src/lib/sentry/redact.ts (converted to thin re-export shim around shared helper; preserves 17 vitest unit tests)"
    - "packages/codegen-templates/templates/sentry_redact.ts.j2 (expanded denylist: 7 universal headers + VARIABLE_AUTH_HEADER_RE + SENSITIVE_STRING_PATTERNS; explicit Phase 9 D-03 convergence comment)"
    - ".gitleaks.toml (allowlist for fixture path + 5 redaction-source files)"

key-decisions:
  - "Plan 09-01: thin-shim approach for apps/web/src/lib/sentry/redact.ts — preserve Phase 7's exported constants `REDACTED_HEADERS = ['Authorization', 'X-Upstream-Auth', 'Cookie']` (Array, not the new Set) and `REDACTED_QUERY_PARAMS = ['key', 'token']` so the 17 plan 07-06 unit tests still pass; delegate `redactSentryEvent` body to shared helper which actually scrubs a SUPERSET (7 headers + variable-auth regex + 4-name query params)"
  - "Plan 09-01: apps/dispatch wraps `{fetch: app.fetch}` ExportedHandler via `withSentry`, THEN re-attaches `port` to the wrapped handler — Bun's `{port, fetch}` shape isn't an ExportedHandler, but `withSentry` accepts ExportedHandler only. The compose dance preserves both Bun port-export and Sentry CF Workers wrapper contract (per A11 plan fallback note)"
  - "Plan 09-01: Stage E template denylist inlined (Option a) instead of importing shared helper — tenant Workers ship as stand-alone bundles without `@mcpgen/contracts` workspace dep. Header comment `Phase 9 D-03 convergence: keep this denylist in sync with packages/contracts/src/sentry-redaction.ts` pins maintenance"
  - "Plan 09-01: cross-app test isolation — `apps/api/tests/security/sentry-redaction.test.ts` covers ONLY apps/api; apps/dispatch assertions moved to `apps/dispatch/tests/instrumentation.test.ts` because TS rootDir constraints reject cross-app imports (per A11 fallback note)"
  - "Plan 09-01: switched `apps/generation-engine/src/mcpgen_engine/main.py` from relative imports (`from .observability`) to absolute imports (`from mcpgen_engine.observability`) to satisfy literal acceptance criterion text"
  - "Plan 09-01: ruff UP038 — `isinstance(data, (dict, str))` → `isinstance(data, dict | str)` per workspace ruff config (Python 3.12+ union syntax)"
  - "Plan 09-01: gitleaks allowlist extended to cover 5 redaction-source files + fixture (sentinels are intentionally Stripe-shaped to exercise SENSITIVE_STRING_PATTERNS path; real keys still blocked by gitleaks elsewhere)"
  - "Plan 09-01: type signature change — `sentryOptionsFor` return type from inferred to explicit `CloudflareOptions` so `withSentry` callback typing composes via Sentry's structural typing (apps/api + apps/dispatch both updated)"

patterns-established:
  - "Pattern 1 (cross-language redaction): single shared JSON fixture (`tests/fixtures/leak-vectors.json`) at REPO ROOT consumed by vitest AND pytest. Each vector: `{name, input_event, expected_no_match[]}`. 6 canonical vectors covering Authorization Bearer / X-Upstream-Auth / Cookie / spec body / error message / event.extra.spec"
  - "Pattern 2 (`as const` denylist export with paired-decision guard): `REDACTED_HEADERS` exported as Set + `as const`; `REDACTED_QUERY_PARAMS` as readonly array; tests pattern-match against literal types"
  - "Pattern 3 (5-step redaction contract — verbatim across languages): (1) headers + variable regex → (2) URL query params → (3) body redaction on /v1/generate → (4) event.extra spec/openapi_yaml/raw_ir → (5) message string-pattern scrub"
  - "Pattern 4 (Bun + ExportedHandler bridge): `const wrapped = withSentry((env) => sentryOptionsFor(env), {fetch: app.fetch}); export default { port: 8789, fetch: wrapped.fetch };` — preserves Bun port-export AND wires Sentry"

requirements-completed: [CTRL-08]

# Metrics
duration: 33min
completed: 2026-04-30
---

# Phase 09 Plan 01: Sentry Redaction Convergence Summary

**Single shared `redactBeforeSend` (TS) / `redact_before_send` (Py) helper deployed across 4 SDKs (apps/web + apps/api + apps/dispatch + generation-engine) + Stage E template, closing Pitfall #3 (apps/dispatch had `SENTRY_DSN` binding but no Sentry init) and Pitfall #12 (pass-through credential leak surface) via 6 canonical leak-vector regression tests in vitest + pytest sharing one JSON fixture.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-04-30T11:29:07Z
- **Completed:** 2026-04-30T12:02:57Z
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 9

## Accomplishments

- Shared TS redactor `@mcpgen/contracts/sentry-redaction.redactBeforeSend` with 7-entry header denylist + variable-auth regex + 5 sensitive-string patterns (Bearer / sk_live_ / sk_test_ / ghp_ / JWT) + spec-body redaction on /v1/generate paths
- Python equivalent `mcpgen_engine.observability.redact_before_send` mirroring TS contract verbatim; `observability.py` converted to package with `langfuse_otel.py` + `sentry_redaction.py` siblings
- Cross-language equivalence enforced via `tests/fixtures/leak-vectors.json` (6 canonical vectors) consumed identically by vitest + pytest
- apps/dispatch Sentry init wired via NEW `apps/dispatch/src/instrumentation.ts` + `withSentry` wrap in `apps/dispatch/src/index.ts` (Pitfall #3 closed)
- apps/web/src/lib/sentry/redact.ts converted to thin re-export shim — all 17 Phase 7 plan 07-06 unit tests still pass
- Stage E template `sentry_redact.ts.j2` denylist expanded to match shared helper verbatim with explicit `Phase 9 D-03 convergence` pinning comment
- 67 new tests across all SDKs: 24 contracts vitest + 16 Py observability + 6 Py security + 8 apps/api security + 13 apps/dispatch instrumentation

## Task Commits

Each task was committed atomically with passing pre-commit hooks (NO `--no-verify`):

1. **Task 1: Shared TS redaction helper + cross-language fixture + gitleaks allowlist** — `cfcd757` (feat)
2. **Task 2: Python equivalent + observability package + cross-language fixture parity** — `0f429c7` (feat)
3. **Task 3: Wire shared helper into apps/api + apps/dispatch + apps/web shim + Stage E template + 4-SDK leak audit** — `1c24f57` (feat)

## Files Created/Modified

### Created (10)
- `packages/contracts/src/sentry-redaction.ts` — Shared TS `redactBeforeSend<T extends SentryEventLike>(event: T): T` + REDACTED_HEADERS Set + VARIABLE_AUTH_HEADER_RE + SENSITIVE_STRING_PATTERNS (5 regexes) + REDACTED_QUERY_PARAMS (4 names) + REDACTION_VALUE
- `packages/contracts/src/sentry-redaction.test.ts` — 24 vitest tests (16 unit + 6 fixture vectors + 5 constants assertions)
- `tests/fixtures/leak-vectors.json` — REPO ROOT cross-language fixture: 6 vectors × {name, input_event, expected_no_match[]} with sentinel `MCPGEN_LEAK_CANARY_2026Q2`
- `apps/generation-engine/src/mcpgen_engine/observability/__init__.py` — re-exports `configure_langfuse_otel` + `redact_before_send` for backward compat
- `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` — Python `redact_before_send(event, _hint)` mirroring TS 5-step contract
- `apps/generation-engine/tests/observability/__init__.py + test_sentry_redaction.py` — 16 pytest tests (10 unit + 1 cross-language fixture + 1 langfuse regression + 4 constants)
- `apps/generation-engine/tests/security/__init__.py + test_pii_redaction.py` — 6 parametrized leak-vector tests (D-12 CI security gate, separate module for `pytest -m security` future tagging)
- `apps/dispatch/src/instrumentation.ts` — NEW `sentryOptionsFor(env): CloudflareOptions` mirroring apps/api shape + `withSentry` re-export (Pitfall #3 closed)
- `apps/dispatch/tests/instrumentation.test.ts` — 13 vitest tests proving wiring + 6-vector regression suite
- `apps/api/tests/security/sentry-redaction.test.ts` — 8 vitest tests (6 vectors + 2 D-01 invariants)

### Modified (9)
- `packages/contracts/src/index.ts` — re-exports sentry-redaction module
- `packages/contracts/package.json` — `"./sentry-redaction": "./src/sentry-redaction.ts"` exports entry
- `apps/generation-engine/src/mcpgen_engine/observability.py` → renamed to `observability/langfuse_otel.py` (package conversion preserves git rename detection)
- `apps/generation-engine/src/mcpgen_engine/main.py` — removed inline `_sentry_before_send`; imports `redact_before_send`; switched relative→absolute imports
- `apps/generation-engine/tests/test_main.py` — updated to import shared helper (replaces broken `_sentry_before_send` import)
- `apps/api/src/instrumentation.ts` — removed inline STRIPE_SK_RE/STRIPE_CUS_RE/JWT_RE/redactString; uses shared `redactBeforeSend`; explicit `CloudflareOptions` return type
- `apps/dispatch/src/index.ts` — wired `withSentry((env) => sentryOptionsFor(env), {fetch: app.fetch})` with Bun port-export bridge
- `apps/web/src/lib/sentry/redact.ts` — thin re-export shim; preserves Phase 7's 17 vitest unit tests via backward-compat aliases
- `packages/codegen-templates/templates/sentry_redact.ts.j2` — expanded denylist (7 headers + VARIABLE_AUTH_HEADER_RE + SENSITIVE_STRING_PATTERNS) + Phase 9 D-03 convergence header comment
- `.gitleaks.toml` — allowlists fixture path + 5 redaction-source files (Pitfall #7 mitigation)

## Decisions Made

(See `key-decisions` frontmatter — 8 decisions captured.)

Most consequential:
1. **Thin-shim apps/web pattern** preserves all 17 plan 07-06 vitest unit tests verbatim while delegating to shared helper — minimal blast radius.
2. **apps/dispatch Bun + withSentry compose dance** wraps inner `{fetch}` then re-attaches port — satisfies both Bun port-export and Sentry CF Workers wrapper contract per A11 plan fallback note.
3. **Stage E template inlined denylist** (Option a) with explicit "Phase 9 D-03 convergence" pinning comment — tenant Workers ship without `@mcpgen/contracts` workspace dep, so direct import isn't possible.
4. **Cross-app test isolation** — apps/dispatch assertions moved out of apps/api/tests/security to a per-app suite at `apps/dispatch/tests/instrumentation.test.ts` because TS rootDir constraints reject cross-app source imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] esbuild rejects `*/` glob in JSDoc**
- **Found during:** Task 1 (initial vitest run)
- **Issue:** docstring `Bearer / sk_*/ ghp_ / JWT` (with `*/`) was parsed by esbuild as JSDoc end + unexpected `*` token
- **Fix:** Rewrote docstring to spell out `sk_live / sk_test` instead of `sk_*`
- **Files modified:** `packages/contracts/src/sentry-redaction.ts`
- **Verification:** `pnpm --filter @mcpgen/contracts test --run` now exits 0 with all 24 tests
- **Committed in:** `cfcd757` (Task 1 commit)

**2. [Rule 1 - Bug] Test fixtures with underscores broke regex match**
- **Found during:** Task 1 (vitest Test 7/Test 8 failures)
- **Issue:** Test message `'leaked sk_live_FAKE_LEAK_XYZAAAAAAAAAAAAAAAA'` — the suffix has `_` characters NOT in `[A-Za-z0-9]`, so the regex `/sk_live_[A-Za-z0-9]{16,}/` matched only 4 chars after the prefix and didn't consume the leak
- **Fix:** Updated Test 7/8 sentinel to `sk_live_FAKELEAKXYZAAAAAAAAAAAAAAAA` (pure alphanumeric); Py mirror tests updated identically
- **Files modified:** `packages/contracts/src/sentry-redaction.test.ts`, `apps/generation-engine/tests/observability/test_sentry_redaction.py`
- **Verification:** Both vitest + pytest now pass with regex actually consuming the sentinel
- **Committed in:** `cfcd757` + `0f429c7`

**3. [Rule 3 - Blocking] Removing `_sentry_before_send` broke Phase 1 test**
- **Found during:** Task 2 (running pytest tests/test_main.py)
- **Issue:** `test_sentry_before_send_redacts_auth_headers` imported `_sentry_before_send` directly; removal in Phase 9 broke the test
- **Fix:** Updated test to import `redact_before_send` from `mcpgen_engine.observability` — same surface (header redaction) tested via the new shared helper
- **Files modified:** `apps/generation-engine/tests/test_main.py`
- **Verification:** test_main.py now passes (3 tests, 0 failures)
- **Committed in:** `0f429c7` (Task 2 commit)

**4. [Rule 3 - Blocking] jsdom missing in node_modules**
- **Found during:** Task 3 (apps/web vitest run)
- **Issue:** `pnpm --filter @mcpgen/web test` failed with "Cannot find dependency 'jsdom'" — declared in package.json but not actually installed (pre-existing env issue from Phase 7)
- **Fix:** Ran `pnpm install --frozen-lockfile` (lockfile already had jsdom resolved)
- **Files modified:** none (only node_modules)
- **Verification:** All 98 apps/web tests pass including 17 plan 07-06 redact tests
- **Committed in:** part of `1c24f57` workflow (no source change required)

**5. [Rule 1 - Bug] CloudflareOptions vs SentryEventLike type mismatch**
- **Found during:** Task 3 (`pnpm --filter @mcpgen/dispatch typecheck`)
- **Issue:** `withSentry` envCallback expects `CloudflareOptions | undefined`; the inline `beforeSend(event: SentryEventLike) { return redactBeforeSend(event); }` returned `SentryEventLike` but Sentry types `beforeSend` as `(event: ErrorEvent) => ErrorEvent | null`. TypeScript rejected the structural incompatibility at the `withSentry` call site
- **Fix:** Annotate `sentryOptionsFor` return type explicitly as `CloudflareOptions`; let TS structural typing accept `redactBeforeSend(event: ErrorEvent)` because `ErrorEvent` extends `SentryEventLike`. Applied same fix to apps/api for consistency
- **Files modified:** `apps/api/src/instrumentation.ts`, `apps/dispatch/src/instrumentation.ts`
- **Verification:** `pnpm --filter @mcpgen/api typecheck` + `pnpm --filter @mcpgen/dispatch typecheck` pass
- **Committed in:** `1c24f57` (Task 3 commit)

**6. [Rule 3 - Blocking] Cross-app TS rootDir rejection**
- **Found during:** Task 3 (initial apps/api typecheck)
- **Issue:** `apps/api/tests/security/sentry-redaction.test.ts` imported from `../../../dispatch/src/instrumentation.js` — outside apps/api's rootDir → `error TS6059: not under 'rootDir'`
- **Fix:** Per A11 plan fallback note, moved apps/dispatch assertions to a per-app vitest test at `apps/dispatch/tests/instrumentation.test.ts` (apps/dispatch tsconfig already widens rootDir to workspace root)
- **Files modified:** `apps/api/tests/security/sentry-redaction.test.ts` (removed cross-app import + dispatch describe blocks); NEW `apps/dispatch/tests/instrumentation.test.ts`
- **Verification:** Both typecheck + tests pass; 13 apps/dispatch tests prove Pitfall #3 closed
- **Committed in:** `1c24f57` (Task 3 commit)

**7. [Rule 1 - Linter auto-fix] ruff UP038 + ruff-format**
- **Found during:** Task 2 (pre-commit hook on first commit attempt)
- **Issue:** `isinstance(data, (dict, str))` → ruff UP038 wants `isinstance(data, dict | str)` (Python 3.12+ union syntax); ruff-format reformatted f-string concat
- **Fix:** Manually applied `dict | str` change; ruff-format auto-fix accepted
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py`, `tests/observability/test_sentry_redaction.py`, `tests/security/test_pii_redaction.py`
- **Verification:** `pre-commit run` passes; tests still pass
- **Committed in:** `0f429c7` (Task 2 commit, second attempt after auto-fix)

---

**Total deviations:** 7 auto-fixed (3× Rule 1 bug, 3× Rule 3 blocking, 1× Rule 1 linter auto-fix)
**Impact on plan:** All deviations were correctness/blocking fixes. No scope creep — the plan body anticipated #6 explicitly (A11 fallback note) and #4 was a pre-existing Phase 7 env issue surfaced by running Phase 9 tests.

## Issues Encountered

- Pre-commit hook initially restored stashed unstaged files after each ruff auto-fix on first commit attempt (ruff-format modified files in-place). Resolution: re-stage the auto-fixed files via `git add` and re-attempt the commit (standard pre-commit interaction).

## User Setup Required

None — Phase 9 Plan 01 ships SDK-level redaction code only. Real Sentry DSN provisioning (`SENTRY_DSN_API`, `SENTRY_DSN_DISPATCH`, `SENTRY_DSN_ENGINE`, `SENTRY_DSN_WEB`) is per CTRL-08 D-01 + Phase 9 plan 02+ scope; the empty-DSN no-op invariant is preserved across all 4 SDKs and verified by 4 explicit tests.

## Next Phase Readiness

- Plan 09-02 (Langfuse session_id correlation) can proceed — the observability package now has `mcpgen_engine.observability.run_tracing` module slot ready alongside `sentry_redaction.py` + `langfuse_otel.py`
- Plan 09-05 (PII deliberate-leak audit script `scripts/observability/leak-audit.ts`) can consume `tests/fixtures/leak-vectors.json` directly for sentinel injection
- Phase 10 launch (real Sentry source-maps upload via `pnpm sourcemaps:upload`) inherits a verified beforeSend redactor — no additional credential-leak surface to audit pre-launch

## Threat Flags

None — no new security-relevant surface introduced. The plan's `<threat_model>` accurately enumerated 10 threats (T-9-redact-01..05, T-9-pii-01..03, T-9-empty-dsn, T-9-fixture-leak), all with `mitigate` dispositions verified by the 67 new tests.

## Self-Check: PASSED

Verified by direct filesystem + commit checks (2026-04-30T12:02:57Z):

**Files created — confirmed present:**
- `packages/contracts/src/sentry-redaction.ts` — FOUND
- `packages/contracts/src/sentry-redaction.test.ts` — FOUND
- `tests/fixtures/leak-vectors.json` — FOUND
- `apps/generation-engine/src/mcpgen_engine/observability/__init__.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/observability/sentry_redaction.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/observability/langfuse_otel.py` — FOUND (renamed from observability.py)
- `apps/generation-engine/tests/observability/test_sentry_redaction.py` — FOUND
- `apps/generation-engine/tests/security/test_pii_redaction.py` — FOUND
- `apps/dispatch/src/instrumentation.ts` — FOUND
- `apps/dispatch/tests/instrumentation.test.ts` — FOUND
- `apps/api/tests/security/sentry-redaction.test.ts` — FOUND

**Commits — confirmed in `git log`:**
- `cfcd757` (Task 1) — FOUND
- `0f429c7` (Task 2) — FOUND
- `1c24f57` (Task 3) — FOUND

**Tests — last green status:**
- `pnpm --filter @mcpgen/contracts test --run` → 102 passed (5 files)
- `cd apps/generation-engine && uv run pytest tests/observability/ tests/security/test_pii_redaction.py tests/test_observability.py tests/test_main.py -x` → 27 passed
- `cd apps/api && npx vitest --run` → 127 passed | 11 skipped
- `cd apps/dispatch && npx vitest --run` → 30 passed
- `cd apps/web && npx vitest --run` → 98 passed
- `cd apps/generation-engine && uv run pytest tests/stages/stage_e/ -x` → 187 passed (Stage E codegen unaffected by template denylist expansion)

---
*Phase: 09-observability-polish*
*Completed: 2026-04-30*
