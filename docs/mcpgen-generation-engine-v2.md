# MCPGen Generation Engine — Architecture v2

> **Статус:** v2.0 — финальный design до начала реализации Phase 2.
> **Owner:** этот документ — source of truth для всего, что касается генерации tools (overall pipeline, IR, validation, eval). Любые изменения логики passes — через update этого документа + entry в decision log.
> **Per-pass detail designs (выигрывают для своей области):**
> - [`mcpgen-pass-0-design.md`](mcpgen-pass-0-design.md) — Pass 0 (Tool Inventory & Naming + auth detect + drift) ✅
> - [`mcpgen-pass-1-design.md`](mcpgen-pass-1-design.md) — Pass 1 (Tool Consolidation via Six-Tool Pattern) ✅
> - [`mcpgen-pass-2-design.md`](mcpgen-pass-2-design.md) — Pass 2 (Description Authoring) ✅
> - [`mcpgen-pass-3-design.md`](mcpgen-pass-3-design.md) — Pass 3 (Parameter Specification) ✅
> - [`mcpgen-pass-4-design.md`](mcpgen-pass-4-design.md) — Pass 4 (Annotations Inference) ✅
> - [`mcpgen-pass-5-design.md`](mcpgen-pass-5-design.md) — Pass 5 (Response Shaping) ✅
> - [`mcpgen-stage-e-design.md`](mcpgen-stage-e-design.md) — Stage E (Codegen, Jinja2 templates, native MCP tools, CF Workers) ✅
> - [`mcpgen-stage-f-design.md`](mcpgen-stage-f-design.md) — Stage F (Validation: F1 static + F2 smell scan + F3 agent eval, retry orchestration) ✅
> **Связанные:** `architecture.md` (system-level), `implementation-plan.md` (timeline), `irspec.md` (TODO, детальная схема IR).
> **Last updated:** 2026-04-26.

---

## 0. Зачем v2 (что изменилось vs v1)

v1 строился вокруг **token compression** как primary цели: 6 passes, цель — сжать descriptions на 50–70%. После research review (Anthropic engineering blog "Writing effective tools for agents", arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!", MCP spec 2025-03-26 на tool annotations) стало ясно:

- Anthropic явно говорит **не оптимизировать по длине**, а делать описания **explicit** (вплоть до сотен токенов на complex tools).
- 97.1% существующих MCP-серверов имеют как минимум один smell. 56% — Unclear Purpose. Это базовый рынок, на фоне которого «качественное описание» — реальный moat.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) — обязательная часть MCP spec, влияют на UX в Claude Desktop / Cursor (auto-approve vs confirmation prompts).
- Industry direction (Anthropic Skills, Cursor dynamic discovery) движется к progressive disclosure, **но это работает только для нативно дообученных клиентов**, не общий паттерн.

v2 разворачивает философию: **«MCP-quality по best practices Anthropic + paper rubric, валидированный реальным агентом»**. Token efficiency — побочный эффект, не цель.

## 1. Принципы

1. **Quality > compression.** Длина описания — instrumental, не цель. Цель — task success rate агента, который использует tool.
2. **Eval-driven generation.** Каждый сгенерированный сервер проходит agent-based evaluation перед deployment. Без eval — нет права говорить "MCP-quality".
3. **Best-practice as default.** По умолчанию все 6 components + annotations + namespacing. Opt-out возможен, opt-in не нужен.
4. **Build-time decisions over runtime hopes.** Архитектурные ограничения (max tools, composite synthesis, multi-server split) применяются на генерации. Не полагаемся на runtime decisions агента.
5. **Determinism where possible.** LLM используется только там, где задача требует natural-language reasoning. Annotations, structural validation, naming patterns — детерминированные правила, LLM только верифицирует edge cases.
6. **Caching is first-class.** Repeated generation того же spec'а не вызывает LLM. Это критично для unit economics.

## 2. Pipeline overview

```
                    OpenAPI / GraphQL / Postman input
                                  │
                                  ▼
             ┌──────────────────────────────────────┐
             │   STAGE A:  PARSE & NORMALIZE        │
             │   (deterministic, no LLM)            │
             └────────────────┬─────────────────────┘
                              │  Raw IR
                              ▼
             ┌──────────────────────────────────────┐
             │   STAGE B:  ARCHITECT                │
             │   (LLM, Opus-class)                  │
             │   Pass 0: Tool Inventory & Naming    │
             │   Pass 1: Six-Tool Pattern Consol.   │
             └────────────────┬─────────────────────┘
                              │  Pass1Output (6 universal + extras + routing)
                              ▼
             ┌──────────────────────────────────────┐
             │   STAGE C:  AUTHOR                   │
             │   (LLM, Sonnet-class, parallelizable)│
             │   Pass 2: Description Authoring      │
             │   Pass 3: Parameter Specification    │
             │   Pass 4: Annotations Inference      │
             └────────────────┬─────────────────────┘
                              │  Authored Tools
                              ▼
             ┌──────────────────────────────────────┐
             │   STAGE D:  RUNTIME SHAPING          │
             │   (mostly deterministic)             │
             │   Pass 5: Response Shaping           │
             └────────────────┬─────────────────────┘
                              │  Complete Server Spec
                              ▼
             ┌──────────────────────────────────────┐
             │   STAGE E:  CODEGEN                  │
             │   (deterministic, Jinja2)            │
             └────────────────┬─────────────────────┘
                              │  Generated Code
                              ▼
             ┌──────────────────────────────────────┐
             │   STAGE F:  VALIDATE                 │
             │   F1: Static (tsc, schema lint)      │
             │   F2: Smell scan (rubric judges)     │
             │   F3: Agent eval (sandbox-deployed)  │
             └────────────────┬─────────────────────┘
                              │
                              ▼
                       Final Artifact + Quality Report
```

Структурно: 6 LLM-passes (Pass 0–5), сгруппированных в 3 stage (Architect / Author / Shape), плюс 3 deterministic stage (Parse, Codegen, F1) и agent-based validation stage (F3).

**Почему grouping важно для retry-логики:** failure в Stage C не требует переделывать Stage B. Каждая stage — boundary для retry. Если Pass 2 (description) падает на конкретном tool — переделываем только Pass 2 для этого tool, не весь pipeline.

## 3. Stage A — Parse & Normalize

### 3.1 Цель

Спека любого формата → каноническая Universal IR (Intermediate Representation). Никакого LLM. Чисто детерминированный парсинг + structural enrichment.

### 3.2 Что делает

1. **Format detection.** OpenAPI 3.x / GraphQL / Postman — определяем по структуре (для MVP только OpenAPI).
2. **Parser dispatch.** OpenAPI → `prance` (resolves `$ref`); GraphQL → `graphql-core`; Postman → custom.
3. **IR construction.** Каждый endpoint → `Endpoint` IR object с полным metadata.
4. **Dependency graph extraction.** Какие endpoints возвращают IDs, которые потребляют другие? Это input для Pass 1 (composite synthesis).
5. **Spec metadata enrichment.** OpenAPI tags → preliminary categories, `x-codegen-*` extensions → user hints, `examples` → preserved для possible Pass 2 use.
6. **Validation.** spec не валиден → fail fast с actionable error, не идём в Stage B.

### 3.3 Output

`RawIR` объект:
```python
class RawIR(BaseModel):
    spec_format: Literal["openapi-3.0", "openapi-3.1", "graphql", "postman"]
    spec_hash: str  # sha256, для кэширования
    info: SpecInfo  # title, version, description
    endpoints: list[Endpoint]
    dependency_graph: DependencyGraph
    auth_schemes: list[AuthScheme]
    server_urls: list[str]
    raw_metadata: dict  # для отладки и passes которым нужна оригинальная инфа
```

