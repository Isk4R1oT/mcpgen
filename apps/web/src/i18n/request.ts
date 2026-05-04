// apps/web/src/i18n/request.ts
//
// Phase F-i18n — next-intl per-request configuration.
//
// Resolves the active locale for the current request and loads the
// matching `messages/<locale>.json`. Wired up via the `next-intl/plugin`
// in `apps/web/next.config.js` (loader path `./src/i18n/request.ts`).
//
// Locale resolution order (project deliberately runs WITHOUT next-intl
// middleware — see `middleware.ts` step 3 for why):
//   1. `requestLocale` from next-intl middleware (always undefined here
//      since the project bypasses the intl middleware to avoid `/en/`
//      rewrites under flat App Router).
//   2. `NEXT_LOCALE` cookie set by `LangSwitcher`.
//   3. First entry of `Accept-Language` header that matches a supported
//      locale (initial request before any cookie is set).
//   4. `routing.defaultLocale` ('en') as the final fallback.

import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

import { routing } from './routing';

const LOCALE_COOKIE = 'NEXT_LOCALE';

function pickFromAcceptLanguage(header: string | null): string | undefined {
  if (header === null || header.length === 0) return undefined;
  // `en-US,en;q=0.9,ru;q=0.8` → ['en-US', 'en', 'ru']
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter((t): t is string => t !== undefined && t.length > 0);
  for (const tag of tags) {
    // Try exact match first ('en'), then primary subtag ('en-US' → 'en').
    if ((routing.locales as ReadonlyArray<string>).includes(tag)) return tag;
    const primary = tag.split('-')[0];
    if (primary !== undefined && (routing.locales as ReadonlyArray<string>).includes(primary)) {
      return primary;
    }
  }
  return undefined;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const fromMiddleware = await requestLocale;
  let candidate: string | undefined = hasLocale(routing.locales, fromMiddleware)
    ? fromMiddleware
    : undefined;

  if (candidate === undefined) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
    if (hasLocale(routing.locales, cookieValue)) {
      candidate = cookieValue;
    }
  }

  if (candidate === undefined) {
    const headerStore = await headers();
    const accept = headerStore.get('accept-language');
    candidate = pickFromAcceptLanguage(accept);
  }

  const locale = candidate ?? routing.defaultLocale;

  // next-intl supports nested message objects (`{ account: { tabSignin: '…' } }`)
  // for namespaced consumption via `useTranslations('account')`. Cast wide.
  type MessageNode = string | { [k: string]: MessageNode };
  const messages = (await import(`../../messages/${locale}.json`))
    .default as Record<string, MessageNode>;
  return { locale, messages };
});
