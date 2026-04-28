---
phase: 03-generation-engine-author-pass-2-3-4
plan: 03
subsystem: generation-engine
tags: [pass-2, validation, tiktoken, regex, forbidden-patterns, prompt-injection, length-budget, deterministic]

# Dependency graph
requires:
  - phase: 03-generation-engine-author-pass-2-3-4
    provides: "Plan 03-01 — pass_2/__init__.py placeholder + tiktoken>=0.7,<1 in pyproject.toml + tests/passes/pass_2/conftest.py fixtures"
provides:
  - "pass_2/length_budget.py — LENGTH_BUDGETS (D-07 verbatim) + tiktoken cl100k_base count_tokens with len(text)//4 fallback + is_within_budget retry-hint contract"
  - "pass_2/forbidden.py — 4 D-10 verbatim regex constants (marketing/filler/tautological/vague) + FORBIDDEN_REGEXES dispatch dict + find_forbidden_phrases helper (sorted/unique/lowercased)"
  - "pass_2/validation.py — Pass2Error class + render_description_markdown (Python mirror of Plan 03-12's render_description.ts) + 4 validators (length / forbidden / examples_from_spec / no-op components) + count_prompt_injection_warnings (D-15 heuristic counter)"
  - "Local copies of _PROMPT_INJECTION_REGEX and _DESCRIPTION_PREVIEW_CHARS=500 inside validation.py — Plan 03-04 reconciles with Plan 03-02's prompts.py copy"
affects:
  - "Plan 03-04 (Pass 2 orchestrator) — composes all three modules into the per-tool retry loop per D-12 invariant"
  - "Plan 03-05/06/07 (Pass 3 mirror) — same Pass2Error / Pass3Error pattern; same length-budget delegation idea"
  - "Plan 03-12 (CLI render_description.ts) — TS renderer MUST produce byte-identical markdown to render_description_markdown for length budgets to remain meaningful"

# Tech tracking
tech-stack:
  added: []  # tiktoken added in Plan 03-01; this plan only consumes it
  patterns:
    - "Module-level Final[re.Pattern[str]] regex constants compiled with re.IGNORECASE (mirrors pass_0/validation.py::_TOOL_NAME_REGEX)"
    - "Typed *Error subclass with violations: list[str] attribute and stable error code in args[0] first token (mirrors Pass0Error)"
    - "tiktoken cl100k_base with try/except ImportError fallback to len(text)//4 + max(1, ...) guard against ZeroDivisionError on empty input"
    - "Pure-Python markdown renderer as the single source of truth for the agent-visible description text (Python ↔ TS parity)"
    - "Heuristic candidate-pattern regex (ID prefixes / hex blobs / JWTs / Stripe keys / URLs / Bearer tokens) to flag LLM-hallucinated examples not present in source spec excerpts"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_2/length_budget.py"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_2/forbidden.py"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py"
    - "apps/generation-engine/tests/passes/pass_2/test_length_budget.py"
    - "apps/generation-engine/tests/passes/pass_2/test_forbidden.py"
    - "apps/generation-engine/tests/passes/pass_2/test_validation.py"
  modified: []

key-decisions:
  - "Defined _PROMPT_INJECTION_REGEX and _DESCRIPTION_PREVIEW_CHARS locally in validation.py rather than importing from pass_2/prompts.py — Plan 03-02 owns prompts.py in the same wave so the import would fail at execution time. Plan 03-04 (orchestrator) reconciles by importing both modules; the values MUST stay byte-identical across the two files. Documented as such in the validation.py module docstring."
  - "Extended the example-candidate regex to allow underscores in the ID body (`[a-z]{2,5}_[A-Za-z0-9_]{8,}`) so multi-segment IDs like `ch_test_123abcdef` match as a single token. The narrower spec-text-only check still catches hallucinations because the matched substring must appear verbatim in the spec excerpts."
  - "Sorted Stripe-style secret-key arm (`sk_(test|live)_*`) BEFORE the generic prefix arm in the candidate regex so the more specific match wins (longest-match precedence is not guaranteed in Python's re alternation)."
  - "Added a max(1, ...) guard inside the tiktoken branch as well as the fallback branch — the docstring promises strictly positive return values for all inputs, including empty strings."

patterns-established:
  - "Pass-2 deterministic validation surface: 3 modules (length_budget / forbidden / validation), all pure functions, no LLM imports, mypy + ruff strict-clean. Pattern repeats for Pass 3 (Plan 03-07) and Pass 4 (Plan 03-09)."
  - "Cross-pass validation re-uses pass_0/validation.py error-class shape (typed *Error subclass with stable code prefix + carrier attribute). Codifies the Shared Patterns 'Error handling' row from 03-PATTERNS.md."

