# MCPGen — Архитектурный документ

> **Статус:** v0.9 — pre-MVP. Generation Engine — отдельный v2 doc; **все 6 passes (0–5) + 2 stages (E, F) имеют detail design ✅**.
> **Дата:** апрель 2026, обновлено 2026-04-26.
> **Покрытие:** компоненты, стек, потоки данных, data model, observability, биллинг, миграционные пути.
>
> ⚠ **Engine source-of-truth hierarchy:**
> 1. [`mcpgen-pass-0-design.md`](mcpgen-pass-0-design.md) — Pass 0 detail (filtering, naming, auth detect, drift)
> 2. [`mcpgen-pass-1-design.md`](mcpgen-pass-1-design.md) — Pass 1 detail (Tool Consolidation via Six-Tool Pattern, smart IDs, routing, coverage)
> 3. [`mcpgen-pass-2-design.md`](mcpgen-pass-2-design.md) — Pass 2 detail (Description Authoring, length budgets per tool type, inline quality gate, forbidden patterns)
> 4. [`mcpgen-pass-3-design.md`](mcpgen-pass-3-design.md) — Pass 3 detail (Parameter Specification, JSON Schema, naming/format/enums/defaults/description, filter design 3 approaches, smart ID patterns, standard parameter sets)
> 5. [`mcpgen-pass-4-design.md`](mcpgen-pass-4-design.md) — Pass 4 detail (Annotations Inference, tool-type rules, verb pattern matching, openWorldHint invariant, workflow conservative aggregation, title generation)
> 6. [`mcpgen-pass-5-design.md`](mcpgen-pass-5-design.md) — Pass 5 detail (Response Shaping: outputSchema MCP 2025-06-18, pagination strategies, field filtering, truncation thresholds + teaching guidance, response_format)
> 7. [`mcpgen-stage-e-design.md`](mcpgen-stage-e-design.md) — Stage E detail (Codegen: 100% deterministic Jinja2 templates, Native MCP tools, CF Workers, ~25–30 files, 3 auth modes, TS validation built-in)
> 8. [`mcpgen-stage-f-design.md`](mcpgen-stage-f-design.md) — Stage F detail (Validation 3 tiers: F1 static + F2 smell scan + F3 agent eval; **F2 models = Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro**; targeted retry orchestration; quality badges)
> 9. [`mcpgen-generation-engine-v2.md`](mcpgen-generation-engine-v2.md) — overall pipeline, IR, validation, eval
> 10. Эта секция (§5) — system-level summary для архитектурного контекста
>
> При расхождении: detail-design > v2 > architecture.

---

## 0. Конвенции документа

- **Зафиксированные решения** помечены ✅
- **Решения по умолчанию, требующие подтверждения** помечены ⚠️
- **Открытые вопросы** помечены ❓
- Все диаграммы — ASCII (живут в git без зависимостей; для production-документации позже мигрировать в Mermaid / Excalidraw).
- `t0` = момент запуска MVP. `t+N` = N месяцев после запуска.

---

## 1. Product Snapshot

**MCPGen** — генератор MCP-серверов из любого API (OpenAPI / GraphQL / Postman) с автоматической **MCP-quality** оптимизацией по best practices Anthropic + paper rubric, валидированный реальным агентом. Open-source CLI + managed cloud.

**Главное обещание (v2):** не «дешевле в токенах», а **«единственный, кто валидирует качество и применяет полный set best practices Anthropic»**. Token efficiency — побочный эффект (через composite tools — Pass 1), НЕ цель.

