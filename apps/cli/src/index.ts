#!/usr/bin/env bun
// apps/cli/src/index.ts
//
// Phase 6 — Commander wiring. `init` stays a Phase-2 stub; `deploy` is real.

import { Command } from 'commander';

import { registerDeploy } from './commands/deploy.js';

const program = new Command();

program
  .name('mcpgen')
  .description('Generate production-ready MCP servers from any API spec.')
  .version('0.0.0');

program
  .command('init <spec-url>')
  .description('Initialise an MCP server from an OpenAPI URL (Phase 2 — CLI-01).')
  .action(() => {
    console.error(
      'Not implemented in Phase 1. CLI commands ship in Phase 2 (init) and Phase 6 (deploy).',
    );
    process.exit(1);
  });

registerDeploy(program);

program.parse(process.argv);
