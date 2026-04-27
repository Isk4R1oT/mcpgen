// tests/runtime/fixtures/deliberate-leak.ts
//
// Phase 6 Wave 0 fixture — deliberate-credential strings used by the PII
// leak audit (Wave 5: tests/runtime/pii-leak-audit.test.ts) and the
// sentry-redaction unit test (Wave 5: tests/runtime/sentry-redaction.test.ts).
//
// Per pitfall #12 + D-16: zero matches must appear in any Sentry event payload,
// BetterStack log line, or console output across @mcpgen/runtime, dispatch,
// tenant-worker-runner, dispatch-sample. The audit asserts each string below
// is absent from observed log/Sentry sinks after deliberately injecting them
// into request headers.
//
// These are FIXTURE strings, NOT real credentials. Each is shaped like the
// real-world equivalent so the redactor's regex is exercised.

// String shapes match the existing .gitleaks.toml allowlist regexes
// (`sk_test_.*placeholder.*` and `ghp_PLACEHOLDER.*`) so the file passes
// pre-commit gitleaks while still being recognisable as redaction targets
// for the Phase-9 PII leak audit. We deliberately stayed inside the allowlist
// rather than adding `tests/runtime/fixtures/.*` to the path-allowlist, which
// would weaken gitleaks coverage for any future test fixture in this dir.
export const DELIBERATE_LEAK_FIXTURES = {
  bearer_token: 'Bearer sk_test_phase6fixture_placeholder_not_a_real_secret_12345678',
  stripe_live: 'sk_test_phase6fixture_live_mode_placeholder_not_a_real_secret',
  github_pat: 'ghp_PLACEHOLDER_PHASE6_FIXTURE_NOT_A_REAL_TOKEN_abcd1234',
  x_upstream_auth: 'X-Upstream-Auth-PHASE6FIXTURE-base64encodedblob==',
  cookie: 'session=PHASE6FIXTURESESSION; HttpOnly',
} as const;

// The denylist the redactor must scrub. Mirrored from D-16 + RESEARCH §"Pitfall 4".
export const REDACTION_HEADER_DENYLIST = [
  'Authorization',
  'X-Upstream-Auth',
  'Cookie',
] as const;
