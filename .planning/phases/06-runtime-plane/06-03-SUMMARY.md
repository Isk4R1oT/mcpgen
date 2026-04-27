---
phase: 06-runtime-plane
plan: 03
subsystem: runtime
tags: [auth, passthrough, stored-creds, oauth-stub, sentry-redaction, hkdf, aes-gcm, aes-kw, bun-sqlite, pii-leak-audit]
requires:
  - "@mcpgen/runtime AuthMode discriminated union (Phase 1)"
  - "tests/runtime/fixtures/deliberate-leak.ts (Wave 0)"
  - "RUNTIME_KEK + RUNTIME_PASSTHROUGH_KEYS env-var contract"
provides:
  - "@mcpgen/runtime/auth — resolveUpstreamCredential dispatcher (passthrough/stored/oauth)"
  - "@mcpgen/runtime/auth/passthrough — encryptPassthrough/decryptPassthrough (HKDF + AES-GCM)"
  - "@mcpgen/runtime/auth/stored — encryptStored/decryptStored (AES-256-GCM + AES-KW DEK wrap on bun:sqlite)"
  - "@mcpgen/runtime/auth/oauth-stub — OAuthDeferralError + oauthStubErrorResponse (501 deferral)"
  - "@mcpgen/runtime/observability — buildBeforeSend(extraHeaderDenylist) Sentry redactor"
affects:
  - "All Phase 4 generated tenant Workers will mount @mcpgen/runtime/auth middleware"
  - "Every app's Sentry init plugs in buildBeforeSend (FND-10)"
tech-stack:
  added:
    - bun:sqlite (Bun-runtime SQLite for stored creds)
    - WebCrypto HKDF + AES-GCM + AES-KW
  patterns:
    - "HKDF-SHA-256 with per-tenant info: tenant:${tenantId} for derivation isolation"
    - "AES-KW envelope: master KEK wraps per-tenant DEK (architecture §14)"
    - "Discriminated-union switch dispatcher with TypeScript exhaustiveness narrowing"
    - "Sentry beforeSend chokepoint with case-insensitive header denylist"
key-files:
  created:
    - packages/runtime-sdk/src/auth/passthrough.ts
    - packages/runtime-sdk/src/auth/stored.ts
    - packages/runtime-sdk/src/auth/oauth-stub.ts
    - packages/runtime-sdk/tests/passthrough.test.ts
    - packages/runtime-sdk/tests/stored.test.ts
    - packages/runtime-sdk/tests/oauth-stub.test.ts
    - packages/runtime-sdk/tests/sentry-redaction.test.ts
    - tests/runtime/passthrough-credentials.test.ts
    - tests/runtime/stored-credentials-aes.test.ts
    - tests/runtime/oauth-stub.test.ts
    - tests/runtime/sentry-redaction.test.ts
    - tests/runtime/pii-leak-audit.test.ts
  modified:
    - packages/runtime-sdk/src/auth/index.ts (real dispatcher; was Wave-2 stub)
    - packages/runtime-sdk/src/runtime/sentry-redaction.ts (real redactor; was Wave-2 stub)
    - packages/runtime-sdk/package.json (test→bun test; added auth/passthrough|stored|oauth-stub subpath exports; @types/bun)
    - packages/runtime-sdk/tsconfig.json (types: ['node','bun'] for bun:sqlite typings)
    - tests/runtime/package.json (test runs vitest then bun test for bun-only files)
    - tests/runtime/vitest.config.ts (excludes bun-only test files)
    - .gitignore (*.sqlite + journals)
decisions:
  - "Switched runtime-sdk test runner from vitest to bun test (Wave-2 precedent applied a level deeper) — bun:sqlite requires Bun runtime; vitest worker pool fails under bun --bun"
  - "Split tests/runtime tests into vitest (Node) + bun test (Bun): files importing bun:sqlite or @mcpgen/runtime/auth dispatcher live in the bun-test bucket, others remain in vitest"
  - "Buffer copy in decryptStored — typescript@6 + @types/node@22 narrow ArrayBuffer vs SharedArrayBuffer in WebCrypto signatures; copying the bun:sqlite Uint8Array into a fresh ArrayBuffer is the cleanest path"
metrics:
  duration: 11m
  completed_date: "2026-04-27"
  tasks_completed: 3
  unit_tests: 56
  integration_tests: 8
---

# Phase 6 Plan 03: Three upstream-credential modes + Sentry redaction + PII leak audit Summary

