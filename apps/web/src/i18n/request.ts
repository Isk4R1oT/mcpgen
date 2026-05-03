// apps/web/src/i18n/request.ts
//
// Phase F-i18n — next-intl per-request configuration.
//
// Resolves the active locale for the current request and loads the
// matching `messages/<locale>.json`. Wired up via the `next-intl/plugin`
// in `apps/web/next.config.js` (loader path `./src/i18n/request.ts`).
//
// Behaviour:
//   1. Read `requestLocale` provided by next-intl middleware.
//   2. If unsupported (or undefined — e.g. SSG without middleware), fall
//      back to `routing.defaultLocale` ('en').
//   3. Dynamic-import the matching JSON dictionary. Webpack/SWC inlines
//      these as part of the build manifest so we don't ship every locale
//      to every request.

import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  // next-intl supports nested message objects (`{ account: { tabSignin: '…' } }`)
  // for namespaced consumption via `useTranslations('account')`. Cast wide.
  type MessageNode = string | { [k: string]: MessageNode };
  const messages = (await import(`../../messages/${locale}.json`))
    .default as Record<string, MessageNode>;
  return { locale, messages };
});
