# Pass 1: Tool Consolidation via Six-Tool Pattern — Detailed Design

> **Документ:** detailed design второго LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** `pass-0-design.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Pass 1 берёт ~50 tool plans от Pass 0 и **сворачивает их в каноническую структуру 6 универсальных tools + N action/workflow tools** на основе индустриального консенсуса (Anthropic + OpenAI + MCP Bundles).

В типичном случае: 50 tools → 6-12 tools без потери функциональности. Это main token efficiency mechanism всего продукта.

---

## 1. Research foundation — единый канонический паттерн индустрии

Долгое исследование выявило, что лидеры MCP-экосистемы независимо сошлись на одном дизайн-паттерне.

### 1.1 Anthropic ("Writing effective tools for agents", September 2025)

> "More tools don't always lead to better outcomes. A common error we've observed is tools that merely wrap existing software functionality or API endpoints."

> Litmus test: "If a human engineer can't definitively say which tool should be used in a given situation, an AI agent can't be expected to do better."

> Claude Code itself caps its built-in toolset at ~12 core tools.

### 1.2 OpenAI (ChatGPT Deep Research integration, March 2025)

OpenAI **формально требует** для интеграции с ChatGPT две tools со строго определёнными signatures:

```typescript
search(query: string) → results
fetch(id: string) → object
```

Single-string parameters. Это де-факто универсальный стандарт для discovery — любой MCP server, реализующий этот контракт, работает с ChatGPT без custom integration code.

### 1.3 MCP Bundles ("The Six-Tool Pattern", October 2025)

После shipping десятков production MCP integrations — нашли, что 6 tools покрывают любой data-oriented API. Реальный пример: Weaviate MCP с 12 → 6 tools, identical functionality.

### 1.4 Empirical evidence

- **omnisearch** (Scott Spence): 20 tools (14,214 tokens) → 8 tools (5,663 tokens) — 60% token reduction
- **Anthropic internal**: добавление tool-use examples повысило accuracy с 72% до 90%
- **Paragon test**: GPT-4o baseline tool correctness 74.8% — большинство ошибок от cognitive overload избыточными tools

**Вывод:** "thoughtful consolidation" — это не optimization, это primary determinant of agent reliability.

---

## 2. The Six-Tool Pattern (canonical structure)

Любой data-oriented API раскладывается в эти 6 tools:

### Категория 1 — Universal Discovery Interface (OpenAI standard)

Single-string parameters для maximum compatibility.

**Tool 1: `search`**
- **Цель:** найти что-то по запросу
- **Параметры:** один `query: string`
- **Контракт:** AI передаёт строку (natural language ИЛИ structured DSL вроде `collection:Product limit:20 wireless`); сервер парсит на server-side
- **Возвращает:** ranked array of results с smart IDs
- **OpenAI требование:** должен быть exact с этой signature

**Tool 2: `fetch`**
- **Цель:** получить конкретный объект по ID
- **Параметры:** один `id: string` (smart ID, см. § 4)
- **Контракт:** AI передаёт ID, который получил из search results; сервер парсит ID и роутит к правильному endpoint
- **Возвращает:** full object data
- **OpenAI требование:** должен быть exact с этой signature

### Категория 2 — Rich List Operations (parameter-driven)

Не constrained OpenAI single-string — это domain-specific operations с богатыми параметрами.

**Tool 3: `list_collections`**
- **Цель:** показать, какие типы данных вообще есть в системе
- **Параметры:** ~6 optional (pattern, include_schema, include_counts, filter_by_type, limit, offset)
- **Возвращает:** array of collection metadata

**Tool 4: `list_objects`**
- **Цель:** browse объекты конкретной collection с фильтрами/пагинацией/сортировкой
- **Параметры:** ~8 optional (collection, properties, filter, sort_by, sort_order, limit, offset, include_metadata)
- **Возвращает:** array of objects

### Категория 3 — Unified Write Operations (smart routing)

**Tool 5: `upsert`**
- **Цель:** create OR update; single OR batch — всё одним tool
- **Параметры:** `collection`, `data` (object или array), `id?` (если есть — update; если нет — create), `ids?` (для batch updates)
- **Smart routing:**
  - `data: object`, no id → create single
  - `data: object`, with id → update single
  - `data: array`, no ids → batch create
  - `data: array`, with ids → batch update
- **Возвращает:** created/updated objects с IDs

**Tool 6: `delete`**
- **Цель:** удалить object / objects / collection
- **Параметры:** `type: "object" | "objects" | "collection"`, `id` или `ids` или `collection`, `confirm: bool` (required для destructive)
- **Smart routing** по `type` parameter
- **Возвращает:** deletion confirmation

### 2.1 Smart IDs — критичный механизм

Heart of the pattern. ID encodes routing information в одной строке:

```
Format: {server}:{type}:{collection}:{identifier}

