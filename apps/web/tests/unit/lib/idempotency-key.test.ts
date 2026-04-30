// Vitest unit test — apps/web/src/lib/idempotency-key.ts (Plan 07-02 Task 1).
//
// Covers:
//   1. getOrCreateIdempotencyKey returns a string matching GEN_ID_REGEX
//   2. getOrCreateIdempotencyKey returns the SAME key on second call (session)
//   3. getOrCreateIdempotencyKey mints a NEW key when localStorage is cleared
//   4. rotateIdempotencyKey removes the persisted entry
//   5. Different (specUrl, specHash) combinations yield different keys

import { describe, it, expect, beforeEach } from 'vitest';

import { GEN_ID_REGEX } from '@mcpgen/contracts';

import {
  getOrCreateIdempotencyKey,
  rotateIdempotencyKey,
} from '@/lib/idempotency-key';

// Vitest 1.x + jsdom 26 ship a JSDOM build whose Storage impl lacks `clear`;
// use a Map-backed Storage shim per test for isolation. Behaves identically
// to a real localStorage for the API surface this module uses.
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(i: number): string | null {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

describe('lib/idempotency-key', () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  it('getOrCreateIdempotencyKey returns a string matching GEN_ID_REGEX', () => {
    const key = getOrCreateIdempotencyKey('https://example.com/spec.json', '');
    expect(typeof key).toBe('string');
    expect(GEN_ID_REGEX.test(key)).toBe(true);
    expect(key.startsWith('gen_')).toBe(true);
  });

  it('getOrCreateIdempotencyKey returns the SAME key on second call within session', () => {
    const url = 'https://example.com/spec.json';
    const first = getOrCreateIdempotencyKey(url, '');
    const second = getOrCreateIdempotencyKey(url, '');
    expect(second).toBe(first);
  });

  it('getOrCreateIdempotencyKey returns a DIFFERENT key when localStorage is cleared', () => {
    const url = 'https://example.com/spec.json';
    const first = getOrCreateIdempotencyKey(url, '');
    localStorage.clear();
    const second = getOrCreateIdempotencyKey(url, '');
    expect(second).not.toBe(first);
    expect(GEN_ID_REGEX.test(second)).toBe(true);
  });

  it('rotateIdempotencyKey removes the persisted key', () => {
    const url = 'https://example.com/spec.json';
    const first = getOrCreateIdempotencyKey(url, '');
    rotateIdempotencyKey(url, '');
    const second = getOrCreateIdempotencyKey(url, '');
    expect(second).not.toBe(first);
  });

  it('Different spec_url+spec_hash combinations yield different keys', () => {
    const a = getOrCreateIdempotencyKey('https://a.example.com/spec.json', '');
    const b = getOrCreateIdempotencyKey('https://b.example.com/spec.json', '');
    const c = getOrCreateIdempotencyKey('https://a.example.com/spec.json', 'sha256-abc');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});
