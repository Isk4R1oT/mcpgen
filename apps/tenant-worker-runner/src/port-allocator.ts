// apps/tenant-worker-runner/src/port-allocator.ts
//
// Phase 6 — sequential port allocator for tenant Bun child processes.
// First port = 8790 (per local-compute memory port map; 8788 = supervisor,
// 8789 = dispatch).
//
// In-process state only — restart of the runner resets allocation.

const FIRST_PORT = 8790;
const inUse = new Set<number>();

export function allocatePort(): number {
  let p = FIRST_PORT;
  while (inUse.has(p)) p += 1;
  inUse.add(p);
  return p;
}

export function releasePort(p: number): void {
  inUse.delete(p);
}

export function reservePort(p: number): void {
  inUse.add(p);
}

export function listAllocated(): readonly number[] {
  return [...inUse].sort((a, b) => a - b);
}

export function resetAllocator(): void {
  inUse.clear();
}