### 3.4 Edge cases

- **Spec > 5MB.** Truncate с warning'ом. На v0 — hard limit 10MB (Workers bundle constraint).
- **Циклические `$ref`.** `prance` resolve'ит, мы детектим и помечаем endpoint как "requires manual review".
- **Endpoints без operationId.** Генерируем из method+path (`POST /v1/charges` → `post_v1_charges`), помечаем как `auto_named=true` для Pass 0.
- **Spec на не-английском.** Detect language. Если не EN — Pass 2 будет переводить descriptions; флаг `requires_translation=true` пропускается дальше.

## 4. Stage B — Architect (Pass 0 + Pass 1)

Эта stage отвечает за **архитектурные решения**: какие endpoints становятся tools, как они называются, какие из них объединяются. Это reasoning-heavy задачи → Opus 4.7.

### 4.1 Pass 0: Tool Inventory & Naming

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-0-design.md`](mcpgen-pass-0-design.md). Это summary; при противоречии Pass 0 design выигрывает.

**Что делает:**
1. Из всех endpoints решает, какие становятся tools, а какие — отбрасываются (deprecated, internal-only, low-value list-эндпоинты, дубли). Детализация в Pass 0 design §1.1 + DropReason enum.
2. Группирует tools по resource внутри сервера (server name = service prefix, дублировать НЕ нужно).
3. Назначает каждому tool snake_case name `{resource}_{action}` (`charges_create`, `customers_search`, НЕ `stripe_charges_create` — server name `stripe-mcp` уже даёт клиенту service prefix).
4. **Tiered tool count caps** (Pass 0 design §1.4):
   - ≤ 30: продолжаем нормально
   - 31–50: Pass 1 запускается обязательно
   - 51–80: Pass 1 агрессивно сворачивает; если всё ещё >50 — fail "split into multi-server"
   - >80: hard fail сразу с suggested top-level path prefixes
   - **Pro override:** `max_tools_override` поднимает cap до 100
5. **target_complexity** (user input): `minimal` ≤15 / `standard` ≤50 / `comprehensive` up to cap.
6. **Auth subsystem detection** (Pass 0 design §2): парсит `securitySchemes`, определяет recommended mode (passthrough / stored / oauth_flow), 3 модели передачи credentials, 7 типов auth. Pass 0 ТОЛЬКО detects; не запрашивает, не хранит, не делает test calls.

**Best practice compliance:**
- ✅ Anthropic: "Choose the right tools to implement (and not to implement)" — explicit drop.
- ✅ Anthropic: "Namespacing tools by service and resource" — resource prefix внутри сервера.
- ✅ Anthropic: "More tools don't always lead to better outcomes" — tiered hard caps.
- ✅ Anthropic: "Use imperative verbs" — Create/List/Refund/Search/Cancel.
- ✅ Paper rubric: "Purpose" component — clear naming улучшает Purpose score.

**Internal structure (Pass 0 design §3) — 3 stages:**
1. Deterministic filter ($0, < 100ms): deprecated, /internal/, /admin/, health/ping/status, OPTIONS/HEAD/TRACE, OAuth flow endpoints.
2. LLM filter + categorize: single Opus call на ВЕСЬ remaining set (НЕ per-endpoint — нужен holistic view). Cost $0.10–0.30, latency 10–30s.
3. Programmatic validation ($0, < 100ms): unique names, snake_case regex, count cap, source_endpoint_id existing, namespace conflicts.

**Chunked approach** (для > 200 endpoints): 4-phase pipeline (path-cluster → cluster decisions → per-cluster в parallel → cross-cluster merge). Cost ~$0.80, latency ~60s. Hard fail: > 1000 endpoints.

**Retry: 3 attempts → degraded fallback** (pure deterministic categorization based на tags + auto-naming). **Никогда не блокируем generation.**

**Output обогащается:**
- `dropped_endpoints` с DropReason enum + `can_user_override` для UI прозрачности и User Override Flow
- `composite_candidates` (suggestions для Pass 1, не финальные composites)
- `auth_requirements` для UI и codegen
- `flags` (spec_too_large, no_tags_detected, high_dropout_rate, requires_auth_flow_setup, questionable_decisions)

**Модель:** Opus 4.7 (Stage 2 single call — нужен holistic reasoning над структурой API).

**Параллелизация:** per-cluster (Stage 3 chunked phase 3).

### 4.2 Pass 1: Tool Consolidation via Six-Tool Pattern

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-1-design.md`](mcpgen-pass-1-design.md). Это summary; при противоречии Pass 1 design выигрывает. Старая v2 формулировка "Composite Tool Synthesis" — устарела после research review (Anthropic + OpenAI + MCP Bundles consensus, October 2025).

**Что делает:** консолидирует ~30–50 Pass 0 tool plans в **canonical Six-Tool Pattern** + минимальные extras.

**6 universal tools (always):**

| # | Tool | Параметры | Что делает |
|---|---|---|---|
| 1 | `search` | `query: string` (OpenAI standard) | Search by query → ranked results с smart IDs |
| 2 | `fetch` | `id: string` (OpenAI standard, smart ID) | Get full object by smart ID |
| 3 | `list_collections` | optional (pattern, include_schema, ...) | Discovery — какие data types существуют |
| 4 | `list_objects` | optional (collection, properties, filter, sort, limit, ...) | Browse объектов с фильтрами/пагинацией |
| 5 | `upsert` | `collection`, `data`, `id?`, `ids?` | Smart routing: create OR update; single OR batch |
| 6 | `delete` | `type`, `id?`/`ids?`/`collection?`, `confirm` | Smart routing по type parameter |

**Smart IDs** (mandatory): `{server}:{type}:{collection}:{identifier}` (`stripe:object:Charge:ch_xxx`). Routing logic в ID format, НЕ в tool definition.

**OpenAI compliance:** `search`/`fetch` exact signatures для ChatGPT Deep Research integration — bonus universal compatibility.

**Extras (sparingly, strict gates):**
- **Action tools** — POST endpoints с side effects, не CRUD (`charges_capture`, `messages_send`). Naming: `{namespace}_{verb}`.
- **Workflow tools** — 2–5 endpoints coherent task. ALL conditions: prescribed by API design + recoverable on partial failure + positive token economy. Pass 0 `composite_candidates` используются как hints для identification.
- **Specialized reads** — rare patterns не fit'ящие в `list_objects`. First try: can `list_objects(filter, sort_by, limit)` cover это? Yes → не создавать.

**Target final tool count: 6–12.** Anthropic Claude Code сам ~12. > 15 — warning, не fail.

**Зачем это критично:**

Industry consensus (Anthropic engineering blog "Writing effective tools for agents", OpenAI ChatGPT Deep Research integration requirements, MCP Bundles "Six-Tool Pattern"):

> Anthropic: "More tools don't always lead to better outcomes."
> Anthropic: "Litmus test — if a human engineer can't say which tool to use, agent can't either."
> Anthropic: "Instead of get_customer_by_id, list_transactions, list_notes — implement get_customer_context."

Empirical evidence (см. Pass 1 design §1.4):
- **omnisearch:** 20 tools (14,214 tokens) → 8 tools (5,663 tokens), 60% reduction.
- **Weaviate MCP:** 12 → 6 tools, identical functionality.
- **Anthropic test:** examples improved accuracy 72% → 90%.

Это наш **главный token efficiency mechanism** — не сжатие текста, а консолидация в canonical pattern. Expected ~70% token savings для typical API.

**Best practice compliance:**
- ✅ Anthropic: "Tools can consolidate functionality" — central recommendation.
- ✅ OpenAI: ChatGPT Deep Research compatibility through exact `search`/`fetch` signatures.
- ✅ MCP Bundles: Six-Tool Pattern proven across десятков production integrations.
- ✅ Решает token bloat без полагания на runtime tool selection.