Examples:
  stripe:object:Charge:ch_3O5jJ2Lz7Y9X8mN
  stripe:object:Customer:cus_NffrFeUfNV2Hib
  stripe:collection:Charge
  stripe:schema:Charge
```

AI получает ID из `search` или `list_objects`, передаёт в `fetch`/`upsert`/`delete`. AI не знает internal structure — server парсит ID и routes к правильному upstream endpoint.

Это даёт нам radikal'но meньше tools, потому что **routing logic moves from tool definition to ID format**.

---

## 3. Когда Six-Tool Pattern недостаточен (extra tools)

Самая статья от MCP Bundles даёт три явных исключения, когда нужны дополнительные tools:

### 3.1 Domain-specific actions (не CRUD)

API endpoints which **выполняют действия**, не работают с данными:

```
POST /charges/{id}/capture       → action_charge_capture
POST /charges/{id}/refund        → action_charge_refund
POST /messages/send              → action_message_send
POST /payments/process           → action_payment_process
```

Эти не fit в `upsert` — у них specific business semantics.

### 3.2 Complex workflows

Когда search-then-write не покрывается комбинацией `search + upsert`:

```
schedule_event(person, duration, window)
  → внутри: list users → find available slots → create event
```

Это **legitimate composite tool** в смысле моего предыдущего design'а. Но мы создаём такой только если:
- Workflow явно прописан в API design (есть documentation patterns)
- Партиальные failures imp recoverable
- Token economy positive (см. § 6)

### 3.3 Specialized reads

Чтения с конкретными semantics, которые не fit в search:

```
get_recent_events(user_id, limit)
get_user_activity_summary(user_id, days_back)
```

Используем sparingly. Большинство таких можно covered через `list_objects(collection="events", filter={user_id: X}, sort_by="created_at", limit=20)`.

### 3.4 Декision rule для extra tools

```
For each potential extra tool, ask:
  Q1: Это action (POST с side effect) или CRUD operation?
       Action → keep as separate tool
       CRUD → tries to fit into 6-tool pattern

  Q2: Это workflow combining 2-5 endpoints?
       Yes AND positive token economy AND recoverable on partial failure
         → keep as workflow tool
       Otherwise → don't create

  Q3: Это specialized read?
       Can fit in list_objects with parameters? → use list_objects
       Otherwise → keep as separate tool

  Q4: Total tool count after additions?
       ≤ 12 → OK
       > 12 → review extras for "really necessary"
