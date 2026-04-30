// apps/web/tests/unit/lib/claude-desktop/config.test.ts
//
// Plan 07-03 — vitest tests for Claude Desktop config helpers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildClaudeProtocolHref,
  buildConfig,
  copyToClipboard,
  formatConfigJson,
} from '@/lib/claude-desktop/config';
import {
  buildSuggestedName,
  parseCollisionResponse,
} from '@/lib/claude-desktop/collision';

describe('buildConfig', () => {
  it('produces valid Claude Desktop config JSON shape', () => {
    const cfg = buildConfig({
      serverName: 'stripe-fixture',
      serverUrl: 'https://stripe-fixture.mcpgen.dev',
    });
    expect(cfg).toEqual({
      mcpServers: { 'stripe-fixture': { url: 'https://stripe-fixture.mcpgen.dev' } },
    });
  });

  it('includes headers when provided', () => {
    const cfg = buildConfig({
      serverName: 's',
      serverUrl: 'https://x',
      headers: { 'X-Upstream-Auth': 'sk_test_xxx' },
    });
    expect(cfg.mcpServers.s?.headers).toEqual({ 'X-Upstream-Auth': 'sk_test_xxx' });
  });

  it('omits headers when empty', () => {
    const cfg = buildConfig({ serverName: 's', serverUrl: 'https://x', headers: {} });
    expect(cfg.mcpServers.s?.headers).toBeUndefined();
  });
});

describe('formatConfigJson', () => {
  it('produces 2-space indented stable JSON', () => {
    const cfg = buildConfig({ serverName: 's', serverUrl: 'https://x' });
    const json = formatConfigJson(cfg);
    expect(json).toContain('"mcpServers"');
    expect(json).toContain('  "s": {');
    expect(json).toContain('    "url": "https://x"');
  });
});

describe('buildClaudeProtocolHref', () => {
  it('returns claude://install?name=...', () => {
    expect(buildClaudeProtocolHref('stripe-mcp')).toBe('claude://install?name=stripe-mcp');
  });

  it('URL-encodes the server name', () => {
    expect(buildClaudeProtocolHref('my server')).toBe('claude://install?name=my%20server');
  });
});

describe('copyToClipboard', () => {
  const original = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
  });

  it('returns true and calls writeText when clipboard API is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard API is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });

  it('returns false when writeText throws', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });
});

describe('parseCollisionResponse', () => {
  it('returns typed shape for valid 409 body', () => {
    const out = parseCollisionResponse({
      error: 'server_name_collision',
      existing_name: 'stripe-mcp',
      suggested_name: 'stripe-mcp-2',
    });
    expect(out?.suggested_name).toBe('stripe-mcp-2');
  });

  it('returns null for invalid body', () => {
    expect(parseCollisionResponse({ error: 'something_else' })).toBeNull();
    expect(parseCollisionResponse(null)).toBeNull();
    expect(parseCollisionResponse({ error: 'server_name_collision' })).toBeNull();
  });
});

describe('buildSuggestedName', () => {
  beforeEach(() => {
    // Nothing.
  });

  it('returns currentName when not taken', () => {
    expect(buildSuggestedName('stripe-mcp', [])).toBe('stripe-mcp');
  });

  it('appends -2 then -3 etc. until unique', () => {
    expect(buildSuggestedName('stripe-mcp', ['stripe-mcp'])).toBe('stripe-mcp-2');
    expect(buildSuggestedName('stripe-mcp', ['stripe-mcp', 'stripe-mcp-2'])).toBe('stripe-mcp-3');
    expect(
      buildSuggestedName('stripe-mcp', ['stripe-mcp', 'stripe-mcp-2', 'stripe-mcp-3']),
    ).toBe('stripe-mcp-4');
  });
});
