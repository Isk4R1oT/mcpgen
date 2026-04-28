---
phase: 03-generation-engine-author-pass-2-3-4
plan: 08
subsystem: engine
tags: [pass-3, deterministic, naming, smart-id, standards, no-llm]
requires:
  - 03-01  # Pass 3 wave-0 scaffolding (pass_3/__init__.py + conftest)
  - 03-05  # ParameterSpec from extract.py
provides:
  - "passes/pass_3/naming.py — D-19 collision-resolving param-name normalizer"
  - "passes/pass_3/smart_id.py — D-20 pattern + description + slug helper"
  - "passes/pass_3/standards.py — D-21 / Pitfall #32 frozen standard descriptions for 6 universal tools"
affects:
  - "Plan 03-09 (cross-parameter validation + final Pass3Output assembly): consumes all three modules"
tech-stack:
  added: []
  patterns:
    - "Final[*] module-level constants (mirrors pass_0/validation.py + pass_1/routing.py)"
    - "Pure-function modules (no I/O, no LLM, no global mutation)"
    - "Pydantic model_copy(update=...) for immutable transform of ParameterSpec"
key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/naming.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/smart_id.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_3/standards.py
    - apps/generation-engine/tests/passes/pass_3/test_naming.py
    - apps/generation-engine/tests/passes/pass_3/test_smart_id.py
    - apps/generation-engine/tests/passes/pass_3/test_standards.py
  modified: []
decisions:
  - "Re-derived slugify_spec_title in smart_id.py rather than reusing Pass 1 routing.derive_spec_slug. The two helpers have intentionally different empty-input contracts: Pass 1 returns 'unnamed-spec' for fixture-test purposes; Pass 3 returns 'spec' per the plan acceptance test. Re-derivation keeps Pass 3 self-contained and avoids leaking a Phase-2 fallback string into the Phase-3 contract."
  - "Re-derived build_smart_id_pattern_for_param rather than reusing Pass 1 routing.build_smart_id_regex. Pass 1's regex tolerates an arbitrary tenant prefix '[a-z0-9-]+-' for the round-trip fixture test; D-20 mandates that the per-tenant prefix is NOT included at the param-schema layer (Phase 6 dispatch worker prepends at deploy time). Re-derivation enforces the invariant via a literal grep in plan acceptance criteria."
  - "Re-derived build_smart_id_pattern's identifier charset to '[a-zA-Z0-9_-]+' per D-20, narrower than Pass 1's '[A-Za-z0-9_./-]+' which intentionally tolerates upstream slash-bearing identifiers (e.g., GitHub composite IDs). Pass 3 ships the conservative class because the param-level pattern is what the agent sees as input validation — Phase 4 Stage E template can widen at codegen time per upstream-API observation."
  - "Documented the deviation from plan's 'count == 22' annotation: the dict per the plan's <behavior> block contains 23 entries (1+1+4+8+4+5). Test asserts 23. The annotation '(2 + 4 + 8 + 4 + 5 — derived from D-21)' equals 23, so the '== 22' wording is a typo in the plan."
metrics:
  duration: "20 min"
  tasks-completed: 3
  tests-added: 77
  files-changed: 6
  lines-added: 1024
  completed: 2026-04-28T02:17:56Z
---

# Phase 03 Plan 08: Pass 3 Deterministic Helpers Summary

Three pure-function modules (D-19 naming, D-20 smart-ID, D-21 standards) — no LLM, no I/O — locking in Pitfall #32 mitigation for OpenAI Deep Research compliance and Phase 2 D-31 smart-ID format invariant. 77 unit tests green; plan 03-09 can now compose all three modules to assemble the final Pass3Output input_schemas.

## What Shipped

### `apps/generation-engine/src/mcpgen_engine/passes/pass_3/naming.py` (120 LOC)

D-19 verbatim normalization rules + collision-resolving batch normalizer.

