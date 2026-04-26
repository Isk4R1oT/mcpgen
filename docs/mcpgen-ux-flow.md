# MCPGen — детальный UX/UI

> Рабочее название: **MCPGen** (можно потом: Forge, ToolStudio, Conduit, Bridge — но сейчас имя не приоритет).
> Тэглайн: **«From any API to production-ready MCP in 60 seconds — token-optimized by default.»**

---

## 0. Позиционирование одной фразой

Vercel-experience для MCP-серверов: open-source CLI + managed cloud, где «out of the box» сервер уже **на 50–70% дешевле в токенах**, чем naive 1:1 конверсия. Главное обещание — не «мы сгенерируем», а **«мы сгенерируем правильно»**.

---

## 1. Пять принципов UX

1. **60-second hero flow.** От пасты URL до рабочего MCP-сервера в Claude Desktop — меньше минуты. Без регистрации.
2. **CLI-first, web-augmented.** Девелоперы любят CLI. Web — для визуализации, биллинга, шаринга команды. Никогда не заставлять идти в web ради того, что можно в терминале.
3. **Show, don't tell.** Каждый шаг сопровождается метрикой: «сэкономили X токенов», «снизили cost на $Y/M tool-calls». Это оправдывает цену.
4. **Progressive complexity.** Новичок жмёт «Generate» и получает работающее. Pro может настраивать каждую из 6 оптимизационных проходов.
5. **Trust through transparency.** Весь сгенерированный код виден на каждом шаге. Никакого black-box. Можно скачать и забыть про нас.

---

## 2. Три персоны (ICP)

| Персона | Кто это | Что хочет | Где живёт |
|---|---|---|---|
| **A. The Wrapper** | Solo dev, обернул чужой API для своего Claude Code workflow | Быстро, бесплатно, локально | r/ClaudeAI, X, HN |
| **B. The API Provider** | Стартап, у которого есть REST API, хочет предложить MCP клиентам | Hosted, белый лейбл, надёжно | LinkedIn, B2B сейлз |
| **C. The Internal Tools Eng** | AI engineer в стартапе оборачивает внутренние сервисы | Self-hosted, с auth, мониторинг | Discord, Slack-комьюнити |

Все три обслуживаются одним продуктом, но входные точки разные: A приходит через CLI и open-source, B через лендинг, C через docs/integrations.

---

## 3. Главный flow: от первого визита до работающего MCP в Claude (90 секунд)

### Экран 1 — Лендинг (`mcpgen.dev`)

```
┌────────────────────────────────────────────────────────────────┐
│  MCPGen                          Docs   Pricing   GitHub  Login│
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   From any API to production MCP                                │
│   in 60 seconds.                                                │
│                                                                 │
│   Token-optimized by default. 50–70% cheaper than naive         │
│   1:1 conversion. Open source CLI + managed cloud.              │
│                                                                 │
│   ┌──────────────────────────────────────────────┐  ┌────────┐ │
│   │ https://api.stripe.com/openapi.json          │  │Generate│ │
│   └──────────────────────────────────────────────┘  └────────┘ │
│   or drop a file · paste Postman · paste GraphQL SDL            │
│                                                                 │
│   Try with:  [Stripe]  [GitHub]  [Notion]  [Linear]  [Slack]   │
│                                                                 │
│   ─── or in your terminal: ───                                  │
│   $ npx mcpgen init                                             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

[Below the fold: 3-step animation showing flow, social proof,
 token savings comparison chart, integrations]
```

**Что важно:**
- Поле ввода — самый яркий элемент. Никаких форм, никакой регистрации до первого результата.
- Пресеты популярных API дают мгновенное «wow» без своего spec'а.
- CLI-команда видна сразу — это сигнал «мы для своих».

### Экран 2 — Live preview (после вставки URL, до клика Generate)

URL вставлен → парсинг начинается мгновенно (стриминг):

