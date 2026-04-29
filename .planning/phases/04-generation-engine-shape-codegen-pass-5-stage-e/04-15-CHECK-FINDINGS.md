# Plan 04-15 — Check Findings

> Output of `gsd-plan-checker` agent run 2026-04-29 13:50 (Asia/Yekaterinburg) against the freshly-drafted `04-15-PLAN.md`.
> Per user instruction "stop after plan + checker", these findings are recorded for operator review BEFORE execution. The plan must be revised to address the 6 BLOCKERS before `/gsd-execute-phase 4 --plan 15 --ws engine` is run.

**Verdict:** ⛔ **REVISION REQUIRED** — 6 BLOCKER + 4 WARNING + 2 INFO findings.

**Goal-backward analysis verdict:** ✅ PASS — the architectural decision (migrate from deprecated 5-arg `server.tool()` to canonical SDK v1 `McpServer.registerTool(name, config, cb)`) directly addresses D-4's root cause and unblocks Phase 4 SC #1 + SC #5. Only the surface-level claims about file names, render-context shape, type signatures, and synthetic fixture contents need correction.

---

## Blockers (must fix before execution)

### B-1. Wrong template filenames — `tool_universal_*.ts.j2` vs actual `tool_*.ts.j2`

The plan's `files_modified` list, every `<files>` block, every `key_links` entry, and the `<verification>` shell snippet all reference `packages/codegen-templates/templates/tool_universal_search.ts.j2` (and 5 sibling `_universal_*` paths) — **but those files do NOT exist**. Actual filenames (verified via `ls`):
- `tool_search.ts.j2`
- `tool_fetch.ts.j2`
- `tool_list_collections.ts.j2`
- `tool_list_objects.ts.j2`
- `tool_upsert.ts.j2`
- `tool_delete.ts.j2`

The dispatch table in `apps/generation-engine/src/mcpgen_engine/stages/stage_e/tools.py:55-65` confirms the canonical names (no `_universal_` infix).

**Fix:** Audit the plan with `grep -nE 'tool_universal_'` and replace every occurrence with the canonical `tool_*` name. Affected lines: 11–16, 56, 339, 419, 420, 569, 570, 572.

---

### B-2. `output_schema` ALREADY exists in `_build_tool_context` — acceptance criterion is non-falsifying

Plan Task 2 must_have says "tools.py::_build_tool_context — the render context dict gains a new key `\"output_schema\": tool.outputSchema`" with acceptance grep `grep -F '"output_schema": tool.outputSchema'`.

**Reality** (verified via reading `apps/generation-engine/src/mcpgen_engine/stages/stage_e/tools.py:127`): the key is ALREADY there, nested under the `"tool"` dict. Two consequences:
1. The acceptance criterion passes TODAY without any change → trivially-passing assertion.
2. The plan's Jinja example `{% if output_schema %}{% else %}` won't work — render context exposes the value at `tool.output_schema`, NOT bare `output_schema`. With Jinja2 StrictUndefined, the bare-name reference would raise UndefinedError → Stage E render fails.

**Fix:** Replace the "add `output_schema` key" must_have with "preserve existing tool.output_schema in render context". Correct every Jinja example to use `tool.output_schema` namespace (mirror the existing `tool.name`, `tool.description_text`, `tool.annotations` pattern). Replace acceptance grep with one verifying the template-side change (e.g., `grep -F 'tool.output_schema' packages/codegen-templates/templates/tool_*.ts.j2 | wc -l` returns 9).

---

### B-3. `FinalTool.outputSchema` is `Dict[str, Any]` (non-optional) — defensive `outputSchema: undefined` branch is dead code

Plan must_haves and threat-model T-04-15-pass-5-output-schema-missing claim Pass 5 tools may have null outputSchema. **Reality** (verified via `packages/ir/python/types.py:177,420,594`): `outputSchema: Dict[str, Any]` — non-optional, Pydantic `extra=forbid` enforces. A FinalTool with `outputSchema=None` cannot exist (would raise ValidationError).

The defensive `{% if tool.output_schema %}{% else %}outputSchema: undefined,{% endif %}` branch is unreachable. The plan's claim "Pass 5's `FinalTool.outputSchema` Python type (currently `dict[str, Any] | None`)" (line 53) is factually wrong.

**Fix:** Remove the defensive branch from Jinja examples, must_haves, and threat-model T-04-15-pass-5-output-schema-missing. Correct line 53 to `dict[str, Any]` (non-optional).

---

### B-4. Jinja example uses raw quoting — would break on descriptions containing quotes/newlines

Plan Task 2 behavior block shows the migration target as:
```jinja2
server.registerTool(
  "{{ name }}",
  {
    description: "{{ description }}",
```

**Reality** (verified via `tool_fetch.ts.j2:30-32`): existing templates use:
```jinja2
server.tool(
    {{ tool.name | tojson }},
    {{ tool.description_text | tojson }},
```

Two differences:
1. Values come from nested `tool.*` namespace, not bare names.
2. Existing templates use `| tojson` for safe JSON-string quoting (handles embedded quotes, newlines, unicode). The plan's `"{{ description }}"` form would break on Stripe descriptions (200-400 chars per Pass 2 budget — guaranteed to contain quotes).

**Fix:** Rewrite Task 2 behavior block migration target to:
```jinja2
server.registerTool(
  {{ tool.name | tojson }},
  {
    description: {{ tool.description_text | tojson }},
    inputSchema: z.object({...}).shape,
    outputSchema: {{ tool.output_schema | tojson }},
    annotations: {{ tool.annotations | tojson }},
  },
  async (args, extra) => { ... }
);
```
Mirror the same correction in the ADR's BEFORE/AFTER snippet.