> ⚠ **Изменение vs v1:** старая формулировка «50–70% дешевле в токенах через сжатие descriptions» устарела после research review (Anthropic engineering blog "Writing effective tools for agents"; arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!"; MCP spec 2025-03-26). Anthropic явно говорит **не оптимизировать по длине**, а делать описания **explicit** (вплоть до сотен токенов на complex tools). Полное обоснование смены философии — [`mcpgen-generation-engine-v2.md` §0](mcpgen-generation-engine-v2.md). Фактический moat: 97.1% существующих MCP-серверов имеют ≥1 smell (paper) — мы единственные, кто их валидирует.

**Три ICP:**
- **A. The Wrapper** — solo developer, обернувший чужой API для своего workflow. Приходит через CLI/GitHub.
- **B. The API Provider** — стартап с REST API, желающий предложить MCP клиентам. Приходит через лендинг.
- **C. The Internal Tools Engineer** — AI engineer, оборачивающий внутренние сервисы. Приходит через Discord/комьюнити.

**Бизнес-модель:** usage-based (per tool-call, per generation, **per F3 agent eval run**). См. §10.

---

## 2. Архитектурные принципы

**Engine принципы (v2):**

0a. **Quality > compression.** Длина description — instrumental, не цель. Цель — task success rate агента, который использует tool. Длинные descriptions (сотни токенов) допустимы и поощряются для сложных tools.

0b. **Eval-driven generation.** Каждый сгенерированный сервер проходит agent-based evaluation (F3) перед deployment. Без eval — нет права говорить "MCP-quality".

0c. **Best-practice as default.** 6 description-компонентов + 4 tool annotations + namespacing — по умолчанию. Opt-out возможен, opt-in не нужен.

0d. **Build-time decisions over runtime hopes.** Архитектурные ограничения (tiered tool caps 30/50/80, composite synthesis, multi-server split) — на генерации. Не полагаемся на runtime tool selection агента.

0e. **Determinism where possible.** LLM — только там, где нужен natural-language reasoning. Annotations, structural validation, naming patterns — детерминированные правила, LLM только верифицирует edge cases.

**System принципы:**

1. **Чистая граница между TS и Python.** TS — для всего user-facing и operational. Python — только для LLM-оркестрации в Generation Engine. Связь — один HTTP API. Никакого дублирования логики.

2. **Open-core distribution.** CLI и базовый генератор — open source (MIT). Managed cloud, optimization passes, observability, billing — closed.

3. **Edge-first runtime для MCP-серверов.** Сгенерированные серверы — это HTTP-translators. Workers-стиль > VM-стиль. Не платим за idle VM на каждого тенанта.

4. **Vendor-flexible internals.** Никакой бизнес-логики в vendor-specific API глубже одного слоя. Любой компонент должен мигрироваться за выходные. **Особенно:** model routing — через config (`model_routing.yaml`), смена Opus/Sonnet/GPT — git commit, не refactor.

5. **Stateless wherever possible.** Generation Engine, BFF, MCP runtimes — все stateless. Состояние живёт только в БД и object storage.

6. **Cost transparency by design.** Каждая операция (LLM call, tool call, generation, eval) → usage event → видно в дашборде юзера И в нашем cost tracking. Никаких чёрных дыр в bill.

7. **Solo-friendly ops.** Managed services > self-host везде, где разница в цене < 30% от revenue. Время соло-фаундера дороже инфры.

8. **Caching is first-class.** Repeated generation того же spec'а не вызывает LLM (4 layer cache strategy, см. §12). Это критично для unit economics.

---

## 3. Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER-FACING LAYER                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Web App    │    │     CLI      │    │  Public API  │               │
│  │  (Next.js)   │    │ (TS, Bun)    │    │  (REST/SSE)  │               │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘               │
│         └─────────┬─────────┴───────────────────┘                        │
└───────────────────┼──────────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          CONTROL PLANE                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  BFF / Gateway │  │  Auth (Logto)  │  │  Drift Watcher │             │
│  │  Hono on CF    │  │                │  │  (Inngest cron)│             │
│  │  Workers       │  │                │  │                │             │
│  └────────┬───────┘  └────────────────┘  └────────────────┘             │
│           │                                                              │
│           │ HTTPS (job submission + SSE callback)                        │
└───────────┼─────────────────────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             GENERATION ENGINE v2  (полная спецификация — §5 / engine-v2.md) │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  FastAPI app on Fly.io Machines (auto-suspend)                 │     │
│  │                                                                  │     │
│  │  Stage A   Stage B            Stage C            Stage D        │     │
│  │  Parse  →  Architect (Opus) → Author (Sonnet,‖)→ Shape (Sonnet)│     │
│  │  (det)     P0 Inventory       P2 Description     P5 Response   │     │
│  │            P1 Six-Tool        P3 Parameters                     │     │
│  │               Pattern         P4 Annotations                    │     │
│  │                                  │                              │     │
│  │                                  ▼                              │     │
│  │  Stage E Codegen (Jinja2, det) → Stage F Validate              │     │
│  │                                  F1 Static (tsc/ajv/bundle)    │     │
│  │                                  F2 Smell scan (3 judges)      │     │
│  │                                  F3 Agent eval (sandbox+golden)│     │
│  │                                                                  │     │
│  │              ┌────────────────┐                                 │     │
│  │              │   LiteLLM      │  → Anthropic, OpenAI, Gemini   │     │
│  │              │   (gateway)    │  (fallback via model_routing.yaml)│  │
│  │              └────────┬───────┘                                 │     │
│  │                       └─→ OTel → Langfuse v4                   │     │
│  └────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          RUNTIME PLANE                                   │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Cloudflare Workers for Platforms (dispatch namespace)         │     │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  ...      │     │
│  │  │ tenant-1-mcp │ │ tenant-2-mcp │ │ tenant-N-mcp │           │     │
│  │  │ (TS, MCP SDK)│ │ (TS, MCP SDK)│ │ (TS, MCP SDK)│           │     │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘           │     │
│  └─────────┼─────────────────┼─────────────────┼──────────────────┘     │
│            │                 │                 │                         │
│            └─────────────────┴─────────────────┘                         │
│                              │ usage events (fire-and-forget)            │
│                              ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Usage Event Pipeline                                          │     │
│  │  CF Queue → Inngest worker → TimescaleDB + Stripe Meters       │     │
│  └────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA & TELEMETRY                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐    │
│  │ PostgreSQL   │  │   Cloudflare │  │ TimescaleDB  │  │ Langfuse │    │
│  │ (Neon)       │  │      R2      │  │ (in Neon)    │  │  Cloud   │    │
│  │ + pgvector   │  │   (artifacts)│  │  (analytics) │  │  v4      │    │
│  │ (metadata)   │  │              │  │              │  │  (LLM)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Технологический стек (финал)

### 4.1 Сводная таблица

| Слой | Технология | Hosting | Статус |
|---|---|---|---|
| **Frontend** | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui | Vercel ⚠️ | ✅ |
| **CLI** | TypeScript + Commander.js + Bun (compile to single binary) | npm + GitHub releases | ✅ |
| **Control Plane API** | Hono + TypeScript + Bun runtime | Cloudflare Workers | ✅ |
| **Generation Engine** | Python 3.12 + FastAPI + PydanticAI + LiteLLM | Fly.io Machines (auto-suspend) | ✅ |
| **Generated MCP servers** | TypeScript + `@modelcontextprotocol/sdk` | CF Workers for Platforms | ✅ |
| **OLTP DB** | PostgreSQL 16 + pgvector + TimescaleDB | Neon | ✅ |
| **Object Storage** | R2 (S3-compatible) | Cloudflare | ✅ |
| **Auth** | Logto | Logto Cloud free tier ⚠️ → self-host @ t+3mo | ⚠️ |
| **Background jobs** | Inngest | Inngest Cloud | ✅ |
| **Billing** | Stripe Billing + Meters API | Stripe | ✅ |
| **LLM tracing** | Langfuse v4 (OTel) | Langfuse Cloud free → self-host позже | ✅ |
| **Error tracking** | Sentry | Sentry Cloud | ✅ |
| **Logs/uptime** | BetterStack | BetterStack Cloud | ✅ |
| **Email** | Resend | Resend | ✅ |
| **DNS / CDN** | Cloudflare | Cloudflare | ✅ |

### 4.2 Решения, требующие подтверждения

⚠️ **Frontend на Vercel vs Cloudflare Pages.** Vercel — родной хост Next.js, ISR/Server Actions работают без сюрпризов. CF Pages поддерживает Next.js, но с edge-runtime ограничениями. **Рекомендация: Vercel на t0–t+6mo, миграция на CF Pages при росте трафика для консолидации vendor'ов.**

⚠️ **Auth на старте — Logto Cloud free tier (до 5K MAU бесплатно).** На t+3mo миграция на self-hosted Logto в отдельный Fly Machine. Обоснование: на старте важнее не отвлекаться на ops; self-host добавляется когда есть пользователи и есть смысл экономить.

---

## 5. Generation Engine — system-level summary (v2)

> ⚠ **Полная спецификация Generation Engine — в [`docs/mcpgen-generation-engine-v2.md`](mcpgen-generation-engine-v2.md).** Эта секция — system-level summary для контекста архитектуры. При расхождении v2-документ — источник истины. Любые изменения логики passes/IR/validation — через update v2 + entry в decision log.

### 5.0 Что изменилось vs v1 (важно)

После research review (Anthropic engineering blog "Writing effective tools for agents", arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!", MCP spec 2025-03-26 на tool annotations):

- **Цель сместилась:** v1 = «сжать descriptions на 50–70%». v2 = «MCP-quality по best practices Anthropic + paper rubric, валидированный реальным агентом». Token efficiency — побочный эффект (через composite tools), НЕ цель.
- **Pipeline переструктурирован:** 6 sequential passes → 6 LLM passes сгруппированы в 3 stages (Architect / Author / Shape) + 3 deterministic stages (Parse / Codegen / F1 Static) + agent-eval stage (F3).
- **Появились tool annotations** (4 hints из MCP spec 2025-03-26) — обязательная часть каждого tool.
- **Появилось agent-based eval** (F3) с golden tasks и success-rate threshold ≥ 70%.
- **Появился rubric smell scan** (F2) — 3 multi-family judges. ⚠ **Models ОБНОВЛЕНЫ Stage F design:** Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro (НЕ Haiku/mini/flash как было раньше — per MCP-Bench paper). Threshold ≥ 4.0 (НЕ ≥ 3 как было). Prompt shuffling × score averaging для stability. Achieves 86.67% agreement с human evaluators.
- **Pass 1 = Six-Tool Pattern (Pass 1 detail design):** ~50 Pass 0 tool plans → 6–12 final tools через canonical structure (`search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete` + actions/workflows/specialized). Industry consensus (Anthropic + OpenAI + MCP Bundles, October 2025). Empirical ~70% token savings. **⭐ главный token-efficiency mechanism.**
- **Smart IDs (Pass 1):** `{server}:{type}:{collection}:{identifier}` — routing logic в ID format, не в tool definition.
- **OpenAI compliance (Pass 1):** `search`/`fetch` exact single-string signatures для ChatGPT Deep Research integration.
- **Coverage 100% mandatory (Pass 1):** ни один Pass 0 endpoint не теряется. Validation в Phase 4.
- **Hard caps (tiered, см. Pass 0 + Pass 1 design):**
  - **Pass 0 intermediate output:** ≤30 ok / 31–50 force Pass 1 / 51–80 aggressive merge or fail / >80 hard fail. Pro override до 100.
  - **Pass 1 final output:** target 6–12 tools, 13–15 acceptable для action-heavy APIs, > 15 warning.
  - Max bundle 1MB, max spec 10MB, max 2 retries/pass, cost cap $0.50 free / $2.00 pro.
- **Naming convention уточнена:**
  - Pass 0 intermediate plans: `{resource}_{action}` (`charges_create`).
  - Pass 1 final tools: 6 universal без префикса (`search`, `fetch`, ...) + actions `{namespace}_{verb}` (`charges_capture`).
- **target_complexity user control:** `minimal` ≤15 / `standard` ≤50 / `comprehensive` up to cap.
- **Pass 2 = Description Authoring (Pass 2 detail design):** 5 of 6 paper rubric components в v0 (Examples deferred к v1.1). Different prompt templates per tool type (universal/action/workflow/specialized). Length budgets per type (universal 200–400 / action 100–200 / workflow 150–300 / specialized 80–150 tokens). Per-tool parallel Sonnet 4.7 (concurrency 10). Inline Phase 3 quality gate (single Haiku judge, abbreviated 4-component rubric). Examples ONLY from spec (никогда LLM-hallucinated). Forbidden patterns regex (marketing speak).
- **`Guidelines` schema уточнена (Pass 2):** добавлено поле `when_not_to_use: list[str] | None` для tools с близкими альтернативами; `how_to_use` теперь `str | None` (НЕ `list[str]`). `parameter_overview: str` (Pass 2 high-level) отделён от `parameter_doc: dict[str, ParamDoc]` (Pass 3 per-param).
- **Pass 3 = Parameter Specification (Pass 3 detail design):** production-ready JSON Schema (`inputSchema`) с rich per-parameter descriptions. Главная цель — устранить **Opaque Parameters smell** (84.3% существующих MCP). 5 dimensions: naming · format/constraints · enums · defaults · description. **5-component MCP Bundles template** для каждого parameter description (what / format / when / example / default). **Filter parameter — 3 approaches** (deterministic selection): structured object (default) / DSL string / individual params. Smart ID pattern auto-generated из Pass 1 SmartIdSchema. Standard parameter sets для universal tools (Pass 3 design Appendix A). 4-phase pipeline (det extraction → LLM enrichment ‖×20 → cross-param validation → inline Haiku gate). Cost ~$0.30–0.50 per server.
- **Naming normalization (Pass 3):** explicit правила: `user → user_id`, `data → payload`, `id (ambiguous) → {entity}_id`, `time → created_at`, `status → {entity}_status`.
- **Pass 4 = Annotations Inference (Pass 4 detail design):** 4 boolean MCP hints + `title` для каждого tool. **80% deterministic** через **tool-type rules** (НЕ HTTP method, как было в pre-Pass-1 logic) + verb pattern matching. Haiku LLM только для edge cases (~1–3 tools/server). 3-phase pipeline (deterministic rules → LLM judgment selectively → consistency validation). Cost ~$0.01–0.05 (самый дешёвый pass), 5–15s.
- **⭐ Architectural invariant (Pass 4):** `openWorldHint = true` ВСЕГДА (мы wrap external REST APIs). Hardcoded.
- **⚠ MCP defaults опасны:** `destructiveHint: true`, `openWorldHint: true` by default → Pass 4 ВСЕГДА выставляет все 4 явно (иначе каждый tool вызывает confirmation prompts в Cursor).
- **Workflow tools — conservative aggregation (Pass 4):** worst-case across sub-operations (`readOnly = AND`, `destructive = OR`, `idempotent = AND`).
- **Pass 5 = Response Shaping (Pass 5 detail design):** устраняет **response token bloat** (часто больше чем schema bloat). **5 mechanisms:** (1) outputSchema generation MCP 2025-06-18 (NEW обязательный для всех tools), (2) pagination strategy + defaults (cursor/offset/page-number, auto-detect; default `limit=25`, `max_limit=100`), (3) field filtering (always-include / opt-in via `properties` / always-exclude), (4) truncation thresholds **per tool type** (search 10K / list 15K / fetch 20K / action 5K / workflow 15K — НЕ единый 25K, как в старой v2) + teaching guidance templates, (5) optional `response_format` enum (summary/detailed/raw) только для > 20 fields. 5-phase pipeline. ~70% deterministic, Haiku только для field importance ranking. Cost ~$0.05–0.15, 15–25s.
- **`ResponseConfig` schema refined (Pass 5):** `pagination` + `field_filtering` + `truncation` + `has_response_format_param`. Старые поля `truncation_threshold_tokens=25000`, `response_format_options`, `semantic_id_mapping`, `field_inclusion_concise/detailed` — устарели. Smart IDs handled by Pass 1, не Pass 5.
- **`outputSchema` (Pass 5, NEW):** MCP 2025-06-18 standard — каждый tool получает JSON Schema для response. `structuredContent + content` dual return для backward compat.
- **`FinalTool` (Pass 5 output):** `inputSchema` (Pass 3) + `outputSchema` (Pass 5) + `annotations` (Pass 4) + `response_config` (Pass 5) + `description` (Pass 2). Ready для codegen.
- **Cost модель пересчитана:** Pass 2/3/5 cost снижены пропорционально (10 final tools после Pass 1 vs 50 baseline) + Pass 3 учитывает per-parameter parallelism (~80 params на 10 tools) + inline Haiku gates + Pass 5 учитывает Haiku field ranking + outputSchema generation. Total ~$1.25 без caching, ~$0.65 с Anthropic prompt caching.
- **Запрещено:** `search_tools` runtime meta-tool, LLM-generated examples без real traces, LLM в Stage A/E/F1.

### 5.1 Pipeline overview

```
                    OpenAPI / GraphQL / Postman input
                                  │
                                  ▼
           ┌──────────────────────────────────────┐
           │   STAGE A: PARSE & NORMALIZE         │  deterministic, no LLM
           │   prance → RawIR + dependency_graph  │
           └────────────────┬─────────────────────┘
                            ▼
           ┌──────────────────────────────────────┐
           │   STAGE B: ARCHITECT     (Opus 4.7)  │
           │   Pass 0: Tool Inventory & Naming    │  tiered caps, 3 internal stages, auth detect
           │           (см. pass-0-design.md)     │  → ~30–50 tool plans
           │   Pass 1: Six-Tool Pattern Consol.   │  4 phases: classify → synth → routing → coverage
           │           (см. pass-1-design.md)     │  ⭐ ~50 → 6–12 tools, ~70% savings
           │           6 universal: search/fetch  │     + actions/workflows/specialized
           │           list_collections/_objects  │     smart IDs: {server}:{type}:{coll}:{id}
           │           upsert/delete              │     OpenAI compliance (search/fetch sig)
           └────────────────┬─────────────────────┘
                            ▼  ToolTaxonomy
           ┌──────────────────────────────────────┐
           │   STAGE C: AUTHOR  (Sonnet 4.7, ‖)   │  per-tool parallel (concurrency=10)
           │   Pass 2: Description Authoring      │  5 of 6 paper rubric (Examples deferred v1.1)
           │           (см. pass-2-design.md)     │  templates per tool type · length budgets · inline gate
           │   Pass 3: Parameter Specification    │  production-ready JSON Schema + 5-comp param descriptions
           │           (см. pass-3-design.md)     │  filter design (3 approaches) · smart ID patterns · standard sets
           │                                       │  ⭐ устраняет Opaque Parameters smell (84.3% MCP)
           │   Pass 4: Annotations Inference      │  4 MCP hints + title, 80% det (tool-type rules + verb patterns)
           │           (см. pass-4-design.md)     │  ⭐ openWorldHint=true ВСЕГДА · Haiku ТОЛЬКО для edge cases
           │                                       │  workflow conservative agg (worst-case across subs)
           └────────────────┬─────────────────────┘
                            ▼  AuthoredTools
           ┌──────────────────────────────────────┐
           │   STAGE D: RUNTIME SHAPING           │  mostly deterministic + Sonnet
           │   Pass 5: Response Shaping           │  outputSchema (MCP 2025-06-18) + 5 mechanisms
           │           (см. pass-5-design.md)     │  pagination · field filtering · truncation per type · response_format
           │                                       │  ⭐ устраняет response token bloat (10x reduction example)
           └────────────────┬─────────────────────┘
                            ▼  CompleteServerSpec
           ┌──────────────────────────────────────┐
           │   STAGE E: CODEGEN                   │  deterministic, Jinja2 → ZIP
           └────────────────┬─────────────────────┘
                            ▼
           ┌──────────────────────────────────────┐
           │   STAGE F: VALIDATE                  │
           │   F1 Static: tsc, ajv, ESLint, bundle, MCP spec compliance │
           │   F2 Smell scan: 6×5×3 multi-family judges, ≥3 threshold   │
           │   F3 Agent eval: Sonnet 4.7 in loop vs golden tasks, ≥70%  │
           └────────────────┬─────────────────────┘
                            ▼  Final Artifact + QualityReport
                  → ZIP в R2, transcripts в R2 (для Pro inspection)
                  → SSE callback в Control Plane → Frontend
```

**Stage = retry boundary.** Failure внутри stage не требует переделывать предыдущие.

### 5.2 Universal IR (v2)

Все парсеры выдают одну структуру. Позволяет добавлять input-форматы (GraphQL, gRPC, AsyncAPI) и output-генераторы (Python, Rust) без переписывания pipeline'а.

```python
class Tool(BaseModel):
    # Identity
    name: str                              # 6 universal: search/fetch/list_collections/list_objects/upsert/delete
                                           # Or extra: action ({namespace}_{verb}) / workflow ({action}_{resource}) / specialized
    type: Literal["universal", "action", "workflow", "specialized"]
    namespace: str | None                  # для actions: "charges" (resource); для universal: None

    # Authoring (Stage C)
    description: ToolDescription           # 6 paper rubric components
    parameters: list[Parameter]
    annotations: ToolAnnotations           # 4 MCP spec hints

    # Runtime (Stage D)
    response_config: ResponseConfig

    # Pass 1 outputs — routing
    routing_rules: list[RoutingRule]       # для universal: param values → upstream endpoint
    upstream: UpstreamCall | None          # для action — single endpoint
    workflow: WorkflowDef | None           # для workflow — multi-step

    # Source tracking
    source_endpoints: list[str]            # все Pass 0 endpoints, которые этот tool subsumes

    # Quality metrics (после F2/F3)
    quality_score: float | None
    eval_success_rate: float | None
    estimated_input_tokens: int
    estimated_output_tokens_p50: int

    # Flags
    needs_manual_review: bool
    has_examples: bool                     # false на v0


class ToolDescription(BaseModel):           # Pass 2 design — 5 of 6 paper rubric components в v0
    purpose: str                            # Component 1: 1–3 предложения (Pass 2)
    guidelines: Guidelines                  # Component 2 (Pass 2): when_to_use + when_not_to_use + how_to_use
    limitations: list[str]                  # Component 3 (Pass 2)
    parameter_overview: str                 # Component 4 high-level (Pass 2, 150-300 chars)
    parameter_doc: dict[str, ParamDoc]      # Component 4 per-param details (Pass 3)
    examples: list[Example] | None          # Component 6: null v0 unless from spec; никакой LLM-hallucinated


class Guidelines(BaseModel):                # Pass 2 design
    when_to_use: list[str]                  # bullets — concrete situations
    when_not_to_use: list[str] | None       # для tools с близкими альтернативами (universal vs alts)
    how_to_use: str | None                  # str (НЕ list[str]) — для нетривиальных tools


class ToolAnnotations(BaseModel):           # MCP spec 2025-03-26
    title: str | None
    readOnlyHint: bool | None
    destructiveHint: bool | None
    idempotentHint: bool | None
    openWorldHint: bool | None


class ResponseConfig(BaseModel):                # Pass 5 design — refined schema
    pagination: PaginationConfig | None         # для list-type tools
    field_filtering: FieldFilteringConfig | None  # always-include / opt-in / always-exclude
    truncation: TruncationConfig                # threshold (per tool type) + guidance template
    has_response_format_param: bool             # response_format enum (summary/detailed/raw)


class PaginationConfig(BaseModel):              # Pass 5 design
    strategy: Literal["cursor", "offset", "page_number"]
    cursor_param_name: str | None               # "cursor", "page_token", "next_token"
    cursor_response_field: str                  # "next_cursor", "nextCursor"
    default_limit: int                          # 25
    max_limit: int                              # 100


class FieldFilteringConfig(BaseModel):          # Pass 5 design
    default_fields: list[str]                   # always-include (id, status, name, timestamps, required)
    optional_fields: list[str]                  # opt-in via properties param (verbose, metadata, blobs)
    excluded_fields: list[str]                  # always-exclude (sensitive PII, internal, deprecated)


class TruncationConfig(BaseModel):              # Pass 5 design
    threshold_tokens: int                       # per tool type: search 10K / list 15K / fetch 20K / action 5K / workflow 15K
    guidance_template: str                      # teaching message с {N}, {Total}, {action} placeholders
    truncation_strategy: Literal["paginate", "filter", "summarize"]


# > ⚠ Старые поля `truncation_threshold_tokens=25000`, `response_format_options`,
# > `semantic_id_mapping`, `field_inclusion_concise/detailed` — устарели после Pass 5 detail design.


# Pass 1 — Six-Tool Pattern routing
class SmartIdSchema(BaseModel):             # для server smart IDs: {server}:{type}:{coll}:{id}
    server_prefix: str                      # "stripe"
    types: list[str]                        # ["object", "collection", "schema"]
    collections: list[CollectionDef]        # все collections с identifier patterns


class CollectionDef(BaseModel):
    name: str                               # "Charge"
    identifier_pattern: str                 # "ch_[A-Za-z0-9]+"
    upstream_path: str                      # "/v1/charges/{id}"


class RoutingRule(BaseModel):               # как universal tool params → upstream
    tool: str                               # "fetch", "upsert", ...
    condition: dict                         # {id_type: "object", collection: "Charge"}
    upstream_method: str
    upstream_path: str
    parameter_mapping: dict


class WorkflowDef(BaseModel):               # для workflow tools (Pass 1 extras)
    orchestration: Literal["sequential", "parallel", "conditional"]
    sub_calls: list[UpstreamCall]
    handles_partial_failure: bool
    intermediate_state: dict | None


class GeneratedServer(BaseModel):
    project_id: str
    tools: list[Tool]                       # каждый имеет inputSchema + outputSchema + annotations + response_config
    auth: AuthConfig
    rate_limits: RateLimitConfig
    quality_report: QualityReport           # smell + eval scores


# FinalTool (Pass 5 output) — production-ready definition для codegen
class FinalTool(BaseModel):
    name: str
    description: ToolDescription            # Pass 2
    inputSchema: JsonSchema                 # Pass 3 — production-ready JSON Schema
    outputSchema: JsonSchema                # Pass 5 — NEW MCP 2025-06-18 standard
    annotations: ToolAnnotations            # Pass 4 — 4 hints + title
    response_config: ResponseConfig         # Pass 5 — pagination + filtering + truncation
```

→ Полная IR-схема с `Guidelines`, `ParamDoc`, `QualityReport`, `EvalReport`: [`mcpgen-generation-engine-v2.md` §9.6](mcpgen-generation-engine-v2.md).

### 5.3 Six LLM passes (3 stages)

Каждый pass — PydanticAI агент со structured output schema, валидацией, retry-логикой. Routing моделей — через config (`model_routing.yaml`), не код.

| # | Pass | Stage | Модель (primary) | Что делает | Параллель |
|---|---|---|---|---|---|
| 0 | **Tool Inventory & Naming** | B Architect | Opus 4.7 | Filter (det) → categorize (LLM) → validate. Tiered caps 30/50/80. Auth detect. → ~30–50 tool plans + composite_candidates. См. pass-0-design.md | per-namespace |
| 1 | **Six-Tool Pattern Consolidation** | B Architect | Opus 4.7 (Phase 2) | 4 phases: classify → schema synth → routing → coverage validate. ~50 tool plans → 6 universal (`search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete`) + actions/workflows/specialized. Smart IDs. OpenAI compliance. **⭐ главный token-efficiency механизм (~70% savings).** См. pass-1-design.md | Phase 2 single call |
| 2 | **Description Authoring** | C Author | Sonnet 4.7 (+ Haiku 4.5 inline gate) | 5 of 6 paper rubric components в v0 (Examples deferred v1.1). Different prompt templates per tool type (universal/action/workflow/specialized). Length budgets per type. Inline Phase 3 quality gate (single Haiku, abbreviated 4-component rubric). Forbidden patterns regex. Examples ONLY from spec. См. pass-2-design.md | per-tool, concurrency 10 |
| 3 | **Parameter Specification** | C Author | Sonnet 4.7 (+ Haiku 4.5 inline gate) | Production-ready JSON Schema + 5-component MCP Bundles param descriptions. 5 dimensions: naming · format/constraints · enums · defaults · description. Filter design — 3 approaches (structured object / DSL / individual). Smart ID patterns auto-generated из Pass 1 SmartIdSchema. Standard parameter sets для universal tools. 4 phases: det extraction → LLM enrichment ‖×20 → cross-param validation → inline Haiku gate. **⭐ устраняет Opaque Parameters smell (84.3% MCP).** См. pass-3-design.md | per-parameter, concurrency 20 |
| 4 | **Annotations Inference** | C Author | 80% rules / Haiku 4.5 для edge cases | 4 boolean MCP hints + title. **⭐ openWorldHint=true ВСЕГДА** (architectural invariant). **Tool-type rules** (НЕ HTTP method): универсальные read tools → readOnly+idempotent; upsert → !destructive,!idempotent; delete → destructive+idempotent. Action verb pattern matching (Pass 4 Appendix B): `_refund/_cancel/_archive` → destructive; `_capture/_unlock` → !destructive. Workflow conservative aggregation (worst-case across subs). Title gen — det snake_case → Title Case. 3 phases: det rules → LLM judgment selectively → consistency validation. Самый дешёвый pass: ~$0.01–0.05, 5–15s. См. pass-4-design.md | per-tool, concurrency 5 |
| 5 | **Response Shaping** | D Shape | Haiku 4.5 для field ranking (~30% LLM, 70% deterministic) | **5 mechanisms:** (1) **outputSchema generation** (NEW MCP 2025-06-18, обязательный) — `structuredContent + content` dual return; (2) pagination strategy auto-detect (cursor/offset/page-number, default `limit=25` `max_limit=100`); (3) field filtering (always-include / opt-in via `properties` / always-exclude); (4) truncation thresholds **per tool type** (search 10K / list 15K / fetch 20K / action 5K / workflow 15K) + teaching guidance templates с placeholders; (5) optional `response_format` enum (summary/detailed/raw) только для > 20 fields. ⭐ устраняет response token bloat (10x reduction example: HRIS 80K → 8K). 5-phase pipeline. См. pass-5-design.md | Phase 3 per-tool, concurrency 10 |

**Anthropic Prompt Caching** агрессивно — system prompt каждого pass'а структурирован (CACHED 2000–3000 tokens с rubric + guidelines + examples; NOT CACHED — input). Effect: -90% input cost на repeated calls в 5-min window.

**Model routing config:**

```yaml
# model_routing.yaml
passes:
  inventory:       { primary: claude-opus-4.7,    fallback: gpt-5,            temperature: 0.3 }
  composite:       { primary: claude-opus-4.7,    fallback: gpt-5,            temperature: 0.5 }
  description:     { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.5 }
  parameters:      { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.2 }
  annotations:     { primary: claude-haiku-4.5,   fallback: gpt-5-mini,       temperature: 0.0 }
  response_shape:  { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.3 }
  # Stage F design ОБНОВИЛ models для F2 — production quality bar (per MCP-Bench)
  smell_judge_a:   { primary: claude-sonnet-4.7,  fallback: claude-haiku-4.5, temperature: 0.0 }
  smell_judge_b:   { primary: gpt-5,              fallback: gpt-5-mini,    temperature: 0.0 }
  smell_judge_c:   { primary: gemini-3.5-pro,     fallback: gemini-flash,  temperature: 0.0 }
  eval_agent:      { primary: claude-sonnet-4.7 }

cost_caps:
  per_generation_usd: 2.00
  per_pass_usd: 0.50
  daily_org_usd: 50.00
```

### 5.4 Validation pipeline (3 layers, fail-fast)

| Layer | Что проверяет | Cost | Failure handling |
|---|---|---|---|
| **F1 Static** | `tsc --noEmit`, `ajv` (JSON Schema 7) per inputSchema, ESLint, bundle size < 1MB сжато, MCP spec compliance (`tools/list`, `tools/call`) | ~5s, $0 | Hard error, alert разработчику. **НЕ fix через LLM retry** — это bug в наших шаблонах |
| **F2 Smell scan** | Rubric scoring: 6 components × 5-point scale × **3 multi-family judges Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro** (Stage F design ОБНОВИЛ — НЕ Haiku/mini/flash как было). Prompt shuffling × score averaging для stability. Threshold avg ≥ **4.0** (Stage F design — НЕ ≥ 3) | $0.20–0.50 на сервер с 10 tools | Per-component failure → targeted retry: Purpose<3 → Pass 2; Parameter<3 → Pass 3; etc. Max 2 retries per tool. После — flag "needs_manual_review" |
| **F3 Agent eval** | Реальный Sonnet 4.7 в loop'е (max 10 turns) против golden tasks. Сервер деплоится в sandbox CF Worker namespace (TTL 1 час). Threshold success rate ≥ 70% | $0.20–0.50 per gen | Below threshold → flag affected tools, retry, или ship с warning "unverified" |

**Golden tasks source:**
- **Pre-curated** для popular APIs (Stripe, GitHub, Notion, Linear, Slack) — вручную, по 5–10 на category.
- **Auto-generated** через LLM из endpoint patterns для custom user specs (помечаются "auto-generated tasks").
- **User-provided** — Pro feature на v1.1.

**Pricing implication:** Free tier 1 eval/мес (beyond — generation works, eval skipped, помечен "unverified") · Pro 5/мес included · Pay-as-you-go $0.50/eval.

### 5.5 Quality Score (public-facing 0–5)

```
overall_score = 0.30·smell_avg + 0.40·eval_success_rate·5 + 0.20·annotations_completeness·5 + 0.10·composite_ratio·5
```

Показывается на dashboard владельца (всегда). Public quality badge в README сгенерированного сервера — **opt-in only**, не auto-public.

### 5.6 Caching (4 layers — overlaps с §12)

L1 spec-level (sha256 spec → full pre-generated artifact для popular APIs) · L2 pass-level (`pass_name+version+input_hash+model_id` → pass output) · L3 tool-level (per-tool partial hits) · L4 Anthropic prompt caching (auto, 5-min TTL, –90% input cost).

Hit-rate targets: L1 30% (popular APIs), L2 80% при regen того же spec'а, L3 90%+ при partial spec change.

### 5.7 Cost модель

На примере Stripe API (350 endpoints → Pass 0 ~50 plans → **Pass 1 → ~10 final tools** через Six-Tool Pattern):

| Stage / Pass | Calls | Avg in tokens | Avg out tokens | Est cost |
|---|---|---|---|---|
| Pass 0 (Inventory) | 1 | ~30,000 | ~3,000 | $0.10 |
| Pass 1 (Six-Tool Pattern) | 1 | ~10,000 | ~2,000 | $0.05 |
| Pass 2 (Description, Sonnet) | 10 | ~1,500 (cached) | ~300 | $0.30 |
| Pass 2 inline gate (Haiku judge) | 10 | ~800 | ~200 | $0.05 |
| Pass 3 (Parameters, Sonnet, ~80 params parallel ×20) | ~80 | ~800 (cached) | ~200 | $0.25 |
| Pass 3 inline gate (Haiku judge) | 10 | ~600 | ~150 | $0.05 |
| Pass 4 (Annotations, ~80% deterministic + Haiku for 1–3 edge cases) | ~3 | ~500 | ~100 | $0.02 |
| Pass 5 (Response shaping, Haiku field ranking ‖×10 + template guidance + outputSchema gen) | ~5 | ~800 (cached) | ~250 | $0.10 |
| F2 Smell scan | 10 × 3 judges | ~600 | ~200 | $0.05 |
| F3 Agent eval | 5 tasks × ~10 turns | ~5,000 | ~500 | $0.30 |
| **Total** | | | | **~$1.25** |

С Anthropic prompt caching (90% discount на cached parts) — **~$0.65 per generation**.

> ⚠ Старые цифры (Pass 2/3/5 × 50 tools) были pre-Pass-1 baseline. После Pass 1 Six-Tool Pattern финальный tool count → 6–12. Pass 3 cost учитывает per-parameter (~80 params) parallelism + inline Haiku gate. Pass 5 cost учитывает Haiku field ranking + outputSchema generation (MCP 2025-06-18).

### 5.8 API контракт между Control Plane и Generation Engine

Чистый HTTP, один endpoint:

```
POST /api/v1/generate
Content-Type: application/json
Authorization: Bearer <internal-jwt>

{
  "job_id": "gen_abc123",
  "spec": { "type": "url", "value": "https://api.stripe.com/openapi.json" },
  "options": {
    "target_lang": "typescript",     // только TS на v0
    "categories": ["charges", "customers"],   // optional namespace filter
    "max_tools": 50,                  // hard cap
    "run_eval": true,                 // F3 agent eval (cost gating)
    "cost_cap_usd": 2.00
  },
  "callback_url": "https://api.mcpgen.dev/internal/jobs/gen_abc123/events"
}

→ 202 Accepted (job started, will stream events to callback_url)
```

**Streaming через callback:** Generation Engine при каждом завершённом stage'е (A/B/C/D/E/F1/F2/F3) POST'ит event в callback_url с partial result. Control Plane проксирует это в SSE-канал к browser'у. Никакого WebSocket complexity.

### 5.9 Auto-suspend и cold start

Fly Machines auto-suspend через 5 минут idle. Cold start ≈ 1.5 сек.

**Митигации:**
- Keep-warm: Inngest cron каждые 4 минуты пингует `/health`.
- Параллельно cold-start'у — UI стримит "Parsing spec..." статус, пользователь не замечает.
- Для очень мелких specs (<20 endpoints) — генерация прямо в Control Plane Worker через минимальный TS-генератор (без LLM-passes). Pass-only-on-demand.

### 5.10 Что НЕ в MVP (v0) — explicit

- **Examples generation через execution traces** — `examples = null` для большинства tools. Никакой LLM-hallucinated examples. v1.1 + sandbox с upstream credentials.
- **Progressive disclosure / `search_tools` meta-tool** — полностью отказались. 90% LLM не дообучены, останавливаются после первого вызова. Вместо: hard cap 50 tools + composite synthesis + multi-server pattern.
- **Custom rubric customization** — фиксированные 6 components paper rubric. Pro v1.1.
- **Multi-language code generation** — TypeScript only на v0. IR независим, Python (FastMCP) — roadmap.
- **Smart tool-call response caching в runtime** — отдельная feature, не часть Generation Engine.

---

## 6. Runtime Plane — где живут сгенерированные MCP-серверы

### 6.1 Workers for Platforms architecture

CF Workers for Platforms даёт нам **dispatch namespace** — изолированное пространство, где каждый tenant имеет свой Worker. Доступ через единый `dispatch worker`, который маршрутизирует входящий запрос в нужный tenant.

```
                    Internet
                       │
                       ▼
       ┌────────────────────────────────┐
       │  Dispatch Worker (мы пишем)    │
       │  - extract subdomain/path      │
       │  - lookup tenant in cache      │
       │  - rate limit check            │
       │  - auth pre-check              │
       │  - dispatch to tenant Worker   │
       └────────────┬───────────────────┘
                    ▼
       ┌────────────────────────────────┐
       │  tenant-namespace              │
       │  ┌──────┐ ┌──────┐ ┌──────┐  │
       │  │ T1   │ │ T2   │ │ ... │   │
       │  │Worker│ │Worker│ │      │   │
       │  └──┬───┘ └──┬───┘ └──┬───┘  │
       └─────┼────────┼────────┼──────┘
             │        │        │
             ▼        ▼        ▼
        Stripe    GitHub   ...upstream APIs
```

**Tenant Worker structure (что генерируется):**

```typescript
// Generated tenant Worker (v2 — Six-Tool Pattern from Pass 1 + actions + workflows)
import { McpServer } from "@modelcontextprotocol/sdk";
import { runtime } from "@mcpgen/runtime"; // наш SDK

const server = new McpServer({ name: "stripe-mcp", version: "1.0.0" });

// SmartIdSchema + RoutingConfig инжектится из Pass 1 output
const SMART_ID_SCHEMA = STRIPE_SMART_ID_SCHEMA;            // {server: "stripe", types: [object|collection|schema], collections: [...]}
const ROUTING_CONFIG = STRIPE_ROUTING_CONFIG;              // smart routing rules per universal tool

// === 6 UNIVERSAL TOOLS (Pass 1 — Six-Tool Pattern) ===

// 1. search — OpenAI standard signature (single string)
server.tool({
  name: "search",
  description: SEARCH_DESCRIPTION,                         // v2: 6 paper rubric components
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ query }, ctx) => runtime.routeSearch(query, { schema: SMART_ID_SCHEMA, routing: ROUTING_CONFIG, auth: ctx.auth }));

// 2. fetch — OpenAI standard signature (single string smart ID)
server.tool({
  name: "fetch",
  description: FETCH_DESCRIPTION,
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ id }, ctx) => runtime.routeFetch(id, { schema: SMART_ID_SCHEMA, routing: ROUTING_CONFIG, auth: ctx.auth }));

// 3. list_collections, 4. list_objects — rich parameters
server.tool({ name: "list_collections", ... });
server.tool({ name: "list_objects", ... });

// 5. upsert — smart routing: create OR update; single OR batch
server.tool({
  name: "upsert",
  description: UPSERT_DESCRIPTION,
  inputSchema: UPSERT_SCHEMA,                              // collection, data (obj|array), id?, ids?
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async (params, ctx) => runtime.routeUpsert(params, { routing: ROUTING_CONFIG, auth: ctx.auth }));

// 6. delete — smart routing по type parameter
server.tool({
  name: "delete",
  description: DELETE_DESCRIPTION,
  inputSchema: DELETE_SCHEMA,                              // type: "object"|"objects"|"collection", id?, ids?, collection?, confirm
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
}, async (params, ctx) => runtime.routeDelete(params, { routing: ROUTING_CONFIG, auth: ctx.auth }));

// === EXTRA TOOLS (Pass 1 — sparingly, strict gates) ===

// Action tool — POST с side effect, не CRUD (не fits в upsert)
server.tool({
  name: "charges_capture",                                 // {namespace}_{verb}
  description: CHARGES_CAPTURE_DESCRIPTION,
  inputSchema: { type: "object", properties: { id: { type: "string" }, amount: { type: "integer" } }, required: ["id"] },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async (params, ctx) => runtime.callUpstream({
  method: "POST",
  url: `https://api.stripe.com/v1/charges/${params.id}/capture`,
  body: { amount: params.amount },
  auth: ctx.auth,
  timeout: 30000,
}));

