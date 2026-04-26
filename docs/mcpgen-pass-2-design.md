# Pass 2: Description Authoring — Detailed Design

> **Документ:** detailed design третьего LLM-pass'а в Generation Engine v2.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** `pass-0-design.md`, `pass-1-design.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Pass 2 пишет полное structured description для каждого tool из Pass 1. **Цель — не короткие подписи, а обучающие descriptions**, которые превращают tool-list в interface for reasoning.

Output — 5 of 6 components from arXiv rubric (Purpose, Guidelines, Limitations, Parameter overview, Length-as-meta). **Examples skipped in v0** (требуют execution traces — будут в v1.1).

Different tool types get different description styles: universal tools — rich (~200-400 tokens), actions — focused (~100-200), workflows — orchestration-aware, specialized reads — brief.

---

## 1. Research foundation

### 1.1 Anthropic ("Writing effective tools for agents", Sept 2025)

> "Think of how you would describe your tool to a new hire on your team. Consider the context that you might implicitly bring — specialized query formats, definitions of niche terminology, relationships between underlying resources — and make it explicit."

> "Avoid ambiguity by clearly describing (and enforcing with strict data models) expected inputs and outputs. In particular, input parameters should be unambiguously named: instead of a parameter named `user`, try a parameter named `user_id`."

> "Even small refinements to tool descriptions can yield dramatic improvements. Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions."

### 1.2 arXiv 2602.14878 — 6-component rubric

Empirical study of 856 MCP tools across 103 servers identified 6 components:

| # | Component | Smell when missing | Frequency in real MCP servers |
|---|---|---|---|
| 1 | **Purpose** | Unclear Purpose | 56% smelly |
| 2 | **Guidelines** (When + How) | Missing Usage Guidelines | 89.3% smelly |
| 3 | **Limitations** | Unstated Limitations | 89.8% smelly |
| 4 | **Parameter Explanation** | Opaque Parameters | 84.3% smelly |
| 5 | **Length & Completeness** | Underspecified | 79.1% smelly |
| 6 | **Examples** | Exemplar Issues | 77.9% smelly |

Key empirical finding:
> "Augmented tool descriptions yield a statistically significant increase of 5.85 percentage points in task success rate, while causing regressions in 16.67% of cases. They also improve evaluator-level performance, increasing the Average Evaluator score by 15.12%, reflecting higher-quality intermediate execution step completion. These improvements come with a trade-off: the average number of execution steps increases by 67.46% (median)."

Critical implication for our design:
> "Removing the Examples component does not statistically degrade performance."

This is what allows us to skip Examples in v0 без quality compromise.

### 1.3 MCP Bundles ("Teaching AI Agents Through Descriptions", Oct 2025)

Concrete template for parameter-level descriptions:
1. What it is (1 sentence)
2. Possible values / format / range
3. When to use it / what it affects
4. Example (concrete, copy-pastable)
5. Default / omission behavior

For tool-level:
1. What it does (action + object)
2. When to use it (use cases)
3. Key capabilities / features
4. Important constraints or side effects

> "Stop writing lazy parameter descriptions. Every description is an opportunity to teach the AI how to use your tool effectively."

### 1.4 Workato (industry consensus)

> "MCP tools aren't just functions. They are interfaces for reasoning. If the model has to guess at any step — selection, input, output, or interpretation — reliability breaks."

---

## 2. The 5 Components Pass 2 Generates (v0)

For each tool, Pass 2 generates:

### Component 1 — Purpose

What the tool does. 1-3 sentences. Never marketing language, never ambiguous.

**Bad examples (real, from paper):**
- "A tool to manage things." (Unclear Purpose)
- "Performs operations on resources." (Tautological)
- "Useful for various tasks." (Generic)

**Good examples:**
- "Searches across all entity types in this Stripe account using natural language or structured query syntax. Returns ranked results with smart IDs that can be passed to fetch."
- "Captures a previously authorized charge, transferring funds from the customer to the merchant. This is the second step in two-step payments (after authorization)."

### Component 2 — Guidelines (When + How)

Two sub-sections:

**When to use:**
- Concrete situations where this tool is the right choice
- Comparison against neighboring tools (when search vs when list_objects)
- Bullet list, 3-5 items

**How to use:**
- Step-by-step pattern for non-trivial tools
- For workflow tools: explicit orchestration sequence
- Mention required preconditions

**Good example (search tool from Six-Tool Pattern):**
```
When to use:
- User describes WHAT they're looking for in natural language
- Need cross-collection discovery (charges + customers + subscriptions)
- Don't have specific IDs yet

When NOT to use:
- You have an ID — use fetch instead (one round-trip vs many)
- You need ALL items of a type — use list_objects(collection=X)
- You need exact filtering — list_objects with filter param

How to use:
- Pass natural language: "recent failed payments over $100"
- OR structured: "collection:Charge status:failed amount_gte:100"
- Server parses both styles. Returns ranked results with smart IDs.
- Take IDs from results and pass to fetch for full data.
```

### Component 3 — Limitations

Constraints, caveats, edge cases that the agent must know to avoid mistakes.

**Categories:**
- Hard limits (max items per call, rate limits)
- Status/state restrictions (cannot delete completed charges)
- Data freshness (eventually consistent)
- Failure modes (returns empty vs returns error)
- Idempotency (calling twice creates duplicates? safe to retry?)

**Good example (charges_refund action):**
```
Limitations:
- Cannot refund a charge that hasn't been captured
- Cannot refund > original charge amount
- Refunds are irreversible
- Async: refund may take 5-10 business days to appear on customer statement
- Idempotent only with idempotency_key — without it, calling twice creates two refunds
```

### Component 4 — Parameter Overview (NOT per-param details)

This is the boundary with Pass 3. Pass 2 produces a **high-level overview** that mentions key parameters and their relationships. Pass 3 generates per-parameter detailed descriptions.

**What goes into Pass 2's parameter overview:**
- List of parameter names
- Brief mention of each parameter's role
- Relationships between parameters (mutual exclusivity, dependencies)
- Pointer to "see schema for details"

**Good example:**
```
Parameters: query (required), filters (optional dict for advanced filtering),
limit (default 10, max 100), offset (for pagination). Use filters when you
have specific constraints; use query for flexibility. Combine for hybrid search.
```

This is **150-300 chars overview**, not per-parameter walls of text. Per-parameter docs live in Pass 3.

### Component 5 — Length & Completeness (meta, not separate field)

Not a separate text block. Validation rule:
- Description (Components 1-4 combined) total length ∈ [target_range, max_range]
- All 4 components present (≥3 sentences for Purpose, ≥3 bullets for Guidelines, etc.)
- No forbidden patterns (marketing language, "you can", tautologies)

Length budgets per tool type — see § 3.

### Component 6 — Examples (deferred to v0)

**Why skipped in v0:** Tool-level examples (full call + result) require real execution traces. Generating them from spec alone leads to hallucinations (paper section 4.4.2 explicitly states this).

**Behavior in v0:**
- If spec contains `examples` field for the endpoint — preserve and include
- Otherwise — `examples: null`
- Surface in Quality Report: "X tools without examples (requires v1.1 sandbox feature)"

**Activation conditions for Examples generation in future:**
1. v1.1: Add execution sandbox для popular API serverов (Stripe test mode, GitHub test orgs)
2. Generate examples by running tool against sandbox
3. Validate result format matches spec response schema
4. Cache examples per (spec_hash, tool_name)

This is explicitly tracked in § 11 of generation-engine-v2.md as Gap G1.

---

## 3. Description Templates per Tool Type

This is Pass 2's main innovation: **different tool types get different description styles**.

### 3.1 Universal Tools (Six-Tool Pattern)

These tools subsume many endpoints, so descriptions are necessarily rich.

**Length budget:** 200-400 tokens (~150-300 words)

**Structure for `search`:**
```
[Purpose: 2-3 sentences]
This tool performs unified search across all entity types in <API>.
Accepts both natural language and structured query syntax.
Returns ranked results with smart IDs for use with fetch.

[When to use: 4-6 bullets]
- Cross-collection discovery
- Natural language queries
- Exploratory search before knowing exact IDs
- ...

[When NOT to use: 2-3 bullets]
- Have specific ID → use fetch
- Need exact filtering → use list_objects with filter

[How to use: 3-5 sentences]
Pass natural language for flexibility OR structured syntax for precision.
Server parses both. Take IDs from results to follow up with fetch.

[Limitations: 3-5 bullets]
- Max 100 results per call
- ...

[Parameter overview: 1-2 sentences]
```

