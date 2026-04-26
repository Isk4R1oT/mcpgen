# Pass 4: Annotations Inference — Detailed Design

> **Документ:** detailed design пятого LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** `pass-0-design.md`, `pass-1-design.md`, `pass-2-design.md`, `pass-3-design.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Pass 4 выводит 4 boolean annotations + title для каждого tool: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Эти hints используются MCP-клиентами для confirmation prompts, retry logic, и risk indicators в UI.

**80% работы — deterministic** rules based на tool type (Pass 1) и HTTP semantics. LLM нужен только для edge cases (~15% tools, в основном action и workflow types).

Самый короткий из всех passes. Cost ~$0.02-0.05 per server, latency ~5-15s.

---

## 1. Research foundation

### 1.1 MCP Spec defaults — критично

Из [MCP blog "Tool Annotations as Risk Vocabulary"](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/):

```typescript
interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;     // default: false
  destructiveHint?: boolean;  // default: true   ← critical
  idempotentHint?: boolean;   // default: false
  openWorldHint?: boolean;    // default: true
}
```

**Implication для нас:** если annotations не указать — клиент считает каждый tool potentially destructive (`destructive=true`) и interacting with external world (`openWorld=true`). Это вызовет confirmation prompts на любой `search()` в Cursor.

**Решение:** Pass 4 ВСЕГДА выставляет все 4 annotations явно. Никаких defaults.

### 1.2 Semantic definitions (canonical)

| Annotation | True means | False means |
|---|---|---|
| `readOnlyHint` | Tool only reads, does not modify environment | Tool may modify state |
| `destructiveHint` | Tool may perform irreversible/destructive actions | Tool's modifications are additive only |
| `idempotentHint` | Repeated identical calls have same effect (safe to retry) | Repeated calls may have additional effects |
| `openWorldHint` | Tool interacts with external systems (APIs, web) | Tool operates on closed/local domain |

### 1.3 Industry consensus

**MCP filesystem server (gold standard, GitHub issue #3402):**
> "Reads are inherently idempotent. Adding `idempotentHint: true` would let clients safely implement automatic retries on failure."

**MCP blog recommendation:**
> "If you're writing a server, set `readOnlyHint: true` on read-only tools, `destructiveHint: false` on additive operations, and `openWorldHint: false` on closed-domain tools."

**OpenAI Apps SDK:**
> "Read-only hints — set the readOnlyHint annotation to specify tools which cannot mutate state. Destructive hints — set the destructiveHint annotation to specify which tools do delete or overwrite user data. Open-world hints — set the openWorldHint annotation to specify which tools publish content or reach outside the user's account."

### 1.4 Что hints НЕ являются (важная границa)

Из MCP blog:
> "Treat annotations from untrusted servers as informational and lean on them for UX, but keep your actual safety guarantees in deterministic controls."

Annotations — это **UX signals**, не безопасностные гарантии. Client может игнорировать. Сам сервер реальную безопасность обеспечивает через actual implementation.

---

## 2. Universal rule для нашего продукта: openWorldHint = true ВСЕГДА

Особенность MCPGen: мы — generator wrapper'ов над external REST APIs. **Все наши tools by definition взаимодействуют с external systems.**

```
openWorldHint = true для всех 100% tools — без исключений
```

Это hardcoded. Не требует LLM, не требует rules check.

Единственное теоретическое исключение — generated server, который полностью local (не делает upstream calls). Но такого сценария в MCPGen scope нет.

---

## 3. Deterministic rules для остальных 3 annotations

Используя tool type from Pass 1, можем выставить 3 annotations детерминированно для **большинства tools**.

### 3.1 Universal Tools (Six-Tool Pattern)

| Tool | readOnly | destructive | idempotent | Rationale |
|---|---|---|---|---|
| `search` | **true** | false | true | Pure read, repeatable |
| `fetch` | **true** | false | true | Pure read, repeatable |
| `list_collections` | **true** | false | true | Pure read, repeatable |
| `list_objects` | **true** | false | true | Pure read, repeatable |
| `upsert` | false | **false** | conditional* | Additive (creates) or update; not destructive but idempotency depends |
| `delete` | false | **true** | true | Destructive but re-delete is no-op (idempotent) |

*`upsert.idempotentHint`* — interesting case:
- Strict reading: false (because create_new ≠ create_again_with_same_data → may produce duplicates if no idempotency key)
- Real-world (Weaviate MCP, etc.): false to be conservative
- **Decision:** `idempotentHint: false` для upsert (conservative — лучше agent retry с заботой)

### 3.2 Action Tools (POST с side effects)

Action tools require LLM judgment because semantics vary. But starting point — strong heuristics from naming:

| Action verb pattern | Likely values | Confidence |
|---|---|---|
| `*_capture`, `*_charge`, `*_pay` | readOnly=false, destructive=false, idempotent=false | High |
| `*_refund`, `*_reverse` | readOnly=false, destructive=true, idempotent=false | High |
| `*_cancel`, `*_void`, `*_revoke` | readOnly=false, destructive=true, idempotent=true | High |
| `*_send`, `*_dispatch`, `*_notify` | readOnly=false, destructive=false, idempotent=false | Medium (depends на recipient state) |
| `*_lock`, `*_freeze`, `*_disable` | readOnly=false, destructive=false, idempotent=true | Medium |
| `*_unlock`, `*_enable`, `*_activate` | readOnly=false, destructive=false, idempotent=true | High |
| `*_publish`, `*_finalize`, `*_submit` | readOnly=false, destructive=false (typically irreversible state change) | Medium |
| `*_archive`, `*_soft_delete` | readOnly=false, destructive=true (semantically), idempotent=true | High |

**Decision for action tools:**
- Если action verb match'ит pattern с **High confidence** → use deterministic values
- Иначе → LLM judgment с context из Pass 2 description

### 3.3 Workflow Tools

Workflow tool behavior зависит от sub-operations. **Rule: take the WORST case across all sub-operations.**

```
For workflow_tool with sub_endpoints E1, E2, ..., En:
  
  readOnly = true if ALL sub-endpoints are readOnly (any write breaks it)
  destructive = true if ANY sub-endpoint is destructive
  idempotent = true if ALL sub-endpoints are idempotent
