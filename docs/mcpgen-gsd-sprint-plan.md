# MCPGen — GSD Sprint Plan

> **Назначение:** practical playbook как разрабатывать MCPGen через GSD framework с **multi-terminal parallel sprints**.
> Этот файл — единственный источник истины для **execution sequencing**, **dependency graph между фазами**, **workstream layout** и **terminal allocation**.
> **При противоречии с `mcpgen-implementation-plan.md`** — выигрывает этот файл (sprint plan детальнее, учитывает GSD механику).
> **Last updated:** 2026-04-26.

---

## 0. TL;DR

- **Один Claude Code instance** = **один workstream** = **один terminal** = **один git worktree**.
- **3-4 workstream'а параллельно** после Phase 1 (Foundation).
- **GSD workstreams** (`--ws <name>`) изолируют `.planning/` per-stream → не мешают друг другу.
- **Git worktrees** изолируют код per-stream → нет merge-конфликтов в процессе.
- **Sequential merge gates** между sprint blocks — не ship'аем все одновременно, а merge'им по мере готовности.
- **UI ЗАЛОЧЕН** (готовый дизайн в `claude-design-ui/MCP-Gen.zip`). Frontend-фаза = только wire-up, не визуал.
- **Single LLM model:** Qwen3-Coder через OpenRouter (см. `mcpgen-model-and-provider-override.md`).
- **Git rules:** см. `mcpgen-git-workflow-rules.md` — atomic commits, conventional commits, squash merge, short-lived branches.

---

## 1. Принципы parallel sprint execution

### 1.1 Что параллелится, а что нет

| Тип работы | Параллелится? | Почему |
|---|---|---|
| **Foundation** (контракты, DB schema, monorepo) | ❌ Никогда | Все остальные треки зависят от контрактов |
| **Generation passes 0→5** | ❌ Внутри трека sequential | Pass N+1 потребляет output Pass N |
| **Stage E (codegen)** | ❌ После Pass 5 | Зависит от FinalTool из Pass 5 |
| **Stage F (validation)** | ⚠ F1 после E; F2/F3 параллельно с друг другом | F2/F3 независимы, оба читают сгенерированный код |
| **Generation Engine vs Runtime vs Ops** | ✅ Да — разные workstreams | Связаны только через локнутые контракты |
| **Frontend wire-up vs Backend** | ✅ Да | Контракты заморожены в Phase 1 |
| **Тесты внутри одного pass** | ✅ Да | Independent test cases |
| **Documentation** | ✅ Да, в любое время | Не влияет на код |

### 1.2 Правило слияния треков

**После каждого workstream merge → integration check → next sprint block.**

Не пытаться merge'ить 4 workstream'а одновременно. Merge order:
1. Foundation (Phase 1) — **must be first**
2. Engine workstream (Phases 2–5) — heaviest, merge first после Foundation
3. Runtime workstream (Phase 6) — depends on engine for codegen format
4. Ops workstream (Phases 8 + 9) — depends on Runtime для usage events
5. Frontend workstream (Phase 7) — depends на API контракты (доступны после Phase 1, но удобнее merge после Engine)
6. Launch (Phase 10) — после всех

---

## 2. Roadmap: phases, dependencies, workstreams

### 2.1 Phase dependency graph

```
                            ┌─────────────────┐
                            │ Phase 1         │
                            │ FOUNDATION      │
                            │ (contracts/DB/  │
                            │  monorepo/auth  │
                            │  scaffold)      │
                            └────────┬────────┘
                                     │ contracts locked
            ┌────────────────────────┼────────────────────────┬─────────────────┐
            │                        │                        │                 │
            ▼                        ▼                        ▼                 ▼
   ┌────────────────┐       ┌────────────────┐      ┌────────────────┐  ┌────────────────┐
   │ WS: engine     │       │ WS: runtime    │      │ WS: ops        │  │ WS: frontend   │
   │ Phase 2        │       │ Phase 6        │      │ Phase 8        │  │ Phase 7        │
   │ Pass 0+1       │       │ CF Workers +   │      │ Auth (Logto) + │  │ Wire UI ↔ API  │
   │ (Architect)    │       │ Dispatch +     │      │ Billing        │  │ (no visual     │
   │                │       │ Tenant SDK     │      │ (Stripe Meters)│  │  changes)      │
   └────────┬───────┘       └────────┬───────┘      └────────┬───────┘  └────────┬───────┘
            │                        │                        │                  │
            ▼                        │                        │                  │
   ┌────────────────┐                │                        │                  │
   │ Phase 3        │                │                        │                  │
   │ Pass 2+3+4     │                │                        │                  │
   │ (Author)       │                │                        │                  │
   └────────┬───────┘                │                        │                  │
            │                        │                        │                  │
            ▼                        │                        │                  │
   ┌────────────────┐                │                        │                  │
   │ Phase 4        │                │                        │                  │
   │ Pass 5 +       │                │                        │                  │
   │ Stage E        │                │                        │                  │
   └────────┬───────┘                │                        │                  │
            │                        │                        │                  │
            ▼                        │                        │                  │
   ┌────────────────┐                │                        │                  │
   │ Phase 5        │                │                        │                  │
   │ Stage F        │                │                        │                  │
   │ (F1+F2+F3)     │                │                        │                  │
   └────────┬───────┘                │                        │                  │
            │                        │                        │                  │
            └────────────┬───────────┴────────────┬───────────┴──────────────────┘
                         │                        │
                         ▼                        ▼
                ┌────────────────────────────────────────┐
                │ INTEGRATION GATE (Phase 9 prep)        │
                │ Merge all workstreams to main          │
                │ Run E2E smoke tests                    │
                └────────────────────┬───────────────────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │ Phase 9        │
                            │ Observability  │
                            │ + Polish       │
                            │ (Langfuse,     │
                            │  Sentry,       │
                            │  BetterStack)  │
                            └────────┬───────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │ Phase 10       │
                            │ LAUNCH         │
                            │ (pricing,docs, │
                            │  demos, GTM)   │
                            └────────────────┘
```

