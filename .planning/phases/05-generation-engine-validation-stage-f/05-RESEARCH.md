# Phase 5: Generation Engine — Validation (Stage F) — Research

**Researched:** 2026-04-29
**Domain:** Three-tier MCP server validation (deterministic static checks + LLM smell scan + real-agent eval against golden tasks) — Python orchestration of subprocesses (`tsc`, `gitleaks`, `wrangler dev --local`), Anthropic Python SDK for the F3 test agent, mock MCP HTTP clients (Cursor / Claude Desktop older / ChatGPT Deep Research), targeted retry FSM with cascading L2 cache invalidation.
**Confidence:** HIGH

> Phase 5 is unusually well-specified. CONTEXT.md locks 54 decisions (D-01..D-54). This research delivers the IMPLEMENTATION-LEVEL surface the planner needs — library/API details, subprocess gotchas, drift to verify against current upstream state, and validation-of-validation architecture. Design redesign is out of scope.

---

## 1. Domain Overview

### 1.1 What Phase 5 produces

Phase 5 is the final LLM-bearing engine phase. It consumes the Phase-4 `StageEManifest` + `Pass5Output` + the on-disk generated CF Worker project and emits a `QualityReport` with the public `quality_badge ∈ {premium, verified, standard, needs_review}`. The badge IS the product differentiation per `<specifics>` D-final-thought.

End-to-end pipeline at Phase 5 entry:

```
StageE (Phase 4 done) → F1 static (~5–10s, $0)
                           ↓ pass
                      F2 smell scan (~20–30s, ~$0.015–0.05; single Qwen × 5-shuffle × 3-temp = 15 calls/tool)
                           ↓ ≥4.0 OR σ<0.4 OR --f3
                      F3 agent eval (~1–3min, ~$1–3; real Sonnet test agent vs golden tasks)
                           ↓
                      QualityReport + Badge
                           ↓
                      SSE: validation_complete event
```

Stage F failures map to specific upstream pass retries (max 2 rounds) with cascading L2 invalidation. After 2 rounds → terminal failure with `quality_badge=needs_review` + `warnings[]`.

### 1.2 What's locked vs discretion

**Locked by CONTEXT.md (D-01..D-54):**
- Module layout `stages/stage_f/` (D-04) with 11 F1 check modules.
- F2 = single Qwen3-Coder × 5-shuffle × 3-temperature = 15 calls/tool (D-09) — Override doc §4 supersedes Stage F design's 3 multi-family judges.
- F3 test agent uses real Sonnet via Anthropic Python SDK (D-02) — only documented exception. F3 LLM JUDGE stays on Qwen3-Coder.
- Between-tool σ ≥ 0.4 discrimination metric (D-12) — auto-triggers F3 if σ < 0.4.
- F1 fail-closed (D-07); F1 has NO L2 cache (D-32); F3 has NO L2 cache.
- Mock clients run BEFORE F3 agent harness, parallel verifications (D-21).
- Composite quality formula `0.10·F1 + 0.40·(F2/5) + 0.50·F3.pass_rate` (D-28).
- Hybrid F3 environment: real sandbox for top-10 APIs, mocked for rest (D-22).
- Retry FSM with explicit transitions + max-2-rounds (D-24, D-27); cascading L2 invalidation (D-26).
- All thresholds from `LAUNCH_CRITERIA` constants — NEVER hardcoded (D-08, D-15, D-44).

**Claude's discretion (D-05/D-13/D-22 closing notes + the discretion block):**
- `f1_checks/` modules: one file per category (recommended) vs single multi-class file.
- `gitleaks` invocation: subprocess (recommended) vs Python wrapper.
- Retry FSM: explicit state-variable + match-statement (recommended) vs `transitions` library.
- F3 server runner: shared `wrangler dev` subprocess for all 10 tasks (recommended) vs per-task spawn.
- Mock clients: thin Python httpx clients (recommended) vs full TS subprocess.
- `tsc` + `ajv` + `eslint` execution: sequential (recommended) vs parallel.
- `mock_upstream.py`: hand-rolled Python lib (recommended) vs WireMock/mountebank wrapper.
- Anthropic SDK retry: SDK built-in (recommended) plus `tenacity` defense-in-depth.
- F2/F3 retry budget: shared per-generation counter (recommended) vs separate.

---

## 2. Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **GEN-09** | F1 Static: tsc + ajv + ESLint + bundle-size + MCP compliance + secret scan; each failed check maps to a specific upstream-pass retry | §3 (F1 implementation), §6 (drift), §8.1 mappings |
| **GEN-10** | F2 Smell scan: single Qwen × 5-shuffle × 3-temperature; threshold ≥ 4.0; per-component failures trigger targeted retries (max 2 rounds) | §4 (F2), §6.5 (numpy std), §8.2 |
| **GEN-11** | F3 Agent Eval: real Sonnet against golden tasks (top-10 real sandbox + mocked rest); two-tier evaluator; pass criterion ≥ 0.7 | §5 (F3), §6.1 (Anthropic SDK), §6.3 (wrangler subprocess), §6.7 (mock clients) |

---

## 3. Implementation Approach — F1 Static Validation

### 3.1 Pipeline order (CONTEXT D-05 cheapest-first)

The 11 checks run sequentially, abort early on hard failures. This minimizes wasted subprocess work:

```
1. bundle_size       <0.1s  $0    [VERIFIED]  read StageEManifest.bundle_size_kb (Phase 4 D-28)
2. template_artifacts <0.5s  $0   [VERIFIED]  glob+regex `\{\{|\}\}` over **/*.ts
3. smart_id_fuzz     <1s    $0    [VERIFIED]  synthesize 2 tenant ids; assert cross-tenant rejection
4. mcp_compliance    <1s    $0    [VERIFIED]  4 annotations + openWorldHint=true + protocolVersion + tools/list serializable
5. routing_completeness <1s $0    [VERIFIED]  Pass1Output.routing.rules covers every endpoint
6. auth_middleware   <0.1s  $0    [VERIFIED]  grep `hostHeaderValidation` first in middleware.ts
7. openai_compliance <0.5s  $0    [VERIFIED]  deep-equal canonical search/fetch fixture vs FinalTool.inputSchema
8. examples_provenance <1s  $0    [VERIFIED]  substring-match Pass2Output.tools[*].description.examples vs RawIR examples
9. secret_scan       ~2s    $0    [VERIFIED]  gitleaks subprocess with --no-git --redact
10. json_schema      ~1s    $0    [VERIFIED]  jsonschema lib against MCP 2025-06-18 official schema
11. ts_compile       ~3–5s  $0    [VERIFIED]  npx tsc --noEmit using Phase 4 D-39 pre-warmed node_modules
```

### 3.2 Subprocess invocation pattern

Reuse the existing engine subprocess pattern from Phase 4 (`stages/stage_e/validation.py` runs `tsc --noEmit` already). Phase 5 F1 extends with `gitleaks` and JSON-Schema validation:

```python
# f1_checks/ts_compile.py
import asyncio
from pathlib import Path

async def run_tsc(generated_dir: Path, timeout_seconds: float = 30.0) -> TsCompileResult:
    """Invoke tsc --noEmit using pre-warmed node_modules.

    Phase 4 D-39 pre-warmed `packages/codegen-templates/node_modules/`.
    The generated project's package.json points at workspace deps —
    `npx tsc` resolves through pnpm workspace symlinks.
    Capture first 50 errors only (D-05 step 11).
    """
    proc = await asyncio.create_subprocess_exec(
        "npx", "tsc", "--noEmit", "-p", "tsconfig.json",
        cwd=str(generated_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise F1Error("TS_COMPILE_TIMEOUT") from None
    # Parse first 50 errors. Format: "src/foo.ts(12,4): error TS2322: Type 'X' is not assignable to type 'Y'."
    errors = parse_tsc_output(stdout.decode())[:50]
    return TsCompileResult(passed=proc.returncode == 0, errors=errors)
```

`tsc` error format `<path>(<line>,<col>): error <code>: <message>` is parseable with a single regex. Common codes the planner should be aware of for retry-feedback context: TS2322 (assignment), TS2345 (argument), TS6133 (unused), TS2304 (cannot find name — usually template missing import), TS2769 (no overload matches — usually Zod schema mismatch).

### 3.3 gitleaks subprocess (D-05 step 9)

```python
# f1_checks/secret_scan.py
import asyncio, json
from pathlib import Path

async def run_gitleaks(generated_dir: Path) -> SecretScanResult:
    """gitleaks 8.x detect --no-git --redact, JSON output for parsing.

    --no-git: scan files in-place (no .git history); generated dir is fresh.
    --redact: replace secret values in output; never log raw secrets.
    --report-format json --report-path -: stream JSON to stdout.
    """
    proc = await asyncio.create_subprocess_exec(
        "gitleaks", "detect",
        "--source", str(generated_dir),
        "--no-git",
        "--redact",
        "--report-format", "json",
        "--report-path", "/dev/stdout",
        "--exit-code", "0",  # never exit non-zero; we read JSON instead
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    findings = json.loads(stdout) if stdout.strip() else []
    return SecretScanResult(passed=len(findings) == 0, findings=findings)
```

**[VERIFIED: gitleaks 8.30.1 stable on macos-arm64 via `brew install gitleaks`; npm view confirms no PyPI wrapper available]** Default rules already cover: AWS keys, GitHub PATs (`ghp_`), Stripe live keys (`sk_live_`), generic high-entropy strings, JWT tokens, Slack tokens, Twilio credentials. **No custom rules needed for MVP** — defaults catch everything in CONTEXT.md's threat model.

