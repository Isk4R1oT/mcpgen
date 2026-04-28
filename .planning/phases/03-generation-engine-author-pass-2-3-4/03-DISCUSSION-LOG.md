# Phase 3: Generation Engine — Author (Pass 2 + 3 + 4) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 03-generation-engine-author-pass-2-3-4
**Mode:** `--auto` (recommended option selected for every gray area, no interactive questioning)
**Areas discussed:** Sampling profiles & agent factory · Module layout · Pass 2 description authoring · Pass 2 inline quality gate · Pass 3 parameter specification · Pass 3 cross-parameter validation · Pass 4 annotations inference · Pipeline orchestration & SSE · L1/L2 cache extension · CLI server.ts stub regeneration · IR assembly · Fixture validation · Pitfall mitigations (#7, #10, #28, #31)

---

## Sampling profiles & agent factory

| Option | Description | Selected |
|---|---|---|
| Reuse Phase 2 `agent_factory.make_agent` + extend `sampling.py` with new profiles | Single MODEL singleton, four new `*_SETTINGS`, identical `_PROVIDER_ROUTING` (atlas-cloud/fp8). Pitfall #2 mitigation continues to apply. | ✓ |
| Build a new "authoring" factory layered on top with cache_control headers | Extra abstraction; would require touching `agent_factory.py` for an unproven gain. | |
| Per-pass model selection (Sonnet / Haiku per pass-detail design) | Stale per `mcpgen-model-and-provider-override.md` — Qwen3-Coder is the only legal model. | |

**User's choice (auto):** Reuse `agent_factory.make_agent`, extend `sampling.py` with `PASS_2_SETTINGS` (T=0.3) / `PASS_3_SETTINGS` (T=0.2) / `PASS_4_SETTINGS` (T=0.0) / `INLINE_GATE_SETTINGS` (T=0.0). All carry the verified `extra_body=_PROVIDER_ROUTING`.
**Notes:** Captured as D-01 / D-02 / D-03.

---

## Module layout for Pass 2/3/4

| Option | Description | Selected |
|---|---|---|
| Mirror Phase 2 `passes/pass_0/` + `passes/pass_1/` structure (one dir per pass, `run()` entry point + sibling helpers) | Consistent with the Phase 2 reference; planner has flexibility on internal sub-module boundaries. | ✓ |
| Single `passes/author/` module with sub-functions per pass | More cohesion, but breaks the "Stage = retry boundary" principle and complicates SSE event emission per pass. | |
| Move all Pass 2/3/4 logic into `pipeline.py` directly | Violates Phase 2 D-50 (per-pass single-purpose async `run()` modules). | |

**User's choice (auto):** Mirror Phase 2 layout — `passes/pass_2/`, `passes/pass_3/`, `passes/pass_4/` each with single async `run()` + sibling helpers.
**Notes:** Captured as D-04 / D-05.

---

## Pass 2 — Description authoring (prompt templates, length budgets, examples policy, retry policy, description-diff)

| Option | Description | Selected |
|---|---|---|
| Per-tool-type prompt templates (4 cached system prompts) + per-type length budgets + examples-only-from-spec + Pitfall #7 description-hash persistence | Matches `docs/mcpgen-pass-2-design.md` §3 / §11 / §1.3 directly. Pitfall #7 + #10 mitigations baked in. | ✓ |
| Single generic prompt + per-tool length budget passed as parameter | Loses the type-specific framing that drives the +5.85pp accuracy finding. | |
| LLM-generated examples (Component 6) in v0 | Forbidden by Pitfall #10 + Pass 2 design §1.3. Examples deferred to v1.1 sandbox. | |
| Skip description-hash persistence in Phase 3 | Pitfall #7 explicitly assigned to Phase 3 in ROADMAP — must mitigate. | |

**User's choice (auto):** Per-type templates + budgets per D-07 table + examples = `null` OR strictly from spec + `description_hash` persisted via additive IR field.
**Notes:** Captured as D-06 / D-07 / D-11 / D-14. Pitfall #10 retry-prompt invariant (D-12) is mandatory across all retries.

---

## Pass 2 — Concurrency & retry policy

| Option | Description | Selected |
|---|---|---|
| Concurrency 10 per Pass 2 design + max 2 retries per tool (length / forbidden / inline-gate combined) | Matches design § 4 + cost cap policy. | ✓ |
| Concurrency 20 (matches Pass 3) | AtlasCloud rate-limit risk; Pass 2 LLM call is heavier than Pass 3 per-param call. | |
| Unlimited retries until inline-gate passes | Cost blow-out risk; Phase 5 F2 catches remaining quality issues. | |

**User's choice (auto):** Concurrency 10, max 2 retries per tool.
**Notes:** Captured as D-08 / D-13.

---

## Pass 2 — Inline quality gate

| Option | Description | Selected |
|---|---|---|
| Single Qwen judge per tool, abbreviated 4-component rubric, threshold ≥3, 1 retry | Matches Pass 2 design §9 + override doc (Qwen replaces Haiku). | ✓ |
| Multi-judge ensemble at this stage | Premature — F2 in Phase 5 owns the multi-judge / shuffle-averaging machinery. | |
| Skip inline gate; rely on F2 only | Loses the "good enough" filter; F2 retries become more expensive. | |

**User's choice (auto):** Single Qwen judge, abbreviated rubric, threshold ≥3.
**Notes:** Captured as D-09. Uses `INLINE_GATE_SETTINGS` (temp 0.0).

---

## Pass 2 — Forbidden-pattern enforcement

| Option | Description | Selected |
|---|---|---|
| Regex catalogue (marketing / filler / tautology / vague) with retry-on-match (max 2) + post-retry re-check | Matches Pass 2 design + RULES.md §2.6. Pitfall #10 prevention. | ✓ |
| LLM-judge instead of regex | Cost; deterministic regex is sufficient for these well-known patterns. | |
| Soft warnings only (no retry) | Quality bar drops below the "5-of-6 paper rubric" target. | |

**User's choice (auto):** Regex catalogue + retry + post-retry re-check.
**Notes:** Captured as D-10 / D-12.

---

## Pass 3 — Parameter specification (4-phase pipeline + concurrency)

| Option | Description | Selected |
|---|---|---|
| 4 phases (det extract → LLM enrichment ‖20 → cross-param validation → inline gate ‖10) per Pass 3 design §5 | Matches the design; ~70% of work is deterministic. | ✓ |
| Single LLM call per tool (return all params at once) | Loses the "per-parameter parallel" cost model (~$0.20–0.40 per server). | |
| Skip cross-parameter validation | Misses uniqueness / mutual-exclusivity / JSON Schema validity bugs. | |

**User's choice (auto):** 4-phase pipeline per design.
**Notes:** Captured as D-16 / D-17 / D-23. Per-parameter concurrency 20 is across the entire pass (not per tool).

---

## Pass 3 — Filter design selection

| Option | Description | Selected |
|---|---|---|
| Deterministic per-server selection rule (A structured object / B DSL / C individual) — DEFAULT A | Matches Pass 3 design §4 decision tree; mandates consistency across all `list_objects` tools in one server. | ✓ |
| LLM judge per tool decides filter approach | Per-tool drift → mixed approaches → confused agent. | |
| Always Approach A regardless of API | Wrong choice for GraphQL/SQL-native APIs (Approach B is correct there). | |

**User's choice (auto):** Deterministic decision tree per D-18 with consistency-across-tools invariant.
**Notes:** Captured as D-18.

---

## Pass 3 — Naming normalization

| Option | Description | Selected |
|---|---|---|
| Post-LLM deterministic transform table | Predictable; LLM sees original spec names; transform happens after enrichment; description text auto-updated. | ✓ |
| In-prompt rules (LLM applies normalization itself) | Inconsistent across tools; mode-collapse risk on edge cases. | |
| No normalization (preserve spec naming) | Violates 84.3% Opaque Parameters smell mitigation. | |

**User's choice (auto):** Post-LLM transform table per D-19.
**Notes:** Captured as D-19.

---

## Pass 3 — Smart-ID pattern emission

| Option | Description | Selected |
|---|---|---|
| Auto-generate from Pass 1 `Routing.smart_id_schema`, deterministic, schema-level only (no tenant prefix) | Phase 6 dispatch / Phase 4 Stage E template inject the tenant prefix at deploy. Phase 2 D-31 contract intact. | ✓ |
| Generate full pattern including tenant prefix at this layer | Tenant identity is unknown at generation time; would force tenant-bound generation. | |
| Trust LLM to generate the pattern from spec | Hallucination risk; deterministic is correct here. | |

**User's choice (auto):** Auto-gen schema-level pattern; tenant prefix at deploy.
**Notes:** Captured as D-20.

---

## Pass 3 — Standard parameter sets (universal tools)

| Option | Description | Selected |
|---|---|---|
| Frozen standard sets per Pass 3 Appendix A — `search(query)` / `fetch(id)` / `list_*` / `upsert` / `delete` | OpenAI-compliance for `search`/`fetch` (Pitfall #32); cross-server consistency on `limit`/`offset`/`cursor` etc. | ✓ |
| Per-spec custom param sets | Breaks ChatGPT Deep Research compatibility (Pitfall #32) and confuses agents across servers. | |

**User's choice (auto):** Frozen standard sets per D-21.
**Notes:** Captured as D-21. `additionalProperties: false` always set per D-22.

---

## Pass 3 — Inline quality gate + Pitfall #10 retry invariant

| Option | Description | Selected |
|---|---|---|
| Single Qwen judge per tool, parameter-specific 5-component rubric, threshold ≥3, 1 retry; retry prompt re-includes example-safety policy | Matches Pass 3 design §10 + Pitfall #10 mitigation. | ✓ |
| Skip inline gate | Hallucinated example values reach output unchecked. | |

**User's choice (auto):** Single Qwen judge with example-safety re-check on retry.
**Notes:** Captured as D-24 / D-25.

---

## Pass 4 — Annotations inference (3-phase pipeline)

| Option | Description | Selected |
|---|---|---|
| 3 phases (det rules + verb patterns → selective LLM judgment → consistency validation) per Pass 4 design §5 | 80% deterministic, LLM only for `_needs_llm_review` edge cases (~0–3 tools/server). Cheapest pass. | ✓ |
| LLM judgment on every tool | Wasteful — boolean classification, deterministic rules cover the vast majority. | |
| No LLM at all (pure deterministic) | Misses ambiguous action verbs (`_send`, `_lock`, `_publish`). | |

**User's choice (auto):** 3-phase pipeline per design.
**Notes:** Captured as D-26.

---

## Pass 4 — `openWorldHint=true` invariant

| Option | Description | Selected |
|---|---|---|
| Enforced at IR level via `Annotations.openWorldHint: Literal[True]` (already locked); Pass 4 modules never set the field | Cannot be circumvented; serialization fails on attempted override. | ✓ |
| Pass 4 sets the field per-tool with a check | Defensive but redundant — IR contract already prevents the bug. | |

**User's choice (auto):** IR-level invariant continues; Pass 4 doesn't touch the field.
**Notes:** Captured as D-27.

---

## Pass 4 — Tool-type rules + verb patterns + workflow aggregation

| Option | Description | Selected |
|---|---|---|
| Tool-type rules (D-28 table) + verb patterns (D-29 Appendix B) + workflow conservative aggregation (D-30: AND/OR/AND) | Matches Pass 4 design §3 verbatim. | ✓ |
| HTTP method-based rules (old v2 approach) | Stale per pass-4 design; tool-type categorization is more accurate. | |
| Optimistic workflow aggregation (any sub being readOnly → workflow readOnly) | UX safety violation; creates surprise destructive workflows. | |

**User's choice (auto):** Tool-type + verb patterns + conservative workflow aggregation.
**Notes:** Captured as D-28 / D-29 / D-30.

---

## Pass 4 — Title generation

| Option | Description | Selected |
|---|---|---|
| Deterministic snake_case → Title Case + verb reordering for actions (D-31) | Cheap, predictable; LLM-polish is Pro post-MVP. | ✓ |
| LLM-polish per title in v0 | Wasted cost for marginal quality gain. | |
| Use raw `name` as title | Looks unfinished in MCP Inspector. | |

**User's choice (auto):** Deterministic title generation per D-31.
**Notes:** Captured as D-31.

---

## Pass 4 — Cursor confirmation invariant (Pitfall #31)

| Option | Description | Selected |
|---|---|---|
| Phase 3 verifies IR shape (every read tool has `readOnlyHint=true` AND `openWorldHint=true`); Phase 5 F3 client-mock verifies actual Cursor behavior | Right-sized for Phase 3 — runtime verification is F3's job. | ✓ |
| Add a Cursor mock client now | Phase 5 F3 owns this; premature in Phase 3. | |

**User's choice (auto):** IR-shape verification only in Phase 3.
**Notes:** Captured as D-32 / D-48.

---

## Pipeline orchestration & SSE event sequence

| Option | Description | Selected |
|---|---|---|
| Extend `pipeline.py::run_pipeline` with Stage C (Pass 2 → Pass 3 → Pass 4) before terminal `completed` event; new `partial_result.phase = "author_complete"` (preserves `architect_complete` as sub-status) | `GenerationStage` literal already accepts `"C"`; no contract change needed. | ✓ |
| Replace `architect_complete` outright | Breaks Phase-2 CLI; backward compatibility matters during the migration. | |
| Spawn Pass 2/3/4 as separate jobs | Loses the unified SSE stream; CLI / frontend would need re-architecting. | |

**User's choice (auto):** Extend orchestrator inline per D-33.
**Notes:** Captured as D-33 / D-44.

---

## L1 / L2 cache extension

| Option | Description | Selected |
|---|---|---|
| L1 value expanded to include Pass 2/3/4 outputs; L2 keys add `prompt_version` | Maintains GEN-12 zero-LLM second-run contract; clean prompt-bump invalidation. | ✓ |
| New L4 cache layer for Pass 2/3/4 | L4 (Anthropic prompt caching) is unavailable for Qwen via OpenRouter; dead path. | |
| No cache extension (re-run Pass 2/3/4 every time) | Breaks Phase 2 D-41 / GEN-12 contract. | |

**User's choice (auto):** L1 value expansion + L2 `prompt_version` per D-34 / D-35.
**Notes:** Captured as D-34 / D-35 / D-36.

---

## CLI server.ts stub regeneration

| Option | Description | Selected |
|---|---|---|
| `render_stub.ts` consumes Pass 2/3/4 outputs to emit `server.tool(name, description, schema, handler, { title, annotations })` with deterministic placeholder body | Stage E in Phase 4 will fill real handler bodies; Phase 3 stub already passes MCP Inspector tools/list quality bar. | ✓ |
| Wait until Stage E (Phase 4) to update render_stub | Loses the "see your descriptions in MCP Inspector immediately" feedback loop. | |
| Generate real handler bodies via inline ad-hoc TypeScript | Stage E is the codegen owner; ad-hoc generation here would diverge. | |

**User's choice (auto):** Extend `render_stub.ts` per D-37; `tools/call` placeholder unchanged.
**Notes:** Captured as D-37 / D-38.

---

## IR assembly — Phase 3 outputs vs full Tool

| Option | Description | Selected |
|---|---|---|
| Emit `Pass2Output + Pass3Output + Pass4Output + AuthoredTools` separately; full `Tool` array assembled in Phase 4 (after Pass 5 fills `outputSchema` + `response_config`) | Respects the staged delivery model + IR shape. | ✓ |
| Assemble partial `Tool` objects in Phase 3 with placeholder `outputSchema={}` and `response_config=phase_3_placeholder` | Adds a pseudo-state to the IR that Phase 4 has to clean up. | |

**User's choice (auto):** Emit pass outputs separately per D-39 / D-40.
**Notes:** Captured as D-39 / D-40. One additive IR field: `Descriptions.description_hash: Optional[str] = None`.

---

## Fixture-based validation strategy

| Option | Description | Selected |
|---|---|---|
| Hand-tune `pass-2-output.json` + `pass-3-output.json` + `pass-4-output.json` per fixture; structural+budget equivalence for Pass 2/3 (text-bearing); exact match for Pass 4 (deterministic) | Matches Phase 2 D-54 / D-55 pattern; right-sized acceptance. | ✓ |
| Exact-text match for all three passes | Breaks on Qwen non-determinism (Pitfall #7); 3 consecutive nightly fails would block constantly. | |
| No per-pass fixture references | Loses regression detection signal. | |

**User's choice (auto):** Per-pass hand-tune + structural-vs-exact distinction per D-41 / D-42.
**Notes:** Captured as D-41 / D-42. Snapshot diff failures = CI comment for Pass 2/3, block on Pass 4.

---

## Pitfall mitigations explicitly owned by Phase 3

| Pitfall | Mitigation (selected) |
|---|---|
| **#7 description drift** | Persist `description_hash` per tool (additive IR field); CLI surfaces "N of M changed" since last gen; Langfuse logs diff metadata; full diff UI Phase 7; Pro toggle Phase 8. (D-14, D-46) |
| **#10 hallucinated examples via retry** | Examples = `null` or strictly from spec; retry prompts re-include forbidden-pattern + examples policy; validation re-runs after every retry; example-safety regex on Pass 3 retries. (D-11, D-12, D-24, D-47) |
| **#28 long-session context drift** | Plan files start with "MUST re-read these files first" header listing canonical refs; pre-commit hook enforces. (D-49) |
| **#31 Cursor confirmation** | Pass 4 emits explicit `readOnlyHint=true` for read tools; Phase 3 fixture test verifies IR shape; Phase 5 F3 verifies Cursor runtime. (D-32, D-48) |
| **#2 OpenRouter quantization drift** | Continues from Phase 2 — same `_PROVIDER_ROUTING` + smoke test + nightly snapshot; Phase 3 PRs run the gate. (D-50) |

**Notes:** Captured as D-46 through D-50.

---

## Claude's Discretion (areas explicitly left for the planner)

- `tiktoken` version pin / fallback to char-count for length budgets.
- Internal organization of `forbidden.py` regexes (single big regex vs per-pattern compiled set).
- `extract.py` traversal strategy (recursive vs flatten upfront).
- PydanticAI `output_type` vs raw JSON parse in `pass_4/llm_judge.py`.
- Whether `render_description.ts` lives in CLI or hoisted to `packages/codegen-templates/` early.
- Exact retry decorator config (`tenacity` backoff factor, jitter).
- Per-tool concurrency Semaphore scope (module vs pipeline).
- CLI rendering style for description-diff output.

---

## Deferred Ideas (noted for later phases)

- Pass 5 (response shaping) — Phase 4.
- Stage E (Jinja2 codegen) — Phase 4.
- F1 / F2 / F3 — Phase 5.
- Tenant Worker dispatch + smart-ID tenant prefix at deploy — Phase 6.
- Frontend wire-up of Pass 2/3/4 progress + description-diff UI — Phase 7.
- Pro "stick to existing description" toggle — Phase 8.
- Drift watcher + Stripe Meters + observability dashboards — Phase 8/9.
- LLM-polish for titles (Pro) — post-MVP.
- Component 6 (Examples) sandbox-derived from real execution traces — v1.1.
- Multi-provider OpenRouter routing — Phase 5 once F2 σ ≥0.4 metric is live.
- R2 cache backend — Phase 6.
- GraphQL / Postman / AsyncAPI input formats — explicitly out of MVP.
