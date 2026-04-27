#!/usr/bin/env bun
// apps/cli/src/index.ts
//
// Commander.js CLI entrypoint.
//
// Phase 2: `init` is wired to the real implementation under ./init/index.ts
// (CLI-01 — auto-spawn engine, POST /generate, consume SSE, write outputs).
// Phase 6: `deploy` ships (CLI-02).
//
// Reference: .planning/phases/01-foundation/01-PATTERNS.md `apps/cli/` row.
// Reference: .planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md D-42..D-46.

import { Command } from 'commander';

import { registerDeploy } from './commands/deploy.js';
import { registerInitCommand } from './init/index.js';

const program = new Command();

program
  .name('mcpgen')
  .description('Generate production-ready MCP servers from any API spec.')
  .version('0.0.0');

registerInitCommand(program);

registerDeploy(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
