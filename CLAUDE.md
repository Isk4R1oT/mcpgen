# MCPGen — Project Instructions

> Источник истины — `docs/`. Этот файл — оперативная памятка с ключевыми знаниями и навигацией.
> Перед нетривиальной работой сверяйся с первоисточниками.

---

## 0. Источники правды (всегда сверяться)

| Документ | Что внутри | Когда читать |
|---|---|---|
| [`RULES.md`](RULES.md) | **Жёсткие нерушимые правила** product/engine/architecture/security/operating/scope. Один TL;DR на все docs. | Перед каждой нетривиальной задачей. По умолчанию. |
| [`docs/mcpgen-generation-engine-v2.md`](docs/mcpgen-generation-engine-v2.md) | **ИСТИНА для Generation Engine v2.** Pipeline (6 passes × 3 stages), IR, validation (F1/F2/F3 + agent eval), quality scoring, cost model. **Заменяет старую логику engine из architecture.md §5.** | Любая работа с passes, IR, codegen, validation, eval |
| [`docs/mcpgen-pass-0-design.md`](docs/mcpgen-pass-0-design.md) | **Detailed design Pass 0** (Tool Inventory & Naming): 3 internal stages (det filter → LLM → validation), input/output schemas, prompts, retry logic, chunked approach для big specs, golden eval set, auth subsystem detection, spec drift, User Override Flow. **Источник истины для Pass 0 при противоречии с v2.** | Реализация Pass 0; auth subsystem; drift detection; UI для dropped_endpoints |
| [`docs/mcpgen-pass-1-design.md`](docs/mcpgen-pass-1-design.md) | **Detailed design Pass 1** (Tool Consolidation via Six-Tool Pattern): canonical 6 universal tools (search/fetch/list_collections/list_objects/upsert/delete) + actions/workflows/specialized; smart IDs; OpenAI compliance; 4-phase pipeline; coverage validation; token economy. **Источник истины для Pass 1 при противоречии с v2** (заменяет старую "Composite Tool Synthesis"). | Реализация Pass 1; codegen routing; tool count target 6-12 |
| [`docs/mcpgen-pass-2-design.md`](docs/mcpgen-pass-2-design.md) | **Detailed design Pass 2** (Description Authoring): 5 of 6 paper rubric components (Examples deferred to v1.1); different prompt templates per tool type (universal/action/workflow/specialized); length budgets per type; per-tool parallel Sonnet 4.7 (concurrency 10); inline Haiku quality gate (Phase 3 abbreviated rubric); forbidden patterns regex; examples ONLY from spec. **Источник истины для Pass 2 при противоречии с v2.** | Реализация Pass 2; description templates; quality gate; forbidden patterns |
| [`docs/mcpgen-pass-3-design.md`](docs/mcpgen-pass-3-design.md) | **Detailed design Pass 3** (Parameter Specification): production-ready JSON Schema с rich per-parameter descriptions; 5-component MCP Bundles template; 5 dimensions (naming/format/enums/defaults/description); per-tool-type strategies; **filter parameter design — 3 approaches** (structured object / DSL / individual); smart ID pattern generation; naming normalization rules; standard parameter sets для universal tools; 4-phase pipeline (det extraction → LLM enrichment ‖×20 → cross-param validation → inline Haiku gate). **Источник истины для Pass 3 при противоречии с v2.** Главная цель: устранить **Opaque Parameters smell (84.3%** существующих MCP). | Реализация Pass 3; JSON Schema generation; filter design; параметр naming/defaults/enums |
| [`docs/mcpgen-pass-4-design.md`](docs/mcpgen-pass-4-design.md) | **Detailed design Pass 4** (Annotations Inference): 4 MCP boolean hints + title; **80% deterministic** (tool-type rules + verb pattern matching), Haiku LLM только для edge cases (~1-3 tools/server); **architectural invariant** `openWorldHint=true` всегда; conservative aggregation для workflow tools (worst-case across subs); consistency rules enforcement; Appendix A decision tree + Appendix B verb patterns. **Источник истины для Pass 4 при противоречии с v2.** Самый дешёвый и быстрый pass (~$0.01–0.05, 5–15s). | Реализация Pass 4; annotations inference; verb pattern matching; consistency validation |
| [`docs/mcpgen-pass-5-design.md`](docs/mcpgen-pass-5-design.md) | **Detailed design Pass 5** (Response Shaping): главная задача — устранить **response token bloat** (often больше чем schema bloat). **5 mechanisms:** (1) outputSchema generation (MCP 2025-06-18), (2) pagination strategy + defaults (cursor/offset/page-number, auto-detect), (3) field filtering (always-include / opt-in / always-exclude), (4) truncation thresholds + teaching guidance messages, (5) optional `response_format` enum (summary/detailed/raw). Per-tool-type defaults. 5-phase pipeline (det pagination → det output schema → Haiku field ranking → template guidance → validation). **Источник истины для Pass 5 при противоречии с v2.** Cost ~$0.05–0.15, 15–25s. | Реализация Pass 5; outputSchema; pagination; field filtering; truncation guidance |
| [`docs/mcpgen-stage-e-design.md`](docs/mcpgen-stage-e-design.md) | **Detailed design Stage E** (Codegen): **100% deterministic Jinja2 templates** превращают Pass 5 output в complete TypeScript Cloudflare Worker project (~25–30 files). **Native MCP tools** (НЕ Code Mode). 6 phases: scaffold → schemas → runtime → auth → tool handlers → TS validation (`tsc --noEmit`). 3 auth modes (passthrough/stored/OAuth via workers-oauth-provider). Smart ID runtime, pagination/truncation runtime, error templates teach agent next step. **Источник истины для Stage E при противоречии с v2.** Cost $0, latency 5–12s (самый дешёвый stage). | Реализация Stage E; Jinja2 templates; tenant Worker structure; auth code generation |
| [`docs/mcpgen-stage-f-design.md`](docs/mcpgen-stage-f-design.md) | **Detailed design Stage F** (Validation): three-tier — **F1 static** ($0, 5–10s, always) + **F2 smell scan** ($0.20–0.50, 20–30s, always, **3 multi-family judges Sonnet+GPT-5+Gemini 3.5 Pro**) + **F3 agent eval** ($1–3, 1–3min, opt-in OR auto-triggered if F2 < 4.0). Hybrid F3 environment (real sandbox для top 10 APIs, mocked для rest). Two-tier evaluator (rule-based + LLM judge per MCP-Bench). **Targeted retry orchestration** (F failures → specific upstream pass retries, max 2 rounds). Quality badges (premium/verified/standard/needs_review). Failure pattern → retry mapping. **Источник истины для Stage F при противоречии с v2.** Quarterly judge calibration с human evaluators. ⚠ **Models OVERRIDDEN** к single Qwen3-Coder с 5-shuffle averaging — см. `mcpgen-model-and-provider-override.md` §4. | Реализация Stage F; validation tiers; quality scoring; targeted retries |
| [`docs/mcpgen-model-and-provider-override.md`](docs/mcpgen-model-and-provider-override.md) | **OVERRIDE документ для LLM model decision.** Single source of truth: `qwen/qwen3-coder` через **OpenRouter** заменяет ВСЕ упоминания Sonnet 4.7 / Haiku 4.5 / Opus / GPT-5 / Gemini 3.5 Pro / LiteLLM в предыдущих docs. Включает PydanticAI integration pattern (OpenAIProvider с custom base_url), per-pass usage examples, sampling parameters, multi-judge mitigation для F2 (5-shuffle + temperature variance), recalculated costs (~10–20x cheaper, $0.10–0.13 per generation), env vars (`OPENROUTER_API_KEY`), trade-offs (single-bias risk + sandbox: F3 test agent остаётся на Sonnet 4.7 для realism), Day 1 smoke test. **При противоречии с любым другим doc по моделям — побеждает этот файл.** | Любая работа с LLM calls, PydanticAI, F2/F3, cost estimates, env config |
| [`docs/mcpgen-git-workflow-rules.md`](docs/mcpgen-git-workflow-rules.md) | **Git rules для всего репо.** Branching strategy (trunk-based, short-lived `feature/`/`fix/`/`refactor/`/etc., NO `wip/`/`claude/`/`ai/`), Conventional Commits 1.0.0 mandatory, **atomic commits** (split if "and" в subject), squash-merge only, PR template с self-review gate, pre-commit hooks (gitleaks, lint, typecheck) mandatory + NEVER `--no-verify`, 9 forbidden ops (force-push to main, no-verify, history rewrite на shared, etc.), AI-agentic specifics (CLAUDE.md / settings.json / .claude/commands/, worktrees для parallel sessions, Plan Mode, Challenge Claude pattern), recovery (reflog, stash, undo), AI-specific gotchas (plausible-but-wrong, phantom refs, context drift). **Применяется AI-агентами и человеком одинаково.** | Любая git операция; настройка hooks/CI; PR creation; recovery после ошибки |
| [`docs/mcpgen-feature-flags-contract.md`](docs/mcpgen-feature-flags-contract.md) | **Источник истины для feature management.** Flipt v2 как единственный feature-flag сервис (Git-native YAML в `packages/feature-flags/`, single Go binary, no DB, native CF Workers WASM SDK). 5 категорий флагов (`_kill`/`_rollout`/`_exp`/`_perm`/`_ops`) с naming convention; required metadata + manifest validation в CI; per-app integration recipes (web/api/dispatch/engine/cli) с готовым TS+Python кодом; **generated tenant Workers explicitly OUT of scope** (immutability invariant); 5 release playbooks (rollout 5/25/50/100% ladder · kill switch emergency PR · A/B exp · Pro gating · rollback); identity model (`entityId`=`user.id`, context whitelist без PII); failure modes (`errorStrategy:fallback`, safe-by-default values per category); Sentry v10 feature-flags integration (уже в bundle); stale flag scanner (Inngest weekly cron → GitHub issues); 10 anti-patterns (no env-config-as-flag, no nested flags, no PII targeting, no in-loop eval, no auth-flagging); 6-phase build plan (~3 days; Phase A locally → Phase F at launch); decision log с 9 решениями + rejected alternatives; future roadmap (experimentation infra, ML targeting, multi-region). **Применяется ко ВСЕМ runtime gates в control plane после Phase 10 launch.** | Любая работа с feature toggles, A/B экспериментами, Pro-gating, kill switches; миграция env-vars на флаги; eval-call в коде |
| [`docs/mcpgen-gsd-sprint-plan.md`](docs/mcpgen-gsd-sprint-plan.md) | **Practical playbook для multi-terminal parallel sprint execution через GSD framework.** Phase dependency graph (10 phases), workstream layout (`engine` / `runtime` / `ops` / `frontend` / `main`), terminal allocation (4–5 параллельных Claude instance'ов), git worktree setup, GSD commands per phase (`/gsd-plan-phase N --ws X`), per-phase plan breakdown с waves, integration gates between phases, contract change protocol, daily sync ritual, anti-patterns (НЕ запускать 4 ws без `--ws`, НЕ менять UI в frontend ws, НЕ merge'ить engine pass-by-pass). **Sequencing/dependency источник истины — побеждает старый `mcpgen-implementation-plan.md` 9-week sequential plan.** Total time: ~6 недель (vs 9). | Перед началом любой phase; настройка нового terminal/workstream; merge gating; integration checks |
| [`docs/mcpgen-architecture.md`](docs/mcpgen-architecture.md) | System-level архитектура: компоненты, стек, data flows, data model, security, billing, миграционные пути. **Engine §5 — высокоуровневое summary, детали в v2.** | Любая работа над инфрой, схемами, контрактами вне engine |
| [`docs/mcpgen-ux-flow.md`](docs/mcpgen-ux-flow.md) | UX/UI flow: лендинг, generation, preview, deploy, dashboard, CLI UX, copywriting. **⚠ UI ЗАЛОЧЕН** в `claude-design-ui/MCP-Gen.zip` — ux-flow используется для копирайта/принципов, но не для перерисовки визуала. | Любая работа над текстами, UX-решениями; НЕ для визуала (он locked) |
| [`docs/mcpgen-implementation-plan.md`](docs/mcpgen-implementation-plan.md) | Поэтапный план реализации: 6 фаз × 9 недель, 5 параллельных треков, критический путь, риски, launch criteria. **Sequencing замещён `mcpgen-gsd-sprint-plan.md`** — implementation-plan остаётся как контекст для launch criteria, kill switches, anti-patterns, top risks. | Launch criteria; kill switches; risk mitigation; решения о scope cut |
| [`claude-design-ui/MCP-Gen.zip`](claude-design-ui/MCP-Gen.zip) | **Готовый макет сайта** из Claude Design (на основе ux-flow.md). Распаковать перед UI-работой. | Перед любой работой над UI |
| [`claude-design-ui/DESIGN.md`](claude-design-ui/DESIGN.md) | Ссылка на Claude Design + указание имплементировать `MCPGen.html` | Чтобы получить design assets |

