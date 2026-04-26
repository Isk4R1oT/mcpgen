# Pass 3: Parameter Specification — Detailed Design

> **Документ:** detailed design четвёртого LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** `pass-0-design.md`, `pass-1-design.md`, `pass-2-design.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Pass 3 берёт parameter signatures из Pass 1 и parameter overview из Pass 2 → производит **production-ready JSON Schema с rich, teaching descriptions** для каждого параметра.

Это второй по importance pass для quality. Paper: **Opaque Parameters — smell в 84.3% MCP серверов**. Главная защита — explicit naming, formats, enums, defaults, examples, и **per-parameter detailed descriptions**.

Особое внимание filter параметрам в universal tools (highest-stakes — здесь LLM чаще всего ошибается с форматом).

Pass 3 — гибрид: 60% детерминированный (typed extraction из spec), 40% LLM (descriptions, format hints, examples).

---

## 1. Research foundation

### 1.1 Anthropic ("Writing effective tools for agents", Sept 2025)

Прямые рекомендации:

> "Input parameters should be unambiguously named: instead of a parameter named `user`, try a parameter named `user_id`."

> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs."

Про error handling:

> "If a tool call raises an error (for example, during input validation), you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."

### 1.2 MCP Bundles "Parameter Design" (Oct 2025)

Концретный template для каждого параметра — **5 компонентов**:

1. **What it is** (1 sentence)
2. **Possible values / format / range**
3. **When to use it / what it affects**
4. **Example** (concrete, copy-pastable)
5. **Default / omission behavior**

Принципиальная разница bad vs good:

```
Bad:  limit: int — Number of results
Good: limit: int — Maximum objects per request (default: 10, max: 100). 
      Use 10-20 for exploration, 50-100 for bulk operations.
```

### 1.3 arXiv 2602.14878 — empirical evidence

| Smell | Prevalence | Component |
|---|---|---|
| Unstated Limitations | 89.8% | (Pass 2 covers) |
| Missing Usage Guidelines | 89.3% | (Pass 2 covers) |
| **Opaque Parameters** | **84.3%** | **Pass 3's main fight** |
| Underspecified | 79.1% | (Length issue) |
| Exemplar Issues | 77.9% | (Examples) |
| Unclear Purpose | 56% | (Pass 2 covers) |

Opaque Parameters smell означает: parameter names abstract, formats не указаны, defaults missing, relationships между params unclear. **Это именно то, что Pass 3 устраняет.**

### 1.4 MCP spec 2025+ requirements

JSON Schema подмножество:
- type ∈ {string, integer, number, boolean, array, object}
- description on every property
- required: list
- properties с enum constraints где applicable
- minimum/maximum для numbers
- minLength/maxLength для strings
- pattern для regex constraints
- default values
- additionalProperties: false (recommended)

Названия параметров: 1-128 chars, ASCII alphanumeric + underscore + hyphen + dot, case-sensitive.

### 1.5 Industry consensus (Goclaw, Apxml, Nearform)

Сходятся:
- **Flat structure preferred** — deep nesting = higher token count + cognitive load
- **Primitive types over nested objects** — разбивать complex objects на отдельные params если возможно
- **Use enums liberally** — снижает hallucinations  
- **Type hints serve as documentation** — `Literal["asc", "desc"]` says "only these two values"

---

## 2. Что Pass 3 делает с каждым параметром (5 dimensions)

### Dimension 1 — Naming

OpenAPI часто даёт плохие имена. Pass 3 normalize'ит:

| Bad (from spec) | Good (Pass 3 output) |
|---|---|
| `user` | `user_id` |
| `id` (ambiguous context) | `customer_id` (when in customers context) |
| `data` | `payload` (or specific name like `event_data`) |
| `obj` | `object_data` (or specific) |
| `time` | `created_at` (if timestamp) |
| `status` | `ticket_status` или `payment_status` (disambiguate) |

**Правило:** имя должно быть unambiguous даже если читать в isolation, без context tool name.

### Dimension 2 — Format & Constraints

Generate explicit constraints из spec:

```json
{
  "user_email": {
    "type": "string",
    "format": "email",
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User's email in lowercase. Format: name@domain.tld."
  },
  "due_date": {
    "type": "string",
    "format": "date",
    "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
    "description": "Due date in yyyy-mm-dd format. Example: '2026-04-26'."
  },
  "amount_cents": {
    "type": "integer",
    "minimum": 50,
    "maximum": 99999999,
    "description": "Amount in cents (USD). Min: 50 ($0.50). Max: 99999999 ($999,999.99)."
  }
}
```

**Source:** spec метаданные → JSON Schema constraints + LLM пишет human-readable description с examples.

### Dimension 3 — Enums

Если spec даёт enum или мы можем infer из docs — encode as enum:

```json
{
  "status": {
    "type": "string",
    "enum": ["draft", "sent", "viewed", "signed", "completed", "voided"],
    "description": "Envelope lifecycle status. 'draft'=editable, 'sent'=delivered to signers, 'viewed'=opened by at least one signer, 'signed'=all signed, 'completed'=finalized PDF available, 'voided'=cancelled."
  }
}
```

**Anthropic exact recommendation:** "Use enums to constrain parameters to valid values."

### Dimension 4 — Defaults

Каждый optional параметр получает default:

```json
{
  "limit": {
    "type": "integer",
    "minimum": 1,
    "maximum": 100,
    "default": 10,
    "description": "Maximum results per page. Default: 10 (good for exploration). Max: 100. Use 50-100 for bulk operations."
  }
}
```

Где брать defaults:
- Из spec (если есть `default` field)
- Sensible defaults (limit=10, offset=0, sort_order="desc" для timestamp fields)
- LLM inference из context (для domain-specific cases)

**Anthropic recommendation:** "Smart defaults reduce friction. Make your most common use case work with minimal parameters."

### Dimension 5 — Description (5-component template)

Per MCP Bundles, каждый параметр получает description со всеми 5 components:

```
{name}: {type} — {what it is}.
{Format/values/range info}.
{When to use / what it affects}.
{Example: concrete, copy-pastable}.
{Default behavior or omission semantics}.
```

Пример:
```
filter: object — Filter condition to match property values.
Format: {"property": "field_name", "operator": "Equal|NotEqual|GreaterThan|LessThan", "value": <value>}.
Use when you have specific structured constraints; combine with `query` for hybrid search.
Example: {"property": "status", "operator": "Equal", "value": "active"} returns only active items.
Optional. If omitted, no filter applied (returns all results).
```

---

## 3. Per-tool-type parameter strategies

Different tool types treat parameters differently — это уточнение из MCP Bundles "Two Standards".

### 3.1 Universal Discovery Tools (search, fetch) — OpenAI Standard

**Constraint:** single-string parameters только. Это OpenAI ChatGPT requirement.

```json
"search": {
  "query": {
    "type": "string",
    "description": "Natural language OR structured query. Server parses both. \nNatural: 'recent failed payments'. \nStructured: 'collection:Charge status:failed amount_gte:100'. \nExamples: 'NDA agreements from John', 'collection:Customer email:*@example.com'."
  }
}

"fetch": {
  "id": {
    "type": "string",
    "description": "Smart ID with format {server}:{type}:{collection}:{identifier}. \nExamples: 'stripe:object:Charge:ch_123abc', 'stripe:object:Customer:cus_xyz'. \nGet IDs from search results. Plain identifiers also accepted for backward compat."
  }
}
```

### 3.2 Universal List Tools (list_collections, list_objects) — Rich Parameters

Здесь rich parameter design shines. Стандартный set:

```json
"list_objects": {
  "collection": { ... required ... },
  "properties": {
    "type": "array",
    "items": {"type": "string"},
    "default": [],
    "description": "Property names to include. Empty = all. Use to reduce response size when you need specific fields. Example: ['title', 'price', 'status']."
  },
  "filter": { ... see § 11 ... },
  "sort_by": { ... },
  "sort_order": {
    "type": "string",
    "enum": ["asc", "desc"],
    "default": "desc",
    "description": "Sort direction. 'asc'=oldest/smallest first; 'desc'=newest/largest first. Default 'desc' so most recent appears first."
  },
  "limit": {
    "type": "integer",
    "minimum": 1,
    "maximum": 100,
    "default": 25,
    "description": "Results per page. Default 25. Max 100. Use 25-50 for browsing, smaller for previewing."
  },
  "offset": {
    "type": "integer",
    "minimum": 0,
    "default": 0,
    "description": "Pagination start. Use with limit. Example: limit=25 offset=50 returns items 51-75."
  }
}
```

### 3.3 Unified Write Tools (upsert, delete) — Smart Routing Parameters

```json
"upsert": {
  "collection": {
    "type": "string",
    "description": "Target collection name. See list_collections() for available."
  },
  "data": {
    "oneOf": [
      {"type": "object", "description": "Single object to create/update"},
      {"type": "array", "items": {"type": "object"}, "description": "Array for batch operation"}
    ],
    "description": "Object data. Pass single object for one item, array for batch. Server handles both."
  },
  "id": {
    "type": "string",
    "description": "Object ID for update. If provided, updates existing; if omitted, creates new. For batch, see ids."
  },
  "ids": {
    "type": "array",
    "items": {"type": "string"},
    "description": "Array of IDs matching data array for batch updates. Required when data is array AND you want to update existing items."
  }
}

