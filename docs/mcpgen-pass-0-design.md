# Pass 0: Tool Inventory & Naming — Detailed Design

> **Документ:** detailed design первого LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design до начала имплементации.
> **Связанные:** `generation-engine-v2.md` (overall pipeline), `architecture.md` (system level).
> **Last updated:** 2026-04-26.

---

## 0. Зачем этот pass существует

Когда пользователь даёт нам OpenAPI spec на 350 endpoints, **большинство из них не должны становиться tools**. Это противоречит наивному подходу «1 endpoint = 1 tool», но это прямое следование Anthropic best practices ([Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)):

> "A common error we've observed is tools that merely wrap existing software functionality or API endpoints — whether or not the tools are appropriate for agents."

> "We recommend building a few thoughtful tools targeting specific high-impact workflows."

Pass 0 — первая точка в pipeline, где принимаются **архитектурные решения** о структуре будущего сервера. Это reasoning над структурой API, не текстовая работа. Если Pass 0 принял неверные решения — никакой excellent description authoring (Pass 2) уже не спасёт результат.

---

## 1. Четыре задачи Pass 0

### 1.1 Filtering — что отбрасываем

Не каждый endpoint полезен агенту. Отбрасываем по детерминированным правилам + LLM judgment:

- **Deprecated endpoints** — `deprecated: true` в OpenAPI или содержащие "deprecated" в description
- **Internal/admin endpoints** — `/internal/`, `/admin/`, `/_private/` в path
- **Health checks** — `/health`, `/healthz`, `/ping`, `/status`, `/version`, `/metrics`
- **Webhook receivers** — endpoints, принимающие callbacks (агент их не вызывает)
- **OAuth/auth flow endpoints** — `/oauth/*`, `/auth/login`, `/auth/refresh` (handle отдельно через auth subsystem)
- **Pure infrastructure** — rate-limit info, server time, uptime
- **Trivial CRUD без бизнес-смысла** — endpoint, существующий только потому что REST требует симметрии

### 1.2 Categorization — группировка через namespacing

Anthropic recommendation:
> "Namespacing tools by service (e.g., `asana_search`, `jira_search`) and by resource (e.g., `asana_projects_search`, `asana_users_search`), can help agents select the right tools at the right time."

Для одного сервера — **prefix по resource внутри сервера**, потому что service prefix уже подразумевается именем сервера:
- Server `stripe-mcp` → tools `charges_create`, `customers_list` (НЕ `stripe_charges_create`)
- Внешний клиент при подключении сам видит `stripe-mcp/charges_create` или подобное

OpenAPI обычно даёт `tags` — первоисточник для категорий. Но tags часто грязные (`Charges`, `charges`, `payments` для одного и того же resource), Pass 0 их нормализует.

### 1.3 Naming — конвенции имён

MCP spec требования:
- Уникальны в пределах сервера
- ASCII, snake_case по convention
- ≤ 64 chars (некоторые клиенты лимитят)

Anthropic про imperative verbs:
> "Use imperative verbs: 'Charge', 'List', 'Refund', 'Create', 'Delete'."

OpenAPI `operationId` часто плохой источник. Примеры transform:
- `createChargeUsingPOST` → `charges_create`
- `getUsersList_v2` → `users_list`
- `do_thing` → требует LLM полностью переименовать

**Naming pattern:**
```
{resource}_{action}                   # users_list, charges_create
{resource}_{action}_{qualifier}        # users_search_by_email
```

### 1.4 Hard cap enforcement

После filtering применяется правило:
- **≤ 30 tools** → продолжаем нормально
- **31–50 tools** → продолжаем, но Pass 1 (Composite Synthesis) запускается обязательно
- **51–80 tools** → Pass 1 пытается агрессивно сворачивать; если после Pass 1 всё ещё > 50 — fail с suggestion «split into multi-server»
- **> 80 tools** → fail сразу: «spec слишком большой, нужен multi-server pattern (charges, customers, subscriptions)»

Это **build-time gate** — наш единственный механизм против context bloat в runtime, learning от того, что progressive disclosure (см. § 10.2 generation-engine-v2.md) не достижим со 100% reliability.

**Pro feature override:** `max_tools_override: int | None` в UserOptions — поднимает cap до 100 (paid feature). Используется на риск пользователя.

---

## 2. Authentication — критическая подсистема, выходящая за пределы Pass 0

Pass 0 detects auth requirements из spec и passes их дальше по pipeline. Сама обработка auth — отдельная подсистема, влияющая на UI, codegen и runtime. Описана здесь для полной картины, поскольку начинается с Pass 0.