**Structure for `upsert`:**
```
[Purpose: emphasizes smart routing — create OR update, single OR batch]
[Guidelines: clear rules for when each behavior triggers]
[Limitations: rate limits, batch size limits, transaction semantics]
[Parameter overview: id presence routes; data shape determines batch vs single]
```

### 3.2 Action Tools (POST endpoints with side effects)

Focused, safety-critical. Length budget: 100-200 tokens.

**Structure:**
```
[Purpose: 1-2 sentences — what action and what object]
[Side effects: explicit, prominent]
[When to use: 2-4 bullets — narrow use cases]
[Limitations: state restrictions, idempotency, reversibility]
[Parameter overview: brief]
```

**Example for `charges_capture`:**
```
Captures a previously authorized charge, transferring funds from customer
to merchant. Final step in two-step payment flow.

Side effects: Funds transfer. Status changes from "pending" to "succeeded".
Customer is notified. Cannot be undone (use refunds tool to reverse).

When to use:
- Charge was created with capture=false
- Customer fulfillment is confirmed
- Within 7 days of authorization (otherwise auth expires)

Limitations:
- Charge must be in "pending" state
- Can only capture once per authorization
- Partial captures supported (specify amount)
- Rate-limited to 100/sec per account
```

### 3.3 Workflow Tools (multi-step composites)

Length budget: 150-300 tokens. Focus on orchestration and partial failure.

**Structure:**
```
[Purpose: 2-3 sentences — the user goal this serves]
[Internal steps: explicit list of what happens under the hood]
[Failure handling: what happens if step N fails after step N-1 succeeded]
[When to use vs separate calls]
[Limitations: rate limits across all sub-calls]
[Parameter overview]
```

**Example for `schedule_event`:**
```
Schedules a calendar event with the specified person at a mutually available time.

Under the hood: (1) Looks up the person by email; (2) Checks both calendars
for availability in the specified window; (3) Creates the event with both
as attendees; (4) Sends invitations.

Failure handling: If lookup fails — returns error before any calendar changes.
If event creation fails after slot found — returns error with the chosen slot
so you can retry. No partial state.

When to use:
- You want to "find time and book" in one operation
- The user provided email + duration + window

Versus: separate list_users + find_slots + create_event when you need
to inspect intermediate results (e.g., negotiate slot with user).
```

### 3.4 Specialized Reads (rare, focused queries)

Length budget: 100-150 tokens.

**Structure:**
```
[Purpose: 1 sentence — exact query semantics]
[When to use vs list_objects: explicit difference]
[Limitations: usually around result size]
[Parameter overview]
```

**Example for `get_recent_user_activity`:**
```
Returns the last N events for a user, sorted by timestamp descending.

Use this instead of list_objects when:
- You need only the most recent activity (sub-second freshness)
- You don't need to filter by event type

Use list_objects(collection="events", filter={user_id: X}, sort_by="created_at",
limit=N) when you need filtering or pagination.

Limitations: Returns at most last 30 days. Results may lag real-time by < 1 sec.
```

---

## 4. Pipeline