```

**Target final tool count: 6-12.** Anthropic Claude Code сам capped на ~12.

---

## 4. Pipeline Pass 1

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Endpoint Classification (deterministic)           │
│                                                              │
│  Каждый endpoint классифицируется в одну категорию:         │
│  - data_read_single (GET /resource/{id})                    │
│  - data_read_list (GET /resource)                           │
│  - data_search (POST /resource/search, GET с query params)  │
│  - data_create (POST /resource)                             │
│  - data_update (PUT/PATCH /resource/{id})                   │
│  - data_delete (DELETE /resource/{id})                      │
│  - data_batch (POST /resource/batch, etc.)                  │
│  - action (POST /resource/{id}/{verb})                      │
│  - workflow (multi-step, identified by Pass 0 hints)        │
│  - specialized_read (rare specific patterns)                │
│                                                              │
│  Detection rules:                                            │
│  - URL pattern matching                                      │
│  - HTTP method                                               │
│  - Request/response schema analysis                          │
│  - operationId hints (e.g., "capture", "refund" → action)   │
│                                                              │
│  Cost: $0, time: <1s                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Schema Synthesis (LLM, single Opus call)          │
│                                                              │
│  Для каждого of 6 universal tools:                           │
│  - Какие endpoints этот tool subsumes?                       │
│  - Какие параметры нужны (учитывая capabilities всех subs)?  │
│  - Какие smart ID format'ы нужны (collections in API)?       │
│  - Какие enum значения для type parameters?                  │
│  - Default values?                                           │
│                                                              │
│  Для extra tools (actions/workflows/specialized):            │
│  - Какие keep, какие drop                                    │
│  - Naming consistency с 6 universal                          │
│                                                              │
│  Output: ConsolidationPlan                                   │
│  Cost: $0.10-0.20, time: 10-15s                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: Routing Generation (deterministic)                │
│                                                              │
│  Для каждого universal tool — таблица роутинга:             │
│    search query "collection:X ..." → upstream endpoint Y    │
│    fetch id "stripe:object:Charge:..." → GET /charges/{id}  │
│    upsert collection=X, no id → POST /resource              │
│    upsert collection=X, with id → PUT /resource/{id}        │
│                                                              │
│  Generated routing config используется в Stage E codegen.   │
│  Cost: $0, time: <1s                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: Validation (deterministic)                        │
│                                                              │
│  - Coverage check: каждый Pass 0 endpoint covered?           │
│  - Routing completeness: каждая operation роутится?          │
│  - Tool count ≤ 12 (warning if exceeded)                    │
│  - All collections have entries в smart ID format           │
│  - Action tool naming consistency                            │
│                                                              │
│  Если coverage incomplete → retry Phase 2 с feedback        │
│  Cost: $0, time: <1s                                         │
└─────────────────────────────────────────────────────────────┘
```

**Почему single LLM call (Phase 2):** decisions interconnected. Решение, что включить в `list_objects` parameters, зависит от того, что пошло в `search`. Per-tool calls упустили бы это.

---

## 5. Input

```python
class Pass1Input(BaseModel):
    tool_plans: list[ToolPlan]                     # all from Pass 0
    composite_candidates: list[CompositeCandidate] # hints from Pass 0
    dependency_graph: DependencyGraph              # from Stage A
    spec_info: SpecInfo
    auth_requirements: AuthRequirement
    user_options: UserOptions
    spec_hash: str                                 # для caching
```

`composite_candidates` от Pass 0 теперь используются для identifying **workflow tools** (исключение § 3.2), не для autonomous composite generation.

---

## 6. Output

```python
class Pass1Output(BaseModel):
    universal_tools: SixToolSet                    # all 6 canonical tools
    action_tools: list[ActionTool]                 # POST actions с side effects
    workflow_tools: list[WorkflowTool]             # multi-step workflows
    specialized_tools: list[SpecializedTool]       # rare special-case reads
    
    smart_id_schema: SmartIdSchema                 # format всех IDs
    routing_config: RoutingConfig                  # для codegen
    
    coverage_report: CoverageReport                # каждый Pass 0 endpoint covered?
    final_tool_count: int                          # target 6-12
    estimated_token_savings: int                   # vs Pass 0 baseline
    
class SixToolSet(BaseModel):
    search: ToolDefinition
    fetch: ToolDefinition
    list_collections: ToolDefinition
    list_objects: ToolDefinition
    upsert: ToolDefinition
    delete: ToolDefinition
    
class ToolDefinition(BaseModel):
    name: str
    parameters: list[Parameter]
    routing: list[RoutingRule]                     # which params → which upstream
    subsumed_endpoints: list[str]                  # endpoints это tool covers
    
class ActionTool(BaseModel):
    name: str                                      # e.g. "stripe_charge_capture"
    namespace: str                                 # e.g. "charges"
    upstream_endpoint: str
    parameters: list[Parameter]
    rationale: str                                 # почему отдельный tool
    
class WorkflowTool(BaseModel):
    name: str                                      # e.g. "schedule_event"
    sub_endpoints: list[SubEndpointCall]
    orchestration: Orchestration
    handles_partial_failure: bool
    rationale: str
    
class SmartIdSchema(BaseModel):
    server_prefix: str                             # "stripe"
    types: list[IdType]                            # object|collection|schema
    collections: list[CollectionDef]               # all collections с identifier formats
    
class CollectionDef(BaseModel):
    name: str                                      # "Charge"
    identifier_pattern: str                        # "ch_[A-Za-z0-9]+"
    upstream_path: str                             # "/v1/charges/{id}"
    
class RoutingConfig(BaseModel):
    rules: list[RoutingRule]
    
class RoutingRule(BaseModel):
    tool: str                                      # "fetch"
    condition: dict                                # {id_type: "object", collection: "Charge"}
    upstream_method: str                           # "GET"
    upstream_path: str                             # "/v1/charges/{id}"
    parameter_mapping: dict                        # how tool params → upstream params

class CoverageReport(BaseModel):
    total_pass_0_tools: int
    covered_tools: int
    coverage_percent: float
    uncovered_endpoints: list[UncoveredEndpoint]   # WARN if any
```

