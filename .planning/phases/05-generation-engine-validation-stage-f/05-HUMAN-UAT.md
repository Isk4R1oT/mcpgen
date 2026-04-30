---
status: partial
phase: 05-generation-engine-validation-stage-f
source: [05-VERIFICATION.md]
started: 2026-04-30T00:40:00Z
updated: 2026-04-30T00:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Real-LLM 3× per-fixture calibration drain
expected: Stripe/GitHub/Notion reach quality_badge ∈ {verified, premium}; Linear/Slack reach ∈ {standard, verified}; total LLM spend ≤ $60. Operator updates 5 quality-report.json files with `_calibration` block (median ± tolerance) and re-runs `pytest -m 'requires_openrouter and requires_anthropic'`. Procedure documented in `05-10-CALIBRATION-EVIDENCE.md`.
result: [pending — needs .env.local credentials (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, STRIPE_TEST_KEY, GITHUB_TEST_PAT, NOTION_TEST_TOKEN)]

### 2. Address 1 critical security finding from 05-REVIEW.md (CR-01)
expected: TOCTOU between path validation and read in `apps/generation-engine/src/mcpgen_engine/api/generate.py:485-507` (Stage E output endpoint) — apply O_NOFOLLOW or per-process output dir ownership fix. Code review filed AFTER PHASE-VERIFICATION sign-off (commit 7eb3bcb).
result: [pending — security-relevant; recommend `/gsd-code-review-fix 5` or manual fix + paired decision-log entry]

### 3. Address 12 warning + 11 info findings from 05-REVIEW.md
expected: Triage WR-01..WR-12 + IN-01..IN-11. Several are correctness gaps (WR-04 hollow `tool_calls` passes rule-based eval; WR-02 BUNDLE_SIZE_HARD short-circuits secret_scan; WR-01 catch-all in F3 hides errors; WR-09 no per-call retry on transient OpenRouter errors) that could affect F2/F3 calibration accuracy.
result: [pending — recommend `/gsd-code-review-fix 5` for auto-fixable items, manual triage for the rest]

### 4. Phase 4 carry-forward: MCPGEN_F3_TEST=1 hostHeaderValidation bypass
expected: Add MCPGEN_F3_TEST short-circuit OR include `127.0.0.1:*` in ALLOWED_HOSTS when `MCPGEN_F3_TEST=1` to `packages/codegen-templates/templates/auth_middleware.ts.j2`. Without this, real `wrangler dev` F3 runs against generated fixtures will fail with DNS-rebinding rejection. Documented in `deferred-items.md`.
result: [pending — Phase-4 template change; required before real-LLM calibration drain (Test 1) can succeed]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