// Workflow tool (rare — strict gate: prescribed + recoverable + positive token economy)
server.tool({
  name: "get_customer_context",                            // {action}_{resource}
  description: GET_CUSTOMER_CONTEXT_DESCRIPTION,
  inputSchema: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async (params, ctx) => runtime.callWorkflow({
  orchestration: "sequential",
  sub_calls: [
    { method: "GET", url: `/v1/customers/${params.customer_id}` },
    { method: "GET", url: `/v1/charges?customer=${params.customer_id}&limit=10` },
    { method: "GET", url: `/v1/subscriptions?customer=${params.customer_id}` },
  ],
  auth: ctx.auth,
  timeout: 30000,
  handles_partial_failure: true,
}));

// runtime SDK автоматически:
// - emit usage events (per tool call → CF Queue → TimescaleDB + Stripe Meters)
// - apply rate limits (per-API-key + per-tenant quota)
// - apply ResponseConfig (truncation 25K tokens default, pagination, response_format, semantic IDs)
// - log errors to Sentry (без upstream response bodies — privacy)
// - handle auth pass-through (decrypt X-Upstream-Auth, never log)

export default server.export();
```

### 6.2 Tenant isolation

- Каждый Worker имеет свой namespace, не видит других.
- Лимиты CPU/memory — per-Worker, выставлены в Workers for Platforms config.
- Secrets (если tenant выбрал stored credentials) — в KV namespace на per-tenant key, encrypted (см. §14).
- Logs из tenant Worker — в отдельный stream в BetterStack, по `tenant_id` tag.

### 6.3 Auth model для входящих MCP-запросов

Tenant Worker принимает три auth-режима:

1. **API key (default).** Header `Authorization: Bearer <key>`. Key выдан при deploy, валидируется через Logto introspection endpoint. Cached в Worker memory (5 min TTL).
2. **OAuth 2.1.** MCP-клиент проходит OAuth flow через Logto. Tenant Worker валидирует JWT. Используется когда tenant хочет давать доступ end-user'ам своим (не себе).
3. **None (public).** Только для open API без секретов; маркируется в UI красным.

### 6.4 Pass-through credentials (важно!)

Самая чувствительная часть. Когда MCP-сервер общается с upstream API (Stripe), нужен Stripe key.

**Default режим — pass-through:**
- Клиент агента (Claude Desktop) хранит Stripe key у себя.
- При каждом MCP-запросе агент передаёт key в headers (`X-Upstream-Auth: <encrypted-blob>`).
- Tenant Worker форварднет в upstream без сохранения.
- **Мы никогда не видим и не храним Stripe key.**

**Альтернативный режим — stored credentials:**
- Tenant explicit'но загружает upstream key через UI.
- Key encrypts через CF KV-encryption + per-tenant DEK (см. §14).
- Используется когда: API key tenant'а, не end-user'а; или single-user setup.
- Маркируется в UI как "less secure" mode.

---

## 7. Data Model

### 7.1 PostgreSQL schemas (Neon)

```sql
-- Identity
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  logto_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free',  -- free|pro|team|enterprise
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  logto_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  org_id UUID REFERENCES organizations,
  role TEXT NOT NULL,  -- owner|admin|member
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (один project = один MCP-server config)
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT,           -- watched URL для drift detection
  source_type TEXT NOT NULL, -- openapi|graphql|postman
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- Spec snapshots (versioned)
CREATE TABLE specs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects NOT NULL,
  version INT NOT NULL,
  content_hash TEXT NOT NULL,  -- sha256
  r2_key TEXT NOT NULL,        -- ссылка на оригинальный spec в R2
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  endpoint_count INT,
  UNIQUE (project_id, version)
);