---

## 7. LLM Prompt structure (Phase 2)

### 7.1 System prompt (cached через Anthropic prompt caching)

```
You design MCP servers using the canonical Six-Tool Pattern.

INDUSTRY STANDARD (Anthropic + OpenAI + MCP Bundles consensus):

Every data-oriented API maps to 6 universal tools + N specialized tools.

THE SIX UNIVERSAL TOOLS:

Category 1 — Universal Discovery (OpenAI standard, single-string params):
  1. search(query: string) → ranked results
     Accepts natural language OR structured query like "collection:X limit:20 ..."
     Returns objects with smart IDs.
  
  2. fetch(id: string) → full object
     ID format: {server}:{type}:{collection}:{identifier}
     Server parses ID, routes to correct upstream endpoint.

Category 2 — Rich Browsing (parameter-driven):
  3. list_collections(pattern?, include_schema?, include_counts?, ...)
     Discovery tool: what data types exist in this system.
  
  4. list_objects(collection, properties?, filter?, sort_by?, sort_order?,
                  limit?, offset?, include_metadata?)
     Workhorse for browsing data with full control.

Category 3 — Unified Writes (smart routing):
  5. upsert(collection, data, id?, ids?)
     - data: dict, no id → create single
     - data: dict, with id → update single
     - data: array, no ids → batch create
     - data: array, with ids → batch update
  
  6. delete(type, id?, ids?, collection?, confirm)
     type: "object" | "objects" | "collection"
     Smart routing based on type parameter.

WHEN TO ADD EXTRA TOOLS (sparingly):

E1. Domain-specific actions: POST endpoints with side effects that aren't CRUD
    Examples: charges_capture, charges_refund, messages_send
    Naming: {namespace}_{verb} matching original endpoint semantics
    
E2. Workflow tools: 2-5 endpoints that form a coherent task
    Conditions ALL true:
    - Workflow явно prescribed by API design
    - Recoverable on partial failure
    - Positive token economy vs separate tools
    Examples: schedule_event (find slot → create), upload_with_thumbnail
    
E3. Specialized reads: rare patterns не fit'ящие в list_objects
    First try: can list_objects with parameters cover this?
    If yes → don't create separate tool
    If no → create with strong rationale
    
TARGET TOTAL: 6-12 tools. > 12 should be exceptional.

DECISION FOR EACH PASS 0 TOOL:

Map to one of:
  → Subsumed by `search` (any read by query)
  → Subsumed by `fetch` (read single by ID)
  → Subsumed by `list_collections` (discovery of data types)
  → Subsumed by `list_objects` (browse with filters)
  → Subsumed by `upsert` (create or update CRUD)
  → Subsumed by `delete` (CRUD delete)
  → Extra tool: action / workflow / specialized

For each subsumed tool — record what parameters it contributes to the universal tool.

SMART ID DESIGN:

For this API, identify:
- Server prefix (lowercase, single word, matches MCP server name)
- Object types и collections
- Identifier formats (UUIDs, custom prefixed IDs like "ch_xxx", numeric, etc.)

Output: SmartIdSchema with all collections and their identifier patterns.

QUALITY BAR:

- Every Pass 0 tool MUST be covered (subsumed or extra). Coverage = 100%.
- Total tool count ideally 6-12. Strong rationale required for extras.
- Smart ID format consistent across collections.
- Universal tool parameters must accommodate ALL subsumed endpoints'
  capabilities (e.g., list_objects.filter must support all filter types
  used by subsumed list endpoints).

OUTPUT FORMAT: structured JSON matching Pass1Output schema.
```

### 7.2 User prompt (per generation)