```
┌────────────────────────────────────────────────────────────────┐
│  Parsing https://api.stripe.com/openapi.json...                 │
│                                                                 │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐ │
│  │ DETECTED                │  │ TOKEN COST ESTIMATE          │ │
│  │                         │  │                              │ │
│  │ ✓ OpenAPI 3.1           │  │ Naive 1:1 conversion:        │ │
│  │ ✓ 348 endpoints         │  │   ~14,200 tokens (all tools) │ │
│  │ ✓ 12 categories         │  │                              │ │
│  │ ✓ OAuth + API key auth  │  │ With MCPGen optimization:    │ │
│  │                         │  │   ~3,400 tokens  ↓ 76%       │ │
│  │ Categories:             │  │                              │ │
│  │ ☑ Charges (24)          │  │ Estimated savings per agent  │ │
│  │ ☑ Customers (18)        │  │ session: $0.18 (Claude Opus) │ │
│  │ ☑ Subscriptions (15)    │  │                              │ │
│  │ ☐ Reporting (8)         │  │ Want to know how? →          │ │
│  │ ☐ Issuing (32) ⚠ rare   │  │                              │ │
│  │ ... [show all]          │  │                              │ │
│  └─────────────────────────┘  └──────────────────────────────┘ │
│                                                                 │
│  AI Suggestion 💡                                               │
│  "We detected 12 endpoints related to 'orders'. They share      │
│  similar params and are usually called sequentially.            │
│  Combine into 3 composite tools? This saves another ~600 tk."   │
│  [Yes, combine]  [No, keep separate]  [Customize]               │
│                                                                 │
│  [ Generate MCP Server ]                                        │
└────────────────────────────────────────────────────────────────┘
```

**Ключевая UX-механика:** пользователь ещё ничего не сгенерировал, но уже видит **деньги**, которые он сэкономит. Это переводит разговор с «зачем мне это» на «как быстрее получить».

### Экран 3 — Сгенерированный сервер (после Generate)

Три вкладки + правая панель действий:

```
┌────────────────────────────────────────────────────────────────┐
│ ◉ stripe-mcp                                          ⏱ 4.2s   │
│ ────────────────────────────────────────────────────────────── │
│ [ Tools (47) ] [ Code ] [ Optimization Report ]    │ ACTIONS   │
│                                                    │           │
│ ▼ create_charge                              📊 47t│ ▶ Try in  │
│   "Charge a customer's card. Returns charge..."    │  Playground│
│   params: amount, currency, customer_id            │           │
│   [Edit description] [Test]                        │ ⬇ Download│
│                                                    │  as ZIP   │
│ ▼ list_charges                               📊 38t│           │
│   "List recent charges with optional filters..."   │ ☁ Deploy  │
│   [Edit] [Test]                                    │  to Cloud │
│                                                    │  (free)   │
│ ▼ refund_charge                              📊 32t│           │
│   ...                                              │ 📋 Copy   │
│                                                    │  CLI cmd  │
│ ▼ customer_lifecycle (composite, 3 endpoints) 🔥   │           │
│   "Create customer + first charge + subscribe..." │ 🔗 Share   │
│   [Why composite?] [Edit] [Test]                  │  link      │
│                                                    │           │
│  Sort: [Most-used] [By-category] [A→Z]            │           │
└────────────────────────────────────────────────────────────────┘
```

**Микро-детали:**
- 📊 рядом с каждым tool — точное число токенов, которое он съедает у агента.
- 🔥 на composite tools — визуальный сигнал «здесь экономия».
- Кнопки `[Test]` рядом с каждым tool — мгновенно открывают inline playground для одного tool.
- Главные действия справа приоритезированы: **Try in Playground** на первом месте (доверие), Deploy — позже (commitment).

### Экран 4 — Playground (главный экран доверия)

Это **самый важный экран** во всём продукте. До него пользователь не верит, что оно работает.