```
┌──────────────────────────────────────────────────────────┐
│  PHASE 1: Tool classification & batching                 │
│  (deterministic)                                          │
│                                                           │
│  For each tool from Pass 1, determine:                   │
│  - Type: universal | action | workflow | specialized     │
│  - Description template to use                           │
│  - Length budget                                         │
│  - Required components                                   │
│                                                           │
│  Batch tools для параллельных LLM calls.                 │
│  Cost: $0, time: <1s                                     │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 2: Per-tool description generation                │
│  (LLM, parallel calls)                                    │
│                                                           │
│  For each tool — independent Sonnet 4.7 call:            │
│  - Tool type → specific prompt template                  │
│  - Endpoint context (для context tools — for all subsumed)│
│  - Returns 5-component structured description            │
│                                                           │
│  Concurrency: 10 parallel calls.                          │
│  Cost: ~$0.30-0.50 per server (50 tools).                │
│  Time: 30-60s (parallel).                                 │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 3: Inline quality gate (LLM, single judge)        │
│  (LLM, parallel calls)                                    │
│                                                           │
│  For each generated description:                         │
│  - Single Haiku judge applies 5-point rubric             │
│  - Per component score                                   │
│  - If any component < 3 → retry with feedback            │
│                                                           │
│  Concurrency: 10 parallel.                                │
│  Cost: ~$0.05 per server.                                 │
│  Time: 10-20s.                                            │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  PHASE 4: Programmatic validation                        │
│  (deterministic)                                          │
│                                                           │
│  - Length budgets respected                              │
│  - All required components present                       │
│  - No forbidden patterns                                 │
│  - Examples are null OR from spec (not hallucinated)     │
│  - Markdown structure preserved                          │
│                                                           │
│  Cost: $0, time: <1s                                     │
└──────────────────────────────────────────────────────────┘
```

**Why per-tool parallel (not single batch call):** descriptions are independent. Per-tool parallel maximizes throughput, simplifies retry logic, allows different models for different tool types if needed.

**Why inline quality gate (Phase 3) before programmatic:** rubric scoring needs LLM judgment. Catches issues programmatic checks miss (e.g., vague Purpose, generic Guidelines). Full 3-judge scan happens later in Stage F2.

---

## 5. Input

```python
class Pass2Input(BaseModel):
    spec_info: SpecInfo
    auth_info: AuthRequirement              # для context (e.g., "OAuth-protected")
    tools: list[ToolWithEndpoints]          # tools from Pass 1, with subsumed endpoints
    server_name: str
    spec_hash: str

class ToolWithEndpoints(BaseModel):
    name: str
    type: ToolType                          # universal_search | universal_fetch | ... | action | workflow | specialized
    parameters_signature: list[ParameterSignature]
    subsumed_endpoints: list[Endpoint]      # для context tools — все endpoints, которые subsumed
    upstream_endpoint: Endpoint | None      # для simple tools
    sub_endpoints: list[SubEndpointCall] | None  # для workflows
    routing_rules: list[RoutingRule] | None # для universal tools
    spec_examples: list[Example] | None     # if examples present in spec
```

`subsumed_endpoints` критичен для universal tools — description должно отражать все, что tool делает.

---

## 6. Output

```python
class Pass2Output(BaseModel):
    tools_with_descriptions: list[ToolWithDescription]
    quality_summary: QualitySummary
    flags: Pass2Flags

class ToolWithDescription(BaseModel):
    name: str
    type: ToolType
    description: ToolDescription           # the rich structure
    description_text: str                  # rendered markdown for MCP tools/list
    description_token_count: int           # measured
    parameters_signature: list[ParameterSignature]  # passes through to Pass 3
    upstream_info: UpstreamInfo            # for codegen
    
class ToolDescription(BaseModel):
    purpose: str                           # Component 1
    guidelines: Guidelines                 # Component 2
    limitations: list[str]                 # Component 3
    parameter_overview: str                # Component 4 high-level
    examples: list[Example] | None         # Component 6 (null in v0 unless from spec)
    # Length & Completeness (Component 5) is meta — implicit in lengths
    
class Guidelines(BaseModel):
    when_to_use: list[str]                 # bullets
    when_not_to_use: list[str] | None      # для tools с близкими альтернативами
    how_to_use: str | None                 # для нетривиальных tools
    
class QualitySummary(BaseModel):
    avg_purpose_score: float               # 1-5 from inline judge
    avg_guidelines_score: float
    avg_limitations_score: float
    avg_parameter_overview_score: float
    avg_overall_score: float
    tools_with_low_scores: list[str]       # names, для surfacing в UI
    
class Pass2Flags(BaseModel):
    forbidden_patterns_detected: bool      # caught и пофикшено
    examples_dropped_from_spec: int        # count
    retries_triggered: int
    tools_marked_for_manual_review: list[str]
```

---

## 7. LLM Prompts