**Правила:**
- `claude-design-ui/` — **готовый дизайн, ЗАЛОЧЕН.** Frontend phase = только wire-up к API, НЕ перерисовка визуала.
- При конфликте между документами: **`RULES.md` > `mcpgen-model-and-provider-override.md` (для моделей) > `mcpgen-git-workflow-rules.md` (для git) > `mcpgen-feature-flags-contract.md` (для feature toggles) > `mcpgen-gsd-sprint-plan.md` (для sequencing) > pass/stage-detail-design > v2 engine > architecture > implementation-plan > ux-flow.** Detail-designs (типа `pass-0-design.md`) выигрывают у v2-summary для своей области.
- **`mcpgen-model-and-provider-override.md` побеждает все old docs по моделям:** `qwen/qwen3-coder` через OpenRouter — единственная модель. Любые упоминания Sonnet/Haiku/Opus/GPT-5/Gemini/LiteLLM в other docs — устарели.
- **`mcpgen-gsd-sprint-plan.md` побеждает `implementation-plan.md` по sequencing:** 10 phases в GSD format, 4–5 параллельных workstream'ов в worktrees, ~6 недель total.
- Старая v1-логика «6 sequential passes для compression» из `docs/mcpgen-architecture.md` §5 — **устарела, использовать v2.**
- **Naming convention уточнена в Pass 0 design:** tool name = `{resource}_{action}` (charges_create), НЕ `{service}_{resource}_{action}` — server name уже даёт service prefix клиенту.

---

## 1. Что это за продукт (одной фразой)

**MCPGen** — генератор MCP-серверов из любого API (OpenAPI / GraphQL / Postman) с автоматической **MCP-quality** оптимизацией по best practices Anthropic + paper rubric, валидированный реальным агентом. Open-source CLI + managed cloud.

**Главное обещание (v2):** не «дешевле в токенах», а **«единственный, кто валидирует качество и применяет полный set best practices Anthropic»**. Token efficiency — побочный эффект (через composite tools), НЕ цель.

> ⚠ Старая v1-формулировка про «50–70% дешевле в токенах» **устарела** после ресерча (Anthropic engineering blog "Writing effective tools for agents", arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!", MCP spec 2025-03-26). Anthropic явно говорит **не оптимизировать по длине**, а делать описания **explicit** (вплоть до сотен токенов на complex tools). 97.1% существующих MCP-серверов имеют ≥1 smell — это и есть рынок. См. [`docs/mcpgen-generation-engine-v2.md` §0](docs/mcpgen-generation-engine-v2.md).

**Бизнес-модель:** usage-based (per tool-call, per generation, per **eval run**).

**ICP:** A) solo dev (CLI/GitHub) · B) API provider (лендинг) · C) internal tools engineer (Discord/комьюнити).

---

## 2. Архитектурные принципы (нерушимые)

**Product/engine принципы (v2):**

1. **Quality > compression.** Длина description — instrumental, не цель. Цель — task success rate агента. Длинные descriptions (сотни токенов) допустимы для сложных tools.
2. **Eval-driven generation.** Каждый сгенерированный сервер проходит agent-based evaluation. Без eval — нет права говорить "MCP-quality".
3. **Best-practice as default.** 6 description-компонентов + tool annotations + namespacing — по умолчанию. Opt-out возможен, opt-in не нужен.
4. **Build-time decisions over runtime hopes.** Архитектурные ограничения (tiered tool caps 30/50/80 + Pro 100, composite synthesis, multi-server split) — на генерации. Не полагаемся на runtime selection агента.
5. **Determinism where possible.** LLM — только там, где нужен natural-language reasoning. Annotations, structural validation, naming patterns — детерминированные правила.
6. **Caching is first-class.** Repeated generation того же spec'а не вызывает LLM (Layer 1/2/3 + Anthropic prompt caching).

**System принципы:**

7. **Чистая граница TS ↔ Python.** TS = всё user-facing и operational. Python = только LLM-оркестрация в Generation Engine. Связь — один HTTP API. Никакого дублирования логики.
8. **Open-core distribution.** CLI и базовый генератор — open source (MIT). Managed cloud, optimization passes, observability, billing — closed.
9. **Edge-first runtime для MCP-серверов.** Сгенерированные серверы — HTTP-translators на CF Workers for Platforms. Не платим за idle VM на тенанта.
10. **Vendor-flexible internals.** Никакой бизнес-логики в vendor-specific API глубже одного слоя. Особенно: model routing — через config (`model_routing.yaml`), смена Opus/Sonnet/GPT — git commit, не refactor.
11. **Stateless wherever possible.** Generation Engine, BFF, MCP runtimes — stateless. Состояние — только в БД и object storage.
12. **Cost transparency by design.** Каждая операция → usage event → видна в дашборде юзера И в нашем cost tracking.
13. **Solo-friendly ops.** Managed services > self-host везде, где разница в цене < 30% от revenue.

→ Engine принципы 1–6: [`docs/mcpgen-generation-engine-v2.md` §1](docs/mcpgen-generation-engine-v2.md) · System принципы 7–13: [`docs/mcpgen-architecture.md` §2](docs/mcpgen-architecture.md) · TL;DR: [`RULES.md`](RULES.md)

---

## 3. Технологический стек (ЗАФИКСИРОВАН)

| Слой | Технология | Hosting |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TS + Tailwind + shadcn/ui | Vercel |
| CLI | TypeScript + Commander.js + Bun (single binary) | npm + GitHub releases |
| Control Plane API | Hono + TypeScript + Bun runtime | Cloudflare Workers |
| Generation Engine | Python 3.12 + FastAPI + PydanticAI + LiteLLM | Fly.io Machines (auto-suspend) |
| Generated MCP servers | TypeScript + `@modelcontextprotocol/sdk` | CF Workers for Platforms |
| OLTP DB | PostgreSQL 16 + pgvector + TimescaleDB | Neon |
| Object Storage | R2 (S3-compatible) | Cloudflare |
| Auth | Logto (Cloud free tier → self-host @ t+3mo) | Logto |
| Background jobs | Inngest | Inngest Cloud |
| Billing | Stripe Billing + Meters API | Stripe |
| LLM tracing | Langfuse v4 (OTel) | Langfuse Cloud |
| Error tracking | Sentry | Sentry Cloud |
| Logs/uptime | BetterStack | BetterStack Cloud |
| Email | Resend | Resend |
| DNS / CDN | Cloudflare | Cloudflare |
| ORM | Drizzle Kit | — |
| Build | Turborepo + pnpm | — |

→ Полная сводка и обоснования: [`docs/mcpgen-architecture.md` §4](docs/mcpgen-architecture.md)

---

## 4. Архитектурные пласты (mental model)

