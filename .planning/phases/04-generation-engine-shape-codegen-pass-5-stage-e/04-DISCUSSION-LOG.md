# Phase 4: Generation Engine — Shape & Codegen (Pass 5 + Stage E) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 04-generation-engine-shape-codegen-pass-5-stage-e
**Mode:** `--auto` — recommended option auto-selected for every gray area; rationale logged inline in CONTEXT.md.
**Workstream:** `engine`
**Areas discussed:** Pass 5 pipeline · Pass 5 pagination strategy · Pass 5 outputSchema · Pass 5 field filtering · Pass 5 truncation guidance · Pass 5 response_format enum · Stage E codegen approach · Stage E project tree · Stage E auth modes · Stage E DNS-rebinding · Stage E Sentry redaction · Stage E capability negotiation · Stage E server-name template · Stage E Zod-to-JSON-Schema · Stage E TS validation · Stage E bundle-size gate · Stage E `.mcpgen.yaml` · Stage E MCP Inspector gate · Pipeline orchestration · Caching extension · CLI behavior · Output IR final assembly · Fixture validation · Cost & wall-clock budget · Engine HTTP API surface · Pitfall mitigations

---

## Pass 5 — Pipeline structure

| Option | Description | Selected |
|--------|-------------|----------|
| 5-phase pipeline (det pagination → det outputSchema → Qwen field ranking ‖10 → truncation templates → cross-tool validation) | Matches `docs/mcpgen-pass-5-design.md` §4 verbatim | ✓ |
| Single-pass LLM authoring | One Qwen call per tool emits all 5 mechanisms together | |
| Skip LLM entirely (deterministic only) | Heuristic-only field ranking; fastest but worst quality | |

**User's choice:** 5-phase pipeline (auto-recommended).
**Notes:** Mostly deterministic; LLM only for field ranking (~5 of 10 tools) → cheapest LLM-bearing pass.

---

## Pass 5 — Pagination strategy detection

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor preferred → offset → page-number → none (deterministic spec-walk) | MCP canonical preference; auto-detects from response/request shape signals | ✓ |
| Always cursor (synthetic if upstream lacks) | Forces consistency but breaks upstream pagination semantics | |
| LLM picks per server | Adds non-determinism; no quality win | |

**User's choice:** Cursor → offset → page-number → none (auto-recommended).
**Notes:** One strategy chosen per server; outliers logged as `pagination_override` warning.

---

## Pass 5 — outputSchema generation

| Option | Description | Selected |
|--------|-------------|----------|
| Det extraction from spec response schema + universal aggregation via `oneOf` | Per Pass 5 design §1.1 | ✓ |
| LLM-authored outputSchema | High hallucination risk; no win | |
| Skip outputSchema for v0 | Misses MCP 2025-06-18 success criterion #1 — non-starter | |

**User's choice:** Deterministic spec extraction + universal `oneOf` (auto-recommended).

---

## Pass 5 — Field filtering

| Option | Description | Selected |
|--------|-------------|----------|
| 3 categories (always-include / opt-in / always-exclude) with heuristic pre-ranking + Qwen for ambiguous | Per Pass 5 design §1.4 + Anthropic guidance | ✓ |
| Always include everything | Bloats responses; defeats the point | |
| Always opt-in only | Forces every agent call to specify `properties` | |

**User's choice:** 3 categories with heuristic pre-ranking + Qwen for ambiguous (auto-recommended).
**Notes:** Conservative bias when uncertain → `opt_in` (better agent asks than burns tokens).

---

## Pass 5 — Truncation guidance

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tool-type thresholds + Appendix A teaching templates with anti-loop wording | Pass 5 design §3 + Pitfall #5 mitigation | ✓ |
| Hard truncate without guidance | Saves tokens but agent doesn't know why | |
| Per-tool LLM-authored guidance | Adds cost; non-deterministic | |

**User's choice:** Per-tool-type thresholds + Appendix A templates with anti-loop wording (auto-recommended).
**Notes:** "usually sufficient" / "only paginate if user explicitly requested all"; `search` truncation NEVER mentions `next_cursor`.

---

## Pass 5 — `response_format` enum

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional gate — only added when `>20 fields` AND tool ∈ {fetch, action, specialized} | Per Pass 5 design §1.5 ("add only when value > cost") | ✓ |
| Add to every tool | Adds ~50 schema tokens per tool, 90% unused | |
| Skip entirely in MVP | Misses use case for big objects | |

**User's choice:** Conditional gate (auto-recommended).
**Notes:** Default `"summary"`; description verbatim from Pass 5 design §1.5.

---

## Stage E — Codegen approach

