// packages/runtime-sdk/src/runtime/wait_until.ts
//
// Phase 6 (per RESEARCH §"Pattern 3") — waitUntil shim on Bun. CF Workers
// provides this via ExecutionContext; on Bun we drain pending promises on
// SIGTERM via drainPending().

const _pending = new Set<Promise<unknown>>();

export function waitUntil(p: Promise<unknown>): void {
  _pending.add(p);
  void p.finally(() => {
    _pending.delete(p);
  });
}

export async function drainPending(): Promise<void> {
  await Promise.allSettled([..._pending]);
}
