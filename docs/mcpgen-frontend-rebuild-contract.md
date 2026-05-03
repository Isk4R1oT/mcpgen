# MCPGen — Frontend Rebuild Contract (UI Source-of-Truth Restoration)

> **Статус:** v1.1 — APPROVED (2026-05-03; все 10 open questions §13 закрыты).
> **Источник истины** для миграции `apps/web/` к каноничному UI из
> `claude-design-ui/MCPGen.zip` (хеш `5b0d2b1cf0d55aa1a2586f999d0fdbcb1356d8d808268fa415792c13b148d5dd`).
>
> Этот документ — **верховный авторитет** по любому вопросу касающемуся UI/UX.
> При противоречии с любыми другими docs (включая `mcpgen-ux-flow.md`,
> `mcpgen-architecture.md`, ad-hoc решениями в коде, плановыми артефактами
> Phase 07 / 09 / 09.1) — **этот контракт побеждает**.
>
> Контракт **не выигрывает** только у:
> - `RULES.md` (но фактически их подкрепляет);
> - `mcpgen-feature-flags-contract.md` (для механики фича-флагов);
> - `mcpgen-git-workflow-rules.md` (для git-операций).
>
> Изменения вносятся только через PR с заголовком `chore(ui-rebuild-contract):`
> и явным обоснованием.

---

## 0. TL;DR (одной страницей)

1. **Произошёл инцидент.** На этапе Phase 7 (frontend wire-up) фундаментальное правило проекта — «UX/UI спроектирован идеально и НЕ ПОДЛЕЖИТ изменению» — было **нарушено**. Вместо того чтобы взять заpacked frontend из `claude-design-ui/MCPGen.zip` и подключить его к API, был **построен макет с похожими стилями**, проигнорировав десятки готовых компонентов.
2. **Источник истины UI/UX** — файл `claude-design-ui/MCPGen.zip` (новая версия от 2026-05-03 03:04, заменила старую `MCP-Gen.zip`). Это **eternal frontend**: полностью готовый, упакованный, проверенный, с mock-данными для изолированного тестирования. Любые отличия в `apps/web/src/` от его содержимого = ошибка имплементации, а не «улучшение дизайна».
3. **Миссия** — мигрировать **всю реальную бизнес-логику** (API клиенты, SSE-стримы, auth, anon-state, инструментирование, query-state) **в** этот frontend, заменив mock-данные на реальные API-ответы. После работы: **ноль mock-данных** в production-пути.
4. **Ничего из UI не меняем.** Это второй раз когда правило подкрепляется отдельным контрактом. Pixel-perfect соответствие zip'у. Изменения визуала / layout / копирайтинга / фич — только через release Claude Design + новый zip + новый контракт.
5. **Feature flags вместо костылей.** UX забегает вперёд кода — есть готовые модули у которых ещё нет backend'а (marketplace, admin panel и др.). Вместо ручного удаления кода/путей/компонентов мы **гейтим их через Flipt** (per `mcpgen-feature-flags-contract.md`). Когда backend появится — флаг flip'ается, UI оживает без re-deploy фронта.
6. **Out-of-scope для MVP** (флаг = OFF до соответствующих phases roadmap):
   - **Marketplace** (`screen-marketplace.jsx`, `screen-server-detail.jsx`, `admin/admin-marketplace.jsx`) — публичный MCP-hub, публикация, просмотр чужих серверов;
   - **Admin panel** (вся папка `admin/` + `admin.html` + `admin.css` — 18 .jsx файлов) — отдельный модуль уровня SaaS, излишний для MVP.
7. **Verification:** после миграции автоматический CI-чек грепает `apps/web/src/` (исключая тесты) на маркеры `mock|FALLBACK_SAMPLE|fixture|stub:` — должен вернуть **ноль hits**.

---

## 1. Контекст: что произошло (incident report)

### 1.1 Каноническое правило

`mcpgen-architecture.md`, `mcpgen-ux-flow.md` и `CLAUDE.md` зафиксировали:

> **UI ЗАЛОЧЕН.** Распаковать `claude-design-ui/MCPGen.zip` в `apps/web/src/`.
> ЗАПРЕЩЕНО менять визуал, layout, цвета, шрифты, копирайтинг.
> Frontend phase = только wire-up к API (state, fetch calls, SSE consumption,
> error display).

`mcpgen-gsd-sprint-plan.md` повторил это:

> **Anti-pattern:** менять UI в frontend ws (ЗАПРЕЩЕНО — locked).

### 1.2 Что было сделано вместо этого (Phase 7 / 09.1)

В процессе имплементации Phase 7 (frontend wire-up) и последующих фаз 09 / 09.1
(anonymous hero flow) произошло следующее:

1. **Старый zip** `claude-design-ui/MCP-Gen.zip` (Apr 26 версия, 9 экранов) был
   извлечён в `apps/web/src/screen-*.jsx`, `app.jsx`, `tokens.jsx`, `ui.jsx`,
   `tweaks-panel.jsx`, `global.css` (см. `apps/web/src/styles/`).
2. Поверх этих JSX-экранов был построен **слой Next.js App Router** через
   паттерн "jsx-bridge" (`lib/jsx-bridge/`):
   - `app/page.tsx` + `app/_landing-client.tsx`
   - `app/dashboard/page.tsx` + `app/dashboard/_dashboard-client.tsx`
   - `app/generate/page.tsx` + `app/generate/_canvas-client.tsx`
   - `app/generate/[jobId]/preview/page.tsx` + `_preview-client.tsx`
   - `app/generate/[jobId]/quality/page.tsx` + `_quality-client.tsx`
   - `app/generate/[jobId]/playground/page.tsx` + `_playground-client.tsx`
   - `app/generate/[jobId]/deploy/page.tsx` + `_deploy-client.tsx`
   - `app/generate/[jobId]/_stream-client.tsx`
   - и т.д.
3. **Внутри** этих TSX-обёрток местами возникли **самописные компоненты со
   "схожими" стилями**, дублирующие то что уже было в JSX-файлах из zip'а.
   Примеры — `apps/web/src/components/anon-banner.tsx`,
   `apps/web/src/components/anon-cache-hit-badge.tsx`,
   `apps/web/src/components/anon-deploy-cta.tsx`,
   `apps/web/src/components/anon-signup-cta.tsx`,
   `apps/web/src/components/live-stream-log.tsx`,
   `apps/web/src/components/mode-banner.tsx` (последний — мёртвый код,
   подтверждено).
4. **Часть готовых элементов из zip'а была проигнорирована:** оригинальные
   `screen-*.jsx` содержат структуру + slots для "real data", но wire-up
   нашёл только подмножество и достроил остальное самостоятельно.

### 1.3 Что НЕ было нарушено (важно)

- **API клиенты, SSE consumption, auth integration, anon state machine,
  Sentry redaction, query-state, middleware, route-gate, claude-desktop
  config generator** — **всё это написано корректно** и подключено к реальному
  backend'у. Эти модули остаются нетронутыми и **переезжают** в новый
  frontend как есть.
- Сервер-сайд код apps/api / apps/dispatch / apps/generation-engine — **вне
  scope** этого контракта. Они не трогаются.

### 1.4 Почему сейчас

Claude Design выпустил **новую версию zip'а** (`MCPGen(3).zip`, 2026-05-03 03:04,
~400KB vs старые 109KB) — содержит **все** готовые экраны включая модули
которые УЖЕ предусмотрены UX но ещё не имеют backend'а:
- `screen-billing.jsx` (новое)
- `screen-marketplace.jsx` (новое — то что юзер называет "mcp-hub")
- `screen-server-detail.jsx` (новое — детальная страница чужого MCP)
- `screen-dashboard-list.jsx` (новое — list view)
- Полная папка `admin/` — 18 admin-экранов (login, overview, users, billing,
  audit, broadcast, content, data, deploys, flags, integrations, llm,
  marketplace, obs, servers, support, ui)