**One-liner:** RUN-03 / RUN-04 / RUN-05 + D-16 in one wave — pass-through HKDF+AES-GCM, stored AES-256-GCM with AES-KW-wrapped per-tenant DEK on `bun:sqlite`, OAuth-mode stub returning structured `{ error: "oauth_mode_phase_10_deferral" }`, plus a centralised Sentry `beforeSend` redactor and a deliberate-leak fixture-based PII audit proving zero credential strings escape into observability sinks.

## What was done

### Task 1: Pass-through credential mode (RUN-03)
- `packages/runtime-sdk/src/auth/passthrough.ts` — `encryptPassthrough` + `decryptPassthrough` using `crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: 'mcpgen.passthrough.v1', info: 'tenant:${tenantId}' })` → AES-256-GCM. Per-tenant secret material loaded from `RUNTIME_PASSTHROUGH_KEYS` env (JSON map of `{tenantId: base64}`); never persisted, never logged.
- `packages/runtime-sdk/src/auth/index.ts` — `resolveUpstreamCredential(req, tenant, mode)` dispatcher with `switch (mode.mode)` over the AuthMode discriminated union; TS narrows exhaustively, no default branch.
- Subpath exports added to `@mcpgen/runtime`: `./auth/passthrough`, `./auth/stored`, `./auth/oauth-stub` so leaf imports avoid the `bun:sqlite`-loading barrel for Node-runtime tests.
- Tests: 3 unit tests (round-trip, missing-header, cross-tenant isolation) + 1 deliberate-leak audit (console-sink capture for all 5 fixtures, zero matches asserted).

### Task 2: Stored credential mode (RUN-04)
- `packages/runtime-sdk/src/auth/stored.ts` — `encryptStored` / `decryptStored` / `_clearStoredCredsForTest` against a `bun:sqlite` `tenant_creds` table. Per call: generate fresh AES-256-GCM DEK, encrypt plaintext, AES-KW-wrap the DEK under `RUNTIME_KEK` master key (32-byte base64), `INSERT OR REPLACE` with `?` parameter binds. Decrypt path unwraps DEK, then AES-GCM decrypts the ciphertext.
- Tests: 3 unit tests (round-trip, missing-row, KEK-rotation breaks decryption) + 1 SQL-injection integration test (malicious `tenant_id = "alice'; DROP TABLE tenant_creds; --"` → table still exists). Per WARNING-6 the integration test uses `count(*) AS c` so the `.get().c` access path matches `bun:sqlite`'s row-key-from-literal-expression behaviour.

### Task 3: OAuth-mode stub + Sentry redaction + PII leak audit (RUN-05, D-16)
- `packages/runtime-sdk/src/auth/oauth-stub.ts` — `OAuthDeferralError` (`code='oauth_mode_phase_10_deferral'`, `deferred_to_phase=10`); `oauthStub()` throws it; `oauthStubErrorResponse(err)` returns a 501 JSON `Response` for Hono `app.onError`.
- `packages/runtime-sdk/src/runtime/sentry-redaction.ts` — `buildBeforeSend(extraHeaderDenylist)` returns a Sentry `beforeSend` that scrubs `Authorization`/`X-Upstream-Auth`/`Cookie` + dynamic spec-declared headers from `event.request.headers` (case-insensitive), wholesale replaces `event.request.data`, redacts denylisted keys in `breadcrumbs[].data` and `event.extra`.
- Tests: 2 unit tests (oauth-stub error shape + 501 response; redactor across headers/data/breadcrumbs/extra with case-insensitivity) + 3 integration tests (cross-app `resolveUpstreamCredential` oauth path; redactor wired through `@mcpgen/runtime/observability`; full PII leak audit iterating every fixture across every sink path with `JSON.stringify(redactedEvent).not.toContain(fixture)` assertion).

## Test results

```
@mcpgen/runtime test (bun test):  56 pass, 0 fail
@mcpgen/tests-runtime vitest:      8 pass, 1 skipped (DATABASE_URL guard)
@mcpgen/tests-runtime bun test:    2 pass, 0 fail
@mcpgen/runtime typecheck:         0 errors
@mcpgen/tests-runtime typecheck:   0 errors
```

## Commits

- `a9423f6` — feat(06-03): pass-through credential mode + auth dispatcher (RUN-03)
- `49e9edb` — feat(06-03): stored credential mode with AES-256-GCM + AES-KW DEK wrap (RUN-04)
- `0e37211` — feat(06-03): OAuth-mode stub + Sentry beforeSend redactor + PII leak audit (RUN-05, D-16)

## Deviations from Plan