```
USER-FACING:    Web (Next.js/Vercel) · CLI (TS/Bun) · Public REST/SSE
       │
CONTROL PLANE:  Hono/CF Workers (BFF/Gateway) · Logto (Auth) · Inngest (Drift Watcher)
       │ HTTPS (job + SSE callback)
GENERATION:     FastAPI/Fly Machines · PydanticAI (6 LLM passes / 3 stages: Architect / Author / Shape)
                + 3 deterministic stages (Parse / Codegen / F1 Static) + agent-eval (F3)
                LiteLLM → Anthropic/OpenAI/Gemini · OTel → Langfuse v4
       │
RUNTIME:        Dispatch Worker → Tenants (CF Workers for Platforms namespace)
                Usage events → CF Queue → Inngest → TimescaleDB + Stripe Meters
       │
DATA:           Neon (PG + pgvector + Timescale) · R2 (artifacts + sandbox eval transcripts) · Langfuse (LLM traces)
```

→ System layers: [`docs/mcpgen-architecture.md` §3, §6](docs/mcpgen-architecture.md) · Engine pipeline: [`docs/mcpgen-generation-engine-v2.md` §2](docs/mcpgen-generation-engine-v2.md)

---

## 5. Generation Engine v2 — сердце продукта

> ⚠ Это v2 spec. Старая v1-таблица «6 sequential passes for compression» из `docs/mcpgen-architecture.md` §5 — устарела.

### 5.1 Pipeline: 6 stages (3 LLM-stages + 3 deterministic + 1 eval)

```
Stage A: Parse & Normalize       (deterministic, no LLM)        → RawIR
Stage B: Architect               (Opus 4.7)                     → ToolTaxonomy
   ├── Pass 0: Tool Inventory & Naming         (filter + categorize + name + auth detect)
   │           ↳ см. detail design: docs/mcpgen-pass-0-design.md
   │           ↳ внутренне 3 stages: deterministic filter → LLM Opus → validation
   │           ↳ chunked approach при > 200 endpoints
   │           ↳ output: ~30–50 tool plans + composite_candidates + auth_requirements
   └── Pass 1: Tool Consolidation via Six-Tool Pattern
               ↳ см. detail design: docs/mcpgen-pass-1-design.md
               ↳ 4 phases: classify → schema synth (Opus) → routing → coverage validate
               ↳ ~50 tools → 6–12 tools (target) через canonical pattern
               ↳ 6 universal: search/fetch/list_collections/list_objects/upsert/delete
               ↳ + actions/workflows/specialized (sparingly, strict gates)
               ↳ smart IDs: {server}:{type}:{collection}:{identifier}
               ↳ OpenAI compliance (search/fetch single-string signatures)
               ↳ ⭐ ГЛАВНЫЙ token efficiency mechanism (~70% savings)
Stage C: Author                  (Sonnet 4.7, per-tool parallel) → AuthoredTools
   ├── Pass 2: Description Authoring           (5 of 6 paper rubric components — Examples deferred v0)
   │           ↳ см. detail design: docs/mcpgen-pass-2-design.md
   │           ↳ different prompt templates per tool type (universal/action/workflow/specialized)
   │           ↳ length budgets per type (universal 200–400 / action 100–200 / workflow 150–300 / specialized 80–150)
   │           ↳ per-tool parallel Sonnet 4.7 (concurrency 10)
   │           ↳ inline Phase 3 quality gate (single Haiku judge, abbreviated 4-component rubric)
   │           ↳ examples ONLY from spec (никогда LLM-hallucinated)
   │           ↳ forbidden patterns regex (marketing speak)
   ├── Pass 3: Parameter Specification         (production-ready JSON Schema + rich per-param docs)
   │           ↳ см. detail design: docs/mcpgen-pass-3-design.md
   │           ↳ 4 phases: det extraction → LLM enrichment ‖×20 → cross-param validation → inline Haiku gate
   │           ↳ 5 dimensions: naming · format/constraints · enums · defaults · description
   │           ↳ 5-component param description (MCP Bundles): what / format / when / example / default
   │           ↳ filter design — 3 approaches: structured object (default) / DSL / individual params
   │           ↳ smart ID pattern auto-generated из Pass 1 SmartIdSchema
   │           ↳ naming normalization (user → user_id; data → payload; status → ticket_status)
   │           ↳ standard parameter sets для universal tools (Appendix A в Pass 3 design)
   │           ↳ ⭐ устраняет Opaque Parameters smell (84.3% существующих MCP)
   └── Pass 4: Annotations Inference           (4 MCP boolean hints + title)
               ↳ см. detail design: docs/mcpgen-pass-4-design.md
               ↳ 3 phases: deterministic rules → LLM judgment (selective) → consistency validation
               ↳ ⭐ архитектурный invariant: `openWorldHint=true` ВСЕГДА (мы wrap external APIs)
               ↳ 80% deterministic: tool-type rules (Pass 1) + verb pattern matching (Appendix B)
               ↳ Haiku 4.5 ТОЛЬКО для edge cases (~1–3 tools/server, medium-confidence verbs)
               ↳ workflow tools — conservative aggregation: worst-case across sub-operations
               ↳ consistency rules enforced (readOnly→idempotent; destructive→!readOnly)
               ↳ title: deterministic snake_case → Title Case (с verb reordering для actions)
               ↳ самый дешёвый pass: ~$0.01–0.05, 5–15s
Stage D: Runtime Shaping         (mostly deterministic + Sonnet) → CompleteServerSpec
   └── Pass 5: Response Shaping                (5 mechanisms: outputSchema + pagination + field filtering + truncation + response_format)
               ↳ см. detail design: docs/mcpgen-pass-5-design.md
               ↳ ⭐ устраняет response token bloat (часто > schema bloat)
               ↳ outputSchema generation (MCP 2025-06-18 standard) для всех tools
               ↳ pagination auto-detect (cursor/offset/page-number)
               ↳ field filtering: always-include / opt-in (через properties param) / always-exclude
               ↳ truncation thresholds per tool type (search 10K / list 15K / fetch 20K / action 5K / workflow 15K)
               ↳ truncation guidance — teaching templates с placeholders ({N}/{Total}/{action})
               ↳ optional `response_format` enum (summary/detailed/raw) — только > 20 fields
               ↳ 5 phases: det pagination → det outputSchema → Haiku field ranking ‖×10 → template guidance → validation
               ↳ ~70% deterministic, Haiku только для field importance ranking
Stage E: Codegen                 (Jinja2, no LLM, $0, 5–12s)    → Generated code
                                                                  ↳ см. detail design: docs/mcpgen-stage-e-design.md
                                                                  ↳ Native MCP tools (НЕ Code Mode); CF Workers only MVP
                                                                  ↳ ~25–30 files; 6 phases incl. tsc --noEmit validation
                                                                  ↳ 3 auth modes (passthrough/stored/OAuth)
Stage F: Validate
   ├── F1 Static: tsc, ajv, ESLint, bundle, MCP compliance, secret scan ($0, 5–10s, always)
   ├── F2 Smell scan: 3 multi-family judges Sonnet+GPT-5+Gemini 3.5 Pro × prompt shuffling × 6-component rubric ($0.20–0.50, 20–30s, always, threshold ≥4.0)
   └── F3 Agent eval: Sonnet 4.7 vs golden tasks, two-tier (rule-based + LLM judge), pass rate ≥0.7 ($1–3, 1–3min, opt-in OR auto if F2<4.0)
       ↳ см. detail design: docs/mcpgen-stage-f-design.md
       ↳ Hybrid env: real sandbox для top 10 APIs, mocked для rest
       ↳ Targeted retries (F failure → specific Pass retry, max 2 rounds)
                                                                → QualityReport + Quality Badge (premium/verified/standard/needs_review)
```

**Stage = retry boundary.** Failure внутри stage не требует переделывать предыдущие.

### 5.2 Description structure (Pass 2 design — 5 of 6 paper rubric components в v0)

| # | Component | Что | Кто пишет | v0 status |
|---|---|---|---|---|
| 1 | **Purpose** | 1–3 предложения, что делает tool | Pass 2 | ✅ |
| 2 | **Guidelines** | `when_to_use` (bullets) + `when_not_to_use` (для tools с близкими альтернативами) + `how_to_use` (str для нетривиальных) | Pass 2 | ✅ |
| 3 | **Limitations** | constraints, side effects, failure modes, idempotency | Pass 2 | ✅ |
| 4 | **Parameter overview** | high-level (150–300 chars), список параметров и relationships | Pass 2 | ✅ |
| 4b | **Parameter doc** (per-param details) | format hints, examples per param, common_mistakes | **Pass 3** | ✅ |
| 5 | **Length & Completeness** | meta — длина в budget range, все components present | Pass 2 validation | ✅ |
| 6 | **Examples** | tool-level examples (full call + result) | **Deferred v1.1** (требует execution traces) | ⚠ `null` или ONLY from spec |

**Forbidden patterns в descriptions** (Pass 2 regex catch): marketing language ("powerful", "elegant", "robust"), filler ("you can use this to", "this tool allows"), tautological ("this list tool lists"), vague placeholders ("various", "different", "appropriate").

**Length budgets per tool type** (calibrated по paper finding +5.85pp accuracy для rich descriptions):

| Tool type | Min | Target | Max |
|---|---|---|---|
| Universal (search/fetch/list_*/upsert/delete) | 200 | 300 | 400 |
| Action | 100 | 150 | 200 |
| Workflow | 150 | 200 | 300 |
| Specialized read | 80 | 120 | 150 |

### 5.3 Tool annotations (MCP spec 2025-03-26 — Pass 4 design)

**4 boolean hints + title** для каждого tool. **80% deterministic** через tool-type rules (Pass 1) + verb pattern matching. LLM (Haiku) только для edge cases.

⚠ **Critical:** MCP defaults опасны (`destructiveHint: true`, `openWorldHint: true` by default — каждый невыставленный tool → confirmation prompt в Cursor). Pass 4 ВСЕГДА выставляет все 4 явно.

