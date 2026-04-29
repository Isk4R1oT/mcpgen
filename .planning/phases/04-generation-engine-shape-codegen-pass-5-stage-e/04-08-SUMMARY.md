# Plan 04-08 — Stage E Phase 3 runtime modules

**Status:** complete (orchestrator-salvaged after agent hit usage limit; implementation work intact)
**Tasks:** 2/2 (Task 1 RED scaffolding · Task 2 GREEN implementation)
**Commits:** 2

- `312ad72` — `test(04-08): add Wave-0 tests for runtime helpers + capability gate + sentry redact`
- `f3617e7` — `feat(04-08): Stage E Phase 3 runtime templates + orchestrator`

## Deliverables

### 8 Jinja2 templates under `packages/codegen-templates/templates/`

| Template | Purpose | Pitfall mitigated |
|---|---|---|
| `smart_id.ts.j2` | Four-part smart-ID parser/builder (`{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}`) | — |
| `pagination.ts.j2` | Clamp + defaults per Pass 5 strategy flag (cursor/offset/page-number/none) | — |
| `truncation.ts.j2` | D-07 frozen 8-row table mirrored into runtime | #5 (anti-loop) |
| `upstream.ts.j2` | Hand-rolled fetch + bounded exponential retry | — |
| `response_shaping.ts.j2` | Field filter + capability-gated `structuredContent` assembly | #4 (capability gate) |
| `errors.ts.j2` | D-32 teaching error templates (5 status branches) | — |
| `capability.ts.j2` | `gateOutputSchema(clientVersion)` — date-format `gteVersion` lex compare; conservative default `false` for unknown clients | **#4 (D-24)** |
| `sentry_redact.ts.j2` | `beforeSend` strips `authorization`/`x-upstream-auth`/`cookie`/`set-cookie` + spec-declared auth headers + body keys (`password`/`secret`/`api_key`/`apikey`/`token`/`client_secret`) + breadcrumb headers | **#12 (D-23)** |

### Source module

- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/runtime.py` (178 lines) — orchestrator that
  extracts spec-declared auth headers from `Pass0Output.auth_requirements[*]` (forward-compat via
  `getattr` — current IR `AuthRequirement1` lacks `header_name`, returns `[]` today; picks up
  automatically once Phase 7+ extends the IR), lowercases + dedupes + sorts them, and injects via
  `auth_headers` Jinja2 context var into `sentry_redact.ts`'s `REDACT_HEADERS` Set.

### Tests

- `apps/generation-engine/tests/stages/stage_e/test_runtime.py` (RED + GREEN expectations)
- `apps/generation-engine/tests/stages/stage_e/test_sentry_redact.py` (RED + GREEN expectations)
- `apps/generation-engine/tests/stages/stage_e/test_capability_gate.py` (Wave-0 stub from RED commit)

## Verification

- 80 tests pass under `tests/stages/stage_e/` (no regression on plans 04-06, 04-07, 04-09)
- Pitfall #4: `gateOutputSchema(undefined)` returns `false`; `gateOutputSchema("2024-11-05")` returns `false`; `gateOutputSchema("2025-06-18")` returns `true`
- Pitfall #12: `redactSensitive(event)` strips all 4 universal headers + spec headers + body keys + breadcrumb headers; v1 top-level-only walk documented as Phase 9 follow-up

## v1 Limitations (documented for Phase 9 follow-up)

- **Sentry redact body walk is TOP-LEVEL only** (NOTE 6 from plan-checker iteration 1) — nested credential surface (e.g., webhook payloads with `event.data.object.api_key`) is not scrubbed in v1. Phase 9 adds recursive walker with cycle detection. F1 (Phase 5) does NOT block on this — top-level coverage is the v1 contract.
- **Auth-header injection via `getattr`** — current IR `AuthRequirement1` model does not carry `header_name`; orchestrator returns `[]` today and will pick up spec-declared headers automatically once the IR is extended.

## Notes

- Salvage path: agent hit usage limit immediately after committing RED scaffolding (`312ad72`), so the GREEN implementation files (8 templates + runtime.py + 2 modified test files) sat uncommitted in the worktree. Orchestrator inspected the work, confirmed Pitfall #4 and Pitfall #12 are correctly implemented per CONTEXT D-23/D-24, and committed atomically as a single `feat(04-08)` per project's atomic-commits convention. Tests pass; no rework required.