**CI:** `gitleaks/action@v2` GitHub Action runs at commit time (Phase 1 D-12 pre-commit hook). Phase 5 invokes the binary at runtime against generated code in CF Worker project — separate concerns.

### 3.4 JSON Schema validation (D-05 step 10)

```python
# f1_checks/json_schema.py
import json
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError, FormatChecker

# Pinned in packages/engine-fixtures/_canonical/mcp-schema.json (Phase 5 hand-creates).
# MCP spec 2025-06-18: https://github.com/modelcontextprotocol/specification/tree/main/schema/2025-06-18
MCP_TOOL_SCHEMA = json.loads((Path(__file__).parent / "_canonical/mcp-schema.json").read_text())

def validate_tool_schemas(final_tools: list[FinalTool]) -> list[JsonSchemaError]:
    """Validate every tool's inputSchema + outputSchema against MCP 2025-06-18.

    Phase 4 D-26 ships dual outputSchema (Zod-derived + conservative-format
    fallback per Pitfall #33). Phase 5 validates BOTH paths.
    """
    errors: list[JsonSchemaError] = []
    validator = Draft202012Validator(MCP_TOOL_SCHEMA, format_checker=FormatChecker())
    for tool in final_tools:
        for kind, schema in [("inputSchema", tool.inputSchema), ("outputSchema", tool.outputSchema)]:
            for err in validator.iter_errors(schema):
                errors.append(JsonSchemaError(tool=tool.name, kind=kind, path=list(err.path), msg=err.message))
    return errors
```

**[VERIFIED: jsonschema 4.26 already in `apps/generation-engine/pyproject.toml` (Phase 1 dep)].** Use `Draft202012Validator` (MCP 2025-06-18 canonicalizes on Draft 2020-12). `FormatChecker()` activates `format: "date-time"` / `"uri"` / `"email"` runtime validation — relevant to Pitfall #33 dual-schema testing. Performance: ~0.1ms per schema for 10 tools × 2 schemas = sub-second total.

**Schema bundle pinning:** Hand-create `packages/engine-fixtures/_canonical/mcp-schema.json` from the MCP spec repo's `schema/2025-06-18/schema.json`. Pin commit SHA in a sibling `mcp-schema.SOURCE.md`. Phase 5 plan should include an integration test that re-fetches the canonical schema once per quarter and diffs (out-of-MVP automation; manual ritual is enough).

### 3.5 OpenAI compliance fixture (D-05 step 7, Pitfall #32)

Hand-author `packages/engine-fixtures/_canonical/search_signature.json`:

```json
{
  "type": "object",
  "properties": { "query": { "type": "string" } },
  "required": ["query"],
  "additionalProperties": false
}
```

Same for `fetch_signature.json` with `id: string`. F1 `openai_compliance` check does **deep-equal** (not subset-match) against `FinalTool[search].inputSchema` — any drift fails. Diff message must include the offending key path so the retry mapping (D-25 row "wrong format") points to Pass 1 OR Pass 3.

### 3.6 Smart-ID cross-tenant fuzz (D-05 step 3, Pitfall #1)

```python
# f1_checks/smart_id_fuzz.py
async def smart_id_fuzz(generated_dir: Path, smart_id_schema: SmartIdSchema) -> SmartIdFuzzResult:
    """Verify that the generated runtime/smart_id.ts rejects cross-tenant IDs.

    Synthesize 2 tenants from the same spec: tenant_a + tenant_b.
    The format is `{tenant_short_id}-{spec_slug}:{type}:{collection}:{id}`.
    Construct a tenant_b ID, invoke the parser via `node -e "..."` against
    runtime/smart_id.ts mocked with tenant_a's expected prefix; assert rejection.
    """
```

Implementation note: Phase 5 spawns `node -e` to invoke compiled smart_id.ts directly. Alternative cleaner approach: **port a minimal smart-ID parser to Python** that mirrors the TS regex. This avoids node-bridge complexity and keeps F1 pure-Python. Recommendation: port to Python (Pass 1's `SmartIdSchema` already encodes the regex pattern; replicating in Python is ~10 lines).

---

## 4. Implementation Approach — F2 Smell Scan

### 4.1 15-call iteration (D-09)

```python
# stages/stage_f/f2_smell.py
import asyncio
import random
from typing import Sequence
from pydantic import BaseModel
from pydantic_ai import Agent
import numpy as np

from mcpgen_engine.llm.agent_factory import make_agent
from mcpgen_engine.llm.sampling import (
    F2_JUDGE_SETTINGS_T00,
    F2_JUDGE_SETTINGS_T02,
    F2_JUDGE_SETTINGS_T05,
)

JUDGE_AGENT = make_agent(output_type=RubricScore, system_prompt=F2_JUDGE_PROMPT)
TEMPERATURES = [F2_JUDGE_SETTINGS_T00, F2_JUDGE_SETTINGS_T02, F2_JUDGE_SETTINGS_T05]

async def score_one_tool(tool: FinalTool) -> ToolScore:
    """5 shuffles × 3 temperatures = 15 calls per tool."""
    scores: list[RubricScore] = []
    for shuffle_idx in range(5):
        prompt = build_judge_prompt(tool, shuffle_seed=shuffle_idx)
        for settings in TEMPERATURES:
            result = await JUDGE_AGENT.run(prompt, model_settings=settings)
            scores.append(result.output)
    return aggregate(tool.name, scores)


async def run_f2(final_tools: Sequence[FinalTool]) -> F2Smell:
    sem = asyncio.Semaphore(10)  # tool-level concurrency
    async def bounded(t: FinalTool) -> ToolScore:
        async with sem:
            return await score_one_tool(t)
    tool_scores = await asyncio.gather(*[bounded(t) for t in final_tools])
    overall = float(np.mean([t.average for t in tool_scores]))
    sigma = float(np.std([t.average for t in tool_scores], ddof=0))  # population stdev
    low_confidence = sigma < 0.4
    passed = overall >= LAUNCH_CRITERIA["F2_SMELL_MIN"]  # imported, never hardcoded
    return F2Smell(tool_scores=tool_scores, overall_average=overall, passed=passed, ...)
```

**Concurrency:** `asyncio.Semaphore(10)` matches Phase 2/3/4 patterns (`apps/generation-engine/src/mcpgen_engine/passes/pass_3/llm_enrichment.py` uses Semaphore(20); Pass 2 uses Semaphore(10)). 10 is the OpenRouter-AtlasCloud comfortable rate; raising to 20 hits 429s observable in Phase 3 testing.

**Wall-clock target:** 10 tools × 15 calls / 10 concurrency = 15 sequential batches, ~1–2s per call → ~20–30s total. [VERIFIED: Phase 3 inline-gate Qwen calls average ~1.5s for similar 1024-token output budgets.]

### 4.2 Prompt shuffling (D-11)

```python
# stages/stage_f/rubric.py
import random

COMPONENTS = ["purpose", "guidelines", "limitations", "parameter_explanation", "length_completeness", "examples"]

def shuffle_rubric_components(tool: FinalTool, shuffle_seed: int) -> str:
    """Deterministic seed-based shuffle of rubric component order in the prompt body."""
    rng = random.Random(shuffle_seed)
    order = list(COMPONENTS)
    rng.shuffle(order)
    return render_prompt(tool, component_order=order)
```

Use `random.Random(seed)` (NOT `numpy.random.RandomState` — overkill for 5 shuffles and adds numpy-version reproducibility risk). Test: shuffle seeds 0..4 produce 5 distinct orderings. Recommendation: golden-test the 5 orderings as fixtures so future Python version bumps don't silently change shuffle order.

### 4.3 Score aggregation (D-09)

Per-component aggregation across 15 evaluations is **mean** (not median, not max-of-shuffles). Rationale: rubric scores are integers 1–5 — small sample, integer ratings → mean preserves discrimination. Outliers (single judge giving Purpose=1 when other 14 say 4) are unlikely with deterministic temperature 0.0 dominating the mix; if observed in production calibration, switch to trimmed mean. **Out of MVP — log raw scores to Langfuse for post-hoc analysis.**

```python
def aggregate(tool_name: str, scores: list[RubricScore]) -> ToolScore:
    components = []
    for comp in COMPONENTS:
        component_avg = float(np.mean([getattr(s, comp) for s in scores]))
        components.append(Component(component=comp, score=component_avg))
    avg = float(np.mean([c.score for c in components]))
    return ToolScore(tool_name=tool_name, components=components, average=avg)
```

### 4.4 σ ≥ 0.4 discrimination metric (D-12, Pitfall #9)

```python
sigma = float(np.std([t.average for t in tool_scores], ddof=0))  # population stdev (ddof=0)
```

**Population vs sample stdev:** Use `ddof=0` (population) — we're describing the dispersion of THIS server's tools, not estimating from a sample. With N=6..12 tools, sample stdev (`ddof=1`) would scale by `sqrt(N/(N-1))` ≈ 1.05–1.10 — close enough that the threshold could go either way, but population is the philosophically-correct choice for "this server's tools have collapsed/discriminated." Document the choice in a code comment to prevent future drift.

**Threshold rationale:** 0.4 was chosen in CONTEXT.md from the Pitfall #9 prevention. With rubric range 1–5 (max possible σ ≈ 2.0 for half tools=1, half=5), σ < 0.4 means tools cluster within a 0.8-wide band — agent-perceptible quality differences are below the noise floor. Phase 5 plan should include a calibration test on the 5 fixtures to confirm typical σ values are 0.5–1.0.

When σ < 0.4 → set `low_confidence_run=true` → **force-trigger F3 even on free tier** (D-12 + D-17). This is the safety net.

### 4.5 F2 retry orchestration (D-14)

Per-component < 3 OR overall < 4.0 → build retry-trigger list per D-13 mapping (Purpose/Guidelines/Limitations/Length → Pass 2; Parameter Explanation → Pass 3; Examples → no retry, deferred to v1.1). Cascade L2 invalidation per D-26. The retry prompt in Pass 2 must include the F2 judge's `reasoning` field (D-10) as anti-pattern context — "Previous Purpose score was 2 because [reason]; rewrite to address X."

**Examples never trigger retry** — Phase 5 expects them to score 1–2 in v0 (deferred to v1.1 sandbox-derived examples).

---

## 5. Implementation Approach — F3 Agent Eval

### 5.1 Test agent harness (D-19)

```python
# stages/stage_f/test_agent_harness.py
import os
from anthropic import AsyncAnthropic
from anthropic.types import MessageParam, ToolUseBlock, TextBlock

# D-02: separate Anthropic client (NOT make_agent / OpenRouter); the F3
# test agent is the documented exception per Override doc §7.3.
ANTHROPIC = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

async def run_golden_task(task: GoldenTask, server_url: str, mcp_tools: list[McpToolDef]) -> TaskTrajectory:
    """Multi-turn agent loop. The agent sees MCP tools as Anthropic tools.

    [CITED: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview]
    Loop pattern: client.messages.create → response.stop_reason → if "tool_use",
    execute tool against MCP server, append tool_result to messages, loop.
    """
    messages: list[MessageParam] = [{"role": "user", "content": task.prompt}]
    trajectory: list[TrajectoryStep] = []
    for turn in range(task.max_iterations):
        resp = await ANTHROPIC.messages.create(
            model="claude-sonnet-4-5-20250929",  # see §6.1 — pinned snapshot
            max_tokens=4096,
            temperature=0.7,
            tools=[mcp_tool_to_anthropic(t) for t in mcp_tools],
            messages=messages,
        )
        trajectory.append(record_step(resp))
        if resp.stop_reason == "end_turn":
            return TaskTrajectory(steps=trajectory, final=extract_text(resp), terminated="end_turn")
        if resp.stop_reason == "tool_use":
            # Execute every tool_use block against the MCP server via httpx
            tool_results = await execute_mcp_tools(resp.content, server_url)
            messages.append({"role": "assistant", "content": resp.content})
            messages.append({"role": "user", "content": tool_results})
            continue
        # Unexpected stop reason → record and break
        return TaskTrajectory(steps=trajectory, final=None, terminated=resp.stop_reason)
    return TaskTrajectory(steps=trajectory, final=None, terminated="max_iterations")
```

**Critical anchor:** Anthropic's tool-use loop is driven by `response.stop_reason`. The values are `"end_turn"` (final answer), `"tool_use"` (execute tool, continue), `"max_tokens"` (truncated), `"pause_turn"` (server-side tool — won't apply to MCP HTTP-call setup), `"stop_sequence"` (rare). [CITED: docs.anthropic.com/agents-and-tools/tool-use]

### 5.2 Anthropic SDK version pin (drift)

[VERIFIED: 2026-04-29 PyPI shows latest stable `anthropic==0.97.0`; engine has 0.89.0 installed (likely transitive from another package — confirm).] Phase 5 pins to `anthropic>=0.96.0,<1.0` in `pyproject.toml`. Major-version bumps are breaking; pin loosely within 0.x line.

**SDK API surface for F3:**
- `AsyncAnthropic(api_key=...)` — async client
- `client.messages.create(...)` — single-turn message
- `client.beta.messages.tool_runner(...)` — built-in tool-use iterator (introduced ~0.50, current ~0.97). **Recommendation: use raw `messages.create` loop** for explicit trajectory recording — Phase 5 needs full control to capture per-step request/response detail for `f3_trajectories/<spec>-<task>.json` (D-40).

**Rate-limit handling:** [CITED: anthropic-sdk-python README] The SDK has built-in retry on 429/500-class errors with exponential backoff; configure via `AsyncAnthropic(max_retries=2)`. **Add `tenacity` defense-in-depth** at the per-task level (D-discretion) — outer retry around `run_golden_task` with `tenacity.retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=10), retry=retry_if_exception_type((APIStatusError, RateLimitError)))`.

**Cost target:** `claude-sonnet-4-5` is $3/M input + $15/M output. Per-task budget: ~30K input (system prompt + tool defs + accumulating trajectory) + ~5K output × 10 turns avg = $0.09–0.15/task × 10 tasks/server = **$0.90–1.50/server** [VERIFIED: matches CONTEXT D-44 target $1–3].

### 5.3 MCP tool → Anthropic tool format

```python
def mcp_tool_to_anthropic(mcp_tool: FinalTool) -> dict:
    """Anthropic tool format requires {name, description, input_schema}.
    MCP FinalTool already has inputSchema (JSON Schema dict).
    Description: render full Pass2 description as a single string."""
    return {
        "name": mcp_tool.name,
        "description": render_description_for_agent(mcp_tool.description),
        "input_schema": mcp_tool.inputSchema,
    }
```

**Note:** Anthropic's tool format is `input_schema` (snake_case); MCP's is `inputSchema` (camelCase). Mapping is mechanical.

### 5.4 wrangler dev --local subprocess (D-18)

```python
# stages/stage_f/server_runner.py
import asyncio
import socket
import contextlib
from pathlib import Path

def find_free_port() -> int:
    """[CITED: stackoverflow.com/q/1365265 — stdlib idiom]"""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

@contextlib.asynccontextmanager
async def spawn_server(generated_dir: Path) -> AsyncIterator[str]:
    """Spawn `wrangler dev --local --port {N}` subprocess.
    Wrangler 4.x --local uses Miniflare emulation (no real CF deploy).

    Yields http://127.0.0.1:{port}. Cleanup on exit.
    """
    port = find_free_port()
    env = {
        **os.environ,
        "MCPGEN_F3_TEST": "1",  # bypass DNS-rebinding hostHeaderValidation (D-18)
    }
    proc = await asyncio.create_subprocess_exec(
        "npx", "wrangler", "dev",
        "--local",
        "--port", str(port),
        "--ip", "127.0.0.1",
        cwd=str(generated_dir),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    server_url = f"http://127.0.0.1:{port}"
    # Wait for server to become reachable (poll /health or fall back to /).
    await wait_until_ready(server_url, timeout_seconds=30)
    try:
        yield server_url
    finally:
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
```

**[VERIFIED: wrangler 4.86.0 (latest stable 2026-04-29 per `npm view wrangler version`); `packages/codegen-templates/package.json` pins `^4.85.0` already.]**

**Subprocess gotchas (real, observable in production):**

1. **Cleanup propagation:** `wrangler dev` is a Node.js process that spawns child Miniflare workers. `proc.terminate()` (SIGTERM) on the parent **does NOT always cascade** — Node's signal-handling vs subprocess cleanup is racy. Mitigation: use process-group kill on POSIX (`os.killpg(os.getpgid(proc.pid), signal.SIGTERM)` after `subprocess.Popen(start_new_session=True)`); or use `psutil.Process(proc.pid).children(recursive=True)` to find and kill orphans before exiting context manager. **Recommendation: ship process-group kill from Day 1; Phase 9 audit catches orphans.**

2. **Startup latency:** Cold `wrangler dev --local` startup is ~5–15s on M1 (verified during Phase 4 04-13). With Phase 4 D-39 pre-warmed `node_modules`, drops to ~3–5s. **Decision (D-discretion): shared subprocess for all 10 tasks.** Spawn ONCE per F3 invocation; reuse across all golden tasks; teardown at end. Saves ~1 minute total.

3. **Port collisions:** `socket.bind(('', 0))` returns a port that COULD be claimed by something else between bind/release and subprocess start. Mitigation: hold the bound socket open until subprocess is up. Pattern:
   ```python
   sock = socket.socket()
   sock.bind(("127.0.0.1", 0))
   port = sock.getsockname()[1]
   # spawn subprocess
   sock.close()  # release just before subprocess listens
   ```
   In practice the race window is <100ms and unlikely on a single dev machine; CI risk is real. **Recommendation: accept retry-on-port-conflict (3 attempts) as the simple solution.**

4. **DNS-rebinding bypass flag (D-18):** Stage E's `auth/middleware.ts` reads `process.env.MCPGEN_F3_TEST === "1"` and skips `hostHeaderValidation` when set. Phase 5 server runner sets it ONLY in the `wrangler dev` subprocess `env`. Production tenant Workers never see this var (CF Workers `env` is per-deployment; not inherited from a shared system env). **Phase 4 must ship the middleware bypass — verify via a Phase-5 first-task: `grep -n MCPGEN_F3_TEST packages/codegen-templates/templates/auth/middleware.ts.j2`.**

5. **Health check:** `wrangler dev` does NOT expose a `/health` endpoint by default. Generated Workers don't either. Use `tools/list` JSON-RPC POST as the readiness probe — first 200 response means MCP transport is up.

### 5.5 MCP HTTP wire format (for mock clients + tool execution)

[CITED: modelcontextprotocol.io/specification/2025-03-26/basic/transports — Streamable HTTP transport]

The wire format is **JSON-RPC 2.0 over HTTP POST** to a single endpoint (CF Workers handler `/`). Example:

**Initialize:**
```python
import httpx
async with httpx.AsyncClient(timeout=30.0) as client:
    init_body = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",  # or "2024-11-05" for older client mock
            "capabilities": {},
            "clientInfo": {"name": "f3-test-harness", "version": "0.1.0"},
        },
    }
    resp = await client.post(server_url, json=init_body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    })
    init_result = resp.json()  # JSON-RPC envelope
    session_id = resp.headers.get("Mcp-Session-Id")  # optional; server may omit
```