### 2.1 Типы авторизации, которые поддерживаем

Реальные API используют один из этих паттернов:

| Тип | Описание | Примеры | % API |
|---|---|---|---|
| **A. API Key (header)** | `Authorization: Bearer sk_...` | Stripe, OpenAI, Anthropic | ~70% |
| **B. API Key (query)** | `?api_key=...` | SerpAPI, legacy APIs | ~5% |
| **C. Basic Auth** | `Authorization: Basic base64(user:pass)` | Twilio, legacy | ~10% |
| **D. OAuth 2.0/2.1 user-delegated** | User authorizes access to *his* data | Google Gmail, GitHub user-mode, Slack | ~15% |
| **E. OAuth 2.0 M2M** | Service-to-service via client credentials | AWS, GCP service accounts | ~5% |
| **F. AWS Signature v4** | HMAC of request body+headers+timestamp | AWS APIs | ~3% |
| **G. Custom/multi-factor** | Combinations | Salesforce | ~1% |

### 2.2 Три модели передачи credentials (fundamental architectural choice)

Когда Claude Desktop / Cursor вызывает наш MCP-сервер, **откуда берётся upstream API credential?**

#### Модель 1: Pass-through (через MCP config)

Пользователь кладёт credentials в config своего MCP-клиента:

```json
{
  "mcpServers": {
    "stripe-mcp": {
      "url": "https://stripe-mcp-abc.mcpgen.app/mcp",
      "headers": {
        "Authorization": "Bearer <NAME_TENANT_KEY>",
        "X-Upstream-Stripe-Key": "sk_live_..."
      }
    }
  }
}
```

Tenant Worker:
1. Validates `Authorization` (наш tenant key)
2. Forwards `X-Upstream-Stripe-Key` в upstream call
3. **Никогда не логгит, не хранит credentials**

**Плюсы:** максимальная security; мы технически не можем украсть/потерять. Простая ментальная модель.

**Минусы:** только статические credentials. Не работает для OAuth (token expires, нужен refresh) и AWS Signature (зависит от тела запроса).

**Применимо к:** A, B, C, частично E (для short-lived tokens).

#### Модель 2: Stored credentials (encrypted at rest)

Пользователь даёт credentials один раз через UI. Шифруем (AES-256-GCM с per-tenant DEK), храним. При каждом MCP-запросе — достаём, дешифруем, используем.

В config клиента — только наш tenant key. Никаких upstream credentials.

**Плюсы:** простой UX; поддерживает любой auth type включая OAuth с auto-refresh; можно ротация без change config.

**Минусы:** мы — single point of compromise; compliance burden (SOC2); требует доверия.

**Применимо к:** все типы.

#### Модель 3: OAuth flow on behalf of user

Для user-delegated APIs (Google, GitHub user-mode):

1. Пользователь жмёт «Connect Google» в нашем UI
2. Redirect на Google consent screen с запрошенными scopes
3. Google → callback с auth code
4. Мы exchange auth code на (access_token, refresh_token)
5. Шифруем пару, храним
6. При каждом MCP request — refresh при необходимости + upstream call

Это специальный случай Модели 2 со специфическим setup flow.

**Применимо к:** D.

### 2.3 Default modes per auth type

| Auth тип | Default | Альтернатива |
|---|---|---|
| A. API Key (header) | **Pass-through** | Stored (opt-in) |
| B. API Key (query) | **Pass-through** | Stored (opt-in) |
| C. Basic Auth | **Pass-through** | Stored (opt-in) |
| D. OAuth user-delegated | **OAuth flow + Stored** | (нет — pass-through невозможен) |
| E. OAuth M2M | **Stored** | Pass-through для short-lived |
| F. AWS Signature | **Stored** | (нет) |
| G. Custom | **Stored** | (case-by-case) |

**Принцип:** pass-through где технически возможен, stored — где нет выбора. UI показывает default + объяснение почему.

### 2.4 Что Pass 0 делает с auth

Парсит OpenAPI `securitySchemes` секцию (детерминированно, без LLM) и возвращает:

```python
class AuthRequirement(BaseModel):
    auth_type: AuthType
    location: str                # "header:Authorization", "query:api_key", "header:x-api-key"
    scheme: str | None           # "Bearer", "Basic"
    oauth_config: OAuthConfig | None
    required_scopes_per_endpoint: dict[str, list[str]] | None
    can_use_passthrough: bool    # детерминированно
    recommended_mode: Literal["passthrough", "stored", "oauth_flow"]

class OAuthConfig(BaseModel):
    flow_type: Literal["authorization_code", "client_credentials", "implicit"]
    authorization_url: str | None
    token_url: str
    refresh_url: str | None
    available_scopes: dict[str, str]  # scope_name → human description
```