```

Это **conservative aggregation**. Workflow с одним destructive step становится destructive целиком.

**Example:**
- `schedule_event` (workflow): list_users (read) → find_slots (read) → create_event (write, additive)
  - readOnly = false (write present)
  - destructive = false (no destructive sub)
  - idempotent = depends on `create_event` semantics — likely false без idempotency_key

LLM нужен для finalize, особенно для idempotency.

### 3.4 Specialized Reads

Все они read-only by definition.

```
readOnly = true
destructive = false
idempotent = true
```

Deterministic. Никакого LLM.

---

## 4. Title generation

Helper annotation `title` — human-readable name для UI. Не critical, но nice to have.

**Source:** convert tool_name from snake_case to Title Case + small humanization.

| tool_name | Generated title |
|---|---|
| `search` | "Search" |
| `fetch` | "Fetch" |
| `list_objects` | "List Objects" |
| `charges_capture` | "Capture Charge" |
| `charges_refund` | "Refund Charge" |
| `schedule_event` | "Schedule Event" |
| `get_recent_user_activity` | "Get Recent User Activity" |

**Implementation:** deterministic regex-based + verb reordering для action tools (`{noun}_{verb}` → "{Verb} {Noun}").

LLM не нужен. Если результат awkward — Phase 4 LLM может улучшить, но это nice-to-have.

---

## 5. Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: Deterministic rule application                │
│                                                          │
│  For each tool:                                         │
│  - Set openWorldHint = true (always)                    │
│  - Apply tool-type-based rules (§ 3)                    │
│  - Apply action verb patterns (high-confidence матч)    │
│  - Generate title                                        │
│  - Mark "needs_llm_review" если low confidence          │
│                                                          │
│  Cost: $0, time: <1s                                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: LLM judgment for edge cases (selective)       │
│                                                          │
│  Only for tools marked "needs_llm_review":              │
│  - Action tools without high-confidence verb match      │
│  - Workflows requiring idempotency analysis             │
│  - Specialized reads with ambiguous semantics           │
│                                                          │
│  Single Haiku call (cheap model достаточно — boolean    │
│  classification, не creative writing).                  │
│                                                          │
│  Concurrency: 5 parallel calls.                         │
│  Typical: 0-3 tools per server need LLM review.        │
│  Cost: ~$0.01-0.03, time: 3-10s.                        │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: Consistency validation                        │
│                                                          │
│  - readOnly=true ⊕ destructive=false consistency        │
│  - readOnly=true → idempotent=true (reads idempotent)   │
│  - destructive=true → readOnly=false                    │
│  - All 5 fields present (no missing)                    │
│  - openWorldHint=true для всех                          │
│  - Title formatted correctly                            │
│                                                          │
│  Cost: $0, time: <1s                                    │
└─────────────────────────────────────────────────────────┘
```

