# MCPGen — RULES (нерушимые)

> Жёсткие правила. Любое отклонение требует явного обновления документа + entry в decision log.
> Источники правды (precedence сверху вниз):
> 1. `RULES.md` (этот файл)
> 2. `docs/mcpgen-model-and-provider-override.md` (для всех LLM/model decisions — побеждает любой older doc)
> 3. `docs/mcpgen-git-workflow-rules.md` (для всех git operations)
> 4. `docs/mcpgen-gsd-sprint-plan.md` (для execution sequencing — побеждает старый `implementation-plan.md`)
> 5. `docs/mcpgen-pass-{0..5}-design.md` + `docs/mcpgen-stage-{e,f}-design.md` (per-pass/stage)
> 6. `docs/mcpgen-generation-engine-v2.md` (engine overall)
> 7. `docs/mcpgen-architecture.md`
> 8. `docs/mcpgen-implementation-plan.md` (только launch criteria + risks + anti-patterns; sequencing замещён GSD sprint plan)
> 9. `docs/mcpgen-ux-flow.md` (только копирайт + принципы; UI визуал ЗАЛОЧЕН в `claude-design-ui/`)

---

## 1. Product philosophy

1. **Quality > compression.** Длина description — instrumental, НЕ цель. Цель — task success rate агента, который использует tool. Длинные descriptions (сотни токенов) допустимы и поощряются для сложных tools — это прямая рекомендация Anthropic.
2. **Eval-driven generation.** Каждый сгенерированный сервер проходит agent-based evaluation перед deployment. Без eval — нет права говорить "MCP-quality".
3. **Best-practice as default.** Все 6 description-компонентов + tool annotations + namespacing — по умолчанию. Opt-out возможен, opt-in не нужен.
4. **Build-time decisions over runtime hopes.** Архитектурные ограничения (max tools, composite synthesis, multi-server split) применяются на генерации. Не полагаемся на runtime tool selection агента.
5. **Determinism where possible.** LLM используется только там, где задача требует natural-language reasoning. Annotations, structural validation, naming patterns — детерминированные правила, LLM только верифицирует edge cases.
6. **Caching is first-class.** Repeated generation того же spec'а не вызывает LLM. Это критично для unit economics.

→ Источник: `docs/mcpgen-generation-engine-v2.md` §1

---

## 2. Generation Engine — нерушимые ограничения

### 2.1 Pipeline structure
6 LLM-passes сгруппированы в 3 stage (Architect / Author / Shape) + 3 deterministic stage (Parse / Codegen / Static validate) + 1 agent-eval stage (F3). **Stage = boundary для retry.** Failure внутри stage не требует переделывать предыдущие.

### 2.2 Hard caps (Pass 0 design — уточнённые пороги)

**Tool count thresholds после Pass 0 filtering:**

| Tool count | Действие |
|---|---|
| ≤ 30 | Продолжаем нормально |
| 31–50 | Pass 1 (Composite Synthesis) запускается **обязательно** |
| 51–80 | Pass 1 агрессивно сворачивает; если > 50 после — **fail** с "split into multi-server (charges, customers, subscriptions...)" |
| > 80 | **Hard fail сразу** с suggested top-level path prefixes |

**Pro override:** `max_tools_override` поднимает cap до 100 (paid feature, на риск пользователя).

**target_complexity** (user-facing radio button) задаёт soft target:
- `minimal` ≤ 15 tools — только core CRUD, отбрасываем edge cases
- `standard` ≤ 50 (default) — balance functionality vs context efficiency
- `comprehensive` up to cap — включая редко используемые

**Activation chunked approach** (Pass 0 internal): > 200 endpoints после deterministic filtering. **Hard fail spec слишком большой:** > 1000 endpoints.

**Прочие caps:**
- **Max bundle size: 1MB сжато** (CF Workers limit 10MB, держим margin).
- **Max spec size: 10MB** input.
- **Max retries per pass: 2** (Pass 0 — 3 retries → degraded fallback, никогда не блокируем generation).
- **Cost cap per generation:** $0.50 free / $2.00 pro / configurable beyond. Превышение → hard fail с partial result + актуальный bill.

### 2.3 Description structure (Pass 2 design — 5 of 6 paper rubric components в v0)

| # | Component | Кто пишет | Что |
|---|---|---|---|
| 1 | **Purpose** | Pass 2 | 1–3 предложения, что tool делает |
| 2 | **Guidelines** | Pass 2 | `when_to_use: list[str]` + `when_not_to_use: list[str] \| None` (для tools с alts) + `how_to_use: str \| None` (для нетривиальных) |
| 3 | **Limitations** | Pass 2 | constraints, side effects, failure modes, idempotency, time windows |
| 4 | **Parameter overview** | Pass 2 | high-level (150–300 chars), список + relationships |
| 4b | **Parameter doc** (per-param) | Pass 3 | per-parameter format hints, examples per param, common_mistakes |
| 5 | **Length & Completeness** | Pass 2 validation | meta — длина в budget range, all components present |
| 6 | **Examples** | **Deferred v1.1** | `null` или ONLY from spec; никакой LLM-hallucinated |

**Length budgets per tool type** (Pass 2):

| Tool type | Min | Target | Max |
|---|---|---|---|
| Universal (search/fetch/list_*/upsert/delete) | 200 | 300 | 400 |
| Action | 100 | 150 | 200 |
| Workflow | 150 | 200 | 300 |
| Specialized read | 80 | 120 | 150 |

**Forbidden patterns (Pass 2 regex catch):**
- ❌ Marketing: "powerful", "elegant", "robust", "easy"
- ❌ Filler: "you can use this to", "this tool allows"
- ❌ Tautology: "this list tool lists things"
- ❌ Vague placeholders: "various", "different", "appropriate"

**Inline quality gate (Pass 2 Phase 3):** single Haiku judge per tool, abbreviated 4-component rubric (Purpose / Guidelines / Limitations / Parameter overview), threshold ≥ 3. Это НЕ full F2 smell scan — F2 это финальный 3 multi-family judges + full 6-component rubric.

### 2.4 Tool annotations (MCP spec 2025-03-26 — Pass 4 design)

Каждый tool ОБЯЗАН иметь все 4 hints + `title`. **MCP defaults опасны** (`destructiveHint: true`, `openWorldHint: true` by default → каждый невыставленный tool вызывает confirmation prompts в Cursor). Pass 4 ВСЕГДА выставляет все 4 явно.

⭐ **Architectural invariant:** `openWorldHint = true` ВСЕГДА (мы wrap external REST APIs). Hardcoded.

**Tool-type-based rules** (а НЕ HTTP method, как было в старой v2). 80% deterministic, ~15% LLM (Haiku) для edge cases:

| Tool type | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| `search`, `fetch`, `list_collections`, `list_objects`, `specialized_read` | true | false | true | **true** |
| `upsert` | false | false | **false** (creates → дубликаты возможны) | **true** |
| `delete` | false | **true** | **true** (re-delete = no-op) | **true** |
| `action` | verb pattern (Pass 4 Appendix B) ИЛИ Haiku LLM | | | **true** |
| `workflow` | conservative aggregation: AND across subs | OR across subs | AND across subs | **true** |

