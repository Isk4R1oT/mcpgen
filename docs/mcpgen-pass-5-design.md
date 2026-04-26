# Pass 5: Response Shaping — Detailed Design

> **Документ:** detailed design шестого (последнего) LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** все предыдущие pass docs, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Pass 5 — последний LLM-pass перед codegen. Его задача — **уменьшить response token bloat** (часто бóльшая проблема чем schema bloat) и сгенерировать **output schemas** (новый стандарт MCP 2025-06-18).

Пять механизмов: (1) output schema generation, (2) pagination strategy, (3) field filtering defaults, (4) truncation thresholds + guidance messages, (5) `response_format` parameter pattern.

70% работы deterministic. LLM нужен только для field importance ranking и truncation message authoring. Cost ~$0.05-0.15, latency ~10-20s.

---

## 1. Research foundation

### 1.1 The two token problems

Industry consensus (StackOne, production at 200+ connectors):

> "MCP token optimization addresses two distinct costs: schema bloat (input tokens for tool definitions) and response bloat (output tokens flowing back through context). Response bloat often consumes more context than schema bloat but receives less attention."

| Problem | Where it shows | Pass solving |
|---|---|---|
| Schema bloat | Tool definitions in context | Pass 1 (Six-Tool consolidation) |
| Response bloat | Tool outputs flowing back | **Pass 5** |

Real example (StackOne): HRIS `list_employees` with 50 fields per record at 100 records = ~80K tokens raw. Filtered to 5 essential fields = ~8K tokens. 10x reduction without functionality loss.

### 1.2 MCP 2025-06-18 output schema standard

