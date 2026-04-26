# Model & Provider Configuration — OVERRIDE

> **Назначение:** override всех решений про LLM models из предыдущих docs.
> **Этот документ — single source of truth для model selection.** При противоречии — побеждает этот файл.
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

**Используем единственную модель:** `qwen/qwen3-coder` через OpenRouter.

**Замены:**
- ❌ ~~Claude Sonnet 4.7 / Haiku 4.5 (Anthropic API напрямую)~~
- ❌ ~~GPT-5 (OpenAI API)~~
- ❌ ~~Gemini 3.5 Pro (Google AI)~~
- ❌ ~~LiteLLM multi-provider~~
- ✅ **Qwen3-Coder через OpenRouter** — единая модель для ВСЕХ tasks

**Impact:** значительное cost reduction, упрощение архитектуры, но требует пересмотра multi-judge strategy в Stage F2 (см. § 4).

---

## 1. Model rationale

### 1.1 Why Qwen3-Coder

Из [OpenRouter docs](https://openrouter.ai/qwen/qwen3-coder):

- **80B total parameters / 3B active** (sparse MoE) — производительность 10-20x более крупных моделей при низкой compute cost
- **256K context window** — достаточно для крупных OpenAPI specs
- **Non-thinking mode** — не emit'ит `<think>` блоки, упрощает integration в production
- **Optimized для coding agents** — function calling, tool use, long-horizon tasks
- **Open weights** — option для self-hosting в будущем (control plane move)

### 1.2 Pricing comparison

| Model | Input ($/M) | Output ($/M) | Notes |
|---|---|---|---|
| ~~Claude Sonnet 4.7~~ | ~~$3.00~~ | ~~$15.00~~ | original primary choice |
| ~~Claude Haiku 4.5~~ | ~~$1.00~~ | ~~$5.00~~ | original cheap classifier |
| ~~GPT-5~~ | ~~$5.00~~ | ~~$15.00~~ | original cross-judge |
| ~~Gemini 3.5 Pro~~ | ~~$3.00~~ | ~~$15.00~~ | original third judge |
| **Qwen3-Coder (OpenRouter)** | **$0.14** | **$0.80** | **new single choice** |

**Cost reduction per generation:**
- Было: $1.00–3.00 per generated server (multi-model)
- Стало: ~$0.10–0.30 per generated server
- **~10-20x cheaper**

---

## 2. PydanticAI + OpenRouter integration

PydanticAI поддерживает OpenRouter через OpenAI-compatible endpoint. Конфигурация простая.

### 2.1 Установка

```bash
# Same as before — pydantic-ai supports OpenRouter natively
pip install pydantic-ai
```

### 2.2 Environment variables

```bash
# .env.local (для всех services)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
PRIMARY_MODEL=qwen/qwen3-coder

# Optional headers для OpenRouter analytics (рекомендуется)
OPENROUTER_HTTP_REFERER=https://mcpgen.dev
OPENROUTER_X_TITLE=MCPGen
```

### 2.3 PydanticAI configuration

**Pattern 1: OpenAIModel с custom base_url** (recommended)

```python
# generation-engine/llm/client.py

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
import os

# Initialize model — single instance, reuse везде
def get_model() -> OpenAIModel:
    """
    Returns Qwen3-Coder model configured for OpenRouter.
    
    OpenRouter exposes OpenAI-compatible API, so we use OpenAIModel
    с custom base_url + api_key.
    """
    provider = OpenAIProvider(
        base_url=os.environ["OPENROUTER_BASE_URL"],
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    
    return OpenAIModel(
        model_name=os.environ.get("PRIMARY_MODEL", "qwen/qwen3-coder"),
        provider=provider,
    )

# Singleton model instance
MODEL = get_model()
```

**Pattern 2: Reusable agent factory**

```python
# generation-engine/llm/agent_factory.py

from pydantic_ai import Agent
from pydantic import BaseModel
from typing import Type, TypeVar
from .client import MODEL

T = TypeVar("T", bound=BaseModel)

def make_agent(
    *,
    output_type: Type[T] | None = None,
    system_prompt: str = "",
    instructions: str | None = None,
) -> Agent[None, T]:
    """
    Factory для создания agents с consistent model configuration.
    
    Usage:
        agent = make_agent(
            output_type=ToolDescription,
            system_prompt=DESCRIPTION_AUTHORING_PROMPT,
        )
        result = await agent.run("Generate description for: ...")
    """
    return Agent(
        model=MODEL,
        output_type=output_type,
        system_prompt=system_prompt,
        instructions=instructions,
    )
```

### 2.4 Per-pass usage example

```python
# generation-engine/passes/pass_2_description.py

from pydantic import BaseModel, Field
from typing import Literal
from llm.agent_factory import make_agent

class ToolDescription(BaseModel):
    purpose: str
    when_to_use: list[str]
    when_not_to_use: list[str]
    how_to_use: str
    limitations: list[str]
    parameter_overview: str

PASS_2_SYSTEM_PROMPT = """
You write tool descriptions for MCP servers, following Anthropic best practices
and the 6-component rubric from MCP description quality research.

[... rest of system prompt from pass-2-design.md ...]
"""

# Create agent once
description_agent = make_agent(
    output_type=ToolDescription,
    system_prompt=PASS_2_SYSTEM_PROMPT,
)

async def generate_description(tool_context: dict) -> ToolDescription:
    """Generate description для single tool."""
    user_prompt = format_tool_context(tool_context)
    result = await description_agent.run(user_prompt)
    return result.output
```

### 2.5 OpenRouter optional headers

OpenRouter supports analytics headers через PydanticAI's HTTP client config:

```python
# generation-engine/llm/client.py

import httpx
from pydantic_ai.providers.openai import OpenAIProvider

def get_openrouter_provider() -> OpenAIProvider:
    """
    OpenRouter с custom headers для analytics.
    Headers показывают app в OpenRouter leaderboards.
    """
    custom_client = httpx.AsyncClient(
        headers={
            "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "https://mcpgen.dev"),
            "X-Title": os.environ.get("OPENROUTER_X_TITLE", "MCPGen"),
        },
    )
    
    return OpenAIProvider(
        base_url=os.environ["OPENROUTER_BASE_URL"],
        api_key=os.environ["OPENROUTER_API_KEY"],
        http_client=custom_client,
    )
```

### 2.6 Sampling parameters

Qwen3-Coder работает в non-thinking mode. Recommended sampling params:

```python
from pydantic_ai.settings import ModelSettings

# Default settings для creative tasks (descriptions, parameter docs)
CREATIVE_SETTINGS = ModelSettings(
    temperature=0.3,         # low — мы хотим consistent quality
    top_p=0.9,
    max_tokens=2048,
)

# Settings для classification tasks (annotations, smell scan)
CLASSIFICATION_SETTINGS = ModelSettings(
    temperature=0.0,         # deterministic для classifications
    top_p=1.0,
    max_tokens=512,
)

# Settings для code generation (Stage E если нужно — но мы используем templates)
CODEGEN_SETTINGS = ModelSettings(
    temperature=0.2,
    top_p=0.95,
    max_tokens=4096,
)
```

Apply при call:

```python
result = await agent.run(prompt, model_settings=CREATIVE_SETTINGS)
```

---

## 3. Affected files / docs

Эти решения из предыдущих docs **OVERRIDDEN** этим файлом:

### 3.1 `mcpgen-architecture.md`
- Tech stack table → row "LLM" — заменить на "Qwen3-Coder via OpenRouter"
- Любое упоминание LiteLLM → удалить (не нужен с single provider)

### 3.2 `mcpgen-generation-engine-v2.md`
- Все упоминания "Sonnet 4.7", "Haiku 4.5", "Opus" → "Qwen3-Coder"
- Multi-model strategy в Pass selection → single model

### 3.3 `mcpgen-pass-0-design.md` через `mcpgen-pass-5-design.md`
- "Sonnet 4.7" → Qwen3-Coder
- "Haiku 4.5" → Qwen3-Coder (single model handles все tasks)
- Cost estimates per pass — see § 5 ниже для recalculated numbers

### 3.4 `mcpgen-stage-f-design.md` (CRITICAL — see § 4)
- Multi-family judges (Sonnet + GPT-5 + Gemini) → 3-shuffle single-model approach
- Это требует methodology adjustment

### 3.5 `mcpgen-deployment-and-dependencies.md`
- LLM APIs section → single OpenRouter dependency
- Cost calculations → recalculated (см. § 5)

---

## 4. Impact на multi-judge strategy (Stage F2)

### 4.1 Проблема

Original Stage F2 design relied на **3 multi-family judges** (Anthropic + OpenAI + Google) per MCP-Bench finding (86.67% human agreement). Single model family = single bias = lower stability.

### 4.2 Mitigations с single model

Поскольку используем только Qwen3-Coder, employ эти techniques:

**Technique 1: Increased prompt shuffling**

Вместо 3 judges с shuffling, делаем **1 judge с 5-shuffle** averaging:

```python
async def smell_scan_with_shuffles(tool: ToolDef, shuffles: int = 5) -> ScanResult:
    """
    Run F2 smell scan через one model с N prompt shuffles.
    Average scores reduce variance.
    """
    judge = make_agent(
        output_type=RubricScore,
        system_prompt=SMELL_SCAN_PROMPT,
    )
    
    scores = []
    for shuffle_idx in range(shuffles):
        # Shuffle component order in prompt to prevent position bias
        shuffled_prompt = shuffle_rubric_components(tool, shuffle_idx)
        result = await judge.run(
            shuffled_prompt,
            model_settings=ModelSettings(temperature=0.3),  # some variance
        )
        scores.append(result.output)
    
    return aggregate_scores(scores)
```

**Technique 2: Different temperatures**

Run same prompt N times с varying temperatures:

```python
TEMPERATURE_PROFILES = [0.0, 0.2, 0.5]  # variance в judging

# 3 calls × 5 shuffles = 15 evaluations per tool
```

**Technique 3: Self-critique loop**

Have model critique its own first answer:

```python
# Pass 1: initial scoring
initial_score = await judge.run(rubric_prompt)

# Pass 2: critique
critique_prompt = f"""
You scored this tool description as: {initial_score}.
Re-examine. Are there issues you missed? Are scores too generous or harsh?
Provide updated scores с rationale.
"""
final_score = await judge.run(critique_prompt)
```

**Technique 4: Calibration с human labels**

Quarterly re-calibration с human evaluators (per MCP-Bench methodology):
- Sample 30 tools
- Human scores
- Compare с our judge scores
- Adjust prompts if drift detected

### 4.3 Quality expectations

С single model, expect:
- ~75-80% human agreement (vs 86.67% с 3 multi-family judges)
- Variance немного выше — mitigated через shuffling
- Bias одинаковый для всех evaluations (consistent но possibly skewed)

**Acceptable trade-off** для cost reduction в 10x. Critical regression detection still works через absolute scores (если description scores 1, это очевидно bad независимо от judge).

### 4.4 Future option: multi-model F2 only

Если quality F2 становится bottleneck, можно add second judge model для F2 only (не для generation passes):

```python
# Future: F2 multi-judge возвращается только для validation
F2_JUDGES = [
    {"model": "qwen/qwen3-coder", "weight": 0.5},
    {"model": "anthropic/claude-haiku-4-5", "weight": 0.5},  # cheap second opinion
]
```

Это сохраняет cheap generation (single Qwen) но adds reliability к validation. Defer к когда нужно.

---

## 5. Recalculated costs

### 5.1 Per generation cost (typical 10-tool server)

```
Pass 0 (Inventory):     ~50K tokens × $0.14/M input + 5K × $0.80/M output 
                        = $0.007 + $0.004 = $0.011
Pass 1 (Six-Tool):      ~30K input + 8K output = $0.004 + $0.006 = $0.010
Pass 2 (Description):   ~80K input + 20K output = $0.011 + $0.016 = $0.027
Pass 3 (Parameters):    ~60K input + 15K output = $0.008 + $0.012 = $0.020
Pass 4 (Annotations):   ~10K input + 2K output = $0.001 + $0.002 = $0.003
Pass 5 (Response):      ~30K input + 8K output = $0.004 + $0.006 = $0.010

Stage F2 (5-shuffle):   ~50K input + 10K output = $0.007 + $0.008 = $0.015

Stage F3 (если enabled): ~100K input + 30K output = $0.014 + $0.024 = $0.038

────────────────────────────────────────────────
Total without F3:       ~$0.10 per generation
Total with F3:          ~$0.13 per generation
```

**vs. original multi-model:** $1-3 per generation → **10-20x cheaper**.

### 5.2 Updated phase costs

```
Phase 1 (development, months 1-3):
  Cost reduction:   $20-50 → $5-15 для LLM testing
  Total infra+LLM:  $7-20/month (vs $25-60 original)

Phase 2 (10-50 customers):
  100-200 generations × $0.13 = $13-26/month
  Total:           $25-50/month (vs $115-340 original)

Phase 3 (100+ customers):
  ~5000 generations × $0.13 = $650/month
  Total:           $700-1000/month (vs $700-2300 original)
```

**Big win:** phase 1-2 становятся practically free для dev/testing.

---

## 6. Updated env file template

`.env.example` (single source for all services):

```bash
# === LLM (OpenRouter only) ===
OPENROUTER_API_KEY=sk-or-v1-                    # ← FILL THIS IN
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
PRIMARY_MODEL=qwen/qwen3-coder

# Optional OpenRouter analytics
OPENROUTER_HTTP_REFERER=https://mcpgen.dev
OPENROUTER_X_TITLE=MCPGen

# === Database ===
DATABASE_URL=postgresql://mcpgen:dev@localhost:5432/mcpgen_dev

# === Observability ===
LANGFUSE_HOST=http://localhost:3001
LANGFUSE_PUBLIC_KEY=pk-lf-
LANGFUSE_SECRET_KEY=sk-lf-

# === Auth ===
LOGTO_ENDPOINT=https://your-tenant.logto.app
LOGTO_APP_ID=
LOGTO_APP_SECRET=

# === Storage ===
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=mcpgen-generated

# === Other services ===
STRIPE_SECRET_KEY=sk_test_
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# === Environment ===
ENVIRONMENT=development
```

---

## 7. Trade-offs explicitly acknowledged

### 7.1 Quality

**Risk:** Qwen3-Coder может уступать Claude Sonnet 4.7 в:
- Описания на нестандартных языках (русский, китайский — должно быть ok, но надо проверить)
- Творческие parts описаний (метафоры, аналогии)
- Edge cases где требуется broad world knowledge

**Mitigation:**
- Stage F1 + F2 catch obvious quality issues
- Stage F3 agent eval (с real Sonnet agent в test — это тестовый агент, не наш generator) catches downstream impact
- Iterative prompt refinement based на eval results

### 7.2 Multi-judge robustness

**Risk:** Single model = single bias в F2.

**Mitigation:** § 4 techniques (shuffling, temperature variance, self-critique).

**Future option:** add second model только для F2 если needed.

### 7.3 Vendor risk

**Risk:** OpenRouter outage = entire pipeline down.

**Mitigation:**
- OpenRouter сам proxy'ит много providers — у них есть redundancy
- В коде использовать OpenAI-compatible interface — switching providers = change 2 env vars
- Future: add fallback к direct provider (e.g., DashScope для Qwen) если OpenRouter недоступен

### 7.4 Function calling support

**Verify:** Qwen3-Coder supports OpenAI-compatible tool/function calling format. Это критично для PydanticAI structured outputs (через function calling под капотом).

Per OpenRouter docs: Qwen3-Coder "integrates well с OpenAI-compatible tool-use formats" — должно работать.

**Action:** test в первый день implementation с real PydanticAI structured output. Если issues — fallback model option `qwen/qwen3-30b-a3b-instruct` (тоже supports function calling).

---

## 8. Validation plan для week 1

Перед commitment к full implementation, validate Qwen3-Coder works для our use cases:

### Day 1 spike test (2 hours)

```python
# scripts/qwen_smoke_test.py

import asyncio
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
import os

class ToolDescription(BaseModel):
    purpose: str
    guidelines: list[str]
    limitations: list[str]
    example_parameter_value: str

async def main():
    provider = OpenAIProvider(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    model = OpenAIModel("qwen/qwen3-coder", provider=provider)
    
    agent = Agent(
        model=model,
        output_type=ToolDescription,
        system_prompt="""You write MCP tool descriptions following the 6-component rubric:
        Purpose, Guidelines, Limitations, Parameters, Length, Examples.""",
    )
    
    result = await agent.run("""
    Generate description for tool 'search' that searches across all entity types
    in a Stripe MCP server. Returns smart IDs.
    """)
    
    print("Output:", result.output)
    print("Usage:", result.usage())

if __name__ == "__main__":
    asyncio.run(main())
```

**Acceptance criteria:**
- ✅ Returns valid ToolDescription structure (function calling works)
- ✅ Description quality looks reasonable (не obvious garbage)
- ✅ Latency < 10s for typical generation
- ✅ Cost matches expected (~$0.001 per call)

If any fail → investigate, possibly switch model variant before full implementation.

---

## 9. Final decisions

1. ✅ **`qwen/qwen3-coder`** as ONLY model для всех tasks
2. ✅ **OpenRouter** as ONLY provider
3. ✅ **PydanticAI с OpenAIProvider** для integration (OpenAI-compatible API)
4. ✅ **Drop LiteLLM** — не нужен с single provider
5. ✅ **Drop multi-family judges** в F2 — replace с shuffling+temperature variance
6. ✅ **Single env var** для API key: `OPENROUTER_API_KEY`
7. ✅ **Smoke test первый день** перед full commitment
8. ✅ **Future option** оставлен: add second model для F2 если quality issue

---

## 10. Sources

1. **OpenRouter Qwen3-Coder** — https://openrouter.ai/qwen/qwen3-coder
2. **OpenRouter PydanticAI integration** — https://openrouter.ai/docs/guides/community/pydantic-ai
3. **PydanticAI OpenAI-compatible models** — https://ai.pydantic.dev/models/openai/
4. **Qwen3-Coder model card** — https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct
