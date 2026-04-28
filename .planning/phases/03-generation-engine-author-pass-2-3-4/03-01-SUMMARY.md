---
phase: 03-generation-engine-author-pass-2-3-4
plan: 01
subsystem: engine-foundation
tags: [tiktoken, jsonschema, sampling-profiles, l2-cache, ir-codegen, prompt-version, description-hash, pytest-fixtures]

# Dependency graph
requires:
  - phase: 02-generation-engine-architect-pass-0-1
    provides: "_PROVIDER_ROUTING (atlas-cloud/fp8/no-fallbacks pin), PASS_0_SETTINGS / PASS_1_SETTINGS, l2_key signature, IR codegen pipeline (Zod → Pydantic), conftest.py module-level OPENROUTER_API_KEY priming, mcpgen_ir.types Pass2Output / Descriptions"
provides:
  - "PASS_2_SETTINGS (T=0.3, max_tokens=2048) — creative description authoring"
  - "PASS_3_SETTINGS (T=0.2, max_tokens=1024) — per-parameter enrichment"
  - "PASS_4_SETTINGS (T=0.0, max_tokens=512) — boolean classification + title"
  - "INLINE_GATE_SETTINGS (T=0.0, max_tokens=512) — judge mode, reused by Pass 2 + Pass 3 inline gates"
  - "l2_key prompt_version: str = '1' keyword-only param (D-35) — invalidates cache cleanly when prompts.py bumps"
  - "Descriptions.description_hash: Optional[str] = None (D-40 / D-14) — strictly-additive, used by Pass 2 diff helper for Pitfall #7 description-drift surfacing"
  - "Empty placeholder packages passes/pass_{2,3,4}/__init__.py — keeps mypy import resolution green for downstream wave plans"
  - "tests/passes/pass_{2,3,4}/conftest.py with stripe_pass1_output / stripe_raw_ir / stripe_pass2_output / stripe_pass3_output / httpx_mock_qwen fixtures"
  - "tests/integration/{4 placeholder files} that pytest.skip with cited Plan owner"
  - "tiktoken 0.12.0 + jsonschema 4.26.0 promoted to direct deps in apps/generation-engine/pyproject.toml"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10, 03-11, 03-12]

# Tech tracking
tech-stack:
  added: ["tiktoken>=0.7,<1 (resolved 0.12.0)", "jsonschema>=4.26,<5 (resolved 4.26.0)"]
  patterns:
    - "Phase 3 sampling profile contract: every new ModelSettings reuses the SAME _PROVIDER_ROUTING dict literal — verified by 6 references / 1 literal-definition invariant + test_provider_routing_is_singleton object-identity check"
    - "L2 cache prompt_version: keyword-only str = '1' default keeps Phase 2 callers backward-compatible; bumping it (per Pass) invalidates cache when prompts.py changes (Pitfall #7)"
    - "IR additive change pattern: bump packages/ir/src/types.ts Zod source + run pnpm --filter @mcpgen/ir codegen (NOT direct edit of packages/ir/python/types.py); commit both TS source and regenerated Python in one atomic commit"
    - "Empty placeholder __init__.py with module docstring + downstream-plan reference comment is the sanctioned shape for wave-0 scaffolding"
    - "Wave-0 conftest skip-on-missing pattern: stripe_pass2_output / stripe_pass3_output fixtures call pytest.skip when the JSON file isn't yet hand-tuned (lands Plan 03-12)"
    - "Integration-test placeholder pattern: each future-plan integration test ships as a single-test file that pytest.skip with the cited Plan owner — keeps test IDs stable across waves so per-plan diffs only flip skip→pass"

key-files:
  created:
    - "apps/generation-engine/tests/test_sampling_profiles.py — 6 pure-function tests for PASS_2/3/4 + INLINE_GATE settings + singleton invariant + atlas-cloud/fp8/no-require_parameters pin"
    - "apps/generation-engine/tests/test_cache_keys_prompt_version.py — 6 pure-function tests for prompt_version backward-compat, version-bump invalidation, L1/L3 regression, and IR additive smoke"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_2/__init__.py — empty placeholder (Plan 03-04 fills run())"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_3/__init__.py — empty placeholder (Plan 03-09 fills run())"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_4/__init__.py — empty placeholder (Plan 03-11 fills run())"
    - "apps/generation-engine/tests/passes/__init__.py + tests/passes/pass_{2,3,4}/__init__.py — package markers"
    - "apps/generation-engine/tests/passes/pass_2/conftest.py — fixtures: stripe_pass1_output, stripe_raw_ir, httpx_mock_qwen"
    - "apps/generation-engine/tests/passes/pass_3/conftest.py — same + stripe_pass2_output (skip-on-missing)"
    - "apps/generation-engine/tests/passes/pass_4/conftest.py — stripe_pass1_output + stripe_pass2_output + stripe_pass3_output (skip-on-missing)"
    - "apps/generation-engine/tests/integration/__init__.py + 4 placeholder integration tests (test_l1_warm_pass_2_3_4 / test_description_diff / test_pass_4_cursor_invariant / test_pipeline_e2e)"
  modified:
    - "apps/generation-engine/pyproject.toml — promoted tiktoken + jsonschema to direct deps"
    - "apps/generation-engine/uv.lock — refreshed for new direct deps"
    - "apps/generation-engine/src/mcpgen_engine/llm/sampling.py — appended PASS_2_SETTINGS / PASS_3_SETTINGS / PASS_4_SETTINGS / INLINE_GATE_SETTINGS"
    - "apps/generation-engine/src/mcpgen_engine/cache/keys.py — extended l2_key with keyword-only prompt_version: str = '1'"
    - "packages/ir/src/types.ts — added optional description_hash to ToolDescription Zod object"
    - "packages/ir/python/types.py — regenerated via codegen (description_hash: Optional[str] = None now appears on Descriptions / Description / ToolDescription Pydantic models)"

key-decisions:
  - "Reused the existing _PROVIDER_ROUTING dict literal verbatim — every new ModelSettings carries extra_body=_PROVIDER_ROUTING (object identity, not a fresh literal). Pitfall #2 invariant: 6 references / 1 literal definition; verified by both grep and test_provider_routing_is_singleton."
  - "prompt_version default value '1' (NOT empty string or None) — keeps Phase 2 Pass 0/1 callers backward-compatible; an explicit prompt_version='1' produces the same hash as omitting the kwarg."
  - "IR codegen path: pnpm --filter @mcpgen/ir codegen (canonical script name from packages/ir/package.json scripts.codegen). datamodel-code-generator regenerates packages/ir/python/types.py; codegen emits description_hash on three derived Pydantic models (Descriptions / Description / ToolDescription) — all originate from the same Zod source-of-truth, this is expected (not a deviation)."
  - "Test scaffolding parents-walk: from tests/passes/pass_X/conftest.py, parents[5] is the repo root, then / 'packages' / 'engine-fixtures' / 'stripe' / '<file>.json'. No hardcoded absolute paths."
  - "stripe_pass2_output / stripe_pass3_output fixtures use skip-on-missing rather than fail-on-missing — Plan 03-12 hand-tunes those JSON files; until then they skip cleanly so downstream Plan 03-04 / 03-09 / 03-11 tests remain runnable."
  - "json.loads return value cast through `parsed: dict[str, Any] = ...` because mypy strict refuses to infer dict[str, Any] from `Any` — the cast is correct and stable, matches Phase 2 idiom."

patterns-established:
  - "Sampling-profile constant pattern: each per-pass constant gets a `# D-02: <one-liner>` comment + uses extra_body=_PROVIDER_ROUTING reference (NOT a fresh dict literal) — the singleton-identity invariant is the audit hook."
  - "Cache key extension pattern: new keyword-only params with default values that match the existing pre-extension hash (i.e., default of '1' here keeps backward-compat). Validated by paired tests: default-omitted vs explicit-default produces identical hash."
  - "Pass package empty placeholder: module docstring only + reference to the Plan that fills `def run()` — keeps mypy + ruff clean, lets downstream wave plans import the package without circular-init or undefined-symbol errors."
  - "Conftest fixture skip-on-missing for cross-plan fixture dependencies — cleanly handles wave order (Plan 03-12 hand-tunes pass-2-output.json; until then Pass 3/4 conftest skips that fixture instead of failing)."