requirements-completed: [GEN-04]

# Metrics
duration: 22min
completed: 2026-04-28
---

# Phase 03 Plan 03: Pass 2 deterministic validation surface

**Token-budget enforcement (tiktoken cl100k_base + char-count fallback per D-07), 4-category forbidden-phrase regex catalogue (per D-10 verbatim), and pure-Python Description renderer + 4 validators that the Pass 2 retry loop will compose per D-13 — no LLM imports anywhere.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-28T01:00:56Z
- **Completed:** 2026-04-28T01:23:34Z
- **Tasks:** 3 (all TDD: RED → GREEN per task)
- **Files created:** 6 (3 production + 3 tests)
- **Files modified:** 0
- **Tests added:** 50 (15 length_budget + 17 forbidden + 18 validation)

## Accomplishments

- **`length_budget.py`** ships LENGTH_BUDGETS dict matching D-07 verbatim (universal=200/300/400, action=100/150/200, workflow=150/200/300, specialized=80/120/150). `count_tokens` uses tiktoken cl100k_base when available, falls back to `len(text)//4` if the wheel fails to load (rare M-series Mac issue). `max(1, ...)` guard on both branches keeps return values strictly positive. `is_within_budget` returns `(ok, retry_hint)` tuples that the Pass 2 orchestrator can splice into next-attempt prompts per D-13.
- **`forbidden.py`** ships 4 D-10 verbatim regex constants (`_MARKETING_REGEX`, `_FILLER_REGEX`, `_TAUTOLOGICAL_REGEX`, `_VAGUE_REGEX`), all compiled with `re.IGNORECASE`. Public `FORBIDDEN_REGEXES` dispatch dict for retry-hint composition. `find_forbidden_phrases` returns deterministic sorted unique lowercased substrings (cache-key-stable for L2 invalidation).
- **`validation.py`** ships `Pass2Error` (mirrors `Pass0Error`), `render_description_markdown` (pure-Python mirror of Plan 03-12's `render_description.ts`), `validate_description_length` / `validate_no_forbidden_phrases` (delegate to the other two modules), `validate_examples_from_spec` (heuristic regex against ID prefixes / hex blobs / JWTs / `sk_test_*`+`sk_live_*` / URLs / Bearer tokens — flags any candidate not in the source spec excerpts), and `count_prompt_injection_warnings` (D-15 heuristic counter).
- All 50 new tests pass; mypy strict + ruff strict are clean across the 6 files; the existing pass_0/pass_1 test suites still green (full repo sweep exit code 0).

## Task Commits

Each task was TDD (test → implementation) and committed atomically:

1. **Task 1 RED — failing length_budget tests** — `27a5bb7` (test)
2. **Task 1 GREEN — length_budget implementation** — `16b28b9` (feat)
3. **Task 2 RED — failing forbidden tests** — `8760838` (test)
4. **Task 2 GREEN — forbidden implementation** — `d1fc823` (feat)
5. **Task 3 RED — failing validation tests** — `c627be5` (test)
6. **Task 3 GREEN — validation implementation** — `ce2f7d5` (feat)

Plan-metadata commit follows after this SUMMARY lands.

## Files Created/Modified

**Created**:

- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/length_budget.py` — D-07 budgets dict, tiktoken counter, char-count fallback, `is_within_budget`.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/forbidden.py` — 4 D-10 regex constants, `FORBIDDEN_REGEXES` dispatch dict, `find_forbidden_phrases`.
- `apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py` — `Pass2Error`, `render_description_markdown`, 3 validators + `count_prompt_injection_warnings`.
- `apps/generation-engine/tests/passes/pass_2/test_length_budget.py` — 15 unit tests (4 budget tuples + 5 token-count + 5 budget enforcement + 1 fallback monotonic).
- `apps/generation-engine/tests/passes/pass_2/test_forbidden.py` — 17 unit tests (1 catalogue shape + 5 marketing + 3 filler + 2 tautological + 3 vague + 3 helper-shape).
- `apps/generation-engine/tests/passes/pass_2/test_validation.py` — 18 unit tests (3 Pass2Error + 3 markdown renderer + 2 length + 2 forbidden + 3 examples-from-spec + 4 injection counter + 1 purity).

**Modified**: none. The Wave-0 placeholder `pass_2/__init__.py` is intentionally untouched.

## Decisions Made

- **Local copies of D-15 constants in validation.py.** Plan 03-02 owns `pass_2/prompts.py` in parallel and that file does NOT exist in this worktree. Importing from it would crash test collection. The cleanest unblocker (Rule 3 — auto-fix blocking issue) is to define `_PROMPT_INJECTION_REGEX` and `_DESCRIPTION_PREVIEW_CHARS=500` locally with documented intent. Plan 03-04 (orchestrator) reconciles by importing both modules. The validation.py docstring spells out the rule: any change to D-15 must be applied here AND in `prompts.py`. This is the same trade-off the plan's `<file-conflict protection>` callout anticipated.
- **Candidate-regex extended to allow underscores in the ID body.** The first draft used `[a-z]{2,5}_[A-Za-z0-9]{8,}`, which only matches single-segment IDs like `ch_3O5jJ2xYz...`. Real Stripe IDs and the test fixtures (`ch_test_123abcdef`, `ch_test_999_FAKE_HALLUC`) include underscores after the prefix. Switching to `[a-z]{2,5}_[A-Za-z0-9_]{8,}` matches multi-segment IDs as one token while keeping false-positive risk low (the spec-content cross-check still applies).
- **`sk_(test|live)_*` arm placed BEFORE the generic prefix arm** so the more specific Stripe-key pattern wins. Python's `re` alternation is leftmost (not longest) match, so order matters — without re-ordering, `sk_test_abc...` would match the generic `sk_*` arm and lose the secret-key tag downstream.
- **`max(1, ...)` guard duplicated inside the tiktoken branch.** The first draft only guarded the fallback branch; the test contract (and the docstring) promise strictly-positive returns for all inputs, so the guard is now identical on both code paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Defined `_PROMPT_INJECTION_REGEX` and `_DESCRIPTION_PREVIEW_CHARS` locally in validation.py**

- **Found during:** Task 3 (validation.py implementation)
- **Issue:** The plan's `<interfaces>` section says `validation.py` imports both constants from `mcpgen_engine.passes.pass_2.prompts`, but `prompts.py` is owned by parallel Plan 03-02 in this same Wave. The file does not exist in this worktree — the import would crash test collection.
- **Fix:** Defined identical local copies (`_PROMPT_INJECTION_REGEX = (?i)(ignore (previous|all) instructions|disregard|new instructions|system:)`, `_DESCRIPTION_PREVIEW_CHARS = 500`) inside `validation.py`. The module docstring documents the dual-home invariant and instructs Plan 03-04 to reconcile when both modules land in the same worktree.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py`.
- **Verification:** All 18 validation tests pass; mypy + ruff clean.
- **Committed in:** `ce2f7d5` (Task 3 GREEN commit).

**2. [Rule 1 — Bug] Extended example-candidate regex to allow underscores after the ID prefix**

- **Found during:** Task 3 (validation tests)
- **Issue:** The first regex draft (`[a-z]{2,5}_[A-Za-z0-9]{8,}`) failed to match multi-segment IDs like `ch_test_999_FAKE_HALLUC` (the underscore breaks the body group). The hallucinated-bearer test legitimately fails this draft.
- **Fix:** Switched to `[a-z]{2,5}_[A-Za-z0-9_]{8,}`. Multi-segment IDs now match as one token while the spec-content cross-check still catches hallucinations.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py`.
- **Verification:** `test_validate_examples_from_spec_hallucinated_returns_candidate` now passes; the in-spec test still passes.
- **Committed in:** `ce2f7d5` (Task 3 GREEN commit).

**3. [Rule 1 — Bug] Re-ordered candidate regex alternatives to prefer the Stripe secret-key pattern**

- **Found during:** Task 3 (designing the helper, before tests ran)
- **Issue:** Python's `re` alternation is leftmost-match, not longest-match. With `[a-z]{2,5}_[A-Za-z0-9_]{8,}` listed first, an `sk_test_...` token matched the generic prefix arm and lost the secret-key tag downstream.
- **Fix:** Moved the `sk_(?:test|live)_*` arm to the front of the alternation so the more specific pattern wins.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py`.
- **Verification:** `test_validate_examples_from_spec_catches_fake_bearer` matches `sk_live_*` correctly.
- **Committed in:** `ce2f7d5` (Task 3 GREEN commit).

**4. [Rule 1 — Bug] Applied `max(1, ...)` guard in both tiktoken and fallback branches of `count_tokens`**

- **Found during:** Task 1 (length_budget tests)
- **Issue:** First draft only applied the guard in the fallback branch. The tiktoken branch returned `0` for an empty string, which broke `test_count_tokens_empty_string_returns_at_least_1` and would later cause a ZeroDivisionError if a caller divided by the count.
- **Fix:** Wrapped the tiktoken `len(_ENCODER.encode(text))` call in `max(1, ...)` to match the fallback branch and the docstring promise.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_2/length_budget.py`.
- **Verification:** `test_count_tokens_empty_string_returns_at_least_1` passes regardless of which branch is active.
- **Committed in:** `16b28b9` (Task 1 GREEN commit).

---

**Total deviations:** 4 auto-fixed (1 blocking, 3 bugs).
**Impact on plan:** Zero scope creep. The local-copy decision is a pre-arranged Wave-1 contention mitigation; the three regex / guard fixes are pre-LLM-call defects in the planned heuristic. All tests pass; downstream Plan 03-04 can compose the validators verbatim per D-12.

## Issues Encountered

- **Background test runner contention.** A first attempt at running the full repo test sweep in the background did not surface output before the SUMMARY was due. A second invocation completed with exit code 0 (all tests pass). No code changes were needed; this was a tooling observation only.
- **tiktoken behaviour on this executor.** `cl100k_base` loaded successfully — the fallback path was only exercised via monkeypatch in tests. Real-world performance: 1200-character "word " test string yielded ~250–280 tokens via tiktoken vs 300 via the char-count fallback, both within the 200–400 universal budget. The ±20% retry tolerance per D-07 covers the divergence.

## User Setup Required

None — no external service configuration required. tiktoken was installed in Plan 03-01 and its wheel loads on this Mac.

## Next Phase Readiness

- Plan 03-04 (Pass 2 authoring orchestrator) can compose `length_budget.is_within_budget` + `forbidden.find_forbidden_phrases` + `validation.validate_examples_from_spec` + `validation.count_prompt_injection_warnings` into the per-tool retry loop per D-12 verbatim. The `Pass2Error` shape matches `Pass0Error` so the cross-pass `_stable_error_code` extension noted in 03-PATTERNS.md §"Error handling extension" Just Works.
- Plan 03-12 (CLI `render_description.ts`) MUST produce byte-identical markdown to `render_description_markdown` so length budgets continue to operate on the same string the agent sees. Component ordering: Purpose → When to use → When NOT to use → How to use → Limitations → Parameters; bullets prefixed with `- `; sections separated by blank lines.
- The local `_PROMPT_INJECTION_REGEX` / `_DESCRIPTION_PREVIEW_CHARS` copies in `validation.py` MUST stay in lockstep with `prompts.py` (Plan 03-02) until Plan 03-04 reconciles them. Recommendation for the orchestrator: import both, assert equality at module-load time, document the canonical home in the docstring.

## Self-Check: PASSED

Files created (6/6):

- FOUND: apps/generation-engine/src/mcpgen_engine/passes/pass_2/length_budget.py
- FOUND: apps/generation-engine/src/mcpgen_engine/passes/pass_2/forbidden.py
- FOUND: apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py
- FOUND: apps/generation-engine/tests/passes/pass_2/test_length_budget.py
- FOUND: apps/generation-engine/tests/passes/pass_2/test_forbidden.py
- FOUND: apps/generation-engine/tests/passes/pass_2/test_validation.py

Commits exist (6/6):

- FOUND: 27a5bb7 (test 03-03 length_budget RED)
- FOUND: 16b28b9 (feat 03-03 length_budget GREEN)
- FOUND: 8760838 (test 03-03 forbidden RED)
- FOUND: d1fc823 (feat 03-03 forbidden GREEN)
- FOUND: c627be5 (test 03-03 validation RED)
- FOUND: ce2f7d5 (feat 03-03 validation GREEN)

D-07 verbatim (4/4):

- FOUND: `(200, 300, 400)` (universal)
- FOUND: `(100, 150, 200)` (action)
- FOUND: `(150, 200, 300)` (workflow)
- FOUND: `(80, 120, 150)` (specialized)

D-10 verbatim (3/4 inline-grep, 4/4 in source):

- FOUND: `powerful|elegant|robust|seamless|cutting-edge|state-of-the-art|comprehensive|enterprise-grade` (marketing)
- FOUND: `you can use this to|this tool allows you to|this tool enables|simply|just|easily` (filler)
- FOUND: `this (search|list|fetch|create|update|delete|upsert) (tool )?(searches|lists|fetches|creates|updates|deletes|upserts)` (tautological)
- FOUND: `various|different|appropriate|relevant|several|multiple` (vague)

Test counts: 15 length_budget + 17 forbidden + 18 validation = 50 (≥45 required).
Type checks: `uv run mypy src/mcpgen_engine/passes/pass_2/ tests/passes/pass_2/` → 0 issues.
Style checks: `uv run ruff check src/mcpgen_engine/passes/pass_2/ tests/passes/pass_2/` → All checks passed.
LLM imports: `grep -E "from mcpgen_engine\.llm" src/mcpgen_engine/passes/pass_2/*.py` → 0 hits.

---

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd` plan-level), but every task was authored TDD (`tdd="true"` per task). Each task has a `test(...)` commit immediately followed by a `feat(...)` commit. Gate sequence verified.

---

*Phase: 03-generation-engine-author-pass-2-3-4*
*Completed: 2026-04-28*