- `normalize_param_name(raw, entity_hint, is_list_filter_context=False) -> str` — applies D-19 in order: camelCase / PascalCase → snake_case via `_CAMEL_CASE_REGEX = r"([a-z0-9])([A-Z])"`; strip trailing `_param` / `_arg`; bare `data` → `payload`; bare `time` → `created_at` (only in list-filter context); bare `id` / `status` qualified with `entity_hint` when present.
- `normalize_all_param_names(params, is_list_filter_context=False) -> list[ParameterSpec]` — pure / immutable batch transform; D-19 collision rule (revert second to raw → digit suffix `_2` / `_3` / ... if raw also collides); preserves iteration order; never mutates the input list nor the input items (uses `param.model_copy(update={"name": candidate})`).

26 tests cover: every D-19 rule individually, list-filter context flag, three-way collisions with increasing digit suffix, immutability assertion via `deepcopy` snapshot comparison, order preservation, return-list identity, ParameterSpec object identity (new instances), pure-function determinism.

### `apps/generation-engine/src/mcpgen_engine/passes/pass_3/smart_id.py` (116 LOC)

D-20 smart-ID pattern + description + slug helper.

- `slugify_spec_title(title) -> str` — deterministic 32-char-max slug derivation (lowercase + non-alphanumeric→dash + collapse repeats + strip leading/trailing dashes); defensive `"spec"` fallback for empty / all-special input; `_MAX_SLUG_LENGTH: Final[int] = 32`.
- `build_smart_id_pattern_for_param(smart_id, spec_slug) -> str` — JSON Schema regex pattern per D-20: `^{re.escape(spec_slug)}:({types_alt}):({collections_alt}):[a-zA-Z0-9_-]+$`. Empty types / collections degrade to permissive character classes (`[a-z_]+` / `[A-Za-z_]+`) so Pass 3 still emits a syntactically valid pattern. The deploy-time per-tenant prefix is intentionally NOT included (Phase 6 prepends).
- `build_smart_id_description(smart_id, spec_slug) -> str` — canonical D-20 description: format string + types/collections lists + plain-id fallback hint (`"If you only have a bare upstream ID, prefix with the smart-ID format above; the server will route correctly."`).

26 tests cover: all four slug invariants (simple / complex / special chars / 32-char cap / empty / all-special / collapse / strip / pure), pattern construction (single / multi types / multi collections / re.escape on dashes / regex compile / canonical match / wrong slug rejection / wrong type rejection / empty identifier rejection / no `tenant_short_id` token), description content (format string / types list / collections list / fallback hint / empty types fallback / pure function).

### `apps/generation-engine/src/mcpgen_engine/passes/pass_3/standards.py` (170 LOC)

D-21 + Pass 3 design Appendix A frozen standard descriptions for the 6 universal tools.

- `STANDARD_PARAMETER_DESCRIPTIONS: Final[dict[tuple[str, str], str]]` — **23 entries** (search 1 + fetch 1 + list_collections 4 + list_objects 8 + upsert 4 + delete 5).
- `get_standard_description(universal_tool_name, param_name) -> str | None` — lookup helper; returns None for non-universal tools or unknown params (caller falls back to LLM-enriched description from `enrich.py`).

**Pitfall #32 (OpenAI Deep Research compliance) — FROZEN text:**
- `("search", "query")`: starts with `"Search query string."` (Phase 5 F1 regex-checks this leading literal).
- `("fetch", "id")`: starts with `"Smart identifier for the object to fetch"` (Phase 5 F1 regex-checks).
- Both reference `{spec_slug}:{type}:{collection}:{identifier}` format string verbatim.
- `search` and `fetch` have ONLY their canonical single param — extending them would violate Pitfall #32 invariant; cross-parameter validation in Plan 03-09 enforces.

25 tests cover: presence / FROZEN leading text / smart-ID format inclusion (search.query, fetch.id), all 4 list_collections params, all 8 list_objects params (including frozen 25/desc/cursor-vs-offset semantics), all 4 upsert params + smart-routing semantics, all 5 delete params + safety/false defaults + enum listing, lookup helper edge cases (unknown tool / action tool / unknown param for known tool returns None), total count == 23, all values are strings > 50 chars, Pitfall #32 invariant (search ONLY query, fetch ONLY id), pure-function determinism, no LLM imports.

## Commits

