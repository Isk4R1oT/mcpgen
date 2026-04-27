// apps/cli/tests/deploy.test.ts
//
// Phase 6 (CLI-02 / RUN-07) — end-to-end test for `mcpgen deploy <bundle-dir>`.
// Mocks runner HTTP client and asserts:
//   1. happy path — spawnTenantWorker called with derived scriptName, success
//      line + Claude Desktop config block emitted to stdout
//   2. collision case — buildBlock throws; deploy STILL exits 0; stderr
//      contains literal `collision detected`; success line still printed
//   3. --name override — buildBlock succeeds with the override key

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/runner-client.js', () => ({
  spawnTenantWorker: vi.fn(),
}));

vi.mock('../src/claude-desktop-config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/claude-desktop-config.js')>(
    '../src/claude-desktop-config.js',
  );
  return {
    ...actual,
    readExistingConfig: vi.fn(() => ({})),
    buildBlock: vi.fn(actual.buildBlock),
  };
});

import { Command } from 'commander';

import {
  buildBlock,
  readExistingConfig,
} from '../src/claude-desktop-config.js';
import { registerDeploy } from '../src/commands/deploy.js';
import { spawnTenantWorker } from '../src/runner-client.js';

interface CaptureBuffers {
  stdout: string[];
  stderr: string[];
}

function captureIO(): CaptureBuffers {
  const buffers: CaptureBuffers = { stdout: [], stderr: [] };
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    buffers.stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    buffers.stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  });
  return buffers;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(spawnTenantWorker).mockResolvedValue({
    pid: 1234,
    port: 8790,
    scriptName: 'dispatch-sample',
    url: 'http://localhost:8790',
  });
  vi.mocked(readExistingConfig).mockReturnValue({});
});

describe('mcpgen deploy <bundle-dir> — happy path', () => {
  it('calls spawnTenantWorker, prints success line + config block to stdout', async () => {
    const buffers = captureIO();
    const program = new Command();
    registerDeploy(program);

    await program.parseAsync(['node', 'mcpgen', 'deploy', './apps/dispatch-sample']);

    expect(spawnTenantWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptName: 'dispatch-sample',
        bundlePath: expect.stringContaining('apps/dispatch-sample/src/index.ts'),
      }),
    );
    const stdout = buffers.stdout.join('');
    expect(stdout).toContain('http://localhost:8790');
    expect(stdout).toContain('Deployed dispatch-sample');
    expect(stdout).toContain('mcpServers');
  });
});

describe('mcpgen deploy — collision warn-and-continue (WARNING-1)', () => {
  it('detects name collision; exit 0; stderr contains "collision detected"; success line still printed', async () => {
    vi.mocked(readExistingConfig).mockReturnValue({
      mcpServers: { 'dispatch-sample': { url: 'http://localhost:9999' } },
    });
    const buffers = captureIO();
    const program = new Command();
    registerDeploy(program);

    await program.parseAsync(['node', 'mcpgen', 'deploy', './apps/dispatch-sample']);

    const stderr = buffers.stderr.join('');
    const stdout = buffers.stdout.join('');
    expect(stderr).toContain('collision detected');
    expect(stderr).toContain('mcp_server_name_collision');
    // Success line still printed — deploy succeeded, config emit is non-fatal.
    expect(stdout).toContain('Deployed dispatch-sample');
  });

  it('with --name override, buildBlock succeeds and stdout has overridden mcpServers key', async () => {
    vi.mocked(readExistingConfig).mockReturnValue({
      mcpServers: { 'dispatch-sample': { url: 'http://localhost:9999' } },
    });
    const buffers = captureIO();
    const program = new Command();
    registerDeploy(program);

    await program.parseAsync([
      'node',
      'mcpgen',
      'deploy',
      './apps/dispatch-sample',
      '--name',
      'dispatch-sample-2',
    ]);

    const stdout = buffers.stdout.join('');
    expect(stdout).toContain('"dispatch-sample-2"');
    expect(stdout).toContain('Deployed dispatch-sample');
    // buildBlock called with the override name
    expect(vi.mocked(buildBlock)).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'dispatch-sample-2' }),
      expect.anything(),
    );
  });
});