-- Generations (v2 — добавлены quality_report + eval поля)
CREATE TABLE generations (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects NOT NULL,
  spec_id UUID REFERENCES specs NOT NULL,
  status TEXT NOT NULL,            -- queued|stage_a|stage_b|stage_c|stage_d|stage_e|f1|f2|f3|completed|failed
  current_stage TEXT,              -- для SSE streaming UI: a|b|c|d|e|f1|f2|f3
  options JSONB NOT NULL,          -- target_lang, categories, max_tools, run_eval, cost_cap
  ir JSONB,                        -- v2 universal IR (Tools с ToolDescription/Annotations/ResponseConfig)
  artifact_r2_key TEXT,            -- ZIP с generated code
  quality_report JSONB,            -- v2: smell_report (F2) + eval_report (F3) + per-tool scores
  quality_score NUMERIC(3,2),      -- v2: overall 0-5 (см. v2 §12 формула)
  is_publishable BOOLEAN,          -- v2: все required gates passed
  eval_skipped BOOLEAN DEFAULT FALSE,  -- v2: free tier beyond quota
  eval_transcripts_r2_key TEXT,    -- v2: для Pro inspection
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  llm_cost_usd NUMERIC(10,6),      -- сумма всех stages
  llm_cost_breakdown JSONB         -- {pass_0: 0.10, pass_1: 0.05, ..., f2: 0.15, f3: 0.30}
);

