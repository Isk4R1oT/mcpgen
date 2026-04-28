// apps/cli/src/init/index.ts
//
// Main CLI flow for `mcpgen init <spec-url>`. Wires:
//   1. ensureEngineRunning   (auto_spawn.ts — D-44)
//   2. POST /api/v1/generate (Idempotency-Key — D-48)
//   3. consume SSE stream    (sse_consumer.ts — D-09)
//   4. GET .../artifacts     (per-job_id materialise raw_ir/pass_0/pass_1)
//   5. write 6-file output   (D-43 layout)
//
// References:
// - 02-CONTEXT.md D-42..D-48
// - 02-PATTERNS.md `apps/cli/src/init.ts` row

import type { Subprocess } from 'bun';
import { Command } from 'commander';
import { intro, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';

import { GenerationSseEvent } from '@mcpgen/contracts';
import type {
  Pass0Output,
  Pass1Output,
  Pass2Output,
  Pass3Output,
  Pass4Output,
  RawIR,
} from '@mcpgen/ir';

import {
  ensureEngineRunning,
  registerCleanup,
} from './auto_spawn.js';
import {
  buildEngineRequestBody,
  generateIdempotencyKey,
  parseComplexity,
  type CliInitOptions,
  type ComplexityLevel,
} from './options.js';
import { ensureSafeOutputDir, writeOutputFile } from './output_dir.js';
import { renderPackageJson } from './render_package_json.js';
import { renderReadme } from './render_readme.js';
import { renderServerTs } from './render_stub.js';
import { consumeSse } from './sse_consumer.js';

const ENGINE_BASE_URL = 'http://localhost:8000';

interface ArtifactsResponse {
  raw_ir: RawIR;
  pass_0_output: Pass0Output;
  pass_1_output: Pass1Output;
  // Phase-3 additions per D-34. Optional during the transition window so
  // older Phase-2 engine builds still validate; runInit fails fast below if
  // any are missing.
  pass_2_output?: Pass2Output;
  pass_3_output?: Pass3Output;
  pass_4_output?: Pass4Output;
}

interface RawCommanderOpts {
  outputDir: string;
  complexity: string;
  include: string[];
  exclude: string[];
}

/**
 * Register the `init` subcommand on the supplied Commander program.
 * Replaces the Phase-1 stub action.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init <spec-url>')
    .description('Initialise an MCP server from an OpenAPI URL.')
    .option('--output-dir <path>', 'output directory', './mcpgen-output')
    .option(
      '--complexity <level>',
      'minimal | standard | comprehensive',
      'standard',
    )
    .option('--include <glob...>', 'explicit include patterns', collectStrings, [])
    .option('--exclude <glob...>', 'explicit exclude patterns', collectStrings, [])
    .action(async (specUrl: string, rawOpts: RawCommanderOpts) => {
      const complexity: ComplexityLevel = parseComplexity(rawOpts.complexity);
      const opts: CliInitOptions = {
        outputDir: rawOpts.outputDir,
        complexity,
        include: rawOpts.include,
        exclude: rawOpts.exclude,
      };
      await runInit(specUrl, opts);
    });
}

/**
 * Pure async entrypoint — exported for tests + composition.
 *
 * Spawns engine if needed, posts the generation request, consumes the SSE
 * stream while rendering progress, fetches the artifacts, and writes the
 * 6-file output directory. SIGTERMs the engine subprocess on every exit
 * path (success, error, signal).
 */
export async function runInit(
  specUrl: string,
  opts: CliInitOptions,
): Promise<void> {
  registerCleanup();
  let engineProc: Subprocess | null = null;

  try {
    intro(pc.cyan('mcpgen init'));
    const s = spinner();

    s.start('Starting generation engine');
    engineProc = await ensureEngineRunning();
    s.stop(engineProc !== null ? 'Engine started' : 'Engine already running');

    // Submit generation job ─────────────────────────────────────────────
    const idempotencyKey = generateIdempotencyKey();
    const requestBody = buildEngineRequestBody(specUrl, null, opts);

    const startResp = await fetch(`${ENGINE_BASE_URL}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    if (!startResp.ok) {
      const text = await startResp.text();
      throw new Error(`engine returned ${startResp.status}: ${text}`);
    }
    const startJson = (await startResp.json()) as {
      job_id: string;
      sse_url: string;
    };
    const { job_id: jobId, sse_url: sseUrl } = startJson;

    // Consume SSE stream ────────────────────────────────────────────────
    const stream = spinner();
    stream.start('Stage A — parsing spec');
    let cacheHit = false;
    let pass1FinalToolCount: number | undefined;
    let coveragePct: number | undefined;

    for await (const raw of consumeSse(`${ENGINE_BASE_URL}${sseUrl}`)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data);
      } catch {
        continue; // malformed event payload — skip
      }
      const event = GenerationSseEvent.parse(parsed);

      if (event.partial_result?.cache === 'l1_hit') cacheHit = true;
      const tpc = event.partial_result?.tool_plan_count;
      if (typeof tpc === 'string' || typeof tpc === 'number') {
        // surfaced via spinner only
      }
      const ftc = event.partial_result?.final_tool_count;
      if (typeof ftc === 'string' || typeof ftc === 'number') {
        pass1FinalToolCount = Number(ftc);
        const cov = event.partial_result?.coverage_pct;
        if (typeof cov === 'string' || typeof cov === 'number') {
          coveragePct = Number(cov);
        }
      }

      renderProgress(event, stream);

      if (event.stage === 'failed' && event.error !== undefined) {
        throw new Error(
          `engine failed: ${event.error.code} — ${event.error.message}`,
        );
      }
    }
    stream.stop('Generation complete');

    // Fetch materialised artifacts ──────────────────────────────────────
    const fetchSpinner = spinner();
    fetchSpinner.start('Fetching artifacts');
    const artifacts = await fetchArtifacts(jobId);
    fetchSpinner.stop('Artifacts fetched');

    // Derive spec_slug from Pass 1 routing (D-32) ───────────────────────
    const specSlug = deriveSpecSlug(artifacts.pass_1_output);

    // Write 6-file output directory (D-43) ──────────────────────────────
    const outDir = await ensureSafeOutputDir(`${opts.outputDir}/${specSlug}`);
    await writeOutputFile(
      outDir,
      'ir.json',
      `${JSON.stringify(artifacts.raw_ir, null, 2)}\n`,
    );
    await writeOutputFile(
      outDir,
      'pass-0-output.json',
      `${JSON.stringify(artifacts.pass_0_output, null, 2)}\n`,
    );
    await writeOutputFile(
      outDir,
      'pass-1-output.json',
      `${JSON.stringify(artifacts.pass_1_output, null, 2)}\n`,
    );
    // Phase-3 D-37: server.ts now consumes Pass 2/3/4 outputs. Fail fast if
    // the engine returned an artifact bundle missing those fields (older
    // Phase-2 build) — D-43 layout requires real descriptions / schemas /
    // annotations in server.ts, no Phase-2 placeholders.
    if (
      artifacts.pass_2_output === undefined
      || artifacts.pass_3_output === undefined
      || artifacts.pass_4_output === undefined
    ) {
      throw new Error(
        'engine returned artifacts missing Phase-3 outputs '
          + '(pass_2_output / pass_3_output / pass_4_output) — upgrade engine to Phase 3',
      );
    }
    await writeOutputFile(
      outDir,
      'server.ts',
      renderServerTs(
        specSlug,
        artifacts.pass_1_output,
        artifacts.pass_2_output,
        artifacts.pass_3_output,
        artifacts.pass_4_output,
      ),
    );
    await writeOutputFile(outDir, 'package.json', renderPackageJson(specSlug));
    await writeOutputFile(
      outDir,
      'README.md',
      // Pass absolute outDir so the Claude Desktop snippet can emit an
      // absolute path to server.ts in `args` (Claude Desktop ignores cwd
      // and resolves args relative to its own launch dir — verified during
      // Phase-2 manual gate).
      renderReadme(specSlug, artifacts.pass_1_output, outDir),
    );

    const summary = pc.green(
      `Generated ${pass1FinalToolCount ?? artifacts.pass_1_output.tools.length} MCP tools`,
    );
    const cacheNote = cacheHit ? pc.dim(' (L1 cache hit)') : '';
    const coverageNote = pc.dim(
      ` coverage ${coveragePct ?? artifacts.pass_1_output.coverage_pct}% → ${outDir}/`,
    );
    outro(`${summary}${cacheNote}${coverageNote}`);
  } finally {
    if (engineProc !== null) {
      engineProc.kill('SIGTERM');
    }
  }
}

function renderProgress(
  event: GenerationSseEvent,
  s: ReturnType<typeof spinner>,
): void {
  // Map D-47 SSE stage transitions → human-readable spinner messages.
  const phase = event.partial_result?.phase;
  if (event.stage === 'A' && event.status === 'started') {
    s.message('Stage A — parsing spec');
    return;
  }
  if (event.stage === 'A' && event.status === 'completed') {
    const n = event.partial_result?.endpoint_count;
    s.message(`Stage A — parsed ${String(n ?? '?')} endpoints`);
    return;
  }
  if (event.stage === 'B' && event.status === 'started' && phase === 'pass_0') {
    s.message('Pass 0 — naming tools');
    return;
  }
  if (
    event.stage === 'B'
    && event.status === 'completed'
    && phase === 'pass_0'
  ) {
    const n = event.partial_result?.tool_plan_count;
    s.message(`Pass 0 — ${String(n ?? '?')} tool plans`);
    return;
  }
  if (event.stage === 'B' && event.status === 'started' && phase === 'pass_1') {
    s.message('Pass 1 — Six-Tool Pattern consolidation');
    return;
  }
  if (
    event.stage === 'B'
    && event.status === 'completed'
    && phase === 'pass_1'
  ) {
    const n = event.partial_result?.final_tool_count;
    s.message(`Pass 1 — ${String(n ?? '?')} final tools`);
    return;
  }
  if (event.stage === 'completed') {
    // outro handles the final message — keep spinner running until consumeSse drains.
    return;
  }
}

async function fetchArtifacts(jobId: string): Promise<ArtifactsResponse> {
  const resp = await fetch(
    `${ENGINE_BASE_URL}/api/v1/generate/${jobId}/artifacts`,
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`artifacts ${resp.status}: ${text}`);
  }
  return (await resp.json()) as ArtifactsResponse;
}

function deriveSpecSlug(pass1: Pass1Output): string {
  // SmartId format = `<spec_slug>:{type}:{collection}:{identifier}` per D-32.
  const fmt = pass1.routing.smart_id.format;
  const colonIdx = fmt.indexOf(':');
  if (colonIdx <= 0) {
    throw new Error(
      `pass_1.routing.smart_id.format malformed: ${JSON.stringify(fmt)}`,
    );
  }
  return fmt.slice(0, colonIdx);
}

function collectStrings(value: string, previous: string[]): string[] {
  return [...previous, value];
}