**Tools/list:**
```python
list_body = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
resp = await client.post(server_url, json=list_body, headers={
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    **({"Mcp-Session-Id": session_id} if session_id else {}),
})
tools = resp.json()["result"]["tools"]
```

**Tools/call:**
```python
call_body = {
    "jsonrpc": "2.0", "id": 3, "method": "tools/call",
    "params": {"name": "search", "arguments": {"query": "test"}},
}
resp = await client.post(server_url, json=call_body, headers={...})
content_blocks = resp.json()["result"]["content"]
structured = resp.json()["result"].get("structuredContent")  # MCP 2025-06-18
```

**Older protocol behavior (`protocolVersion: "2024-11-05"`):** Server should NOT include `outputSchema` in `tools/list` response, and `tools/call` should NOT return `structuredContent`. Phase 4 D-24 capability negotiation enforces this. Phase 5 mock client (D-21) verifies it.

### 5.6 Mock clients (D-21)

Three thin Python httpx classes, each runs the JSON-RPC handshake then asserts shape compliance. Run **before** the agent harness as cheap parallel verifications:

```python
# stages/stage_f/mock_clients.py
class CursorMockClient:
    """Pitfall #31: read-only tools must NOT trigger confirmation_required."""
    async def verify(self, server_url: str) -> CursorVerifyResult:
        tools = await jsonrpc_request(server_url, "tools/list", {})
        for tool in tools["result"]["tools"]:
            ann = tool.get("annotations", {})
            if ann.get("readOnlyHint") is True:
                # In real Cursor, the client decides whether to prompt based
                # on annotations. We approximate: presence of readOnlyHint=true +
                # openWorldHint=true is sufficient (per Pitfall #31 mitigation).
                # Real Cursor opaque logic is not reproducible — this is the
                # best approximation Phase 5 can ship.
                if ann.get("openWorldHint") is not True:
                    return fail(tool.name, "openWorldHint not true on read tool")
            if ann.get("openWorldHint") is not True:
                return fail(tool.name, "openWorldHint=true invariant violated")
        return ok()
```

**Note on Cursor "real" verification:** Cursor's confirmation logic is opaque (closed-source IDE). Phase 5 cannot literally test "Cursor prompts user." The approximation per CONTEXT D-21 is structural: assert all 4 annotations explicit + `readOnlyHint=true` on read tools + `openWorldHint=true` invariant. Phase 9 owns the **real client smoke** against actual Cursor (per ROADMAP Phase 9 row).

```python
class ClaudeDesktopOlderMockClient:
    """Pitfall #4: 2024-11-05 client must NOT see outputSchema in tools/list."""
    async def verify(self, server_url: str) -> ClaudeOlderVerifyResult:
        await jsonrpc_request(server_url, "initialize", {"protocolVersion": "2024-11-05", ...})
        tools = await jsonrpc_request(server_url, "tools/list", {})
        for tool in tools["result"]["tools"]:
            if "outputSchema" in tool:
                return fail(tool.name, "outputSchema leaked to 2024-11-05 client")
        # Tools/call test: assert no structuredContent for 2024 client
        for tool in tools["result"]["tools"][:1]:  # spot-check one
            call_resp = await jsonrpc_request(server_url, "tools/call", {"name": tool["name"], "arguments": {}})
            if "structuredContent" in call_resp["result"]:
                return fail(tool["name"], "structuredContent returned to 2024-11-05 client")
        return ok()


class ChatGPTDeepResearchMockClient:
    """Pitfall #32: search/fetch must have exact OpenAI-compliant signatures."""
    async def verify(self, server_url: str) -> ChatGPTVerifyResult:
        canonical_search = json.loads((CANONICAL_DIR / "search_signature.json").read_text())
        canonical_fetch = json.loads((CANONICAL_DIR / "fetch_signature.json").read_text())
        tools = await jsonrpc_request(server_url, "tools/list", {})
        by_name = {t["name"]: t for t in tools["result"]["tools"]}
        if by_name["search"]["inputSchema"] != canonical_search:
            return fail("search", deep_diff(by_name["search"]["inputSchema"], canonical_search))
        if by_name["fetch"]["inputSchema"] != canonical_fetch:
            return fail("fetch", deep_diff(by_name["fetch"]["inputSchema"], canonical_fetch))
        return ok()
```

### 5.7 Two-tier evaluator (D-20, MCP-Bench arXiv 2508.20453)

**MCP-Bench reference impl:** [VERIFIED: https://github.com/Accenture/mcp-bench exists; GitHub repo confirms two-tier eval methodology.] However, the codebase is research-grade and not directly importable as a Python lib. **Recommendation: re-implement the two tiers ourselves.** ~150 LoC total.

**`mcp-eval` library (mcp-agent.com):** [CITED: docs.mcp-agent.com/test-evaluate/server-evaluation] Provides `Expect.tools.was_called(...)` / `Expect.tools.sequence([...])` / `Expect.judge.llm("...", min_score=0.8)` / `Expect.path.efficiency(max_steps=5)`. **Adopt these patterns** as the API surface for `f3_agent_eval.py::rule_based_eval`. Don't depend on the library directly (adds a transitive dep we don't control).

**Tier 1 rule-based:**
```python
def rule_based_eval(task: GoldenTask, traj: TaskTrajectory, server_tools: list[FinalTool]) -> RuleScore:
    tool_names = {t.name for t in server_tools}
    schemas = {t.name: t.inputSchema for t in server_tools}
    return RuleScore(
        tool_validity=all(s.tool_name in tool_names for s in traj.tool_calls),
        schema_compliance=all(
            jsonschema_validate(s.args, schemas.get(s.tool_name, {})) for s in traj.tool_calls
        ),
        runtime_success=count_unexpected_errors(traj, task.expected_errors) == 0,
        dependency_order=verify_partial_order(traj.tool_calls, task.expected_sequence),
        efficient=traj.iteration_count <= task.max_iterations * 1.5,
    )
```

**Tier 2 LLM judge:** **Qwen3-Coder via `make_agent`** (NOT Sonnet — Sonnet is the test AGENT, not the JUDGE per CONTEXT D-02). Single judge call per task with per-metric structured output:

```python
class F3JudgeScore(BaseModel):
    task_completion: confloat(ge=0.0, le=10.0)
    tool_usage: confloat(ge=0.0, le=10.0)
    planning: confloat(ge=0.0, le=10.0)
    grounding: confloat(ge=0.0, le=10.0)
    reasoning: str

JUDGE_AGENT = make_agent(output_type=F3JudgeScore, system_prompt=F3_JUDGE_PROMPT)

async def llm_judge_eval(task: GoldenTask, traj: TaskTrajectory) -> F3JudgeScore:
    result = await JUDGE_AGENT.run(format_judge_prompt(task, traj), model_settings=F3_JUDGE_SETTINGS)
    return result.output
```

Pass criterion (CONTEXT D-20): `rule_based.all() AND judge.task_completion >= 7 AND judge.grounding >= 6`.

### 5.8 Mock upstream generation (D-22, non-top-10 APIs)

Hand-rolled Python lib. Walks `RawIR.endpoints[*].responses[200].schema` + `examples`, synthesizes JSON. Deterministic seed per task ID.

**Library options considered:**
- `hypothesis-jsonschema` — generates valid JSON instances from a JSON Schema. Property-based; not deterministic by default. **Pass:** seed via `hypothesis.strategies.from_regex` is awkward.
- `genson` — schema generation FROM samples (wrong direction).
- `polyfactory` — Pydantic-model factories. Wrong abstraction (we have JSON Schemas, not Pydantic models).
- **Hand-roll** — recursive walk over JSON Schema with `random.Random(task_id_hash).choice(...)`. ~80 LoC.

**Recommendation: hand-roll.** Anchored to project rule "no fallbacks unless I explicitly ask for them." Pseudocode:

```python
# stages/stage_f/mock_upstream.py
import random
from typing import Any

def synthesize(schema: dict, seed: int) -> Any:
    rng = random.Random(seed)
    examples = schema.get("examples")
    if examples:
        return rng.choice(examples)
    t = schema.get("type")
    if t == "object":
        return {k: synthesize(v, seed=hash((seed, k)) & 0xFFFFFFFF) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        item_schema = schema.get("items", {})
        return [synthesize(item_schema, seed=hash((seed, i)) & 0xFFFFFFFF) for i in range(rng.randint(1, 5))]
    if t == "string":
        if "enum" in schema: return rng.choice(schema["enum"])
        if schema.get("format") == "date-time": return "2026-04-29T12:00:00Z"
        if schema.get("format") == "uri": return "https://example.com/test"
        return f"mock_{rng.randint(0, 99)}"
    if t == "integer": return rng.randint(schema.get("minimum", 0), schema.get("maximum", 1000))
    if t == "number": return round(rng.uniform(0, 1000), 2)
    if t == "boolean": return rng.choice([True, False])
    return None
```

Limitations disclaimed in QualityReport: `"Validated against mocked upstream — production behavior may vary."` (matches CONTEXT D-22 disclaimer).

---

## 6. Library / API Surface

### 6.1 Anthropic Python SDK

**[VERIFIED: 2026-04-29 PyPI `anthropic==0.97.0` latest stable; `anthropic==0.89.0` already in engine venv.]**

**Pin:** `anthropic>=0.96.0,<1.0` in `apps/generation-engine/pyproject.toml` (allow patch + minor within 0.x; major bumps are breaking).

