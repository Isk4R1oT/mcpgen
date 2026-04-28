---
phase: 03-generation-engine-author-pass-2-3-4
plan: 10
subsystem: engine
tags: [pass-4, deterministic, annotations, verb-patterns, titles, no-llm]
requires:
  - 03-01  # Pass 4 wave-0 scaffolding (pass_4/__init__.py + conftest)
provides:
  - "passes/pass_4/rules.py — D-28 tool-type rules table + D-30 workflow conservative aggregation + RuleResult intermediate"
  - "passes/pass_4/verbs.py — D-29 / Appendix B action verb pattern table + match_verb_pattern + VerbMatchResult"
  - "passes/pass_4/titles.py — D-31 deterministic title generation (universal/action/workflow/specialized + verb reorder + 60-char cap)"
affects:
  - "Plan 03-11 (Pass 4 selective LLM judgment + consistency validation + final Pass4Output assembly): consumes all three modules and lifts RuleResult/VerbMatchResult into the IR Annotations construction site (where the openWorldHint=Literal[True] invariant is finally applied per D-27)"
tech-stack:
  added: []
  patterns:
    - "Final[*] module-level constants (mirrors pass_0/filter.py + pass_1/routing.py + pass_3/naming.py)"
    - "Pure-function modules (no I/O, no LLM, no global state)"
    - "Pre-compiled regex pattern list at module load (verbs.py performance)"
    - "Pydantic BaseModel + ConfigDict(extra='forbid') for deterministic intermediate types (RuleResult, VerbMatchResult)"
key-files:
  created:
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/rules.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/verbs.py
    - apps/generation-engine/src/mcpgen_engine/passes/pass_4/titles.py
    - apps/generation-engine/tests/passes/pass_4/test_rules.py
    - apps/generation-engine/tests/passes/pass_4/test_verbs.py
    - apps/generation-engine/tests/passes/pass_4/test_titles.py
  modified: []
decisions:
  - "Plan-truth deviation in rules.py: the truth ledger keys the rule table by '(tool_type_value, universal_tool_value_or_None)' assuming Tool1 carries a `universal_tool: Optional[UniversalTool]` field. Inspection of packages/ir/python/types.py at execution time shows Tool1 has ONLY {name, type, source_endpoints} — no `universal_tool` field. Pass 1 output convention (verified against packages/engine-fixtures/linear/pass-1-output.json) is that for `type=universal` tools, `tool.name` IS the canonical UniversalTool variant ('search', 'fetch', 'list_collections', 'list_objects', 'upsert', 'delete'). Implementation therefore keys on `(tool.type.value, tool.name)` for universal tools, `(tool.type.value, None)` for specialized, and falls through to is_decisive=False for action/workflow. This preserves the planner's intent while honoring the actual frozen IR shape."
  - "Workflow aggregation falls back to conservative `(False, True, False)` when an endpoint owner is an action tool. Reason: importing verbs.py from rules.py would create a circular dependency once Plan 03-11 wires the orchestrator (which itself imports both). Plan 03-11 can re-aggregate post action-verb resolution when needed; for the Phase-1 deterministic surface, conservative-by-default is correct per D-29."
  - "Workflow aggregation also falls back to conservative for nested workflows (workflow whose source_endpoint is owned by another workflow) to avoid unbounded recursion. Reasonable; nested workflows are rare and deserve manual review at Plan 03-11 / Stage F."
  - "verbs.py raises ValueError on unrecognized confidence values in the table rather than silently falling through to confidence='none'. CLAUDE.md global rule: 'Always raise errors explicitly, never silently ignore them.' A typo in the (frozen) table should fail loud."
  - "titles.py uses single Unicode ellipsis (…, U+2026) for truncation — one char vs. three dots saves 2 chars of the 60-char budget. Already documented in the title-cap testing."
  - "RuleResult and VerbMatchResult both intentionally omit any openWorldHint field (D-27 invariant). The deterministic phase produces ONLY the 3 mutable booleans + a confidence/decision metadata field; openWorldHint=Literal[True] is enforced at IR Annotations construction in Plan 03-11."
metrics:
  duration: "10 min"
  tasks-completed: 3
  tests-added: 72
  files-changed: 6
  lines-added: 1095
  completed: 2026-04-28T02:34:06Z
---