**Pass 0 НЕ:**
- Запрашивает credentials у пользователя (это UI)
- Шифрует/хранит ничего (это Stored mode subsystem)
- Делает test calls к upstream (это Validate stage F, опционально)

**Pass 0 ТОЛЬКО:**
- Detects auth scheme из spec
- Recommends default mode
- Передаёт это в Pass 0 output, дальше используется в codegen + UI

### 2.5 Security boundaries (записано здесь, реализуется в Tenant Runtime)

| Что | Где |
|---|---|
| Pass-through credentials | Никогда не хранятся; не логируются; передаются в upstream и забываются |
| Stored credentials encryption | AES-256-GCM, per-tenant DEK, master KEK в Cloudflare |
| OAuth refresh tokens | Stored mode, automatic refresh ≤ 5 min до expiry |
| Audit log | Все access к stored credentials → audit table (timestamp, deployment_id, action, IP) |
| User-side rotation | Dashboard endpoint `POST /credentials/rotate` для stored mode |

Подробности — отдельный security design doc (TODO).

---

## 3. Внутренняя структура Pass 0 — три stages

```
┌─────────────────────────────────────────────────┐
│  STAGE 1: Deterministic filtering               │
│                                                  │
│  Rule-based исключения:                          │
│  - deprecated: true                              │
│  - path содержит /internal/, /admin/             │
│  - path matches health/ping/status patterns      │
│  - method ∈ {OPTIONS, HEAD, TRACE}               │
│  - operationId starts with internal_, admin_     │
│  - is OAuth/auth flow endpoint                   │
│  - User explicitly excluded                      │
│                                                  │
│  Также parse: securitySchemes → AuthRequirement  │
│                                                  │
│  ~30-50% endpoints отсеиваются здесь             │
│  Cost: $0, time: <100ms                          │
└─────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  STAGE 2: LLM filtering & categorization        │
│                                                  │
│  Single Opus call на ВЕСЬ remaining set          │
│  (НЕ per-endpoint — нужен holistic view)         │
│                                                  │
│  LLM решает:                                     │
│  - "low value for agents" semantic judgment      │
│  - категоризация (если tags грязные/missing)     │
│  - rename plan для каждого tool                  │
│  - composite candidates suggestion               │
│                                                  │
│  Cost: ~$0.10-0.30, time: 10-30s                 │
│  Для big specs — chunked approach (см. § 9)      │
└─────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  STAGE 3: Programmatic validation               │
│                                                  │
│  - все names уникальны (auto-fix collisions)     │
│  - все names match snake_case regex              │
│  - tool count check vs cap                       │
│  - все source_endpoint_id existing               │
│  - flag generation                               │
│                                                  │
│  Cost: $0, time: <100ms                          │
└─────────────────────────────────────────────────┘
```

**Почему single LLM call (Stage 2), не per-endpoint:**
- Решения связаны: «оставить ли `get_user_by_id`, если уже есть `users_search`?» — нужен holistic view всего set'а
- Categorization — связное решение для всех endpoints одновременно
- Cost: один большой call с prompt caching ≪ N малых calls
- Latency: 10-30s acceptable для UX (мы стримим progress в UI)

---

## 4. Input

```python
class Pass0Input(BaseModel):
    spec_info: SpecInfo                       # title, version, description
    endpoints: list[Endpoint]                 # все endpoints
    user_options: UserOptions
    spec_hash: str                            # для caching

class Endpoint(BaseModel):
    endpoint_id: str                          # internal stable ID, не operationId
    operation_id: str | None
    method: HttpMethod
    path: str
    summary: str | None
    description: str | None
    tags: list[str]
    deprecated: bool
    parameters: list[RawParameter]
    request_body: RawSchema | None
    responses: dict[str, RawResponse]
    security: list[SecurityRequirement]
    extensions: dict                          # x-* fields
    
class UserOptions(BaseModel):
    explicit_categories: list[str] | None     # выбор пользователя в UI
    explicit_excludes: list[str] | None       # endpoints явно исключены
    explicit_includes: list[str] | None       # User Override Flow — endpoints, которые user хочет force-keep
    server_name_hint: str | None              # "stripe-charges" → влияет на naming
    max_tools_override: int | None            # Pro feature
    target_complexity: Literal["minimal", "standard", "comprehensive"]
```

