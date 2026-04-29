// apps/cli/tests/test_write_stage_e_output.test.ts
//
// Unit tests for `apps/cli/src/init/write_stage_e_output.ts` (Plan 04-12
// Task 2). Mocks `globalThis.fetch` so the tests don't require a running
// engine; covers happy path + 404 + path-traversal + idempotency.

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fetchAndWriteFile,
  isSafeRelativePath,
  writeStageEOutput,
  type StageEManifestFile,
} from '../src/init/write_stage_e_output.js';

const ENGINE = 'http://localhost:8000';

// ─────────────────────────── Fixtures + cleanup ─────────────────────────

const createdDirs: string[] = [];
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const d of createdDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function makeTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mcpgen-write-stage-e-'));
  createdDirs.push(d);
  return d;
}

function manifestEntry(relative_path: string): StageEManifestFile {
  return {
    relative_path,
    sha256_content_hash: '0'.repeat(64),
    render_template: 'noop.j2',
    render_inputs_hash: '0'.repeat(64),
  };
}

// ───────────────────────────── isSafeRelativePath ───────────────────────

describe('isSafeRelativePath', () => {
  test('accepts simple relative paths', () => {
    expect(isSafeRelativePath('package.json')).toBe(true);
    expect(isSafeRelativePath('src/server.ts')).toBe(true);
    expect(isSafeRelativePath('src/runtime/upstream.ts')).toBe(true);
  });

  test('rejects empty path', () => {
    expect(isSafeRelativePath('')).toBe(false);
  });

  test('rejects absolute paths', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
  });

  test('rejects parent-directory traversal', () => {
    expect(isSafeRelativePath('../../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('foo/../../bar')).toBe(false);
  });

  test('rejects backslashes (Windows-style traversal)', () => {
    expect(isSafeRelativePath('foo\\bar')).toBe(false);
  });
});

// ───────────────────────────── fetchAndWriteFile ────────────────────────

describe('fetchAndWriteFile', () => {
  test('writes the body returned by the engine to outDir/relative_path', async () => {
    globalThis.fetch = (async (input: Request | string | URL): Promise<Response> => {
      const url = String(input);
      expect(url).toBe(`${ENGINE}/api/v1/generate/job_x/output/src/server.ts`);
      return new Response('// stub server.ts content\n', { status: 200 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    await fetchAndWriteFile(
      'job_x',
      manifestEntry('src/server.ts'),
      out,
      ENGINE,
    );
    expect(existsSync(join(out, 'src/server.ts'))).toBe(true);
    expect(readFileSync(join(out, 'src/server.ts'), 'utf-8')).toBe(
      '// stub server.ts content\n',
    );
  });

  test('throws on 404 from engine', async () => {
    globalThis.fetch = (async (): Promise<Response> => {
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    await expect(
      fetchAndWriteFile(
        'job_x',
        manifestEntry('src/server.ts'),
        out,
        ENGINE,
      ),
    ).rejects.toThrow(/engine returned 404/);
  });

  test('throws on path-traversal attempt BEFORE issuing fetch', async () => {
    let fetchInvoked = false;
    globalThis.fetch = (async (): Promise<Response> => {
      fetchInvoked = true;
      return new Response('nope', { status: 200 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    await expect(
      fetchAndWriteFile(
        'job_x',
        manifestEntry('../../etc/passwd'),
        out,
        ENGINE,
      ),
    ).rejects.toThrow(/unsafe relative_path/);
    expect(fetchInvoked).toBe(false);
  });

  test('creates intermediate directories', async () => {
    globalThis.fetch = (async (): Promise<Response> => {
      return new Response('// nested\n', { status: 200 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    await fetchAndWriteFile(
      'job_x',
      manifestEntry('src/runtime/deep/nested/upstream.ts'),
      out,
      ENGINE,
    );
    expect(
      existsSync(join(out, 'src/runtime/deep/nested/upstream.ts')),
    ).toBe(true);
  });
});

// ───────────────────────────── writeStageEOutput ────────────────────────

describe('writeStageEOutput', () => {
  test('writes every manifest entry to outDir', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: Request | string | URL): Promise<Response> => {
      const url = String(input);
      seen.push(url);
      return new Response(`// content for ${url}\n`, { status: 200 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    const manifest: StageEManifestFile[] = [
      manifestEntry('package.json'),
      manifestEntry('src/server.ts'),
      manifestEntry('src/runtime/upstream.ts'),
    ];
    await writeStageEOutput('job_x', manifest, out, ENGINE);
    expect(seen.length).toBe(3);
    expect(existsSync(join(out, 'package.json'))).toBe(true);
    expect(existsSync(join(out, 'src/server.ts'))).toBe(true);
    expect(existsSync(join(out, 'src/runtime/upstream.ts'))).toBe(true);
  });

  test('is idempotent across re-runs (overwrite semantics)', async () => {
    let counter = 0;
    globalThis.fetch = (async (): Promise<Response> => {
      counter += 1;
      return new Response(`// run ${counter}\n`, { status: 200 });
    }) as unknown as typeof fetch;

    const out = makeTmp();
    const manifest: StageEManifestFile[] = [manifestEntry('src/server.ts')];

    await writeStageEOutput('job_x', manifest, out, ENGINE);
    expect(readFileSync(join(out, 'src/server.ts'), 'utf-8')).toBe('// run 1\n');

    await writeStageEOutput('job_x', manifest, out, ENGINE);
    expect(readFileSync(join(out, 'src/server.ts'), 'utf-8')).toBe('// run 2\n');
  });
});
