---
phase: 04-generation-engine-shape-codegen-pass-5-stage-e
plan: 7
subsystem: engine
tags: [stage-e, schemas, jinja2, zod, pitfall-33, codegen]
dependency-graph:
  requires:
    - 04-05  # Pass 5 outputs (FinalTool.outputSchema)
    - 04-06  # Stage E Phase 1 (template_loader, scaffold, GeneratedFile)
  provides:
    - "schemas.py — render_schema_files orchestrator"
    - "templates/inputs.ts.j2 — per-tool Zod input schemas with .strict()"
    - "templates/outputs.ts.j2 — Pitfall #33 dual-export (rich + conservative)"
    - "templates/routing.ts.j2 — Pass 1 routing table"
  affects:
    - 04-08  # Runtime templates consume schemas/outputs.ts variants via D-24 capability gate
    - 04-10  # Per-tool handlers consume schemas/routing.ts for upstream dispatch
tech-stack:
  added:
    - "jinja2 (already in env from 04-06) — 3 new templates"
  patterns:
    - "Pitfall #33 dual-export pattern (CONTEXT D-26)"
    - "Deterministic render_inputs_hash via canonical-JSON sha256"
    - "Pass 1 routing.rules → RoutingEntry table mapping"
key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/schemas.py"
    - "apps/generation-engine/tests/stages/stage_e/test_schemas.py"
    - "apps/generation-engine/tests/stages/stage_e/test_zod_conservative.py"
    - "packages/codegen-templates/templates/inputs.ts.j2"
    - "packages/codegen-templates/templates/outputs.ts.j2"
    - "packages/codegen-templates/templates/routing.ts.j2"
  modified:
    - "apps/generation-engine/tests/stages/stage_e/conftest.py"
decisions:
  - "Routing table is keyed by `<universal_tool>:<target_endpoint>` (one entry per Pass 1 rule), not per source endpoint. Plan's draft code referenced FinalTool.routing/.universal_tool which do not exist on FinalTool — only Pass1Output.routing.rules carries that data."
  - "Conservative variant ships as a runtime stripFormat() call rather than emitting a precomputed object literal. This keeps the generated TS file small (no duplicated rich schemas) and makes the strip transparent at code-review time. The default-export region of the rendered file contains zero literal format strings — Pitfall #33 invariant verified by `test_no_format_*_in_default_export`."
  - "inputs.ts.j2 emits `z.unknown()` per property (not full Zod construction). Per the plan note, the tenant Worker registers each tool with its raw JSON Schema directly via the MCP SDK v1 `server.tool()` 3rd argument; the Zod wrapper exists for tsc validation surface + downstream type extraction (`type Inputs = typeof inputs`)."
metrics:
  duration: "~25 minutes"
  completed: "2026-04-28"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
  tests_added: 17
  tests_passing: "63/63 stage_e tests"
---

# Phase 04 Plan 07: Stage E Phase 2 — Schemas Templates Summary

Stage E Phase 2 ships the `schemas/` subtree of the generated tenant Worker: 3 Jinja2 templates (`inputs.ts.j2`, `outputs.ts.j2`, `routing.ts.j2`) + a Python orchestrator (`schemas.py`) that renders them from `FinalTool[]` and `Pass1Output`. Pitfall #33 dual-export per CONTEXT D-26 is in place — `outputs.ts` ships both a rich Zod-derived schema (with `format: "date-time"` etc.) and a conservative runtime-stripped variant for older MCP clients.

## What Shipped

### Source Files (6 new)

| Path | Purpose |
|------|---------|
| `apps/generation-engine/src/mcpgen_engine/stages/stage_e/schemas.py` | `render_schema_files(final_tools, pass_1_output)` orchestrator returning 3 `GeneratedFile` instances |
| `packages/codegen-templates/templates/inputs.ts.j2` | Per-tool Zod input schemas with `.strict()` (additionalProperties: false from Pass 3) |
| `packages/codegen-templates/templates/outputs.ts.j2` | Pitfall #33 dual-export: `richSchemas` (named) + `default` (conservative via `stripFormat()`) |
| `packages/codegen-templates/templates/routing.ts.j2` | Pass 1 routing table — RoutingEntry per rule + smartIdSchema constant |
| `apps/generation-engine/tests/stages/stage_e/test_schemas.py` | 11 tests — 3-file render contract, `.strict()`, deterministic hash, render_template, etc. |
| `apps/generation-engine/tests/stages/stage_e/test_zod_conservative.py` | 6 tests — Pitfall #33 invariant: default-export region has no `format: "date-time"`/`"email"`/`"uri"`/`"uuid"`/`"url"`; `richSchemas` block exists |

