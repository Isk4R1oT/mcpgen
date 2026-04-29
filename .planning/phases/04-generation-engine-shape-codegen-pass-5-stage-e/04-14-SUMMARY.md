---
phase: "04"
plan: "14"
subsystem: "stage-e-codegen"
tags: [stage-e, jinja2, dev-local, mcp-handshake, tdd, cloudflare-workers]
dependency_graph:
  requires: [04-13]
  provides: [dev-local-wrangler-handshake, d1-d2-d3-fixes]
  affects: [stage-e-scaffold, cli-init, generation-api-contracts]
tech_stack:
  added:
    - "dev_local build mode (scaffold.py + config.ts.j2)"
    - "SSE transport parsing in handshake e2e test"
  patterns:
    - "ruff format reconciliation across pre-commit hook iterations"
    - "Host header + Accept header required for MCP Streamable HTTP in test"
key_files:
  created:
    - "apps/generation-engine/tests/stages/stage_e/test_handshake_e2e.py"
  modified:
    - "packages/codegen-templates/templates/server.ts.j2"
    - "packages/codegen-templates/templates/config.ts.j2"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/scaffold.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_e/__init__.py"
    - "apps/generation-engine/src/mcpgen_engine/pipeline.py"
    - "apps/generation-engine/src/mcpgen_engine/api/generate.py"
    - "apps/generation-engine/src/mcpgen_engine/passes/pass_0/filter.py"
    - "packages/contracts/src/generation-api.ts"
    - "apps/cli/src/init/options.ts"
    - "apps/cli/src/init/index.ts"
    - "apps/generation-engine/tests/stages/stage_e/test_scaffold.py"
    - "apps/generation-engine/tests/stages/stage_e/test_run_e2e.py"
    - "apps/generation-engine/tests/test_api_generate.py"
    - "apps/cli/tests/init.test.ts"
decisions:
  - "D-3 assertion checks TS string literals only — comments referencing {tenant_short_id} by name are intentional"
  - "MCP handshake test sends Host: localhost + Accept: application/json, text/event-stream + Bearer + X-Upstream-Auth"
  - "SSE response parsed via data: line extraction (SDK chose text/event-stream over application/json)"
  - "dev_local=False default at all 3 layers: CLI flag, contracts, scaffold parameter"
metrics:
  duration: "~3 hours (continuation from prior session)"
  completed: "2026-04-29T07:55:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 14
---

# Phase 04 Plan 14: Stage E dev-local handshake drain (D-1 + D-2 + D-3) Summary

Drained all three deviations registered in gate 04-13 via TDD: wrote failing tests (RED), fixed the templates and plumbing (GREEN), then verified the Wave-0 MCP handshake against a live wrangler dev subprocess.

## What Was Built

**D-1 fix (tools/list returned empty array):** `server.ts.j2` previously used a Jinja2 `{% for tool in final_tools %}` loop that was never populated (scaffold Phase 1 does not receive `final_tools` in its context). Replaced with a static `registerAllTools(server)` call that delegates to `src/tools/index.ts` which always has all tools wired at build time.

**D-2 fix (stateful transport incompatible with CF Workers):** `sessionIdGenerator: () => crypto.randomUUID()` created a stateful SDK session that CF Workers per-request isolates immediately destroy. Changed to `sessionIdGenerator: undefined` — the SDK's documented stateless mode (per `webStandardStreamableHttp.d.ts:46`).

**D-3 fix (Invalid Host header in standalone wrangler dev):** Added `dev_local: bool` build mode threaded through the entire stack (CLI `--dev-local` flag → contracts `dev_local` field → engine API → pipeline → stage_e run → render_scaffold_files). When `dev_local=True`, `config.ts.j2` renders `"local-stripe.mcpgen.dev"` instead of `"{tenant_short_id}-stripe.mcpgen.dev"` and adds localhost entries to `ALLOWED_HOSTS`. Production builds retain the literal placeholder (Pitfall #30 mitigation).

## TDD Gate Compliance

- RED commit: `f67813f` — `test(04-14): add Wave-0 handshake e2e test (RED phase)`
- GREEN commits: `6f9038e` (D-1+D-2) + `d3585a4` (D-3) + `dec9f24` (handshake e2e pass)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `f67813f` | test | RED: Wave-0 handshake e2e test + scaffold dev_local tests |
| `6f9038e` | fix | GREEN: server.ts.j2 registerAllTools + stateless transport (D-1+D-2) |
| `d3585a4` | feat | GREEN: dev_local build mode full stack (D-3) |
| `dec9f24` | test | GREEN: handshake e2e passes against real wrangler dev |

## Test Results

- 185 stage_e tests pass (184 pre-existing + 1 new handshake e2e)
- 74 contracts tests pass
- 16 CLI init tests pass
- Ruff: clean on all modified files
- Mypy: clean (full src/ run)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UP038 isinstance tuple syntax in pipeline.py**
- Found during: Task 2 pre-commit hook
- Fix: `isinstance(exc, (Pass2Error, Pass3Error, Pass4Error))` → `isinstance(exc, Pass2Error | Pass3Error | Pass4Error)`
- Files: `apps/generation-engine/src/mcpgen_engine/pipeline.py`

**2. [Rule 2 - Missing] mypy dict[object, object] → dict[str, object] in test_handshake_e2e.py**
- Found during: Task 2 pre-commit mypy
- Fix: Replaced all `dict[object, object]` type hints with `dict[str, object]`; added `cast()` at SSE response access sites
- Files: `apps/generation-engine/tests/stages/stage_e/test_handshake_e2e.py`

**3. [Rule 1 - Bug] parameter_overview min_length=50 violated in fixture**
- Found during: Task 3 first run
- Fix: `'Single `query` parameter.'` → `'Single `query` string parameter — the search query text.'`

**4. [Rule 1 - Bug] Readiness poll missed 401 from passthrough auth middleware**
- Found during: Task 3 second run (wrangler_ready=False after 60s)
- Fix: Added 401 to the acceptable status set `(200, 400, 401, 404, 405)`

**5. [Rule 1 - Bug] MCP initialize rejected with Invalid Host header**
- Found during: Task 3 third run
- Fix: Added `"Host": "localhost"` to test request headers — DNS rebinding protection validates Host against ALLOWED_HOSTS

**6. [Rule 1 - Bug] MCP initialize rejected with Not Acceptable**
- Found during: Task 3 fourth run
- Fix: Added `"Accept": "application/json, text/event-stream"` — MCP Streamable HTTP transport requires both media types

**7. [Rule 2 - Missing] SSE response not parsed — resp.json() fails on SSE body**
- Found during: Task 3 fifth run
- Fix: Added content-type detection + `data:` line extraction to `_send_jsonrpc`; real transport returns SSE not JSON

**8. [Rule 1 - Bug] D-3 assertion too strict — matched comments, not just string literals**
- Found during: Task 3 second run
- Fix: Changed `"{tenant_short_id}" not in config_ts` → `'"{tenant_short_id}-stripe.mcpgen.dev"' not in config_ts`

## Self-Check

### Created files
- `/Users/igor/Projects/mcpgen/.claude/worktrees/agent-aa494135b61606ded/apps/generation-engine/tests/stages/stage_e/test_handshake_e2e.py` — FOUND

### Commits
- `f67813f` — FOUND
- `6f9038e` — FOUND
- `d3585a4` — FOUND
- `dec9f24` — FOUND

## Self-Check: PASSED
