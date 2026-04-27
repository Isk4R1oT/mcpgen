// apps/api/src/lib/storage/local-fs.ts
//
// CTRL-05 / D-23: Local filesystem implementation of StorageAdapter.
// Phases 1–9 substitute for R2 (see r2.ts for Phase 10 stub).
// Writes under .local-storage/{specs,artifacts,public-cache}/ (gitignored).

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StorageAdapter, StorageBucket, StorageAdapterPutOpts } from '@mcpgen/contracts';

const ROOT = '.local-storage';

function pathFor(bucket: StorageBucket, key: string): string {
  return join(ROOT, bucket, key);
}

export const localFsStorageAdapter: StorageAdapter = {
  async put(bucket, key, body, _opts?: StorageAdapterPutOpts) {
    const p = pathFor(bucket, key);
    await fs.mkdir(dirname(p), { recursive: true });
    const data = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    await fs.writeFile(p, data);
  },
  async get(bucket, key) {
    try {
      const p = pathFor(bucket, key);
      const buf = await fs.readFile(p);
      return new Uint8Array(buf);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  },
  async delete(bucket, key) {
    try {
      await fs.unlink(pathFor(bucket, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  },
};

// Test-only override: allow tests to write under a tmpdir instead of ROOT.
export function _makeLocalFsStorageAdapterForTesting(rootOverride: string): StorageAdapter {
  return {
    async put(bucket, key, body, _opts?: StorageAdapterPutOpts) {
      const p = join(rootOverride, bucket, key);
      await fs.mkdir(dirname(p), { recursive: true });
      const data = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      await fs.writeFile(p, data);
    },
    async get(bucket, key) {
      try {
        const buf = await fs.readFile(join(rootOverride, bucket, key));
        return new Uint8Array(buf);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(bucket, key) {
      try {
        await fs.unlink(join(rootOverride, bucket, key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
  };
}
