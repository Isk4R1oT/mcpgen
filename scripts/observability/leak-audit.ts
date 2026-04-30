// REFERENCE ONLY — operator runs this manually pre-launch.
//
// scripts/observability/leak-audit.ts
//
// CTRL-08 / D-13 — one-off leak-audit operator script.
//
// Purpose: closes the "deliberate-leak PII audit" component of CTRL-08 §1
// success criterion. Together with the regression CI gate from Plan 09-01
// (6-vector regression suite), forms the audit pair:
//   - CI catches new-code regressions (vitest + pytest, every PR).
//   - This script catches infra/config drift in the LIVE environment (operator
//     runs manually pre-launch / quarterly per RUN-03).
//
// Phase 9 ships the script + adapter interface + MOCKED Sentry events impl.
// Phase 10 will swap in `RealSentryEventsAdapter` (single new file) via the
// same env-flag substitution Phase 8 used for StorageAdapter (D-23).
//
// Usage:
//   pnpm leak-audit                    # default --mode mock (Phase 9)
//   pnpm leak-audit -- --mode mock     # explicit
//   pnpm leak-audit -- --mode real     # Phase 10: not yet implemented
//
// Test seed support:
//   SENTRY_EVENTS_MOCK_FIXTURE_PATH=/path/to/fixture.json pnpm leak-audit
//   The fixture JSON shape is { "events": SentryEvent[] }.
//
// Exit codes:
//   0  — all leak vectors clean (PASS)
//   1  — one or more vectors hit (FAIL — diagnostic printed)
//   2  — unexpected error (uncaught — printed to stderr)
//   3  — `--mode real` requested but Phase 10 adapter not yet implemented

import { readFileSync } from 'node:fs';

import { MockSentryEventsAdapter } from '../../apps/api/src/lib/sentry-events-mock.js';
import type {
  SentryEvent,
  SentryEventsAdapter,
} from '../../apps/api/src/lib/sentry-events-adapter.js';

// Pitfall #7: sentinel string MUST NOT match commercial-key regexes
// (gitleaks would block the commit). MCPGEN_LEAK_CANARY_2026Q2 is intentionally
// non-Stripe-shaped and allowlisted in .gitleaks.toml for this file's path.
const LEAK_VECTORS: ReadonlyArray<string> = [
  'Bearer ',
  'sk_live_',
  'ghp_',
  'MCPGEN_LEAK_CANARY_2026Q2',
];

const PROJECT_SLUG = 'mcpgen';
const WINDOW_SECONDS = 60;

type Mode = 'mock' | 'real';

interface ParsedArgs {
  readonly mode: Mode;
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  let mode: Mode = 'mock';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      const next = argv[i + 1];
      if (next === 'mock' || next === 'real') {
        mode = next;
      } else {
        throw new Error(
          `[leak-audit] --mode requires "mock" or "real" (got: ${String(next)})`,
        );
      }
      i++;
    }
  }
  return { mode };
}

interface FixtureFile {
  readonly events: ReadonlyArray<SentryEvent>;
}

function loadFixtureEvents(): SentryEvent[] {
  const path = process.env.SENTRY_EVENTS_MOCK_FIXTURE_PATH;
  if (!path) {
    return [];
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as FixtureFile;
  return [...parsed.events];
}

function buildMockAdapter(): SentryEventsAdapter {
  const adapter = new MockSentryEventsAdapter();
  const seedEvents = loadFixtureEvents();
  if (seedEvents.length > 0) {
    adapter.seed(seedEvents);
  }
  return adapter;
}

function buildAdapter(mode: Mode): SentryEventsAdapter {
  if (mode === 'mock') {
    return buildMockAdapter();
  }
  // Phase 10 carry-forward: implement RealSentryEventsAdapter (single file
  // at apps/api/src/lib/sentry-events-real.ts) and swap here on env flag.
  throw new Error(
    '[leak-audit] Phase 10: RealSentryEventsAdapter not yet implemented; use --mode mock for Phase 9',
  );
}

interface VectorResult {
  readonly vector: string;
  readonly hits: ReadonlyArray<SentryEvent>;
}

async function runVectors(adapter: SentryEventsAdapter): Promise<VectorResult[]> {
  const results: VectorResult[] = [];
  for (const vector of LEAK_VECTORS) {
    const hits = await adapter.query({
      query: vector,
      window_seconds: WINDOW_SECONDS,
      project_slug: PROJECT_SLUG,
    });
    results.push({ vector, hits });
  }
  return results;
}

function printResults(results: ReadonlyArray<VectorResult>): boolean {
  let anyHit = false;
  for (const result of results) {
    if (result.hits.length === 0) {
      console.log(`[leak-audit] ✓ vector "${result.vector}" — 0 hits`);
      continue;
    }
    anyHit = true;
    console.log(
      `[leak-audit] ✗ vector "${result.vector}" — ${String(result.hits.length)} hit(s):`,
    );
    for (const event of result.hits) {
      // Print event_id only — the offending strings live inside the event
      // body and re-printing them here would defeat the audit's purpose.
      console.log(
        `[leak-audit]     event_id=${event.event_id} received_at=${event.received_at}`,
      );
    }
  }
  return anyHit;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[leak-audit] mode=${args.mode} project_slug=${PROJECT_SLUG} window_seconds=${String(WINDOW_SECONDS)}`,
  );
  console.log(
    `[leak-audit] vectors: ${LEAK_VECTORS.map((v) => JSON.stringify(v)).join(', ')}`,
  );

  let adapter: SentryEventsAdapter;
  try {
    adapter = buildAdapter(args.mode);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(3);
  }

  const results = await runVectors(adapter);
  const anyHit = printResults(results);

  if (anyHit) {
    console.log(
      '[leak-audit] FAIL — one or more leak vectors hit Sentry events store',
    );
    process.exit(1);
  }
  console.log('[leak-audit] PASS — no sensitive strings in Sentry events');
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