| Option | Description | Selected |
|--------|-------------|----------|
| 100% deterministic Jinja2 templates (no LLM) | Per Stage E design §1.2; cheapest stage; reproducible | ✓ |
| LLM-assisted codegen | Higher cost, non-deterministic, harder to debug | |
| Code Mode (runtime code execution) | Out of MVP per `.planning/PROJECT.md` | |
| Hybrid (templates + LLM polish) | Adds cost without measurable quality win | |

**User's choice:** 100% deterministic Jinja2 templates (auto-recommended).

---

## Stage E — Project tree shape

| Option | Description | Selected |
|--------|-------------|----------|
| ~25–30-file tree per Stage E design §2 with src/{auth, tools, runtime, schemas, config} + tests + project root files | Frozen template inventory of 17 templates | ✓ |
| Single-file Worker (`src/index.ts` only) | Unmanageable on 12-tool servers | |
| Per-tool-type-only structure (no shared runtime) | Massive code duplication per tool | |

**User's choice:** Stage E design §2 file tree, ~25–30 files (auto-recommended).

---

## Stage E — Auth modes

| Option | Description | Selected |
|--------|-------------|----------|
| 3 modes: passthrough (default) / stored (AES-256-GCM in CF KV) / OAuth (workers-oauth-provider) | Matches Stage E design §5 + Phase 2 D-22 auth `recommended_mode` mapping | ✓ |
| Pass-through only in MVP | Defers OAuth use cases (Google Calendar, Gmail) — too restrictive | |
| Stored-only (always store credentials server-side) | Increases liability per RULES.md | |

**User's choice:** 3 modes — passthrough default (auto-recommended).
**Notes:** Phase 4 emits all 3 templates; Phase 6 wires the actual CF KV bindings + Logto OAuth tenant.

---

## Stage E — DNS-rebinding mitigation (Pitfall #15)

| Option | Description | Selected |
|--------|-------------|----------|
| `hostHeaderValidation` middleware mandatory in every Worker, allowlist `{tenant_short_id}-{spec_slug}.mcpgen.dev` | MCP TS SDK explicit recommendation; F1 (Phase 5) verifies presence | ✓ |
| Skip in MVP | P0 vulnerability — unacceptable | |
| Optional opt-in | Defaults are dangerous | |

**User's choice:** Mandatory + default allowlist (auto-recommended).

---

## Stage E — Sentry redaction (Pitfall #12)

| Option | Description | Selected |
|--------|-------------|----------|
| Mandatory `runtime/sentry_redact.ts` with `beforeSend` stripping `X-Upstream-Auth`/`Authorization`/`Cookie`/spec-declared auth headers + body keys (`password`/`secret`/`api_key`/`token`) | P0 trust requirement | ✓ |
| Opt-in via flag | Defaults are dangerous | |
| Strip only `X-Upstream-Auth` | Misses spec-declared headers, body credentials | |

**User's choice:** Mandatory + comprehensive redaction (auto-recommended).
**Notes:** Unit-tested via `tests/smoke.ts`.

---

## Stage E — Capability negotiation (Pitfall #4)

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime helper `runtime/capability.ts` parses client `protocolVersion` during `initialize`; `tools/list` omits `outputSchema` for `<2025-06-18` clients | Per Stage E design + Pitfall #4 prevention | ✓ |
| Always emit `outputSchema` | Breaks 2024-spec clients (early Cursor) | |
| Never emit `outputSchema` | Misses MCP 2025-06-18 standard | |

**User's choice:** Runtime gate (auto-recommended).
**Notes:** Phase 6 dispatch Worker mirrors the same gate.

---

## Stage E — Server-name template (Pitfall #30)

| Option | Description | Selected |
|--------|-------------|----------|
| `{tenant_short_id}-{spec_slug}` template with placeholder substituted at deploy time (Phase 6) | Matches Phase 2 D-31 contract | ✓ |
| Hardcoded per-tenant name in Phase 4 | Locks generated server to a single tenant | |
| No prefix; just `{spec_slug}` | Two tenants wrapping Stripe collide on `server.name` | |

**User's choice:** Template with `{tenant_short_id}-` placeholder (auto-recommended).

---

## Stage E — Zod-to-JSON-Schema (Pitfall #33)

| Option | Description | Selected |
|--------|-------------|----------|
| Zod 4 native `z.toJSONSchema()` + conservative-format fallback (no `format: "date-time"`) emitted as named export | Per Stage E design + Pitfall #33 prevention | ✓ |
| Zod-derived only | Some clients reject `format: "date-time"` | |
| Hand-written JSON Schema | Defeats Zod source-of-truth | |