**Coverage 100% MANDATORY** — Pass 1 НЕ должен терять функциональность. Validation в Phase 4. Coverage failure → retry Phase 2 с list missing endpoints; после 3 retry → degrade as `specialized_tools` с warning.

**Internal structure (4 phases):**
1. **Endpoint Classification** ($0, < 1s): каждый Pass 0 tool классифицируется (data_read_*, data_create/update/delete, action, workflow, specialized_read).
2. **Schema Synthesis** (Opus 4.7, $0.10–0.20, 10–15s): single LLM call — какие endpoints subsume каждый universal, какие parameters, smart ID schema, какие extras keep/drop.
3. **Routing Generation** ($0, < 1s): таблица routing per universal tool, используется в Stage E codegen.
4. **Coverage Validation** ($0, < 1s): coverage 100%, count ≤ 12 (warning), smart ID consistent, action rationale, workflow partial_failure handling.

**Модель:** Opus 4.7 (Phase 2 single call — holistic decisions критичны: что в `list_objects` параметрах зависит от того, что в `search`).

**Параллелизация:** Phase 2 — single call, не parallel.

### 4.3 Output Stage B

`ToolTaxonomy` (после Pass 0 — intermediate; финальный output после Pass 1):

```python
# Pass 0 output (intermediate — для Pass 1)
class Pass0Output(BaseModel):
    tool_plans: list[ToolPlan]                     # ~30–50 tools, namespaced
    dropped_endpoints: list[DroppedEndpoint]       # с DropReason
    namespaces: list[Namespace]
    composite_candidates: list[CompositeCandidate] # hints для Pass 1 workflow tools
    auth_requirements: AuthRequirement
    flags: Pass0Flags

# Pass 1 output (final Stage B → Stage C input)
class Pass1Output(BaseModel):
    universal_tools: SixToolSet                    # 6 канонических
    action_tools: list[ActionTool]                 # POST с side effects
    workflow_tools: list[WorkflowTool]             # multi-step, strict gate
    specialized_tools: list[SpecializedTool]       # rare reads
    smart_id_schema: SmartIdSchema                 # format всех IDs для server
    routing_config: RoutingConfig                  # для codegen
    coverage_report: CoverageReport                # 100% mandatory
    final_tool_count: int                          # target 6–12
    estimated_token_savings: int                   # vs Pass 0 baseline
```

→ Полные schemas (SixToolSet, ToolDefinition, ActionTool, WorkflowTool, SmartIdSchema, RoutingRule): [`mcpgen-pass-1-design.md` §6](mcpgen-pass-1-design.md).

## 5. Stage C — Author (Pass 2 + Pass 3 + Pass 4)

Эта stage наполняет каждый ToolPlan конкретным content'ом. Параллелизуется per-tool — самая дорогая часть pipeline'а в LLM-токенах.

### 5.1 Pass 2: Description Authoring

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-2-design.md`](mcpgen-pass-2-design.md). Это summary; при противоречии Pass 2 design выигрывает.

**Что делает:** для каждого tool пишет structured description с **5 of 6 paper rubric components в v0** (Examples deferred к v1.1 — требуют execution traces). Different prompt templates per tool type: universal/action/workflow/specialized.

**5 components (v0):** Purpose · Guidelines (when_to_use + when_not_to_use + how_to_use) · Limitations · Parameter overview (high-level, not per-param) · Length & Completeness (meta).

**Examples (component 6) — deferred:** ONLY from spec в v0 (`examples = null` иначе). Никакой LLM-hallucinated examples (paper §4.4.2 explicitly: "Removing the Examples component does not statistically degrade performance").

**Output schema:**
```python
class ToolDescription(BaseModel):
    purpose: str                       # Component 1: 1–3 sentences
    guidelines: Guidelines             # Component 2: When + How (см. ниже)
    limitations: list[str]             # Component 3: constraints, side effects, failure modes
    parameter_overview: str            # Component 4: high-level (150-300 chars). Per-param details — Pass 3.
    examples: list[Example] | None     # Component 6: null v0 unless from spec
    # Length & Completeness — meta-quality validation, не отдельное поле

class Guidelines(BaseModel):
    when_to_use: list[str]             # bullets — concrete situations
    when_not_to_use: list[str] | None  # для tools с близкими альтернативами (universal vs alts)
    how_to_use: str | None             # str (НЕ list[str]) — для нетривиальных tools
```

**Length budgets per tool type** (Pass 2 design §11):

| Tool type | Min | Target | Max |
|---|---|---|---|
| Universal (search/fetch/list_*/upsert/delete) | 200 | 300 | 400 |
| Action | 100 | 150 | 200 |
| Workflow | 150 | 200 | 300 |
| Specialized read | 80 | 120 | 150 |

**Internal pipeline (4 phases):**
1. **Tool classification & batching** ($0, < 1s): determine type → template → length budget.
2. **Per-tool description generation** (Sonnet 4.7, parallel concurrency 10, ~$0.30–0.50 per server, 30–60s).
3. **Inline quality gate** (Haiku judge, parallel concurrency 10, ~$0.05–0.10 per server, 10–20s): abbreviated 4-component rubric (Purpose / Guidelines / Limitations / Parameter overview), threshold ≥ 3. Не путать с full F2 smell scan.
4. **Programmatic validation** ($0, < 1s): length budgets, all components present, no forbidden patterns, examples = null OR from spec.

**Forbidden patterns (Pass 2 regex catch):** marketing ("powerful", "elegant"), filler ("you can", "this tool allows"), tautology ("this list tool lists"), vague ("various", "appropriate").

**Best practice compliance:**
- ✅ 5 of 6 components from paper rubric (Examples deferred — paper says no statistical degradation).
- ✅ Anthropic: "Think of how you would describe your tool to a new hire on your team."
- ✅ Anthropic: "Make implicit context explicit."
- ✅ Different templates per tool type — universal tools rich (subsume много), actions focused (safety-critical), workflows orchestration-aware.

**Модель:** Sonnet 4.7 (баланс quality/cost для creative writing). Inline gate — Haiku 4.5.

**Параметры:** `temperature=0.5` (творчество vs детерминированность; для Pass 4 будет 0.0).

**Параллелизация:** per-tool, parallel (concurrency=10), независимы друг от друга.

**Anthropic prompt caching:** system prompt каждого template (~3000 токенов) — кэшируется на каждый pass run. Эффект: -70% после первого call в сессии.

### 5.2 Pass 3: Parameter Specification

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-3-design.md`](mcpgen-pass-3-design.md). Это summary; при противоречии Pass 3 design выигрывает.

**Что делает:** производит production-ready JSON Schema (`inputSchema`) с rich per-parameter descriptions для каждого tool. Главная цель — устранить **Opaque Parameters smell** (84.3% существующих MCP по paper). Pass 3 — second по importance после Pass 2.

**5 dimensions per parameter:**
1. **Naming** — unambiguous даже в isolation: `user → user_id`, `data → payload`, `id (ambiguous) → {entity}_id`, `time → created_at`, `status → {entity}_status`.
2. **Format & Constraints** — explicit `format: email/date/date-time/uri/uuid`, `pattern`, `min/max`, `minLength/maxLength`.
3. **Enums** — use liberally where domain finite. Without spec enum — LLM infers из docs.
4. **Defaults** — каждый optional parameter получает default. Prefer spec.default; sensible defaults (limit=25, offset=0, sort_order="desc") когда spec не provides.
5. **Description** — 5-component MCP Bundles template (см. ниже).

