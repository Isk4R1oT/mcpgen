---
phase: 05-generation-engine-validation-stage-f
plan: 10
task: 2
date: 2026-04-29
status: deferred-to-operator
auto_mode: true
---

# Plan 05-10 Task 2 — Real-LLM Calibration Evidence

> **Status: DEFERRED (auto-mode + sandboxed worktree).**
> The 3× per-fixture calibration runs require real OpenRouter +
> Anthropic credentials and ~$48 of LLM spend. The auto-mode executor
> running in this worktree does NOT have access to the operator's
> `.env.local` secrets and CANNOT invoke real LLM calls. This document
> records (a) the calibration procedure to execute when an operator
> picks this up, (b) the structural references already in place, and
> (c) the auto-mode rationale for deferral.

---

## Auto-Mode Deferral Rationale

Per the Plan 05-10 executor objective:

> The plan calls for "real-LLM verification gate (3× pipeline runs per
> fixture)" — this is gated by a `requires_openrouter` /
> `requires_anthropic` integration marker. If the run is unavailable
> in this sandbox (no live keys, network restrictions), produce
> mocked-tier baselines + skip the real-LLM tier with a clear
> `pytest.mark.skip` reason and document it in SUMMARY.md as a
> deferred-items entry, rather than blocking. Do not invoke real
> OpenRouter/Anthropic calls if env vars are missing.

The mocked-LLM tier (Plan 05-10 Task 1) is fully landed and green:

```
$ uv run pytest tests/integration/test_phase_5_5_fixtures.py
....... sssss     [100%]
7 passed, 5 skipped in 11.08s
```

The 5 `requires_openrouter` / `requires_anthropic` tests skip cleanly
when credentials are placeholders — verified.

---

## Real-LLM Calibration Procedure (operator-driven)

**Pre-flight:**

1. Verify `.env.local` has: `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
   `STRIPE_TEST_KEY`, `GITHUB_TEST_PAT`, `NOTION_TEST_TOKEN`.
2. Check OpenRouter + Anthropic balance (target: $50+ available).
3. Pre-warm node_modules for `tsc --noEmit` Stage F1 subprocess:
   `cd packages/codegen-templates && pnpm install`.

**Per-fixture calibration runs (3× per fixture):**

For each of `stripe`, `github`, `notion`:

```bash
# Run pipeline 3× with cache disabled.
for run in 1 2 3; do
  rm -rf /tmp/mcpgen-cache-run-${run}
  MCPGEN_CACHE_DIR=/tmp/mcpgen-cache-run-${run} \
    uv run pytest \
    apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py::test_real_llm_top_3_verified_minimum \
    -k <fixture> \
    -m "requires_openrouter and requires_anthropic" \
    --no-cov \
    -s
  # Record into a `runs.csv`:
  #   fixture, run_index, f1_passed, f2_overall_score, f2_sigma, f3_pass_rate, quality_badge, total_cost_usd
done
```

For `linear`, `slack` (mocked upstream):

```bash
for run in 1 2 3; do
  rm -rf /tmp/mcpgen-cache-run-${run}
  MCPGEN_CACHE_DIR=/tmp/mcpgen-cache-run-${run} \
    uv run pytest \
    apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py::test_real_llm_mocked_upstream_standard_minimum \
    -k <fixture> \
    -m requires_openrouter \
    --no-cov \
    -s
done
```

**Calibration data (after 3 runs per fixture):**

For each fixture:

1. Compute median F2.overall_score across 3 runs; calibrated bound = median ± 0.5.
2. Compute median F3.pass_rate across 3 runs (Stripe/GitHub/Notion only); calibrated bound = median ± 0.2.
3. Update `packages/engine-fixtures/<spec>/quality-report.json` with the
   calibrated values + a `_calibration` block:

```json
{
  ...
  "_calibration": {
    "runs": 3,
    "f2_overall_median": 4.31,
    "f2_overall_tolerance": 0.5,
    "f3_pass_rate_median": 0.80,
    "f3_pass_rate_tolerance": 0.2,
    "calibrated_at": "<ISO-8601 UTC>",
    "engine_version": "<git short SHA>"
  }
}
```

**Verification gate:**

After calibration, run the real-LLM tests once more against the
calibrated bounds:

```bash
uv run pytest \
  apps/generation-engine/tests/integration/test_phase_5_5_fixtures.py \
  -m "requires_openrouter and requires_anthropic" \
  --no-cov
```

Verify launch acceptance criterion:

- Stripe + GitHub + Notion all reach `quality_badge ∈ {"verified", "premium"}`.
- Linear + Slack reach `quality_badge ∈ {"standard", "verified"}`.
- Total LLM spend ≤ $60 (cost cap).

---

## Current Reference State (already committed by Plan 05-09)

The 5 fixture `quality-report.json` files contain hand-tuned references
(scaffolds) committed by Plan 05-09. Each is structurally valid and
satisfies the launch-criterion threshold sanity checks asserted by the
real-LLM-tier tests:

| Fixture | f2 overall_average | f3 pass_rate | quality_badge |
|---------|--------------------|--------------|---------------|
| stripe  | 4.39               | 0.82         | verified      |
| github  | (verify on `cat`)  | (verify)     | verified      |
| notion  | (verify on `cat`)  | (verify)     | verified      |
| linear  | 4.33               | 0.79         | verified      |
| slack   | (verify on `cat`)  | (verify)     | (verified or standard) |

The `_calibration` block is absent on all 5 — operator adds it after
the 3-run calibration completes.

---

## Mocked-Tier Baseline (this run, auto-mode)

The mocked-tier baseline is fully green and locked in commit
`651fc9a`:

```
test_pipeline_structure_mocked[stripe]    PASS
test_pipeline_structure_mocked[github]    PASS
test_pipeline_structure_mocked[notion]    PASS
test_pipeline_structure_mocked[linear]    PASS
test_pipeline_structure_mocked[slack]     PASS
test_f1_fail_closed_mocked                PASS
test_gen_12_cache_hit_zero_llm_mocked     PASS
test_real_llm_top_3_verified_minimum[stripe]   SKIP (placeholder OPENROUTER_API_KEY)
test_real_llm_top_3_verified_minimum[github]   SKIP (placeholder OPENROUTER_API_KEY)
test_real_llm_top_3_verified_minimum[notion]   SKIP (placeholder OPENROUTER_API_KEY)
test_real_llm_mocked_upstream_standard_minimum[linear] SKIP (placeholder OPENROUTER_API_KEY)
test_real_llm_mocked_upstream_standard_minimum[slack]  SKIP (placeholder OPENROUTER_API_KEY)
```

---

## Deferred Items (Phase 5 Sign-Off Blockers Down-Graded by Auto-Mode)

| Item | Why deferred | When to drain |
|------|--------------|---------------|
| 3× pipeline runs × 5 fixtures (real LLM) | Auto-mode + sandboxed worktree (no `.env.local` access); cost cap ~$48 | Operator runs against real keys before Phase-6 (Runtime) merge |
| `_calibration` block in 5 quality-report.json files | Depends on the 3× runs above | Same gate |
| Verifier-agent run on Phase 5 close-out | Depends on calibration evidence | Same gate |

These are documented as Phase 5 carry-forward in
`05-PHASE-VERIFICATION.md` and tracked in `deferred-items.md`.