# Phase 03 Plan 10: Pass 4 Deterministic Helpers Summary

Three pure-function modules (D-28 tool-type rules + D-30 workflow conservative aggregation, D-29 verb pattern matching, D-31 title generation) — no LLM, no I/O — locking in the Pitfall #31 invariant (read tools force `readOnly=True`) and the D-27 invariant (`openWorldHint` never set in deterministic phase). 72 unit tests green; Plan 03-11 can now compose all three modules in the Pass 4 orchestrator.

## What Shipped

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/rules.py` (192 LOC)

D-28 verbatim tool-type table + D-30 workflow conservative aggregation.

- `class RuleResult(BaseModel)` — intermediate carrying `is_decisive: bool` + `read_only / destructive / idempotent: bool | None`. **Never** carries `openWorldHint` (D-27 invariant).
- `_TOOL_TYPE_RULES: Final[dict[tuple[str, str | None], tuple[bool, bool, bool]]]` — 7 entries:
  - 4 universal read tools `(universal, search/fetch/list_collections/list_objects)` → `(True, False, True)` (Pitfall #31 D-32 enforced).
  - 1 universal write `(universal, upsert)` → `(False, False, False)` (creates can dup → not idempotent).
  - 1 universal write `(universal, delete)` → `(False, True, True)` (destructive but re-delete = no-op).
  - 1 generic `(specialized, None)` → `(True, False, True)`.
  - Action/workflow deliberately absent — caller routes elsewhere.
- `apply_tool_type_rules(tool: Tool1) -> RuleResult` — pure lookup; returns `is_decisive=False` for action/workflow/unknown-universal-name.
- `aggregate_workflow_annotations(workflow: Tool1, all_tools: list[Tool1]) -> RuleResult` — D-30 conservative AND/OR/AND across sub-tool annotations; sub-tool resolved by `endpoint → owning-tool` map (excludes the workflow itself); orphan endpoints, nested workflows, and action sub-owners all fall back to D-29 conservative `(False, True, False)`.

20 tests cover: every rule-table entry shape; Pitfall #31 invariant (loop over all read tools asserting `read_only=True`); D-27 invariant (`RuleResult.model_dump()` keys never include `openWorldHint`); workflow aggregation with all-read subs / one-destructive sub / orphan endpoint / self-skip / empty-source / action sub / nested-workflow sub / non-workflow input.

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/verbs.py` (147 LOC)

D-29 / Pass 4 design Appendix B verbatim verb pattern table + matcher.

- `class VerbMatchResult(BaseModel)` — `confidence: Literal['high', 'medium', 'none']` + `read_only/destructive/idempotent/matched_pattern: ...| None`. **Never** carries `openWorldHint` (D-27 invariant).
- `ACTION_VERB_PATTERNS: Final[dict[str, dict[str, object]]]` — 9 dict entries (6 high-confidence groups × 16 covered verbs + 3 medium-confidence groups × 9 covered verbs):
  - HIGH: `_(refund|reverse|undo)$` → destructive + not idempotent
  - HIGH: `_(cancel|void|revoke)$` → destructive + idempotent
  - HIGH: `_(archive|soft_delete)$` → destructive + idempotent
  - HIGH: `_(capture|charge|pay)$` → not destructive + not idempotent
  - HIGH: `_(unlock|enable|activate)$` → not destructive + idempotent
  - HIGH: `_(approve|confirm)$` → not destructive + idempotent
  - MEDIUM: `_(send|dispatch|notify)$` → routes to LLM
  - MEDIUM: `_(lock|freeze|disable)$` → routes to LLM
  - MEDIUM: `_(publish|finalize|submit)$` → routes to LLM
- `_COMPILED_PATTERNS` — pre-compiled `re.Pattern[str]` list at module load for per-tool perf.
- `match_verb_pattern(tool_name: str) -> VerbMatchResult` — first-match-wins (deterministic dict insertion order); high → returns full triple + matched_pattern; medium → returns confidence-only + matched_pattern (caller routes to LLM in Plan 03-11); no match → confidence='none'.
- Unknown confidence value raises `ValueError` (fail-loud per CLAUDE.md global rule).