**User's choice:** Zod 4 native + conservative fallback (auto-recommended).
**Notes:** Runtime serves conservative variant for older clients; F1 (Phase 5) validates both.

---

## Stage E — TS validation gate

| Option | Description | Selected |
|--------|-------------|----------|
| `tsc --noEmit` with hoisted `node_modules` from `packages/codegen-templates/`; failure → `STAGE_E_TS_ERROR` | Cheapest reliable check; saves ~30s of `npm install` per call | ✓ |
| `npm install && tsc --noEmit` per call | ~30s overhead per generation | |
| Skip TS validation | Generated code might not compile; success criterion #2 violated | |

**User's choice:** Hoisted `node_modules` + `tsc --noEmit` (auto-recommended).

---

## Stage E — Bundle-size gate (Pitfall #8)

| Option | Description | Selected |
|--------|-------------|----------|
| `wrangler deploy --dry-run` size capture; <800KB pass / 800-950KB warn / >950KB hard fail with `MULTI_SERVER_SPLIT_REQUIRED` | Captures real bundle behavior; F1 (Phase 5) hard-blocks | ✓ |
| Estimate from file count | Wildly inaccurate (gzip ratio varies) | |
| Skip in Phase 4, defer to F1 | Late detection — fails after `tsc` passes | |

**User's choice:** `wrangler --dry-run` capture + soft gate (auto-recommended).
**Notes:** Phase 4 soft-warns; F1 (Phase 5) hard-blocks at >950KB.

---

## Stage E — `.mcpgen.yaml` project config

| Option | Description | Selected |
|--------|-------------|----------|
| Emit per-server with `spec_url` / `spec_hash` / `pipeline_versions` / `auth_mode` / `bundle_size_kb` etc. | Enables Phase 8 Drift Watcher; F1 verifies fields present | ✓ |
| Skip in MVP | Drift Watcher (Phase 8) needs server-side lookup instead | |
| Embed config in `wrangler.toml` | Wrangler doesn't validate custom keys; less portable | |

**User's choice:** Emit `.mcpgen.yaml` (auto-recommended).

---

## Stage E — MCP Inspector verification gate (Success Criterion #5)

| Option | Description | Selected |
|--------|-------------|----------|
| Manual gate plan `04-13-PLAN.md` — Stripe MCP loaded into MCP Inspector + `fetch` invoked with test-mode credentials; transcript stored as evidence | Matches Phase 1 evidence-doc pattern (`01-04-SCHEMA-PUSH-EVIDENCE.md`) | ✓ |
| Automated MCP Inspector E2E in CI | Inspector binary not designed for headless CI; brittle | |
| Skip — defer to F3 (Phase 5) | Misses success criterion #5; first manual smoke is cheap | |

**User's choice:** Manual gate with evidence file (auto-recommended).

---

## Pipeline orchestration & SSE events

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `pipeline.py::run_pipeline` to chain Pass 5 + Stage E; emit `D:started/completed` (Pass 5) + `E:started/completed` (Stage E); terminal `shape_codegen_complete` | Matches existing `GenerationStage` literal that already includes `"D"` and `"E"` | ✓ |
| Separate `run_stage_d` and `run_stage_e` functions | Adds wire-contract complexity | |
| Single `Phase 4` SSE event | Loses per-pass progress visibility | |

**User's choice:** Extend `run_pipeline` (auto-recommended).
**Notes:** `author_complete` retained as sub-status for backward compat.

---

## Caching extension

| Option | Description | Selected |
|--------|-------------|----------|
| L1 expanded value (incl. `pass_5_output` + `stage_e_manifest`); L2 with `prompt_version` (Pass 5) + `template_version` (Stage E); Stage E re-renders from manifest on L1 hit | Matches Phase 2 D-37 + GEN-12 contract | ✓ |
| Cache generated files in L1 directly | Balloons disk usage; redundant with deterministic Jinja2 | |
| Skip caching for Stage E | Loses GEN-12 second-run guarantee | |

**User's choice:** Manifest-based caching (auto-recommended).

---

## CLI behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Retire `render_stub.ts`; new `write_stage_e_output.ts` consumes engine's `output/{path}` endpoint and writes 25-30 files; pre-warms `node_modules` on engine spawn | Phase 3 stub no longer needed | ✓ |
| Keep `render_stub.ts` as fallback when Stage E fails | Adds branching complexity; prefer hard fail | |
| Stream all 25-30 files in a single SSE event | Balloons SSE event size beyond practical limit | |

**User's choice:** New `write_stage_e_output.ts` + new HTTP endpoint (auto-recommended).

---

## Output IR final assembly