requirements-completed: [GEN-04, GEN-05, GEN-06]

# Metrics
duration: 30min
completed: 2026-04-28
---

# Phase 3 Plan 01: Foundation Summary

**Phase 3 foundation lands: PASS_2/3/4 + INLINE_GATE sampling profiles, L2 cache `prompt_version` extension, IR additive `description_hash`, empty Pass 2/3/4 packages, and pytest fixture scaffolding — all reusing the verified single `_PROVIDER_ROUTING` literal pin (atlas-cloud / fp8 / no fallbacks).**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-28T00:23:00Z (after worktree base reset)
- **Completed:** 2026-04-28T00:53:59Z
- **Tasks:** 3 of 3 complete (no checkpoints)
- **Files modified:** 5 (pyproject.toml, uv.lock, sampling.py, cache/keys.py, types.ts)
- **Files regenerated:** 1 (packages/ir/python/types.py via codegen)
- **Files created:** 14 (3 pass placeholder __init__.py + 7 test scaffolding files + 2 unit-test files for sampling/cache + 4 placeholder integration tests; tests/passes/__init__.py + tests/integration/__init__.py)

## Accomplishments

- All Phase 3 sampling profiles (PASS_2, PASS_3, PASS_4, INLINE_GATE) added to `llm/sampling.py` reusing the SAME `_PROVIDER_ROUTING` dict literal — Pitfall #2 invariant verified by `grep -c '_PROVIDER_ROUTING:' returns 1` and `grep -c 'extra_body=_PROVIDER_ROUTING' returns 6`.
- `cache/keys.py::l2_key` extended with keyword-only `prompt_version: str = "1"` per D-35 — Phase 2 Pass 0/1 callers continue to work unchanged (no kwarg → uses default `"1"`); bumping `prompt_version` invalidates L2 cache cleanly.
- IR strictly-additive `description_hash: Optional[str] = None` lands on `Descriptions` (and via codegen on the sibling `Description` + `ToolDescription` Pydantic models — all derived from the same Zod source) per D-40 / D-14. `pnpm --filter @mcpgen/ir codegen:check` confirms the regenerated Python is fresh.
- Empty placeholder `passes/pass_{2,3,4}/__init__.py` with module docstrings only — downstream wave plans (03-02 / 03-04 / 03-05 / 03-09 / 03-10 / 03-11 / 03-12) can import the packages without errors before the real `run()` orchestrators land.
- 7 test scaffolding files (`tests/passes/__init__.py` + `pass_{2,3,4}/{__init__.py, conftest.py}`) shipping the canonical fixture set: `stripe_pass1_output`, `stripe_raw_ir`, `stripe_pass2_output` (skip-on-missing), `stripe_pass3_output` (skip-on-missing), `httpx_mock_qwen` (PydanticAI tool-call shaped OpenRouter mock).
- 4 placeholder integration tests that all `pytest.skip()` with the cited Plan owner — keeps CI green and test IDs stable across waves.
- 12 new unit tests + 4 placeholder integration tests SKIPPED — all green; mypy + ruff clean across 19 source files; existing Phase 2 cache + smoke tests still pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + extend sampling.py with PASS_2/3/4 + INLINE_GATE settings** — `20688c4` (feat)
2. **Task 2: Extend cache/keys.py l2_key with prompt_version param + IR additive description_hash** — `624ec73` (feat)
3. **Task 3: Empty-package skeletons + test scaffolding for Pass 2/3/4 + integration test placeholders** — `b4faa3b` (chore)

## Files Created/Modified