"delete": {
  "type": {
    "type": "string",
    "enum": ["object", "objects", "collection"],
    "description": "Deletion scope. 'object'=single by id; 'objects'=multiple by ids; 'collection'=entire collection (DESTRUCTIVE)."
  },
  "id": { "type": "string", "description": "For type='object'. Object ID to delete." },
  "ids": { "type": "array", "items": {"type": "string"}, "description": "For type='objects'. Array of IDs." },
  "collection": { "type": "string", "description": "For type='collection'. Collection name." },
  "confirm": {
    "type": "boolean",
    "default": false,
    "description": "Required true for type='collection'. Safety check to prevent accidental mass deletion."
  }
}
```

### 3.4 Action Tools — Domain-specific Parameters

Action tools (`charges_capture`, `messages_send`) get business-specific parameters. Few, focused, every parameter explicit.

```json
"charges_capture": {
  "charge_id": {
    "type": "string",
    "pattern": "^ch_[A-Za-z0-9]+$",
    "description": "Charge ID to capture. Must be in 'pending' state. Format: ch_xxxxxxx. From a previous create_charge call (with capture=false) or search."
  },
  "amount_cents": {
    "type": "integer",
    "minimum": 1,
    "default": null,
    "description": "Amount to capture in cents. If omitted, captures full authorized amount. Use to capture partial — remaining authorization is released. Cannot exceed original authorization."
  },
  "idempotency_key": {
    "type": "string",
    "description": "Optional. Recommended for retry safety. Use UUID. Ensures replays don't double-capture."
  }
}
```

### 3.5 Workflow Tools — Coarse parameters (not granular)

Workflow tools accept "what user wants", not internal step parameters. Granularity matches user intent.

```json
"schedule_event": {
  "person_email": {
    "type": "string",
    "format": "email",
    "description": "Email of person to invite. Used to find user and check their calendar. Example: 'jane@example.com'."
  },
  "duration_minutes": {
    "type": "integer",
    "minimum": 15,
    "maximum": 480,
    "default": 30,
    "description": "Meeting length in minutes. Default 30. Common values: 15 (quick sync), 30 (regular), 60 (deep dive)."
  },
  "preferred_window": {
    "type": "object",
    "properties": {
      "start": {"type": "string", "format": "date-time"},
      "end": {"type": "string", "format": "date-time"}
    },
    "description": "Window to search for free slots. Format: ISO 8601 datetimes. Example: start='2026-04-26T09:00:00Z' end='2026-04-26T17:00:00Z' to schedule today during business hours."
  }
}
```

NOT parameters: internal step IDs, intermediate states. User does not need them.

---

## 4. Filter parameter design (highest stakes)

Из MCP Bundles: «filter parameters need to be crystal clear because the AI is constructing structured data, not just passing strings».

3 approaches, выбираем per tool:

### Approach A: Structured Object Filter (RECOMMENDED для большинства case)

```json
"filter": {
  "type": "object",
  "properties": {
    "property": {
      "type": "string",
      "description": "Field name to filter on. Example: 'status', 'created_at', 'priority'."
    },
    "operator": {
      "type": "string",
      "enum": ["Equal", "NotEqual", "GreaterThan", "LessThan", "Contains", "In"],
      "description": "Comparison operator. 'Equal'=exact match; 'In'=match any of array values; 'Contains'=substring (strings only); 'GreaterThan'/'LessThan'=for numbers/dates."
    },
    "value": {
      "description": "Value to compare against. Type depends on field: number for amount, string for status, array for 'In' operator."
    }
  },
  "required": ["property", "operator", "value"],
  "description": "Filter condition. Format: {property, operator, value}. \nExamples: \n- {property: 'status', operator: 'Equal', value: 'active'} \n- {property: 'amount', operator: 'GreaterThan', value: 100} \n- {property: 'priority', operator: 'In', value: ['high', 'critical']} \nFor multiple conditions, use 'and'/'or' wrappers (see Advanced filtering)."
}
```

### Approach B: Query String DSL

Когда у underlying data store есть native query language (SQL, ElasticSearch, etc.):

```json
"where": {
  "type": "string",
  "description": "WHERE clause without 'WHERE' keyword. PostgreSQL syntax. Examples: \"status = 'active'\", \"created_at > '2026-01-01'\", \"price BETWEEN 10 AND 100\". Use single quotes for strings. Date format ISO 8601."
}
```

### Approach C: Individual Filter Parameters

Для simple cases с few possible filters:

```json
"status": {
  "type": "string",
  "enum": ["new", "open", "pending", "solved", "closed"],
  "description": "Filter by ticket status. Multiple statuses not supported here — use search tool with structured query for OR conditions."
},
"assigned_to": {
  "type": "string",
  "description": "Filter by assignee email or ID. Example: 'agent@example.com' or 'agt_123'."
}
```

### Decision rule (Pass 3 prompt):

```
For this universal tool's filter parameter:

If underlying API uses GraphQL/SQL/native query language:
  → Approach B (DSL string)