**Action verb patterns (high-confidence):** `_refund/_reverse` → destructive · `_cancel/_void/_revoke` → destructive+idempotent · `_archive/_soft_delete` → destructive+idempotent · `_capture/_charge/_pay` → !destructive · `_unlock/_enable/_activate` → idempotent. Medium-confidence (`_send/_lock/_publish`) → Haiku review.

**Conservative defaults when uncertain:** readOnly=false, destructive=true, idempotent=false. UX safety > optimization.

**Consistency rules (Phase 3 enforced):**
- `readOnly=true` → auto-fix `idempotent=true` (reads inherently idempotent)
- `destructive=true` → auto-fix `readOnly=false`
- `openWorldHint != true` → force true (architectural invariant)
- Title ≤ 50 chars, без "Tool"/"Function"/"API" suffixes

**Annotations — UX hints only.** НЕ безопасностные гарантии (MCP blog). Real safety живёт в actual implementation.

### 2.5 Quality gates (нельзя обойти)
- **F1 Static:** `tsc --noEmit`, `ajv` per inputSchema, ESLint, bundle size, MCP spec compliance. Fail = bug в наших шаблонах, hard error, alert. НЕ fix через LLM retry.
- **F2 Smell scan:** rubric scoring, 6 компонентов × 5-point × 3 multi-family judges (Claude Haiku + GPT-5-mini + Gemini 2.5-flash). Threshold ≥ 3 на каждый компонент.
- **F3 Agent eval:** Sonnet 4.7 в loop'е (max 10 turns) против golden tasks. Threshold ≥ 70% success rate. Below — flag affected tools.

### 2.6 Что ЗАПРЕЩЕНО
- ❌ **`search_tools` meta-tool / progressive disclosure runtime pattern.** 90% LLM не дообучены, останавливаются после первого вызова. Возвращаемся к вопросу ТОЛЬКО при появлении independent benchmark > 95% на топ-3 MCP клиентах ИЛИ когда MCP spec сделает это first-class.
- ❌ **LLM-generated examples без real execution traces.** Hallucination risk. `examples = null` пока нет sandbox execution (v1.1+).
- ❌ **LLM в Stage A, E, F1.** Эти stages — детерминированные. Если что-то не работает — bug в шаблонах/коде, не "перегенерируем через LLM".
- ❌ **Public quality badge by default.** Opt-in only. Снижает риск "наш bad score используется конкурентами как ammo".

### 2.7 Pass 1 — Tool Consolidation via Six-Tool Pattern (главный token efficiency mechanism)

> ⚠ **Обновлено** после Pass 1 detail design. Старая формулировка "Composite Tool Synthesis" устарела.

Token efficiency достигается **консолидацией в canonical Six-Tool Pattern** (industry consensus: Anthropic + OpenAI + MCP Bundles, October 2025), НЕ сжатием текста. Empirical: ~70% token savings.

**6 universal tools (всегда):**

| # | Tool | Параметры | Что делает |
|---|---|---|---|
| 1 | `search` | `query: string` (OpenAI standard, single-string) | Search by query → ranked results с smart IDs |
| 2 | `fetch` | `id: string` (smart ID, OpenAI standard) | Get full object по smart ID |
| 3 | `list_collections` | optional (pattern, include_schema, ...) | Discovery — какие типы данных есть |
| 4 | `list_objects` | optional (collection, properties, filter, sort, limit, ...) | Browse объектов с фильтрами/пагинацией |
| 5 | `upsert` | `collection`, `data` (obj/array), `id?`, `ids?` | Smart routing: create OR update; single OR batch |
| 6 | `delete` | `type` (object/objects/collection), `id?`/`ids?`/`collection?`, `confirm` | Smart routing по type |

**Smart IDs (mandatory):** `{server}:{type}:{collection}:{identifier}` (`stripe:object:Charge:ch_xxx`). AI получает ID из `search`/`list_objects`, передаёт в `fetch`/`upsert`/`delete`. Routing logic — в ID format, НЕ в tool definition.

**OpenAI compliance:** `search(query: string)` и `fetch(id: string)` — exact signatures для ChatGPT Deep Research integration. Нарушение — block merge.

**Extras (sparingly, strict gates):**
1. **Action tools** — POST с side effect, не CRUD (`charges_capture`, `messages_send`). Naming: `{namespace}_{verb}`.
2. **Workflow tools** — 2–5 endpoints coherent task. **ALL conditions:** prescribed by API design + recoverable on partial failure + positive token economy.
3. **Specialized reads** — rare patterns не fit'ящие в `list_objects`. First try: can `list_objects(filter, sort_by, limit)` cover это? Yes → не создавать.

**Target final tool count: 6–12.** Anthropic Claude Code сам ~12. > 15 — warning, не fail; surface в quality report.

**Coverage 100% MANDATORY.** Каждый Pass 0 tool должен быть covered (subsumed универсальным или extra). Validation в Phase 4. Fail → retry с list missing endpoints; после 3 retry → degrade as `specialized_tools` с warning.

### 2.8 Naming convention (Pass 0 + Pass 1)

**Pass 0 intermediate (tool plans):** `{resource}_{action}` — snake_case, ASCII, ≤ 64 chars, imperative verbs.
- ✅ `charges_create`, `customers_search`
- ❌ `stripe_charges_create` (service prefix дублирует server name)
- ❌ `createChargeUsingPOST` (camelCase + non-imperative)

**Pass 1 final (что увидит агент):**
- **Universal:** exact `search`, `fetch`, `list_collections`, `list_objects`, `upsert`, `delete` (без префикса).
- **Action tools:** `{namespace}_{verb}` (`charges_capture`, `messages_send`).
- **Workflow tools:** `{action}_{resource}` (`schedule_event`, `upload_with_thumbnail`).

**Forbidden namespace names:** `tool`, `mcp`, `api` (auto-rename). Singleton namespaces (1 tool) → попытка merge.

### 2.9 Pass 0 internal structure (3 stages)

| Stage | Что делает | LLM | Cost | Latency |
|---|---|---|---|---|
| 1. Deterministic filter | deprecated, /internal/, /admin/, /health/, OPTIONS/HEAD/TRACE, OAuth flow endpoints, user excludes | нет | $0 | < 100ms |
| 2. LLM filter + categorize | single Opus call на весь remaining set (НЕ per-endpoint — нужен holistic view) | Opus 4.7 | $0.10–0.30 | 10–30s |
| 3. Programmatic validation | unique names, snake_case regex, count cap, source_endpoint_id existing, namespace conflicts | нет | $0 | < 100ms |

**Chunked approach** (для > 200 endpoints): 4-phase (path-cluster → cluster decisions → per-cluster в parallel → cross-cluster merge). Cost ~$0.80, latency ~60s.

**Retry: 3 attempts → degraded fallback** (pure deterministic categorization based на tags + auto-naming). **Никогда не блокируем generation** — лучше degraded artifact + warning.

### 2.10 User Override Flow (Pass 0)

