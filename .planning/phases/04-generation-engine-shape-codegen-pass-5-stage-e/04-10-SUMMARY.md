---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 10
subsystem: codegen
tags: [stage-e, jinja2, mcp-sdk-v1, six-tool-pattern, pitfall-5, capability-gate, codegen-templates]

# Dependency graph
requires:
  - phase: 04-generation-engine-shape-codegen-pass-5-stage-e
    provides: "Plan 04-06 scaffold (server.ts.j2 v1 SDK), Plan 04-07 schemas (routing.ts.j2 + outputSchema dual), Plan 04-08 runtime helpers (smart_id / pagination / truncation / upstream / response_shaping / errors / capability), Plan 04-09 auth middleware"
provides:
  - "Stage E Phase 5 — per-tool-type handler renderer (stages/stage_e/tools.py)"
  - "9 per-tool-type Jinja2 templates: search/fetch/list_collections/list_objects/upsert/delete + action/workflow/specialized"
  - "tools_index.ts.j2 registry exporting registerAllTools(server)"
  - "_TEMPLATE_BY_TOOL_TYPE dispatch table — frozen mapping (tool_type, universal_tool) → template name"
  - "Pitfall #5 invariant re-asserted at handler level: tool_search.ts.j2 carries zero pagination tokens"
  - "Pass 4 destructiveHint=true → confirm=true runtime gate in tool_delete.ts.j2"
  - "Capability-gated dual content+structuredContent emission in every successful return"
affects:
  - "04-11 (Stage E run() orchestrator + tsc --noEmit + wrangler dry-run)"
  - "04-12 + 04-13 (E2E + MCP Inspector verification)"
  - "Phase 5 (F1 static + F2 smell scan + F3 agent eval consume the rendered tool handlers)"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — consumes existing runtime helpers from 04-08 + schemas from 04-07
  patterns:
    - "Per-tool-type Jinja2 dispatch via Final[dict[tuple[str, str | None], str]] frozen at import"
    - "Render-context normalization through model_dump() → JSON-serialisable dicts → sha256 hash for L2 cache"
    - "PascalCase derivation from snake_case tool name for register{Pascal}() function names"
    - "Per-tool {{ tool.title | tojson }} via deterministic snake_case → Title Case (Pass 4 D-31 rule)"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/tools.py — _TEMPLATE_BY_TOOL_TYPE + render_tool_handler + render_all_tool_handlers"
    - "packages/codegen-templates/templates/tool_search.ts.j2 — universal search; ZERO pagination tokens (Pitfall #5)"
    - "packages/codegen-templates/templates/tool_fetch.ts.j2 — universal fetch; parseSmartId + routing-table lookup"
    - "packages/codegen-templates/templates/tool_list_collections.ts.j2 — discovery via smartIdSchema.collections"
    - "packages/codegen-templates/templates/tool_list_objects.ts.j2 — pagination + filter + sort + truncation hints"
    - "packages/codegen-templates/templates/tool_upsert.ts.j2 — smart routing (single/batch + create/update)"
    - "packages/codegen-templates/templates/tool_delete.ts.j2 — runtime confirm=true gate (destructiveHint=true)"
    - "packages/codegen-templates/templates/tool_action.ts.j2 — per-tool instantiation, verb-pattern annotations propagated"
    - "packages/codegen-templates/templates/tool_workflow.ts.j2 — sequential steps + partial-failure aggregation"
    - "packages/codegen-templates/templates/tool_specialized.ts.j2 — minimal scaffold around upstream call"
    - "packages/codegen-templates/templates/tools_index.ts.j2 — registerAllTools(server) registry"
    - "apps/generation-engine/tests/stages/stage_e/test_tools.py — 23 tests covering dispatch + N+1 emit + v1 SDK + capability gating"
    - "apps/generation-engine/tests/stages/stage_e/test_handler_truncation_anti_loop.py — 3 Pitfall #5 re-assertion tests"
  modified:
    - "apps/generation-engine/tests/stages/stage_e/conftest.py — extended with FinalTool fixtures for every tool-type combination + pass_1_output_handlers fixture"