Else if filter typically uses 1-2 fields с simple operators:
  → Approach C (individual params, max 4)
Else:
  → Approach A (structured object) — DEFAULT
```

---

## 5. Pipeline

```
┌──────────────────────────────────────────────────────────┐
│  PHASE 1: Schema extraction (deterministic)              │
│                                                           │
│  For each parameter in each tool:                        │
│  - Pull from spec: type, format, enum, min/max,          │
│    pattern, default, required                            │
│  - Identify filter parameters (special handling § 11)    │
│  - Identify smart ID parameters (special handling § 12)  │
│  - Detect ambiguous names → flag for LLM rename          │
│                                                           │
│  Cost: $0, time: <1s                                     │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 2: Per-parameter LLM enrichment                   │
│  (LLM, parallel calls)                                    │
│                                                           │
│  For each parameter:                                      │
│  - Generate rich description (5-component template)      │
│  - Generate example value (when applicable & safe)       │
│  - Suggest better name if ambiguous                      │
│  - Infer enum values if spec says "string" but actually  │
│    constrained domain (e.g., status fields)              │
│                                                           │
│  Concurrency: 20 parallel calls (parameters lightweight).│
│  Cost: ~$0.20-0.40 per server (~50-100 parameters total).│
│  Time: 30-60s.                                            │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 3: Cross-parameter validation (deterministic)     │
│                                                           │
│  Within each tool:                                        │
│  - Parameter name uniqueness                             │
│  - Required parameters listed correctly                  │
│  - Mutually exclusive params marked                      │
│  - Filter param matches one of 3 approaches              │
│  - JSON Schema validity                                  │
│                                                           │
│  Cost: $0, time: <1s                                     │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 4: Inline quality gate (LLM judge)                │
│                                                           │
│  Single Haiku judge per tool checks:                     │
│  - All parameters have rich descriptions                 │
│  - Examples present where complex                        │
│  - Defaults documented                                   │
│  - No "Opaque Parameters" smell                          │
│                                                           │
│  Score < 3 → retry Phase 2 для проблемных params         │
│  Cost: ~$0.05, time: 10-15s                              │
└──────────────────────────────────────────────────────────┘
```

**Why per-parameter parallel:** parameters internally independent. Maximum throughput.

**Why deterministic Phase 1:** 60% работы не требует LLM — straightforward extraction из OpenAPI. Saves cost and reduces hallucination risk.

---

## 6. Input

```python
class Pass3Input(BaseModel):
    spec_info: SpecInfo
    tools_with_descriptions: list[ToolWithDescription]    # from Pass 2
    spec_endpoints: dict[str, Endpoint]                   # for fetching original parameter metadata
    smart_id_schema: SmartIdSchema                        # from Pass 1
    auth_info: AuthRequirement
```

For each tool, we need access to **all subsumed endpoints' parameters** — universal tools накапливают params from many endpoints.

---

## 7. Output

```python
class Pass3Output(BaseModel):
    tools_with_full_schemas: list[ToolWithFullSchema]
    parameters_summary: ParametersSummary
    flags: Pass3Flags

class ToolWithFullSchema(BaseModel):
    name: str
    description: ToolDescription                  # from Pass 2
    description_text: str                         # from Pass 2
    inputSchema: JsonSchema                       # FULL, ready for MCP tools/list
    parameter_renames: dict[str, str]             # original → new name (for codegen)
    
class JsonSchema(BaseModel):
    type: Literal["object"] = "object"
    properties: dict[str, ParameterSchema]
    required: list[str]
    additionalProperties: bool = False

class ParameterSchema(BaseModel):
    type: str                                     # JSON Schema type
    description: str                              # rich, 5-component
    enum: list | None = None
    format: str | None = None                     # email, date, uri, etc.
    pattern: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    minLength: int | None = None
    maxLength: int | None = None
    default: Any = None
    examples: list[Any] | None = None             # parameter value examples (safe)
    items: dict | None = None                     # for arrays
    properties: dict | None = None                # for nested objects (rare)
    oneOf: list[dict] | None = None               # for upsert.data type
    
class ParametersSummary(BaseModel):
    total_parameters: int
    parameters_renamed: int                       # ambiguous → unambiguous
    parameters_with_enums: int
    parameters_with_defaults: int
    parameters_with_examples: int
    avg_description_length: float
    
class Pass3Flags(BaseModel):
    ambiguous_names_fixed: list[str]              # for transparency
    parameters_with_low_quality_score: list[str]  # для surface
    spec_originally_lacked_descriptions: int      # сколько нужно было полностью generate
    filter_strategy_chosen: dict[str, str]        # tool_name → "structured" | "dsl" | "individual"
```

---

## 8. LLM Prompts

### 8.1 System prompt (cached)

```
You design parameter schemas for MCP tools, following Anthropic's principles
and the MCP Bundles parameter design template.

PRINCIPLES:

1. NAMING — Disambiguous, even in isolation:
   user → user_id; data → payload; status → ticket_status
   Names self-descriptive even without tool context.

2. TYPE HINTS as documentation:
   Use enums where domain is constrained
   Use precise types: integer not string for numbers
   Use format hints (email, date, uri, uuid) where applicable

3. EVERY parameter description has 5 components:
   - What it is (1 sentence)
   - Possible values / format / range
   - When to use it / what it affects
   - Example (concrete, copy-pastable, safe)
   - Default / omission behavior

4. EXAMPLES — Generate value examples (NOT execution result examples):
   email: "Example: 'jane@example.com'"     ← safe, just format
   filter: "Example: {property: 'status', operator: 'Equal', value: 'active'}"  ← safe
   tool result: do not generate                                                  ← unsafe (hallucination)

5. DEFAULTS — Every optional parameter gets a default:
   - From spec.default if present
   - Sensible defaults (limit=10/25, offset=0, sort_order="desc" for timestamps)
   - null for "no value" semantics

6. ENUMS — Use them where domain is finite:
   sort_order, status, type fields, comparison operators
   Without spec enum, infer from documentation patterns

NAMING NORMALIZATION RULES:

If parameter name from spec is in this list, rename:
  user, owner, member, person → {role}_id (e.g., assignee_id)
  id (when ambiguous from context) → {entity}_id
  data → payload OR {specific}_data
  obj → object_data OR specific name
  time, timestamp → created_at OR updated_at OR specific
  status (when ambiguous) → {entity}_status

DESCRIPTION TEMPLATE:

For each parameter, write description that teaches:

  {param}: {type} — {what it is in one sentence}.
  {Format/values/range info if applicable}.
  {When to use / how this parameter affects behavior}.
  {Example: concrete, format-correct value}.
  {Default behavior or omission semantics if optional}.

QUALITY BAR:

- No "Opaque Parameters" smell (paper rubric)
- Format hints present where applicable (email, date, uuid, etc.)
- Enums used where domain finite
- Defaults set + explained for optional
- Examples present для complex types (objects, filter params, etc.)
- Mutually exclusive params explicitly noted

OUTPUT: structured JSON matching ParameterSchema schema.
```

### 8.2 User prompt (per tool)

```
Tool: {tool.name}
Tool type: {tool.type}                        # universal | action | workflow | specialized
Tool purpose: {tool.description.purpose}

Parameters from Pass 1 + spec extraction:

{for each parameter:}
  Name (from spec): {original_name}
  Type: {extracted_type}
  Required: {is_required}
  Source: {endpoint_path} parameter "{location}"
  Spec description: {spec_description or "(none)"}
  Spec format: {spec_format or "(none)"}
  Spec default: {spec_default or "(none)"}
  Spec enum: {spec_enum or "(none)"}
  Spec constraints: {min/max/pattern from spec}

{if smart_id_param:}
SMART ID parameter detected:
  Format: {smart_id_format}
  Collections it routes to: {collection_list}

{if filter_param:}
FILTER parameter detected:
  Recommended approach: {chosen_approach}  # structured | dsl | individual
  Underlying query language: {if applicable}
  Common filter fields: {list from spec usage}

Generate per-parameter schemas with rich descriptions.
```

---

## 9. Programmatic validation (Phase 3)

| Check | Action |
|---|---|
| Все names unique within tool | Auto-rename collisions |
| Names match `^[a-zA-Z][a-zA-Z0-9_]*$` (snake_case ASCII) | Fix |
| Description ≥ 50 characters per parameter | Retry с feedback |
| Description contains all 5 components (regex check) | Retry |
| Required параметры в `required` list | Auto-fix |
| Optional параметры have `default` field | Fill с null или sensible |
| Enum types have `enum` array | Pull from spec or LLM-infer |
| Email-like names have `format: email` | Auto-add |
| Date-like names have `format: date` или `format: date-time` | Auto-add |
| ID-like names have `pattern` где applicable | Auto-add для known patterns (UUIDs, prefixed IDs) |
| Filter parameter matches one of 3 approaches | Reject если custom approach |
| JSON Schema valid via ajv | Reject и retry |
| No deeply nested objects (depth > 3) | Flatten where possible |
| Forbidden description patterns ("just", "simply", "use this to") | Strip и retry |

---

## 10. Per-parameter quality scoring (Phase 4)

Single Haiku judge applies parameter-specific rubric:

```
Score per parameter (1-5):

Naming clarity:
  5 = Self-descriptive in isolation (e.g., customer_email_address)
  4 = Clear with minimal context
  3 = Generic but adequate (e.g., "name")
  2 = Ambiguous (e.g., "user" without role)
  1 = Misleading или wrong

Description completeness:
  5 = All 5 components present и accurate
  4 = Most components, minor gap
  3 = Basic description, missing 1-2 components
  2 = Vague hints
  1 = Generic or missing