### 2.2 Phase summary table

| # | Phase | Workstream | Depends on | Parallelizable | Rough effort |
|---|---|---|---|---|---|
| 1 | Foundation | `main` | — | ❌ first | 1 week |
| 2 | Generation Engine — Architect (Pass 0+1) | `engine` | Phase 1 | ✅ with 6, 7, 8 | 1 week |
| 3 | Generation Engine — Author (Pass 2+3+4) | `engine` | Phase 2 | ✅ within engine sequential | 1.5 weeks |
| 4 | Generation Engine — Shape & Codegen (Pass 5 + Stage E) | `engine` | Phase 3 | ✅ within engine sequential | 1 week |
| 5 | Generation Engine — Validation (Stage F) | `engine` | Phase 4 | ✅ within engine sequential | 1 week |
| 6 | Runtime Plane (CF Workers + Dispatch + Tenant SDK) | `runtime` | Phase 1 | ✅ with 2–5 | 1 week |
| 7 | Frontend Wire-Up (UI ↔ API, NO visual changes) | `frontend` | Phase 1 (contracts), ideally after Phase 5 | ✅ with 2–6, 8 | 1 week |
| 8 | Auth + Billing (Logto + Stripe Meters) | `ops` | Phase 1 | ✅ with 2–7 | 1 week |
| 9 | Observability & Polish | `main` | Phases 2–8 merged | ❌ integration phase | 0.5 week |
| 10 | Launch | `main` | Phase 9 | ❌ final | 0.5 week |

**Total calendar time:** ~5–6 недель при 3-4 параллельных workstream'ах (vs ~9 недель sequential).

---

## 3. Multi-terminal workflow

### 3.1 Terminal allocation

```
Terminal 1: MAIN  (always on `main` branch, in /Users/igor/Projects/mcpgen)
            ↳ Foundation Phase 1
            ↳ Integration gates
            ↳ Phase 9 + 10
            ↳ Code reviews / merges

Terminal 2: ENGINE (workstream `engine`, worktree at ../mcpgen-engine)
            ↳ Phases 2 → 3 → 4 → 5 sequentially
            ↳ Branch: feature/engine-passes (longer-lived, 4 weeks)
            ↳ Push intermediate squash commits per phase

Terminal 3: RUNTIME (workstream `runtime`, worktree at ../mcpgen-runtime)
            ↳ Phase 6
            ↳ Branch: feature/runtime-cf-workers
            ↳ ~1 week, then merge

Terminal 4: OPS (workstream `ops`, worktree at ../mcpgen-ops)
            ↳ Phase 8 (auth + billing)
            ↳ Branch: feature/auth-billing
            ↳ ~1 week, then merge

Terminal 5: FRONTEND (workstream `frontend`, worktree at ../mcpgen-frontend)
            ↳ Phase 7 (wire UI to API, NO visual changes — UI locked)
            ↳ Branch: feature/frontend-integration
            ↳ Start anytime after Phase 1, ideally after Engine merges
```

### 3.2 How to set up each terminal

**Terminal 1 (main):**

```bash
cd /Users/igor/Projects/mcpgen
git checkout main
# Run /gsd-new-project here ONCE, then Phase 1 commands
```

**Terminal 2 (engine workstream):**

```bash
# Create git worktree for isolated codebase
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-engine -b feature/engine-passes main
cd ../mcpgen-engine

# Activate GSD workstream — isolates .planning/ per-workstream
export GSD_WORKSTREAM=engine
# OR pass --ws engine to every gsd-* command

# Start Claude Code in this terminal
claude

# Inside Claude:
/gsd-plan-phase 2 --ws engine
/gsd-execute-phase 2 --ws engine
```

**Terminal 3 (runtime):**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-runtime -b feature/runtime-cf-workers main
cd ../mcpgen-runtime
export GSD_WORKSTREAM=runtime
claude
# /gsd-plan-phase 6 --ws runtime
# /gsd-execute-phase 6 --ws runtime
```

**Terminal 4 (ops):**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-ops -b feature/auth-billing main
cd ../mcpgen-ops
export GSD_WORKSTREAM=ops
claude
# /gsd-plan-phase 8 --ws ops
# /gsd-execute-phase 8 --ws ops
```