**Why Haiku, not Sonnet/Opus в Phase 2:** annotation inference — это classification task с 4 boolean outputs. Haiku adequate, dramatic cost reduction.

---

## 6. Input

```python
class Pass4Input(BaseModel):
    tools: list[ToolWithFullSchema]      # from Pass 3 — descriptions + parameters
    spec_endpoints: dict[str, Endpoint]  # for HTTP method context
    smart_id_schema: SmartIdSchema       # from Pass 1
```

Pass 4 — pure inference task, no need for spec_info or auth context. Just tool semantics from previous passes.

---

## 7. Output

```python
class Pass4Output(BaseModel):
    tools_with_annotations: list[ToolWithAnnotations]
    annotations_summary: AnnotationsSummary
    flags: Pass4Flags

class ToolWithAnnotations(BaseModel):
    name: str
    description: ToolDescription           # from Pass 2
    description_text: str                  # from Pass 2
    inputSchema: JsonSchema                # from Pass 3
    annotations: ToolAnnotations           # NEW — Pass 4 output
    
class ToolAnnotations(BaseModel):
    title: str
    readOnlyHint: bool
    destructiveHint: bool
    idempotentHint: bool
    openWorldHint: bool = True             # always true для нас
    
class AnnotationsSummary(BaseModel):
    read_only_tools: int
    destructive_tools: int
    idempotent_tools: int
    tools_requiring_confirmation: int      # destructive=true count
    tools_marked_for_llm_review: int       # statistic
    
class Pass4Flags(BaseModel):
    llm_review_triggered: list[str]        # tool names that needed LLM
    consistency_warnings: list[str]        # if rule violations caught
```

---

## 8. LLM Prompt (Phase 2 — narrow scope)

### 8.1 System prompt (cached)

```
You determine MCP tool annotations for tools where deterministic rules
were not confident.

ANNOTATIONS (with MCP defaults):
- readOnlyHint (default false): true if tool only reads data
- destructiveHint (default true): true if tool may perform irreversible actions
- idempotentHint (default false): true if repeated identical calls have same effect
- openWorldHint (default true): true if tool interacts with external systems

For this generator, openWorldHint is ALWAYS true (we wrap external APIs).
You only decide readOnlyHint, destructiveHint, and idempotentHint.

DECISION RULES:

readOnlyHint:
- True if tool only reads/retrieves data
- False if tool creates, updates, or deletes anything
- For workflow tools: True only if ALL sub-operations are reads

destructiveHint:
- True if action is irreversible OR semantically destructive
  (delete, refund, cancel, void, archive, revoke)
- False if action is additive (create, attach, schedule new)
- False for updates that don't lose data (set field, attach metadata)
- For workflows: True if ANY sub-operation is destructive

idempotentHint:
- True if calling N times has same end-state as calling once
- True for: deletes (already-gone is fine), idempotent updates (set X=Y),
  read operations
- False for: creates without idempotency key, increments,
  appends, sends notifications
- For workflows: True only if ALL sub-operations are idempotent

WHEN UNCERTAIN: pick the more conservative value.
- readOnly: false (assume modification)
- destructive: true (assume destructive)
- idempotent: false (assume not idempotent)

OUTPUT FORMAT: {
  "readOnlyHint": <bool>,
  "destructiveHint": <bool>,
  "idempotentHint": <bool>,
  "rationale": "<one sentence explanation>"
}
```