-- Deployments (active live MCP servers)
CREATE TABLE deployments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects NOT NULL,
  generation_id UUID REFERENCES generations NOT NULL,
  cf_worker_name TEXT NOT NULL,  -- name in dispatch namespace
  url TEXT NOT NULL,
  auth_mode TEXT NOT NULL,   -- api_key|oauth|none
  api_key_hash TEXT,         -- if api_key mode
  is_active BOOLEAN DEFAULT TRUE,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- Tools (denormalized for semantic search & analytics)
CREATE TABLE tools (
  id UUID PRIMARY KEY,
  generation_id UUID REFERENCES generations NOT NULL,
  name TEXT NOT NULL,                    -- snake_case, {resource}_{action} (charges_create) — Pass 0 design
  type TEXT NOT NULL,                    -- v2: regular|composite
  namespace TEXT NOT NULL,               -- v2: resource only ("charges") — server name даёт service prefix
  description JSONB NOT NULL,            -- v2: full ToolDescription (6 paper rubric components)
  parameters JSONB NOT NULL,             -- v2: list[Parameter] с format hints, examples, common_mistakes
  annotations JSONB NOT NULL,            -- v2: 4 MCP hints (readOnly/destructive/idempotent/openWorld)
  response_config JSONB,                 -- v2: pagination, truncation, response_format options
  source_endpoints TEXT[] NOT NULL,      -- v2: для composite — multiple
  estimated_input_tokens INT NOT NULL,
  estimated_output_tokens_p50 INT,
  quality_score NUMERIC(3,2),            -- v2: после F2 smell scan
  eval_success_rate NUMERIC(3,2),        -- v2: после F3 agent eval (per-tool, если есть task)
  needs_manual_review BOOLEAN DEFAULT FALSE,  -- v2: failed F2 после max retries
  has_examples BOOLEAN DEFAULT FALSE,    -- v2: false на v0 (см. v2 §10.1)
  embedding VECTOR(1024)                 -- pgvector для tool retrieval
);
CREATE INDEX ON tools USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON tools (generation_id, namespace);
CREATE INDEX ON tools (needs_manual_review) WHERE needs_manual_review = TRUE;
```

### 7.2 TimescaleDB hypertables (в той же Neon)

```sql
-- Usage events (для analytics dashboard и биллинга)
CREATE TABLE usage_events (
  time TIMESTAMPTZ NOT NULL,
  deployment_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  tokens_in INT,
  tokens_out INT,
  upstream_latency_ms INT,
  worker_cpu_ms INT,
  status TEXT NOT NULL,  -- ok|error|rate_limited
  client_type TEXT,      -- claude_desktop|cursor|cline|custom
  error_class TEXT
);
SELECT create_hypertable('usage_events', 'time');
CREATE INDEX ON usage_events (deployment_id, time DESC);

-- Continuous aggregates для быстрых dashboard queries
CREATE MATERIALIZED VIEW usage_hourly
WITH (timescaledb.continuous) AS
SELECT
  deployment_id,
  time_bucket('1 hour', time) AS bucket,
  COUNT(*) AS calls,
  SUM(tokens_in + tokens_out) AS total_tokens,
  AVG(upstream_latency_ms) AS avg_latency,
  COUNT(*) FILTER (WHERE status = 'error') AS errors
FROM usage_events
GROUP BY deployment_id, bucket;
```

### 7.3 Что лежит в R2

| Bucket | Содержимое | TTL |
|---|---|---|
| `mcpgen-specs` | Оригинальные OpenAPI/GraphQL specs (versioned by hash) | бессрочно для активных, 90д для archived |
| `mcpgen-artifacts` | Generated code ZIPs | 30 дней (после — re-generate at user request) |
| `mcpgen-public-cache` | Pre-generated outputs популярных API (Stripe, GitHub, etc.) — Layer 1 cache | бессрочно, пересобирать при изменении spec |
| `mcpgen-eval-transcripts` | **v2:** F3 agent eval transcripts (для Pro inspection и debug failed tasks) | 30 дней |
| `mcpgen-golden-tasks` | **v2:** pre-curated golden tasks для popular APIs (Stripe/GitHub/Notion/Linear/Slack) | бессрочно (versioned) |

---

## 8. Critical Data Flows

### 8.1 Generate flow (v2 — с детализацией)

```
Browser           Hono BFF        Inngest      Generation Engine            LiteLLM    DB    Sandbox CF
   │                 │               │                │                         │         │       │
   │─POST /generate─►│               │                │                         │         │       │
   │  {url, opts,    │               │                │                         │         │       │
   │   run_eval}     │               │                │                         │         │       │
   │                 │─INSERT generations (status=queued) ─────────────────────────────►│       │
   │                 │─enqueue job──►│                │                         │         │       │
   │◄─SSE: started───│               │                │                         │         │       │
   │                 │               │─trigger───────►│                         │         │       │
   │                 │               │                │                         │         │       │
   │                 │               │                │─Stage A: Parse → RawIR  │         │       │
   │◄─SSE: stage_a───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │─Stage B (Opus, P0+P1)──►│         │       │
   │                 │               │                │  Inventory + Six-Tool   │         │       │
   │                 │               │                │      Pattern Consol.    │         │       │
   │◄─SSE: stage_b───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │─Stage C (Sonnet ‖, ──── ►│         │       │
   │                 │               │                │  P2+P3+P4 per-tool)     │         │       │
   │◄─SSE: stage_c───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │─Stage D (Sonnet, P5)───►│         │       │
   │◄─SSE: stage_d───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │─Stage E: Codegen (Jinja2)         │       │
   │                 │               │                │─F1: tsc/ajv/bundle/MCP compliance │       │
   │                 │               │                │─F2: smell scan (3 judges)─►       │       │
   │                 │               │                │  retry pass per failed component  │       │
   │◄─SSE: f2_done───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │  if run_eval && eval_quota ok:    │       │
   │                 │               │                │    deploy to sandbox CF ─────────────────►│
   │                 │               │                │    F3: Sonnet agent vs golden tasks       │
   │                 │               │                │    upload transcripts to R2     │       │
   │◄─SSE: f3_done───│◄────────callback───────────────│                         │         │       │
   │                 │               │                │─upload ZIP → R2                  │       │
   │                 │               │                │─UPDATE generations ──────────────►│       │
   │                 │               │                │  (status=completed, quality_report,
   │                 │               │                │   eval_transcripts_r2_key, llm_cost_breakdown)
   │                 │── SSE: completed ◄─────callback│                         │         │       │
   │◄─final result───│               │                │                         │         │       │
   │  (download,     │               │                │                         │         │       │
   │   QualityReport,│               │                │                         │         │       │
   │   eval scores)  │               │                │                         │         │       │