`dropped_endpoints` всегда видны user через UI с `can_user_override: bool`. User может явно вернуть endpoint через `explicit_includes`. LLM в Stage 2 получает hint: «user явно хочет это включить». `can_user_override=true` для `LOW_VALUE`, `REDUNDANT`; `false` для `METHOD_NOT_SUPPORTED`, `AUTH_FLOW`.

### 2.11 Auth subsystem (детектится в Pass 0, реализуется в Codegen + Runtime)

**3 модели передачи credentials:**

| Модель | Когда | Применимо к |
|---|---|---|
| **Pass-through** (default) | Static credentials, передаются в request headers, мы не храним | API Key (header/query), Basic Auth |
| **Stored** (encrypted) | OAuth tokens с refresh, AWS Sig, custom multi-factor | OAuth M2M, AWS Sig, Custom |
| **OAuth flow on behalf** | User-delegated APIs (Google, GitHub user-mode) | OAuth user-delegated |

**Pass 0 ТОЛЬКО detects** auth scheme и recommends mode. Pass 0 **НЕ:** запрашивает credentials у user (UI), не шифрует/хранит (Stored subsystem), не делает test calls (Stage F).

### 2.12 Pass 1 internal structure (4 phases)

| Phase | Что делает | LLM | Cost | Latency |
|---|---|---|---|---|
| 1. Endpoint Classification | Каждый Pass 0 tool классифицируется в категорию (data_read_single/list/search, data_create/update/delete, action, workflow, specialized_read) | нет | $0 | < 1s |
| 2. Schema Synthesis | Single Opus call: для каждого of 6 universal — какие endpoints subsumes, какие parameters, какие smart ID formats. Для extras — какие keep/drop, naming consistency | Opus 4.7 | $0.10–0.20 | 10–15s |
| 3. Routing Generation | Таблица routing per universal tool: какой ID format → какой upstream endpoint. Используется в Stage E codegen | нет | $0 | < 1s |
| 4. Coverage Validation | Каждый Pass 0 endpoint covered? Tool count ≤ 12 (warning). Smart ID schema consistent. Action tools имеют rationale. Workflow tools — partial_failure handling | нет | $0 | < 1s |

**Coverage failure → retry Phase 2 с list missing endpoints.** После 3 retry → degrade: добавляем uncovered endpoints как `specialized_tools` с warning. **Никогда не блокируем generation.**

### 2.13 Что Pass 1 НЕ делает (boundary)

- НЕ пишет descriptions (Pass 2)
- НЕ обрабатывает parameter details (Pass 3) — только signatures
- НЕ выводит annotations (Pass 4)
- НЕ генерирует actual code (Stage E использует RoutingConfig)
- НЕ запускает agent eval (Stage F3)

### 2.14 Pass 3 — Parameter Specification (борьба с Opaque Parameters smell)

**Главная цель:** устранить Opaque Parameters smell (84.3% существующих MCP — paper). Pass 3 — second по importance после Pass 2.

**5 dimensions per parameter:**
1. **Naming** — unambiguous даже в isolation: `user → user_id`, `data → payload`, `id (ambiguous) → {entity}_id`, `time → created_at`, `status (ambiguous) → {entity}_status`.
2. **Format & Constraints** — explicit: `format: email/date/date-time/uri/uuid`, `pattern`, `min/max`, `minLength/maxLength`.
3. **Enums** — use liberally where domain finite. Without spec enum — LLM infers из docs.
4. **Defaults** — каждый optional parameter получает default. Prefer spec.default; sensible defaults (limit=25, offset=0, sort_order="desc") когда spec не provides.
5. **Description** — 5-component MCP Bundles template (см. ниже).

**5-component parameter description (MCP Bundles template) — ОБЯЗАТЕЛЬНО:**
1. **What it is** (1 sentence)
2. **Possible values / format / range**
3. **When to use it / what it affects**
4. **Example** (concrete, copy-pastable, **safe** — value example, не result example)
5. **Default / omission behavior** (для optional)

**Filter parameter — 3 approaches (deterministic selection):**

| Approach | Когда | Param name | Schema |
|---|---|---|---|
| **A. Structured Object** (DEFAULT) | Most cases | `filter` | `{property, operator, value}`, operators enum: Equal/NotEqual/GreaterThan/LessThan/Contains/In/IsNull/etc. |
| **B. DSL String** | Underlying API имеет SQL/GraphQL native | `where` | `string` с DSL syntax + 3+ examples |
| **C. Individual Filter Params** (≤ 4) | Simple cases с 1–2 fixed filters | per-field (status/assigned_to/...) | typed enum/string |

Decision rule: SQL/GraphQL → B; ≤2 simple equality fields → C; иначе → A.

**Smart ID parameter** — pattern auto-generated из Pass 1 `SmartIdSchema`. Description includes:
- Format `{server}:{type}:{collection}:{identifier}`
- 2+ examples per type (object/collection/schema)
- Plain identifier fallback ("plain identifiers also accepted for backward compat")

**Per-tool-type strategies:**
- **Universal Discovery** (search/fetch) — single-string OpenAI standard.
- **Universal List** — rich set: `collection` (req) · `properties` (default `[]`) · `filter` (one of 3) · `sort_by` · `sort_order` (enum, default "desc") · `limit` (default 25, max 100) · `offset` (default 0).
- **Unified Write** — smart routing: `upsert.data: oneOf [object, array]`, `delete.type: enum [object/objects/collection]`, `delete.confirm` required для type="collection".
- **Action** — domain-specific, focused, every parameter explicit с pattern/format где applicable.
- **Workflow** — coarse parameters (user intent), НЕ internal step IDs.

**Standard parameter sets для universal tools** (Pass 3 design Appendix A) — consistent naming/types across servers. Не отклоняться без явного reason.

**Output:** production-ready `inputSchema` (`type: "object"`, `properties`, `required`, `additionalProperties: false`) валидный через ajv.

**Internal pipeline (4 phases):**

| Phase | Что | LLM | Cost | Latency |
|---|---|---|---|---|
| 1. Schema extraction | Pull from spec: type/format/enum/min/max/pattern/default/required. Identify filter и smart ID params. Detect ambiguous names | нет | $0 | < 1s |
| 2. Per-parameter LLM enrichment | Rich descriptions, examples, rename ambiguous, infer enums | Sonnet 4.7, **parallel concurrency 20** | $0.20–0.40 | 30–50s |
| 3. Cross-parameter validation | Uniqueness, mutual exclusivity, JSON Schema validity (ajv), filter approach matches one of 3, no deep nesting (depth > 3 flagged) | нет | $0 | < 1s |
| 4. Inline quality gate | Single Haiku judge per tool — parameter-specific 5-component rubric (Naming · Description completeness · Format/constraint accuracy · Example quality · Default/optional clarity), threshold ≥ 3 | Haiku 4.5 | $0.05 | 10–15s |

**Cost per server** (10 tools, ~80 params): ~$0.30–0.50.

**Forbidden patterns** в parameter descriptions: "just", "simply", "use this to" — strip и retry.

**Sanitize all spec text** — treat as untrusted (prompt injection prevention). Strip "ignore previous", "system:" patterns.

**Что Pass 3 НЕ делает:**
- НЕ пишет tool-level descriptions (Pass 2)
- НЕ выводит annotations (Pass 4)
- НЕ обрабатывает response schemas (Pass 5)
- НЕ генерирует tool examples (Pass 2 — null v0)
- НЕ generates code (Stage E)