| Option | Description | Selected |
|--------|-------------|----------|
| Pass 5 final-assembly module produces `FinalTool[]`; strictly-additive IR additions (`bundle_size_kb`, `pipeline_versions` on `QualityReport`) | IR `FinalTool` already shipped Phase 1; Phase 4 just USES it | ✓ |
| Define new `Phase4Tool` shape | Duplicates existing IR | |
| Skip final assembly; let Stage F (Phase 5) assemble | Stage F can't validate without assembled FinalTool[] | |

**User's choice:** Final assembly in Pass 5 + strictly-additive IR (auto-recommended).

---

## Fixture validation

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-tune `pass-5-output.json` + `stage-e-output/MANIFEST.json` per fixture; structural equivalence for LLM-text outputs (field ranking) + post-prettier hash for Stage E files; Stripe + GitHub + Notion must compile `tsc --noEmit` clean | Matches Phase 2 D-54 / Phase 3 D-41 | ✓ |
| Exact byte-match for all generated files | Jinja2 whitespace tweaks would block | |
| Skip fixture validation in Phase 4 | Lose regression coverage | |

**User's choice:** Hand-tune + post-prettier hash (auto-recommended).

---

## Cost & wall-clock budget

| Option | Description | Selected |
|--------|-------------|----------|
| Pass 5 ~$0.05–0.15 + Stage E $0; total Phase 4 ~$0.05–0.15 per server; wall-clock ~30–60s | Matches `docs/mcpgen-pass-5-design.md` + `docs/mcpgen-stage-e-design.md` cost sections | ✓ |
| Tighter budget (<$0.05) | Forces dropping field-ranking LLM call, hurts quality | |
| Looser budget (~$0.30) | No win — Pass 5 is structurally cheap | |

**User's choice:** Match design-doc budget (auto-recommended).

---

## Engine HTTP API surface

| Option | Description | Selected |
|--------|-------------|----------|
| `POST /api/v1/generate` extended through `shape_codegen_complete`; new `GET /api/v1/generate/{job_id}/output/{relative_path}` for file download | Strictly-additive endpoint; SSE-only would balloon | ✓ |
| Embed all generated files in SSE final event | Single event size > 5MB on big servers | |
| Tar/zip archive download | Adds compression library; no win for ~25-30 files | |

**User's choice:** Streaming `output/{path}` endpoint (auto-recommended).

---

## Pitfall mitigations

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 owns: #4 (capability negotiation), #5 (truncation guidance bounds), #8 (bundle-size gate), #12 (Sentry redaction), #15 (DNS rebinding), #30 (server-name uniqueness), #33 (Zod-to-JSON-Schema fallback) | Matches ROADMAP.md Phase 4 entry | ✓ |
| Defer #4 / #5 to Phase 5 (Stage F) | Late detection; first-week-of-launch UX risk | |
| Defer #15 to Phase 6 (dispatch worker) | DNS rebinding is per-Worker; defaults must ship in Phase 4 | |

**User's choice:** Phase 4 owns the listed pitfalls (auto-recommended).

---

## Claude's Discretion

The planner has flexibility on (transferred to CONTEXT.md):
- Exact `wrangler` 4.x patch version pinned in `packages/codegen-templates/package.json`
- Whether truncation-template substitution uses `str.format` or Jinja2
- Whether `template_loader.py` uses `FileSystemLoader` or `PackageLoader`
- Whether `output_writer.py` uses `tempfile + os.replace` or direct write
- Whether Pass 5 Semaphore is module-scoped or pipeline-scoped
- Whether `tsc --noEmit` + `wrangler --dry-run` run sequentially or in parallel
- `tenacity` retry decorator config for Pass 5 LLM calls
- Whether `node_modules` pre-warm is at engine startup or lazy on first Stage E call
- Sub-module boundaries within `pass_5/` and `stages/stage_e/`
- `@cloudflare/workers-oauth-provider` v0.x vs v1.x pin (Phase 4 wave 3 verifies)
- Whether `runtime/upstream.ts` retry uses a library or hand-rolled
- Whether `tests/smoke.ts` is per-server or static template
- Whether conservative-format Zod fallback is a separate file or named export

## Deferred Ideas

(Transferred to CONTEXT.md — full list there.) Highlights:
- Stage F (F1/F2/F3) → Phase 5
- Real CF Workers deploy → Phase 6
- Real OAuth handshake → Phase 6 + 8
- Stored-credentials AES-256-GCM end-to-end → Phase 6
- Code Mode / multi-runtime → out of MVP
- Drift Watcher full implementation → Phase 8
- Sentry DSN filling → Phase 9
- Multi-provider OpenRouter → Phase 5
- MCP TS SDK v2 migration → post-launch