### 4.1 `target_complexity` — критичный пользовательский control

| Mode | Описание | Tool count target |
|---|---|---|
| `minimal` | Только core CRUD; отбрасываем edge case operations и rarely-used endpoints | ≤15 |
| `standard` | Default; balance между functionality и context efficiency | ≤50 |
| `comprehensive` | До hard cap; включая редко используемые operations | up to cap |

В UI показывается как radio button на экране после Auth detection, перед deploy.

### 4.2 `explicit_includes` — User Override Flow

Если в первой генерации мы отбросили endpoint, который пользователь хочет — он может перейти в User Override flow и явно включить:

```python
explicit_includes = ["GET /v1/legacy_charges/migrate"]
```

В Stage 2 LLM получает hint: «эти endpoints user явно хочет включить, найди им хорошее место в taxonomy». Это переопределяет наши рекомендации против включения.

---

## 5. Output

```python
class Pass0Output(BaseModel):
    tool_plans: list[ToolPlan]
    dropped_endpoints: list[DroppedEndpoint]
    namespaces: list[Namespace]
    composite_candidates: list[CompositeCandidate]
    auth_requirements: AuthRequirement
    flags: Pass0Flags
    user_review_required: bool                # если есть questionable decisions

class ToolPlan(BaseModel):
    name: str                                 # final snake_case name
    namespace: str
    source_endpoint_id: str
    operation_intent: str                     # 1-предложение что делает (для Pass 2)
    initial_purpose_hint: str                 # подсказка для Pass 2
    rationale: str                            # почему этот endpoint оставлен (debug)
    auth_required: bool                       # этот endpoint требует auth
    required_scopes: list[str] | None         # для OAuth

class Namespace(BaseModel):
    name: str                                 # "charges", "customers"
    description: str
    tool_count: int

class DroppedEndpoint(BaseModel):
    endpoint_id: str
    method: str
    path: str
    summary: str | None
    reason: DropReason
    rationale: str                            # human-readable объяснение
    can_user_override: bool                   # user может вернуть этот endpoint?

class DropReason(Enum):
    DEPRECATED = "deprecated"
    INTERNAL = "internal_or_admin"
    HEALTH_CHECK = "health_check_endpoint"
    WEBHOOK = "webhook_receiver"
    AUTH_FLOW = "auth_flow_endpoint"
    REDUNDANT = "redundant_with_other_tool"
    LOW_VALUE = "low_value_for_agents"
    USER_EXCLUDED = "user_excluded_explicitly"
    EXCEEDS_CAP = "would_exceed_max_tools_cap"
    METHOD_NOT_SUPPORTED = "method_not_supported"  # OPTIONS, HEAD, TRACE

class CompositeCandidate(BaseModel):
    tool_names: list[str]                     # 2-5 tools которые часто связаны
    suggested_composite_name: str             # "get_customer_context"
    rationale: str
    confidence: Literal["high", "medium", "low"]

class Pass0Flags(BaseModel):
    spec_too_large: bool
    no_tags_detected: bool
    high_dropout_rate: bool                   # > 60% endpoints отброшено
    suggested_multi_server_split: list[str] | None
    requires_auth_flow_setup: bool            # OAuth — нужен setup в UI
    questionable_decisions: list[str]         # endpoints где LLM не уверен
```

`dropped_endpoints` критично для **UI прозрачности** — пользователь должен видеть что и почему мы выкинули. `can_user_override: bool` определяет, можно ли его вернуть в User Override Flow (`true` для `LOW_VALUE`, `REDUNDANT`; `false` для `METHOD_NOT_SUPPORTED`, `AUTH_FLOW`).

---

## 6. Промпты для LLM (Stage 2)

### 6.1 System prompt (cached через Anthropic prompt caching)

