// apps/api/tests/storage/local-fs.test.ts
//
// CTRL-05 / D-23 — LocalFsStorageAdapter put/get/delete roundtrip on a tmpdir;
// asserts the R2 stub throws NotImplementedError.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _makeLocalFsStorageAdapterForTesting } from '../../src/lib/storage/local-fs.js';
import { r2StorageAdapter } from '../../src/lib/storage/r2.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'mcpgen-storage-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('localFsStorageAdapter (test override)', () => {
  it('put + get roundtrips a string', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    await adapter.put('specs', 'hello.json', '{"hello":"world"}');
    const got = await adapter.get('specs', 'hello.json');
    expect(got).not.toBeNull();
    const text = new TextDecoder().decode(got!);
    expect(text).toBe('{"hello":"world"}');
  });

  it('put + get roundtrips Uint8Array', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    const data = new Uint8Array([1, 2, 3, 4]);
    await adapter.put('artifacts', 'bin.dat', data);
    const got = await adapter.get('artifacts', 'bin.dat');
    expect(got).toEqual(data);
  });

  it('get returns null for missing key (no throw)', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    const got = await adapter.get('specs', 'does-not-exist.json');
    expect(got).toBeNull();
  });

  it('delete is idempotent (does not throw on missing key)', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    await expect(adapter.delete('specs', 'never-existed.json')).resolves.toBeUndefined();
  });

  it('delete removes the stored object', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    await adapter.put('public-cache', 'x', 'data');
    await adapter.delete('public-cache', 'x');
    const got = await adapter.get('public-cache', 'x');
    expect(got).toBeNull();
  });

  it('writes under the bucket sub-directory', async () => {
    const adapter = _makeLocalFsStorageAdapterForTesting(root);
    await adapter.put('specs', 'nested/deep/path.json', 'ok');
    const stat = await fs.stat(join(root, 'specs', 'nested', 'deep', 'path.json'));
    expect(stat.isFile()).toBe(true);
  });
});

describe('r2StorageAdapter (Phase 10 stub)', () => {
  it('put throws NotImplementedError', async () => {
    await expect(r2StorageAdapter.put('specs', 'k', 'v')).rejects.toThrow(/NotImplementedError: R2 adapter is Phase 10/);
  });
  it('get throws NotImplementedError', async () => {
    await expect(r2StorageAdapter.get('specs', 'k')).rejects.toThrow(/NotImplementedError: R2 adapter is Phase 10/);
  });
  it('delete throws NotImplementedError', async () => {
    await expect(r2StorageAdapter.delete('specs', 'k')).rejects.toThrow(/NotImplementedError: R2 adapter is Phase 10/);
  });
});
