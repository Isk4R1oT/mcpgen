// apps/web/src/i18n/__tests__/dict-completeness.test.ts
//
// Phase F-i18n — guards against translation drift.
//
// Asserts that every locale dictionary in `apps/web/messages/*.json`
// declares the *exact* same set of keys as `en.json`. New English keys
// must be added to all locales together (or this test fails CI).
//
// Why: silent missing-key fall-through (next-intl falls back to the key
// name) ships English text inside non-English UIs, which is worse than
// failing loud. The canon dictionary in i18n.jsx historically enforced
// this implicitly — every `en` key had a matching `ru/es/fr/de/zh`
// entry. We keep that invariant.

import { describe, expect, test } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import fr from '../../../messages/fr.json';
import ru from '../../../messages/ru.json';
import zh from '../../../messages/zh.json';

import { routing } from '../routing';

// Use a tuple of [locale, dict] pairs (instead of an indexed Record) so
// the `noUncheckedIndexedAccess` strictness in tsconfig.base.json does
// not infer `Record<string, string> | undefined` on lookups.
const DICTS = {
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
  es: es as Record<string, string>,
  fr: fr as Record<string, string>,
  de: de as Record<string, string>,
  zh: zh as Record<string, string>,
} as const;

describe('i18n dictionary completeness', () => {
  test('routing.locales matches the set of message files on disk', () => {
    const onDisk = Object.keys(DICTS).sort();
    const declared = [...routing.locales].sort();
    expect(declared).toEqual(onDisk);
  });

  test('every locale has the same key set as English', () => {
    const enKeys = Object.keys(DICTS.en).sort();
    expect(enKeys.length).toBeGreaterThan(0);

    for (const locale of Object.keys(DICTS) as Array<keyof typeof DICTS>) {
      if (locale === 'en') continue;
      const localeKeys = Object.keys(DICTS[locale]).sort();
      expect(localeKeys, `locale "${locale}" key set mismatch`).toEqual(enKeys);
    }
  });

  test('no locale has empty string values', () => {
    for (const locale of Object.keys(DICTS) as Array<keyof typeof DICTS>) {
      const dict = DICTS[locale];
      for (const [key, value] of Object.entries(dict)) {
        expect(
          typeof value === 'string' && value.length > 0,
          `${locale}.${key} is empty or non-string`,
        ).toBe(true);
      }
    }
  });
});
