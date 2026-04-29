# Phase 4: Generation Engine — Shape & Codegen (Pass 5 + Stage E) - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Workstream:** `engine` (single-terminal — `.planning/workstreams/` not active per Phase 2/3; phase-local state under `.planning/phases/04-…/`).
**Mode:** Auto-mode discussion (`--auto`); recommended option selected for each gray area, rationale logged inline. User-driven constraints flowing in later (manual edit before plan-phase) supersede auto-selections.

<domain>
## Phase Boundary

Third LLM-bearing phase **and** the first code-emitting phase. Delivers **Stage D (Runtime Shaping) + Stage E (Codegen)**:

- **Pass 5 (Response Shaping)** consumes the `Pass2Output + Pass3Output + Pass4Output` triple frozen by Phase 3 and produces, for every tool, the **5 response mechanisms** required by `docs/mcpgen-pass-5-design.md`: (1) MCP-2025-06-18 `outputSchema`, (2) pagination strategy (cursor preferred, then offset, then page-number), (3) field filtering split (always-include / opt-in via `properties` / always-exclude), (4) per-tool-type truncation thresholds + teaching-template guidance, (5) optional `response_format` enum (only for tools with > 20 response fields).
- **Stage E (Codegen)** consumes the now-complete `FinalTool[]` (Pass 1 routing + Pass 2 description + Pass 3 inputSchema + Pass 4 annotations + Pass 5 outputSchema/response_config) and emits a **complete TypeScript Cloudflare Worker project (~25–30 files) via 100% deterministic Jinja2 templates** that compiles via `tsc --noEmit` and stays under the CF Workers 1MB-gzipped script-size limit.

End-to-end:
```
Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4    (Phase 2 + 3)
                                                ↓
                                        Pass 5 (response shaping)         ┐
                                                ↓                          │
                                        FinalTool[] assembled              │  Phase 4
                                                ↓                          │
                                        Stage E (Jinja2 → 25-30 TS files)  │
                                                ↓                          │
                                        tsc --noEmit + bundle-size gate    ┘
                                                ↓
              Generated CF Worker dir on disk (NOT deployed) + manual
              MCP Inspector verification (npx @modelcontextprotocol/inspector)
```