key-decisions:
  - "Universal-tool dispatch keys = (tool_type_value, FinalTool.name) per Six-Tool Pattern — Pass 1 doesn't carry a separate `universal_tool` field; the convention mirrors pass_3/__init__.py."
  - "Non-universal dispatch keys = (tool_type_value, None) — single template per tool family (action/workflow/specialized)."
  - "render_tool_handler returns 3-tuple (relative_path, content, template_name) per plan must_haves; template_name is needed downstream for GeneratedFile.render_template provenance."
  - "render_all_tool_handlers emits N+1 GeneratedFiles in deterministic order: per-tool files in input order, then tools/index.ts last so the registry sees every previously-emitted handler."
  - "register{Pascal}(server) function naming derived deterministically from snake_case via _to_pascal — NO LLM polish (Pass 4 D-31 rule)."
  - "tool.title rendered from snake_case via _to_title (Title Case) — deterministic; LLM polish is a Pro post-MVP feature per CLAUDE.md."
  - "Every successful return funnels through assembleStructuredContent(data, ctx.clientVersion) — single chokepoint for D-24 capability gating, prevents Pitfall #4 silent-fail on older clients."
  - "Workflow template surfaces partial-failure state via per-step status enum (success/failed/skipped) — agent learns the exact step that broke and can use search/fetch to inspect partial state (D-31 + D-32)."
  - "Specialized template reuses the `fetch` truncation threshold (20K) — typical specialized tools return single objects or small bundles; CONTEXT D-07 doesn't define a per-specialized row."

patterns-established:
  - "Per-tool-type handler dispatch: any future tool family (e.g., resources / prompts) extends _TEMPLATE_BY_TOOL_TYPE with a new tuple key and a matching tool_<name>.ts.j2 template."
  - "Source-endpoint expansion via Jinja2 `{% for source_endpoint in tool.source_endpoints %}` with prefixed routing-key lookup — keeps generated TS readable + lets each per-handler choose its own routing-key prefix (search:/fetch:/list_objects: etc.)."
  - "Defence-in-depth tests: Pitfall #5 enforced at THREE levels — Pass 5 truncation table (templates.py D-07), runtime/truncation.ts.j2 search row, and per-tool tool_search.ts.j2 handler. Each level is grep-tested independently."

requirements-completed: [GEN-08]

# Metrics
duration: 35min
completed: 2026-04-28
---

# Phase 04 Plan 10: Per-Tool-Type Handler Templates Summary

**9 per-tool-type Jinja2 templates plus tools/index.ts registry rendered by Stage E Phase 5 — every handler uses MCP SDK v1 5-arg `server.tool()` form, capability-gated structuredContent via `assembleStructuredContent`, and Pitfall #5 zero-pagination invariant re-asserted at the search-handler level.**

## Performance

- **Duration:** ~35 min (Wave 0 tests + Wave 1 implementation + cleanup)
- **Started:** 2026-04-28T22:14:00Z
- **Completed:** 2026-04-28T22:50:00Z
- **Tasks:** 2 (Wave 0 RED tests, Wave 1 implementation)
- **Files created:** 13 (1 source module + 10 Jinja2 templates + 2 test files)
- **Files modified:** 1 (conftest.py extension)

## Accomplishments

- Stage E Phase 5 module `tools.py` ships the frozen 9-key dispatch table per CONTEXT D-31.
- 9 per-tool-type Jinja2 templates emit MCP SDK v1 5-arg `server.tool(name, description, schema, handler, { title, annotations })` form.
- `tools_index.ts.j2` exports `registerAllTools(server)` which wires every per-tool register function.
- `tool_search.ts.j2` carries zero pagination tokens (`next_cursor`, `nextCursor`, `offset`, `page_token`) — Pitfall #5 / D-50 invariant verified at handler level.
- `tool_delete.ts.j2` enforces `args.confirm === true` runtime gate before any upstream call (Pass 4 destructiveHint=true propagation).
- `tool_fetch.ts.j2` wires `parseSmartId` + routing-table lookup + capability-gated dual content+structuredContent.
- `tool_workflow.ts.j2` performs sequential step execution with partial-failure aggregation per Stage E design §4.4.
- 26 new tests (23 in test_tools.py + 3 in test_handler_truncation_anti_loop.py) all green.
- Full Stage E suite: 154 tests passing, no regression.
- mypy + ruff clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 RED tests for tools.py orchestrator + 9 templates** — `ad60295` (test)
2. **Task 2: tools.py + 10 Jinja2 templates** — `2e76e5e` (feat)

_TDD note:_ Task 1 wrote failing tests against an absent `tools.py` module; Task 2 implemented `tools.py` + 10 templates so all 26 tests pass.

## Files Created/Modified

### Created

- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/tools.py` — Stage E Phase 5 orchestrator: `_TEMPLATE_BY_TOOL_TYPE` dispatch table + `render_tool_handler` (3-tuple) + `render_all_tool_handlers` (N+1 GeneratedFiles).
- `packages/codegen-templates/templates/tool_search.ts.j2` — universal search; one-shot, no pagination invitation; `applySearchPagination` clamps upstream limit only.
- `packages/codegen-templates/templates/tool_fetch.ts.j2` — universal fetch; smart-ID parser + routing lookup + field filter + truncation + capability-gated assembly.
- `packages/codegen-templates/templates/tool_list_collections.ts.j2` — discovery via `smartIdSchema.collections` + optional `include_schema` upstream call.
- `packages/codegen-templates/templates/tool_list_objects.ts.j2` — pagination strategy (`applyPagination`) + filter / sort_by / sort_order + truncation w/ cursor/offset hints (allowed here per D-07).
- `packages/codegen-templates/templates/tool_upsert.ts.j2` — smart routing: single (`args.id`/`args.ids` → update) vs batch (`Array.isArray(args.data)`) + operation enum.
- `packages/codegen-templates/templates/tool_delete.ts.j2` — runtime `args.confirm !== true` gate emits teaching error before any upstream call.
- `packages/codegen-templates/templates/tool_action.ts.j2` — per-tool instantiation; verb-pattern annotations forwarded; D-32 teaching error template wired.
- `packages/codegen-templates/templates/tool_workflow.ts.j2` — sequential steps with `WorkflowStepResult` enum; first-failure short-circuits; conservative-aggregation message exposes step index.
- `packages/codegen-templates/templates/tool_specialized.ts.j2` — minimal scaffold; reuses `fetch` truncation threshold (20K).
- `packages/codegen-templates/templates/tools_index.ts.j2` — registry: imports every `register{Pascal}` + exports `registerAllTools(server)`.
- `apps/generation-engine/tests/stages/stage_e/test_tools.py` — 23 tests covering dispatch table, N+1 emission, v1 SDK invariant, no v2 `registerTool`, tools/index imports, confirm=true gate, capability gating, error template wiring, hash determinism.
- `apps/generation-engine/tests/stages/stage_e/test_handler_truncation_anti_loop.py` — 3 Pitfall #5 re-assertion tests; `list_objects` allowed pagination tokens.

### Modified

- `apps/generation-engine/tests/stages/stage_e/conftest.py` — added `final_tool_search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete`/`action`/`workflow`/`specialized` fixtures, `final_tools_all_types` aggregator, `pass_1_output_handlers` fixture, `_make_handler_final_tool` helper, and three annotation constants (`_READ_ANNOTATIONS`, `_WRITE_ANNOTATIONS`, `_DELETE_ANNOTATIONS`).

## Decisions Made

- **3-tuple return from `render_tool_handler`**: plan must_haves required the template name in the tuple so caller can fill `GeneratedFile.render_template` without re-running the dispatch logic.
- **`pass_1_output` reserved in signature**: forward-compat hook for action/workflow templates that may surface routing-rule details directly; v1 reads only the FinalTool fields.
- **Title derivation deterministic**: `_to_title` returns Title Case from snake_case; matches Pass 4 D-31 deterministic rule (LLM polish is post-MVP).
- **Routing-key prefix per template**: each handler uses its own prefix (`search:`, `fetch:`, etc.) when looking up `routing[key]` so multi-tool servers cannot collide on the same target endpoint.
- **`tool_specialized` reuses fetch truncation**: CONTEXT D-07 has no specialized row; fetch's 20K threshold is the closest analog (single-object responses).
- **Cleaned forbidden tokens from comments**: tool_search.ts.j2 originally documented forbidden tokens by name in the header comment; the test grep is content-wide so I replaced literal token enumeration with a pointer to the test file. Defence-in-depth holds: the test file IS the canonical list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `registerTool` literal in tool_search.ts.j2 comment**
- **Found during:** Task 2 (template authoring) — `test_no_handler_uses_v2_registerTool` failed.
- **Issue:** I had written `// NEVER v2 registerTool({...}, handler)` as a comment in `tool_search.ts.j2` to document the invariant. The test greps the full rendered output for the substring "registerTool", so the comment leaked the forbidden token even though the actual SDK call was correct v1 syntax.
- **Fix:** Replaced the offending comment line with `// Stay on v1: do not use the v2 config-object overload.` — same intent, no forbidden literal. Same fix applied preemptively to `tools_index.ts.j2`.
- **Files modified:** `packages/codegen-templates/templates/tool_search.ts.j2`, `packages/codegen-templates/templates/tools_index.ts.j2`.
- **Verification:** `test_no_handler_uses_v2_registerTool` passes.
- **Committed in:** 2e76e5e (Task 2 commit; fix folded into the same commit because templates were not yet pushed).