### 8.2 User prompt (per tool)

```
Tool: {tool.name}
Type: {tool.type}                     # action | workflow | specialized
HTTP method (if direct mapping): {method}

Tool description (from Pass 2):
  Purpose: {description.purpose}
  Limitations: {description.limitations}

{if workflow:}
Sub-operations:
  {for each sub:}
  - {sub.endpoint_id}: {sub.purpose}

Determine annotations.
```

---

## 9. Programmatic validation (Phase 3)

| Check | Action |
|---|---|
| All 5 annotation fields present | Fill missing with conservative default |
| `readOnly=true` AND `destructive=true` | Logically impossible — fix to `destructive=false` |
| `readOnly=true` AND `idempotent=false` | Suspicious (reads inherently idempotent) — fix to `idempotent=true` |
| `destructive=true` AND `readOnly=true` | Should never happen — investigate |
| `openWorldHint != true` | Force to true (architectural invariant) |
| Title not empty, ≤ 50 chars | Re-generate from name |
| Title not contain "tool", "function", "API" suffixes | Strip ("Search Tool" → "Search") |

---

## 10. Edge cases

**E1. Tool which both reads и writes (e.g., `find_or_create_user`).**
This violates Six-Tool Pattern (should be split or named differently). If somehow generated, treat as write tool: `readOnly=false, destructive=false, idempotent=true (find always returns same; create handles existing case)`.

**E2. Tool whose destructive nature depends on parameters.**
E.g., `delete(type, ...)` где type='collection' destructive более серьёзно than type='object'. **Decision:** annotate based on most-destructive case (`destructive=true`). UX correctness wins over per-call optimism.

**E3. Updates which can be destructive (overwrite vs merge).**
E.g., `update_user(id, data)` где data полностью заменяет existing data → может потерять fields. **Decision:** if API uses PUT semantics (replace) → mark `destructive=true`; if PATCH (merge) → `destructive=false`. Pass 4 inspects HTTP method.

**E4. Notifications/messaging actions.**
E.g., `send_email`. Не destructive в classical sense, но также не "additive" — recipient получает effect. **Decision:** `destructive=false, idempotent=false`. Description в Pass 2 already mentions "sends notifications" — agent knows side effect.

**E5. Auth operations (token refresh, etc.).**
Generally not exposed as tools (filtered в Pass 0), но edge case. If exposed: `readOnly=false, destructive=false, idempotent=false (each refresh creates new token)`.

**E6. Async operations (return job_id).**
E.g., `bulk_export(...)` returns task_id. Tool itself isn't destructive — initiating. **Decision:** annotate based on what the async operation does (mentioned в Pass 2 limitations). If operation eventually destructive — `destructive=true`.

**E7. Tools generating effects on external sub-services (webhook trigger, etc.).**
Mark `destructive=false, idempotent=false (each trigger fires new event)`.

**E8. Tool annotated по spec authoring's own annotations.**
Some specs (rare) include OpenAPI extensions like `x-mcp-annotations`. **Decision:** prefer spec author's annotations if present; otherwise use our inference. Mark в flags as "spec-provided".

---

## 11. Cost & latency

For typical server (10 tools):

| Phase | Cost | Latency |
|---|---|---|
| Phase 1 (deterministic) | $0 | <1s |
| Phase 2 (LLM, only for ~1-3 tools) | $0.01-0.03 | 3-10s |
| Phase 3 (validation) | $0 | <1s |
| **Total** | **~$0.01-0.05** | **~5-15s** |

Самый дешёвый и быстрый pass.

---

## 12. Golden eval set

Минимум 5 cases.

