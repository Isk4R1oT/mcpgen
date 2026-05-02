# MCPGen — Feature Management Contract (Flipt v2)

> **Статус:** v1.0 — DRAFT (создан 2026-05-03, до Phase 10 launch).
> **Источник истины** для ВСЕХ решений по feature management в MCPGen.
> При противоречии с любыми ad-hoc решениями (env vars, `if (env.X)`, hard-coded gates) — **этот документ выигрывает**, ad-hoc решение должно быть мигрировано.
> Контракт **не выигрывает** у `RULES.md`, `mcpgen-architecture.md`, `mcpgen-git-workflow-rules.md` — они выше по иерархии (см. CLAUDE.md §0).
> Изменения вносятся только через PR с явной пометкой `feat(flags-contract):` или `chore(flags-contract):`.

---

## 0. TL;DR (для тех кто торопится)

1. **Flipt v2** — единственный feature-flag сервис в стеке. Никаких параллельных систем (LaunchDarkly / Unleash / самописные `if (env.X)`).
2. **Git-native:** флаги — это YAML-файлы в монорепо (`packages/feature-flags/`). UI вторичен, code review через обычный PR.
3. **Один Flipt-инстанс** на dev (Docker Compose) + один на prod (Fly.io, single Go binary, ноль БД).
4. **Multi-environment через ветки/директории Git** (см. §2.3) — `default/` (dev), `staging/`, `production/`.
5. **Identity:** `entityId = user_id` (Logto) для платформы; для тенант-runtime — Flipt НЕ используется (см. §3.6).
6. **Eval mode:** client-side WASM везде (CF Workers, Vercel Edge, Next.js, CLI). Latency ≈ 100µs in-memory. Сетевой round-trip только при refresh state (ETag-cached).
7. **Каждый флаг ОБЯЗАН иметь** `name`, `description`, `category`, `created_at`, `expected_removal_at` (для `_rollout`/`_exp` категорий).
8. **Stale flag scanner:** Inngest cron еженедельно открывает GitHub issue для просроченных флагов.
9. **Failure mode:** Flipt down → `errorStrategy: fallback` → последний known-good state. Никогда не блокируем критический путь.
10. **Anti-pattern:** не использовать флаги для статической конфигурации (env vars), не оставлять `_rollout`-флаги навсегда (это flag debt).

---

## 1. Зачем это нужно (goals & non-goals)

### Goals

- **G1.** Менять поведение продакшен-системы без deploy: postavить % rollout, выключить kill switch, дать Pro-юзеру фичу.
- **G2.** Безопасные релизы: новая фича за флагом → 0% → 5% → 50% → 100% → удалить флаг. Откат = одна галочка.
- **G3.** Trunk-based development по `mcpgen-git-workflow-rules.md`: незавершённые фичи мержатся в main за выключенным флагом. Никаких `wip/` веток, никаких long-lived feature-branches.
- **G4.** Per-tenant дифференциация: Free vs Pro, beta-testers, internal users (ты сам), country-specific.
- **G5.** Kill switches на дорогие операции (F3 agent eval $1–3, OpenRouter calls) — мгновенно отключить если что-то пошло не так.
- **G6.** Audit trail: кто/когда/почему изменил флаг. Native через `git log` (Flipt v2 хранит флаги в Git).
- **G7.** A/B-эксперименты: сравнение моделей (qwen3-coder vs qwen3-30b-a3b), prompt-templates, threshold'ов в Pass'ах.

### Non-goals