**Terminal 5 (frontend):**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-frontend -b feature/frontend-integration main
cd ../mcpgen-frontend
export GSD_WORKSTREAM=frontend
claude
# /gsd-plan-phase 7 --ws frontend
# /gsd-execute-phase 7 --ws frontend
```

### 3.3 Worktree cleanup (после merge)

```bash
# В Terminal 1 (main), после squash-merge PR
cd /Users/igor/Projects/mcpgen
git worktree remove ../mcpgen-engine          # удалить worktree
git branch -d feature/engine-passes           # удалить локальную branch
git fetch origin --prune                       # подчистить remote refs
```

### 3.4 Что НЕ делать в multi-terminal setup

- ❌ Не работать в одной директории из двух Claude instance'ов одновременно — collision гарантирована
- ❌ Не использовать flat `.planning/` без `--ws` если запускаешь параллельно — `STATE.md` будет переписан конкурентами
- ❌ Не пытаться merge'ить 2 PR в `main` одновременно — let CI complete sequentially
- ❌ Не запускать Phase 9 / 10 пока не merged все workstreams
- ❌ Не править UI в Frontend workstream — только wire-up

---

## 4. Phase-by-phase playbook

### 4.1 Phase 1 — Foundation (MAIN terminal)

**Goal:** Empty-but-deployable инфра во всех окружениях. Контракты заморожены.

**Workstream:** `main` (no workstream isolation needed — single terminal).

**GSD command sequence:**

```bash
cd /Users/igor/Projects/mcpgen
claude

# 1. Initialize GSD project (создаст .planning/ structure)
/gsd-new-project --auto @docs/mcpgen-architecture.md
# Использует ROADMAP.md из docs/mcpgen-implementation-plan.md как input

# 2. Discuss Phase 1 to lock decisions
/gsd-discuss-phase 1

# 3. Generate plans
/gsd-plan-phase 1

# 4. Execute (parallel within phase via waves)
/gsd-execute-phase 1

# 5. Verify
/gsd-verify-work 1

# 6. Ship
/gsd-ship 1
```

**Plans within Phase 1 (parallel waves):**

- Wave 1 (parallel):
  - `01-01-PLAN.md`: Monorepo scaffold (Turborepo + pnpm + apps/* + packages/*)
  - `01-02-PLAN.md`: Neon DB provisioning + Drizzle migrations baseline
  - `01-03-PLAN.md`: CF account + Workers + R2 buckets + KV namespaces
  - `01-04-PLAN.md`: Logto tenant + auth scaffold (no UI yet)
- Wave 2 (depends on Wave 1):
  - `01-05-PLAN.md`: IR schema (Pydantic + TS via codegen) — `packages/ir`
  - `01-06-PLAN.md`: Generation API contract (`POST /api/v1/generate` + SSE) — `packages/contracts`
  - `01-07-PLAN.md`: DB schema v1 (orgs, users, projects, specs, generations, deployments, tools)
- Wave 3 (depends on Wave 2):
  - `01-08-PLAN.md`: CI baseline (lint + typecheck + test + build) GitHub Actions
  - `01-09-PLAN.md`: Pre-commit hooks (см. `mcpgen-git-workflow-rules.md` §6)
  - `01-10-PLAN.md`: `.env.example` + secrets scaffold (OpenRouter, DB, R2, Logto)

**Lock contracts** (hard freeze в конце Phase 1):
- IR schema (`packages/ir/`)
- Generation API contract (`packages/contracts/`)
- DB schema v1
- Tenant Worker SDK API stub (`packages/runtime-sdk/`)
- Usage event schema

**Done criteria:** все четыре environment'а (web, api, dispatch, generation-engine) deploy'ятся пустыми, CI green, контракты в `packages/` ссылаются друг на друга и компилируются.

**Merge:** PR `feature/foundation` → squash-merge into `main`.

---

### 4.2 Phase 2 — Generation Engine: Architect (ENGINE terminal)

**Goal:** Pass 0 (Tool Inventory & Naming) + Pass 1 (Six-Tool Pattern Consolidation) работают на golden Stripe spec.

**Workstream:** `engine`.

**Pre-req:** Phase 1 merged. Контракты доступны в `packages/`.

**Setup:**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-engine -b feature/engine-passes main
cd ../mcpgen-engine
export GSD_WORKSTREAM=engine
claude
```

**GSD commands:**

```bash
/gsd-discuss-phase 2 --ws engine
/gsd-plan-phase 2 --ws engine
/gsd-execute-phase 2 --ws engine
/gsd-verify-work 2 --ws engine
```

**Plans within Phase 2:**

- Wave 1 (parallel):
  - `02-01-PLAN.md`: PydanticAI agent factory + OpenRouter integration (`mcpgen-model-and-provider-override.md` §2)
  - `02-02-PLAN.md`: Stage A — deterministic Spec Parser (OpenAPI → RawIR)
  - `02-03-PLAN.md`: Smoke test Qwen3-Coder structured output (см. `mcpgen-model-and-provider-override.md` §8)
- Wave 2 (depends on Wave 1):
  - `02-04-PLAN.md`: Pass 0 implementation (3 internal stages: det filter → Qwen LLM → validation), реф `mcpgen-pass-0-design.md`
  - `02-05-PLAN.md`: Pass 0 chunked approach для > 200 endpoints
  - `02-06-PLAN.md`: Pass 0 auth subsystem detection