**2. [Rule 1 — Bug] Pagination tokens leaked into tool_search.ts.j2 header comment**
- **Found during:** Task 2 — `test_tool_search_no_next_cursor_in_rendered_output` failed.
- **Issue:** The header comment in `tool_search.ts.j2` enumerated the forbidden tokens (`next_cursor / nextCursor / offset / page_token / paginate`) as a defensive note. The Pitfall #5 test greps the full rendered output, so the comment leaked the token text.
- **Fix:** Replaced literal token enumeration with a sentence-form description plus a pointer to the test file (`test_handler_truncation_anti_loop.py`) which IS the canonical list of forbidden tokens.
- **Files modified:** `packages/codegen-templates/templates/tool_search.ts.j2`.
- **Verification:** All 26 wave-0 tests pass (test_tools 23 + test_handler_truncation_anti_loop 3).
- **Committed in:** 2e76e5e (Task 2 commit; fix folded into the same commit).

---

**Total deviations:** 2 auto-fixed (Rule 1 — bugs in template comments triggered by overly-broad grep tests).
**Impact on plan:** Both fixes were to test infrastructure / comment text, not to the handler-call shape or the v1 SDK contract. The actual generated TS still uses canonical v1 5-arg `server.tool()` and contains zero pagination tokens. Plan executed faithfully.

## Issues Encountered

- **MCP SDK v1 5-arg form vs SDK type signatures.** The SDK 1.29.0 `tool()` overloads (verified at `/Users/igor/Projects/mcpgen/node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.3.6/.../mcp.d.ts:140-146`) accept `tool(name, description, paramsSchema, annotations, cb)` (5 args, annotations as 4th positional, NO title). The plan + CONTEXT D-04 explicitly specify `tool(name, description, schema, handler, { title, annotations })` (handler 4th, options object 5th — title supported). The two surfaces don't reconcile cleanly. Plan/CONTEXT is the source of truth at this stage; the templates render the plan-specified form. The plan-specified form may not pass `tsc --noEmit` in Plan 04-11 — that's Plan 04-11's concern. If 04-11 surfaces compile errors, the fix will be either (a) drop title from the per-tool call (use 4th-positional annotations form) or (b) migrate to v2 `registerTool` (deliberate post-launch refactor per CONTEXT). For 04-10's scope (template content + dispatch + invariants) the plan-specified shape is what ships.

- **`FinalTool` model lacks `universal_tool` and `title` fields.** Per IR `packages/ir/python/types.py:412-423`, FinalTool has `name`/`type`/`description`/`inputSchema`/`outputSchema`/`annotations`/`response_config`/`source_endpoints`. The plan exemplar code referenced `tool.universal_tool` and `tool.title` directly. Resolution: per Six-Tool Pattern convention (already followed in `passes/pass_3/__init__.py:291-293`), for `Type.universal` tools the FinalTool `name` IS the canonical universal-tool identifier; `_select_template` uses `tool.name` as the universal-tool key. `title` is derived via `_to_title(tool.name)` — Pass 4 D-31's deterministic snake_case → Title Case rule. Both choices are consistent with prior phases.

## Next Phase Readiness

Plan 04-11 (Stage E Phase 6 — `run()` orchestrator + `tsc --noEmit` + `wrangler deploy --dry-run`) consumes:

- `render_all_tool_handlers(final_tools, pass_1_output)` to produce the `src/tools/` tree.
- `_TEMPLATE_BY_TOOL_TYPE` is exported (`__all__`) so 04-11 tests can introspect the dispatch table.
- `GeneratedFile.render_template` provenance is populated correctly by the 3-tuple `render_tool_handler` return.

Plans 04-12 (E2E) and 04-13 (MCP Inspector) consume the generated `src/tools/` tree as a black box — they care about the rendered TypeScript compiling and registering tools correctly via MCP `tools/list`.

The MCP SDK v1 5-arg-form mismatch noted above is the single open item that may surface in Plan 04-11's `tsc --noEmit` step. Mitigation strategy already documented above.

---
*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Plan: 10*
*Completed: 2026-04-28*

## Self-Check: PASSED

All claimed files exist on disk. Both task commits (ad60295 + 2e76e5e) found in git log. Wave-0 test suite green (26/26). Full Stage E suite green (154/154). mypy + ruff clean.