**5-component parameter description (MCP Bundles template) — ОБЯЗАТЕЛЬНО:**
1. **What it is** (1 sentence)
2. **Possible values / format / range**
3. **When to use it / what it affects**
4. **Example** (concrete, copy-pastable, **safe** — value example, не result example)
5. **Default / omission behavior** (для optional)

**Filter parameter — 3 approaches (deterministic selection rule):**

| Approach | Когда | Param name | Schema |
|---|---|---|---|
| **A. Structured Object** (DEFAULT) | Most cases | `filter` | `{property, operator, value}`, operators enum |
| **B. DSL String** | Underlying API имеет SQL/GraphQL native | `where` | `string` с DSL syntax + 3+ examples |
| **C. Individual Filter Params** (≤ 4) | Simple cases с 1–2 fixed filters | per-field | typed enum/string |

Decision rule: SQL/GraphQL → B; ≤2 simple equality fields → C; иначе → A.

**Smart ID parameter** — pattern auto-generated из Pass 1 `SmartIdSchema`. Description includes format `{server}:{type}:{collection}:{identifier}` + plain identifier fallback.

**Per-tool-type strategies:**
- **Universal Discovery** (search/fetch) — single-string OpenAI standard.
- **Universal List** — rich set: collection (req) · properties (default `[]`) · filter (one of 3) · sort_by · sort_order (enum, default "desc") · limit (default 25, max 100) · offset (default 0).
- **Unified Write** — smart routing: `upsert.data: oneOf [object, array]`, `delete.type: enum`, `delete.confirm` required для type="collection".
- **Action** — domain-specific, focused, every parameter explicit.
- **Workflow** — coarse parameters (user intent), НЕ internal step IDs.

**Standard parameter sets** (Pass 3 design Appendix A) — consistent naming/types across servers.

**Output:** production-ready `inputSchema` (`type: "object"`, `properties` per-param, `required`, `additionalProperties: false`) валидный через ajv.

**Output schema (Pass3Output → ToolWithFullSchema → JsonSchema → ParameterSchema):**

```python
class ParameterSchema(BaseModel):
    type: str                               # JSON Schema type
    description: str                        # rich, 5-component template
    enum: list | None = None
    format: str | None = None               # email, date, uri, etc.
    pattern: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    minLength: int | None = None
    maxLength: int | None = None
    default: Any = None
    examples: list[Any] | None = None       # parameter value examples (safe)
    items: dict | None = None               # for arrays
    properties: dict | None = None          # for nested objects (rare)
    oneOf: list[dict] | None = None         # for upsert.data type
```

**Internal pipeline (4 phases):**
1. **Schema extraction** ($0, < 1s): pull from spec — type/format/enum/min/max/pattern/default/required. Identify filter и smart ID params. Detect ambiguous names.
2. **Per-parameter LLM enrichment** (Sonnet 4.7, parallel **concurrency 20**, $0.20–0.40 per server, 30–50s): rich descriptions, examples, rename ambiguous, infer enums.
3. **Cross-parameter validation** ($0, < 1s): uniqueness, mutual exclusivity, JSON Schema validity (ajv), filter approach matches one of 3, no deep nesting (depth > 3 flagged).
4. **Inline quality gate** (Haiku 4.5, $0.05, 10–15s): single judge per tool, parameter-specific 5-component rubric (Naming · Description completeness · Format/constraint accuracy · Example quality · Default/optional clarity), threshold ≥ 3.

**Cost per server** (10 tools, ~80 params): ~$0.30–0.50.