Из [Cisco blog "What's New in MCP"](https://blogs.cisco.com/developer/whats-new-in-mcp-elicitation-structured-content-and-oauth-enhancements):

> "Tools can declare an outputSchema using JSON Schema, enabling precise, typed outputs that clients can validate and parse reliably."

> "MCP embraces a pragmatic approach to schema adherence... Tools SHOULD provide structured results conforming to the output schema, and clients SHOULD validate them. However, flexibility is key — unstructured fallback content remains important."

Spec format ([modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)):

```json
{
  "result": {
    "content": [
      { "type": "text", "text": "{\"key\": \"value\"}" }
    ],
    "structuredContent": {
      "key": "value"
    }
  }
}
```

Дублирование: `structuredContent` для validation, `content` text — для backward compat. **Both должны returned**.

### 1.3 Anthropic — truncation as teaching

> "If you choose to truncate responses, be sure to steer agents with helpful instructions. You can directly encourage agents to pursue more token-efficient strategies, like making many small and targeted searches instead of a single, broad search."

Truncation message — это **teaching moment**, не просто info.

Concrete example from Anthropic docs:
```
[Truncation message format]
"Showing 10 of 247 matching results. To see more, use pagination 
(offset=10) or narrow your query with filter parameters."
```

### 1.4 Production patterns (Blockscout MCP server)

Real-world MCP server для blockchain data использует:
- **Truncations** — limit hex strings to first N bytes
- **Simplifications** — flatten deeply nested structures
- **Context-aware pagination** — different page sizes per endpoint type
- **Phase-based content** — separate heavy parts (ABIs) от main response, fetch on-demand

### 1.5 Format toggle pattern (chrome-devtools-mcp)

```
"response_format": {
  "enum": ["summary", "detailed", "analytics"],
  "description": "summary=key fields only; detailed=all fields; analytics=with metrics"
}
```

Позволяет агенту запрашивать appropriate detail level. Smart default = `summary`.

### 1.6 Pagination patterns

3 supported по spec:

| Type | Used by | Detection signal |
|---|---|---|
| **Cursor-based** | Most modern APIs (Stripe, GitHub) | Response has `next_cursor`, `cursor`, `page_token` |
| **Offset-based** | Older REST APIs | Response has `offset`/`limit`, или request takes `offset` |
| **Page number** | Old paginated APIs | Request takes `page` and `per_page` |

Cursor — MCP canonical (opaque strings). Auto-detect strategy из spec response schemas.

---

## 2. Five mechanisms Pass 5 generates

### Mechanism 1: Output schema generation

Per MCP 2025-06-18 spec, every tool gets `outputSchema`:

```json
{
  "name": "fetch",
  "outputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Smart ID of fetched object" },
      "object": { "type": "string", "description": "Object type" },
      "data": { "type": "object", "description": "Object fields" },
      "metadata": {
        "type": "object",
        "properties": {
          "fetched_at": { "type": "string", "format": "date-time" },
          "source_endpoint": { "type": "string" }
        }
      }
    },
    "required": ["id", "object", "data"]
  }
}
```

**Source:** spec response schemas → JSON Schema. Deterministic extraction.

### Mechanism 2: Pagination strategy & defaults

For list_objects (and search where applicable), determine:
- Pagination type (cursor/offset/page)
- Default page size
- Maximum page size
- Cursor parameter name

Defaults (calibrated по Anthropic guidance + filesystem MCP gold standard):
```
default_limit = 25      # good for browsing
max_limit = 100         # hard cap to prevent bloat
default_offset = 0
```

Output goes into both:
- Tool's `inputSchema` (parameters: limit, offset/cursor)
- Tool's `outputSchema` (response includes nextCursor or hasMore)

### Mechanism 3: Field filtering defaults

For each list/fetch operation, decide which fields are **default-included** vs **opt-in via parameter**.

Three categories:

**Always include (default):**
- Identifiers (id, smart_id, foreign keys)
- Status/state fields
- Primary content (name, title, summary)
- Critical timestamps (created_at, updated_at)

**Opt-in (only if user explicitly requests via `properties` param):**
- Verbose nested objects
- Metadata blobs
- Internal tracking fields
- Audit logs / history fields
- Large binary/text blobs

**Always exclude:**
- Sensitive data (PII unless explicitly requested)
- Internal-only fields (server-side IDs, debug info)
- Deprecated fields

LLM ranks fields when ambiguous. Common heuristics for high-value fields:
- Field name signals: ends in `_id`, `_at`, contains "name"/"title"/"status"
- Spec description mentions importance
- Required field в schema → likely high-value

### Mechanism 4: Truncation thresholds & guidance

For each tool, set token threshold beyond which response truncates with guidance.

Default thresholds:
| Tool type | Truncation threshold | Default action |
|---|---|---|
| `search` | 10K tokens | Show first N results, suggest pagination |
| `list_objects` | 15K tokens | Show first page, mention nextCursor |
| `fetch` (single object) | 20K tokens | Show summary fields, mention `properties` for full |
| Action tools | 5K tokens | Truncate result blobs, preserve metadata |
| Workflow tools | 15K tokens | Show key results, mention sub-operations |

Truncation message template:
```
[Showing {N} of {Total} {item_type}. To see more, {action_suggestion}.]
```

Concrete examples:

For paginated list:
```
"[Showing 25 of 247 charges. Use offset=25 to see more, or add filter to narrow.]"
```

For single object с many fields:
```
"[Object has 47 fields, showing 12 most-relevant. To see all, call again with properties=['*'] or specify field names.]"
```

For oversized blob in search:
```
"[Result content truncated at 5000 characters. To see full content, use fetch with this object's smart ID: stripe:object:Charge:ch_xxx]"
```

### Mechanism 5: `response_format` parameter (optional, для tools с varied detail needs)

For complex objects with multiple useful detail levels, add parameter:

```json
{
  "response_format": {
    "type": "string",
    "enum": ["summary", "detailed", "raw"],
    "default": "summary",
    "description": "Detail level. 'summary'=core fields only (~500 tokens); 'detailed'=structured full data (~2000 tokens); 'raw'=complete unprocessed response. Default 'summary' for context efficiency. Use 'detailed' для full inspection, 'raw' для debugging."
  }
}
```

When to add this parameter:
- Tool returns complex objects with > 20 fields typically
- Different agent tasks need different detail levels
- Spec response schemas show variation in usage patterns

Не add по default — это ещё один parameter, increasing schema bloat. Add только when value > cost.

---

## 3. Per-tool-type response strategies

### 3.1 Universal Search

```yaml
output_schema:
  type: object
  properties:
    results: array of search results (id + key fields + relevance)
    total_count: integer
    next_cursor: optional string
    truncated: optional boolean
  required: [results]

defaults:
  result_limit: 10        # OpenAI standard recommendation
  max_limit: 50          # smaller than list_objects (search results denser)
  truncation_threshold: 10000

guidance_on_truncation: |
  "Showing top 10 results. {N} more matches exist. To see more, 
  paginate with cursor or refine query for precision."
```

### 3.2 Universal Fetch

```yaml
output_schema:
  type: object
  properties:
    id: string (smart ID)
    object_type: string (collection name)
    data: object (full object data)
    metadata: object (fetched_at, source)
  required: [id, object_type, data]

defaults:
  field_filtering: respect `properties` param if provided; else default high-value
  truncation_threshold: 20000

guidance_on_truncation: |
  "Object has {N} fields. Showing {M} default. To see specific fields, 
  call again with properties=['field1', 'field2']."
```

### 3.3 Universal list_objects

```yaml
output_schema:
  type: object
  properties:
    objects: array of objects (filtered fields)
    total_count: integer (if known)
    next_cursor: optional string
    has_more: boolean
  required: [objects, has_more]

defaults:
  default_limit: 25
  max_limit: 100
  truncation_threshold: 15000

pagination:
  strategy: cursor если spec supports, else offset
  
guidance_on_truncation: |
  "Showing {M} of {N} objects. {N - M} more available. 
  Use {next_cursor: '...'} or {offset: M} to continue."
```

### 3.4 Universal upsert / delete

Less concern about response bloat (writes return small confirmations).

```yaml
output_schema:
  type: object
  properties:
    success: boolean
    id: string (smart ID of created/updated/deleted)
    operation: string (created|updated|deleted)
    metadata: object
  required: [success, operation]

defaults:
  truncation_threshold: 5000  # writes shouldn't be huge
```

### 3.5 Action tools

```yaml
output_schema:
  # Inferred from spec response schema
  
defaults:
  truncation_threshold: 5000
  
guidance_on_truncation: |
  "Action completed. Output truncated at {N} tokens. 
  Use search/fetch to inspect resulting state."
```

### 3.6 Workflow tools

```yaml
output_schema:
  type: object
  properties:
    success: boolean
    results: object (consolidated outputs from sub-operations)
    sub_operations: array (status of each step)
    metadata: object
  required: [success, results]

defaults:
  truncation_threshold: 15000
```

---

## 4. Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: Pagination strategy detection (deterministic) │
│                                                          │
│  For each list-like tool:                               │
│  - Analyze spec response schemas                         │
│  - Detect cursor/offset/page-number pattern             │
│  - Identify cursor parameter names                      │
│                                                          │
│  Cost: $0, time: <1s                                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: Output schema extraction (deterministic)      │
│                                                          │
│  For each tool:                                         │
│  - Pull spec response schema                             │
│  - Convert to JSON Schema for outputSchema              │
│  - Wrap with metadata fields (id, fetched_at, etc.)     │
│  - For universal tools: aggregate response shapes        │
│                                                          │
│  Cost: $0, time: <1s                                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: Field importance ranking (LLM, parallel)      │
│                                                          │
│  For each tool with > 10 response fields:               │
│  - Single Haiku call                                     │
│  - Classifies fields: always-include / opt-in / exclude │
│  - Generates default field list                          │
│                                                          │
│  Concurrency: 10 parallel.                              │
│  Cost: ~$0.05-0.10, time: 10-15s.                        │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 4: Truncation guidance authoring                 │
│  (deterministic templates + minor LLM polish)           │
│                                                          │
│  For each tool:                                         │
│  - Apply tool-type-specific template                    │
│  - Inject pagination/filter parameter names             │
│  - Optional: LLM polish for natural phrasing            │
│                                                          │
│  Cost: ~$0.02 if LLM polish, $0 if template-only.       │
│  Time: 2-5s.                                             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 5: Validation                                    │
│                                                          │
│  - All tools have outputSchema                          │
│  - Pagination defaults set где applicable               │
│  - Truncation thresholds reasonable                     │
│  - Field filter lists non-empty                          │
│  - Truncation messages contain {placeholders}            │
│                                                          │
│  Cost: $0, time: <1s                                    │
└─────────────────────────────────────────────────────────┘
```

**Why per-tool field ranking parallel:** independent decisions, max throughput.

**Why Haiku not Sonnet:** field classification — simpler than description writing, Haiku adequate.

---

## 5. Input

```python
class Pass5Input(BaseModel):
    tools: list[ToolWithAnnotations]      # from Pass 4
    spec_endpoints: dict[str, Endpoint]   # source response schemas
    spec_pagination_hints: dict           # auto-detected from Stage A
    smart_id_schema: SmartIdSchema        # from Pass 1
```

---

## 6. Output

```python
class Pass5Output(BaseModel):
    final_tools: list[FinalTool]
    pagination_summary: PaginationSummary
    response_shaping_summary: ResponseShapingSummary
    flags: Pass5Flags

class FinalTool(BaseModel):
    name: str
    description: ToolDescription              # from Pass 2
    description_text: str                     # from Pass 2
    inputSchema: JsonSchema                   # from Pass 3 + may be extended (response_format param)
    outputSchema: JsonSchema                  # NEW from Pass 5
    annotations: ToolAnnotations              # from Pass 4
    response_config: ResponseConfig           # NEW from Pass 5

class ResponseConfig(BaseModel):
    pagination: PaginationConfig | None       # для list-type tools
    field_filtering: FieldFilteringConfig | None
    truncation: TruncationConfig
    has_response_format_param: bool

class PaginationConfig(BaseModel):
    strategy: Literal["cursor", "offset", "page_number"]
    cursor_param_name: str | None             # "cursor", "page_token", "next_token"
    cursor_response_field: str                # "next_cursor", "nextCursor", "next_page_token"
    default_limit: int
    max_limit: int

class FieldFilteringConfig(BaseModel):
    default_fields: list[str]                 # always-include
    optional_fields: list[str]                # opt-in via properties param
    excluded_fields: list[str]                # always-exclude (internal/sensitive)

class TruncationConfig(BaseModel):
    threshold_tokens: int
    guidance_template: str                    # message с {placeholders}
    truncation_strategy: Literal["paginate", "filter", "summarize"]

class PaginationSummary(BaseModel):
    cursor_based_tools: int
    offset_based_tools: int
    page_number_tools: int

class ResponseShapingSummary(BaseModel):
    total_fields_filtered: int                # fields hidden by default
    estimated_response_token_savings: int     # vs raw passthrough
    tools_with_response_format_param: int

class Pass5Flags(BaseModel):
    output_schema_inference_low_confidence: list[str]  # tools where spec didn't give clear schema
    pagination_strategy_ambiguous: list[str]           # spec didn't clearly say
    field_ranking_uncertain: list[str]                 # LLM wasn't confident
```

---

## 7. LLM Prompt — Phase 3 (field importance ranking)

### 7.1 System prompt (cached)

```
You rank response fields by importance for AI agent consumption.

GOAL: Reduce response token bloat. Identify which fields agents typically need
(always-include) vs occasionally (opt-in) vs never (exclude).

CRITERIA:

ALWAYS-INCLUDE (high signal):
- Identifiers (id, smart_id, foreign keys)
- Status / state fields
- Primary content (name, title, subject, summary)
- Critical timestamps (created_at, updated_at)
- Required spec fields
- Fields explicitly described as "primary" or "main" in spec

OPT-IN (situational value):
- Verbose nested objects
- Metadata blobs (settings, config)
- Audit logs / history
- Internal tracking
- Large content blobs (full body, raw HTML)
- Computed/derived fields

EXCLUDE (rarely useful, leak risks):
- Internal IDs (server-side only)
- Debug info
- Deprecated fields
- Sensitive PII unless explicitly required
- Empty/null typical fields

OUTPUT FORMAT:
{
  "default_fields": [...],
  "optional_fields": [...],
  "excluded_fields": [...],
  "rationale": "<one sentence why this split>"
}

CONSERVATIVE BIAS: when uncertain, prefer opt-in over default-include.
Better to require агент request a field than burn tokens on unused data.
```

### 7.2 User prompt (per tool)

```
Tool: {tool.name}
Tool type: {tool.type}
Tool purpose: {tool.description.purpose}

Spec response schema fields ({N} total):

{for each field:}
  Field: {field_name}
  Type: {field_type}
  Required: {is_required}
  Spec description: {description or "(none)"}
  Sample values from spec examples: {samples or "(none)"}

Rank fields.
```

---

## 8. Programmatic validation (Phase 5)

| Check | Action |
|---|---|
| Each tool has outputSchema | Generate fallback ("type: object, additionalProperties: true") |
| Pagination config consistent (cursor → has cursor_param_name) | Fix |
| Truncation threshold > 0 | Set default по tool type |
| Default fields non-empty | LLM retry; если still empty — include all spec required fields |
| Truncation guidance contains placeholders ({N}, {Total}, etc.) | Add if missing |
| Excluded fields don't include required spec fields | Move to optional_fields |
| Total estimated response size < threshold (post-filter) | Adjust threshold or add response_format param |

---

## 9. Edge cases

**E1. Spec response schema missing or vague.**
Some specs return `additionalProperties: true` без structure. **Решение:** generate `outputSchema` с `additionalProperties: true` and basic metadata wrapper. Mark `output_schema_inference_low_confidence`. Surface in Quality Report.

**E2. Pagination strategy not detectable from spec.**
**Решение:** default to `offset`-based с reasonable defaults. Log в flags. Pass 5 LLM может attempt inference из endpoint description text.

**E3. Tool returns binary data (images, PDFs).**
**Решение:** outputSchema describes binary как `{type: "string", contentEncoding: "base64", contentMediaType: "..."}`. Truncation: include first 200 chars + length info. Don't include full binary в context.

**E4. Universal tool subsumes endpoints с very different response shapes.**
E.g., `fetch` returns Charge, Customer, Subscription — все имеют разные schemas. **Решение:** outputSchema uses `oneOf` с per-collection schemas, или generic с `additionalProperties: true`. Decision rule в LLM prompt.

**E5. Spec specifies multiple response codes (200 vs 202 vs 4xx).**
**Решение:** outputSchema covers happy path (200). Errors handled separately via `isError: true` flag, not in outputSchema.

**E6. Response includes streaming/chunked content.**
Out of MVP scope. **Решение:** treat as single complete response. Streaming support — v1.x feature.

**E7. Field importance unclear (LLM не confident).**
**Решение:** default to opt-in (conservative). Mark in flags.

**E8. Response size threshold conflicts с user need (need full data).**
**Решение:** truncation message explicitly mentions how to override (e.g., `properties: ['*']` или `response_format: 'detailed'`).

**E9. Some fields содержат very long values (full HTML body, etc.).**
**Решение:** truncate per-field, not just total response. Per-field truncation hint в outputSchema description.

**E10. Spec uses GraphQL semantics (returns only requested fields).**
Pass 5 noticed and adjusts. **Decision:** field filtering still applied на server side, GraphQL query constructed dynamically.

---

## 10. Truncation guidance design — detailed

This is critical UX design — truncation message either teaches агент или confuses.

### Anti-patterns (что не делать)

```
❌ "Response truncated."
   (Agent doesn't know what to do)

❌ "Error: response too large."
   (False — это not error, just truncation)

❌ "Showing partial results due to size limits."
   (Vague — what limits? how to override?)
```

### Good patterns

```
✅ For paginated list:
"[Showing 25 of 247 charges. Use {next_cursor: 'abc123'} for next page, 
or add filter to narrow results.]"

✅ For single object с many fields:
"[Object has 47 fields, showing 12 most relevant. 
For full data: properties=['*']. For specific: properties=['field_name'].]"