Format/constraint accuracy:
  5 = Correct enum/format/pattern matching spec
  4 = Mostly correct, minor lapse
  3 = Type correct but constraints loose
  2 = Type ambiguous
  1 = Wrong type

Example quality:
  5 = Concrete, copy-pastable, format-correct
  4 = Good example, minor tweaks needed
  3 = Generic example
  2 = Vague placeholder ("...example...")
  1 = Missing example for complex type

Default/optional clarity:
  5 = Default + explanation of omission behavior
  4 = Default present, behavior implicit
  3 = Default set, no explanation
  2 = Optional but no default
  1 = Required vs optional unclear

Overall score = avg of components
If avg < 3 → retry Phase 2 для этого параметра с feedback
```

---

## 11. Filter parameter design — detailed strategy

This is **highest-stakes section** в Pass 3. Per MCP Bundles: «If your filter description says 'object for filtering' with no structure shown, the AI will guess.»

### 11.1 Detection — какой approach use

Detection is deterministic, runs in Phase 1:

```python
def detect_filter_strategy(tool: ToolWithDescription, spec: Spec) -> FilterStrategy:
    if tool.type not in ("universal_list", "universal_search"):
        return None  # actions/workflows don't need complex filtering
    
    # If underlying API has SQL/GraphQL native:
    if spec.has_native_query_language():
        return FilterStrategy.DSL_STRING
    
    # If filter typically simple (1-2 fields):
    common_filters = analyze_spec_filter_usage(spec)
    if len(common_filters) <= 2 and all(f.is_simple_equality for f in common_filters):
        return FilterStrategy.INDIVIDUAL_PARAMS
    
    # Default — most flexible:
    return FilterStrategy.STRUCTURED_OBJECT