⭐ **Architectural invariant:** `openWorldHint = true` ВСЕГДА (мы wrap external REST APIs).

**Tool-type-based rules** (а НЕ HTTP method, как в старой v2):

| Tool type | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| `search`, `fetch`, `list_collections`, `list_objects` | true | false | true | **true** |
| `upsert` | false | false | **false** (creates → потенциально дубликаты) | **true** |
| `delete` | false | **true** | **true** (re-delete = no-op) | **true** |
| `specialized_read` | true | false | true | **true** |
| `action` | verb pattern (Appendix B) ИЛИ Haiku LLM judgment | | | **true** |
| `workflow` | conservative aggregation: AND across subs | OR across subs | AND across subs | **true** |

**Action verb patterns** (Pass 4 Appendix B, high-confidence): `_refund/_reverse` → destructive · `_cancel/_void/_revoke` → destructive+idempotent · `_archive/_soft_delete` → destructive+idempotent · `_capture/_charge/_pay` → !destructive · `_unlock/_enable/_activate` → idempotent. Medium-confidence (`_send/_lock/_publish`) → Haiku review.

**Conservative defaults when uncertain:** readOnly=false, destructive=true, idempotent=false (UX safety > optimization).

### 5.3.1 Naming convention (Pass 0 + Pass 1 design)

**Pass 0 tool plans (intermediate)** — `{resource}_{action}` (snake_case, ASCII, ≤ 64 chars). Server name даёт service prefix клиенту:
- ✅ `charges_create`, `customers_search`, `subscriptions_cancel`
- ❌ `stripe_charges_create` (service prefix дублирует server name)
- ❌ `createChargeUsingPOST` (camelCase + non-imperative)

**Pass 1 final tools (что увидит агент)** — Six-Tool Pattern:
- **Universal (6, всегда):** `search` · `fetch` · `list_collections` · `list_objects` · `upsert` · `delete`
- **Action tools:** `{namespace}_{verb}` (`charges_capture`, `charges_refund`, `messages_send`)
- **Workflow tools:** `{action}_{resource}` (`schedule_event`, `upload_with_thumbnail`) — strict gate
- **Specialized:** rare patterns не fit'ящие в `list_objects`

### 5.3.2 Six-Tool Pattern (Pass 1 — canonical structure)

| # | Tool | Параметры | Что делает |
|---|---|---|---|
| 1 | `search` | `query: string` (single-string, OpenAI standard) | Search by query → ranked results с smart IDs |
| 2 | `fetch` | `id: string` (smart ID, OpenAI standard) | Get full object по smart ID |
| 3 | `list_collections` | ~6 optional (pattern, include_schema, ...) | Discovery — какие типы данных есть |
| 4 | `list_objects` | ~8 optional (collection, properties, filter, sort, ...) | Browse объектов с фильтрами/пагинацией |
| 5 | `upsert` | `collection`, `data` (obj/array), `id?`, `ids?` | Smart routing: create OR update; single OR batch |
| 6 | `delete` | `type` (object/objects/collection), `id?`/`ids?`/`collection?`, `confirm` | Smart routing по type |

**Smart IDs:** `{server}:{type}:{collection}:{identifier}` (`stripe:object:Charge:ch_3O5jJ2...`). Routing logic — в ID format, НЕ в tool definition.

### 5.4 Hard constraints (Pass 0 + Pass 1)

**Pass 0 output (intermediate plans, перед Pass 1):**

| Tool count после filtering | Действие |
|---|---|
| ≤ 30 | Продолжаем нормально |
| 31–50 | Pass 1 запускается обязательно |
| 51–80 | Pass 1 агрессивно сворачивает; если > 50 после — fail "split into multi-server" |
| > 80 | Hard fail сразу с suggested top-level path prefixes для split |

**Pass 1 final output (что генерируется в код):**

| Final tool count | Статус |
|---|---|
| 6 | Best case (pure data API типа Notion) |
| 6–12 | **Target range** (Anthropic Claude Code сам ~12) |
| 13–15 | Acceptable для action-heavy APIs (Twilio-like) |
| > 15 | Warning, не fail — surface в quality report |

**Coverage 100% mandatory** — Pass 1 НЕ должен терять функциональность Pass 0. Coverage validation в Phase 4. После 3 retry uncovered endpoints → degrade as `specialized_tools` с warning.

**Pro override:** `max_tools_override` поднимает Pass 0 cap до 100 (Pro feature, на риск пользователя).

**Прочие constraints:**
- Max bundle 1MB сжато (CF Workers margin).
- Max spec 10MB.
- Max 2 retries per pass; после — flag "needs_manual_review" (Pass 0 имеет 3 retries → degraded fallback; Pass 1 — после 3 retry coverage failure → specialized_tools fallback).
- Cost cap: $0.50 free / $2.00 pro per generation. Превышение → hard fail с partial result + bill.

### 5.5 Quality Score (public, opt-in)

```
overall_score = 0.30·smell_avg + 0.40·eval_success_rate·5 + 0.20·annotations_completeness·5 + 0.10·composite_ratio·5
```

Public quality badge — **opt-in only**, не auto-public.

### 5.6 Cost модель (Stripe API ~50 tools after Pass 0/1)

Полный pipeline (включая F2 smell scan + F3 agent eval): **~$1.50** без caching, **~$0.80** с Anthropic prompt caching (90% discount на cached system prompt).

**Pricing model:**
- Free: 1 eval/мес, скип после
- Pro: 5 eval/мес included
- Pay-as-you-go: $0.50/eval

### 5.7 Что ЗАПРЕЩЕНО (см. RULES.md §2.6)

- ❌ `search_tools` meta-tool / runtime progressive disclosure
- ❌ LLM-generated examples без real execution traces
- ❌ LLM в Stage A, E, F1 (детерминированные)
- ❌ Public quality badge by default

### 5.8 API контракт BFF ↔ Engine

Один endpoint `POST /api/v1/generate` + SSE callbacks per stage.

### 5.9 Caching (4 layer)

L1 spec-level (sha256 spec) · L2 pass-level (`pass_name+version+input_hash+model_id`) · L3 tool-level · L4 Anthropic prompt caching (auto, 5-min TTL, –90% input cost).

→ Полная спецификация (prompts, IR types, edge cases, gap registry, decision tree): [`docs/mcpgen-generation-engine-v2.md`](docs/mcpgen-generation-engine-v2.md)

---

## 6. Runtime Plane — где живут tenant MCP-серверы

- **Dispatch Worker** (мы пишем): auth precheck, rate limit, lookup tenant, dispatch.
- **Tenant Workers** (генерируются): `@modelcontextprotocol/sdk` + `@mcpgen/runtime` SDK.
- **Auth modes:** API key (default) · OAuth 2.1 (через Logto) · None (public, маркируется красным).
- **Pass-through credentials (default):** upstream API ключ передаётся клиентом в `X-Upstream-Auth` headers, мы НЕ храним.
- **Stored credentials (alt):** AES-256-GCM с per-tenant DEK в CF KV, маркируется как "less secure".

**P99 budget над upstream: < 50ms.**

→ Детали: [`docs/mcpgen-architecture.md` §6, §14](docs/mcpgen-architecture.md)

---

## 7. Repository Structure (monorepo, Turborepo + pnpm)

```
mcpgen/
├── apps/
│   ├── web/                 # Next.js (Vercel)
│   ├── api/                 # Hono Control Plane (CF Workers)
│   ├── dispatch/            # Dispatch Worker (CF Workers for Platforms)
│   ├── generation-engine/   # FastAPI + PydanticAI (Fly Machines)
│   ├── cli/                 # TypeScript CLI (npm + Bun binaries)
│   └── docs/                # Docusaurus / Mintlify
├── packages/
│   ├── ir/                  # Universal IR types (TS) + codegen для Python
│   ├── runtime-sdk/         # SDK для generated tenant Workers
│   ├── codegen-templates/   # Jinja2 templates (используется Python engine)
│   ├── shared-config/       # ESLint, Prettier, tsconfig presets
│   └── ui/                  # shadcn-style shared компоненты
├── infrastructure/
│   ├── neon/                # Drizzle migrations
│   ├── cloudflare/          # wrangler + Terraform
│   ├── fly/                 # fly.toml configs
│   └── inngest/             # function definitions
├── docs/                    # source of truth (architecture, ux-flow)
├── claude-design-ui/        # готовый макет сайта (НЕ переделывать визуал)
└── turbo.json
```

→ [`docs/mcpgen-architecture.md` §15](docs/mcpgen-architecture.md)

---

## 8. Data Model — ключевые сущности

`organizations` → `users` · `projects` → `specs` (versioned by hash) → `generations` (status, IR, optimization_report, llm_cost) → `deployments` (cf_worker_name, url, auth_mode) → `tools` (с pgvector embedding для retrieval).

TimescaleDB: `usage_events` hypertable + continuous aggregate `usage_hourly`.

R2 buckets: `mcpgen-specs` · `mcpgen-artifacts` (30д TTL) · `mcpgen-public-cache`.

→ Полные схемы: [`docs/mcpgen-architecture.md` §7](docs/mcpgen-architecture.md)

---

## 9. Observability & Privacy

- **LLM ops:** Langfuse v4 (OTel via PydanticAI/logfire, `send_to_logfire=False`, OTLP → Langfuse Cloud).
- **App errors:** Sentry (TS + Python, source maps).
- **Logs/uptime:** BetterStack.
- **Customer-facing analytics:** TimescaleDB → custom dashboard.

**Логировать НЕЛЬЗЯ:** содержимое spec'а, upstream API responses (PII), upstream auth credentials.
**Логировать МОЖНО:** generation metadata, tool names, IR structure, performance metrics, error traces.

→ [`docs/mcpgen-architecture.md` §11](docs/mcpgen-architecture.md)

---

## 10. UX/UI принципы (всегда применять)