```
API Spec:
  Title: {spec_info.title}
  Description: {spec_info.description}
  Server name: {server_name}
  Auth: {auth_type}

Pass 0 produced {N} tools. Map them to the Six-Tool Pattern + extras.

Tools by category:

READ OPERATIONS:
{for each read tool from Pass 0:}
  {tool.name}
  Source: {method} {path}
  Operation intent: {tool.operation_intent}
  
WRITE OPERATIONS:
{for each write tool:}
  {tool.name}
  Source: {method} {path}
  Operation intent: {tool.operation_intent}
  
ACTION-LIKE OPERATIONS (POST with side effects на specific resources):
{for each action tool:}
  {tool.name}
  Source: {method} {path}
  Operation intent: {tool.operation_intent}

Composite candidates from Pass 0 (potential workflow tools):
{for each candidate:}
  {candidate.suggested_composite_name}
  Tools involved: {candidate.tool_names}
  Rationale: {candidate.rationale}

Dependency graph (strong connections):
{edges}

Design the consolidation plan.
```

---

## 8. Programmatic validation (Phase 4)

| Check | Action при failure |
|---|---|
| Coverage = 100% (каждый Pass 0 tool covered) | Retry с list of uncovered tools |
| Total count ≤ 12 (или ≤ 15 для very rich APIs) | Warning, не fail |
| Smart ID format consistent (one server prefix) | Auto-fix |
| All collections в smart ID schema have identifier_pattern | Retry с specific collections to fix |
| Routing rules cover все upstream methods | Retry с missing routes |
| Action tools имеют rationale | Reject и retry |
| Workflow tools имеют partial_failure handling | Reject и retry |
| Universal tool parameters не conflict (например, two parameters with same name) | Auto-rename или retry |

---

## 9. Edge cases

**E1. API не data-oriented (например, чисто action API типа Twilio).**
→ Six-tool pattern все равно applicable, но `list_collections`/`list_objects`/`upsert`/`delete` могут быть пустыми (для них нет subsumed endpoints).
→ Большинство tools — actions.
→ В этом случае универсальные tools могут быть omitted (если 0 subsumed) или kept as no-op stubs.
→ Decision: omit if 0 subsumed; keep iff ≥1 subsumed.

**E2. Один collection, hundreds of endpoints (типа Salesforce SOQL).**
→ `search` принимает богатый DSL.
→ `list_objects` с filters покрывает большинство.
→ Total tool count все равно может быть 6-8.

**E3. Mix of REST + GraphQL в одном API.**
→ На MVP: GraphQL не поддерживаем вообще.
→ Future: GraphQL queries map to `search` via specific syntax; mutations to `upsert`.

**E4. Идентификаторы NOT идеи collection-based** (например, composite keys).
→ Smart ID format расширяется: `stripe:object:Subscription:cus_xxx/sub_yyy`.
→ Server парсит nested identifiers.

**E5. Endpoint требует request body для GET-like операции.**
→ Если semantically read-only — все равно идёт в `search` или `fetch`.
→ Если требует complex payload — может стать specialized read.

**E6. Endpoint c ambiguous semantics** (например, POST /process — что он делает?).
→ LLM использует description, но если непонятно — маркирует as `action_*` с low confidence.
→ Pass 2 потом получает четкое description.

**E7. API без collections** (например, single-resource API).
→ `list_collections` returns single collection.
→ Smart ID format degenerates to `server:object:identifier`.

**E8. Бесшовная пагинация vs offset-based.**
→ `list_objects.limit/offset` parameters работают для offset-based.
→ Cursor-based pagination требует additional `cursor` parameter.
→ LLM detects from spec response schemas.

---

## 10. Coverage validation

Это критичная часть Pass 1 — мы НЕ должны терять функциональность.

```python
def validate_coverage(pass_0_tools: list[ToolPlan], pass_1_output: Pass1Output) -> CoverageReport:
    covered_endpoints = set()
    
    # Universal tools
    for tool in pass_1_output.universal_tools.all():
        covered_endpoints.update(tool.subsumed_endpoints)
    
    # Extra tools
    for tool in pass_1_output.action_tools + pass_1_output.workflow_tools + pass_1_output.specialized_tools:
        if hasattr(tool, "upstream_endpoint"):
            covered_endpoints.add(tool.upstream_endpoint)
        elif hasattr(tool, "sub_endpoints"):
            for sub in tool.sub_endpoints:
                covered_endpoints.add(sub.endpoint_id)
    
    pass_0_endpoints = {tool.source_endpoint_id for tool in pass_0_tools}
    uncovered = pass_0_endpoints - covered_endpoints
    
    return CoverageReport(
        total_pass_0_tools=len(pass_0_endpoints),
        covered_tools=len(pass_0_endpoints) - len(uncovered),
        coverage_percent=(1 - len(uncovered) / len(pass_0_endpoints)) * 100,
        uncovered_endpoints=[...]
    )
```