```

**Ключевые гарантии (v2):**
- Stage = retry boundary (см. v2 §2). Failure внутри stage не требует переделывать предыдущие.
- Если Generation Engine упал во время stage — Inngest retry с idempotent `job_id`, продолжает с границы stage.
- Если Browser отключился — job всё равно доходит; пользователь видит результат + QualityReport при перезагрузке страницы.
- F3 eval skip'ается на free tier beyond quota; QualityReport помечается `eval_skipped=true`, `is_publishable` зависит от F2 only.
- Cost cap (per-generation/per-pass/daily-org) — hard fail с partial result + актуальный bill, никаких "сюрпризов".
- Полный trace через Langfuse OTel — каждый pass + judge + eval agent трейсятся отдельно (session_id = generation.id).

### 8.2 Deploy flow

```
Browser → Hono BFF
            │
            ├── 1. Read generation.artifact_r2_key from DB
            ├── 2. Read code from R2
            ├── 3. Inject runtime config (auth, rate limits, tenant_id)
            ├── 4. CF API: PUT /accounts/.../workers/dispatch/namespaces/.../scripts/{worker_name}
            │       Body: bundled script + metadata
            ├── 5. Generate API key, store hash in DB
            ├── 6. INSERT deployment record
            └── 7. Return { url, api_key (one-time view), config_snippets }
```

### 8.3 MCP request flow (production hot path)

```
Claude Desktop                    Dispatch Worker         Tenant Worker          Upstream API
      │                                  │                      │                      │
      │── POST /mcp ────────────────────►│                      │                      │
      │   tool: create_charge            │                      │                      │
      │                                  │── auth check         │                      │
      │                                  │── rate limit check   │                      │
      │                                  │── lookup tenant ────►│                      │
      │                                  │   (cached)           │                      │
      │                                  │                      │── call Stripe ──────►│
      │                                  │                      │◄── response ─────────│
      │                                  │                      │                      │
      │                                  │                      │── apply ResponseConfig│
      │                                  │                      │   (truncation 25K,   │
      │                                  │                      │    pagination,        │
      │                                  │                      │    response_format,   │
      │                                  │                      │    semantic IDs)      │
      │                                  │                      │── ctx.waitUntil(     │
      │                                  │                      │     emit usage event)│
      │◄────────────────────────── return result ───────────────│                      │
      │                                  │                      │                      │
      │                                  │                      │── (async) → CF Queue │
      │                                  │                      │              ↓       │
      │                                  │                      │       Inngest worker │
      │                                  │                      │              ↓       │
      │                                  │                      │       TimescaleDB +  │
      │                                  │                      │       Stripe Meters  │
```

**P99 latency budget:**
- Auth + rate limit + dispatch overhead: **< 30ms**
- Upstream call: variable (Stripe ~100ms)
- Response transformation: **< 10ms**
- Total overhead над upstream: **< 50ms**

### 8.4 Drift detection flow

```
Inngest cron (daily 02:00 UTC)
   │
   ├── List active projects WHERE source_url IS NOT NULL
   ├── For each:
   │     ├── Fetch current spec (HEAD → GET if changed)
   │     ├── Compute hash; compare with latest specs.content_hash
   │     ├── If different:
   │     │     ├── INSERT new specs row (version + 1)
   │     │     ├── Compute structural diff (added/removed/modified endpoints)
   │     │     ├── Generate diff summary via LLM (Sonnet, ~500 tokens)
   │     │     ├── Send email via Resend (with diff summary + dashboard link)
   │     │     └── (Optional, paid feature) Auto-regenerate
   │     └── Log to BetterStack
```

---

## 9. Authentication & Authorization

### 9.1 Logto setup

```
Logto handles:
   ├── User auth (web app login)
   ├── Org/tenant management
   ├── API key issuance (для CLI)
   ├── OAuth 2.1 server (для MCP clients)
   └── M2M tokens (между нашими services)
```

### 9.2 Auth flows by surface

| Surface | Auth method | Token type |
|---|---|---|
| Web app login | Logto sign-in (email/password, GitHub) | Session cookie |
| CLI | `mcpgen login` → device-code OAuth flow | Long-lived API key |
| Public REST API | API key via `Authorization: Bearer ...` | Same |
| Internal: BFF → Generation Engine | M2M token (Logto Client Credentials) | JWT |
| MCP client → tenant Worker | Per-tenant API key OR OAuth 2.1 | Configurable |

### 9.3 OAuth 2.1 для MCP — самая интересная часть

MCP spec поддерживает OAuth 2.1 с PKCE. Когда tenant выбирает OAuth-режим для своего MCP-сервера, мы:

1. Регистрируем OAuth client в Logto под `tenant_id` realm.
2. В config tenant Worker'а — pre-configured authorization endpoint.
3. MCP-клиент инициирует flow, получает access token, передаёт в каждом request.
4. Tenant Worker валидирует JWT через Logto introspection endpoint (с кэшем).

Это даёт tenant'у возможность давать доступ end-user'ам к его MCP-серверу с гранулярными scopes.

---

## 10. Billing & Usage Metering

### 10.1 Architecture

```
Tenant Worker
    │ (ctx.waitUntil)
    ▼
CF Queue
    │
    ▼
Inngest worker (batch every 60s)
    │
    ├──► TimescaleDB (полные events для analytics)
    └──► Stripe Meters API (агрегированные счётчики)
```

### 10.2 Stripe Meters setup

Мы определяем четыре meters в Stripe (v2):

```
mcpgen_tool_calls         // counter, used in subscription overage
mcpgen_generations        // counter, paid per-generation (включает все 6 LLM passes)
mcpgen_evals              // counter, paid per F3 agent eval run (~$0.50 cost)
mcpgen_storage_gb_hours   // gauge, hosted servers storage
```

> ⚠ v1-meter `mcpgen_optimization_runs` устарел — после v2 разделили на `mcpgen_generations` (passes 0–5) и `mcpgen_evals` (F3 agent eval, дорогая часть pipeline).

Каждый event отправляется в Stripe Meters раз в минуту батчем:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "mcpgen_tool_calls",
  payload: {
    stripe_customer_id: org.stripe_customer_id,
    value: "1",
    deployment_id: deployment.id,  // dimension
  },
  identifier: `${deployment.id}_${timestamp}`,  // idempotency
});
```

Stripe сам считает invoice в конце billing period с tier-based pricing.

### 10.3 Pricing rules (v2)

| Plan | Monthly base | Tool calls included | Overage | Generations included | Overage gen | F3 Agent evals included | Overage eval |
|---|---|---|---|---|---|---|---|
| Free | $0 | 100K | hard block | 3/mo | $0.50 each | **1/mo** | skip (помечается "unverified") |
| Pro | $19 | 1M | $0.0001 | 25/mo | $0.20 each | **5/mo** | $0.50 each |
| Team | $99 | 10M | $0.00005 | 200/mo | $0.10 each | **50/mo** | $0.30 each |
| Enterprise | custom | custom | custom | custom | custom | custom | custom |

**Изменения vs v1:**
- Разделили `optimization_runs` на два meter'а: `mcpgen_generations` (passes 0–5, ~$0.80 cost) и `mcpgen_evals` (F3 agent eval, ~$0.50 cost). Это две разные единицы — generation always runs, eval — gating-able.
- Free tier получает 1 eval/мес для пробы; beyond — generation работает, F3 skipped, QualityReport помечается "unverified".
- Pro/Team — F3 включён по умолчанию для гарантии quality.

---

## 11. Observability Stack

### 11.1 Layers

| Layer | Tool | Что отслеживается |
|---|---|---|
| **LLM operations** | Langfuse v4 | Все Generation Engine LLM calls с trace, cost, evals |
| **Application errors** | Sentry | TS + Python exceptions, source maps |
| **Logs** | BetterStack | Structured JSON logs из всех services |
| **Uptime** | BetterStack Uptime | Public endpoints + tenant samples |
| **Metrics (system)** | BetterStack + Workers Analytics | CPU, memory, request rate per service |
| **Customer-facing analytics** | TimescaleDB → custom dashboard | Tool calls, latency, errors per tenant |

### 11.2 Langfuse v4 integration

PydanticAI имеет нативный OpenTelemetry instrumentation. Конфигурация:

```python
import logfire
from pydantic_ai import Agent

logfire.configure(
    service_name="mcpgen-generator",
    send_to_logfire=False,  # NO Logfire SaaS
    otlp_endpoint="https://cloud.langfuse.com/api/public/otel",  # Langfuse OTel ingest
    otlp_headers={"Authorization": f"Basic {LANGFUSE_AUTH}"},
)
logfire.instrument_pydantic_ai()

# теперь все agent.run() автоматически трейсятся
```

Каждый trace содержит:
- session_id = generation.id
- user_id = user.id
- tags = [pass_name, target_lang, plan_tier]
- cost (auto-computed by LiteLLM)

### 11.3 Что логируем (важно для приватности)

- **OK:** generation metadata, tool names, IR structure, performance metrics, error traces.
- **NOT OK:** spec content (часто содержит internal API), upstream API responses (могут содержать PII), upstream auth credentials.
- **Hashed:** content_hash for spec deduplication.

---

## 12. Caching Strategy

### 12.1 Layers (v2 — generation-side reorganized)

```
┌────────────────────────────────────────────────────────────┐
│ L1: Spec-level cache (R2)                                  │
│   key: sha256(spec_content)                                │
│   value: pre-generated FULL artifact (popular APIs)        │
│   Hit-rate target: 30%                                     │
│   TTL: до next drift detection                             │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ L2: Pass-level cache (Postgres)                            │
│   key: (pass_name, pass_version, input_hash, model_id)     │
│   value: pass output object                                │
│   Hit-rate target: 80% при regeneration того же spec'а     │
│   TTL: бессрочно (invalidate on spec change)               │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ L3: Tool-level cache (Postgres)                            │
│   key: (tool_signature_hash, pass_name, pass_version)      │
│   value: per-tool pass output                              │
│   Hit-rate target: 90%+ при partial spec change            │
│   Зачем: spec изменился частично — re-run только delta tools│
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ L4: Anthropic prompt caching (auto, 5-min TTL)             │
│   System prompt каждого pass'а структурирован:             │
│     [CACHED 2-3K tokens: rubric + guidelines + examples]   │
│     [NOT CACHED: this specific tool's input]               │
│   Эффект: -90% input cost на repeated calls                │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ L5 (runtime): Tool call response cache (per-tenant, opt-in)│
│   key: (deployment_id, tool_name, params_hash)             │
│   value: upstream response                                 │
│   TTL: per-tool config (по умолчанию OFF)                  │
│   Где имеет смысл: idempotent GET tools (annotations:      │
│   readOnlyHint=true, idempotentHint=true → safe to cache)  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ L6 (runtime): Auth cache (Worker memory + KV)              │
│   API key validation results                               │
│   TTL: 5 min                                               │
└────────────────────────────────────────────────────────────┘
```