1. **60-second hero flow.** От пасты URL до рабочего MCP в Claude Desktop — < минуты. Без регистрации.
2. **CLI-first, web-augmented.** Никогда не заставлять идти в web ради того, что можно в CLI.
3. **Show, don't tell.** Каждый шаг сопровождается метрикой ("сэкономили X токенов", "снизили cost на $Y").
4. **Progressive complexity.** Новичок жмёт Generate. Pro настраивает каждый из 6 passes.
5. **Trust through transparency.** Весь сгенерированный код виден на каждом шаге. Никакого black-box.

**Tagline:** *From any API to production-ready MCP in 60 seconds — token-optimized by default.*

→ Все экраны, тексты, состояния: [`docs/mcpgen-ux-flow.md`](docs/mcpgen-ux-flow.md)

---

## 11. Implementation Plan — execution model

**Timeline:** 9 недель от Phase 0 до публичного запуска. Soft launch — W7 (20 invited), public — W9 (Show HN, PH, Reddit). Critical path ≈ 6 недель, slack ≈ 3 недели.

**MVP scope:** OpenAPI 3.x → optimized TypeScript MCP server, hosted deploy, usage billing.
**NOT в MVP:** GraphQL, Postman, Python output, A/B deploys, regression testing, custom domains, SSO/Team plan, auto-regenerate on drift.

### 11.1 Operating principles (приоритет сверху вниз)

1. **Ship over perfect.** Working Stripe-MCP demo на W3 > polished landing на W9 без демо.
2. **Critical path first.** Каждое утро: «что двигает critical path сегодня?» — это первым.
3. **Vendors > time.** Если < $50/mo и экономит неделю — берём.
4. **Lock contracts early.** API contracts, IR schema, DB schema — freeze к концу W2. Потом дорого.
5. **No premature optimization.** Single-region, один LLM provider, без своего кэша.
6. **Demo-driven development.** Каждую пятницу EOD — 5-минутное демо новой capability. Нельзя записать → не done.

### 11.2 6 фаз × 9 недель

| Phase | Weeks | Theme | Critical output |
|---|---|---|---|
| 0. Foundation | W1 | Accounts, monorepo, CI, contracts | Empty-but-deployable во всех окружениях |
| 1. Core Generation | W2–3 | Spec → IR → naive codegen | `npx mcpgen init <stripe-url>` → working MCP server |
| 2. LLM Optimization | W4–5 | 6 passes + playground | Same input → ≥50% token reduction |
| 3. Runtime & Deploy | W6–7 | Tenant Workers + dispatch + usage events | One-click deploy → live URL → metered |
| 4. Billing & Polish | W7–8 | Stripe Meters + pricing + landing | Test user subscribe → quota → bill |
| 5. Launch | W9 | Beta → public | First 100 signups |

### 11.3 5 параллельных треков

| Track | Что | Когда primary |
|---|---|---|
| **A — Generation** | Python/FastAPI/PydanticAI engine | W2–W5 |
| **B — Frontend** | Next.js + интеграция Claude Design макета | W2–W7 |
| **C — Runtime** | CF Workers / Dispatch / Tenant SDK | W6–W7 |
| **D — Ops** | DB, auth, billing, monitoring | W1, W7–W8 |
| **E — Content** | Docs, landing, demos, GTM | W7–W9 |

«Параллельно» для соло = переключение контекста при блокировке (CF deploy 5 мин, Vercel build 3 мин — заполняем доками; ожидание LLM rate-limit — Track E).

### 11.4 Контракты, которые ЗАМОРАЖИВАЮТСЯ

| Контракт | Когда lock | Owner | Влияет на |
|---|---|---|---|
| IR schema (Pydantic + TS) | end W1 | A | A, B, C |
| Generation API (`POST /generate`) | end W1 | A & D | A, B, D |
| DB schema v1 | end W1 | D | A, B, C, D |
| Tenant Worker SDK API | end W3 | C | A (codegen targets it) |
| Usage event schema | end W5 | C & D | C, D |

Контракты живут в `packages/contracts`. Breaking changes — только через weekly review.

### 11.5 Topp risks (всегда держать в голове)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Generation passes ломают descriptions / quality drift | F2 smell scan + F3 agent eval gate, golden tasks для popular APIs с W4 |
| R2 | Solo burnout W5–W6 | Принудительный выходной после Phase 2 |
| R3 | CF Workers for Platforms лимиты/цены | Verify в W3, иметь single-Worker fallback |
| R4 | Anthropic rate limits в Phase 2 | LiteLLM fallback на OpenAI/Gemini с дня 1 (model_routing.yaml) |
| R5 | Spec > 50 tools после Pass 0/1 | Hard fail с "split into multi-server" — ожидаемое поведение, не bug |
| R6 | F3 agent eval cost > бюджета | Free tier 1 eval/мес; Pro 5; PAYG $0.50/eval |

### 11.6 Anti-patterns — активно сопротивляться

1. «Refactor real quick перед feature» → нет. Feature → refactor в конце фазы.
2. «Vendor дешевле на $20» → нет. Часы работы > $20.
3. «Сначала выучу новый framework» → нет. Стек — контракт.
4. «Пусть docs будут идеальными» → нет. Docs хороши, когда существуют.
5. «OAuth логин Google + GitHub + Twitter + Apple» → нет. Email + GitHub. Всё.
6. «Нужно больше абстракций» → вряд ли. Жди 3-го дублирования.
7. «Запилю feature flag систему» → нет. `if (env.SOMETHING)` достаточно для MVP.

### 11.7 Launch criteria (must-have, иначе блок)

- Generate из OpenAPI URL работает E2E (5 популярных API)
- F2 smell scan: avg ≥ 3 на каждый из 6 components на golden specs
- F3 agent eval: success rate ≥ 70% на golden tasks для popular APIs
- Tool annotations (4 hints) присутствуют для каждого tool
- Pass 1: Six-Tool Pattern генерируется (6 universal + extras), final count 6–12 для popular APIs
- Pass 1 coverage 100% (никакие endpoints не теряются)
- Smart IDs работают: agent в F3 правильно использует возвращённые `{server}:{type}:{collection}:{identifier}`
- Hosted deploy работает для любого успешно сгенерированного сервера
- Pass-through credentials проверены (мы не логируем/храним upstream keys)
- Free/Pro checkout в production
- Quota enforcement (free → блок, Pro → overage billed)
- Sentry + BetterStack alerts
- One-click Claude Desktop config (или fallback copy-paste)
- Privacy + ToS · Pricing matches reality · Quickstart протестирован внешним dev'ом

**Kill switches (delay launch на неделю):** F3 success rate < 70% · F2 smell average < 3 · P1 security · deploy success rate < 95% · я не сплю 5+ дней.

→ Полная спецификация фаз, slip rules, демо-план, decision log: [`docs/mcpgen-implementation-plan.md`](docs/mcpgen-implementation-plan.md)

---

## 12. Workflow для Claude (порядок работы)

**Default first read:** [`RULES.md`](RULES.md) перед каждой нетривиальной задачей.