- Wave 3 (depends on Wave 2):
  - `02-07-PLAN.md`: Pass 1 implementation (4 phases: classify → schema synth → routing → coverage validate), реф `mcpgen-pass-1-design.md`
  - `02-08-PLAN.md`: Smart IDs schema generation
  - `02-09-PLAN.md`: Coverage validation (100% mandatory) + retry logic
- Wave 4 (depends on Wave 3):
  - `02-10-PLAN.md`: Caching L1 + L2 + L3 (Anthropic prompt caching N/A для OpenRouter)
  - `02-11-PLAN.md`: Golden tests на Stripe + GitHub specs (Pass 0 → Pass 1 E2E)

**Don't drift to ENGINE.** В этом workstream ТОЛЬКО passes 0+1. Не трогать Pass 2/3/4 (Phase 3), Pass 5 (Phase 4), Stage F (Phase 5).

**Merge:** PR `feature/engine-passes` остаётся открытой; **не merge'ить пока не готовы Phase 3, 4, 5**, чтобы не gate'ить runtime/frontend integration. Альтернатива — squash-merge per-phase, тогда `feature/engine-pass-0-1` отдельно.

**Recommended:** один long-lived branch `feature/engine` с **per-phase squash commits**, merge после Phase 5.

---

### 4.3 Phase 3 — Generation Engine: Author (ENGINE terminal, продолжение)

**Goal:** Pass 2 (Description Authoring) + Pass 3 (Parameters) + Pass 4 (Annotations) генерируют production-ready descriptions/schemas/annotations.

**Workstream:** `engine` (тот же terminal/worktree).

**Pre-req:** Phase 2 done in workstream.

**GSD commands:**

```bash
/gsd-discuss-phase 3 --ws engine
/gsd-plan-phase 3 --ws engine
/gsd-execute-phase 3 --ws engine
/gsd-verify-work 3 --ws engine
```

**Plans within Phase 3:**

- Wave 1 (parallel):
  - `03-01-PLAN.md`: Pass 2 — prompt templates per tool type (universal/action/workflow/specialized), реф `mcpgen-pass-2-design.md`
  - `03-02-PLAN.md`: Pass 2 — length budgets validation + forbidden patterns regex
  - `03-03-PLAN.md`: Pass 2 — inline Phase 3 quality gate (single Qwen judge, abbreviated 4-component rubric)
- Wave 2 (parallel):
  - `03-04-PLAN.md`: Pass 3 — det extraction phase (parameters from RawIR)
  - `03-05-PLAN.md`: Pass 3 — LLM enrichment phase (Qwen, concurrency 20), 5-component param descriptions
  - `03-06-PLAN.md`: Pass 3 — filter design (3 approaches: structured object / DSL / individual)
  - `03-07-PLAN.md`: Pass 3 — naming normalization rules + standard parameter sets для universal tools
- Wave 3 (parallel, after 02 + 04+05+06+07):
  - `03-08-PLAN.md`: Pass 3 — cross-parameter validation + inline Qwen quality gate
  - `03-09-PLAN.md`: Pass 4 — deterministic rules phase (tool-type rules + verb pattern matching, Appendix B), реф `mcpgen-pass-4-design.md`
  - `03-10-PLAN.md`: Pass 4 — selective Qwen judgment (edge cases only) + consistency validation
- Wave 4:
  - `03-11-PLAN.md`: E2E test passes 0 → 1 → 2 → 3 → 4 на Stripe + GitHub + Notion

---

### 4.4 Phase 4 — Generation Engine: Shape & Codegen (ENGINE terminal)

**Goal:** Pass 5 (Response Shaping) + Stage E (Codegen) генерируют complete TypeScript Cloudflare Worker project (~25–30 files), который компилируется через `tsc --noEmit`.

**Workstream:** `engine`.

**Pre-req:** Phase 3 done.

**GSD commands:**

```bash
/gsd-discuss-phase 4 --ws engine
/gsd-plan-phase 4 --ws engine
/gsd-execute-phase 4 --ws engine
/gsd-verify-work 4 --ws engine
```

**Plans within Phase 4:**

- Wave 1 (parallel):
  - `04-01-PLAN.md`: Pass 5 — det pagination detection (cursor / offset / page-number), реф `mcpgen-pass-5-design.md`
  - `04-02-PLAN.md`: Pass 5 — det outputSchema extraction (MCP 2025-06-18)
- Wave 2 (parallel):
  - `04-03-PLAN.md`: Pass 5 — Qwen field ranking (concurrency 10) + field filtering config
  - `04-04-PLAN.md`: Pass 5 — truncation guidance templates (Appendix A) + thresholds per tool type
  - `04-05-PLAN.md`: Pass 5 — `response_format` enum logic (только для tools > 20 fields)
- Wave 3 (parallel):
  - `04-06-PLAN.md`: Stage E scaffold templates (package.json, wrangler.toml, tsconfig), реф `mcpgen-stage-e-design.md`
  - `04-07-PLAN.md`: Stage E — schemas templates (Zod inputs/outputs/routing)
  - `04-08-PLAN.md`: Stage E — runtime modules (smart_id, pagination, truncation, upstream, response_shaping, errors)
  - `04-09-PLAN.md`: Stage E — auth middleware templates (3 modes: passthrough/stored/OAuth)