### 2.15 Pass 4 — Annotations Inference (UX hints, not security)

**Главная цель:** для каждого tool вывести 4 boolean hints + title. См. §2.4 для tool-type rules. Pass 4 — самый дешёвый и быстрый pass (~$0.01–0.05, 5–15s).

**⭐ Architectural invariant:** `openWorldHint = true` ВСЕГДА. Hardcoded, без exceptions.

**Pass 4 internal structure (3 phases):**

| Phase | Что | LLM | Cost | Latency |
|---|---|---|---|---|
| 1. Deterministic rules | Tool-type rules + verb pattern matching (Appendix B) + title generation. Mark `_needs_llm_review` для low-confidence | нет | $0 | < 1s |
| 2. LLM judgment selectively | ТОЛЬКО для tools с `_needs_llm_review` (typically 0–3 per server). Single Haiku call per tool | Haiku 4.5, **concurrency 5** | $0.01–0.03 | 3–10s |
| 3. Consistency validation | Auto-fix consistency rules (readOnly→idempotent; destructive→!readOnly; openWorldHint=true). Title formatting | нет | $0 | < 1s |

**Conservative aggregation для workflow tools** (worst case across sub-operations):
- `readOnly = AND across subs` (any write breaks it)
- `destructive = OR across subs` (any destructive sub → workflow destructive)
- `idempotent = AND across subs`

**PUT vs PATCH detection** для updates: PUT (replace) → `destructive=true`; PATCH (merge) → `destructive=false`.

**Title generation** — deterministic snake_case → Title Case + verb reordering для action tools (`charges_capture` → "Capture Charge"). LLM polish — Pro feature post-MVP. Strip "Tool"/"Function"/"API" suffixes.

**Annotations — UX hints, НЕ безопасностные гарантии.** Client может игнорировать. Real safety — в actual implementation. Из MCP blog: "Treat annotations from untrusted servers as informational and lean on them for UX, but keep your actual safety guarantees in deterministic controls."

**Что Pass 4 НЕ делает:**
- НЕ обрабатывает response shapes (Pass 5)
- НЕ генерирует additional metadata (taskSupport, x-mcp-header, etc. — out of MVP scope)
- НЕ влияет на actual tool execution (annotations are UX hints only)
- НЕ генерирует код (Stage E)

### 2.16 Pass 5 — Response Shaping (борьба с response token bloat)

**Главная цель:** устранить **response token bloat** (часто больше чем schema bloat). Real example: HRIS list_employees 50 fields × 100 records = 80K tokens raw → 8K с filtering (**10x reduction**).

**5 mechanisms (ОБЯЗАТЕЛЬНЫЕ для всех tools):**

1. **outputSchema** (MCP 2025-06-18 standard) — каждый tool получает JSON Schema для response. `structuredContent + content` dual return для backward compat.
2. **Pagination strategy + defaults** — auto-detect: cursor (preferred, MCP canonical) / offset / page-number. Default `limit=25`, `max_limit=100`.
3. **Field filtering defaults** — 3 категории:
   - **Always-include:** identifiers (id, smart_id, foreign keys), status/state, primary content (name/title/summary), critical timestamps (created_at/updated_at), required spec fields.
   - **Opt-in** (через `properties` param): verbose nested objects, metadata blobs, audit logs, large content blobs.
   - **Always-exclude:** sensitive PII, internal-only fields, deprecated.
4. **Truncation thresholds + teaching guidance** (per tool type):

   | Tool type | Threshold |
   |---|---|
   | search | 10K tokens |
   | list_objects | 15K tokens |
   | fetch | 20K tokens |
   | action / upsert / delete | 5K tokens |
   | workflow | 15K tokens |

   Truncation message — **teaching moment, не info.** Templates с placeholders (`{N}`, `{Total}`, `{action}`) — Pass 5 design Appendix A.
5. **`response_format` parameter (optional)** — enum `summary/detailed/raw`. Default `summary`. Добавляется ТОЛЬКО для tools с > 20 fields и varied use cases.

**Pagination detection** (deterministic):
- Cursor signals: request `cursor`/`page_token`/`after`/`starting_after`; response `next_cursor`/`nextCursor`/`next_page_token` → cursor strategy
- Request `offset`/`skip` → offset strategy
- Request `page`/`page_number` + `per_page` → page_number strategy
- Else → no pagination, conservative truncation

**Conservative bias** для field filtering — when uncertain prefer opt-in. Better agent request field, чем burn tokens на unused data.

**`ResponseConfig` schema (refined Pass 5):**
```python
class ResponseConfig:
    pagination: PaginationConfig | None       # cursor/offset/page_number + defaults
    field_filtering: FieldFilteringConfig | None  # default/optional/excluded fields
    truncation: TruncationConfig              # threshold + guidance template + strategy
    has_response_format_param: bool
```

⚠ Старая v2 IR (`response_format_options: list[str]`, `semantic_id_mapping: bool`, `field_inclusion_concise/detailed`) — устарела. Smart IDs handled by Pass 1, не Pass 5.

**`FinalTool`** — финальный output Pass 5 для codegen:
```python
class FinalTool:
    name: str
    description: ToolDescription          # Pass 2
    inputSchema: JsonSchema               # Pass 3
    outputSchema: JsonSchema              # Pass 5 (NEW MCP 2025-06-18)
    annotations: ToolAnnotations          # Pass 4
    response_config: ResponseConfig       # Pass 5
```

**Internal pipeline (5 phases):**

| Phase | Что | LLM | Cost | Latency |
|---|---|---|---|---|
| 1. Pagination strategy detection | Deterministic auto-detect cursor/offset/page-number из spec | нет | $0 | < 1s |
| 2. Output schema extraction | Pull spec response schemas, convert to JSON Schema, wrap с metadata. Universal tools — `oneOf` или generic | нет | $0 | < 1s |
| 3. Field importance ranking | Single Haiku call для tools с > 10 response fields. Classify: always-include / opt-in / exclude | Haiku 4.5, **concurrency 10** | $0.05–0.10 | 10–15s |
| 4. Truncation guidance authoring | Template-based (Appendix A) + minor LLM polish для unusual cases | Haiku optional | $0–0.02 | 2–5s |
| 5. Validation | All tools have outputSchema, pagination consistent, thresholds reasonable, default fields non-empty, guidance contains placeholders | нет | $0 | < 1s |

**Cost per server** (10 tools): ~$0.05–0.15. Latency 15–25s. Один из дешёвых passes (после Pass 4).

**Truncation guidance — anti-patterns:**
- ❌ "Response truncated." (агент не знает что делать)
- ❌ "Error: response too large." (false — это не error)
- ❌ "Showing partial results due to size limits." (vague — какие limits? как override?)

**Truncation guidance — good patterns:**
- ✅ "[Showing 25 of 247 charges. Use `cursor='abc123'` for next page, or add filter to narrow.]"
- ✅ "[Object has 47 fields, showing 12. For full data: `properties=['*']`. For specific: `properties=['field_name']`.]"

