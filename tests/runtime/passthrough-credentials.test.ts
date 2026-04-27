// tests/runtime/passthrough-credentials.test.ts
//
// Phase 6 Wave 3 (RUN-03) — deliberate-leak audit. Patches console.{log,warn,error}
// to capture all args during an encrypt+decrypt cycle and asserts the plaintext
// credential never appears in any captured arg.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptPassthrough,
  encryptPassthrough,
} from '@mcpgen/runtime/auth/passthrough';

import { DELIBERATE_LEAK_FIXTURES } from './fixtures/deliberate-leak.js';

const SAVED_KEYS = process.env.RUNTIME_PASSTHROUGH_KEYS;

beforeEach(() => {
  const buf = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...buf));
  process.env.RUNTIME_PASSTHROUGH_KEYS = JSON.stringify({ alice: b64 });
});

afterEach(() => {
  if (SAVED_KEYS === undefined) delete process.env.RUNTIME_PASSTHROUGH_KEYS;
  else process.env.RUNTIME_PASSTHROUGH_KEYS = SAVED_KEYS;
});

describe('passthrough credentials — deliberate-leak audit', () => {
  it('plaintext never appears in captured console output during encrypt+decrypt cycle', async () => {
    const captured: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    const sink = (...args: unknown[]): void => {
      for (const a of args) captured.push(typeof a === 'string' ? a : JSON.stringify(a));
    };
    console.log = sink;
    console.warn = sink;
    console.error = sink;

    try {
      for (const fixture of Object.values(DELIBERATE_LEAK_FIXTURES)) {
        const blob = await encryptPassthrough(fixture, 'alice');
        const req = new Request('https://example.test/x', {
          headers: { 'X-Upstream-Auth': blob },
        });
        const out = await decryptPassthrough(req, 'alice');
        expect(out).toBe(fixture);
      }
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    }

    const blob = captured.join('\n');
    for (const fixture of Object.values(DELIBERATE_LEAK_FIXTURES)) {
      expect(blob).not.toContain(fixture);
    }
  });
});