✅ For oversized content blob:
"[Body content truncated at 5000 chars (full: 23K chars). 
For full content: response_format='detailed' or fetch directly with smart ID.]"
```

### Template variables

Required в каждом template:
- `{N}` — items shown
- `{Total}` — total available (if known)
- `{action}` — concrete next step (parameter values, new tool name)

Optional:
- `{item_type}` — "charges", "customers", etc.
- `{filter_hint}` — suggested filter parameter

### Generation strategy

Phase 4 outputs templates с placeholders filled at runtime by Tenant Worker (Stage E codegen). Pass 5 just generates the template string.

LLM polish optional — for many cases template-only достаточно. Polish triggered only если:
- Tool type unusual (not in standard taxonomy)
- Spec context provides specific guidance hints
- Quality flag from Phase 5 validation

---

## 11. Pagination strategy detection (deterministic algorithm)

```python
def detect_pagination_strategy(endpoint: Endpoint) -> PaginationStrategy:
    request_params = endpoint.parameters
    response_schema = endpoint.responses.get("200", {}).schema
    
    # Cursor-based detection
    cursor_request_signals = ["cursor", "page_token", "next_token", "after", "starting_after"]
    cursor_response_signals = ["next_cursor", "nextCursor", "next_page_token", "nextPageToken"]
    
    has_cursor_request = any(p.name in cursor_request_signals for p in request_params)
    has_cursor_response = any(f in response_schema.properties for f in cursor_response_signals)
    
    if has_cursor_request or has_cursor_response:
        return PaginationStrategy(
            type="cursor",
            cursor_param_name=find_cursor_param_name(request_params),
            cursor_response_field=find_cursor_response_field(response_schema),
        )
    
    # Offset-based detection
    if any(p.name in ["offset", "skip"] for p in request_params):
        return PaginationStrategy(
            type="offset",
            offset_param_name=find_offset_param_name(request_params),
        )
    
    # Page number detection
    if any(p.name in ["page", "page_number", "pageNumber"] for p in request_params):
        return PaginationStrategy(
            type="page_number",
            page_param_name=find_page_param_name(request_params),
            per_page_param_name=find_per_page_param_name(request_params),
        )
    
    # No pagination detected
    return PaginationStrategy(
        type="none",
        warning="No pagination detected — full results returned. May truncate."
    )