| # | Type | Hash | Subject |
|---|------|------|---------|
| 1 | test | 602cb09 | test(03-08): add failing tests for Pass 3 naming.py D-19 normalization |
| 2 | feat | 400073d | feat(03-08): implement Pass 3 naming.py D-19 normalization |
| 3 | test | 2682dfd | test(03-08): add failing tests for Pass 3 smart_id.py D-20 pattern + description |
| 4 | feat | 6d65526 | feat(03-08): implement Pass 3 smart_id.py D-20 pattern + description |
| 5 | test | acac651 | test(03-08): add failing tests for Pass 3 standards.py D-21 + Pitfall #32 |
| 6 | feat | c0cdf09 | feat(03-08): implement Pass 3 standards.py D-21 + Pitfall #32 |

TDD RED→GREEN cycle followed for each task: failing test commit, then implementation commit. All commits use `--no-verify` (parallel-executor convention) and conventional-commits format with `(03-08)` scope.

## Verification

### Focused (≥49 tests required by plan; 77 actual)

```
$ uv run pytest tests/passes/pass_3/test_naming.py tests/passes/pass_3/test_smart_id.py tests/passes/pass_3/test_standards.py -x -q
......................................................................... 100%
77 passed
```

26 + 26 + 25 = 77 tests across the three new test files (well above plan's ≥49 floor).

### Regression (full pass_3)

```
$ uv run pytest tests/passes/pass_3/ -x -q
.......................................................................... 100%
106 passed
```

29 prior `test_extract.py` tests still green — no regression.

### Regression (full passes/ tree)

```
$ uv run pytest tests/passes/ -x -q
246 passed
```

### Lint + typecheck

```
$ uv run mypy <all 6 files>          → Success: no issues found in 6 source files
$ uv run ruff check <all 6 files>    → All checks passed!
```

### Acceptance-criteria grep checks

All `grep -F` / `grep -E` checks listed in plan `<acceptance_criteria>` for each task pass; no LLM imports anywhere; `tenant_short_id` token absent from `smart_id.py`; `_MAX_SLUG_LENGTH: Final[int] = 32` literal present.

## Deviations from Plan

### Documentation Deviations (no code impact)

**1. [Documentation] Plan typo: `count == 22` vs actual `len == 23`**

- **Found during:** Task 3 (test authoring)
- **Issue:** Plan `<behavior>` block defines exactly 23 entries in `STANDARD_PARAMETER_DESCRIPTIONS` (search 1 + fetch 1 + list_collections 4 + list_objects 8 + upsert 4 + delete 5 = 23), but the test description says `len(STANDARD_PARAMETER_DESCRIPTIONS) == 22`. The annotation `(2 + 4 + 8 + 4 + 5 — derived from D-21)` correctly sums to 23.
- **Resolution:** Test asserts `== 23` to match the actual data per the plan's own `<behavior>` block. Documented in commit message (`c0cdf09`). No D-21 contract change — all 23 (universal_tool, param) pairs from Pass 3 design Appendix A are present.

### Helper Reuse Decisions (Rule 4 alternatives — chose re-derivation)

**2. [Decision] Re-derived `slugify_spec_title` instead of reusing Pass 1 `routing.derive_spec_slug`**

- **Context:** Pass 1 already exposes `derive_spec_slug` (returns `"unnamed-spec"` for empty input) and `build_smart_id_format` / `build_smart_id_regex` (the regex tolerates a tenant prefix `[a-z0-9-]+-`).
- **Decision:** Re-derived all three helpers in Pass 3 with deliberately different contracts:
  - `slugify_spec_title("")` returns `"spec"` (vs Pass 1's `"unnamed-spec"`) — matches the plan acceptance test.
  - `build_smart_id_pattern_for_param` omits the tenant-prefix tolerance — D-20 mandates the per-tenant prefix is NOT included at the param-schema layer; the plan acceptance criterion enforces this via a literal grep.
  - Identifier charset narrowed to `[a-zA-Z0-9_-]+` (vs Pass 1's `[A-Za-z0-9_./-]+`) — Pass 3 ships the conservative class; Phase 4 Stage E template can widen at codegen time per upstream observation.
- **Why:** Same-name helpers with subtly different semantics across phases is a footgun. Re-derivation keeps each phase's contract self-contained and the plan acceptance grep checks unambiguous. Cost: ~30 LOC duplication.

### Auto-fixed Issues

**3. [Rule 1 - Bug] Removed unused `# noqa: FBT001, FBT002` directives**

- **Found during:** Task 1 (ruff check)
- **Issue:** Plan-suggested `# noqa: FBT001, FBT002` on default-False boolean params would have been flagged by ruff as `RUF100 unused-noqa-directive` because the `flake8-bugbear` boolean-trap rules (FBT) are NOT in the project's ruff `select` list (only E/F/I/B/UP/RUF/ANN/SIM/PT/S/ASYNC/TRY/RET/ARG/RSE).
- **Fix:** Removed the noqa directives. The default-False boolean parameter is consistent with project style (e.g., `extract.py::_is_smart_id_name` uses no boolean params; the project doesn't enforce FBT).
- **Files modified:** `naming.py` (2 occurrences during refinement; final file ships without noqa)
- **Commit:** Folded into `400073d` (Task 1 GREEN commit).

**4. [Rule 1 - Bug] Removed `tenant_short_id` literal from smart_id.py docstrings**

- **Found during:** Task 2 acceptance-criteria grep check
- **Issue:** Plan acceptance criterion says `grep -F "tenant_short_id" smart_id.py` MUST return no matches. My initial docstring referenced the literal `{tenant_short_id}-` token to explain the invariant, which would have failed the grep.
- **Fix:** Reworded both docstring occurrences to use the descriptive phrase `"deploy-time per-tenant prefix"` instead of the literal `tenant_short_id` token. Same semantic content, no acceptance-criterion violation.
- **Files modified:** `smart_id.py` (module docstring + `build_smart_id_pattern_for_param` docstring)
- **Commit:** Folded into `6d65526` (Task 2 GREEN commit).

## Auth Gates

None — plan does not exercise any authenticated path.

## Known Stubs

None — all three modules are production-ready deterministic helpers. No LLM placeholders, no UI wiring stubs, no mock data. Plan 03-09 will compose them to produce the final `Pass3Output.input_schemas`.

## Threat Flags

None — no new security-relevant surface introduced. All three modules are pure-function helpers with no network access, no I/O, no untrusted-content handling. The `T-03-extract-spec-content-leak` threat from extract.py is not re-exposed here (we never log spec content; param names are tool/structural metadata per Phase 2 D-52).

## Confirmations

- **`SmartId` field names confirmed** (`packages/ir/python/types.py` lines 60-66): `format: str`, `types: List[str]`, `collections: List[str]`. No `smart_id_schema` field — the IR uses `smart_id` directly on `Routing1` per the plan's interface block.
- **Pass 1 routing helpers verified** (`apps/generation-engine/src/mcpgen_engine/passes/pass_1/routing.py`): `derive_spec_slug`, `build_smart_id_format`, `build_smart_id_regex` all exist; intentionally NOT reused per Decisions 2 above.
- **`_UNIVERSAL_MIN_SIG` from Plan 03-05 verified** (`extract.py` lines 119-283): all 23 (universal_tool, param) pairs match the standards.py dict keys. No drift.

## Self-Check: PASSED

**Created files (verified `[ -f ... ]`):**
- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/naming.py` — FOUND (120 LOC)
- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/smart_id.py` — FOUND (116 LOC)
- `apps/generation-engine/src/mcpgen_engine/passes/pass_3/standards.py` — FOUND (170 LOC)
- `apps/generation-engine/tests/passes/pass_3/test_naming.py` — FOUND (202 LOC)
- `apps/generation-engine/tests/passes/pass_3/test_smart_id.py` — FOUND (212 LOC)
- `apps/generation-engine/tests/passes/pass_3/test_standards.py` — FOUND (204 LOC)

**Commits (verified `git log --oneline | grep`):**
- 602cb09 — FOUND
- 400073d — FOUND
- 2682dfd — FOUND
- 6d65526 — FOUND
- acac651 — FOUND
- c0cdf09 — FOUND

**Tests:** 77 focused (26 + 26 + 25) all green; 106 pass_3 tree all green; 246 full passes tree all green; mypy + ruff clean across all 6 files.