- Wave 4:
  - `04-10-PLAN.md`: Stage E — per-tool-type tool handler templates (universal/action/workflow/specialized)
  - `04-11-PLAN.md`: Stage E — `tsc --noEmit` validation phase
- Wave 5:
  - `04-12-PLAN.md`: E2E: spec → IR → 6 passes → generated TS project compiles
  - `04-13-PLAN.md`: Generated MCP server вручную тестируется через `npx @modelcontextprotocol/inspector`

---

### 4.5 Phase 5 — Generation Engine: Validation (ENGINE terminal)

**Goal:** Stage F три tier'а работают: F1 static + F2 smell scan (single-judge с shuffling) + F3 agent eval. Quality badges присваиваются.

**Workstream:** `engine`.

**Pre-req:** Phase 4 done.

**GSD commands:**

```bash
/gsd-discuss-phase 5 --ws engine
/gsd-plan-phase 5 --ws engine
/gsd-execute-phase 5 --ws engine
/gsd-verify-work 5 --ws engine
```

**Plans within Phase 5:**

- Wave 1 (parallel):
  - `05-01-PLAN.md`: F1 static — все детерминированные checks (tsc, ajv, ESLint, gitleaks, MCP compliance, smart ID regex, routing completeness, auth presence), реф `mcpgen-stage-f-design.md`
  - `05-02-PLAN.md`: F1 — failure → upstream pass mapping (Appendix A)
- Wave 2 (parallel):
  - `05-03-PLAN.md`: F2 smell scan — single Qwen judge с 5-shuffle prompt averaging + temperature variance (0.0/0.2/0.5), реф `mcpgen-model-and-provider-override.md` §4
  - `05-04-PLAN.md`: F2 — 6-component rubric scoring (Purpose/Guidelines/Limitations/Parameters/Length/Examples)
  - `05-05-PLAN.md`: F2 — per-component failure → targeted retry mapping
- Wave 3 (parallel):
  - `05-06-PLAN.md`: F3 agent eval harness — Sonnet 4.7 в loop'е (max 10 turns, см. trade-off в §4 model-override)
  - `05-07-PLAN.md`: F3 — two-tier evaluator (rule-based + LLM judge per MCP-Bench)
  - `05-08-PLAN.md`: F3 — hybrid environment (real sandbox для top 10 APIs, mocked для rest)
  - `05-09-PLAN.md`: F3 — golden tasks для Stripe / GitHub / Notion / Linear / Slack
- Wave 4:
  - `05-10-PLAN.md`: Targeted retry orchestration (max 2 rounds, cached prior-pass outputs)
  - `05-11-PLAN.md`: Quality scoring + badges (premium / verified / standard / needs_review)
- Wave 5:
  - `05-12-PLAN.md`: E2E полный pipeline — spec → 6 passes → Stage E → F1 → F2 → F3 → quality badge

**Critical note:** F3 test agent — единственное место где можно использовать Sonnet 4.7 (real Claude симулирует real users; см. trade-off в `mcpgen-model-and-provider-override.md` §7.1).

**Merge:** Squash-merge `feature/engine-passes` → `main`. Затем cleanup worktree.

---

### 4.6 Phase 6 — Runtime Plane (RUNTIME terminal)

**Goal:** Dispatch Worker маршрутизирует tenant requests; tenant Workers (генерируемые) работают с Six-Tool Pattern и smart IDs.

**Workstream:** `runtime`.

**Pre-req:** Phase 1 merged. **Можно стартовать параллельно с Phase 2** — engine + runtime independent.

**Setup:**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-runtime -b feature/runtime-cf-workers main
cd ../mcpgen-runtime
export GSD_WORKSTREAM=runtime
claude
```

**GSD commands:**

```bash
/gsd-discuss-phase 6 --ws runtime
/gsd-plan-phase 6 --ws runtime
/gsd-execute-phase 6 --ws runtime
/gsd-verify-work 6 --ws runtime
```

**Plans within Phase 6:**

- Wave 1 (parallel):
  - `06-01-PLAN.md`: Dispatch Worker — auth precheck + rate limit + tenant lookup + dispatch (CF Workers for Platforms namespace API)
  - `06-02-PLAN.md`: Tenant Worker SDK API (`packages/runtime-sdk`) — interface contract for generated Workers
- Wave 2 (parallel):
  - `06-03-PLAN.md`: Pass-through credentials (default) — `X-Upstream-Auth` headers, нет хранения
  - `06-04-PLAN.md`: Stored credentials (alt) — AES-256-GCM с per-tenant DEK в CF KV
  - `06-05-PLAN.md`: OAuth 2.1 mode через `@cloudflare/workers-oauth-provider`
- Wave 3 (parallel):
  - `06-06-PLAN.md`: Usage event emitter в tenant Worker SDK
  - `06-07-PLAN.md`: CF Queue → Inngest pipeline → TimescaleDB hypertable
  - `06-08-PLAN.md`: P99 latency budget enforcement (< 50ms над upstream)
- Wave 4:
  - `06-09-PLAN.md`: Manual deploy test — взять generated tenant Worker (от Phase 4 dummy) → deploy через wrangler → curl

**Merge:** PR `feature/runtime-cf-workers` → squash-merge after Phase 5 (engine) merged, **до** Phase 9.

---

### 4.7 Phase 7 — Frontend Wire-Up (FRONTEND terminal)

> ⚠ **UI ЗАЛОЧЕН.** Готовый дизайн в `claude-design-ui/MCP-Gen.zip`. **Запрещено** менять визуал, layout, цвета, шрифты, копирайтинг.
> Цель Phase 7 = только wire-up (state management, API calls, SSE streaming, form submission, error display).

**Goal:** Все экраны из готового MCP-Gen дизайна работают с реальным backend (BFF API).

**Workstream:** `frontend`.

**Pre-req:** Phase 1 (контракты). **Можно стартовать параллельно с Phase 2** для landing page; для generation/preview/dashboard — после Phase 5 (нужен реальный engine для смок-теста).

**Setup:**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-frontend -b feature/frontend-integration main
cd ../mcpgen-frontend

# Распаковать готовый дизайн ВНУТРИ worktree
unzip claude-design-ui/MCP-Gen.zip -d apps/web/src/

export GSD_WORKSTREAM=frontend
claude
```