```

---

## 12. Cost & latency

For typical server (10 tools):

| Phase | Cost | Latency |
|---|---|---|
| Phase 1 (pagination detection) | $0 | <1s |
| Phase 2 (output schema extraction) | $0 | <1s |
| Phase 3 (field ranking, ~5 tools need LLM) | $0.05-0.10 | 10-15s |
| Phase 4 (truncation guidance, mostly template) | $0.02 | 2-5s |
| Phase 5 (validation) | $0 | <1s |
| **Total** | **~$0.05-0.15** | **~15-25s** |

Один из дешёвых passes (после Pass 4).

---

## 13. Golden eval set

Минимум 5 cases.

### G1: Stripe `list_objects` (cursor pagination)

Expected:
- Detected: cursor-based (Stripe uses `starting_after`)
- default_limit: 25
- max_limit: 100
- outputSchema includes `data: array, has_more: boolean`
- Truncation guidance mentions `starting_after` usage

### G2: GitHub `search` (page number pagination)

Expected:
- Detected: page_number-based
- Limit: 30 (GitHub default)
- Outputschema includes `total_count, items: array, incomplete_results`

### G3: Notion `fetch` (single object, large response)

Expected:
- outputSchema for Page object
- Field filtering: 8-12 default, ~30 opt-in
- response_format param added (Notion pages varied)
- Truncation > 20K with detailed guidance

### G4: Slack `messages_list` (no clear pagination)

Spec lacks clear pagination params.
Expected:
- Detected: warning "no pagination detected"
- Conservative threshold: 10K
- Guidance suggests filtering by channel/timestamp

### G5: HRIS `list_employees` (token-bloat case from research)

Spec has 50 fields per record.
Expected:
- 5-8 default fields, 30+ opt-in fields
- Many sensitive fields excluded by default (SSN, comp history)
- Significant estimated_token_savings (>80%)

CI threshold: 4 of 5 must pass.

---

## 14. Что Pass 5 НЕ делает

- НЕ генерирует actual code (Stage E)
- НЕ runs validation против real upstream API (Stage F)
- НЕ обрабатывает error responses (separate concern, F1 validation handles)
- НЕ выводит resources (MCP resources separate primitive)
- НЕ занимается streaming responses (v1.x feature)

Pass 5 produces **complete tool definition + response shaping config** ready for codegen.

---

## 15. Открытые вопросы

❓ **Default truncation thresholds — calibration.** Currently educated guesses (10K/15K/20K). Real production data покажет what works. **Experiment:** на 50 generations track какие thresholds correlate с good agent eval scores.

❓ **`response_format` parameter — when to add.** Currently when > 20 fields в response. Could be tuned. **Experiment:** A/B test — добавлять для всех list_objects vs только для complex objects. Measure impact на agent eval.

❓ **Field importance LLM accuracy.** Haiku may misclassify edge cases (rare-but-critical fields). **Mitigation:** Stage F3 agent eval catches if agent fails because critical field hidden. Pass 5 retry triggered.

❓ **Pagination для cursor-based — opaque cursor handling.** We pass through upstream cursors as-is. But what if upstream cursor is structured (e.g., contains internal IDs)? Could leak info. **Decision:** treat as opaque, but Stage E codegen may sanitize если cursor format suspicious.

❓ **Output schema strictness.** MCP spec позволяет soft enforcement ("SHOULD validate"). We always provide schema. Should we enforce server-side (reject responses не conforming)? **Decision:** для MVP, only validate (warn but don't reject). Strict enforcement — v1.1 feature.

❓ **structuredContent vs content backward compat.** New 2025-06-18 spec says return both. Older clients only read `content`. We return both → some redundancy. **Decision:** accept the redundancy for compatibility.

❓ **Response shaping for action tools.** Less standardized than reads. Some actions return tiny responses (just success: true), others return full updated objects. **Decision:** detect from spec response schemas; conservative truncation thresholds.

---

## 16. Финальные decisions

1. ✅ **outputSchema** для всех tools (MCP 2025-06-18 standard)
2. ✅ **structuredContent + content** dual return для compatibility
3. ✅ **Cursor-based pagination preferred**, offset/page-number supported
4. ✅ **Field filtering defaults** generated by LLM with conservative bias (prefer opt-in)
5. ✅ **Truncation guidance templates** — required all teach agents next step
6. ✅ **`response_format` parameter** только when complex (> 20 fields, varied use cases)
7. ✅ **Per-tool-type strategies** (search/fetch/list/upsert/action/workflow have different defaults)
8. ✅ **Field ranking via Haiku** (cheap model достаточно)
9. ✅ **Mostly deterministic** (~70%), LLM only для field ranking + optional polish
10. ✅ **Pagination strategy auto-detected** from spec deterministically

---

## Appendix A — Truncation message templates per tool type

```python
TRUNCATION_TEMPLATES = {
    "universal_search": (
        "[Showing top {N} results. {Total - N} more matches exist. "
        "To see more: paginate with cursor or refine query for precision.]"
    ),
    "universal_fetch": (
        "[Object has {Total} fields, showing {N} most-relevant. "
        "For specific fields: properties=['field_name']. For all: properties=['*'].]"
    ),
    "universal_list_objects": (
        "[Showing {N} of {Total} {item_type}. "
        "Use {pagination_param}={next_value} for next page, "
        "or add filter to narrow results.]"
    ),
    "universal_upsert": (
        "[Operation completed. Output truncated. "
        "Fetch updated object with smart ID for full state.]"
    ),
    "universal_delete": (
        "[Deletion completed. Output: success={success}, deleted_count={N}.]"
    ),
    "action": (
        "[Action completed. Output truncated at {N} tokens. "
        "Use search/fetch to inspect resulting state.]"
    ),
    "workflow": (
        "[Workflow completed. Sub-operation results: {summary}. "
        "Output truncated — use specific tools to drill into details.]"
    ),
    "specialized_read": (
        "[Showing {N} of {Total} items. "
        "Use offset/cursor for more, or apply filter for narrower scope.]"
    ),
}
```

---

## Appendix B — Default field ranking heuristics

Pre-LLM scoring (deterministic, used as Haiku context):

```python
def score_field_importance(field: SpecField) -> float:
    score = 0.0
    
    # Required fields almost always default-include
    if field.is_required:
        score += 0.5
    
    # Naming signals
    high_value_patterns = [
        r"^id$|_id$",        # identifiers
        r"^name$|_name$",    # names
        r"^title$",
        r"^status$|_status$",
        r"^type$",
        r"created_at|updated_at",
        r"^summary$",
    ]
    if any(re.match(p, field.name) for p in high_value_patterns):
        score += 0.3
    
    # Low-value patterns
    low_value_patterns = [
        r"_internal$|^_",     # private/internal
        r"raw_|_raw$",        # raw blobs
        r"debug",
        r"deprecated",
        r"_metadata$",        # nested metadata blobs
    ]
    if any(re.search(p, field.name) for p in low_value_patterns):
        score -= 0.3
    
    # Description signals
    if field.description:
        if any(w in field.description.lower() for w in ["main", "primary", "key"]):
            score += 0.2
        if any(w in field.description.lower() for w in ["internal", "deprecated", "debug"]):
            score -= 0.3
    
    # Length / size signals
    if field.type == "object" and field.is_likely_large:
        score -= 0.2
    
    return score
