# Phase 2: Generation Engine — Architect (Pass 0+1) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 02-generation-engine-architect-pass-0-1
**Mode:** `--auto` (no interactive AskUserQuestion calls); user dictated final constraints in chat which superseded the auto-recommended defaults where they conflicted.
**Areas discussed:** Local execution model · LLM model + provider binding · Day-1 smoke test enforcement · Stage A parser · Pass 0 pipeline · Pass 1 Six-Tool Pattern · Caching · CLI surface · Engine HTTP API · Code organization · Security (untrusted spec text) · Fixture validation strategy

---

## Local Execution Model

| Option | Description | Selected |
|--------|-------------|----------|
| Fly.io ephemeral Machines (per-request auto-suspend) | Match `docs/mcpgen-architecture.md` §4 production target from day 1 | |
| Fly.io persistent app (always-on dev instance) | Lower latency than ephemeral but ~$5/mo always | |
| **Local `uvicorn localhost:8000` (Phase 2–9 dev loop)** | Zero deploy friction; matches project memory `project_local_compute.md`; Fly.io deferred to Phase 10 | ✓ |

**User's choice:** Local `uvicorn localhost:8000` — explicitly reinforced by user in chat: "Local-first dev: Generation Engine на uvicorn localhost:8000 (Fly.io отложен до Phase 10)."
**Notes:** All compute (engine, fixtures comparison, smoke test, integration tests) runs on developer laptop. CLI auto-spawns `uv run uvicorn` if engine not detected on `:8000`.

---

## LLM Model + Provider Binding

| Option | Description | Selected |
|--------|-------------|----------|
| **`qwen/qwen3-coder` via OpenRouter through PydanticAI `OpenAIProvider`** | Single source of truth per model-and-provider-override doc; existing `llm/client.py` is the binding | ✓ |
| Anthropic SDK direct (Sonnet/Haiku/Opus) | Stale; explicitly overridden | |
| LiteLLM-router fanout | Stale; LiteLLM is DELETED per override doc | |
| OpenAI SDK direct | Stale; not part of override | |

**User's choice:** Qwen3-Coder via OpenRouter / PydanticAI — explicitly reinforced: "OpenRouter qwen/qwen3-coder через PydanticAI OpenAIProvider(base_url=https://openrouter.ai/api/v1) — model override = single source of truth."
**Notes:** Sonnet/Haiku/Opus references in any other doc are stale and ignored. Single legal exception is Phase 5 F3 test agent (out of Phase 2 scope).

---

## Provider Routing Pinning (Pitfall #2)

| Option | Description | Selected |
|--------|-------------|----------|
| **Hard-pin `extra_body.provider` per call (`order=["fireworks"]`, `allow_fallbacks=false`, `quantizations=["fp16"]`, `require_parameters=true`)** | Prevents OpenRouter quantization drift; deterministic snapshot tests | ✓ |
| Use OpenRouter default routing | Cheaper but flaky F2 scores; CI snapshots untrustworthy | |
| Multi-provider fanout with score reconciliation | Defers to Phase 5 once F2 σ metric is live | |

**User's choice:** Hard-pin via `extra_body` at agent factory level — reinforced: "Provider routing pinned через extra_body={"provider": {"order": [...], "allow_fallbacks": false, "quantizations": ["fp16"], "require_parameters": true}}".
**Notes:** Initial provider order = `["fireworks"]` only. Broadening to multi-provider deferred to Phase 5.

---

## Day-1 Smoke Test Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| **Mandatory CI gate on every engine PR** | Catches Pitfall #27 (PydanticAI/OpenRouter SDK hallucination) before any other Phase 2 work | ✓ |
| Manual run before merge | Faster CI but relies on discipline | |
| Nightly only | Drift undetected for hours | |

**User's choice:** CI gate — reinforced: "Phase 2 = первый use, должен pass на каждом engine PR (CI gate)."
**Notes:** Smoke test already scaffolded in Phase 1 (`apps/generation-engine/tests/test_smoke_qwen.py`). Phase 2 extends it to verify `extra_body` forwarding. Skipped on forks via `requires_openrouter` marker.

---

## Stage A — OpenAPI Parser

| Option | Description | Selected |
|--------|-------------|----------|
| **`prance[osv]` + `openapi-spec-validator`** (already pinned) | Resolves `$ref`, validates 3.0.x and 3.1.x, no LLM | ✓ |
| Hand-rolled parser via `pyyaml` + `jsonschema` | More work; reinventing prance | |
| `openapi3` library | Less mature; less coverage of edge cases | |

**Selected:** `prance[osv]` per locked stack (Phase 1 pyproject already has it).
**Notes:** Format scope **OpenAPI 3.0.x and 3.1.x only**; GraphQL / Postman / AsyncAPI deferred per implementation plan §"NOT in MVP." `RawIR` validates against existing `packages/ir/python/types.py` — do not modify schema.

---