```
You are designing an MCP server from a REST API specification.

Your role is to decide which endpoints become tools, how they're named,
and how they're grouped — following Anthropic's best practices for
tool design for LLM agents.

PRINCIPLES (Anthropic, "Writing effective tools for agents"):

1. More tools ≠ better outcomes. Build thoughtful tools targeting
   high-impact workflows, not 1:1 endpoint wrappers.

2. Tools are interfaces for reasoning, not function bindings. If
   selection is ambiguous, the agent fails.

3. Use imperative verbs in names: Create, List, Refund, Search.

4. Namespace by resource within this server: `charges_create` not
   `create_a_charge` and not `stripe_charges_create`. The server name
   already provides service prefix to the agent.

5. Drop endpoints that are low-value for agents:
   - Health checks, ping, status, version
   - Internal/admin operations (already handled by deterministic stage)
   - Edge-case configuration endpoints
   - Trivial CRUD that exists for REST symmetry only
   - Endpoints subsumed by more general operations (e.g., drop
     `list_users` if a versatile `search_users` exists)

6. Identify composite candidates: chains of 2-5 endpoints often used
   sequentially (find user → get profile → list orders) that should
   become one tool in Pass 1.

CONSTRAINTS:
- Hard cap: {max_tools} tools (currently {target_complexity} mode)
- All names: snake_case, lowercase, ASCII only
- Names unique within this server
- Names ≤ 64 characters
- One namespace per logical resource group

DECISION TREE for each endpoint — KEEP or DROP:

DROP if (any condition):
  D1. Subsumed by more general endpoint (e.g., search subsumes list)
  D2. Low business value for agent tasks (specific to admin/setup)
  D3. Edge-case operation that 95%+ users won't need
  D4. Redundant with already-kept tool

KEEP if (all conditions):
  K1. Clear business value for an agent task
  K2. Not redundant with other kept tools
  K3. Within target_complexity scope

EDGE CASES:
  - GET /resource/{id} — usually keep
  - GET /resource (no filters) — drop if always returns all
  - POST /resource/search — prefer over GET с query params
  - PATCH and PUT for same resource — keep one (PATCH preferred)
  - Polymorphic POST (e.g., POST /webhooks/{event_type}) — one tool
    with type as parameter, NOT one tool per type

If user explicitly included an endpoint via `explicit_includes` —
respect that decision; find good place in taxonomy.

OUTPUT FORMAT: structured JSON matching Pass0Output schema.
Include `rationale` for every decision (kept, dropped, renamed).

QUALITY BAR:
- Every kept tool answers "what specific user task does this enable?"
- Every dropped endpoint has concrete reason from DropReason enum
- Composite candidates: plausible workflows, not speculation
- Set `confidence: "low"` if you're unsure — that flags for user review
```

### 6.2 User prompt (per generation, не cached)

```
Spec info:
  Title: {spec_info.title}
  Version: {spec_info.version}
  Description: {spec_info.description}

Server name (will be used as parent namespace by client):
  {server_name_hint}

Authentication detected:
  Type: {auth_type}
  {if oauth: scopes available: {scopes}}

Endpoints (after deterministic filtering, {N} remaining):

{for each endpoint:}
  ID: {endpoint_id}
  Method: {method}
  Path: {path}
  Summary: {summary or "(no summary)"}
  Tags: {tags or "(no tags)"}
  Description (truncated 200 chars): {description[:200]}
  Has request body: {bool}
  Response types: {response_types}

User constraints:
  Target complexity: {target_complexity}
  Categories explicitly requested: {explicit_categories or "(none)"}
  Endpoints user wants force-INCLUDED: {explicit_includes or "(none)"}
  Endpoints user wants EXCLUDED: {explicit_excludes or "(none)"}

Design the tool inventory.
```

В user prompt НЕ передаём full descriptions endpoints — только preview (200 chars). Полные descriptions нужны только в Pass 2 (description authoring).

---

## 7. Programmatic validation после LLM (Stage 3)

LLM может ошибиться. После Stage 2 запускаем checks:

| Check | Action при failure |
|---|---|
| Все names уникальны | Auto-rename collisions: `charges_create_2` |
| Names match `^[a-z][a-z0-9_]*$` | Fix или regenerate |
| Names ≤ 64 chars | Truncate intelligently |
| Tool count ≤ cap | Trigger aggressive Pass 1 ИЛИ fail с multi-server suggestion |
| Все `source_endpoint_id` существующие | Hallucination → regenerate |
| Forbidden namespace names (`tool`, `mcp`, `api`) | Auto-rename |
| Singleton namespaces (1 tool) | Попытка merge с похожими |
| Dropout rate > 70% | Set `high_dropout_rate: true` flag, surface в UI |
| `auth_required` consistent с `endpoint.security` | Fix mismatch |

---

## 8. Retry logic

```
Attempt 1: Standard prompt with full input
  ↓ validation fails
Attempt 2: Same prompt + appended:
   "Previous attempt had these issues: {issues}.
   Fix them while preserving good decisions."
  ↓ validation fails
Attempt 3: Switch model (Opus 4.7 → GPT-5)
  ↓ validation fails
Fallback: Pure deterministic categorization (tags-based) +
          auto-naming ({tag}_{verb} from method);
          flag generation as "needs review";
          surface to user в UI for manual cleanup
```