```

LLM gets prelim scores и refines, particularly для domain-specific cases.

---

## Appendix C — Sources

1. **MCP Spec 2025-06-18** — Output schemas, structured content
   https://modelcontextprotocol.io/specification/2025-06-18/server/tools

2. **Cisco** — "What's New in MCP: Elicitation, Structured Content, and OAuth Enhancements" (Jun 2025)
   https://blogs.cisco.com/developer/whats-new-in-mcp-elicitation-structured-content-and-oauth-enhancements

3. **Anthropic** — "Writing effective tools for agents" (Sept 2025)
   Truncation guidance principles.

4. **StackOne** — "MCP Token Optimization: 4 Approaches Compared" (Mar 2026)
   https://www.stackone.com/blog/mcp-token-optimization/
   Production data на 200+ connectors.

5. **Blockscout MCP** — "MCP Explained Part 2: Optimizations" (Oct 2025)
   https://www.blog.blockscout.com/mcp-explained-part-2-optimizations/
   Real-world response shaping patterns.

6. **Microsoft MCP for Beginners** — Pagination patterns
   https://github.com/microsoft/mcp-for-beginners/blob/main/04-PracticalImplementation/pagination/README.md

7. **Apollo GraphQL** — Token efficiency через field selection
   https://www.apollographql.com/blog/building-efficient-ai-agents-with-graphql-and-apollo-mcp-server

8. **chrome-devtools-mcp Issue #340** — `response_format` parameter pattern
   https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/340