- **N1.** Не используется как config management (env vars остаются для статической конфигурации, секретов, URL'ов).
- **N2.** Не используется в generated tenant Workers (см. §3.6 — они immutable per generation).
- **N3.** Не заменяет permissions/RBAC (это Logto). Флаги могут гейтить Pro-фичи через сегменты, но финальное право решает Logto.
- **N4.** Не заменяет CI/CD canary deploys платформы (Vercel Preview Deploys, CF Workers gradual rollout). Флаги — runtime-уровень внутри уже задеплоенного кода.
- **N5.** Не используется для секретов (URLs, API keys) — это Cloudflare Secrets / Fly secrets.

---

## 2. Архитектура

### 2.1 Топология

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PLATFORM (control plane)                         │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  apps/web    │  │  apps/api    │  │  apps/generation-engine  │   │
│  │  (Next.js)   │  │  (Hono on    │  │  (Python on Fly)         │   │
│  │              │  │   CF Workers)│  │                          │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                 │                       │                  │
│         │   @flipt-io/flipt-client-js (slim/WASM) │                  │
│         │                 │                  flipt-client (FFI)      │
│         └─────────────────┼───────────────────────┘                  │
│                           │                                          │
│                           ▼                                          │
│                  ┌─────────────────┐                                 │
│                  │  Flipt v2       │ ◀─── poll Git every 30s         │
│                  │  (Go binary,    │                                 │
│                  │   no DB)        │                                 │
│                  └────────┬────────┘                                 │
│                           │                                          │
│                           ▼                                          │
│              ┌────────────────────────────┐                          │
│              │  packages/feature-flags/    │  ◀── PR + commit        │
│              │   default/   features.yaml  │                          │
│              │   staging/   features.yaml  │                          │
│              │   production/features.yaml  │                          │
│              └────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│              RUNTIME (generated tenant MCP servers)                  │
│                                                                       │
│           ❌ NO Flipt — config baked at generation time              │
│              (immutable per generation, see §3.6)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Где живёт Flipt server

| Окружение | Где | Как запускается | Cost |
|---|---|---|---|
| **Local dev** | Docker Compose рядом с Postgres | `docker compose up flipt` | $0 |
| **Staging/Preview** | Совмещён с dev (один инстанс) | n/a | $0 |
| **Production (Phase 10+)** | Fly.io Machines, single Go binary | `fly deploy` | ~$2/mo (auto-suspend) |

Production-инстанс **НЕ требует БД** (Flipt v2 хранит state в Git). Это совпадает с принципом solo-friendly ops из CLAUDE.md §11.6.

**Альтернативы рассмотрены и отклонены:**
- Cloudflare Containers — слишком новый продукт на 2026-05, не критичный path.
- Hosted Flipt Cloud — требует Pro ($200/mo), несовместимо с solo-budget.
- Self-host на тестовом DigitalOcean droplet — лишний vendor.

### 2.3 Где живут флаг-определения

```
mcpgen/
└── packages/
    └── feature-flags/
        ├── README.md              # Краткая навигация
        ├── default/               # = "dev" environment
        │   └── features.yaml
        ├── staging/               # промежуточный, optional
        │   └── features.yaml
        ├── production/            # production
        │   └── features.yaml
        └── _shared/               # сегменты, общие для всех env
            └── segments.yaml
```

**Правила:**
- Каждый файл — валидный Flipt v2 YAML schema (`version: "1.2"`).
- `default/` = что видит локальный Flipt при `docker compose up`. Это и есть dev-конфигурация.
- `production/` менять только через PR с label `flags:production` (см. §11.4).
- `_shared/segments.yaml` — определения сегментов (`pro_users`, `internal_users`, `beta_testers`), reused везде.
- Промоушн между environments: cherry-pick / copy YAML diff между папками. Простое правило: **никогда не делать `cp default/ production/`** — это переносит и эксперименты тоже.

### 2.4 Identity & context model

Каждый eval делается через `entityId` + `context`. Это **критично** — от выбора зависит sticky bucketing (юзер всегда получает одно значение).

| Слой | `entityId` | `context` |
|---|---|---|
| **apps/web (logged-in)** | `user.id` (Logto sub) | `{ plan, country, email_domain, signup_at }` |
| **apps/web (anonymous)** | `anonymous_session_id` (cookie, persisted) | `{ country, referrer }` |
| **apps/api (Hono)** | Та же что у вызвавшего web/cli (передаётся через Bearer token → resolve в `user.id`) | `{ plan, org_id, generation_id }` |
| **apps/cli** | `user.id` from API token resolution | `{ plan, cli_version, os }` |
| **apps/generation-engine** | `generation_id` (уникальный per generation) ИЛИ `user.id` если логически про юзера | `{ spec_size, tool_count_estimate, primary_model }` |

**ЗАПРЕЩЕНО:**
- Использовать как `entityId` имена/email/IP (PII в hash key).
- Использовать как `entityId` нечто, что меняется в рамках сессии (sticky bucketing сломается, юзер увидит разные значения).
- Использовать random uuid per-request — флаги станут эффективно non-deterministic, A/B сломается.

**Anonymous bucketing:** для не-залогиненных юзеров на лендинге — `anonymous_session_id` в cookie с TTL 90 дней. Если юзер потом логинится — миграция бакета: повторный eval по `user.id`. Это допустимое одно-разовое "переключение" (документировать факт в commit message).

---

## 3. Интеграция со стеком

### 3.1 apps/web — Next.js 15 на Vercel

**SDK:** `@flipt-io/flipt-client-js` (default build для server components) + `@flipt-io/flipt-client-react` (для client components с hooks).

**Pattern: singleton при старте процесса**

```ts
// apps/web/src/lib/flags/client.ts
import { FliptClient } from '@flipt-io/flipt-client-js';

let _client: FliptClient | null = null;

export async function getFlipt(): Promise<FliptClient> {
  if (_client) return _client;

  _client = await FliptClient.init({
    namespace: 'default',
    environment: process.env.FLIPT_ENVIRONMENT ?? 'default',  // 'default' | 'staging' | 'production'
    url: process.env.FLIPT_URL!,
    authentication: { clientToken: process.env.FLIPT_CLIENT_TOKEN! },
    updateInterval: 30, // seconds — Node.js only
    errorStrategy: 'fallback',
  });

  return _client;
}
```

**Server Component eval:**

```tsx
// apps/web/src/app/dashboard/page.tsx
import { getFlipt } from '@/lib/flags/client';
import { auth } from '@/lib/auth';

export default async function Dashboard() {
  const user = await auth();
  const flipt = await getFlipt();
  const showNewBilling = flipt.evaluateBoolean({
    flagKey: 'billing_pro_features_v2_rollout',
    entityId: user.id,
    context: { plan: user.plan },
  });

  return showNewBilling.enabled ? <BillingV2 /> : <BillingV1 />;
}
```

**Client Component eval (через RSC props):** оценивай флаг в server component, передавай результат как prop в client component. Никогда не таскай `clientToken` в браузер.

### 3.2 apps/api — Hono на Cloudflare Workers

**SDK:** `@flipt-io/flipt-client-js/slim` (slim build, WASM подгружается явно — это требование CF Workers).

```ts
// apps/api/src/lib/flags.ts
import { FliptClient } from '@flipt-io/flipt-client-js/slim';
import wasmModule from '@flipt-io/flipt-client-js/engine.wasm';

// Module-level — переиспользуется между requests в пределах isolate
let _clientPromise: Promise<FliptClient> | null = null;

export function getFlipt(env: Env): Promise<FliptClient> {
  if (_clientPromise) return _clientPromise;

  _clientPromise = FliptClient.init(
    {
      namespace: 'default',
      environment: env.FLIPT_ENVIRONMENT,
      url: env.FLIPT_URL,
      authentication: { clientToken: env.FLIPT_CLIENT_TOKEN },
      errorStrategy: 'fallback',
      // updateInterval НЕ работает в CF Workers (нет setInterval) —
      // вместо этого refresh при cold start + ETag-cached re-fetch.
    },
    { wasm: wasmModule }
  );

  return _clientPromise;
}
```

**В route handler:**

```ts
// apps/api/src/routes/v1/generate.ts
app.post('/v1/generate', async (c) => {
  const flipt = await getFlipt(c.env);
  const user = c.get('user');

  // Migrated from: c.env.MCPGEN_LOCAL_COMPUTE === '1'
  const localCompute = flipt.evaluateBoolean({
    flagKey: 'runtime_local_compute_routing_ops',
    entityId: user.id,
    context: { plan: user.plan, env: c.env.FLIPT_ENVIRONMENT },
  });

  if (localCompute.enabled) options.dev_local = true;
  // ...
});
```

**Cold start:** WASM init ~10–50ms на первом запросе. CF Workers переиспользует isolate ~30мин — амортизировано. Если станет проблемой — pre-warm в `scheduled` handler.

### 3.3 apps/dispatch — CF Workers for Platforms

Тот же подход что и `apps/api`. Но **большинство флагов dispatch НЕ нужны** — он маршрутизатор, не бизнес-логика. Допустимые случаи:
- Kill switch для tenant'а (suspend all traffic).
- Rate-limit override.
- Maintenance mode (502 для всех с инструкцией).

### 3.4 apps/generation-engine — Python на Fly

**SDK:** `flipt-client` Python (FFI-based, MIT). Также singleton.

```python
# apps/generation-engine/app/flags.py
from flipt_client import FliptClient, ClientOptions, ClientTokenAuthentication
import os
from functools import lru_cache

@lru_cache(maxsize=1)
def get_flipt() -> FliptClient:
    return FliptClient(
        namespace="default",
        environment=os.environ["FLIPT_ENVIRONMENT"],
        url=os.environ["FLIPT_URL"],
        authentication=ClientTokenAuthentication(
            client_token=os.environ["FLIPT_CLIENT_TOKEN"]
        ),
        update_interval=30,
        error_strategy="fallback",
    )
```

**Использование в Pass:**

```python
# apps/generation-engine/app/passes/pass_5/runner.py
flipt = get_flipt()

response_format_param = flipt.evaluate_boolean(
    flag_key="pass5_response_format_param_rollout",
    entity_id=generation.user_id,
    context={
        "plan": generation.user_plan,
        "tool_count": str(len(tools)),  # Flipt context = string-only values
    },
).enabled

if response_format_param:
    # генерируем response_format enum в outputSchema
    ...
```

### 3.5 apps/cli — Bun TypeScript

Тот же `@flipt-io/flipt-client-js` (default build, не slim). entityId — `user.id` извлечённый из API token.

**Замечание:** для CLI важно учитывать offline-режим. `errorStrategy: 'fallback'` плюс bootstrap с дефолтами при первом запуске (закешировать в `~/.mcpgen/flags-cache.json`). Если Flipt недоступен — CLI продолжает работать на последних known-good значениях.

### 3.6 Generated tenant Workers — explicitly OUT of scope

**Generated MCP servers НЕ используют Flipt.**

Причины:
1. **Immutable per generation.** Каждый сгенерированный tenant Worker = снимок IR + кода в момент генерации. Меняется поведение — нужна re-generation. Это контрактное обещание перед юзером.
2. **Tenant config baked.** Auth mode, rate limits, allowed hosts — всё в Stage E codegen, не runtime.
3. **Flag drift.** Если бы tenant Worker читал флаги, два юзера с одним spec получали бы разные сервера в разное время — нарушение детерминизма.
4. **Cost.** Каждый tenant Worker зависит от внешнего сервиса = SPOF, дополнительная latency, доп. cost на eval.

**Если нужен kill switch на конкретного tenant'а** (нарушает ToS, fraudulent, etc.) — это делает `apps/dispatch` через **billing/auth lookup** в Postgres, не через Flipt.

---

## 4. Flag taxonomy

### 4.1 Категории

Каждый флаг ОБЯЗАН иметь ровно одну категорию (suffix в имени):

| Suffix | Категория | Lifetime | Default value | Удалить когда |
|---|---|---|---|---|
| `_kill` | Kill switch | **Forever** | `true` (фича on by default; flip → off в инциденте) | Никогда (это safety net) |
| `_rollout` | Постепенный rollout | **Temporary** (≤ 90 дней) | `false` | Дошли до 100%, наблюдаем 7 дней, удаляем код-путь и флаг |
| `_exp` | A/B-эксперимент | **Temporary** (≤ 60 дней) | "control" variant | Получили статистическую значимость, выбрали winner |
| `_perm` | Permission gate | **Long-lived** (годы) | `false` или plan-based | При смене pricing model |
| `_ops` | Ops toggle | **Long-lived** | env-specific | При архитектурном refactor |

### 4.2 Naming convention

Формат: `{domain}_{specific_thing}_{suffix}`

```
domain    = pass0 | pass1 | pass2 | pass3 | pass4 | pass5
          | stage_e | stage_f
          | eval | runtime | billing | ui | auth | dispatch | engine | cli

suffix    = kill | rollout | exp | perm | ops
```

Имена в `snake_case`, ASCII, ≤ 60 chars. **НИКОГДА** не использовать `_v2`, `_new`, `_old` — это говорит о том что флаг останется навсегда (что нарушает rollout-категорию).

**Хорошо:**
- `pass5_response_format_param_rollout`
- `eval_f3_enabled_kill`
- `billing_pro_max_tools_100_perm`
- `runtime_local_compute_routing_ops`
- `engine_primary_model_qwen_vs_30b_exp`

**Плохо:**
- `new_billing` — нет domain, нет category, нет specifics
- `feature_x` — placeholder
- `pass5_v2` — что такое v2? когда удалять?
- `enable_logging` — нет category, не sticky-bucketable
- `tmp_test` — `tmp` = немедленный код-смелл

### 4.3 Required metadata

В `features.yaml` каждый флаг ОБЯЗАН иметь следующие поля (Flipt schema поддерживает `name`, `description`, мы расширяем через `description` JSON-ish или через отдельный manifest):

**Обязательные:**
- `key` — флаг ID (см. §4.2)
- `name` — human-readable заголовок
- `description` — что делает, зачем нужен, как удалить
- `type` — `BOOLEAN_FLAG_TYPE` или `VARIANT_FLAG_TYPE`
- `enabled` — глобальный switch
- `defaultValue` — что вернётся если ни одно правило не сработало

**Расширенный manifest (отдельный YAML, валидируется CI):**

```yaml
# packages/feature-flags/_manifest/flags.yaml
flags:
  - key: pass5_response_format_param_rollout
    category: rollout
    owner: igor
    created_at: 2026-05-03
    expected_removal_at: 2026-08-03  # обязательно для _rollout/_exp
    rollout_target: 100  # %
    related_issues: [GH#142]
    success_metric: "F2 smell score for response_shape ≥ 4.0"
    rollback_signal: "Sentry error spike on /v1/generate"
```

**CI-валидация (GitHub Action):**
- Проверяет наличие manifest entry для каждого флага в `features.yaml`.
- Проверяет что `_rollout` и `_exp` имеют `expected_removal_at` в будущем.
- Падает если флаг существует в `features.yaml` но нет в manifest, и наоборот.

### 4.4 Initial inventory — что мигрировать на Day 1

Найдено в коде на 2026-05-03 (см. `grep` в discovery section). Это **обязательная** initial migration после стенд-апа Flipt:

| Текущий env var | Новый flag key | Категория | Где сейчас в коде |
|---|---|---|---|
| `MCPGEN_LOCAL_COMPUTE` | `runtime_local_compute_routing_ops` | `_ops` | `apps/api/src/lib/cf-platforms-deploy.ts`, `apps/api/src/routes/v1/generate.ts` |
| `MCPGEN_FRONTEND_MODE` | `ui_frontend_fixtures_mode_ops` | `_ops` | `apps/web/src/components/mode-banner.tsx`, tests |
| (hardcoded) `auth_mode === 'none'` allowed | `engine_auth_mode_none_allowed_perm` | `_perm` (Pro feature gate) | `f637love commit` (`fix(codegen): auth_mode "none"`) |
| (hardcoded) F3 always runs | `eval_f3_enabled_kill` | `_kill` | `apps/generation-engine/app/passes/stage_f/` |
| (hardcoded) F2 5-shuffle | `eval_f2_shuffle_count_ops` | `_ops` (variant: "3" \| "5" \| "7") | TBD при Stage F implementation |
| (hardcoded) Pass 0 cap = 50 | `pass0_max_tools_override_perm` | `_perm` (Pro = 100) | `apps/generation-engine/app/passes/pass_0/` |
| (hardcoded) primary model | `engine_primary_model_perm` | `_perm` (variant: qwen-coder \| qwen-30b) | `apps/generation-engine/app/llm/` |

**ПОРЯДОК миграции:** только после того как Flipt-инфра поднята и протестирована (Phase A в §13). Не миграция в один PR — по одному флагу за commit, atomic.

---

## 5. Flag lifecycle

```
   ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐
   │ Created │ →  │ Rolled   │ →  │ Stable   │ →  │Removed  │ →  │ Forever│
   │ (off)   │    │ Out      │    │ at 100%  │    │ (code   │    │ Removed│
   │         │    │ (5/25/   │    │          │    │ path    │    │        │
   │         │    │ 50/100%) │    │          │    │ deleted)│    │        │
   └─────────┘    └──────────┘    └──────────┘    └─────────┘    └────────┘
       │              │               │               │              │
       ▼              ▼               ▼               ▼              ▼
   commit:        commit per       weekly       PR removes        git log
   feat(flags):   stage:           review        flag + code       (audit
   add X          chore(flags):    in stale      path; flag        forever)
                  ramp X to N%     scanner       moved to
                                                 archive
```

### 5.1 Creation

1. Открыть PR с заголовком `feat(flags): add {flag_key}`.
2. Добавить запись в `packages/feature-flags/{env}/features.yaml`.
3. Добавить запись в `packages/feature-flags/_manifest/flags.yaml`.
4. Добавить eval-call в код, **за дефолтным значением**.
5. Self-review (см. `mcpgen-git-workflow-rules.md` §self-review).
6. Squash-merge.

**Default value rule:**
- `_rollout` / `_exp` → `false` или "control" (новая фича выключена by default).
- `_kill` → `true` (фича работает; флаг — emergency off).
- `_perm` → `false` или plan-based.
- `_ops` → env-specific (обычно `false` в production, `true` в dev для удобства).

### 5.2 Rollout (для `_rollout`)

Стандартная лестница (skipping stages — only with explicit justification в commit message):

| Шаг | % | Длительность мин | Сигнал к следующему шагу |
|---|---|---|---|
| 1. Self-test | `internal_users` сегмент (= ты) | 1+ день | Subjective: "у меня работает" |
| 2. Beta | `beta_testers` сегмент | 2–7 дней | Нет жалоб, нет Sentry-spike |
| 3. 5% | random consistent (`entityId`) | 1–2 дня | Sentry < baseline +10%, latency p99 < +20% |
| 4. 25% | random consistent | 2–3 дня | Те же критерии |
| 5. 50% | random consistent | 2–3 дня | Те же |
| 6. 100% | all | 7 дней soak | Нет регрессий → переход к §5.3 |

**Sticky bucketing:** Flipt детерминированно хешит `entityId` → юзер с user_id `abc` всегда получает одно и то же значение в пределах одного rollout%. При повышении % новые юзеры добавляются, существующие не теряются.

### 5.3 Cleanup / removal

Когда флаг достиг 100% и стабилен 7 дней:

1. Открыть PR `chore(flags): remove {flag_key}`.
2. Удалить флаг из `features.yaml`.
3. Удалить запись из `_manifest/flags.yaml`.
4. **Удалить из кода старый путь** (тот что был активен при `false`).
5. Удалить eval-call (выпрямить код).
6. Добавить в `packages/feature-flags/_archive/{year}/{flag_key}.md` запись с финальным state, метриками, lessons learned.

**ЭТО ОБЯЗАТЕЛЬНО.** Незакрытый rollout-флаг = flag debt. Со временем код становится нечитаемым из-за многослойных `if (flag)`.

### 5.4 Stale flag detection

**Inngest cron `weekly-flag-audit`** (запускается по понедельникам 09:00 Europe/Moscow):

1. Парсит `_manifest/flags.yaml`.
2. Для каждого `_rollout` или `_exp` флага: если `expected_removal_at < now()` — открывает GitHub issue с label `flag-debt`.
3. Issue содержит: ссылка на YAML, owner, время просрочки, проверочный чеклист (rollout достиг 100%? код-путь упрощён?).
4. Issue-owner = `owner` из manifest.

Issue-template:

```markdown
**Flag overdue:** `{flag_key}`
**Expected removal:** {date} ({N} days overdue)
**Owner:** {owner}
**Category:** {rollout|exp}

### Checklist
- [ ] Rollout достиг 100% (или эксперимент выбрал winner)?
- [ ] Soak-период (7 days) пройден?
- [ ] Код-путь старого варианта удалён?
- [ ] Запись добавлена в _archive/?
```

---

## 6. Release playbooks

Это рецепты. Каждый — конкретные шаги, не теория.

### 6.1 Standard rollout (выкатываем новую фичу)

**Сценарий:** добавляем `response_format` enum в Pass 5 outputSchema.

```bash
# 1. Создать ветку
git checkout -b feat/pass5-response-format-param

# 2. Реализовать фичу под флагом
# apps/generation-engine/app/passes/pass_5/runner.py:
#   if flipt.evaluate_boolean("pass5_response_format_param_rollout", ...).enabled:
#       generate_response_format_param(...)

# 3. Создать YAML флага
# packages/feature-flags/default/features.yaml:
#   - key: pass5_response_format_param_rollout
#     ...

# 4. Создать manifest entry
# packages/feature-flags/_manifest/flags.yaml:
#   - key: pass5_response_format_param_rollout
#     category: rollout
#     created_at: 2026-05-10
#     expected_removal_at: 2026-08-10

# 5. Atomic commits
git commit -m "feat(pass5): add response_format param generation behind flag"
git commit -m "feat(flags): add pass5_response_format_param_rollout"

# 6. PR → squash merge → main → deployed (флаг OFF для всех)

# 7. На production:
# Self-test (через UI или edit production/features.yaml):
#   rules:
#     - segment: internal_users
#       value: true
#   defaultValue: false
git commit -m "chore(flags): pass5_response_format → internal_users only"

# 8. Через 1 день — beta:
#   rules:
#     - segment: internal_users  → true
#     - segment: beta_testers    → true

# 9. 5% (через 2 дня beta):
#   rules:
#     - segment: ...
#     - rollout: { percentage: 5 }

# 10. 25%, 50%, 100% (см. таблицу §5.2)

# 11. Cleanup (через 7 days at 100%):
git commit -m "chore(flags): remove pass5_response_format_param_rollout (rolled out 100%)"
# в этом же commit удаляется if-блок в коде, флаг из YAML, manifest entry,
# и добавляется запись в _archive/2026/pass5_response_format_param_rollout.md
```

### 6.2 Kill switch (отключение в инциденте)

**Сценарий:** F3 agent eval начал валиться или жрать $50 на запуск — отрубаем.

**Pre-flight (заранее, до инцидента):**

```yaml
# packages/feature-flags/production/features.yaml
- key: eval_f3_enabled_kill
  type: BOOLEAN_FLAG_TYPE
  enabled: true
  defaultValue: true   # ВАЖНО: kill switches default-on
```

```python
# Pre-existing code:
if flipt.evaluate_boolean("eval_f3_enabled_kill", entity_id, context).enabled:
    run_f3_agent_eval(...)
else:
    return QualityReport(f3_skipped=True, reason="kill_switch_engaged")
```

**В инциденте (ночью с телефона):**

1. Открываешь Flipt UI (production env): https://flipt.mcpgen.dev/
2. `eval_f3_enabled_kill` → переключаешь `defaultValue` на `false` через UI.
3. Flipt commit'ит изменение в Git (ты увидишь PR от Flipt-bot).
4. Через ≤30s все instance Flipt-клиентов обновили state → F3 не запускается.
5. Утром: investigate, fix, re-enable.

**Альтернатива (если UI недоступен):**

```bash
# С ноута:
gh pr create --base main --head emergency/disable-f3 \
  --title "fix(flags): emergency disable eval_f3" \
  --body "F3 spend overrun, see Sentry incident #..." \
  --label "flags:production,emergency"
# В PR: edit packages/feature-flags/production/features.yaml — defaultValue: false
gh pr merge --squash --auto
```

Pre-merge hook должен пускать `flags:production,emergency` PR без обычного review-цикла (см. §11.4 для подробностей).

### 6.3 A/B experiment

**Сценарий:** Сравниваем `qwen3-coder` vs `qwen3-30b-a3b-instruct` для Pass 2 description authoring.

```yaml
# packages/feature-flags/production/features.yaml
- key: engine_pass2_model_exp
  type: VARIANT_FLAG_TYPE
  enabled: true
  variants:
    - key: control         # qwen3-coder
    - key: treatment       # qwen3-30b-a3b
  rules:
    - segment: control_group_50pct
      value: control
    - segment: treatment_group_50pct
      value: treatment
  defaultValue: control
```

**Критично:** track outcomes per-variant в Langfuse.

```python
variant = flipt.evaluate_variant("engine_pass2_model_exp", entity_id=user_id, ...).value
model = "qwen/qwen3-coder" if variant == "control" else "qwen/qwen3-30b-a3b-instruct"

with langfuse.trace(name="pass2", user_id=user_id, metadata={"experiment_variant": variant}):
    result = run_pass2(model=model, ...)
    langfuse.score(name="f2_smell_avg", value=result.f2_score, comment=variant)
```

**Stop criterion:** заранее определить (в `_manifest/flags.yaml` поле `success_metric`):
- N samples per variant ≥ 100
- p-value < 0.05 (или Bayesian credible interval не пересекается)
- Effect size meaningful (например, F2 score difference ≥ 0.2)

**При выборе winner:**

```yaml
# Удаляем variants, оставляем winner как defaultValue:
- key: engine_pass2_model_perm   # переименовали из _exp в _perm
  type: BOOLEAN_FLAG_TYPE         # или просто хардкод в коде, флаг удаляем
  enabled: true
  defaultValue: true
```

И затем — `chore(flags): conclude engine_pass2_model_exp (winner: treatment)`.

### 6.4 Pro/plan gating

**Сценарий:** Pro юзеры могут override `max_tools` cap до 100 (вместо free 50).

```yaml
# _shared/segments.yaml
- key: pro_users
  match_type: ALL_MATCH_TYPE
  constraints:
    - type: STRING_COMPARISON_TYPE
      property: plan
      operator: eq
      value: "pro"

# production/features.yaml
- key: pass0_max_tools_override_perm
  type: BOOLEAN_FLAG_TYPE
  enabled: true
  rules:
    - segment: pro_users
      value: true
  defaultValue: false
```

```python
override = flipt.evaluate_boolean(
    "pass0_max_tools_override_perm",
    entity_id=user_id,
    context={"plan": user.plan},  # ← Logto-derived
).enabled

max_tools_cap = 100 if override else 50
```

**Не использовать как замену permissions:** если Pro-фича критична для billing — финальная проверка в Logto/Stripe webhook, флаг — UX-уровень.

### 6.5 Emergency rollback

**Сценарий:** только что выкатили rollout до 50%, Sentry показывает spike.

```bash
# 1. Открыть Flipt UI → flag → rules → rollback rollout%:
#    50% → 25% (или 0%, или disable флаг полностью)

# 2. Если флаг закрывает critical bug fix — НЕ откатывай флаг,
#    а откати code change через git revert:
git revert <merge-commit-sha>

# 3. Post-mortem (см. _archive/incidents/{date}-{flag_key}.md)
```

**Никогда не делать:** force-push в `production` ветку флагов. История изменений = audit trail.

---

## 7. Targeting & evaluation rules

### 7.1 entityId discipline

См. §2.4 — таблица соответствия. Дополнительно:

- **Никогда не передавать `null` или `""`** как entityId — Flipt вернёт defaultValue, но % rollout перестанет быть consistent.
- **Никогда не использовать как entityId**: timestamp, request_id, trace_id, IP.
- Для server-to-server вызовов где нет user'а — использовать `service:{service_name}` (`service:dispatch-worker`). Это позволяет таргетить флаги на сервисы (например, выкатить новую runtime-логику на 10% requests от dispatch-worker).

### 7.2 Context attributes

**Whitelist** (только эти строковые значения проходят в context):

| Attribute | Example | Source |
|---|---|---|
| `plan` | `"free"` \| `"pro"` | Logto / Stripe webhook |
| `country` | `"US"` \| `"DE"` | CF-IPCountry header |
| `email_domain` | `"company.com"` (без `@`) | derived from email |
| `signup_at_year` | `"2026"` | from user record |
| `cli_version` | `"0.2.4"` | CLI passes |
| `os` | `"darwin"` \| `"linux"` | CLI passes |
| `org_id` | `"org_abc123"` | session |
| `env` | `"default"` \| `"staging"` \| `"production"` | runtime |

**Blacklist** (НИКОГДА не класть):
- email (full)
- IP address
- session_id
- access_token
- любые PII (ФИО, телефон, адрес, paymentInfo)
- любые секреты (API keys, OAuth tokens)
- raw spec content
- generated tool descriptions

**Reason:** context идёт в Flipt server и в audit-log Git'а. PII туда попасть не должна (см. CLAUDE.md §9 — privacy logging rules).

### 7.3 Default values (safe by default)

| Категория | Default value rule |
|---|---|
| `_kill` | `true` (фича работает) — failure mode: Flipt down → keeping feature on |
| `_rollout` | `false` (новая фича выключена) — failure mode: Flipt down → юзер видит старое поведение, что безопасно |
| `_exp` | `"control"` (control variant) — никаких сюрпризов |
| `_perm` | `false` (нет permission) — failure mode: денимся, юзер увидит upgrade prompt |
| `_ops` | env-specific. В production — usually `false` (conservative); в dev — usually `true` (developer ergonomics) |

### 7.4 Sticky bucketing

Flipt использует SHA-256 hash от `entityId + flagKey + percentage_seed` для consistency. Юзер `user_42` всегда попадает либо в "включенный" бакет, либо в "выключенный" — пока не меняется `entityId` или семя.

**Не менять `entityId` мид-сессии** — лучше создать новый флаг с другой семантикой.

**Variant flags:** sticky тоже. `user_42` при `engine_pass2_model_exp` всегда получит `treatment`, пока флаг не пересоздан.

---

## 8. Caching & performance

### 8.1 SDK lifecycle per-runtime

| Runtime | Init pattern | Refresh |
|---|---|---|
| Next.js (server) | Module-level singleton, lazy init | `updateInterval: 30s` (Node-only) |
| Next.js (client) | React provider | Bootstrap из RSC, no polling |
| CF Workers | Module-level promise (per-isolate) | ETag refresh on cold start, no setInterval |
| Python engine | `@lru_cache` singleton | `update_interval: 30` (background thread) |
| CLI | Per-invocation, with disk-cache fallback | Single fetch on startup, 60s TTL in-memory |

### 8.2 Cold start mitigation

**CF Workers:** WASM-init ~10–50ms. Acceptable если eval делается раз за request handler. Если в hot path — pre-warm через `scheduled` handler:

```ts
export default {
  async scheduled(event, env, ctx) {
    // pre-warm — каждые 5 мин
    await getFlipt(env);
  },
};
```

**Vercel Edge:** аналогично. Использовать `instrumentation.ts` если нужен pre-warm.

### 8.3 ETag refresh

Flipt SDK по умолчанию использует ETag → если state не изменился, Flipt-server возвращает `304 Not Modified` без payload. Зайти в `flipt-client-js`'s `customFetcher` если хочешь логировать hit/miss ratio.

### 8.4 In-loop evaluation rules

**Запрещено** делать `flipt.evaluate*` внутри hot loop:

```ts
// ❌ ПЛОХО
for (const tool of tools) {
  if (flipt.evaluateBoolean('something', ...).enabled) { ... }
}

// ✅ ХОРОШО
const enabled = flipt.evaluateBoolean('something', ...).enabled;
for (const tool of tools) {
  if (enabled) { ... }
}
```

Eval сам по себе fast (~100µs WASM), но при 1000 итераций — 100ms добавляется ни за что. Eval один раз за scope.

---

## 9. Observability & audit

### 9.1 Flag eval events → Langfuse + Sentry

**Langfuse** (для AI-related флагов):

```python
# Auto-attach к существующему Langfuse trace через PydanticAI/logfire instrumentation
langfuse.update_current_observation(
    metadata={"flags": {"eval_f3_enabled_kill": True, "engine_pass2_model_exp": "treatment"}}
)
```

**Sentry** (Sentry v10 уже имеет встроенную интеграцию — найдено в `apps/web/.next/.../@sentry/core/.../featureFlags.js`):

```ts
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: ...,
  integrations: [Sentry.featureFlagsIntegration()],
});

// При каждом eval:
const result = flipt.evaluateBoolean(...);
Sentry.getClient()
  ?.getIntegrationByName<Sentry.FeatureFlagsIntegration>('FeatureFlags')
  ?.addFeatureFlag(flagKey, result.enabled);
```

Это автоматически добавляет state флагов в каждый Sentry event и span — при error'е сразу видно "у этого юзера был включён `pass5_response_format_param_rollout`".

### 9.2 Audit trail = Git log (native)

Flipt v2 commit'ит каждое изменение state'а в Git с автором (`Flipt Bot <bot@flipt.mcpgen.dev>` если через UI, либо твой email если через PR).

```bash
# Кто/когда менял production-флаги:
git log --follow packages/feature-flags/production/features.yaml

# Diff конкретного изменения:
git show <sha> -- packages/feature-flags/production/features.yaml

# Кто включил kill switch:
git log --all --oneline --grep "eval_f3_enabled_kill"
```

GPG-подпись commit'ов — Pro feature ($200/mo). На MVP пропускаем, валим на trust-model "только владелец репо может пушить в `production` ветку флагов" (branch protection + required reviews).

### 9.3 Dashboards

**TimescaleDB (existing usage_events):** добавить таблицу `flag_eval_events`:

```sql
CREATE TABLE flag_eval_events (
  ts          TIMESTAMPTZ NOT NULL,
  user_id     TEXT,
  flag_key    TEXT NOT NULL,
  variant     TEXT,
  context     JSONB,
  request_id  TEXT
);
SELECT create_hypertable('flag_eval_events', 'ts');
```

Continuous aggregate: hourly counts per (flag_key, variant). Питается из SDK `hook` callback (см. `flipt-client-js` README — раздел Hooks).

**Custom dashboard в `apps/web/src/app/admin/flags/`** (post-MVP):
- Текущий state каждого флага per env.
- Eval rate (evals/min) per flag.
- Variant split.
- Time-series графики rollout%.

### 9.4 Alerts

**BetterStack monitor** на:
- Flipt-server health (`GET /health` 200, response time < 200ms).
- Stale flag count (cron в Inngest, см. §5.4) — alert если > 5 overdue.

**Sentry alert rules:**
- Error rate spike + correlated flag активирован → автоматически открыть incident (используя Sentry feature-flag integration data).

---

## 10. Failure modes

### 10.1 Flipt server недоступен

| Strategy | Поведение |
|---|---|
| `errorStrategy: 'fail'` | SDK throws → request 500. **НЕ использовать в production.** |
| `errorStrategy: 'fallback'` | Возвращает last-known-good state. **DEFAULT для всех приложений.** |

При cold start без known-good state и Flipt down → возвращается `defaultValue` (см. §7.3 — выбор `defaultValue` это и есть failure-mode planning).

### 10.2 SDK init fails

```ts
try {
  client = await FliptClient.init(...);
} catch (err) {
  // Лог в Sentry, fallback к захардкоженным дефолтам
  Sentry.captureException(err, { tags: { component: 'flipt-init' } });
  client = createFallbackClient();  // возвращает defaultValue для всех keys
}
```

### 10.3 Stale state

ETag-refresh может пропускать обновления если у Flipt'а stale Git-poll. Mitigation:
- `poll_interval: 30s` в Flipt-server config (быстрее не нужно).
- В критических kill-switch сценариях — разрешить ручной "force refresh" через admin endpoint в `apps/api`.

### 10.4 WASM не загружается

CF Workers / Edge — типичная проблема: bundler не подхватил `engine.wasm`. Mitigation:
- Использовать `@flipt-io/flipt-client-js/slim` явно.
- В CI добавить smoke-test: deploy Worker, hit endpoint, проверить что флаги evaluатся.

### 10.5 Git-storage corruption

Flipt poll'ит Git, если репо broken / нет доступа — Flipt держит last-known state в памяти. После restart'а — defaultValue для всех. Mitigation:
- Read-only deploy key для Flipt → flags-репо.
- Branch protection на `main` → ничего случайно не сломается.

---

## 11. Security

### 11.1 SDK keys per environment

| Env | Token | Storage |
|---|---|---|
| local dev | `dev-token-anything` (insecure, только для localhost) | `.env.local` (gitignored) |
| staging | `stg_xxx` | CF Workers secrets / Vercel envs / Fly secrets |
| production | `prd_xxx` | те же, но **только для `production` Flipt инстанса** |

**Никогда:** один и тот же token для staging и production.

**Browser:** клиент-tokens с scope `read:default` (только namespace `default`, read-only). Никогда server tokens в браузер.

### 11.2 PII в context

См. §7.2 whitelist. Дополнительно: каждый PR с новым флагом проходит self-review checklist:
- [ ] Context не содержит PII?
- [ ] Email-домены в context? (если да — нормализованы, не full email?)
- [ ] entityId не содержит секретов?

### 11.3 No secrets в flag values

Flag values (для variant flags) — public по своей природе (видны в Git, в Flipt UI, в audit log). НЕЛЬЗЯ хранить:
- API ключи (даже dev/test)
- URLs с credentials
- Internal hostnames с секретными path'ами

Если нужно "secret config" — это ENV VARS / Cloudflare Secrets, не флаги.

### 11.4 Auth Flipt → SCM

Flipt-сервер pull'ит Git-репо где лежат флаги:

| Env | Repo | Auth |
|---|---|---|
| local | `packages/feature-flags/` (волюм, не remote) | n/a |
| production | GitHub-репо `mcpgen` (тот же) | GitHub Deploy Key (read-only, scoped to `packages/feature-flags/`) |

**Branch protection на `production` папку:**
- Required PR review (даже от тебя самого — minimum self-review checkbox)
- Required CI green (manifest validation, see §4.3)
- Required label: `flags:production` или `flags:emergency`

**Эмержанси-PR'ы** (label `flags:emergency`): пропускают required review, но требуют post-merge follow-up issue с post-mortem (auto-opened by GitHub Action).

### 11.5 Multi-tenant isolation

В будущем (post-MVP, см. §15) когда у нас будет multiple внутренних команд: namespaces в Flipt (`namespace=team_a`, `namespace=team_b`). На MVP — один namespace `default`.

---

## 12. Anti-patterns (что НЕ делать)

### 12.1 Не использовать флаги для config

```ts
// ❌ ПЛОХО
const apiUrl = flipt.evaluateString('api_url', ...).value;

// ✅ ХОРОШО
const apiUrl = env.MCPGEN_API_URL;
```

Config = stable, low-cardinality, deploy-time. Флаги = dynamic, runtime, segment-based.

### 12.2 Не вкладывать флаги глубоко

```ts
// ❌ ПЛОХО (3 nested levels)
if (flagA) {
  if (flagB) {
    if (flagC) { ... }
  }
}

// ✅ ХОРОШО — refactor в один комбинированный флаг или в код-логику
const variant = flipt.evaluateVariant('combined_state_exp', ...).value;
switch (variant) { case 'a_b_c': ...; case 'a_only': ...; }
```

Глубина >2 = сигнал что pattern неправильный. Создай variant flag или явный сегмент.

### 12.3 Не оставлять `_rollout` навсегда

Если флаг прошёл 100% и работает 7+ дней — **удалить**. См. §5.3.

Каждый незакрытый rollout = 1 минута на дебаг кому-то в будущем.

### 12.4 Не использовать в hot path без caching

См. §8.4.

### 12.5 Не таргетить по PII

```ts
// ❌ ПЛОХО
flipt.evaluateBoolean('x', { entityId: user.email });

// ✅ ХОРОШО
flipt.evaluateBoolean('x', { entityId: user.id, context: { email_domain: domain(user.email) } });
```

### 12.6 Не использовать `if (env.FLAG_X === '1')` параллельно

Если флаг существует в Flipt — env var должен быть удалён в том же PR. Иначе разъезжается с Flipt-state.

### 12.7 Не делать "hidden flags"

Каждый `flipt.evaluate*` call ОБЯЗАН ссылаться на флаг определённый в YAML. Запрещено создавать флаги через UI без коммита в Git (Flipt v2 это и так делает автоматически — но нельзя коммит-only без manifest update).

### 12.8 Не использовать флаги вместо A/B-инфраструктуры

Если эксперимент требует **statistical significance computation** — Flipt **не делает это**. Используй Flipt для assignment, считай stats в TimescaleDB или внешнем сервисе. После эксперимента — удали флаг.

### 12.9 Не флагировать критическую безопасность

```ts
// ❌ ОЧЕНЬ ПЛОХО
if (flipt.evaluateBoolean('auth_check_enabled', ...).enabled) {
  authenticate(req);
}
```

Безопасность всегда ON. Флагировать можно метод аутентификации (OAuth vs token), но не сам факт проверки.

### 12.10 Не флагировать билинг-критичные операции без подписи

Операции типа "снять с карты" не должны зависеть от runtime флага без двойной проверки на уровне Stripe webhook / DB.

---

## 13. Integration phases (план реализации)

Этот раздел — executable план. Каждая phase = atomic PR (в спирите CLAUDE.md §11.6 "Working > polished").

### Phase A — Stand up Flipt locally (Day 1, 2-4 hours)

**Goal:** `docker compose up flipt` работает, UI доступен на `localhost:8080`, `default/features.yaml` пустой но валидный.

**Tasks:**
- [ ] Добавить сервис `flipt` в `docker-compose.yml` рядом с Postgres.
- [ ] Создать `packages/feature-flags/default/features.yaml` с минимальным валидным skeleton.
- [ ] Создать `packages/feature-flags/_shared/segments.yaml` с `internal_users`, `pro_users`, `beta_testers` (пустые рулесы пока).
- [ ] Создать `packages/feature-flags/README.md` с командами для разработки.
- [ ] Создать `packages/feature-flags/_manifest/flags.yaml` (пустой).
- [ ] Подключить Flipt к Git-storage (volume mount на packages/feature-flags + читать env-config указывающий на default/).
- [ ] Smoke-test: `curl localhost:8080/api/v1/namespaces/default/flags` возвращает `[]`.

**Done when:** Flipt UI открывается, namespace `default` существует, нет ошибок в логе.

### Phase B — Shared client packages (Day 2-3, 4-6 hours)

**Goal:** Каждый app может позвать `getFlipt()` и получить рабочий клиент.

**Tasks:**
- [ ] Добавить `@flipt-io/flipt-client-js` в `packages/runtime-sdk/` (shared TS package для apps/web, apps/api, apps/dispatch, apps/cli).
- [ ] Реализовать `getFlipt(env)` factory с двумя build modes (default vs slim) в зависимости от runtime detection.
- [ ] Добавить `flipt-client` в `apps/generation-engine/pyproject.toml`.
- [ ] Реализовать Python `get_flipt()` singleton.
- [ ] Smoke-test: каждый app в dev'е может eval'нуть несуществующий флаг и получить `defaultValue` без exception'а.

**Done when:** Все 5 apps (web, api, dispatch, engine, cli) собирают и тестируются с Flipt-клиентом mounted, smoke-test passes.

### Phase C — Migrate first env vars to flags (Day 4-5, 4 hours)

**Goal:** Минимум 3 env-var-toggles переведены на Flipt без регрессии в тестах.

**Tasks:** мигрировать в порядке (по 1 PR, atomic):
- [ ] `MCPGEN_LOCAL_COMPUTE` → `runtime_local_compute_routing_ops`.
- [ ] `MCPGEN_FRONTEND_MODE` → `ui_frontend_fixtures_mode_ops`.
- [ ] hardcoded F3 always-runs → `eval_f3_enabled_kill`.
- [ ] Каждый PR удаляет env-var из кода (см. §12.6).
- [ ] Каждый PR обновляет существующие тесты (env-var assertions → mock Flipt).

**Done when:** все 3 флага работают в local dev и в Phase 9 e2e-тестах.

### Phase D — Next.js + Sentry integration (Day 6, 3 hours)

**Goal:** UI флаги работают на лендинге, флаг-state виден в Sentry events.

**Tasks:**
- [ ] Добавить `Sentry.featureFlagsIntegration()` в `apps/web/instrumentation.ts`.
- [ ] Реализовать React provider для `apps/web/src/lib/flags/Provider.tsx`.
- [ ] Сделать первый UI-флаг (например, `ui_dark_mode_rollout` для теста) с self-test.
- [ ] Verify: Sentry event на dev содержит `flags: { ui_dark_mode_rollout: true }`.

**Done when:** Sentry event через "test error" в dev показывает state флагов.

### Phase E — Stale flag scanner (Day 7, 3 hours)

**Goal:** Inngest cron job еженедельно открывает GitHub issues для просроченных rollout/exp флагов.

**Tasks:**
- [ ] Реализовать `infrastructure/inngest/functions/weekly-flag-audit.ts`.
- [ ] Парсит `_manifest/flags.yaml`.
- [ ] Использует GitHub API для создания issues с label `flag-debt`.
- [ ] Schedule: `cron("0 9 * * 1")` (Mon 09:00 Europe/Moscow).
- [ ] Manual trigger endpoint для теста.

**Done when:** ручной trigger создаёт test issue в test-репо.

### Phase F — Production deploy (Phase 10 launch, 4 hours)

**Goal:** Production Flipt-инстанс на Fly.io, production flag-environment настроен, branch protection включён.

**Tasks:**
- [ ] Создать `infrastructure/fly/flipt.toml`.
- [ ] Deploy Flipt v2 на Fly.io Machines (auto-suspend on idle).
- [ ] Создать GitHub Deploy Key для production Flipt → mcpgen-репо (read-only, packages/feature-flags/production/).
- [ ] Создать `packages/feature-flags/production/features.yaml` (копия из default/, выверенная).
- [ ] Branch protection на `packages/feature-flags/production/` через GitHub branch rules + CODEOWNERS.
- [ ] Wire CF Workers, Vercel, Fly env-vars (FLIPT_URL, FLIPT_CLIENT_TOKEN, FLIPT_ENVIRONMENT).
- [ ] BetterStack health check на production Flipt.
- [ ] Smoke-test в production: создать тестовый флаг через UI, увидеть его в `apps/web` через 30s.

**Done when:** все 5 apps в production читают флаги из production Flipt, kill-switch для F3 работает.

### Total estimate

| Phase | Time |
|---|---|
| A | 2–4h |
| B | 4–6h |
| C | 4h |
| D | 3h |
| E | 3h |
| F | 4h |
| **Total** | **20–24h (~3 days)** |

Phases A-E можно делать **до** Phase 10 launch. Phase F — часть Phase 10.

---

## 14. Decision log

> Решения принятые в процессе создания этого контракта. Менять только через `chore(flags-contract):` PR с обоснованием.

| ID | Решение | Дата | Альтернативы рассмотрены | Reason |
|---|---|---|---|---|
| FF-D-001 | Flipt v2 как единственный feature-flag сервис | 2026-05-03 | Unleash (требует Postgres + Edge proxy), Flagsmith (тяжёлый стек), FeatBit (CF Workers incompat), self-host LaunchDarkly | Native CF Workers WASM SDK, Git-native storage без БД, multi-env в OSS, MIT клиент SDK, single binary deployment |
| FF-D-002 | Git-native storage в monorepo (`packages/feature-flags/`), не отдельный репо | 2026-05-03 | Отдельный репо `mcpgen-flags` | Solo-friendly: AI-агент работает в одном checkout. Отделить в отдельный репо можно потом, blast-radius небольшой |
| FF-D-003 | Client-side WASM eval везде, server-side eval не используется | 2026-05-03 | Flipt server-eval (HTTP roundtrip per evaluation) | Latency: ~100µs WASM vs ~10ms HTTP. CF Workers latency budget < 50ms (см. RULES) |
| FF-D-004 | Generated tenant Workers НЕ используют Flipt | 2026-05-03 | Add Flipt SDK к каждому tenant Worker | Immutability per generation = архитектурный invariant. Flag drift нарушает контракт перед юзером |
| FF-D-005 | Single namespace `default`, multi-env через Git directories | 2026-05-03 | Multi-namespace (`dev`/`staging`/`prod`) | Проще для solo, и Flipt v2 promotes git-based env separation |
| FF-D-006 | OpenFeature wrapper НЕ используем (на MVP) | 2026-05-03 | OpenFeature SDK + Flipt provider | Лишний абстракционный слой, Flipt нативный SDK достаточно. Вернёмся если будем менять провайдера |
| FF-D-007 | FCL-1.0-MIT (Flipt server license) принят как acceptable | 2026-05-03 | Только pure Apache 2.0 / MIT | "Permitted Purpose" покрывает internal use; competing-use restriction не задевает MCPGen (мы не строим feature-flag-as-a-service) |
| FF-D-008 | Sentry feature-flags integration используем (v10 native) | 2026-05-03 | Самописный logger | Уже в bundle, automatic event-correlation |
| FF-D-009 | TimescaleDB hypertable для eval events | 2026-05-03 | Langfuse-only | Eval events = high cardinality, time-series, лучше в Timescale; Langfuse — для AI-trace-correlated only |

---

## 15. Future (long-term roadmap, post-launch)

### 15.1 Experimentation infrastructure (v1.1)

- TimescaleDB analytics на `flag_eval_events` + outcome tables.
- Bayesian / frequentist significance calculator (Python service в engine).
- "Conclude experiment" button в admin UI: автоматически удаляет variant flag, документирует winner.

### 15.2 Approval workflows (v1.2, если перейдём на Flipt Pro)

Pro-фича Flipt: merge proposals для flag changes — code review для production flag updates. Релевантно когда команда > 1.

### 15.3 ML-driven targeting (v2.x, гипотетический)

Не Flipt-фича, но Flipt поддерживает rich context. Можно подставлять в context "predicted_propensity_to_upgrade=0.87" из модели и таргетить флаги через segments по этому полю.

### 15.4 Public flag transparency (v1.3)

Учитывая что MCPGen — open-core, рассмотреть публикацию `_archive/` (с какими экспериментами мы запускали и что выиграло) как часть changelog'а. Trust-building.

### 15.5 GDPR / data retention

При удалении user'а: clear их `entityId` из любых retention'ed eval_events (cascading delete via foreign key). Записать в privacy policy.

### 15.6 Multi-region Flipt

Для P99 < 50ms в Asia/Australia — может потребоваться replicated Flipt instances в нескольких регионах. Все они читают тот же Git-репо. Trade-off: больше cost, лучше latency.

### 15.7 Flag governance dashboard

Self-built dashboard в `apps/web/src/app/admin/flags/`:
- Flag debt heatmap (просроченные).
- Eval volume per flag (кто горячий, кто dead).
- Cost-impact (если знаем cost per eval per service).

---

## 16. Cross-references

- **CLAUDE.md §0** — общая иерархия документов; этот контракт ниже RULES.md, mcpgen-architecture.md, mcpgen-git-workflow-rules.md, но выше ad-hoc решений.
- **CLAUDE.md §11.6** — anti-patterns "feature flag system" — этот контракт IS the feature flag system, anti-pattern был "запилю свою с нуля".
- **mcpgen-git-workflow-rules.md** — все commit/PR conventions применяются к flag-changes (Conventional Commits, atomic, squash merge).
- **mcpgen-architecture.md §6** — runtime plane (где живут tenant Workers); этот контракт ссылается как "вне scope для Flipt".
- **mcpgen-implementation-plan.md §11.7** — launch criteria; добавляется новый: "Phase F (этот контракт) complete".
- **mcpgen-stage-f-design.md** — F1/F2/F3 eval; некоторые kill switches здесь упомянуты (`eval_f3_enabled_kill`).
- **RULES.md §6** — out-of-MVP scope; после launch Phase 10 этот контракт активируется как продакшен-policy.

---

## 17. Glossary

- **Flag** — runtime-toggleable boolean или variant value, читаемый из Flipt-server SDK'ом.
- **entityId** — стабильный идентификатор для sticky bucketing. Обычно `user.id`.
- **Context** — структурированный set атрибутов (string-only values) который feedается в targeting rules.
- **Segment** — именованный set targeting constraints (например `pro_users` = `plan == "pro"`).
- **Variant** — значение enum-флага. `engine_pass2_model_exp.value` ∈ `{control, treatment}`.
- **Sticky bucketing** — детерминистическое hash-based assignment. Один и тот же entityId → одно и то же значение, пока не меняется флаг или семя.
- **Kill switch** (`_kill`) — флаг который default-on; его задача — иметь возможность выключить уже выкаченную фичу.
- **Rollout** (`_rollout`) — флаг для постепенной выкатки новой фичи. Default-off, лестница 5/25/50/100%, потом удаляется.
- **Experiment** (`_exp`) — variant флаг для A/B-сравнения. Default = control. Удаляется после выбора winner'а.
- **Permission gate** (`_perm`) — long-lived флаг для plan/role-based gating. Default usually `false`.
- **Ops toggle** (`_ops`) — long-lived флаг для operational override (env-specific behavior, debug modes).
- **Flag debt** — просроченные `_rollout` / `_exp` флаги, не удалённые после rollout'а или эксперимента. Antipattern.
- **Sticky bucket migration** — однократное изменение entityId юзера (например, anonymous → logged-in). Допустимо, документируется.
- **Manifest** — `_manifest/flags.yaml` — расширенный metadata, не часть Flipt-schema, валидируется CI.

---

## 18. Verification checklist (для каждого PR с `feat(flags):` или `chore(flags):`)

PR-author ОБЯЗАН отметить все галочки перед squash-merge:

- [ ] Flag key соответствует naming convention (§4.2).
- [ ] Flag добавлен в `features.yaml` соответствующего env'а.
- [ ] Flag добавлен в `_manifest/flags.yaml` с required metadata (§4.3).
- [ ] Если категория `_rollout` или `_exp` — `expected_removal_at` в будущем.
- [ ] Default value соответствует §7.3 для категории.
- [ ] Eval-call в коде использует правильный entityId (§7.1).
- [ ] Context не содержит PII (§7.2 blacklist).
- [ ] Если флаг заменяет env var — env var удалён в том же PR (§12.6).
- [ ] Если флаг в hot path — eval вынесен из loop (§8.4, §12.4).
- [ ] Тесты обновлены (env-var assertions → Flipt mocks).
- [ ] Self-review пройден per `mcpgen-git-workflow-rules.md`.

---

**End of contract v1.0**

> Изменения в этом документе требуют PR с заголовком `chore(flags-contract): {short summary}` и обновлением version номера в title.