**GSD commands:**

```bash
/gsd-discuss-phase 7 --ws frontend
/gsd-plan-phase 7 --ws frontend
/gsd-execute-phase 7 --ws frontend
/gsd-verify-work 7 --ws frontend
```

**Plans within Phase 7:**

- Wave 1 (parallel — landing pages, не требуют engine):
  - `07-01-PLAN.md`: Landing screens из MCP-Gen.zip — wire copy from `mcpgen-ux-flow.md`, NO design changes
  - `07-02-PLAN.md`: Pricing page — wire Stripe pricing data
  - `07-03-PLAN.md`: Auth flow (Logto) integration — login/signup screens из дизайна
- Wave 2 (parallel — после контрактов):
  - `07-04-PLAN.md`: Generation flow screen — POST /api/v1/generate + SSE consumption
  - `07-05-PLAN.md`: Preview screen — render generated tools list, IR JSON viewer
  - `07-06-PLAN.md`: Quality report screen — render F1/F2/F3 results, badges
- Wave 3 (parallel — после Phase 6):
  - `07-07-PLAN.md`: Deploy flow screen — call deploy API → show URL
  - `07-08-PLAN.md`: Dashboard — projects list, deployments, usage charts (TimescaleDB read)
  - `07-09-PLAN.md`: One-click Claude Desktop config download
- Wave 4:
  - `07-10-PLAN.md`: E2E — поднять локально все services + walk через все user flows

**ENFORCEMENT:** в каждый PLAN.md добавить acceptance criterion: `git diff apps/web/src/styles/ apps/web/src/components/ui/ shows ZERO changes` (визуал залочен).

**Merge:** PR `feature/frontend-integration` → после Engine + Runtime merged.

---

### 4.8 Phase 8 — Auth + Billing (OPS terminal)

**Goal:** Logto работает (email + GitHub login), Stripe Meters fire, free/Pro quotas enforced.

**Workstream:** `ops`.

**Pre-req:** Phase 1. Параллельно с Phase 2–7.

**Setup:**

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-ops -b feature/auth-billing main
cd ../mcpgen-ops
export GSD_WORKSTREAM=ops
claude
```

**GSD commands:**

```bash
/gsd-discuss-phase 8 --ws ops
/gsd-plan-phase 8 --ws ops
/gsd-execute-phase 8 --ws ops
/gsd-verify-work 8 --ws ops
```

**Plans within Phase 8:**

- Wave 1 (parallel):
  - `08-01-PLAN.md`: Logto setup — email + GitHub OAuth, JWT verification middleware в Hono
  - `08-02-PLAN.md`: Organization model + membership — multi-user prep (single-user MVP но schema готова)
- Wave 2 (parallel):
  - `08-03-PLAN.md`: Stripe products + prices (free / Pro / PAYG)
  - `08-04-PLAN.md`: Stripe Meters API integration (per tool-call, per generation, per F3 eval)
  - `08-05-PLAN.md`: Webhook handler (subscription_created, invoice_paid, etc.) → DB sync
- Wave 3 (parallel):
  - `08-06-PLAN.md`: Quota enforcement в Dispatch Worker (free → block at limit, Pro → bill overage)
  - `08-07-PLAN.md`: Generation cost cap enforcement ($0.50 free / $2.00 Pro per generation)
- Wave 4:
  - `08-08-PLAN.md`: E2E — test user signup → upgrade → generate → see usage + invoice

**Merge:** PR `feature/auth-billing` → после Runtime merged (нужны usage events).

---

### 4.9 Phase 9 — Observability & Polish (MAIN terminal, integration)

**Goal:** Langfuse traces всех LLM calls, Sentry catches errors (TS + Python), BetterStack uptime monitoring, custom analytics dashboard работает.

**Workstream:** `main`.

**Pre-req:** Phases 2–8 merged.

**GSD commands:**

```bash
cd /Users/igor/Projects/mcpgen
git checkout main && git pull
claude