---

### B-5. Commit 4 violates atomic-commit rule (contains "and" in subject)

Per `docs/mcpgen-git-workflow-rules.md` §atomic-commits: "if 'and' in subject, split". Plan Task 3 step 6 lists Commit 4 as `docs(04-15): amend CONTEXT D-04 invariant + ADR for registerTool migration` — the `+` is an "and" equivalent, bundles 2 unrelated docs changes into one commit.

**Fix:** Split Commit 4 into:
- `docs(04-15): amend CONTEXT D-04 invariant for registerTool migration`
- `docs(04-15): add ADR 2026-04-29 stage-e registerTool migration`

Add explicit guardrail to Task 3 step 6: "if any pre-commit hook fails, fix the underlying issue and create a NEW commit; NEVER `--no-verify`."

---

### B-6. Structural gate-gap closure reasoning built on false premise about Plan 04-14's synthetic fixture

Plan must_have line 51 claims: "Plan 04-14's synthetic 3-tool fixture in that test doesn't carry outputSchema (it's a minimal smoke fixture), so the rendered tools register with `outputSchema: undefined`."

**Reality** (verified via `apps/generation-engine/tests/stages/stage_e/test_handshake_e2e.py:63-67`): `_make_final_tool` helper DOES populate outputSchema for all 3 synthetic tools (and is required to per B-3 — type is non-optional). After Plan 04-15's migration, those 3 synthetic tools WILL have outputSchema in tools/list. The plan's back-compat reasoning is wrong.

This is BLOCKER (not WARNING) because the structural gate-gap closure reasoning is at the heart of the plan. Plan 04-14's existing `test_dev_local_handshake_basic` SHOULD be extended to also assert outputSchema presence at the tools/list step — the cheapest gap closure (no extra wrangler spawn cost).

**Fix:** Add to must_haves: "Plan 04-14's existing `test_dev_local_handshake_basic` is also extended with an `outputSchema`-presence assertion at the tools/list step. The new `test_handshake_outputschema_e2e.py` adds end-to-end fidelity assertion against the real Stripe fixture as a separate, higher-cost layer." Update Task 1 behavior block accordingly.

---

## Warnings (should fix)

### W-1. Acceptance criterion regex `'^[^/]*server\.tool\('` semantics fragile

Intent is to exclude `//` comments, but `[^/]*` matches leading whitespace which still allows indented `server.tool(` calls to slip through. Safer form: `'^\s*server\.tool\('`. Affects lines 424, 572.

### W-2. 3 tasks × 16 files at upper bound of plan-checker rubric

Task 3 bundles 3 concerns (Wave-0 GREEN, CONTEXT amendment, ADR authoring). Optional split into Task 3a (Wave-0) + Task 3b (CONTEXT + ADR) for better rollback granularity. Not strictly required.

### W-3. Pre-flight SDK version check missing

Plan claims `tool()` deprecated "as of SDK 1.6+" but doesn't verify the project's pinned `@modelcontextprotocol/sdk` version is ≥ 1.6. If pinned < 1.6, `registerTool` doesn't exist on `McpServer` → migration fails at compile time. Add pre-flight: `grep '"@modelcontextprotocol/sdk"' packages/codegen-templates/package.json` and verify ≥ 1.6.

### W-4. Helper extraction (Task 1) references non-existent `wait_for_wrangler_ready`

`test_handshake_e2e.py` does NOT define `wait_for_wrangler_ready` (only `_free_port`, `_send_jsonrpc`, `_make_final_tool`, `_synth_*`). Plan invents a helper name. Decision deferred to executor — refactor-while-fixing anti-pattern violates CLAUDE.md "Keep changes minimal and related to the current request".

**Fix:** Commit to inline-duplication explicitly (preferred — simpler, smaller blast radius). Drop the "extract helper" option. Affects lines 287, 301, 320, 444, 452.

---

## Info (validated as accurate)

### I-1. SDK source references verified accurate

`mcp.d.ts:117-146` contains 5 `@deprecated` `tool()` overloads. Lines 150-157 contain the `registerTool(name, config, cb)` overload with `outputSchema?: OutputArgs`. Plan's SDK references are accurate.

### I-2. Stripe fixture invariant verified

All 9 Stripe FinalTools in `packages/engine-fixtures/stripe/final-tools.json` have non-null outputSchema (count: 9 / 9). The Wave-0 test's invariant assertion will pass on the current fixture.

---

## Recommended Path

Two options:

**A) Revise Plan 04-15 in-place** — address all 6 BLOCKERS + W-3/W-4 (~30 minutes of editing). The architectural decision is sound; only surface-level corrections needed. After revision, re-run plan-checker; expect VERIFICATION PASSED.

**B) Discard Plan 04-15 and re-draft from scratch** — only justifiable if you want a fundamentally different approach to D-4 (e.g., keep `tool()` form and use `setRequestHandler` to manually inject outputSchema into tools/list). Path A is strictly cheaper.

**Recommendation: Path A.** The 6 BLOCKERS are factual surface errors (wrong file names, wrong type claims, wrong Jinja syntax) that don't invalidate the architectural plan. The check pass actually CONFIRMS the migration approach is correct via I-1 + I-2.

---

*Captured by orchestrator at 2026-04-29 13:50 (Asia/Yekaterinburg). gsd-plan-checker run on Plan 04-15 commit (uncommitted at finding time; will commit alongside this finding doc).*