```
┌────────────────────────────────────────────────────────────────┐
│  Playground: stripe-mcp                                         │
│ ────────────────────────────────────────────────────────────── │
│                                                    │           │
│ Suggested prompts:                                 │ TRACE     │
│  • "Get my last 5 charges"                         │           │
│  • "Refund charge ch_xyz"                          │ Tools     │
│  • "Find customer by email"                        │ called: 2 │
│                                                    │           │
│ ┌─ User ──────────────────────────────────────┐    │ 1. list_  │
│ │ Get my last 5 charges and total amount      │    │ charges   │
│ └─────────────────────────────────────────────┘    │ (38 tk in │
│                                                    │ +180 out) │
│ ┌─ Agent ─────────────────────────────────────┐    │           │
│ │ I'll fetch your last 5 charges.             │    │ 2. (no    │
│ │                                             │    │ second    │
│ │ [calling list_charges with limit=5...]      │    │ call —    │
│ │                                             │    │ math done │
│ │ Last 5 charges:                             │    │ in head)  │
│ │ • $42.00 — 2026-04-23                       │    │           │
│ │ • $18.50 — 2026-04-22                       │    │ ────────  │
│ │ ...                                         │    │ Comparison│
│ │ Total: $189.50                              │    │           │
│ └─────────────────────────────────────────────┘    │ Your      │
│                                                    │ optimized:│
│ ┌─────────────────────────────────────────────┐    │ 1,240 tk  │
│ │ Type message...                         [↑] │    │ $0.018    │
│ └─────────────────────────────────────────────┘    │           │
│                                                    │ Naive 1:1:│
│ Agent: Claude Sonnet 4.7 (yours)  ▼                │ 4,820 tk  │
│ Or: GPT-5, Gemini 2.5, your own API key            │ $0.072    │
│                                                    │           │
│                                                    │ Saved 75% │
│                                                    │ 🎉        │
└────────────────────────────────────────────────────────────────┘
```

**Что здесь критически важно:**
- Trace справа в реальном времени — пользователь видит, какие tools вызвал агент и сколько токенов. Это **прозрачность**, которой нет у конкурентов.
- Side-by-side с naive-версией — каждый раз он видит экономию.
- Можно подключить свой LLM API key (опция) — это убирает барьер «вы тратите мои деньги на демо».

### Экран 5 — Deploy

Когда пользователь убедился — кнопка Deploy:

```
┌────────────────────────────────────────────────────────────────┐
│  Deploy stripe-mcp                                              │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  Deployment target:                                             │
│   ◉ MCPGen Cloud (free tier: 100K tool-calls/mo)                │
│   ○ Cloudflare Workers (your account)                           │
│   ○ Self-host (download Docker image)                           │
│                                                                 │
│  Server URL:                                                    │
│   https://stripe-mcp-abc123.mcpgen.app/mcp                      │
│   [✏ Customize]                                                 │
│                                                                 │
│  Authentication:                                                │
│   ○ None (public — not recommended)                             │
│   ◉ API key (auto-generated, you copy)                          │
│   ○ OAuth 2.1 (for end-user agents)                             │
│   ○ Pass-through (user provides Stripe key per request)         │
│                                                                 │
│  Forward credentials to upstream API:                           │
│   How does your MCP server get a Stripe key?                    │
│   ◉ Per-user (each agent passes its own — RECOMMENDED)          │
│   ○ Static (you store one key, all agents use it)               │
│                                                                 │
│  [ Deploy ]    or [ Save as draft ]                             │
└────────────────────────────────────────────────────────────────┘
```

После клика Deploy — 5 секунд, потом:

```
┌────────────────────────────────────────────────────────────────┐
│  ✓ Deployed!                                                    │
│                                                                 │
│  Your MCP server is live at:                                    │
│   https://stripe-mcp-abc123.mcpgen.app/mcp                      │
│                                                                 │
│  ─── Connect to Claude Desktop ───                              │
│                                                                 │
│  Click to add to your Claude config:                            │
│   [ 🔗 One-click install in Claude Desktop ]                    │
│                                                                 │
│  Or copy manually:                                              │
│   ┌──────────────────────────────────────────────┐ [📋]         │
│   │ {                                            │              │
│   │   "mcpServers": {                            │              │
│   │     "stripe-mcp": {                          │              │
│   │       "url": "https://stripe-mcp-...",       │              │
│   │       "headers": { "Authorization": "..." }  │              │
│   │     }                                        │              │
│   │   }                                          │              │
│   │ }                                            │              │
│   └──────────────────────────────────────────────┘              │
│                                                                 │
│  ─── Other clients ───                                          │
│  [Cursor]  [Cline]  [Continue]  [LangGraph]  [Goose]            │
│                                                                 │
│  📱 Or scan QR for Claude.ai mobile                             │
│  [QR code]                                                      │
└────────────────────────────────────────────────────────────────┘
```

**One-click install в Claude Desktop** — это deeplink (Anthropic поддерживает `claude://` schemas) или скачиваемый `.mcpb` package. Это то место, где у конкурентов трение, а у нас — кнопка.

### Экран 6 — Dashboard (после деплоя)

```
┌────────────────────────────────────────────────────────────────┐
│  stripe-mcp · Live · since 2 min ago                            │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐│
│  │ Tool calls  │ │ Tokens saved│ │ P95 latency │ │ Errors     ││
│  │   12,840    │ │  4.2M tk    │ │   240ms     │ │   0.3%     ││
│  │ this month  │ │  ≈ $63 🎉   │ │             │ │            ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘│
│                                                                 │
│  Usage this month: ████████░░░░░░░░  82K / 100K (free tier)     │
│  Upgrade for unlimited → [Pro $19/mo]                           │
│                                                                 │
│  ─── Tool breakdown ───                                         │
│  list_charges       ████████████  6,200 calls  · 38 tk avg      │
│  create_charge      ████          2,100 calls  · 47 tk avg      │
│  customer_lifecycle ██            1,800 calls  · 92 tk avg 🔥   │
│  ...                                                            │
│                                                                 │
│  ─── API sync status ───                                        │
│  ⚠ Stripe API spec changed 2 days ago.                          │
│    3 new endpoints, 1 removed.                                  │
│    [Review changes]  [Auto-regenerate]                          │
│                                                                 │
│  ─── Connected agents (anonymized) ───                          │
│  • Claude Desktop (8 sessions)                                  │
│  • Cursor (3 sessions)                                          │
│  • Custom (LangGraph)                                           │
└────────────────────────────────────────────────────────────────┘
```

**Что важно в дашборде:**
- Метрика **«сэкономили $63»** — главная. Это то, что пользователь видит первым каждый раз, когда возвращается. Привычка ассоциировать продукт с деньгами в кармане.
- Алерт о изменении spec'а — это **retention loop**. API меняются → мы напоминаем → пользователь возвращается → бесплатно делает ре-генерацию (или платит за auto-sync).

---

## 4. Optimization flow (углублённый сценарий)

Когда пользователь жмёт «Optimization Report» или «Customize», открывается мастер из 6 проходов:

### Шаг 1 из 6 — Description compression
```
┌────────────────────────────────────────────────────────────────┐
│  Optimization 1/6:  Description compression                     │
│  We rewrite verbose OpenAPI descriptions for LLM agents.        │
│                                                                 │
│  Example: create_charge                                         │
│                                                                 │
│  BEFORE (from OpenAPI):                          [142 tokens]   │
│  "To charge a credit or debit card, you create a Charge         │
│   object. If your API key is in test mode, the supplied         │
│   payment source (e.g., card) won't actually be charged,        │
│   although everything else will occur as if in live mode..."    │
│                                                                 │
│  AFTER (LLM-optimized):                          [38 tokens]    │
│  "Charges a customer card. Returns Charge object. Required:     │
│   amount, currency, customer_id."                               │
│                                                                 │
│  Total savings across 348 endpoints: ~6,800 tokens (82%)        │
│                                                                 │
│  [Apply to all]  [Review each]  [Skip this pass]                │
└────────────────────────────────────────────────────────────────┘
```

