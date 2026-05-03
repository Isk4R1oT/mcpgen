// apps/web/src/i18n/routing.ts
//
// Phase F-i18n — next-intl routing config (single source of truth for
// supported locales). Replaces the legacy `LANGUAGES` array from canon
// `apps/web/src/i18n.jsx`. Every locale id below MUST have a matching
// `apps/web/messages/<id>.json` dictionary; the dict-completeness test
// in `__tests__/dict-completeness.test.ts` enforces parity with `en`.
//
// `localePrefix: 'never'` keeps the App Router tree flat (no `[locale]`
// segment refactor required). Locale negotiation happens via the
// `NEXT_LOCALE` cookie + `Accept-Language` header in the middleware;
// every URL serves the user's resolved locale at the same path. This
// matches the canon UX where `LangSwitcher` updates the cookie and the
// URL itself never carries a locale prefix.
//
// References:
// - canon LANGUAGES list: claude-design-reference/canon/i18n.jsx (lines 4-11)
// - canon i18n.jsx persists locale to localStorage('mcpgen-lang'); next-intl
//   replaces that with NEXT_LOCALE cookie (httpOnly + path=/, survives reloads)
// - next-intl App Router routing: https://next-intl.dev/docs/routing

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ru', 'es', 'fr', 'de', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'never',
});

export type Locale = (typeof routing.locales)[number];
