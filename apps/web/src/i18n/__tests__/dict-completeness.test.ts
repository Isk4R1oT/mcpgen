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
//
// Phase Frontend Rebuild — extended to walk **nested** message objects
// (e.g. `account.crumb`, `account.tabSignin`) so screens that use
// `useTranslations('account')` namespacing keep parity across locales.

import { describe, expect, test } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import fr from '../../../messages/fr.json';
import ru from '../../../messages/ru.json';
import zh from '../../../messages/zh.json';

import { routing } from '../routing';

type MessageNode = string | { [k: string]: MessageNode };

const DICTS = {
  en: en as Record<string, MessageNode>,
  ru: ru as Record<string, MessageNode>,
  es: es as Record<string, MessageNode>,
  fr: fr as Record<string, MessageNode>,
  de: de as Record<string, MessageNode>,
  zh: zh as Record<string, MessageNode>,
} as const;

/**
 * Recursively flatten a nested message object into dotted keys.
 * `{ account: { tabSignin: 'sign in' } }` → `['account.tabSignin']`.
 */
function flattenKeys(node: MessageNode, prefix: string): ReadonlyArray<string> {
  if (typeof node === 'string') {
    return [prefix];
  }
  const out: string[] = [];
  for (const [k, child] of Object.entries(node)) {
    const next = prefix === '' ? k : `${prefix}.${k}`;
    out.push(...flattenKeys(child, next));
  }
  return out;
}

function flattenDict(dict: Record<string, MessageNode>): ReadonlyArray<string> {
  const out: string[] = [];
  for (const [k, child] of Object.entries(dict)) {
    out.push(...flattenKeys(child, k));
  }
  return out.sort();
}

/**
 * Walk a nested message object and yield every leaf path → string value.
 */
function* leafEntries(
  node: MessageNode,
  prefix: string,
): Generator<readonly [string, string]> {
  if (typeof node === 'string') {
    yield [prefix, node] as const;
    return;
  }
  for (const [k, child] of Object.entries(node)) {
    const next = prefix === '' ? k : `${prefix}.${k}`;
    yield* leafEntries(child, next);
  }
}

describe('i18n dictionary completeness', () => {
  test('routing.locales matches the set of message files on disk', () => {
    const onDisk = Object.keys(DICTS).sort();
    const declared = [...routing.locales].sort();
    expect(declared).toEqual(onDisk);
  });

  test('every locale has the same key set as English', () => {
    const enKeys = flattenDict(DICTS.en);
    expect(enKeys.length).toBeGreaterThan(0);

    for (const locale of Object.keys(DICTS) as Array<keyof typeof DICTS>) {
      if (locale === 'en') continue;
      const localeKeys = flattenDict(DICTS[locale]);
      expect(localeKeys, `locale "${locale}" key set mismatch`).toEqual(enKeys);
    }
  });

  test('no locale has empty string values', () => {
    for (const locale of Object.keys(DICTS) as Array<keyof typeof DICTS>) {
      const dict = DICTS[locale];
      for (const [key, value] of leafEntries(dict, '')) {
        expect(
          typeof value === 'string' && value.length > 0,
          `${locale}.${key} is empty or non-string`,
        ).toBe(true);
      }
    }
  });
});