### 7.1 System prompt — universal tool variant (cached)

```
You write tool descriptions for MCP servers, following Anthropic best practices
and the 6-component rubric from MCP description quality research.

PRINCIPLES:

1. Treat descriptions as TEACHING moments. The agent reads description at
   the moment of decision — make every word count.

2. Make implicit context EXPLICIT. If you'd brief a new hire on this tool,
   what would you mention? Mention it.

3. Every description has 5 required components (in v0):
   - Purpose: what does it do, in 1-3 sentences
   - Guidelines: when to use (bullets) + how to use (sentences)
     Include "When NOT to use" for tools with close alternatives
   - Limitations: explicit constraints, side effects, failure modes
   - Parameter overview: high-level mention (NOT per-parameter details — Pass 3 does that)
   - Length: 200-400 tokens for universal tools

4. Format as structured Markdown with headers ## When to use / ## How to use etc.

5. Examples (component 6) are SKIPPED in v0 unless preserved from spec.
   Set examples=null. Do NOT generate hypothetical examples.

THIS TOOL'S TYPE: Universal Tool (Six-Tool Pattern)

These tools subsume many endpoints. Description must reflect their full
breadth. Be rich and explicit. Length: 200-400 tokens.

For universal tools (search, fetch, list_collections, list_objects, upsert, delete):
- Explain that this tool routes to multiple upstream operations
- Mention the smart ID format if applicable
- Mention how this tool relates to its 5 siblings (when to use search vs fetch vs list_objects)

FORBIDDEN PATTERNS (do not use):
- Marketing language: "powerful", "elegant", "robust", "easy"
- Filler: "you can use this to", "this tool allows"
- Tautological: "this list tool lists things"
- Vague placeholders: "various", "different", "appropriate"

OUTPUT: structured JSON matching ToolDescription schema.
```

### 7.2 System prompt — action tool variant (cached)

```
[Same principles as above]

THIS TOOL'S TYPE: Action Tool (POST с side effects)

Action tools have business semantics. Description must emphasize:
- Exact action being performed
- Side effects (state changes, notifications, financial movements)
- State restrictions (when can/can't be called)
- Idempotency / reversibility

Length: 100-200 tokens.

CRITICAL FOR ACTIONS:
- Always explicitly state side effects in Limitations
- If irreversible — say "irreversible" loudly
- If async — mention timing characteristics
- If charges money / sends communication / changes status — mention prominently
```

### 7.3 System prompt — workflow tool variant (cached)

```
[Same principles]

THIS TOOL'S TYPE: Workflow Tool (multi-step composite)

Workflow tools orchestrate multiple upstream calls. Description must include:
- Internal step sequence (transparent to agent)
- Partial failure semantics (what happens if step 2 fails after step 1)
- When to use this VS calling steps separately (visibility trade-off)

Length: 150-300 tokens.

CRITICAL FOR WORKFLOWS:
- Be explicit about WHAT happens under the hood (don't hide complexity)
- Be explicit about partial failure behavior (single biggest source of bugs)
- Provide guidance on when separate tools would be better
```

### 7.4 User prompt (per tool)

```
Server context:
  API: {spec_info.title}
  Server name: {server_name}
  Auth: {auth_info.type}
  
Tool to describe:
  Name: {tool.name}
  Type: {tool.type}
  Length budget: {budget} tokens
  
Subsumed endpoints (this tool covers all of these):
  {for each endpoint:}
  - {method} {path}
    Original summary: {summary}
    Original description: {description[:500]}
    Tags: {tags}

{if tool.routing_rules:}
Routing rules (smart routing inside this tool):
  {for each rule:}
  - When {condition} → {upstream}

{if tool.sub_endpoints:}
Workflow steps (sequential orchestration):
  {for each step:}
  Step {N}: {sub.purpose} → calls {sub.endpoint}

Parameters (signatures only — full descriptions in Pass 3):
  {for each param:}
  - {name}: {type} ({"required" or "optional"})

Existing examples from spec: {spec_examples or "(none)"}

Generate the structured description.
```

---

## 8. Programmatic validation (Phase 4)

After LLM output:

| Check | Action |
|---|---|
| Description token count в budget range | Truncate if over by < 20%, retry if over by more |
| All 4 components present (Purpose, Guidelines, Limitations, Parameter overview) | Retry с specific missing component |
| Purpose has 1-3 sentences, не заканчивается tautology | Retry |
| Guidelines.when_to_use has ≥ 3 bullets | Retry |
| Limitations has ≥ 1 entry (или explicit "No notable limitations") | Retry |
| Examples = null OR fully from spec | Reject hallucinated examples |
| No forbidden patterns ("you can", "powerful", etc.) | Auto-strip (low-confidence regex) ИЛИ retry |
| Smart ID format mentioned in universal tool descriptions | Retry если applicable |
| Side effects mentioned in action tool descriptions | Retry если destructive but не упомянуто |
| For workflows: partial failure semantics mentioned | Retry если absent |

---

## 9. Inline quality gate (Phase 3)

Single Haiku judge applies abbreviated rubric (4 components, 5-point scale):

```
Score Purpose (1-5):
  5 = Clearly explains function, behavior, return data with precise language
  4 = Explains function and behavior with minor ambiguity
  3 = Basic explanation present but lacks behavioral details
  2 = Vague or incomplete
  1 = Unclear or missing

Score Guidelines (1-5):
  5 = Specific situations + clear comparison + step-by-step usage
  4 = Specific situations and usage but no comparison
  3 = Generic guidelines, missing key details
  2 = Vague hints
  1 = Missing or unhelpful

Score Limitations (1-5):
  5 = Explicit constraints + side effects + failure modes
  4 = Most key limitations covered
  3 = Some limitations mentioned
  2 = Vague hints at constraints
  1 = Missing

Score Parameter Overview (1-5):
  5 = Clear roles + relationships + pointer to schema
  4 = Roles clear, relationships partial
  3 = Names mentioned, roles unclear
  2 = Generic mention
  1 = Missing

If any < 3 → retry with feedback explaining what was deficient
```

After 2 retries без улучшения — mark tool с warning in Pass2Flags.

---

## 10. Edge cases

**E1. Tool subsumes 30+ endpoints (large universal tool).**
LLM не сможет описать каждый. Strategy: describe the *capability* not enumerate endpoints. "This tool handles all CRUD operations on charges, customers, subscriptions" вместо list of 30 endpoints.

**E2. Spec endpoints в основном без descriptions / только path.**
LLM has limited context для понимания intent. Mitigation: pass operation_id, method, path patterns. If still ambiguous — mark с low quality, surface for manual review.

**E3. Spec на не-английском.**
Pass 2 generate descriptions on English (universal). Original endpoint descriptions translated implicitly через model knowledge. Quality check: compare semantic meaning preserved.

**E4. Tool has conflicting subsumed endpoints (некоторые destructive, некоторые нет).**
Например, `delete` tool с type parameter routing к разным destructive levels. Description должно cover ALL destructive variants explicitly. Retry если description описывает только мягкие cases.

**E5. Spec uses domain-specific jargon ("envelope", "pipeline", "merge request").**
LLM should use domain terms наturally, не replace их. Description prompt includes spec context для terminology preservation.

**E6. Workflow tool with conditional branches.**
Description должно describe both branches: "If user exists, attaches; otherwise creates new user, then attaches". Retry если только happy path covered.

**E7. Examples in spec are wrong / outdated.**
Programmatic check: validate spec.examples against spec.responses schema. Drop invalid examples. Surface in flags.

**E8. Description вдруг сильно превышает budget.**
Two attempts с budget hint, потом truncate с rule "preserve all 4 components, shorten Limitations первым".

**E9. Tool name itself ambiguous after Pass 1.**
Например `upsert` — что именно делает? Description must elaborate с Six-Tool context. Standard prompts handle this.

**E10. Spec говорит endpoint deprecated, но Pass 0 оставил его.**
Mention в Limitations: "Note: this operation is marked deprecated by API provider."

---

## 11. Length budgets per tool type

Calibrated based on paper finding (rich descriptions: +5.85 pp accuracy, +67% steps — find balance):