**In scope:**
- **Pass 5** per `docs/mcpgen-pass-5-design.md`: 5-phase pipeline (det pagination detection → det outputSchema extraction → Qwen field ranking ‖ concurrency 10 → truncation guidance template authoring → cross-tool validation). Five mechanisms above. Per-tool-type defaults (search 10K / list_objects 15K / fetch 20K / action 5K / workflow 15K / upsert+delete 5K). Pass 5 IR additions sit on top of `Pass4Output`; orchestrator assembles the **final `Tool[]`** at the end of Pass 5 (matching the IR shape Phase 3 D-39 deferred to here).
- **Stage E** per `docs/mcpgen-stage-e-design.md`: 6-phase pipeline (scaffold → schemas → runtime → auth → tool handlers → `tsc --noEmit` validation). Native MCP tools (NOT Code Mode). CF Workers only — no Node.js/Deno/Vercel-Edge runtime in MVP. **3 auth modes:** passthrough (default API key/Basic), stored (AES-256-GCM with per-tenant DEK in CF KV — wired up but not exercised end-to-end until Phase 6), OAuth 2.1 PKCE via `@cloudflare/workers-oauth-provider`.
- **Bundle-size gate (Pitfall #8):** Stage E phase 6 runs `wrangler deploy --dry-run` (read-only — no actual deploy) to capture gzipped bundle size into `QualityReport.bundle_size_kb`. Soft gate today: `<800KB` pass, `800-950KB` warn, `>950KB` hard fail with `MULTI_SERVER_SPLIT_REQUIRED` error. F1 (Phase 5) hard-blocks at the `>950KB` threshold; Phase 4 emits the field and CLI surfaces it.
- **DNS-rebinding mitigation (Pitfall #15):** every generated Worker installs `hostHeaderValidation` middleware in `auth/middleware.ts`. Allowlist contains the deployed hostname placeholder (`{tenant_short_id}-{spec_slug}.mcpgen.dev`) injected at Stage E codegen time; Phase 6 dispatch Worker substitutes the real allowlist at deploy. F1 (Phase 5) verifies presence; Phase 4 ships the template + a smoke test.
- **Sentry `beforeSend` redaction (Pitfall #12):** every generated Worker bundles a `sentry-redact.ts` runtime helper that strips `X-Upstream-Auth`, `Authorization`, `Cookie`, AND every auth header declared in the source spec's `securitySchemes` (passed in via the `auth_headers` Jinja2 var). Sentry SDK is wired with empty DSN by default — Phase 9 fills DSN; Phase 4 wires the redaction.
- **Capability negotiation for outputSchema (Pitfall #4):** Stage E runtime gates `outputSchema` emission on the client `protocolVersion` parsed during `initialize`. Clients reporting `protocolVersion < "2025-06-18"` receive `tools/list` WITHOUT `outputSchema` (and tool responses fall back to `content`-only — no `structuredContent`). The capability check itself is shipped as a runtime helper in every generated Worker; Phase 6 dispatch Worker mirrors the same helper for capability-routed dispatching.
- **Tool-name uniqueness (Pitfall #30):** MCP `server.name` field (set in `src/server.ts`) = `{tenant_short_id}-{spec_slug}` — Phase 6 prepends the `{tenant_short_id}-` prefix at deploy time; Phase 4 emits the schema-level slug `{spec_slug}` in `config.ts` plus a `<TENANT_PREFIX>` placeholder that Phase 6 substitutes. Phase 4 fixture test verifies that two synthetic tenants produce non-overlapping `server.name` after prefix substitution.
- **Zod-to-JSON-Schema (Pitfall #33):** Stage E generates Zod 4 schemas (`z.toJSONSchema()`) AND emits a fallback conservative JSON Schema (no `format: "date-time"`, only `type: "string"` for timestamps) when the generated schema uses Zod-specific format extensions. Both schemas land in `schemas/outputs.ts`; runtime serves the conservative variant by default. F1 (Phase 5) checks `outputSchema` validity against MCP's official validator.
- **MCP Inspector verification (Success Criterion #5):** Phase 4 wave 5 plan `04-13-PLAN.md` is a **manual gate** — generated Stripe MCP loaded into `npx @modelcontextprotocol/inspector` returns dual `content` + `structuredContent` per MCP 2025-06-18, `tools/list` shows 6–12 tools with full descriptions / inputSchemas / annotations / outputSchemas, and a hand-invoked `fetch` against the `/v1/charges/{id}` endpoint via Stripe **test-mode key** (passed in `X-Upstream-Auth` header) returns the expected dual-content shape.
- **Pipeline orchestrator** (`apps/generation-engine/src/mcpgen_engine/pipeline.py`) extended to chain Pass 5 → Stage E after Pass 4 with the existing SSE envelope. New stage events: `D:started/completed` (Pass 5 = "Stage D Runtime Shaping" per Phase 3 D-33 + engine v2 §5.1), `E:started/completed` (Stage E codegen). Terminal status: `shape_codegen_complete` (between `author_complete` and the eventual `validation_complete` from Phase 5). `architect_complete`, `author_complete`, `shape_codegen_complete` are all retained as sub-statuses for backward compatibility with Phase-2/3 CLI.
- **Sampling profile** for Pass 5 added to `apps/generation-engine/src/mcpgen_engine/llm/sampling.py`. Same `_PROVIDER_ROUTING` (`atlas-cloud` / `fp8` / no fallbacks) is reused — Phase 2 D-04/D-05 contract intact.
- **L1/L2 cache** extended for Pass 5 + Stage E. L2 keys for Pass 5 include the same `prompt_version` lever from Phase 3 D-35; Stage E gets a new `template_version` lever for Jinja2 template bumps. L1 value expands to `{raw_ir, pass_0_output, pass_1_output, pass_2_output, pass_3_output, pass_4_output, pass_5_output, stage_e_manifest}`. Stage E **artifacts themselves** (the 25-30 files) are NOT cached in L1 — they're regenerated from the cached `stage_e_manifest` on hit (cheap; deterministic; avoids large filesystem cache entries).
- **CLI** (`apps/cli/src/init/`): `render_stub.ts` from Phase 3 is **replaced** by full Stage E output — CLI now emits the 25-30-file generated server tree under `./mcpgen-output/<spec-slug>/` (NOT just a stub `server.ts`). The Phase-2 deterministic-placeholder `tools/call` body disappears: real handler bodies arrive in Phase 4. `render_description.ts` is **hoisted** from `apps/cli/src/init/` to `packages/codegen-templates/src/` so Stage E Jinja2 can call it (Phase 3 Claude's-discretion item D-37 commits here).
- **Untrusted-spec sanitization** (Phase 2 D-51 / Phase 3 D-15+D-25) extended to Pass 5 prompts: every spec excerpt (response-schema descriptions, field doc strings) wrapped in `<spec_excerpt source="<endpoint_id>" field="<name>">…</spec_excerpt>`. System prompt for Pass 5 field-ranking includes the same "treat as data" instruction.
- **`.mcpgen.yaml` project config** in every generated repo (Success Criterion #4): `{spec_url, spec_hash, generated_at, engine_version, mcpgen_pipeline_versions: {pass_0..pass_5, stage_e}, server_name_template: "{tenant_short_id}-{spec_slug}", auth_mode: passthrough|stored|oauth, mcp_protocol_version: "2025-06-18"}`. Used by Phase 8 Drift Watcher (compare current spec_hash against generated hash) and by F1 (Phase 5) to verify all required fields present.
- **Validation against the 5 fixtures in `packages/engine-fixtures/{stripe,github,notion,linear,slack}/`** — each fixture gets hand-tuned `pass-5-output.json` plus a `stage-e-output/` reference subdirectory containing the expected file tree (NOT exact byte-match — checksum manifest for each generated path so Jinja2 whitespace tweaks don't blow up). E2E target: Stripe + GitHub + Notion fixtures pass `tsc --noEmit` cleanly with zero warnings.
- **Pitfall mitigations Phase 4 owns** (per ROADMAP.md Phase 4 entry): #4 (capability negotiation in dispatch + Stage E runtime), #5 (truncation guidance bounds pagination expectations), #8 (`wrangler deploy --dry-run` size capture + soft gate), #12 (Sentry `beforeSend` redaction generated into every Worker), #15 (`hostHeaderValidation` middleware mandatory), #30 (server name uniqueness via `{tenant_short_id}-{spec_slug}`), #33 (Zod-to-JSON-Schema with conservative-format fallback).
- **End-to-end** smoke run `Stage A → Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4 → Pass 5 → Stage E` on Stripe + GitHub + Notion golden specs; output project compiles `tsc --noEmit` clean and loads in MCP Inspector.

**Out of scope (later phases):**
- **Stage F** (F1 static + F2 smell scan + F3 agent eval) — Phase 5. Phase 4 fixture tests verify code compiles and the file tree matches; F2/F3 quality scoring is Phase 5.
- **Tenant Worker dispatch + 3 auth-mode runtime end-to-end + smart-ID `{tenant_short_id}-` prefix substitution at deploy time + capability-routed dispatch** — Phase 6.
- **Frontend wire-up of Pass 5 / Stage E progress + bundle-size gauge + dropped-endpoints-from-Pass-0 surfaced in preview** — Phase 7.
- **Stripe Meters / Drift Watcher / Sentry-DSN-filled / Langfuse dashboards** — Phase 8/9 (Phase 4 wires Sentry SDK with empty DSN per Phase 1 D-19).
- **Fly.io deployment of engine** — Phase 10. Phase 4 runs on `uvicorn localhost:8000` (Phase 2 D-01).
- **Multi-provider Qwen3-Coder routing** (broaden `provider.order` from `["atlas-cloud"]` to a list) — Phase 5 once F2 between-tool σ ≥ 0.4 discrimination metric is live.
- **Real CF Workers deploy of generated tenant Workers** — Phase 6 (`mcpgen deploy` CLI command). Phase 4 only generates the project on disk.
- **Real OAuth flow exercised end-to-end** (Logto + `@cloudflare/workers-oauth-provider`) — Phase 6 + Phase 8. Phase 4 emits the OAuth template but does not run an OAuth handshake.
- **Stored-credentials AES-256-GCM with per-tenant DEK in CF KV** — Phase 4 emits the template + crypto helper; the per-tenant DEK rotation runtime + CF KV binding is exercised in Phase 6.
- **Code-mode tool execution** — explicitly out of MVP per `docs/mcpgen-architecture.md` decision; Six-Tool Pattern delivers Code-mode-level token efficiency at the structural level. Phase 4 ships native MCP tools only.
- **Multi-runtime codegen** (Node.js / Deno / Vercel Edge) — explicitly post-launch per `docs/mcpgen-stage-e-design.md` §1.2 + PROJECT.md Out of Scope. Phase 4 ships CF Workers only.
- **`response_format` enum on every tool** — only added when > 20 response fields per Pass 5 design §1.5; default is OFF.
- **LLM-generated examples in tool descriptions** — Pass 2 D-11 invariant continues; `examples = null` everywhere except literal spec examples.
- **Cross-tool description coherence checks** — would land as Phase 5 F2 sub-check.

</domain>

<decisions>
## Implementation Decisions

### Sampling profile & agent factory (extension of Phase 3 D-01..D-03)

- **D-01:** **Reuse `apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py::make_agent`** as the SOLE model construction site — Pass 5 module imports `make_agent` exactly like Pass 0/1/2/3/4 do. Same `_PROVIDER_ROUTING` dict (`atlas-cloud` / `fp8` / `allow_fallbacks=False`) is reused for every Pass 5 LLM call. *Rationale:* Phase 2 D-04/D-05 contract intact; Pitfall #2 mitigation continues; smoke test (`test_smoke_qwen.py`) gates every Phase 4 PR. **Forbidden:** constructing `OpenAIModel` / `OpenAIProvider` anywhere outside `llm/client.py`. Auto-selected — there is no second model in the architecture.

- **D-02:** **One new sampling profile in `llm/sampling.py`**:
  - `PASS_5_SETTINGS` — `temperature=0.1`, `top_p=0.9`, `max_tokens=1024` (field-importance ranking + truncation-template polish — classification-grade with tiny creative window for guidance text). `extra_body=_PROVIDER_ROUTING`.
  - `INLINE_GATE_SETTINGS` from Phase 3 D-02 is **reused** for Pass 5's optional inline judge — no new gate profile needed (Pass 5 ships without an inline gate in v0; F2 in Phase 5 catches issues).
  Auto-selected — temperature matches the Pass 5 detail design's classification-grade-with-light-creativity profile.

- **D-03:** **Replace every "Haiku" / "Sonnet" reference in `docs/mcpgen-pass-5-design.md` and `docs/mcpgen-stage-e-design.md` with Qwen3-Coder.** Per `docs/mcpgen-model-and-provider-override.md` §0–4 the model override is universal. Stage E itself has **zero LLM calls** (100% deterministic Jinja2). Pass 5 has Qwen calls only in Phase 3 (field ranking). Auto-selected — override doc beats pass/stage-detail-design per RULES.md §"conflict resolution order".

### Pass 5 — Response Shaping

- **D-04:** **Module layout under `apps/generation-engine/src/mcpgen_engine/passes/pass_5/`** mirrors Phase 2/3 D-49/D-04:
  ```
  passes/pass_5/
    __init__.py            # entry point: async def run(pass_4_output, pass_3_output, pass_2_output, pass_1_output, raw_ir) -> Pass5Output
    pagination.py          # Phase 1: deterministic pagination strategy detection (cursor / offset / page-number)
    output_schema.py       # Phase 2: deterministic outputSchema extraction (per Pass 5 design §2 mechanism 1)
    field_ranking.py       # Phase 3: per-tool Qwen field-importance ranking (concurrency 10) + always-include / opt-in / always-exclude split
    truncation.py          # Phase 4: per-tool-type truncation thresholds + teaching-template guidance (Appendix A templates)
    response_format.py     # Phase 5a: response_format enum gate (only adds param when > 20 fields)
    validation.py          # Phase 5b: cross-tool consistency (filter approach unchanged from Pass 3 D-18; cursor/offset uniformity per server)
    prompts.py             # field-ranking system prompt (cached per OpenRouter cache_control)
    templates.py           # truncation guidance templates per Pass 5 design Appendix A
    final_assembly.py      # combine Pass 1+2+3+4+5 outputs into FinalTool[]
  ```
  Auto-selected — file-list mirrors Pass 2/3/4 patterns exactly. Planner has flexibility on internal sub-module boundaries (per Phase 2 D-50 Claude's discretion clause).

- **D-05:** **Pass 5 5-phase pipeline** mirrors `docs/mcpgen-pass-5-design.md` §4 verbatim:
  - Phase 1 (`pagination.py`, deterministic, $0, < 1s): for each list-like tool, walk `RawIR.endpoints[*].responses[200].schema` looking for `next_cursor`/`nextCursor`/`page_token` (cursor) → `offset`/`skip` (offset) → `page`/`per_page` (page-number). One strategy chosen **per server** (consistency); when tools disagree, pick the most common in the spec, log the others. Default `limit=25`, `max_limit=100` for `list_objects`; `default_limit=10`, `max_limit=50` for `search` (search results denser per Pass 5 design §3.1).
  - Phase 2 (`output_schema.py`, deterministic, $0, < 1s): for each tool, pull spec `responses[200].schema` (or 201 for upserts), wrap with metadata (`id` smart_id, `object_type` collection, `metadata: {fetched_at, source_endpoint}`), generate Zod 4 schema via codegen helpers (NOT runtime — these become source files in `schemas/outputs.ts`). Universal tools (`fetch`, `list_objects`) aggregate across collections via `oneOf` + a generic `additionalProperties: true` fallback.
  - Phase 3 (`field_ranking.py`, LLM, ‖ concurrency 10): per Pass 5 design §1.6 — **only** for tools with > 10 response fields. Single Qwen call per tool. Output type `FieldRanking{always_include: List[str], opt_in: List[str], always_exclude: List[str]}`. Deterministic pre-ranking heuristics (Pass 5 design Appendix B): required fields → `always_include`; field name signals (`*_id`, `*_at`, `name`, `title`, `status`) → `+0.3`; signals (`_internal`, `raw_*`, `debug`, `deprecated`) → `-0.3`. LLM call refines ambiguous middle. Conservative bias: when uncertain, prefer `opt_in` over `always_include` (better agent-asks than burns tokens).
  - Phase 4 (`truncation.py`, deterministic + minor LLM polish, $0–$0.01, ~5s): apply per-tool-type defaults from Pass 5 design §3 (search 10K / list_objects 15K / fetch 20K / action 5K / workflow 15K / upsert+delete 5K). Guidance templates from Appendix A — placeholders `{N}`, `{Total}`, `{action}`, `{next_cursor_format}` substituted with tool-specific values. **Anti-pagination-loop wording mandatory (Pitfall #5):** every truncation message includes the phrase *"usually sufficient"* OR *"only paginate if the user explicitly requested all"*. `search` truncation messages NEVER include `next_cursor` or `offset` hints (per Pitfall #5 prevention — `search` should be one-shot).
  - Phase 5 (`response_format.py` + `validation.py`, deterministic, $0, < 1s): add `response_format: enum["summary"|"detailed"|"raw"]` parameter ONLY when (a) `len(always_include) + len(opt_in) > 20` AND (b) tool type ∈ `{fetch, action, specialized}` (not list — list already handles via `properties`); default value = `"summary"`. Cross-tool consistency: pagination strategy uniform per server; `cursor`/`offset` parameter names uniform per server.
  Auto-selected — matches `docs/mcpgen-pass-5-design.md` §4 verbatim.

- **D-06:** **Per-tool concurrency = 10** for the LLM field-ranking phase. Implemented via `asyncio.Semaphore(10)`. Matches Phase 2 D-49 / Phase 3 D-08 patterns. Auto-selected — Pass 5 design §4 Phase 3.

- **D-07:** **Truncation thresholds per tool type (frozen table in `truncation.py`):**
  | Tool type | Truncation threshold (tokens) | Default action template |
  |---|---|---|
  | `search` | 10K | "Showing top {N} results. {Total - N} more matches exist; usually sufficient. Refine query for precision." |
  | `list_objects` | 15K | "Showing {N} of {Total} objects. {Total - N} more available; usually sufficient. To continue, use {next_cursor: '...'} or {offset: M}. Only paginate if the user explicitly requested all." |
  | `list_collections` | 10K | "Showing {N} of {Total} collections; usually sufficient." |
  | `fetch` | 20K | "Object has {Total} fields, showing {N} default. To see all fields, call fetch again with properties=['*'] or specify field names." |
  | `upsert` | 5K | "Upsert completed. Returning {N} of {Total} fields of the {operation} object; usually sufficient." |
  | `delete` | 5K | "Delete completed. Confirmation: {N} of {Total} resources affected." |
  | action | 5K | "Action `{action}` completed. Output truncated at {N} tokens. Use search/fetch to inspect resulting state." |
  | workflow | 15K | "Workflow `{action}` completed: {success_count}/{total_steps} sub-operations. Truncated to key results; sub-operation details available via fetch." |
  Auto-selected — matches `docs/mcpgen-pass-5-design.md` §3 + Pitfall #5 prevention.

- **D-08:** **Pagination strategy detection precedence** — the FIRST match wins (deterministic):
  1. **Cursor** (preferred per MCP canonical): spec response contains `next_cursor` / `nextCursor` / `page_token` / `nextPageToken` (case-insensitive).
  2. **Offset**: spec request contains `offset` / `skip` / `start_at` / `startAt`.
  3. **Page-number**: spec request contains `page` AND (`per_page` OR `pageSize` OR `limit`).
  4. **None** (single-shot): no pagination signals — emit `pagination_strategy: "none"`, hide pagination params from `list_*` tool inputSchema.
  Per server, ONE strategy is chosen by majority across `list_*` tools; if a single tool disagrees with the server-wide strategy, override to server-wide and log a `pagination_override` warning in `Pass5Output.flags`. Auto-selected — matches Pass 5 design §1.6.

- **D-09:** **Field filtering categories (frozen in `field_ranking.py`):**
  - **Always include** (default in response): identifiers (`id`, `*_id`, smart_id, foreign keys), status/state (`status`, `state`, `*_status`), primary content (`name`, `title`, `summary`, `description` if ≤ 500 chars), critical timestamps (`created_at`, `updated_at`, `*_at`), required fields per spec.
  - **Opt-in** (only when caller passes `properties=[...]`): verbose nested objects (depth ≥ 2 in spec schema), metadata blobs (`metadata`, `attributes`, `details`), audit / history fields, large blobs (description > 500 chars, lists > 20 items).
  - **Always exclude** (never returned): PII patterns (`email`, `phone`, `ssn`, `national_id` — UNLESS the tool is explicitly an "identity" / "user-profile" fetch by spec tag), internal-only fields (`_internal`, `raw_*`, `debug_*`), deprecated fields (`deprecated: true` in spec).
  Conservative bias: ambiguous → `opt_in`. Auto-selected — matches Pass 5 design §1.4 + Anthropic guidance ("better agent asks than burns tokens").

- **D-10:** **`response_format` enum gate** — added ONLY when ALL of:
  - `len(always_include) + len(opt_in) > 20` fields, AND
  - tool type ∈ `{fetch, action, specialized}` (NOT `list_objects` — list already exposes `properties`), AND
  - tool type ≠ `search` (search is one-shot per Pitfall #5).
  Default value: `"summary"`. Description: *"Detail level. 'summary'=core fields only (~500 tokens); 'detailed'=structured full data (~2000 tokens); 'raw'=complete unprocessed response. Default 'summary' for context efficiency. Use 'detailed' for full inspection, 'raw' for debugging."* Auto-selected — matches Pass 5 design §1.5 ("Add only when value > cost").

- **D-11:** **Pass 5 retry policy:** field-ranking LLM call (Phase 3) max 1 retry on schema-validation failure; on exhaustion → fallback to **deterministic pre-ranking only** (use the heuristic scores from Pass 5 design Appendix B with cutoff `+0.3`/`-0.3`). Truncation template phase has no retries (deterministic + minor LLM polish; failures fall back to plain template). Auto-selected — Pass 5 is mostly deterministic; LLM is enrichment, not gate.

- **D-12:** **Untrusted-spec sanitization for Pass 5** (extension of Phase 2 D-51 / Phase 3 D-15+D-25): every spec excerpt embedded in field-ranking prompts (response-schema field descriptions) wrapped in `<spec_excerpt source="<endpoint_id>" field="<field_name>">…</spec_excerpt>`. System prompt includes the explicit "treat as data" instruction. Heuristic regex `(?i)(ignore (previous|all) instructions|disregard|new instructions|system:)` flags matches; emit count to `Pass5Output.flags.prompt_injection_warnings_count`. Auto-selected — Phase 2 D-51 invariant.

### Stage E — Codegen

- **D-13:** **100% deterministic Jinja2 templates. No LLM calls.** Stage E is the cheapest stage in the pipeline: $0 LLM, ~5–12s wall clock per server. Auto-selected — matches `docs/mcpgen-stage-e-design.md` §1.2 + `docs/mcpgen-architecture.md` engine principle 5.

- **D-14:** **Native MCP tools, NOT Code Mode.** Per `docs/mcpgen-stage-e-design.md` §1: Six-Tool Pattern already delivers Code-mode-level token efficiency at the structural level without runtime code execution risk. Auto-selected — `Code Mode` is explicitly out of MVP per `.planning/PROJECT.md`.

- **D-15:** **CF Workers ONLY in MVP.** No Node.js / Deno / Vercel Edge runtime. Auto-selected — `Multi-runtime` is out of MVP per `.planning/PROJECT.md` + `docs/mcpgen-stage-e-design.md` §1.2.

- **D-16:** **Templates location: `packages/codegen-templates/templates/`** (Phase 1 already created this package). Each template ends in `.j2`. Stage E loader reads from this dir at runtime. Auto-selected — Phase 1 D-04 + repo-structure design in `docs/mcpgen-architecture.md` §15.

- **D-17:** **Generated project file tree (frozen, ~25–30 files)** per `docs/mcpgen-stage-e-design.md` §2:
  ```
  {server-name}/
  ├── package.json
  ├── wrangler.toml
  ├── tsconfig.json
  ├── README.md
  ├── .mcpgen.yaml                          # NEW project config (D-29)
  ├── .gitignore
  ├── src/
  │   ├── index.ts                          # Worker entry point (fetch handler + DNS-rebinding middleware + Sentry beforeSend)
  │   ├── server.ts                         # MCP server initialization + capability negotiation
  │   ├── config.ts                         # static config (server_name template, version, upstream_base_url, mcp_protocol_version)
  │   ├── auth/
  │   │   ├── middleware.ts                 # auth validation + hostHeaderValidation (Pitfall #15)
  │   │   └── credentials.ts                # credential extraction logic per auth_mode
  │   ├── tools/
  │   │   ├── search.ts                     # universal search (OpenAI-compliant)
  │   │   ├── fetch.ts                      # universal fetch (OpenAI-compliant)
  │   │   ├── list_collections.ts
  │   │   ├── list_objects.ts
  │   │   ├── upsert.ts
  │   │   ├── delete.ts
  │   │   ├── action_<name>.ts              # one per action tool
  │   │   ├── workflow_<name>.ts            # one per workflow tool
  │   │   ├── specialized_<name>.ts         # one per specialized tool (rare)
  │   │   └── index.ts                      # registers all tools
  │   ├── runtime/
  │   │   ├── smart_id.ts                   # parse/generate {tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}
  │   │   ├── pagination.ts                 # cursor/offset/page handling per Pass 5 strategy
  │   │   ├── truncation.ts                 # response size + teaching guidance (Pass 5 templates baked in)
  │   │   ├── upstream.ts                   # HTTP client (auth headers, base URL, retry, error mapping)
  │   │   ├── response_shaping.ts           # field filter + format toggle + structuredContent assembly
  │   │   ├── errors.ts                     # error response generation (teaching-template format)
  │   │   ├── capability.ts                 # parse client protocolVersion, gate outputSchema (Pitfall #4)
  │   │   └── sentry_redact.ts              # beforeSend redaction (Pitfall #12)
  │   └── schemas/
  │       ├── inputs.ts                     # Zod input schemas from Pass 3
  │       ├── outputs.ts                    # Zod output schemas from Pass 5 + conservative-format fallback (Pitfall #33)
  │       └── routing.ts                    # routing table from Pass 1 (universal-tool → upstream endpoint)
  └── tests/
      └── smoke.ts                          # MCP Inspector-style invocation tests (5 tools sampled)
  ```
  Total: 28 files for a typical 10-tool server (no specialized tools); 25 for a write-only API; 30 for a 12-tool action-heavy server. Auto-selected — matches Stage E design §2 + Phase 4 success criterion #2.

- **D-18:** **Template inventory (frozen 17 templates)** per `docs/mcpgen-stage-e-design.md` §3:
  - **Project-level (8):** `package.json.j2`, `wrangler.toml.j2`, `tsconfig.json.j2`, `README.md.j2`, `mcpgen.yaml.j2`, `gitignore.j2`, `index.ts.j2`, `server.ts.j2`, `config.ts.j2`.
  - **Per-tool-type (9):** `tool_search.ts.j2`, `tool_fetch.ts.j2`, `tool_list_collections.ts.j2`, `tool_list_objects.ts.j2`, `tool_upsert.ts.j2`, `tool_delete.ts.j2`, `tool_action.ts.j2` (one render per action tool), `tool_workflow.ts.j2` (one render per workflow), `tool_specialized.ts.j2` (one render per specialized).
  - **Runtime/infra (10):** `smart_id.ts.j2`, `pagination.ts.j2`, `truncation.ts.j2`, `upstream.ts.j2`, `response_shaping.ts.j2`, `errors.ts.j2`, `capability.ts.j2` (NEW), `sentry_redact.ts.j2` (NEW), `auth_middleware.ts.j2`, `auth_credentials.ts.j2`.
  - **Schemas (3):** `inputs.ts.j2`, `outputs.ts.j2`, `routing.ts.j2`.
  - **Tests (1):** `tests/smoke.ts.j2`.
  Auto-selected — directly extracted from Stage E design §3.1–§3.3 + Phase 4 pitfall additions (`capability.ts.j2`, `sentry_redact.ts.j2`).

- **D-19:** **Stage E module layout under `apps/generation-engine/src/mcpgen_engine/stages/stage_e/`** (mirrors Pass module structure):
  ```
  stages/stage_e/
    __init__.py            # entry point: async def run(final_tools: List[FinalTool], pass_*_output, raw_ir) -> StageEOutput
    scaffold.py            # Phase 1: scaffold (package.json, wrangler.toml, tsconfig, README, .mcpgen.yaml, .gitignore, index.ts, server.ts, config.ts)
    schemas.py             # Phase 2: schemas/* (inputs.ts, outputs.ts, routing.ts) — Zod 4 + conservative-format fallback
    runtime.py             # Phase 3: runtime/* (smart_id, pagination, truncation, upstream, response_shaping, errors, capability, sentry_redact)
    auth.py                # Phase 4: auth/* (middleware, credentials) per auth_mode
    tools.py               # Phase 5: tools/* (per-tool-type handler renders)
    validate.py            # Phase 6: tsc --noEmit + wrangler deploy --dry-run + bundle-size capture
    template_loader.py     # Jinja2 Environment + StrictUndefined + autoescape disabled (TS code, not HTML)
    output_writer.py       # write files to {MCPGEN_OUTPUT_DIR}/<spec-slug>/ + manifest with sha256 of each file
  ```
  Auto-selected — file-list mirrors pass module patterns; planner has flexibility on internal sub-module boundaries.

- **D-20:** **Stage E 6-phase pipeline** per `docs/mcpgen-stage-e-design.md` §9:
  - **Phase 1 — Scaffold** (~1s): write `package.json`, `wrangler.toml`, `tsconfig.json`, `README.md`, `.mcpgen.yaml`, `.gitignore`, `src/index.ts`, `src/server.ts`, `src/config.ts`.
  - **Phase 2 — Schemas** (~1s): write `src/schemas/inputs.ts` (Pass 3 Zod), `src/schemas/outputs.ts` (Pass 5 Zod + conservative fallback), `src/schemas/routing.ts` (Pass 1 routing).
  - **Phase 3 — Runtime** (~1s): write 8 runtime helpers (incl. NEW `capability.ts` and `sentry_redact.ts`).
  - **Phase 4 — Auth** (~1s): write `src/auth/middleware.ts` (with `hostHeaderValidation` from Pitfall #15) + `src/auth/credentials.ts` per `auth_mode` (passthrough / stored / oauth).
  - **Phase 5 — Tool handlers** (~2–4s for 10 tools): for each tool in `final_tools`, render the appropriate `tool_<type>.ts.j2` template, write to `src/tools/<name>.ts`. Render `src/tools/index.ts` registering all tools.
  - **Phase 6 — Validate** (~3–5s): run `npx tsc --noEmit -p tsconfig.json` from the generated dir + `npx wrangler deploy --dry-run --outdir /tmp` to capture bundle size. `tsc` failure → `STAGE_E_TS_ERROR` with the compile errors fed back into orchestrator (no auto-fix in Phase 4 — surface errors and fail; planner can decide retry strategy in plan-phase). Bundle size ≤ 800KB → pass; 800–950KB → warn (logged in `QualityReport.warnings`); > 950KB → `STAGE_E_BUNDLE_TOO_LARGE` hard fail with `MULTI_SERVER_SPLIT_REQUIRED` suggested splits.
  Auto-selected — matches Stage E design §9.

- **D-21:** **Auth modes — 3 emitters in `auth.py`** per `docs/mcpgen-stage-e-design.md` §5:
  - **Passthrough (default).** Selected when Pass 0 `auth_requirements` ∈ `{apiKey_header, apiKey_query, http_basic, http_bearer_simple}`. Generates `auth/middleware.ts` that reads `X-Upstream-Auth` request header and **does not persist**. UPSTREAM template: `Authorization: Bearer ${X_UPSTREAM_AUTH}` (or `${X_UPSTREAM_AUTH}` raw for Basic). NO crypto code emitted.
  - **Stored.** Selected when Pass 0 `auth_requirements` ∈ `{aws_signature, http_bearer_oauth_token_managed_by_us}` OR user explicitly opts in via `--auth-mode stored` CLI flag. Generates `auth/credentials.ts` with AES-256-GCM helpers reading per-tenant DEK from CF KV binding `TENANT_DEK_KV` (binding declared in `wrangler.toml`). Phase 6 wires the actual KV binding + deploy-time DEK provisioning; Phase 4 emits the template + a smoke test that verifies the binding **name** is correct.
  - **OAuth.** Selected when Pass 0 `auth_requirements` ∈ `{oauth2}`. Generates `auth/middleware.ts` using `@cloudflare/workers-oauth-provider` with PKCE + Logto-managed tokens. `wrangler.toml` declares the `OAUTH_KV` binding. Phase 6 wires the actual Logto tenant + redirect URLs; Phase 4 emits the template + the OAuth-config placeholder.
  Auto-selected — matches Stage E design §5 + Phase 2 D-22 auth `recommended_mode` mapping.

- **D-22:** **`hostHeaderValidation` middleware (Pitfall #15)** is mandatory in EVERY generated `auth/middleware.ts` regardless of `auth_mode`. Allowlist defaults to `["{tenant_short_id}-{spec_slug}.mcpgen.dev"]` with a `<TENANT_PREFIX>` placeholder substituted at Phase 6 deploy time. Custom domains added in Phase 6 via the dispatch Worker. F1 (Phase 5) verifies presence of the middleware call before request handling. Auto-selected — Pitfall #15 mitigation.

- **D-23:** **Sentry `beforeSend` redaction (Pitfall #12)** is mandatory in every generated Worker via `runtime/sentry_redact.ts`. Strips:
  - `X-Upstream-Auth` header (always)
  - `Authorization` header (always)
  - `Cookie` header (always)
  - Every header name appearing in `Pass0Output.auth_requirements[*].header_name` (spec-declared auth headers — passed in via Jinja2 `auth_headers` variable, deduplicated, lowercased)
  - Top-level request/response body keys named `password` / `secret` / `api_key` / `token` (case-insensitive)
  Sentry SDK initialized with `dsn=""` placeholder by default (Phase 9 fills DSNs per `.env`). The redact module is unit-tested via `tests/smoke.ts` to verify a synthetic event with auth headers gets stripped. Auto-selected — Pitfall #12 mitigation.

- **D-24:** **Capability negotiation runtime (Pitfall #4)** in `runtime/capability.ts`:
  ```typescript
  export function gateOutputSchema(clientVersion: string): boolean {
    // returns true if client supports outputSchema (>= 2025-06-18)
    return semver.gte(clientVersion, "2025-06-18");
  }
  ```
  `src/server.ts` parses `params.protocolVersion` during `initialize`, stores it on the session context, and `src/tools/<name>.ts` handlers query `gateOutputSchema(ctx.clientVersion)` before adding `structuredContent` to the response (when false, returns `content` only — backward-compatible degradation). MCP `tools/list` similarly omits `outputSchema` for older clients. Phase 6 dispatch Worker mirrors the same helper for capability-routed dispatching. F3 (Phase 5) covers this with a 2024-protocol mock client. Auto-selected — Pitfall #4 mitigation.

- **D-25:** **Server name template (Pitfall #30):** `src/config.ts` exports:
  ```typescript
  export const SERVER_NAME_TEMPLATE = "{tenant_short_id}-{spec_slug}";  // <TENANT_PREFIX> + spec_slug (e.g., "acme-stripe")
  export const SPEC_SLUG = "{spec_slug}";                                // e.g., "stripe"
  export const MCP_PROTOCOL_VERSION = "2025-06-18";
  ```
  Phase 6 deploy substitutes `{tenant_short_id}` at deploy time; Phase 4 emits the schema-level template with the placeholder intact. Phase 4 fixture test verifies that two synthetic tenants (`tenant_a-stripe` vs `tenant_b-stripe`) produce non-overlapping `server.name`. Auto-selected — extends Phase 2 D-31/D-32 contract.

- **D-26:** **Zod-to-JSON-Schema (Pitfall #33):** Stage E uses Zod 4 native `z.toJSONSchema(schema)` on every output schema AND emits a **conservative fallback** when the generated schema includes `format: "date-time"`, `format: "email"`, `format: "uri"`, or other Zod-format extensions. Conservative fallback = `type: "string"` only, no `format`. Both schemas land in `schemas/outputs.ts` (default export = conservative; named export `richSchema` = Zod-derived). `runtime/response_shaping.ts` returns the conservative variant when serving older clients (per D-24 capability gate). F1 (Phase 5) validates `outputSchema` against MCP's official validator in CI. Auto-selected — Pitfall #33 mitigation.

- **D-27:** **`tsc --noEmit` validation (Phase 6 of Stage E pipeline):** runs `npx tsc --noEmit -p tsconfig.json` from the generated dir. Failure → `STAGE_E_TS_ERROR` raised with the compile output truncated to first 50 errors (subsequent errors logged via Langfuse trace). NO auto-fix in Phase 4 — surface errors for the planner / human investigator to decide retry strategy. **Pre-condition:** generated `package.json` `devDependencies` includes `typescript@^5.6` and `tsc` is reachable via `npx`. Phase 4 plan ships a `tsc-runner.py` helper that mocks the install (uses a hoisted `node_modules` from `packages/codegen-templates/` — pinned across all generations) instead of a fresh `npm install` per call (saves ~30s wall clock). Auto-selected — matches Stage E design §9 phase 6 + cost target $0.

- **D-28:** **`wrangler deploy --dry-run` bundle-size capture (Pitfall #8):**
  ```bash
  npx wrangler deploy --dry-run --outdir /tmp/mcpgen-bundle
  ```
  Captures gzipped bundle size from `wrangler` stdout. Stored in `QualityReport.bundle_size_kb` (NEW field, additive). Soft gate today: `< 800KB` pass, `800-950KB` warn (logged in `QualityReport.warnings`, NOT failed in Phase 4 — F1 hard-blocks at `> 950KB` in Phase 5). `> 950KB` → hard fail in Phase 4 with `STAGE_E_BUNDLE_TOO_LARGE` and a suggested split based on top-level OpenAPI path prefixes (clusters ≥ 30 endpoints become candidate split servers, mirroring Phase 2 D-18 multi-server-split heuristic). Pre-condition: `wrangler` reachable via `npx` (pinned in `packages/codegen-templates/package.json` `devDependencies`); Cloudflare account NOT required for `--dry-run`. Auto-selected — Pitfall #8 mitigation + Phase 4 success criterion #4.

- **D-29:** **`.mcpgen.yaml` project config emitted in every generated repo:**
  ```yaml
  spec_url: "{spec_url}"                          # original input spec
  spec_hash: "{sha256(canonical_spec_json)}"      # for drift watcher comparison
  generated_at: "{ISO timestamp}"
  engine_version: "{semver from pyproject.toml}"
  pipeline_versions:
    pass_0: "{pass_0_version}"
    pass_1: "{pass_1_version}"
    pass_2: "{pass_2_version}"
    pass_3: "{pass_3_version}"
    pass_4: "{pass_4_version}"
    pass_5: "{pass_5_version}"
    stage_e: "{stage_e_version}"
  server_name_template: "{tenant_short_id}-{spec_slug}"
  spec_slug: "{spec_slug}"
  auth_mode: "{passthrough|stored|oauth}"
  mcp_protocol_version: "2025-06-18"
  bundle_size_kb: {captured_bundle_size_kb}        # filled at Stage E phase 6
  tool_count: {N}
  ```
  Used by Phase 8 Drift Watcher (compare `spec_hash` + `pipeline_versions` against current → trigger regen). F1 (Phase 5) verifies all required fields present. Auto-selected — supports Phase 4 success criterion #4 + Phase 8 Drift Watcher (Phase 1 D-03).

- **D-30:** **MCP Inspector verification gate (Success Criterion #5):** Phase 4 wave 5 plan `04-13-PLAN.md` is a **manual** acceptance gate. Steps:
  1. Run `pipeline(stripe.openapi.json)` end-to-end via the engine HTTP API.
  2. CLI emits the generated server tree under `./mcpgen-output/stripe/`.
  3. From inside `./mcpgen-output/stripe/`, run `npm install && npx @modelcontextprotocol/inspector`.
  4. Verify `tools/list` returns 6–12 tools with full descriptions / inputSchemas / annotations / outputSchemas.
  5. Set `X-Upstream-Auth: Bearer ${STRIPE_TEST_KEY}` (test-mode key from operator's Stripe sandbox — never logged), invoke `fetch` with a known smart ID (e.g., `stripe:object:Charge:ch_3ABC...` from a real Stripe test-mode charge created out-of-band).
  6. Verify response shape: `content` array (text representation) AND `structuredContent` object (Pass 5 outputSchema-validated).
  Result: a screenshot/transcript stored under `.planning/phases/04-…/04-13-INSPECTOR-EVIDENCE.md` (mirroring Phase 1's `01-04-SCHEMA-PUSH-EVIDENCE.md` pattern). Auto-selected — matches Phase 4 success criterion #5 + Stage E design §15 G1 (Stripe MCP eval criteria).

- **D-31:** **Generated tool handler templates per tool type** (frozen — see `docs/mcpgen-stage-e-design.md` §4 + Stage E module `tools.py`):
  - **`tool_search.ts.j2`** — single-string `query` param; calls `searchUpstream({query, ...routing_rule})`; truncation per D-07 search threshold; `next_cursor` NEVER mentioned in truncation message (Pitfall #5).
  - **`tool_fetch.ts.j2`** — single-string `id` param; `parseSmartId(id)` → `{server, type, collection, identifier}`; routing table lookup → upstream call; default field filter applied; truncation per D-07 fetch threshold.
  - **`tool_list_collections.ts.j2`** — pattern + include_schema + standard pagination params; iterate over Pass 1 `Routing.collections`; truncation per D-07 list_collections threshold.
  - **`tool_list_objects.ts.j2`** — collection + properties + filter + sort_by + sort_order + pagination; truncation per D-07 list_objects threshold; uses Pass 5 cursor/offset/page-number routing per D-08.
  - **`tool_upsert.ts.j2`** — collection + data (oneOf object | array) + id?/ids?; smart routing (create vs update; single vs batch); truncation per D-07 upsert threshold.
  - **`tool_delete.ts.j2`** — type + id?/ids?/collection? + confirm; `confirm` mandatory for destructive op (matches Pass 4 `destructiveHint=true`); truncation per D-07 delete threshold.
  - **`tool_action.ts.j2`** — per-tool-instantiated; consumes Pass 1 `Action.routing.target_endpoint` + Pass 4 verb-pattern annotations; teaching error templates from Pass 5 design §9 + Stage E design §8.
  - **`tool_workflow.ts.j2`** — per-workflow-instantiated; sequential step execution + partial failure handling (per Stage E design §4.4 — collect successes, surface failures with sub-operation status); conservative aggregation in error templates ("Workflow failed at step 3 of 5; rolling back is NOT performed — use search/fetch to inspect partial state").
  - **`tool_specialized.ts.j2`** — per-tool-instantiated; minimal scaffold around upstream call; rare in practice (Pass 1 emits warning at > 3 specialized tools per server).
  Auto-selected — matches Stage E design §3.2 + §4.

- **D-32:** **Error templates teach the agent next step** (Anthropic principle, per Stage E design §8):
  - 401 / 403: *"Upstream auth failed for this {tool_name}. Verify `X-Upstream-Auth` header is set with a valid {auth_scheme} token; consult the deployed server README for credential setup."*
  - 404: *"Resource not found. The smart ID `{id}` was parsed as `{type}:{collection}:{identifier}`. Use `search()` to locate by query, then `fetch()` with the returned smart ID."*
  - 429: *"Rate-limited by upstream. Retry after {retry_after}s. To reduce request volume, batch operations where possible."*
  - 422 / 400 (validation): *"Upstream rejected the request: {upstream_error}. Common issue: {suggestion based on which param failed validation}."*
  - 500 / 502 / 503 / 504: *"Upstream service error ({status}). The server is temporarily unavailable; retry after {retry_after_default}s."*
  Each template instantiated per tool with the right `{tool_name}` / `{auth_scheme}` / `{type}` substitutions. Auto-selected — matches Stage E design §8 + Anthropic best practices.

### Pipeline orchestration & SSE events

- **D-33:** **`pipeline.py::run_pipeline` extended** to chain Pass 5 → Stage E after Pass 4, BEFORE the `author_complete` terminal event. New status sequence (additive on Phase 3 D-33):
  ```
  A:started → A:completed
  B:started → B:completed (pass_0)
  B:started → B:completed (pass_1)
  C:started → C:completed (pass_2)
  C:started → C:completed (pass_3)
  C:started → C:completed (pass_4)            (partial_result.phase = "author_complete")
  D:started → D:completed (pass_5)            NEW
  E:started → E:completed (stage_e)           NEW
  completed:completed (partial_result.phase = "shape_codegen_complete")
  ```
  `author_complete` continues to be emitted as a sub-status in `C:completed`'s `partial_result.phase` field for backward compatibility with Phase 2/3 CLI. The terminal `partial_result.phase` becomes `shape_codegen_complete` for Phase 4 successful completion. F1/F2/F3 are NOT chained yet (Phase 5 owns that — they continue to emit `deferred` per Phase 2 D-47). Auto-selected — matches `pipeline.py` existing `GenerationStage` literal which already includes `"D"` and `"E"` as valid stages.

- **D-34:** **L1 fast-path expanded value:** L1 cache value now contains `{raw_ir, pass_0_output, pass_1_output, pass_2_output, pass_3_output, pass_4_output, pass_5_output, stage_e_manifest}`. **Note:** the actual generated FILES are NOT in L1 — `stage_e_manifest` contains the per-file `{relative_path, sha256_content_hash, render_template, render_inputs_hash}` table; on L1 hit, Stage E re-renders deterministically (cheap; ~5s) instead of pulling files from cache (would balloon disk usage on multi-tenant workloads). L1 hit emits the full SSE sequence with `partial_result.cache='l1_hit'` on every stage event. L1 key unchanged (`sha256(canonical_spec_json)`). Auto-selected — matches Phase 2 D-37 + GEN-12 contract.

- **D-35:** **L2 cache key extension** for Pass 5: key = `pass_5 + pass_5_version + sha256(pass_4_output_subset) + model_id + sampling_profile_hash + prompt_version`. For Stage E: key = `stage_e + stage_e_version + sha256(final_tools) + template_version`. New `template_version` field in `cache/keys.py` is incremented manually whenever a Jinja2 template changes — bumping invalidates Stage E L2 entries cleanly. Stored at `${MCPGEN_CACHE_DIR}/l2/<pass_or_stage>/<sha-prefix>/<sha-rest>.json.gz`. 30-day filesystem TTL per Phase 2 D-40. Auto-selected — matches Phase 3 D-35 caching design + Pitfall #7 prevention.

- **D-36:** **GEN-12 second-run contract continues** — repeated `pipeline(stripe_spec)` in same process produces ZERO Qwen calls (L1 hit, including Pass 5 field ranking). Phase 4 integration test extends Phase 3's GEN-12 test to assert the `Pass5Output / StageEManifest` are bit-identical between cold + warm runs. Stage E **render output** must also be bit-identical (no timestamps inside generated files except `.mcpgen.yaml` `generated_at` — that ONE field is allowed to differ). Auto-selected — required to maintain Phase 2 D-41 / GEN-12 acceptance.

### CLI behavior change

- **D-37:** **`apps/cli/src/init/render_stub.ts` is RETIRED in Phase 4.** Replaced by `apps/cli/src/init/write_stage_e_output.ts` — pure function that consumes the engine's `StageEOutput` (bytes per file) over the SSE stream and writes them to `./mcpgen-output/<spec-slug>/`. The `tools/call` placeholder body from Phase 2 D-45 / Phase 3 D-37 disappears: real handler bodies arrive in Phase 4 via Stage E codegen.

- **D-38:** **`apps/cli/src/init/render_description.ts` is HOISTED to `packages/codegen-templates/src/render_description.ts`** (Phase 3 Claude's-discretion item; Phase 4 commits the move). Both Stage E Jinja2 (Python side via a thin Python re-implementation) and the CLI write helper consume the same description shape. **Wait** — Stage E is Python-side and Jinja2-templated; rendering markdown from `Description` happens in the Stage E Python `tools.py` helper (not in TS at all). The `apps/cli/src/init/render_description.ts` is removed entirely; its Python equivalent lives in `apps/generation-engine/src/mcpgen_engine/stages/stage_e/render_description.py`. The CLI just writes bytes from the SSE stream. Auto-selected — simplifies architecture, removes CLI-side rendering logic.

- **D-39:** **CLI auto-starts a local engine if not running** continues from Phase 2 D-44 with one extension: on engine spawn, the CLI also pre-warms the `packages/codegen-templates/` `node_modules` directory (runs `pnpm install` once if missing) so the first `tsc --noEmit` invocation from Stage E doesn't take 30+s. Auto-selected — UX continuity from Phase 2 + caching gain.

- **D-40:** **CLI output directory layout (Phase 4):** unchanged top-level path (`./mcpgen-output/<spec-slug>/`); now contains the FULL 25–30-file Stage E output PLUS the per-pass output JSONs from Phase 2/3:
  ```
  ./mcpgen-output/<spec-slug>/
    ├── ir.json                  # full RawIR (Phase 2)
    ├── pass-0-output.json       # tool plans (Phase 2)
    ├── pass-1-output.json       # FinalTool[] from Pass 1 (Phase 2)
    ├── pass-2-output.json       # descriptions (Phase 3)
    ├── pass-3-output.json       # input schemas (Phase 3)
    ├── pass-4-output.json       # annotations + titles (Phase 3)
    ├── pass-5-output.json       # outputSchema + response_config (Phase 4 NEW)
    ├── final-tools.json         # FinalTool[] fully assembled (Phase 4 NEW)
    ├── quality-report.json      # F1 placeholder + Stage E bundle_size_kb (Phase 4 partial)
    ├── package.json             # Stage E generated (Phase 4 NEW — replaces Phase 2 stub)
    ├── wrangler.toml            # NEW
    ├── tsconfig.json            # NEW
    ├── README.md                # NEW (replaces Phase 2 stub README)
    ├── .mcpgen.yaml             # NEW project config
    ├── .gitignore               # NEW
    ├── src/                     # NEW — full src/ tree per D-17
    └── tests/smoke.ts           # NEW
  ```
  Auto-selected — extends Phase 2 D-43 layout.

### Output IR — orchestrator final assembly

- **D-41:** **Phase 4 produces the final assembled `FinalTool[]` array** (the IR shape that downstream Phase 5 Stage F + Phase 6 dispatch consume). Each `FinalTool` = `{name, description, inputSchema, outputSchema, annotations, title, response_config, source_endpoints, routing}`. Pass 5 fills `outputSchema` + `response_config`; assembly happens in `passes/pass_5/final_assembly.py`. The IR `FinalTool` Pydantic model is already defined in `packages/ir/python/types.py` (Phase 1 D-02 / Phase 3 D-39 deferred to here) — Phase 4 only USES it; no IR change needed. Auto-selected — IR is already shaped this way; respects the staged delivery model.

- **D-42:** **Strictly-additive IR field for Phase 4:** `QualityReport` gains `bundle_size_kb: Optional[int] = None` (D-28) and `pipeline_versions: Optional[Dict[str, str]] = None` (D-29). Both nullable — Phase 4 fills them; pre-Phase-4 generations leave them null. Bumped via `packages/ir/src/types.ts` Zod source → CI codegen → `packages/ir/python/types.py`. Auto-selected — strictly-additive, no breaking change to Phase 1/2/3 consumers.

### Validation against Phase-1/2/3 fixtures

- **D-43:** **Phase 4 acceptance test = full pipeline run against all 5 fixtures.** For each of `{stripe, github, notion, linear, slack}/`:
  1. Read `<fixture>/SOURCE.md` → fetch the OpenAPI spec it describes (or use cached spec from Phase 2/3 outputs).
  2. Run `pipeline(spec)` via the engine HTTP API (now reaching `shape_codegen_complete`).
  3. Compare `Pass5Output` to `<fixture>/pass-5-output.json` (NEW Phase-4 hand-tuned reference) for **structural** equivalence — every tool has `outputSchema` (non-empty), pagination strategy is one of `{cursor, offset, page-number, none}`, field filtering categories present, truncation thresholds match D-07 table, `response_format` enum present iff D-10 conditions met. Field ranking text content (LLM-derived `always_include` / `opt_in` / `always_exclude` ordering) does NOT need to match exactly (Qwen non-determinism per Pitfall #7) — just the field-membership sets must match.
  4. Compare `Stage E manifest` to `<fixture>/stage-e-output/MANIFEST.json` (NEW Phase-4 hand-tuned reference) — exact match on relative file paths, tool-template choice per tool, and **structural** equivalence on file-content sha256 (Jinja2 whitespace tweaks tolerated; we hash the output of `prettier --write` over the file before comparing — `prettier` is already in `apps/cli/package.json` deps).
  5. **Stripe + GitHub + Notion fixtures must compile `tsc --noEmit` clean with zero warnings.** Linear + Slack are looser targets (acceptable to have `tsc` warnings; hard errors still block).
  6. **Stripe fixture must pass MCP Inspector verification** per D-30 — manual acceptance step in plan `04-13`.
  7. Snapshot diff failures: Pass 5 (text-bearing) → CI comment, do NOT block (mode-collapse risk per Phase 3 D-41); Stage E manifest (deterministic) → block on diff (any diff is a regression).
  Auto-selected — extends Phase 2 D-54 / Phase 3 D-41 fixture-validation pattern.

- **D-44:** **Hand-tuned `pass-5-output.json` + `stage-e-output/` reference subdirectory in each fixture** added in Phase 4 — Phase 1+2+3 shipped earlier outputs; Phase 4 closes the per-pass-output set. Hand-write by reading each upstream API spec and the Stage E template inventory; ~4 hours per fixture (Stage E manifest is the longest hand-tune — 25-30 file paths + content hashes per fixture). Auto-selected — matches Phase 2 D-55 / Phase 3 D-42 hand-tune pattern.

### Cost & wall-clock budget

- **D-45:** **Per-server cost target (Phase 4 portion):**
  - Pass 5: ~$0.05–0.15 per server (~5 tools out of 10 require Qwen field ranking × ~$0.01–0.03 per tool + tiny truncation polish).
  - Stage E: $0 (deterministic Jinja2; only `tsc --noEmit` + `wrangler dry-run` cost is the local CPU/wall-clock).
  - **Total Phase 4: ~$0.05–0.15 per server**, comfortably within the Phase 2 cost cap ($0.50 free / $2.00 pro per generation). Cumulative end-to-end (Phase 2 + 3 + 4): ~$0.86–1.50 per server with cold caches; $0 with L1 hit.
  - Wall-clock target: ~30–60s for 10-tool server, dominated by Stage E `tsc --noEmit` + `wrangler dry-run` (~20–30s of that wall-clock is npm/node startup overhead — **mitigated** by the `packages/codegen-templates/` pre-warmed `node_modules` per D-39).
  Auto-selected — matches `docs/mcpgen-pass-5-design.md` + `docs/mcpgen-stage-e-design.md` cost sections.

### Engine HTTP API surface (Phase 4 subset of contract)

- **D-46:** **Phase 4 implements `POST /api/v1/generate` Stage A + Pass 0 + Pass 1 + Pass 2 + Pass 3 + Pass 4 + Pass 5 + Stage E.** F1/F2/F3 stages continue to emit SSE events with status `"deferred"` and a `phase: 5` field per Phase 2 D-47 / Phase 3 D-44. New `status` transitions: `pass_5_running → pass_5_complete → stage_e_running → stage_e_complete → shape_codegen_complete`. Auto-selected — extends Phase 2 D-47 / Phase 3 D-44 staged delivery model.

- **D-47:** **Engine HTTP API gains a new endpoint `GET /api/v1/generate/{job_id}/output/{relative_path}`** — streaming download of generated Stage E files. Response: `Content-Type: text/plain; charset=utf-8` (or `application/octet-stream` for binary). Pre-condition: job must be in `shape_codegen_complete` status. Used by the CLI to write files to disk after Stage E completion (avoids embedding all 25-30 files in a single SSE event). Auto-selected — practical ergonomic; SSE-only delivery would balloon event size.

- **D-48:** **No GitHub OAuth / signup / billing in this engine endpoint.** Phase 4 engine is anonymous on localhost. Phase 6 wires Logto. CLI continues to send a generated `X-Idempotency-Key` per call (Phase 2 D-48). Auto-selected — Phase 2 D-48 invariant.

### Pitfalls explicitly mitigated in Phase 4

- **D-49:** **#4 (outputSchema breaking older MCP clients):** D-24 — capability negotiation runtime helper in every Worker; `tools/list` omits `outputSchema` when client `protocolVersion < 2025-06-18`; `tools/call` falls back to `content`-only. F3 (Phase 5) covers with 2024-protocol mock client.
- **D-50:** **#5 (truncation guidance loops):** D-07 — every truncation message includes "usually sufficient" or "only paginate if user explicitly requested all"; `search` truncation NEVER mentions `next_cursor` / `offset`. F3 (Phase 5) golden tasks include 3 satisfiable-with-first-page tasks.
- **D-51:** **#8 (Stage E bundle exceeds 1MB):** D-28 — `wrangler deploy --dry-run` size capture into `QualityReport.bundle_size_kb`; soft gate `< 800KB` pass / `800-950KB` warn / `> 950KB` hard fail with `MULTI_SERVER_SPLIT_REQUIRED`. F1 (Phase 5) hard-blocks.
- **D-52:** **#12 (pass-through credentials leaking into Sentry):** D-23 — `runtime/sentry_redact.ts` strips `X-Upstream-Auth` / `Authorization` / `Cookie` / spec-declared auth headers / common body keys (`password` / `secret` / `api_key` / `token`); unit-tested via `tests/smoke.ts`.
- **D-53:** **#15 (DNS rebinding / origin validation):** D-22 — `hostHeaderValidation` middleware mandatory in EVERY generated Worker regardless of `auth_mode`; allowlist defaults to `{tenant_short_id}-{spec_slug}.mcpgen.dev`. F1 (Phase 5) verifies presence.
- **D-54:** **#30 (server name collision):** D-25 — `server.name` template = `{tenant_short_id}-{spec_slug}`; Phase 6 prepends `{tenant_short_id}-` at deploy; Phase 4 fixture test verifies non-overlap for synthetic tenants.
- **D-55:** **#33 (Zod schema coercion quirks):** D-26 — Zod 4 native `z.toJSONSchema()` PLUS conservative-format fallback (no `format: "date-time"` etc.); both schemas in `schemas/outputs.ts`; runtime serves the conservative variant for older clients. F1 (Phase 5) validates `outputSchema` against MCP's official validator.
- **D-56:** **#28 (long-session context drift):** every plan file under `.planning/phases/04-…/` will start with **"MUST re-read these files first"** header listing canonical refs (per Phase 2 D-61 / Phase 3 D-49). Plan files are written by the planner; Phase 4 plans pre-commit hook enforces the header.
- **D-57:** **#2 (OpenRouter quantization drift):** continues from Phase 2/3 — same `_PROVIDER_ROUTING` + smoke test gate + nightly snapshot regression. Phase 4 PRs run the same gate. Pass 5 field-ranking calls inherit the contract.

### Folded Todos

*None — `gsd-sdk query todo.match-phase 4` returned 0 matches.*

### Claude's Discretion

The planner has flexibility on:
- Exact `wrangler` pinned version (any 4.x release) for `--dry-run` bundle-size capture; verify install works on macos-arm64 first.
- Whether `passes/pass_5/templates.py` truncation-template substitution is `str.format` or `Jinja2` — both acceptable as long as the templates from D-07 are byte-stable.
- Whether `stages/stage_e/template_loader.py` uses `jinja2.FileSystemLoader` or `PackageLoader` — both acceptable; FileSystemLoader is simpler for Phase 4.
- Whether `stage_e/output_writer.py` writes files via `tempfile + os.replace` (atomic) or direct write — both acceptable.
- Whether the per-tool concurrency Semaphore for Pass 5 is module-scoped or pipeline-scoped — both acceptable provided D-06 limits hold.
- Whether `tsc --noEmit` + `wrangler --dry-run` run sequentially or in parallel — sequential is simpler; parallel saves ~2s but adds complexity.
- Specific `tenacity` retry decorator config for Pass 5 LLM calls (backoff factor, jitter) — same defaults as Phase 2/3 (`1s/2s/4s` exponential).
- Whether the `packages/codegen-templates/` `node_modules` is pre-installed via `pnpm install` at engine startup or lazy-installed on first Stage E call — both acceptable; lazy is simpler but adds ~30s to the FIRST generation.
- Sub-module file boundaries within `pass_5/` and `stages/stage_e/` (the file-list in D-04 / D-19 is a recommendation, not a contract).
- Whether the OAuth template uses `@cloudflare/workers-oauth-provider` v0.x or v1.x — verify the latest stable in Phase 4 wave 3; pin in `packages/codegen-templates/package.json`.
- Whether `runtime/upstream.ts` retry policy uses `cf-fetch-with-retry` library or hand-rolled — both acceptable; hand-rolled keeps the bundle smaller.
- Whether `tests/smoke.ts` is rendered per-server or shipped as a static template with placeholders — static template is simpler.
- Whether the conservative-format fallback (D-26) is a separate `outputs.conservative.ts` file or a named export from `outputs.ts` — D-26 prefers the named export, but a separate file is acceptable if it makes runtime selection cleaner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning Phase 4.**

### Source-of-truth conflict resolution order
- `RULES.md` — hard non-negotiable rules.
- `docs/mcpgen-model-and-provider-override.md` — beats every other doc on LLM model / provider / sampling / `extra_body`. Pass 5 design's "Haiku" mentions and Stage E design's any-other-model mentions are stale and overridden.
- `docs/mcpgen-git-workflow-rules.md` — Conventional Commits, atomic commits, NEVER `--no-verify`, pre-commit hooks.
- `docs/mcpgen-gsd-sprint-plan.md` §4.4 (Phase 4 plan breakdown — 13 plans across 5 waves).
- Pass/stage-detail designs (Pass 5, Stage E) — beat v2 summary for their respective areas.
- `docs/mcpgen-generation-engine-v2.md` — pipeline overview.
- `docs/mcpgen-architecture.md` — system context.
- `docs/mcpgen-implementation-plan.md` — launch criteria + kill switches + scope cuts.

### Source of truth for Pass 5
- `docs/mcpgen-pass-5-design.md` (whole doc) — 5 mechanisms (outputSchema / pagination / field filtering / truncation / response_format), per-tool-type defaults, 5-phase pipeline, field importance heuristics (Appendix B), truncation guidance templates (Appendix A).

### Source of truth for Stage E
- `docs/mcpgen-stage-e-design.md` (whole doc) — native MCP tools (NOT Code Mode), 100% deterministic Jinja2 templates, 25-30-file output tree, template inventory (17 templates), per-tool-type handlers, 3 auth modes (passthrough/stored/OAuth), smart-ID + pagination + truncation runtime, error-template-teaches-next-step principle, 6-phase pipeline.

### Source of truth for LLM model + provider routing (Phase 4 unchanged from Phase 2/3)
- `docs/mcpgen-model-and-provider-override.md` §0–4 (model + provider + `extra_body` + sampling profiles) + §8 (Day-1 smoke test).
- `docs/decisions/2026-04-28-quantization-pin-fp8-together.md` — full provider-pin debugging history (the four pivots that landed on `atlas-cloud`/`fp8`/no `require_parameters`).

### Source of truth for caching (Phase 4 extends Phase 2/3 cache layer)
- `docs/mcpgen-generation-engine-v2.md` §5.9 (4-layer caching).
- `RULES.md` §"Cost transparency by design" + §"Caching is first-class".
- `apps/generation-engine/src/mcpgen_engine/cache/` — existing L1/L2/L3 facades from Phase 2; Pass 5 adds `prompt_version` lever; Stage E adds `template_version` lever.

### Source of truth for what Phase 4 must deliver
- `.planning/PROJECT.md` (Constraints + Key Decisions sections + Out of Scope: Code Mode / multi-runtime / LLM-generated examples).
- `.planning/REQUIREMENTS.md` rows GEN-07, GEN-08.
- `.planning/ROADMAP.md` Phase 4 entry — 5 success criteria are the contract.
- `.planning/phases/01-foundation/01-CONTEXT.md` — frozen contracts (D-04 MCP TS SDK pin to `^1.x`, D-08 namespace strategy, D-13 launch-criteria.ts thresholds).
- `.planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md` — frozen contracts (D-03 LLM model, D-04/D-05 extra_body provider routing, D-31 schema-level smart ID, D-37 cache layers, D-47 SSE staged delivery, D-49 module layout, D-51 untrusted-spec sanitization, D-54 fixture validation pattern).
- `.planning/phases/03-generation-engine-author-pass-2-3-4/03-CONTEXT.md` — frozen contracts (D-02 sampling profiles infra, D-04 module layout, D-15 untrusted-spec extension, D-33 SSE event sequence + GenerationStage literal, D-35 L2 cache key with prompt_version, D-37 CLI render_stub extension, D-39 IR `FinalTool` deferred to Phase 4 final assembly).
- `.planning/research/SUMMARY.md` §"Phase 4: Engine Shape & Codegen".
- `.planning/research/PITFALLS.md` #4, #5, #8, #12, #15, #28, #30, #33 in detail (P0 + P1 mitigations Phase 4 owns).
- `.planning/research/STACK.md` §1 (locked stack — Cloudflare Workers + `@modelcontextprotocol/sdk@^1.x` + `@cloudflare/workers-oauth-provider` + Zod 4 + `wrangler` 4.x), §6 (drift to verify).
- `.planning/research/ARCHITECTURE.md` §"Build Order with Dependency Rationale" Phase 4 row.

### Source of truth for fixtures (test surface)
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/SOURCE.md` — upstream OpenAPI URLs.
- `packages/engine-fixtures/{stripe,github,notion,linear,slack}/{ir,pass-0-output,pass-1-output,pass-2-output,pass-3-output,pass-4-output,final-tools,quality-report}.json` — Phase 1+2+3 hand-tuned reference output.
- **NEW Phase 4:** `packages/engine-fixtures/{stripe,github,notion,linear,slack}/{pass-5-output.json, stage-e-output/MANIFEST.json}` — to be hand-tuned in Phase 4 per D-44.

### Source of truth for IR schema (consumed by Phase 4 outputs)
- `packages/ir/python/types.py` — Pydantic types: `Pass5Output`, `StageEManifest`, `FinalTool` (already shipped Phase 1; Phase 4 USES it; Phase 3 D-39 deferred final assembly to here). **Strictly-additive change in Phase 4:** `QualityReport.bundle_size_kb: Optional[int] = None` + `QualityReport.pipeline_versions: Optional[Dict[str, str]] = None` per D-42.
- `packages/ir/src/types.ts` — Zod source of truth (committed Phase 1; codegen runs in CI on changes — D-42 bump goes through this path).

### Source of truth for engine HTTP API
- `packages/contracts/src/generation-api.ts` — endpoint shape, SSE event envelope (frozen Phase 1, `GenerationStage` literal already includes `"D"` and `"E"`; Phase 4 adds `GET /api/v1/generate/{job_id}/output/{relative_path}` per D-47 — strictly-additive endpoint).

### Source of truth for codegen templates
- `packages/codegen-templates/templates/` — Jinja2 templates location (Phase 1 created the package; Phase 4 fills it).
- `packages/codegen-templates/package.json` — pinned `typescript@^5.6` + `wrangler@^4` + `@modelcontextprotocol/sdk@^1.x` + `@cloudflare/workers-oauth-provider` + `zod@^4` (devDependencies hoisted into the generated `node_modules` to avoid per-call npm install).

### Source of truth for CLI surface
- `apps/cli/src/init/` — current Phase-3 stub renderer logic; Phase 4 retires `render_stub.ts` and adds `write_stage_e_output.ts` (D-37).
- `apps/cli/package.json` — pinned deps; Phase 4 adds NO new deps (existing `eventsource-parser` handles the SSE stream + the new `output/` endpoint stream).

### Source of truth for security surface
- `docs/mcpgen-architecture.md` §11 (logging redaction policy — Sentry beforeSend redaction is the runtime expression of this).
- `docs/mcpgen-architecture.md` §14 (secret management).
- Phase 2 D-51/D-52/D-53 — untrusted-spec sanitization continues for Pass 5.
- Pitfalls #12 (pass-through cred leaks) + #15 (DNS rebinding) — Phase 4 implements the runtime mitigations directly.

### Source of truth for sprint sequencing (Phase 4 plans within phase)
- `docs/mcpgen-gsd-sprint-plan.md` §4.4 — 13 plans across 5 waves:
  - Wave 1 (parallel): `04-01` Pass 5 pagination detection / `04-02` Pass 5 outputSchema extraction.
  - Wave 2 (parallel): `04-03` Pass 5 Qwen field ranking / `04-04` Pass 5 truncation templates / `04-05` Pass 5 response_format enum logic.
  - Wave 3 (parallel): `04-06` Stage E scaffold / `04-07` Stage E schemas / `04-08` Stage E runtime / `04-09` Stage E auth middleware.
  - Wave 4: `04-10` Stage E per-tool-type handlers / `04-11` Stage E tsc validation phase.
  - Wave 5: `04-12` E2E pipeline test / `04-13` MCP Inspector manual gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (already shipped Phase 1 + 2 + 3)

- **`apps/generation-engine/src/mcpgen_engine/llm/client.py`** — `MODEL` singleton (Qwen3-Coder via OpenRouter through PydanticAI `OpenAIProvider`). **Single source of truth.** Phase 4 imports nothing new — `MODEL` is reused for every Pass 5 LLM call. Stage E has zero LLM calls.
- **`apps/generation-engine/src/mcpgen_engine/llm/agent_factory.py`** — `make_agent[T: BaseModel](*, output_type, system_prompt) -> Agent[None, T]`. Phase 4 calls `make_agent(output_type=FieldRanking, system_prompt=PASS_5_FIELD_RANKING_PROMPT)` etc. Already supports passing `model_settings` at `.run()` time.
- **`apps/generation-engine/src/mcpgen_engine/llm/sampling.py`** — `PASS_0/1/2/3/4_SETTINGS` + `INLINE_GATE_SETTINGS` already defined with the verified `_PROVIDER_ROUTING`. Phase 4 extends with `PASS_5_SETTINGS` per D-02.
- **`apps/generation-engine/src/mcpgen_engine/pipeline.py`** — `run_pipeline` async generator with frozen Phase-1 SSE envelope. `GenerationStage` literal already includes `"A", "B", "C", "D", "E", "F1", "F2", "F3", "completed", "failed"` — Phase 4 fills in `"D"` and `"E"` events per D-33.
- **`apps/generation-engine/src/mcpgen_engine/cache/`** — `l1.py`, `l2.py`, `l3.py`, `keys.py` already shipped. Phase 4 extends `keys.py` to include `template_version` per D-35; L1 value type expanded per D-34.
- **`apps/generation-engine/src/mcpgen_engine/passes/pass_0/`** + `pass_1/` + `pass_2/` + `pass_3/` + `pass_4/` — Phase 2/3 reference implementations. Phase 4 mirrors structure for `pass_5/` and adds `stages/stage_e/` per D-04 / D-19.
- **`apps/generation-engine/tests/test_smoke_qwen.py`** — Day-1 smoke test (PR gate). Phase 4 PRs run the same gate; no extension needed (the test verifies `MODEL` + `extra_body` forwarding which is what Phase 4 reuses).
- **`apps/generation-engine/tests/conftest.py`** — `_sandbox_env` + `requires_openrouter` marker — used by Phase 4 fixture tests too.
- **`packages/ir/python/types.py`** — Pydantic IR types. **`Pass5Output`, `StageEManifest`, `FinalTool` already defined.** Phase 4 USES them; only adds the strictly-additive `bundle_size_kb` + `pipeline_versions` fields to `QualityReport` per D-42 (Zod source bumped, Python regenerated via CI).
- **`packages/engine-fixtures/{stripe,github,notion,linear,slack}/`** — 8 files per fixture. Phase 4 adds `pass-5-output.json` + `stage-e-output/MANIFEST.json` per D-44.
- **`packages/codegen-templates/`** (Phase 1) — empty package waiting for Phase 4 to fill `templates/*.j2` and pin runtime deps in `package.json`. Per Phase 1 D-04, MCP TS SDK pinned at `^1.x` in this package (and in `packages/runtime-sdk/`).
- **`packages/runtime-sdk/`** (Phase 1) — interface stub used by generated tenant Workers. Phase 4 generated `package.json` declares `@mcpgen/runtime: workspace:*` so generated servers consume the SDK. Phase 6 fills the SDK body; Phase 4 emits the consumer-side import.
- **`apps/cli/src/init/render_stub.ts`** — Phase-3 stub renderer. Phase 4 retires it (D-37) and replaces with `write_stage_e_output.ts`.

### Established patterns from Phase 2 + 3

- **TS Zod is IR source of truth; Python Pydantic generated via codegen.** Strictly-additive IR changes (per D-42) go through `packages/ir/src/types.ts` → CI codegen → `packages/ir/python/types.py`.
- **Conventional Commits, atomic commits, pre-commit hooks mandatory.** Same Phase 2/3 toolchain.
- **`MODEL` singleton + `make_agent` factory + per-pass `*_SETTINGS`** — Phase 4 reuses identically; Pass 5 adds one new `PASS_5_SETTINGS` constant.
- **`_PROVIDER_ROUTING` + `extra_body` at agent factory level** — Phase 4 reuses identical dict; ANY change requires a paired `docs/decisions/` entry.
- **Untrusted-spec sanitization via `<spec_excerpt>` XML wrappers** — applies to Pass 5 field-ranking prompts (D-12). Stage E never sees spec text directly (only structured Pass-output IR), so sanitization is intrinsic.
- **SSE event sequence per stage** — Phase 4 emits Stage D + Stage E events without breaking the wire contract.
- **Per-pass module layout: `passes/pass_N/` with single async `run()` entry point + sibling helper modules** — Phase 4 mirrors for `pass_5/` and `stages/stage_e/`.
- **L2 cache key embeds `pass_name + pass_version + sha256(input) + model_id + sampling_profile_hash + prompt_version`** — Phase 4 extends with `template_version` for Stage E.
- **Fixture-based acceptance: structural equivalence for LLM-text outputs; exact match for deterministic outputs (Pass 4 annotations + Stage E manifest path/template tuples; content tolerated post-prettier).**

### Integration points

- **`packages/contracts/src/generation-api.ts`** — engine SSE envelope; Phase 4 fills in Stage D+E events; adds `GET /api/v1/generate/{job_id}/output/{relative_path}` strictly-additive endpoint per D-47.
- **`packages/engine-fixtures/`** — Phase 4 outputs validated against; future Phase 5 (Stage F) and Phase 6 (Runtime) develop against fixture data while Phase 4 is in flight (Phase 6 in particular consumes the Stage E manifest format directly).
- **`packages/codegen-templates/`** — Phase 4 fills `templates/*.j2` (17 templates per D-18) + pins template-runtime deps in `package.json`.
- **`packages/runtime-sdk/`** — generated tenant Workers import from this; Phase 4 emits the `import` lines; Phase 6 fills the SDK body.
- **`apps/cli/`** — same `./mcpgen-output/<spec-slug>/` directory layout as Phase 2/3, now with the FULL 25-30-file Stage E output replacing the stub server.ts. SSE stream stays the same; new `output/` endpoint is consumed by `write_stage_e_output.ts`.
- **`@modelcontextprotocol/sdk@^1.x`** — Phase 4 generated server uses `server.tool(name, description, schema, handler, { title, annotations })` v1 API + dual `content` + `structuredContent` per MCP 2025-06-18 (gated by capability negotiation per D-24).
- **`@cloudflare/workers-oauth-provider`** — Phase 4 OAuth template imports from this. Pin in `packages/codegen-templates/package.json` to the latest stable.
- **`wrangler` 4.x** — Phase 4 uses `wrangler deploy --dry-run` for bundle-size capture (D-28); generated `wrangler.toml` is consumed by Phase 6 dispatch worker.
- **Langfuse OTel exporter** — every Pass 5 Qwen call produces a trace with `pass_name=pass_5` + `tool_name` + token usage. Stage E generates NO LLM traces (deterministic).
- **Phase 5 + Phase 6** consume the FinalTool[] + Stage E manifest assembled here. Phase 5 (Stage F) operates on the generated TS files (F1 static via `tsc` / `ajv` / `eslint`; F2 smell scan reads description + inputSchema + outputSchema; F3 spawns the generated server). Phase 6 deploys the generated server to a tenant Worker script.

</code_context>

<specifics>
## Specific Ideas

- **The 60-second hero flow upgraded to "<3 minutes" for Phase 4.** `npx mcpgen init https://api.stripe.com/openapi.json` from clean monorepo → working CF Worker project that compiles `tsc --noEmit` clean and loads in MCP Inspector with full `tools/list` + `tools/call` working against Stripe test-mode credentials. Wall-clock target: <3 minutes; 4-minute soft limit; >4 min → CI fails. Cache hit (second run) target ≤30s (Stage E re-renders deterministically from `stage_e_manifest`).

- **Phase 4 is the first phase that emits real code that runs.** Up through Phase 3, `tools/call` was a deterministic placeholder; Phase 4 generates the real handler bodies. This is the point where bugs surface that no fixture test can catch — hence the manual MCP Inspector gate (D-30) is non-negotiable.

- **Stage E is the cheapest stage in the pipeline.** $0 LLM cost; ~5–12s wall clock per server. The complexity is in the templates (Jinja2 + per-tool-type handler generation) and the validation gate (`tsc --noEmit` + `wrangler --dry-run`). Plan accordingly: most of the engineering time is template authoring + the `node_modules` pre-warm trick + fixture hand-tuning.

- **Pre-warmed `node_modules` for `tsc` + `wrangler`** is the single largest Stage E performance win. Without it, every generation pays ~30s of `npm install` overhead before `tsc` runs. Solution: ship `packages/codegen-templates/node_modules/` (gitignored, hoisted via pnpm workspace) with all generation-time deps pinned. Pre-flight check at engine startup: `[ -d packages/codegen-templates/node_modules ] || pnpm install`.

- **`@cloudflare/workers-oauth-provider` version is the riskiest pinned dep in Phase 4.** Pre-1.0; breaking changes likely. Phase 4 wave 3 plan (`04-09`) MUST verify the latest stable on macOS-arm64 + pin it (with a paired `docs/decisions/<date>-oauth-provider-pin.md` entry per Phase 1 D-13's hooks).

- **MCP TS SDK v1 vs v2 — STAY ON v1 per Phase 1 D-04.** v2 introduces breaking API changes (package alias rename, Standard Schema). Phase 4 generated code targets SDK v1 (`^1.x`). **AMENDED (Plan 04-15 / D-4 drainage):** The SDK v1 5-arg `server.tool(name, desc, schema, annotations, cb)` overload is deprecated in SDK v1.6+ and silently DROPS `outputSchema` because the deprecated signature has no parameter for it — confirmed in `mcp.d.ts:117-146`. All 9 per-tool templates now use `McpServer.registerTool(name, config, cb)` — the canonical SDK v1 (1.6+) API that accepts `inputSchema + outputSchema + annotations + description + title + _meta` together via the `config` object (`mcp.d.ts:150-157`). This is NOT a v1→v2 migration: `registerTool` ships in SDK v1 alongside the deprecated `tool()` overloads. See ADR `docs/decisions/2026-04-29-stage-e-registertool-migration.md`. Any future v2 transition (package alias rename, Standard Schema) remains a deliberate post-launch refactor PR with golden-API regression — unchanged intent.

- **Capability negotiation (Pitfall #4) is critical for first-week-of-launch UX.** Older Cursor builds will reject `outputSchema` and silently fail to load tools. The capability gate (D-24) must be live in the generated runtime AND mirrored in Phase 6 dispatch — otherwise we'll get a flood of "tools don't appear" support tickets. Phase 4 ships the runtime gate; Phase 6 mirrors at dispatch.

- **DNS rebinding (Pitfall #15) is non-negotiable per the MCP TS SDK docs.** The generated `auth/middleware.ts` MUST validate `Host` header against the deployed allowlist before any other auth check. Skipping this is a P0 vulnerability — locally-bound MCP clients can be hijacked via DNS rebinding from a malicious web origin.

- **Sentry `beforeSend` redaction (Pitfall #12) is a P0 too.** Pass-through credentials are our primary security model — leaking them into Sentry's logs would be a trust-killer. The `runtime/sentry_redact.ts` module is unit-tested via `tests/smoke.ts` to verify a synthetic event with `Authorization: Bearer sk_live_XXX` gets stripped before send.

- **Bundle-size soft gate vs F1 hard gate.** Phase 4 emits the size into `QualityReport.bundle_size_kb` and warns at 800–950KB; F1 (Phase 5) blocks at >950KB. This split is intentional: Phase 4 is "did the codegen work?"; F1 is "is the artifact deployable?". Don't conflate them.

- **Local fixtures continue to be the dev loop.** Engine on `uvicorn localhost:8000`, fixture comparison in `pytest`, CLI run against localhost — every iteration cycle <60s including `tsc --noEmit`. No CF deploy in Phase 4; no Fly.io deploy in Phase 4; no real-network sandbox calls in Phase 4 EXCEPT the manual MCP Inspector gate (D-30) which uses Stripe **test-mode** credentials.

- **Phase 4 does NOT generate F1/F2/F3-quality output yet.** The generated Stripe MCP can be invoked manually via MCP Inspector, but rule-based + LLM-judge agent eval is Phase 5. Don't burn cycles on quality scoring in Phase 4 — Phase 5 owns it.

- **The `.mcpgen.yaml` project config (D-29) is what makes Drift Watcher (Phase 8) possible.** Without it, comparing "current spec_hash vs generated spec_hash" requires a server-side lookup. Phase 4 ships the file format; Phase 8 implements the cron + diff UI.

- **Truncation guidance is a teaching moment, not just an info-line (Pitfall #5).** Every truncation message bounds the agent's pagination expectations: `search` never invites `next_cursor`; `list_objects` says "usually sufficient" before suggesting pagination; `fetch` says "call again with properties=['*']" rather than "auto-expand all fields." Templates from D-07 are calibrated against the Pass 5 design Appendix A wording.

- **Server name `{tenant_short_id}-{spec_slug}` (Pitfall #30)** is the same template Phase 6 uses for CF Worker script names. Phase 4 emits the schema-level form; Phase 6 substitutes the per-tenant prefix. Do NOT hardcode `{tenant_short_id}` in Phase 4 — it would lock generated servers to a single tenant.

- **Conservative-format Zod fallback (Pitfall #33)** matters for Claude Desktop / Cursor JSON-schema strictness. Some clients reject `format: "date-time"` or interpret it stricter than the spec. The fallback (no `format`, only `type: "string"`) is what older clients see; the rich Zod-derived schema is for newer clients. F1 (Phase 5) validates both against MCP's official validator.

- **Phase 4 introduces zero new product-level features.** The generated server is functionally identical to a hand-written MCP server wrapping the same OpenAPI spec — the Six-Tool Pattern + per-tool annotations + outputSchema + truncation guidance are what make it "MCP-quality" but those decisions were locked in Phases 1–3. Phase 4 is "render the IR into TS that compiles and runs."

</specifics>

<deferred>
## Deferred Ideas

- **Stage F (F1 static + F2 smell scan + F3 agent eval)** — Phase 5. Phase 4 fixture tests verify code compiles and the file tree matches; F2/F3 quality scoring is Phase 5.
- **Real Cloudflare Workers deploy of generated tenant Workers** (`mcpgen deploy` CLI command + Phase 6 dispatch Worker substitution of `{tenant_short_id}-` prefix) — Phase 6.
- **Real OAuth handshake exercised end-to-end (Logto + `@cloudflare/workers-oauth-provider`)** — Phase 6 + Phase 8. Phase 4 emits the OAuth template but does not run an OAuth handshake.
- **Stored-credentials AES-256-GCM with per-tenant DEK in CF KV — exercised end-to-end with key rotation runtime** — Phase 6. Phase 4 emits the template + crypto helpers; Phase 6 wires the actual KV binding + DEK provisioning.
- **Code-mode tool execution** — explicitly out of MVP. Six-Tool Pattern delivers Code-mode-level token efficiency at the structural level.
- **Multi-runtime codegen (Node.js / Deno / Vercel Edge)** — explicitly post-launch. CF Workers only in MVP.
- **Drift Watcher full implementation (daily Inngest cron + diff UI + auto-regenerate)** — Phase 8. Phase 4 ships the `.mcpgen.yaml` project config that Phase 8 reads.
- **Frontend wire-up of Pass 5 / Stage E progress + bundle-size gauge + dropped-endpoints surfacing in preview** — Phase 7 (UI is locked from `claude-design-ui/MCP-Gen.zip`).
- **Stripe Meters + billing + quota enforcement + cost cap** — Phase 8.
- **Sentry DSN filling + Langfuse dashboards + BetterStack uptime monitoring of generated tenant Workers** — Phase 9. Phase 4 wires Sentry SDK with empty DSN.
- **Multi-provider OpenRouter routing (broaden `provider.order` from `["atlas-cloud"]` to a list)** — Phase 5 once F2 between-tool σ ≥ 0.4 discrimination metric is live.
- **Pro toggle "stick to existing description on regen"** (Pitfall #7 follow-up) — Phase 8.
- **R2 cache backend (replace local filesystem)** — Phase 6.
- **Fly.io deploy of engine, secrets vault, multi-region routing** — Phase 10.
- **GraphQL / Postman / AsyncAPI input formats** — explicitly out of MVP per `docs/mcpgen-implementation-plan.md`.
- **Component 6 (Examples) sandbox-derived from real execution traces** — v1.1 sandbox feature, post-MVP. Pass 2 D-11 examples policy continues (`null` or strictly-from-spec).
- **`response_format` enum on every tool** — only added per D-10 conditions; ramp-up to broader application is post-MVP.
- **MCP TS SDK v2 migration** — deliberate post-launch refactor PR with golden-API regression.
- **LLM-polish for tool titles** — Pro post-MVP feature; Phase 4 keeps the deterministic Title Case + verb reordering from Phase 3 D-31.
- **Cross-pass description coherence checks** (Pass 3 param descriptions reference terms from Pass 2 tool description; Pass 5 truncation guidance references universal-tool names from Pass 1) — would land as a Phase 5 F2 sub-check, not Phase 4.
- **Generated server auto-update channel (e.g., `mcpgen update`)** — post-MVP. Drift Watcher (Phase 8) covers the detect-and-notify side.
- **Custom domains for tenant Workers** — explicitly out of MVP per `.planning/PROJECT.md`.

### Reviewed Todos (not folded)
*None — `gsd-sdk query todo.match-phase 4` returned 0 matches.*

</deferred>

---

*Phase: 04-generation-engine-shape-codegen-pass-5-stage-e*
*Context gathered: 2026-04-28*
