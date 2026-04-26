# Stage F: Validation — Detailed Design

> **Документ:** detailed design final stage Generation Engine v2 — multi-tier validation generated MCP server'а перед deploy.
> **Статус:** v1.0 — финальный design, готов к имплементации.
> **Связанные:** все pass docs, `stage-e-design.md`, `architecture.md`, `generation-engine-v2.md`.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

Stage F валидирует generated server перед тем как user может его deploy. **Three tiers** (рост по cost и thoroughness):

- **F1 — Static validation** (deterministic, $0): schema correctness, TS compilation, JSON Schema validity. Always runs.
- **F2 — Smell scan** (LLM judges, $0.20-0.50): 6-component rubric от paper, 3 multi-family judges с score averaging.
- **F3 — Agent eval** (real agent + sandbox, $1-3): LLM agent выполняет golden tasks against generated server, measures pass rate.

F1 и F2 — always run. F3 — opt-in (Pro feature) или triggered if F2 score < 4.0.

Total Stage F cost: ~$0.20-0.50 (без F3) or ~$1.20-3.50 (с F3). Latency ~30s-3min.

Failures trigger **targeted retries** в specific upstream passes (e.g., F2 description smell → Pass 2 retry).

---

## 1. Research foundation

### 1.1 MCP-Bench framework (arXiv 2508.20453)

Industry-validated **two-tier evaluation** для MCP servers:

> "Each execution trajectory is evaluated using a combination of rule-based checks and LLM-as-a-Judge scoring, assessing agent performance in tool schema understanding, multi-hop planning, and real-world adaptability."

