// scripts/observability/inngest-orphan-audit.ts
//
// REFERENCE-ONLY OPERATOR SCRIPT.
//
// CTRL-09 / D-15 / Pitfall #21: Inngest live orphan audit.
//
// Companion to the static Phase-9 test
// `apps/api/tests/inngest/orphan-audit.test.ts` (D-14, runs in CI). This
// script queries the LIVE Inngest dev server at runtime and compares its
// running function-id list to the canonical
// `INNGEST_FUNCTION_IDS` register from `@mcpgen/contracts/inngest-functions`.
//
// Why a live audit? Static-source AST scan (D-14) catches orphans at PR
// time, but cannot detect:
//   - A function that was registered in code but never picked up by the
//     dev server (deploy drift).
//   - A function id that the dev server reports but the code doesn't
//     reference (live drift / leftover from a renamed function).
//
// Endpoint discovery (per RESEARCH §"Pitfall 8" + §"Open Q #2"):
//   - Try GET http://localhost:8288/v0/apps/.../functions first
//     (Inngest CLI's official discovery surface; may evolve across CLI
//     versions).
//   - Fall back to GET http://localhost:8787/api/inngest (the BFF's own
//     `/api/inngest` serve handler — Inngest replies with the registered
//     function manifest).
//
// Exit codes:
//   0 → clean (running set == registered set)
//   1 → orphans found (running ≠ registered)
//   2 → dev server unreachable (no Inngest CLI running locally)
//
// Operator usage:
//   $ pnpm inngest:orphan-audit
//   (after `npx inngest-cli@latest dev` or `pnpm --filter @mcpgen/api dev:inngest`)
//
// Phase 10 ops cadence: run weekly post-launch.
//
// References:
//   - .planning/phases/09-observability-polish/09-CONTEXT.md D-15
//   - .planning/phases/09-observability-polish/09-RESEARCH.md
//     §"Pitfall 8" + §"Open Question 2" + Pattern 5
//   - .planning/phases/09-observability-polish/09-PATTERNS.md
//     §"scripts/observability/* … Reference-only header"
//   - packages/contracts/src/inngest-functions.ts

import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const INNGEST_DEV_URL =
  process.env['INNGEST_DEV_URL'] ?? 'http://localhost:8288';
const BFF_INNGEST_URL =
  process.env['BFF_INNGEST_URL'] ?? 'http://localhost:8787/api/inngest';

interface InngestFnSummary {
  readonly id: string;
}

interface InngestAppFunctionsResponse {
  readonly functions?: readonly InngestFnSummary[];
}

interface BffInngestServeResponse {
  // Inngest's `serve` handler replies with `{ functions: [{ id, slugs, … }] }`.
  readonly functions?: readonly InngestFnSummary[];
  // Or sometimes `{ function_count, functions }` shape (CLI variant).
  readonly function_count?: number;
}

async function tryDiscover(url: string): Promise<readonly string[] | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as
      | InngestAppFunctionsResponse
      | BffInngestServeResponse;
    if (!body.functions || body.functions.length === 0) {
      return null;
    }
    return body.functions.map((f) => f.id);
  } catch {
    return null;
  }
}

export interface OrphanAuditResult {
  readonly registered: ReadonlySet<string>;
  readonly running: ReadonlySet<string>;
  readonly liveDrift: readonly string[]; // running but not registered
  readonly deployDrift: readonly string[]; // registered but not running
  readonly exitCode: 0 | 1 | 2;
  readonly source: 'inngest-cli' | 'bff' | 'unreachable';
}

export async function runInngestOrphanAudit(opts: {
  readonly inngestDevUrl?: string;
  readonly bffInngestUrl?: string;
} = {}): Promise<OrphanAuditResult> {
  const inngestDevUrl = opts.inngestDevUrl ?? INNGEST_DEV_URL;
  const bffInngestUrl = opts.bffInngestUrl ?? BFF_INNGEST_URL;

  const registered = new Set<string>(Object.values(INNGEST_FUNCTION_IDS));

  // Try Inngest CLI dev server first.
  let running = await tryDiscover(`${inngestDevUrl}/v0/apps/.../functions`);
  let source: OrphanAuditResult['source'] = 'inngest-cli';

  // Fallback: BFF's own /api/inngest endpoint.
  if (running === null) {
    running = await tryDiscover(bffInngestUrl);
    source = running !== null ? 'bff' : 'unreachable';
  }

  if (running === null) {
    return {
      registered,
      running: new Set(),
      liveDrift: [],
      deployDrift: Array.from(registered).sort(),
      exitCode: 2,
      source: 'unreachable',
    };
  }

  const runningSet = new Set<string>(running);
  const liveDrift = Array.from(runningSet)
    .filter((id) => !registered.has(id))
    .sort();
  const deployDrift = Array.from(registered)
    .filter((id) => !runningSet.has(id))
    .sort();

  const exitCode: 0 | 1 = liveDrift.length === 0 && deployDrift.length === 0 ? 0 : 1;

  return { registered, running: runningSet, liveDrift, deployDrift, exitCode, source };
}

function _isDirectExecution(): boolean {
  const entry = process.argv[1] ?? '';
  return (
    entry.endsWith('inngest-orphan-audit.ts') ||
    entry.endsWith('inngest-orphan-audit.js')
  );
}

if (_isDirectExecution()) {
  void runInngestOrphanAudit()
    .then((r) => {
      console.log(`[inngest-orphan-audit] source=${r.source}`);
      console.log(`[inngest-orphan-audit] registered (${String(r.registered.size)}):`);
      for (const id of Array.from(r.registered).sort()) console.log(`  - ${id}`);
      console.log(`[inngest-orphan-audit] running    (${String(r.running.size)}):`);
      for (const id of Array.from(r.running).sort()) console.log(`  - ${id}`);

      if (r.exitCode === 2) {
        console.error(
          '[inngest-orphan-audit] Inngest dev server not running; ' +
            'start via `npx inngest-cli@latest dev` or ' +
            '`pnpm --filter @mcpgen/api dev:inngest`',
        );
      } else if (r.exitCode === 1) {
        if (r.liveDrift.length > 0) {
          console.error('[inngest-orphan-audit] LIVE DRIFT (running but not registered):');
          for (const id of r.liveDrift) console.error(`  - ${id}`);
        }
        if (r.deployDrift.length > 0) {
          console.error('[inngest-orphan-audit] DEPLOY DRIFT (registered but not running):');
          for (const id of r.deployDrift) console.error(`  - ${id}`);
        }
      } else {
        console.log('[inngest-orphan-audit] all functions registered AND running.');
      }
      process.exit(r.exitCode);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}