**Что Pass 5 НЕ делает:**
- НЕ генерирует actual code (Stage E)
- НЕ runs validation против real upstream API (Stage F)
- НЕ обрабатывает error responses (F1 validation handles)
- НЕ выводит resources (separate MCP primitive, out of scope)
- НЕ занимается streaming responses (v1.x feature)

→ Источник: `docs/mcpgen-pass-0-design.md` · `docs/mcpgen-pass-1-design.md` · `docs/mcpgen-pass-2-design.md` · `docs/mcpgen-pass-3-design.md` · `docs/mcpgen-pass-4-design.md` · `docs/mcpgen-pass-5-design.md` · `docs/mcpgen-generation-engine-v2.md` §1–§10

### 2.17 Stage E — Codegen (deterministic, $0)

**100% deterministic Jinja2 templates.** No LLM. Cost $0, latency 5–12s.

- **Native MCP tools** (НЕ Code Mode на CF). Decision: Six-Tool Pattern уже даёт structural token efficiency без runtime sandbox.
- **Cloudflare Workers only в MVP.** Multi-runtime — based on demand.
- **~25–30 generated files** per server: `package.json`, `wrangler.toml`, `src/index.ts` (entry), `src/server.ts`, `src/tools/<name>.ts` (per tool), `src/runtime/{smart_id, pagination, truncation, upstream, response_shaping, errors}.ts`, `src/auth/{middleware, credentials}.ts`, `src/schemas/{inputs, outputs, routing}.ts`.
- **3 auth modes:** passthrough / stored (AES-256-GCM в CF KV) / OAuth (через `@cloudflare/workers-oauth-provider`).
- **6 phases:** scaffold → schemas → runtime → auth → tool handlers → **TS validation** (`tsc --noEmit` встроена в pipeline). Failure → log + retry с debug info.
- **Per-tool-type templates:** universal/action/workflow/specialized — каждый со своим pattern.
- **Error templates teach next step (Anthropic principle):** 401 → "verify credentials"; 404 → "use search() first"; 429 → "Retry-After + batch suggestion"; validation_error → "common issue + suggestion".
- **MCP 2025-06-18:** `content` (text) + `structuredContent` (object) dual return.
- **Bundle size limit:** 1MB сжато (CF Workers margin).
- **Что Stage E НЕ делает:** не запускает agent eval (Stage F), не deploys (Control Plane action), не runs against real upstream (validation only static).

### 2.18 Stage F — Validation (three tiers)

**F1 + F2 always run. F3 opt-in OR auto-triggered if F2 < 4.0.**

| Tier | Что | Cost | Latency | Failure → |
|---|---|---|---|---|
| **F1 Static** | tsc compile, JSON Schema valid (ajv), MCP protocol compliance, secret scan, smart ID regex, routing complete, auth middleware, no template artifacts | $0 | 5–10s | targeted retry в specific upstream pass (см. mapping) |
| **F2 Smell scan** | **3 multi-family judges Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro** × prompt shuffling × 6-component rubric × score averaging | $0.20–0.50 | 20–30s | Per-component → retry: Purpose<3 → Pass 2; Parameter<3 → Pass 3; etc. Examples<3 expected (deferred v0). |
| **F3 Agent eval** | Real Sonnet 4.7 agent vs golden tasks. **Two-tier evaluator** (rule-based + LLM judge per MCP-Bench arXiv 2508.20453) | $1–3 | 1–3min | Pattern-based retry mapping (см. ниже) |

⚠ **Models for F2 ОБНОВЛЕНЫ** — Sonnet/GPT-5/Gemini 3.5 Pro (НЕ Haiku/GPT-5-mini/Gemini-flash как было в старых docs). Per MCP-Bench: 3 judges achieve 86.67% agreement с human evaluators only с stronger models.

**F3 environment (hybrid):** real sandbox для top 10 APIs (Stripe test mode, GitHub test orgs, Notion test, Calendar) · mocked для rest (WireMock/MSW из spec examples).

**F2 thresholds:**
- ≥ 4.5 → "premium" badge
- 4.0–4.5 → "good" pass без retry
- 3.5–4.0 → marginal, retry Pass 2 для below-3.5 tools
- < 3.5 → poor, retry Pass 2 + Pass 3 для all tools

**F3 pass criteria:** rule_based.all() + judge.task_completion ≥ 7 + judge.grounding ≥ 6. Server pass rate ≥ 0.7.

**Failure pattern → retry mapping (Stage F design Appendix A):**
- agent confuses 2 tools → Pass 2 (description ambiguity)
- wrong parameter format → Pass 3 (parameter docs unclear)
- missing destructive hint → Pass 4 (annotations)
- loops after truncation → Pass 5 (guidance not actionable)
- agent fails auth → Stage E (auth code bug)
- hallucinates data → Pass 5 + Stage E (output schema not enforced)
- skips required step → Pass 2 (sequence not communicated)

**Targeted retry orchestration:** max **2 retry rounds** per generation. Cached prior-pass outputs reused (~5x cheaper than full regen). Beyond 2 → terminal failure (degraded deploy с warnings, user manual review).

**Quality badges (composite score):**
- **premium (90–100):** F1 pass + F2 ≥ 4.5 + F3 pass rate ≥ 0.85
- **verified (75–90):** F1 pass + F2 ≥ 4.0 + F3 pass rate ≥ 0.7
- **standard (60–75):** F1 pass + F2 ≥ 3.5 + (F3 not run OR ≥ 0.5)
- **needs_review (<60):** any F1 failure OR F2 < 3.5

**Public badges — opt-in only.**

**Quarterly judge calibration с human evaluators** (per MCP-Bench). Target ICC > 0.85.

**Pricing:** Free 1 F3 eval/мес; Pro 5/мес included; PAYG $0.50/eval.

→ Источник: `docs/mcpgen-stage-e-design.md` · `docs/mcpgen-stage-f-design.md`

### 2.19 LLM Model & Provider — OVERRIDE (single source of truth для моделей)

> ⚠ **Этот раздел ОВЕРРАЙДИТ все упоминания моделей в §2.1–§2.18 и любом other doc.**
> Источник: `docs/mcpgen-model-and-provider-override.md`.

**Single model:** `qwen/qwen3-coder` через **OpenRouter** — для **ВСЕХ** generation passes (0–5) и Stage F2.

**Замены (все old references устарели):**
- ❌ Sonnet 4.7 / Haiku 4.5 / Opus 4.7 (Anthropic API)
- ❌ GPT-5 / GPT-5-mini (OpenAI API)
- ❌ Gemini 3.5 Pro / Gemini-flash (Google AI)
- ❌ LiteLLM multi-provider gateway
- ✅ **Qwen3-Coder через OpenRouter** (OpenAI-compatible API)

**EXCEPTION:** F3 test agent остаётся **Sonnet 4.7** — он симулирует real Claude users в production, это отдельный API call vs generation pipeline. F3 cost $1–3 per eval сохраняется.

**Provider config:**
- Endpoint: `https://openrouter.ai/api/v1`
- Env vars (single source): `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `PRIMARY_MODEL=qwen/qwen3-coder`
- Optional analytics: `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`
- Удалить из всех `.env`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`