1. **Любая задача:** свериться с execution sequencing в [`docs/mcpgen-gsd-sprint-plan.md`](docs/mcpgen-gsd-sprint-plan.md) — какая phase, какой workstream, какие dependencies. **Это побеждает старый `mcpgen-implementation-plan.md`.**
2. **LLM call / model decision:** ИСТИНА — [`docs/mcpgen-model-and-provider-override.md`](docs/mcpgen-model-and-provider-override.md). Single model `qwen/qwen3-coder` через OpenRouter. Любые упоминания Sonnet/Haiku/Opus/GPT-5/Gemini/LiteLLM в any other doc — устарели. **Исключение:** F3 test agent остаётся на Sonnet 4.7 (он симулирует real Claude users).
3. **Git operation (branch/commit/PR/merge/recovery):** ИСТИНА — [`docs/mcpgen-git-workflow-rules.md`](docs/mcpgen-git-workflow-rules.md). Conventional Commits, atomic commits, squash merge, NEVER `--no-verify`, NEVER force-push to main.
4. **Feature flag / runtime toggle / A/B experiment / Pro-gating / kill switch:** ИСТИНА — [`docs/mcpgen-feature-flags-contract.md`](docs/mcpgen-feature-flags-contract.md). Flipt v2, Git-native YAML, 5 категорий с suffix-naming (`_kill`/`_rollout`/`_exp`/`_perm`/`_ops`), entityId=user.id, context без PII, errorStrategy=fallback. **НЕ создавать новые `if (env.FLAG_X)` гейты** — мигрировать существующие на Flipt согласно §4.4 inventory; новые гейты — сразу через Flipt. Generated tenant Workers — out of scope (immutability invariant). При conflict с другими docs о runtime toggles — этот контракт побеждает.
5. **Multi-terminal / parallel execution:** ИСТИНА — [`docs/mcpgen-gsd-sprint-plan.md`](docs/mcpgen-gsd-sprint-plan.md) §3 (terminal allocation) + §5 (cross-workstream coordination). Использовать `git worktree add` + `GSD_WORKSTREAM=<name>` env / `--ws <name>` флаг.
6. **Pass 0 задача (filtering, naming, categorization, auth detection, drift):** ИСТИНА — [`docs/mcpgen-pass-0-design.md`](docs/mcpgen-pass-0-design.md). При противоречии с v2 — Pass 0 design выигрывает.
7. **Pass 1 задача (Six-Tool Pattern, smart IDs, routing, coverage validation, action/workflow/specialized tools):** ИСТИНА — [`docs/mcpgen-pass-1-design.md`](docs/mcpgen-pass-1-design.md). При противоречии с v2 (которая раньше говорила про "Composite Synthesis") — Pass 1 design выигрывает.
8. **Pass 2 задача (description authoring, length budgets, prompt templates per tool type, inline quality gate, forbidden patterns):** ИСТИНА — [`docs/mcpgen-pass-2-design.md`](docs/mcpgen-pass-2-design.md). При противоречии с v2 — Pass 2 design выигрывает.
9. **Pass 3 задача (parameter specification, JSON Schema generation, naming/format/enums/defaults/description, filter design, smart ID patterns, standard parameter sets):** ИСТИНА — [`docs/mcpgen-pass-3-design.md`](docs/mcpgen-pass-3-design.md). При противоречии с v2 — Pass 3 design выигрывает.
10. **Pass 4 задача (annotations inference, verb pattern matching, openWorldHint invariant, workflow aggregation, title generation, consistency rules):** ИСТИНА — [`docs/mcpgen-pass-4-design.md`](docs/mcpgen-pass-4-design.md). При противоречии с v2 — Pass 4 design выигрывает.
11. **Pass 5 задача (response shaping, outputSchema generation, pagination, field filtering, truncation guidance, response_format):** ИСТИНА — [`docs/mcpgen-pass-5-design.md`](docs/mcpgen-pass-5-design.md). При противоречии с v2 — Pass 5 design выигрывает.
12. **Stage E задача (codegen, Jinja2 templates, tenant Worker structure, auth code, smart ID/pagination/truncation runtime):** ИСТИНА — [`docs/mcpgen-stage-e-design.md`](docs/mcpgen-stage-e-design.md). При противоречии с v2 — Stage E design выигрывает.
13. **Stage F задача (F1 static / F2 smell scan / F3 agent eval, retry orchestration, quality scoring, badges):** ИСТИНА — [`docs/mcpgen-stage-f-design.md`](docs/mcpgen-stage-f-design.md) **+ override:** F2 не использует 3 multi-family judges, заменено на single Qwen3-Coder с 5-shuffle prompt averaging + temperature variance — см. `mcpgen-model-and-provider-override.md` §4.
14. **Pipeline / IR / overall:** [`docs/mcpgen-generation-engine-v2.md`](docs/mcpgen-generation-engine-v2.md). НЕ использовать v1 6-passes из старой `mcpgen-architecture.md` §5.
15. **Architecture задача вне engine (BFF, runtime, dispatch, data, billing, security):** [`docs/mcpgen-architecture.md`](docs/mcpgen-architecture.md).
16. **UI задача:** ⚠ **UI ЗАЛОЧЕН.** Распаковать `claude-design-ui/MCP-Gen.zip` в `apps/web/src/`. **ЗАПРЕЩЕНО** менять визуал, layout, цвета, шрифты, копирайтинг. Frontend phase = только wire-up к API (state, fetch calls, SSE consumption, error display). См. sprint plan §4.7.
17. **UX-решение (копирайт/принципы, НЕ визуал):** [`docs/mcpgen-ux-flow.md`](docs/mcpgen-ux-flow.md).
18. **Запрос фичи вне MVP:** записать в `RULES.md §6` / `mcpgen-implementation-plan.md §11`, не реализовывать.
19. **Сомнение:** перечитать соответствующую секцию docs, не угадывать.
20. **Конфликт между документами:** `RULES.md` > `mcpgen-model-and-provider-override.md` (для моделей) > `mcpgen-git-workflow-rules.md` (для git) > `mcpgen-feature-flags-contract.md` (для feature toggles) > `mcpgen-gsd-sprint-plan.md` (для sequencing) > stage/pass-detail-design > v2 engine > architecture > implementation-plan > ux-flow.
21. **Не дублировать знания** из docs в код-комментарии.

---

## 13. Глоссарий

**Engine v2:**
- **Stage** — группа passes с общей retry-границей: A (Parse), B (Architect), C (Author), D (Shape), E (Codegen), F (Validate).
- **Pass 0–5** — конкретный шаг внутри LLM-stages: Inventory · **Consolidation (Six-Tool Pattern)** · Description · Parameters · Annotations · Response Shape.
- **IR** — Universal Intermediate Representation, формат-агностичная структура API после parsing. v2 IR содержит `ToolDescription` (6 components), `ToolAnnotations` (4 hints), `ResponseConfig`, `RoutingConfig` (Pass 1 routing rules).
- **6 description components** — paper rubric: Purpose · Guidelines · Limitations · Parameter doc · Examples · Length & Completeness.
- **4 tool annotations** — MCP spec hints: `readOnlyHint` · `destructiveHint` · `idempotentHint` · `openWorldHint`. Влияют на auto-approve в Claude Desktop / Cursor.
- **Smell scan (F2)** — rubric scoring через 3 multi-family judges. Stage F design ОБНОВИЛ models: **Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro** (НЕ Haiku/mini/flash как раньше). Threshold ≥ **4.0** (НЕ ≥ 3). Prompt shuffling + score averaging.
- **Agent eval (F3)** — Sonnet 4.7 в loop'е (max 10 turns) против golden tasks, threshold ≥70%.
- **Quality Score** — public-facing 0–5 metric, opt-in для badge.
- **Golden tasks** — pre-curated test cases для popular APIs (Stripe/GitHub/Notion/Linear/Slack); auto-gen для custom specs.
- **Smell** — низкий rubric score на одном из 6 components. По paper, 97.1% существующих MCP-серверов имеют ≥1 smell.

**Pass 0 (detail design):**
- **target_complexity** — user-facing parameter: `minimal` (≤15 tools, только core CRUD) · `standard` (≤50, default) · `comprehensive` (up to cap). Radio button в UI после Auth detection.
- **DropReason** — enum причины отбрасывания endpoint'а: `DEPRECATED` · `INTERNAL` · `HEALTH_CHECK` · `WEBHOOK` · `AUTH_FLOW` · `REDUNDANT` · `LOW_VALUE` · `USER_EXCLUDED` · `EXCEEDS_CAP` · `METHOD_NOT_SUPPORTED`.
- **User Override Flow** — user явно возвращает dropped endpoint в taxonomy через `explicit_includes`. Влияет если `can_user_override=true`.
- **Composite candidate (Pass 0 hint)** — Pass 0 предлагает (не создаёт) chains 2–5 tools для Pass 1 — теперь используется только для identifying potential **workflow tools** (исключение из Six-Tool Pattern).
- **Auth subsystem** — 3 модели передачи credentials: pass-through (default для API key/Basic) · stored (AES-256-GCM, для OAuth и AWS Sig) · OAuth flow on behalf (для user-delegated APIs).
- **Chunked approach** — для specs > 200 endpoints: 4-phase pipeline (path-cluster → cluster decisions → per-cluster detail в parallel → cross-cluster merge). Activate threshold: > 200 endpoints. Hard fail: > 1000.
- **Spec drift** — изменение upstream API spec'а. Detection через daily Inngest cron + content hash; UI surface с diff и user actions (manual review / one-click regenerate / auto-regenerate toggle).

**Pass 1 (detail design — Six-Tool Pattern):**
- **Six-Tool Pattern** — canonical structure для любого data-oriented API: 6 universal tools (`search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete`) + extras. Industry consensus (Anthropic + OpenAI + MCP Bundles, October 2025). Empirical: ~70% token savings.
- **Universal tools** — 6 канонических. **OpenAI compliance:** `search(query: string)` и `fetch(id: string)` — exact signatures для ChatGPT Deep Research integration.
- **Smart IDs** — `{server}:{type}:{collection}:{identifier}` (`stripe:object:Charge:ch_3O5jJ2...`). Routing logic — в ID format, НЕ в tool definition. Server парсит ID и routes в правильный upstream endpoint.
- **Action tool** — POST endpoint с side effect, не fits в `upsert` (например `charges_capture`, `messages_send`). Naming: `{namespace}_{verb}`.
- **Workflow tool** — multi-step (2–5 endpoints) coherent task. **Strict gate:** prescribed workflow + recoverable on partial failure + positive token economy. Например `schedule_event` (find slot → create). Pass 0 `composite_candidates` — только hints для identification, синтез — Pass 1.
- **Specialized tool** — rare read patterns не fit'ящие в `list_objects(filter, sort_by, limit)`. Используется sparingly.
- **Coverage 100%** — Pass 1 mandatory: каждый Pass 0 tool должен быть covered (subsumed универсальным или extra). Validation в Phase 4. Fail → retry с list missing endpoints; после 3 retry → degrade as `specialized_tools` с warning.
- **Token economy** — Pass 1 reports estimated savings vs Pass 0 baseline. Expected ~70% для typical API (50 → 6–12 tools).
- **RoutingConfig** — таблица как универсальные параметры мапятся на upstream endpoints. Используется в Stage E codegen.

**Pass 2 (detail design — Description Authoring):**
- **5 of 6 paper rubric components в v0** — Purpose · Guidelines · Limitations · Parameter overview · Length & Completeness (meta). **Examples deferred к v1.1** (требуют execution traces; LLM-hallucination prevention).
- **Tool type → prompt template** — universal/action/workflow/specialized имеют разные description styles и length budgets.
- **Length budgets per tool type** — universal 200–400 tokens / action 100–200 / workflow 150–300 / specialized 80–150. Calibrated по paper finding (rich descriptions: +5.85pp accuracy).
- **`when_not_to_use`** (новое поле в Guidelines) — для tools с близкими альтернативами (например, search vs list_objects). Optional.
- **`how_to_use`** — `str` (НЕ `list[str]`), для нетривиальных tools. Optional.
- **Parameter overview vs Parameter doc** — Pass 2 пишет high-level overview (150–300 chars, mentions key params + relationships); per-parameter detail (format hints, examples per param, common_mistakes) — это Pass 3.
- **Inline quality gate (Phase 3)** — single Haiku judge per tool, abbreviated 4-component rubric (Purpose / Guidelines / Limitations / Parameter overview), threshold ≥3. Не путать с full F2 smell scan (3 multi-family judges, full 6-component rubric).
- **Forbidden patterns** (regex catch) — marketing language ("powerful", "elegant"), filler ("you can", "this tool allows"), tautology ("this list tool lists"), vague ("various", "appropriate").
- **Examples policy** — ONLY from spec, никогда LLM-hallucinated. `examples = null` если spec не содержит. Quality Report surfaces "X tools without examples (v1.1 sandbox feature)".
- **Per-tool parallel** — Sonnet 4.7 calls с concurrency 10. Cost per server (10 tools): ~$0.40–0.65 включая inline quality gate.

