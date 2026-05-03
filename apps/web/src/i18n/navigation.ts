// apps/web/src/i18n/navigation.ts
//
// Phase F-i18n — locale-aware navigation primitives.
//
// `createNavigation` returns wrapped versions of next/navigation hooks
// (`useRouter`, `usePathname`, `Link`, `redirect`) that automatically
// honour the routing config (locale prefix policy, default locale).
//
// LangSwitcher uses `useRouter().replace(path, { locale: 'ru' })` to
// swap the active locale without changing the rest of the URL.

import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