```

### 11.2 Approach implementation details

#### Approach A: Structured Object

Schema:
```json
{
  "filter": {
    "type": "object",
    "properties": {
      "property": {"type": "string", "description": "..."},
      "operator": {"type": "string", "enum": [...], "description": "..."},
      "value": {"description": "..."}
    },
    "required": ["property", "operator", "value"],
    "description": "..."
  }
}
```

Operators standard set:
- `Equal`, `NotEqual` — для всех types
- `GreaterThan`, `LessThan`, `GreaterOrEqual`, `LessOrEqual` — numbers, dates
- `Contains` — strings only
- `In`, `NotIn` — value is array
- `IsNull`, `IsNotNull` — without value param

Description должно перечислить все operators с их semantics.

#### Approach B: DSL String

Schema:
```json
{
  "where": {
    "type": "string",
    "description": "WHERE clause без 'WHERE' keyword. Syntax: {dsl_name} (e.g., PostgreSQL, MongoDB query). Examples: ..."
  }
}
```

Description must include:
- DSL identifier (PostgreSQL? MongoDB? Custom?)
- 3+ examples с разными operators
- Escaping rules для strings
- Date format specifications

#### Approach C: Individual Filter Parameters

Each common filter gets its own parameter:

```json
{
  "status": {"enum": [...], "description": "..."},
  "assignee_id": {"type": "string", "description": "..."},
  "created_after": {"type": "string", "format": "date", "description": "..."}
}
```

Limit: max 4 individual filter params. More → switch to Approach A.

### 11.3 Validation для filter params

После generation:
- Approach A: parameter is named "filter" or "filters"
- Approach B: parameter is named "where" or "query_filter"
- Approach C: each filter parameter has clear description with example

Cross-check: tool's description (от Pass 2) consistent with chosen filter approach. Если Pass 2 говорит "use structured filter" но Pass 3 generated DSL — flag mismatch.

---

## 12. Smart ID parameter documentation

Universal tools используют smart IDs (см. Pass 1). Pass 3 must document format.

```json
{
  "id": {
    "type": "string",
    "pattern": "^stripe:(object|collection|schema):[A-Za-z]+:[A-Za-z0-9_-]+$",
    "description": "Smart identifier with format {server}:{type}:{collection}:{identifier}.\n\nSupported types:\n- 'object' for individual records: 'stripe:object:Charge:ch_abc123'\n- 'collection' for collection metadata: 'stripe:collection:Customer'\n- 'schema' for schema definition: 'stripe:schema:Subscription'\n\nGet IDs from search() or list_objects() results. Plain identifiers ('ch_abc123') also accepted for backward compatibility — server infers collection from identifier prefix."
  }
}
```

Pattern regex auto-generated из smart_id_schema (Pass 1 output).

---

## 13. Edge cases

**E1. Spec parameter без description.** LLM generates from name + type + endpoint context. Mark с low confidence flag.

**E2. Spec parameter с conflicting types в разных endpoints (universal tool subsumes).** Например, `id` is integer in /v1/old/{id} но string в /v2/items/{id}. **Решение:** prefer string (more general). Document обе semantics в description. Edge case warning.

**E3. Parameter is enum but spec doesn't explicitly say so.** Например, `status` в API description: "must be one of: active, inactive, pending". LLM extracts. Phase 3 validation cross-checks against parameter usage в endpoint examples. Low confidence flag if can't verify.

**E4. Parameter name conflicts с MCP-reserved words.** E.g., `_meta`. Auto-rename with `_param` suffix.

**E5. Spec uses deeply nested objects (depth > 3).** Например, `{filter: {conditions: [{operator: {type: ...}}]}}`. **Решение:** flatten where possible. Если impossible — keep but warn в quality report.

**E6. Spec has free-form `additionalProperties: true` parameter.** Can't generate strict schema. **Решение:** generate с `additionalProperties: true`, но description very explicit about expected shape.

**E7. Parameter has spec example, но example invalid against constraints.** E.g., spec example `"date": "yesterday"` but format is `date`. **Решение:** drop invalid example, generate valid one.

**E8. Universal tool subsumes endpoints с different parameter sets.** E.g., search in some endpoints uses `query`, в others `q`, в third — `search_term`. **Решение:** unified single name (`query`), document в parameter description что server tolerates aliases.

**E9. Parameter is binary but spec uses string {"true", "false"}.** Convert to proper boolean type. Note backward compat.

**E10. Parameter description содержит prompt injection attempt.** Sanitize: strip suspicious patterns ("ignore previous", "system:"). Treat all spec text as untrusted input.

**E11. Numeric parameter без min/max constraints в spec but obviously bounded** (e.g., HTTP status codes). LLM infers reasonable bounds. Mark как inferred.

**E12. Required-vs-optional inconsistency between endpoints subsumed by universal tool.** E.g., `customer_id` required в `get_customer` but optional в `search`. **Решение:** for universal tool, mark as optional (more permissive). Document в description какие contexts require it.

---

## 14. Cost & latency

For typical server (10 tools, ~80 parameters total):

| Phase | Cost | Latency |
|---|---|---|
| Phase 1 (extraction) | $0 | <1s |
| Phase 2 (per-parameter LLM, parallel ×20) | $0.20-0.40 | 30-50s |
| Phase 3 (validation) | $0 | <1s |
| Phase 4 (quality gate) | $0.05 | 10-15s |
| Retries (~10%) | +10% | +10% |
| **Total** | **~$0.30-0.50** | **~45-70s** |

С Anthropic prompt caching после первого call в сессии: ~50% cost reduction на cached system prompt.

---

## 15. Golden eval set

Минимум 6 cases.

### G1: Stripe `search` parameter (universal tool, single string)

Expected:
- query parameter с rich description
- 3+ examples (natural language + structured)
- DSL syntax documented
- Length: ~150-250 tokens for description

### G2: Stripe `list_objects` (universal с filter)

Expected:
- All 6 standard parameters present (collection, properties, filter, sort_by, sort_order, limit, offset)
- Filter parameter — Approach A (structured object)
- All defaults set
- Example для filter

### G3: Stripe `charges_capture` (action tool)

Expected:
- charge_id с pattern (`^ch_[A-Za-z0-9]+$`)
- amount_cents с min/max и default null
- idempotency_key documented с UUID format
- All required vs optional clear

### G4: Tool с opaque parameter names (E1 test)

Spec parameter `id` without description in CRM context.
Expected:
- Renamed to `customer_id` или `lead_id` (depending on tool context)
- Generated description с inferred semantics
- Low confidence flag

### G5: Filter parameter где spec uses SQL (E test)

Underlying API uses PostgreSQL.
Expected:
- Approach B (DSL string) chosen
- Description includes 3+ SQL examples
- Escaping rules mentioned

### G6: Workflow tool (e.g., schedule_event)

Expected:
- 3 coarse parameters: person_email, duration_minutes, preferred_window
- preferred_window object documented с ISO 8601 format
- Не exposes internal step parameters

CI threshold: 5 of 6 must pass.

---

## 16. Что Pass 3 НЕ делает

- НЕ пишет tool-level descriptions (Pass 2)
- НЕ выводит annotations (Pass 4 — readOnlyHint и т.д.)
- НЕ обрабатывает response schemas (Pass 5)
- НЕ генерирует tool examples (Pass 2 уже handled — null in v0)
- НЕ generates code (Stage E)

Pass 3 produces **production-ready inputSchema** для каждого tool.

---

## 17. Открытые вопросы

❓ **Naming aggressiveness — насколько агрессивно rename'ить?** Risk: пользователь хочет имена, matching спецификации API. Counter-risk: неоднозначные имена ломают agent reasoning. **Decision для v0:** rename только cases из standard list (§ 8.1). Pro feature: opt-in для preserve_original_names.

❓ **Default inference confidence.** Когда мы делаем default sensible (limit=10), а когда явно требуем от spec? Currently: prefer sensible defaults, override если spec disagrees. **Experiment:** на 30 generations check — какие defaults нравятся пользователям, какие меняют после.

❓ **Filter approach — какой default?** Currently structured object (Approach A). Альтернативы: DSL более gibкая, individual params — friendlier для simple cases. **Experiment:** в production track какой approach показывает highest filter accuracy в agent eval.

❓ **Parameter examples generation safety.** Format examples (`'jane@example.com'`) — safe. Но complex object examples (`{property: 'status', value: 'active'}`) — что если этот status не существует в реальном API? **Mitigation:** generate examples с placeholder values если spec не дает confirmed values; mark "(example, verify against your data)".

❓ **Smart ID pattern generation reliability.** Auto-generated regex pattern может быть слишком strict (rejects valid IDs) или слишком loose (accepts garbage). **Experiment:** validate generated patterns against real spec examples; calibrate.

❓ **Cross-tool parameter consistency.** Если `search.query` использует одну DSL syntax, а `list_objects.filter` — другую — agent confused. **Mitigation:** in same server, force consistency. Phase 3 cross-check.

❓ **Что if LLM generate description с factual error** (wrong constraint, wrong default)? Quality judge catches obvious issues; subtle errors pass through. **Mitigation:** Stage F3 agent eval — если real agent fails из-за wrong description, Pass 3 retry triggered.

❓ **Когда оставлять spec defaults vs override sensible defaults?** Spec might say `limit default 50`. Но мы хотим `default 10` для exploration. **Decision:** prefer spec defaults always (don't second-guess API designer). Sensible defaults только когда spec doesn't provide.

---

## 18. Финальные decisions

1. ✅ **5-component description template** для каждого parameter (MCP Bundles)
2. ✅ **Naming normalization** через explicit rules (`user → user_id` patterns)
3. ✅ **Type hints + format + enum + pattern** — все available constraints applied
4. ✅ **Defaults для всех optional** — sensible если spec не дает
5. ✅ **Parameter examples generated** для format/values, не для results (safe)
6. ✅ **Filter parameters** — 3 approaches, deterministic selection rule
7. ✅ **Smart ID format** documented с regex pattern
8. ✅ **Per-parameter parallel LLM calls** (concurrency 20)
9. ✅ **Inline quality gate** через single Haiku judge
10. ✅ **Flat schemas preferred** — depth > 3 flagged
11. ✅ **Cross-tool consistency** verified в Phase 3 validation
12. ✅ **Sanitize all spec text** — treat as untrusted

---

## Appendix A — Standard parameter sets

For consistent generation across tools и servers, эти sets применяются deterministically.

### List operations standard set

```
collection: required string
properties: optional array[string], default []
filter: optional object (Approach A) | string (Approach B) | individual (Approach C)
sort_by: optional string, no default
sort_order: optional enum ["asc", "desc"], default "desc"
limit: optional integer, min 1, max 100, default 25
offset: optional integer, min 0, default 0
include_metadata: optional boolean, default false
```

### Pagination params (для consistent UX)

Если API использует cursor-based:
```
cursor: optional string
limit: optional integer min 1 max 100 default 25
```

Если offset-based:
```
limit + offset (как выше)
```

### Search standard set

```
query: required string  # OpenAI standard
```

Никакого extra. Server parses query.

### Fetch standard set

```
id: required string  # smart ID
```

### Upsert standard set

```
collection: required string
data: required object | array
id: optional string (single update)
ids: optional array[string] (batch update)
```

### Delete standard set

```
type: required enum ["object", "objects", "collection"]
id: optional string
ids: optional array[string]
collection: optional string
confirm: required boolean (when type="collection"), default false
```

---

## Appendix B — Sources

1. **Anthropic** — "Writing effective tools for agents" (Sept 2025)
   https://www.anthropic.com/engineering/writing-tools-for-agents

2. **MCP Bundles** — "MCP Tool Parameter Design: Teaching AI Agents Through Descriptions" (Oct 2025)
   https://www.mcpbundles.com/blog/mcp-tool-parameter-design

3. **arXiv 2602.14878** — "MCP Tool Descriptions Are Smelly!" (Feb 2026)
   84.3% of servers have Opaque Parameters smell — Pass 3 main fight.

4. **MCP spec 2025-06-18** — JSON Schema requirements
   https://modelcontextprotocol.io/specification/2025-06-18/server/tools

5. **Goclaw** — "MCP Server Best Practices" — flat structures, primitives over nesting
   https://goclaw.sh/blog/mcp-server-best-practices

6. **Apxml** — "Tool Definition Schema" — typing as first defense against hallucinations

7. **Nearform** — "Implementing MCP: Tips, Tricks and Pitfalls" — schema testing pitfalls