**Pass 3 (detail design — Parameter Specification):**
- **Главная цель** — устранить **Opaque Parameters smell** (84.3% существующих MCP по paper). Pass 3 — second по importance после Pass 2.
- **5 dimensions per parameter:** naming · format/constraints · enums · defaults · description.
- **5-component parameter description (MCP Bundles template):** what it is (1 sentence) · possible values/format/range · when to use / what it affects · example (concrete, copy-pastable, safe) · default / omission behavior.
- **Naming normalization rules** — `user → user_id` · `data → payload` · `id (ambiguous) → {entity}_id` · `status (ambiguous) → {entity}_status` · `time → created_at`. Имя должно быть unambiguous даже в isolation.
- **Filter parameter — 3 approaches** (deterministic selection):
  - **A. Structured Object** (default) — `{property, operator, value}` с enum operators (Equal/NotEqual/GreaterThan/Contains/In/etc.)
  - **B. DSL String** — когда underlying API имеет SQL/GraphQL native query
  - **C. Individual Filter Params** — ≤4, для simple cases с few possible filters
- **Smart ID parameter** — pattern auto-generated из Pass 1 `SmartIdSchema`. Description includes format `{server}:{type}:{collection}:{identifier}` + plain identifier fallback.
- **Per-tool-type parameter strategies:**
  - Universal Discovery (search/fetch) — single-string OpenAI standard
  - Universal List — rich set (collection/properties/filter/sort_by/sort_order/limit/offset)
  - Unified Write (upsert/delete) — smart routing params (oneOf для data, type-based для delete)
  - Action — domain-specific, focused, few
  - Workflow — coarse parameters (user intent, не internal step IDs)
- **Standard parameter sets** для universal tools (Pass 3 design Appendix A) — consistent naming/types across servers (limit default 25, offset default 0, sort_order default "desc", и т.д.).
- **JsonSchema output** — production-ready inputSchema с `properties` (per-param `ParameterSchema`), `required`, `additionalProperties: false`. Все JSON Schema fields: type · description · enum · format · pattern · minimum/maximum · minLength/maxLength · default · examples · items · oneOf.
- **4-phase pipeline:** (1) det extraction из spec → (2) per-parameter LLM enrichment (Sonnet/Haiku, parallel concurrency **20**) → (3) cross-parameter validation (uniqueness, mutual exclusivity, JSON Schema validity) → (4) inline quality gate (single Haiku judge per tool, parameter-specific 5-component rubric, threshold ≥ 3).
- **Cost per server** (10 tools, ~80 params): ~$0.30–0.50 включая inline gate. Latency 45–70s.
- **Defaults policy** — prefer spec defaults always; sensible defaults (limit=25, offset=0) только когда spec не provides.
- **Examples policy** — generate value examples (format/structure), НЕ result examples. Safe.
- **Cross-tool consistency** — в одном server все filter params используют один approach; sort_order имеет один default; smart ID format consistent.

**Pass 4 (detail design — Annotations Inference):**
- **4 boolean hints + title** для каждого tool (MCP spec 2025-03-26): `readOnlyHint` · `destructiveHint` · `idempotentHint` · `openWorldHint` + `title`.
- **⚠ MCP defaults опасны** — `destructiveHint: true` и `openWorldHint: true` by default. Pass 4 ВСЕГДА выставляет все 4 явно.
- **⭐ Architectural invariant:** `openWorldHint = true` ВСЕГДА (мы wrap external REST APIs). Hardcoded, не требует LLM.
- **80% deterministic** через tool-type rules (Pass 1) + verb pattern matching. LLM (Haiku) ТОЛЬКО для edge cases (~1–3 tools/server).
- **Tool-type rules** (НЕ HTTP method, как в старой v2): универсальные read tools → readOnly+idempotent; upsert → !readOnly, !destructive, !idempotent (creates → потенциально дубликаты); delete → destructive+idempotent (re-delete = no-op); specialized_read → readOnly+idempotent.
- **Action verb patterns** (Appendix B): `_refund/_reverse/_undo` → destructive, !idempotent · `_cancel/_void/_revoke` → destructive+idempotent · `_archive/_soft_delete` → destructive+idempotent · `_capture/_charge/_pay` → !destructive, !idempotent · `_unlock/_enable/_activate` → !destructive, idempotent · `_send/_lock/_publish/_notify` → medium-confidence → Haiku review.
- **Workflow tools — conservative aggregation** (worst case across sub-operations): `readOnly = AND across subs`, `destructive = OR across subs`, `idempotent = AND across subs`.
- **Conservative defaults when uncertain:** readOnly=false, destructive=true, idempotent=false. UX safety > optimization.
- **Consistency rules** (Phase 3 enforced): readOnly=true → idempotent=true (auto-fix); destructive=true → readOnly=false (auto-fix); openWorldHint != true → force true.
- **Title generation** — deterministic snake_case → Title Case + verb reordering для actions (`charges_capture` → "Capture Charge"). LLM polish — Pro feature post-MVP.
- **Internal pipeline (3 phases):** (1) deterministic rules ($0, < 1s) → (2) LLM judgment selectively (Haiku, $0.01–0.03, 3–10s, only for `_needs_llm_review` tools) → (3) consistency validation ($0, < 1s).
- **PUT vs PATCH detection** — для updates: PUT (replace) → destructive=true; PATCH (merge) → destructive=false.
- **Самый дешёвый pass:** ~$0.01–0.05, 5–15s.
- **Annotations — UX hints, НЕ безопасностные гарантии** (MCP blog). Real safety — в actual implementation.

**Pass 5 (detail design — Response Shaping):**
- **Two token problems:** schema bloat (input — solved by Pass 1) и **response bloat** (output — Pass 5 main fight). Real example: HRIS list_employees 50 fields × 100 records = 80K tokens raw → 8K с filtering (10x reduction).
- **5 mechanisms:**
  1. **Output schema generation** (MCP 2025-06-18 standard) — каждый tool получает `outputSchema`. `structuredContent + content` dual return для backward compat.
  2. **Pagination strategy + defaults** — auto-detect cursor/offset/page-number из spec. Default `limit=25`, `max_limit=100`. Cursor — MCP canonical (preferred).
  3. **Field filtering defaults** — always-include (id, status, name, timestamps, required) / opt-in via `properties` param (verbose nested, metadata, large blobs) / always-exclude (PII, internal, deprecated).
  4. **Truncation thresholds + teaching guidance** — per tool type: search 10K / list_objects 15K / fetch 20K / action 5K / workflow 15K / upsert/delete 5K. Truncation message — **teaching moment**, не info. Templates с placeholders `{N}/{Total}/{action}` (Appendix A).
  5. **`response_format` enum** (optional) — `summary/detailed/raw`. Default `summary`. Добавляется только когда complex (> 20 fields, varied use cases).
- **outputSchema** — JSON Schema для response, MCP 2025-06-18 spec. Обязательный для всех tools. Universal tools subsume много endpoints → use `oneOf` или generic с `additionalProperties: true`.
- **Cursor-based pagination preferred** — opaque strings, MCP canonical. Auto-detection: spec response has `next_cursor`/`nextCursor`/`page_token` → cursor; spec request has `offset`/`skip` → offset; `page`/`per_page` → page_number.
- **Field importance heuristics (Appendix B)** — pre-LLM scoring: required → +0.5; high-value patterns (`_id`, `_at`, `name`, `title`, `status`) → +0.3; low-value (`_internal`, `raw_`, `debug`, `deprecated`) → -0.3.
- **Conservative bias for field filtering** — when uncertain prefer opt-in. Better agent request field than burn tokens на unused data.
- **`ResponseConfig` schema (refined Pass 5):** `pagination: PaginationConfig | None`, `field_filtering: FieldFilteringConfig | None`, `truncation: TruncationConfig`, `has_response_format_param: bool`. (Старая v2 IR имела другие поля — устарело.)
- **`FinalTool`** — финальный output Pass 5: `inputSchema` (Pass 3) + `outputSchema` (Pass 5) + `annotations` (Pass 4) + `response_config` (Pass 5) + `description` (Pass 2).
- **Internal pipeline (5 phases):** (1) det pagination detection → (2) det outputSchema extraction → (3) Haiku field ranking ‖×10 (для tools с > 10 response fields) → (4) truncation guidance authoring (templates + minor LLM polish) → (5) validation.
- **Cost per server** (10 tools): ~$0.05–0.15 (~5 tools требуют Haiku field ranking). Latency 15–25s. Один из дешёвых passes.

**System:**
- **Tenant** — отдельная organization, у которой свои deployed MCP-серверы.
- **Pass-through credentials** — режим, когда tenant Worker не хранит upstream key, получает в каждом request от MCP-клиента.
- **Stored credentials** — alt режим, AES-256-GCM с per-tenant DEK в CF KV.
- **Dispatch Worker** — главный CF Worker, маршрутизирующий входящие requests в tenant Workers.
- **Drift** — изменение upstream API spec'а.
- **Multi-server pattern** — для больших API (Stripe → 3 specialized servers: charges / customers / subscriptions), не один monolith. Используется когда после Pass 0 (intermediate) > 50 tools.