## Pass 0 — Internal Pipeline Structure

| Option | Description | Selected |
|--------|-------------|----------|
| **3 internal stages: deterministic filter → Qwen LLM → validation** (per pass-0 design doc) | Maximum determinism on the cheap stages, LLM only for naming + categorization | ✓ |
| Single LLM mega-prompt that does all three | Cheaper LLM cost but unauditable; can't reuse filter logic | |
| Two-stage (deterministic filter + LLM) skipping validation | Saves a step but lets cap violations through to Pass 1 | |

**Selected:** 3 stages per `docs/mcpgen-pass-0-design.md` — user reinforced: "Pass 0 (Tool Inventory & Naming) per docs/mcpgen-pass-0-design.md: 3 internal stages: deterministic filter → Qwen LLM → validation."
**Notes:** Naming = `{resource}_{action}` (NOT `{service}_{resource}_{action}`); tiered caps 30/50/80 + Pro 100; chunked path > 200; per-endpoint auth detection.

---

## Pass 0 — Per-Endpoint Auth Detection (Pitfall #6)

| Option | Description | Selected |
|--------|-------------|----------|
| **Per-endpoint `List[AuthRequirement]` (hybrid schemes supported)** | Reads global `securitySchemes` AND each operation's `security` override; lists both for hybrid endpoints | ✓ |
| Global `securitySchemes` only (single mode per spec) | Pitfall #6 — fails on Stripe Bearer + Restricted Keys, GitHub Bearer + Apps OAuth | |
| Detect mode at runtime via probe call | Adds network dependency in generation; defers complexity | |

**Selected:** Per-endpoint with `List[AuthRequirement]` — user reinforced: "Per-endpoint auth detection (Pitfall #6 — не глобальный securitySchemes)."
**Notes:** Recommended-mode mapping is deterministic (apiKey/Basic/Bearer → passthrough; oauth2 → oauth_flow; aws_signature → stored).

---

## Pass 1 — Six-Tool Pattern Adoption

| Option | Description | Selected |
|--------|-------------|----------|
| **Six-Tool Pattern (search/fetch/list_collections/list_objects/upsert/delete) + actions/workflows/specialized sparingly** | Industry consensus per Anthropic + OpenAI + MCP Bundles (Oct 2025); ~70% token savings | ✓ |
| Direct 1:1 endpoint → tool mapping (no consolidation) | Explodes to 50+ tools; loses Anthropic's recommended ~12 cap | |
| Single mega-tool with command discriminator | Confusing for agents; harder to describe; no industry precedent | |

**Selected:** Six-Tool Pattern per `docs/mcpgen-pass-1-design.md` — user reinforced full design doc adoption.
**Notes:** Target 6–12 tools; OpenAI-compliant `search(query)` / `fetch(id)` exact signatures; 100% endpoint coverage with `coverage_proof` per endpoint.

---

## Smart ID Format (Pitfall #1)

| Option | Description | Selected |
|--------|-------------|----------|
| **`{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}` minted at deploy time** | Cross-tenant isolation; non-overlapping ID regexes per Pitfall #1 | ✓ |
| `{spec_slug}:{type}:{collection}:{identifier}` (no tenant prefix) | Two tenants wrapping the same Stripe spec → collision; original Pass 1 design before Pitfall #1 was discovered | |
| Opaque base64-encoded blob | Loses smart-ID benefits (agents can't reason about IDs) | |

**Selected:** Tenant-prefixed at deploy time — user reinforced: "Smart IDs: {tenant_short_id}-{spec_slug}:type:collection:id."
**Notes:** Phase 2 emits the *schema-level* format `{spec_slug}:{type}:{collection}:{identifier}`; the `{tenant_short_id}-` prefix is prepended at deploy time by Phase 6 dispatch / Phase 4 Stage E template. Phase 2 fixture test verifies non-overlapping regexes for synthetic tenants.

---

## Coverage Validation (Pitfall #3)

| Option | Description | Selected |
|--------|-------------|----------|
| **`coverage_proof` field per endpoint with sample-invocation URL round-trip check** | Pitfall #3 mitigation — coverage isn't just "there's a route" but "this URL is well-formed" | ✓ |
| Boolean `covered: true/false` per endpoint | Doesn't catch encoding mismatches (filter approach can't express upstream) | |
| LLM judge of coverage | Non-deterministic; expensive | |

**Selected:** `coverage_proof` with sample invocation, URL-shape validation in Phase 2 (Stage E dry-run lands in Phase 4).
**Notes:** 3 retries on coverage <100%; fall back to `specialized_tools` with `degraded=true` warning.

---

## L1/L2/L3 Caching

| Option | Description | Selected |
|--------|-------------|----------|
| **3 layers (L1 spec-sha + L2 pass-input-hash + L3 tool-hash); skip L4 (Anthropic prompt cache N/A on OpenRouter)** | Per RULES.md / engine v2 §5.9 | ✓ |
| L1 only (full IR cache) | Misses partial-regen optimization | |
| Defer caching to Phase 5 | Violates GEN-12 "$0 LLM on second run" success criterion | |