**PydanticAI integration (canonical pattern):**
```python
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

provider = OpenAIProvider(
    base_url=os.environ["OPENROUTER_BASE_URL"],
    api_key=os.environ["OPENROUTER_API_KEY"],
)
MODEL = OpenAIModel("qwen/qwen3-coder", provider=provider)
```

**Pricing:** $0.14/M input · $0.80/M output. Total per generation **~$0.10–0.13** (vs $1–3 раньше = ~10–20x cheaper).

**Recalculated per-pass costs (override §2 cost numbers):**

| Pass / Stage | Old cost | New cost (Qwen3-Coder) |
|---|---|---|
| Pass 0 | $0.15–0.40 | $0.015–0.04 |
| Pass 1 | $0.10–0.25 | $0.010–0.025 |
| Pass 2 | $0.40–0.65 | $0.04–0.07 |
| Pass 3 | $0.30–0.50 | $0.03–0.05 |
| Pass 4 | $0.01–0.05 | $0.001–0.005 |
| Pass 5 | $0.05–0.15 | $0.005–0.015 |
| F2 (5-shuffle) | $0.20–0.50 | $0.015 |
| F3 (Sonnet — exception) | $1–3 | $1–3 (unchanged) |

**Sampling profiles:**
- **Creative** (descriptions/parameters): `temperature=0.3`, `top_p=0.9`, `max_tokens=2048`
- **Classification** (annotations/smell scan): `temperature=0.0`, `top_p=1.0`, `max_tokens=512`
- **Codegen** (rare, only if не template): `temperature=0.2`, `top_p=0.95`, `max_tokens=4096`

**F2 multi-judge replacement (override §2.5 + §2.18):**
Single Qwen3-Coder с **5-shuffle prompt averaging + temperature variance (0.0 / 0.2 / 0.5)** = 15 evaluations per tool. Quality target ~75–80% human agreement (vs 86.67% multi-family) — acceptable trade-off для 10x cost reduction.

**Day 1 smoke test mandatory** перед full implementation:
- Verify Qwen3-Coder работает с PydanticAI structured outputs (function calling)
- Latency < 10s, cost ~$0.001 per call
- Fallback model если issue: `qwen/qwen3-30b-a3b-instruct`

**Trade-offs explicitly acknowledged:**
- Single-bias risk в F2 (mitigated через 4 techniques: shuffling, temperature variance, self-critique loop, quarterly human calibration)
- Quality может уступать Sonnet в edge cases (mitigated через F1+F2+F3 pipeline catching obvious issues)
- Vendor risk OpenRouter outage (mitigated: OpenAI-compatible interface = switching providers через 2 env vars)

**Future option** (defer): add second model только для F2 если quality становится bottleneck. Не добавлять preemptively.

→ Источник: `docs/mcpgen-model-and-provider-override.md`

---

## 3. Architecture — нерушимые границы

### 3.1 Чистая граница TS ↔ Python
- TS = всё user-facing и operational (web, CLI, Hono BFF, Dispatch Worker, Tenant Workers, runtime SDK).
- Python = ТОЛЬКО LLM-оркестрация в Generation Engine.
- Связь — один HTTP API (`POST /api/v1/generate` + SSE callbacks).
- Никакого дублирования бизнес-логики между языками.

### 3.2 Open-core distribution
- Open source (MIT): CLI, базовый генератор (без LLM passes).
- Closed: managed cloud, optimization passes, observability, billing.

### 3.3 Edge-first runtime
Сгенерированные серверы — HTTP-translators на CF Workers for Platforms. **Не платим за idle VM на тенанта.** Никаких contained deployments, никаких per-tenant контейнеров.

### 3.4 Vendor-flexible internals
Никакой бизнес-логики в vendor-specific API глубже одного слоя. Любой компонент должен мигрироваться за выходные. **Model routing — single OpenRouter provider** (см. §2.19). Сменить модель = update env var `PRIMARY_MODEL` или add second model в config. **НЕ восстанавливать LiteLLM** — single provider покрывает need.

### 3.5 Stateless wherever possible
Generation Engine, BFF, MCP runtimes — stateless. Состояние — только в Postgres (Neon) и R2.

### 3.6 Cost transparency by design
Каждая операция → usage event → видна в дашборде юзера И в нашем cost tracking. Никаких чёрных дыр в bill.

→ Источник: `docs/mcpgen-architecture.md` §2

---

## 4. Security — нерушимые

### 4.1 Pass-through credentials (DEFAULT)
Upstream API ключ передаётся клиентом в `X-Upstream-Auth` headers, мы **НЕ храним и НЕ логируем**. Encryption key — derived from API key через HKDF.

### 4.2 Stored credentials (ALT)
Только если tenant explicit'но загружает upstream key через UI. AES-256-GCM с per-tenant DEK в CF KV. Маркируется в UI как "less secure" mode.

### 4.3 Privacy при логировании
**Логировать ЗАПРЕЩЕНО:** содержимое spec'а (часто internal API), upstream API responses (могут содержать PII), upstream auth credentials (любой формы).

**Логировать МОЖНО:** generation metadata, tool names, IR structure, performance metrics, error traces, content_hash (sha256).

### 4.4 Secrets audit
Все доступы к stored credentials → `secrets_audit` таблица (timestamp, tenant_id, deployment_id, action, ip). Retention 1 год.

→ Источник: `docs/mcpgen-architecture.md` §11.3, §14

---

## 5. Operating — нерушимые

### 5.1 Стек ЗАФИКСИРОВАН
Любой выбор vendor / framework / language вне списка из `docs/mcpgen-architecture.md` §4 — требует обновления docs + decision log entry. По умолчанию: НЕТ.

### 5.2 Lock contracts early
Контракты замораживаются по графику (см. `docs/mcpgen-implementation-plan.md` §11.4):
- IR schema, Generation API, DB schema v1 — end W1
- Tenant Worker SDK API — end W3
- Usage event schema — end W5

Контракты живут в `packages/contracts`. Breaking changes — только через weekly review.

### 5.3 Demo-driven development
Каждую пятницу EOD — 5-минутное демо новой capability. **Нельзя записать → не done.** Slip milestone, не slip демо.

### 5.4 Anti-patterns — активно сопротивляться
1. ❌ "Refactor real quick перед feature" → Feature → refactor в конце фазы.
2. ❌ "Vendor дешевле на $20" → Часы работы > $20.
3. ❌ "Сначала выучу новый framework" → Стек — контракт.
4. ❌ "Пусть docs будут идеальными" → Docs хороши, когда существуют.
5. ❌ "OAuth zoo (Google + GitHub + Twitter + Apple)" → Email + GitHub. Всё.
6. ❌ "Нужно больше абстракций" → Жди 3-го дублирования.
7. ❌ "Запилю feature flag систему" → `if (env.SOMETHING)` достаточно для MVP.

→ Источник: `docs/mcpgen-implementation-plan.md` §11

### 5.5 Git workflow — нерушимые

> Источник истины: `docs/mcpgen-git-workflow-rules.md`. Здесь — TL;DR жёсткие правила.