→ Pass 0–5: [`pass-0`](docs/mcpgen-pass-0-design.md) · [`pass-1`](docs/mcpgen-pass-1-design.md) · [`pass-2`](docs/mcpgen-pass-2-design.md) · [`pass-3`](docs/mcpgen-pass-3-design.md) · [`pass-4`](docs/mcpgen-pass-4-design.md) · [`pass-5`](docs/mcpgen-pass-5-design.md) · Stage E: [`stage-e`](docs/mcpgen-stage-e-design.md) · Stage F: [`stage-f`](docs/mcpgen-stage-f-design.md) · Engine: [`v2`](docs/mcpgen-generation-engine-v2.md) · System: [`architecture`](docs/mcpgen-architecture.md)

**Stage E (Codegen — detail design):**
- **Native MCP tools** (НЕ Code Mode) на Cloudflare Workers. Decision: Six-Tool Pattern уже даёт Code-Mode-level token efficiency на структурном уровне без runtime code execution.
- **100% deterministic Jinja2 templates.** No LLM calls. Cost $0.
- **~25–30 generated files** (~15 templates) — package.json, wrangler.toml, tools/*.ts (per-tool-type templates), runtime/* (smart_id, pagination, truncation, upstream, response_shaping, errors), auth/middleware.ts, schemas/* (Zod inputs/outputs/routing).
- **6 phases:** scaffold → schemas → runtime → auth → tool handlers → **TS validation (`tsc --noEmit`)**.
- **3 auth modes:** passthrough (default API key/Basic), stored (encrypted AES-256-GCM в CF KV для OAuth tokens/AWS Sig), OAuth flow (через `@cloudflare/workers-oauth-provider`).
- **Per-tool-type templates:** universal (search/fetch/list_*/upsert/delete) · action (`tool_action.ts.j2` per-tool) · workflow (sequential steps + partial failure handling) · specialized.
- **Error templates teach agent next step** (Anthropic principle): 401 → "verify credentials"; 404 → "use search() first"; 429 → "Retry-After Xs, batch operations"; validation_error → "common issue: {suggestion}".
- **MCP 2025-06-18:** возвращаем `content` (text) + `structuredContent` (object) для backward compat.
- **CF Workers only в MVP.** Multi-runtime (Node.js/Deno/Vercel Edge) — based on demand.
- **Cost $0, latency 5–12s.** Самый дешёвый stage.

**Stage F (Validation — detail design):**
- **Three tiers:** F1 static + F2 smell scan + F3 agent eval. F1+F2 always run; F3 opt-in OR auto-triggered if F2 < 4.0.
- **F1 Static** ($0, 5–10s): TS compilation, JSON Schema validity, MCP protocol compliance, secret scan (`gitleaks`/TruffleHog), template artifact check, smart ID regex compile, routing completeness, auth middleware presence. Each failed check → mapped к specific upstream pass (см. failure mapping в Pass design).
- **F2 Smell scan** ($0.20–0.50, 20–30s): **3 multi-family judges Sonnet 4.7 + GPT-5 + Gemini 3.5 Pro** (НЕ Haiku/mini/flash как раньше — обновлено per MCP-Bench paper для production-grade quality). 6-component rubric × prompt shuffling × score averaging. Threshold ≥ 4.0. Per-component failures → targeted retries (Purpose<3 → Pass 2; Parameter<3 → Pass 3; etc.). Examples expected score 1–2 в v0 (deferred).
- **F3 Agent eval** ($1–3, 1–3min): real Sonnet 4.7 agent vs golden tasks. **Two-tier evaluator** (rule-based + LLM judge per MCP-Bench arXiv 2508.20453). Pass criteria: rules.all() + judge.task_completion ≥ 7 + grounding ≥ 6. Server pass rate ≥ 0.7. Hybrid env: real sandbox (Stripe test mode, GitHub test orgs, Notion test, Calendar) для top 10 APIs; mocked для rest.
- **Failure pattern → retry mapping (Appendix A):** agent confuses 2 tools → Pass 2; wrong parameter format → Pass 3; missing destructive hint → Pass 4; loop after truncation → Pass 5; auth fails → Stage E; hallucinates → Pass 5 + Stage E.
- **Targeted retry orchestration:** max 2 retry rounds per generation, cached prior-pass outputs reused (~5x cheaper than full regen). After exhausted → terminal failure (degraded deploy с warnings).
- **Quality badges:** premium (90–100, F1 pass + F2 ≥ 4.5 + F3 ≥ 0.85) · verified (75–90, F1 pass + F2 ≥ 4.0 + F3 ≥ 0.7) · standard (60–75) · needs_review (<60).
- **Quarterly judge calibration** с human evaluators (per MCP-Bench methodology). Target ICC > 0.85.
- **Pricing:** Free 1 F3 eval/мес; Pro 5/мес included; PAYG $0.50/eval. Total Stage F cost: $0.20–0.50 (no F3) или $1.20–3.50 (with F3).

**Model & Provider Override (single source of truth для LLM решений):**
- **Single model:** `qwen/qwen3-coder` — для ВСЕХ tasks (Pass 0–5, Stage F2). Заменяет Sonnet 4.7 / Haiku 4.5 / Opus / GPT-5 / Gemini 3.5 Pro.
- **Single provider:** OpenRouter (OpenAI-compatible API). LiteLLM удалён.
- **Pricing:** $0.14/M input · $0.80/M output. Total per generation ~$0.10–0.13 (vs $1–3 раньше = ~10–20x cheaper).
- **PydanticAI integration:** `OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key=$OPENROUTER_API_KEY)` + `OpenAIModel("qwen/qwen3-coder", provider=...)`.
- **Env vars:** `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `PRIMARY_MODEL=qwen/qwen3-coder`, optional `OPENROUTER_HTTP_REFERER`/`OPENROUTER_X_TITLE`.
- **F2 multi-judge replacement:** single Qwen3-Coder с **5-shuffle prompt averaging + temperature variance (0.0/0.2/0.5)** = 15 evaluations per tool. Quality target ~75–80% human agreement (vs 86.67% multi-family) — acceptable trade-off для 10x cost reduction.
- **F3 test agent EXCEPTION:** real Sonnet 4.7 остаётся (он симулирует real Claude users в production — different from generation pipeline). Cost $1–3 per F3 eval сохраняется.
- **Sampling profiles:** creative (T=0.3) для descriptions/params · classification (T=0.0) для annotations/smell scan · codegen (T=0.2) если нужно.
- **Day 1 smoke test mandatory:** verify Qwen3-Coder works с PydanticAI structured outputs (function calling) до full implementation. Fallback: `qwen/qwen3-30b-a3b-instruct`.

**Git Workflow Rules:**
- **Branching:** trunk-based, short-lived (1–3 days max 1 week) `feature/`/`fix/`/`refactor/`/`docs/`/`chore/`/`test/`/`experiment/`. Forbidden: `wip/*` `claude/*` `ai/*` `temp/*`.
- **Commits:** Conventional Commits 1.0.0 mandatory (`type(scope): subject`, ≤72 chars, imperative, no period). **Atomic** — one logical change per commit. Если "and" в subject — split.
- **Merge:** **squash only** (linear history). PR title becomes commit message.
- **Self-review** mandatory перед requesting human review (catches 50% issues).
- **Pre-commit hooks** mandatory (gitleaks + lint + typecheck + conventional-pre-commit). NEVER `--no-verify`.
- **Forbidden ops** (must NEVER без explicit approval): `git push --force` любая branch · push на main direct · `--no-verify` · history rewrite shared · `git tag -d` · committing secrets/node_modules · `--allow-empty`.
- **AI-agentic specifics:** CLAUDE.md / `.claude/settings.json` с deny-list / `.claude/commands/` (`/commit`, `/pr`, `/review`, `/ship`) / git worktrees для parallel sessions / Plan Mode для complex tasks / "Challenge Claude" pattern.
- **Recovery:** `git reflog` спасёт почти любую mistake. `git stash`, `--soft reset`, `--amend` (только не pushed).
- **AI gotchas:** plausible-but-wrong code · phantom file refs · outdated training data patterns · context drift · confident commits на wrong branch · over-engineering simple tasks. Mitigations через type checks, hooks, branch protection, plan mode.

**GSD Sprint Plan (multi-terminal parallel execution):**
- **Workstream** — изолированный execution context: `--ws <name>` флаг или `GSD_WORKSTREAM=<name>` env var. `.planning/workstreams/<name>/` per-stream state.
- **Терминалов 4–5 параллельно:** `main` (Foundation + Phases 9/10) · `engine` (Phases 2–5) · `runtime` (Phase 6) · `ops` (Phase 8) · `frontend` (Phase 7, UI locked).
- **Git worktrees** для isolation: `git worktree add ../mcpgen-<ws> -b feature/<ws> main` per workstream. `workflow.use_worktrees: true`.
- **Phase dependency graph:** Phase 1 (Foundation) blocks all → Phases 2–5 (engine sequential), 6 (runtime), 7 (frontend), 8 (ops) — параллельны → Phase 9 (Observability integration) → Phase 10 (Launch).
- **GSD config recommended:** `mode: yolo` · `granularity: fine` (10 phases) · `parallelization: true` · `model_profile: inherit` (single Qwen) · `ui_phase: false` + `ui_safety_gate: false` (UI locked) · `auto_advance: false` (контроль над merge gates).
- **Merge order mandatory:** Foundation → Engine → Runtime → Ops → Frontend → Observability → Launch. НЕ merge'ить 2 PR в main одновременно.
- **Total time:** ~6 недель (vs 9 sequential).
- **Daily sync ritual** в Terminal 1 (main): `git fetch --prune` + `git log --graph --all` + per-workstream `cat .planning/workstreams/$ws/STATE.md`.
- **Contract change protocol:** STOP в workstream → main terminal → propose в `packages/contracts` → review impact → merge → all workstreams `git fetch && git rebase`.
- **Anti-patterns:** запустить multiple ws без `--ws` (collision) · merge'ить engine pass-by-pass (frontend/runtime запутаются) · менять UI в frontend ws (ЗАПРЕЩЕНО — locked) · skip integration gates · long-lived ws branches > 2 недель без rebase · использовать LiteLLM (deleted).
