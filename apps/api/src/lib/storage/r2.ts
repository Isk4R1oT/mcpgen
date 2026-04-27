// apps/api/src/lib/storage/r2.ts
//
// CTRL-05 / D-23: R2 storage adapter — Phase 10 implementation.
// Phase 8 ships a NotImplementedError stub so the StorageAdapter interface
// has both implementations registered; LocalFsStorageAdapter is used in
// Phases 1–9 per the local-compute pivot.

import type { StorageAdapter } from '@mcpgen/contracts';

export const r2StorageAdapter: StorageAdapter = {
  async put() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
  async get() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
  async delete() { throw new Error('NotImplementedError: R2 adapter is Phase 10'); },
};