**Defaults policy:** prefer spec defaults always (don't second-guess API designer); sensible defaults только когда spec не provides.

**Examples policy:** generate value examples (format/structure), НЕ result examples. Safe.

**Sanitize all spec text** — treat as untrusted input (prompt injection prevention).

**Best practice compliance:**
- ✅ Anthropic: "Input parameters should be unambiguously named: instead of `user`, try `user_id`."
- ✅ Anthropic: "Strict data models" в JSON schema.
- ✅ Anthropic: "Use enums to constrain parameters to valid values."
- ✅ Anthropic: "Smart defaults reduce friction."
- ✅ MCP Bundles 5-component template для each parameter.
- ✅ Paper: explicit format specs в parameter descriptions улучшают parameter accuracy.
- ✅ MCP spec 2025-06-18 JSON Schema requirements.

**Модель:** Sonnet 4.7 (Phase 2 enrichment) + Haiku 4.5 (Phase 4 inline gate).

**Параллелизация:** per-parameter (Phase 2 concurrency 20).

### 5.3 Pass 4: Annotations Inference

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-4-design.md`](mcpgen-pass-4-design.md). Это summary; при противоречии Pass 4 design выигрывает. Старая HTTP-method-based logic заменена на **tool-type-based rules** (Pass 1 result).

**Что делает:** определяет 4 boolean hints + `title` для каждого tool. **80% deterministic** через tool-type rules + verb pattern matching. Самый дешёвый и быстрый pass: ~$0.01–0.05, 5–15s.

**⚠ MCP defaults опасны:** `destructiveHint: true`, `openWorldHint: true` by default → каждый невыставленный tool вызывает confirmation prompts в Cursor. Pass 4 ВСЕГДА выставляет все 4 явно.

**⭐ Architectural invariant:** `openWorldHint = true` ВСЕГДА (мы wrap external REST APIs). Hardcoded.

**Tool-type-based rules** (а НЕ HTTP method, как в pre-Pass-1 logic):

| Tool type | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| `search`, `fetch`, `list_collections`, `list_objects`, `specialized_read` | true | false | true | **true** |
| `upsert` | false | false | **false** (creates → дубликаты возможны) | **true** |
| `delete` | false | **true** | **true** (re-delete = no-op) | **true** |
| `action` | verb pattern (Pass 4 Appendix B) ИЛИ Haiku LLM | | | **true** |
| `workflow` | conservative aggregation: AND across subs | OR across subs | AND across subs | **true** |

**Action verb patterns (high-confidence, Pass 4 Appendix B):**
- `_refund/_reverse/_undo` → destructive=true, idempotent=false
- `_cancel/_void/_revoke` → destructive=true, idempotent=true
- `_archive/_soft_delete` → destructive=true, idempotent=true
- `_capture/_charge/_pay` → destructive=false, idempotent=false
- `_unlock/_enable/_activate` → destructive=false, idempotent=true
- Medium-confidence (`_send/_lock/_publish/_notify/_dispatch`) → Haiku LLM review

**Workflow tools — conservative aggregation:**
```python
readOnly = ALL sub-endpoints are readOnly       # any write breaks it
destructive = ANY sub-endpoint is destructive   # one bad apple
idempotent = ALL sub-endpoints are idempotent
```

**Title generation** — deterministic snake_case → Title Case (`charges_capture` → "Capture Charge"). Verb reordering для action tools. Strip "Tool"/"Function"/"API" suffixes. LLM polish — Pro feature post-MVP.

**Internal pipeline (3 phases):**
1. **Deterministic rules** ($0, < 1s): apply tool-type rules + verb patterns + title generation. Mark `_needs_llm_review` для low-confidence cases.
2. **LLM judgment selectively** (Haiku 4.5, **concurrency 5**, $0.01–0.03, 3–10s): only for tools marked `_needs_llm_review` (typically 0–3 per server). Single Haiku call per tool — boolean classification.
3. **Consistency validation** ($0, < 1s): auto-fix consistency rules.

**Consistency rules** (Phase 3):
- `readOnly=true` → auto-fix `idempotent=true` (reads inherently idempotent — MCP filesystem server gold standard, GitHub issue #3402)
- `destructive=true` → auto-fix `readOnly=false` (logically impossible)
- `openWorldHint != true` → force true (architectural invariant)
- Title ≤ 50 chars, без "Tool"/"Function"/"API" suffixes

**Conservative defaults when uncertain:** readOnly=false, destructive=true, idempotent=false. UX safety > optimization.

**PUT vs PATCH detection** для updates: PUT (replace) → destructive=true; PATCH (merge) → destructive=false.

**Annotations — UX hints, НЕ безопасностные гарантии** (MCP blog). Real safety — в actual implementation.

**Best practice compliance:**
- ✅ MCP spec 2025-03-26 — full compliance.
- ✅ MCP blog "Tool Annotations as Risk Vocabulary" — exactly the recommended pattern.
- ✅ OpenAI Apps SDK — same recommendation.
- ✅ MCP filesystem server gold standard — "reads are inherently idempotent".

**Модель:** Haiku 4.5 для LLM-verification step (boolean classification — cheap model достаточен).

**Параллелизация:** Phase 2 — concurrency 5. ~80% tools обрабатываются deterministically без LLM.

### 5.4 Output Stage C

`AuthoredTools` — все ToolPlan'ы Stage B, обогащённые description/parameters/annotations:

```python
class AuthoredTool(BaseModel):
    name: str
    type: Literal["regular", "composite"]
    description: ToolDescription          # Pass 2
    parameters: list[Parameter]           # Pass 3
    annotations: ToolAnnotations          # Pass 4
    upstream: UpstreamCall | list[UpstreamCall]  # composite — multiple
    orchestration: Sequential | Parallel | Conditional | None
    estimated_input_tokens: int           # для quality budgets
    source_endpoints: list[str]
```

## 6. Stage D — Runtime Shaping (Pass 5)

### 6.1 Pass 5: Response Shaping

> ⚠ **Полный detail design — отдельный документ:** [`mcpgen-pass-5-design.md`](mcpgen-pass-5-design.md). Это summary; при противоречии Pass 5 design выигрывает. Старая v2 формулировка (5 sub-задач включая `semantic_id_mapping`, `response_format_options`, `field_inclusion_concise/detailed`) **устарела**.

**Что делает:** устраняет **response token bloat** (часто больше чем schema bloat) и генерирует `outputSchema` (MCP 2025-06-18 standard). Pass 5 — последний LLM-pass перед codegen.

**Two token problems:**
- Schema bloat (input — solved by Pass 1)
- **Response bloat (output — Pass 5 main fight)** — real example: HRIS list_employees 50 fields × 100 records = 80K tokens raw → 8K с filtering (10x reduction).

**5 mechanisms (ОБЯЗАТЕЛЬНЫЕ для всех tools):**

1. **outputSchema generation (NEW MCP 2025-06-18)** — каждый tool получает JSON Schema для response. `structuredContent + content` dual return для backward compat. Универсальные tools subsume много endpoints → use `oneOf` или generic с `additionalProperties: true`.
2. **Pagination strategy + defaults** — auto-detect cursor (preferred, MCP canonical) / offset / page-number из spec. Default `limit=25`, `max_limit=100`, `default_offset=0`.
3. **Field filtering defaults** — 3 categories:
   - **Always-include:** identifiers, status, primary content (name/title), critical timestamps, required spec fields.
   - **Opt-in via `properties` param:** verbose nested objects, metadata blobs, large content blobs, audit logs.
   - **Always-exclude:** sensitive PII, internal-only, deprecated fields.
4. **Truncation thresholds + teaching guidance** (per tool type — НЕ единый 25K, как в старой v2):

   | Tool type | Threshold |
   |---|---|
   | search | 10K tokens |
   | list_objects | 15K tokens |
   | fetch | 20K tokens |
   | action / upsert / delete | 5K tokens |
   | workflow | 15K tokens |

   Truncation message — **teaching moment, не info.** Templates с placeholders (`{N}`, `{Total}`, `{action}`) — Pass 5 design Appendix A.
5. **Optional `response_format` enum** — `summary/detailed/raw`. Default `summary`. Добавляется ТОЛЬКО для tools с > 20 fields и varied use cases.

**Pagination detection** (deterministic, Pass 5 design §11):
- Cursor signals: `cursor`/`page_token`/`after`/`starting_after` в request, `next_cursor`/`nextCursor`/`next_page_token` в response → **cursor**
- `offset`/`skip` в request → **offset**
- `page`/`page_number` + `per_page` → **page_number**
- Else → no pagination, conservative truncation

**Conservative bias for field filtering** — when uncertain prefer opt-in. Better agent request a field than burn tokens на unused data.

**Internal pipeline (5 phases):**
1. **Pagination strategy detection** ($0, < 1s) — det auto-detect.
2. **Output schema extraction** ($0, < 1s) — pull spec response schemas, convert to JSON Schema, wrap с metadata.
3. **Field importance ranking** (Haiku 4.5, **concurrency 10**, $0.05–0.10, 10–15s) — single Haiku call для tools с > 10 response fields. Classify: always-include / opt-in / exclude.
4. **Truncation guidance authoring** (templates + minor LLM polish, $0–0.02, 2–5s) — apply tool-type-specific template; LLM polish optional.
5. **Validation** ($0, < 1s) — outputSchema present, pagination consistent, thresholds reasonable, default fields non-empty, guidance contains placeholders.

**Best practice compliance:**
- ✅ MCP spec 2025-06-18 — outputSchema standard, structuredContent + content dual return.
- ✅ Anthropic: "Returning meaningful context" — pagination/truncation/filtering.
- ✅ Anthropic: truncation as teaching — guidance templates teach next step, not just info.
- ✅ StackOne production data (200+ connectors) — response bloat addressed.
- ✅ Blockscout MCP patterns — phase-based content, context-aware pagination.

**Модель:** Haiku 4.5 для Phase 3 field ranking (cheaper than Sonnet, classification task).

**Mostly deterministic:** ~70% (pagination, output schema, validation). LLM only для field importance ranking + optional truncation polish.

### 6.2 Output Stage D

`FinalTool` (Pass 5 output, ready для codegen):

```python
class FinalTool(BaseModel):
    name: str
    description: ToolDescription                  # Pass 2
    description_text: str                         # Pass 2
    inputSchema: JsonSchema                       # Pass 3
    outputSchema: JsonSchema                      # NEW Pass 5 (MCP 2025-06-18)
    annotations: ToolAnnotations                  # Pass 4
    response_config: ResponseConfig               # NEW from Pass 5

class ResponseConfig(BaseModel):                  # Pass 5 design — refined
    pagination: PaginationConfig | None           # для list-type tools
    field_filtering: FieldFilteringConfig | None
    truncation: TruncationConfig
    has_response_format_param: bool

class PaginationConfig(BaseModel):
    strategy: Literal["cursor", "offset", "page_number"]
    cursor_param_name: str | None                 # "cursor", "page_token", "next_token"
    cursor_response_field: str                    # "next_cursor", "nextCursor"
    default_limit: int                            # 25
    max_limit: int                                # 100

class FieldFilteringConfig(BaseModel):
    default_fields: list[str]                     # always-include
    optional_fields: list[str]                    # opt-in via properties param
    excluded_fields: list[str]                    # always-exclude (sensitive/internal)

class TruncationConfig(BaseModel):
    threshold_tokens: int                         # per tool type (5K-20K)
    guidance_template: str                        # message с {placeholders}
    truncation_strategy: Literal["paginate", "filter", "summarize"]

class CompleteServerSpec(BaseModel):
    name: str
    version: str
    tools: list[FinalTool]
    runtime_config: RuntimeConfig                 # rate limits, timeouts, retry
    auth_config: AuthConfig
```

> ⚠ Старые поля `truncation_threshold_tokens`, `response_format_options`, `semantic_id_mapping`, `field_inclusion_concise/detailed`, `FullyShapedTool`/`AuthoredTool` — **устарели**. Smart IDs handled by Pass 1, не Pass 5.

## 7. Stage E — Codegen

Чисто детерминированный — Jinja2 templates над `CompleteServerSpec`.

### 7.1 Что генерируется

```
generated/<server-name>/
├── package.json
├── tsconfig.json
├── wrangler.toml          # для Cloudflare Workers
├── src/
│   ├── server.ts          # MCP server entry
│   ├── tools/             # один файл на tool — naming {resource}_{action} (Pass 0 design)
│   │   ├── charges_create.ts
│   │   ├── charges_list.ts
│   │   └── ...
│   ├── upstream/          # HTTP клиент к upstream API
│   ├── auth/              # auth handling (passthrough / stored)
│   └── runtime.ts         # response shaping, error handling, usage events
├── tests/
│   ├── smoke.test.ts      # tools/list returns expected
│   └── tool-snapshots.test.ts
├── README.md              # auto-generated, install instructions
└── .mcpgen.yaml           # config для re-runs
```

### 7.2 Templates

Один tool — один `.ts.j2` шаблон, рендерится с `FullyShapedTool` контекстом. Шаблоны живут в `packages/codegen-templates/` (отдельный package в монорепе).

### 7.3 Bundling

Bundle через Wrangler / esbuild. Target: ES2022, ESM. Bundle size budget: 1MB сжато (Workers limit 10MB, безопасный margin).

### 7.4 Что НЕ делается тут

- LLM не вызывается. Если что-то не генерится корректно — это bug в шаблонах или в input data, не "перегенерируем через LLM".
- Optimization. Все architectural decisions приняты раньше.

## 8. Stage F — Validate

Three layers, fail-fast от дешёвой к дорогой.

### 8.1 F1: Static validation

**Что:**
- `tsc --noEmit` — TypeScript компилируется
- `ajv` — каждый tool inputSchema валиден JSON Schema 7
- ESLint — basic style
- Bundle size check — < 1MB сжато
- MCP spec compliance check — `tools/list`, `tools/call` методы корректны

**Cost:** ~5 секунд, $0.

**Failure handling:** fail в F1 — bug в наших шаблонах. Hard error, alert разработчику. Не fix через LLM retry.

### 8.2 F2: Smell scan

**Что:** применяем rubric из paper для каждого сгенерированного description. 6 компонентов × 5-point scale × 3 LLM judges (как в paper для надёжности).

**Implementation:**
```python
async def smell_scan(tool: FullyShapedTool) -> SmellReport:
    judges = [
        run_judge("claude-haiku-4.5", tool, rubric_prompt),
        run_judge("gpt-5-mini", tool, rubric_prompt),
        run_judge("gemini-2.5-flash", tool, rubric_prompt),  # multi-family
    ]
    scores = await asyncio.gather(*judges)
    avg_per_component = average_per_component(scores)
    smells = [c for c, score in avg_per_component.items() if score < 3]
    return SmellReport(component_scores=avg_per_component, smells=smells)
```

**Threshold:** average ≥ 3 на каждый компонент (Purpose, Guidelines, Limitations, Parameters, Length, Examples). Если ниже — retry соответствующего pass'а.

**Cost:** ~$0.03 per tool, ~$1.50 на сервер с 50 tools.

**Failure handling:** failed component → retry соответствующего pass с stricter prompt + judge feedback. Max 2 retries per tool. После — флаг "manual review needed" в quality report.

### 8.3 F3: Agent eval

**Что:** реальный LLM agent runs golden tasks against sandbox-deployed server.

**Pipeline:**
1. Сгенерированный сервер деплоится в sandbox CF Worker namespace (TTL 1 час).
2. Загружаются golden tasks (см. § 8.4).
3. Запускается Sonnet 4.7 agent в loop'е: prompt, tools, до решения или max 10 turns.
4. Метрики: success rate (passes evaluator), tool calls count, errors, total tokens.

**Threshold:** success rate ≥ 70% на golden tasks. Below — flag affected tools, retry, или ship с warning.

**Cost:** $0.20–0.50 per generation. Самая дорогая часть pipeline.

**Pricing implication (см. system architecture):**
- Free tier: 1 eval/мес. Beyond — generation works, eval skipped, quality report помечается "unverified".
- Pro: 5/мес included.
- Pay-as-you-go: $0.50 per eval.

### 8.4 Golden tasks: source

| Source | Когда применяется |
|---|---|
| **Pre-curated** для popular APIs (Stripe, GitHub, Notion, Linear, Slack) | Эти specs кэшированы у нас; tasks написаны вручную, по 5–10 на category. |
| **Auto-generated** через LLM из endpoint patterns | Custom user specs. Weaker signal, помечаются как "auto-generated tasks". |
| **User-provided** | Pro feature: пользователь загружает свои task suite (на v1.1, не MVP). |

### 8.5 Output Stage F

`QualityReport`:
```python
class QualityReport(BaseModel):
    overall_score: float                  # 0–5
    smell_report: SmellReport             # Pass-level rubric scores
    eval_report: EvalReport | None        # null если skipped
    tool_scores: dict[str, ToolQuality]   # per-tool detail
    warnings: list[str]
    is_publishable: bool                  # все required gates passed

class EvalReport(BaseModel):
    success_rate: float                   # 0–1
    avg_tool_calls_per_task: float
    avg_tokens_per_task: int
    failed_tasks: list[FailedTask]        # для debug
    transcripts_r2_key: str               # для Pro inspection
```

## 9. Cross-cutting механизмы

### 9.1 Model routing

Single config-файл `model_routing.yaml`:

```yaml
passes:
  inventory:       { primary: claude-opus-4.7,    fallback: gpt-5,         temperature: 0.3 }
  composite:       { primary: claude-opus-4.7,    fallback: gpt-5,         temperature: 0.5 }
  description:     { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.5 }
  parameters:      { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.2 }
  annotations:     { primary: claude-haiku-4.5,   fallback: gpt-5-mini,    temperature: 0.0 }
  response_shape:  { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.3 }
  # Stage F design ОБНОВИЛ models для F2 — production quality bar (per MCP-Bench paper)
  smell_judge_a:   { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.0 }
  smell_judge_b:   { primary: gpt-5,              fallback: gpt-5-mini,    temperature: 0.0 }
  smell_judge_c:   { primary: gemini-3.5-pro,     fallback: gemini-flash,  temperature: 0.0 }
  eval_agent:      { primary: claude-sonnet-4.7 }  # должен матчить tier юзера

cost_caps:
  per_generation_usd: 2.00
  per_pass_usd: 0.50
  daily_org_usd: 50.00
```

Routing через LiteLLM с fallback chain. Cost tracking в Langfuse + наш Postgres. Cost cap превышен — hard fail с message "spec too complex, contact support".

### 9.2 Quality gating + retry loop

После каждого pass — rubric check (только для passes которые продуцируют natural language: 0, 1, 2, 5):

```
LLM pass produces output
    ↓
Programmatic validation (regex, schemas, length, forbidden phrases)
    ↓ pass
Inline quality check (single-judge быстрый, не F2 full scan)
    ↓ avg score >= 3
Continue
    ↓ avg score < 3
Retry с stricter prompt + judge feedback (max 2 retries)
    ↓ still failing
Mark tool as "needs_manual_review", continue but flag в QualityReport
```

Inline check — дешевле (один Haiku judge), не блокирует pipeline. Full F2 scan — на финальном этапе, более thorough.

### 9.3 Caching по уровням

```
Layer 1 — Spec-level
    Key: sha256(spec_content)
    Stored: pre-generated full artifact (для popular APIs)
    Hit-rate target: 30% (для users генерящих популярные APIs)

Layer 2 — Pass-level
    Key: (pass_name, pass_version, input_hash, model_id)
    Stored: pass output object
    Hit-rate target: 80% при regeneration того же spec'а

Layer 3 — Tool-level
    Key: (tool_signature_hash, pass_name, pass_version)
    Stored: per-tool pass output
    Hit-rate target: 90%+ при partial spec change

Layer 4 — Anthropic prompt caching
    System prompts cached automatically (5 min TTL)
    Эффект: -90% input cost на repeated runs
```

### 9.4 Anthropic prompt caching конкретика

System prompt каждого pass'а структурирован:
```
[CACHED — 2000-3000 tokens]
- Best-practice rubric (6 components)
- Pass-specific guidelines
- Examples of good/bad output

[NOT CACHED — variable]
- This specific tool's input
```

Caching применяется через `cache_control: ephemeral` blocks в Anthropic API. Эффект: первый call — full price, subsequent calls в той же 5-min window — 90% discount на cached part.

### 9.5 Cost budget enforcement

Каждый job стартует с budget:
- Free tier: $0.50 max per generation
- Pro: $2.00 max
- Beyond: configurable

Превышение — fail с partial result + актуальный bill. Никаких "сюрпризов в счёте".

### 9.6 IR расширение для v2

```python
class Tool(BaseModel):
    # Identity
    name: str                              # snake_case, {resource}_{action} (Pass 0 design — no service prefix)
    type: Literal["regular", "composite"]
    namespace: str                         # "charges" (resource only — server name даёт service prefix клиенту)
    
    # Authoring (Stage C)
    description: ToolDescription           # 6 components
    parameters: list[Parameter]
    annotations: ToolAnnotations           # MCP spec annotations
    
    # Runtime (Stage D)
    response_config: ResponseConfig
    
    # Upstream
    upstream: UpstreamCall | list[UpstreamCall]
    orchestration: Sequential | Parallel | Conditional | None
    
    # Source tracking
    source_endpoints: list[str]
    
    # Metrics
    quality_score: float | None            # после F2
    eval_success_rate: float | None        # после F3
    estimated_input_tokens: int
    estimated_output_tokens_p50: int
    
    # Flags
    needs_manual_review: bool
    has_examples: bool                     # false на v0


class ToolDescription(BaseModel):           # Pass 2 design — 5 of 6 paper rubric components в v0
    purpose: str                            # Component 1: 1–3 предложения
    guidelines: Guidelines                  # Component 2: when + how
    limitations: list[str]                  # Component 3: constraints, side effects, failure modes
    parameter_overview: str                 # Component 4: high-level (150-300 chars). Per-param details — Pass 3.
    parameter_doc: dict[str, ParamDoc]      # Pass 3 output (per-parameter detailed)
    examples: list[Example] | None          # Component 6: null v0 unless from spec; никакой LLM-hallucinated


class Guidelines(BaseModel):                # Pass 2 design
    when_to_use: list[str]                  # bullets — concrete situations
    when_not_to_use: list[str] | None       # для tools с близкими альтернативами (universal vs alts)
    how_to_use: str | None                  # str (НЕ list[str]) — для нетривиальных tools


class ParamDoc(BaseModel):                  # Pass 3 output
    description: str
    format_hint: str | None                 # "yyyy-mm-dd", "iso8601"
    examples: list[str] | None
    common_mistakes: str | None             # "Don't pass timezone offset"


class ToolAnnotations(BaseModel):
    title: str | None
    readOnlyHint: bool | None
    destructiveHint: bool | None
    idempotentHint: bool | None
    openWorldHint: bool | None


class ResponseConfig(BaseModel):                 # Pass 5 design — refined schema
    pagination: PaginationConfig | None          # для list-type tools
    field_filtering: FieldFilteringConfig | None # always-include / opt-in / always-exclude
    truncation: TruncationConfig                 # threshold (per tool type) + guidance template
    has_response_format_param: bool              # response_format enum (summary/detailed/raw)


class PaginationConfig(BaseModel):               # Pass 5 design
    strategy: Literal["cursor", "offset", "page_number"]
    cursor_param_name: str | None                # "cursor", "page_token", "next_token"
    cursor_response_field: str                   # "next_cursor", "nextCursor"
    default_limit: int                           # 25
    max_limit: int                               # 100


class FieldFilteringConfig(BaseModel):           # Pass 5 design
    default_fields: list[str]                    # always-include (id, status, name, timestamps, required)
    optional_fields: list[str]                   # opt-in via properties param (verbose, metadata, blobs)
    excluded_fields: list[str]                   # always-exclude (sensitive PII, internal, deprecated)


class TruncationConfig(BaseModel):               # Pass 5 design
    threshold_tokens: int                        # per tool type: search 10K / list 15K / fetch 20K / action 5K / workflow 15K
    guidance_template: str                       # teaching message с {N}, {Total}, {action} placeholders
    truncation_strategy: Literal["paginate", "filter", "summarize"]


# > ⚠ Старые поля (truncation_threshold_tokens=25000, response_format_options, semantic_id_mapping,
# > field_inclusion_concise/detailed) — устарели после Pass 5 detail design.


# Pass 1 — Six-Tool Pattern routing
class SmartIdSchema(BaseModel):              # для server smart IDs: {server}:{type}:{coll}:{id}
    server_prefix: str                       # "stripe"
    types: list[str]                         # ["object", "collection", "schema"]
    collections: list[CollectionDef]


class CollectionDef(BaseModel):
    name: str                                # "Charge"
    identifier_pattern: str                  # "ch_[A-Za-z0-9]+"
    upstream_path: str                       # "/v1/charges/{id}"


class RoutingRule(BaseModel):                # как universal tool params → upstream
    tool: str                                # "fetch", "upsert", ...
    condition: dict                          # {id_type: "object", collection: "Charge"}
    upstream_method: str
    upstream_path: str
    parameter_mapping: dict


class WorkflowDef(BaseModel):                # для workflow tools (Pass 1 extras)
    orchestration: Literal["sequential", "parallel", "conditional"]
    sub_calls: list[UpstreamCall]
    handles_partial_failure: bool
    intermediate_state: dict | None          # passing данных между шагами
```

> ⚠ Старая `CompositeOrchestration` class удалена. Workflow tools (Pass 1 extras) используют `WorkflowDef` с тем же sequential/parallel/conditional. Universal tools используют `RoutingRule` для smart routing по smart IDs.

## 10. Что НЕ в MVP (v0) — explicit decisions

### 10.1 Examples generation через execution traces ⚠

**Best-practice gap.** Paper и Anthropic recommendations говорят: examples must be grounded in real execution. Без этого они hallucinated.

**Решение для v0:** `examples = null` для большинства tools. Если в OpenAPI spec есть `examples` поля — preserve и помечаем как "from spec". Никакой LLM-generation examples без traces.

**Когда добавляем:** v1.1, требует sandbox execution с upstream API credentials.

### 10.2 Progressive disclosure / search_tools meta-tool ⚠

**Полностью отказались.** Detailed reasoning:

Anthropic Tool Search Tool — server-side feature на API уровне, работает потому что Claude дообучен на этот паттерн через RL. Cursor's dynamic discovery — их собственный orchestrator, не runtime tool. Anthropic Skills — то же.

Наш `search_tools` MCP-tool был бы видимым tool, который агент должен **осознанно решить вызвать, а потом вызвать снова если выборка неполная**. Из практики: 90% LLM (не дообученных Anthropic'ом) останавливаются после первого вызова и считают результат authoritative complete list.

MCP-клиенты разные (Cursor, Cline, Continue, Goose, custom LangGraph) — у нас нет контроля над их system prompts. Что работает в Claude Desktop, может ломаться в Cline.

Нет публичного benchmark под наш конкретный сценарий.

**Что вместо:** архитектурные решения на build-time (см. § 4.1):
- Hard cap 50 tools per server
- Aggressive composite tool synthesis (Pass 1)
- Multi-server pattern для больших API (Stripe → 3 specialized servers, не один monolith)

**Когда возвращаемся к вопросу:** только если (a) появится independent benchmark с >95% success rate на топ-3 MCP клиентах, ИЛИ (b) MCP spec введёт это как первоклассный protocol-level mechanism с поддержкой клиентов.

### 10.3 Custom rubric customization

На v0 — фиксированные 6 components из paper. Pro feature на v1.1.

### 10.4 Multi-language code generation

Только TypeScript на v0. Python (FastMCP) генерация — в roadmap, IR независим от target language.

### 10.5 Smart caching upstream responses в runtime

Tool-level cache (Layer 4 в Caching strategy в основной архитектуре) — отдельная feature. Не часть Generation Engine.

## 11. Gap registry — где мы сознательно не на 100% best practices

| # | Gap | Best-practice источник | Что делаем v0 | Когда закрываем |
|---|---|---|---|---|
| G1 | Examples generation без real execution traces | arXiv 2602.14878, Anthropic blog | `examples = null` для большинства tools | v1.1, нужен sandbox |
| G2 | Нет user-provided golden tasks | Anthropic eval blog | Pre-curated для popular APIs, auto-gen для rest | v1.1 (Pro feature) |
| G3 | No prompt iteration with eval feedback (Anthropic Claude Code optimization loop) | Anthropic eval blog | Single-shot per pass, retry на failure | v2 (нужен infrastructure) |
| G4 | No tool-call metric tracking on production for self-improvement | Anthropic eval blog | Только usage events, no tool quality drift | v1.2 |
| G5 | Single-language target | OpenAPI spec | TypeScript only | v1.x |
| G6 | No interleaved thinking в eval agent | Anthropic eval blog | Standard agentic loop, no extended thinking | v1.0 (low effort) |

Эти gap'ы перечислены явно, потому что они **существуют у всех конкурентов** (Stainless, Speakeasy не делают agent eval; никто не делает rubric scan). Закрытие любого из G1–G4 — это marketing milestone.

## 12. Quality Score formula

Public-facing single number от 0 до 5:

```
overall_score = (
    0.30 * smell_avg_score              # Pass 2/3 quality (rubric-based)
  + 0.40 * eval_success_rate * 5         # Agent eval performance
  + 0.20 * annotations_completeness * 5  # % tools с full annotations
  + 0.10 * composite_ratio * 5           # больше composite tools = лучше
)
```

Показывается на:
- Dashboard владельца сервера (всегда)
- ⚠ **Public quality badge — opt-in,** не auto-public. Пользователь сам решает, показывать ли в README сгенерированного сервера.

Это снижает риск "наш bad score используется конкурентами как ammo". Public по умолчанию — слишком агрессивно.

## 13. Cost projection на pipeline

На примере Stripe API (350 endpoints → Pass 0 ~50 tool plans → **Pass 1 → ~10 final tools** через Six-Tool Pattern):

| Stage / Pass | LLM calls | Avg input tokens | Avg output tokens | Est cost |
|---|---|---|---|---|
| Pass 0 (Inventory) | 1 (single Opus call с full spec) | ~30,000 | ~3,000 | $0.10 |
| Pass 1 (Six-Tool Pattern) | 1 (single Opus call) | ~10,000 | ~2,000 | $0.05 |
| Pass 2 (Description) | 10 (per final tool, parallel) | ~1,500 (cached system) | ~300 | $0.30 |
| Pass 2 inline gate (Haiku judge) | 10 | ~800 | ~200 | $0.05 |
| Pass 3 (Parameters, Sonnet, ~80 params parallel ×20) | ~80 | ~800 (cached) | ~200 | $0.25 |
| Pass 3 inline gate (Haiku judge) | 10 | ~600 | ~150 | $0.05 |
| Pass 4 (Annotations, 80% det + Haiku для 1–3 edge cases per server) | ~3 | ~500 | ~100 | $0.02 |
| Pass 5 (Response shaping, Haiku field ranking ‖×10 + template guidance + outputSchema gen) | ~5 | ~800 (cached) | ~250 | $0.10 |
| F2 (Smell scan) | 10 × 3 judges | ~600 | ~200 | $0.05 |
| F3 (Agent eval) | 5 tasks × ~10 turns | ~5,000 | ~500 | $0.30 |
| **Total** | | | | **~$1.25** |

С Anthropic prompt caching (90% discount на cached parts) — реальная цена ~**$0.65**.

> ⚠ Старые цифры (Pass 2/3/5 × 50 tools) были pre-Pass-1 baseline. После Pass 1 Six-Tool Pattern финальный tool count уменьшается до 6–12, так что Stage C/D/F2 cost пропорционально снижается. Pass 3 cost учитывает per-parameter (а не per-tool) parallelism (~80 params на 10 tools) + inline Haiku gate. Pass 5 cost учитывает Haiku field ranking + outputSchema generation (MCP 2025-06-18).

**Pricing сходится:**
- Free tier: $0 для пользователя, мы тратим ~$0.65 — okay для acquisition.
- Pro $19/mo с 5 included generations + 5 evals: revenue $19, cost ~$6–10, margin ~50%.
- Pay-per-eval $0.50: cover'ит наш cost.

## 14. Open questions перед началом реализации

❓ **Opus 4.7 для Pass 0/1 — не upgrade'нем ли когда выйдет Opus 5?** Decision: model_routing.yaml — config, не код. Замена — git commit, не refactor.

❓ **Agent eval с Sonnet 4.7 или с моделью пользователя?** Decision: на v0 — Sonnet 4.7 (consistent baseline). На Pro — opt-in использовать модель из user's API key.

❓ **Rubric judge — 3 judges (как paper) или 1?** Decision: на финальном F2 scan — 3 (надёжность). На inline quality gating — 1 (скорость/цена).

❓ **Что считаем "passing eval" — 70% success rate?** Decision: 70% для MVP, target 85% к v1.0. Ниже 70% — серверу не выдаётся publish-ready badge.

❓ **Composite tools — заменяют originals полностью или сосуществуют?** Decision: по умолчанию заменяют (избегаем tool count bloat). User в UI может opt-in оставить и originals (Pro).

---

## Appendix A — Что мы делаем лучше существующих решений

| | Stainless | Speakeasy | Cloudflare API MCP | **MCPGen v2** |
|---|---|---|---|---|
| OpenAPI → MCP | ✅ | ✅ | ✅ | ✅ |
| Tool annotations inference | ❌ | ❌ | ❌ | ✅ |
| Composite tool synthesis | partial | ❌ | ❌ | ✅ (LLM-driven) |
| 6-component descriptions (paper rubric) | ❌ | ❌ | ❌ | ✅ |
| Agent-based eval validation | ❌ | ❌ | ❌ | ✅ |
| Public quality score | ❌ | ❌ | ❌ | ✅ (opt-in) |
| Smell scan через rubric judges | ❌ | ❌ | ❌ | ✅ |
| Multi-tenant managed runtime | partial | ❌ | ✅ | ✅ |
| Open-source CLI | ❌ | ❌ | ❌ | ✅ |

Это наш actual moat. Не «дешевле в токенах» — **«единственный, кто валидирует качество и применяет полный set best practices Anthropic»**.

---

**Next steps:** этот документ — source of truth для Stage B/C/D. Следующий шаг — детальный design Pass 0 (Tool Inventory & Naming): точные prompts, IR transformations, edge cases, golden eval set, decision tree.
