// packages/contracts/src/storage.ts
//
// CTRL-05 / D-23: StorageAdapter interface for spec/artifact/public-cache buckets.
// Phases 1–9 implementation: LocalFsStorageAdapter (apps/api/src/lib/storage/local-fs.ts)
// Phase 10 implementation: R2StorageAdapter (apps/api/src/lib/storage/r2.ts) — currently NotImplementedError stub.
// Env-flag swap: STORAGE_BACKEND=local|r2 (default 'local' Phases 1–9).

export type StorageBucket = 'specs' | 'artifacts' | 'public-cache';

export interface StorageAdapterPutOpts { contentType?: string }

export interface StorageAdapter {
  put(bucket: StorageBucket, key: string, body: Uint8Array | string, opts?: StorageAdapterPutOpts): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Uint8Array | null>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
}