### Шаги 2–6 (быстро):
- **Endpoint clustering** — combining related endpoints into composite tools
- **Parameter pruning** — remove deprecated/unused params (audit shows usage in real-world API logs)
- **Response shaping** — auto-suggest JQ filters for huge responses
- **Pagination strategy** — auto-paginate vs let agent decide
- **Auth strategy** — session vs per-call

Каждый шаг показывает before/after в токенах. В конце — финальный отчёт:

```
┌────────────────────────────────────────────────────────────────┐
│  Optimization complete                                          │
│                                                                 │
│  Original (naive):     14,200 tokens                            │
│  After all passes:      3,400 tokens   ↓ 76%                    │
│                                                                 │
│  Per-session savings (Claude Opus): ~$0.18                      │
│  Per 1M sessions: ~$180,000                                     │
│                                                                 │
│  [Apply all]  [Customize]  [Export report PDF]                  │
└────────────────────────────────────────────────────────────────┘
```

PDF-отчёт — это **sales artifact**: пользователь B (API Provider) показывает его своему руководству, чтобы оправдать покупку.

---

## 5. CLI experience (parallel flow для девелоперов)

```bash
$ npx mcpgen init

? OpenAPI spec URL or file: https://api.stripe.com/openapi.json
✓ Fetched spec (348 endpoints, 12 categories)

? Which categories? (space to select)
 ◉ Charges  ◉ Customers  ◉ Subscriptions  ○ Reporting  ○ Issuing

✓ AI optimization (6 passes)... done
  ↓ 76% tokens vs naive (14,200 → 3,400)

? Compress descriptions? Yes
? Combine related endpoints? Yes (12 candidates merged into 3)
? Output language? TypeScript / Python / Rust
  > TypeScript

✓ Generated ./stripe-mcp/
  ├── package.json
  ├── src/server.ts
  ├── src/tools/
  ├── README.md
  └── .mcpgen.yaml      # config for re-runs

? Deploy?
  ◉ MCPGen Cloud (free tier)
  ○ Cloudflare Workers
  ○ Skip (run locally)

✓ Deployed: https://stripe-mcp-abc123.mcpgen.app/mcp
✓ Added to ~/.config/claude/claude_desktop_config.json
✓ Added to ~/.cursor/mcp.json

→ Open Claude Desktop and try: "list my recent Stripe charges"
→ Dashboard: https://mcpgen.dev/d/stripe-mcp
```

**Принципы CLI:**
- Идемпотентен (можно запускать снова, не сломает)
- `.mcpgen.yaml` версионируется в git, как `package.json`
- `mcpgen sync` — пересобрать, если spec изменился
- `mcpgen optimize` — снова прогнать оптимизатор (платная фича после free quota)
- `mcpgen deploy` — отдельная команда без re-generate
- Полностью работает offline для генерации; cloud — опционально

---

## 6. Iteration flow (когда API меняется — главный retention loop)

День 30 после деплоя. Stripe выпустил новую версию API.

**Шаг 1 — нотификация**

Email или Slack-нотификация (если подключена интеграция):
```
Subject: stripe-mcp · API spec changed

3 new endpoints, 1 removed, 4 modified.
Re-generation recommended.

[Review changes] [Auto-regenerate] [Snooze 7 days]
```

**Шаг 2 — diff viewer**

```
┌────────────────────────────────────────────────────────────────┐
│  Spec changes for stripe-mcp                                    │
│ ────────────────────────────────────────────────────────────── │
│                                                                 │
│  + NEW (3)                                                      │
│   + POST /v1/payment_links/{id}/sessions                        │
│   + GET  /v1/customer_sessions                                  │
│   + POST /v1/treasury/...                                       │
│                                                                 │
│  ─ REMOVED (1)                                                  │
│   - DELETE /v1/legacy/charge   (deprecated 2024)                │
│                                                                 │
│  ~ MODIFIED (4)                                                 │
│   ~ POST /v1/charges                                            │
│     + new param: idempotency_key (now required)                 │
│     ~ response field 'metadata' type changed                    │
│                                                                 │
│  Impact on your tools:                                          │
│  • create_charge → needs update (signature changed)             │
│  • Add 3 new tools? [Y/N per tool]                              │
│                                                                 │
│  [ Regenerate ]  [ Test against playground prompts first ]      │
└────────────────────────────────────────────────────────────────┘
```