### Modified
- `apps/generation-engine/pyproject.toml` — promoted `tiktoken>=0.7,<1` + `jsonschema>=4.26,<5` to direct deps.
- `apps/generation-engine/uv.lock` — refreshed (tiktoken 0.12.0 + jsonschema 4.26.0 resolved).
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — appended `PASS_2_SETTINGS` (T=0.3, max_tokens=2048), `PASS_3_SETTINGS` (T=0.2, max_tokens=1024), `PASS_4_SETTINGS` (T=0.0, max_tokens=512), `INLINE_GATE_SETTINGS` (T=0.0, max_tokens=512). All reuse `extra_body=_PROVIDER_ROUTING`.
- `apps/generation-engine/src/mcpgen_engine/cache/keys.py` — `l2_key` gained keyword-only `prompt_version: str = "1"` per D-35; raw composition embeds `prompt_version` between `sampling_profile_label` and `input_hash`.
- `packages/ir/src/types.ts` — `ToolDescription` Zod object gained `description_hash: z.string().optional()` field.
- `packages/ir/python/types.py` — regenerated via `pnpm --filter @mcpgen/ir codegen` (datamodel-code-generator 0.26.4); `description_hash: Optional[str] = None` lands on `Descriptions`, `Description`, `ToolDescription` models.

### Created
- `apps/generation-engine/tests/test_sampling_profiles.py` — 6 unit tests (one per profile + singleton-identity guard + verbatim routing pin guard).
- `apps/generation-engine/tests/test_cache_keys_prompt_version.py` — 6 unit tests (default backward-compat, version-bump invalidation, pass_name discrimination, L1/L3 regression, IR additive smoke).
- `apps/generation-engine/src/mcpgen_engine/passes/pass_{2,3,4}/__init__.py` — empty placeholder packages.
- `apps/generation-engine/tests/passes/__init__.py` + `tests/passes/pass_{2,3,4}/{__init__.py, conftest.py}` — pytest scaffolding + fixtures.
- `apps/generation-engine/tests/integration/__init__.py` + 4 placeholder test files (`test_l1_warm_pass_2_3_4.py`, `test_description_diff.py`, `test_pass_4_cursor_invariant.py`, `test_pipeline_e2e.py`).

## Decisions Made

- **Reused `_PROVIDER_ROUTING` verbatim** — no fresh literal constructed for the new ModelSettings instances; every PASS_2/3/4_SETTINGS + INLINE_GATE_SETTINGS carries the same dict object via `extra_body=_PROVIDER_ROUTING`. Object-identity check in `test_provider_routing_is_singleton` regresses on the slightest re-definition.
- **`prompt_version` default `"1"` (string)** — keeps Phase 2 Pass 0/1 callers backward-compatible. Verified by `test_default_prompt_version_unchanged_from_pass_0` (omitted vs explicit-default produces identical hash).
- **IR codegen via `pnpm --filter @mcpgen/ir codegen`** — canonical script name from `packages/ir/package.json` scripts.codegen. The codegen emits `description_hash: Optional[str] = None` on THREE Pydantic models (`Descriptions` line 50, `Description` line 112, `ToolDescription` line 869) because all three originate from the same Zod `ToolDescription` source; this is expected behaviour (not a deviation), confirmed by `pnpm --filter @mcpgen/ir codegen:check` returning OK.
- **Skip-on-missing fixture pattern** — `stripe_pass2_output` / `stripe_pass3_output` call `pytest.skip` when the hand-tuned JSON file isn't yet committed (Plan 03-12 lands those). Keeps Pass 3/4 conftest usable in wave-1/wave-2 plans without forcing a Plan-03-12 dependency.
- **`pnpm install --frozen-lockfile` was needed** before the first `pnpm --filter @mcpgen/ir codegen` could run (worktree had no node_modules); not a deviation, just first-run setup.

## Deviations from Plan

None — plan executed exactly as written. The plan correctly anticipated:

- The need to re-use `_PROVIDER_ROUTING` (Pitfall #2 invariant explicitly called out).
- The IR codegen pipeline (`pnpm --filter @mcpgen/ir codegen`) being the source of truth for `packages/ir/python/types.py`.
- The 3-model emission pattern (`Descriptions` + `Description` + `ToolDescription`) — addressed in `<behavior>` block of Task 2.
- Skip-on-missing pattern for cross-plan fixture dependencies (`stripe_pass2_output` lands later).

One small ruff auto-fix (import order in `test_cache_keys_prompt_version.py`) was applied automatically by `uv run ruff check --fix`; not a Rule-1/2/3 deviation, just routine lint cleanup.

## Verification

All required Phase 3 verifications passed:

```
$ uv run pytest tests/test_sampling_profiles.py tests/test_cache_keys_prompt_version.py tests/integration/ -v
12 passed, 4 skipped in 0.15s

$ uv run pytest tests/test_cache_l1_l2.py -x
14 passed in 0.11s    (Phase 2 cache invariants intact)

$ uv run pytest tests/test_smoke_qwen.py -m 'not requires_openrouter' -v
1 passed, 1 deselected    (Phase 2 Pitfall #2 smoke test green)

$ uv run mypy src/mcpgen_engine/llm/sampling.py src/mcpgen_engine/cache/keys.py
                src/mcpgen_engine/passes/pass_{2,3,4}/ tests/test_sampling_profiles.py
                tests/test_cache_keys_prompt_version.py tests/passes/ tests/integration/
Success: no issues found in 19 source files

$ uv run ruff check <same-paths>
All checks passed!

$ pnpm --filter @mcpgen/ir typecheck && pnpm --filter @mcpgen/ir codegen:check
OK: packages/ir/python/types.py is up-to-date with src/types.ts.

$ grep -c '_PROVIDER_ROUTING:' src/mcpgen_engine/llm/sampling.py    # invariant: 1
1

$ grep -c 'extra_body=_PROVIDER_ROUTING' src/mcpgen_engine/llm/sampling.py    # invariant: 6
6

$ grep -F 'require_parameters' src/mcpgen_engine/llm/sampling.py    # invariant: 0 matches
(no output)

$ uv run python -c "from mcpgen_engine.passes import pass_2, pass_3, pass_4; print('OK')"
OK

$ uv run python -c "from mcpgen_ir.types import Descriptions; d = Descriptions(purpose='x'*20, when_to_use=['x'], limitations=[], parameter_overview='x'*50); assert d.description_hash is None; print('OK')"
OK
```

## Reference Notes for Downstream Plans

- **IR codegen command:** `pnpm --filter @mcpgen/ir codegen` (NOT `pnpm -F @mcpgen/ir build` — `build` is `tsc --noEmit`). Run from repo root.
- **Resolved versions:** `tiktoken==0.12.0`, `jsonschema==4.26.0` (visible in `uv.lock`).
- **Sampling profile fixture:** `from mcpgen_engine.llm.sampling import PASS_2_SETTINGS, PASS_3_SETTINGS, PASS_4_SETTINGS, INLINE_GATE_SETTINGS`. Pair with `make_agent` per Phase 2 D-04.
- **L2 cache call sites in Plans 03-04 / 03-09 / 03-11:** add `prompt_version='1'` kwarg (start at "1"; bump on prompts.py changes per pass). Existing Pass 0/1 call sites need no change.
- **Description-hash diff helper for Plan 03-04:** `Descriptions(description_hash=hashlib.sha256(rendered_markdown.encode()).hexdigest())`. Optional field, default None.
- **Conftest fixtures for Plans 03-02 / 03-03 / 03-04:** `stripe_pass1_output`, `stripe_raw_ir`, `httpx_mock_qwen` already wired in `tests/passes/pass_2/conftest.py`. For Pass 3 (Plans 03-05..03-09) add `stripe_pass2_output` (skip-on-missing). For Pass 4 (Plans 03-10/03-11) add all three (skip-on-missing).
- **Integration test scaffolds:** Plan 03-04 should fill `test_description_diff.py` body; Plan 03-11 should fill `test_pass_4_cursor_invariant.py`; Plan 03-12 should fill the remaining two. The placeholder bodies stay until then so test IDs remain stable.

## Threat Flags

(none — Foundation plan adds no new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries beyond the strictly-additive Optional[str] IR field)

## Self-Check: PASSED

- Created files exist: ✅ verified by `git log --stat` for `b4faa3b`.
- Modified files exist: ✅ verified by `git log --stat` for `20688c4` + `624ec73`.
- Commits exist: ✅ `git log --oneline -3` shows `b4faa3b`, `624ec73`, `20688c4`.
- Tests pass: ✅ 12 unit tests + 4 placeholder skips, mypy + ruff clean.
- IR codegen freshness: ✅ `pnpm --filter @mcpgen/ir codegen:check` returns OK.
- Pitfall #2 invariant: ✅ `_PROVIDER_ROUTING` literal count = 1, references = 6, no `require_parameters`.