**Failure handling:** uncovered > 0 → retry Phase 2 with explicit list of missing endpoints. После 3 retry — degrade: добавляем uncovered endpoints как specialized_tools с warning.

---

## 11. Token economy estimation

Сравниваем before/after:

```python
def estimate_token_economy(
    pass_0: list[ToolPlan],
    pass_1: Pass1Output,
) -> TokenEconomy:
    # Naive: каждый Pass 0 tool ~150 tokens for definition + name
    naive_cost = sum(tool.estimated_input_tokens for tool in pass_0)
    
    # Pass 1: 6 universal tools ~200 tokens каждый (rich descriptions)
    universal_cost = 6 * 200  # = 1200
    
    # Plus extras
    extras_cost = sum(tool.estimated_tokens for tool in (
        pass_1.action_tools + pass_1.workflow_tools + pass_1.specialized_tools
    ))
    
    pass_1_cost = universal_cost + extras_cost
    savings_percent = (naive_cost - pass_1_cost) / naive_cost * 100
    
    return TokenEconomy(
        naive_cost=naive_cost,
        pass_1_cost=pass_1_cost,
        savings_tokens=naive_cost - pass_1_cost,
        savings_percent=savings_percent,
    )
```

**Expected** для typical API (Stripe-class, 50 Pass 0 tools):
- Naive: ~7500 tokens
- Pass 1: ~2200 tokens (1200 universal + 1000 extras)
- **Savings: ~70%**

Это совпадает с empirical results MCP Bundles (omnisearch: 60%, Weaviate: ~50%).

---

## 12. Cost & latency

| Item | Cost | Latency |
|---|---|---|
| Phase 1 (classification) | $0 | <1s |
| Phase 2 (single Opus call) | $0.10-0.20 | 10-15s |
| Phase 3 (routing gen) | $0 | <1s |
| Phase 4 (validation) | $0 | <1s |
| Retry overhead (avg 15%) | +15% | +15% |
| **Total** | **~$0.10-0.25** | **~12-18s** |

С Anthropic prompt caching system prompt'а: ~50% reduction после первого call в сессии.

---

## 13. Golden eval set

Минимум 6 cases.

### G1: Stripe API (~50 Pass 0 tools)

Expected output:
- 6 universal tools (search, fetch, list_collections, list_objects, upsert, delete)
- ~6 action tools: `charges_capture`, `charges_refund`, `subscriptions_cancel`, `payment_intents_confirm`, `customers_attach_payment_method`, `webhooks_resend`
- 0-1 workflow tools (Stripe не имеет натуральных workflows)
- Total: ~12 tools

Coverage check: 100%

### G2: GitHub API (~50 Pass 0 tools)

Expected:
- 6 universal
- ~3 action tools: `repos_dispatch_workflow`, `pulls_merge`, `issues_lock`
- ~2 workflow tools: возможно `repos_full_setup` (create + protect + add_collaborators) — но likely rejected как too speculative
- Total: ~10 tools

### G3: Notion API (~20 Pass 0 tools)

Expected:
- 6 universal (list_collections returns "databases", "pages")
- 0 action tools (Notion API чисто CRUD)
- 0 workflow tools
- Total: 6 tools

**This is best-case** — простой data API maps cleanly to 6.

### G4: Twilio API (action-heavy)

Expected:
- search, fetch для resources (messages, calls)
- list_collections, list_objects mostly empty (≤2 collections)
- upsert may be empty (Twilio create-only, no update for messages)
- ~10-15 action tools: `messages_send`, `calls_initiate`, `calls_modify`, `verifications_create`, etc.
- Total: ~12-15 tools

**Worst case for the pattern** — action-heavy APIs показывают, что pattern все равно works но extras dominate.

### G5: Custom API без чёткой CRUD структуры

Expected: pattern degrades gracefully — больше extra tools, меньше universal. Coverage 100%.

### G6: API с composite candidates от Pass 0

Expected: candidates either:
- Become workflow_tools (если passes the test in § 3.2)
- Or rejected if не passes — workflow tested, not just generated

---

## 14. Что Pass 1 НЕ делает

- НЕ пишет descriptions для tools (Pass 2)
- НЕ обрабатывает parameters details — только parameter signatures (Pass 3)
- НЕ выводит annotations (Pass 4)
- НЕ генерирует actual code (Stage E)
- НЕ запускает agent eval (Stage F3)

Pass 1 produces **structural plan** — what tools exist, какие endpoints они subsume, какие parameters принимают, как routing работает.

---

## 15. Открытые вопросы

❓ **Smart ID format на user-facing level.** Когда AI читает result `stripe:object:Charge:ch_xxx`, понимает ли он это как opaque token (correct) или пытается parse (wrong)? Из MCP Bundles practice — works fine, AI treats as opaque. **Validation:** в Stage F3 eval check, что AI правильно использует возвращённые IDs.

❓ **Edge case — API с очень богатой filter language (Salesforce SOQL).** `list_objects.filter` может стать complex DSL. **Решение:** support simple filter dict в MVP; complex filtering уходит в `search` query string.

❓ **Backward compat для existing users.** Если в v2 мы radikal'но меняем generated tools — existing servers сломаются для users. **Решение:** этот pass — для NEW generations. Existing serverов trigger через Spec Drift mechanism (см. Pass 0 doc § 13) пользователь сам решит regenerate.

❓ **Когда action tool становится workflow tool.** `charges_capture` — это action ИЛИ workflow (т.к. capture часто часть `create_charge → confirm → capture`)? **Decision:** action если single endpoint; workflow если multiple. capture — single endpoint, поэтому action.

❓ **Specialized reads — где провести границу.** "Last 20 events for user" может fit в `list_objects(collection="events", filter={user_id: X}, sort_by="created_at", limit=20)`. **Default:** prefer fitting в list_objects. Specialized read only если parameters не покрывают use case.

❓ **Что если LLM всё равно создаёт 15+ tools.** **Decision:** warning не fail. Anthropic Claude Code сам имеет ~12 — некоторые APIs действительно нуждаются в extras. Surface в quality report.

---

## 16. Финальные decisions

1. ✅ **Six-Tool Pattern** как canonical structure для всех data operations
2. ✅ **Smart IDs** как routing mechanism вместо separate fetch tools per type
3. ✅ **Extras only via 3 categories**: actions, workflows (rare), specialized reads (very rare)
4. ✅ **Target 6-12 tools total**, warning при > 12
5. ✅ **Coverage 100%** mandatory — не теряем функциональность
6. ✅ **Token economy reporting** в quality report для transparency
7. ✅ **Single Opus call** для Phase 2 — holistic decisions критичны
8. ✅ **Workflow tools — strict gate** (workflow prescribed + recoverable + positive economy)
9. ✅ **OpenAI compliance** через exact `search`/`fetch` signatures — bonus universal compatibility
10. ✅ **Smart ID schema** generated per-spec, consistent across all 6 universal tools

---

## Appendix A — Sources

1. **Anthropic** — "Writing effective tools for agents" (Sept 2025)
   https://www.anthropic.com/engineering/writing-tools-for-agents

2. **OpenAI** — ChatGPT Deep Research MCP Requirements (Mar 2025)
   Documented в OpenAI MCP integration docs; requires exact `search`/`fetch` signatures.

3. **MCP Bundles** — "The Six-Tool Pattern: MCP Server Design That Scales" (Oct 2025)
   https://www.mcpbundles.com/blog/mcp-tool-design-pattern
   Real-world implementation: Weaviate MCP 12 → 6 tools.

4. **Анализ от Grzegorz Ziółkowski** — "Architecting Tools for AI Agents at Scale" (Apr 2026)
   https://gziolo.pl/2026/04/09/research-architecting-tools-for-ai-agents-at-scale/
   Confirms cross-industry consensus.

5. **Empirical**:
   - omnisearch: 20→8 tools, 14K→5.6K tokens
   - Anthropic test: examples improved accuracy 72%→90%
   - Paragon GPT-4o tool correctness baseline 74.8%