- `i18n.jsx` — 37KB i18n-словарь (UI готов к локализации)
- `ux-glue.jsx` — связующий слой между UI и mock-data

Текущий `apps/web/src/` — **устарел минимум на одну версию zip'а** и **никогда
не был pixel-perfect** даже относительно Apr-26 версии.

### 1.5 Решение

**Полная миграция:**

1. Заменить файлы UI в `apps/web/src/` на содержимое нового zip'а — точно как
   они есть, без изменений.
2. Перенести существующую бизнес-логику (`lib/`, `providers/`, `middleware.ts`,
   `app/api/`, route-handlers) в новый frontend как **wiring-слой** (не
   как visual-слой).
3. Заменить mock-данные внутри новых экранов на реальные API-ответы пропсами /
   query-state / SSE-стримами.
4. Модули, для которых ещё **нет backend'а** (marketplace, admin), скрыть
   через **feature flags** — без удаления кода.
5. Финальный CI-чек: ноль mock-маркеров в production-коде.

---

## 2. Источник истины — claude-design-ui/MCPGen.zip

### 2.1 Status

| Параметр | Значение |
|---|---|
| Path | `claude-design-ui/MCPGen.zip` |
| Size | 403 254 bytes |
| SHA-256 | `5b0d2b1cf0d55aa1a2586f999d0fdbcb1356d8d808268fa415792c13b148d5dd` |
| Дата | 2026-05-03 03:04 |
| Источник | Claude Design (https://api.anthropic.com/v1/design) |
| Замещает | `claude-design-ui/MCP-Gen.zip` (Apr 26, удалён) |

### 2.2 Lock invariant

**ЗАПРЕЩЕНО:**
- Распаковывать поверх него самописные правки.
- Хранить две версии параллельно.
- Менять имя файла без обновления этого контракта.
- Расширять / сокращать / редактировать любой `.jsx` / `.css` / `.html`
  файл из zip'а после распаковки.
- Создавать "адаптированные" копии компонентов из zip'а в `apps/web/src/components/`
  даже с минимальными правками.

**РАЗРЕШЕНО:**
- Распаковывать в рабочую директорию для проверки структуры.
- Импортировать `.jsx` / `.css` файлы как есть.
- Передавать пропсы в экраны (это и есть wiring).
- Оборачивать экраны в Next.js Server / Client Component'ы (паттерн
  jsx-bridge остаётся).
- Заменять литералы mock-данных внутри экранов на пропсы (см. §6.2 ниже —
  это **единственная разрешённая правка** содержимого zip-файлов после
  распаковки, и только в чётко обозначенных местах).

### 2.3 Полный список содержимого (58 файлов)

**Top-level (root приложения):**

| Файл | Назначение |
|---|---|
| `MCPGen.html` | Public app entry point |
| `app.jsx` (11.5K) | Главный App component, роутинг между screen-*.jsx |
| `global.css` (21.7K) | Все design tokens + global styles |
| `tokens.jsx` (7.5K) | Design tokens в JSX-форме (для динамики) |
| `ui.jsx` (7.6K) | Locked UI primitives (Badge, и т.д.) |
| `i18n.jsx` (37.9K) | Полный i18n словарь |
| `ux-glue.jsx` (16.3K) | Связующий слой UI ↔ mock data |
| `tweaks-panel.jsx` (18.1K) | Dev-панель для tweaking design tokens |

**Public screens (12 экранов):**

| Файл | Что показывает |
|---|---|
| `screen-landing.jsx` | Лендинг с hero CTA |
| `screen-auth.jsx` | Auth (sign-in / sign-up) |
| `screen-canvas.jsx` | Главный canvas (paste URL → generate) |
| `screen-stream.jsx` | SSE стрим генерации (9 событий, прогресс) |
| `screen-preview.jsx` | Preview сгенерированного MCP |
| `screen-quality.jsx` | Quality report (F1/F2/F3) |
| `screen-playground.jsx` | Tool playground (run tools) |
| `screen-deploy.jsx` | Deploy flow + Claude Desktop config |
| `screen-dashboard.jsx` | Dashboard (single user) |
| `screen-dashboard-list.jsx` | Dashboard (list view) **NEW** |
| `screen-billing.jsx` | Billing / pricing **NEW** |
| `screen-marketplace.jsx` | **OUT-OF-MVP** Public MCP marketplace |
| `screen-server-detail.jsx` | **OUT-OF-MVP** Single MCP server page |

**Admin module (18 экранов + entry/styles):**

| Файл | Что показывает |
|---|---|
| `admin.html` | Admin app entry |
| `admin.css` | Admin-specific styles (отдельные от global.css) |
| `admin/admin-app.jsx` | Admin App shell |
| `admin/admin-login.jsx` | Admin login |
| `admin/admin-overview.jsx` | Admin home / metrics |
| `admin/admin-users.jsx` | Users management |
| `admin/admin-billing.jsx` | Billing oversight |
| `admin/admin-audit.jsx` | Audit logs |
| `admin/admin-broadcast.jsx` | Broadcast notifications |
| `admin/admin-content.jsx` | Content moderation |
| `admin/admin-data.jsx` | Data tooling (26K, самый большой) |
| `admin/admin-deploys.jsx` | Deploys oversight |
| `admin/admin-flags.jsx` | Feature flags admin UI |
| `admin/admin-integrations.jsx` | Integrations |
| `admin/admin-llm.jsx` | LLM config |
| `admin/admin-marketplace.jsx` | Marketplace moderation |
| `admin/admin-obs.jsx` | Observability dashboard |
| `admin/admin-servers.jsx` | Servers oversight |
| `admin/admin-support.jsx` | Support tools |
| `admin/admin-ui.jsx` | UI customization |

**Uploads (могут быть проигнорированы при имплементации):**

| Путь | Что |
|---|---|
| `uploads/MCP-Gen/*` | Старая Apr-26 версия, упакована внутри новой как историческая ссылка |
| `uploads/*.png` | Внутренние изображения дизайн-системы |

Эти файлы НЕ извлекаются в `apps/web/src/` — они уже historical artifact внутри
самого zip'а.

### 2.4 Out-of-MVP модули (per user statement)

Юзер явно указал что **не имеют backend'а** на MVP-этапе:

1. **Marketplace** (= "mcp-hub" в терминах юзера):
   - `screen-marketplace.jsx`
   - `screen-server-detail.jsx`
   - `admin/admin-marketplace.jsx`
   - + любые ссылки / навигация / CTA из других screens которые ведут в эти модули.
   - Связанная логика: публикация, public MCP, просмотр чужих серверов.
   - **Будет в roadmap позже** (отдельные phases v1.1+).

2. **Admin panel:**
   - Вся папка `admin/` (18 .jsx)
   - `admin.html`, `admin.css`
   - + любые ссылки в публичной части ведущие в `/admin`
   - Это «огромный модуль уровня SaaS», избыточный для MVP.
   - **Будет в roadmap позже**.

Дополнительные модули могут быть выявлены при инвентаризации (Phase M-1
ниже) — список **не финальный**, расширяется по мере обнаружения "UI без
backend'а".

---

## 3. Два инвариaнта — нерушимые правила

### Инвариант I-1: NO UI CHANGES

**Pixel-perfect соответствие zip-у.**

Что включает:
- Все JSX-экраны (`screen-*.jsx`) копируются **как есть**.
- `global.css`, `tokens.jsx`, `ui.jsx` — **bit-for-bit идентичны** zip'у.
- `i18n.jsx`, `ux-glue.jsx`, `tweaks-panel.jsx`, `app.jsx` — **bit-for-bit
  идентичны**, кроме точечной замены mock-чтений на пропсы (см. §6.2 — это
  единственная допустимая модификация).