32 tests cover: every high-confidence verb individually (16 cases); every medium-confidence verb individually (9 cases); no-match returns `confidence='none'`; bare-name (no underscore) returns 'none'; deterministic order invariant; `len(ACTION_VERB_PATTERNS) == 9`; D-27 invariant on `VerbMatchResult.model_dump()`; matched_pattern populated on high + medium hits.

### `apps/generation-engine/src/mcpgen_engine/passes/pass_4/titles.py` (84 LOC)

D-31 verbatim deterministic title generation.

- `_MAX_TITLE_LENGTH: Final[int] = 60` — D-31 hard cap.
- `_MIN_DEPLURALIZE_LEN: Final[int] = 3` — guard against `ws` → `w` artifacts.
- `_ELLIPSIS: Final[str] = "…"` — single Unicode ellipsis (1 char) for terminal compat.
- `generate_title(tool: Tool1) -> str` per D-31:
  - **Universal**: title-case (`search` → `"Search"`, `list_objects` → `"List Objects"`).
  - **Action** (≥2 tokens): verb reordering — last token is verb, leading tokens are object; output `"Verb Object"`. Object's last word is de-pluralized when it ends in `s` AND has > 3 chars (`charges_capture` → `"Capture Charge"`; `payment_intents_capture` → `"Capture Payment Intent"`; `ws_send` stays `"Send Ws"` because `ws` ≤ 3 chars).
  - **Action** with single token: falls back to plain title-case.
  - **Workflow**: title-case (verb is naturally first per D-31; `schedule_event` → `"Schedule Event"`).
  - **Specialized**: title-case (`account_balance_summary` → `"Account Balance Summary"`).
  - Truncation: titles > 60 chars are sliced to 59 chars + `…`.

20 tests cover: all 6 universal variants; 4 action verb-reorder cases incl. de-pluralization; 2 workflow cases; specialized; 60-char cap constant; ellipsis truncation; edge cases (single-token action, multi-word object depluralization, object-not-ending-in-s untouched, short-object no-strip).

## Verification

```text
cd apps/generation-engine && uv run pytest tests/passes/pass_4/test_rules.py tests/passes/pass_4/test_verbs.py tests/passes/pass_4/test_titles.py -v
72 passed in 0.08s

cd apps/generation-engine && uv run pytest tests/passes/ -q
383 passed in 1.16s   # no regressions

cd apps/generation-engine && uv run mypy src/mcpgen_engine/passes/pass_4/{rules,verbs,titles}.py tests/passes/pass_4/test_{rules,verbs,titles}.py
Success: no issues found in 6 source files

cd apps/generation-engine && uv run ruff check src/mcpgen_engine/passes/pass_4/{rules,verbs,titles}.py tests/passes/pass_4/test_{rules,verbs,titles}.py
All checks passed!
```

## Threat Model Outcomes

| Threat ID | Mitigation Outcome |
|-----------|--------------------|
| T-03-OW (D-27) | `RuleResult` and `VerbMatchResult` models never declare `openWorldHint`. `apply_tool_type_rules`, `aggregate_workflow_annotations`, `match_verb_pattern`, and `generate_title` never reference the field. Codified in tests `test_rule_result_does_not_contain_open_world_hint` and `test_verb_match_result_does_not_contain_open_world_hint`. The IR `Annotations` model's `openWorldHint: Literal[True]` invariant will land at construction time in Plan 03-11. |
| T-03-VP (D-29) | Verb table is verbatim from D-29; high-confidence patterns are conservative (`_refund/_reverse/_undo` always destructive) and ambiguous patterns (`_send/_lock/_publish`) explicitly route to medium-confidence LLM review. No-match returns `confidence='none'` so the Plan 03-11 caller falls back to D-29 conservative `(False, True, False)`. |
| Pitfall #31 (D-32) | Rule table HARDCODES `read_only=True` for all 4 universal read tools + every specialized tool. Test `test_pitfall_31_all_read_tools_force_read_only_true` loops over all 5 read-shaped tool variants and asserts `result.is_decisive is True and result.read_only is True`. Independent of `openWorldHint` (which Cursor only consults when `readOnlyHint=False`). |

## Deviations from Plan

### Plan-truth ledger vs. frozen IR

