---
phase: "04-generation-engine-shape-codegen-pass-5-stage-e"
plan: "15"
subsystem: "stage-e-codegen"
tags:
  - "stage-e"
  - "codegen"
  - "templates"
  - "mcp-sdk"
  - "outputSchema"
  - "D-4-drainage"
dependency_graph:
  requires:
    - "04-10"
    - "04-14"
  provides:
    - "outputSchema-in-tools-list"
    - "registerTool-migration"
  affects:
    - "04-13-gate-flip"
tech_stack:
  added:
    - "json_schema_to_zod Jinja2 filter (template_loader.py)"
  patterns:
    - "McpServer.registerTool(name, config, cb) — SDK v1 (1.6+) canonical form"
    - "Recursive JSON Schema → Zod TypeScript expression conversion"
key_files:
  created:
    - "apps/generation-engine/tests/stages/stage_e/test_handshake_outputschema_e2e.py"
    - "docs/decisions/2026-04-29-stage-e-registertool-migration.md"
  modified:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/template_loader.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/tools.py"
    - "apps/generation-engine/tests/stages/stage_e/test_handshake_e2e.py"
    - "apps/generation-engine/tests/stages/stage_e/test_tools.py"
    - "apps/generation-engine/tests/stages/stage_e/test_handler_truncation_anti_loop.py"
    - "packages/codegen-templates/templates/tool_search.ts.j2"
    - "packages/codegen-templates/templates/tool_fetch.ts.j2"
    - "packages/codegen-templates/templates/tool_list_collections.ts.j2"
    - "packages/codegen-templates/templates/tool_list_objects.ts.j2"
    - "packages/codegen-templates/templates/tool_upsert.ts.j2"
    - "packages/codegen-templates/templates/tool_delete.ts.j2"
    - "packages/codegen-templates/templates/tool_action.ts.j2"
    - "packages/codegen-templates/templates/tool_workflow.ts.j2"
    - "packages/codegen-templates/templates/tool_specialized.ts.j2"
    - ".planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-CONTEXT.md"
decisions:
  - "McpServer.registerTool(name, config, cb) is canonical SDK v1 (1.6+) form for outputSchema-bearing tools"
  - "json_schema_to_zod Jinja2 filter converts Pass 5 JSON Schema dicts to Zod TypeScript expressions"
  - "AnySchema in SDK registerTool is Zod-only — plain JSON objects fail tsc and SDK runtime guard"
metrics:
  duration: "~90 minutes (continuation session)"
  completed: "2026-04-29"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 15
---

# Phase 04 Plan 15: Stage E registerTool Migration (D-4 drainage) Summary

Drains D-4 (BLOCKER): migrate all 9 Stage E Jinja2 tool templates from deprecated SDK v1 5-arg `server.tool()` to `McpServer.registerTool(name, config, cb)` with `json_schema_to_zod` Jinja2 filter converting Pass 5 JSON Schema dicts to inline TypeScript Zod expressions for type-safe outputSchema support.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED: add failing tests for registerTool migration | 2eb864e | test_tools.py, test_handler_truncation_anti_loop.py, test_handshake_e2e.py, test_handshake_outputschema_e2e.py |
| 2 | GREEN: migrate 9 templates + add json_schema_to_zod filter | 68223ad | template_loader.py, tools.py, all 9 tool_*.ts.j2 |
| 3 | Docs: amend CONTEXT D-04 + create ADR | f92117b | 04-CONTEXT.md, docs/decisions/2026-04-29-stage-e-registertool-migration.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan incorrectly claimed SDK AnySchema accepts plain JSON objects**

- **Found during:** Task 2 GREEN phase, tsc --noEmit verification on Stripe fixture
- **Issue:** Plan truth #5 stated "SDK accepts JSON Schema via the `AnySchema` overload (no Zod conversion needed)". This was incorrect. The SDK's `registerTool` config `outputSchema` is typed as `OutputArgs extends ZodRawShapeCompat | AnySchema` where `AnySchema = z3.ZodTypeAny | z4.$ZodType` — Zod types only, not plain JS objects. TypeScript rejects plain object literals with `TS2353: Object literal may only specify known properties`. Additionally, the SDK runtime `getZodSchemaObject` throws `"inputSchema must be a Zod schema or raw shape, received an unrecognized object"` for non-Zod values.
- **Fix:** Added `json_schema_to_zod` Jinja2 filter to `template_loader.py` that recursively converts JSON Schema dicts to Zod TypeScript expressions. Templates now use `{{ tool.output_schema | json_schema_to_zod }}` instead of `{{ tool.output_schema | tojson }}`. Supported subset: string/number/integer/boolean/null/array(items)/object(properties)/object(no-properties→record). Depth guard at 8. Fallback to `z.unknown()` for unrecognized shapes and oneOf/anyOf/allOf.
- **Files modified:** `template_loader.py`, all 9 `tool_*.ts.j2` templates
- **Commit:** `68223ad`

## Test Results

- 185/185 stage_e tests pass (excluding wrangler-requiring e2e tests)
- 6/6 E2E fixture render tests pass (Stripe, GitHub, Notion, Linear, Jira — all include `tsc --noEmit` gate)
- 27/27 tool handler unit tests pass
- All TDD RED/GREEN gate commits present: `2eb864e` (test/RED) → `68223ad` (fix/GREEN)

## TDD Gate Compliance

RED gate commit: `2eb864e` — `test(04-15): add Wave-0 outputSchema handshake test (RED phase)`
GREEN gate commit: `68223ad` — `fix(04-15): migrate 9 tool templates to McpServer.registerTool for outputSchema support (D-4)`

Both gates present in git log. Plan was type: execute with TDD pattern per task breakdown.

## Known Stubs

None — plan objective (outputSchema in tools/list) is structurally complete. The Wave-0 wrangler handshake e2e test (`test_handshake_outputschema_e2e.py`) gates the full end-to-end assertion but requires `node_modules` (wrangler binary). The static checks (tsc --noEmit on 5 fixtures, 185 unit tests) verify the structural correctness without wrangler.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The `json_schema_to_zod` filter is a pure Python function (no I/O, no LLM, no external calls).

## Self-Check

### Created files exist:
- `apps/generation-engine/tests/stages/stage_e/test_handshake_outputschema_e2e.py` — FOUND
- `docs/decisions/2026-04-29-stage-e-registertool-migration.md` — FOUND

### Commits exist:
- `2eb864e` (Task 1 RED) — FOUND
- `68223ad` (Task 2 GREEN) — FOUND
- `f92117b` (Task 3 docs) — FOUND

### tsc --noEmit gate:
All 6 E2E fixture tests pass (which include tsc --noEmit via validate phase) — PASSED

## Self-Check: PASSED
