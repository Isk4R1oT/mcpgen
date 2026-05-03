# Claude Design — UI Source of Truth

> **Файл:** `claude-design-ui/MCPGen.zip` (заменил `MCP-Gen.zip` 2026-05-03)
>
> **SHA-256:** `5b0d2b1cf0d55aa1a2586f999d0fdbcb1356d8d808268fa415792c13b148d5dd`
>
> **Размер:** 403 254 bytes
>
> **Дата экспорта:** 2026-05-03 03:04
>
> **Источник:** Claude Design (https://api.anthropic.com/v1/design)

## Содержимое (58 файлов)

- `MCPGen.html` — public app entry
- `app.jsx`, `global.css`, `tokens.jsx`, `ui.jsx`, `i18n.jsx`, `ux-glue.jsx`, `tweaks-panel.jsx`
- 12 public screens (`screen-*.jsx`)
- 18 admin screens (`admin/*.jsx`) + `admin.html` + `admin.css`
- `uploads/*` — историческая ссылка (предыдущая Apr-26 версия), при
  распаковке в `apps/web/src/` **игнорируется**.

## Lock invariant

Любые отличия в `apps/web/src/` от содержимого этого zip'а — ошибка
имплементации, не дизайн-решение. Изменения визуала / layout / копирайтинга
/ фич — только через release Claude Design + новый zip + обновление этого
файла + контракта.

## Cross-references

- **Source of truth для UI/UX:** [`docs/mcpgen-frontend-rebuild-contract.md`](../docs/mcpgen-frontend-rebuild-contract.md)
- **Lock-rules:** [`RULES.md`](../RULES.md), [`CLAUDE.md`](../CLAUDE.md) §0
- **Migration plan:** контракт §6 (Migration phases)

## Версионирование

| Дата | Файл | SHA-256 | Размер | Статус |
|---|---|---|---|---|
| 2026-04-26 | `MCP-Gen.zip` | (старая) | 109K | УДАЛЁН 2026-05-03 |
| 2026-05-03 | `MCPGen.zip` | `5b0d2b1c…` | 403K | **CURRENT** |