**Шаг 3 — regression testing (optional, paid)**

Перед деплоем новой версии — прогнать сохранённые playground-промпты:
```
Running regression tests...
✓ "Get last 5 charges"           → passes
✓ "Refund charge"                → passes
⚠ "Create customer + charge"     → tool signature changed
                                   agent may need to retry once
✗ "Legacy bulk charge"           → fails (endpoint removed)

[Deploy anyway]  [Deploy as v2 (A/B 50/50)]  [Cancel]
```

**Шаг 4 — A/B deployment (paid)**

Можно задеплоить v2 на 50% трафика, мониторить, потом promote или откатить.

---

## 7. Pricing UX

Цены показаны на странице `/pricing` максимально честно:

```
┌────────────────────────────────────────────────────────────────┐
│                                                                 │
│        FREE          │      PRO $19/mo     │   TEAM $99/mo      │
│   ─────────────────  │  ─────────────────  │ ─────────────────  │
│   1 server           │  10 servers         │  Unlimited         │
│   100K tool-calls/mo │  1M included        │  10M included      │
│   Public deploy      │  Custom domain      │  SSO + audit       │
│   Open source CLI    │  Auto-sync API      │  A/B deploys       │
│   Community support  │  Email support      │  Priority + SLA    │
│                      │                     │                    │
│   After quota:       │  After quota:       │  After quota:      │
│   Block              │  $0.0001/call       │  $0.00005/call     │
│                                                                 │
│   [Start free]       │  [Try Pro]          │  [Talk to sales]   │
└────────────────────────────────────────────────────────────────┘

  ─── Optimization runs (across all tiers) ───
  $0.10 per re-optimization (LLM cost-pass-through + margin)
  First 5/mo free on Pro+
```

В дашборде живой метр: «Used 320K of 1M tool-calls (32%)». Прогноз: «At current rate, you'll hit limit on May 14».

**Pricing transparency**: на каждом шаге показываем «эта операция стоит $X». Никаких сюрпризов в счёте.

---

## 8. Open-source стратегия как distribution

GitHub репозиторий `mcpgen/cli` — публичный, MIT-лицензия. В нём:
- Полный generator (без cloud-фич)
- Шаблоны для FastAPI, Hono, Express, Rails
- 10 готовых пресетов популярных API
- `npx mcpgen init` работает локально, без аккаунта

Что **не** open-source:
- Cloud hosting infrastructure
- Multi-tenant dashboard
- Auto-sync + diff viewer
- A/B deployment
- Team features (SSO, audit logs)
- Premium optimization passes (LLM-driven, дорогие в compute)

**Воронка:** GitHub stars → CLI users → cloud signups → paid. Тот же паттерн, что Supabase, Resend, Inngest, PostHog.

---

## 9. Edge cases и места, где обычно ломается UX

| Проблема | Как решаем |
|---|---|
| **OpenAPI 5000+ endpoints** (Salesforce) | Принудительный category-picker на шаге 2; макс 50 tools на сервер |
| **GraphQL вместо REST** | Авто-детект schema.graphql, парсинг SDL, генерация по queries/mutations |
| **Postman collection** | Drag & drop `.json`, конвертация в нашу IR |
| **Private API без публичного spec** | CLI работает локально, spec не уходит в cloud (privacy mode) |
| **OAuth 2.1 со scopes** | Pre-built flows для топ-50 API (Stripe, GitHub, Notion, Slack…) |
| **Большие responses (>50KB)** | Pagination/JQ-filter подсказки в Optimization step 4 |
| **Rate limits upstream** | Built-in token bucket, exponential backoff, метрика в dashboard |
| **Pass-through credentials** | Никогда не храним user keys; agent передаёт их в headers per-request |
| **Spec не валиден** | Интерактивный fixer с AI-suggestions перед генерацией |

