// apps/cli/tests/claude-desktop-config.test.ts
//
// Phase 6 / RUN-07 — TDD RED for Claude Desktop config block emit.
// Covers platform path resolution + collision detection by name AND URL.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  resolveConfigPath,
  buildBlock,
  emitBlockToStdout,
} from '../src/claude-desktop-config.js';

const realPlatform = process.platform;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p });
}

describe('resolveConfigPath()', () => {
  it('returns macOS path on darwin', () => {
    setPlatform('darwin');
    const p = resolveConfigPath();
    expect(p).toContain('Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('returns Windows path on win32', () => {
    setPlatform('win32');
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    const p = resolveConfigPath();
    expect(p).toContain('Claude');
    expect(p).toContain('claude_desktop_config.json');
  });

  it('returns Linux path on linux', () => {
    setPlatform('linux');
    const p = resolveConfigPath();
    expect(p).toContain('.config/Claude/claude_desktop_config.json');
  });
});

describe('buildBlock()', () => {
  it('throws mcp_server_name_collision when name already exists', () => {
    const existing = {
      mcpServers: { sample: { url: 'http://localhost:9000' } },
    };
    expect(() =>
      buildBlock({ name: 'sample', url: 'http://localhost:8790' }, existing),
    ).toThrow(/mcp_server_name_collision/);
  });

  it('throws mcp_server_url_collision when URL already used by another name', () => {
    const existing = {
      mcpServers: { other: { url: 'http://localhost:8790' } },
    };
    expect(() =>
      buildBlock({ name: 'sample', url: 'http://localhost:8790' }, existing),
    ).toThrow(/mcp_server_url_collision/);
  });

  it('returns a parsed block when no collision', () => {
    const out = buildBlock(
      { name: 'sample', url: 'http://localhost:8790' },
      {},
    );
    expect(out.mcpServers.sample.url).toBe('http://localhost:8790');
    expect(out.mcpServers.sample.transport).toBe('http');
  });
});

describe('emitBlockToStdout()', () => {
  it('writes JSON block with mcpServers key to stdout', () => {
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        return true;
      });
    emitBlockToStdout({
      mcpServers: { sample: { url: 'http://localhost:8790', transport: 'http' } },
    });
    spy.mockRestore();
    const joined = writes.join('');
    expect(joined).toContain('mcpServers');
    expect(joined).toContain('sample');
    expect(joined).toContain('http://localhost:8790');
  });
});