/gsd-discuss-phase 9
/gsd-plan-phase 9
/gsd-execute-phase 9
/gsd-verify-work 9
/gsd-ship 9
```

**Plans within Phase 9:**

- Wave 1 (parallel):
  - `09-01-PLAN.md`: Langfuse v4 OTel setup в FastAPI engine (`send_to_logfire=False`, OTLP → Langfuse Cloud)
  - `09-02-PLAN.md`: Sentry в Hono/Workers + FastAPI engine + Next.js — source maps, release tagging
  - `09-03-PLAN.md`: BetterStack — uptime checks для api / dispatch / web; on-call rotation (solo)
- Wave 2 (parallel):
  - `09-04-PLAN.md`: Customer-facing analytics dashboard (TimescaleDB → BFF read API → Next.js charts)
  - `09-05-PLAN.md`: PII filter audit — verify spec content, upstream responses, upstream credentials НЕ логируются
- Wave 3:
  - `09-06-PLAN.md`: Cross-phase integration check (use `gsd-integration-checker` agent)
  - `09-07-PLAN.md`: Manual smoke test — все 5 popular APIs (Stripe/GitHub/Notion/Linear/Slack) генерируются + deploy + work

**Merge:** PR `feature/observability-polish` → squash-merge.

---

### 4.10 Phase 10 — Launch (MAIN terminal)

**Goal:** First 100 signups. Public.

**Workstream:** `main`.

**Pre-req:** Phase 9 merged. Все launch criteria из `mcpgen-implementation-plan.md` §11.7 met.

**GSD commands:**

```bash
/gsd-discuss-phase 10
/gsd-plan-phase 10
/gsd-execute-phase 10
/gsd-verify-work 10
/gsd-ship 10
/gsd-complete-milestone 1.0.0
```

**Plans within Phase 10:**

- Wave 1 (parallel — content):
  - `10-01-PLAN.md`: Docusaurus / Mintlify setup, quickstart guide, 5 popular API tutorials
  - `10-02-PLAN.md`: Demo videos (Stripe MCP в Claude Desktop за 60 секунд)
  - `10-03-PLAN.md`: Privacy + ToS pages
- Wave 2 (parallel):
  - `10-04-PLAN.md`: GTM checklist — Show HN, Product Hunt, Reddit r/LocalLLaMA, Discord channels
  - `10-05-PLAN.md`: Landing copy финальный pass на основе принципов из `mcpgen-ux-flow.md`
- Wave 3:
  - `10-06-PLAN.md`: Soft launch — 20 invited beta users, gather feedback, fix P0 issues
- Wave 4:
  - `10-07-PLAN.md`: Public launch day — coordinated post drop

**Kill switches** (delay launch на неделю):
- F3 success rate < 70%
- F2 smell average < 4.0
- P1 security finding
- Deploy success rate < 95%
- Founder не спал 5+ дней

---

## 5. Cross-workstream coordination

### 5.1 Daily sync ritual (solo dev pattern)

Каждое утро (Terminal 1, на `main`):

```bash
cd /Users/igor/Projects/mcpgen
git fetch origin --prune

# Check workstream branches
git log --oneline --graph --all | head -30

# Check workstream STATEs
for ws in engine runtime ops frontend; do
  echo "=== $ws ==="
  cat .planning/workstreams/$ws/STATE.md 2>/dev/null | head -20
done