**Branching (trunk-based):**
- `main` — sacred, always deployable, branch protection enabled.
- Feature branches: short-lived (1–3 days max 1 week). Naming: `{type}/{kebab-description}` где type ∈ `feature/fix/refactor/docs/chore/test/experiment`.
- **Forbidden:** `wip/*`, `claude/*`, `ai/*`, `temp/*`, `test123/*`, names с пробелами/spec chars кроме `-` `/`.
- **Никаких** long-lived `develop`/`staging`/`release/*` — feature flags для in-progress, не branches.

**Commits:**
- **Conventional Commits 1.0.0 mandatory** — `<type>(<scope>): <subject>`, ≤ 72 chars, imperative, no period, lowercase first letter.
- Allowed types: `feat`/`fix`/`docs`/`style`/`refactor`/`perf`/`test`/`build`/`ci`/`chore`/`revert`.
- Breaking changes: `!` after type/scope ИЛИ `BREAKING CHANGE:` footer.
- **Atomic commits — CRITICAL.** One logical change per commit. Если "and" в subject → split commit. Use `git add -p` для interactive staging.
- Body wraps at 72 chars, объясняет what+why (не how — code shows how).
- **Empty attribution** в `.claude/settings.json` (`"attribution": {"commit": "", "pr": ""}`).

**PRs:**
- Title — same Conventional Commits format (становится commit message при squash merge).
- PR description — required sections: What / Why / How / Testing / Checklist (см. `mcpgen-git-workflow-rules.md` §3.2).
- **Size:** target < 400 lines, max comfortable < 1000, hard limit 2000 (требует justification).
- **Self-review mandatory** в "Files changed" tab перед requesting review (catches 50% issues).
- **Merge strategy: SQUASH ONLY.** Forbidden: merge commit, rebase merge.
- Draft PR для WIP. Convert to ready только когда self-reviewed + CI green.

**Pre-commit hooks (mandatory):**
- gitleaks (secret scan), `check-added-large-files --maxkb=500`, `detect-private-key`, `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`/`json`, lint, typecheck.
- Commit message validation через `conventional-pre-commit`.
- **NEVER `--no-verify`** — bypassing defeats purpose. Embed в `.claude/settings.json` deny list.

**Forbidden operations** (must NEVER без explicit user approval):
1. `git push --force` (любая branch — use `--force-with-lease`)
2. `git push origin main` (direct push на main)
3. `git commit --no-verify` / `git push --no-verify`
4. `git filter-branch` или history rewrite на shared branches
5. `git tag -d <tag>` (tags immutable)
6. Committing secrets / `node_modules` / `.env` files
7. `--allow-empty` commits (no legitimate use)
8. `rm -rf .git*`
9. Force-merge без CI green

**Recovery:**
- `git reflog` — спасает почти любую mistake. **Memorize.**
- `git stash`, `--soft reset HEAD~1`, `--amend` (только если not pushed).
- Bad rebase/merge → `--abort`, then reflog.

**AI-agentic specifics:**
- `CLAUDE.md` — project memory, single most important file.
- `.claude/settings.json` — deterministic deny rules для destructive ops.
- `.claude/commands/` — reusable slash commands (`/commit`, `/pr`, `/review`, `/ship`).
- Git worktrees для parallel agent sessions (см. §5.6).
- Plan Mode для multi-file refactors.
- "Challenge Claude" pattern перед merging significant work.

### 5.6 Multi-terminal parallel execution — GSD workstreams

> Источник истины: `docs/mcpgen-gsd-sprint-plan.md`. Здесь — жёсткие правила.

**Один Claude Code instance = один workstream = один terminal = один git worktree.**

**Mandatory setup для parallel work:**
1. **Создать git worktree** per workstream:
   ```bash
   git worktree add ../mcpgen-<ws> -b feature/<ws> main
   cd ../mcpgen-<ws>
   ```
2. **Активировать GSD workstream** (per-instance):
   ```bash
   export GSD_WORKSTREAM=<ws>
   # OR pass --ws <ws> к каждой gsd-* команде
   ```
3. **Запустить Claude** в этом terminal/worktree.

**GSD config requirements (`.planning/config.json`):**
- `mode: yolo`
- `granularity: fine` (10 phases для MCPGen MVP)
- `parallelization: true`
- `model_profile: inherit` (single Qwen3-Coder)
- `workflow.use_worktrees: true`
- `workflow.ui_phase: false` + `workflow.ui_safety_gate: false` (UI locked)
- `workflow.auto_advance: false` (контроль над merge gates)
- `workflow.research: true`, `workflow.plan_check: true`, `workflow.verifier: true`

**Workstream layout (см. sprint plan §3):**
- `main` (Terminal 1) — Foundation Phase 1, integration gates, Phases 9 + 10
- `engine` (Terminal 2) — Phases 2–5 sequentially (Pass 0+1 → 2+3+4 → 5+E → F)
- `runtime` (Terminal 3) — Phase 6 (CF Workers + Dispatch + Tenant SDK)
- `ops` (Terminal 4) — Phase 8 (Auth + Billing)
- `frontend` (Terminal 5) — Phase 7 (UI wire-up, NO visual changes)

**Phase dependency rules (mandatory):**
1. Phase 1 (Foundation) **blocks all** — must merge first
2. Phases 2–5 (engine) — sequential within engine workstream, parallel с 6/7/8
3. Phase 9 (Observability) — only after **all** workstreams merged
4. Phase 10 (Launch) — only after Phase 9 merged
5. **Никогда не запускать Phase 9/10** пока workstream'ы не merged

**Merge order mandatory:** Foundation → Engine → Runtime → Ops → Frontend → Observability → Launch.

**Anti-patterns (FORBIDDEN):**
- ❌ Запустить multiple workstreams без `--ws` или `GSD_WORKSTREAM` → collision на `.planning/STATE.md`, потеря работы
- ❌ Работать в одной директории из двух Claude instances одновременно (без worktrees)
- ❌ Merge'ить engine pass-by-pass в main → frontend/runtime запутаются на полу-готовых passes
- ❌ Skip integration gates между phases
- ❌ Long-lived workstream branches > 2 недель без `git rebase origin/main`
- ❌ Merge'ить 2 PR в `main` одновременно — sequential CI completion mandatory

**Contract change protocol (mandatory):**
1. STOP в workstream где обнаружено изменение
2. Switch в Terminal 1 (main)
3. Создать `chore: propose contract change — XYZ` PR в `packages/contracts` или `packages/ir`
4. Review impact на other workstreams
5. Merge contract change
6. Each workstream: `git fetch origin && git rebase origin/main`
7. Resume work
**Никаких silent breaking changes между workstream'ами.**

**Daily sync ritual** (Terminal 1, на main):
```bash
git fetch origin --prune
git log --oneline --graph --all | head -30
for ws in engine runtime ops frontend; do
  test -d .planning/workstreams/$ws && \
    echo "=== $ws ===" && cat .planning/workstreams/$ws/STATE.md | head -10
done
```

**Worktree cleanup после merge:**
```bash
git worktree remove ../mcpgen-<ws>
git branch -d feature/<ws>
git fetch origin --prune
```

### 5.7 UI lock — frontend phase = wire-up only