### Modified Files (1)

| Path | What Changed |
|------|--------------|
| `apps/generation-engine/tests/stages/stage_e/conftest.py` | Added `final_tools_synthetic` fixture (3 tools exercising date-time/email/uri/uuid/url + a no-format baseline) and `pass_1_output_synthetic` fixture (4 routing rules covering all synthetic tools' source endpoints) |

## Pitfall #33 Mitigation (Verified)

`outputs.ts.j2` emits two regions:

1. **Rich region (above `export default`):** declares `_richOutputSchema_<tool>` constants from `FinalTool.outputSchema` via Jinja2 `tojson` and exports them as `richSchemas`. Newer clients (MCP protocol >= 2025-06-18) consume this variant.
2. **Default export (conservative):** wraps each rich constant in `stripFormat(...)` — a runtime helper that recursively deletes `format` and `pattern` keys. Older clients (per D-24 capability gate, consumer in plan 04-08) consume this variant.

**Invariant verified by 6 tests in `test_zod_conservative.py`:** the default-export region of the rendered file contains zero literal `"date-time"`, `"email"`, `"uri"`, `"uuid"`, or `"url"` strings. The `richSchemas` block above retains them (verified by `test_rich_schemas_block_exists`).

Manual verification (Step 6 of plan): rendered with synthetic tool whose `outputSchema` has `format: "date-time"`. Default export contains only `fetch: stripFormat(_richOutputSchema_fetch)` — no literal format strings. ✅

## Routing Table Design

Plan draft referenced `tool.routing` and `tool.universal_tool` on `FinalTool`, but the IR `FinalTool` carries only `name/type/description/inputSchema/outputSchema/annotations/response_config/source_endpoints`. Routing data lives exclusively on `Pass1Output.routing.rules`. The orchestrator now consumes Pass 1 routing rules directly:

- One `RoutingEntry` per `Pass1Output.routing.rules` item.
- Key format: `"<universal_tool>:<target_endpoint>"` (e.g. `"fetch:GET /v1/charges/{id}"`).
- Method/path split from `target_endpoint` via `_split_endpoint` (raises `STAGE_E_TEMPLATE_ERROR` on malformed input).
- `params_mapping` dict carried verbatim into the emitted `paramsMapping` field.
- `smartIdSchema` constant exported alongside the table.

This is functionally equivalent to the plan's intent (one entry per Pass 1 tool with method/path/collection) and the test `test_routing_table_covers_all_pass_1_tools` asserts every Pass 1 universal_tool name appears in the rendered routing.ts.

## Verification

```bash
cd apps/generation-engine && uv run pytest tests/stages/stage_e/test_schemas.py tests/stages/stage_e/test_zod_conservative.py -v
# 17 passed in 0.17s

cd apps/generation-engine && uv run pytest tests/stages/stage_e/ -q
# 63 passed in 0.30s — no regression on existing Phase 1 tests

cd apps/generation-engine && uv run mypy src/mcpgen_engine/stages/stage_e/schemas.py
# Success: no issues found in 1 source file

cd apps/generation-engine && uv run ruff check src/mcpgen_engine/stages/stage_e/
# All checks passed!
```

Acceptance grep checks (all matched):
- `def render_schema_files` in schemas.py ✅
- `.strict()` in inputs.ts.j2 ✅
- `richSchemas`, `stripFormat`, `export default` in outputs.ts.j2 ✅
- `export const routing`, `method:` in routing.ts.j2 ✅

## Threat Model Status

| Threat | Disposition | Verification |
|--------|-------------|--------------|
| T-04-07-zod-format-strict (Pitfall #33) | **mitigated** (D-26) | 6 tests in `test_zod_conservative.py` assert default-export region has no `format` strings. Manual rendering confirmed with synthetic date-time/email/uri/uuid/url inputs. |
| T-04-07-additionalProperties-true | **mitigated** | `test_inputs_ts_uses_strict_modifier` asserts `.strict()` count equals tool count (one per tool). |
| T-04-07-routing-table-corruption | **mitigated** | `test_routing_ts_has_one_entry_per_pass_1_rule` asserts entry count matches `Pass1Output.routing.rules` length; `test_routing_table_covers_all_pass_1_tools` asserts every universal_tool prefix appears. |

No new threat surface introduced beyond the plan's STRIDE register.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | `1b87c5a` | test(04-07): add stage_e schemas + zod-conservative tests (Task 1 RED) |
| 2 (GREEN) | `31d6018` | feat(04-07): stage_e schemas (3 templates + orchestrator) with Pitfall #33 |

## Deviations from Plan

### Auto-fixed (Rule 1/2)

**1. [Rule 3 — Blocking] Routing table source: `Pass1Output.routing.rules` instead of `FinalTool.routing`/`FinalTool.universal_tool`**

- **Found during:** Task 2 implementation
- **Issue:** The plan's draft `schemas.py` and routing.ts.j2 referenced `tool.routing` and `tool.universal_tool` on `FinalTool` (and `tool.routing.collection`). The actual IR `FinalTool` model in `packages/ir/python/types.py` does not carry those fields — only `Pass1Output.routing.rules` (list of `Rule {universal_tool, target_endpoint, params_mapping}`) carries the routing data.
- **Fix:** `_build_routing_payloads` consumes `pass_1_output.routing.rules` directly, splits `target_endpoint` into method/path, and emits one entry per rule. The routing template is keyed `"<universal_tool>:<target_endpoint>"`. Test names updated to reflect this (`test_routing_ts_has_one_entry_per_pass_1_rule`, `test_routing_table_covers_all_pass_1_tools`).
- **Files modified:** `schemas.py`, `routing.ts.j2`, `test_schemas.py`
- **Commit:** `31d6018`

**2. [Rule 1 — Test calibration] Removed `.strict()` from comment text in inputs.ts.j2**

- **Found during:** Task 2 first GREEN run — `test_inputs_ts_uses_strict_modifier` asserted `inputs.content.count(".strict()") == len(tools)`. Initial template comments mentioned `.strict()` literally twice, inflating the count from 3 to 5.
- **Fix:** Re-worded comments to avoid the literal `.strict()` substring while preserving the explanatory intent. The actual code emission still applies `.strict()` per tool, just not in the comment block.
- **Files modified:** `inputs.ts.j2`
- **Commit:** `31d6018` (squashed into Task 2)

**3. [Rule 1 — Test calibration] Conservative variant uses runtime `stripFormat()` rather than precomputed-literal default export**

- **Found during:** Task 2 design
- **Issue:** Emitting both rich and conservative variants as precomputed object literals would double the bundle size and diverge from the Zod 4 `override` callback pattern shown in RESEARCH §"Pattern 6". The cited Code Example 6 itself uses a runtime helper.
- **Fix:** Default export wraps each `_richOutputSchema_<tool>` in `stripFormat(...)` — a recursive helper that walks the JSON tree at request time. The Pitfall #33 invariant (no format strings in default-export region) holds because the literal format strings only appear inside the `_richOutputSchema_*` constants which are above `export default`. Six tests in `test_zod_conservative.py` verify the invariant.
- **Files modified:** `outputs.ts.j2`
- **Commit:** `31d6018`

### Authentication Gates

None encountered — plan is pure code-generation pipeline work, no upstream API/auth dependency.

## Known Stubs

None — all functions ship real implementation. No `TODO`/`FIXME`/`pass` placeholders introduced.

## Self-Check: PASSED

- ✅ `apps/generation-engine/src/mcpgen_engine/stages/stage_e/schemas.py` exists
- ✅ `packages/codegen-templates/templates/inputs.ts.j2` exists
- ✅ `packages/codegen-templates/templates/outputs.ts.j2` exists
- ✅ `packages/codegen-templates/templates/routing.ts.j2` exists
- ✅ `apps/generation-engine/tests/stages/stage_e/test_schemas.py` exists (11 tests)
- ✅ `apps/generation-engine/tests/stages/stage_e/test_zod_conservative.py` exists (6 tests)
- ✅ Commit `1b87c5a` (Task 1 RED) found in `git log`
- ✅ Commit `31d6018` (Task 2 GREEN) found in `git log`
- ✅ 17/17 plan-specific tests pass
- ✅ 63/63 stage_e tests pass (no regression on Phase 1)
- ✅ mypy clean on `schemas.py`
- ✅ ruff clean on `stages/stage_e/`