**Rule-based** (Tier 1):
- Tool validity (calls exist в server's tool list)
- Schema compliance (parameters match inputSchema)
- Runtime success (no exceptions)
- Dependency order (sequential calls respect data flow)

**LLM-as-Judge** (Tier 2):
- Task completion (was user's intent achieved?)
- Tool usage (efficient/correct tool selection)
- Planning effectiveness (logical multi-step coherence)

### 1.2 Stability finding

> "To ensure stability, prompt shuffling and score averaging are applied... Three LLM judges achieve 86.67% three-way percentage agreement with human evaluators."

Single judge insufficient. **Three judges + averaging — production-grade quality bar.**

### 1.3 MCP-AgentBench (arXiv 2509.09734) — outcome-oriented

> "MCP-Eval deliberately prioritizes the correctness of the final outcome over the intermediate execution trajectory, a design choice that acknowledges an agent's capacity for self-correction and the existence of multiple valid solution paths."

**Pass Rate** как primary metric — измеряет fraction queries successfully resolved.

### 1.4 Common failure modes (MCP-AgentBench analysis)

1. **Misinterpretation of Query** — agent неправильно понимает user intent
2. **Refusal to Use Tool** — agent defaults to parametric knowledge instead of calling tool
3. **Wrong parameter format** — agent passes invalid data
4. **Missing dependency** — agent skips required prep step

Stage F тестирует устойчивость generated server's к каждому из этих failure modes.

### 1.5 mcp-eval library (mcp-agent.com)

Practical API which we'll adopt patterns from:

```python
Expect.tools.was_called("fetch")
Expect.tools.output_matches("search", {"isError": False})
Expect.tools.sequence(["search", "fetch", "upsert"])
Expect.path.efficiency(max_steps=5)
Expect.judge.llm("Summary correctly mentions X", min_score=0.8)
Expect.content.contains("expected_keyword")
```

Direct copy этих pattern'ов адекватен для нашей F3 implementation.

---

## 2. Three-tier validation architecture

```
Generated Server (from Stage E)
            │
            ▼
┌────────────────────────────────────┐
│  F1 — Static Validation            │
│  Deterministic, $0, ~5s            │
│  ALWAYS runs                       │
└──────────┬─────────────────────────┘
           │ pass
           ▼
┌────────────────────────────────────┐
│  F2 — Smell Scan                   │
│  3 LLM judges, $0.20-0.50, ~20s    │
│  ALWAYS runs                       │
└──────────┬─────────────────────────┘
           │ score ≥ 4.0
           ▼ (or user opted-in to F3)
┌────────────────────────────────────┐
│  F3 — Agent Evaluation             │
│  Real agent + golden tasks         │
│  $1-3, ~2min                       │
│  OPT-IN или triggered if F2 < 4.0  │
└──────────┬─────────────────────────┘
           │ pass rate ≥ 0.7
           ▼
   Quality Report
   Surface to user
```

Each tier produces actionable output. Failures в higher tiers — feedback to specific passes (см. § 8).

---

## 3. F1: Static Validation

Deterministic checks, no LLM.

### 3.1 Checks

```python
class F1Checks:
    # Schema correctness
    json_schema_valid: bool                    # all inputSchemas/outputSchemas valid JSON Schema
    parameter_names_unique: bool               # within each tool
    required_fields_consistent: bool           # required ⊂ properties
    
    # Code correctness  
    typescript_compiles: bool                  # tsc --noEmit passes
    imports_resolve: bool                      # все imports работают
    no_template_artifacts: bool                # no {{...}} остался в коде
    
    # MCP protocol compliance
    mcp_protocol_version_set: bool             # has 2025-06-18
    tools_list_serializable: bool              # tools/list response valid
    tool_names_valid: bool                     # snake_case ASCII ≤ 64 chars
    annotations_valid: bool                    # 4 boolean fields, openWorld=true
    
    # Routing correctness  
    smart_id_patterns_valid: bool              # regex compile
    routing_table_complete: bool               # all collections have routes
    
    # Runtime safety
    no_hardcoded_secrets: bool                 # secret scanner
    auth_middleware_present: bool              # one of three modes
    error_handler_present: bool                # try/catch на всех handlers
```

### 3.2 Implementation

Combination of:
- `tsc --noEmit` (TypeScript validator)
- `ajv` (JSON Schema validator)
- `gitleaks` или TruffleHog patterns (secret scanner)
- Custom AST checks (template artifacts, error handlers)

### 3.3 Failure handling

Each F1 check tied к specific generation pass:

| Failed check | Trigger retry в |
|---|---|
| `typescript_compiles: false` | Stage E (template fix) |
| `parameter_names_unique: false` | Pass 3 |
| `tool_names_valid: false` | Pass 0/1 |
| `routing_table_complete: false` | Pass 1 |
| `annotations_valid: false` | Pass 4 |
| `auth_middleware_present: false` | Stage E |

If F1 fails 3 times → terminal failure, surface error to user.

### 3.4 Cost & latency

- Cost: $0
- Latency: 5-10s
- Always runs

---

## 4. F2: Smell Scan

LLM judges apply paper's 6-component rubric to descriptions. Multi-family judges + score averaging для stability (per MCP-Bench finding).

### 4.1 Rubric

Paper rubric (arXiv 2602.14878) — 6 components, each scored 1-5:

```
Purpose:
  5 = Clearly explains function, behavior, return data
  4 = Minor ambiguity
  3 = Basic explanation, lacks behavioral details
  2 = Vague or incomplete
  1 = Unclear or missing

Guidelines (When + How):
  5 = Specific situations + comparisons + step-by-step usage
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
  5 = Each parameter purpose + format + relationships + examples
  4 = Most parameters explained well
  3 = Names mentioned, roles unclear
  2 = Generic mention
  1 = Missing

Length & Completeness:
  5 = Right length for tool complexity, all components present
  4 = Slightly under or over
  3 = Borderline acceptable
  2 = Significantly mis-sized
  1 = Way off

Examples:
  5 = Multiple working examples
  4 = One working example
  3 = Example present but trivial
  2 = Vague placeholder
  1 = Missing
  (v0 typically scores 1-2 здесь — Examples deferred)
```

### 4.2 Multi-judge architecture

Per MCP-Bench для stability:

```
For each tool:
  ┌────────────────────────────┐
  │ Judge 1: Sonnet 4.7        │ → scores (1-5 per component)
  │ Judge 2: GPT-5             │ → scores
  │ Judge 3: Gemini 3.5 Pro    │ → scores
  └────────────┬───────────────┘
               ▼
  Score averaging + Outlier detection
               ▼
  Final per-tool scores
```

**Why multi-family** (not 3x same model): single-family bias возможен. MCP-Bench paper specifically recommends cross-family.

### 4.3 Prompt shuffling

Per MCP-Bench: same tool description evaluated с tool ordering shuffled per call. Prevents position bias. Average across 3 shuffles.

### 4.4 Aggregation

```python
def aggregate_f2_scores(per_tool_scores: list[ToolScores]) -> F2Result:
    # Per-tool: average across 3 judges
    # Then per-server: weighted average across tools
    
    component_averages = {
        "purpose": mean([t.purpose for t in per_tool_scores]),
        "guidelines": mean([t.guidelines for t in per_tool_scores]),
        # ...
    }
    
    overall = mean(component_averages.values())
    
    return F2Result(
        component_scores=component_averages,
        overall_score=overall,
        per_tool_scores=per_tool_scores,
        below_threshold_tools=[t for t in per_tool_scores if t.average < 3.5],
    )
```

### 4.5 Failure handling

| Score | Action |
|---|---|
| Overall ≥ 4.5 | Excellent — surface "premium quality" badge |
| 4.0 ≤ Overall < 4.5 | Good — pass без retries |
| 3.5 ≤ Overall < 4.0 | Marginal — retry Pass 2 для below-3.5 tools |
| Overall < 3.5 | Poor — retry Pass 2 + Pass 3 для all tools |

If retries don't improve — surface concerns в Quality Report. Don't block deploy unless user opts strict mode.

Specific component failures trigger targeted retries:
- Purpose < 3 → Pass 2 (description authoring)
- Guidelines < 3 → Pass 2
- Limitations < 3 → Pass 2
- Parameter Explanation < 3 → Pass 3 (parameter spec)
- Length issues → Pass 2 (length budgets)
- Examples < 3 → Expected (deferred to v1.1) — don't retry

### 4.6 Cost & latency

For typical server (10 tools, 3 judges, 3 shuffles each):
- Calls: 10 × 3 × 3 = 90 LLM calls
- Models mix: Sonnet/GPT-5/Gemini Pro — average ~$0.005 per call
- **Cost: ~$0.20-0.50**
- Latency: 20-30s (parallel)

### 4.7 Calibration

Periodic re-calibration с human evaluators (per MCP-Bench methodology):
- Quarterly: sample 30 tools, get human scores, compute IPC (intraclass correlation) с judges
- Target: ICC > 0.85
- Если ICC drops — adjust judge prompts, swap models, or add 4th judge

---

## 5. F3: Agent Evaluation

Real LLM agent выполняет tasks против generated server. **Most expensive but most predictive of real-world success.**

### 5.1 Components

```
F3 Agent Eval
├── Test environment (sandbox + generated server)
├── Test agent (Sonnet 4.7 primary; GPT-5 cross-check optional)
├── Golden task suite (per server type)
├── Trajectory recorder
└── Two-tier evaluator (rule-based + LLM judge)
```

### 5.2 Test environment options

**Option A: Real upstream API (preferred для high-value APIs)**

Pre-configured sandbox accounts:
- Stripe test mode
- GitHub test orgs
- Notion test workspace
- Calendar with test calendar

Pros: realistic, catches real upstream issues.
Cons: requires sandbox credential management, network dependency, slower.

**Option B: Mocked upstream (для long-tail APIs)**

Generate mock responses from spec examples + parameter analysis. WireMock or MSW.

Pros: fast, hermetic, no credential management.
Cons: less realistic, миss live API quirks.

**Decision:** **Hybrid**:
- Top 10 popular APIs: real sandbox (curated by us)
- Rest: mocked, with disclaimer "Validated against mocked upstream — production behavior may vary"

### 5.3 Golden task suite

For each server type, ~10-15 tasks covering:

| Task category | Example | Tests |
|---|---|---|
| Simple read | "Find customer with email john@example.com" | search → fetch sequence |
| Simple write | "Create a charge for $50 for customer X" | upsert |
| Multi-step read | "Get customer's recent charges and total spent" | search → list_objects → aggregate |
| Filter usage | "List all subscriptions cancelled this month" | list_objects with filter |
| Pagination handling | "How many products do we have?" | list_objects with pagination |
| Error recovery | "Update customer with invalid ID" | error handling |
| Workflow | "Schedule meeting with Jane next Tuesday at 2pm" | workflow tool |
| Cross-tool reasoning | "Find duplicate customers and merge them" | search + analyze + multi-upsert |
| Edge case | "Delete a customer that doesn't exist" | error response shaping |
| Authentication | "Read private user data" | auth flow |

**Generation strategy:**
- Pre-curated golden tasks для top 10 APIs (manually authored, verified)
- Auto-generated tasks для rest (LLM creates from spec descriptions)
- User can supply own golden tasks (Pro feature)

### 5.4 Test agent harness

Использует Sonnet 4.7 as primary test agent:

```python
async def run_golden_task(task: GoldenTask, server_url: str):
    agent = Agent(
        model="claude-sonnet-4-7-20250929",
        mcp_servers=[server_url],
        max_iterations=20,
    )
    
    trajectory = []
    async for step in agent.run(task.prompt):
        trajectory.append(step)
    
    final_answer = trajectory[-1].content
    
    return TaskResult(
        task=task,
        trajectory=trajectory,
        final_answer=final_answer,
        tool_calls=extract_tool_calls(trajectory),
        iteration_count=len(trajectory),
    )
```

### 5.5 Two-tier evaluator (per MCP-Bench)

**Tier 1 — Rule-based** (deterministic, runs first):

```python
def rule_based_eval(task: GoldenTask, result: TaskResult) -> RuleScore:
    return RuleScore(
        # Tool calls valid (referenced tools exist)
        tool_validity=all(call.tool in server.tools for call in result.tool_calls),
        
        # Parameters match schema
        schema_compliance=all(
            validate_against_schema(call.args, server.tools[call.tool].inputSchema) 
            for call in result.tool_calls
        ),
        
        # No runtime errors (or expected errors only)
        runtime_success=count_unexpected_errors(result.trajectory) == 0,
        
        # Dependency order (e.g., fetch after search)
        dependency_order=verify_call_order(result.tool_calls, task.expected_sequence),
        
        # Efficiency (didn't loop excessively)
        efficient=result.iteration_count <= task.max_iterations * 1.5,
    )
```

**Tier 2 — LLM Judge** (rubric-based):

```python
async def llm_judge_eval(task: GoldenTask, result: TaskResult) -> JudgeScore:
    prompt = f"""
    Task: {task.prompt}
    Expected outcome: {task.expected_outcome}
    
    Agent's trajectory:
    {format_trajectory(result.trajectory)}
    
    Agent's final answer:
    {result.final_answer}
    
    Score the following (1-10 each):
    
    1. Task completion: Did the agent achieve the user's intent?
    2. Tool usage: Did agent select appropriate tools efficiently?
    3. Planning: Was the multi-step approach logical?
    4. Grounding: Did the answer cite tool outputs (not hallucinated)?
    
    Return JSON.
    """
    
    # Three judges, prompt shuffling
    scores = await run_multi_judge(prompt, judges=[sonnet, gpt5, gemini], shuffles=3)
    
    return JudgeScore(
        task_completion=mean([s.task_completion for s in scores]),
        tool_usage=mean([s.tool_usage for s in scores]),
        planning=mean([s.planning for s in scores]),
        grounding=mean([s.grounding for s in scores]),
        overall=mean([s.overall for s in scores]),
    )
```

### 5.6 Pass criteria

Per task:
```
Pass if:
  rule_based.all() == True
  AND judge.task_completion >= 7
  AND judge.grounding >= 6  (avoid hallucinations)
```

Per server:
```
Pass rate = passed_tasks / total_tasks

Pass if:
  pass_rate >= 0.7
  AND no critical failures (auth, data corruption)
```

Threshold 0.7 calibrated по MCP-Bench observations: best models achieve ~0.85, mid-tier ~0.7, weak ~0.5.

### 5.7 Failure handling

```
Pass rate >= 0.85 → "Excellent" badge in Quality Report
0.70 ≤ pass rate < 0.85 → "Good" pass
0.50 ≤ pass rate < 0.70 → "Marginal" — analyze failures, retry specific passes
< 0.50 → "Poor" — surface critical issues to user, suggest manual review
```

Failure analysis maps to passes:

| Failure pattern | Likely root cause | Retry pass |
|---|---|---|
| Agent confuses search vs list_objects | Description ambiguity | Pass 2 |
| Agent passes wrong parameter format | Parameter docs unclear | Pass 3 |
| Agent doesn't realize tool is destructive | Annotations missing/wrong | Pass 4 |
| Agent gets confused after truncation | Bad guidance message | Pass 5 |
| Agent can't auth | Auth code wrong | Stage E |
| Agent hallucinates result | Output schema not enforced | Pass 5 + Stage E |
| Agent loops endlessly | Tool description doesn't terminate | Pass 2 |

### 5.8 Cost & latency

Per server eval:
- 10 golden tasks × ~10 LLM calls per task (Sonnet 4.7) = 100 calls
- Average $0.01 per call (multi-step)
- Plus 100 calls × 3 judges = 300 judge calls × $0.005 = $1.50
- **Total: ~$2-3 per server eval**
- Latency: 1-3 minutes (tasks parallel)

### 5.9 When F3 runs

**Always:**
- New API spec first generation (one-time cost)
- Major spec changes detected (drift > 30% endpoints changed)

**On user opt-in:**
- Free tier: 1 eval per month
- Pro tier: 5 evals per month included; $0.50/extra
- Enterprise: unlimited

**Auto-triggered:**
- F2 score < 4.0 → automatic F3 to confirm not false positive

---

## 6. Pipeline

```
┌─────────────────────────────────────────────────┐
│  Stage E output: generated server files         │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  F1: Static Validation                          │
│  - TS compilation                               │
│  - JSON Schema valid                            │
│  - MCP protocol checks                          │
│  - Secret scan                                  │
│                                                  │
│  Cost: $0, time: 5-10s                          │
└─────────────────────┬───────────────────────────┘
                      │ pass
                      ▼
┌─────────────────────────────────────────────────┐
│  F2: Smell Scan                                 │
│  - 3 multi-family judges (Sonnet/GPT-5/Gemini)  │
│  - 6-component rubric per tool                  │
│  - Prompt shuffling + averaging                 │
│                                                  │
│  Cost: $0.20-0.50, time: 20-30s                 │
└─────────────────────┬───────────────────────────┘
                      │ score ≥ 4.0 OR F3 opted-in
                      ▼
┌─────────────────────────────────────────────────┐
│  F3: Agent Evaluation (conditional)             │
│  - Deploy to ephemeral sandbox Worker           │
│  - Run agent against golden tasks               │
│  - Two-tier eval: rules + LLM judges            │
│  - Pass rate calculation                        │
│                                                  │
│  Cost: $1-3, time: 1-3min                       │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  Quality Report Generation                      │
│  - Aggregate F1/F2/F3 results                   │
│  - Per-tool scores                              │
│  - Recommendations                              │
│  - Public badge eligibility                     │
└─────────────────────┬───────────────────────────┘
                      ▼
                 Return to user
```

---

## 7. Input/Output

### 7.1 Input

```python
class StageFInput(BaseModel):
    generated_server: GeneratedServer  # from Stage E
    server_metadata: ServerMetadata
    f3_enabled: bool                    # opt-in flag
    f3_user_tasks: list[GoldenTask] | None  # Pro feature: user-provided tasks
    sandbox_credentials: dict | None    # для real-API testing
```

### 7.2 Output

```python
class StageFOutput(BaseModel):
    f1_result: F1Result
    f2_result: F2Result
    f3_result: F3Result | None  # null if not run
    overall_quality_score: float  # 0-100 composite
    quality_badge: Literal["premium", "verified", "standard", "needs_review"]
    recommendations: list[str]
    retry_triggers: list[RetryTrigger]  # which passes need retry
    deployment_blocked: bool  # only if critical failure

class F1Result(BaseModel):
    passed: bool
    failed_checks: list[str]
    typescript_errors: list[str]
    
class F2Result(BaseModel):
    overall_score: float
    component_scores: dict[str, float]
    per_tool_scores: dict[str, ToolScore]
    below_threshold_tools: list[str]
    
class F3Result(BaseModel):
    passed: bool
    pass_rate: float
    task_results: list[TaskResult]
    failure_analysis: FailureAnalysis
    
class RetryTrigger(BaseModel):
    pass_to_retry: Literal["Pass 0", "Pass 1", "Pass 2", "Pass 3", "Pass 4", "Pass 5", "Stage E"]
    rationale: str
    affected_tools: list[str]
```

---

## 8. Retry orchestration

Stage F failures могут trigger targeted retries в specific upstream passes. Maximum 2 retry rounds per generation, otherwise terminal failure.

### 8.1 Retry decision matrix

```python
def determine_retries(stage_f_result: StageFOutput) -> list[RetryTrigger]:
    triggers = []
    
    # F1 failures → fix immediately
    if not stage_f_result.f1_result.passed:
        for failed_check in stage_f_result.f1_result.failed_checks:
            pass_to_retry = MAP_F1_CHECK_TO_PASS[failed_check]
            triggers.append(RetryTrigger(pass=pass_to_retry, ...))
    
    # F2 failures → retry author passes
    if stage_f_result.f2_result.overall_score < 4.0:
        for tool, score in stage_f_result.f2_result.per_tool_scores.items():
            if score.purpose < 3 or score.guidelines < 3:
                triggers.append(RetryTrigger(pass="Pass 2", affected_tools=[tool]))
            if score.parameter_explanation < 3:
                triggers.append(RetryTrigger(pass="Pass 3", affected_tools=[tool]))
    
    # F3 failures → analyze pattern
    if stage_f_result.f3_result and stage_f_result.f3_result.pass_rate < 0.7:
        for failure in stage_f_result.f3_result.failure_analysis.patterns:
            triggers.append(map_failure_to_retry(failure))
    
    return triggers
```

### 8.2 Targeted retry execution

When retry triggered:
1. Skip preceding passes (their outputs cached)
2. Re-run only specified pass с feedback context
3. Cascade re-run of subsequent passes (if Pass 2 changes, Stage E must re-run)
4. Re-run Stage F to verify improvement

This is significantly cheaper than full regeneration (~5x).

### 8.3 Retry budget

- Max 2 retry rounds per generation
- After 2 retries fail — terminal failure mode:
  - Generated server still deployed (degraded mode)
  - Quality Report shows specific concerns
  - User can manually edit или regenerate с different settings

---

## 9. Quality Report generation

Quality Report — primary user-facing output of Stage F.

### 9.1 Structure

```yaml
overall_quality_score: 87/100
quality_badge: verified
generation_time: 3m 12s
total_cost: $1.84

f1_static:
  status: passed
  checks_run: 18
  checks_passed: 18

f2_descriptions:
  overall_score: 4.3 / 5
  component_scores:
    purpose: 4.5
    guidelines: 4.2
    limitations: 4.1
    parameter_explanation: 4.6
    length_completeness: 4.5
    examples: 1.8 (expected — examples deferred)
  per_tool:
    search: 4.5
    fetch: 4.3
    list_objects: 4.4
    upsert: 4.0
    # ...

f3_agent_eval:
  pass_rate: 8/10 = 80%
  failed_tasks:
    - "Find duplicate customers and merge them" — agent looped
  successful_tasks:
    - "Find customer with email" ✓
    - "Create a charge for $50" ✓
    # ...

recommendations:
  - Examples will be added in v1.1 (sandbox feature)
  - Consider regenerating with target_complexity='comprehensive' for richer 
    descriptions if your agents are advanced

deploy_recommendation: ready
```

### 9.2 Quality badge thresholds

```
premium (90-100):  F1 pass + F2 ≥ 4.5 + F3 pass rate ≥ 0.85
verified (75-90):  F1 pass + F2 ≥ 4.0 + F3 pass rate ≥ 0.7
standard (60-75):  F1 pass + F2 ≥ 3.5 + (F3 not run OR pass rate ≥ 0.5)
needs_review (<60): Any F1 failure OR F2 < 3.5
```

Badges displayed на server's public page (если user opted-in to public visibility).

---

## 10. Edge cases

**E1. F3 sandbox credentials missing.**
Fall back to mocked upstream. Add disclaimer: "Validated against mocked upstream."

**E2. F3 test agent fails to install MCP server (transport error).**
Likely Stage E codegen issue. Retry Stage E с specific error.

**E3. Generated server has 0 tools (extreme filtering от Pass 0).**
F1 fails with "no tools to validate". Surface immediately, suggest target_complexity='comprehensive'.

**E4. F2 judges всегда disagree (high variance).**
Indicates ambiguous descriptions. Include в recommendations: "Tool descriptions ambiguous, agents may struggle. Consider regenerating."

**E5. F3 agent hits rate limit on upstream.**
Wait + retry. If hits same limit twice, mark sandbox as exhausted, fall back to mocked.

**E6. User-provided golden tasks contain mistakes.**
Don't fail — run them, surface in report что tasks failed (could be tasks themselves wrong, not server).

**E7. Generated server requires OAuth that we can't auto-complete in F3.**
Use stored test credentials from sandbox infrastructure. If unavailable — skip F3 для that tool category, note в report.

**E8. Spec updated в production, F3 fails because expected behavior changed.**
This is correct! Catches drift between spec and actual API. Surface as "API behavior changed, server may need regeneration."

**E9. Retry budget exhausted, quality still poor.**
Surface terminal failure. User decides: deploy degraded, manual edit, или change generation settings.

**E10. F3 LLM judges hit limits.**
Fallback: 1 judge instead of 3. Note reduced confidence в report.

---

## 11. Cost & latency

For typical server (10 tools):

| Stage | Cost (no F3) | Cost (with F3) | Latency |
|---|---|---|---|
| F1 | $0 | $0 | 5-10s |
| F2 (3 judges) | $0.20-0.50 | $0.20-0.50 | 20-30s |
| F3 (10 tasks) | — | $1-3 | 1-3min |
| **Total** | **~$0.20-0.50** | **~$1.20-3.50** | **30s-3min** |

Free tier: 1 F3 eval per month included. Beyond — $0.50 per eval (we charge to cover costs + margin).

---

## 12. Golden eval set (validation of Stage F itself)

Минимум 5 cases для testing Stage F's own logic:

### G1: Stripe MCP с известным quality score
Pre-validated by humans. Stage F should reproduce within ±0.3 of human score.

### G2: Intentionally bad MCP server (contrived poor descriptions)
Stage F should catch issues, F2 score should be < 3.

### G3: MCP server requiring OAuth
Verify F3 OAuth flow works в test environment.

### G4: MCP server с deliberate routing bug
F1 should catch routing inconsistency. F3 should produce specific failure.

### G5: Edge cases (тесты на tier 1: 0 tools, broken JSON, etc.)
F1 fail-safe behavior.

---

## 13. Что Stage F НЕ делает

- НЕ deploys server в production (separate Control Plane action)
- НЕ runs continuously after deploy (separate monitoring)
- НЕ generates marketing copy or screenshots (Quality Report only)
- НЕ tests against ALL possible user inputs (golden tasks = representative subset)

Stage F = pre-deploy quality gate.

---

## 14. Открытые вопросы

❓ **F3 cost reduction strategies.** $1-3 per eval may be expensive at scale. **Options:**
- Cheaper test agent (Haiku 4.5 instead of Sonnet 4.7) — risk lower realism
- Fewer golden tasks (5 instead of 10) — risk reduced coverage
- Mock more aggressively — risk losing real-API issues
**Decision для MVP:** keep Sonnet 4.7, 10 tasks. Optimize post-launch with production data.

❓ **Real vs mocked upstream balance.** Top 10 APIs real, rest mocked. Boundary будет shifting. **Strategy:** track which mocked APIs frequently regenerated (signal real-world issues), prioritize them for sandbox setup.

❓ **F2 judge calibration drift.** LLM models update over time, judge behavior may shift. **Mitigation:** quarterly recalibration cycle с human evaluators (per MCP-Bench methodology). Budget — research time, not direct cost.

❓ **User-supplied golden tasks support.** Pro feature, but format guidance needed. **Decision:** publish JSON schema for tasks, with examples, в documentation. Validate user tasks before using.

❓ **F3 false positives — agent fails because spec wrong, not server wrong.** Hard to distinguish. **Mitigation:** F3 failures с specific patterns (e.g., agent reports "API returned 500") flagged as "may indicate spec drift" rather than server issue.

❓ **Quality badges and gaming.** Users may want premium badge → may game F2 (artificial good descriptions). **Decision:** include F3 в premium criteria — agent eval harder to game, requires actual quality.

❓ **Continuous validation post-deploy.** Stage F is pre-deploy. What about regression detection в production? **Decision:** post-deploy monitoring is separate concern, surfaces aggregate metrics. Stage F not re-run unless user requests.

---

## 15. Финальные decisions

1. ✅ **Three-tier validation** F1 (static) + F2 (smell scan) + F3 (agent eval)
2. ✅ **F1 + F2 always run**, F3 opt-in или triggered if F2 < 4.0
3. ✅ **3 multi-family judges + score averaging** для F2 (per MCP-Bench)
4. ✅ **Prompt shuffling** для stability
5. ✅ **6-component rubric от arXiv 2602.14878** (Examples expected to score low в v0)
6. ✅ **Hybrid F3 environment**: real sandbox для top 10 APIs, mocked для rest
7. ✅ **Sonnet 4.7 as primary test agent**, GPT-5 cross-check optional
8. ✅ **2-tier evaluator** для F3: rule-based + LLM judge (per MCP-Bench)
9. ✅ **Pass rate ≥ 0.7 threshold** для F3 (calibrated к MCP-Bench observations)
10. ✅ **Targeted retry orchestration** — F failures → specific upstream pass retries
11. ✅ **Max 2 retry rounds** per generation
12. ✅ **Quality badges** (premium/verified/standard/needs_review) от composite score
13. ✅ **Quarterly judge calibration** с human evaluators

---

## Appendix A — Failure pattern → retry mapping

```python
FAILURE_PATTERNS = {
    "agent_confuses_two_tools": {
        "indicator": "Agent calls tool A when B was correct, both seem applicable",
        "root_cause": "Description ambiguity",
        "retry": "Pass 2",
        "affected": "Both tools",
    },
    "agent_passes_wrong_format": {
        "indicator": "Schema validation fails on agent's args",
        "root_cause": "Parameter format docs unclear",
        "retry": "Pass 3",
        "affected": "Specific parameter",
    },
    "agent_hits_destructive_without_confirmation": {
        "indicator": "User reports unwanted deletion",
        "root_cause": "destructiveHint missing or wrong",
        "retry": "Pass 4",
    },
    "agent_loops_after_truncation": {
        "indicator": "Repeated tool calls with same args after truncation",
        "root_cause": "Truncation guidance not actionable",
        "retry": "Pass 5",
    },
    "agent_hallucinates_data": {
        "indicator": "Final answer contains data not in tool outputs",
        "root_cause": "Output schema not enforcing structure, agent makes up fields",
        "retry": "Pass 5 + Stage E",
    },
    "agent_fails_auth": {
        "indicator": "All tool calls return 401",
        "root_cause": "Auth middleware bug",
        "retry": "Stage E",
    },
    "agent_skips_required_step": {
        "indicator": "Calls fetch without searching first",
        "root_cause": "Tool sequence not communicated в descriptions",
        "retry": "Pass 2",
    },
}
```

---

## Appendix B — Sources

1. **MCP-Bench** — "Benchmarking Tool-Using LLM Agents with Complex Real-World Tasks via MCP Servers" (arXiv 2508.20453, Aug 2025)
   https://arxiv.org/abs/2508.20453
   GitHub: https://github.com/Accenture/mcp-bench
   Two-tier evaluation framework primary reference.

2. **MCP-AgentBench** — "Evaluating Real-World Language Agent Performance" (arXiv 2509.09734, Sept 2025)
   Outcome-oriented evaluation; pass rate methodology.

3. **arXiv 2602.14878** — "MCP Tool Descriptions Are Smelly!" 
   6-component rubric для F2.

4. **mcp-eval library** — Practical Python evaluation framework
   https://docs.mcp-agent.com/test-evaluate/server-evaluation
   API patterns adopted directly.

5. **Anthropic** — "Writing effective tools for agents" (Sept 2025)
   Eval methodology principles.

6. **MT-Bench / Chatbot Arena** — LLM-as-Judge methodology baseline
   Multi-judge averaging для stability.