- Admin-папка копируется целиком.

Что НЕ включает (allowed wiring):
- TSX-обёртки в `apps/web/src/app/` (Next.js page + client shell) — это
  wiring-слой, может изменяться сколько угодно.
- `lib/`, `providers/`, `middleware.ts` — это logic-слой, не UI.
- API routes в `app/api/v1/` — wiring, не UI.

**Verification:**
- CI-job сравнивает SHA-256 каждого файла из распакованного zip'а с тем что
  лежит в `apps/web/src/<corresponding-path>` (для `screen-*.jsx`,
  `global.css`, `tokens.jsx`, `ui.jsx`, `admin/*`).
- Любой mismatch → fail.
- Допустимое исключение — точечные замены mock-чтений (см. §6.2 список).

### Инвариант I-2: NO MOCK DATA IN PRODUCTION PATH

**После миграции в production-коде ноль mock-данных.**

Что считается mock-данными (запрещено в production-пути):
- Хардкоженные `FALLBACK_SAMPLE`, `LUMEN_SAMPLE`, `DEMO_DATA` и подобные.
- Inline литералы тулов / dashboard'ов / preview которые имитируют ответ API.
- Stub responses в API-routes (`{stub: true, ...}`).
- `fixture-mode` SSE replay в production-сборке (NODE_ENV=production
  hard-block уже стоит — должен сохраниться).
- "Lorem ipsum" текст / placeholder названия серверов.

Что НЕ считается mock-данными (разрешено):
- Тестовые fixtures в `tests/**` и `packages/engine-fixtures/**`.
- `mock` в названиях моков для unit-тестов.
- Loading skeletons / placeholder UI пока данные грузятся (визуальное
  состояние, не данные).
- Default values для form inputs (например, `placeholder="https://api..."`).
- i18n-ключи (это перевод, не данные).

**Verification:**

```bash
# CI-job: ноль попаданий в production-пути.
rg --type-add 'webprod:*.{ts,tsx,jsx}' \
   --type webprod \
   -i 'mock|FALLBACK_SAMPLE|LUMEN_SAMPLE|DEMO_DATA|stub:|lorem ipsum' \
   apps/web/src \
   --glob '!**/__tests__/**' \
   --glob '!**/*.test.*' \
   --glob '!**/tests/**' \
   --glob '!**/*.stories.*'
# expected: empty output
```

Если grep что-то находит — это либо легитимный кейс (loading skeleton,
i18n key) который должен быть в whitelist, либо нарушение I-2.

---

## 4. Inventory: что в текущем `apps/web/src/`

### 4.1 UI-слой (будет ЗАМЕНЁН)

| Текущий файл | Версия | Действие |
|---|---|---|
| `apps/web/src/screen-auth.jsx` | от старого zip | Заменить на screen-auth.jsx из нового zip |
| `apps/web/src/screen-canvas.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-dashboard.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-deploy.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-landing.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-playground.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-preview.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-quality.jsx` | от старого zip | Заменить |
| `apps/web/src/screen-stream.jsx` | от старого zip | Заменить |
| `apps/web/src/app.jsx` | от старого zip | Заменить |
| `apps/web/src/tokens.jsx` | от старого zip | Заменить |
| `apps/web/src/ui.jsx` | от старого zip | Заменить |
| `apps/web/src/tweaks-panel.jsx` | от старого zip | Заменить |
| `apps/web/src/global.css` (если есть) | от старого zip | Заменить |
| `apps/web/src/styles/global.css` | от старого zip | Заменить |

**Добавляется (новое в текущем `apps/web/src/`):**

| Новый файл из zip | Действие |
|---|---|
| `screen-billing.jsx` | Распаковать |
| `screen-dashboard-list.jsx` | Распаковать |
| `screen-marketplace.jsx` | Распаковать → гейтнуть флагом `ui_marketplace_perm` |
| `screen-server-detail.jsx` | Распаковать → гейтнуть `ui_marketplace_perm` |
| `i18n.jsx` | Распаковать |
| `ux-glue.jsx` | Распаковать (с точечными правками — см. §6.2) |
| `admin/*` (вся папка) | Распаковать → гейтнуть флагом `ui_admin_panel_perm` |
| `admin.html`, `admin.css` | Распаковать → гейтнуть |

### 4.2 Самописные компоненты со «схожими» стилями (будут УДАЛЕНЫ)

| Файл | Куда мигрирует функциональность |
|---|---|
| `apps/web/src/components/anon-banner.tsx` | в zip'е есть штатное место в screen'ах для anon-state — слить туда |
| `apps/web/src/components/anon-cache-hit-badge.tsx` | screen-stream.jsx из zip'а уже умеет показывать cache hit |
| `apps/web/src/components/anon-deploy-cta.tsx` | screen-deploy.jsx из zip'а имеет встроенные CTA |
| `apps/web/src/components/anon-signup-cta.tsx` | то же — встроено в zip-screens |
| `apps/web/src/components/live-stream-log.tsx` | screen-stream.jsx из zip'а полностью покрывает это |
| `apps/web/src/components/mode-banner.tsx` | МЁРТВЫЙ КОД (никем не импортируется) — удалить |

**Все 6 компонентов из `apps/web/src/components/` УДАЛЯЮТСЯ.** Их функция
покрывается экранами из zip'а напрямую через пропсы.

### 4.3 Logic-слой (будет СОХРАНЁН + переподключён)