### `[Rule 3 — Blocking]` Switched @mcpgen/runtime test runner from vitest to bun test
- **Found during:** Task 2 — `stored.ts` `import { Database } from 'bun:sqlite'` cannot resolve under vitest (Node runtime); `bun --bun vitest` fails because the vitest worker pool depends on `node:worker_threads` `port.addListener` which Bun does not implement.
- **Fix:** Changed `packages/runtime-sdk/package.json` `"test": "bun test --pass-with-no-tests"`. Bun's test API is vitest-compatible (`describe`/`it`/`expect`/`beforeEach`/`afterEach`) so existing tests (smart-id, routes, interface, not-stubbed) continue to pass without modification — verified 50 prior tests stayed green.
- **Trade-off:** Verify-command literal in plan was `pnpm --filter @mcpgen/runtime test --run passthrough.test.ts`; new path is `pnpm --filter @mcpgen/runtime test passthrough.test.ts` (bun test takes path positionally, no `--run`). Wave 2 hit the same divergence in `apps/tenant-worker-runner` and accepted it (06-02-SUMMARY §"Switched runner test runner from vitest to bun:test").
- **Files modified:** `packages/runtime-sdk/package.json`

### `[Rule 3 — Blocking]` Split `tests/runtime` tests into vitest + bun test buckets
- **Found during:** Task 1 — `tests/runtime/passthrough-credentials.test.ts` originally imported from `@mcpgen/runtime/auth` (the dispatcher barrel), which transitively imports `stored.ts` → `bun:sqlite`. Vitest in `tests/runtime` (Node runtime) refused to load.
- **Fix:** Two-pronged. (a) Added subpath exports `./auth/passthrough` / `./auth/stored` / `./auth/oauth-stub` so node-side tests can import the leaf without dragging in `bun:sqlite`. (b) Files that genuinely require Bun runtime (`stored-credentials-aes.test.ts`, `oauth-stub.test.ts` — both touch the dispatcher barrel) are excluded from the vitest config and run via a new `test:bun` script (`bun test --pass-with-no-tests stored-credentials-aes.test.ts oauth-stub.test.ts`). The aggregate `test` script runs vitest then `pnpm test:bun`.
- **Files modified:** `tests/runtime/package.json`, `tests/runtime/vitest.config.ts`, `packages/runtime-sdk/package.json` (new exports)

### `[Rule 1 — Bug]` ArrayBuffer / SharedArrayBuffer narrowing under typescript@6 + @types/node@22
- **Found during:** Task 3 typecheck.
- **Issue:** `crypto.subtle.unwrapKey` and `crypto.subtle.decrypt` parameter types accept only `ArrayBuffer`, not `ArrayBufferLike`. `bun:sqlite` returns `Uint8Array<ArrayBufferLike>` whose `.buffer` is `ArrayBuffer | SharedArrayBuffer`.
- **Fix:** Copy `iv`, `ct`, `wrapped_dek` into freshly-allocated `Uint8Array` instances inside `decryptStored`; their `.buffer` is provably `ArrayBuffer`. No security impact — copies are local, freed at function end.
- **Files modified:** `packages/runtime-sdk/src/auth/stored.ts`

### `[Rule 2 — Critical functionality]` `.gitignore` for `*.sqlite`
- **Found during:** Task 1 commit — `stored.ts` default DB path created `packages/runtime-sdk/stored-creds.sqlite` during the `db.exec(CREATE TABLE...)` import-time side effect, leaving an untracked artifact.
- **Fix:** Added `*.sqlite` / `*.sqlite-{journal,wal,shm}` to `.gitignore`.

## Self-Check

- packages/runtime-sdk/src/auth/passthrough.ts: FOUND
- packages/runtime-sdk/src/auth/stored.ts: FOUND
- packages/runtime-sdk/src/auth/oauth-stub.ts: FOUND
- packages/runtime-sdk/src/auth/index.ts: FOUND
- packages/runtime-sdk/src/runtime/sentry-redaction.ts: FOUND
- packages/runtime-sdk/tests/passthrough.test.ts: FOUND
- packages/runtime-sdk/tests/stored.test.ts: FOUND
- packages/runtime-sdk/tests/oauth-stub.test.ts: FOUND
- packages/runtime-sdk/tests/sentry-redaction.test.ts: FOUND
- tests/runtime/passthrough-credentials.test.ts: FOUND
- tests/runtime/stored-credentials-aes.test.ts: FOUND
- tests/runtime/oauth-stub.test.ts: FOUND
- tests/runtime/sentry-redaction.test.ts: FOUND
- tests/runtime/pii-leak-audit.test.ts: FOUND
- Commit a9423f6: FOUND
- Commit 49e9edb: FOUND
- Commit 0e37211: FOUND

## Self-Check: PASSED