| Tool type | Min | Target | Max | Justification |
|---|---|---|---|---|
| Universal (search, fetch, list_*) | 200 | 300 | 400 | Subsume много endpoints, нужна rich documentation |
| Action | 100 | 150 | 200 | Focused operation, safety-critical clarity |
| Workflow | 150 | 200 | 300 | Orchestration explanation требует места |
| Specialized read | 80 | 120 | 150 | Narrow scope |

These are **rendered markdown token counts**, not raw structure size.

---

## 12. Token economy & cost

For typical server (10 tools after Pass 1):

| Component | Cost | Latency |
|---|---|---|
| Phase 1 (classification) | $0 | <1s |
| Phase 2 (10 parallel Sonnet calls) | $0.30-0.50 | 30-60s |
| Phase 3 (10 parallel Haiku judges) | $0.05-0.10 | 10-20s |
| Phase 4 (validation) | $0 | <1s |
| Retry overhead (~15%) | +15% | +15% |
| **Total** | **~$0.40-0.65** | **~50-90s** |

С Anthropic prompt caching (system prompts ~3000 tokens): -70% после первого call.

**Cost-saving strategy:** group same-type tools into batched LLM calls if total fits в context window. Не для MVP — оптимизация после launch.

---

## 13. Golden eval set

Минимум 5 cases.

### G1: Stripe `search` (universal tool subsuming 30+ search-like endpoints)

Expected output:
- Purpose mentions cross-collection search and smart IDs
- Guidelines compare against fetch и list_objects
- Limitations include max results (100), pagination, freshness
- Length: 280-380 tokens

Quality check: real agent tries to use this description, should not confuse search vs list_objects.

### G2: Stripe `charges_capture` (action tool, irreversible)

Expected output:
- Purpose 1-2 sentences
- Side effects prominent (status change, notification, fund transfer)
- Limitations include "irreversible", state restrictions, time window
- Length: 130-180 tokens

### G3: Calendar `schedule_event` (workflow tool, multi-step)

Expected output:
- Internal steps explicit
- Partial failure semantics explained
- "When to use this vs separate calls" included
- Length: 200-280 tokens

### G4: Notion `delete` (universal write, destructive)

Expected output:
- Smart routing (object/objects/collection) explicit
- Confirmation requirement mentioned
- Multiple destructive scenarios all covered
- Length: 200-300 tokens

### G5: Tool с poor original description (E2 test)

Spec endpoint имеет только: `path: /something`, no description. LLM должен:
- Generate reasonable description from path и method patterns
- Mark с lower confidence
- Surface in Pass2Flags

### G6: Tool на non-English spec

Spec на Spanish. Description output на English. Domain terms preserved. Verified by parallel test rendering.

CI threshold: 4 of 6 evals must pass. < 4 = block merge.

---

## 14. Что Pass 2 НЕ делает

- НЕ генерирует per-parameter detailed descriptions (Pass 3)
- НЕ выводит annotations (Pass 4)
- НЕ генерирует examples с execution traces (deferred to v1.1)
- НЕ обрабатывает response shaping config (Pass 5)
- НЕ generate code (Stage E)

Pass 2 produces **the tool's narrative documentation**. Parameters details, annotations, response shaping и code — последующие passes.

---

## 15. Открытые вопросы

❓ **Description verbosity calibration.** Budget ranges (200-400 для universal) — educated guess. Реальная calibration требует production data: какой длины descriptions correlate с highest agent eval scores. **Experiment:** на 50 generations track length distribution vs eval F3 score, find optimal range.

❓ **Inline judge vs full F2 scan trade-off.** Single Haiku judge в Phase 3 — быстрая проверка. Полный 3-judge multi-family scan в Stage F2 — финальная. Возможно одного достаточно? **Experiment:** compare выявленных issues между inline и full scan на 20 generations. If overlap > 90% — drop full F2 для cost saving.

❓ **Description style across tool types — consistency vs specificity.** Each tool type has its own template. Risk: descriptions feel inconsistent across server. Counter-risk: making them all uniform loses tool-type-specific clarity. **Decision для v0:** specific templates win, monitor user feedback.