Three retries, потом degraded mode. **Никогда не блокируем generation** — лучше degraded artifact + warning, чем full fail. Пользователь сам решает использовать ли.

---

## 9. Chunked approach для очень больших specs

Для specs > 200 endpoints (Salesforce, AWS, etc.) — single LLM call может не влезть в context. Решение: chunked approach с careful design чтобы не потерять качество.

### 9.1 Стратегия chunking

```
                Input: 5000 endpoints
                       │
                       ▼
       ┌─────────────────────────────────────┐
       │  Phase 1: Path-based pre-clustering │
       │  (deterministic)                    │
       │                                      │
       │  Group endpoints by path prefix:    │
       │    /accounts/* → cluster A          │
       │    /opportunities/* → cluster B     │
       │    ...                              │
       │                                      │
       │  Result: 20-50 clusters             │
       └────────────────┬────────────────────┘
                        ▼
       ┌─────────────────────────────────────┐
       │  Phase 2: Cluster-level decisions   │
       │  (one LLM call)                     │
       │                                      │
       │  Decide per-cluster:                │
       │   - Include / exclude entirely      │
       │   - Estimated tool budget per       │
       │     included cluster                 │
       │   - Multi-server split suggestion?  │
       │                                      │
       │  Output: cluster plan               │
       └────────────────┬────────────────────┘
                        ▼
       ┌─────────────────────────────────────┐
       │  Phase 3: Per-cluster detail        │
       │  (parallel LLM calls)               │
       │                                      │
       │  For each kept cluster:             │
       │   - Inventory & naming              │
       │   - Within cluster's tool budget    │
       │                                      │
       │  ~5 parallel calls                  │
       └────────────────┬────────────────────┘
                        ▼
       ┌─────────────────────────────────────┐
       │  Phase 4: Cross-cluster merging     │
       │  (one LLM call)                     │
       │                                      │
       │  - Resolve naming conflicts         │
       │  - Identify cross-cluster composite │
       │     candidates                       │
       │  - Final cap enforcement            │
       └─────────────────────────────────────┘
```

### 9.2 Качество gates для chunked approach

Главный риск chunked — потеря holistic view. Mitigation:

1. **Cluster-level metadata передаётся между phases.** В Phase 3 каждый cluster видит что решено в других clusters (через summary).

2. **Phase 4 cross-cluster merging обязательна.** Никогда не возвращаем результат без global review.

3. **Composite candidates collected globally.** Cross-cluster composite — частый pattern (например, `customer_to_invoice` спан между `/customers/*` и `/invoices/*`).

4. **Naming conflict detection.** Если два cluster'а независимо назвали `_create` — Phase 4 disambiguates.

### 9.3 Cost для chunked

Stripe-class spec (350 endpoints, не triggered chunked):
- Single call: $0.10-0.30, 10-30s

Salesforce-class spec (5000 endpoints, chunked):
- Phase 1: $0 (deterministic)
- Phase 2: $0.20 (one Opus call с cluster summaries)
- Phase 3: $0.50 (5 parallel Opus calls)
- Phase 4: $0.10 (один merge call)
- **Total: ~$0.80, time ~60s**

Это ещё в budget. Но если spec > 10K endpoints — стоит fail и suggest multi-server.

### 9.4 Activation threshold

```python
if len(endpoints_after_stage_1) <= 200:
    use_single_call_approach()
elif len(endpoints_after_stage_1) <= 1000:
    use_chunked_approach()
else:
    fail("Spec too large; please split into multiple servers", 
         suggestions=top_level_path_prefixes)
```

---

## 10. Edge cases

Места, где Pass 0 ломается, если не подумали заранее:

| # | Случай | Решение |
|---|---|---|
| E1 | Spec без tags | LLM выводит категории из path patterns. Flag `no_tags_detected: true` |
| E2 | Tags грязные (`Charges`, `charges`, `Payment`) | LLM нормализует |
| E3 | Один path, несколько methods | Каждый method = отдельный tool (`charges_get`, `charges_delete`) |
| E4 | Polymorphic endpoint (`POST /webhooks/{event_type}`) | Один tool с `event_type` параметром, не N tools |
| E5 | RPC-style API (`POST /api/calculate-tax`) | Keep as-is, naming `tax_calculate` |
| E6 | Versioned paths (`/v1/charges` + `/v2/charges`) | Default keep latest; flag user choose если оба нужны |
| E7 | Endpoint требует undocumented credentials | Flag для user, не отбрасываем automatically |
| E8 | Spec на не-английском | LLM работает на оригинальном языке для understanding, но output category names всегда English |
| E9 | Очень длинный operationId | LLM полностью переименовывает |
| E10 | Conflicting operationId across paths | LLM делает unique через path context |
| E11 | Endpoint с `security: []` (явно публичный) | `auth_required: false`, не требуем credentials |
| E12 | Endpoint с разными security per method | Per-method tracking; rare case |

---

## 11. Golden eval set (CI regression testing)

Минимум 7 cases, запускаются на каждый PR в Pass 0 code/prompts. Threshold: < 80% pass rate = block merge.

### 11.1 Cases

| # | API | Expected behavior | Key checks |
|---|---|---|---|
| G1 | **Stripe API** (350 endpoints, classic REST) | ~50 tools, dropouts ~80%, composites: `customer_context`, `subscription_lifecycle` | Правильно отбросить deprecated `legacy/charge`, internal `treasury/*` админку |
| G2 | **GitHub API** (200+ endpoints) | ~50 tools, namespaces: `repos`, `issues`, `pulls`, `actions` | Правильно сгруппировать `repos_*` против `users_repos_*` |
| G3 | **Notion API** (~30 endpoints, простая) | ~20 tools, fewer drops | Не отбросить ничего полезного, не over-engineer |
| G4 | **Salesforce REST** (тысячи endpoints) | Triggers `spec_too_large` flag, suggests multi-server split | Graceful failure mode, useful suggestions |
| G5 | **Малая custom API без tags** (15 endpoints) | LLM выводит categories из path patterns | `no_tags_detected` flag, sensible category inference |
| G6 | **Spec с many deprecated endpoints** | High dropout rate, flag поднят, reasoning ясен | Не паника, чёткое объяснение пользователю |
| G7 | **RPC-style API** (Twilio-like) | Keeps RPC-style names, hesitates on namespacing | Not forcing CRUD pattern |

### 11.2 Assertion format per case

```python
@pytest.fixture
def stripe_eval():
    return load_eval("stripe_api_v1")

def test_stripe_inventory(stripe_eval):
    output = pass_0(stripe_eval.input)
    
    # Tool count
    assert 40 <= len(output.tool_plans) <= 60
    
    # Specific tools must be present
    assert "charges_create" in [t.name for t in output.tool_plans]
    assert "customers_search" in [t.name for t in output.tool_plans]
    
    # Specific drops
    dropped_paths = [d.path for d in output.dropped_endpoints]
    assert any("legacy" in p for p in dropped_paths)
    
    # Flags
    assert not output.flags.spec_too_large
    assert not output.flags.no_tags_detected
    
    # Composite candidates
    candidate_names = [c.suggested_composite_name for c in output.composite_candidates]
    assert any("customer" in n.lower() for n in candidate_names)
```

---

## 12. Cost & latency budget

| Item | Cost | Latency |
|---|---|---|
| Stage 1 (deterministic) | $0 | <100ms |
| Stage 2 single call (Opus 4.7) | $0.10-0.30 | 10-30s |
| Stage 2 chunked (для big specs) | $0.50-0.80 | 30-60s |
| Stage 3 (validation) | $0 | <100ms |
| Retry overhead (avg 20% requests) | +20% | +20% |
| **Total typical** | **~$0.15-0.40** | **~15-35s** |
| **Total chunked** | **~$0.60-1.00** | **~40-70s** |

С Anthropic prompt caching system prompt'а (~2000 tokens): -90% на cached part после первого call в сессии. Repeat generation того же spec'а — ~$0.05.

---

## 13. Spec drift detection (механизм updates)

После initial generation сервер живёт во времени. Upstream API меняется. Нужен механизм:

### 13.1 Detection

Background job (Inngest cron, daily):
1. Для каждого active deployment с `source_url` set — fetch current spec
2. Compute hash; compare с stored `spec_hash`
3. Если изменился — diff (added/removed/modified endpoints)
4. Categorize changes:
   - **Breaking** — endpoint removed, parameter signature changed
   - **Additive** — новые endpoints, новые optional params
   - **Cosmetic** — изменения в descriptions, examples

### 13.2 UI surfacing

