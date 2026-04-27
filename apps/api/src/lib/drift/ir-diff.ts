// apps/api/src/lib/drift/ir-diff.ts
//
// CTRL-03 / D-17 / Pitfall #34: parsed-IR diff with cosmetic-field strip.
//
// Algorithm:
//   1. stripCosmetic — recursively removes IGNORED_FIELDS + any `x-*` extension key
//      from objects, sorts keys alphabetically (deterministic JSON.stringify),
//      preserves arrays element-wise.
//   2. computeIrDiff — keys baseline + current endpoints by `${METHOD} ${path}`,
//      buckets into added (in current only), removed (in baseline only), and
//      changed (both, but stripped JSON differs). Empty diff => empty=true.
//
// References:
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-17
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §13
//   - .planning/research/PITFALLS.md §#34

const IGNORED_FIELDS: ReadonlyArray<string> = [
  'summary',
  'description',
  'tags',
  'externalDocs',
];
const X_PREFIX = 'x-';

interface IrEndpointLike {
  readonly method?: string;
  readonly path?: string;
  readonly [key: string]: unknown;
}

interface IrLike {
  readonly endpoints?: ReadonlyArray<IrEndpointLike>;
  readonly [key: string]: unknown;
}

export interface IrDiffEntry {
  readonly key: string; // `${METHOD} ${path}`
  readonly path: string;
  readonly method: string;
}

export interface IrDiffChangedEntry extends IrDiffEntry {
  readonly baseline: unknown;
  readonly current: unknown;
}

export interface IrDiff {
  readonly empty: boolean;
  readonly added: ReadonlyArray<IrDiffEntry>;
  readonly removed: ReadonlyArray<IrDiffEntry>;
  readonly changed: ReadonlyArray<IrDiffChangedEntry>;
  readonly summary: string;
}

export function stripCosmetic(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((el) => stripCosmetic(el));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (IGNORED_FIELDS.includes(k)) continue;
      if (k.startsWith(X_PREFIX)) continue;
      out[k] = stripCosmetic(v);
    }
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(out).sort()) {
      sorted[k] = out[k];
    }
    return sorted;
  }
  return node;
}

function endpointKey(ep: IrEndpointLike): string {
  const method = String(ep.method ?? '').toUpperCase();
  const path = String(ep.path ?? '');
  return `${method} ${path}`;
}

export function computeIrDiff(baseline: IrLike, current: IrLike): IrDiff {
  const baselineEndpoints = baseline.endpoints ?? [];
  const currentEndpoints = current.endpoints ?? [];

  const baselineMap = new Map<string, IrEndpointLike>();
  for (const ep of baselineEndpoints) {
    baselineMap.set(endpointKey(ep), ep);
  }
  const currentMap = new Map<string, IrEndpointLike>();
  for (const ep of currentEndpoints) {
    currentMap.set(endpointKey(ep), ep);
  }

  const added: IrDiffEntry[] = [];
  const removed: IrDiffEntry[] = [];
  const changed: IrDiffChangedEntry[] = [];

  for (const [key, ep] of currentMap.entries()) {
    if (!baselineMap.has(key)) {
      added.push({
        key,
        method: String(ep.method ?? '').toUpperCase(),
        path: String(ep.path ?? ''),
      });
    }
  }

  for (const [key, ep] of baselineMap.entries()) {
    if (!currentMap.has(key)) {
      removed.push({
        key,
        method: String(ep.method ?? '').toUpperCase(),
        path: String(ep.path ?? ''),
      });
      continue;
    }
    const currentEp = currentMap.get(key);
    if (!currentEp) continue;
    const baselineStripped = stripCosmetic(ep);
    const currentStripped = stripCosmetic(currentEp);
    const baselineJson = JSON.stringify(baselineStripped);
    const currentJson = JSON.stringify(currentStripped);
    if (baselineJson !== currentJson) {
      changed.push({
        key,
        method: String(ep.method ?? '').toUpperCase(),
        path: String(ep.path ?? ''),
        baseline: baselineStripped,
        current: currentStripped,
      });
    }
  }

  const empty = added.length === 0 && removed.length === 0 && changed.length === 0;
  const summary = empty
    ? 'No semantic changes detected'
    : `${String(added.length)} added, ${String(removed.length)} removed, ${String(changed.length)} changed`;

  return {
    empty,
    added,
    removed,
    changed,
    summary,
  };
}