**Imports:**
```python
from anthropic import AsyncAnthropic, APIStatusError, RateLimitError
from anthropic.types import MessageParam, ToolUseBlock, TextBlock
```

**Sonnet 4.x model id:**
- **CONTEXT D-02 says `claude-sonnet-4-6-20250929` — this is INCORRECT.** [VERIFIED via platform.claude.com/docs/en/about-claude/models/overview]
- The actual options are:
  - **`claude-sonnet-4-5-20250929`** (Sonnet 4.5, snapshot 2025-09-29) — currently labeled "legacy" on the docs page but still active.
  - **`claude-sonnet-4-6`** (Sonnet 4.6, current "best combination of speed and intelligence" per Anthropic) — the alias resolves to the current snapshot.
- **Recommendation for Phase 5:** pin `claude-sonnet-4-5-20250929` (frozen snapshot — reproducible cost) until quarterly model review. Sonnet 4.6 alias auto-floats and risks F3 result drift (Pitfall #2 anti-pattern at the F3 layer). [ASSUMED] Sonnet 4.5's behavioral characteristics are well-understood from Phase-4 manual testing; Sonnet 4.6 may or may not need re-calibration of golden-task pass thresholds.
- **Code comment must cite Override doc §7.3 + this RESEARCH.md §6.1 to prevent CONTEXT.md typo regression.**

**Tool-use loop pattern:** [CITED: platform.claude.com/docs/en/agents-and-tools/tool-use/overview]
```python
resp = await client.messages.create(model=..., tools=[...], messages=[...])
if resp.stop_reason == "tool_use":
    for block in resp.content:
        if block.type == "tool_use":
            result = await execute(block.name, block.input)
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
    messages.append({"role": "assistant", "content": resp.content})
    messages.append({"role": "user", "content": tool_results})
    # loop again
elif resp.stop_reason == "end_turn":
    # final answer
```

**Built-in retry:** `AsyncAnthropic(max_retries=2, timeout=httpx.Timeout(...))` — defaults are sane (exponential backoff on 429/5xx). Phase 5 layers `tenacity` outside for per-task retry (network blips on local `wrangler dev` → retry up to 3 times before declaring task failure).

**Pricing (current):** Sonnet 4.5/4.6 = $3/M input + $15/M output. Per F3 server eval ~$1–1.50 (matches CONTEXT D-44).

**`claude-agent-sdk-python` separate package:** [VERIFIED: github.com/anthropics/claude-agent-sdk-python] Provides higher-level agent abstraction. **DO NOT use** for F3 — Phase 5 needs explicit per-step trajectory recording for QualityReport debug; the lower-level `anthropic` client gives that control.

### 6.2 jsonschema (Python)

**[VERIFIED: `jsonschema>=4.26,<5.0` already in `apps/generation-engine/pyproject.toml`.]** No version bump needed.

**Critical pattern (already in repo):**
```python
from jsonschema import Draft202012Validator, FormatChecker
v = Draft202012Validator(schema, format_checker=FormatChecker())
errors = list(v.iter_errors(instance))  # all errors, not just first
```

`FormatChecker()` activates `format: "date-time"` / `"uri"` / `"email"` validators — relevant to Pitfall #33 (Zod `z.string().datetime()` produces `format: "date-time"` which not all clients validate). MCP 2025-06-18 spec uses Draft 2020-12.

### 6.3 wrangler 4.x

**[VERIFIED: 2026-04-29 `npm view wrangler version` returns `4.86.0`; `packages/codegen-templates/package.json` pins `^4.85.0`.]** No bump needed.

**`--local` flag stability:** [CITED: developers.cloudflare.com/workers/wrangler/commands/#dev] `wrangler dev --local` uses Miniflare 3 (workerd) for local emulation since wrangler 3.x; wrangler 4.x kept the flag stable. Known issue: `--local` does NOT exercise CF Queues, KV durability, Durable Objects state — none of which Phase 5 F3 needs (the generated Worker just serves MCP HTTP).

**Pre-warmed node_modules (Phase 4 D-39):** Phase 5 F1 + F3 reuse `packages/codegen-templates/node_modules/` via the same pnpm workspace symlink pattern. `npx wrangler dev` resolves wrangler from this hoisted node_modules — no re-install per F3 invocation.

### 6.4 gitleaks

**[VERIFIED: 2026-04-29 `brew info gitleaks` shows `8.30.1` stable; macos-arm64 bottle available.]**

**Install (engine container):** `gitleaks` is a single Go binary. Phase 5 plan must update the engine Dockerfile (`apps/generation-engine/Dockerfile`) to install it:
```dockerfile
COPY --from=zricethezav/gitleaks:latest /usr/bin/gitleaks /usr/local/bin/gitleaks
```
Or use the published Docker image as a multi-stage source. [CITED: hub.docker.com/r/zricethezav/gitleaks] Cross-platform CI: GitHub Actions can `gitleaks/gitleaks-action@v2` or install the binary.

**Default rules sufficient:** Stripe (`sk_live_`, `rk_live_`), GitHub (`ghp_`, `github_pat_`), AWS access keys, Slack tokens, generic high-entropy strings. No custom rules needed for MVP. If F3 surfaces a leaked credential pattern not caught by defaults, add a custom `.gitleaks.toml` in Phase 9.

### 6.5 numpy

**[VERIFIED: not currently in `apps/generation-engine/pyproject.toml`.]** Phase 5 needs `numpy>=2.0,<3.0` for `np.std` / `np.mean` (alternative: Python `statistics.stdev` / `statistics.fmean`). Recommend numpy because Langfuse + tiktoken transitively pull it; minimal install cost.

**Decision criterion (D-12 / σ ≥ 0.4):** Use **population stdev (`ddof=0`)** for σ across tools. Document choice in code comment to prevent future drift.

**Pitfall:** `np.std` defaults to `ddof=0`; `numpy.std` and `statistics.pstdev` are population; `statistics.stdev` is sample (`ddof=1`). Be explicit.

### 6.6 asyncio.Semaphore patterns

**Already established in Phase 2/3/4** (`apps/generation-engine/src/mcpgen_engine/passes/pass_3/llm_enrichment.py::Sem20`, Pass 2 `Sem10`). Phase 5 follows identical pattern:
```python
sem = asyncio.Semaphore(10)
async def bounded_call(arg):
    async with sem:
        return await do_work(arg)
results = await asyncio.gather(*[bounded_call(a) for a in args])
```

**Concurrency budget (per provider):** AtlasCloud (the pinned Qwen provider) tolerates ~10 concurrent connections without 429s in Phase 3 testing. Don't raise above 10 for F2. F3 Sonnet on Anthropic API tolerates `Semaphore(3)` per CONTEXT D-19 (Anthropic per-org rate limits are tighter).

### 6.7 httpx for mock clients

**Already in `apps/generation-engine/pyproject.toml` as `httpx>=0.27,<1.0`.** No new dep.

**Pattern (timeout important for `wrangler dev` cold start):**
```python
async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
    resp = await client.post(server_url, json=jsonrpc_body, headers=headers)
    resp.raise_for_status()
```

The `Mcp-Session-Id` header is optional in MCP Streamable HTTP (server may or may not assign). Mock clients should read `resp.headers.get("Mcp-Session-Id")` and pass it on subsequent requests if present. [CITED: modelcontextprotocol.io/specification/2025-03-26/basic/transports]

### 6.8 Retry FSM (D-24)

**Decision: explicit state-variable + match-statement (matches CONTEXT D-24 + D-discretion recommendation).** No `transitions` library — overkill for 8 states.

```python
# stages/stage_f/retry_orchestrator.py
from enum import Enum

class RetryState(Enum):
    INITIAL = "initial"
    F1_RUNNING = "f1_running"
    F1_DONE = "f1_done"
    F2_RUNNING = "f2_running"
    F2_DONE = "f2_done"
    F3_RUNNING = "f3_running"
    F3_DONE = "f3_done"
    RETRY_PLANNED = "retry_planned"
    UPSTREAM_RUNNING = "upstream_running"
    VALIDATION_COMPLETE = "validation_complete"
    TERMINAL_FAILURE = "terminal_failure"

@dataclass
class RetryContext:
    state: RetryState
    round: int  # 0..2; >=2 → terminal
    cumulative_cost_usd: float
    cumulative_wall_clock_s: float
    triggers: list[RetryTrigger]
    history: list[RetryRound]
```

State transitions are explicit `match retry_ctx.state: case RetryState.F2_DONE: if needs_retry(...): retry_ctx.state = RETRY_PLANNED ...`. Persist `retry_state.json` for debug (D-40 layout).

### 6.9 L2 cache invalidation (D-26)

`apps/generation-engine/src/mcpgen_engine/cache/keys.py` already implements `l2_key(pass_name, pass_version, pass_input, sampling_profile_label, prompt_version, template_version)`. Phase 5 adds:
```python
# stages/stage_f/cache_invalidation.py
PASS_DOWNSTREAM = {
    "pass_0": ["pass_1", "pass_2", "pass_3", "pass_4", "pass_5", "stage_e", "stage_f1", "stage_f2"],
    "pass_1": ["pass_2", "pass_3", "pass_4", "pass_5", "stage_e", "stage_f1", "stage_f2"],
    "pass_2": ["pass_3", "pass_4", "pass_5", "stage_e", "stage_f1", "stage_f2"],
    "pass_3": ["pass_4", "pass_5", "stage_e", "stage_f1", "stage_f2"],
    "pass_4": ["pass_5", "stage_e", "stage_f1", "stage_f2"],
    "pass_5": ["stage_e", "stage_f1", "stage_f2"],
    "stage_e": ["stage_f1", "stage_f2"],
}

async def invalidate_cascade(retry_target: str, l2: L2Cache) -> None:
    for downstream in PASS_DOWNSTREAM[retry_target]:
        await l2.invalidate_by_prefix(f"l2:{ENGINE_VERSION}:{downstream}:")
```

`L2Cache.invalidate_by_prefix` does NOT currently exist — Phase 5 plan must add it to `cache/l2.py`. Implementation is glob `<L2_DIR>/<prefix>*` + unlink. [VERIFIED: `cache/l2.py` already implements filesystem-backed L2 with sha256 keys; prefix-glob is straightforward addition.]

### 6.10 Phase-5 new Python deps

```toml
# apps/generation-engine/pyproject.toml additive
dependencies = [
  ...,
  "anthropic>=0.96.0,<1.0",  # F3 test agent (Sonnet)
  "numpy>=2.0,<3.0",         # F2 σ discrimination metric
]
```
No frontend/runtime/contracts deps changes.

---

## 7. Validation Architecture (Nyquist Dimension 8 — Phase 5 validates ITSELF)

> Phase 5 IS a validation phase. The meta question is: how do we trust that F1/F2/F3 work correctly when Phase 5 ships?

### 7.1 Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.3 + pytest-asyncio 0.24 (already in engine `[dependency-groups] dev`) |
| Config file | `apps/generation-engine/pyproject.toml::[tool.pytest.ini_options]` (already configured for ruff + mypy --strict) |
| Quick run command | `uv run pytest apps/generation-engine/tests/stages/stage_f/ -x --no-cov` |
| Full suite command | `pnpm -r test && uv run pytest -x` (workspace-wide) |
| Sonnet smoke test | `uv run pytest apps/generation-engine/tests/test_smoke_sonnet.py -m requires_anthropic` |

### 7.2 Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File |
|-----|----------|-----------|-------------------|------|
| GEN-09 | F1 runs 11 deterministic checks; failed checks map to retry | unit + integration | `pytest tests/stages/stage_f/test_f1_*.py -x` | ❌ Wave 0 |
| GEN-09 | F1 fails closed: F2/F3 don't run on F1 failure | integration | `pytest tests/stages/stage_f/test_pipeline_f1_fail.py -x` | ❌ Wave 0 |
| GEN-09 | gitleaks subprocess catches sk_live_/ghp_ | integration | `pytest tests/stages/stage_f/test_secret_scan.py -x` | ❌ Wave 0 |
| GEN-09 | OpenAI compliance fixture catches search drift | unit (snapshot) | `pytest tests/stages/stage_f/test_openai_compliance.py -x` | ❌ Wave 0 |
| GEN-10 | F2 = 5 shuffles × 3 temperatures = 15 calls per tool | unit (mocked LLM) | `pytest tests/stages/stage_f/test_f2_smell.py::test_15_calls -x` | ❌ Wave 0 |
| GEN-10 | F2 σ < 0.4 force-triggers F3 | integration (mocked LLM) | `pytest tests/stages/stage_f/test_f2_sigma.py -x` | ❌ Wave 0 |
| GEN-10 | F2 retry per-component < 3 → Pass 2; param < 3 → Pass 3 | integration | `pytest tests/stages/stage_f/test_retry_orchestrator.py -x` | ❌ Wave 0 |
| GEN-10 | F2 threshold imported from `LAUNCH_CRITERIA`, not hardcoded | static | `grep -r "4\.0\|0\.7" stages/stage_f/ \| grep -v LAUNCH_CRITERIA` returns 0 hits | ❌ Wave 0 |
| GEN-11 | F3 spawns wrangler dev subprocess; cleans up on exit | integration (real wrangler) | `pytest tests/stages/stage_f/test_server_runner.py -x -m requires_wrangler` | ❌ Wave 0 |
| GEN-11 | F3 test agent loops correctly on stop_reason="tool_use" | integration | `pytest tests/stages/stage_f/test_test_agent_harness.py -m requires_anthropic` | ❌ Wave 0 |
| GEN-11 | Two-tier evaluator: rule_based + LLM judge | unit | `pytest tests/stages/stage_f/test_two_tier_eval.py -x` | ❌ Wave 0 |
| GEN-11 | Mock clients: Cursor + Claude Desktop older + ChatGPT Deep Research | integration | `pytest tests/stages/stage_f/test_mock_clients.py -x -m requires_wrangler` | ❌ Wave 0 |
| GEN-09/10/11 | Full pipeline reaches `validation_complete` SSE on Stripe fixture | integration (real LLM + Anthropic) | `pytest tests/stages/stage_f/test_pipeline_e2e.py -m "requires_openrouter and requires_anthropic"` | ❌ Wave 0 |

### 7.3 Sampling Rate

- **Per task commit:** `pytest tests/stages/stage_f/ -x --no-cov` (~30s; mocked LLM)
- **Per wave merge:** workspace `pnpm -r test && uv run pytest -x` (~3min; mocked LLM)
- **Phase gate:** Real-LLM run on Stripe + GitHub + Notion fixtures (`-m "requires_openrouter and requires_anthropic"`) — costs ~$0.20 + ~$3 = ~$3.20 per phase verification; gated behind manual flag in CI to control cost.

### 7.4 Wave 0 Gaps

- [ ] `tests/stages/stage_f/test_f1_*.py` (11 files matching 11 checks) — covers GEN-09
- [ ] `tests/stages/stage_f/test_f2_smell.py` — covers GEN-10
- [ ] `tests/stages/stage_f/test_retry_orchestrator.py` — covers retry FSM + cascade invalidation
- [ ] `tests/stages/stage_f/test_server_runner.py` — covers wrangler dev subprocess (`requires_wrangler` marker; skips if wrangler not on PATH)
- [ ] `tests/stages/stage_f/test_test_agent_harness.py` — covers Sonnet loop (`requires_anthropic` marker)
- [ ] `tests/stages/stage_f/test_mock_clients.py` — covers 3 mock clients
- [ ] `tests/stages/stage_f/test_pipeline_e2e.py` — full pipeline integration on Stripe fixture
- [ ] `tests/test_smoke_sonnet.py` — Day-1 Sonnet reachability gate (mirrors `test_smoke_qwen.py`)
- [ ] `tests/conftest.py` extension: add `requires_anthropic` and `requires_wrangler` markers
- [ ] `packages/engine-fixtures/_canonical/{search,fetch}_signature.json` + `mcp-schema.json` — hand-create
- [ ] `packages/engine-fixtures/{stripe,github,notion}/golden_tasks.json` — hand-author 3 × 10 tasks
- [ ] `packages/engine-fixtures/{stripe,github,notion,linear,slack}/quality-report.json` — fill realistic F1/F2/F3 ranges (D-42)

### 7.5 Acceptance — Hand-tuned reference data per fixture

The fixture validation pattern (D-41) is structural for non-deterministic outputs:

```
F1 (deterministic): exact match — any diff is a regression.
F2 (LLM rubric): structural match — overall_average within ±0.5; per-tool average within ±1.0.
F3 (stochastic Sonnet + sandbox state): pass_rate within ±0.2; hard-fail at < F3_AGENT_PASS_RATE_MIN (0.7).
```

**Phase 5 launch acceptance:** Stripe + GitHub + Notion fixtures must reach `quality_badge=verified` on a fresh full-pipeline run. Linear + Slack must reach `standard` minimum. Run the pipeline 3× per fixture during D-42 calibration, codify ±tolerances in `quality-report.json`.

---

## 8. Pitfalls & Mitigations

> **Phase 5 owns mitigations for #9, #10, #31, #32 + extends Phase 4 mitigations on #1, #4, #15, #28, #33.**

### 8.1 Owned: #9 F2 Single-Judge Mode-Collapse

**What:** With single Qwen + 5-shuffle averaging on similar tools (`charges_create` / `charges_update`), per-tool scores converge — per-component-failure → targeted retry mapping becomes unreliable.

**Mitigation (CONTEXT D-12, D-45):**
- **Between-tool σ ≥ 0.4 discrimination metric.** Use `np.std([t.average for t in tool_scores], ddof=0)`.
- σ < 0.4 → set `low_confidence_run=true` → **force-trigger F3 even on free tier** (eat the cost).
- Surface in `QualityReport.warnings`: `"F2 between-tool σ low (<0.4) — quality assessment may be unreliable. F3 was force-triggered to confirm."`

**Quarterly human calibration** (post-launch) includes "discrimination index" — `packages/engine-fixtures/calibration/` placeholder ships in Phase 5; first calibration run is post-MVP.

### 8.2 Owned: #10 LLM-Hallucinated Examples Sneaking In via Retry

**What:** Pass 2 forbids LLM-generated examples (only spec-derived). On Purpose<3 retry, the LLM helpfully adds an example — hallucinated.

**Mitigation (CONTEXT D-05 step 8 + D-14 + D-46):**
- F1 `examples_provenance` check: extract every `Pass2Output.tools[*].description.examples` array; substring-match each example against `RawIR.endpoints[*].request_body.examples ∪ responses[*].schema.examples`.
- Non-derivable example → fail with `EXAMPLES_HALLUCINATED` → retry Pass 2 with explicit forbidden-pattern + examples-only-from-spec re-injection in retry prompt.
- F1 re-runs after EVERY Pass 2 retry — no skipping.
- Inline Qwen-judge (4-component rubric, Phase 3 D-04 pattern) re-runs after retry as additional check.

**Implementation note:** Substring matching is loose by design — exact-equality would over-reject (LLM may rephrase a spec example correctly). Phase 5 ships substring-match v1; calibrate against false-positive rate during D-42 calibration; tighten to fingerprint-match v1.1 if needed.

### 8.3 Owned: #31 Cursor Read-Only Confirmation Prompts

**What:** `openWorldHint=true` invariant + missing `readOnlyHint=true` on read tools → Cursor prompts "approve?" on every search/fetch. Six-Tool Pattern's read-heavy flow becomes confirm-fest.

**Mitigation (CONTEXT D-21 + D-47):**
- F3 `CursorMockClient` verifies (structurally — Cursor's real logic is opaque) that every read-tool annotation has `readOnlyHint=true` AND `openWorldHint=true`.
- Quickstart docs (Phase 10) document Cursor user-side confirmation toggle.
- Phase 9 owns the **real Cursor smoke** against actual desktop client.

**Limitation:** Phase 5 cannot literally test "Cursor prompts user." The structural verification is the best approximation in the engine. Document this caveat in plans + QualityReport.

### 8.4 Owned: #32 ChatGPT Deep Research Compliance Regression

**What:** Future Pass 1 prompt iteration adds optional `limit: int` to `search` → compiles, passes F1 default checks, fails ChatGPT Deep Research silently.

**Mitigation (CONTEXT D-05 step 7 + D-21 + D-48):**
- `packages/engine-fixtures/_canonical/search_signature.json` + `fetch_signature.json` — hand-authored canonical schemas.
- F1 `openai_compliance` check **deep-equals** (not subset-match) `FinalTool[search].inputSchema` against the canonical fixture.
- Drift → retry Pass 1 OR Pass 3 (depending on which field drifted).
- `ChatGPTDeepResearchMockClient` in F3 also verifies runtime compliance (defense-in-depth).

**Hand-authored canonical fixture is immutable.** Bumping requires a paired `docs/decisions/` entry — same enforcement as `launch-criteria.ts`. Add a pre-commit hook check: any change to `_canonical/search_signature.json` requires `docs/decisions/<date>-openai-compliance-update.md`.

### 8.5 Extends: #1 Smart-ID Server-Prefix Collision

Phase 2 D-31 ships schema-level smart-ID validation. Phase 5 F1 `smart_id_fuzz` (D-05 step 3) extends with **runtime cross-tenant fuzz**: synthesize 2 tenants from same spec, assert `runtime/smart_id.ts::parseSmartId` rejects cross-tenant IDs. This catches Stage E template bugs that Pass 1 schema validation missed.

### 8.6 Extends: #4 outputSchema Breaking Older Clients

Phase 4 D-24 ships capability-negotiation runtime. Phase 5 `ClaudeDesktopOlderMockClient` (D-21) verifies it works: send `protocolVersion="2024-11-05"` during initialize; assert `tools/list` omits `outputSchema`; assert `tools/call` has no `structuredContent`.

### 8.7 Extends: #15 DNS Rebinding

Phase 4 D-22 ships `hostHeaderValidation` middleware. Phase 5 F1 `auth_middleware` check (D-05 step 6) verifies the middleware appears FIRST in `auth/middleware.ts`. Phase 5 F3 server runner sets `MCPGEN_F3_TEST=1` env var only in subprocess scope (D-18, D-51) to bypass the allowlist for `127.0.0.1:{port}` testing — production tenant Workers never see the flag.

### 8.8 Extends: #28 Long-Session Context Drift

Every Phase 5 plan file starts with **"MUST re-read these files first"** header (Phase 2 D-61, Phase 3 D-49, Phase 4 D-56 pattern, Phase 5 D-52). Pre-commit hook enforces.

### 8.9 Extends: #33 Zod Schema Coercion

Phase 4 D-26 ships dual schemas (Zod-derived + conservative-format fallback). Phase 5 F1 `json_schema` check (D-05 step 10) validates BOTH against the pinned MCP 2025-06-18 official schema using `jsonschema` lib + `FormatChecker()`. The conservative fallback is served to older clients per D-21 mock test.

---

## 9. Drift to Verify (libs current state)

### 9.1 Anthropic Python SDK ✅ HIGH confidence

- **Latest stable:** `anthropic==0.97.0` [VERIFIED: PyPI 2026-04-29 via `pip index versions anthropic`]
- **API surface:** `AsyncAnthropic` + `messages.create(...)` + `stop_reason="tool_use"` loop pattern stable since ~0.30 [CITED: github.com/anthropics/anthropic-sdk-python README]
- **Rate-limit handling:** `max_retries=2` SDK-default; `RateLimitError` + `APIStatusError` exception classes stable.
- **Pin recommendation:** `anthropic>=0.96.0,<1.0`.
- **Sonnet 4.x current:** `claude-sonnet-4-5-20250929` (snapshot, recommended) OR `claude-sonnet-4-6` (alias to current). [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview 2026-04-29]
- **CONTEXT.md typo:** D-02 says `claude-sonnet-4-6-20250929` — wrong snapshot date for 4.6. **Phase 5 plan must use `claude-sonnet-4-5-20250929` and document the correction in a sibling decision doc.** [ASSUMED] using Sonnet 4.5 for F3 will not invalidate hand-tuned `quality-report.json` thresholds; if Sonnet 4.5 vs 4.6 produces materially different pass rates, the calibration runs in D-42 will surface it.

### 9.2 wrangler 4.x ✅ HIGH confidence

- **Latest stable:** `wrangler==4.86.0` [VERIFIED: `npm view wrangler version` 2026-04-29]
- **Pinned at:** `^4.85.0` in `packages/codegen-templates/package.json` ✅
- **`--local` flag:** stable since wrangler 3.x; no breaking changes in 4.x line.
- **Drift recommendation:** No bump.

### 9.3 gitleaks 8.x ✅ HIGH confidence

- **Latest stable:** `gitleaks 8.30.1` [VERIFIED: `brew info gitleaks` 2026-04-29]
- **Install path:** `brew install gitleaks` (macos-arm64) OR Docker `zricethezav/gitleaks:latest` (engine container).
- **Default rules:** sufficient for MVP threat model.

### 9.4 jsonschema (Python) ✅ HIGH confidence

- **Pinned at:** `jsonschema>=4.26,<5.0` in engine pyproject.toml ✅
- **Draft 2020-12 support:** native; matches MCP 2025-06-18 spec.

### 9.5 numpy 🆕

- **Not currently pinned.** Phase 5 adds `numpy>=2.0,<3.0`.
- **Justification:** σ-discrimination metric (D-12). Alternative `statistics` stdlib works but adds verbosity.

### 9.6 MCP TS SDK pinned at v1.29 ✅

[VERIFIED: `packages/codegen-templates/package.json` shows `@modelcontextprotocol/sdk@^1.29.0`, `zod@^4.3.6`.] Phase 5 mock clients use the wire-level JSON-RPC over HTTP — they don't import the SDK. No drift concern.

---

## 10. Open Questions (RESOLVED)

> Most decisions are locked. Remaining items below — each carries an explicit RESOLVED: marker recording the chosen path. The planner has consumed these resolutions in the corresponding plans.

### 10.1 Sonnet 4.5 vs 4.6 for F3 test agent

- **What we know:** CONTEXT D-02 says `claude-sonnet-4-6-20250929` (incorrect — 4.6's snapshot date isn't 2025-09-29). Anthropic docs show Sonnet 4.6 is current best-balance; Sonnet 4.5 (snapshot `claude-sonnet-4-5-20250929`) is "legacy" but active.
- **What's unclear:** Whether 4.5 or 4.6 better simulates "production agent users" today.
- **RESOLVED:** Pin **`claude-sonnet-4-5-20250929`** (frozen snapshot, reproducible costs). Document the CONTEXT.md typo correction in a sibling `docs/decisions/2026-MM-DD-f3-sonnet-snapshot.md`. Quarterly review can re-evaluate (post-launch). Plan 05-01 commits the pin in `apps/generation-engine/pyproject.toml`; Plan 05-06 references the same pin in `llm/test_agent.py`.

### 10.2 Examples-provenance: substring vs fingerprint matching

- **What we know:** D-05 step 8 specifies substring match for now.
- **What's unclear:** False-positive rate on real fixtures (LLM rephrases a spec example correctly — substring miss → false alarm).
- **RESOLVED:** Ship substring v1 in Plan 05-03 (`f1_checks/examples_provenance.py`). Instrument false-alarm rate during D-42 calibration (Plan 05-10). If rate > 5% post-launch, tighten to fingerprint match in v1.1.

### 10.3 Mock-upstream realism

- **What we know:** D-22 mocked upstream for non-top-10 APIs uses Python-side spec-derived synthesis.
- **What's unclear:** How many F3 failures are caused by mock unrealism vs server bugs (false-positive rate).
- **RESOLVED:** Plan 05-07 ships `mock_upstream.py` for Linear + Slack only in Phase 5. The `QualityReport.sandbox_environment` field (additive in Plan 05-01 IR types) tracks `"real" | "mocked" | "hybrid"`. If post-launch data shows mocked-server pass rates systematically lower than real-sandbox by > 0.15, Phase 9 onboards more APIs to real sandbox. Out of MVP scope.

### 10.4 wrangler dev subprocess shared vs per-task

- **What we know:** Discretion noted; recommendation = shared.
- **What's unclear:** Whether Miniflare leaks state between invocations (KV emulation, Durable Objects state) in ways that contaminate F3 task results.
- **RESOLVED:** Plan 05-06 ships **shared subprocess** (one `wrangler dev` for all 10 tasks per F3 invocation) — fastest startup amortization. If state contamination observed during Plan 05-10 calibration runs, switch to per-task in a follow-up plan. The shared-vs-per-task choice is documented in `server_runner.py` module docstring.

### 10.5 Subprocess cleanup on agent crash

- **What we know:** D-18 ships SIGTERM + 5s timeout + force-kill. Cross-platform process-group kill recommended in §5.4.
- **What's unclear:** CI environment may not honor process-group kill (Docker container limits).
- **RESOLVED:** Plan 05-06 includes a deliberate "kill-switch test" in `tests/stages/stage_f/test_server_runner.py` — spawn `wrangler dev`, kill the parent Python process with SIGKILL, assert no orphan node processes survive (checked via `ps -ef | grep wrangler` after a 5-second grace). Test gated behind `requires_wrangler` pytest marker so it can be skipped in environments without wrangler on PATH.

---

## 11. Sources

### Primary (HIGH confidence)
- `docs/mcpgen-stage-f-design.md` — Stage F detailed design (architecture, retry orchestration, golden tasks, mock clients, quality badges)
- `docs/mcpgen-model-and-provider-override.md` §0–4 + §7.3 — single Qwen × 5-shuffle × 3-temperature; F3 test agent Sonnet exception
- `packages/contracts/src/launch-criteria.ts` — F2_SMELL_MIN=4.0, F3_AGENT_PASS_RATE_MIN=0.7, BUNDLE_SIZE.FAIL_KB_EXCLUSIVE=950
- `packages/ir/python/types.py` — F1Static, F2Smell, F3AgentEvalReport, QualityReport, QualityBadge already shipped Phase 1
- `.planning/phases/05-…/05-CONTEXT.md` D-01..D-54 — all 54 implementation decisions locked
- `.planning/research/PITFALLS.md` #9, #10, #31, #32 (owned) + #1, #4, #15, #28, #33 (extended)
- `.planning/research/STACK.md` §1 + §6 — locked stack + drift items

### Secondary (HIGH–MEDIUM confidence — verified via Web 2026-04-29)
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) — verified Sonnet 4.5/4.6 model IDs, pricing, deprecations
- [Anthropic Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — verified `stop_reason="tool_use"` agent loop pattern
- [MCP Streamable HTTP Spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — verified JSON-RPC over HTTP wire format, headers, session ID
- [github.com/anthropics/anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python) — SDK API surface, retry behavior
- [github.com/Accenture/mcp-bench](https://github.com/Accenture/mcp-bench) — verified two-tier eval methodology exists; not directly importable
- [docs.mcp-agent.com/test-evaluate/server-evaluation](https://docs.mcp-agent.com/test-evaluate/server-evaluation) — `mcp-eval` library API patterns adopted
- `npm view wrangler version` → 4.86.0 (2026-04-29)
- `pip index versions anthropic` → 0.97.0 latest, 0.89.0 installed (2026-04-29)
- `pip index versions jsonschema` → 4.26.0 latest, 4.24.1 installed (2026-04-29)
- `brew info gitleaks` → 8.30.1 stable (2026-04-29)

### Tertiary (LOW confidence — flagged for Phase 5 calibration)
- σ ≥ 0.4 threshold rationale [ASSUMED] — calibrate against 5 fixtures during D-42; adjust if typical σ < 0.4 in well-discriminated tools.
- Sonnet 4.5 vs 4.6 quality-equivalence for F3 [ASSUMED] — quarterly review.
- Examples-provenance substring match false-positive rate [ASSUMED] — calibrate during D-42.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sonnet 4.5 (`claude-sonnet-4-5-20250929`) is acceptable substitute for the CONTEXT.md typo `claude-sonnet-4-6-20250929` | §6.1, §9.1 | F3 pass rates may need re-calibration if 4.6 produces materially different agent behavior; D-42 calibration surfaces this |
| A2 | σ ≥ 0.4 is the right discrimination threshold for population stdev with N=6..12 tools | §4.4 | Too-loose → mode-collapse undetected; too-tight → F3 force-trigger spam. Calibrate against fixture data in D-42. |
| A3 | gitleaks default rules cover all credential patterns in MVP threat model | §3.3 | Unique secret patterns (e.g., HubSpot dev portal API key) may bypass default rules — document false-negative cases discovered in F3 fixtures. |
| A4 | Sonnet 4.5 (3 hops via Anthropic Priority Tier) latency stays under 30s per agent step | §5.1 | If routinely >30s, F3 wall-clock balloons past CONTEXT D-44 budget; cost stays bounded but UX degrades. |
| A5 | Process-group SIGTERM cleanly cascades to wrangler-spawned Miniflare workerd children on macos-arm64 | §5.4 | Phase 9 may discover orphan node processes accumulating on dev machines; mitigate with kill-switch test in Phase 5 plan. |
| A6 | Substring-matching for examples-provenance has acceptable false-positive rate (<5%) | §3, §8.2 | Calibrate during D-42; tighten to fingerprint match if needed. |
| A7 | Cursor's confirmation logic actually keys off `readOnlyHint=true` in 2026 builds | §8.3 | Cursor's logic is opaque. Phase 9 real-Cursor smoke is the only ground truth. Phase 5 ships the structural approximation. |
| A8 | Anthropic SDK 0.96+ keeps the same `messages.create + stop_reason` API surface | §6.1 | Major-bump breakage caught by `tests/test_smoke_sonnet.py` Day-1 gate. Pin lower bound 0.96.0. |
| A9 | `numpy.std(ddof=0)` is the correct stdev for σ-discrimination | §4.4, §6.5 | Documented choice; population stdev is philosophically correct for "this server's tools." |
| A10 | wrangler dev --local Miniflare emulation faithfully serves MCP HTTP for F3 testing (no edge-runtime quirks invalidate F3 results) | §5.4 | If Miniflare diverges from real CF Workers in ways relevant to MCP transport, F3 may give false confidence. Phase 9 real-CF smoke covers. |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| F1 architecture (11 checks, mappings) | HIGH | Locked in CONTEXT D-04..D-08; libraries verified; subprocess patterns established in Phase 4 |
| F2 architecture (15 calls, σ metric, retry) | HIGH | Override doc §4 + CONTEXT D-09..D-15 locked; numpy + asyncio.Semaphore patterns standard |
| F3 architecture (Sonnet, two-tier, mock clients, hybrid env) | HIGH | CONTEXT D-17..D-23 locked; Anthropic SDK + wrangler subprocess + JSON-RPC wire format verified |
| Library versions (Anthropic, jsonschema, gitleaks, wrangler, numpy) | HIGH | All verified 2026-04-29 via PyPI/npm/brew |
| Sonnet 4.5 vs 4.6 model id | MEDIUM | Verified models exist; CONTEXT.md has typo; choice between snapshot + alias is judgement call |
| Subprocess cleanup robustness | MEDIUM | Process-group kill works on POSIX; CI sandbox quirks may differ |
| Mock-client realism vs real Cursor | LOW-MEDIUM | Cursor logic is opaque; structural approximation is best Phase 5 can do |
| Mock-upstream realism for non-top-10 APIs | LOW | Hand-rolled spec-derived synthesis is an approximation; surface in QualityReport disclaimer |

---

## RESEARCH COMPLETE

**Phase:** 05 — Generation Engine — Validation (Stage F)
**Confidence:** HIGH

### Key Findings

- **Sonnet model id correction needed:** CONTEXT D-02 says `claude-sonnet-4-6-20250929` — this snapshot does not exist. Use `claude-sonnet-4-5-20250929` (frozen snapshot) and document the correction in a sibling decision doc. Sonnet 4.6 alias auto-floats and risks F3 result drift.
- **wrangler dev subprocess management is the single largest infra change in Phase 5.** Process-group SIGTERM + 5s force-kill + retry-on-port-collision is the robust pattern. Reuse Phase 4 D-39 pre-warmed `node_modules` (~5s startup vs ~30s cold).
- **gitleaks default rules sufficient for MVP** — no custom rules needed. Install path: `brew install gitleaks` (dev) + Docker multi-stage in engine container (prod).
- **JSON-RPC over HTTP wire format is the right primitive** for mock clients (not the MCP SDK). Three thin `httpx` clients + canonical fixture diffs.
- **σ ≥ 0.4 discrimination metric uses `numpy.std(ddof=0)` (population stdev).** Document the choice; calibrate threshold against the 5 fixtures during D-42.
- **Two-tier evaluator: re-implement, don't depend on `mcp-eval` library or Accenture/mcp-bench codebase.** Adopt their API patterns; ~150 LoC re-implementation.
- **Mock-upstream synthesis: hand-roll Python lib (~80 LoC).** Recursive walk over JSON Schema with deterministic seed-per-task. Skip hypothesis-jsonschema / WireMock / mountebank.
- **Tier 2 LLM judge stays on Qwen3-Coder via `make_agent`.** Only the test AGENT (loop driver) is Sonnet. Two distinct roles — code comments must cite this anchor to prevent future drift.

### File Created

`.planning/phases/05-generation-engine-validation-stage-f/05-RESEARCH.md`

### Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| Library / API surface | HIGH | All deps verified 2026-04-29 against PyPI / npm / brew |
| F1 / F2 / F3 implementation patterns | HIGH | CONTEXT.md locks 54 decisions; this research fills implementation-level details |
| Sonnet model id | MEDIUM | CONTEXT.md typo identified; correction proposed; calibration covers risk |
| Subprocess cleanup robustness | MEDIUM | Standard POSIX pattern; CI sandbox edge cases possible |
| Mock-client realism vs real Cursor | LOW-MEDIUM | Cursor opaque; Phase 9 real-smoke is ground truth |

### Ready for Planning

Research complete. Planner can now create PLAN.md files following the recommended Wave 1–6 layout in CONTEXT.md `<canonical_refs>`. The 13 file-list gaps in §7.4 form the Wave 0 test infrastructure budget.