# Open issues / TODOs
ls .planning/todos/pending/
```

### 5.2 Contract change protocol

Если в одном workstream'е нужно поменять locked contract (IR / API / DB schema):

1. **STOP** в этом workstream
2. Вернуться в Terminal 1 (`main`)
3. Создать `chore: propose contract change — XYZ` PR в `packages/contracts` или `packages/ir`
4. Review impact на другие workstream'ы
5. Если breaking: synchronize всех workstream'ов через rebase
6. Merge contract change в `main`
7. Each workstream: `git fetch origin && git rebase origin/main`
8. Resume work

**Никаких silent breaking changes между workstream'ами.**

### 5.3 Workstream rebase rhythm

Раз в 1–2 дня в каждом workstream'е:

```bash
cd ../mcpgen-engine    # or other workstream worktree
git fetch origin
git rebase origin/main
# resolve conflicts если есть, force-push-with-lease
git push --force-with-lease
```

Это держит workstream branches up-to-date и минимизирует merge conflicts при final merge.

### 5.4 Integration gates (мандатно)

| После phase | Integration check | Кто запускает |
|---|---|---|
| Phase 1 | Все 4 services deploy empty | MAIN terminal |
| Phase 5 | Engine generates valid Stripe MCP, F1+F2 pass | ENGINE terminal |
| Phase 6 | Manual deploy generated MCP works | RUNTIME terminal |
| Phase 7 | UI screens render, NO visual regressions | FRONTEND terminal |
| Phase 8 | Test user upgrade + billing works | OPS terminal |
| Phase 9 | E2E: signup → generate → deploy → use в Claude Desktop → see usage в dashboard | MAIN |
| Phase 10 | Launch checklist (см. `mcpgen-implementation-plan.md` §11.7) | MAIN |

---

## 6. GSD configuration рекомендации

В `.planning/config.json` (созданный `/gsd-new-project`):

```json
{
  "mode": "yolo",
  "granularity": "fine",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "inherit",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "use_worktrees": true,
    "ui_phase": false,
    "ui_safety_gate": false,
    "security_enforcement": true,
    "security_asvs_level": "1",
    "security_block_on": "high",
    "auto_advance": false,
    "tdd_mode": false,
    "pattern_mapper": true,
    "ai_integration_phase": false
  },
  "planning": {
    "commit_docs": true
  }
}
```

**Justifications:**

- `mode: yolo` — solo dev, autonomous execution
- `granularity: fine` — 8–12 phases (мы хотим 10 фаз)
- `parallelization: true` — критично для multi-terminal workflow
- `model_profile: inherit` — single model (Qwen3-Coder) везде; GSD agents могут использовать другую модель если опционально
- `use_worktrees: true` — обязательно для parallel
- `ui_phase: false` + `ui_safety_gate: false` — UI залочен, не нужен `/gsd-ui-phase` workflow
- `auto_advance: false` — не auto-chain phases, мы хотим контроль над merge gates
- `pattern_mapper: true` — полезно для consistency
- `security_enforcement: true` — security threat model gate включён

---

## 7. Расписание (recommended ordering)

### Week 1: Foundation
- **Day 1–5:** Phase 1 в MAIN terminal. Lock contracts.

### Weeks 2–4: Parallel sprint block
- **Terminal 2 (engine):** Phase 2 → 3 → 4 → 5 (~3.5 weeks total)
- **Terminal 3 (runtime):** Phase 6 (~1 week, can start day 6)
- **Terminal 4 (ops):** Phase 8 (~1 week, can start day 6)
- **Terminal 5 (frontend):** Phase 7 — landing pages (Wave 1) от day 6, остальное после Phase 5 merged

### Week 5: Merge & Integration
- Sequential merges: Engine → Runtime → Ops → Frontend
- Phase 9 (Observability) в MAIN terminal

### Week 6: Launch
- Phase 10 — soft launch (20 invited)
- Public launch end of week

**Total: 6 weeks** (vs 9 weeks из старого sequential plan).

---

## 8. Anti-patterns (НЕ делать)

1. **Запустить 4 workstream'а без `--ws` флага** → конкуренция за `.planning/STATE.md`, потеря работы
2. **Merge'ить engine pass-by-pass в main** → frontend и runtime запутаются на полу-готовых passes
3. **Менять UI в frontend workstream** → залочено, нарушение rule
4. **Скипать integration gates** → silent regressions попадут в production
5. **Long-lived workstream branches > 2 недель без rebase** → merge hell
6. **Запускать Phase 9/10 пока workstream'ы не merged** → integration сломается
7. **Использовать LiteLLM** → удалено, single OpenRouter provider (см. `mcpgen-model-and-provider-override.md`)
8. **Force-push в main** → запрещено git rules (см. `mcpgen-git-workflow-rules.md` §9)
9. **Skip pre-commit hooks через `--no-verify`** → запрещено
10. **Создавать `feature/wip-*` или `claude/*` branches** → запрещено git rules §1.2

---

## 9. Quick reference

### Start a new workstream

```bash
cd /Users/igor/Projects/mcpgen
git worktree add ../mcpgen-<name> -b feature/<name> main
cd ../mcpgen-<name>
export GSD_WORKSTREAM=<name>
claude
# /gsd-plan-phase N --ws <name>
```

### Resume work in workstream

```bash
cd ../mcpgen-<name>
export GSD_WORKSTREAM=<name>
claude
# /gsd-resume-work --ws <name>
# OR
# /gsd-progress --ws <name>
```

### Sync workstream with main

```bash
cd ../mcpgen-<name>
git fetch origin
git rebase origin/main
git push --force-with-lease
```

### Merge workstream

```bash
cd ../mcpgen-<name>
gh pr create --title "feat(<scope>): <summary>" --body "..."
# After CI green and self-review
gh pr merge --squash
cd /Users/igor/Projects/mcpgen
git worktree remove ../mcpgen-<name>
git branch -d feature/<name>
```

### Status across all workstreams

```bash
cd /Users/igor/Projects/mcpgen
git worktree list
git log --graph --oneline --all -20
for ws in engine runtime ops frontend; do
  test -d .planning/workstreams/$ws && \
    echo "=== $ws ===" && \
    cat .planning/workstreams/$ws/STATE.md | head -10
done
```

---

## 10. References

| Doc | What |
|---|---|
| [`mcpgen-implementation-plan.md`](mcpgen-implementation-plan.md) | High-level 9-week plan, tracks A–E (this sprint plan refines it) |
| [`mcpgen-git-workflow-rules.md`](mcpgen-git-workflow-rules.md) | Git rules — branching, commits, PRs, hooks |
| [`mcpgen-model-and-provider-override.md`](mcpgen-model-and-provider-override.md) | LLM model decision — single OpenRouter Qwen3-Coder |
| [`mcpgen-architecture.md`](mcpgen-architecture.md) | System architecture |
| [`mcpgen-generation-engine-v2.md`](mcpgen-generation-engine-v2.md) | Engine pipeline, IR, passes overview |
| `mcpgen-pass-{0..5}-design.md` | Detail designs per pass |
| `mcpgen-stage-{e,f}-design.md` | Detail designs Stage E (codegen) + F (validation) |
| [`mcpgen-ux-flow.md`](mcpgen-ux-flow.md) | UX/UI principles (UI itself locked в claude-design-ui/) |
| `~/.claude/get-shit-done/workflows/` | GSD framework workflows source |

---

*Этот файл — закон для execution sequencing. Изменения только через `chore(sprint-plan):` PR с обоснованием.*