---

## 10. Сводный flow одной картинкой

```
                  ┌─────────────────┐
                  │   Landing page  │
                  │  (paste URL)    │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              ↓                         ↓
       ┌──────────────┐          ┌─────────────┐
       │ Live preview │          │ npx mcpgen  │
       │ (token est.) │          │    init     │
       └──────┬───────┘          └──────┬──────┘
              │                         │
              ↓                         ↓
       ┌──────────────────┐      ┌──────────────┐
       │ Generate (4s)    │      │ Local gen    │
       └──────┬───────────┘      └──────┬───────┘
              │                         │
              ↓                         │
       ┌──────────────────┐             │
       │ Tools / Code /   │             │
       │ Optimization view│             │
       └──────┬───────────┘             │
              │                         │
              ↓                         │
       ┌──────────────────┐             │
       │  Playground      │             │
       │  (trust building)│             │
       └──────┬───────────┘             │
              │                         │
              ↓                         ↓
       ┌─────────────────────────────────────┐
       │         Deploy options              │
       │  Cloud / CF Workers / Self-host     │
       └──────┬──────────────────────────────┘
              │
              ↓
       ┌──────────────────┐  ←──┐
       │  Dashboard       │     │
       │  (live metrics,  │     │ recurring
       │   API drift)     │     │ engagement
       └──────┬───────────┘     │
              │                 │
              ↓                 │
       ┌──────────────────┐     │
       │  Spec change     │ ────┘
       │  notification    │
       └──────────────────┘
```

---

## 11. Что я бы спроектировал в первую очередь (MVP scope, 8 недель)

**Неделя 1–2.** OpenAPI parser + базовая 1:1 генерация Python (FastMCP) + TypeScript (MCP SDK). Генерируется локально через CLI.

**Неделя 3–4.** LLM-pass для description compression + endpoint clustering. Это даёт главный «wow». Web preview без backend.

**Неделя 5–6.** Hosted deploy (Cloudflare Workers under the hood) + dashboard с метриками + биллинг (Stripe).

**Неделя 7.** Playground (можно базовый — chat + trace, без своего LLM-сервера, через Claude/OpenAI API key пользователя).

**Неделя 8.** Лендинг, docs, 5 готовых пресетов (Stripe, GitHub, Notion, Linear, Slack), запуск.

**Что отрезаем из MVP:**
- A/B deployment (это v2)
- Regression testing (это v2)
- GraphQL и Postman поддержка (только OpenAPI 3.x на старте)
- SSO, audit logs (Team-tier — позже)
- Кастомные оптимизационные passes за деньги (free для всех на старте, чтобы максимизировать adoption)

---

## 12. Где главные риски в этом UX (честно)

1. **Playground trust-screen решает всё.** Если он медленный или неубедительный — пользователь уйдёт. Нужно безусловно P95 < 3 секунды на ответ.
2. **«60 second hero flow» — обещание, которое легко нарушить.** Большие OpenAPI specs (Salesforce, Azure) парсятся 30+ секунд. Нужен фоновый job + email-нотификация.
3. **Deploy → Claude Desktop one-click** зависит от того, поддерживает ли Anthropic deeplinks для config-инжекции. На сегодня (апрель 2026) нужно проверить — возможно, придётся идти через `.mcpb`-package.
4. **Pricing visibility — палка о двух концах.** Если показывать «эта операция стоит $0.18» на каждом шаге, новички пугаются. Если не показывать — потом сюрприз в счёте. Решение: показывать **только сэкономленное** в hero-flow, а реальные затраты — в настройках/дашборде.
5. **API-providers (персона B) не появятся сами.** Им нужен outbound. Indie (персона A) и internal-tools (C) — самораспространяющиеся через CLI. Начать стоит с A+C, B — позже.
