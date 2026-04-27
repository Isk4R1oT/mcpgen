// apps/cli/src/commands/deploy.ts
//
// Phase 6 (per CLI-02 / RUN-07) — `mcpgen deploy <bundle-dir>` real impl.
// Source: RESEARCH Example 9.

import { join, resolve } from 'node:path';

import type { Command } from 'commander';
import pc from 'picocolors';

import {
  buildBlock,
  emitBlockToStdout,
  readExistingConfig,
} from '../claude-desktop-config.js';
import { spawnTenantWorker } from '../runner-client.js';

import { emitCfDeferralBanner } from './deploy-cf-deferral.js';

interface DeployOptions {
  cf?: boolean;
  remote?: boolean;
  name?: string;
  scriptName?: string;
  generationId?: string;
}

export function registerDeploy(program: Command): void {
  program
    .command('deploy <bundle-dir>')
    .description(
      'Deploy a generated MCP server locally (Phase 6) — `--cf` reserved for Phase 10.',
    )
    .option('--cf, --remote', 'deploy to Cloudflare (Phase 10 — currently deferred)')
    .option('--name <name>', 'override mcpServers slot name on collision')
    .option(
      '--script-name <scriptName>',
      'override the cf_worker_name (default = directory basename)',
    )
    .option('--generation-id <id>', 'generation_id this deploy belongs to (UUID)')
    .action(async (bundleDir: string, opts: DeployOptions) => {
      if (opts.cf) emitCfDeferralBanner(); // never returns
      const absBundle = resolve(bundleDir);
      const scriptName = opts.scriptName ?? deriveScriptName(absBundle);
      const bundlePath = join(absBundle, 'src/index.ts');

      let result;
      try {
        const spawnOpts: {
          scriptName: string;
          bundlePath: string;
          generationId?: string;
        } = { scriptName, bundlePath };
        if (opts.generationId) spawnOpts.generationId = opts.generationId;
        result = await spawnTenantWorker(spawnOpts);
      } catch (e) {
        process.stderr.write(pc.red(`\nDeploy failed: ${(e as Error).message}\n`));
        process.exit(1);
      }

      try {
        const existing = readExistingConfig();
        const block = buildBlock(
          { name: opts.name ?? result.scriptName, url: result.url },
          existing,
        );
        emitBlockToStdout(block);
      } catch (e) {
        // Collision detection — surface, don't bail out (the deploy succeeded).
        // WARNING-1: stderr text MUST contain the literal phrase `collision detected` so the
        // Test 2 assertion matches; warn-and-continue is the contract (exit 0, deploy succeeded).
        process.stderr.write(
          pc.yellow(
            `\nClaude Desktop config collision detected — emit skipped: ${(e as Error).message}\n`,
          ),
        );
        process.stderr.write(
          pc.yellow('Re-run with --name <override> to add a non-colliding entry.\n'),
        );
      }

      process.stdout.write(pc.green(`\n✓ Deployed ${result.scriptName} -> ${result.url}\n`));
    });
}

function deriveScriptName(absBundleDir: string): string {
  const parts = absBundleDir.split('/').filter(Boolean);
  const base = parts[parts.length - 1] ?? 'mcpgen-deploy';
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}