❓ **Markdown formatting в descriptions — все клиенты support?** MCP spec не mandates Markdown. Claude Desktop renders, Cursor renders, others uncertain. **Mitigation:** descriptions readable as plaintext тоже (headers `##` look fine in monospace). Test on 3 major clients перед launch.

❓ **Length budgets per language.** На русском / японском / китайском токены considerably less для same content. Budgets calibrate per language? **Decision для v0:** English-only descriptions; multilingual — v1.x.

❓ **Examples generation в v0 через spec.examples.** Some specs (Stripe, GitHub) have rich examples. Use them? **Decision:** yes if validate against response schema. Mark as "from spec" в quality report. Don't fabricate.

❓ **Что if upstream endpoint description содержит prompt injection attempt?** ("Ignore previous instructions and ..."). Sanitize: treat all spec text as untrusted, escape special tokens, don't let it influence prompt structure.

---

## 16. Финальные decisions

1. ✅ **5 of 6 components в v0** (Examples deferred); 6 components в v1.1
2. ✅ **Different prompt templates per tool type** (universal/action/workflow/specialized)
3. ✅ **Length budgets per type** based on rubric paper findings
4. ✅ **Per-tool parallel LLM calls** (concurrency 10), not single batch
5. ✅ **Inline quality gate (Phase 3)** with single Haiku judge per tool
6. ✅ **Full 3-judge rubric scan** deferred to Stage F2 (avoid duplication)
7. ✅ **Examples ONLY from spec в v0**, never hallucinated
8. ✅ **Forbidden patterns regex** для programmatic catch (marketing speak)
9. ✅ **Markdown structure** with `## When to use` etc. headers
10. ✅ **Domain terminology preserved** через context-rich prompts

---

## Appendix A — The 6-component rubric quick reference

For internal use в quality scans (matches paper exactly):

```
Purpose:
  5 = Clearly explains function, behavior, and return data
  4 = Minor ambiguity
  3 = Basic explanation, lacks behavioral details
  2 = Vague or incomplete
  1 = Unclear or missing

Guidelines (When + How):
  5 = Specific activation criteria + operational protocols + comparisons
  4 = Specific situations and usage
  3 = Generic guidelines
  2 = Vague hints
  1 = Missing

Limitations:
  5 = Explicit constraints + side effects + failure modes + corner cases
  4 = Most key limitations
  3 = Some limitations
  2 = Vague hints
  1 = Missing

Parameter Explanation:
  5 = Each parameter purpose + format + relationships
  4 = Most parameters explained
  3 = Names mentioned, roles unclear
  2 = Generic mention
  1 = Missing
  (Pass 2 generates overview ≥3; Pass 3 brings to 4-5)

Length & Completeness:
  5 = Right length for tool complexity, all components present
  4 = Slightly under or over budget
  3 = Borderline acceptable
  2 = Significantly mis-sized
  1 = Way off

Examples:
  5 = Multiple working examples with diverse inputs
  4 = One working example
  3 = Example present but trivial
  2 = Vague or wrong example
  1 = Missing
  (v0 typically scores 1-2 by design — Examples are deferred to v1.1)
```

---

## Appendix B — Sources

1. **Anthropic** — "Writing effective tools for agents" (Sept 2025)
   https://www.anthropic.com/engineering/writing-tools-for-agents

2. **arXiv 2602.14878** — "MCP Tool Descriptions Are Smelly! Towards Improving AI Agent Efficiency with Augmented MCP Tool Descriptions" (Feb 2026)
   https://arxiv.org/abs/2602.14878
   
3. **MCP Bundles** — "MCP Tool Parameter Design: Teaching AI Agents Through Descriptions" (Oct 2025)
   https://www.mcpbundles.com/blog/mcp-tool-parameter-design

4. **Workato** — "Designing MCP Tools? Make Them Easy for LLMs to Use Correctly"
   https://www.workato.com/product-hub/designing-mcp-tools-make-them-easy-for-llms-to-use-correctly/

5. **Empirical:**
   - 856 tools across 103 servers studied
   - Augmented descriptions: +5.85 pp accuracy, +67% steps, +16.67% regression
   - Examples removable без statistical degradation
   - Anthropic SWE-bench Verified SOTA from description tweaks