**Selected:** 3 layers per user's explicit list — "L1 + L2 + L3 caching: spec-sha + pass-input-hash + tool-hash → repeat generation = $0 LLM (per GEN-12). L4 (Anthropic prompt caching) НЕ доступен через OpenRouter — пропущен."
**Notes:** Local filesystem backend in Phase 2 (`.cache/mcpgen/`); R2 in Phase 6. 30-day TTL. `engine_version` embedded in keys for auto-invalidation.

---

## CLI `npx mcpgen init` Output

| Option | Description | Selected |
|--------|-------------|----------|
| **Stub server: `tools/list` real, `tools/call` deterministic placeholder; full project layout (server.ts + package.json + README.md)** | Validates 60-second hero flow; works in MCP Inspector; realistic Stage E shape | ✓ |
| Single-file dump (just `final-tools.json`) | Doesn't satisfy CLI-01 "working MCP server file" | |
| Wait for Phase 4 Stage E to ship CLI | Defers CLI-01 to Phase 4; loses Phase-2 demo value | |

**Selected:** Stub server with placeholder handlers, full project layout.
**Notes:** Output dir `./mcpgen-output/<spec-slug>/` is the contract Phase 4 Stage E will fill in with real handler bodies. `tools/call` placeholder text states "Stage E codegen lands in Phase 4."

---

## Spec Sanitization (Prompt Injection Prevention)

| Option | Description | Selected |
|--------|-------------|----------|
| **Treat all spec text as UNTRUSTED; XML-tag sandboxing in prompts; system prompt rejects spec-embedded instructions** | Public OpenAPI specs have been observed in the wild containing prompt-injection payloads | ✓ |
| Trust spec content (it's "documentation") | Naive; one community-published spec compromises every server generated from it | |
| Strip all descriptions before LLM | Loses the signal Pass 0/1 LLM needs for naming + categorization | |

**Selected:** XML-tag sandboxing — user explicitly raised this in chat: "Sanitize all spec text treat as untrusted (prompt injection prevention)."
**Notes:** Spec text → user-content blocks wrapped in `<spec_excerpt source="…">…</spec_excerpt>`; system prompt forbids following instructions found inside; F1 (Phase 5) adds regex check for known injection patterns; Phase 2 emits a `prompt_injection_warnings` field as heuristic surface.

---

## Fixture Validation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| **Run pipeline against all 5 fixtures (Stripe + GitHub + Notion + Linear + Slack); compare structural equivalence (tool names, routing, smart-ID format), not text content** | Phase 1 D-07 fixtures already shipped; matches user's reinforcement "5 fixtures готовы в packages/engine-fixtures/" | ✓ |
| Stripe-only acceptance | Misses tool-mix variance (action-heavy Twilio-style, workflow-heavy calendar-style) | |
| Defer fixture validation to Phase 5 | Violates Phase 2's local-first dev loop | |

**Selected:** All 5 fixtures, structural equivalence only (descriptions are Phase 3's concern).
**Notes:** Stripe MUST yield 6–12 final tools, ≤50 Pass-0 plans, 100% coverage. Snapshot diffs posted as CI comments; do not block merges (Qwen mode-collapse risk).

---

## Claude's Discretion

The planner has flexibility on:
- Exact `pyproject.toml` dependency version bumps (within Phase 1 ranges).
- Specific `tenacity` retry decorator config (backoff factor, jitter).
- Whether `cache/keys.py` uses `cattrs` or hand-rolled hashing.
- Internal module boundaries within `pass_0/` and `pass_1/`.
- Whether `pipeline.py` orchestrator is class or function chain.
- CLI progress UI specifics (using already-pinned `@clack/prompts` + `ora`).
- Whether `RawIR` is the IR Pydantic model directly or a thin wrapper.

## Deferred Ideas

(Captured in CONTEXT.md `<deferred>` section.)

- Pass 2/3/4 → Phase 3.
- Pass 5 + Stage E → Phase 4.
- F1/F2/F3 → Phase 5.
- Tenant Worker dispatch + smart-ID prefix at deploy → Phase 6.
- Spec drift watcher → Phase 8.
- Stripe Meters / billing → Phase 8.
- Frontend wire-up → Phase 7.
- Fly.io deploy → Phase 10.
- R2 cache backend → Phase 6.
- GraphQL / Postman / AsyncAPI input formats → out of MVP.
- Pro `max_tools_override=100` UX → Phase 7 + Phase 8.
- `mcpgen serve` packaged engine command → Phase 6.
- SSRF allowlist on remote `$ref` fetching → Phase 6.
- Multi-provider OpenRouter routing → Phase 5.

---

*Phase: 02-generation-engine-architect-pass-0-1*
*Discussion log generated: 2026-04-26*