> ⚠ **`claude-design-ui/MCP-Gen.zip` — ЗАЛОЧЕН.** Готовый дизайн от Claude Design.

**Запрещено в Phase 7 (Frontend) и любой другой:**
- ❌ Менять визуал (colors, spacing, typography, layout)
- ❌ Менять копирайтинг кнопок, заголовков, microcopy
- ❌ Перерисовывать компоненты или экраны "под себя"
- ❌ Заменять компоненты UI library
- ❌ Добавлять новые экраны не из `MCP-Gen.zip`

**Разрешено в Phase 7:**
- ✅ Распаковать `claude-design-ui/MCP-Gen.zip` в `apps/web/src/`
- ✅ Wire state management (Zustand / React Query / etc.)
- ✅ Wire API calls (POST /generate, SSE consumption)
- ✅ Wire form submission, error display
- ✅ Add loading/error/success states используя existing визуал
- ✅ Connect routing между existing screens

**Acceptance criterion для каждого Phase 7 plan:**
```
git diff apps/web/src/styles/ apps/web/src/components/ui/ shows ZERO changes
```

**Если визуал нужно поменять (например design bug):**
1. STOP. Не менять in-place.
2. Документировать issue в `.planning/todos/pending/`
3. Получить explicit approval от user
4. Update `claude-design-ui/MCP-Gen.zip` (новая версия дизайна)
5. Re-extract в `apps/web/src/`
6. Resume work

**Копирайт `mcpgen-ux-flow.md`** используется для:
- Подсказок в форме / placeholder text
- Empty states messaging
- Error message wording
- НЕ для пересоздания screens

→ Источник: `docs/mcpgen-gsd-sprint-plan.md` §4.7

---

## 6. Scope — что НЕ В MVP

Список из `docs/mcpgen-implementation-plan.md` §11 + `docs/mcpgen-generation-engine-v2.md` §10:

- GraphQL / Postman input (только OpenAPI 3.x на v0)
- Python output (только TypeScript на v0)
- Rust output
- Examples generation через execution traces (`examples = null` на v0)
- Progressive disclosure / search_tools meta-tool (отказались полностью)
- Custom rubric customization (Pro v1.1)
- User-provided golden tasks (Pro v1.1)
- Smart tool-call response caching в runtime
- A/B deploys
- Regression testing in CI (v2 feature)
- Auto-regenerate on drift (manual button enough)
- SSO / Team plan
- Custom domains для tenant servers
- Self-host of MCPGen itself
- CLI Homebrew tap (npm на MVP)

**Discipline:** scope creep — #1 причина соло-проекту промахнуться по launch. Запрос фичи вне MVP → запись в этот список → решение post-launch.

---

## 7. Workflow для Claude — что делать ПЕРЕД задачей

1. **Sequencing / какая phase / какой workstream:** `docs/mcpgen-gsd-sprint-plan.md` — **ИСТИНА**. Старый `mcpgen-implementation-plan.md` остаётся только для launch criteria + risks + anti-patterns.
2. **LLM call / model selection:** `docs/mcpgen-model-and-provider-override.md` — **ИСТИНА**. `qwen/qwen3-coder` через OpenRouter — всегда. Любые упоминания Sonnet/Haiku/Opus/GPT-5/Gemini/LiteLLM в other docs — устарели. **Exception:** F3 test agent остаётся Sonnet 4.7.
3. **Git operation (branch/commit/PR/merge/recovery/hooks):** `docs/mcpgen-git-workflow-rules.md` — **ИСТИНА**. См. также §5.5 этого файла.
4. **Multi-terminal / parallel execution / workstream setup:** `docs/mcpgen-gsd-sprint-plan.md` §3 + §5 — **ИСТИНА**. См. также §5.6 этого файла. Mandatory: git worktree + `GSD_WORKSTREAM=<name>` env / `--ws <name>` флаг.
5. **Pass 0 задача (filtering, naming, categorization, auth detect, drift):** `docs/mcpgen-pass-0-design.md` — **ИСТИНА**. При противоречии с v2 — Pass 0 design выигрывает.
6. **Pass 1 задача (Six-Tool Pattern, smart IDs, routing, coverage, action/workflow/specialized):** `docs/mcpgen-pass-1-design.md` — **ИСТИНА**. Старая v2 формулировка "Composite Tool Synthesis" устарела.
7. **Pass 2 задача (description authoring, length budgets, prompt templates per tool type, inline quality gate, forbidden patterns, examples policy):** `docs/mcpgen-pass-2-design.md` — **ИСТИНА**. При противоречии с v2 — Pass 2 design выигрывает.
8. **Pass 3 задача (parameter specification, JSON Schema generation, naming/format/enums/defaults/description, filter design 3 approaches, smart ID patterns, standard parameter sets):** `docs/mcpgen-pass-3-design.md` — **ИСТИНА**. При противоречии с v2 — Pass 3 design выигрывает.
9. **Pass 4 задача (annotations inference, verb pattern matching, openWorldHint invariant, workflow aggregation, title generation, consistency rules):** `docs/mcpgen-pass-4-design.md` — **ИСТИНА**. При противоречии с v2 — Pass 4 design выигрывает.
10. **Pass 5 задача (response shaping, outputSchema generation, pagination, field filtering, truncation guidance, response_format):** `docs/mcpgen-pass-5-design.md` — **ИСТИНА**. При противоречии с v2 — Pass 5 design выигрывает.
11. **Stage E задача (codegen, Jinja2 templates, tenant Worker structure, auth code, runtime modules):** `docs/mcpgen-stage-e-design.md` — **ИСТИНА**. При противоречии с v2 — Stage E design выигрывает.
12. **Stage F задача (F1/F2/F3 validation, retry orchestration, quality scoring, badges):** `docs/mcpgen-stage-f-design.md` + override §2.19. F2 = single Qwen3-Coder с 5-shuffle (NOT 3 multi-family judges). F3 test agent = Sonnet 4.7 (exception).
13. **Pipeline / IR / overall:** `docs/mcpgen-generation-engine-v2.md`. НЕ использовать v1 6-passes из старой архитектуры.
14. **Architecture задача (всё кроме engine):** `docs/mcpgen-architecture.md`.
15. **UI задача:** ⚠ **UI ЗАЛОЧЕН.** Распаковать `claude-design-ui/MCP-Gen.zip` в `apps/web/src/`. **ЗАПРЕЩЕНО** менять визуал/layout/colors/копирайт. Frontend phase = только wire-up к API. См. §5.7.
16. **UX-решение (копирайт/принципы, НЕ визуал):** `docs/mcpgen-ux-flow.md`.
17. **Launch criteria / kill switches / risks:** `docs/mcpgen-implementation-plan.md` §11.
18. **Запрос фичи вне MVP:** записать в §6 этого файла, не реализовывать.
19. **Сомнение:** перечитать соответствующую секцию docs, не угадывать.
20. **Конфликт документов:** `RULES.md` > `mcpgen-model-and-provider-override.md` > `mcpgen-git-workflow-rules.md` > `mcpgen-gsd-sprint-plan.md` > stage/pass-detail-design > v2 engine > architecture > implementation-plan > ux-flow.
21. **Никогда не дублировать** знания из docs в код-комментарии.