**1. `[Rule 3 - Blocking issue] Tool1 has no `universal_tool` field`**
- **Found during:** Task 1 implementation (rules.py).
- **Issue:** The plan's `must_haves.truths` describes `_TOOL_TYPE_RULES` as `Final[dict] keyed by (tool_type_value, universal_tool_value_or_None)` and `apply_tool_type_rules(tool: Tool1) -> RuleResult` accessing `tool.universal_tool`. The `<interfaces>` block in the plan also asserts `Tool1` has `universal_tool: Optional[UniversalTool]`. Inspection of `packages/ir/python/types.py` shows `Tool1` is `{name, type, source_endpoints}` only (no `universal_tool` field); the IR's class containing `universal_tool: UniversalTool` is `Rule` / `Rule1` / `Rule3` (the routing-rule entries), not `Tool1`. Confirmed by inspecting `packages/engine-fixtures/linear/pass-1-output.json` — for `type='universal'` tools, the canonical UniversalTool variant is encoded in `tool.name` (e.g., `{"name": "search", "type": "universal"}`), not in a separate field.
- **Fix:** Implementation keys the table on `(tool.type.value, tool.name)` for `Type.universal` (since `tool.name` IS the universal-tool variant for universal tools by convention), `(tool.type.value, None)` for `Type.specialized`. Action and workflow types are NOT in the table; `apply_tool_type_rules` returns `RuleResult(is_decisive=False)` for them so callers route to verb pattern / aggregation / LLM judgment.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/passes/pass_4/rules.py` (key shape) + `apps/generation-engine/tests/passes/pass_4/test_rules.py` (test using `Tool1(name='search', ...)` etc.).
- **Commit:** `f1a531f`.
- **Documented in:** module docstring on `rules.py` ("Plan 03-10 deviation"); this SUMMARY.

### Other deviations (minor, non-blocking)

**2. `[Pure design intent] verbs.py raises ValueError on unknown confidence`** — plan didn't specify; CLAUDE.md global rule "Always raise errors explicitly". Tests don't assert this directly (it's a defensive guard against future hand-edits to a `Final` constant that should never enter the runtime hot path).

**3. `[Pure design intent] aggregate_workflow_annotations doesn't import verbs.py`** — plan's pseudo-code commentary acknowledged this avoids circular imports; my implementation matches. Action sub-tools fall through to conservative `(False, True, False)`. Plan 03-11's orchestrator can re-aggregate after action verbs are resolved if higher precision is needed downstream.

**4. `[Test count adjustment]`** — plan's success criteria says "≥56 total tests"; actual delivery is 20 + 32 + 20 = 72 tests. Higher because each high-confidence verb in the verbs table got its own assertion (D-29 audit trail) and rules.py grew tests for the D-27 invariant + nested-workflow/non-workflow-input edges that the plan listed only via prose.

## Authentication Gates

None. All work was deterministic, in-process, with no network or LLM calls.

## Verified at Execution Time

- **`Tool1.universal_tool` access path:** Field does NOT exist on `Tool1` in the frozen IR (`packages/ir/python/types.py` lines 489–496). For `Type.universal` tools, `tool.name` is used as the canonical UniversalTool key. For `Type.specialized` tools, the table key is `None`. Decision recorded above.
- **`Annotations.openWorldHint` IR invariant:** Confirmed `Literal[True]` at `packages/ir/python/types.py` line 122 (and the duplicate `ToolAnnotations` declaration at line 856). Pass 4 deterministic modules never emit this field; it lands at IR construction in Plan 03-11.
- **`Pass1Output` shape:** `tools: List[Tool1]`, `workflows: List[Workflow1]`, `routing: Routing1` — confirmed at `packages/ir/python/types.py` lines 533–541.
- **Pass 1 fixture sample:** `packages/engine-fixtures/linear/pass-1-output.json` — universal tools carry `name` ∈ {`search`, `fetch`, `list_collections`, `list_objects`, `upsert`, `delete`} as expected.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `f1a531f` | feat(03-10): pass_4 deterministic tool-type rules + workflow aggregation |
| 2 | `11ff191` | feat(03-10): pass_4 deterministic verb pattern matcher |
| 3 | `9011c93` | feat(03-10): pass_4 deterministic title generation (D-31) |

## Self-Check: PASSED

All 6 source files verified present on disk; all 3 commit hashes (`f1a531f`, `11ff191`, `9011c93`) present in `git log`. 72/72 plan tests pass; 383/383 phase regression tests pass; mypy + ruff clean across all 6 files.