### G1: Stripe `search` (universal read)
Expected: `readOnly=true, destructive=false, idempotent=true, openWorld=true`

### G2: Stripe `delete` (universal destructive)
Expected: `readOnly=false, destructive=true, idempotent=true, openWorld=true`

### G3: Stripe `charges_refund` (action, irreversible)
Expected: `readOnly=false, destructive=true, idempotent=false, openWorld=true`

### G4: GitHub `repos_dispatch_workflow` (action, ambiguous)
Expected (LLM-decided): `readOnly=false, destructive=false, idempotent=false, openWorld=true`
Rationale: triggers workflow run; not destructive, but each call creates new run.

### G5: Calendar `schedule_event` (workflow)
Expected: `readOnly=false, destructive=false, idempotent=false, openWorld=true`
Rationale: contains write step (create_event); not destructive; not idempotent without idempotency_key.

CI threshold: 5/5 must pass (small set, all critical).

---

## 13. Что Pass 4 НЕ делает

- НЕ обрабатывает response shapes (Pass 5)
- НЕ генерирует additional metadata (taskSupport, x-mcp-header, etc. — out of MVP scope)
- НЕ влияет на actual tool execution (annotations are UX hints only)
- НЕ генерирует код (Stage E)

Pass 4 produces **the 5 annotation fields** для финального tool definition.

---

## 14. Открытые вопросы

❓ **Conservative vs aggressive defaults для ambiguous cases.** Currently conservative (when in doubt, mark destructive=true). Risk: too many confirmation prompts in Cursor/Claude Desktop, user fatigue. **Experiment:** track в production какие tools пользователь actually confirms vs auto-approves; calibrate conservatism.

❓ **`idempotentHint` для read tools.** Strictly speaking, reads are idempotent. But edge case: search results may differ between calls (data freshness). Is that "idempotent" в MCP semantic? **Decision:** treat as idempotent (the call itself doesn't change state — that's what idempotency means). Aligns с filesystem server gold standard.

❓ **Title generation quality.** Deterministic snake_case → Title Case fine для simple names. Awkward для complex (`get_recent_user_activity_summary` → "Get Recent User Activity Summary"). **Mitigation:** Phase 2 LLM может polish, но only if user requests Pro feature.

❓ **`destructiveHint` для updates.** PATCH (merge) vs PUT (replace) different semantics. Spec doesn't always explicit. **Mitigation:** check HTTP method; if ambiguous — conservative (`destructive=true для replace`). Better safe than sorry.

❓ **What if user disagrees с our inference?** UI should allow override per tool. Add to dashboard (Pro feature post-MVP).

❓ **Annotations on tool responses (not just definitions)?** MCP working group discussing per [blog post](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/). Currently MCP spec — only on definitions. **Decision:** track upcoming spec changes, add support когда landed.

---

## 15. Финальные decisions

1. ✅ **`openWorldHint = true` всегда** — architectural invariant
2. ✅ **80% deterministic** через tool type rules + verb pattern matching
3. ✅ **LLM (Haiku) only для edge cases** — typically 0-3 tools per server
4. ✅ **Conservative defaults** when uncertain (UX safety > optimization)
5. ✅ **Title generation deterministic** в MVP (LLM polish — Pro feature)
6. ✅ **Workflow aggregation rule:** worst-case across sub-operations
7. ✅ **All 5 annotations always set explicitly** (MCP spec defaults dangerous)
8. ✅ **Consistency rules enforced** (readOnly=true → idempotent=true, etc.)
9. ✅ **PUT vs PATCH detection** для updates (PUT=destructive, PATCH=additive)
10. ✅ **No dependency on Pass 5** (parallelizable с Pass 5 если нужно)

---

## Appendix A — Decision tree quick reference

For implementation:

```python
def infer_annotations(tool: ToolWithFullSchema) -> ToolAnnotations:
    # Universal invariant
    annotations = {"openWorldHint": True}
    
    # Title generation (deterministic)
    annotations["title"] = generate_title(tool.name)
    
    # Tool-type based rules
    if tool.type == "universal_search" or tool.type == "universal_fetch":
        annotations["readOnlyHint"] = True
        annotations["destructiveHint"] = False
        annotations["idempotentHint"] = True
        return annotations
    
    if tool.type in ("universal_list_collections", "universal_list_objects"):
        annotations["readOnlyHint"] = True
        annotations["destructiveHint"] = False
        annotations["idempotentHint"] = True
        return annotations
    
    if tool.type == "universal_upsert":
        annotations["readOnlyHint"] = False
        annotations["destructiveHint"] = False
        annotations["idempotentHint"] = False  # creates may produce duplicates
        return annotations
    
    if tool.type == "universal_delete":
        annotations["readOnlyHint"] = False
        annotations["destructiveHint"] = True
        annotations["idempotentHint"] = True   # re-delete is no-op
        return annotations
    
    if tool.type == "specialized_read":
        annotations["readOnlyHint"] = True
        annotations["destructiveHint"] = False
        annotations["idempotentHint"] = True
        return annotations
    
    if tool.type == "action":
        # Try high-confidence verb patterns
        verb_match = match_action_verb_pattern(tool.name)
        if verb_match.confidence == "high":
            annotations.update(verb_match.values)
            return annotations
        else:
            # Mark for LLM review
            annotations["_needs_llm_review"] = True
            return annotations
    
    if tool.type == "workflow":
        # Aggregate from sub-endpoints
        sub_annotations = [infer_for_endpoint(sub) for sub in tool.sub_endpoints]
        annotations["readOnlyHint"] = all(a["readOnlyHint"] for a in sub_annotations)
        annotations["destructiveHint"] = any(a["destructiveHint"] for a in sub_annotations)
        annotations["idempotentHint"] = all(a["idempotentHint"] for a in sub_annotations)
        # If any uncertainty in sub-endpoints, mark for LLM review
        if any(a.get("_needs_llm_review") for a in sub_annotations):
            annotations["_needs_llm_review"] = True
        return annotations
    
    # Fallback (shouldn't reach here)
    annotations["_needs_llm_review"] = True
    return annotations
```

---

## Appendix B — Action verb patterns (high-confidence)

```python
ACTION_VERB_PATTERNS = {
    # Destructive verbs
    r".*_(refund|reverse|undo)$": {
        "readOnlyHint": False, "destructiveHint": True, "idempotentHint": False,
        "confidence": "high"
    },
    r".*_(cancel|void|revoke)$": {
        "readOnlyHint": False, "destructiveHint": True, "idempotentHint": True,
        "confidence": "high"
    },
    r".*_(archive|soft_delete)$": {
        "readOnlyHint": False, "destructiveHint": True, "idempotentHint": True,
        "confidence": "high"
    },
    
    # Additive verbs
    r".*_(capture|charge|pay)$": {
        "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False,
        "confidence": "high"
    },
    r".*_(unlock|enable|activate)$": {
        "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True,
        "confidence": "high"
    },
    
    # Medium confidence (require LLM review)
    r".*_(send|dispatch|notify)$": {
        "confidence": "medium"
    },
    r".*_(lock|freeze|disable)$": {
        "confidence": "medium"
    },
    r".*_(publish|finalize|submit)$": {
        "confidence": "medium"
    },
}
```

---

## Appendix C — Sources

1. **MCP Blog** — "Tool Annotations as Risk Vocabulary: What Hints Can and Can't Do" (Mar 2026)
   https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
   Definitive source for defaults и semantics.

2. **MCP Spec** — Tool Annotations interface
   https://modelcontextprotocol.io/specification/2025-06-18/server/tools

3. **MCP Filesystem Server** (gold standard, GitHub issue #3402)
   https://github.com/modelcontextprotocol/servers/issues/3402
   "Reads are inherently idempotent" insight.

4. **OpenAI Apps SDK** — Tool annotation recommendations
   https://developers.openai.com/apps-sdk/plan/tools

5. **FastMCP docs** — Annotations in practice
   https://gofastmcp.com/servers/tools