| Файл / папка | Назначение | Судьба |
|---|---|---|
| `lib/api/client.ts` | API client для BFF | Сохранить, переиспользовать |
| `lib/api/dashboard-client.ts` | Dashboard client | Сохранить |
| `lib/api/error-mapper.ts` | Error mapping | Сохранить |
| `lib/sse/use-generation-sse.ts` | SSE consumption hook | Сохранить, перепривязать к screen-stream |
| `lib/sse/last-event-id.ts` | SSE resume helper | Сохранить |
| `lib/anon-state.ts` | Anon state machine | Сохранить |
| `lib/logto/client.ts` | Logto auth client | Сохранить |
| `lib/sentry/redact.ts` | Sentry PII redaction | Сохранить |
| `lib/quality-badge.ts` | Quality badge logic | Сохранить, переподключить к screen-quality |
| `lib/idempotency-key.ts` | Idempotency-Key header generator | Сохранить |
| `lib/route-gate.ts` | Route-level gates | Сохранить |
| `lib/claude-desktop/config.ts` | Claude Desktop config generator | Сохранить, переподключить к screen-deploy |
| `lib/claude-desktop/collision.ts` | Name collision detection | Сохранить |
| `lib/preview/code-block.tsx` | Code block component (preview) | Проверить — если визуальный, не из zip'а — удалить; если utility — сохранить |
| `lib/jsx-bridge/*` | Loader/wrapper для JSX-screens | Сохранить, расширить под новые screens |
| `lib/fixture-mode/index.ts` | (УЖЕ МИГРИРОВАН на Flipt 2026-05-03) | Сохранить |
| `lib/fixture-mode/guard.ts` | Production hard-block | Сохранить |
| `lib/fixture-mode/sse-timeline.ts` | SSE replay timeline для fixture-mode | Сохранить (только dev-режим) |
| **`ux-glue.jsx`** (из zip'а, после M-3) | В zip'е это adapter-слой между mock data и screens (для standalone HTML-режима) | **Распакован в `apps/web/src/` как часть zip-канона (I-1), но НЕ ИМПОРТИРУЕТСЯ в Next.js production-пути.** Пропсы прокидываются Next.js страницами напрямую в screens. ux-glue.jsx остаётся для standalone-режима (открыть `MCPGen.html` локально для дизайн-проверки) |
| `lib/flags/index.ts` | Sentry-correlated flag eval | Сохранить, использовать для гейтов |
| `providers/logto-session-context.tsx` | Logto context | Сохранить |
| `providers/logto-session.tsx` | Logto provider | Сохранить |
| `providers/query-client.tsx` | TanStack Query provider | Сохранить |
| `middleware.ts` | Next.js middleware (auth gate) | Сохранить |
| `app/api/v1/*` (route handlers) | BFF proxy routes | Сохранить (уже мигрированы на Flipt) |

### 4.4 Wiring-слой (TSX-обёртки) — будет ПЕРЕПИСАН

Все `app/**/page.tsx` + `_*-client.tsx` нужно переписать чтобы они:
1. Загружали данные с API.
2. Передавали как пропсы в новые JSX-экраны из zip'а.
3. **Не дублировали** структуру / стиль этих экранов.

| Текущий файл | Новый screen из zip | Что прокидывается как пропсы |
|---|---|---|
| `app/page.tsx` + `_landing-client.tsx` | `screen-landing.jsx` | (статика — может вообще не нуждаться в пропсах) |
| `app/_auth-client.tsx` | `screen-auth.jsx` | Logto session state |
| `app/dashboard/page.tsx` + `_dashboard-client.tsx` | `screen-dashboard.jsx` или `screen-dashboard-list.jsx` (выбор зависит от `dashboard-list_rollout` флага) | List of generations, deployments, usage |
| `app/generate/page.tsx` + `_canvas-client.tsx` | `screen-canvas.jsx` | (мало пропсов — это start point) |
| `app/generate/[jobId]/_stream-client.tsx` | `screen-stream.jsx` | SSE timeline events, cache-hit flag |
| `app/generate/[jobId]/preview/page.tsx` + `_preview-client.tsx` | `screen-preview.jsx` | `final_tools`, `endpoint_count`, `spec_name`, smart-id format |
| `app/generate/[jobId]/quality/page.tsx` + `_quality-client.tsx` | `screen-quality.jsx` | Quality report (F1/F2/F3 dimensions) |
| `app/generate/[jobId]/playground/page.tsx` + `_playground-client.tsx` | `screen-playground.jsx` | Tools list, run results |
| `app/generate/[jobId]/deploy/page.tsx` + `_deploy-client.tsx` | `screen-deploy.jsx` | Deployment URL, Claude Desktop config |
| `app/pricing/page.tsx` | `screen-billing.jsx` | Stripe price IDs, current plan |

Новые pages (которые надо завести под флагами):

| Новый screen | Pages надо создать | Флаг |
|---|---|---|
| `screen-marketplace.jsx` | `app/marketplace/page.tsx` | `ui_marketplace_perm` |
| `screen-server-detail.jsx` | `app/marketplace/[serverId]/page.tsx` | `ui_marketplace_perm` |
| `admin/*` | `app/admin/page.tsx` + sub-routes | `ui_admin_panel_perm` |

---

## 5. Feature flags для модулей-без-backend'а

Per `mcpgen-feature-flags-contract.md` §4 — таксономия. Все эти флаги `_perm`
(long-lived, удаляются только когда соответствующий backend-модуль ландится
в roadmap). Default = `false` для всех (модули скрыты).

### 5.1 Новые флаги для добавления в Flipt

| Flag key | Что гейтит | Default | Сегмент override | Удалить когда |
|---|---|---|---|---|
| `ui_marketplace_perm` | `screen-marketplace.jsx`, `screen-server-detail.jsx`, `admin/admin-marketplace.jsx`, все nav/CTAs ведущие туда | `false` | — | Phase v1.x (Marketplace launch) |
| `ui_admin_panel_perm` | `/admin/*` routes, `admin.html`, `admin.css`, вся папка `admin/`, ссылки из public части | `false` | `internal_users` → `true` (для самого автора) | Phase v1.x (Admin module ship) |
| `ui_tweaks_panel_perm` | `tweaks-panel.jsx` — dev-инструмент для tweaking design tokens | `false` | `internal_users` → `true` | Никогда (Pro/internal-only feature) |
| `ui_billing_active_perm` | `screen-billing.jsx`, флоу подписок, ссылки на upgrade | `false` (Stripe wiring пока неполный) | — | Когда Phase 8 завершена и Stripe live |

**i18n switcher** — флаг **не нужен**. `i18n.jsx` уже содержит полный
словарь, провайдер с дефолтом `en` + browser-detect работает client-side
без backend'а. Переключатель в UI, если он есть, просто toggle'ит state.

**Обнаружение дополнительных out-of-backend элементов** — Phase M-1
(инвентаризация) должна найти кнопки / линки / секции в zip-screens которые
вызывают endpoints не существующие в `apps/api`. Каждое такое место получает
`_perm` флаг с `default=false` пока backend не появится.

### 5.2 Mock-data invariant — окружение vs флаг (CLARIFICATION)

**Принцип:** флаг гейтит **видимость фичи**, окружение гейтит **источник
данных**. Они независимы.

| Состояние | Production сборка | Dev сборка |
|---|---|---|
| Фича готова, флаг ON | Реальный API | Реальный API (или fixture-mode для дев-демо) |
| Фича в разработке, флаг OFF | **Не видна** (404 / hidden) | Не видна. Internal segment может включить — всё равно реальный API |
| Фича не запущена | Не видна | Не видна |

**Mock-данные в production-сборке не присутствуют ни при каком состоянии
флага.** Это инвариант I-2.

Mock доступен только:
- В `tests/**` (vitest fixtures, изолированы)
- В `packages/engine-fixtures/**` (canonical fixtures для F2/F3)
- Через `ui_frontend_fixtures_mode_ops` флаг — но он `production-hard-blocked`
  через `NODE_ENV=production` гарду в `lib/fixture-mode/guard.ts` (T-7-15
  cross-tenant invariant).

### 5.3 Где гейтить (3 уровня)

**Level 1: Route gate (preferred — целые pages не рендерятся)**

```ts
// apps/web/src/middleware.ts (или в page.tsx server component)
import { evaluateBooleanFlag } from '@/lib/flags';

export default async function MarketplacePage(...) {
  const enabled = await evaluateBooleanFlag(
    'ui_marketplace_perm',
    user.id,
    { plan: user.plan },
    false,
  );
  if (!enabled) return notFound();  // 404, route не существует для юзера
  return <ScreenMarketplaceWrapper {...props} />;
}
```

**Level 2: Component gate (для inline кнопок / линков внутри shared screens)**

```tsx
// При рендере screen-canvas, если в JSX есть кнопка "Publish to Marketplace"
const canPublish = await evaluateBooleanFlag('ui_marketplace_perm', ...);
return <ScreenCanvas {...props} showPublishButton={canPublish} />;
// Внутри screen-canvas.jsx добавлен пропс showPublishButton —
// это разрешённая правка (см. §6.2)
```

**Level 3: Nav gate (для меню / nav-bar)**

```tsx
const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  ...(showMarketplace ? [{ label: 'Marketplace', href: '/marketplace' }] : []),
  ...(showAdmin ? [{ label: 'Admin', href: '/admin' }] : []),
];
```

### 5.4 Flag rollout policy

- **Initial state** в Flipt после bootstrap'а: все `ui_*_perm` = `false` для
  всех users.
- **Internal users segment** (= ты сам): можно включить отдельно для
  preview / debugging.
- **Beta testers segment**: можно включить когда backend готов на 80%.
- **100% rollout**: только когда соответствующий backend phase merged + soak
  7 days passed.

---

## 6. Migration phases (последовательность работ)

Каждая phase = отдельный atomic PR (per `mcpgen-git-workflow-rules.md`).
Не объединять. Не пропускать.

### Phase M-0: Setup (DONE до начала)

- ✅ Файл `claude-design-ui/MCPGen.zip` положен (хеш проверен).
- ✅ Старый `claude-design-ui/MCP-Gen.zip` удалён.
- ✅ `claude-design-ui/DESIGN.md` будет обновлён (см. Phase M-1).
- ⏳ Этот контракт вынесен в `docs/mcpgen-frontend-rebuild-contract.md`.
- ⏳ В `CLAUDE.md` §0 добавлена ссылка на этот контракт.

### Phase M-1: Inventory + Mapping doc (1 PR, ~2-3 часа)

**Goal:** распаковать zip в **временный sandbox** (не в `apps/web/src/`),
сравнить с текущим, выписать каждое отличие.

**Tasks:**
1. `unzip claude-design-ui/MCPGen.zip -d .planning/ui-rebuild-sandbox/`
   (sandbox в `.planning/` чтобы не мешало app-runtime'у).
2. Создать `.planning/ui-rebuild-sandbox/INVENTORY.md`:
   - Diff каждого `screen-*.jsx` с текущим в `apps/web/src/`.
   - Список новых файлов (которых нет в `apps/web/src/`).
   - Список устаревших файлов (которые в `apps/web/src/` но нет в zip'е).
   - Mapping: «какая логика из текущего `lib/` подключается к какому
     screen-у».
3. Создать `.planning/ui-rebuild-sandbox/PROP-CONTRACTS.md`:
   - Для каждого `screen-*.jsx` — какие пропсы он ожидает (читая JSX код).
   - Сравнение с тем что текущий wiring пропихивает.
   - Список **новых пропсов** которые надо передавать (из новых API
     endpoints).
   - Список **mock-литералов** которые надо заменить на пропсы (это
     допустимая правка — единственная).
4. Создать `.planning/ui-rebuild-sandbox/OUT-OF-BACKEND.md`:
   - Список кнопок / линков / секций в screens которые вызывают endpoints
     не существующие в `apps/api`.
   - Каждая запись: где (screen + JSX-line), какой endpoint, нужен ли flag.
5. Обновить `claude-design-ui/DESIGN.md`:
   - SHA-256 zip'а.
   - Дата.
   - Версия Claude Design.
   - Ссылка на этот контракт.

**Done when:** все три artifact-докумена в `.planning/ui-rebuild-sandbox/`
готовы и проверены глазами на полноту.

### Phase M-2: Logic-only quarantine (1 PR, ~1 час)

**Goal:** убедиться что вся бизнес-логика которую мы СОХРАНЯЕМ изолирована
от UI-слоя, чтобы Phase M-3 не сломала её.

**Tasks:**
1. Перенести (если нужно) UI-импорты из `lib/` в отдельные файлы. `lib/`
   должна импортировать только из `@mcpgen/contracts`, `@mcpgen/runtime`,
   стандартных библиотек, и **никогда** из `screen-*.jsx`.
2. Прогнать `pnpm typecheck` — должно быть зелёным до изменений UI.
3. Прогнать `pnpm test` — все 118 unit-тестов зелёные.

**Done when:** lib-слой полностью изолирован, тесты проходят.

### Phase M-3: UI replacement (1 PR, ~2 часа)

**Goal:** физически заменить UI-файлы. После этого PR app **сломан** (mock
не доступны, новые screens не получают пропсы) — это ожидаемо. Phase M-4
чинит всё.

**Tasks:**
1. Удалить из `apps/web/src/`:
   - Все `screen-*.jsx` старые версии.
   - `app.jsx`, `tokens.jsx`, `ui.jsx`, `tweaks-panel.jsx`.
   - `global.css` (если в src/).
   - `components/anon-banner.tsx`, `anon-cache-hit-badge.tsx`,
     `anon-deploy-cta.tsx`, `anon-signup-cta.tsx`, `live-stream-log.tsx`,
     `mode-banner.tsx` (всё мёртвое + дубликаты).
2. Распаковать `claude-design-ui/MCPGen.zip` в `apps/web/src/`:
   - Все top-level `.jsx` / `.css` / `.html` (кроме `uploads/*`).
   - Папка `admin/` целиком.
3. Bit-for-bit проверка: SHA-256 каждого распакованного файла = SHA-256 в
   zip'е. Зафиксировать в `.planning/ui-rebuild-sandbox/HASH-MANIFEST.md`.
4. Игнорировать `uploads/` — это историческая ссылка, не нужна в runtime'е.
5. Прогнать `pnpm typecheck` — будет fail (новые JSX не подключены к pages).
6. **Не пытаться чинить тесты в этом PR** — это работа Phase M-4.

**Commit message:** `refactor(web): replace UI files with claude-design-ui/MCPGen.zip contents — Phase M-3 (intentionally breaks tests; M-4 wires logic)`

**Done when:** файлы заменены, hash-manifest зафиксирован.

### Phase M-4: Wire each screen to real API (несколько PRs, ~6-10 часов суммарно)

**Goal:** по одному экрану — переподключить wiring, заменить mock-литералы
на пропсы, обновить `app/**/page.tsx`.

**Sequencing (по убыванию критичности для Phase 09.1 anon-flow):**

| # | Screen | Page wiring | API + state | PR title |
|---|---|---|---|---|
| 1 | `screen-canvas` | `app/generate/page.tsx` | POST /v1/generate | `feat(web): wire canvas to real generate endpoint` |
| 2 | `screen-stream` | `app/generate/[jobId]/_stream-client.tsx` | SSE /v1/jobs/:id/stream | `feat(web): wire stream to real SSE endpoint` |
| 3 | `screen-preview` | `app/generate/[jobId]/preview/page.tsx` | GET /v1/jobs/:id (artifacts) | `feat(web): wire preview to real engine artifacts` |
| 4 | `screen-quality` | `app/generate/[jobId]/quality/page.tsx` | GET /v1/jobs/:id (quality report) | `feat(web): wire quality screen to real report` |
| 5 | `screen-deploy` | `app/generate/[jobId]/deploy/page.tsx` | POST /v1/deploy/:id | `feat(web): wire deploy + Claude Desktop config to real endpoint` |
| 6 | `screen-playground` | `app/generate/[jobId]/playground/page.tsx` | POST /v1/jobs/:id/run-tool | `feat(web): wire playground tool execution` |
| 7 | `screen-landing` | `app/page.tsx` | (mostly static) | `feat(web): wire landing` |
| 8 | `screen-auth` | `app/_auth-client.tsx` | Logto session | `feat(web): wire auth to Logto` |
| 9 | `screen-dashboard` + `screen-dashboard-list` | `app/dashboard/page.tsx` | GET /v1/deployments + GET /v1/usage/hourly | `feat(web): wire dashboard to real deployments + usage` |
| 10 | `screen-billing` | `app/pricing/page.tsx` | Stripe webhook + GET /v1/billing/plan | `feat(web): wire billing to real Stripe state` |
| 11 | `screen-marketplace` + `screen-server-detail` | `app/marketplace/...` | GATED via `ui_marketplace_perm` (returns 404) | `feat(web): scaffold marketplace routes behind ui_marketplace_perm flag` |
| 12 | Admin | `app/admin/...` | GATED via `ui_admin_panel_perm` (returns 404) | `feat(web): scaffold admin routes behind ui_admin_panel_perm flag` |

**Каждый PR:**
- Один screen → один PR.
- Заменяет mock-чтения внутри screen-файла на пропсы (точечная правка
  per §6.2 — единственная допустимая модификация zip-файлов).
- Обновляет `app/**/page.tsx` + `_*-client.tsx` чтобы загружали данные
  с API и передавали их.
- Удаляет соответствующие inline literals (`FALLBACK_SAMPLE`,
  `LUMEN_SAMPLE`, и т.д.) если они были в TSX-обёртке.
- Обновляет тесты для нового пропс-контракта.
- `pnpm typecheck` + `pnpm test` зелёные **в конце каждого PR**.

### Phase M-5: Feature-flag gates apply (1 PR, ~1-2 часа)

**Goal:** добавить flags для marketplace + admin + любых других обнаруженных
"UI-без-backend'а" модулей в `packages/feature-flags/default/features.yaml`,
бутстрапнуть в Flipt, проверить что pages возвращают 404 / hidden.

**Tasks:**
1. Обновить `packages/feature-flags/default/features.yaml` — добавить
   `ui_marketplace_perm`, `ui_admin_panel_perm`, и любые `_perm`-флаги
   найденные в Phase M-1.
2. Обновить `_manifest/flags.yaml` соответственно.
3. Прогнать `pnpm --filter @mcpgen/feature-flags bootstrap`.
4. Manual smoke-test:
   - Open `/marketplace` → 404 ✓
   - Open `/admin` → 404 ✓
   - Open `/dashboard` (regular) → showed normally ✓
5. Ручной toggle через Flipt UI: `ui_marketplace_perm = true` → marketplace
   виден.

### Phase M-6: Mock-data eradication audit (1 PR, ~1 час)

**Goal:** запустить CI-скрипт, найти все оставшиеся mock-маркеры в
production-пути, удалить либо whitelist'нуть.

**Tasks:**
1. Создать `apps/web/scripts/audit-mock.mjs`:
   ```js
   // Greps apps/web/src for production-path mock markers, exits 1 if found.
   ```
2. Запустить локально, исправить найденное.
3. Добавить в CI как required job (`.github/workflows/web-mock-audit.yml`).
4. Whitelist (если нужен) — отдельный YAML с обоснованием каждого entry.

### Phase M-7: Visual-lock test refresh (1 PR, ~1-2 часа)

**Goal:** обновить Playwright visual-lock тесты (`apps/web/tests/visual-lock/`)
чтобы они проверяли новый UI из zip'а, а не старый.

**Tasks:**
1. Запустить `pnpm playwright update-snapshots` для visual-lock тестов.
2. Глазами просмотреть каждый snapshot — соответствует zip-у?
3. Зафиксировать новые snapshots в репо.

### Phase M-8: Final verification (1 PR, ~30 минут)

**Goal:** зафиксировать что всё работает, мок-аудит зелёный, контракт
выполнен.

**Tasks:**
1. Прогнать `pnpm test` целиком — 118+ зелёные.
2. Прогнать E2E suite (`pnpm test:e2e` если есть).
3. Прогнать audit-mock CI job — ноль hits.
4. Запустить `pnpm dev`, ручной smoke:
   - Anonymous flow: paste OpenAPI URL → generate → stream → preview →
     quality → deploy.
   - Authed flow: signup → dashboard → recent generations.
   - Marketplace `/marketplace` → 404 ✓
   - Admin `/admin` → 404 ✓
5. Сравнить визуально с zip'ом (открыв `MCPGen.html` в браузере) — pixel
   match.
6. Закрыть инцидент: добавить запись в `_archive/incidents/2026-05-03-frontend-source-of-truth-violation.md`.

**Total estimate:** 12–20 часов runtime, ~9 PR'ов, можно растянуть на
~3-5 рабочих дней с smoke-тестами между PR'ами.

---

## 6.1 Что нельзя делать в процессе миграции

- Не объединять M-3 + M-4 в один PR — M-3 ломает app, M-4 чинит. Отдельные
  PR'ы для атомарности и rollback.
- Не пропускать Phase M-1 (inventory) — без mapping'а Phase M-4 будет
  guessing.
- Не «обновлять» / «улучшать» компоненты из zip'а пока миграция не
  завершена — это nemesis всей операции.
- Не удалять `lib/fixture-mode/` — он мигрирован на Flipt, остаётся как
  dev-tool.
- Не поднимать backend для marketplace / admin "пока тут руки в коде" —
  scope creep, отдельные phases в roadmap.

## 6.2 Точечные правки внутри zip-файлов — единственное исключение

**Когда:** в `screen-*.jsx` есть inline mock-данные которые нужно заменить
на пропсы.

**Шаблон правки:**

```jsx
// ДО (как в zip):
const FALLBACK_SAMPLE = {
  name: 'lumen payments-mcp',
  endpoints: 348,
  tools: ['charges_create', 'customers_search', /* ... */],
};
function ScreenPreview() {
  return <PreviewLayout sample={FALLBACK_SAMPLE} />;
}
```

```jsx
// ПОСЛЕ (после правки):
function ScreenPreview({ sample }) {
  return <PreviewLayout sample={sample} />;
}
```

**Условия:**
1. Удаляются ТОЛЬКО литералы помеченные как `FALLBACK_*`, `LUMEN_*`,
   `DEMO_*`, `SAMPLE_*`, и аналогичные.
2. Никакие визуальные элементы / styled components / классы / литералы
   текста (i18n) НЕ затрагиваются.
3. Каждая правка фиксируется в `.planning/ui-rebuild-sandbox/PROP-CONTRACTS.md`
   с before / after diff'ом.
4. Если screen имеет дефолтный пропс с `??` — оставить как defensive default
   `null` (loading state), но не оставлять FALLBACK_SAMPLE как fallback —
   это будет mock-данные в production.

**Запрещено:**
- Менять структуру JSX-компонентов внутри screen.
- Менять `className`'ы.
- Менять inline-стили.
- Менять `onClick` / `onChange` / event-handlers (если они используют mock —
  заменить на колбек из пропса).
- Менять `import` / `export` сигнатуры если это сломает совместимость с
  `app.jsx` или `ux-glue.jsx`.

---

## 6.5 Parallel execution playbook

Раздел формализует SOTA-2026 практики оркестрации параллельных Claude Code
sub-agent'ов на время этой миграции. Базируется на:

- Anthropic engineering blog "How we built our multi-agent research system"
  (3-5 sub-agents per lead, 90% time reduction, ~15× token cost factor).
- Claude Code Agent Teams официальная документация (worktree isolation,
  shared task list coordination).
- Production case studies: incident.io / Cursor / Rakuten (4-5 параллельных
  агентов routinely, delivery 24 → 5 days).
- DEV Community Claude Code subagent rate-limits guide (10 hard concurrent
  cap, 2-5 sweet spot).

### 6.5.1 Concurrency cap

- **Hard limit:** 10 одновременных sub-agent'ов (Claude Code platform
  constraint).
- **Recommended sweet-spot:** 3-5 (per Anthropic research-system + community
  consensus).
- **Rationale:** beyond 5 — coordination cost outweighs parallelism gain
  (диminishing returns на верификации output'ов).

### 6.5.2 Token economy honesty

- Single agent ≈ **4× chat tokens**.
- Multi-agent ≈ **15× chat tokens**.
- Justified только когда wall-clock saves outweigh token cost.

Per-phase guidance:

| Phase | Mode | Agents | Cost factor | Justification |
|-------|------|--------|-------------|---------------|
| M-1 inventory | parallel | 3 | ~8-10× | read-only analysis, parallel scan |
| M-4 wire-up | parallel | 5 | ~12-15× | ~10× wall-clock saving outweighs cost |
| M-2 / M-3 / M-5 / M-8 | sequential | 1 | 1× | no parallelism win (linear deps) |

### 6.5.3 Sub-agents cannot spawn sub-sub-agents

Orchestrator (главный Claude session человека) — **ЕДИНСТВЕННАЯ** сущность,
которая fans out work. Sub-agents **только** execute и report. Никаких
nested Agent tool calls внутри sub-agent'ов (returns nothing per Claude
Code platform constraint).

### 6.5.4 Git worktree isolation (Anthropic-documented pattern)

Для Phase M-4 (5 агентов пишут concurrent code), каждый агент работает в
собственном git worktree:

```bash
git worktree add ../mcpgen-m4-flow      -b feature/m4-flow      feature/ui-rebuild-09.2
git worktree add ../mcpgen-m4-artifacts -b feature/m4-artifacts feature/ui-rebuild-09.2
git worktree add ../mcpgen-m4-actions   -b feature/m4-actions   feature/ui-rebuild-09.2
git worktree add ../mcpgen-m4-entry     -b feature/m4-entry     feature/ui-rebuild-09.2
git worktree add ../mcpgen-m4-gated     -b feature/m4-gated     feature/ui-rebuild-09.2
```

Orchestrator merge'ит branches sequentially после того как все 5
finish'ат (НЕ concurrent merge → избегаем conflict storm).

### 6.5.5 Shared file authority registry (M-4)

Файлы, которые несколько агентов могут хотеть тронуть — только ОДИН имеет
authority на запись:

| File | Authority |
|------|-----------|
| `apps/web/src/app/layout.tsx` | Agent 4 (entry) |
| `apps/web/src/middleware.ts` | Agent 4 (entry) |
| `packages/feature-flags/_manifest/flags.yaml` | Agent 5 (gated) |
| `packages/feature-flags/default/features.yaml` | Agent 5 (gated) |
| `apps/web/package.json` | Agent 4 |
| `pnpm-lock.yaml` | Agent 4 |

Другие агенты, которым нужны изменения в этих файлах, пишут request в
`.planning/ui-rebuild-sandbox/SHARED-FILE-REQUESTS.md`; orchestrator
batches & применяет сам.

### 6.5.6 Mandatory dispatch template

Каждый dispatch агента ОБЯЗАН содержать:

1. **Goal** — one-sentence problem statement.
2. **Scope (your zone)** — точные file paths для read/write/create +
   worktree path.
3. **Forbidden** — files/zones, которые агент НЕ должен touch'ать.
4. **Context (pre-loaded)** — contract refs (§X), source-of-truth paths,
   existing logic to wire, API endpoints. **Sub-agent НЕ имеет памяти этой
   conversation** — всё нужное передаётся explicitly.
5. **Success criteria** — typecheck green, tests green, hash match,
   zero-mock greps.
6. **Output** — branch name, PR title, ≤200-word summary.

### 6.5.7 Coordination layer

- `.planning/ui-rebuild-sandbox/EXECUTION-STATE.md` — orchestrator-maintained
  progress log (single writer = orchestrator).
- `.planning/ui-rebuild-sandbox/SHARED-FILE-REQUESTS.md` — queued
  cross-agent file change requests.
- Каждый агент commits в СВОЙ branch с atomic Conventional Commits
  (см. `docs/mcpgen-git-workflow-rules.md`).

### 6.5.8 Anti-patterns

1. **Vague prompts** ("Wire up the dashboard") → poor output. Всегда —
   precise scope + success criteria.
2. **Over-parallelizing simple tasks** → token waste. Если задача < 30
   минут sequential — НЕ дробить на агентов.
3. **Allowing agents to share file authority** → merge conflicts. Один
   файл = один writer.
4. **Forgetting agents have no conversation context** → mis-aligned output.
   Pre-load всё нужное в dispatch prompt.
5. **Letting agents "improve" UI per their judgement** → I-1 violation
   (см. §3.1). Агенту НЕ разрешено менять визуал zip-файлов сверх §6.2
   exceptions.

### 6.5.9 Why not GSD framework

Для этой миграции:

- **Scope is well-defined** — этот контракт (§§1-12) покрывает всё.
- **No discuss/research phase needed** — §§1-12 уже зафиксировали все
  decisions.
- **Cost ratio:** ~30-40 GSD sub-agent invocations vs ~15 direct Agent
  tool calls = **~3× cost overhead** без proportional benefit.
- **GSD optimal** для unknown-scope features (требующих discuss/plan/spec);
  refactor известного scope лучше делать через direct orchestration этого
  контракта.

---

## 7. Sequencing относительно Phase 09.1 / Phase 10

### 7.1 Текущее состояние (2026-05-03)

Per `.planning/STATE.md`:
- Project: 93% complete.
- Phase 09.1 (anonymous-hero-flow): COMPLETE (13/13 plans).
- Phase 10 (launch): UNBLOCKED, частично начата (Plan 10-03 done).

### 7.2 Где этот rebuild ложится в roadmap

**Phase 09.2 — UI Source-of-Truth Restoration.**

Вставляем как новую phase **между** Phase 09.1 и Phase 10. Обоснование:
- Phase 10 = launch. Запуск с **wrong frontend** = launch продукта который
  показывает не то что было обещано в дизайне.
- Этот контракт = «закрытие технического долга Phase 7».
- Phase 09.2 не блокирует engine / runtime / billing работу — только
  apps/web.

**Дедлайн-стратегия:** не нужна отдельная (нет «Variant B / pre-launch
big-bang» вопросов). Феча-флаги ИЗ `mcpgen-feature-flags-contract.md`
**сами являются** дедлайн-стратегией:
- Что доделано → flag ON → видно юзерам.
- Что не доделано → flag OFF → не видно (404 или hidden).
- Launch может произойти в любой момент когда **критический путь**
  (anon-flow + paid signup) zelleny — все остальные фичи под флагами с
  default OFF.

### 7.3 Влияние на launch criteria

`mcpgen-implementation-plan.md` §11.7 launch criteria, дополнить:

- ✅ "UI is bit-for-bit identical to claude-design-ui/MCPGen.zip"
- ✅ "Zero mock-data markers in apps/web/src/ production paths"
- ✅ "ui_marketplace_perm, ui_admin_panel_perm, ui_tweaks_panel_perm, ui_billing_active_perm flags exist and default to false"
- ✅ "All wire-up PRs (Phase M-4) merged and individually smoke-tested"

**Kill switch для Phase 10 launch:** любой не-готовый экран → его флаг OFF →
скрыт от юзеров. Launch может произойти как только anon-flow + auth + базовый
dashboard работают; остальное флагируется как в разработке.

---

## 8. Risks & mitigations

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Phase M-4 occluded — найдётся пропс которого не отдаёт текущий API | High | Phase M-1 inventory обнаруживает все gaps; backend fix как side-PR per gap |
| R2 | Visual regression vs zip — pixel-perfect не достигнут | Medium | Phase M-7 visual-lock + ручной diff в DevTools |
| R3 | Phase 09.1 anon-flow ломается во время M-4 wire-up | Medium-High | Каждый PR (M-4.1..M-4.12) проходит anon-flow e2e перед merge |
| R4 | Mock-audit (Phase M-6) находит маркеры которые нельзя удалить (например, dev-only debug data) | Low | Whitelist YAML с per-entry обоснованием |
| R5 | Marketplace / admin flags случайно flip в production | Low | Branch protection на `production/features.yaml` per feature-flags-contract §11.4 |
| R6 | Stripe wiring incomplete для billing → screen-billing.jsx ломается | Medium | `ui_billing_screen_rollout` flag — fall back to /pricing static page |
| R7 | Scope creep: при wire-up захочется "поправить" UI | High (psychological) | Этот контракт + I-1 invariant + CI hash check |
| R8 | i18n.jsx (37KB) ломает build из-за размера | Low | Бандлер обрабатывает; lazy-load если нужно |
| R9 | jsx-bridge паттерн не справляется с новым app.jsx | Medium | Phase M-2 (logic isolation) проверяет совместимость; fallback — переписать bridge |
| R10 | Не успеваем до launch | Medium | Vatiant B fallback (флаги OFF + post-launch wire-up) |

---

## 9. Decision log

| ID | Решение | Дата | Альтернативы | Reason |
|---|---|---|---|---|
| FE-D-001 | `claude-design-ui/MCPGen.zip` — single source of truth | 2026-05-03 | Многоверсионность, GitHub-side LFS | Простота: один файл, hash-check'ится |
| FE-D-002 | UI-файлы из zip'а распаковываются bit-for-bit | 2026-05-03 | "Адаптировать под Next.js conventions" | Любая правка = drift; CI hash check защищает |
| FE-D-003 | jsx-bridge паттерн сохраняется | 2026-05-03 | Полный rewrite на TSX | jsx-bridge работает; rewrite — другой проект |
| FE-D-004 | Mock-литералы внутри screens — единственная разрешённая правка | 2026-05-03 | Wrap в HOC для пропсов | Меньше cruft, проще проверить hash отличий |
| FE-D-005 | Marketplace + Admin = `_perm` flags, default false | 2026-05-03 | Удалить файлы | Roadmap позже включит — не теряем код |
| FE-D-006 | Phase 09.2 — отдельная phase до launch | 2026-05-03 | Big-bang в Phase 10 | Меньше риск; honest scope |
| FE-D-007 | Самописные components/anon-* удаляются | 2026-05-03 | Сохранить как "shared" | zip-screens покрывают функционал; дубликаты = долг |
| FE-D-008 | uploads/* в zip'е игнорируется при распаковке | 2026-05-03 | Полная распаковка | Историческая ссылка, не нужна в runtime |
| FE-D-009 | Visual-lock тесты обновляются в Phase M-7 | 2026-05-03 | Сразу в M-3 | M-3 ломает app — snapshots ловят несоответствия M-4 wire-up |
| FE-D-010 | i18n switcher = `ui_i18n_switcher_perm` flag | 2026-05-03 | Hardcode 'en' | Backend для user.locale нет — гейтим |

---

## 10. Cross-references

- **`RULES.md`** — UI lock invariant изначально декларирован там; этот
  контракт — операционный инструмент.
- **`mcpgen-feature-flags-contract.md`** — мы используем фича-флаги для
  гейтинга; категории `_perm` / sticky bucketing / failure modes — оттуда.
- **`mcpgen-architecture.md`** §15 — repository structure, не противоречит
  этому контракту.
- **`mcpgen-ux-flow.md`** — UX/копирайтинг принципы; **не** исходник
  визуала (визуал — zip).
- **`mcpgen-git-workflow-rules.md`** — все commits / PRs / squash-merge.
- **`mcpgen-implementation-plan.md`** §11.7 — launch criteria, дополняются
  (см. §7.3).
- **`mcpgen-gsd-sprint-plan.md`** §4.7 — frontend workstream rules
  reinforced.
- **`.planning/STATE.md`** — Phase 09.2 будет добавлена в roadmap.

---

## 11. Glossary

- **Eternal frontend** — UI описанный в `claude-design-ui/MCPGen.zip`. Не
  меняется. То что показывает дизайн = то что должен показывать продукт.
- **Source of truth violation (Phase 7)** — инцидент когда вместо
  использования zip'а был построен макет с похожими стилями.
- **Mock data** — литералы / hard-coded значения / stub responses которые
  имитируют реальные API-ответы. Запрещены в production-пути после
  миграции.
- **Pixel-perfect** — bit-for-bit / visual-diff identity между zip-файлом и
  тем что в `apps/web/src/`.
- **Wiring (wire-up)** — подключение API / state / SSE к готовому UI через
  пропсы. **Не** = переписывание UI.
- **jsx-bridge** — паттерн в `apps/web/src/lib/jsx-bridge/` который
  позволяет Next.js Server Components использовать JSX-screens из zip'а.
- **`_perm` flag** — постоянный feature-flag который гейтит модуль до
  готовности backend'а. Per feature-flags-contract §4.1.
- **Quarantine** (Phase M-2) — изоляция бизнес-логики от UI чтобы Phase M-3
  замена UI не сломала её.
- **Big-bang migration** — антипаттерн: всё в один PR. Контракт явно
  запрещает.

---

## 12. Verification protocol

После завершения всех Phase M-1..M-8 этот чеклист должен быть зелёным:

- [ ] SHA-256 каждого `screen-*.jsx`, `app.jsx`, `tokens.jsx`, `ui.jsx`,
  `tweaks-panel.jsx`, `i18n.jsx`, `ux-glue.jsx`, `global.css`, `admin/*`
  совпадает с тем что в zip'е (allowed exceptions per §6.2 — fixed list).
- [ ] CI job `web-mock-audit` зелёный.
- [ ] CI job `web-visual-lock` зелёный.
- [ ] `pnpm test` (apps/web) — 100% зелёный.
- [ ] `pnpm test` (apps/api) — 100% зелёный.
- [ ] Manual smoke: anon-flow E2E работает (paste URL → see deployed MCP).
- [ ] Manual smoke: `/marketplace` → 404.
- [ ] Manual smoke: `/admin` → 404.
- [ ] Sentry: feature-flag state виден в test-event'ах.
- [ ] No dead code: `apps/web/src/components/{anon-banner,anon-cache-hit-badge,anon-deploy-cta,anon-signup-cta,live-stream-log,mode-banner}.tsx` файлов не существует.
- [ ] `claude-design-ui/MCP-Gen.zip` (старый) удалён.
- [ ] `claude-design-ui/MCPGen.zip` (новый) на месте, hash зафиксирован в
  DESIGN.md.
- [ ] `_archive/incidents/2026-05-03-frontend-source-of-truth-violation.md`
  написан как post-mortem.
- [ ] Phase 10 launch criteria обновлены.

---

## 13. Resolved questions (closed 2026-05-03 per user)

Все 10 open questions из v1.0 закрыты. Решения зафиксированы:

| # | Вопрос | Решение |
|---|---|---|
| 1 | Phase 09.2 vs Phase 10 inline | **Phase 09.2** — отдельная phase между 09.1 и 10. Полная актуализация UX/UI. |
| 2 | Variant B (post-launch wire-up) | **Не нужна.** Флаги ИЗ feature-flags-contract = дедлайн-стратегия. ON = готово / видно, OFF = не готово / скрыто. |
| 3 | `screen-billing.jsx` Stripe wire-up | **Берём новый UI как есть, добавляем Stripe-логику ВНУТРЬ через пропсы.** Флаг `ui_billing_active_perm` = OFF до полной готовности Stripe. |
| 4 | dashboard vs dashboard-list — какой default | **Оба используются как разные routes.** Phase M-1 определит какой screen → какой URL (`/dashboard` vs `/dashboard/[id]` или подобно). Никакого A/B — оба «настоящие» экраны нового дизайна. |
| 5 | i18n switcher flag | **Флаг не нужен.** i18n.jsx full dict, provider с `en` default + browser-detect, switcher (если есть в UI) toggle'ит client-side state. |
| 6 | app.jsx vs Next.js router | **Next.js routing wins.** app.jsx не подключается как роутер. Каждая Next.js page импортирует нужный конкретный screen-*.jsx. Layout/providers из app.jsx переезжают в `app/layout.tsx` или существующие providers. |
| 7 | uploads/MCP-Gen/* | **Игнорируем при распаковке.** Это историческая reference внутри нового zip'а — не нужна в runtime. |
| 8 | tweaks-panel.jsx | **Флаг `ui_tweaks_panel_perm`** (default OFF, internal_users → ON). Это dev-tool, юзерам не нужен. |
| 9 | Admin entry (separate vs embedded) | **Embed under `/admin/*` в основном Next.js app.** Один Vercel deploy, общая Logto session, проще ops для MVP. Role-check в middleware + `ui_admin_panel_perm` flag. |
| 10 | ux-glue.jsx | **Распакован как часть zip-канона (I-1), но НЕ ИМПОРТИРУЕТСЯ в Next.js production.** Пропсы прокидываются Next.js страницами напрямую в screens. Файл остаётся для standalone HTML-режима. Mock-данные в production не присутствуют независимо от состояния флагов (см. §5.2). |

---

**End of contract v1.1 (APPROVED)**

> Дальнейшие изменения вносятся только через PR с заголовком
> `chore(ui-rebuild-contract):` и bump версии. Imminent next phase: M-1
> (Inventory + Mapping doc) per §6.