> ⚠ Изменения vs v1: v1's "Layer 3: Optimization result cache" разделён на **L2 (pass-level)** и **L3 (tool-level)** — это позволяет hit'ить кэш при partial spec change (например, добавили один endpoint — re-run'им только Pass 0/1 для inventory, остальные 50 tools берём из L3).

### 12.2 Cache invalidation

- **L1 + L2 + L3:** при drift detection — invalidate если `spec_content` sha256 сменился. L3 partial — invalidate только tools, чьи `tool_signature_hash` изменились.
- **L4:** автоматический Anthropic (5-min TTL).
- **L5:** tenant config + manual purge endpoint + auto-bypass для tools без `idempotentHint=true`.
- **L6:** 5-min TTL + manual revoke endpoint.

---

## 13. Rate Limiting

### 13.1 Levels

| Уровень | Limit | Реализация |
|---|---|---|
| **Per-IP (DoS)** | 100 req/sec | CF Rate Limiting Rules (edge) |
| **Per-API-key (free tier)** | 10 req/sec | Dispatch Worker + Durable Object counter |
| **Per-API-key (paid)** | 100 req/sec | same |
| **Per-tenant monthly quota** | per plan | Stripe Meters check (cached) |
| **Per-LLM-API (наш cost protection)** | $X/day per org | Custom check in Generation Engine |
| **Generation jobs (concurrent)** | 1/free, 5/pro, 50/team | Inngest concurrency keys |

### 13.2 Algorithm

Используем sliding window log в Durable Objects (proven pattern для CF). Для cost protection — отдельный counter в Postgres с UPSERT каждые 10 секунд.

---

## 14. Secrets Management

### 14.1 Categories

| Category | Storage | Encryption |
|---|---|---|
| Our API keys (Stripe, Anthropic, etc.) | CF Workers Secrets / Fly.io secrets | Per-vendor managed |
| User-supplied upstream API keys (stored mode) | CF KV per-tenant | AES-256-GCM with per-tenant DEK; KEK in CF |
| User-supplied upstream API keys (pass-through) | NEVER STORED | Encrypted blob from client → decrypt → forward → discard |
| Webhook signing secrets (Stripe → us) | CF Workers Secret | Stripe-managed |
| Internal M2M tokens | Logto-issued JWTs | Standard JWT signing |

### 14.2 Pass-through credential flow (важно для security)

```
Claude Desktop config:
  {
    "mcpServers": {
      "stripe-mcp": {
        "url": "https://stripe-mcp-abc.mcpgen.app/mcp",
        "headers": {
          "Authorization": "Bearer <our-tenant-api-key>",
          "X-Upstream-Auth": "<encrypted-stripe-key>"
        }
      }
    }
  }

Tenant Worker:
  1. Validate Authorization header (our auth)
  2. Decrypt X-Upstream-Auth (using tenant-specific key derived from our-tenant-api-key)
  3. Use decrypted Stripe key in upstream call
  4. NEVER log X-Upstream-Auth or decrypted result
  5. NEVER store
```

Encryption key для X-Upstream-Auth — derived from API key через HKDF, поэтому даже мы (у кого есть API key) не можем decrypt без active tenant context (это мера паранойи; при компромиссе наших серверов риск минимизирован).

### 14.3 Audit logging

Все доступы к stored credentials логируются в `secrets_audit` таблицу с (timestamp, tenant_id, deployment_id, action, ip). Retention 1 год.

---

## 15. Repository Structure (Monorepo)

```
mcpgen/
├── apps/
│   ├── web/                    # Next.js (Vercel)
│   ├── api/                    # Hono Control Plane (CF Workers)
│   ├── dispatch/               # Dispatch Worker (CF Workers for Platforms)
│   ├── generation-engine/      # FastAPI + PydanticAI (Fly Machines)
│   ├── cli/                    # TypeScript CLI (npm + Bun binaries)
│   └── docs/                   # Docusaurus или Mintlify
├── packages/
│   ├── ir/                     # Universal IR types (TS) + codegen для Python
│   ├── runtime-sdk/            # SDK для generated tenant Workers
│   ├── codegen-templates/      # Jinja2 templates (используется Python engine)
│   ├── shared-config/          # ESLint, Prettier, tsconfig presets
│   └── ui/                     # shadcn-style shared компоненты
├── infrastructure/
│   ├── neon/                   # DB migration files (drizzle-kit или Atlas)
│   ├── cloudflare/             # wrangler configs, Terraform для CF resources
│   ├── fly/                    # fly.toml configs
│   └── inngest/                # function definitions
├── docs/
│   ├── architecture.md         # этот документ
│   ├── api-contracts.md
│   ├── security.md
│   └── runbooks/               # operational playbooks
└── turbo.json                  # Turborepo config
```

**Build tool: Turborepo** — кэширование builds, parallel CI, понятен большинству TS-разработчиков.

**Package manager: pnpm** — workspace-friendly, быстрее npm.

---

## 16. Local Development Environment

```
docker-compose.yml:
  - postgres:16 + pgvector + timescale (single image)
  - logto (single image, dev-mode)
  - mailhog (для проверки emails)
  - minio (для R2-compatible storage)
  - inngest-dev (CLI)

Запуск:
  $ pnpm dev
  
  → одновременно:
    - docker compose up -d
    - turbo run dev (Next.js, Hono via wrangler dev, FastAPI via uvicorn --reload)
    - inngest dev
    - tunnel через cloudflared (для тестирования webhook'ов от Stripe)
```

**Mock LLM:** для local dev можно включить flag `MOCK_LLM=true` — Generation Engine возвращает pre-recorded results вместо реальных Anthropic calls. Существенно ускоряет dev loop.

---

## 17. CI/CD

### 17.1 GitHub Actions workflows

```
.github/workflows/
  ├── ci.yml              # на каждый PR: lint, typecheck, unit tests
  ├── e2e.yml             # на main: playwright tests against preview env
  ├── deploy-web.yml      # Vercel auto-deploys on push to main
  ├── deploy-api.yml      # wrangler deploy on push to main (after tests)
  ├── deploy-engine.yml   # fly deploy on push to main (after tests)
  ├── release-cli.yml     # на tag v*: publish npm + GitHub release with binaries
  └── db-migrate.yml      # ручной trigger или part of deploy
```

### 17.2 Preview environments

- **Web (Vercel):** автоматически для каждого PR.
- **API:** wrangler `--env preview-${PR}` создаёт ephemeral Worker (TTL 7 дней).
- **Generation Engine:** Fly creates `mcpgen-engine-pr-${N}.fly.dev` per PR.
- **DB:** Neon branch per PR (auto-cleanup).

Это даёт **полностью изолированную preview environment на каждый PR** — критично для соло-работы (можно безопасно экспериментировать).

### 17.3 Database migrations

Tool: **Drizzle Kit** (TS-native, type-safe migrations).

Workflow: разработчик меняет schema → `drizzle-kit generate` → SQL migration в git → CI применяет в order.

---

## 18. Cost Projections

> ⚠ Цифры обновлены под v2 cost model. Per-generation cost ~$1.50 без caching, ~$0.80 с Anthropic prompt caching. Per F3 agent eval ~$0.30–0.50. См. §5.7.

### t0 (0 paying users, soft launch)

| Component | Cost |
|---|---|
| Vercel Hobby | $0 |
| CF Workers (free tier) | $0 |
| Neon (free tier) | $0 |
| R2 (10GB free) | $0 |
| Logto Cloud free | $0 |
| Inngest free | $0 |
| Langfuse Cloud free | $0 |
| Sentry free | $0 |
| Fly.io Machines (auto-suspend) | ~$5 |
| LLM API (testing — Anthropic + fallbacks) | ~$50 (на 50 dev generations + ~30 evals) |
| Domain | $1 |
| **Total** | **~$56/mo** |

### t+3 (100 active users, mostly free, ~10 paid)

| Component | Cost |
|---|---|
| Vercel Pro | $20 |
| CF Workers Paid + WfP | $25 |
| Neon Launch | $19 |
| R2 (~50GB; включает spec cache + sandbox eval transcripts) | $2 |
| Logto Cloud | $0 (under MAU limit) |
| Inngest Pro | $50 |
| Langfuse Pro | $59 |
| Sentry Team | $26 |
| BetterStack | $25 |
| Fly.io Machines | $20 |
| LLM API (~250 generations + ~80 evals) | ~$250 (recouped via per-eval/per-gen fees) |
| **Total** | **~$496/mo** |
| **Revenue (10 paid @ $19 + PAYG eval/gen)** | **~$210/mo** |
| **Net burn** | **~$286/mo** |

### t+12 (1000 users, ~100 paid)

| Total cost | ~$2,500/mo |
| Revenue (100 @ avg $40 incl. usage) | ~$4,000/mo |
| **Net positive: ~$1,500/mo** |

### t+24 (5000 users, ~500 paid)

Cost scales sublinearly thanks to per-tenant Worker model. Self-host Logto + Langfuse — экономия $300/mo. Net ~$15K/mo at this stage.

---

## 19. Migration Paths

| Trigger | Migration |
|---|---|
| 5K MAU | Logto Cloud → self-hosted Logto on Fly Machine |
| 5M monthly LLM events | Langfuse Cloud → self-hosted Langfuse |
| 10M usage events / month | TimescaleDB extension → Tinybird |
| 1000 active deployments | Re-evaluate WfP costs vs custom K8s+Knative |
| LiteLLM bottleneck | Direct provider SDKs with custom router |
| Vercel costs > $500/mo | Migrate frontend to CF Pages |
| Need EU data residency | Add Neon EU region + CF EU edge config |

---

## 20. Open Decisions / Things to validate before t0

❓ **Frontend hosting confirmation:** Vercel ✅ or CF Pages? — рекомендация Vercel.

❓ **Auth path:** Logto Cloud (free tier) на старте vs сразу self-host? — рекомендация Logto Cloud.

❓ **Drizzle ORM vs raw SQL + node-postgres?** — Drizzle для DX, но дополнительная зависимость. Рекомендация Drizzle.

❓ **MCP Streamable HTTP vs SSE transport?** — MCP spec эволюционирует. Проверить актуальный spec непосредственно перед t0.

❓ **One-click install в Claude Desktop:** проверить, поддерживает ли Anthropic deeplinks (`claude://...`) на момент t0. Fallback — `.mcpb` package.

❓ **Pre-cached popular APIs:** какой первоначальный список? Stripe, GitHub, Notion, Linear, Slack — топ-5 для MVP. Для каждого — golden tasks для F3 agent eval (см. v2 §8.4).

❓ **CLI distribution:** только npm+Bun-binary или также Homebrew tap? Рекомендация — npm в MVP, Homebrew в t+3.

❓ **Privacy mode для CLI:** опция "spec не уходит в наш cloud" — нужно для enterprise. Реализуется как fully-local generation в CLI без backend round-trip. ⚠ В privacy mode F3 agent eval недоступен (нужен sandbox). Решение: добавить в MVP с warning, что quality unverified.

❓ **Sandbox CF Worker namespace для F3 evals:** отдельный CF account/namespace для ephemeral test deploys (TTL 1 час) или re-use production namespace? Решение: отдельный namespace `mcpgen-sandbox` для изоляции и упрощения cleanup.

❓ **F3 agent eval на чьей модели:** на нашей (Sonnet 4.7 для всех) или на модели пользователя (если есть API key)? Решение для v0 — наш Sonnet 4.7 (consistent baseline). Pro v1.1 — opt-in использовать модель из user's API key.

> ✅ **Resolved (после v2 + Pass 0/1 designs):**
> - ~~Token compression target~~ → решено: НЕ цель, primary metric — F3 success rate ≥ 70%.
> - ~~Output target languages~~ → решено: только TypeScript на v0.
> - ~~Composite tools coexistence~~ → решено через Pass 1 Six-Tool Pattern: composite paradigm заменён на canonical structure; workflow tools (бывшие composites) — strict gate, по умолчанию заменяют subsumed; coexist — Pro opt-in.
> - ~~Public quality badge~~ → решено: opt-in only, не auto-public.
> - ~~Pass 1 token efficiency mechanism~~ → решено: Six-Tool Pattern (Anthropic + OpenAI + MCP Bundles consensus), не autonomous composite generation.
> - ~~Tool naming convention~~ → решено: Pass 0 plans `{resource}_{action}`; Pass 1 final — 6 universal без префикса + actions `{namespace}_{verb}`.

---

## Appendix A. Архитектурные диаграммы (TODO)

- [ ] Sequence diagram: full generation flow (Mermaid) — c v2 stages A→F
- [ ] ER diagram: data model (PG + Timescale)
- [ ] Network diagram: trust boundaries для security review (включая sandbox eval namespace)
- [ ] Component dependency graph

## Appendix B. Glossary

**Engine v2:**
- **Stage** — группа passes с общей retry-границей: A (Parse, det), B (Architect, Opus), C (Author, Sonnet ‖), D (Shape, Sonnet), E (Codegen, det), F (Validate: F1 Static / F2 Smell / F3 Eval).
- **Pass 0–5** — конкретный шаг внутри LLM-stages: P0 Inventory · **P1 Six-Tool Pattern Consolidation** · P2 Description · P3 Parameters · P4 Annotations · P5 Response Shape.
- **IR** — Universal Intermediate Representation, format-agnostic representation of API после parsing. v2 IR: `Tool` (universal/action/workflow/specialized) с `ToolDescription` (6 components), `ToolAnnotations` (4 hints), `ResponseConfig`, `RoutingRule`, `WorkflowDef`, `SmartIdSchema`. См. §5.2.
- **Six-Tool Pattern (Pass 1)** — canonical structure: 6 universal tools (`search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete`) + minimal extras. Industry consensus (Anthropic + OpenAI + MCP Bundles, Oct 2025). Empirical ~70% token savings.
- **Universal tools** — 6 канонических. **OpenAI compliance:** `search(query: string)` + `fetch(id: string)` exact signatures.
- **Smart IDs** — `{server}:{type}:{collection}:{identifier}`. Routing logic в ID format, не в tool definition.
- **Action tool** — POST endpoint с side effect, не CRUD (`charges_capture`).
- **Workflow tool** — multi-step (2–5 endpoints), strict gate: prescribed + recoverable + positive token economy.
- **Specialized tool** — rare reads не fit'ящие в `list_objects`.
- **Coverage 100%** — Pass 1 mandatory: каждый Pass 0 tool covered (subsumed универсальным или extra).
- **6 description components** — paper rubric arXiv 2602.14878: Purpose · Guidelines · Limitations · Parameter doc · Examples · Length & Completeness. (Pass 2 пишет 5 of 6 в v0; Examples deferred к v1.1.)
- **Length budgets per tool type (Pass 2 design)** — universal 200–400 / action 100–200 / workflow 150–300 / specialized 80–150 tokens. Calibrated по paper finding (rich descriptions: +5.85pp accuracy).
- **`when_not_to_use` (Pass 2)** — optional Guidelines field для tools с близкими альтернативами (например, search vs list_objects).
- **Inline quality gate (Pass 2 Phase 3)** — single Haiku judge per tool, abbreviated 4-component rubric. Не путать с full F2 smell scan.
- **Forbidden patterns (Pass 2)** — regex catch для marketing speak ("powerful", "elegant"), filler ("you can", "this tool allows"), tautology, vague placeholders.
- **Examples policy (Pass 2)** — ONLY from spec в v0; никогда LLM-hallucinated. Quality Report surfaces tools без examples (v1.1 sandbox feature).
- **Opaque Parameters smell (Pass 3 main fight)** — paper finding: 84.3% существующих MCP servers имеют Opaque Parameters. Pass 3 устраняет через 5 dimensions (naming/format/enums/defaults/description) + 5-component MCP Bundles template.
- **5-component parameter description (Pass 3 / MCP Bundles)** — what it is · format/values/range · when to use / what it affects · example (concrete, copy-pastable, safe value) · default / omission behavior.
- **Filter parameter — 3 approaches (Pass 3)** — Structured Object (default, `filter` с `{property, operator, value}`), DSL String (when SQL/GraphQL native, `where`), Individual Filter Params (≤4, для simple cases). Deterministic selection rule.
- **Smart ID parameter (Pass 3)** — pattern auto-generated из Pass 1 SmartIdSchema. Description includes `{server}:{type}:{collection}:{identifier}` format + plain identifier fallback.
- **Standard parameter sets (Pass 3 design Appendix A)** — consistent naming/types для universal tools across servers (limit default 25, offset default 0, sort_order default "desc", и т.д.).
- **Naming normalization rules (Pass 3)** — `user → user_id`, `data → payload`, `id (ambiguous) → {entity}_id`, `time → created_at`, `status → {entity}_status`.
- **Inline quality gate (Pass 3 Phase 4)** — single Haiku judge per tool, parameter-specific 5-component rubric (Naming · Description completeness · Format/constraint accuracy · Example quality · Default/optional clarity), threshold ≥ 3.
- **`ParameterSchema` (Pass 3 output)** — Pydantic model с все JSON Schema fields: type · description · enum · format · pattern · min/max · default · examples · items · oneOf.
- **4 tool annotations** — MCP spec 2025-03-26: `readOnlyHint` · `destructiveHint` · `idempotentHint` · `openWorldHint`.
- **`openWorldHint = true` invariant (Pass 4)** — hardcoded для всех tools (мы wrap external REST APIs). Архитектурный invariant.
- **MCP defaults опасны (Pass 4)** — `destructiveHint: true`, `openWorldHint: true` by default; Pass 4 ВСЕГДА выставляет все 4 явно (иначе каждый tool вызывает confirmation prompts в Cursor).
- **Tool-type annotation rules (Pass 4)** — НЕ HTTP method, а tool type (Pass 1 result): универсальные read tools → readOnly+idempotent; upsert → !destructive,!idempotent (creates → дубликаты возможны); delete → destructive+idempotent (re-delete = no-op); specialized_read → readOnly+idempotent.
- **Action verb patterns (Pass 4 Appendix B)** — `_refund/_reverse/_undo` → destructive; `_cancel/_void/_revoke` → destructive+idempotent; `_archive/_soft_delete` → destructive+idempotent; `_capture/_charge/_pay` → !destructive; `_unlock/_enable/_activate` → !destructive,idempotent. Medium-confidence (`_send/_lock/_publish`) → Haiku review.
- **Workflow conservative aggregation (Pass 4)** — worst-case across sub-operations: `readOnly = AND across subs`, `destructive = OR across subs`, `idempotent = AND across subs`. Любой destructive sub → workflow destructive.
- **Conservative defaults (Pass 4)** — when uncertain: readOnly=false, destructive=true, idempotent=false. UX safety > optimization.
- **Title generation (Pass 4)** — deterministic snake_case → Title Case + verb reordering для actions (`charges_capture` → "Capture Charge"). Strip "Tool"/"Function"/"API" suffixes.
- **Annotations consistency rules (Pass 4 Phase 3)** — auto-fix: readOnly=true → idempotent=true (reads inherently idempotent — MCP filesystem gold standard); destructive=true → readOnly=false (logically impossible); openWorldHint != true → force true.
- **Annotations — UX hints, НЕ безопасностные гарантии (Pass 4)** — client может игнорировать, real safety — в actual implementation (MCP blog).
- **Two token problems (Pass 5)** — schema bloat (input — solved by Pass 1) и **response bloat** (output — Pass 5 main fight). Real example: HRIS list_employees 80K → 8K с filtering (10x reduction).
- **outputSchema (Pass 5, NEW MCP 2025-06-18)** — каждый tool получает JSON Schema для response. `structuredContent + content` dual return для backward compat. Universal tools — `oneOf` или generic с `additionalProperties: true`.
- **Pagination strategies (Pass 5)** — cursor (preferred, MCP canonical) / offset / page-number. Auto-detect из spec request/response signals. Default `limit=25`, `max_limit=100`.
- **Field filtering (Pass 5)** — 3 categories: always-include (id, status, name, timestamps, required) / opt-in via `properties` param (verbose, metadata, blobs) / always-exclude (PII, internal, deprecated). Conservative bias: when uncertain prefer opt-in.
- **Truncation thresholds per tool type (Pass 5)** — search 10K / list_objects 15K / fetch 20K / action 5K / workflow 15K. Не единый 25K (как в старой v2).
- **Truncation guidance — teaching templates (Pass 5)** — анти-паттерн "Response truncated"; pattern "[Showing N of Total. Use {action}.]" с `{N}/{Total}/{action}` placeholders. Templates per tool type (Pass 5 Appendix A).
- **`response_format` parameter (Pass 5, optional)** — enum `summary/detailed/raw`, default `summary`. Добавляется только для tools с > 20 fields и varied use cases.
- **`ResponseConfig` schema (Pass 5, refined)** — `pagination` + `field_filtering` + `truncation` + `has_response_format_param`. Старые v2 поля (`truncation_threshold_tokens=25000`, `response_format_options`, `semantic_id_mapping`, `field_inclusion_concise/detailed`) — устарели.
- **`FinalTool` (Pass 5 output)** — production-ready: `inputSchema` (Pass 3) + `outputSchema` (Pass 5) + `annotations` (Pass 4) + `response_config` (Pass 5) + `description` (Pass 2). Ready для codegen Stage E.
- **Smell scan (F2)** — rubric scoring через 3 multi-family judges. Stage F design ОБНОВИЛ models: **Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro** (НЕ Haiku/mini/flash как раньше — production quality bar per MCP-Bench). Threshold ≥ **4.0** (НЕ ≥ 3). Prompt shuffling + score averaging.
- **Stage E (Codegen — detail design)** — 100% deterministic Jinja2 templates. Native MCP tools (НЕ Code Mode). CF Workers only MVP. ~25–30 generated files (package.json, wrangler.toml, src/{index,server,tools/*,runtime/*,auth/*,schemas/*}.ts). 6 phases: scaffold → schemas → runtime → auth → tool handlers → TS validation. 3 auth modes (passthrough/stored/OAuth via workers-oauth-provider). Cost $0, latency 5–12s.
- **Stage F (Validation — detail design)** — three tiers: F1 static (always, $0) + F2 smell scan (always, $0.20–0.50) + F3 agent eval (opt-in OR auto if F2<4.0, $1–3). Hybrid F3 env (real sandbox top 10 APIs, mocked rest). Two-tier evaluator (rule-based + LLM judge per MCP-Bench arXiv 2508.20453). Targeted retry orchestration (max 2 rounds, ~5x cheaper than full regen). Quality badges: premium/verified/standard/needs_review. Failure pattern → retry mapping: confusion → Pass 2; wrong format → Pass 3; missing hint → Pass 4; loop after truncation → Pass 5; auth fails → Stage E; hallucinates → Pass 5 + Stage E.
- **Agent eval (F3)** — Sonnet 4.7 в loop'е (max 10 turns) против golden tasks, threshold ≥ 70%.
- **Quality Score** — public-facing 0–5 metric, opt-in для badge. См. §5.5.
- **Golden tasks** — pre-curated test cases для popular APIs, auto-gen для custom specs.

**System:**
- **Tenant** — отдельная organization (paying или free), у которой свои deployed MCP-серверы.
- **Pass-through credentials** — режим, когда tenant Worker никогда не хранит upstream API key, а получает его в каждом request от MCP-клиента.
- **Stored credentials** — alt-режим, AES-256-GCM с per-tenant DEK в CF KV. Маркируется "less secure".
- **Dispatch Worker** — главный CF Worker, маршрутизирующий входящие requests в tenant Workers.
- **Drift** — изменение upstream API spec'а (источника, по которому генерили).
- **Multi-server pattern** — для больших API (Stripe → 3 specialized servers: charges / customers / subscriptions), не один monolith. Применяется когда post-Pass-0/1 > 50 tools.

## Appendix C. References

- Cloudflare Workers for Platforms: docs.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/
- Anthropic MCP spec (2025-03-26 — tool annotations): spec.modelcontextprotocol.io
- Anthropic engineering blog: "Writing effective tools for agents"
- arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!" (paper rubric)
- PydanticAI: ai.pydantic.dev
- Langfuse v4 OTel: langfuse.com/docs/sdk/python/v4
- Stripe Meters: docs.stripe.com/billing/subscriptions/usage-based/recording-usage
- Speakeasy "Generating MCP servers from OpenAPI" blog post
- Stainless "From REST API to MCP Server" guide