В dashboard сервера — banner:
```
⚠ Stripe API spec changed 2 days ago.
  • 3 new endpoints
  • 1 endpoint removed (legacy_charge — was already deprecated)
  • 4 endpoints with parameter changes

  [Review changes]  [Auto-regenerate]  [Snooze 7 days]
```

### 13.3 User actions

**Manual review:** показываем diff per-endpoint. User decides:
- Включить новые endpoints в существующий tool set?
- Re-generate описания для changed endpoints?
- Marked deprecated tools — отметить и сохранить для backward compat?

**One-click regenerate:** runs Pass 0 incremental:
- Existing tools without changes — preserved (cached output)
- Changed/new endpoints — go through Pass 0 full pipeline
- Removed endpoints — marked deprecated, eventually cleaned

**Auto-regenerate (toggle):** для пользователей, которые доверяют системе. Cron job runs full re-gen + новый deploy. Email notification после успеха.

### 13.4 Impl notes

- Diff computation — deterministic (path + method + parameters hash)
- Auto-regenerate gating: only minor changes автоматически; breaking — обязательно user review
- Versioning: каждый regenerate creates new generation record; previous deployment остаётся active до user approve switch

---

## 14. Открытые вопросы (research/experiments)

❓ **Что считать "low value for agents"?** Это subjective. LLM на этой стадии сделает свой judgement, но мы не сможем гарантированно повторить решение. **Mitigation:** low temperature (0.3), explicit examples в prompt. **Experiment:** запустить Pass 0 на 5 одинаковых specs три раза, измерить consistency drop rate. Acceptance: ≥85% same decisions.

❓ **Когда тегов нет — насколько LLM хорошо выводит категории из path patterns?** Не знаю до golden eval G5. Если плохо — добавить fallback heuristics (path prefix → cluster). **Experiment:** на 3 примерах APIs без tags измерить, сколько категорий LLM правильно identifies vs обоснованный manual baseline.

❓ **Hard cap thresholds (30/50/80) — реалистичны?** Это educated guess based на Anthropic recommendations и paper findings. Реальная calibration — после 100+ generation на разных APIs. **Experiment:** track для первых 100 deployments — какой tool count показывает best agent eval scores (Stage F3).

❓ **Single Opus call vs chunked — точная threshold (200 endpoints)?** Linear interpolation на cost. **Experiment:** measure quality (eval F3 success rate) vs spec size, найти knee point.

❓ **Стоит ли давать пользователю просмотр и редактирование `tool_plans` ДО Pass 1+?** Trade-off: больше control vs больше friction. **Experiment:** A/B test — два UX flows, измерить completion rate и satisfaction.

❓ **Composite candidates confidence — насколько LLM хорошо predict'ит actual usage patterns?** Без production traffic это спекуляция. **Mitigation:** в production — track tool call sequences, refine composite suggestions based on real data.

---

## 15. Что Pass 0 НЕ делает (boundary)

Чтобы не пересекаться с другими passes:

- **НЕ пишет descriptions** (Pass 2)
- **НЕ обрабатывает parameters** (Pass 3)
- **НЕ выводит annotations** (Pass 4 + детерминированные правила)
- **НЕ создаёт composite tools** — только **suggests candidates** для Pass 1
- **НЕ принимает решения о response shaping** (Pass 5)
- **НЕ запрашивает credentials** (это UI subsystem)
- **НЕ делает test calls** к upstream API (это Stage F validation, опционально)

Pass 0 — это «Я архитектор, я решаю что строить и как назвать». Authoring — Pass 2+.

---

## 16. Финальные decisions, зафиксированные

1. ✅ Pass 0 — гибрид (deterministic stage 1 → LLM stage 2 → validation stage 3), не чисто LLM
2. ✅ Single Opus call на all remaining endpoints для small/medium specs (≤200 endpoints)
3. ✅ Chunked approach для big specs (200-1000), 4-phase pipeline
4. ✅ Hard fail для very big specs (>1000), suggest multi-server split
5. ✅ `target_complexity` как user-facing parameter (minimal/standard/comprehensive)
6. ✅ `dropped_endpoints` всегда returnable to user через User Override Flow
7. ✅ Hard cap thresholds: 30/50/80 (с Pro override до 100)
8. ✅ Auth detection детерминирован, recommended_mode выводится правилом
9. ✅ Spec drift detection через daily Inngest cron + UI surface
10. ✅ Auto-regenerate как opt-in toggle для trusted users
11. ✅ Golden eval set из 7 cases, < 80% pass rate = block merge
12. ✅ Three retries → degraded fallback, never full fail
